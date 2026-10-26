import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { OriginInspection, type GitHubBranch, type GitHubQueryResult, type GitHubRepository } from '#contracts';
import { createGitHub } from '../github/index.js';
import { createWorkspaces } from './index.js';
import { createInspector, githubReference } from './inspect.js';
import type { GitReader } from './git.js';

const head = 'a'.repeat(40);
const repo: GitHubRepository = { id: 'R_ACTUAL', owner: { id: 'U1', login: 'actual-owner' }, name: 'actual-repo', url: 'https://github.com/actual-owner/actual-repo', defaultBranch: 'main', isArchived: false, isPrivate: true };
const complete = <T>(data: T): GitHubQueryResult<T> => ({ state: 'complete', data, diagnostics: [], retryAtMs: null });
function github() {
  const calls: unknown[] = [];
  return { calls,
    getRepository: async (reference: unknown) => { calls.push(reference); return complete(repo); },
    resolveBranch: async (reference: unknown, branch: string) => { calls.push(reference); return complete<GitHubBranch>({ repositoryId: repo.id, name: branch, sha: head }); },
  };
}
function gitFixture(directory: string, overrides: { dirty?: boolean; remotes?: string; missingBranch?: boolean; unborn?: boolean; changed?: boolean; invalid?: boolean; fail?: boolean } = {}) {
  const calls: { cwd: string; args: readonly string[] }[] = [];
  let heads = 0;
  const run: GitReader = async (cwd, args) => {
    calls.push({ cwd, args });
    if (overrides.fail) throw new Error('synthetic-secret');
    if (args.includes('--show-toplevel')) return { exitCode: overrides.invalid ? 128 : 0, stdout: `${directory}\n` };
    if (args.includes('--is-inside-work-tree')) return { exitCode: 0, stdout: 'true\n' };
    if (args.includes('HEAD^{commit}')) { heads++; return { exitCode: overrides.unborn ? 1 : 0, stdout: overrides.unborn ? '' : `${overrides.changed && heads > 1 ? 'b'.repeat(40) : head}\n` }; }
    if (args[0] === 'status') return { exitCode: 0, stdout: overrides.dirty ? '? Unicode português 😀\nname -> text\0' : '' };
    if (args[0] === 'config') return { exitCode: overrides.remotes === '' ? 1 : 0, stdout: overrides.remotes ?? 'remote.origin.url\ngit@github.com:alias-owner/different-name.git\0' };
    if (args[0] === 'rev-parse' && args.some((arg) => arg.startsWith('refs/heads/'))) return { exitCode: overrides.missingBranch ? 1 : 0, stdout: overrides.missingBranch ? '' : `${head}\n` };
    throw new Error('Unexpected Git command');
  };
  return { run, calls };
}

describe('origin address parsing', () => {
  it.each(['https://github.com/owner/repo', 'https://github.com/owner/repo.git', 'git@github.com:owner/repo.git', 'ssh://git@github.com/owner/repo.git'])('identifies %s without using a folder name', (url) => {
    expect(githubReference(url)).toEqual({ owner: 'owner', name: 'repo' });
  });
  it.each(['https://token@github.com/owner/repo', 'https://github.com.evil.test/owner/repo', 'file:///somewhere', 'http://github.com/o/r', 'https://github.com/o/r/issues/1', 'https://github.com/o/r?token=private', 'ssh://root@github.com/o/r', 'https://github.com/o/..', 'https://github.com/o/r#token', 'https://github.com:444/o/r'])('rejects unsupported and credential-bearing addresses: %s', (url) => {
    expect(githubReference(url)).toBeNull();
  });
});

describe('local origin inspection with controlled Git responses', () => {
  it('preserves dirty origin bytes, index and HEAD; every planned command is a read', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'factory-origin-'));
    try {
      // Filesystem fixture only: no git init/add/commit is executed by this suite.
      await mkdir(join(directory, '.git'));
      const files = [join(directory, 'arquivo-acentuado.txt'), join(directory, '.git', 'index'), join(directory, '.git', 'HEAD')];
      await writeFile(files[0] ?? '', 'Mudanças não commitadas 😀\n');
      await writeFile(files[1] ?? '', Buffer.from([0, 255, 12, 192, 128]));
      await writeFile(files[2] ?? '', 'ref: refs/heads/main\n');
      const before = await Promise.all(files.map((file) => readFile(file)));
      const fixture = gitFixture(directory, { dirty: true });
      const remote = github();
      const view = await createInspector(remote, fixture.run, async (path) => path).inspectOrigin({ source: { kind: 'local', location: directory }, baseBranch: 'main' });
      expect({ codes: view.diagnostics.map((entry) => entry.code), calls: fixture.calls.map((call) => call.args) }).toMatchObject({ codes: ['LOCAL_CHANGES_EXCLUDED', 'PROJECT_REQUIRED'] });
      expect(view).toMatchObject({ state: 'identified', local: { root: directory, dirty: true, headSha: head }, base: { sha: head, observedFrom: 'local' }, remote: { name: 'origin', confirmed: true, repository: { id: 'R_ACTUAL' } }, executionReady: false });
      expect(Value.Check(OriginInspection, view)).toBe(true);
      expect(view.diagnostics.map((note) => note.code)).toEqual(['LOCAL_CHANGES_EXCLUDED', 'PROJECT_REQUIRED']);
      expect(remote.calls[0]).toEqual({ owner: 'alias-owner', name: 'different-name' });
      expect(remote.calls[1]).toEqual({ owner: 'actual-owner', name: 'actual-repo' });
      expect(await Promise.all(files.map((file) => readFile(file)))).toEqual(before);
      expect(fixture.calls.every((call) => ['rev-parse', 'status', 'config'].includes(call.args[0] ?? ''))).toBe(true);
      const status = fixture.calls.find((call) => call.args[0] === 'status');
      expect(status?.args).toContain('-z');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('identifies an origin without a remote, including a missing selected branch', async () => {
    const directory = join(tmpdir(), 'unrelated-folder-name');
    const fixture = gitFixture(directory, { remotes: '', missingBranch: true });
    const remote = github();
    const view = await createInspector(remote, fixture.run, async (path) => path).inspectOrigin({ source: { kind: 'local', location: directory }, baseBranch: 'missing' });
    expect(view.state).toBe('identified');
    expect(view.remote).toBeNull();
    expect(view.base).toBeNull();
    expect(view.diagnostics.map((note) => note.code)).toEqual(['BRANCH_NOT_FOUND', 'REMOTE_MISSING', 'PROJECT_REQUIRED']);
    expect(remote.calls).toHaveLength(0);
  });
  it('returns a specific diagnosis for an invalid origin, unborn HEAD and concurrent HEAD change', async () => {
    const directory = join(tmpdir(), 'origin');
    const inspect = (options: Parameters<typeof gitFixture>[1]) => createInspector(github(), gitFixture(directory, options).run, async (path) => path).inspectOrigin({ source: { kind: 'local', location: directory }, baseBranch: 'main' });
    expect(await inspect({ invalid: true })).toMatchObject({ state: 'invalid', diagnostics: [{ code: 'ORIGIN_INVALID' }] });
    expect((await inspect({ unborn: true, missingBranch: true, remotes: '' })).diagnostics.map((note) => note.code)).toContain('HEAD_UNBORN');
    expect(await inspect({ changed: true })).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'ORIGIN_CHANGED' }] });
    const failed = await inspect({ fail: true });
    expect(failed).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'GIT_UNAVAILABLE' }] });
    expect(JSON.stringify(failed)).not.toContain('synthetic-secret');
  });
  it('refuses ambiguous remote URLs, accepts an explicit remote and never emits URL credentials', async () => {
    const directory = join(tmpdir(), 'origin');
    const remotes = 'remote.origin.url\nhttps://github.com/o/r\0remote.upstream.url\nhttps://github.com/u/r\0';
    const fixture = gitFixture(directory, { remotes });
    const inspector = createInspector(github(), fixture.run, async (path) => path);
    const input = { source: { kind: 'local' as const, location: directory }, baseBranch: 'main' };
    expect((await inspector.inspectOrigin(input)).diagnostics.map((note) => note.code)).toContain('REMOTE_AMBIGUOUS');
    expect((await inspector.inspectOrigin({ ...input, remoteName: 'upstream' })).remote?.name).toBe('upstream');
    const credentials = gitFixture(directory, { remotes: 'remote.origin.url\nhttps://synthetic-secret@github.com/o/r\0' });
    const view = await createInspector(github(), credentials.run, async (path) => path).inspectOrigin(input);
    expect(view.diagnostics.map((note) => note.code)).toContain('REMOTE_UNSUPPORTED');
    expect(JSON.stringify(view)).not.toContain('synthetic-secret');
  });
  it('propagates missing keyring context and does not run a shell or credentials command', async () => {
    const view = await createWorkspaces({ github: createGitHub() }).inspectOrigin({ source: { kind: 'local', location: join(tmpdir(), 'origin') }, baseBranch: 'main' });
    expect(view).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'CONTEXT_UNAVAILABLE' }] });
  });
  it('keeps the selected local commit even when it has not been pushed', async () => {
    const directory = join(tmpdir(), 'origin');
    const remote = { ...github(), resolveBranch: async () => complete({ repositoryId: repo.id, name: 'main', sha: 'b'.repeat(40) }) };
    const view = await createInspector(remote, gitFixture(directory).run, async (path) => path).inspectOrigin({ source: { kind: 'local', location: directory }, baseBranch: 'main' });
    expect(view.base?.sha).toBe(head);
    expect(view.diagnostics.map((note) => note.code)).not.toContain('REMOTE_MISMATCH');
  });
  it('accepts a local branch absent from GitHub while confirming the repository identity', async () => {
    const directory = join(tmpdir(), 'origin');
    const remote = { ...github(), resolveBranch: async (): Promise<GitHubQueryResult<GitHubBranch>> => ({ state:'unavailable',data:null,diagnostics:[],retryAtMs:null }) };
    const view = await createInspector(remote,gitFixture(directory).run,async path => path).inspectOrigin({ source:{ kind:'local',location:directory },baseBranch:'local-only' });
    expect(view.base).toMatchObject({ branch:'local-only',sha:head,observedFrom:'local' });
    expect(view.remote?.confirmed).toBe(true);
    expect(view.diagnostics.map(note => note.code)).not.toContain('BRANCH_NOT_FOUND');
  });
});

describe('GitHub origin inspection', () => {
  it('resolves repository and base by remote IDs independently of the folder', async () => {
    const view = await createWorkspaces({ github: github() }).inspectOrigin({ source: { kind: 'github', location: 'git@github.com:alias/repo.git' }, baseBranch: 'main' });
    expect(view).toMatchObject({ state: 'identified', local: null, remote: { confirmed: true, repository: { id: repo.id } }, base: { sha: head, observedFrom: 'github' }, executionReady: false });
  });
  it('keeps unconfirmed remotes and authentication/rate-limit diagnostics explicit', async () => {
    const view = await createWorkspaces({ github: createGitHub() }).inspectOrigin({ source: { kind: 'github', location: 'https://github.com/owner/repo' }, baseBranch: 'main' });
    expect(view).toMatchObject({ state: 'identified', base: null, remote: { confirmed: false }, githubDiagnostics: [{ code: 'CONTEXT_UNAVAILABLE' }] });
    expect(view.diagnostics.map((note) => note.code)).toContain('REMOTE_UNCONFIRMED');
  });
  it('never echoes a credential-bearing input URL and rejects unsafe branch names', async () => {
    const inspector = createWorkspaces({ github: github() });
    const view = await inspector.inspectOrigin({ source: { kind: 'github', location: 'https://synthetic-secret@github.com/o/r' }, baseBranch: 'main' });
    expect(view.state).toBe('invalid');
    expect(JSON.stringify(view)).not.toContain('synthetic-secret');
    expect(await inspector.inspectOrigin({ source: { kind: 'github', location: 'https://github.com/o/r' }, baseBranch: '--help' })).toMatchObject({ state: 'invalid', diagnostics: [{ code: 'BRANCH_INVALID' }] });
  });
});
