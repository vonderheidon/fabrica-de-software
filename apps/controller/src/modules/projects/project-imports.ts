import { join } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { ProjectImportRequest, type ProjectFolderInspection, type ProjectFolderInspectionRequest, type ProjectImportStepName, type ProjectImportView } from '#contracts';
import type { GitHub } from '../github/index.js';
import { OperationError, type ProjectImportAdvance, type ProjectImportCleanup, type ProjectImportWork, type Storage, type StoredOperation } from '../storage/index.js';
import { ProjectFolderError, githubReference, validBranch, type Workspaces } from '../workspaces/index.js';

export interface ProjectImportDependencies {
  storage: Pick<Storage, 'getSettings' | 'getConfiguration' | 'recoverProjectImport' | 'acceptProjectImport' | 'getProjectImport' | 'getProjectImportWork'
    | 'advanceProjectImport' | 'completeProjectImport' | 'failProjectImport' | 'resumableProjectImports'>;
  github: Pick<GitHub, 'getRepository' | 'resolveBranch'>;
  workspaces: ProjectImportWorkspaces;
  logFailure: (code: string) => void;
}
export type ProjectImportWorkspaces = Pick<Workspaces, 'inspectOrigin' | 'reserveProjectFolder' | 'resetCreatedProjectFolder' | 'cloneProjectFolder'
  | 'verifyProjectFolder' | 'removeCreatedProjectFolder' | 'inspectProjectFolder'>;

const has = (value: object, names: readonly string[]) => names.every(name => typeof (value as Record<string, unknown>)[name] === 'function');
export const supportsProjectImportWorkspaces = (value: object): value is ProjectImportWorkspaces => has(value, ['inspectOrigin', 'reserveProjectFolder',
  'resetCreatedProjectFolder', 'cloneProjectFolder', 'verifyProjectFolder', 'removeCreatedProjectFolder', 'inspectProjectFolder']);
export const supportsProjectImportGitHub = (value: object): value is Pick<GitHub, 'getRepository' | 'resolveBranch'> => has(value, ['getRepository', 'resolveBranch']);

const windowsReserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
/** A single, portable path segment: the factory never lets the operator name anything but one folder directly under the projects root. */
export function validFolderName(name: string): boolean {
  return name.length > 0 && name.length <= 255 && name === name.trim() && !/[\\/:*?"<>|\x00-\x1f\x7f]/.test(name) && name !== '.' && name !== '..'
    && !name.endsWith('.') && !windowsReserved.test(name);
}

const stepDefaults: Record<ProjectImportStepName, string> = {
  repository: 'IMPORT_REPOSITORY_UNAVAILABLE', reservation: 'IMPORT_RESERVATION_FAILED', clone: 'IMPORT_CLONE_FAILED',
  verification: 'IMPORT_VERIFICATION_FAILED', registration: 'IMPORT_REGISTRATION_FAILED',
};
class ImportFailure extends Error { constructor(readonly code: string) { super(code); } }
const stop = (code: string): never => { throw new ImportFailure(code); };

/** Installation-scoped coordinator: accepts URL registrations and drives each one from its durable step, also after a restart. */
export function createProjectImports({ storage, github, workspaces, logFailure }: ProjectImportDependencies) {
  const active = new Map<string, Promise<void>>();
  let closing = false;

  function diagnosticFor(error: unknown, step: ProjectImportStepName): string {
    if (error instanceof ImportFailure) return error.code;
    if (error instanceof ProjectFolderError && error.code !== 'CONTEXT_UNAVAILABLE' && /^[A-Z0-9_]{1,128}$/.test(error.code)) return error.code;
    return stepDefaults[step];
  }

  async function perform(id: string): Promise<void> {
    let work = storage.getProjectImportWork(id);
    const resumedAtClone = work.step === 'clone' && work.state === 'running';
    const advance = (patch: ProjectImportAdvance) => {
      storage.advanceProjectImport(id, work.revision, patch);
      work = storage.getProjectImportWork(id);
    };
    const reference = githubReference(work.repositoryUrl) ?? stop('IMPORT_REPOSITORY_UNAVAILABLE');
    if (work.step === 'repository') {
      advance({ step: 'repository' });
      const repository = await github.getRepository(reference);
      const data = repository.state === 'complete' ? repository.data : null;
      if (!data) return stop('IMPORT_REPOSITORY_UNAVAILABLE');
      if (data.isArchived) stop('REPOSITORY_ARCHIVED');
      const base = work.baseBranch ?? data.defaultBranch;
      if (!base || !validBranch(base)) return stop('IMPORT_BASE_BRANCH_NOT_FOUND');
      const branch = await github.resolveBranch(reference, base);
      if (branch.state !== 'complete' || !branch.data || branch.data.repositoryId !== data.id) {
        // Only a confirmed absence is reported as a missing branch; a failed read stays retryable.
        stop(branch.diagnostics.some(item => item.code === 'BRANCH_NOT_FOUND') || branch.state === 'complete' ? 'IMPORT_BASE_BRANCH_NOT_FOUND' : 'IMPORT_REPOSITORY_UNAVAILABLE');
      }
      if (closing) return;
      advance({ step: 'reservation', repositoryId: data.id, baseBranch: base });
    }
    const repositoryId = work.repositoryId ?? stop('IMPORT_REPOSITORY_UNAVAILABLE');
    const baseBranch = work.baseBranch ?? stop('IMPORT_BASE_BRANCH_NOT_FOUND');
    if (work.step === 'reservation') {
      const reservation = await workspaces.reserveProjectFolder({ projectsRoot: work.projectsRoot, destination: work.destination, repositoryId });
      if (closing) return;
      if (reservation.adopted) advance({ step: 'verification', adopted: true });
      else advance({ step: 'clone', ...(reservation.created && reservation.identity ? { createdDirectoryIdentity: reservation.identity } : {}) });
    }
    if (work.step === 'clone') {
      if (resumedAtClone) {
        // An interrupted clone left partial content. Only a folder this import created may be emptied; anything else is never touched.
        if (work.createdDirectoryIdentity === null) stop('IMPORT_INTERRUPTED');
        else await workspaces.resetCreatedProjectFolder(work.projectsRoot, work.destination, work.createdDirectoryIdentity);
      }
      await workspaces.cloneProjectFolder({ root: work.destination, repositoryUrl: work.repositoryUrl, baseBranch });
      if (closing) return;
      advance({ step: 'verification' });
    }
    if (work.step === 'verification') {
      await workspaces.verifyProjectFolder({ root: work.destination, repositoryId, baseBranch, adopted: work.adopted, identity: work.createdDirectoryIdentity });
      if (closing) return;
      advance({ step: 'registration' });
    }
    if (work.step === 'registration') {
      const origin = await workspaces.inspectOrigin({ source: { kind: 'local', location: work.destination }, baseBranch });
      const { source, remote } = origin;
      const repository = remote?.confirmed ? remote.repository : null;
      if (origin.state !== 'identified' || !source || !repository || repository.id !== repositoryId) return stop('IMPORT_REGISTRATION_FAILED');
      if (closing) return;
      storage.completeProjectImport(id, work.revision, {
        source: { ...source, repository_id: repository.id, repository_url: repository.url },
        originNotes: origin.diagnostics.map(d => d.code).filter(code => code !== 'PROJECT_REQUIRED'),
      });
    }
  }

  async function fail(id: string, error: unknown): Promise<void> {
    let work: ProjectImportWork;
    try { work = storage.getProjectImportWork(id); } catch { return; }
    if (work.state !== 'accepted' && work.state !== 'running') return;
    let diagnostic = diagnosticFor(error, work.step);
    let cleanup: ProjectImportCleanup = 'not_needed';
    if (work.createdDirectoryIdentity !== null && !work.adopted) {
      try { await workspaces.removeCreatedProjectFolder(work.projectsRoot, work.destination, work.createdDirectoryIdentity); cleanup = 'removed'; }
      catch { cleanup = 'failed'; diagnostic = 'IMPORT_CLEANUP_FAILED'; }
    }
    storage.failProjectImport(id, work.revision, diagnostic, cleanup);
  }

  async function execute(id: string): Promise<void> {
    const work = storage.getProjectImportWork(id);
    if (work.state !== 'accepted' && work.state !== 'running') return;
    try { await perform(id); }
    catch (error) {
      // An interrupted import is resumed on the next boot, never failed by shutdown.
      if (closing) return;
      await fail(id, error);
    }
  }

  function schedule(id: string): Promise<void> {
    const existing = active.get(id);
    if (existing) return existing;
    if (closing) return Promise.resolve();
    const task = Promise.resolve().then(() => execute(id)).catch(() => logFailure('PROJECT_IMPORT_UNCONFIRMED')).finally(() => { active.delete(id); });
    active.set(id, task);
    return task;
  }

  return {
    /** Accepts (or replays) a URL registration and starts its worker; the operator follows it through `get`. */
    async start(body: ProjectImportRequest, operationId: string): Promise<StoredOperation> {
      if (!Value.Check(ProjectImportRequest, body)) throw new OperationError(400, 'IMPORT_COMMAND_INVALID', 'O cadastro por URL é inválido.');
      const command = { operationId, body };
      const prior = storage.recoverProjectImport(command);
      if (prior) { void schedule(prior.resource.id); return prior; }
      const reference = githubReference(body.repository_url.trim());
      if (!reference || body.repository_url !== body.repository_url.trim()) {
        throw new OperationError(400, 'IMPORT_URL_INVALID', 'Informe uma URL de repositório do GitHub (https://github.com/<dono>/<repositório>).');
      }
      if (!validFolderName(body.folder_name)) throw new OperationError(400, 'IMPORT_FOLDER_INVALID', 'Informe um nome de pasta simples, sem separadores nem caracteres reservados.');
      if (body.base_branch !== undefined && !validBranch(body.base_branch)) throw new OperationError(400, 'BASE_BRANCH_INVALID', 'Informe um nome de branch válido.');
      const root = storage.getSettings().projects_root;
      if (!root) {
        throw new OperationError(409, 'PROJECTS_ROOT_REQUIRED', 'Defina a Pasta dos projetos nas configurações antes de cadastrar por URL.',
          { recovery: 'Escolha a Pasta dos projetos e tente novamente.' });
      }
      const plan = { projectsRoot: root, destination: join(root, body.folder_name), repositoryUrl: `https://github.com/${reference.owner}/${reference.name}` };
      const accepted = storage.acceptProjectImport(command, plan);
      void schedule(accepted.operation.resource.id);
      return accepted.operation;
    },
    get: (id: string): ProjectImportView => storage.getProjectImport(id),
    /** Read-only: relates a candidate Pasta do projeto to the repository the project was registered from. */
    async inspectFolder(projectId: string, body: ProjectFolderInspectionRequest): Promise<ProjectFolderInspection> {
      const source = storage.getConfiguration(projectId).view.configuration.source;
      if (!source.repository_id || !source.repository_url) {
        return { location: body.location, clone: 'unavailable', repository: null, checkout: null, diagnostic: 'REPOSITORY_UNKNOWN', observed_at_ms: Date.now() };
      }
      return workspaces.inspectProjectFolder(body.location, source.repository_id, source.repository_url);
    },
    /** Resumes every accepted or running import from its durable step (boot, and replay after a restart). */
    recover(): void { for (const id of storage.resumableProjectImports()) void schedule(id); },
    drain: async () => { while (active.size) await Promise.all(active.values()); },
    close: async () => { closing = true; await Promise.all(active.values()); },
  };
}
export type ProjectImports = ReturnType<typeof createProjectImports>;
