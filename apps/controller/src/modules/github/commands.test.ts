import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collect, createGhRunner, getGitHubRunnerLifecycle, GitHubRunnerError, GraphQLReader, observeGhVersion, queryLimits,
  type GhRunner, type GitHubContext } from './transport.js';
import { checked } from './client.js';
import { IssueMembership } from '#contracts';
import { valuesQuery } from './queries.js';
import { createGitReader } from '../workspaces/git.js';
import { createWorkspaces } from '../workspaces/index.js';
import { createGitHub, type GitHubOptions } from './index.js';
import { GitHubExecutableResolver } from './executable.js';

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
  kill() { this.killed = true; return true; }
  close(exitCode: number | null) { this.emit('close', exitCode); }
}
afterEach(() => { commands.spawn.mockReset(); commands.execFile.mockReset(); vi.useRealTimers(); vi.unstubAllEnvs(); });

function composedGitHub(runnerFactory: (context: GitHubContext) => GhRunner, observeQuery?: GitHubOptions['observeQuery']) {
  const context = { kind: 'windows_keyring' as const, cwd: join(tmpdir(), 'github'), executable: join(tmpdir(), 'gh.exe') };
  const resolver = new GitHubExecutableResolver({ access: context, initialExecutable: context.executable,
    environment: () => ({ PATH: '' }), stat: async () => ({ isFile: () => true }),
    observeVersion: async () => ({ tool: 'gh', state: 'observed', version: 'synthetic', cause: null, affectedRequirements: [], observedAtMs: 1 }) });
  return { context, github: createGitHub({ context, resolver, savedExecutablePath: () => context.executable, runnerFactory,
    ...(observeQuery ? { observeQuery } : {}) }) };
}

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
    child.close(null);
    vi.useFakeTimers();
    const timed = new FakeChild();
    commands.spawn.mockReturnValue(timed);
    const timeout = createGhRunner({ kind: 'windows_keyring', executable: join(tmpdir(), 'gh.exe'), cwd: tmpdir() })('{}');
    const assertion = expect(timeout).rejects.toThrow('CLI_UNAVAILABLE');
    await vi.advanceTimersByTimeAsync(queryLimits.timeoutMs);
    await assertion;
    expect(timed.killed).toBe(true);
    timed.close(null);
  });
  it('keeps timeout, kill request and physical close as separate observations', async () => {
    vi.useFakeTimers();
    const child = new FakeChild(); commands.spawn.mockReturnValue(child);
    const onSend = vi.fn();
    const pending = createGhRunner({ kind: 'windows_keyring', executable: join(tmpdir(), 'gh.exe'), cwd: tmpdir() })('{}', onSend);
    const caught = pending.then(() => { throw new Error('EXPECTED_TIMEOUT'); }, value => value);
    child.emit('spawn');
    await vi.advanceTimersByTimeAsync(queryLimits.timeoutMs);
    const error = await caught;
    expect(error).toBeInstanceOf(GitHubRunnerError);
    const lifecycle = getGitHubRunnerLifecycle(error);
    if (!lifecycle) throw new Error('RUNNER_LIFECYCLE_MISSING');
    expect(onSend).toHaveBeenCalledOnce();
    expect(child.killed).toBe(true);
    expect(lifecycle).toMatchObject({ sent: true, killRequested: true, killFailed: false, physicallyClosed: false });
    let completionObserved = false;
    void lifecycle.completion.then(() => { completionObserved = true; });
    await Promise.resolve();
    expect(completionObserved).toBe(false);
    child.close(null);
    await lifecycle.completion;
    expect(lifecycle.physicallyClosed).toBe(true);
    expect(completionObserved).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('retains a pre-send failure as unsent while physical close is still unknown', async () => {
    vi.useFakeTimers();
    const child = new FakeChild(); commands.spawn.mockReturnValue(child);
    const pending = createGhRunner({ kind: 'windows_keyring', executable: join(tmpdir(), 'gh.exe'), cwd: tmpdir() })('{}');
    child.stdout.write(Buffer.alloc(queryLimits.responseBytes + 1));
    const error = await pending.then(() => { throw new Error('EXPECTED_RESPONSE_LIMIT'); }, value => value);
    const lifecycle = getGitHubRunnerLifecycle(error);
    if (!lifecycle) throw new Error('RUNNER_LIFECYCLE_MISSING');
    expect(child.killed).toBe(true);
    expect(lifecycle).toMatchObject({ sent: false, killRequested: true, physicallyClosed: false });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('forwards the response ceiling through createGitHub and isolates observer failures', async () => {
    const limits: Array<number | undefined> = [];
    const successfulRun: GhRunner = async (_input, onSend, responseBytes) => {
      limits.push(responseBytes); onSend?.();
      return { exitCode: 0, stdout: 'HTTP/2.0 200 Response\r\ncontent-type: application/json\r\n\r\n{"data":{"viewer":{"id":"ACCOUNT_test","login":"synthetic-user"}}}' };
    };
    const observerFailure = () => { throw new Error('SYNTHETIC_OBSERVER_FAILURE'); };
    const success = composedGitHub(() => successfulRun, observerFailure);
    expect(await success.github.getIdentity()).toMatchObject({ state: 'complete', data: { id: 'ACCOUNT_test', login: 'synthetic-user' } });
    expect(limits).toEqual([queryLimits.responseBytes]);

    const beforeSend = vi.fn<GhRunner>(async () => { throw new GitHubRunnerError('CONTEXT_UNAVAILABLE'); });
    const unavailable = composedGitHub(() => beforeSend, observerFailure);
    expect(await unavailable.github.getIdentity()).toMatchObject({ state: 'context_unavailable', diagnostics: [{ code: 'CONTEXT_UNAVAILABLE' }] });
    expect(beforeSend).toHaveBeenCalledOnce();

    const afterSend = vi.fn<GhRunner>(async (_input, onSend) => { onSend?.(); throw new GitHubRunnerError('CLI_UNAVAILABLE'); });
    const failed = composedGitHub(() => afterSend, observerFailure);
    expect(await failed.github.getIdentity()).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'CLI_UNAVAILABLE' }] });
    expect(afterSend).toHaveBeenCalledOnce();
  });
  it('refuses a simple oversized response through the composed native runner', async () => {
    const child = new FakeChild(); commands.spawn.mockReturnValue(child);
    const { github } = composedGitHub(current => createGhRunner(current));
    const pending = github.getIdentity();
    await vi.waitFor(() => expect(commands.spawn).toHaveBeenCalledOnce());
    child.emit('spawn');
    const body = JSON.stringify({ data: { viewer: { id: 'ACCOUNT_test', login: 'synthetic-user' } }, extensions: { usage: 'x'.repeat(queryLimits.responseBytes) } });
    child.stdout.write(Buffer.from(`HTTP/2.0 200 Response\r\ncontent-type: application/json\r\n\r\n${body}`, 'utf8'));
    expect(await pending).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'CLI_UNAVAILABLE' }] });
    expect(child.killed).toBe(true);
    expect(child.stdin.read()?.toString()).toContain('FactoryIdentity');
    expect(commands.spawn.mock.calls[0]?.[0]).toBe(join(tmpdir(), 'gh.exe'));
    child.close(null);
  });
  it('accepts three field pages with an explicit grouped ceiling and retains the default ceiling', async () => {
    const context = { kind: 'windows_keyring' as const, executable: join(tmpdir(), 'gh.exe'), cwd: tmpdir() };
    // Raw value IDs are used for pagination identity but are not bounded by the decoded membership DTO.
    const nodes = Array.from({ length: 100 }, (_, index) => ({
      __typename: 'ProjectV2ItemFieldSingleSelectValue', id: `${index}-${'A'.repeat(15_000)}`,
      name: 'Ready', optionId: 'ready', field: { id: 'status' },
    }));
    const connection = { nodes, pageInfo: { hasNextPage: false, endCursor: null } };
    const wire = (data: unknown) => `HTTP/2.0 200 Response\r\ncontent-type: application/json\r\n\r\n${JSON.stringify({ data })}`;
    const single = wire({ node: { fieldValues: connection } });
    const grouped = wire({ nodes: ['item-a', 'item-b', 'item-c'].map(id => ({ id, __typename: 'ProjectV2Item', fieldValues: connection })) });
    expect(Buffer.byteLength(single)).toBeLessThan(queryLimits.responseBytes);
    expect(Buffer.byteLength(grouped)).toBeGreaterThan(queryLimits.responseBytes);
    expect(Buffer.byteLength(single) * 3).toBeLessThan(queryLimits.operationBytes);
    const reader = new GraphQLReader(createGhRunner(context)).scope();
    for (const id of ['item-a', 'item-b', 'item-c']) {
      const child = new FakeChild(); commands.spawn.mockReturnValue(child);
      const pending = collect(reader, valuesQuery, { id }, data => (data.node as { fieldValues: unknown }).fieldValues,
        node => checked(IssueMembership.properties.statusValues.items, {
          fieldId: (node.field as { id: string }).id, optionId: node.optionId, name: node.name,
        }));
      child.emit('spawn'); child.stdout.write(single); child.emit('close', 0);
      const response = await pending;
      expect(response.state).toBe('complete'); expect(response.data).toHaveLength(100);
    }
    const child = new FakeChild(); commands.spawn.mockReturnValue(child);
    const groupedQuery = valuesQuery
      .replace('FactoryItemValues($id:ID!,$cursor:String)', 'FactoryGroupedValues($ids:[ID!]!,$cursor:String)')
      .replace('node(id:$id)', 'nodes(ids:$ids)')
      .replace('... on ProjectV2Item {', '__typename id ... on ProjectV2Item {');
    const pending = reader.query(groupedQuery, { ids: ['item-a', 'item-b', 'item-c'], cursor: null });
    child.emit('spawn'); child.stdout.write(grouped);
    expect(await pending).toMatchObject({ state: 'unavailable', data: null, diagnostics: [{ code: 'CLI_UNAVAILABLE' }] });
    expect(child.killed).toBe(true);
    child.close(null);
    const allowed = new FakeChild(); commands.spawn.mockReturnValue(allowed);
    const accepted = reader.query(groupedQuery, { ids: ['item-a', 'item-b', 'item-c'], cursor: null }, undefined, 3);
    allowed.emit('spawn'); allowed.stdout.write(grouped); allowed.emit('close', 0);
    expect(await accepted).toMatchObject({ state: 'complete' });
    expect(allowed.killed).toBe(false);
    const oversized = new FakeChild(); commands.spawn.mockReturnValue(oversized);
    const rejected = reader.query(groupedQuery, { ids: ['item-a', 'item-b', 'item-c'] }, undefined, 3);
    oversized.emit('spawn'); oversized.stdout.write(Buffer.alloc(queryLimits.responseBytes * 3 + 1));
    expect(await rejected).toMatchObject({ state: 'unavailable', data: null });
    expect(oversized.killed).toBe(true);
    oversized.close(null);
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
    expect(invocation?.[1]).toEqual(['--no-optional-locks', '--no-lazy-fetch', '-c', 'core.fsmonitor=false',
      ...(process.platform === 'win32' ? ['-c', 'core.longpaths=true'] : []), 'status', '--porcelain=v2', '-z']);
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
