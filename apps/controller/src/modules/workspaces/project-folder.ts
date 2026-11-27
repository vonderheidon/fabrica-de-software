import { mkdir, readdir, realpath, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, win32 } from 'node:path';
import type { ProjectFolderInspection } from '#contracts';
import type { GitHub } from '../github/index.js';
import { cloneArguments, directoryIdentity, observeClone, pathExists } from './clone-support.js';
import type { GitReader } from './git.js';
import { githubReference } from './inspect.js';

/** Codes are the import diagnostics the coordinator records; nothing here carries paths or URLs. */
export class ProjectFolderError extends Error { constructor(readonly code: string) { super(code); } }
const fail = (code: string): never => { throw new ProjectFolderError(code); };
export const cloneTimeoutMs = 30 * 60_000;

export interface FolderReservation {
  /** True only when this call created the directory: the sole proof allowing the factory to remove it later. */
  created: boolean;
  adopted: boolean;
  identity: string | null;
}
export interface ProjectFolderReservationInput { projectsRoot: string; destination: string; repositoryId: string }
export interface ProjectFolderCloneInput { root: string; repositoryUrl: string; baseBranch: string }
export interface ProjectFolderVerificationInput { root: string; repositoryId: string; baseBranch: string; adopted: boolean; identity: string | null }

const sameFolder = (left: string, right: string) => process.platform === 'win32' ? win32.resolve(left).toLowerCase() === win32.resolve(right).toLowerCase() : left === right;

export function createProjectFolderWorkspace(github: Pick<GitHub, 'getRepository'>, git?: GitReader) {
  async function requireIdentity(root: string, identity: string | null): Promise<void> {
    if (identity === null) return;
    const current = await directoryIdentity(root).catch(() => null);
    if (current !== identity) fail('IMPORT_CLEANUP_REFUSED');
  }
  async function parentIsProjectsRoot(projectsRoot: string, destination: string): Promise<void> {
    const parent = await realpath(dirname(destination)).catch(() => null);
    const root = await realpath(projectsRoot).catch(() => null);
    if (!parent || !root || !sameFolder(parent, root) || !sameFolder(dirname(destination), projectsRoot)) fail('IMPORT_FOLDER_INVALID');
  }
  async function reserve(input: ProjectFolderReservationInput): Promise<FolderReservation> {
    if (!git) return fail('CONTEXT_UNAVAILABLE');
    if (!isAbsolute(input.destination)) fail('IMPORT_FOLDER_INVALID');
    const destination = resolve(input.destination);
    await parentIsProjectsRoot(input.projectsRoot, destination);
    if (!(await pathExists(destination))) {
      try { await mkdir(destination); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        return reserve(input);
      }
      const identity = await directoryIdentity(destination);
      if (identity === null) return fail('IMPORT_DESTINATION_OCCUPIED');
      return { created: true, adopted: false, identity };
    }
    if (await directoryIdentity(destination) === null) return fail('IMPORT_DESTINATION_OCCUPIED');
    if ((await readdir(destination)).length === 0) return { created: false, adopted: false, identity: null };
    const observed = await observeClone(git, github, destination);
    if (observed.state === 'observed' && observed.repositoryId === input.repositoryId) return { created: false, adopted: true, identity: null };
    return fail('IMPORT_DESTINATION_OCCUPIED');
  }
  return {
    /** Creates the destination, or recognizes an empty plain folder or an existing clone of the same repository. Never touches other content. */
    reserveProjectFolder: reserve,
    /** Empties a folder this import created after an interrupted clone, keeping the directory (and so its recorded identity). */
    async resetCreatedProjectFolder(projectsRoot: string, root: string, identity: string): Promise<void> {
      await parentIsProjectsRoot(projectsRoot, root);
      await requireIdentity(root, identity);
      try { for (const entry of await readdir(root)) await rm(join(root, entry), { recursive: true, force: true, maxRetries: 3 }); }
      catch { fail('IMPORT_CLEANUP_FAILED'); }
    },
    async cloneProjectFolder(input: ProjectFolderCloneInput): Promise<void> {
      if (!git) return fail('CONTEXT_UNAVAILABLE');
      // Credential helpers stay the host's; URL rewriting could silently redirect the clone elsewhere.
      const rewrites = await git(input.root, ['config', '--get-regexp', '^url\\..*\\.(insteadof|pushinsteadof)$']);
      if (rewrites.exitCode !== 1 || rewrites.stdout !== '') fail('IMPORT_URL_REWRITE_UNSUPPORTED');
      if ((await readdir(input.root)).length) fail('IMPORT_DESTINATION_OCCUPIED');
      const result = await git(input.root, cloneArguments(input.repositoryUrl, ['--no-recurse-submodules', '--branch', input.baseBranch]), { timeoutMs: cloneTimeoutMs })
        .catch(() => ({ exitCode: -1, stdout: '' }));
      if (result.exitCode !== 0) fail('IMPORT_CLONE_FAILED');
    },
    async verifyProjectFolder(input: ProjectFolderVerificationInput): Promise<void> {
      if (!git) return fail('CONTEXT_UNAVAILABLE');
      const current = await directoryIdentity(input.root).catch(() => null);
      if (current === null || (input.identity !== null && current !== input.identity)) fail('IMPORT_VERIFICATION_FAILED');
      const observed = await observeClone(git, github, input.root);
      if (observed.state !== 'observed' || observed.repositoryId !== input.repositoryId) fail('IMPORT_VERIFICATION_FAILED');
      const base = await git(input.root, ['rev-parse', '--verify', '--quiet', '--end-of-options', `refs/heads/${input.baseBranch}^{commit}`]);
      if (base.exitCode !== 0) fail('IMPORT_VERIFICATION_FAILED');
      if (!input.adopted) {
        const head = await git(input.root, ['symbolic-ref', '--quiet', 'HEAD']);
        if (head.exitCode !== 0 || head.stdout.trim() !== `refs/heads/${input.baseBranch}`) fail('IMPORT_VERIFICATION_FAILED');
      }
    },
    /** Removes a folder only while it still is the directory this import created. */
    async removeCreatedProjectFolder(projectsRoot: string, root: string, identity: string): Promise<void> {
      if (!(await pathExists(root))) return;
      await parentIsProjectsRoot(projectsRoot, root);
      await requireIdentity(root, identity);
      try { await rm(root, { recursive: true, force: true, maxRetries: 3 }); } catch { fail('IMPORT_CLEANUP_FAILED'); }
    },
    /** Read-only: how a candidate Pasta do projeto relates to the project's repository. */
    async inspectProjectFolder(location: string, repositoryId: string, repositoryUrl: string): Promise<ProjectFolderInspection> {
      const reference = githubReference(repositoryUrl);
      const view = (clone: ProjectFolderInspection['clone'], checkout: ProjectFolderInspection['checkout'], diagnostic: string | null): ProjectFolderInspection => ({
        location, clone, repository: reference ? `${reference.owner}/${reference.name}` : null, checkout, diagnostic, observed_at_ms: Date.now(),
      });
      if (!git) return view('unavailable', null, 'CONTEXT_UNAVAILABLE');
      if (!isAbsolute(location) || /[\x00-\x1f\x7f]/.test(location)) return view('unavailable', null, 'FOLDER_UNAVAILABLE');
      try {
        const root = await realpath(location);
        if (await directoryIdentity(root) === null) return view('unavailable', null, 'FOLDER_UNAVAILABLE');
        const observed = await observeClone(git, github, root);
        if (observed.state === 'not_clone' || observed.state === 'no_remote') return view('not_clone', null, null);
        const branch = await git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
        const checkout: ProjectFolderInspection['checkout'] = branch.exitCode === 0 && branch.stdout.trim() !== ''
          ? { kind: 'branch', name: branch.stdout.trim() } : branch.exitCode === 1 ? { kind: 'detached' } : null;
        if (observed.repositoryId === null) return view('unavailable', checkout, 'REMOTE_UNCONFIRMED');
        return view(observed.repositoryId === repositoryId ? 'same_repository' : 'other_repository', checkout, null);
      } catch { return view('unavailable', null, 'FOLDER_UNAVAILABLE'); }
    },
  };
}
export type ProjectFolderWorkspace = ReturnType<typeof createProjectFolderWorkspace>;
