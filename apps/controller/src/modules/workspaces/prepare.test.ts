import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { PreparedWorkspace, type WorkspacePreparation } from '#contracts';
import { createWorkspacePreparer } from './prepare.js';
import type { GitReader } from './git.js';

const directories: string[] = []; const sha = 'a'.repeat(40);
async function fixture(options: { fail?: 'clone' | 'checkout'; dependency?: boolean; submodule?: boolean; changedHead?: boolean; filtered?: boolean } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'factory-clone-')); directories.push(directory);
  const data = join(directory, 'data with spaces ação 😀'); const source = join(directory, 'origin português 😀');
  await mkdir(data); await mkdir(join(source, '.git'), { recursive: true });
  await writeFile(join(source, 'dirty.txt'), 'Uncommitted operator bytes á😀'); await writeFile(join(source, '.git', 'HEAD'), 'operator HEAD'); await writeFile(join(source, '.git', 'index'), Buffer.from([0, 255, 123]));
  const input: WorkspacePreparation = { attemptId: randomUUID(), workspace: { project_id: randomUUID(), repository_id: 'R_test', issue_id: 'I_test' },
    issueNumber: 17, source: { kind: 'local', location: source }, baseSha: sha, predecessorAttemptId: null, inheritedBaseSha: null };
  const implementation = join(data, 'issues', '17', 'workspace');
  const calls: { cwd: string; args: readonly string[] }[] = []; let branch = '';
  // This runner models argv/results and writes only a synthetic destination. It does not prove Git semantics.
  const git: GitReader = async (cwd, command) => {
    calls.push({ cwd, args: command });
    const args = [...command];
    while (args[0]?.startsWith('--git-dir=') || args[0]?.startsWith('--work-tree=') || args[0] === '-c') args.splice(0, args[0] === '-c' ? 2 : 1);
    if (args.includes('--show-toplevel')) return { exitCode: 0, stdout: `${source}\n` };
    if (args[0] === 'config' && args[1] === '--get' && args[2] === 'remote.origin.url') return { exitCode: 0, stdout: `${source}\n` };
    if (args.includes('clone')) {
      const target = args.at(-1)!; await mkdir(join(target, '.git', 'objects', 'info'), { recursive: true });
      if (options.dependency) await writeFile(join(target, '.git', 'objects', 'info', 'alternates'), source);
      if (options.fail === 'clone') return { exitCode: 128, stdout: 'private-clone-error' };
      return { exitCode: 0, stdout: '' };
    }
    if (args.includes('checkout')) {
      branch = args[args.indexOf('-b') + 1]!;
      await writeFile(join(cwd, 'committed.txt'), 'Committed baseline á😀');
      return { exitCode: options.fail === 'checkout' ? 128 : 0, stdout: 'private-checkout-error' };
    }
    if (args[0] === 'ls-tree') return { exitCode: 0, stdout: options.submodule ? `160000 commit ${sha}\tsubmodule\0` : `100644 blob ${sha}\t${options.filtered ? '.gitattributes' : 'committed.txt'}\0` };
    if (args[0] === 'cat-file') return { exitCode: 0, stdout: '*.bin filter=lfs diff=lfs merge=lfs -text\n' };
    if (args[0] === 'symbolic-ref') return { exitCode: 0, stdout: `refs/heads/${branch}\n` };
    if (args[0] === 'status') return { exitCode: 0, stdout: '' };
    if (args[0] === 'rev-parse') return { exitCode: 0, stdout: `${options.changedHead && args.at(-1) === 'HEAD' ? 'b'.repeat(40) : sha}\n` };
    throw new Error('Unexpected controlled Git invocation');
  };
  return { data, source, input, implementation, git, calls,
    prepare: createWorkspacePreparer(data, git, async (path) => path, async () => data, async () => implementation) };
}
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
describe('independent owned attempt workspace with controlled Git', () => {
  it('uses fixed SHA and independent clone options; preserves dirty source, index and HEAD', async () => {
    const f = await fixture(); const files = ['dirty.txt', '.git/HEAD', '.git/index'].map((name) => join(f.source, name));
    const before = await Promise.all(files.map((file) => readFile(file)));
    const result = await f.prepare(f.input); expect(result.state).toBe('prepared'); expect(Value.Check(PreparedWorkspace, result)).toBe(true);
    expect(result.resource.path).toBe(f.implementation);
    expect(result.branch).toBe(`factory/17/${f.input.attemptId}`);
    const clone = f.calls.find((call) => call.args.includes('clone'))!;
    expect(clone.args).toEqual(expect.arrayContaining(['--no-local', '--no-hardlinks', '--no-checkout', '--no-recurse-submodules', '--', f.source, result.resource.path]));
    expect(clone.args).not.toContain('--shared'); expect(clone.args.some((arg) => arg.startsWith('--reference'))).toBe(false);
    const checkout = f.calls.find((call) => call.args.includes('checkout'))!;
    expect(checkout.args).toEqual(expect.arrayContaining(['-b', result.branch, sha]));
    expect(checkout.args).toContain(`--work-tree=${result.resource.path}`);
    expect(checkout.args).toContain(`--git-dir=${join(result.resource.path, '.git')}`);
    expect(checkout.args.some((arg) => arg.startsWith('core.hooksPath=') && arg.endsWith('empty-hooks'))).toBe(true);
    expect(f.calls.filter((call) => call.cwd === f.source).every((call) => call.args[0] === 'rev-parse')).toBe(true);
    expect(await Promise.all(files.map((file) => readFile(file)))).toEqual(before);
    await expect(readFile(join(result.resource.path, 'dirty.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('requires an explicit predecessor before reusing the issue workspace', async () => {
    const f = await fixture(); const first = await f.prepare(f.input); const count = f.calls.length;
    const repeated = await f.prepare({ ...f.input, attemptId: randomUUID() });
    expect(repeated).toMatchObject({ state: 'failed', resource: { owned: false }, diagnostic: { code: 'WORKSPACE_ALREADY_EXISTS' } });
    expect(f.calls.slice(count).some((call) => call.args.includes('clone'))).toBe(false);
    expect(await readFile(join(first.resource.path, 'committed.txt'), 'utf8')).toBe('Committed baseline á😀');
  });
  it('creates the first workspace when the controller attests no predecessor workspace was ever allocated', async () => {
    const f = await fixture();
    const predecessorAttemptId = randomUUID();
    const result = await f.prepare({ ...f.input, predecessorAttemptId, inheritedBaseSha: null });
    expect(result).toMatchObject({ state: 'prepared', snapshot: { predecessor_attempt_id: predecessorAttemptId,
      initial_state: { kind: 'base_checkout', content_identity: f.input.baseSha }, inherited_base_sha: null } });
    expect(f.calls.filter(call => call.args.includes('clone'))).toHaveLength(1);
    const again = await f.prepare({ ...f.input, attemptId: randomUUID(), predecessorAttemptId, inheritedBaseSha: null });
    expect(again).toMatchObject({ state: 'failed', diagnostic: { code: 'WORKSPACE_ALREADY_EXISTS' } });
    expect(f.calls.filter(call => call.args.includes('clone'))).toHaveLength(1);
  });
  it.each(['clone', 'checkout'] as const)('preserves and identifies its own resource on partial %s failure', async (fail) => {
    const f = await fixture({ fail }); const result = await f.prepare(f.input);
    expect(result).toMatchObject({ state: 'failed', attemptId: f.input.attemptId, resource: { owned: true }, diagnostic: { code: fail === 'clone' ? 'CLONE_FAILED' : 'CHECKOUT_FAILED' } });
    expect(JSON.stringify(result)).not.toContain('private-');
    expect(await readFile(join(f.source, 'dirty.txt'), 'utf8')).toBe('Uncommitted operator bytes á😀');
  });
  it.each(['../escape', 'x/y', 'C:\\escape', 'not-a-uuid'])('rejects an attempt identity escaping the managed root: %s', async (attemptId) => {
    const f = await fixture(); await expect(f.prepare({ ...f.input, attemptId })).rejects.toMatchObject({ code: 'WORKSPACE_INPUT_INVALID' }); expect(f.calls).toHaveLength(0);
  });
  it('refuses a managed root that canonicalizes outside its configured path', async () => {
    const f = await fixture();
    const prepare = createWorkspacePreparer(f.data, f.git, async (path) => path, async () => f.data, async () => f.source);
    expect(await prepare(f.input)).toMatchObject({ state: 'failed', resource: { owned: false }, diagnostic: { code: 'WORKSPACE_PATH_INVALID' } });
    expect(f.calls.some((call) => call.args.includes('clone'))).toBe(false);
  });
  it('requires an authorized context before creating a resource', async () => {
    const f = await fixture(); const prepare = createWorkspacePreparer(f.data, undefined, async (path) => path, async () => f.data);
    expect(await prepare(f.input)).toMatchObject({ state: 'failed', resource: { owned: false }, diagnostic: { code: 'CONTEXT_UNAVAILABLE' } });
    expect(f.calls).toHaveLength(0);
  });
  it('refuses a missing project resolver before cloning into the global directory', async () => {
    const f = await fixture();
    const prepare = createWorkspacePreparer(f.data, f.git, async path => path);
    expect(await prepare(f.input)).toMatchObject({ state: 'failed', resource: { owned: false },
      diagnostic: { code: 'WORKSPACE_ROOT_UNAVAILABLE' } });
    expect(f.calls).toHaveLength(0);
  });
  it.each([{ dependency: true, code: 'CLONE_DEPENDENCY_UNSUPPORTED' }, { submodule: true, code: 'SUBMODULE_UNSUPPORTED' }, { changedHead: true, code: 'WORKSPACE_VERIFICATION_FAILED' }, { filtered: true, code: 'FILTERED_CONTENT_UNSUPPORTED' }])('rejects incomplete or dependent clones: $code', async ({ code, ...options }) => {
    const f = await fixture(options); expect(await f.prepare(f.input)).toMatchObject({ state: 'failed', resource: { owned: true }, diagnostic: { code } });
  });
  it('refuses credential-bearing or unsupported remote origins without echoing them', async () => {
    const f = await fixture(); const result = await f.prepare({ ...f.input, source: { kind: 'github', location: 'https://private-marker@github.com/test/repository' } });
    expect(result).toMatchObject({ state: 'failed', resource: { owned: false }, diagnostic: { code: 'ORIGIN_INVALID' } });
    expect(JSON.stringify(result)).not.toContain('private-marker'); expect(f.calls).toHaveLength(0);
  });
});
