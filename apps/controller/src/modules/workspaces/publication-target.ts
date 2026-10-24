import { lstat, realpath, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { GitReader } from './git.js';
import { githubReference } from './inspect.js';
import type { GitHub } from '../github/index.js';

export interface TargetIdentity {
  formatVersion: 1; repositoryId: string; root: string; parent: string; parentIdentity: string;
  directoryIdentity: string | null; repositoryUrl: string;
}
export class TargetError extends Error { constructor(readonly code: string) { super(code); } }
const fail = (code: string): never => { throw new TargetError(code); };
async function identity(path: string) {
  const stat = await lstat(path, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('TARGET_PATH_REPLACED');
  return `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
}
async function exists(path: string) {
  try { await lstat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
export function createPublicationTargetWorkspace(github: Pick<GitHub, 'getRepository'>, git?: GitReader) {
  async function parentMatches(expected: TargetIdentity) {
    if (await realpath(expected.parent) !== expected.parent || await identity(expected.parent) !== expected.parentIdentity) fail('TARGET_PARENT_CHANGED');
  }
  async function observe(expected: TargetIdentity): Promise<TargetIdentity> {
    if (!git) return fail('CONTEXT_UNAVAILABLE');
    await parentMatches(expected);
    const directoryIdentity = await identity(expected.root);
    if (expected.directoryIdentity !== null && directoryIdentity !== expected.directoryIdentity) fail('TARGET_PATH_REPLACED');
    if (await realpath(expected.root) !== expected.root) fail('TARGET_PATH_REPLACED');
    const top = await git(expected.root, ['rev-parse','--show-toplevel']);
    if (top.exitCode !== 0 || await realpath(top.stdout.trim()) !== expected.root) fail('TARGET_NOT_CLONE');
    const remote = await git(expected.root, ['config','--null','--get-all','remote.origin.url']);
    const urls = remote.stdout.split('\0').filter(Boolean);
    const reference = urls.length === 1 ? githubReference(urls[0]!) : null;
    if (remote.exitCode !== 0 || !reference) fail('TARGET_REPOSITORY_MISMATCH');
    const repository = await github.getRepository(reference!);
    if (repository.state !== 'complete' || repository.data?.id !== expected.repositoryId) fail('TARGET_REPOSITORY_MISMATCH');
    if (await identity(expected.root) !== directoryIdentity) fail('TARGET_PATH_REPLACED');
    await parentMatches(expected);
    return { ...expected, directoryIdentity };
  }
  return {
    async inspectPublicationTarget(path: string, repositoryId: string, repositoryUrl: string, kind: 'existing_clone' | 'clone'): Promise<TargetIdentity> {
      if (!git) return fail('CONTEXT_UNAVAILABLE');
      const root = resolve(path); const parent = await realpath(dirname(root));
      if (parent !== dirname(root)) fail('TARGET_PARENT_CHANGED');
      const expected: TargetIdentity = { formatVersion: 1, root, parent, parentIdentity: await identity(parent), directoryIdentity: null, repositoryId, repositoryUrl };
      if (kind === 'clone') {
        if (await exists(root)) fail('TARGET_OCCUPIED');
        const reference = githubReference(repositoryUrl);
        if (!reference) fail('TARGET_REPOSITORY_MISMATCH');
        const repository = await github.getRepository(reference!);
        if (repository.state !== 'complete' || repository.data?.id !== repositoryId) fail('TARGET_REPOSITORY_MISMATCH');
        return expected;
      }
      return observe(expected);
    },
    observePublicationTarget: observe,
    async clonePublicationTarget(expected: TargetIdentity, reserve: (identity: TargetIdentity) => void, authorize: () => void): Promise<TargetIdentity> {
      if (!git) return fail('CONTEXT_UNAVAILABLE');
      await parentMatches(expected); authorize();
      try { await mkdir(expected.root); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('TARGET_OCCUPIED'); throw error; }
      const reserved = { ...expected, directoryIdentity: await identity(expected.root) };
      reserve(reserved);
      await parentMatches(reserved); authorize();
      if (await identity(reserved.root) !== reserved.directoryIdentity || (await readdir(reserved.root)).length) fail('TARGET_PATH_REPLACED');
      const result = await git(reserved.root, ['-c','core.hooksPath=', 'clone','--',reserved.repositoryUrl,'.']);
      if (result.exitCode !== 0) fail('TARGET_CLONE_INCOMPLETE');
      return observe(reserved);
    },
  };
}
