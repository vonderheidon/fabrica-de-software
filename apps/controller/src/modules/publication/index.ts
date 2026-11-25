import { createHash, randomUUID } from 'node:crypto';
import type { AuthorizeUpgrade, CompletePublication, EffectIdentity, EffectView, GitHubMutationResult, ReconcilePublication } from '#contracts';
import type { GitHub, GitHubBeforeSendContext, GitHubClient, GitHubEffectRequest } from '../github/index.js';
import { OperationError, type AuthorityObservation, type PublicationCommand, type Storage } from '../storage/index.js';
import type { Workspaces } from '../workspaces/index.js';
import { createTargetSelections, type TargetWorkspaces } from './targets.js';
import type { DeliveryTargetPlan } from '../storage/index.js';
import { CaptureError } from '../workspaces/index.js';
import { markCriteria } from '../pipeline/index.js';

type Stage = 'inProgress' | 'inReview' | 'delivered';
const statusKey = (stage: Stage) => stage === 'inProgress' ? 'in_progress' : stage === 'inReview' ? 'in_review' : 'delivered';
type Snapshot = ReturnType<Storage['getPublicationSnapshot']>;
type PublicationGitHub = Pick<GitHubClient, 'getIdentity' | 'getIssueContextById' | 'getProject' | 'getRepository'> &
  Partial<Pick<GitHub, 'reconcilePullRequest'>> & { mutateEffect: (input: GitHubEffectRequest) => Promise<GitHubMutationResult> };
export interface PublicationDependencies {
  reconcileResources?: (attemptId: string) => Promise<void>;
  storage: Storage;
  github: PublicationGitHub;
  workspaces: Pick<Workspaces, 'verifyRetainedDelivery' | 'folderCapability'> & Partial<Pick<Workspaces, 'createLocalCommit' | 'reconcileLocalCommit' | 'createTargetCommit' | 'reconcileTargetCommit' | 'verifyDeliveryTarget' | 'pushApproved' | 'reconcilePush' | 'inspectDeliveryTarget' | 'inspectIntegrationTarget'>> & Partial<TargetWorkspaces>;
  cancelAttempt: (id: string) => Promise<void>;
  enqueue: (task: () => Promise<void>) => void;
  isClosed: () => boolean;
  logFailure: (code: string) => void;
  adaptIntegration?: (deliveryId: string, operationId: string, target: { baseSha: string; localPath: string; rootIdentity: string }) => Promise<void>;
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const blocked = (code: string): never => { throw new OperationError(409, code, 'Current authority or publication prerequisites prevent this action.'); };
function isGitHubUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com' && url.port === '' &&
      url.username === '' && url.password === '' && url.pathname.length > 1;
  } catch { return false; }
}
function stageFor(s: Snapshot): Stage {
  return s.status.result === 'delivered' ? 'delivered' : ['reviewing','publishing'].includes(s.status.phase) ? 'inReview' : 'inProgress';
}
export function createPublication(deps: PublicationDependencies) {
  const { storage, github } = deps;
  const active = new Set<string>();
  const targets = createTargetSelections(storage,deps.workspaces,deps.enqueue,deps.isClosed);
  function supported() { if (deps.isClosed()) throw new OperationError(503, 'PUBLICATION_CLOSED', 'The controller is shutting down.'); }
  async function observeAuthority(id: string, desired?: Stage, context?: GitHubBeforeSendContext): Promise<boolean> {
    context?.assertActive();
    try { return await observeCurrentAuthority(id, desired, context); }
    catch (error) {
      if (!(error instanceof OperationError) || error.code !== 'AUTHORITY_OBSERVATION_STALE') throw error;
      // Only repeat reads: the discarded observation must never authorize a remote effect.
      context?.assertActive();
      return observeCurrentAuthority(id, desired, context);
    }
  }
  async function observeCurrentAuthority(id: string, desired?: Stage, context?: GitHubBeforeSendContext): Promise<boolean> {
    context?.assertActive();
    supported(); const snapshot = storage.getPublicationSnapshot(id); const capture = snapshot.capture;
    const mapping = capture.configuration.configuration.github_project;
    const currentMapping = snapshot.configuration.configuration.github_project;
    const mappingMatches = mapping && currentMapping && mapping.id === currentMapping.id && mapping.owner_id === currentMapping.owner_id &&
      mapping.status_field_id === currentMapping.status_field_id && (['ready','in_progress','in_review','delivered'] as const).every(key => mapping.status_option_ids[key] === currentMapping.status_option_ids[key]);
    const stage = desired ?? stageFor(snapshot);
    const last = snapshot.effects.filter(e => e.kind === 'project_status' && e.state === 'confirmed').at(-1);
    const original = capture.issue.memberships.find(m => m.projectId === mapping?.id)?.statusValues.find(v => v.fieldId === mapping?.status_field_id)?.optionId ?? null;
    const expectedStatusId = last?.expectedIdentity.optionId ?? original;
    // Integration adaptation clears the current result but preserves the earlier completed delivery.
    const deliveredBefore = snapshot.status.result === 'delivered' || snapshot.effects.some(effect =>
      effect.kind === 'project_status' && effect.state === 'confirmed' && effect.expectedIdentity.optionId === mapping?.status_option_ids.delivered);
    let observation: AuthorityObservation = { reason: null, observedAccountId: null, expectedStatusId, observedStatusId: null };
    context?.assertActive();
    const identity = await github.getIdentity();
    context?.assertActive();
    if (identity.state !== 'complete' || !identity.data) observation.reason = 'AUTHORITY_UNAVAILABLE';
    else {
      observation.observedAccountId = identity.data.id;
      if (identity.data.id !== capture.accountId || identity.data.id !== snapshot.settings.account_id) observation.reason = 'ACCOUNT_CHANGED';
    }
    if (!observation.reason) {
      context?.assertActive();
      const issueResult = await github.getIssueContextById(capture.issue.id, { purpose: 'authority' });
      context?.assertActive();
      const issue = issueResult.data;
      if (issueResult.state !== 'complete' || !issue) observation.reason = 'AUTHORITY_UNAVAILABLE';
      else if (issue.id !== capture.issue.id || issue.repository.id !== capture.issue.repository.id ||
        (issue.state !== 'OPEN' && !(issue.state === 'CLOSED' && deliveredBefore)) ||
        issue.repository.isArchived || issue.blockers.some(b => b.state === 'OPEN')) observation.reason = 'ISSUE_INELIGIBLE';
      else if (issue.assignees.length !== 1 || issue.assignees[0]?.id !== capture.accountId) observation.reason = 'ASSIGNEE_CHANGED';
      else if (!mapping || !mappingMatches || snapshot.configuration.configuration.source.repository_id !== capture.issue.repository.id) observation.reason = 'PUBLICATION_CONFIGURATION_CHANGED';
      else {
        context?.assertActive();
        const [projectResult, repositoryResult] = await Promise.all([github.getProject(mapping.id), github.getRepository({ owner: capture.issue.repository.owner.login, name: capture.issue.repository.name })]);
        context?.assertActive();
        const project = projectResult.data;
        const membership = issue.memberships.filter(m => m.projectId === mapping.id);
        const values = membership[0]?.statusValues.filter(v => v.fieldId === mapping.status_field_id) ?? [];
        observation.observedStatusId = values[0]?.optionId ?? null;
        if (projectResult.state !== 'complete' || repositoryResult.state !== 'complete' || !project || !repositoryResult.data) observation.reason = 'AUTHORITY_UNAVAILABLE';
        else if (project.project.id !== mapping.id || project.project.owner.id !== mapping.owner_id || project.project.closed || repositoryResult.data.id !== capture.issue.repository.id || repositoryResult.data.isArchived ||
          membership.length !== 1 || membership[0]!.archived || membership[0]!.itemId !== capture.issue.memberships.find(m => m.projectId === mapping.id)?.itemId || values.length !== 1 ||
          (capture.configuration.origins.base_branch === 'project' && snapshot.configuration.configuration.base_branch !== capture.configuration.configuration.base_branch) ||
          !Object.values(mapping.status_option_ids).every(option => project.singleSelectFields.find(f => f.id === mapping.status_field_id)?.options.some(o => o.id === option))) observation.reason = 'PUBLICATION_CONFIGURATION_CHANGED';
        else {
          const pendingSameStage = snapshot.effects.some(e => e.kind === 'project_status' && e.expectedIdentity.optionId === mapping.status_option_ids[statusKey(stage)] && ['running','unknown','confirmed'].includes(e.state));
          const observed = observation.observedStatusId;
          if (observed !== expectedStatusId && !(pendingSameStage && observed === mapping.status_option_ids[statusKey(stage)])) observation.reason = 'KANBAN_DIVERGENCE';
        }
      }
    }
    context?.assertActive();
    storage.recordAuthority(id, snapshot.stamp, observation);
    if (observation.reason === 'ASSIGNEE_CHANGED' && !snapshot.status.result) {
      context?.assertActive();
      await deps.cancelAttempt(id);
      context?.assertActive();
    }
    const suspension = storage.getAttempt(id).suspension;
    return observation.reason === null && suspension === null;
  }
  async function reconcileEffect(effect: EffectView): Promise<void> {
    if (!['running','unknown'].includes(effect.state) || !effect.attemptId) return;
    if ((effect.kind === 'push' || effect.kind === 'pull_request') && effect.deliveryId) {
      const d = storage.getDelivery(effect.deliveryId).delivery;
      const noDelta = storage.getEffects(effect.attemptId).some(e => e.deliveryId === d.id && e.kind === 'local_commit' && e.state === 'not_applicable' && e.reason === 'APPROVED_NO_DELTA');
      if (!d.hasDelta && noDelta) {
        await deps.workspaces.verifyRetainedDelivery(d);
        storage.finishEffect(effect.operationId,effect.revision,'not_applicable',null,'APPROVED_NO_DELTA'); return;
      }
    }
    if (effect.kind === 'local_commit') {
      if (!effect.deliveryId || !deps.workspaces.reconcileLocalCommit) return;
      const delivery = storage.getDelivery(effect.deliveryId).delivery;
      const result = effect.expectedIdentity.targetOperationId
        ? await deps.workspaces.reconcileTargetCommit?.(delivery,effect,storage.getDeliveryTarget(effect.expectedIdentity.targetOperationId))
        : await deps.workspaces.reconcileLocalCommit(delivery,effect);
      if (!result) return;
      if (result.state === 'confirmed' || result.state === 'not_applicable' || effect.kind === 'local_commit' && result.state === 'failed_known' && result.reason === 'COMMIT_NOT_OBSERVED') {
        storage.finishEffect(effect.operationId,effect.revision,result.state,result.receipt,result.reason);
      }
      return;
    }
    const capture = storage.getAttemptCapture(effect.attemptId);
    const identity = await github.getIdentity();
    if (identity.state !== 'complete' || identity.data?.id !== capture.accountId) return;
    if (effect.kind === 'push' || effect.kind === 'pull_request') {
      const result = effect.kind === 'push' && effect.deliveryId && deps.workspaces.reconcilePush
        ? await deps.workspaces.reconcilePush(storage.getDelivery(effect.deliveryId).delivery,effect)
        : effect.kind === 'pull_request' && github.reconcilePullRequest ? await github.reconcilePullRequest(effect,capture.accountId) : null;
      if (result?.state === 'confirmed') storage.finishEffect(effect.operationId,effect.revision,'confirmed',result.receipt,null);
      return;
    }
    if (effect.kind === 'issue_comment') {
      if (!effect.expectedIdentity.issueId) return;
      const response = await github.getIssueContextById(effect.expectedIdentity.issueId, { purpose: 'comment_confirmation' });
      if (response.state !== 'complete' || !response.data) return;
      const issue = response.data; const wanted = effect.expectedIdentity;
      if (issue.id !== wanted.issueId || issue.repository.id !== wanted.repositoryId) return;
      const matches = issue.comments.filter(c => c.body.startsWith(wanted.marker + '\n'));
      if (matches.length !== 1) return;
      const comment = matches[0]!;
      if (comment.author?.id !== capture.accountId || hash(comment.body) !== wanted.bodyHash || !isGitHubUrl(comment.url)) return;
      storage.finishEffect(effect.operationId, effect.revision, 'confirmed', { id: comment.id, url: comment.url }, null);
      return;
    }
    if (effect.kind === 'issue_body') {
      const wanted = effect.expectedIdentity;
      if (!wanted.issueId || !wanted.criterionIds) return;
      const issue = await readIssueBody(wanted.issueId);
      if (!issue || issue.repository.id !== wanted.repositoryId) return;
      const criteria = capture.criteria.filter(c => wanted.criterionIds!.includes(c.id));
      const observed = markCriteria(issue, criteria);
      // Confirmed only when every planned criterion is checked; anything else is final and never edited again.
      if (observed.alreadyChecked.length === criteria.length) storage.finishEffect(effect.operationId, effect.revision, 'confirmed', { id: wanted.issueId }, null);
      else storage.finishEffect(effect.operationId, effect.revision, 'not_applicable', null, 'CRITERIA_NOT_MARKED');
      return;
    }
    if (effect.kind === 'project_status') {
      if (!effect.expectedIdentity.issueId) return;
      const response = await github.getIssueContextById(effect.expectedIdentity.issueId, { purpose: 'status_confirmation' });
      if (response.state !== 'complete' || !response.data) return;
      const issue = response.data; const wanted = effect.expectedIdentity;
      if (issue.id !== wanted.issueId || issue.repository.id !== wanted.repositoryId) return;
      const memberships = issue.memberships.filter(m => m.projectId === wanted.projectId && m.itemId === wanted.itemId);
      if (memberships.length !== 1 || memberships[0]!.archived) return;
      const statuses = memberships[0]!.statusValues.filter(v => v.fieldId === wanted.fieldId);
      if (statuses.length === 1 && statuses[0]!.optionId === wanted.optionId) {
        storage.finishEffect(effect.operationId, effect.revision, 'confirmed', { id: wanted.itemId!, optionId: wanted.optionId! }, null);
      } else if (effect.state === 'unknown' && effect.reason !== 'STATUS_READBACK_REQUIRED' && wanted.previousOptionId && wanted.previousOptionId !== wanted.optionId &&
        statuses.length === 1 && statuses[0]!.optionId === wanted.previousOptionId) {
        // The write never got a success response and the item still holds the previous option: it was not applied.
        // Setting a single-select value is idempotent, so the same effect may be sent again or superseded by a later stage.
        storage.finishEffect(effect.operationId, effect.revision, 'failed_known', null, 'STATUS_NOT_OBSERVED');
      }
    }
  }
  async function reconcile(id: string): Promise<void> {
    for (const effect of storage.getEffects(id)) await reconcileEffect(effect);
  }
  async function send(id: string, kind: EffectView['kind'], scopeKey: string, identity: EffectIdentity, sourceOperationId: string, body?: string): Promise<boolean> {
    supported();
    const snapshot = storage.getPublicationSnapshot(id);
    const old = snapshot.effects.find(e => e.kind === kind && e.scopeKey === scopeKey);
    if (old?.state === 'confirmed') return true;
    if (snapshot.effects.some(e => ['running','unknown'].includes(e.state))) return false;
    const version = old ? old.deliveryId : snapshot.delivery?.id;
    const effect = storage.recordEffectIntent({ origin: { attemptId: id, ...(version ? { deliveryId: version } : {}) }, kind, scopeKey,
      expectedIdentity: identity, authorization: { accountId: snapshot.capture.accountId, mode: snapshot.mode, sourceOperationId } });
    if (effect.state === 'confirmed') return true;
    if (!await observeAuthority(id)) return false;
    supported();
    if (!storage.claimEffect(effect.operationId, effect.revision, sourceOperationId)) return false;
    const running = storage.getEffect(effect.operationId);
    let result: GitHubMutationResult;
    try { result = await github.mutateEffect({ effect: running, accountId: snapshot.capture.accountId, ...(body !== undefined ? { body } : {}),authorize: async context => {
      context.assertActive(); supported(); if (!await observeAuthority(id, undefined, context)) blocked('PUBLICATION_BLOCKED');
      context.assertActive(); storage.assertEffectAuthorized(running.operationId,sourceOperationId);
    } }); }
    catch { result = { state: 'unknown', receipt: null, reason: 'EFFECT_TRANSPORT_LOST', retryAtMs: null }; }
    if (!['confirmed','failed_known','unknown'].includes(result.state)) throw new OperationError(503,'EFFECT_RESPONSE_INVALID','The effect returned an invalid outcome.');
    const requiresReadback = kind === 'issue_comment' || kind === 'issue_body' || kind === 'project_status';
    const awaitingReadback = requiresReadback && result.state !== 'failed_known';
    storage.finishEffect(running.operationId, running.revision,
      awaitingReadback ? 'unknown' : result.state === 'confirmed' ? 'confirmed' : result.state === 'failed_known' ? 'failed_known' : 'unknown',
      awaitingReadback ? null : result.receipt,
      awaitingReadback ? result.reason ?? (kind === 'issue_comment' ? 'COMMENT_READBACK_REQUIRED' : kind === 'issue_body' ? 'ISSUE_BODY_READBACK_REQUIRED' : 'STATUS_READBACK_REQUIRED') : result.reason);
    if (awaitingReadback) await reconcileEffect(storage.getEffect(effect.operationId));
    return storage.getEffect(effect.operationId).state === 'confirmed';
  }
  async function projectStage(id: string, desired?: Stage, sourceOperationId?: string): Promise<boolean> {
    supported();
    let snapshot = storage.getPublicationSnapshot(id); const stage = desired ?? stageFor(snapshot);
    if (snapshot.status.result && snapshot.status.result !== 'delivered') return false;
    if (stage === 'delivered' && snapshot.status.result !== 'delivered') return false;
    await reconcile(id);
    if (!await observeAuthority(id, stage)) return false;
    snapshot = storage.getPublicationSnapshot(id);
    const mapping = snapshot.capture.configuration.configuration.github_project;
    if (!mapping) return false;
    const optionId = mapping.status_option_ids[statusKey(stage)];
    const membership = snapshot.capture.issue.memberships.find(m => m.projectId === mapping.id);
    if (!membership) return false;
    const scope = `${snapshot.status.passageId}:${stage}`;
    const old = snapshot.effects.find(e => e.kind === 'project_status' && e.scopeKey === scope);
    const identity: EffectIdentity = old?.expectedIdentity ?? { repositoryId: snapshot.capture.issue.repository.id, issueId: snapshot.capture.issue.id,
      projectId: mapping.id, itemId: membership.itemId, fieldId: mapping.status_field_id, optionId,
      previousOptionId: snapshot.authority?.observed_status_id ?? null };
    await send(id, 'project_status', scope, identity, sourceOperationId ?? snapshot.status.operationId);
    // Projection failure preserves local work. send() prevents any later remote mutation until reconciliation.
    return storage.getAttempt(id).suspension === null;
  }
  async function readIssueBody(issueId: string) {
    const response = await github.getIssueContextById(issueId);
    const issue = response.data;
    return response.state === 'complete' && issue && 'body' in issue && issue.id === issueId ? issue : null;
  }
  const passedCriteria = (s: Snapshot) => {
    const review = storage.getReview(s.delivery!.id)!;
    return s.capture.criteria.filter(c => review.criteria.some(r => r.criterionId === c.id && r.verdict === 'passed'));
  };
  /** The plan is frozen once recorded, so the delivery comment and the body edit always describe the same criteria. */
  async function issueBodyPlan(s: Snapshot): Promise<{ criterionIds: string[]; skipped: string[] }> {
    const passed = passedCriteria(s).map(c => c.id); const deliveryId = s.delivery!.id;
    const recorded = s.effects.find(e => e.kind === 'issue_body' && e.deliveryId === deliveryId)?.expectedIdentity.criterionIds;
    let present: readonly string[] = recorded ?? [];
    if (!recorded && passed.length && !s.effects.some(e => e.kind === 'issue_comment' && e.deliveryId === deliveryId)) {
      const issue = await readIssueBody(s.capture.issue.id);
      if (!issue) blocked('ISSUE_BODY_UNAVAILABLE');
      const marking = markCriteria(issue!, passedCriteria(s));
      present = [...marking.marked, ...marking.alreadyChecked];
    }
    return { criterionIds: passed.filter(c => present.includes(c)), skipped: passed.filter(c => !present.includes(c)) };
  }
  function issueBodyIdentity(s: Snapshot, criterionIds: string[]): EffectIdentity {
    return { repositoryId: s.capture.issue.repository.id, issueId: s.capture.issue.id, contentIdentity: s.delivery!.contentIdentity!, criterionIds };
  }
  async function recordIssueBodyPlan(s: Snapshot, command: PublicationCommand): Promise<string[]> {
    const plan = await issueBodyPlan(s);
    if (plan.criterionIds.length && !s.effects.some(e => e.kind === 'issue_body' && e.deliveryId === s.delivery!.id)) {
      try {
        storage.recordEffectIntent({ origin: { attemptId: s.status.id, deliveryId: s.delivery!.id }, kind: 'issue_body', scopeKey: s.delivery!.id,
          expectedIdentity: issueBodyIdentity(s, plan.criterionIds), authorization: { accountId: s.capture.accountId, mode: s.mode, sourceOperationId: command.operationId } });
      } catch (error) {
        // Without a recorded plan nothing is checked, and the comment reports every approved criterion as unchecked.
        deps.logFailure(error instanceof OperationError ? error.code : 'ISSUE_BODY_FAILED');
        return [...plan.criterionIds, ...plan.skipped];
      }
    }
    return plan.skipped;
  }
  /** Checks approved criteria in the issue body. Never blocks the delivery: failures stay recorded on the effect. */
  async function markIssueBody(id: string, deliveryId: string, command: PublicationCommand): Promise<void> {
    try {
      const snapshot = storage.getPublicationSnapshot(id, deliveryId);
      const effect = snapshot.effects.find(e => e.kind === 'issue_body' && e.deliveryId === deliveryId);
      if (!effect || !['not_started','failed_known'].includes(effect.state) || !effect.expectedIdentity.criterionIds) return;
      const issue = await readIssueBody(snapshot.capture.issue.id);
      if (!issue) return;
      const marking = markCriteria(issue, snapshot.capture.criteria.filter(c => effect.expectedIdentity.criterionIds!.includes(c.id)));
      if (!marking.marked.length) {
        // Nothing left to edit: the readback decides between confirmed and not marked, without a mutation.
        if (storage.claimEffect(effect.operationId, effect.revision, command.operationId)) await reconcileEffect(storage.getEffect(effect.operationId));
        return;
      }
      await send(id, 'issue_body', deliveryId, effect.expectedIdentity, command.operationId, marking.body);
    } catch (error) {
      deps.logFailure(error instanceof OperationError ? error.code : 'ISSUE_BODY_FAILED');
    }
  }
  function commentBody(snapshot: Snapshot, skipped: readonly string[] = []): string {
    const d = snapshot.delivery!; const review = storage.getReview(d.id)!;
    const marker = `<!-- factory:${snapshot.mode}:${snapshot.settings.installation_id}:${snapshot.status.id}:${d.id} -->`;
    const commit = snapshot.effects.find(e => e.kind === 'local_commit' && e.deliveryId === d.id);
    const commitMode = snapshot.mode === 'commit';
    const lines = [marker, commitMode ? '### Resultado Commit local da fábrica' : '### Resultado ICR da fábrica', '', `Tentativa: ${snapshot.status.id}`, `Versão: ${d.id}`, `Tree aprovada: ${d.contentIdentity}`,
      `Base de comparação: ${d.baseSha}`, `Referência retida: ${d.gitRef}`, ...(commitMode && commit?.expectedIdentity.targetOperationId ? [`Base de publicação: ${commit.expectedIdentity.parentSha}`, `Tarefa: ${commit.expectedIdentity.taskType}: ${commit.expectedIdentity.taskDescription}`, `Branch: ${commit.expectedIdentity.branchRef}`] : []), `Revisão independente: approved (${review.id}).`,
      commitMode ? (commit?.state === 'not_applicable' ? 'Commit: not_applicable (APPROVED_NO_DELTA). Entrega revisada sem alterações; nenhum commit vazio foi criado.' : `Commit local: ${commit?.receipt?.id}; ${commit?.expectedIdentity.taskType ?? 'branch'} ${commit?.expectedIdentity.taskDescription ?? ''}; branch: ${commit?.expectedIdentity.branchRef}.`) : 'Versão aprovada para entrega local ICR. Alterações e ambiente preservados, sem commit de entrega ou push.',
      ...(commitMode ? ['Publicação local, sem push, PR ou fechamento da issue.'] : []), '', 'Critérios verificados:',
       ...review.criteria.map(c => `- ${c.criterionId}: ${c.verdict}; ${c.evidence.length} referência(s) de evidência no resultado oficial.`),
      ...(skipped.length ? [`Não marcados na issue (critério alterado desde a captura ou sem caixa de seleção): ${skipped.join(', ')}.`] : []),
      '', `Detalhe local: GET /api/v1/deliveries/${d.id}`, `Diff sob demanda: GET /api/v1/deliveries/${d.id}/diff`,
      `Achados não impeditivos desta revisão: ${review.findings.filter(f => !f.blocking).length}.`];
    const body = lines.join('\n');
    if (body.length > 60_000) throw new OperationError(409, 'COMMENT_LIMIT', 'The identified result exceeds the comment limit.');
    return body;
  }
  async function completeLocalCommit(snapshot: Snapshot, command: PublicationCommand): Promise<void> {
    const configured = snapshot.capture.configuration.configuration;
    if (snapshot.mode === 'pr' && configured.delivery_branch?.name === configured.base_branch) blocked('PR_BRANCH_EQUALS_BASE');
    const delivery = snapshot.delivery!;
    const previous = snapshot.effects.find(e => e.kind === 'local_commit' && e.deliveryId === delivery.id);
    if (previous && ['confirmed','not_applicable'].includes(previous.state)) {
      if (previous.expectedIdentity.targetOperationId && previous.state === 'confirmed') {
        const reconcileTargetCommit = deps.workspaces.reconcileTargetCommit;
        if (!reconcileTargetCommit) blocked('COMMIT_CONTEXT_UNAVAILABLE');
        const sealedTarget = storage.getDeliveryTarget(previous.expectedIdentity.targetOperationId);
        const observed = await reconcileTargetCommit!(delivery,previous,sealedTarget);
        if (observed.state !== 'confirmed' || observed.receipt?.id !== previous.receipt?.id) blocked('DELIVERY_TARGET_CHANGED');
      }
      return;
    }
    if (!deps.workspaces.createLocalCommit) blocked('COMMIT_CONTEXT_UNAVAILABLE');
    const sealed = previous
      ? previous.expectedIdentity.targetOperationId ? storage.getDeliveryTarget(previous.expectedIdentity.targetOperationId) : null
      : storage.findDeliveryTarget(snapshot.status.id,delivery.id);
    let target = sealed;
    if (target && deps.adaptIntegration && deps.workspaces.inspectIntegrationTarget && (!previous || previous.state === 'failed_known')) {
      const absent = !previous || await deps.workspaces.reconcileTargetCommit?.(delivery,previous,target);
      if (absent === true || absent && absent.state === 'failed_known' && absent.reason === 'COMMIT_NOT_OBSERVED') {
        const next = await deps.workspaces.inspectIntegrationTarget(target.local_path,{ attemptId:snapshot.status.id,approvedRef:delivery.gitRef!,
          contentIdentity:delivery.contentIdentity!,repositoryRelative:delivery.repositoryRelative,issueNumber:snapshot.capture.issue.number,issueTitle:snapshot.capture.issue.title,
          repositoryId:snapshot.capture.issue.repository.id,repositoryUrl:snapshot.capture.issue.repository.url,
          baseBranch:target.base_branch,baseSha:target.local_identity.base_sha, sourceKind:target.local_identity.source_kind, deliveryBranch: snapshot.capture.configuration.configuration.delivery_branch });
        if (next.rootIdentity !== target.local_identity.root_identity) blocked('DELIVERY_TARGET_CHANGED');
        if (next.baseSha !== target.local_identity.base_sha) {
          if (!await observeAuthority(snapshot.status.id)) blocked('PUBLICATION_BLOCKED');
          await deps.adaptIntegration(delivery.id,command.operationId,next);
          return blocked('INTEGRATION_REVIEW_PENDING');
        }
      }
    }
    if (!previous && !target && !deps.workspaces.inspectDeliveryTarget) blocked('DELIVERY_TARGET_CONTEXT_UNAVAILABLE');
    if (target && !deps.workspaces.createTargetCommit) blocked('DELIVERY_TARGET_CONTEXT_UNAVAILABLE');
    if (!previous && !target && deps.workspaces.inspectDeliveryTarget) {
      const source = snapshot.capture.configuration.configuration.source;
      let localPath = source.location; let selectionOperationId: string | null = null; let selectedIdentity: string | null = null;
      const integrationTarget = storage.getIntegrationTarget(delivery.id);
      if (integrationTarget) {
        localPath = integrationTarget.localPath; selectedIdentity = integrationTarget.rootIdentity;
      } else if (source.kind === 'github') {
        const intent = snapshot.capture.v3Delivery?.publication_target;
        if (!intent) blocked('PUBLICATION_TARGET_REQUIRED');
        const intentHash = snapshot.capture.v3Delivery!.publication_target_hash!;
        let selection = storage.findTargetSelection(snapshot.status.id,delivery.id,{ hash:intentHash });
        if (!selection) {
          const pendingSelection = storage.findTargetSelection(snapshot.status.id,delivery.id);
          if (pendingSelection) {
            if (pendingSelection.view.target_intent_hash !== intentHash) blocked('TARGET_SELECTION_PENDING');
            await targets.reconcile(snapshot.status.id,delivery.id);
            selection = storage.findTargetSelection(snapshot.status.id,delivery.id,{ hash:intentHash });
          }
        }
        if (!selection && command.kind === 'publication.authorize-upgrade' && snapshot.capture.configuration.configuration.default_delivery_mode === 'icr') {
          const current = storage.getAttempt(snapshot.status.id);
          await targets.select(snapshot.status.id,{ delivery_id:delivery.id,repository_id:intent!.repository_id,selection:intent!.selection,authorized:true,
            authorization_operation_id:command.operationId,target_intent_hash:intentHash },{ operationId:randomUUID(),expectedRevision:`"${current.id}:${current.revision}"` });
          await targets.reconcile(snapshot.status.id,delivery.id);
          selection = storage.findTargetSelection(snapshot.status.id,delivery.id,{ hash:intentHash });
        }
        if (!selection || selection.view.state !== 'confirmed') blocked('TARGET_SELECTION_PENDING');
        if (selection!.view.repository_id !== intent!.repository_id || selection!.view.local_path !== (intent!.selection.kind === 'clone' ? intent!.selection.destination : intent!.selection.path)) blocked('TARGET_SELECTION_INVALID');
        localPath = selection!.view.local_path; selectionOperationId = selection!.view.operation_id; selectedIdentity = selection!.expected.directoryIdentity;
      }
      const task = { attemptId:snapshot.status.id,approvedRef:delivery.gitRef!,
        contentIdentity:delivery.contentIdentity!,issueNumber:snapshot.capture.issue.number,issueTitle:snapshot.capture.issue.title,
        repositoryRelative:delivery.repositoryRelative,repositoryId:snapshot.capture.issue.repository.id,repositoryUrl:snapshot.capture.issue.repository.url,
        baseBranch:snapshot.capture.configuration.configuration.delivery_branch?.kind === 'existing' ? snapshot.capture.configuration.configuration.delivery_branch.name : snapshot.capture.configuration.configuration.base_branch,baseSha:snapshot.publicationBaseSha!, sourceKind:source.kind, deliveryBranch:snapshot.capture.configuration.configuration.delivery_branch };
      let inspected;
      try { inspected = await deps.workspaces.inspectDeliveryTarget(localPath,task,task); }
      catch (error) {
        if (!(error instanceof CaptureError) || error.code !== 'DELIVERY_BASE_CHANGED' || !deps.adaptIntegration || !deps.workspaces.inspectIntegrationTarget) throw error;
        const integration = await deps.workspaces.inspectIntegrationTarget(localPath,task);
        if (selectedIdentity && integration.rootIdentity !== selectedIdentity) blocked('DELIVERY_TARGET_CHANGED');
        if (!await observeAuthority(snapshot.status.id)) blocked('PUBLICATION_BLOCKED');
        await deps.adaptIntegration(delivery.id,command.operationId,integration);
        return blocked('INTEGRATION_REVIEW_PENDING');
      }
      if (selectedIdentity && inspected.local_identity.root_identity !== selectedIdentity) blocked('DELIVERY_TARGET_CHANGED');
      if (integrationTarget && !task.deliveryBranch) inspected = { ...inspected,branch_ref:`${inspected.branch_ref}-r${delivery.round}` };
      const plan: DeliveryTargetPlan = { operation_id:command.operationId,selection_operation_id:selectionOperationId,
        delivery_id:delivery.id,attempt_id:snapshot.status.id,repository_id:inspected.repository_id,local_path:inspected.local_path,
        local_identity:inspected.local_identity,branch_ref:inspected.branch_ref,task_type:inspected.task_type,task_description:inspected.task_description,
        issue_number:snapshot.capture.issue.number,base_branch:task.baseBranch,base_sha:delivery.baseSha,
        approved_ref:delivery.gitRef!,content_identity:delivery.contentIdentity! };
      target = storage.sealDeliveryTarget(plan);
    }
    const identity: EffectIdentity = previous?.expectedIdentity ?? (target ? {
      repositoryId: snapshot.capture.issue.repository.id,issueId: snapshot.capture.issue.id,contentIdentity: delivery.contentIdentity!,parentSha: target.local_identity.base_sha,
      branchRef: target.branch_ref,...(target.local_identity.branch_kind ? { branchKind:target.local_identity.branch_kind } : {}),issueNumber: snapshot.capture.issue.number,commitTime: Math.floor(Date.now()/1000),
      repositoryOwner:snapshot.capture.issue.repository.owner.login,repositoryName:snapshot.capture.issue.repository.name,
      baseBranch:target.base_branch,targetOperationId:target.operation_id,taskType:target.task_type,taskDescription:target.task_description,
    } : {
      repositoryId: snapshot.capture.issue.repository.id, issueId: snapshot.capture.issue.id,
      contentIdentity: delivery.contentIdentity!, parentSha: delivery.baseSha,
      branchRef: `refs/heads/factory/${snapshot.capture.issue.number}/${snapshot.status.id}`,
      issueNumber: snapshot.capture.issue.number, commitTime: Math.floor(Date.now() / 1000),
    });
    if (identity.targetOperationId && (!target || identity.targetOperationId !== target.operation_id || identity.branchRef !== target.branch_ref ||
      identity.taskType !== target.task_type || identity.taskDescription !== target.task_description)) blocked('DELIVERY_TARGET_IDENTITY_CONFLICT');
    const effect = storage.recordEffectIntent({ origin: { attemptId: snapshot.status.id, deliveryId: delivery.id }, kind: 'local_commit', scopeKey: delivery.id,
      expectedIdentity: identity, authorization: { accountId: snapshot.capture.accountId, mode: snapshot.mode, sourceOperationId: command.operationId } });
    if (!await observeAuthority(snapshot.status.id)) blocked('PUBLICATION_BLOCKED');
    supported();
    if (!storage.claimEffect(effect.operationId,effect.revision,command.operationId)) blocked('COMMIT_PENDING');
    const running = storage.getEffect(effect.operationId);
    let result;
    try {
      result = target && deps.workspaces.createTargetCommit
        ? await deps.workspaces.createTargetCommit(delivery,running,target,async () => {
          supported(); if (!await observeAuthority(snapshot.status.id)) blocked('PUBLICATION_BLOCKED');
          storage.assertPublicationEligible(snapshot.status.id,delivery.id,true); storage.assertDeliveryTarget(target!.operation_id);
        })
        : await deps.workspaces.createLocalCommit!(delivery,running,async () => {
        supported();
        if (!await observeAuthority(snapshot.status.id)) blocked('PUBLICATION_BLOCKED');
        storage.assertPublicationEligible(snapshot.status.id,delivery.id,true);
      });
    } catch { result = { state: 'unknown' as const, receipt: null, reason: 'COMMIT_TRANSPORT_LOST' }; }
    storage.finishEffect(running.operationId,running.revision,result.state,result.receipt,result.reason);
    if (!['confirmed','not_applicable'].includes(result.state)) blocked('COMMIT_PENDING');
  }
  function pullRequestBody(s: Snapshot): string {
    const d = s.delivery!; const review = storage.getReview(d.id)!;
    const safe = (value: string) => value.replace(/[<>\r\n]/g,' ').replace(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|merge|force-push)\b/gi,'[termo omitido]');
    const open = storage.getOpenFindings(s.status.id,d.round+1);
    if (open.length > 1000) blocked('PR_FINDING_LIMIT');
    const pending = open.filter(f => !f.blocking);
    const body = [`<!-- factory:pr:${s.settings.installation_id}:${s.status.id}:${d.id} -->`,
      '### Entrega aprovada da fábrica',`Escopo: ${safe(s.capture.issue.title)}`,`Issue: ${s.capture.issue.url}`,
      `Tentativa (attemptId): ${s.status.id}`,`Versão: ${d.id}`,`Base configurada: ${safe(s.capture.configuration.configuration.base_branch)} (${s.publicationBaseSha})`,
      `Base de comparação: ${d.baseSha}`,
      `Tree aprovada: ${d.contentIdentity}`,`Referência: ${d.gitRef}`,`Parecer: ${review.state}; revisão ${review.id}.`,
      'Critérios:',...review.criteria.map(c => `- ${c.criterionId}: ${c.verdict}.`),
      'Pendências não impeditivas:',...pending.map(f => `- ${f.id}: ${safe(f.problem)}; esperado: ${safe(f.expectedResult)}.`),
      ...(!pending.length ? ['- Nenhuma.'] : []),`Detalhes: GET /api/v1/deliveries/${d.id}`].join('\n');
    if (body.length > 60_000) blocked('PR_BODY_LIMIT');
    return body;
  }
  async function completeRemote(s: Snapshot, command: PublicationCommand): Promise<void> {
    const d = s.delivery!; const commit = s.effects.find(e => e.kind === 'local_commit' && e.deliveryId === d.id)!;
    const targetIdentity = commit.expectedIdentity;
    const body = commit.state === 'not_applicable' ? null : pullRequestBody(s);
    for (const kind of ['push','pull_request'] as const) {
      s = storage.getPublicationSnapshot(s.status.id,d.id);
      if (targetIdentity.targetOperationId && deps.workspaces.verifyDeliveryTarget) {
        const sealedTarget = storage.assertDeliveryTarget(targetIdentity.targetOperationId);
        await deps.workspaces.verifyDeliveryTarget(sealedTarget,{ attemptId:s.status.id,approvedRef:d.gitRef!,contentIdentity:d.contentIdentity!,repositoryRelative:d.repositoryRelative,
          issueNumber:s.capture.issue.number,issueTitle:s.capture.issue.title,repositoryId:s.capture.issue.repository.id,
          repositoryUrl:s.capture.issue.repository.url,baseBranch:sealedTarget.base_branch,baseSha:sealedTarget.local_identity.base_sha,sourceKind:sealedTarget.local_identity.source_kind });
      }
      const old = s.effects.find(e => e.kind === kind && e.deliveryId === d.id);
      if (old && ['confirmed','not_applicable'].includes(old.state)) continue;
      const identity: EffectIdentity = old?.expectedIdentity ?? { repositoryId: s.capture.issue.repository.id,issueId: s.capture.issue.id,contentIdentity: d.contentIdentity!,parentSha: targetIdentity.parentSha!,
        issueNumber: s.capture.issue.number,branchRef: targetIdentity.branchRef!,repositoryOwner: s.capture.issue.repository.owner.login,repositoryName: s.capture.issue.repository.name,
        ...(targetIdentity.targetOperationId ? { targetOperationId:targetIdentity.targetOperationId,taskType:targetIdentity.taskType,taskDescription:targetIdentity.taskDescription } : {}),
        ...(targetIdentity.branchKind ? { branchKind:targetIdentity.branchKind } : {}),
        baseBranch: s.capture.configuration.configuration.base_branch,
        ...(commit.receipt ? { commitSha: commit.receipt.id,commitOperationId: commit.operationId } : {}),
        ...(kind === 'pull_request' && body !== null ? { marker: body.split('\n')[0]!,bodyHash: hash(body),title: targetIdentity.targetOperationId ? `${targetIdentity.taskType}: ${targetIdentity.taskDescription} (#${s.capture.issue.number})` : `feat: deliver issue #${s.capture.issue.number}` } : {}) };
      if (kind === 'pull_request' && body !== null && identity.bodyHash !== hash(body)) blocked('PR_IDENTITY_CHANGED');
      if (commit.state !== 'not_applicable' && kind === 'pull_request') {
        if (!await send(s.status.id,kind,d.id,identity,command.operationId,body!)) blocked('PR_PENDING');
        continue;
      }
      const e = storage.recordEffectIntent({ origin: { attemptId: s.status.id,deliveryId: d.id },kind,scopeKey: d.id,expectedIdentity: identity,
        authorization: { accountId: s.capture.accountId,mode: 'pr',sourceOperationId: command.operationId } });
      if (!await observeAuthority(s.status.id)) blocked('PUBLICATION_BLOCKED');
      supported();
      if (!storage.claimEffect(e.operationId,e.revision,command.operationId)) blocked('EFFECT_UNRESOLVED');
      const running = storage.getEffect(e.operationId);
      if (commit.state === 'not_applicable') storage.finishEffect(e.operationId,running.revision,'not_applicable',null,'APPROVED_NO_DELTA');
      else {
        if (!deps.workspaces.pushApproved) { storage.finishEffect(e.operationId,running.revision,'failed_known',null,'PUSH_CONTEXT_UNAVAILABLE'); blocked('PUSH_CONTEXT_UNAVAILABLE'); }
        let result;
        try { result = await deps.workspaces.pushApproved!(d,running,s.capture.accountId,async () => {
          supported(); if (!await observeAuthority(s.status.id)) blocked('PUBLICATION_BLOCKED'); storage.assertEffectAuthorized(running.operationId,command.operationId);
        }); } catch { result = { state: 'unknown' as const,receipt: null,reason: 'PUSH_TRANSPORT_LOST' }; }
        storage.finishEffect(e.operationId,running.revision,result.state,result.receipt,result.reason);
        if (result.state !== 'confirmed') blocked('PUSH_PENDING');
      }
    }
  }
  async function completeMode(command: PublicationCommand): Promise<void> {
    const id = command.attemptId; const deliveryId = ('deliveryId' in command.body && command.body.deliveryId) || blocked('DELIVERY_REQUIRED');
    await reconcile(id);
    storage.assertPublicationEligible(id, deliveryId, true);
    if (!await observeAuthority(id)) blocked('PUBLICATION_BLOCKED');
    let snapshot = storage.getPublicationSnapshot(id, deliveryId);
    if (snapshot.effects.some(e => ['running','unknown'].includes(e.state))) blocked('EFFECT_UNRESOLVED');
    await deps.workspaces.verifyRetainedDelivery(snapshot.delivery!);
    if (snapshot.mode === 'icr') {
      const environment = await deps.workspaces.folderCapability(id);
      if (!environment.available && environment.reason !== 'NATIVE_OPEN_UNAVAILABLE') blocked('ICR_ENVIRONMENT_UNAVAILABLE');
      const resources = storage.getResources(id);
      if (!resources.entries.some(r => r.kind === 'implementation' && r.owned && !r.removed && r.launchState === 'ready')) blocked('ICR_ENVIRONMENT_UNAVAILABLE');
    }
    // Re-observe current authority after potentially slow Git IO, before sending a comment.
    if (!await observeAuthority(id)) blocked('PUBLICATION_BLOCKED');
    storage.assertPublicationEligible(id, deliveryId, true);
    snapshot = storage.getPublicationSnapshot(id, deliveryId);
    if (snapshot.mode !== 'icr') {
      await completeLocalCommit(snapshot,command);
      if (!await observeAuthority(id)) blocked('PUBLICATION_BLOCKED');
      storage.assertPublicationEligible(id,deliveryId,true);
      snapshot = storage.getPublicationSnapshot(id,deliveryId);
    }
    // The check-mark plan is recorded before the comment, which reports the approved criteria left unchecked.
    const skipped = await recordIssueBodyPlan(snapshot, command);
    snapshot = storage.getPublicationSnapshot(id, deliveryId);
    if (snapshot.mode === 'pr') await completeRemote(snapshot,command);
    else if (!snapshot.effects.some(e => e.kind === 'issue_comment' && e.deliveryId === deliveryId && e.state === 'confirmed')) {
    const old = snapshot.effects.find(e => e.kind === 'issue_comment' && e.deliveryId === deliveryId);
    // A comment recorded before check marks existed keeps its original body.
    const body = [commentBody(snapshot, skipped), commentBody(snapshot)].find(candidate => !old || old.expectedIdentity.bodyHash === hash(candidate)) ?? commentBody(snapshot, skipped);
    const identity: EffectIdentity = old?.expectedIdentity ?? { repositoryId: snapshot.capture.issue.repository.id, issueId: snapshot.capture.issue.id,
      contentIdentity: snapshot.delivery!.contentIdentity!, marker: body.split('\n')[0]!, bodyHash: hash(body) };
    if (identity.bodyHash !== hash(body)) blocked('COMMENT_IDENTITY_CHANGED');
    if (!await send(id, 'issue_comment', deliveryId, identity, command.operationId, body)) blocked('COMMENT_PENDING');
    }
    await markIssueBody(id, deliveryId, command);
    if (!await observeAuthority(id)) blocked('PUBLICATION_BLOCKED');
    snapshot = storage.getPublicationSnapshot(id, deliveryId);
    storage.finalizeICR(id, deliveryId, snapshot.stamp, true);
    if (!await projectStage(id, 'delivered', command.operationId)) blocked('PROJECTION_PENDING');
    const pending = storage.getEffects(id).some(e => ['running','unknown'].includes(e.state) || (e.kind === 'project_status' && e.expectedIdentity.optionId === snapshot.capture.configuration.configuration.github_project?.status_option_ids.delivered && e.state !== 'confirmed'));
    if (pending) blocked('PROJECTION_PENDING');
  }
  function schedule(command: PublicationCommand): void {
    deps.enqueue(async () => {
      if (active.has(command.attemptId)) { storage.finishPublicationRequest(command.operationId, 'failed', 'PUBLICATION_BUSY'); return; }
      active.add(command.attemptId);
      try {
        supported();
        let targetPending = false;
        if (command.kind === 'publication.complete' || command.kind === 'publication.authorize-upgrade') await completeMode(command);
        else if (command.kind === 'publication.reconcile' && 'deliveryId' in command.body) { targetPending = await targets.reconcile(command.attemptId,command.body.deliveryId); await reconcile(command.attemptId); }
        else {
          await deps.reconcileResources?.(command.attemptId);
          if (!await observeAuthority(command.attemptId)) blocked('PUBLICATION_BLOCKED');
        }
        const unknown = targetPending || storage.getEffects(command.attemptId).some(e => ['running','unknown'].includes(e.state));
        storage.finishPublicationRequest(command.operationId, unknown ? 'unknown' : 'succeeded', unknown ? 'EFFECT_UNRESOLVED' : null);
      } catch (error) {
        const code = error instanceof OperationError || error instanceof CaptureError ? error.code : 'PUBLICATION_FAILED';
        if (code === 'INTEGRATION_REVIEW_PENDING') {
          storage.finishPublicationRequest(command.operationId,'succeeded',code); return;
        }
        const unknown = storage.getEffects(command.attemptId).some(e => ['running','unknown'].includes(e.state));
        storage.finishPublicationRequest(command.operationId, unknown ? 'unknown' : 'failed', code);
        deps.logFailure(code);
      } finally { active.delete(command.attemptId); }
    });
  }
  function accept(command: PublicationCommand) {
    const old = storage.recoverPublication(command); if (old) return old;
    supported(); const accepted = storage.acceptPublication(command);
    if (accepted.created) schedule(command);
    return accepted.operation;
  }
  return {
    selectTarget: targets.select,
    observeAuthority, projectStage,
    async observeControllerAccount(): Promise<boolean> {
      supported(); const settings = storage.getSettings(); const identity = await github.getIdentity();
      const observed = identity.state === 'complete' ? identity.data?.id ?? null : null;
      storage.recordControllerAccount(settings.revision,observed);
      return observed !== null && observed === settings.account_id;
    },
    complete: (attemptId: string, body: CompletePublication, context: { operationId: string; expectedRevision: string | undefined }) => accept({ ...context, attemptId, body, kind: 'publication.complete' }),
    reconcile: (attemptId: string, body: ReconcilePublication, context: { operationId: string; expectedRevision: string | undefined }) => accept({ ...context, attemptId, body, kind: 'publication.reconcile' }),
    async authorizeUpgrade(attemptId: string, body: AuthorizeUpgrade, context: { operationId: string; expectedRevision: string | undefined }) {
      const command: PublicationCommand = { ...context,attemptId,body,kind: 'publication.authorize-upgrade' };
      const old = storage.recoverPublication(command); if (old) return old;
      supported();
      const status = storage.getAttempt(attemptId);
      if (context.expectedRevision === undefined) throw new OperationError(428,'PRECONDITION_REQUIRED','If-Match is required.');
      if (context.expectedRevision !== `"${status.id}:${status.revision}"`) throw new OperationError(412,'REVISION_CONFLICT','The attempt changed.');
      const summary = storage.getPublicationSummary(attemptId,body.deliveryId);
      const upgrade = summary.upgrades?.find(u => u.targetMode === body.targetMode);
      if (summary.mode !== body.currentMode || !upgrade) throw new OperationError(409,'MODE_UPGRADE_NOT_ALLOWED','Only a strictly higher mode for the current finished approved version can be authorized.');
      if (!upgrade.capability.available) throw new OperationError(409,'PUBLICATION_BLOCKED',`Publication is blocked: ${upgrade.capability.reason_code ?? 'PUBLICATION_BLOCKED'}.`);
      if (upgrade.summaryHash !== body.authorizedAdditionalEffectsHash) throw new OperationError(409,'MODE_UPGRADE_NOT_ALLOWED','The additional effects summary changed. Reload the delivery before authorizing.');
      if (!await observeAuthority(attemptId)) throw new OperationError(409,'PUBLICATION_BLOCKED',`Publication is blocked: ${storage.getAttempt(attemptId).suspension ?? 'AUTHORITY_UNAVAILABLE'}.`);
      storage.assertPublicationEligible(attemptId,body.deliveryId,true);
      try {
        await deps.workspaces.verifyRetainedDelivery(storage.getDelivery(body.deliveryId).delivery);
      } catch { deps.logFailure('UPGRADE_VERSION_UNAVAILABLE'); throw new OperationError(409,'PUBLICATION_BLOCKED','The retained version cannot be verified.'); }
      if (!await observeAuthority(attemptId)) blocked('PUBLICATION_BLOCKED');
      return accept(command);
    },
    revalidate: (attemptId: string, context: { operationId: string; expectedRevision: string | undefined }) => accept({ ...context, attemptId, body: {}, kind: 'attempt.revalidate' }),
    async publishApproved(deliveryId: string): Promise<void> {
      const d = storage.getDelivery(deliveryId).delivery; const a = storage.getAttempt(d.attemptId);
      if (a.result || a.suspension || storage.getReview(deliveryId)?.state !== 'approved') return;
      await targets.ensureCaptured(deliveryId);
      const mode = storage.getPublicationSummary(a.id,deliveryId).mode;
      const current = storage.getAttempt(a.id);
      accept({ operationId: randomUUID(), attemptId: a.id, expectedRevision: `"${a.id}:${current.revision}"`, kind: 'publication.complete', body: { deliveryId, authorizedMode: mode, authorized: true } });
    },
  };
}
export type Publication = ReturnType<typeof createPublication>;
