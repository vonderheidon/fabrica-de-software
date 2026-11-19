import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { PreparedWorkspace, RoleResourceReference, StartAttempt, type AttemptCapture, type AttemptWorkspaceBinding, type AttemptWorkspaceSnapshot, type ExecutionProfileValue, type PassageRequest, type ToolObservation, type PassageBinding, type QueueItem } from '#contracts';
import { isLocalAbsoluteTargetPath, OperationError, publicationTargetHash, publicationTargetPath, type AttemptCommand, type AnswerCommand, type CaptureClaim, type RetryCaptureCommand, type Storage } from '../storage/index.js';
import type { GitHub } from '../github/index.js';
import { interpretIssue, preparationDigest } from './criteria.js';
import { ExecutionError, type Execution } from '../execution/index.js';
import type { Preparations, Queue } from '../projects/index.js';
import type { Workspaces } from '../workspaces/index.js';
import { CaptureError, ProjectStorageError } from '../workspaces/index.js';
import type { DeliveryDiffQuery } from '#contracts';
import { createRecovery } from './recovery.js';
import { createPublication, type PublicationDependencies } from '../publication/index.js';
import { IssueProgressError, writeIssueProgressFile, type IssueProgressDecision, type IssueProgressMilestone,
  type IssueProgressPredecessor, type IssueProgressRound } from '../workspaces/index.js';
import type { AuthorizeUpgrade, CompletePublication, ReconcilePublication, MakeAttemptDecision } from '#contracts';

export interface PipelineDependencies {
  github?: Pick<GitHub, 'getIssueContextById'>;
  storage: Storage; preparations: Pick<Preparations, 'revalidateSummary' | 'prepareReadyStart' | 'prepareDecisionSuccessor'>; execution: Execution;
  queue?: Pick<Queue, 'observe' | 'revalidateForDispatch'>;
  workspaces: Pick<Workspaces, 'prepareAttempt'> & Partial<Pick<Workspaces, 'resolveAttemptWorkspace' | 'captureDelivery' | 'getDeliveryDiff' | 'materializeReview' | 'inspectEnvironment' | 'removeEnvironment' | 'folderCapability' | 'openEnvironment' | 'importIntegrationBase' | 'resolveAttemptEvidenceDirectory' | 'resolveAttemptProgressFile' | 'migrateLegacyIssueHistory'>>;
  observeTools: () => Promise<ToolObservation[]>;
  publication?: Pick<PublicationDependencies, 'github' | 'workspaces'>;
  hostName?: string;
  logFailure: (code: string) => void;
}
function profile(value: ExecutionProfileValue): ExecutionProfileValue {
  const { name, executor, provider, model, effort, guidance } = value;
  return { name, executor, provider, model, effort, guidance };
}

const dependencyManagement = {
  managerSelection: 'No package root relevante, use o campo packageManager de package.json se ele apontar para npm, Yarn ou pnpm e corresponder ao lockfile. Sem esse campo, infira o gerenciador somente se houver um único tipo de lockfile: package-lock.json ou npm-shrinkwrap.json para npm, yarn.lock para Yarn, pnpm-lock.yaml para pnpm. Trate diretórios independentes de monorepo separadamente. Se houver conflito, formato não suportado ou gerenciador indisponível, preserve o estado e registre o impedimento, sem escolher ou instalar outro gerenciador.',
  reconciliation: 'Antes de validações que precisam das dependências, reutilize a árvore instalada quando estiver presente e coerente. Se o estado instalado estiver ausente ou inconsistente com manifestos e lockfile, execute a instalação normal do gerenciador no package root, sem instalação limpa. Não reinstale em toda tentativa quando nada mudou.',
  preservation: 'Nunca apague node_modules, caches, arquivos ignorados ou o workspace; não use npm ci nem outro comando de instalação limpa. Depois de instalar, confira o diff do Git. Mantenha mudanças de lockfile apenas quando forem necessárias às mudanças de dependência desta tarefa. Se a reconciliação exigir alterações não relacionadas ou não puder ser feita sem limpar dados, preserve o conteúdo e registre um check bloqueado com causa e limitação.',
} as const;

const workspaceScopeInstructions = 'Use workspace.comparison_base_sha as the content baseline for this attempt; baseSha only identifies the repository base. Compare the complete working-tree content, including currently untracked paths, with that snapshot; do not infer new scope from git status or the staged-index diff alone. Preserve the existing index without staging, resetting, checking out or normalizing files. If a path is absent from that preserved index but its working-tree content matches the entry in workspace.comparison_base_sha, treat it as inherited state; this includes a staged deletion paired with an identical untracked file. For staged differences that appear to be only line endings, verify semantic equality and exclude inherited changes from this attempt scope. After capture, compare the immutable delivery.commitSha tree with workspace.comparison_base_sha. Review the immutable delivery.commitSha/ref, not the mutable workspace HEAD or index.';

const resultSubmissionProtocol = {
  beforeSend: 'Finish all owned tools and product writers before calling execution_complete, in a separate tool call. Check every required field, nested field, enum and value type against its tool schema. Use formatVersion: 1, meaningful nonblank text and concise observed evidence. Use only captured criterion IDs, each exactly once. The controller supplies private passage, attempt, round and delivery identities; do not add them to the result.',
  receipt: 'Completion requires accepted: true and the factory receipt. For RESULT_INVALID, read validationIssues paths/rules and correct the reported arguments before resubmitting. For OWNED_TOOLS_RUNNING, wait for those tools to finish. For STORAGE_FAILED, RESULT_CONFLICT, timeout or channel loss, preserve the submitted result and work, report the exact code and any receipt already received; do not change the payload merely to bypass the error or claim acceptance without a receipt.',
} as const;
const resultSubmissionInstructions = {
  implementer: {
    ...resultSubmissionProtocol,
    requiredFields: ['formatVersion', 'summary', 'writesStopped', 'additionalChangesJustification', 'criteria', 'checks'],
    values: 'On EVERY round, including the first, include additionalChangesJustification: null when there are no additional changes, otherwise a concrete justification. Set writesStopped: true only after confirming writers stopped. Each criterion has criterionId, verdict passed/failed/not_verified and a nonempty evidence array of strings. Each check has id, outcome and evidence, all strings; use checks: [] only when there are no checks to report, and describe unperformed pertinent checks and their limitations honestly.',
    findings: 'Use findingResponses: [] when this passage has no current-attempt findings. Otherwise respond exactly once to every supplied current finding ID using findingId, responseType corrected/disputed, response and a nonempty evidence array. Keep check IDs unique and declaredFiles relative to this checkout.',
  },
  reviewer: {
    ...resultSubmissionProtocol,
    requiredFields: ['formatVersion', 'summary', 'verdict', 'criteria', 'findings', 'resolutions', 'assessments', 'commandRepetitions', 'disputeResponses'],
    emptyValues: 'Include every required array even when empty. Use findings: [] for no new findings; resolutions: [] and assessments: [] for no prior findings; commandRepetitions: [] for no repeated commands; disputeResponses: [] for no disputes.',
    findings: 'Each finding requires key, criterionIds, category, problem, evidence, expectedResult, blocking, priority critical/high/medium/low, and originFindingId. Use originFindingId: null for a new problem, or the supplied root finding UUID for the same recurring problem and criteria. Keep keys unique. In resolutions.findingKey and assessments.findingId, use each supplied prior finding UUID exactly once, not its human-readable key or a new UUID.',
    consistency: 'Each criterion requires criterionId, verdict passed/failed/not_verified and a nonempty evidence array. Approval requires all criteria passed and all blocking findings resolved. Rejection needs a demonstrated failed/unverified criterion, actionable blocking finding or unresolved prior finding. For proven/partial assessments, reuse the exact same independent evidence string in the matching criterion evidence array; none/not_assessable uses evidence: [] with a concrete justification. commandRepetitions.prior_evidence must match evidence supplied by this delivery producer. Respond once per supplied disputeId, with maintained paired to unresolved or resolved paired to resolved in the finding resolution.',
  },
} as const;

function validWorkspaceSnapshot(snapshot: AttemptWorkspaceSnapshot, binding: AttemptWorkspaceBinding, baseSha: string): boolean {
  const state = snapshot.initial_state;
  if (snapshot.identity.project_id !== binding.workspace.project_id || snapshot.identity.repository_id !== binding.workspace.repository_id ||
      snapshot.identity.issue_id !== binding.workspace.issue_id || snapshot.predecessor_attempt_id !== binding.predecessor_attempt_id ||
      snapshot.inherited_base_sha !== binding.inherited_base_sha || snapshot.comparison_base_sha === null ||
      state.kind === 'pending_inherited_attempt' || snapshot.comparison_base_sha !== state.content_identity) return false;
  if (binding.initial_state.kind === 'base_checkout') return state.kind === 'base_checkout' && snapshot.inherited_base_sha === null && snapshot.comparison_base_sha === baseSha;
  return state.kind === 'inherited_attempt' && state.source_attempt_id === binding.predecessor_attempt_id && snapshot.inherited_base_sha !== null;
}

type ExecutionCatalogResult = Awaited<ReturnType<Execution['getCatalog']>>;

function validateSavedProfile(
  role: 'implementer' | 'reviewer',
  value: ExecutionProfileValue & { composition_version?: number | null },
  catalog: ExecutionCatalogResult | null,
): void {
  if (value.composition_version !== 1) {
    throw new OperationError(409, 'PROFILE_COMPOSITION_REQUIRED', 'The execution profile has no compatible captured instruction composition.', {
      facts: { profile_role: role, profile_id: value.id ?? null }, affected_requirements: ['RF-36', 'RF-37', 'RF-38'],
      recovery: 'Edit and save the profile instructions within the existing 8,192-character limit, then refresh the preparation.',
    });
  }
  if (!catalog || catalog.state !== 'loaded') return;
  const available = catalog.models.find((model) => model.provider === value.provider && model.model === value.model);
  const effortIsValid = available !== undefined && (available.efforts.length === 0
    ? value.effort === null
    : value.effort !== null && available.efforts.includes(value.effort));
  if (!effortIsValid) {
    throw new OperationError(409, 'PROFILE_CATALOG_MISMATCH', 'O perfil salvo não está disponível no catálogo OMP atual.', {
      facts: { profile_role: role, profile_id: value.id ?? null },
      affected_requirements: ['RF-89', 'RF-90'],
      recovery: 'Abra Configuração > Perfis para editar este perfil ou atualize as opções de execução e tente novamente.',
    });
  }
}

async function observeStartCatalog(execution: Execution, logFailure: (code: string) => void): Promise<ExecutionCatalogResult | null> {
  try {
    return await execution.getCatalog();
  } catch (error) {
    logFailure(error instanceof ExecutionError ? error.code : 'OMP_CATALOG_UNAVAILABLE');
    return null;
  }
}

async function authorityReady(observation: Promise<boolean>): Promise<boolean> {
  try { return await observation; }
  catch (error) {
    // A stale read grants no authority; let the caller retain its existing continuation.
    if (error instanceof OperationError && error.code === 'AUTHORITY_OBSERVATION_STALE') return false;
    throw error;
  }
}

export function createPipeline(deps: PipelineDependencies) {
  const { storage, execution, preparations, workspaces } = deps;
  const pending = new Set<Promise<void>>(); const abort = new AbortController(); let closed = false;
  let queueDispatching = false; let nextQueuePollAt = 0;
  const attemptSignals = new Map<string, AbortController>();
  async function updateIssueProgress(attemptId: string, milestone: IssueProgressMilestone): Promise<void> {
    if (!workspaces.resolveAttemptProgressFile) return;
    try {
      const status = storage.getAttempt(attemptId);
      const capture = storage.getAttemptCapture(attemptId);
      const rounds: IssueProgressRound[] = storage.getRounds(attemptId).entries.map(entry => {
        const delivery = entry.producerReceiptId === null ? null : storage.getDelivery(entry.deliveryId).delivery;
        const producer = delivery ? storage.getProducerResult(entry.deliveryId) : null;
        const review = delivery ? storage.getReview(entry.deliveryId) : null;
        const criteria = producer?.result.criteria;
        return {
          round: entry.round, deliveryId: entry.deliveryId, producerPassageId: entry.producerPassageId,
          producerReceiptId: entry.producerReceiptId, reviewId: entry.reviewId,
          reviewState: (review?.state ?? entry.reviewState) as IssueProgressRound['reviewState'],
          reviewIndependence: (review?.independenceState ?? null) as IssueProgressRound['reviewIndependence'],
          contentIdentity: delivery?.contentIdentity ?? entry.contentIdentity, commitSha: delivery?.commitSha ?? null,
          checkCount: producer ? producer.result.checks.length : null,
          criteria: criteria ? {
            passed: criteria.filter(item => item.verdict === 'passed').length,
            failed: criteria.filter(item => item.verdict === 'failed').length,
            notVerified: criteria.filter(item => item.verdict === 'not_verified').length,
          } : null,
          blockingFindings: storage.getOpenFindings(attemptId, entry.round + 1).filter(item => item.blocking).length,
        };
      });
      let predecessor: IssueProgressPredecessor | null = null;
      const predecessorAttemptId = capture.workspace.predecessor_attempt_id;
      if (predecessorAttemptId) {
        const previous = storage.getAttempt(predecessorAttemptId);
        const previousRounds = storage.getRounds(predecessorAttemptId).entries;
        const lastRound = previousRounds.at(-1);
        const lastDelivery = lastRound?.producerReceiptId ? storage.getDelivery(lastRound.deliveryId).delivery : null;
        const lastReview = lastDelivery ? storage.getReview(lastDelivery.id) : null;
        const previousCapture = storage.getAttemptCapture(predecessorAttemptId);
        predecessor = {
          attemptId: previous.id, predecessorAttemptId: previousCapture.workspace.predecessor_attempt_id,
          result: previous.result, phase: previous.phase, suspension: previous.suspension,
          deliveryId: lastRound?.deliveryId ?? null,
          contentIdentity: lastDelivery?.contentIdentity ?? lastRound?.contentIdentity ?? null,
          reviewState: (lastReview?.state ?? lastRound?.reviewState ?? null) as IssueProgressPredecessor['reviewState'],
          blockingFindings: storage.getOpenFindings(predecessorAttemptId, previous.round + 1).filter(item => item.blocking).length,
        };
      }
      const detail = storage.getAttemptDetail(attemptId, { limit: '20', section: 'decisions' });
      const decisionItems = detail.v3Details?.section === 'decisions' ? detail.v3Details.items : [];
      const decisions: IssueProgressDecision[] = decisionItems.slice(0, 20).map(item => ({
        id: item.id, operationId: item.operationId, action: item.action as IssueProgressDecision['action'], createdAtMs: item.createdAtMs,
      }));
      const initialState = capture.workspace.initial_state;
      const contentIdentity = initialState.kind === 'pending_inherited_attempt' ? null : initialState.content_identity;
      const sourceAttempt = initialState.kind === 'base_checkout' ? null : initialState.source_attempt_id;
      const path = await workspaces.resolveAttemptProgressFile(attemptId);
      await writeIssueProgressFile(path, {
        identity: {
          projectId: capture.workspace.identity.project_id,
          repositoryId: capture.workspace.identity.repository_id,
          issueId: capture.workspace.identity.issue_id,
        },
        issueNumber: capture.issue.number, issueTitle: capture.issue.title, updatedAtMs: Date.now(), milestone,
        attempt: {
          id: status.id, passageId: status.passageId, predecessorAttemptId: capture.workspace.predecessor_attempt_id,
          round: status.round, phase: status.phase, result: status.result, suspension: status.suspension,
        },
        workspace: {
          initialState: initialState.kind, sourceAttemptId: sourceAttempt,
          initialContentIdentity: contentIdentity, comparisonBaseSha: capture.workspace.comparison_base_sha,
        },
        rounds, blockingFindings: storage.getOpenFindings(attemptId, status.round + 1).filter(item => item.blocking).length,
        predecessor, decisions,
      });
    } catch (error) {
      deps.logFailure(error instanceof IssueProgressError ? error.code : 'ISSUE_PROGRESS_WRITE_FAILED');
    }
  }
  async function cancelAttemptAndUpdateProgress(attemptId: string, operationId: string): Promise<void> {
    try { await execution.cancelAttempt(attemptId, operationId); }
    finally { await updateIssueProgress(attemptId, 'attempt_cancelled'); }
  }
  // Only live, not-yet-dispatched continuations. Restart deliberately discards these closures.
  const waitingForAuthority = new Map<string, () => Promise<void>>();
  function signalFor(id: string) {
    let controller = attemptSignals.get(id);
    if (!controller) { controller = new AbortController(); attemptSignals.set(id, controller); }
    return AbortSignal.any([abort.signal, controller.signal]);
  }
  function revoke(id: string) { signalFor(id); attemptSignals.get(id)?.abort(); }
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
  async function startAttempt(body: StartAttempt, context: Omit<AttemptCommand, 'body'>,
    queueCycle?: { accountId: string; projectId: string; issueId: string; cycleNumber: number },
    queueSelection?: { scan: Awaited<ReturnType<Queue['observe']>>; candidate: QueueItem }) {
    if (!Value.Check(StartAttempt, body)) throw new OperationError(400, 'START_INVALID', 'The start request is invalid.');
    const command = { ...context, body };
    const recovered = storage.recoverAttempt(command); if (recovered) return recovered;
    if (closed) throw new OperationError(503, 'PIPELINE_CLOSED', 'The controller is shutting down.');
    if (context.expectedRevision === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
    const saved = storage.getPreparation(body.preparationId);
    if (saved.etag !== context.expectedRevision) throw new OperationError(412, 'REVISION_CONFLICT', 'The preparation changed.');
    const config = storage.getConfiguration(saved.view.project_id);
    const deletion = config.view.prerequisites.find(item => item.code === 'PROJECT_DELETION_PENDING');
    if (deletion) throw new OperationError(409, deletion.code, deletion.message, { recovery: deletion.recovery });
    const profileCounts = storage.getGlobalConfiguration().view.profile_counts;
    const missingProfileTypes = (['implementer', 'reviewer'] as const).filter((role) => profileCounts[role] === 0);
    if (missingProfileTypes.length > 0) {
      throw new OperationError(409, 'PROFILE_TYPES_REQUIRED', 'É necessário manter ao menos um perfil ativo de cada papel para iniciar uma tentativa.', {
        facts: { missing_profile_types: missingProfileTypes.join(',') },
        affected_requirements: ['RF-88', 'RF-89'],
        recovery: 'Abra Configuração > Perfis, crie um perfil ativo de Implementador e outro de Revisor e tente iniciar novamente.',
      });
    }
    if (publication && !await publication.observeControllerAccount()) throw new OperationError(409, 'ACCOUNT_CHANGED', 'Dispatch is paused until the configured account is observed.');
    const current = await preparations.revalidateSummary(body); const p = current.view.preparation;
    const targetRequired = p.effective_configuration.configuration.source.kind === 'github' && p.delivery_mode !== 'icr';
    if (targetRequired && !p.publication_target) throw new OperationError(409, 'PUBLICATION_TARGET_REQUIRED',
      'Escolha um destino local para iniciar uma entrega Commit local ou Pull request deste projeto por URL.', {
        affected_requirements: ['RF-23', 'RF-24', 'RF-28'], recovery: 'Selecione um clone existente ou um destino para o clone, salve e revise novamente o resumo.' });
    if (p.publication_target && (p.effective_configuration.configuration.source.kind !== 'github' || p.publication_target.repository_id !== p.effective_configuration.configuration.source.repository_id ||
      !isLocalAbsoluteTargetPath(publicationTargetPath(p.publication_target)))) throw new OperationError(409, 'PUBLICATION_TARGET_INVALID',
        'O destino salvo não corresponde ao repositório atual ou não usa um caminho local absoluto válido.', {
          affected_requirements: ['RF-23', 'RF-24', 'RF-28'], recovery: 'Escolha novamente o clone e o destino correspondentes ao repositório do projeto.' });
    const reasons = p.prerequisites.filter(r => r.code !== 'EXECUTOR_REVALIDATION_REQUIRED');
    if (reasons.length || !p.issue || !p.base_sha || !p.criteria_preview.executable || !config.view.settings.account_id ||
      !p.effective_configuration.implementer_profile || !p.effective_configuration.reviewer_profile) {
      const blocker = reasons[0] ?? {
        code: !p.issue ? 'ISSUE_CONTEXT_INVALID' : !p.base_sha ? 'BASE_UNCONFIRMED' : !p.criteria_preview.executable ? p.criteria_preview.reasons[0] ?? 'CRITERIA_LIST_INVALID'
          : !config.view.settings.account_id ? 'ACCOUNT_UNOBSERVED' : 'PROFILES_REQUIRED',
        message: 'A preparação não tem todos os dados necessários para iniciar.',
        recovery: 'Consulte novamente a preparação e corrija os impedimentos apresentados.',
      };
      throw new OperationError(409, blocker.code, blocker.message, {
        facts: { prerequisite_codes: (reasons.length ? reasons.map(item => item.code) : [blocker.code]).join(',') },
        recovery: blocker.recovery,
      });
    }
    const catalog = await observeStartCatalog(execution, deps.logFailure);
    validateSavedProfile('implementer', p.effective_configuration.implementer_profile, catalog);
    validateSavedProfile('reviewer', p.effective_configuration.reviewer_profile, catalog);
    const roleResources = execution.roleResources();
    if (roleResources.length !== 2 || roleResources.some(r => !Value.Check(RoleResourceReference, r) || r.id !== `factory.${r.role}`) || new Set(roleResources.map(r => r.role)).size !== 2) {
      throw new OperationError(503, 'ROLE_RESOURCE_REQUIRED', 'Both distributed versioned role contracts are required before dispatch.');
    }
    const tools = await deps.observeTools();
    const v3Delivery = p.publication_target === null
      ? { format_version: 1 as const, publication_target: null, publication_target_hash: null, authorization_operation_id: context.operationId }
      : { format_version: 1 as const, publication_target: p.publication_target, publication_target_hash: publicationTargetHash(p.publication_target)!, authorization_operation_id: context.operationId };
    const capture: AttemptCapture = { formatVersion: 1, preparationId: p.id, preparationRevision: p.revision, summaryHash: p.summary_hash,
      accountId: config.view.settings.account_id, issue: p.issue, baseSha: p.base_sha, configuration: p.effective_configuration,
      criteria: p.criteria_preview.criteria, criteriaDigest: p.criteria_preview.digest, roleResources, tools,
      workspace: {
        identity: { project_id: saved.view.project_id, repository_id: p.issue.repository.id, issue_id: p.issue.id },
        predecessor_attempt_id: p.previous_attempt_id ?? null,
        initial_state: { kind: 'base_checkout', content_identity: p.base_sha }, inherited_base_sha: null, comparison_base_sha: p.base_sha,
      },
      v3Delivery };
    for (const candidate of storage.terminalRecoveryCandidates()) {
      if (!execution.observeManagedTerminal && candidate.state === 'available') continue;
      const observation = execution.observeManagedTerminal
        ? await execution.observeManagedTerminal({ ...(candidate.workspaceId ? { workspaceId: candidate.workspaceId } : {}),
          ...(candidate.terminalId ? { terminalId: candidate.terminalId } : {}), terminalName: candidate.terminalName }).catch(() => 'uncertain' as const)
        : 'uncertain';
      if (closed) throw new OperationError(503, 'PIPELINE_CLOSED', 'The controller is shutting down.');
      if ((observation !== 'stopped' && observation !== 'missing') || (observation === 'stopped' && (!candidate.workspaceId || !candidate.terminalId))) {
        throw new OperationError(409, 'TERMINAL_AVAILABILITY_UNCONFIRMED',
          observation === 'running' ? 'O terminal próprio ainda está em execução.' : 'Não foi possível confirmar a disponibilidade do terminal próprio.', {
            facts: { terminal_id: candidate.terminalId, terminal_name: candidate.terminalName }, affected_requirements: ['RF-45', 'RF-47', 'RF-48'],
            recovery: observation === 'running'
              ? `Encerre a execução do terminal ${candidate.terminalName} no Maestri e tente iniciar novamente.`
              : `No Maestri, reconecte o terminal ${candidate.terminalName} ao terminal que executa o controlador e confirme que está parado. Se você o excluiu, tente novamente: a fábrica confirmará a ausência e criará outro. Se a consulta continuar falhando, confira a conexão do controlador com o Maestri.`,
          });
      }
      storage.reconcileTerminalAvailability(candidate, observation);
    }
    if (queueSelection) {
      if (!storage.getSettings().automation_enabled || !storage.getConfiguration(queueSelection.candidate.projectId).view.configuration.automation_enabled) {
        throw new OperationError(409, 'QUEUE_PAUSED', 'The queue was paused before the new attempt could be accepted.');
      }
      const queue = deps.queue;
      const latest = queue && await queue.revalidateForDispatch(queueSelection.scan, queueSelection.candidate, storage.getGlobalConfiguration().view.event_cursor);
      if (latest) nextQueuePollAt = Math.max(nextQueuePollAt, latest.observation.polling.nextPollAtMs);
      const first = latest ? firstDispatchCandidate(latest) : undefined;
      if (!latest?.observation.valid || !latest.observation.enabled || latest.observation.account.id !== queueSelection.scan.observation.account.id ||
          !first || first.projectId !== queueSelection.candidate.projectId || first.itemId !== queueSelection.candidate.itemId || first.issueId !== queueSelection.candidate.issueId) {
        throw new OperationError(409, 'QUEUE_SELECTION_CHANGED', 'The first eligible queue item changed before attempt acceptance.');
      }
    }
    const workspaceAvailable = p.previous_attempt_id && workspaces.resolveAttemptWorkspace
      ? await lstat(dirname(await workspaces.resolveAttemptWorkspace(p.previous_attempt_id))).then(() => true, error => (error as NodeJS.ErrnoException).code !== 'ENOENT')
      : true;
    const accepted = storage.createAttempt({ command, capture, configurationETag: config.etag, preparationETag: current.etag,
      ...(workspaceAvailable ? {} : { workspaceAvailable: false }), ...(queueCycle ? { queueCycle } : {}) });
    if (accepted.created) schedule(accepted.operation.resource.id);
    return accepted.operation;
  }
  function firstDispatchCandidate(result: Awaited<ReturnType<Queue['observe']>>) {
    const accountId = result.observation.account.id;
    if (!accountId) return undefined;
    return result.items.find(item => {
      if (!item.issueId || !item.readyEligible || item.reasons.includes('ATTEMPT_ACTIVE') || item.reasons.includes('AUTOMATION_DISABLED')) return false;
      const cycle = storage.getQueueCycle(accountId, item.projectId, item.issueId);
      return cycle?.ready === true && cycle.consumedAttemptId === null;
    });
  }
  async function dispatchQueueCandidate(): Promise<void> {
    if (!deps.queue || queueDispatching || closed) return;
    if (Date.now() < nextQueuePollAt) return;
    queueDispatching = true;
    nextQueuePollAt = Date.now() + storage.getSettings().time_defaults.polling_interval_ms;
    try {
      if (publication && !await publication.observeControllerAccount()) return;
      const scan = await deps.queue.observe({ limit: '100' });
      nextQueuePollAt = Math.max(nextQueuePollAt, scan.observation.polling.nextPollAtMs);
      if (closed || !scan.observation.valid || !scan.observation.account.id) return;
      storage.recordQueueObservations(scan.items.filter(item => item.kind === 'issue' && item.issueId !== null && !item.reasons.includes('PROJECT_MEMBERSHIP_MISSING') && !item.reasons.includes('READ_INCOMPLETE')).map(item => ({
        accountId: scan.observation.account.id!, projectId: item.projectId, issueId: item.issueId!, ready: item.ready, eligible: item.readyEligible, existingAttemptId: item.attemptId,
      })));
      if (!scan.observation.enabled) return;
      const observedCandidate = firstDispatchCandidate(scan);
      if (!observedCandidate) return;
      const current = await deps.queue.revalidateForDispatch(scan, observedCandidate);
      if (!current) return;
      nextQueuePollAt = Math.max(nextQueuePollAt, current.observation.polling.nextPollAtMs);
      if (closed || !current.observation.enabled || !current.observation.valid || current.observation.account.id !== scan.observation.account.id) return;
      storage.recordQueueObservations(current.items.filter(item => item.kind === 'issue' && item.issueId !== null && !item.reasons.includes('PROJECT_MEMBERSHIP_MISSING') && !item.reasons.includes('READ_INCOMPLETE')).map(item => ({
        accountId: current.observation.account.id!, projectId: item.projectId, issueId: item.issueId!, ready: item.ready, eligible: item.readyEligible, existingAttemptId: item.attemptId,
      })));
      const candidate = firstDispatchCandidate(current);
      if (!candidate?.issueId) return;
      const cycle = storage.getQueueCycle(current.observation.account.id, candidate.projectId, candidate.issueId);
      if (!cycle || cycle.consumedAttemptId !== null || !cycle.ready) return;
      const mode = current.observation.modesByProject.find(item => item.projectId === candidate.projectId)?.mode;
      if (!mode) return;
      const project = storage.getConfiguration(candidate.projectId).view.configuration;
      if (project.source.kind === 'github' && mode !== 'icr') return;
      if (!project.source.repository_id) return;
      const predecessor = storage.getLatestProjectIssueAttempt(candidate.projectId, project.source.repository_id, candidate.issueId);
      if (predecessor?.active) return;
      const prepared = await preparations.prepareReadyStart(candidate.projectId, { issue_id: candidate.issueId, delivery_mode: mode, guidance: '', overrides: {},
        ...(predecessor ? { previous_attempt_id: predecessor.id } : {}) },
        { operationId: randomUUID(), expectedRevision: undefined });
      if (closed || !storage.getSettings().automation_enabled || !storage.getConfiguration(candidate.projectId).view.configuration.automation_enabled) return;
      let attemptOperationId = randomUUID();
      while (attemptOperationId === prepared.operationId) attemptOperationId = randomUUID();
      await startAttempt(prepared.body, { operationId: attemptOperationId, expectedRevision: prepared.expectedRevision },
        { accountId: current.observation.account.id!, projectId: candidate.projectId, issueId: candidate.issueId, cycleNumber: cycle.cycleNumber },
        { scan, candidate });
    } catch (error) {
      if (error instanceof OperationError && error.code === 'QUEUE_SELECTION_CHANGED') return;
      deps.logFailure(error instanceof OperationError ? error.code : 'QUEUE_DISPATCH_FAILED');
    } finally {
      queueDispatching = false;
    }
  }
  async function tick(): Promise<void> {
    if (closed) return;
    for (const attemptId of storage.expireLimits()) {
      // Expiration revokes advancement. The executor records the actual stop receipt separately.
      await cancelAttemptAndUpdateProgress(attemptId, randomUUID());
    }
    if (scopePolling) return;
    if (deps.github && Date.now() - lastScopePoll >= storage.getSettings().time_defaults.polling_interval_ms) {
      scopePolling = true; lastScopePoll = Date.now();
      try {
        if (publication) for (const id of storage.getAuthorityCandidates()) await authorityReady(publication.observeAuthority(id));
        for (const [id, next] of waitingForAuthority) {
          const a = storage.getAttempt(id);
          if (a.result) waitingForAuthority.delete(id);
          else if (!a.suspension) { waitingForAuthority.delete(id); enqueue(next); }
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
      deps.logFailure(error instanceof OperationError || error instanceof CaptureError || error instanceof ExecutionError ? error.code : 'PIPELINE_EFFECT_FAILED');
    }).finally(() => { pending.delete(task); });
    pending.add(task);
  }
  const recovery = createRecovery(deps, enqueue, revoke, () => closed,
    attemptId => updateIssueProgress(attemptId, 'attempt_cancelled'));
  const publication = deps.publication ? createPublication({ ...deps.publication, storage, enqueue, isClosed: () => closed, logFailure: deps.logFailure,
    reconcileResources: async id => {
      if (!['delivered', 'interrupted'].includes(storage.getAttempt(id).result ?? '')) return;
      const resources = storage.getResources(id).entries;
      if (!resources.some(resource => resource.kind === 'terminal' && resource.stopState !== 'confirmed' && resource.diagnostic === 'TRACKING_LOST')) return;
      for (const resource of resources) {
        if (resource.kind !== 'terminal' || !resource.owned || resource.stopState === 'confirmed') continue;
        if (!await execution.reconcilePassageStop?.({ passageId: resource.passageId })) {
          throw new OperationError(409, 'RESOURCES_NOT_RECONCILED', 'Physical terminal stop could not be confirmed on this host.');
        }
      }
    },
    adaptIntegration: async (id,operationId,target) => {
      if (!workspaces.importIntegrationBase) throw new OperationError(409,'INTEGRATION_CONTEXT_UNAVAILABLE','Ambiente de adaptação indisponível. A versão aprovada foi preservada.');
      const plan = storage.beginIntegration(id,operationId,target);
      if (plan) enqueue(() => launchCorrection(plan));
    },
    cancelAttempt: async id => { await recovery.cancelAttempt(id, {}, { operationId: randomUUID(), expectedRevision: undefined }); } }) : null;
  async function review(deliveryId: string): Promise<void> {
    if (closed) return;
    const observed = storage.getDelivery(deliveryId);
    if (publication && !await authorityReady(publication.observeAuthority(observed.delivery.attemptId,'inReview'))) {
      waitingForAuthority.set(observed.delivery.attemptId,() => review(deliveryId)); return;
    }
    const claimed = storage.beginReview(deliveryId); if (!claimed) return;
    await updateIssueProgress(observed.delivery.attemptId, 'review_started');
    await launchReview(claimed);
  }
  async function launchReview(claimed: NonNullable<ReturnType<Storage['beginReview']>>): Promise<void> {
    const deliveryId = claimed.deliveryId;
    try {
      if (publication && !await authorityReady(publication.projectStage(claimed.attemptId, 'inReview'))) {
        waitingForAuthority.set(claimed.attemptId,() => launchReview(claimed)); return;
      }
      if (!workspaces.materializeReview) throw new CaptureError('REVIEW_MATERIALIZATION_UNAVAILABLE');
      const delivery = storage.getDelivery(deliveryId).delivery;
      const capture = storage.getAttemptCapture(delivery.attemptId);
      const previousRound = storage.getRounds(delivery.attemptId).entries.find(r => r.round === delivery.round - 1);
      const previousReview = previousRound?.deliveryId ? storage.getReview(previousRound.deliveryId) : null;
      if (delivery.round > 1) {
        if (!previousReview || previousReview.state === 'pending') throw new ExecutionError('TRACKING_LOST');
      }
      const cwd = await workspaces.materializeReview(delivery, claimed.id);
      const evidenceDirectory = await workspaces.resolveAttemptEvidenceDirectory?.(delivery.attemptId, delivery.id);
      if (!evidenceDirectory) throw new CaptureError('CONTEXT_UNAVAILABLE');
      let previousDiff: Awaited<ReturnType<NonNullable<typeof workspaces.getDeliveryDiff>>>['entries'] | null = null;
      if (previousRound?.deliveryId) {
        if (!workspaces.getDeliveryDiff) throw new CaptureError('CONTEXT_UNAVAILABLE');
        const previous = storage.getDelivery(previousRound.deliveryId).delivery;
        previousDiff = [];
        let cursor: string | undefined;
        const cursors = new Set<string>();
        do {
          const page = await workspaces.getDeliveryDiff(delivery, { limit: '100', ...(cursor ? { cursor } : {}) }, previous);
          previousDiff.push(...page.entries);
          if (Buffer.byteLength(JSON.stringify(previousDiff), 'utf8') > 524_288) throw new ExecutionError('RESOURCE_INVALID');
          cursor = page.nextCursor ?? undefined;
          if (page.hasMore && !cursor) throw new ExecutionError('RESOURCE_INVALID');
          if (cursor && cursors.has(cursor)) throw new ExecutionError('RESOURCE_INVALID');
          if (cursor) cursors.add(cursor);
        } while (cursor);
      }
      storage.recordReviewWorkspace(deliveryId, true, null);
      const launch = async (): Promise<void> => {
        if (publication && !await authorityReady(publication.observeAuthority(delivery.attemptId,'inReview'))) {
          waitingForAuthority.set(delivery.attemptId,launch); return;
        }
        const current = storage.getAttempt(delivery.attemptId);
        if (closed || current.result || current.suspension || current.deliveryId !== delivery.id) return;
        const passage = storage.executionPersistence().getPassage({ passageId: claimed.passageId });
        const reviewer = capture.configuration.reviewer_profile; if (!reviewer) throw new ExecutionError('RESOURCE_INVALID');
        const findings = storage.getOpenFindings(delivery.attemptId, delivery.round);
        const disputes = storage.getPendingFindingDisputes(delivery.attemptId, delivery.round);
        if (disputes.length > 1000) throw new ExecutionError('RESOURCE_INVALID');
        // Only captured scope, producer result, criteria, version and findings. No implementer conversation.
        const request: PassageRequest = { binding: passage.binding, cwd, profile: profile(reviewer), criterionIds: capture.criteria.map(c => c.id),
          previousFindingKeys: findings.map(f => f.id), previousBlockingFindingKeys: findings.filter(f => f.blocking).map(f => f.id), gitNexusRequired: false, roleResource: passage.roleResource,
          task: JSON.stringify({ formatVersion: 1, issue: { id: capture.issue.id, title: capture.issue.title, body: capture.issue.body },
            criteria: capture.criteria, delivery, resultSubmission: resultSubmissionInstructions.reviewer,
             findings, disputes, producerResult: storage.getProducerResult(deliveryId), previousDelivery: previousRound?.deliveryId ?? null, previousDiff,
            workspaceScope: { comparisonBaseSha: capture.workspace.comparison_base_sha, capturedCommitSha: delivery.commitSha,
              instructions: workspaceScopeInstructions },
             disputeResponse: 'Respond once to every supplied disputeId in disputeResponses, with maintained/resolved, justification and evidence. Match the resolution of its findingId: maintained requires unresolved; resolved requires resolved. IDs and original version are supplied facts. A maintained dispute blocks automatic correction and requires an operator decision.',
            reviewScope: { mode: previousReview ? 'focused' : 'complete',
              prerequisites: 'First confirm that the required product files exist. If a required entry point is absent, verify the absence directly, report the affected criteria as failed with concrete evidence, and submit a rejected result promptly. Do not open a browser or repeat visual checks for a missing page. A blocked producer result requires this prerequisite check before any broader review.',
              focus: previousReview ? 'Review the diff, every pending finding and regressions in affected areas; expand inspection whenever needed.' : 'Independently inspect every captured criterion.',
              approval: 'Report every current criterion exactly once with independent evidence for this delivery. Historical approval is never inherited. Build and typecheck do not replace required visual proof.',
              repetitions: 'Reuse pertinent valid evidence from this delivery. Record every repeated command with its concrete reason and prior evidence in commandRepetitions; prior_evidence must refer to evidence supplied by the producer of this delivery.' },
            progressAssessment: 'Assess every canonical prior finding ID exactly once. For proven or partial, provide nonempty independent evidence from this version under the relevant criterion in this ReviewerResult; do not use artifact IDs or hashes alone. When evidence is absent or a technical impediment prevents assessment, use none or not_assessable, an empty evidence array, and a concrete justification. These outcomes do not reset recurrence. Never infer identity from text.',
            guidance: capture.configuration.guidance,
            evidenceDirectory,
            authority: 'Review this captured version independently in the single attempt checkout while the Implementer is stopped. Never change product content or publish. Conversation and earlier evidence are historical, never the current version. Save screenshots and reports only in the supplied evidenceDirectory, ignored locally by Git. Never overwrite earlier evidence, modify tracked files for evidence or use evidence as product code. Resolve each prior finding using findingKey equal to its supplied id. A rejection needs concrete criterion evidence or an actionable blocking finding.' }) };
        if (previousReview) await execution.continuePassage({ passageId: previousReview.passageId }, request);
        else await execution.startPassage(request, signalFor(delivery.attemptId));
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
    if (publication && !await authorityReady(publication.observeAuthority(attemptId,'inProgress'))) {
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
    await updateIssueProgress(plan.review.attemptId, 'correction_started');
    await launchCorrection(plan);
  }
  async function launchCorrection(plan: NonNullable<ReturnType<Storage['beginCorrection']>>): Promise<void> {
    const deliveryId = plan.review.deliveryId;
    try {
      await execution.preparePassageHandoff({ passageId: plan.review.passageId });
      if (plan.integration) {
        const previous = storage.getDelivery(deliveryId).delivery;
        await execution.preparePassageHandoff({ passageId: plan.sourcePassageId });
        await workspaces.importIntegrationBase!(previous,plan.integration.operationId,plan.integration);
      }
      if (publication && !await authorityReady(publication.projectStage(plan.review.attemptId, 'inProgress'))) {
        waitingForAuthority.set(plan.review.attemptId,() => launchCorrection(plan)); return;
      }
      const capture = storage.getAttemptCapture(plan.review.attemptId);
      const p = storage.executionPersistence().getPassage({ passageId: plan.passageId });
      const implementer = capture.configuration.implementer_profile; if (!implementer) throw new ExecutionError('RESOURCE_INVALID');
      // Runtime owns and verifies the cwd and session; continuation cannot recruit a replacement.
      await execution.continuePassage({ passageId: plan.sourcePassageId }, { binding: p.binding, profile: profile(implementer),
        criterionIds: capture.criteria.map(c => c.id), previousFindingKeys: plan.findings.map(f => f.id), gitNexusRequired: false, roleResource: p.roleResource,
        task: JSON.stringify({ formatVersion: 1, resultSubmission: resultSubmissionInstructions.implementer, round: p.binding.round, maximumRound: 1 + capture.configuration.configuration.correction_limit,
          dependencyManagement,
          workspaceScope: workspaceScopeInstructions,
          issueProgress: { path: '../progress.md', instruction: 'Treat this file as a navigation aid. Verify its claims against the current workspace and controller evidence, report conflicts, and never include or modify it in the delivery. If it is missing or unreadable, do not infer completion; continue from the captured issue and current state.' },
          review: plan.review, findings: plan.findings, criteria: capture.criteria,
          ...(plan.integration ? { integration: plan.integration,
            integrationInstructions: 'In this owned attempt checkout only, adapt the previously approved task delta to the supplied baseSha, already imported locally. Preserve changes present in that base, resolve conflicts within captured scope, and report additionalChangesJustification. Never touch the supplied operator localPath, never publish or change retained refs. The prior approval is historical. This round requires current criterion evidence and independent review before any delivery commit, push or PR. Do not invent check results or artifacts.' } : {}),
          checks: storage.getProducerResult(deliveryId)?.result.checks ?? [],
          ...(plan.guidance ? { operatorGuidance: plan.guidance, guidanceHandling: 'Apply this contextual guidance without changing the captured criteria, profile, or correction limit.' } : {}),
          prerequisites: 'If a missing prerequisite prevents implementation, record a blocked check in ImplementerResult.checks with the command or validation in id, blocked result in outcome, and concrete cause and limitation in evidence. This suspends the attempt instead of starting review. Do not claim that a text answer ended the attempt; only the controller can end it.',
          authority: 'Correct the supplied findings and their necessary consequences in this same checkout and session. Do not add requirements. Report findingResponses for every supplied finding id. Report additionalChangesJustification as null when no additional change was needed, otherwise explain additional changes for the independent Reviewer. Treat technical execution errors separately from demonstrated product defects. Stop all owned writers before execution_complete. This creates a new captured delivery and independent review.' }) });
    } catch (error) {
      storage.recordDispatchFailure(plan.review.attemptId, error instanceof ExecutionError || error instanceof CaptureError ? error.code : 'CORRECTION_DELIVERY_UNKNOWN'); throw error;
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
      storage.finishCapture(claim, null, code);
      await updateIssueProgress(claim.input.attemptId, 'capture_failed');
      deps.logFailure(code); return;
    }
    // Persist metadata only after the retained ref, parent/base and tree have been verified.
    try { storage.finishCapture(claim, content, null); }
    catch (error) {
      // The Git ref may already exist. Keep it and make the failure recoverable without overwriting it.
      storage.finishCapture(claim, null, 'CAPTURE_PERSISTENCE_FAILED');
      await updateIssueProgress(claim.input.attemptId, 'capture_failed');
      throw error;
    }
    await updateIssueProgress(claim.input.attemptId, 'delivery_captured');
    if (!closed && storage.getDelivery(claim.deliveryId).delivery.captureState === 'captured') {
      await review(claim.deliveryId);
    }
  }
  const unsubscribe = storage.onResultAccepted(binding => {
    if (closed) return;
    enqueue(async () => { if (closed) return;
      await updateIssueProgress(binding.attemptId, binding.role === 'reviewer' ? 'review_result' : 'implementer_result');
      if (binding.role === 'reviewer') {
        // Stop the Reviewer OMP (session stays resumable) so a live process cannot block the next startAttempt.
        try { await execution.preparePassageHandoff({ passageId: binding.passageId }); }
        catch (error) { deps.logFailure(error instanceof ExecutionError ? error.code : 'REVIEW_HANDOFF_FAILED'); }
        if (publication && storage.getReview(binding.deliveryVersion)?.state === 'approved') {
          await publication.publishApproved(binding.deliveryVersion);
          await updateIssueProgress(binding.attemptId, 'review_result');
        }
        else await correct(binding.deliveryVersion);
        return;
      }
      try { await execution.preparePassageHandoff({ passageId: binding.passageId }); }
      catch (error) {
        storage.recordDispatchFailure(binding.attemptId, error instanceof ExecutionError ? error.code : 'CAPTURE_HANDOFF_FAILED'); throw error;
      }
      const producer = storage.getProducerResult(binding.deliveryVersion);
      if (producer?.result.checks.some(check => check.outcome === 'blocked')) {
        storage.recordImplementationBlocked(binding.attemptId);
        await updateIssueProgress(binding.attemptId, 'validation_blocked');
        return;
      }
      const claim = storage.beginCapture(binding.deliveryVersion); if (claim) await capture(claim);
    });
  });
  async function dispatch(id: string): Promise<void> {
    const status = storage.getAttempt(id); const initialCapture = storage.getAttemptCapture(id);
    if (closed || status.suspension || status.result) return;
    if (publication && !await authorityReady(publication.observeAuthority(id))) { waitingForAuthority.set(id,() => dispatch(id)); return; }
    await workspaces.migrateLegacyIssueHistory?.(id);
    storage.recordWorkspace(id, 'starting', false, null);
    const workspaceBinding = storage.getAttemptWorkspaceBinding(id);
    const workspace = await workspaces.prepareAttempt({ attemptId: id, workspace: workspaceBinding.workspace, issueNumber: initialCapture.issue.number,
      source: initialCapture.configuration.configuration.source, baseSha: initialCapture.baseSha,
      predecessorAttemptId: workspaceBinding.predecessor_attempt_id, inheritedBaseSha: workspaceBinding.inherited_base_sha });
    if (!Value.Check(PreparedWorkspace, workspace) || workspace.attemptId !== id || workspace.baseSha !== initialCapture.baseSha ||
      workspace.workspace.project_id !== workspaceBinding.workspace.project_id ||
      workspace.workspace.repository_id !== workspaceBinding.workspace.repository_id ||
      workspace.workspace.issue_id !== workspaceBinding.workspace.issue_id ||
      workspace.branch !== `factory/${initialCapture.issue.number}/${id}` ||
      (workspace.snapshot !== null && !validWorkspaceSnapshot(workspace.snapshot, workspaceBinding, initialCapture.baseSha)) ||
      (workspace.state === 'prepared' && (!workspace.resource.owned || workspace.snapshot === null))) {
      throw new ExecutionError('RESOURCE_INVALID');
    }
    if (workspaceBinding.initial_state.kind === 'pending_inherited_attempt' && workspace.snapshot) {
      storage.recordWorkspaceSnapshot(id, workspace.snapshot);
    }
    storage.recordWorkspace(id, workspace.state === 'prepared' ? 'ready' : 'failed', workspace.resource.owned, workspace.diagnostic?.code ?? null);
    await updateIssueProgress(id, workspace.state === 'prepared' ? 'workspace_ready' : 'workspace_failed');
    if (workspace.state !== 'prepared' || closed || storage.getAttempt(id).result) return;
    const capture = storage.getAttemptCapture(id);
    // Revalidate authority again after workspace reuse; never silently adopt a new base or new summary.
    await preparations.revalidateSummary({ preparationId: capture.preparationId, preparationRevision: capture.preparationRevision, authorizedSummaryHash: capture.summaryHash });
    const predecessor = capture.workspace.predecessor_attempt_id ? storage.getAttempt(capture.workspace.predecessor_attempt_id) : null;
    const previousFindings = predecessor ? storage.getOpenFindings(predecessor.id, predecessor.round) : [];
    const previousReview = predecessor?.deliveryId ? storage.getReview(predecessor.deliveryId) : null;
    const previousContext = predecessor ? {
      attemptId: predecessor.id, phase: predecessor.phase, result: predecessor.result, suspension: predecessor.suspension, diagnostic: predecessor.diagnostic,
      review: previousReview ? { state: previousReview.state, independenceState: previousReview.independenceState,
        findings: previousReview.findings.slice(0, 100).map(({ id, category, problem, evidence, expectedResult, blocking, priority }) =>
          ({ id, category, problem, evidence, expectedResult, blocking, priority })) } : null,
      unresolvedFindings: previousFindings.slice(0, 100).map(({ id, category, problem, evidence, expectedResult, blocking, priority }) =>
        ({ id, category, problem, evidence, expectedResult, blocking, priority })),
      findingsTruncated: previousFindings.length > 100,
    } : null;
    const launch = async (): Promise<void> => {
      if (publication && !await authorityReady(publication.projectStage(id, 'inProgress'))) { waitingForAuthority.set(id,launch); return; }
      const current = storage.getAttempt(id);
      if (closed || current.result || current.suspension) return;
      const passage = storage.executionPersistence().getPassage({ passageId: status.passageId });
      const implementer = capture.configuration.implementer_profile;
      if (!implementer) throw new ExecutionError('RESOURCE_INVALID');
      const request: PassageRequest = { binding: passage.binding, profile: profile(implementer), cwd: workspace.resource.path,
        criterionIds: capture.criteria.map(c => c.id), previousFindingKeys: [], gitNexusRequired: false, roleResource: passage.roleResource,
        task: JSON.stringify({ formatVersion: 1, issue: { id: capture.issue.id, title: capture.issue.title, url: capture.issue.url },
          objective: capture.issue.body, criteria: capture.criteria, baseSha: capture.baseSha, resultSubmission: resultSubmissionInstructions.implementer,
          workspace: capture.workspace, workspaceScope: workspaceScopeInstructions, predecessorProgress: previousContext,
          predecessorFindings: 'Findings from the predecessor are historical context. Verify their consequences in this workspace, but do not include their IDs in findingResponses or claim to resolve them in this attempt. This first round has no current-attempt finding responses; use findingResponses: [].',
          issueProgress: { path: '../progress.md', instruction: 'Treat this file as a navigation aid. Verify its claims against the current workspace and controller evidence, report conflicts, and never include or modify it in the delivery. If it is missing or unreadable, do not infer completion; continue from the captured issue and current state.' },
          guidance: capture.configuration.guidance,
          dependencyManagement,
          technicalValidation: 'Run the project build, typecheck, lint and relevant tests that are available for this change. For each pertinent validation, record its command in id, observed result in outcome, and concrete evidence plus any limitation in evidence. If it was not run, record the concrete reason and limitation. These are results from this passage, not configured commands; do not invent output or claim a check ran when it did not.',
          deliveryMode: capture.configuration.configuration.default_delivery_mode,
          prerequisites: 'If a missing prerequisite prevents implementation, record a blocked check in ImplementerResult.checks with the command or validation in id, blocked result in outcome, and concrete cause and limitation in evidence. This suspends the attempt instead of starting review. Do not claim that a text answer ended the attempt; only the controller can end it.',
          authority: 'Continue from the inherited issue workspace. Preserve existing changes, added files, deletions and uncommitted work. Do not reset, clean or rebase it. Use the recorded comparison snapshot as this attempt’s starting point; address unresolved previous findings and report conflicts or external base changes explicitly. Stop all owned product writers before execution_complete. Publication is performed only by the controller.' }) };
      await execution.startPassage(request, signalFor(id));
    };
    await launch();
  }
  function schedule(id: string): void {
    const task = new Promise<void>(resolve => setImmediate(resolve)).then(() => dispatch(id)).catch(async (error: unknown) => {
      const code = error instanceof ExecutionError || error instanceof OperationError || error instanceof CaptureError || error instanceof ProjectStorageError ? error.code : 'DISPATCH_FAILED';
      try {
        storage.recordDispatchFailure(id, code);
        await updateIssueProgress(id, 'dispatch_failed');
      } catch { deps.logFailure('DISPATCH_PERSISTENCE_FAILED'); }
      deps.logFailure(code);
    }).finally(() => { pending.delete(task); });
    pending.add(task);
  }
  return {
    ...recovery,
    async prepareProjectDeletion(attemptIds: readonly string[], operationId: string) {
      for (const id of attemptIds) revoke(id);
      const inFlight = [...pending];
      for (const id of attemptIds) await execution.cancelAttempt(id, operationId);
      await Promise.all(inFlight);
    },
    setPublicationTarget(id: string, body: import('#contracts').SetPublicationTarget, context: { operationId: string; expectedRevision: string | undefined }) {
      if (!publication) throw new OperationError(503,'PUBLICATION_UNAVAILABLE','A publicação não está disponível neste host.');
      return publication.selectTarget(id,body,context);
    },
    async makeAttemptDecision(attemptId: string, body: MakeAttemptDecision, context: { operationId: string; expectedRevision: string | undefined }) {
      const command = { ...context, attemptId, body };
      const previous = storage.recoverAttemptDecision(command);
      if (previous) return previous;
      if (closed) throw new OperationError(409, 'PIPELINE_CLOSED', 'The controller is shutting down.');
      const successor = body.action === 'change_profile'
        ? await deps.preparations.prepareDecisionSuccessor(attemptId, body.role, body.profileId, body.profileRevision)
        : undefined;
      const accepted = storage.acceptAttemptDecision(command, successor);
      if (accepted.created) await updateIssueProgress(attemptId, 'human_decision');
      if (accepted.created && body.action === 'guidance') enqueue(() => correct(body.deliveryId));
      if (accepted.created && body.action === 'end') {
        revoke(attemptId);
        enqueue(async () => { await cancelAttemptAndUpdateProgress(attemptId, context.operationId); });
      }
      return accepted.operation;
    },
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
      await updateIssueProgress(command.attemptId, 'question_answered');
      if (command.body.action === 'end_attempt') {
        revoke(command.attemptId);
        enqueue(async () => { await cancelAttemptAndUpdateProgress(command.attemptId, command.operationId); });
        return operation;
      }
      const question = storage.getQuestion(command.attemptId, command.questionId).view;
      enqueue(async () => {
        if (closed) return;
        try { await execution.answerQuestion({ passageId: question.passageId }, question.id, command.body.answer, command.operationId); }
        catch (error) { storage.markAnswerUnknown(command); throw error; }
      });
      return operation;
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
