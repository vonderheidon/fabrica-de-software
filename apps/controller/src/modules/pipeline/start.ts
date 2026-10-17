import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Value } from '@sinclair/typebox/value';
import { PreparedWorkspace, RoleResourceReference, StartAttempt, type AttemptCapture, type ExecutionProfile, type PassageRequest, type ToolObservation, type PassageBinding, type QueueQuery, type QueueItem, type QueueObservation } from '#contracts';
import { OperationError, type AttemptCommand, type AnswerCommand, type CaptureClaim, type RetryCaptureCommand, type Storage } from '../storage/index.js';
import type { GitHub } from '../github/index.js';
import { interpretIssue, preparationDigest } from './criteria.js';
import { ExecutionError, type Execution } from '../execution/index.js';
import type { Preparations } from '../projects/index.js';
import type { Workspaces } from '../workspaces/index.js';
import { CaptureError } from '../workspaces/index.js';
import type { DeliveryDiffQuery } from '#contracts';
import { VerificationError, type Verification } from '../verification/index.js';
import { createRecovery } from './recovery.js';
import { createPublication, type PublicationDependencies } from '../publication/index.js';
import type { AuthorizeUpgrade, CompletePublication, ReconcilePublication } from '#contracts';

export interface PipelineDependencies {
  github?: Pick<GitHub, 'getIssueContextById'>;
  storage: Storage; preparations: Pick<Preparations, 'revalidateSummary' | 'createPreparation' | 'getPreparation'>; execution: Execution;
  queue?: { observe: (query: QueueQuery) => Promise<{ observation: QueueObservation; etag: string; items: readonly QueueItem[] }> };
  workspaces: Pick<Workspaces, 'prepareAttempt'> & Partial<Pick<Workspaces, 'captureDelivery' | 'getDeliveryDiff' | 'materializeReview' | 'inspectEnvironment' | 'removeEnvironment' | 'folderCapability' | 'openEnvironment'>>;
  observeTools: () => Promise<ToolObservation[]>;
  verification?: Verification;
  publication?: Pick<PublicationDependencies, 'github' | 'workspaces' | 'verification'>;
  hostName?: string;
  logFailure: (code: string) => void;
}
function profile(value: ExecutionProfile): ExecutionProfile {
  const { name, executor, provider, model, effort, guidance } = value;
  return { name, executor, provider, model, effort, guidance };
}
export function createPipeline(deps: PipelineDependencies) {
  const { storage, execution, preparations, workspaces } = deps;
  const pending = new Set<Promise<void>>(); const abort = new AbortController(); let closed = false;
  let queueDispatching = false; let nextQueuePollAt = 0;
  const attemptSignals = new Map<string, AbortController>();
  // Only live, not-yet-dispatched continuations. Restart deliberately discards these closures.
  const waitingForAuthority = new Map<string, () => Promise<void>>();
  function signalFor(id: string) {
    let controller = attemptSignals.get(id);
    if (!controller) { controller = new AbortController(); attemptSignals.set(id, controller); }
    return AbortSignal.any([abort.signal, controller.signal]);
  }
  let scopePolling = false;
  let lastScopePoll = 0;
  const scopeReads = new Map<string, Promise<boolean>>();
  async function revalidateScope(binding: PassageBinding): Promise<boolean> {
    const prior = scopeReads.get(binding.passageId); if (prior) return prior;
    const reading = (async () => {
      const status = storage.getAttempt(binding.attemptId);
      if (closed || status.result || status.suspension) return false;
      if (!deps.github) throw new OperationError(503, 'SCOPE_OBSERVATION_UNAVAILABLE', 'The current issue criteria cannot be observed.');
      const capture = storage.getAttemptCapture(binding.attemptId);
      const response = await deps.github.getIssueContextById(capture.issue.id);
      if (closed) return false;
      if (response.state !== 'complete' || !response.data || !('body' in response.data) || response.data.id !== capture.issue.id || response.data.repository.id !== capture.issue.repository.id) {
        throw new OperationError(503, 'SCOPE_OBSERVATION_UNAVAILABLE', 'A complete observation of the captured issue is required.');
      }
      const preview = interpretIssue(response.data);
      // This compares the parsed, identified criteria only. No semantic classifier and no comment adoption.
      if (preview.executable && preview.digest === capture.criteriaDigest) return true;
      const now = storage.getAttempt(binding.attemptId);
      if (closed || now.result || now.suspension) return false;
      const question = { formatVersion: 1 as const, decision: 'Manter o escopo capturado ou adotar novos critérios em outra tentativa?',
        context: `Os critérios atuais da issue diferem da captura ${capture.criteriaDigest}. Observação atual: ${preview.digest}. A captura histórica permanece válida e não será substituída.`,
        alternatives: ['Manter os IDs e textos dos critérios capturados nesta tentativa.', 'Atualizar a issue no GitHub e preparar outra tentativa para os novos critérios.'] };
      const record = storage.executionPersistence().raiseQuestion({ binding, question, sha256: preparationDigest(question), scopeChange: {
        capturedCriteria: capture.criteria, currentCriteria: preview.criteria, capturedDigest: capture.criteriaDigest, currentDigest: preview.digest,
        reasons: preview.reasons, observedAtMs: Date.now(),
      } });
      // A delivered decision for this exact observed change authorizes the captured scope only.
      return storage.getQuestion(binding.attemptId, record.questionId).view.state === 'delivered';
    })().finally(() => scopeReads.delete(binding.passageId));
    scopeReads.set(binding.passageId, reading); return reading;
  }
  async function startAttempt(body: StartAttempt, context: Omit<AttemptCommand, 'body'>, queueCycle?: { accountId: string; projectId: string; issueId: string; cycleNumber: number }) {
    if (!Value.Check(StartAttempt, body)) throw new OperationError(400, 'START_INVALID', 'The start request is invalid.');
    const command = { ...context, body };
    const recovered = storage.recoverAttempt(command); if (recovered) return recovered;
    if (closed) throw new OperationError(503, 'PIPELINE_CLOSED', 'The controller is shutting down.');
    if (context.expectedRevision === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
    const saved = storage.getPreparation(body.preparationId);
    if (saved.etag !== context.expectedRevision) throw new OperationError(412, 'REVISION_CONFLICT', 'The preparation changed.');
    const config = storage.getConfiguration(saved.view.projectId);
    if (publication && !await publication.observeControllerAccount()) throw new OperationError(409, 'ACCOUNT_CHANGED', 'Dispatch is paused until the configured account is observed.');
    const current = await preparations.revalidateSummary(body); const p = current.view.preparation;
    const reasons = p.prerequisites.filter(r => r.code !== 'EXECUTOR_REVALIDATION_REQUIRED');
    if (reasons.length || !p.issue || !p.baseSha || !p.criteriaPreview.executable || !config.view.settings.accountId ||
      !p.effectiveConfiguration.implementerProfile || !p.effectiveConfiguration.reviewerProfile) {
      throw new OperationError(409, 'START_PREREQUISITES', 'The issue, committed base, account and configuration must satisfy all start prerequisites.');
    }
    if ((deps.hostName ?? hostname()).toLowerCase() !== config.view.settings.designatedHost?.toLowerCase()) throw new OperationError(409, 'EXECUTOR_HOST_MISMATCH', 'Start the controller on the designated executor host.');
    const roleResources = execution.roleResources();
    if (roleResources.length !== 2 || roleResources.some(r => !Value.Check(RoleResourceReference, r) || r.id !== `factory.${r.role}`) || new Set(roleResources.map(r => r.role)).size !== 2) {
      throw new OperationError(503, 'ROLE_RESOURCE_REQUIRED', 'Both distributed versioned role contracts are required before dispatch.');
    }
    const tools = await deps.observeTools();
    const capture: AttemptCapture = { formatVersion: 1, preparationId: p.id, preparationRevision: p.revision, summaryHash: p.summaryHash,
      accountId: config.view.settings.accountId, issue: p.issue, baseSha: p.baseSha, configuration: p.effectiveConfiguration,
      criteria: p.criteriaPreview.criteria, criteriaDigest: p.criteriaPreview.digest, roleResources, tools };
    const accepted = storage.createAttempt({ command, capture, configurationETag: config.etag, preparationETag: current.etag, ...(queueCycle ? { queueCycle } : {}) });
    if (accepted.created) schedule(accepted.operation.resource.id);
    return accepted.operation;
  }
  async function dispatchQueueCandidate(): Promise<void> {
    if (!deps.queue || queueDispatching || closed) return;
    if (Date.now() < nextQueuePollAt) return;
    queueDispatching = true;
    nextQueuePollAt = Date.now() + storage.getSettings().timeDefaults.pollingIntervalMs;
    try {
      if (publication && !await publication.observeControllerAccount()) return;
      const scan = await deps.queue.observe({ limit: '100' });
      nextQueuePollAt = Math.max(nextQueuePollAt, scan.observation.polling.nextPollAtMs);
      if (closed || !scan.observation.complete || !scan.observation.valid || !scan.observation.account.id) return;
      storage.recordQueueObservations(scan.items.filter(item => item.kind === 'issue' && item.issueId !== null && !item.reasons.includes('PROJECT_MEMBERSHIP_MISSING')).map(item => ({
        accountId: scan.observation.account.id!, projectId: item.projectId, issueId: item.issueId!, ready: item.ready, eligible: item.readyEligible, existingAttemptId: item.attemptId,
      })));
      if (!scan.observation.enabled) return;
      const current = await deps.queue.observe({ limit: '100' });
      nextQueuePollAt = Math.max(nextQueuePollAt, current.observation.polling.nextPollAtMs);
      if (closed || !current.observation.enabled || !current.observation.complete || !current.observation.valid || current.observation.account.id !== scan.observation.account.id) return;
      const candidate = current.items.find(item => item.eligible && item.issueId !== null);
      if (!candidate?.issueId) return;
      const cycle = storage.getQueueCycle(current.observation.account.id, candidate.projectId, candidate.issueId);
      if (!cycle || cycle.consumedAttemptId !== null || !cycle.ready) return;
      const mode = current.observation.modesByProject.find(item => item.projectId === candidate.projectId)?.mode;
      if (!mode) return;
      const preparation = await preparations.createPreparation(candidate.projectId, { issueId: candidate.issueId, deliveryMode: mode, guidance: '', overrides: {} },
        { operationId: randomUUID(), expectedRevision: undefined });
      if (closed || !storage.getSettings().automationEnabled || !storage.getConfiguration(candidate.projectId).view.configuration.automationEnabled) return;
      const prepared = await preparations.getPreparation(preparation.view.preparation.id);
      await startAttempt({ preparationId: prepared.view.preparation.id, preparationRevision: prepared.view.preparation.revision,
        authorizedSummaryHash: prepared.view.preparation.summaryHash, authorized: true }, { operationId: randomUUID(), expectedRevision: prepared.etag },
        { accountId: current.observation.account.id!, projectId: candidate.projectId, issueId: candidate.issueId, cycleNumber: cycle.cycleNumber });
    } catch (error) {
      deps.logFailure(error instanceof OperationError ? error.code : 'QUEUE_DISPATCH_FAILED');
    } finally {
      queueDispatching = false;
    }
  }
  async function tick(): Promise<void> {
    if (closed) return;
    for (const attemptId of storage.expireLimits()) {
      // Expiration revokes advancement. The executor records the actual stop receipt separately.
      await execution.cancelAttempt(attemptId, randomUUID());
    }
    if (scopePolling) return;
    if (deps.github && Date.now() - lastScopePoll >= storage.getSettings().timeDefaults.pollingIntervalMs) {
      scopePolling = true; lastScopePoll = Date.now();
      try {
        if (publication) for (const id of storage.getAuthorityCandidates()) await publication.observeAuthority(id);
        for (const [id, next] of waitingForAuthority) {
          const a = storage.getAttempt(id);
          if (a.result) waitingForAuthority.delete(id);
          else if (!a.suspension || a.suspension === 'VERIFICATION_FAILED') { waitingForAuthority.delete(id); enqueue(next); }
        }
        for (const binding of storage.getScopeCandidates()) await revalidateScope(binding);
      }
      finally { scopePolling = false; }
    }
    await dispatchQueueCandidate();
  }
  const timer = setInterval(() => enqueue(tick), 1000); timer.unref();
  let closing: Promise<void> | undefined;
  function enqueue(action: () => Promise<void>): void {
    const task = new Promise<void>(resolve => setImmediate(resolve)).then(action).catch((error: unknown) => {
      deps.logFailure(error instanceof OperationError || error instanceof CaptureError || error instanceof VerificationError || error instanceof ExecutionError ? error.code : 'PIPELINE_EFFECT_FAILED');
    }).finally(() => { pending.delete(task); });
    pending.add(task);
  }
  const recovery = createRecovery(deps, enqueue, id => { signalFor(id); attemptSignals.get(id)?.abort(); }, () => closed);
  const publication = deps.publication ? createPublication({ ...deps.publication, storage, enqueue, isClosed: () => closed, logFailure: deps.logFailure,
    cancelAttempt: async id => { await recovery.cancelAttempt(id, {}, { operationId: randomUUID(), expectedRevision: undefined }); } }) : null;
  async function review(deliveryId: string): Promise<void> {
    if (closed) return;
    const observed = storage.getDelivery(deliveryId);
    if (observed.verification && ['running', 'error'].includes(observed.verification.state)) return;
    if (publication && !await publication.observeAuthority(observed.delivery.attemptId,'inReview')) {
      waitingForAuthority.set(observed.delivery.attemptId,() => review(deliveryId)); return;
    }
    const claimed = storage.beginReview(deliveryId); if (!claimed) return;
    await launchReview(claimed);
  }
  async function launchReview(claimed: NonNullable<ReturnType<Storage['beginReview']>>): Promise<void> {
    const deliveryId = claimed.deliveryId;
    try {
      if (publication && !await publication.projectStage(claimed.attemptId, 'inReview')) {
        waitingForAuthority.set(claimed.attemptId,() => launchReview(claimed)); return;
      }
      if (!workspaces.materializeReview) throw new CaptureError('REVIEW_MATERIALIZATION_UNAVAILABLE');
      const delivery = storage.getDelivery(deliveryId).delivery;
      const capture = storage.getAttemptCapture(delivery.attemptId);
      const cwd = await workspaces.materializeReview(delivery, claimed.id);
      storage.recordReviewWorkspace(deliveryId, true, null);
      const launch = async (): Promise<void> => {
        if (publication && !await publication.observeAuthority(delivery.attemptId,'inReview')) {
          waitingForAuthority.set(delivery.attemptId,launch); return;
        }
        const current = storage.getAttempt(delivery.attemptId);
        if (closed || current.result || current.suspension || current.deliveryId !== delivery.id) return;
        const passage = storage.executionPersistence().getPassage({ passageId: claimed.passageId });
        const reviewer = capture.configuration.reviewerProfile; if (!reviewer) throw new ExecutionError('RESOURCE_INVALID');
        const findings = storage.getOpenFindings(delivery.attemptId, delivery.round);
        // Only structured scope, criteria, version, checks and findings. No implementer conversation.
        await execution.startPassage({ binding: passage.binding, cwd, profile: profile(reviewer), criterionIds: capture.criteria.map(c => c.id),
          previousFindingKeys: findings.map(f => f.id), previousBlockingFindingKeys: findings.filter(f => f.blocking).map(f => f.id), gitNexusRequired: false, roleResource: passage.roleResource,
          task: JSON.stringify({ formatVersion: 1, issue: { id: capture.issue.id, title: capture.issue.title, body: capture.issue.body },
            criteria: capture.criteria, delivery, verification: storage.getDelivery(deliveryId).verification,
            checks: storage.getCheckHistory(deliveryId, { limit: '100' }).entries.filter(c => c.verificationId === claimed.verificationId),
            findings, guidance: capture.configuration.guidance, profileGuidance: reviewer.guidance,
            authority: 'Review this immutable version independently. Never change product content. Resolve each prior finding using findingKey equal to its supplied id. A rejection needs concrete criterion evidence or an actionable blocking finding.' }) }, signalFor(delivery.attemptId));
      };
      await launch();
    } catch (error) {
      const code = error instanceof CaptureError || error instanceof ExecutionError ? error.code : 'REVIEW_DISPATCH_FAILED';
      storage.recordReviewWorkspace(deliveryId, false, code);
      storage.recordDispatchFailure(claimed.attemptId, code); throw error;
    }
  }
  async function correct(deliveryId: string): Promise<void> {
    if (closed) return;
    const attemptId = storage.getDelivery(deliveryId).delivery.attemptId;
    if (publication && !await publication.observeAuthority(attemptId,'inProgress')) {
      waitingForAuthority.set(attemptId,() => correct(deliveryId)); return;
    }
    let plan;
    try { plan = storage.beginCorrection(deliveryId); }
    catch (error) {
      storage.recordDispatchFailure(storage.getDelivery(deliveryId).delivery.attemptId,
        error instanceof OperationError ? error.code : 'CORRECTION_PERSISTENCE_FAILED');
      throw error;
    }
    if (!plan) return;
    await launchCorrection(plan);
  }
  async function launchCorrection(plan: NonNullable<ReturnType<Storage['beginCorrection']>>): Promise<void> {
    const deliveryId = plan.review.deliveryId;
    try {
      if (publication && !await publication.projectStage(plan.review.attemptId, 'inProgress')) {
        waitingForAuthority.set(plan.review.attemptId,() => launchCorrection(plan)); return;
      }
      const capture = storage.getAttemptCapture(plan.review.attemptId);
      const p = storage.executionPersistence().getPassage({ passageId: plan.passageId });
      const implementer = capture.configuration.implementerProfile; if (!implementer) throw new ExecutionError('RESOURCE_INVALID');
      // Runtime owns and verifies the cwd and session; continuation cannot recruit a replacement.
      await execution.continuePassage({ passageId: plan.sourcePassageId }, { binding: p.binding, profile: profile(implementer),
        criterionIds: capture.criteria.map(c => c.id), previousFindingKeys: plan.findings.map(f => f.id), gitNexusRequired: false, roleResource: p.roleResource,
        task: JSON.stringify({ formatVersion: 1, round: p.binding.round, maximumRound: 1 + capture.configuration.configuration.correctionLimit,
          review: plan.review, findings: plan.findings, criteria: capture.criteria,
          checks: storage.getCheckHistory(deliveryId, { limit: '100' }).entries.filter(c => c.verificationId === plan.review.verificationId),
          authority: 'Correct the supplied review in this same implementation checkout and session. Report findingResponses for every supplied finding id. Stop all owned writers before execution_complete. This creates a new captured delivery and independent review.' }) });
    } catch (error) {
      storage.recordDispatchFailure(plan.review.attemptId, error instanceof ExecutionError ? error.code : 'CORRECTION_DELIVERY_UNKNOWN'); throw error;
    }
  }
  async function capture(claim: CaptureClaim): Promise<void> {
    let content;
    try {
      if (closed) throw new CaptureError('CAPTURE_CONTINUITY_REVOKED');
      if (!workspaces.captureDelivery) throw new CaptureError('CONTEXT_UNAVAILABLE');
      content = await workspaces.captureDelivery(claim.input);
    } catch (error) {
      const code = error instanceof CaptureError ? error.code : 'CAPTURE_FAILED';
      storage.finishCapture(claim, null, code); deps.logFailure(code); return;
    }
    // Persist metadata only after the retained ref, parent/base and tree have been verified.
    try { storage.finishCapture(claim, content, null); }
    catch (error) {
      // The Git ref may already exist. Keep it and make the failure recoverable without overwriting it.
      storage.finishCapture(claim, null, 'CAPTURE_PERSISTENCE_FAILED');
      throw error;
    }
    if (deps.verification && !closed && storage.getDelivery(claim.deliveryId).delivery.captureState === 'captured') {
      await verifyAndReview(claim.deliveryId);
    }
  }
  async function verifyAndReview(deliveryId: string): Promise<void> {
    if (closed || !deps.verification) return;
    const id = storage.getDelivery(deliveryId).delivery.attemptId;
    if (publication && !await publication.observeAuthority(id)) {
      waitingForAuthority.set(id,() => verifyAndReview(deliveryId)); return;
    }
    await deps.verification.verifyDelivery(deliveryId,signalFor(id));
    await review(deliveryId);
  }
  const unsubscribe = storage.onResultAccepted(binding => {
    if (closed) return;
    enqueue(async () => { if (closed) return;
      if (binding.role === 'reviewer') {
        if (publication && storage.getReview(binding.deliveryVersion)?.state === 'approved') await publication.publishApproved(binding.deliveryVersion);
        else await correct(binding.deliveryVersion);
        return;
      }
      const claim = storage.beginCapture(binding.deliveryVersion); if (claim) await capture(claim);
    });
  });
  async function dispatch(id: string): Promise<void> {
    const status = storage.getAttempt(id); const capture = storage.getAttemptCapture(id);
    if (closed || status.suspension || status.result) return;
    if (publication && !await publication.observeAuthority(id)) { waitingForAuthority.set(id,() => dispatch(id)); return; }
    storage.recordWorkspace(id, 'starting', false, null);
    const workspace = await workspaces.prepareAttempt({ attemptId: id, issueNumber: capture.issue.number,
      source: capture.configuration.configuration.source, baseSha: capture.baseSha });
    if (!Value.Check(PreparedWorkspace, workspace) || workspace.attemptId !== id || workspace.baseSha !== capture.baseSha ||
      workspace.branch !== `factory/${capture.issue.number}/${id}` || (workspace.state === 'prepared' && !workspace.resource.owned)) {
      throw new ExecutionError('RESOURCE_INVALID');
    }
    storage.recordWorkspace(id, workspace.state === 'prepared' ? 'ready' : 'failed', workspace.resource.owned, workspace.diagnostic?.code ?? null);
    if (workspace.state !== 'prepared' || closed || storage.getAttempt(id).result) return;
    // Revalidate authority again after clone; never silently adopt a new base or new summary.
    await preparations.revalidateSummary({ preparationId: capture.preparationId, preparationRevision: capture.preparationRevision, authorizedSummaryHash: capture.summaryHash });
    const launch = async (): Promise<void> => {
      if (publication && !await publication.projectStage(id, 'inProgress')) { waitingForAuthority.set(id,launch); return; }
      const current = storage.getAttempt(id);
      if (closed || current.result || current.suspension) return;
      const passage = storage.executionPersistence().getPassage({ passageId: status.passageId });
      const implementer = capture.configuration.implementerProfile;
      if (!implementer) throw new ExecutionError('RESOURCE_INVALID');
      const request: PassageRequest = { binding: passage.binding, profile: profile(implementer), cwd: workspace.resource.path,
        criterionIds: capture.criteria.map(c => c.id), previousFindingKeys: [], gitNexusRequired: false, roleResource: passage.roleResource,
        task: JSON.stringify({ formatVersion: 1, issue: { id: capture.issue.id, title: capture.issue.title, url: capture.issue.url },
          objective: capture.issue.body, criteria: capture.criteria, baseSha: capture.baseSha,
          guidance: capture.configuration.guidance, profileGuidance: implementer.guidance, checks: capture.configuration.configuration.checks,
          deliveryMode: capture.configuration.configuration.defaultDeliveryMode,
          authority: 'Implement in the owned checkout. Stop all owned product writers before execution_complete. Publication is performed only by the controller.' }) };
      await execution.startPassage(request, signalFor(id));
    };
    await launch();
  }
  function schedule(id: string): void {
    const task = new Promise<void>(resolve => setImmediate(resolve)).then(() => dispatch(id)).catch((error: unknown) => {
      const code = error instanceof ExecutionError || error instanceof OperationError ? error.code : 'DISPATCH_FAILED';
      try { storage.recordDispatchFailure(id, code); } catch { deps.logFailure('DISPATCH_PERSISTENCE_FAILED'); }
      deps.logFailure(code);
    }).finally(() => { pending.delete(task); });
    pending.add(task);
  }
  return {
    ...recovery,
    completePublication(id: string, body: CompletePublication, context: { operationId: string; expectedRevision: string | undefined }) {
      if (!publication) throw new OperationError(503, 'PUBLICATION_UNAVAILABLE', 'Publication is not composed in this host.');
      return publication.complete(id, body, context);
    },
    authorizePublicationUpgrade(id: string, body: AuthorizeUpgrade, context: { operationId: string; expectedRevision: string | undefined }) {
      if (!publication) throw new OperationError(503, 'PUBLICATION_UNAVAILABLE', 'Publication is not composed in this host.');
      return publication.authorizeUpgrade(id,body,context);
    },
    reconcilePublication(id: string, body: ReconcilePublication, context: { operationId: string; expectedRevision: string | undefined }) {
      if (!publication) throw new OperationError(503, 'PUBLICATION_UNAVAILABLE', 'Publication is not composed in this host.');
      return publication.reconcile(id, body, context);
    },
    revalidateAuthority(id: string, context: { operationId: string; expectedRevision: string | undefined }) {
      if (!publication) throw new OperationError(503, 'PUBLICATION_UNAVAILABLE', 'Authority observation is not composed in this host.');
      return publication.revalidate(id, context);
    },
    revalidateScope,
    tick,
    async answerQuestion(command: AnswerCommand) {
      const old = storage.recoverAnswer(command); if (old) return old;
      if (closed) throw new OperationError(503, 'PIPELINE_CLOSED', 'The controller is shutting down.');
      storage.expireLimits();
      const operation = storage.recordAnswer(command);
      const question = storage.getQuestion(command.attemptId, command.questionId).view;
      enqueue(async () => {
        if (closed) return;
        try { await execution.answerQuestion({ passageId: question.passageId }, question.id, command.body.answer, command.operationId); }
        catch (error) { storage.markAnswerUnknown(command); throw error; }
      });
      return operation;
    },
    async verifyDelivery(deliveryId: string) {
      if (closed || !deps.verification) throw new OperationError(503, 'VERIFICATION_UNAVAILABLE', 'Verification is unavailable.');
      const task = deps.verification.verifyDelivery(deliveryId, signalFor(storage.getDelivery(deliveryId).delivery.attemptId)).then(() => review(deliveryId)).finally(() => pending.delete(task));
      pending.add(task);
      await task;
    },
    async getArtifact(id: string) {
      if (!deps.verification) throw new OperationError(503, 'VERIFICATION_UNAVAILABLE', 'Artifact storage is unavailable.');
      try { return await deps.verification.getArtifact(id); }
      catch (error) {
        if (error instanceof VerificationError) throw new OperationError(error.code === 'ARTIFACT_MISSING' ? 404 : error.code === 'ARTIFACT_INTEGRITY_FAILED' ? 409 : 503, error.code, 'The check evidence could not be verified.');
        throw error;
      }
    },
    async retryCapture(command: RetryCaptureCommand) {
      const previous = storage.recoverCaptureRetry(command); if (previous) return previous;
      if (closed) throw new OperationError(409, 'CAPTURE_RETRY_NOT_ALLOWED', 'Capture continuity was revoked.');
      const accepted = storage.retryCapture(command);
      if (accepted.claim) { const claim = accepted.claim; enqueue(() => capture(claim)); }
      return accepted.operation;
    },
    async getDeliveryDiff(id: string, query: DeliveryDiffQuery) {
      const view = storage.getDelivery(id);
      if (!workspaces.getDeliveryDiff) throw new OperationError(503, 'CONTEXT_UNAVAILABLE', 'The authorized Git context is unavailable.');
      try { return await workspaces.getDeliveryDiff(view.delivery, query); }
      catch (error) {
        if (error instanceof CaptureError) {
          const status = error.code === 'DIFF_CURSOR_INVALID' || error.code === 'DIFF_INPUT_INVALID' ? 400 :
            ['CONTEXT_UNAVAILABLE', 'DELIVERY_GIT_UNAVAILABLE', 'DELIVERY_IO_FAILED'].includes(error.code) ? 503 : 409;
          throw new OperationError(status, error.code, 'The retained delivery diff could not be read.');
        }
        throw new OperationError(503, 'DELIVERY_IO_FAILED', 'The retained delivery is unavailable.');
      }
    },
    startAttempt: (body: StartAttempt, context: Omit<AttemptCommand, 'body'>) => startAttempt(body, context),
    close() {
      if (!closing) {
        closed = true; clearInterval(timer); unsubscribe(); abort.abort(); waitingForAuthority.clear();
        closing = (async () => {
          try {
            // Revoke channels/answer waits before draining work that may await them.
            const outcomes = await Promise.allSettled([execution.close(), (async () => {
              await Promise.all([...pending]);
              const observations = await Promise.allSettled([...scopeReads.values()]);
              if (observations.some(result => result.status === 'rejected')) deps.logFailure('SCOPE_OBSERVATION_UNAVAILABLE');
            })()]);
            if (outcomes.some(result => result.status === 'rejected')) throw new ExecutionError('TRACKING_LOST');
          }
          finally { storage.interruptAttempts(); }
        })();
      }
      return closing;
    },
    async drain() { while (pending.size) await Promise.all([...pending]); },
  };
}
export type Pipeline = ReturnType<typeof createPipeline>;
