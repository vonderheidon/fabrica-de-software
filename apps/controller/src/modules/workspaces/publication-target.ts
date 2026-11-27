import { realpath, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { GitReader } from './git.js';
import { githubReference } from './inspect.js';
import type { GitHub } from '../github/index.js';
import { cloneArguments, directoryIdentity as plainDirectoryIdentity, observeClone, pathExists } from './clone-support.js';

export interface TargetIdentity {
  formatVersion: 1; repositoryId: string; root: string; parent: string; parentIdentity: string;
  directoryIdentity: string | null; repositoryUrl: string;
}
export class TargetError extends Error { constructor(readonly code: string) { super(code); } }
const fail = (code: string): never => { throw new TargetError(code); };
async function identity(path: string) {
  const value = await plainDirectoryIdentity(path);
  if (value === null) fail('TARGET_PATH_REPLACED');
  return value as string;
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
    const observed = await observeClone(git, github, expected.root);
    if (observed.state === 'not_clone') fail('TARGET_NOT_CLONE');
    if (observed.state !== 'observed' || observed.repositoryId !== expected.repositoryId) fail('TARGET_REPOSITORY_MISMATCH');
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
        if (await pathExists(root)) fail('TARGET_OCCUPIED');
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
      const result = await git(reserved.root, cloneArguments(reserved.repositoryUrl));
      if (result.exitCode !== 0) fail('TARGET_CLONE_INCOMPLETE');
      return observe(reserved);
    },
  };
}
