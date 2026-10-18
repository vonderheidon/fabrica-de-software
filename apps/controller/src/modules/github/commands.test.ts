import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGhRunner, observeGhVersion, queryLimits } from './transport.js';
import { createGitReader } from '../workspaces/git.js';
import { createWorkspaces } from '../workspaces/index.js';
import { createGitHub } from './index.js';

const commands = vi.hoisted(() => ({
  spawn: vi.fn<(executable: string, args: readonly string[], options: unknown) => unknown>(),
  execFile: vi.fn<(executable: string, args: readonly string[], options: unknown, callback: (error: unknown, stdout: string, stderr: string) => void) => unknown>(),
}));
vi.mock('node:child_process', () => commands);

class FakeChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;
  kill() { this.killed = true; this.emit('close', null); return true; }
}
afterEach(() => { commands.spawn.mockReset(); commands.execFile.mockReset(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('native CLI invocation with fake processes', () => {
  it('fixes delivery commit dates from the durable identity and isolates publication configuration', async () => {
    vi.stubEnv('GIT_AUTHOR_DATE','inherited'); vi.stubEnv('GIT_COMMITTER_DATE','inherited');
    commands.execFile.mockImplementation((_exe,_args,_options,callback) => { callback(null,'c'.repeat(40)+'\n',''); });
    const git = createGitReader({ kind: 'windows_keyring',executable: join(tmpdir(),'git.exe') });
    await git(tmpdir(),['commit-tree','a'.repeat(40)],{ input: 'feat: deliver issue #17\n',isolatedConfig: true,commitTime: 1792200000 });
    const env = (commands.execFile.mock.calls[0]?.[2] as { env: NodeJS.ProcessEnv }).env;
    expect({ author: env.GIT_AUTHOR_DATE,committer: env.GIT_COMMITTER_DATE,system: env.GIT_CONFIG_NOSYSTEM,global: env.GIT_CONFIG_GLOBAL })
      .toEqual({ author: '@1792200000 +0000',committer: '@1792200000 +0000',system: '1',global: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    await expect(git(tmpdir(),[],{ commitTime: Number.NaN })).rejects.toThrow('GIT_DATE_INVALID');
    expect(commands.execFile).toHaveBeenCalledOnce();
  });
  it('observes GH and Git versions locally with explicit contexts and no network query', async () => {
    const context = { kind: 'windows_keyring' as const, executable: join(tmpdir(), 'gh.exe'), cwd: tmpdir() };
    commands.execFile.mockImplementation((_exe, _args, _options, callback) => { callback(null, 'gh version 2.80.0 (2026-10-16)\n', ''); });
    expect(await observeGhVersion(context)).toMatchObject({ tool: 'gh', state: 'observed', version: '2.80.0', cause: null, affectedRequirements: [] });
    // Compare selected non-secret fields: assertion failures must never dump inherited env.
    const invocation = commands.execFile.mock.calls[0];
    expect(invocation?.[0]).toBe(context.executable); expect(invocation?.[1]).toEqual(['--version']);
    const options = invocation?.[2] as { shell: boolean; timeout: number };
    expect({ shell: options.shell, timeout: options.timeout }).toEqual({ shell: false, timeout: 15000 });
    commands.execFile.mockImplementation((_exe, _args, _options, callback) => { callback(null, 'git version 2.51.0.windows.1\n', ''); });
    const workspaces = createWorkspaces({ github: createGitHub(), context: { ...context, executable: join(tmpdir(), 'git.exe') }, dataDirectory: tmpdir() });
    expect(await workspaces.observeVersion()).toMatchObject({ tool: 'git', state: 'observed', version: '2.51.0.windows.1', cause: null });
    expect(commands.spawn).not.toHaveBeenCalled();
  });
  it('keeps version absence explicit without persisting CLI error output or inventing a version', async () => {
    expect(await observeGhVersion()).toMatchObject({ state: 'unavailable', version: null, cause: 'CONTEXT_UNAVAILABLE', affectedRequirements: ['RF-22'] });
    expect(commands.execFile).not.toHaveBeenCalled();
    commands.execFile.mockImplementation(() => { throw new Error('synthetic-secret'); });
    const observation = await observeGhVersion({ kind: 'windows_keyring', executable: join(tmpdir(), 'gh.exe'), cwd: tmpdir() });
    expect(observation).toMatchObject({ state: 'unavailable', version: null, cause: 'GH_VERSION_QUERY_FAILED', affectedRequirements: ['RF-22'] });
    expect(JSON.stringify(observation)).not.toContain('synthetic-secret');
  });
  it('uses fixed GH argv, stdin JSON, no shell and handles split UTF-8 without exposing stderr', async () => {
    const child = new FakeChild();
    commands.spawn.mockReturnValue(child);
    const context = { kind: 'windows_keyring' as const, executable: join(tmpdir(), 'gh.exe'), cwd: tmpdir() };
    const input = JSON.stringify({ query: 'query FactoryIdentity { viewer { id login } }', variables: {} });
    const pending = createGhRunner(context)(input);
    child.emit('spawn');
    const bytes = Buffer.from('português 😀');
    child.stdout.write(bytes.subarray(0, bytes.length - 2));
    child.stdout.write(bytes.subarray(bytes.length - 2));
    child.stderr.write('synthetic-secret');
    child.emit('close', 0);
    expect(await pending).toEqual({ exitCode: 0, stdout: 'português 😀' });
    expect(child.stdin.read()?.toString()).toBe(input);
    const invocation = commands.spawn.mock.calls[0];
    expect(invocation?.[0]).toBe(context.executable);
    expect(invocation?.[1]).toEqual(['api', 'graphql', '--hostname', 'github.com', '--method', 'POST', '--include', '--input', '-']);
    const options = invocation?.[2] as { cwd: string; shell: boolean; windowsHide: boolean; env: NodeJS.ProcessEnv };
    expect({ cwd: options.cwd, shell: options.shell, windowsHide: options.windowsHide, prompt: options.env.GH_PROMPT_DISABLED, debug: options.env.GH_DEBUG })
      .toEqual({ cwd: context.cwd, shell: false, windowsHide: true, prompt: '1', debug: '' });
    expect(commands.spawn.mock.calls[0]?.[1].join(' ')).not.toContain(input);
  });
  it('refuses a relative executable or cwd before spawning', async () => {
    await expect(createGhRunner({ kind: 'windows_keyring', executable: 'gh', cwd: tmpdir() })('{}')).rejects.toThrow('CONTEXT_UNAVAILABLE');
    expect(commands.spawn).not.toHaveBeenCalled();
  });
  it('bounds native output and stops its process on timeout', async () => {
    const child = new FakeChild();
    commands.spawn.mockReturnValue(child);
    const pending = createGhRunner({ kind: 'windows_keyring', executable: join(tmpdir(), 'gh.exe'), cwd: tmpdir() })('{}');
    child.stdout.write(Buffer.alloc(queryLimits.responseBytes + 1));
    await expect(pending).rejects.toThrow('CLI_UNAVAILABLE');
    expect(child.killed).toBe(true);
    vi.useFakeTimers();
    const timed = new FakeChild();
    commands.spawn.mockReturnValue(timed);
    const timeout = createGhRunner({ kind: 'windows_keyring', executable: join(tmpdir(), 'gh.exe'), cwd: tmpdir() })('{}');
    const assertion = expect(timeout).rejects.toThrow('CLI_UNAVAILABLE');
    await vi.advanceTimersByTimeAsync(queryLimits.timeoutMs);
    await assertion;
    expect(timed.killed).toBe(true);
  });
  it('runs Git without optional index writes, lazy fetch, shell, prompts or redirected repository selectors', async () => {
    vi.stubEnv('GIT_DIR', 'synthetic-other-repository');
    vi.stubEnv('GIT_INDEX_FILE', 'synthetic-other-index');
    vi.stubEnv('GIT_CONFIG_COUNT', '1');
    vi.stubEnv('GIT_CONFIG_KEY_0', 'core.worktree');
    vi.stubEnv('GIT_CONFIG_VALUE_0', 'synthetic-other-worktree');
    vi.stubEnv('GIT_CONFIG_PARAMETERS', 'synthetic-config');
    commands.execFile.mockImplementation((_exe, _args, _options, callback) => { callback(null, 'head-sha\n', 'synthetic-secret'); return {}; });
    const executable = join(tmpdir(), 'git.exe');
    const response = await createGitReader({ kind: 'windows_keyring', executable })(tmpdir(), ['status', '--porcelain=v2', '-z']);
    expect(response).toEqual({ exitCode: 0, stdout: 'head-sha\n' });
    const invocation = commands.execFile.mock.calls[0];
    expect(invocation?.[0]).toBe(executable);
    expect(invocation?.[1]).toEqual(['--no-optional-locks', '--no-lazy-fetch', '-c', 'core.fsmonitor=false', 'status', '--porcelain=v2', '-z']);
    const options = invocation?.[2] as { shell: boolean; windowsHide: boolean; env: NodeJS.ProcessEnv };
    expect({ shell: options.shell, windowsHide: options.windowsHide, optionalLocks: options.env.GIT_OPTIONAL_LOCKS,
      noLazyFetch: options.env.GIT_NO_LAZY_FETCH, prompt: options.env.GIT_TERMINAL_PROMPT, noReplace: options.env.GIT_NO_REPLACE_OBJECTS })
      .toEqual({ shell: false, windowsHide: true, optionalLocks: '0', noLazyFetch: '1', prompt: '0', noReplace: '1' });
    for (const name of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0', 'GIT_CONFIG_PARAMETERS']) {
      expect(Object.hasOwn(options.env, name)).toBe(false);
    }
  });
  it('preserves known Git exit codes and sanitizes process failures', async () => {
    commands.execFile.mockImplementation((_exe, _args, _options, callback) => { callback({ code: 1, killed: false }, '', 'private'); return {}; });
    const read = createGitReader({ kind: 'windows_keyring', executable: join(tmpdir(), 'git.exe') });
    expect(await read(tmpdir(), ['rev-parse'])).toEqual({ exitCode: 1, stdout: '' });
    commands.execFile.mockImplementation((_exe, _args, _options, callback) => { callback({ code: 'ENOENT', message: 'private' }, '', 'private'); return {}; });
    await expect(read(tmpdir(), ['status'])).rejects.toThrow('GIT_UNAVAILABLE');
  });
});
