import type { Static } from '@sinclair/typebox';
import { AttemptDecisionView, HttpAttemptDecisionView, MakeAttemptDecision, HttpMakeAttemptDecision } from '#contracts';
import { Value } from '@sinclair/typebox/value';
import { PassageBinding, HttpPassageBinding, ExecutionQuestion, HttpExecutionQuestion, CriterionOutcome, HttpCriterionOutcome, ImplementerResult, HttpImplementerResult, ReviewerResult, HttpReviewerResult, StartAttempt, HttpStartAttempt, AttemptStatus, HttpAttemptStatus, ScopeChange, HttpScopeChange, Question, HttpQuestion, AnswerQuestion, HttpAnswerQuestion, PassageMeasurements, HttpPassageMeasurements, AttemptMeasurements, HttpAttemptMeasurements, AttemptResource, HttpAttemptResource, AttemptResources, HttpAttemptResources, RemovalPlan, HttpRemovalPlan, RemoveResource, HttpRemoveResource, FolderSurface, HttpFolderSurface, PassageInteraction, HttpPassageInteraction, CaptureWarning, HttpCaptureWarning, Delivery, HttpDelivery, DeliveryView, HttpDeliveryView, CaptureRetry, HttpCaptureRetry, DiffEntry, HttpDiffEntry, DeliveryDiff, HttpDeliveryDiff, Finding, HttpFinding, Review, HttpReview, RoundHistory, HttpRoundHistory, ProducerResult, HttpProducerResult, EffectIdentity, HttpEffectIdentity, EffectReceipt, HttpEffectReceipt, EffectView, HttpEffectView, CompletePublication, HttpCompletePublication, ReconcilePublication, HttpReconcilePublication, AuthorizeUpgrade, HttpAuthorizeUpgrade, ModeUpgradeSummary, HttpModeUpgradeSummary, PublicationSummary, HttpPublicationSummary, AttemptListQuery, HttpAttemptListQuery, AttemptSummary, HttpAttemptSummary, AttemptPage, HttpAttemptPage, AttemptDetailQuery, HttpAttemptDetailQuery, PassageSummary, HttpPassageSummary, ReviewSummary, HttpReviewSummary, QuestionSummary, HttpQuestionSummary, FindingDetail, HttpFindingDetail, DetailItem, HttpDetailItem, DetailPage, HttpDetailPage, HttpHistoricalEffectiveProfile, AttemptDetail, HttpAttemptDetail, DeliveryDetail, HttpDeliveryDetail, HttpDeliveryDetailQuery, DeliveryDetailQuery } from '#contracts';

// Field-by-field HTTP projection. Never rename private documents, facts or operator content.
function invalidView(): never { throw new Error('Invalid execution view.'); }

export function toHttpPassageBinding(value: Static<typeof PassageBinding>): Static<typeof HttpPassageBinding> {
  return { attempt_id: value.attemptId, passage_id: value.passageId, role: value.role, round: value.round, delivery_version: value.deliveryVersion };
}

export function toHttpExecutionQuestion(value: Static<typeof ExecutionQuestion>): Static<typeof HttpExecutionQuestion> {
  return { format_version: value.formatVersion, decision: value.decision, context: value.context, alternatives: value.alternatives };
}

export function toHttpCriterionOutcome(value: Static<typeof CriterionOutcome>): Static<typeof HttpCriterionOutcome> {
  return { criterion_id: value.criterionId, verdict: value.verdict, evidence: value.evidence };
}

export function toHttpImplementerResult(value: Static<typeof ImplementerResult>): Static<typeof HttpImplementerResult> {
  return { additional_changes_justification: value.additionalChangesJustification ?? null, format_version: value.formatVersion, summary: value.summary, writes_stopped: value.writesStopped, ...(value.declaredFiles === undefined ? {} : { declared_files: value.declaredFiles }), ...(value.findingResponses === undefined ? {} : { finding_responses: value.findingResponses.map(entry1 => ({ finding_id: entry1.findingId, response_type: entry1.responseType ?? null, response: entry1.response, evidence: entry1.evidence })) }), criteria: value.criteria.map(entry1 => (toHttpCriterionOutcome(entry1))), checks: value.checks };
}

export function toHttpReviewerResult(value: Static<typeof ReviewerResult>): Static<typeof HttpReviewerResult> {
  return { ...(value.disputeResponses === undefined ? {} : { dispute_responses: value.disputeResponses.map(x => ({ dispute_id: x.disputeId, verdict: x.verdict, justification: x.justification, evidence: x.evidence })) }), ...(value.assessments === undefined ? {} : { assessments: value.assessments.map(x => ({ finding_id: x.findingId, progress: x.progress, evidence: x.evidence, justification: x.justification })) }), command_repetitions: value.commandRepetitions ?? [], format_version: value.formatVersion, summary: value.summary, verdict: value.verdict, criteria: value.criteria.map(entry1 => (toHttpCriterionOutcome(entry1))), findings: value.findings.map(entry1 => ({ key: entry1.key, criterion_ids: entry1.criterionIds, category: entry1.category, problem: entry1.problem, evidence: entry1.evidence, expected_result: entry1.expectedResult, blocking: entry1.blocking, ...(entry1.priority === undefined ? {} : { priority: entry1.priority }), ...(entry1.originFindingId === undefined ? {} : { origin_finding_id: entry1.originFindingId }) })), resolutions: value.resolutions.map(entry1 => ({ finding_key: entry1.findingKey, verdict: entry1.verdict, evidence: entry1.evidence })) };
}

export function toHttpStartAttempt(value: Static<typeof StartAttempt>): Static<typeof HttpStartAttempt> {
  return { preparation_id: value.preparationId, preparation_revision: value.preparationRevision, authorized_summary_hash: value.authorizedSummaryHash, authorized: value.authorized };
}

export function toHttpAttemptStatus(value: Static<typeof AttemptStatus>): Static<typeof HttpAttemptStatus> {
  return { id: value.id, project_id: value.projectId, operation_id: value.operationId, passage_id: value.passageId, round: value.round, phase: value.phase, result: value.result, suspension: value.suspension, tracking: value.tracking, diagnostic: value.diagnostic, result_receipt_id: value.resultReceiptId, delivery_id: value.deliveryId, ...(value.pendingQuestionId === undefined ? {} : { pending_question_id: value.pendingQuestionId }), revision: value.revision, event_cursor: value.eventCursor };
}

export function toHttpScopeChange(value: Static<typeof ScopeChange>): Static<typeof HttpScopeChange> {
  return { captured_criteria: value.capturedCriteria, current_criteria: value.currentCriteria, captured_digest: value.capturedDigest, current_digest: value.currentDigest, reasons: value.reasons, observed_at_ms: value.observedAtMs };
}

export function toHttpQuestion(value: Static<typeof Question>): Static<typeof HttpQuestion> {
  return { id: value.id, attempt_id: value.attemptId, passage_id: value.passageId, delivery_id: value.deliveryId, question: toHttpExecutionQuestion(value.question), scope_change: value.scopeChange === null ? null : toHttpScopeChange(value.scopeChange), state: value.state, revision: value.revision, raised_at_ms: value.raisedAtMs, answered_at_ms: value.answeredAtMs, ttl: value.ttl, expired_at_ms: value.expiredAtMs, answer: value.answer, answer_operation_id: value.answerOperationId, delivery_receipt: value.deliveryReceipt === null ? null : { operation_id: value.deliveryReceipt.operationId, question_id: value.deliveryReceipt.questionId, passage_id: value.deliveryReceipt.passageId, received_at_ms: value.deliveryReceipt.receivedAtMs } };
}

export function toHttpAnswerQuestion(value: Static<typeof AnswerQuestion>): Static<typeof HttpAnswerQuestion> {
  return { answer: value.answer, ...(value.action ? { action: value.action } : {}), ...(value.scopeChoice === undefined ? {} : { scope_choice: value.scopeChoice }) };
}

export function toHttpPassageMeasurements(value: Static<typeof PassageMeasurements>): Static<typeof HttpPassageMeasurements> {
  return { passage_id: value.passageId, role: value.role, round: value.round, active_time: value.activeTime, human_wait: value.humanWait, active_limit_state: value.activeLimitState, active_expired_at_ms: value.activeExpiredAtMs };
}

export function toHttpAttemptMeasurements(value: Static<typeof AttemptMeasurements>): Static<typeof HttpAttemptMeasurements> {
  return { stage_activity: value.stageActivity, active_time: value.activeTime, human_wait: value.humanWait, cost: value.cost, active_limit: value.activeLimit, question_ttl: value.questionTtl, active_limit_state: value.activeLimitState, active_expired_at_ms: value.activeExpiredAtMs, passages: value.passages.map(entry1 => (toHttpPassageMeasurements(entry1))), pending_requirements: value.pendingRequirements.map(entry1 => ({ cause: entry1.cause, affected_requirements: entry1.affectedRequirements, pending: entry1.pending })) };
}

export function toHttpAttemptResource(value: Static<typeof AttemptResource>): Static<typeof HttpAttemptResource> {
  return { id: value.id, attempt_id: value.attemptId, passage_id: value.passageId, kind: value.kind, reference: value.reference, owned: value.owned, launch_state: value.launchState, stop_state: value.stopState, diagnostic: value.diagnostic, revision: value.revision, removed: value.removed };
}

export function toHttpAttemptResources(value: Static<typeof AttemptResources>): Static<typeof HttpAttemptResources> {
  return { entries: value.entries.map(entry1 => (toHttpAttemptResource(entry1))), cleanup: value.cleanup, event_cursor: value.eventCursor };
}

export function toHttpRemovalPlan(value: Static<typeof RemovalPlan>): Static<typeof HttpRemovalPlan> {
  return { resource_id: value.resourceId, location_display: value.locationDisplay, losses: value.losses, preserved_references: value.preservedReferences, plan_hash: value.planHash, capability: value.capability };
}

export function toHttpRemoveResource(value: Static<typeof RemoveResource>): Static<typeof HttpRemoveResource> {
  return { plan_hash: value.planHash, confirmed: value.confirmed };
}

export function toHttpFolderSurface(value: Static<typeof FolderSurface>): Static<typeof HttpFolderSurface> {
  return { resource_id: value.resourceId, location_display: value.locationDisplay, open_capability: value.openCapability, event_cursor: value.eventCursor };
}

export function toHttpPassageInteraction(value: Static<typeof PassageInteraction>): Static<typeof HttpPassageInteraction> {
  return { session_reference: value.sessionReference, open_capability: value.openCapability, event_cursor: value.eventCursor };
}

export function toHttpCaptureWarning(value: Static<typeof CaptureWarning>): Static<typeof HttpCaptureWarning> {
  return { attempt_id: value.attemptId, passage_id: value.passageId, delivery_id: value.deliveryId, path: value.path, reason: value.reason };
}

export function toHttpDelivery(value: Static<typeof Delivery>): Static<typeof HttpDelivery> {
  return { id: value.id, attempt_id: value.attemptId, producer_passage_id: value.producerPassageId, round: value.round, base_sha: value.baseSha, capture_state: value.captureState, git_ref: value.gitRef, repository_relative: value.repositoryRelative, content_identity: value.contentIdentity, commit_sha: value.commitSha, has_delta: value.hasDelta, diagnostic: value.diagnostic, captured_at_ms: value.capturedAtMs, revision: value.revision, warnings: value.warnings.map(entry1 => (toHttpCaptureWarning(entry1))) };
}

export function toHttpDeliveryView(value: Static<typeof DeliveryView>): Static<typeof HttpDeliveryView> {
  return { delivery: toHttpDelivery(value.delivery), event_cursor: value.eventCursor };
}

export function toHttpCaptureRetry(value: Static<typeof CaptureRetry>): Static<typeof HttpCaptureRetry> {
  return { producer_passage_id: value.producerPassageId };
}

export function toHttpDiffEntry(value: Static<typeof DiffEntry>): Static<typeof HttpDiffEntry> {
  return { path: value.path, old_path: value.oldPath, status: value.status, old_mode: value.oldMode, new_mode: value.newMode, binary: value.binary, unsupported: value.unsupported, patch: value.patch };
}

export function toHttpDeliveryDiff(value: Static<typeof DeliveryDiff>): Static<typeof HttpDeliveryDiff> {
  return { delivery_id: value.deliveryId, base_sha: value.baseSha, content_identity: value.contentIdentity, entries: value.entries.map(entry1 => (toHttpDiffEntry(entry1))), next_cursor: value.nextCursor, has_more: value.hasMore };
}

export function toHttpFinding(value: Static<typeof Finding>): Static<typeof HttpFinding> {
  return { priority: value.priority, origin_finding_id: value.originFindingId, delivery_id: value.deliveryId, content_identity: value.contentIdentity, key: value.key, criterion_ids: value.criterionIds, category: value.category, problem: value.problem, evidence: value.evidence, expected_result: value.expectedResult, blocking: value.blocking, id: value.id, review_id: value.reviewId, attempt_id: value.attemptId };
}

export function toHttpReview(value: Static<typeof Review>): Static<typeof HttpReview> {
  return { dispute_details_url: `/api/v1/attempts/${value.attemptId}?section=finding_disputes`, command_repetitions: value.commandRepetitions ?? [], id: value.id, delivery_id: value.deliveryId, attempt_id: value.attemptId, passage_id: value.passageId, implementer_passage_id: value.implementerPassageId, content_identity: value.contentIdentity, state: value.state, declared_verdict: value.declaredVerdict, reason: value.reason, independence_state: value.independenceState, diagnostic: value.diagnostic, created_at_ms: value.createdAtMs, completed_at_ms: value.completedAtMs, criteria: value.criteria.map(entry1 => (toHttpCriterionOutcome(entry1))), findings: value.findings.map(entry1 => (toHttpFinding(entry1))), resolutions: value.resolutions.map(entry1 => ({ finding_id: entry1.findingId, verdict: entry1.verdict, evidence: entry1.evidence })) };
}

export function toHttpRoundHistory(value: Static<typeof RoundHistory>): Static<typeof HttpRoundHistory> {
  return { entries: value.entries.map(entry1 => ({ round: entry1.round, delivery_id: entry1.deliveryId, producer_passage_id: entry1.producerPassageId, producer_receipt_id: entry1.producerReceiptId, review_id: entry1.reviewId, review_state: entry1.reviewState, content_identity: entry1.contentIdentity })) };
}

export function toHttpProducerResult(value: Static<typeof ProducerResult>): Static<typeof HttpProducerResult> {
  return value === null ? null : { binding: toHttpPassageBinding(value.binding), result: toHttpImplementerResult(value.result), sha256: value.sha256, receipt_id: value.receiptId };
}

export function toHttpEffectIdentity(value: Static<typeof EffectIdentity>): Static<typeof HttpEffectIdentity> {
  return { ...(value.branchKind === undefined ? {} : { branch_kind:value.branchKind }), ...(value.repositoryId === undefined ? {} : { repository_id: value.repositoryId }), ...(value.issueId === undefined ? {} : { issue_id: value.issueId }), ...(value.ownerId === undefined ? {} : { owner_id: value.ownerId }), ...(value.visibility === undefined ? {} : { visibility: value.visibility }), ...(value.planHash === undefined ? {} : { plan_hash: value.planHash }), ...(value.contentIdentity === undefined ? {} : { content_identity: value.contentIdentity }), ...(value.parentSha === undefined ? {} : { parent_sha: value.parentSha }), ...(value.branchRef === undefined ? {} : { branch_ref: value.branchRef }), ...(value.issueNumber === undefined ? {} : { issue_number: value.issueNumber }), ...(value.commitSha === undefined ? {} : { commit_sha: value.commitSha }), ...(value.commitOperationId === undefined ? {} : { commit_operation_id: value.commitOperationId }), ...(value.targetOperationId === undefined ? {} : { target_operation_id: value.targetOperationId }), ...(value.taskType === undefined ? {} : { task_type: value.taskType }), ...(value.taskDescription === undefined ? {} : { task_description: value.taskDescription }), ...(value.repositoryOwner === undefined ? {} : { repository_owner: value.repositoryOwner }), ...(value.repositoryName === undefined ? {} : { repository_name: value.repositoryName }), ...(value.baseBranch === undefined ? {} : { base_branch: value.baseBranch }), ...(value.title === undefined ? {} : { title: value.title }), ...(value.commitTime === undefined ? {} : { commit_time: value.commitTime }), ...(value.marker === undefined ? {} : { marker: value.marker }), ...(value.bodyHash === undefined ? {} : { body_hash: value.bodyHash }), ...(value.criterionIds === undefined ? {} : { criterion_ids: value.criterionIds }), ...(value.projectId === undefined ? {} : { project_id: value.projectId }), ...(value.itemId === undefined ? {} : { item_id: value.itemId }), ...(value.fieldId === undefined ? {} : { field_id: value.fieldId }), ...(value.optionId === undefined ? {} : { option_id: value.optionId }), ...(value.previousOptionId === undefined ? {} : { previous_option_id: value.previousOptionId }) };
}

export function toHttpEffectReceipt(value: Static<typeof EffectReceipt>): Static<typeof HttpEffectReceipt> {
  return { id: value.id, ...(value.url === undefined ? {} : { url: value.url }), ...(value.optionId === undefined ? {} : { option_id: value.optionId }), ...(value.contentIdentity === undefined ? {} : { content_identity: value.contentIdentity }), ...(value.parentSha === undefined ? {} : { parent_sha: value.parentSha }), ...(value.branchRef === undefined ? {} : { branch_ref: value.branchRef }), ...(value.operationId === undefined ? {} : { operation_id: value.operationId }), ...(value.targetOperationId === undefined ? {} : { target_operation_id: value.targetOperationId }), ...(value.commitSha === undefined ? {} : { commit_sha: value.commitSha }), ...(value.repositoryId === undefined ? {} : { repository_id: value.repositoryId }), ...(value.baseBranch === undefined ? {} : { base_branch: value.baseBranch }), ...(value.taskType === undefined ? {} : { task_type: value.taskType }), ...(value.taskDescription === undefined ? {} : { task_description: value.taskDescription }), ...(value.ownerId === undefined ? {} : { owner_id: value.ownerId }), ...(value.repositoryName === undefined ? {} : { repository_name: value.repositoryName }), ...(value.visibility === undefined ? {} : { visibility: value.visibility }) };
}

export function toHttpEffectView(value: Static<typeof EffectView>): Static<typeof HttpEffectView> {
  return { operation_id: value.operationId, attempt_id: value.attemptId, creation_id: value.creationId, delivery_id: value.deliveryId, kind: value.kind, scope_key: value.scopeKey, state: value.state, expected_identity: toHttpEffectIdentity(value.expectedIdentity), confirmed_identity: value.confirmedIdentity === null ? null : toHttpEffectReceipt(value.confirmedIdentity), receipt: value.receipt === null ? null : toHttpEffectReceipt(value.receipt), reason: value.reason, authorized: value.authorized, revision: value.revision, sent_at_ms: value.sentAtMs, confirmed_at_ms: value.confirmedAtMs };
}

export function toHttpCompletePublication(value: Static<typeof CompletePublication>): Static<typeof HttpCompletePublication> {
  return { delivery_id: value.deliveryId, authorized_mode: value.authorizedMode, authorized: value.authorized };
}

export function toHttpReconcilePublication(value: Static<typeof ReconcilePublication>): Static<typeof HttpReconcilePublication> {
  return { delivery_id: value.deliveryId };
}

export function toHttpAuthorizeUpgrade(value: Static<typeof AuthorizeUpgrade>): Static<typeof HttpAuthorizeUpgrade> {
  return { delivery_id: value.deliveryId, current_mode: value.currentMode, target_mode: value.targetMode, authorized_additional_effects_hash: value.authorizedAdditionalEffectsHash, authorized: value.authorized };
}

export function toHttpModeUpgradeSummary(value: Static<typeof ModeUpgradeSummary>): Static<typeof HttpModeUpgradeSummary> {
  return { target_mode: value.targetMode, additional_effects: value.additionalEffects, ...(value.deliveryBranch === undefined ? {} : { delivery_branch:value.deliveryBranch }), summary_hash: value.summaryHash, capability: value.capability };
}

export function toHttpPublicationSummary(value: Static<typeof PublicationSummary>): Static<typeof HttpPublicationSummary> {
  return { mode: value.mode, review_state: value.reviewState, local_state: value.localState, ...(value.commit === undefined ? {} : { commit: { state: value.commit.state, sha: value.commit.sha, reason: value.commit.reason, operation_id: value.commit.operationId,branch_ref:value.commit.branchRef,task_type:value.commit.taskType,task_description:value.commit.taskDescription,...(value.commit.blocked === undefined ? {} : { blocked: { paths: value.commit.blocked.paths, path_count: value.commit.blocked.pathCount, expected_branch: value.commit.blocked.expectedBranch, current_branch: value.commit.blocked.currentBranch } }) } }), ...(value.upgrades === undefined ? {} : { upgrades: value.upgrades.map(entry1 => (toHttpModeUpgradeSummary(entry1))) }), ...(value.push === undefined ? {} : { push: { state: value.push.state, receipt: value.push.receipt === null ? null : toHttpEffectReceipt(value.push.receipt), reason: value.push.reason } }), ...(value.pullRequest === undefined ? {} : { pull_request: { state: value.pullRequest.state, receipt: value.pullRequest.receipt === null ? null : toHttpEffectReceipt(value.pullRequest.receipt), reason: value.pullRequest.reason } }), confirmed_effects: value.confirmedEffects, pending_effects: value.pendingEffects, unknown_effects: value.unknownEffects, complete_capability: value.completeCapability, reconcile_capability: value.reconcileCapability };
}

export function toHttpAttemptListQuery(value: Static<typeof AttemptListQuery>): Static<typeof HttpAttemptListQuery> {
  return {
    ...(value.cursor === undefined ? {} : { cursor: value.cursor }), ...(value.limit === undefined ? {} : { limit: value.limit }),
    ...(value.projectId === undefined ? {} : { project_id: value.projectId }), ...(value.result === undefined ? {} : { result: value.result }),
    ...(value.issueNumber === undefined ? {} : { issue_number: value.issueNumber }), ...(value.issueTitle === undefined ? {} : { issue_title: value.issueTitle }),
    ...(value.dateFrom === undefined ? {} : { date_from: value.dateFrom }), ...(value.dateTo === undefined ? {} : { date_to: value.dateTo }),
    ...(value.timeZone === undefined ? {} : { time_zone: value.timeZone }),
  };
}

export function toHttpAttemptSummary(value: Static<typeof AttemptSummary>): Static<typeof HttpAttemptSummary> {
  return { id: value.id, project_id: value.projectId, issue_id: value.issueId, issue_number: value.issueNumber, ...(value.issueTitle === undefined ? {} : { issue_title: value.issueTitle }), ...(value.diagnostic === undefined ? {} : { diagnostic: value.diagnostic }), phase: value.phase, result: value.result, suspension: value.suspension, revision: value.revision, created_at_ms: value.createdAtMs, updated_at_ms: value.updatedAtMs, ...(value.publicationFailure ? { publication_failure: value.publicationFailure } : {}) };
}

export function toHttpAttemptPage(value: Static<typeof AttemptPage>): Static<typeof HttpAttemptPage> {
  return { items: value.items.map(entry1 => (toHttpAttemptSummary(entry1))), next_cursor: value.next_cursor, has_more: value.has_more, event_cursor: value.event_cursor };
}

export function toHttpAttemptDetailQuery(value: Static<typeof AttemptDetailQuery>): Static<typeof HttpAttemptDetailQuery> {
  return { ...(value.cursor === undefined ? {} : { cursor: value.cursor }), ...(value.limit === undefined ? {} : { limit: value.limit }), ...(value.roundId === undefined ? {} : { round_id: value.roundId }), ...(value.deliveryId === undefined ? {} : { delivery_id: value.deliveryId }), ...(value.section === undefined ? {} : { section: value.section }) };
}

export function toHttpPassageSummary(value: Static<typeof PassageSummary>): Static<typeof HttpPassageSummary> {
  return { id: value.id, attempt_id: value.attemptId, delivery_id: value.deliveryId, round: value.round, role: value.role, state: value.state, tracking: value.tracking, diagnostic: value.diagnostic, result_receipt_id: value.resultReceiptId, created_at_ms: value.createdAtMs,
    attempt_session_id: value.attemptSessionId ?? null, session_state: value.sessionState ?? null, session_source_id: value.sessionSourceId ?? null,
    terminal_name: value.terminalName ?? null, terminal_state: value.terminalState ?? null, occupancy_state: value.occupancyState ?? null };
}

export function toHttpReviewSummary(value: Static<typeof ReviewSummary>): Static<typeof HttpReviewSummary> {
  return { id: value.id, delivery_id: value.deliveryId, attempt_id: value.attemptId, passage_id: value.passageId, implementer_passage_id: value.implementerPassageId, content_identity: value.contentIdentity, state: value.state, declared_verdict: value.declaredVerdict, reason: value.reason, independence_state: value.independenceState, diagnostic: value.diagnostic, created_at_ms: value.createdAtMs, completed_at_ms: value.completedAtMs };
}

export function toHttpQuestionSummary(value: Static<typeof QuestionSummary>): Static<typeof HttpQuestionSummary> {
  return { id: value.id, attempt_id: value.attemptId, passage_id: value.passageId, delivery_id: value.deliveryId, state: value.state, revision: value.revision, created_at_ms: value.createdAtMs, expires_at_ms: value.expiresAtMs, delivery_receipt: value.deliveryReceipt === null ? null : { operation_id: value.deliveryReceipt.operationId, question_id: value.deliveryReceipt.questionId, passage_id: value.deliveryReceipt.passageId, received_at_ms: value.deliveryReceipt.receivedAtMs } };
}

export function toHttpFindingDetail(value: Static<typeof FindingDetail>): Static<typeof HttpFindingDetail> {
  return { priority: value.priority, origin_finding_id: value.originFindingId, delivery_id: value.deliveryId, content_identity: value.contentIdentity, key: value.key, criterion_ids: value.criterionIds, category: value.category, problem: value.problem, evidence: value.evidence, expected_result: value.expectedResult, blocking: value.blocking, id: value.id, review_id: value.reviewId, attempt_id: value.attemptId, resolutions: value.resolutions.map(entry1 => ({ review_id: entry1.reviewId, delivery_id: entry1.deliveryId, verdict: entry1.verdict, evidence: entry1.evidence })) };
}

export function toHttpFindingAssessment(value: import('#contracts').FindingAssessment): import('#contracts').HttpFindingAssessment {
  return { id: value.id, attempt_id: value.attemptId, finding_id: value.findingId, review_id: value.reviewId, delivery_id: value.deliveryId, round: value.round, content_identity: value.contentIdentity, progress: value.progress, evidence: value.evidence, justification: value.justification, created_at_ms: value.createdAtMs };
}
export function toHttpFindingDispute(value: import('#contracts').FindingDispute): import('#contracts').HttpFindingDispute {
  return { id: value.id, attempt_id: value.attemptId, finding_id: value.findingId, passage_id: value.passageId,
    delivery_id: value.deliveryId, content_identity: value.contentIdentity, justification: value.justification, evidence: value.evidence,
    response_review_id: value.responseReviewId, response_verdict: value.responseVerdict, response_justification: value.responseJustification,
    response_evidence: value.responseEvidence, created_at_ms: value.createdAtMs, responded_at_ms: value.respondedAtMs,
    response_delivery_id: value.responseDeliveryId, response_content_identity: value.responseContentIdentity };
}
export function toHttpAttemptDecisionView(value: Static<typeof AttemptDecisionView>): Static<typeof HttpAttemptDecisionView> {
  return { id: value.id, operation_id: value.operationId, attempt_id: value.attemptId, delivery_id: value.deliveryId,
    block_id: value.blockId, block_revision: value.blockRevision, block_reason: value.blockReason, action: value.action,
    guidance: value.guidance, successor_preparation_id: value.successorPreparationId,
    successor_preparation_revision: value.successorPreparationRevision, created_at_ms: value.createdAtMs };
}
export function toHttpDetailItem(value: Static<typeof DetailItem>): Static<typeof HttpDetailItem> {
  if ('responseReviewId' in value) return toHttpFindingDispute(value);
  if ('progress' in value && 'findingId' in value) return toHttpFindingAssessment(value);
  if ('operationId' in value && 'blockId' in value) return toHttpAttemptDecisionView(value);
  return Value.Check(DetailItem.anyOf[0], value) ? { round: value.round, delivery_id: value.deliveryId, producer_passage_id: value.producerPassageId, producer_receipt_id: value.producerReceiptId, review_id: value.reviewId, review_state: value.reviewState, content_identity: value.contentIdentity } : Value.Check(DetailItem.anyOf[1], value) ? toHttpPassageSummary(value) : Value.Check(DetailItem.anyOf[2], value) ? value : Value.Check(DetailItem.anyOf[3], value) ? toHttpReviewSummary(value) : Value.Check(DetailItem.anyOf[4], value) ? toHttpFindingDetail(value) : Value.Check(DetailItem.anyOf[5], value) ? toHttpQuestionSummary(value) : Value.Check(DetailItem.anyOf[6], value) ? toHttpEffectView(value) : Value.Check(DetailItem.anyOf[7], value) ? toHttpAttemptResource(value) : Value.Check(DetailItem.anyOf[8], value) && Value.Check(HttpHistoricalEffectiveProfile, {
    role: value.role, profile_id: value.profileId, profile_revision: value.profileRevision, executor: value.executor, provider: value.provider,
    model: value.model, effort: value.effort, guidance: value.guidance, composition_version: value.compositionVersion,
    context_summary: value.contextSummary, technical_contract_summary: value.technicalContractSummary, credentials_redacted: value.credentialsRedacted,
  }) ? { role: value.role, profile_id: value.profileId, profile_revision: value.profileRevision, executor: value.executor, provider: value.provider,
    model: value.model, effort: value.effort, guidance: value.guidance, composition_version: value.compositionVersion,
    context_summary: value.contextSummary, technical_contract_summary: value.technicalContractSummary, credentials_redacted: value.credentialsRedacted } : invalidView();
}

export function toHttpDetailPage(value: Static<typeof DetailPage>): Static<typeof HttpDetailPage> {
  return { section: value.section, items: value.items.map(entry1 => (toHttpDetailItem(entry1))), next_cursor: value.next_cursor, has_more: value.has_more, event_cursor: value.event_cursor };
}

export function toHttpAttemptDetail(value: Static<typeof AttemptDetail>): Static<typeof HttpAttemptDetail> {
  const delivery_summary = value.deliverySummary;
  const v3Details = value.v3Details === null ? null : value.v3Details.section === 'finding_disputes'
    ? { ...value.v3Details, items: value.v3Details.items.map(toHttpFindingDispute) }
    : value.v3Details.section === 'decisions'
      ? { ...value.v3Details, items: value.v3Details.items.map(toHttpAttemptDecisionView) }
      : { ...value.v3Details, items: value.v3Details.items.map(toHttpFindingAssessment) };
  return { stage_activity: value.stageActivity, workspace_lineage: value.workspaceLineage, delivery_summary, id: value.id, project_id: value.projectId, operation_id: value.operationId, passage_id: value.passageId, round: value.round, phase: value.phase, result: value.result, suspension: value.suspension, tracking: value.tracking, diagnostic: value.diagnostic, result_receipt_id: value.resultReceiptId, delivery_id: value.deliveryId, ...(value.pendingQuestionId === undefined ? {} : { pending_question_id: value.pendingQuestionId }), revision: value.revision, event_cursor: value.eventCursor, block: value.block, v3_details: v3Details, ...(value.historySections ? { history_sections: value.historySections } : {}), expected_account_id: value.expectedAccountId, issue: value.issue, selected_delivery_id: value.selectedDeliveryId, selected_round: value.selectedRound, publication: toHttpPublicationSummary(value.publication), measurements: toHttpAttemptMeasurements(value.measurements), cleanup: value.cleanup, authority: value.authority === null ? null : { reason: value.authority.reason, expected_status_id: value.authority.expectedStatusId, observed_status_id: value.authority.observedStatusId, observed_at_ms: value.authority.observedAtMs, recovery: value.authority.recovery }, capabilities: { cancel: value.capabilities.cancel, complete_publication: value.capabilities.completePublication, reconcile_publication: value.capabilities.reconcilePublication, revalidate: value.capabilities.revalidate }, details: value.details === null ? null : toHttpDetailPage(value.details) };
}

export function toHttpDeliveryDetail(value: Static<typeof DeliveryDetail>): Static<typeof HttpDeliveryDetail> {
  return { delivery_summary: value.deliverySummary, delivery: toHttpDelivery(value.delivery), event_cursor: value.eventCursor, issue: value.issue, attempt: toHttpAttemptStatus(value.attempt), measurements: toHttpAttemptMeasurements(value.measurements), cleanup: value.cleanup, authorizations: { captured_mode: value.authorizations.capturedMode, authorized_mode: value.authorizations.authorizedMode, requires_current_gate: value.authorizations.requiresCurrentGate }, review: value.review === null ? null : toHttpReviewSummary(value.review), publication: toHttpPublicationSummary(value.publication), capabilities: { diff: value.capabilities.diff, complete_publication: value.capabilities.completePublication, reconcile_publication: value.capabilities.reconcilePublication }, details: value.details === null ? null : toHttpDetailPage(value.details) };
}

export function fromHttpStartAttempt(value: Static<typeof HttpStartAttempt>): Static<typeof StartAttempt> {
  return { preparationId: value.preparation_id, preparationRevision: value.preparation_revision, authorizedSummaryHash: value.authorized_summary_hash, authorized: value.authorized };
}

export function fromHttpMakeAttemptDecision(value: Static<typeof HttpMakeAttemptDecision>): Static<typeof MakeAttemptDecision> {
  const common = { blockId: value.block_id, blockRevision: value.block_revision, deliveryId: value.delivery_id, authorized: value.authorized };
  return value.action === 'guidance' ? { ...common, action: value.action, guidance: value.guidance }
    : value.action === 'change_profile' ? { ...common, action: value.action, profileId: value.profile_id, profileRevision: value.profile_revision, role: value.role }
    : { ...common, action: value.action };
}

export function fromHttpAnswerQuestion(value: Static<typeof HttpAnswerQuestion>): Static<typeof AnswerQuestion> {
  return { answer: value.answer, ...(value.action ? { action: value.action } : {}), ...(value.scope_choice === undefined ? {} : { scopeChoice: value.scope_choice }) };
}

export function fromHttpRemoveResource(value: Static<typeof HttpRemoveResource>): Static<typeof RemoveResource> {
  return { planHash: value.plan_hash, confirmed: value.confirmed };
}

export function fromHttpCaptureRetry(value: Static<typeof HttpCaptureRetry>): Static<typeof CaptureRetry> {
  return { producerPassageId: value.producer_passage_id };
}

export function fromHttpCompletePublication(value: Static<typeof HttpCompletePublication>): Static<typeof CompletePublication> {
  return { deliveryId: value.delivery_id, authorizedMode: value.authorized_mode, authorized: value.authorized };
}

export function fromHttpReconcilePublication(value: Static<typeof HttpReconcilePublication>): Static<typeof ReconcilePublication> {
  return { deliveryId: value.delivery_id };
}

export function fromHttpAuthorizeUpgrade(value: Static<typeof HttpAuthorizeUpgrade>): Static<typeof AuthorizeUpgrade> {
  return { deliveryId: value.delivery_id, currentMode: value.current_mode, targetMode: value.target_mode, authorizedAdditionalEffectsHash: value.authorized_additional_effects_hash, authorized: value.authorized };
}

export function fromHttpAttemptListQuery(value: Static<typeof HttpAttemptListQuery>): Static<typeof AttemptListQuery> {
  return {
    ...(value.cursor === undefined ? {} : { cursor: value.cursor }), ...(value.limit === undefined ? {} : { limit: value.limit }),
    ...(value.project_id === undefined ? {} : { projectId: value.project_id }), ...(value.result === undefined ? {} : { result: value.result }),
    ...(value.issue_number === undefined ? {} : { issueNumber: value.issue_number }), ...(value.issue_title === undefined ? {} : { issueTitle: value.issue_title }),
    ...(value.date_from === undefined ? {} : { dateFrom: value.date_from }), ...(value.date_to === undefined ? {} : { dateTo: value.date_to }),
    ...(value.time_zone === undefined ? {} : { timeZone: value.time_zone }),
  };
}

export function fromHttpAttemptDetailQuery(value: Static<typeof HttpAttemptDetailQuery>): Static<typeof AttemptDetailQuery> {
  return { ...(value.cursor === undefined ? {} : { cursor: value.cursor }), ...(value.limit === undefined ? {} : { limit: value.limit }), ...(value.round_id === undefined ? {} : { roundId: value.round_id }), ...(value.delivery_id === undefined ? {} : { deliveryId: value.delivery_id }), ...(value.section === undefined ? {} : { section: value.section }) };
}

export function fromHttpDeliveryDetailQuery(value: Static<typeof HttpDeliveryDetailQuery>): Static<typeof DeliveryDetailQuery> {
  return value;
}
