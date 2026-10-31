import { mkdir, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { GitObjectId, WorkspacePreparation, type AttemptWorkspaceSnapshot, type PreparedWorkspace } from '#contracts';
import type { GitReader } from './git.js';
import { CaptureError, createWorkspaceSnapshotter, metadataBytes, noBorrowedObjects, plainDirectory } from './capture.js';
import { githubReference } from './inspect.js';
import { issueHistoryRepositoryRelative, retainedRepositoryOwner, requireAttemptRootResolver, requireAttemptWorkspacePathResolver, retainedRepositoryPath, type AttemptRootResolver, type AttemptWorkspacePathResolver } from './project-storage.js';

export class WorkspacePreparationError extends Error {
  constructor(readonly code: string) { super(code); }
}
const within = (root: string, path: string) => {
  const part = relative(root, path);
  return part !== '' && !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`);
};
const missing = (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ENOENT';

/** Reuses only the issue-owned checkout after the prior attempt's writers are confirmed stopped. */
export function createWorkspacePreparer(dataDirectory?: string, git?: GitReader, canonicalize: (path: string) => Promise<string> = realpath,
  resolveAttemptRoot?: AttemptRootResolver, resolveAttemptWorkspace?: AttemptWorkspacePathResolver) {
  const snapshotWorkspace = createWorkspaceSnapshotter(dataDirectory, git, canonicalize, resolveAttemptRoot, resolveAttemptWorkspace);
  return async (input: WorkspacePreparation): Promise<PreparedWorkspace> => {
    if (!Value.Check(WorkspacePreparation, input)) throw new WorkspacePreparationError('WORKSPACE_INPUT_INVALID');
    if (!dataDirectory || !isAbsolute(dataDirectory)) throw new WorkspacePreparationError('WORKSPACE_ROOT_UNAVAILABLE');
    const branch = `factory/${input.issueNumber}/${input.attemptId}`;
    let implementation = resolve(dataDirectory, 'issues', String(input.issueNumber), 'workspace');
    let owned = false;
    let snapshot: AttemptWorkspaceSnapshot | null = null;
    const failure = (code: string): PreparedWorkspace => ({ state: 'failed', attemptId: input.attemptId, workspace: input.workspace,
      resource: { kind: 'implementation', path: implementation, owned }, baseSha: input.baseSha, branch, snapshot,
      diagnostic: { code, message: 'The registered issue workspace could not be prepared safely.',
        recovery: owned ? 'Preserve the shared issue workspace, reconcile its state and use a new attempt; do not reset or delete it.' : 'Resolve the diagnostic and confirm the registered workspace path before retrying.' } });
    if (!git) return failure('CONTEXT_UNAVAILABLE');
    let stage = 'WORKSPACE_PATH_UNAVAILABLE';
    try {
      stage = 'WORKSPACE_ROOT_UNAVAILABLE';
      const data = await canonicalize(await requireAttemptRootResolver(resolveAttemptRoot)(input.attemptId, true));
      stage = 'WORKSPACE_PATH_UNAVAILABLE';
      implementation = await requireAttemptWorkspacePathResolver(resolveAttemptWorkspace)(input.attemptId);
      const expected = resolve(data, 'issues', String(input.issueNumber), 'workspace');
      if (!isAbsolute(data) || implementation !== expected || !within(data, implementation)) return failure('WORKSPACE_PATH_INVALID');
      const issueDirectory = dirname(implementation);
      const marker = resolve(issueDirectory, '.factory-workspace-owner.json');
      const markerText = JSON.stringify({ format_version: 1, identity: input.workspace, issue_number: input.issueNumber });
      let source: string;
      if (input.source.kind === 'local') {
        if (!isAbsolute(input.source.location) || /[\x00-\x1f\x7f]/.test(input.source.location)) return failure('ORIGIN_INVALID');
        source = await canonicalize(input.source.location);
        if (!isAbsolute(source) || source === implementation || within(source, implementation) || within(implementation, source)) return failure('ORIGIN_INVALID');
        const root = await git(source, ['rev-parse', '--show-toplevel']);
        if (root.exitCode !== 0 || await canonicalize(root.stdout.replace(/\r?\n$/, '')) !== source) return failure('ORIGIN_INVALID');
        const commit = await git(source, ['rev-parse', '--verify', '--end-of-options', `${input.baseSha}^{commit}`]);
        if (commit.exitCode !== 0 || commit.stdout.trim() !== input.baseSha) return failure('BASE_COMMIT_UNAVAILABLE');
      } else {
        const reference = githubReference(input.source.location);
        if (!reference) return failure('ORIGIN_INVALID');
        source = `https://github.com/${reference.owner}/${reference.name}.git`;
      }

      const matchesOrigin = async (root: string): Promise<boolean> => {
        const remote = await git!(root, ['config', '--get', 'remote.origin.url']);
        if (remote.exitCode !== 0) return false;
        if (input.source.kind === 'local') {
          try { return await canonicalize(remote.stdout.trim()) === source; } catch { return false; }
        }
        const expectedReference = githubReference(input.source.location);
        const actualReference = githubReference(remote.stdout.trim());
        return Boolean(expectedReference && actualReference && expectedReference.owner.toLowerCase() === actualReference.owner.toLowerCase() &&
          expectedReference.name.toLowerCase() === actualReference.name.toLowerCase());
      };
      const metadata = resolve(implementation, '.git');
      const hooks = resolve(issueDirectory, '.factory', 'empty-hooks');
      const runOwned = (args: readonly string[]) => git!(implementation, [
        `--git-dir=${metadata}`, `--work-tree=${implementation}`, '-c', `core.worktree=${implementation}`, '-c', 'core.bare=false',
        '-c', `core.hooksPath=${hooks}`, '-c', 'core.fsmonitor=false', '-c', 'core.attributesFile=', ...args,
      ]);

      if (input.inheritedBaseSha === null) {
        stage = 'WORKSPACE_PARENT_UNAVAILABLE';
        const issues = resolve(data, 'issues');
        for (const path of [issues, issueDirectory]) {
          try { await mkdir(path); } catch (error) { if (!missing(error) && !(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; }
          await plainDirectory(path, canonicalize);
        }
        if ((await readdir(issueDirectory)).length > 0) return failure('WORKSPACE_ALREADY_EXISTS');
        stage = 'WORKSPACE_OWNER_UNAVAILABLE';
        await writeFile(marker, markerText, { flag: 'wx' }); owned = true;
        const factoryData = resolve(issueDirectory, '.factory');
        try { await mkdir(factoryData); } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; }
        await plainDirectory(factoryData, canonicalize);
        await mkdir(hooks);
        await plainDirectory(hooks, canonicalize);
        stage = 'CLONE_FAILED';
        const clone = await git(issueDirectory, ['-c', `core.hooksPath=${hooks}`, '-c', 'init.templateDir=', '-c', 'protocol.ext.allow=never',
          'clone', '--no-local', '--no-hardlinks', '--no-checkout', '--no-recurse-submodules', '--template=',
          ...(process.platform === 'win32' ? ['--config', 'core.longpaths=true'] : []), '--', source, implementation]);
        if (clone.exitCode !== 0) return failure(stage);
        await plainDirectory(implementation, canonicalize);
        await plainDirectory(metadata, canonicalize);
        if (!await matchesOrigin(implementation)) return failure('WORKSPACE_REPOSITORY_MISMATCH');
        try { await noBorrowedObjects(metadata); } catch { return failure('CLONE_DEPENDENCY_UNSUPPORTED'); }
        const info = resolve(metadata, 'info');
        try { await mkdir(info); } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; }
        await plainDirectory(info, canonicalize);
        await writeFile(resolve(info, 'exclude'), '\n/.factory-evidence/\n', { flag: 'wx' });
        stage = 'BASE_COMMIT_UNAVAILABLE';
        const base = await runOwned(['rev-parse', '--verify', '--end-of-options', `${input.baseSha}^{commit}`]);
        if (base.exitCode !== 0 || base.stdout.trim() !== input.baseSha) return failure(stage);
        const tree = await runOwned(['ls-tree', '-r', '-z', input.baseSha]);
        if (tree.exitCode !== 0 || (tree.stdout && !tree.stdout.endsWith('\0'))) return failure('BASE_TREE_INVALID');
        for (const entry of tree.stdout.split('\0').filter(Boolean)) {
          const record = /^([0-7]{6}) (blob|commit) ((?:[0-9a-f]{40}|[0-9a-f]{64}))\t([\s\S]+)$/.exec(entry);
          if (!record) return failure('BASE_TREE_INVALID');
          if (record[1] === '160000') return failure('SUBMODULE_UNSUPPORTED');
          if (record[1] === '120000' && process.platform === 'win32') return failure('SYMLINK_UNSUPPORTED');
          if (record[4]?.split('/').at(-1) === '.gitattributes') {
            const attributes = await runOwned(['cat-file', 'blob', record[3]!]);
            if (attributes.exitCode !== 0) return failure('BASE_ATTRIBUTES_UNAVAILABLE');
            if (attributes.stdout.split(/\r?\n/).some(line => !line.trimStart().startsWith('#') && /(?:^|\s)filter(?:=|\s|$)/.test(line))) return failure('FILTERED_CONTENT_UNSUPPORTED');
          }
        }
        stage = 'CHECKOUT_FAILED';
        const checkout = await runOwned(['-c', 'filter.lfs.required=true', '-c', 'filter.lfs.smudge=', '-c', 'filter.lfs.process=',
          'checkout', '--no-recurse-submodules', '-b', branch, input.baseSha, '--']);
        if (checkout.exitCode !== 0) return failure(stage);
        const head = await runOwned(['rev-parse', '--verify', 'HEAD']);
        const currentBranch = await runOwned(['symbolic-ref', '--quiet', 'HEAD']);
        const status = await runOwned(['status', '--porcelain=v2', '-z', '--untracked-files=all']);
        if (head.exitCode !== 0 || head.stdout.trim() !== input.baseSha || currentBranch.exitCode !== 0 ||
            currentBranch.stdout.trim() !== `refs/heads/${branch}` || status.exitCode !== 0 || status.stdout !== '') return failure('WORKSPACE_VERIFICATION_FAILED');
        snapshot = { identity: input.workspace, predecessor_attempt_id: input.predecessorAttemptId,
          initial_state: { kind: 'base_checkout', content_identity: input.baseSha }, inherited_base_sha: null, comparison_base_sha: input.baseSha };
      } else {
        if (input.predecessorAttemptId === null) return failure('WORKSPACE_SNAPSHOT_INVALID');
        stage = 'WORKSPACE_MISSING';
        await plainDirectory(issueDirectory, canonicalize);
        await plainDirectory(implementation, canonicalize);
        if ((await metadataBytes(marker, 2048)).toString('utf8') !== markerText) return failure('WORKSPACE_IDENTITY_MISMATCH');
        owned = true;
        await plainDirectory(metadata, canonicalize);
        if (!await matchesOrigin(implementation)) return failure('WORKSPACE_REPOSITORY_MISMATCH');
        try { await noBorrowedObjects(metadata); } catch { return failure('WORKSPACE_CONTENT_INVALID'); }
        await plainDirectory(hooks, canonicalize);
        const head = await runOwned(['rev-parse', '--verify', 'HEAD^{commit}']);
        if (head.exitCode !== 0 || !Value.Check(GitObjectId, head.stdout.trim())) return failure('WORKSPACE_CONTENT_INVALID');
        stage = 'WORKSPACE_SNAPSHOT_FAILED';
        const repositoryRelative = issueHistoryRepositoryRelative(input.issueNumber);
        const captured = await snapshotWorkspace({ attemptId: input.attemptId, snapshotId: input.attemptId,
          repositoryRelative, baseSha: head.stdout.trim() });
        snapshot = { identity: input.workspace, predecessor_attempt_id: input.predecessorAttemptId,
          initial_state: { kind: 'inherited_attempt', source_attempt_id: input.predecessorAttemptId, content_identity: captured.commitSha },
          inherited_base_sha: input.inheritedBaseSha, comparison_base_sha: captured.commitSha };
        const dataRoot = await canonicalize(await requireAttemptRootResolver(resolveAttemptRoot)(input.attemptId));
        const retained = retainedRepositoryPath(dataRoot, input.attemptId, repositoryRelative);
        await plainDirectory(dirname(retained), canonicalize);
        await plainDirectory(retained, canonicalize);
        if ((await metadataBytes(resolve(retained, 'factory-owner'), 64)).toString('utf8') !== retainedRepositoryOwner(input.attemptId, repositoryRelative)) {
          return failure('RETAINED_REPOSITORY_INVALID');
        }
        const snapshotRef = `refs/factory/workspace-snapshots/${input.attemptId}`;
        const fetch = await git(implementation, [`--git-dir=${metadata}`, `--work-tree=${implementation}`, '-c', `core.worktree=${implementation}`,
          '-c', 'core.bare=false', '-c', 'protocol.file.allow=always', 'fetch', '--no-tags', '--no-write-fetch-head',
          '--no-recurse-submodules', '--', retained, `${captured.gitRef}:${snapshotRef}`]);
        if (fetch.exitCode !== 0) return failure('WORKSPACE_SNAPSHOT_IMPORT_FAILED');
        const existing = await runOwned(['show-ref', '--verify', '--hash', `refs/heads/${branch}`]);
        if (existing.exitCode === 0) return failure('WORKSPACE_ATTEMPT_BRANCH_EXISTS');
        if (![1, 128].includes(existing.exitCode)) return failure('WORKSPACE_GIT_FAILED');
        const zero = '0'.repeat(captured.commitSha.length);
        const branchRefUpdate = await runOwned(['update-ref', '--no-deref', `refs/heads/${branch}`, captured.commitSha, zero]);
        if (branchRefUpdate.exitCode !== 0) return failure('WORKSPACE_ATTEMPT_BRANCH_EXISTS');
        const headChange = await runOwned(['symbolic-ref', 'HEAD', `refs/heads/${branch}`]);
        const currentHead = await runOwned(['rev-parse', '--verify', 'HEAD']);
        if (headChange.exitCode !== 0 || currentHead.exitCode !== 0 || currentHead.stdout.trim() !== captured.commitSha) return failure('WORKSPACE_VERIFICATION_FAILED');
      }
      return { state: 'prepared', attemptId: input.attemptId, workspace: input.workspace,
        resource: { kind: 'implementation', path: implementation, owned }, baseSha: input.baseSha, branch, snapshot, diagnostic: null };
    } catch (error) {
      return failure(error instanceof CaptureError ? error.code : stage);
    }
  };
}
