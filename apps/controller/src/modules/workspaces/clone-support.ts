import { lstat, realpath } from 'node:fs/promises';
import type { RepositoryReference } from '#contracts';
import type { GitHub } from '../github/index.js';
import type { GitReader } from './git.js';
import { githubReference } from './inspect.js';

/** Identity of a plain directory (never a symlink or junction); null when the path is not one. */
export async function directoryIdentity(path: string): Promise<string | null> {
  const stat = await lstat(path, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) return null;
  return `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
}

export async function pathExists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

/** Hooks never run during a factory-initiated clone; `extra` carries the caller's own clone options. */
export function cloneArguments(repositoryUrl: string, extra: readonly string[] = []): string[] {
  return ['-c', 'core.hooksPath=', 'clone', ...extra, '--', repositoryUrl, '.'];
}

export type CloneObservation =
  | { state: 'not_clone' }
  /** Git root, but no single `origin` URL that names a GitHub repository. */
  | { state: 'no_remote' }
  /** `repositoryId` is null when GitHub could not confirm the remote. */
  | { state: 'observed'; reference: RepositoryReference; repositoryId: string | null };

/** Observes whether `root` is a Git work-tree root whose single `origin` resolves, on GitHub, to a repository identity. */
export async function observeClone(git: GitReader, github: Pick<GitHub, 'getRepository'>, root: string): Promise<CloneObservation> {
  const top = await git(root, ['rev-parse', '--show-toplevel']);
  if (top.exitCode !== 0 || await realpath(top.stdout.trim()) !== await realpath(root)) return { state: 'not_clone' };
  const remote = await git(root, ['config', '--null', '--get-all', 'remote.origin.url']);
  const urls = remote.stdout.split('\0').filter(Boolean);
  const reference = remote.exitCode === 0 && urls.length === 1 ? githubReference(urls[0]!) : null;
  if (!reference) return { state: 'no_remote' };
  const repository = await github.getRepository(reference);
  return { state: 'observed', reference, repositoryId: repository.state === 'complete' && repository.data ? repository.data.id : null };
}
