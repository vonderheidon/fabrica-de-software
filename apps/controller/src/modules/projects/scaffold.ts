import { randomUUID } from 'node:crypto';
import { Value } from '@sinclair/typebox/value';
import { CreateScaffold, ScaffoldInput, type ScaffoldOptions, type ScaffoldPlan, type ScaffoldPlanned, type Prerequisite } from '#contracts';
import { OperationError, type Storage } from '../storage/index.js';
import type { GitHub } from '../github/index.js';
import { ScaffoldWorkspaceError, validateScaffoldBranch, type Workspaces } from '../workspaces/index.js';
import { engineeringSummary, fileDigest, loadScaffoldCatalog, renderEngineering, scaffoldDigest } from './scaffold-resources.js';

export interface ScaffoldDependencies {
  storage: Storage;
  github: Pick<GitHub, 'getIdentity'>;
  workspaces: Pick<Workspaces, 'scaffoldCapability' | 'inspectScaffoldDestination' | 'createLocalScaffold'>;
  logFailure: (code: string) => void;
  resourcesDirectory?: string;
}
export function createScaffold({ storage, github, workspaces, logFailure, resourcesDirectory }: ScaffoldDependencies) {
  const jobs = new Set<Promise<void>>(); let closing = false;
  const account = async () => {
    const observed = await github.getIdentity();
    return { state: observed.state, id: observed.state === 'complete' ? observed.data?.id ?? null : null, login: observed.state === 'complete' ? observed.data?.login ?? null : null };
  };
  const prerequisites = (): Prerequisite[] => {
    const result: Prerequisite[] = [];
    if (!storage.getSettings().projectsRoot) result.push({ code: 'PROJECTS_ROOT_REQUIRED', message: 'Configure a local projects root.', recovery: 'Save an accessible projects root in settings.' });
    const capability = workspaces.scaffoldCapability();
    if (!capability.available) result.push({ code: capability.reasonCode ?? 'CONTEXT_UNAVAILABLE', message: capability.reason ?? 'Git context unavailable.', recovery: capability.recovery ?? 'Start the authorized host.' });
    return result;
  };
  async function plan(input: ScaffoldInput): Promise<ScaffoldPlanned> {
    if (!Value.Check(ScaffoldInput, input) || !input.name.trim()) throw new OperationError(400, 'SCAFFOLD_INPUT_INVALID', 'Scaffold choices are invalid.');
    if (input.creationMode !== 'local' || input.remote) throw new OperationError(409, 'CREATION_MODE_UNAVAILABLE', 'This creation service supports only the local modality.');
    try { validateScaffoldBranch(input.baseBranch); }
    catch { throw new OperationError(400, 'SCAFFOLD_BRANCH_INVALID', 'Select a valid Git branch name.'); }
    const configuration = storage.getGlobalConfiguration(); const s = configuration.view.settings;
    if (!s.projectsRoot) throw new OperationError(409, 'PROJECTS_ROOT_REQUIRED', 'Configure the local projects root before planning.');
    const catalog = await loadScaffoldCatalog(resourcesDirectory); const template = catalog.templates.find(t => t.id === input.templateId);
    if (!template || template.digest !== input.templateDigest) throw new OperationError(409, 'SCAFFOLD_TEMPLATE_CHANGED', 'The selected template changed or is unavailable. Reload options.');
    const destination = await workspaces.inspectScaffoldDestination(s.projectsRoot, input.destinationRelative).catch(error => {
      throw new OperationError(409, error instanceof ScaffoldWorkspaceError ? error.code : 'SCAFFOLD_DESTINATION_UNAVAILABLE', 'The new destination is unavailable, exists or redirects outside the configured root.');
    });
    const files = renderEngineering(template.files, catalog.engineering, input.triageEnabled);
    const observed = await account();
    if (configuration.etag !== storage.getGlobalConfiguration().etag) throw new OperationError(409, 'SCAFFOLD_PLAN_CHANGED', 'Configuration changed while planning. Review a new plan.');
    const value: ScaffoldPlan = { formatVersion: 1, input, installationId: s.installationId, settingsETag: configuration.etag,
      ...destination, templateDigest: template.digest, files: files.map(f => ({ path: f.path, bytes: Buffer.byteLength(f.content), sha256: fileDigest(f.content) })),
      engineering: engineeringSummary(input.triageEnabled), account: observed, ownerId: null, effects: ['create_directory', 'write_template_and_engineering', 'initialize_git', 'create_conventional_baseline', 'register_local_project'] };
    return { planHash: scaffoldDigest(value), plan: value, prerequisites: prerequisites() };
  }
  async function revalidate(body: CreateScaffold) {
    if (!Value.Check(CreateScaffold, body) || scaffoldDigest(body.plan) !== body.planHash) throw new OperationError(400, 'SCAFFOLD_PLAN_INVALID', 'The authorized plan is invalid.');
    const current = await plan(body.plan.input);
    if (current.planHash !== body.planHash) throw new OperationError(409, 'SCAFFOLD_PLAN_CHANGED', 'The plan, account, template, destination or branch changed. Review a new plan.');
    return current;
  }
  async function execute(id: string, body: CreateScaffold): Promise<void> {
    try {
      const current = await revalidate(body);
      if (closing) throw new OperationError(409, 'CREATION_INTERRUPTED', 'Controller is closing.');
      const catalog = await loadScaffoldCatalog(resourcesDirectory); const template = catalog.templates.find(t => t.id === current.plan.input.templateId);
      if (!template || template.digest !== current.plan.templateDigest) throw new OperationError(409, 'SCAFFOLD_TEMPLATE_CHANGED', 'Scaffold resources changed.');
      const files = renderEngineering(template.files, catalog.engineering, current.plan.input.triageEnabled);
      await workspaces.createLocalScaffold({ plan: current.plan, files, record: (step, state, sha) => {
        if (closing && state === 'running') throw new OperationError(409, 'CREATION_INTERRUPTED', 'Controller is closing.');
        storage.recordCreationStep(id,step,state,sha);
      } });
      storage.completeCreation(id);
    } catch (error) {
      const code = error instanceof OperationError || error instanceof ScaffoldWorkspaceError ? error.code : 'SCAFFOLD_CREATION_FAILED';
      try { storage.failCreation(id,code); } catch { logFailure('CREATION_DIAGNOSTIC_NOT_DURABLE'); }
      logFailure(code);
    }
  }
  return {
    async getOptions(): Promise<ScaffoldOptions> {
      const catalog = await loadScaffoldCatalog(resourcesDirectory); const configuration = storage.getGlobalConfiguration();
      const pending = prerequisites(); const projectsRoot = configuration.view.settings.projectsRoot;
      if (projectsRoot) {
        try { await workspaces.inspectScaffoldDestination(projectsRoot, randomUUID()); }
        catch { pending.push({ code: 'PROJECTS_ROOT_UNAVAILABLE', message: 'The configured projects root is inaccessible or redirected.', recovery: 'Choose an accessible local directory.' }); }
      }
      return { catalog: { id: catalog.id, version: catalog.version, digest: catalog.digest },
        templates: catalog.templates.map(t => ({ id: t.id, digest: t.digest, label: t.label, engineeringSummary: 'GitHub tracker, domain consumer rules, AGENTS.md pointers and optional triage vocabulary. No skills or labels are installed.' })),
        projectsRoot, creationModes: (['local', 'remote_no_push', 'remote_push'] as const).map(mode => ({ mode, capability: mode === 'local'
          ? { ...workspaces.scaffoldCapability(), ...(pending.length ? { available: false, reasonCode: pending[0]!.code, reason: pending[0]!.message, recovery: pending[0]!.recovery } : {}) }
          : { available: false, reasonCode: 'CREATION_MODE_UNAVAILABLE', reason: 'Remote creation is not implemented in this slice.', recovery: 'Use the local modality.' } })),
        account: await account(), prerequisites: pending, eventCursor: configuration.view.eventCursor };
    },
    plan,
    async create(body: CreateScaffold, operationId: string) {
      const command = { operationId, body }; const recovered = storage.recoverCreation(command); if (recovered) return recovered;
      if (closing) throw new OperationError(503, 'CONTROLLER_CLOSING', 'The controller is closing.');
      try { await revalidate(body); }
      catch (error) { const concurrent = storage.recoverCreation(command); if (concurrent) return concurrent; throw error; }
      if (jobs.size >= 8) throw new OperationError(503, 'CREATION_CAPACITY_EXCEEDED', 'Wait for the current local creations to finish.');
      if (!workspaces.scaffoldCapability().available) throw new OperationError(409, 'CONTEXT_UNAVAILABLE', 'An authorized Git host context is required for creation.');
      const accepted = storage.acceptCreation(command);
      if (accepted.created) {
        const job = Promise.resolve().then(() => execute(accepted.operation.resource.id,body));
        jobs.add(job); void job.finally(() => jobs.delete(job));
      }
      return accepted.operation;
    },
    getCreation: (id: string) => storage.getCreation(id),
    async drain() { while (jobs.size) await Promise.all([...jobs]); },
    async close() { closing = true; await Promise.all([...jobs]); },
  };
}
export type Scaffold = ReturnType<typeof createScaffold>;
