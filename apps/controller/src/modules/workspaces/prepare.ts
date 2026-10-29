import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { WorkspacePreparation, type PreparedWorkspace } from '#contracts';
import type { GitReader } from './git.js';
import { githubReference } from './inspect.js';
import { requireAttemptRootResolver, type AttemptRootResolver } from './project-storage.js';

export class WorkspacePreparationError extends Error {
  constructor(readonly code: string) { super(code); }
}
const within = (root: string, path: string) => {
  const part = relative(root, path);
  return part !== '' && !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`);
};
/** Owns only a newly reserved attempt directory. Failures preserve it for the caller's resource journal. */
export function createWorkspacePreparer(dataDirectory?: string, git?: GitReader, canonicalize: (path: string) => Promise<string> = realpath,
  resolveAttemptRoot?: AttemptRootResolver) {
  return async (input: WorkspacePreparation): Promise<PreparedWorkspace> => {
    if (!Value.Check(WorkspacePreparation, input)) throw new WorkspacePreparationError('WORKSPACE_INPUT_INVALID');
    if (!dataDirectory || !isAbsolute(dataDirectory)) throw new WorkspacePreparationError('WORKSPACE_ROOT_UNAVAILABLE');
    const branch = `factory/${input.issueNumber}/${input.attemptId}`;
    let implementation = resolve(dataDirectory, 'work', input.attemptId, 'implementation');
    let owned = false;
    const failure = (code: string): PreparedWorkspace => ({ state: 'failed', attemptId: input.attemptId,
      resource: { kind: 'implementation', path: implementation, owned }, baseSha: input.baseSha, branch,
      diagnostic: { code, message: 'The independent attempt environment could not be prepared.',
        recovery: owned ? 'Preserve this owned attempt resource, inspect it and use a new attempt identity; do not adopt or delete another environment.' : 'Resolve the diagnostic and use an unused attempt identity in the configured data directory.' } });
    if (!git) return failure('CONTEXT_UNAVAILABLE');
    let stage = 'WORKSPACE_PATH_UNAVAILABLE';
    try {
      const data = await canonicalize(await requireAttemptRootResolver(resolveAttemptRoot)(input.attemptId, true));
      implementation = resolve(data, 'work', input.attemptId, 'implementation');
      if (!isAbsolute(data)) return failure('WORKSPACE_ROOT_INVALID');
      const work = resolve(data, 'work');
      let source: string;
      if (input.source.kind === 'local') {
        if (!isAbsolute(input.source.location) || /[\x00-\x1f\x7f]/.test(input.source.location)) return failure('ORIGIN_INVALID');
        source = await canonicalize(input.source.location);
        if (!isAbsolute(source) || source === work || within(work, source)) return failure('ORIGIN_INVALID');
        const root = await git(source, ['rev-parse', '--show-toplevel']);
        if (root.exitCode !== 0 || await canonicalize(root.stdout.replace(/\r?\n$/, '')) !== source) return failure('ORIGIN_INVALID');
        const commit = await git(source, ['rev-parse', '--verify', '--end-of-options', `${input.baseSha}^{commit}`]);
        if (commit.exitCode !== 0 || commit.stdout.trim() !== input.baseSha) return failure('BASE_COMMIT_UNAVAILABLE');
      } else {
        const reference = githubReference(input.source.location);
        if (!reference) return failure('ORIGIN_INVALID');
        source = `https://github.com/${reference.owner}/${reference.name}.git`;
      }
      try { await mkdir(work); } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      }
      const workStat = await lstat(work);
      if (!workStat.isDirectory() || workStat.isSymbolicLink() || await canonicalize(work) !== work) return failure('MANAGED_ROOT_INVALID');
      const attempt = resolve(work, input.attemptId);
      implementation = resolve(attempt, 'implementation');
      if (!within(work, attempt) || !within(attempt, implementation)) return failure('WORKSPACE_PATH_INVALID');
      stage = 'ATTEMPT_DIRECTORY_UNAVAILABLE';
      // Exclusive reservation: never overwrite, reset, reuse or remove an existing attempt directory.
      try { await mkdir(attempt); } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'EEXIST') return failure('ATTEMPT_DIRECTORY_EXISTS');
        throw error;
      }
      owned = true;
      if ((await lstat(attempt)).isSymbolicLink() || await canonicalize(attempt) !== attempt) return failure('WORKSPACE_PATH_INVALID');
      const hooks = resolve(attempt, '.empty-hooks');
      await mkdir(hooks);
      stage = 'CLONE_FAILED';
      const clone = await git(attempt, ['-c', `core.hooksPath=${hooks}`, '-c', 'init.templateDir=', '-c', 'protocol.ext.allow=never',
        'clone', '--no-local', '--no-hardlinks', '--no-checkout', '--no-recurse-submodules', '--template=',
        // Local upload-pack does not inherit the caller's per-command config.
        ...(process.platform === 'win32' ? ['--config', 'core.longpaths=true'] : []), '--', source, implementation]);
      if (clone.exitCode !== 0) return failure(stage);
      if ((await lstat(implementation)).isSymbolicLink() || await canonicalize(implementation) !== implementation) return failure('WORKSPACE_PATH_INVALID');
      const metadata = resolve(implementation, '.git');
      if (!(await lstat(metadata)).isDirectory() || (await lstat(metadata)).isSymbolicLink()) return failure('CLONE_METADATA_INVALID');
      // No alternates, gitdir indirection or borrowed object database is accepted.
      for (const path of ['objects/info/alternates', 'objects/info/http-alternates', 'commondir', 'shallow']) {
        try { await lstat(resolve(metadata, path)); return failure('CLONE_DEPENDENCY_UNSUPPORTED'); } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        }
      }
      const info = resolve(metadata, 'info');
      try { await mkdir(info); } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; }
      if (!(await lstat(info)).isDirectory() || (await lstat(info)).isSymbolicLink() || await canonicalize(info) !== info) return failure('CLONE_METADATA_INVALID');
      // Fresh --template= clone only: never append through metadata supplied by an agent.
      await writeFile(resolve(info, 'exclude'), '\n/.factory-evidence/\n', { flag: 'wx' });
      const runOwned = (args: readonly string[]) => git(implementation, [
        `--git-dir=${metadata}`, `--work-tree=${implementation}`, '-c', `core.worktree=${implementation}`, '-c', 'core.bare=false', '-c', `core.hooksPath=${hooks}`, '-c', 'core.attributesFile=', ...args,
      ]);
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
          if (attributes.stdout.split(/\r?\n/).some((line) => !line.trimStart().startsWith('#') && /(?:^|\s)filter(?:=|\s|$)/.test(line))) return failure('FILTERED_CONTENT_UNSUPPORTED');
        }
      }
      stage = 'CHECKOUT_FAILED';
      const checkout = await runOwned(['-c', 'filter.lfs.required=true',
        '-c', 'filter.lfs.smudge=', '-c', 'filter.lfs.process=', 'checkout', '--no-recurse-submodules', '-b', branch, input.baseSha, '--']);
      if (checkout.exitCode !== 0) return failure(stage);
      const head = await runOwned(['rev-parse', '--verify', 'HEAD']);
      const currentBranch = await runOwned(['symbolic-ref', '--quiet', 'HEAD']);
      const status = await runOwned(['status', '--porcelain=v2', '-z', '--untracked-files=all']);
      if (head.exitCode !== 0 || head.stdout.trim() !== input.baseSha || currentBranch.exitCode !== 0 || currentBranch.stdout.trim() !== `refs/heads/${branch}` || status.exitCode !== 0 || status.stdout !== '') return failure('WORKSPACE_VERIFICATION_FAILED');
      return { state: 'prepared', attemptId: input.attemptId, resource: { kind: 'implementation', path: implementation, owned }, baseSha: input.baseSha, branch, diagnostic: null };
    } catch {
      // Native errors can contain credentials, command arguments and arbitrary stderr. Only fixed diagnostics cross the boundary.
      return failure(stage);
    }
  };
}
