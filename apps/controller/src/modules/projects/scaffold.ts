import { randomUUID } from 'node:crypto';
import { Value } from '@sinclair/typebox/value';
import { CreateScaffold, ScaffoldInput, type EffectIdentity, type EffectView, type ScaffoldOptions, type ScaffoldPlan, type ScaffoldPlanned, type Prerequisite } from '#contracts';
import { OperationError, type Storage } from '../storage/index.js';
import type { GitHub } from '../github/index.js';
import { ScaffoldWorkspaceError, validateScaffoldBranch, type Workspaces } from '../workspaces/index.js';
import { engineeringSummary, fileDigest, loadScaffoldCatalog, renderEngineering, renderScaffoldReadme, scaffoldDigest } from './scaffold-resources.js';

export interface ScaffoldDependencies {
  storage: Storage;
  github: Pick<GitHub, 'getIdentity'> & Partial<Pick<GitHub, 'scaffoldRemoteCapability' | 'inspectScaffoldRemote' | 'createScaffoldRepository' | 'reconcileScaffoldRepository' | 'describeScaffoldRepository'>>;
  workspaces: Pick<Workspaces, 'scaffoldCapability' | 'inspectScaffoldDestination' | 'createLocalScaffold'> & Partial<Pick<Workspaces, 'executeScaffoldGit' | 'reconcileScaffoldGit'>>;
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
    if (!storage.getSettings().projects_root) result.push({ code: 'PROJECTS_ROOT_REQUIRED', message: 'Configure a local projects root.', recovery: 'Save an accessible projects root in settings.' });
    const capability = workspaces.scaffoldCapability();
    if (!capability.available) result.push({ code: capability.reason_code ?? 'CONTEXT_UNAVAILABLE', message: capability.reason ?? 'Git context unavailable.', recovery: capability.recovery ?? 'Start the authorized host.' });
    return result;
  };
  async function plan(input: ScaffoldInput): Promise<ScaffoldPlanned> {
    if (!Value.Check(ScaffoldInput, input) || !input.name.trim()) throw new OperationError(400, 'SCAFFOLD_INPUT_INVALID', 'Scaffold choices are invalid.');
    input = { ...input, triageEnabled: true };
    if ((input.creationMode === 'local') === Boolean(input.remote)) throw new OperationError(400,'SCAFFOLD_INPUT_INVALID','Remote choices are required only for remote modalities.');
    if (input.creationMode !== 'local' && (!github.inspectScaffoldRemote || !github.createScaffoldRepository || !github.reconcileScaffoldRepository || !workspaces.executeScaffoldGit || !workspaces.reconcileScaffoldGit)) throw new OperationError(409,'CREATION_MODE_UNAVAILABLE','The authorized remote scaffold adapters are unavailable.');
    try { validateScaffoldBranch(input.baseBranch); }
    catch { throw new OperationError(400, 'SCAFFOLD_BRANCH_INVALID', 'Select a valid Git branch name.'); }
    const configuration = storage.getGlobalConfiguration(); const s = configuration.view.settings;
    if (!s.projects_root) throw new OperationError(409, 'PROJECTS_ROOT_REQUIRED', 'Configure the local projects root before planning.');
    const catalog = await loadScaffoldCatalog(resourcesDirectory); const template = catalog.templates.find(t => t.id === input.templateId);
    if (!template || template.digest !== input.templateDigest) throw new OperationError(409, 'SCAFFOLD_TEMPLATE_CHANGED', 'The selected template changed or is unavailable. Reload options.');
    const destination = await workspaces.inspectScaffoldDestination(s.projects_root, input.destinationRelative).catch(error => {
      throw new OperationError(409, error instanceof ScaffoldWorkspaceError ? error.code : 'SCAFFOLD_DESTINATION_UNAVAILABLE', 'The new destination is unavailable, exists or redirects outside the configured root.');
    });
    const files = renderEngineering(template.id === 'engineering.v1' ? renderScaffoldReadme(template.files, input) : template.files, catalog.engineering, input.triageEnabled);
    const observed = await account();
    let ownerLogin: string | undefined;
    if (input.remote) {
      if (observed.state !== 'complete' || !s.account_id || observed.id !== s.account_id) throw new OperationError(409,'SCAFFOLD_ACCOUNT_CHANGED','Observe the configured account before remote creation.');
      if (!github.scaffoldRemoteCapability?.(input.remote,s.account_id,input.creationMode === 'remote_push').available) throw new OperationError(409,'CREATION_TARGET_NOT_AUTHORIZED','The trusted host has not authorized this exact remote target and effects.');
      const remote = await github.inspectScaffoldRemote!(input.remote,s.account_id);
      if (remote.state !== 'complete' || !remote.data) throw new OperationError(409,'SCAFFOLD_REMOTE_UNAVAILABLE','The remote owner and name could not be completely observed.');
      if (remote.data.repositoryId) throw new OperationError(409,'SCAFFOLD_REMOTE_EXISTS','The selected repository already exists and will not be adopted.');
      ownerLogin = remote.data.ownerLogin;
    }
    if (configuration.etag !== storage.getGlobalConfiguration().etag) throw new OperationError(409, 'SCAFFOLD_PLAN_CHANGED', 'Configuration changed while planning. Review a new plan.');
    const value: ScaffoldPlan = { formatVersion: 1, input, installationId: s.installation_id, settingsETag: configuration.etag,
      ...destination, templateDigest: template.digest, files: files.map(f => ({ path: f.path, bytes: Buffer.byteLength(f.content), sha256: fileDigest(f.content) })),
      engineering: engineeringSummary(input.triageEnabled), account: observed, ownerId: input.remote?.ownerId ?? null, ...(ownerLogin ? { ownerLogin } : {}),
      effects: ['create_directory', 'write_template_and_engineering', 'initialize_git', 'create_conventional_baseline',
        ...(input.remote ? ['create_repository','associate_origin',...(input.creationMode === 'remote_push' ? ['baseline_push'] : [])] : []),'register_local_project'] };
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
      const files = renderEngineering(template.id === 'engineering.v1' ? renderScaffoldReadme(template.files, current.plan.input) : template.files, catalog.engineering, current.plan.input.triageEnabled);
      await workspaces.createLocalScaffold({ plan: current.plan, files, record: (step, state, sha) => {
        if (closing && state === 'running') throw new OperationError(409, 'CREATION_INTERRUPTED', 'Controller is closing.');
        storage.recordCreationStep(id,step,state,sha);
      } });
      if (current.plan.input.remote) await executeRemote(id,current.plan);
      storage.completeCreation(id);
    } catch (error) {
      const code = error instanceof OperationError || error instanceof ScaffoldWorkspaceError ? error.code : 'SCAFFOLD_CREATION_FAILED';
      try { storage.failCreation(id,code); } catch { logFailure('CREATION_DIAGNOSTIC_NOT_DURABLE'); }
      logFailure(code);
    }
  }
  async function currentAuthority(id: string,plan: ScaffoldPlan) {
    const observed = await account(); const current = storage.getCreation(id).creation;
    if (closing || current.state !== 'running' || current.planHash !== scaffoldDigest(plan) || storage.getGlobalConfiguration().etag !== plan.settingsETag ||
      observed.state !== 'complete' || observed.id !== plan.account.id || observed.login !== plan.account.login || observed.id !== storage.getSettings().account_id) throw new OperationError(409,'CREATION_AUTHORITY_CHANGED','The creation account, plan or continuity changed.');
    const catalog = await loadScaffoldCatalog(resourcesDirectory);
    if (!catalog.templates.some(t => t.id === plan.input.templateId && t.digest === plan.templateDigest)) throw new OperationError(409,'SCAFFOLD_TEMPLATE_CHANGED','Scaffold resources changed before the effect.');
  }
  async function executeRemote(id: string,plan: ScaffoldPlan) {
    const c = storage.getCreation(id).creation; const remote = plan.input.remote!;
    const common: EffectIdentity = { planHash: c.planHash,ownerId: remote.ownerId,repositoryOwner: plan.ownerLogin!,repositoryName: remote.name,visibility: remote.visibility };
    let repository: EffectView | undefined;
    for (const kind of ['create_repository','associate_origin',...(plan.input.creationMode === 'remote_push' ? ['baseline_push'] as const : [])] as const) {
      await currentAuthority(id,plan);
      const identity: EffectIdentity = kind === 'create_repository' ? { ...common,marker: `Factory-Creation:${plan.installationId}:${id}:${c.planHash}` }
        : { ...common,repositoryId: repository!.receipt!.id,commitSha: c.baselineSha!,branchRef: c.baselineRef! };
      const effect = storage.recordEffectIntent({ origin: { creationId: id },kind,scopeKey: id,expectedIdentity: identity,
        authorization: { accountId: plan.account.id!,mode: plan.input.creationMode,sourceOperationId: c.operationId } });
      if (effect.state !== 'not_started' || !storage.claimEffect(effect.operationId,effect.revision,c.operationId)) throw new OperationError(409,'CREATION_EFFECT_UNRESOLVED','Inspect the existing effect before continuing.');
      const claimed = storage.getEffect(effect.operationId);
      const authorize = async () => {
        await currentAuthority(id,plan);
        if (repository) {
          const confirmed = await github.reconcileScaffoldRepository!(repository,plan.account.id!);
          if (confirmed.state !== 'confirmed' || confirmed.receipt?.id !== repository.receipt?.id) throw new OperationError(409,'CREATION_REMOTE_IDENTITY_CONFLICT','The confirmed remote identity changed.');
        }
        await currentAuthority(id,plan); storage.assertEffectAuthorized(effect.operationId,c.operationId);
      };
      await authorize();
      const result = kind === 'create_repository' ? await github.createScaffoldRepository!(claimed,plan.account.id!,authorize)
        : await workspaces.executeScaffoldGit!(plan,claimed,plan.account.id!,authorize);
      storage.finishEffect(claimed.operationId,claimed.revision,result.state,result.receipt,result.reason);
      if (result.state !== 'confirmed') throw new OperationError(409,result.reason ?? 'CREATION_EFFECT_UNRESOLVED','The effect was not confirmed. Inspect the preserved creation.');
      if (kind === 'create_repository') repository = storage.getEffect(effect.operationId);
    }
    await currentAuthority(id,plan);
    const described = await github.describeScaffoldRepository?.(repository!,plan.account.id!,async () => {
      await currentAuthority(id,plan);
      const confirmed = await github.reconcileScaffoldRepository!(repository!,plan.account.id!);
      if (confirmed.state !== 'confirmed' || confirmed.receipt?.id !== repository!.receipt!.id) throw new OperationError(409,'CREATION_REMOTE_IDENTITY_CONFLICT','The confirmed remote identity changed.');
      await currentAuthority(id,plan);
    });
    if (described && described.state !== 'confirmed') throw new OperationError(409,described.reason ?? 'CREATION_REMOTE_DESCRIPTION_UNCONFIRMED','The repository description could not be confirmed.');
  }
  function schedule(job: () => Promise<void>) { const promise = Promise.resolve().then(job); jobs.add(promise); void promise.finally(() => jobs.delete(promise)); }
  return {
    async getOptions(): Promise<ScaffoldOptions> {
      const catalog = await loadScaffoldCatalog(resourcesDirectory); const configuration = storage.getGlobalConfiguration();
      const pending = prerequisites(); const projectsRoot = configuration.view.settings.projects_root;
      if (projectsRoot) {
        try { await workspaces.inspectScaffoldDestination(projectsRoot, randomUUID()); }
        catch { pending.push({ code: 'PROJECTS_ROOT_UNAVAILABLE', message: 'The configured projects root is inaccessible or redirected.', recovery: 'Choose an accessible local directory.' }); }
      }
      const observed = await account();
      return { catalog: { id: catalog.id, version: catalog.version, digest: catalog.digest },
        templates: catalog.templates.map(t => ({ id: t.id, digest: t.digest, label: t.label, engineeringSummary: 'Tracker GitHub, regras de domínio, instruções AGENTS.md e vocabulário opcional de triagem. Nenhuma skill ou label será instalada.' })),
        projectsRoot, creationModes: (['local', 'remote_no_push', 'remote_push'] as const).map(mode => ({ mode, capability: mode === 'local'
          ? { ...workspaces.scaffoldCapability(), ...(pending.length ? { available: false, reason_code: pending[0]!.code, reason: pending[0]!.message, recovery: pending[0]!.recovery } : {}) }
          : { available: pending.length === 0 && observed.state === 'complete' && observed.id === configuration.view.settings.account_id && Boolean(workspaces.executeScaffoldGit && github.scaffoldRemoteCapability?.(undefined,observed.id!,mode === 'remote_push').available), reason_code: 'CREATION_TARGET_NOT_AUTHORIZED', reason: 'Remote creation requires an exact target authorization from the trusted host.', recovery: 'Configure the host authorization for the selected owner, name, visibility and push.' } })),
        account: observed, prerequisites: pending, eventCursor: configuration.view.event_cursor };
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
    async reconcile(id: string,operationId: string,expectedRevision: string | undefined) {
      if (closing || jobs.size >= 8) throw new OperationError(503,'CREATION_CAPACITY_EXCEEDED','Wait for current creations to finish.');
      const accepted = storage.acceptCreationReconciliation({ creationId: id,operationId,expectedRevision });
      if (accepted.created) schedule(async () => {
        let diagnostic: string | null = null;
        try {
          const view = storage.getCreation(id); const observed = await account();
          if (observed.state !== 'complete' || observed.id !== view.creation.plan.account.id) throw new OperationError(409,'SCAFFOLD_ACCOUNT_CHANGED','The observed account differs from this creation.');
          for (const effect of view.effects) {
            if (!['running','unknown'].includes(effect.state)) continue;
            const repository = storage.getCreation(id).effects.find(e => e.kind === 'create_repository' && e.state === 'confirmed');
            if (effect.kind !== 'create_repository') {
              if (!repository) throw new OperationError(409,'REMOTE_IDENTITY_REQUIRED','Confirm the created repository before observing its Git effects.');
              const confirmed = await github.reconcileScaffoldRepository!(repository,observed.id!);
              if (confirmed.state !== 'confirmed' || confirmed.receipt?.id !== repository.receipt?.id) throw new OperationError(409,'CREATION_REMOTE_IDENTITY_CONFLICT','The remote repository changed.');
            }
            const result = effect.kind === 'create_repository' ? await github.reconcileScaffoldRepository!(effect,observed.id!) : await workspaces.reconcileScaffoldGit!(view.creation.plan,effect);
            if (result.state === 'confirmed') storage.finishEffect(effect.operationId,effect.revision,'confirmed',result.receipt,null);
            else diagnostic = result.reason ?? 'CREATION_EFFECT_UNRESOLVED';
          }
          const current = storage.getCreation(id);
          const repository = current.effects.find(e => e.kind === 'create_repository' && e.state === 'confirmed');
          if (repository && github.describeScaffoldRepository) {
            const described = await github.describeScaffoldRepository(repository,observed.id!,async () => {
              const account = await github.getIdentity();
              if (closing || account.state !== 'complete' || account.data?.id !== observed.id || storage.getSettings().account_id !== observed.id) throw new OperationError(409,'CREATION_AUTHORITY_CHANGED','The creation account changed.');
            });
            if (described.state !== 'confirmed') throw new OperationError(409,described.reason ?? 'CREATION_REMOTE_DESCRIPTION_UNCONFIRMED','The repository description could not be confirmed.');
          }
          const required = current.creation.plan.input.creationMode === 'local' ? [] : current.creation.plan.input.creationMode === 'remote_push' ? ['create_repository','associate_origin','baseline_push'] : ['create_repository','associate_origin'];
          if (current.creation.state !== 'completed' && current.confirmedEffects.filter(s => s.step !== 'registration').length === 4 && required.every(k => current.effects.some(e => e.kind === k && e.state === 'confirmed'))) storage.completeCreation(id);
          if (storage.getCreation(id).creation.state !== 'completed') diagnostic ??= 'CREATION_INCOMPLETE';
        } catch (e) { diagnostic = e instanceof OperationError || e instanceof ScaffoldWorkspaceError ? e.code : 'CREATION_RECONCILIATION_FAILED'; logFailure(diagnostic); }
        try { storage.finishCreationReconciliation(operationId,diagnostic); } catch { logFailure('CREATION_DIAGNOSTIC_NOT_DURABLE'); }
      });
      return accepted.operation;
    },
    async drain() { while (jobs.size) await Promise.all([...jobs]); },
    async close() { closing = true; await Promise.all([...jobs]); },
  };
}
export type Scaffold = ReturnType<typeof createScaffold>;
