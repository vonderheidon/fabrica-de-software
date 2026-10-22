import type { Static } from '@sinclair/typebox';
import { DiagnosticCheck, HttpDiagnosticCheck, DiagnosticContext, HttpDiagnosticContext, DiagnosticChecks, HttpDiagnosticChecks, DiagnosticRequest, HttpDiagnosticRequest, ContextDiagnostic, HttpContextDiagnostic, DiagnosticReport, HttpDiagnosticReport, DiagnosticsView, HttpDiagnosticsView, OperationSummaryQuery, HttpOperationSummaryQuery, OperationSummary, HttpOperationSummary, QueueScope, HttpQueueScope, QueueReason, HttpQueueReason, QueueItem, HttpQueueItem, QueueDiagnostic, HttpQueueDiagnostic, QueueObservation, HttpQueueObservation, QueueQuery, HttpQueueQuery, QueueCommand, HttpQueueCommand, QueueSaved, HttpQueueSaved, CreationMode, HttpCreationMode, ScaffoldInput, HttpScaffoldInput, ScaffoldFile, HttpScaffoldFile, ScaffoldAccount, HttpScaffoldAccount, ScaffoldEngineering, HttpScaffoldEngineering, ScaffoldPlan, HttpScaffoldPlan, ScaffoldPlanned, HttpScaffoldPlanned, ScaffoldOptions, HttpScaffoldOptions, CreateScaffold, HttpCreateScaffold, CreationStep, HttpCreationStep, ProjectCreation, HttpProjectCreation, CreationEffectIdentity, HttpCreationEffectIdentity, CreationEffect, HttpCreationEffect, CreationView, HttpCreationView, ControllerEvent, HttpControllerEvent, EventQuery, HttpEventQuery, EventListQuery, HttpEventListQuery, EventStreamQuery, HttpEventStreamQuery, EventPage, HttpEventPage } from '#contracts';
import { toHttpAttemptSummary, toHttpEffectReceipt } from './execution-views.js';

// Explicit projections preserve private documents and never traverse arbitrary facts or text.

export function toHttpDiagnosticCheck(value: Static<typeof DiagnosticCheck>): Static<typeof HttpDiagnosticCheck> {
  return value;
}

export function toHttpDiagnosticContext(value: Static<typeof DiagnosticContext>): Static<typeof HttpDiagnosticContext> {
  return value;
}

export function toHttpDiagnosticChecks(value: Static<typeof DiagnosticChecks>): Static<typeof HttpDiagnosticChecks> {
  return value;
}

export function toHttpDiagnosticRequest(value: Static<typeof DiagnosticRequest>): Static<typeof HttpDiagnosticRequest> {
  return value;
}

export function toHttpContextDiagnostic(value: Static<typeof ContextDiagnostic>): Static<typeof HttpContextDiagnostic> {
  return { check: value.check, state: value.state, code: value.code, cause: value.cause, affected_requirements: value.affectedRequirements, facts: { ...(value.facts.expectedAccountId === undefined ? {} : { expected_account_id: value.facts.expectedAccountId }), ...(value.facts.observedAccountId === undefined ? {} : { observed_account_id: value.facts.observedAccountId }), ...(value.facts.expectedHost === undefined ? {} : { expected_host: value.facts.expectedHost }), ...(value.facts.observedHost === undefined ? {} : { observed_host: value.facts.observedHost }), ...(value.facts.projectId === undefined ? {} : { project_id: value.facts.projectId }), ...(value.facts.creationId === undefined ? {} : { creation_id: value.facts.creationId }), ...(value.facts.attemptId === undefined ? {} : { attempt_id: value.facts.attemptId }), ...(value.facts.resourceCount === undefined ? {} : { resource_count: value.facts.resourceCount }), ...(value.facts.uncertainCount === undefined ? {} : { uncertain_count: value.facts.uncertainCount }), ...(value.facts.profileCount === undefined ? {} : { profile_count: value.facts.profileCount }), ...(value.facts.implementerProfileCount === undefined ? {} : { implementer_profile_count: value.facts.implementerProfileCount }), ...(value.facts.reviewerProfileCount === undefined ? {} : { reviewer_profile_count: value.facts.reviewerProfileCount }), ...(value.facts.onboardingCompletedAtMs === undefined ? {} : { onboarding_completed_at_ms: value.facts.onboardingCompletedAtMs }), ...(value.facts.projectsRootConfigured === undefined ? {} : { projects_root_configured: value.facts.projectsRootConfigured }), ...(value.facts.projectsRootConfirmed === undefined ? {} : { projects_root_confirmed: value.facts.projectsRootConfirmed }), ...(value.facts.retryAtMs === undefined ? {} : { retry_at_ms: value.facts.retryAtMs }) }, recovery: value.recovery, observed_at_ms: value.observedAtMs };
}

export function toHttpDiagnosticReport(value: Static<typeof DiagnosticReport>): Static<typeof HttpDiagnosticReport> {
  return { receipt: value.receipt, operation_id: value.operationId, state: value.state, created_at_ms: value.createdAtMs, completed_at_ms: value.completedAtMs, checks: value.checks, diagnostics: value.diagnostics.map(entry1 => (toHttpContextDiagnostic(entry1))) };
}

export function toHttpDiagnosticsView(value: Static<typeof DiagnosticsView>): Static<typeof HttpDiagnosticsView> {
  return { context: value.context, supported_checks: value.supportedChecks, diagnostics: value.diagnostics.map(entry1 => (toHttpContextDiagnostic(entry1))), reports: value.reports.map(entry1 => (toHttpDiagnosticReport(entry1))), event_cursor: value.eventCursor };
}

export function toHttpOperationSummaryQuery(value: Static<typeof OperationSummaryQuery>): Static<typeof HttpOperationSummaryQuery> {
  return { ...(value.projectId === undefined ? {} : { project_id: value.projectId }) };
}

export function fromHttpOperationSummaryQuery(value: Static<typeof HttpOperationSummaryQuery>): Static<typeof OperationSummaryQuery> {
  return { ...(value.project_id === undefined ? {} : { projectId: value.project_id }) };
}

export function toHttpOperationSummary(value: Static<typeof OperationSummary>): Static<typeof HttpOperationSummary> {
  return { account: { id: value.account.id, login: value.account.login, observed_id: value.account.observedId, observed_at_ms: value.account.observedAtMs }, host: value.host, automation: { enabled: value.automation.enabled, dispatch_paused: value.automation.dispatchPaused, project_enabled: value.automation.projectEnabled }, active_attempt: value.activeAttempt === null ? null : toHttpAttemptSummary(value.activeAttempt), active_attempt_count: value.activeAttemptCount, next_candidates: value.nextCandidates.map(entry1 => ({ project_id: entry1.projectId, issue_id: entry1.issueId, observed_at_ms: entry1.observedAtMs })), candidate_observation: { state: value.candidateObservation.state, requires_revalidation: value.candidateObservation.requiresRevalidation, order: value.candidateObservation.order, has_more: value.candidateObservation.hasMore }, recent_results: value.recentResults.map(entry1 => (toHttpAttemptSummary(entry1))), impediments: value.impediments.map(entry1 => (toHttpContextDiagnostic(entry1))), integration_status: { kind: value.integrationStatus.kind, observation: value.integrationStatus.observation === null ? null : toHttpContextDiagnostic(value.integrationStatus.observation), state: value.integrationStatus.state, proves_provider_execution: value.integrationStatus.provesProviderExecution }, event_cursor: value.eventCursor };
}

export function toHttpQueueScope(value: Static<typeof QueueScope>): Static<typeof HttpQueueScope> {
  return { kind: value.kind, project_ids: value.projectIds };
}

export function toHttpQueueReason(value: Static<typeof QueueReason>): Static<typeof HttpQueueReason> {
  return value;
}

export function toHttpQueueItem(value: Static<typeof QueueItem>): Static<typeof HttpQueueItem> {
  return { project_id: value.projectId, project_name: value.projectName, item_id: value.itemId, kind: value.kind, issue_id: value.issueId, number: value.number, title: value.title, url: value.url, assignees: value.assignees, status: value.status, ready: value.ready, ready_eligible: value.readyEligible, eligible: value.eligible, reasons: value.reasons, consumption: value.consumption, attempt_id: value.attemptId, order: value.order };
}

export function toHttpQueueDiagnostic(value: Static<typeof QueueDiagnostic>): Static<typeof HttpQueueDiagnostic> {
  return value;
}

export function toHttpQueueObservation(value: Static<typeof QueueObservation>): Static<typeof HttpQueueObservation> {
  return { scope: toHttpQueueScope(value.scope), enabled: value.enabled, valid: value.valid, complete: value.complete, observation_id: value.observationId, summary_hash: value.summaryHash, observed_at_ms: value.observedAtMs, eligible_total: value.eligibleTotal, modes_by_project: value.modesByProject.map(entry1 => ({ project_id: entry1.projectId, mode: entry1.mode })), account: value.account, host: value.host, order: value.order, page: { items: value.page.items.map(entry2 => (toHttpQueueItem(entry2))), next_cursor: value.page.next_cursor, has_more: value.page.has_more, event_cursor: value.page.event_cursor }, diagnostics: value.diagnostics, event_cursor: value.eventCursor, polling: { interval_ms: value.polling.intervalMs, backoff_max_ms: value.polling.backoffMaxMs, retry_at_ms: value.polling.retryAtMs, next_poll_at_ms: value.polling.nextPollAtMs } };
}

export function toHttpQueueQuery(value: Static<typeof QueueQuery>): Static<typeof HttpQueueQuery> {
  return { ...(value.projectId === undefined ? {} : { project_id: value.projectId }), ...(value.projectIds === undefined ? {} : { project_ids: value.projectIds }), ...(value.cursor === undefined ? {} : { cursor: value.cursor }), ...(value.limit === undefined ? {} : { limit: value.limit }) };
}

export function fromHttpQueueQuery(value: Static<typeof HttpQueueQuery>): Static<typeof QueueQuery> {
  return { ...(value.project_id === undefined ? {} : { projectId: value.project_id }), ...(value.project_ids === undefined ? {} : { projectIds: value.project_ids }), ...(value.cursor === undefined ? {} : { cursor: value.cursor }), ...(value.limit === undefined ? {} : { limit: value.limit }) };
}

export function toHttpQueueCommand(value: Static<typeof QueueCommand>): Static<typeof HttpQueueCommand> {
  return { enabled: value.enabled, scope: toHttpQueueScope(value.scope), ...(value.observationId === undefined ? {} : { observation_id: value.observationId }), ...(value.authorizedSummaryHash === undefined ? {} : { authorized_summary_hash: value.authorizedSummaryHash }) };
}

export function fromHttpQueueCommand(value: Static<typeof HttpQueueCommand>): Static<typeof QueueCommand> {
  return { enabled: value.enabled, scope: fromHttpQueueScope(value.scope), ...(value.observation_id === undefined ? {} : { observationId: value.observation_id }), ...(value.authorized_summary_hash === undefined ? {} : { authorizedSummaryHash: value.authorized_summary_hash }) };
}

export function toHttpQueueSaved(value: Static<typeof QueueSaved>): Static<typeof HttpQueueSaved> {
  return { queue: toHttpQueueObservation(value.queue), operation_id: value.operationId, receipt: value.receipt };
}

export function toHttpCreationMode(value: Static<typeof CreationMode>): Static<typeof HttpCreationMode> {
  return value;
}

export function toHttpScaffoldInput(value: Static<typeof ScaffoldInput>): Static<typeof HttpScaffoldInput> {
  return { name: value.name, template_id: value.templateId, template_digest: value.templateDigest, destination_relative: value.destinationRelative, creation_mode: value.creationMode, base_branch: value.baseBranch, triage_enabled: value.triageEnabled, ...(value.remote === undefined ? {} : { remote: { owner_id: value.remote.ownerId, name: value.remote.name, visibility: value.remote.visibility } }) };
}

export function fromHttpScaffoldInput(value: Static<typeof HttpScaffoldInput>): Static<typeof ScaffoldInput> {
  return { name: value.name, templateId: value.template_id, templateDigest: value.template_digest, destinationRelative: value.destination_relative, creationMode: value.creation_mode, baseBranch: value.base_branch, triageEnabled: value.triage_enabled, ...(value.remote === undefined ? {} : { remote: { ownerId: value.remote.owner_id, name: value.remote.name, visibility: value.remote.visibility } }) };
}

export function toHttpScaffoldFile(value: Static<typeof ScaffoldFile>): Static<typeof HttpScaffoldFile> {
  return value;
}

export function toHttpScaffoldAccount(value: Static<typeof ScaffoldAccount>): Static<typeof HttpScaffoldAccount> {
  return value;
}

export function toHttpScaffoldEngineering(value: Static<typeof ScaffoldEngineering>): Static<typeof HttpScaffoldEngineering> {
  return { tracker: value.tracker, domain: value.domain, instruction_file: value.instructionFile, triage_enabled: value.triageEnabled, installs_skills: value.installsSkills, creates_labels: value.createsLabels };
}

export function toHttpScaffoldPlan(value: Static<typeof ScaffoldPlan>): Static<typeof HttpScaffoldPlan> {
  return { format_version: value.formatVersion, input: toHttpScaffoldInput(value.input), installation_id: value.installationId, settings_e_tag: value.settingsETag, projects_root: value.projectsRoot, destination: value.destination, parent_identity: value.parentIdentity, template_digest: value.templateDigest, files: value.files, engineering: toHttpScaffoldEngineering(value.engineering), account: value.account, owner_id: value.ownerId, ...(value.ownerLogin === undefined ? {} : { owner_login: value.ownerLogin }), effects: value.effects };
}

export function toHttpScaffoldPlanned(value: Static<typeof ScaffoldPlanned>): Static<typeof HttpScaffoldPlanned> {
  return { plan_hash: value.planHash, plan: toHttpScaffoldPlan(value.plan), prerequisites: value.prerequisites };
}

export function toHttpScaffoldOptions(value: Static<typeof ScaffoldOptions>): Static<typeof HttpScaffoldOptions> {
  return { catalog: value.catalog, templates: value.templates.map(entry1 => ({ id: entry1.id, digest: entry1.digest, label: entry1.label, engineering_summary: entry1.engineeringSummary })), projects_root: value.projectsRoot, creation_modes: value.creationModes, account: value.account, prerequisites: value.prerequisites, event_cursor: value.eventCursor };
}

export function toHttpCreateScaffold(value: Static<typeof CreateScaffold>): Static<typeof HttpCreateScaffold> {
  return { plan_hash: value.planHash, plan: toHttpScaffoldPlan(value.plan), authorized: value.authorized };
}

export function fromHttpCreateScaffold(value: Static<typeof HttpCreateScaffold>): Static<typeof CreateScaffold> {
  return { planHash: value.plan_hash, plan: fromHttpScaffoldPlan(value.plan), authorized: value.authorized };
}

export function toHttpCreationStep(value: Static<typeof CreationStep>): Static<typeof HttpCreationStep> {
  return value;
}

export function toHttpProjectCreation(value: Static<typeof ProjectCreation>): Static<typeof HttpProjectCreation> {
  return { id: value.id, operation_id: value.operationId, project_id: value.projectId, plan_hash: value.planHash, plan: toHttpScaffoldPlan(value.plan), state: value.state, revision: value.revision, baseline_sha: value.baselineSha, baseline_ref: value.baselineRef, diagnostic: value.diagnostic, created_at_ms: value.createdAtMs };
}

export function toHttpCreationEffectIdentity(value: Static<typeof CreationEffectIdentity>): Static<typeof HttpCreationEffectIdentity> {
  return { ...(value.planHash === undefined ? {} : { plan_hash: value.planHash }), ...(value.ownerId === undefined ? {} : { owner_id: value.ownerId }), ...(value.repositoryOwner === undefined ? {} : { repository_owner: value.repositoryOwner }), ...(value.repositoryName === undefined ? {} : { repository_name: value.repositoryName }), ...(value.visibility === undefined ? {} : { visibility: value.visibility }), ...(value.marker === undefined ? {} : { marker: value.marker }), ...(value.repositoryId === undefined ? {} : { repository_id: value.repositoryId }), ...(value.commitSha === undefined ? {} : { commit_sha: value.commitSha }), ...(value.branchRef === undefined ? {} : { branch_ref: value.branchRef }) };
}

export function toHttpCreationEffect(value: Static<typeof CreationEffect>): Static<typeof HttpCreationEffect> {
  return { operation_id: value.operationId, attempt_id: value.attemptId, creation_id: value.creationId, delivery_id: value.deliveryId, kind: value.kind, scope_key: value.scopeKey, state: value.state, expected_identity: toHttpCreationEffectIdentity(value.expectedIdentity), confirmed_identity: value.confirmedIdentity === null ? null : toHttpEffectReceipt(value.confirmedIdentity), receipt: value.receipt === null ? null : toHttpEffectReceipt(value.receipt), reason: value.reason, authorized: value.authorized, revision: value.revision, sent_at_ms: value.sentAtMs, confirmed_at_ms: value.confirmedAtMs };
}

export function toHttpCreationView(value: Static<typeof CreationView>): Static<typeof HttpCreationView> {
  return { creation: toHttpProjectCreation(value.creation), confirmed_effects: value.confirmedEffects, pending_effects: value.pendingEffects, effects: value.effects.map(entry1 => (toHttpCreationEffect(entry1))), remote_effects: value.remoteEffects.map(entry1 => ({ kind: entry1.kind, state: entry1.state, operation_id: entry1.operationId, identity: toHttpCreationEffectIdentity(entry1.identity), reason: entry1.reason })), prerequisites: value.prerequisites, diagnostics: value.diagnostics, event_cursor: value.eventCursor };
}

export function toHttpControllerEvent(value: Static<typeof ControllerEvent>): Static<typeof HttpControllerEvent> {
  return { ...(value.context === undefined ? {} : { context: {
    ...(value.context.projectName === undefined ? {} : { project_name: value.context.projectName }),
    ...(value.context.issueNumber === undefined ? {} : { issue_number: value.context.issueNumber }),
    ...(value.context.issueTitle === undefined ? {} : { issue_title: value.context.issueTitle }),
    ...(value.context.attemptCreatedAtMs === undefined ? {} : { attempt_created_at_ms: value.context.attemptCreatedAtMs }),
    ...(value.context.round === undefined ? {} : { round: value.context.round }),
    ...(value.context.role === undefined ? {} : { role: value.context.role }),
  } }), seq: value.seq, entity_type: value.entityType, entity_id: value.entityId, operation_id: value.operationId, event_type: value.eventType, entity_revision: value.entityRevision, occurred_at_ms: value.occurredAtMs, facts: value.facts, ...(value.projectId === undefined ? {} : { project_id: value.projectId }), ...(value.attemptId === undefined ? {} : { attempt_id: value.attemptId }) };
}

export function toHttpEventQuery(value: Static<typeof EventQuery>): Static<typeof HttpEventQuery> {
  return { ...(value.cursor === undefined ? {} : { cursor: value.cursor }), ...(value.limit === undefined ? {} : { limit: value.limit }), ...(value.operationId === undefined ? {} : { operation_id: value.operationId }), ...(value.projectId === undefined ? {} : { project_id: value.projectId }), ...(value.attemptId === undefined ? {} : { attempt_id: value.attemptId }) };
}

export function fromHttpEventQuery(value: Static<typeof HttpEventQuery>): Static<typeof EventQuery> {
  return { ...(value.cursor === undefined ? {} : { cursor: value.cursor }), ...(value.limit === undefined ? {} : { limit: value.limit }), ...(value.operation_id === undefined ? {} : { operationId: value.operation_id }), ...(value.project_id === undefined ? {} : { projectId: value.project_id }), ...(value.attempt_id === undefined ? {} : { attemptId: value.attempt_id }) };
}

export function toHttpEventListQuery(value: Static<typeof EventListQuery>): Static<typeof HttpEventListQuery> {
  return { ...(value.includeTechnical === undefined ? {} : { include_technical: value.includeTechnical }), ...(value.cursor === undefined ? {} : { cursor: value.cursor }), ...(value.limit === undefined ? {} : { limit: value.limit }), ...(value.operationId === undefined ? {} : { operation_id: value.operationId }), ...(value.projectId === undefined ? {} : { project_id: value.projectId }), ...(value.attemptId === undefined ? {} : { attempt_id: value.attemptId }) };
}

export function fromHttpEventListQuery(value: Static<typeof HttpEventListQuery>): Static<typeof EventListQuery> {
  return { ...(value.include_technical === undefined ? {} : { includeTechnical: value.include_technical }), ...(value.cursor === undefined ? {} : { cursor: value.cursor }), ...(value.limit === undefined ? {} : { limit: value.limit }), ...(value.operation_id === undefined ? {} : { operationId: value.operation_id }), ...(value.project_id === undefined ? {} : { projectId: value.project_id }), ...(value.attempt_id === undefined ? {} : { attemptId: value.attempt_id }) };
}

export function toHttpEventStreamQuery(value: Static<typeof EventStreamQuery>): Static<typeof HttpEventStreamQuery> {
  return { ...(value.cursor === undefined ? {} : { cursor: value.cursor }), ...(value.projectId === undefined ? {} : { project_id: value.projectId }), ...(value.attemptId === undefined ? {} : { attempt_id: value.attemptId }), ...(value.operationId === undefined ? {} : { operation_id: value.operationId }) };
}

export function fromHttpEventStreamQuery(value: Static<typeof HttpEventStreamQuery>): Static<typeof EventStreamQuery> {
  return { ...(value.cursor === undefined ? {} : { cursor: value.cursor }), ...(value.project_id === undefined ? {} : { projectId: value.project_id }), ...(value.attempt_id === undefined ? {} : { attemptId: value.attempt_id }), ...(value.operation_id === undefined ? {} : { operationId: value.operation_id }) };
}

export function toHttpEventPage(value: Static<typeof EventPage>): Static<typeof HttpEventPage> {
  return { items: value.items.map(entry1 => (toHttpControllerEvent(entry1))), next_cursor: value.next_cursor, has_more: value.has_more, event_cursor: value.event_cursor };
}
export function fromHttpQueueScope(value: Static<typeof HttpQueueScope>): Static<typeof QueueScope> {
  return { kind: value.kind, projectIds: value.project_ids };
}

export function fromHttpScaffoldPlan(value: Static<typeof HttpScaffoldPlan>): Static<typeof ScaffoldPlan> {
  return { formatVersion: value.format_version, input: fromHttpScaffoldInput(value.input), installationId: value.installation_id, settingsETag: value.settings_e_tag, projectsRoot: value.projects_root, destination: value.destination, parentIdentity: value.parent_identity, templateDigest: value.template_digest, files: value.files, engineering: fromHttpScaffoldEngineering(value.engineering), account: value.account, ownerId: value.owner_id, ...(value.owner_login === undefined ? {} : { ownerLogin: value.owner_login }), effects: value.effects };
}

export function fromHttpScaffoldEngineering(value: Static<typeof HttpScaffoldEngineering>): Static<typeof ScaffoldEngineering> {
  return { tracker: value.tracker, domain: value.domain, instructionFile: value.instruction_file, triageEnabled: value.triage_enabled, installsSkills: value.installs_skills, createsLabels: value.creates_labels };
}
