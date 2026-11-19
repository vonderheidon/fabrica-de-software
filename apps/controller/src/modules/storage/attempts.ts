import { serializeOperationReceipt } from './common-json.js';
import { assertProjectAvailable } from './project-deletion-barrier.js';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { AttemptCapture, AttemptStatus, AttemptWorkspaceBinding, AttemptWorkspaceSnapshot, attemptSessionDirectoryReference, managedWorkspaceReference, OperationId, StartAttempt, type RoleResourceReference } from '#contracts';
import { configurationETag, digest, eventCursor, guarded, readConfiguration } from './configuration-reads.js';
import { readPreparation } from './preparations.js';
import { readSettings } from './settings.js';
import { OperationError, readOperation, type StoredOperation } from './operations.js';
import { StorageError } from './errors.js';
import { readCapturedConfiguration, readPreparationChoices, serializeCapture } from './historical-configuration.js';
import { assertPreparationProfileRoles, assertProfileTypesAvailable } from './profile-integrity.js';
import { stopQuestions } from './questions.js';
import { validatePreviousAttempt } from './recovery.js';
import { effectEvent } from './effects.js';
import { consumeQueueCycle, latestProjectIssueAttempt } from './queue-cycles.js';
import { isLocalAbsoluteTargetPath, publicationTargetHash, publicationTargetPath } from './publication-target.js';

export interface AttemptCommand { operationId: string; expectedRevision: string | undefined; body: StartAttempt }
export interface CreateAttempt {
  command: AttemptCommand; capture: AttemptCapture; configurationETag: string; preparationETag: string;
  workspaceAvailable?: boolean;
  queueCycle?: { accountId: string; projectId: string; issueId: string; cycleNumber: number };
}
export class AttemptConflict extends OperationError {
  readonly resource: { type: string; id: string };
  constructor(id: string) { super(409, 'ATTEMPT_ACTIVE', 'This issue already has an active attempt.'); this.resource = { type: 'attempt', id }; }
}
function commandHash(command: AttemptCommand): string {
  if (!Value.Check(OperationId, command.operationId) || !Value.Check(StartAttempt, command.body) ||
    (command.expectedRevision !== undefined && (typeof command.expectedRevision !== 'string' || command.expectedRevision.length > 256))) {
    throw new OperationError(400, 'START_INVALID', 'The start command is invalid.');
  }
  return digest({ method: 'POST', route: '/api/v1/attempts', body: command.body, expectedRevision: command.expectedRevision ?? null });
}
export function recoverAttempt(db: Database.Database, command: AttemptCommand): StoredOperation | null {
  const hash = commandHash(command); const settings = readSettings(db);
  const row = db.prepare<[string], { installation_id: string; account_id: string | null; request_hash: string }>(
    'SELECT installation_id,account_id,request_hash FROM operation_requests WHERE operation_id=?',
  ).get(command.operationId);
  if (!row) return null;
  if (row.installation_id !== settings.installation_id || row.account_id !== settings.account_id || row.request_hash !== hash) {
    throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'The operation conflicts with an accepted command.');
  }
  const operation = readOperation(db, command.operationId);
  if (!operation || !operation.receipt || operation.kind !== 'attempt.start') throw new StorageError('OPERATION_DATA_INVALID');
  return operation;
}
export function readAttempt(db: Database.Database, id: string): AttemptStatus {
  if (!Value.Check(OperationId, id)) throw new OperationError(400, 'ATTEMPT_ID_INVALID', 'Attempt ID is invalid.');
  const s = readSettings(db);
  const row = db.prepare<[string, string | null], Omit<AttemptStatus, 'eventCursor'>>(`SELECT a.id,a.project_id AS projectId,
    a.operation_id AS operationId,p.id AS passageId, p.round_number AS round,a.phase,a.result,a.suspension,
    p.tracking_state AS tracking,a.diagnostic,r.receipt_id AS resultReceiptId,d.id AS deliveryId,a.revision,
    (SELECT q.id FROM execution_questions q WHERE q.attempt_id=a.id AND q.state NOT IN ('delivered','cancelled') ORDER BY q.created_at_ms,q.id LIMIT 1) AS pendingQuestionId
    FROM attempts a JOIN passages p ON p.attempt_id=a.id AND p.round_number=(SELECT max(round_number) FROM rounds WHERE attempt_id=a.id) AND p.role='implementer'
    LEFT JOIN passage_results r ON r.passage_id=p.id LEFT JOIN deliveries d ON d.producer_passage_id=p.id WHERE a.id=? AND a.account_id IS ?`).get(id, s.account_id);
  if (!row) throw new OperationError(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found in the current scope.');
  const status = { ...row, eventCursor: eventCursor(db) };
  if (!Value.Check(AttemptStatus, status)) throw new StorageError('OPERATION_DATA_INVALID');
  return status;
}
export function readAttemptWorkspaceBinding(db: Database.Database, id: string): AttemptWorkspaceBinding {
  if (!Value.Check(OperationId, id)) throw new OperationError(400, 'ATTEMPT_ID_INVALID', 'Attempt ID is invalid.');
  const rows = db.prepare<[string], { attempt_id: string; project_id: string; repository_id: string; issue_id: string; issue_number: number;
    resource_id: string; environment_reference: string; choices_json: string }>(`SELECT a.id AS attempt_id,
    a.project_id,a.repository_id,a.issue_id,a.issue_number,r.id AS resource_id,r.reference AS environment_reference,
    pr.choices_json FROM attempts a JOIN resources r ON r.attempt_id=a.id AND r.kind='implementation'
    JOIN preparation_revisions pr ON pr.preparation_id=a.preparation_id AND pr.revision=a.preparation_revision
    WHERE a.id=? ORDER BY r.created_at_ms,r.id`).all(id);
  if (rows.length === 0) {
    if (!db.prepare<[string], { id: string }>('SELECT id FROM attempts WHERE id=?').get(id)) {
      throw new OperationError(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found.');
    }
    throw new StorageError('OPERATION_DATA_INVALID');
  }
  if (rows.length !== 1) throw new StorageError('OPERATION_DATA_INVALID');
  const row = rows[0]!;
  const capture = readCapture(db, row.attempt_id);
  const snapshot = capture.workspace;
  const workspace = { project_id: row.project_id, repository_id: row.repository_id, issue_id: row.issue_id };
  if (snapshot && (snapshot.identity.project_id !== workspace.project_id || snapshot.identity.repository_id !== workspace.repository_id ||
      snapshot.identity.issue_id !== workspace.issue_id)) throw new StorageError('OPERATION_DATA_INVALID');
  const choices = readPreparationChoices(JSON.parse(row.choices_json) as unknown);
  const predecessor = choices.previous_attempt_id ?? null;
  const state = snapshot.initial_state;
  const pending = state.kind === 'pending_inherited_attempt';
  if (row.environment_reference !== managedWorkspaceReference(row.project_id, row.issue_number) ||
      snapshot.predecessor_attempt_id !== predecessor ||
      (pending ? (predecessor === null || state.source_attempt_id !== predecessor || snapshot.comparison_base_sha !== null || snapshot.inherited_base_sha === null) :
        (snapshot.comparison_base_sha === null || state.content_identity !== snapshot.comparison_base_sha ||
          (state.kind === 'base_checkout' ? snapshot.inherited_base_sha !== null :
            predecessor !== state.source_attempt_id || snapshot.inherited_base_sha === null)))) {
    throw new StorageError('OPERATION_DATA_INVALID');
  }
  const resolution = db.prepare<[string, string, string], { path_count: number }>(`SELECT
    count(DISTINCT r.reference) AS path_count FROM attempts a
    JOIN resources r ON r.attempt_id=a.id AND r.kind='implementation'
    WHERE a.project_id=? AND a.repository_id=? AND a.issue_id=?`).get(
    workspace.project_id, workspace.repository_id, workspace.issue_id);
  if (!resolution?.path_count) throw new StorageError('OPERATION_DATA_INVALID');
  const binding: AttemptWorkspaceBinding = {
    attempt_id: row.attempt_id,
    workspace,
    issue_number: row.issue_number,
    resource_id: row.resource_id, environment_reference: row.environment_reference,
    predecessor_attempt_id: snapshot.predecessor_attempt_id, initial_state: snapshot.initial_state,
    inherited_base_sha: snapshot.inherited_base_sha, comparison_base_sha: snapshot.comparison_base_sha,
    resolution_state: resolution.path_count > 1 ? 'conflict' : 'candidate',
  };
  if (!Value.Check(AttemptWorkspaceBinding, binding)) {
    throw new StorageError('OPERATION_DATA_INVALID');
  }
  return binding;
}

export function readAttemptWorkspaceReference(db: Database.Database, id: string): string {
  return readAttemptWorkspaceBinding(db, id).environment_reference;
}
export function readAttemptProjectId(db: Database.Database, id: string): string {
  if (!Value.Check(OperationId, id)) throw new OperationError(400, 'ATTEMPT_ID_INVALID', 'Attempt ID is invalid.');
  const row = db.prepare<[string], { project_id: string }>('SELECT project_id FROM attempts WHERE id=?').get(id);
  if (!row) throw new OperationError(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found.');
  return row.project_id;
}
export function readCapture(db: Database.Database, id: string): AttemptCapture {
  readAttempt(db, id);
  const row = db.prepare<[string], { capture_json: string }>('SELECT capture_json FROM attempts WHERE id=?').get(id);
  const capture = readCapturedConfiguration(row ? JSON.parse(row.capture_json) as unknown : null);
  const storedSnapshot = db.prepare<[string], { snapshot_json: string }>('SELECT snapshot_json FROM attempt_workspace_snapshots WHERE attempt_id=?').get(id);
  if (!storedSnapshot) return capture;
  if (capture.workspace.initial_state.kind !== 'pending_inherited_attempt') throw new StorageError('OPERATION_DATA_INVALID');
  const snapshot: unknown = JSON.parse(storedSnapshot.snapshot_json);
  if (!Value.Check(AttemptWorkspaceSnapshot, snapshot)) throw new StorageError('OPERATION_DATA_INVALID');
  const completed: AttemptCapture = { ...capture, workspace: snapshot };
  if (!Value.Check(AttemptCapture, completed)) throw new StorageError('OPERATION_DATA_INVALID');
  return completed;
}
export function attemptEvent(db: Database.Database, id: string, type: string, passage?: { round: number; role: 'implementer' | 'reviewer' }): void {
  const row = db.prepare<[string], { project_id: string; operation_id: string; revision: number }>('SELECT project_id,operation_id,revision FROM attempts WHERE id=?').get(id);
  if (!row) throw new StorageError('OPERATION_DATA_INVALID');
  db.prepare(`INSERT INTO events(entity_type,entity_id,project_id,attempt_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms,context_round,context_role)
    VALUES ('attempt',?,?,?,?,?,?,'{}',?,?,?)`).run(id, row.project_id, id, row.operation_id, type, row.revision, Date.now(),
      passage?.round ?? db.prepare<[string], { round: number }>('SELECT max(round_number) AS round FROM rounds WHERE attempt_id=?').get(id)?.round ?? null, passage?.role ?? null);
}
export function createAttempt(db: Database.Database, input: CreateAttempt): { created: boolean; operation: StoredOperation } {
  return guarded(() => db.transaction(() => {
    const recovered = recoverAttempt(db, input.command); if (recovered) return { created: false, operation: recovered };
    const capture = input.capture;
    if (!Value.Check(AttemptCapture, capture)) throw new OperationError(400, 'CAPTURE_INVALID', 'The attempt capture is invalid.');
    const preparation = readPreparation(db, input.command.body.preparationId);
    assertProjectAvailable(db, preparation.view.project_id);
    const config = readConfiguration(db, preparation.view.project_id); const settings = readSettings(db);
    assertProfileTypesAvailable(db);
    assertPreparationProfileRoles(db, config.configuration, preparation.view);
    if (input.queueCycle && (!settings.automation_enabled || !config.configuration.automation_enabled)) throw new OperationError(409, 'QUEUE_PAUSED', 'The queue was paused before the new attempt could be accepted.');
    if (input.queueCycle && db.prepare('SELECT id FROM attempts WHERE account_id=? AND result IS NULL').get(settings.account_id)) {
      throw new OperationError(409, 'QUEUE_OCCUPIED', 'An active attempt is still using this account.');
    }
    const authority = db.prepare<[], { configured_account_id: string | null; observed_account_id: string | null; dispatch_paused: number }>(
      "SELECT configured_account_id, observed_account_id, dispatch_paused FROM controller_authority WHERE id='local'",
    ).get();
    if (authority && (authority.dispatch_paused !== 0 || authority.configured_account_id !== settings.account_id ||
      authority.observed_account_id !== settings.account_id)) {
      throw new OperationError(409, 'ACCOUNT_CHANGED', 'Dispatch is paused until the linked account is observed again.');
    }
    if (input.command.expectedRevision === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
    if (input.command.expectedRevision !== preparation.etag || preparation.etag !== input.preparationETag ||
      configurationETag(config) !== input.configurationETag) throw new OperationError(412, 'REVISION_CONFLICT', 'Preparation or configuration changed before start.');
    if (capture.preparationId !== preparation.view.id || capture.preparationRevision !== preparation.view.revision ||
      capture.preparationRevision !== input.command.body.preparationRevision || capture.summaryHash !== input.command.body.authorizedSummaryHash ||
      capture.accountId !== settings.account_id || capture.issue.id !== preparation.view.issue_id ||
      capture.issue.repository.id !== config.configuration.source.repository_id || capture.configuration.project_revision_id !== config.configuration.id ||
      capture.configuration.settings_revision !== settings.revision) throw new OperationError(409, 'CAPTURE_CONFLICT', 'The capture does not match the authorized preparation.');
    const intent = preparation.view.publication_target;
    const capturedTarget = capture.v3Delivery;
    const targetRequired = config.configuration.source.kind === 'github' && preparation.view.delivery_mode !== 'icr';
    if (!capturedTarget || capturedTarget.authorization_operation_id !== input.command.operationId ||
      capturedTarget.publication_target_hash !== publicationTargetHash(intent) ||
      capturedTarget.publication_target?.repository_id !== intent?.repository_id ||
      (capturedTarget.publication_target === null) !== (intent === null) ||
      targetRequired && intent === null ||
      intent !== null && (config.configuration.source.kind !== 'github' || intent.repository_id !== config.configuration.source.repository_id || !isLocalAbsoluteTargetPath(publicationTargetPath(intent)))) {
      throw new OperationError(409, targetRequired && intent === null ? 'PUBLICATION_TARGET_REQUIRED' : 'PUBLICATION_TARGET_INVALID',
        targetRequired && intent === null ? 'A valid local delivery destination is required for this URL project and delivery mode.' : 'The captured delivery destination no longer matches the authorized preparation.', {
          affected_requirements: ['RF-23', 'RF-24', 'RF-28'], recovery: 'Review and save the exact destination in the preparation, then authorize its updated summary.' });
    }
    if (input.queueCycle && (input.queueCycle.accountId !== capture.accountId || input.queueCycle.projectId !== preparation.view.project_id || input.queueCycle.issueId !== capture.issue.id || !Number.isSafeInteger(input.queueCycle.cycleNumber) || input.queueCycle.cycleNumber < 1)) {
      throw new OperationError(409, 'QUEUE_CYCLE_CHANGED', 'The observed queue cycle no longer matches this attempt.');
    }
    const roles = new Map(capture.roleResources.map(r => [r.role, r]));
    if (roles.size !== 2 || !roles.has('implementer') || !roles.has('reviewer') || capture.roleResources.some(r => r.id !== `factory.${r.role}`) ||
      new Set(capture.tools.map(t => t.tool)).size !== 5 ||
      capture.tools.some(t => t.state === 'observed' ? t.version === null || t.cause !== null : t.version !== null || !t.cause || !t.affectedRequirements.length) ||
      new Set(capture.criteria.map(c => c.id)).size !== capture.criteria.length || new Set(capture.criteria.map(c => c.occurrence_index)).size !== capture.criteria.length) {
      throw new OperationError(400, 'CAPTURE_INVALID', 'Required resources, observations or criterion identities are invalid.');
    }
    const active = db.prepare<[string, string, string], { id: string }>('SELECT id FROM attempts WHERE account_id=? AND repository_id=? AND issue_id=? AND result IS NULL')
      .get(capture.accountId, capture.issue.repository.id, capture.issue.id);
    if (active) throw new AttemptConflict(active.id);
    const latest = latestProjectIssueAttempt(db, preparation.view.project_id, capture.issue.repository.id, capture.issue.id);
    if (latest && !preparation.view.previous_attempt_id) {
      throw new OperationError(409, 'PREVIOUS_ATTEMPT_REQUIRED', 'Select the previous attempt to reuse this issue workspace.', {
        recovery: 'Crie uma nova preparação a partir da tentativa mais recente desta issue e autorize o resumo atualizado.' });
    }
    if (preparation.view.previous_attempt_id && latest?.id !== preparation.view.previous_attempt_id) {
      throw new OperationError(409, 'PREVIOUS_ATTEMPT_NOT_LATEST', 'Select the most recent attempt for this issue workspace.', {
        recovery: 'Reload the issue history and create a preparation from its latest attempt.' });
    }
    const expectedWorkspaceReference = managedWorkspaceReference(preparation.view.project_id, capture.issue.number);
    const workspaceReferences = db.prepare<[string, string, string], { reference: string }>(`SELECT DISTINCT r.reference FROM resources r
      JOIN attempts a ON a.id=r.attempt_id WHERE a.project_id=? AND a.repository_id=? AND a.issue_id=? AND r.kind='implementation'`)
      .all(preparation.view.project_id, capture.issue.repository.id, capture.issue.id);
    const pathOwnerConflict = db.prepare<[string, string, string], { id: string }>(`SELECT a.id FROM resources r JOIN attempts a ON a.id=r.attempt_id
      WHERE r.kind='implementation' AND r.reference=? AND (a.repository_id<>? OR a.issue_id<>?) LIMIT 1`)
      .get(expectedWorkspaceReference, capture.issue.repository.id, capture.issue.id);
    if (workspaceReferences.length > 1 || workspaceReferences.some(row => row.reference !== expectedWorkspaceReference) || pathOwnerConflict) {
      throw new OperationError(409, 'WORKSPACE_RESOLUTION_CONFLICT', 'The existing issue workspace paths do not resolve to one verified workspace.', {
        recovery: 'Inspect the registered workspace paths and reconcile their ownership before starting another attempt.' });
    }
    if (workspaceReferences.length > 0 && !preparation.view.previous_attempt_id) {
      throw new OperationError(409, 'PREVIOUS_ATTEMPT_REQUIRED', 'Select the previous attempt to reuse this issue workspace.', {
        recovery: 'Crie uma nova preparação a partir da tentativa mais recente desta issue e autorize o resumo atualizado.' });
    }
    // A new preparation is a fresh authorization; an accepted preparation must not dispatch twice.
    const previous = db.prepare('SELECT id FROM attempts WHERE preparation_id=?').get(preparation.view.id);
    if (preparation.view.previous_attempt_id) validatePreviousAttempt(db, preparation.view.previous_attempt_id, preparation.view.project_id, capture.issue.id);
    else if (previous && !input.queueCycle) throw new OperationError(409, 'EXPLICIT_RETRY_REQUIRED', 'This preparation has already started. Create a new preparation for another attempt.');
    const predecessorCapture = preparation.view.previous_attempt_id ? readCapture(db, preparation.view.previous_attempt_id) : null;
    if (predecessorCapture && predecessorCapture.issue.repository.id !== capture.issue.repository.id) {
      throw new OperationError(409, 'REPOSITORY_MISMATCH', 'The inherited workspace belongs to a different repository.');
    }
    // A planned resource has not crossed the durable boundary that precedes filesystem writes.
    const workspaceStarted = db.prepare<[string, string, string], { id: string }>(`SELECT a.id FROM attempts a
      WHERE a.project_id=? AND a.repository_id=? AND a.issue_id=? AND (
        EXISTS(SELECT 1 FROM resources r WHERE r.attempt_id=a.id AND r.kind='implementation'
          AND (r.launch_state<>'planned' OR r.owned=1 OR r.removed=1))
        OR EXISTS(SELECT 1 FROM attempt_workspace_snapshots s WHERE s.attempt_id=a.id)
        OR EXISTS(SELECT 1 FROM deliveries d WHERE d.attempt_id=a.id)) LIMIT 1`)
      .get(preparation.view.project_id, capture.issue.repository.id, capture.issue.id);
    const inheritWorkspace = predecessorCapture !== null && workspaceStarted !== undefined && input.workspaceAvailable !== false;
    const id = randomUUID(); const passageId = randomUUID(); const deliveryVersion = randomUUID(); const now = Date.now();
    const persistedCapture: AttemptCapture = { ...capture, workspace: {
      identity: { project_id: preparation.view.project_id, repository_id: capture.issue.repository.id, issue_id: capture.issue.id },
      predecessor_attempt_id: preparation.view.previous_attempt_id ?? null,
      initial_state: inheritWorkspace
        ? { kind: 'pending_inherited_attempt', source_attempt_id: preparation.view.previous_attempt_id! }
        : { kind: 'base_checkout', content_identity: capture.baseSha },
      inherited_base_sha: inheritWorkspace ? predecessorCapture!.workspace.inherited_base_sha ?? predecessorCapture!.baseSha : null,
      comparison_base_sha: inheritWorkspace ? null : capture.baseSha,
    } };
    const suspension = capture.tools.some(t => t.state === 'unavailable') ? 'TOOL_VERSION_UNAVAILABLE' : null;
    const seq = Number(eventCursor(db)) + 1;
    // Global sequence, including other account histories.
    const next = db.prepare<[], { seq: number }>('SELECT coalesce(max(seq),0)+1 AS seq FROM events').get()?.seq ?? seq;
    const receipt = { revision: 1, event_cursor: String(next) };
    db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json)
      VALUES (?,?,?,'attempt.start','attempt',?,?,?,?)`).run(input.command.operationId, settings.installation_id, settings.account_id, id,
      commandHash(input.command), JSON.stringify({ etag: input.command.expectedRevision }), serializeOperationReceipt(receipt));
    db.prepare(`INSERT INTO attempts(id,operation_id,project_id,project_revision_id,preparation_id,preparation_revision,account_id,repository_id,issue_id,issue_number,issue_title,capture_json,phase,suspension,diagnostic,created_at_ms,updated_at_ms,source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'preparing',?,?,?,?,?)`).run(id, input.command.operationId, preparation.view.project_id, config.configuration.id,
      preparation.view.id, preparation.view.revision, capture.accountId, capture.issue.repository.id, capture.issue.id, capture.issue.number, capture.issue.title, serializeCapture(persistedCapture), suspension, suspension, now, now,
      input.queueCycle ? 'automatic' : preparation.view.previous_attempt_id ? 'retry' : 'manual');
    if (input.queueCycle) consumeQueueCycle(db, input.queueCycle.accountId, input.queueCycle.projectId, input.queueCycle.issueId, input.queueCycle.cycleNumber, id);
    for (const c of capture.criteria) db.prepare('INSERT INTO attempt_criteria(attempt_id,criterion_id,occurrence_index,text) VALUES (?,?,?,?)').run(id, c.id, c.occurrence_index, c.text);
    db.prepare('INSERT INTO rounds(attempt_id,round_number,delivery_version,created_at_ms) VALUES (?,1,?,?)').run(id, deliveryVersion, now);
    const hostName = hostname();
    const sessions = new Map<'implementer' | 'reviewer', string>();
    for (const role of ['implementer', 'reviewer'] as const) {
      let terminal = db.prepare<[string, string, string], { id: string; generation: number; state: 'planned' | 'available' }>(
        `SELECT t.id,t.generation,t.state FROM managed_terminals t WHERE t.installation_id=? AND t.host_name=? AND t.role=?
          AND NOT EXISTS (SELECT 1 FROM attempt_sessions s JOIN attempts a ON a.id=s.attempt_id
            WHERE s.managed_terminal_id=t.id AND a.result IS NULL)
          AND (t.state='available' OR (t.state='planned' AND NOT EXISTS (
            SELECT 1 FROM terminal_occupancies o WHERE o.managed_terminal_id=t.id AND o.state IN ('occupied','uncertain')
          ))) ORDER BY CASE t.state WHEN 'available' THEN 0 ELSE 1 END,t.updated_at_ms DESC,t.id LIMIT 1`,
      ).get(settings.installation_id, hostName, role);
      if (!terminal) {
        const terminalId = randomUUID();
        const terminalName = `factory-${terminalId}`;
        db.prepare(`INSERT INTO managed_terminals(id,installation_id,host_name,role,owner,generation,terminal_name,state,created_at_ms,updated_at_ms)
          VALUES (?,?,?,?,'factory',1,?,'planned',?,?)`).run(terminalId, settings.installation_id, hostName, role, terminalName, now, now);
        terminal = { id: terminalId, generation: 1, state: 'planned' };
      }
      const sessionGeneration = terminal.state === 'available' ? terminal.generation + 1 : terminal.generation;
      const sessionId = randomUUID();
      sessions.set(role, sessionId);
      db.prepare(`INSERT INTO attempt_sessions(id,attempt_id,role,managed_terminal_id,session_directory_relative,terminal_generation,state,created_at_ms,updated_at_ms)
        VALUES (?,?,?,?,?,?,'reserved',?,?)`).run(sessionId, id, role, terminal.id,
        attemptSessionDirectoryReference(capture.issue.number, id, role), sessionGeneration, now, now);
    }
    const resource: RoleResourceReference = roles.get('implementer')!;
    // passages.terminal_name remains a unique per-passage resource reference; the shared
    // physical Maestri terminal identity lives in managed_terminals.
    const terminalName = `factory-${passageId}`;
    db.prepare(`INSERT INTO passages(id,attempt_id,round_number,delivery_version,role,role_resource_json,terminal_name,state,tracking_state,created_at_ms,attempt_session_id)
      VALUES (?,?,1,?,'implementer',?,?,'starting','pending',?,?)`).run(passageId, id, deliveryVersion, JSON.stringify(resource), terminalName, now, sessions.get('implementer')!);
    const implementationResourceId = randomUUID();
    const implementationReference = managedWorkspaceReference(preparation.view.project_id, capture.issue.number);
    db.prepare(`INSERT INTO resources(id,attempt_id,passage_id,kind,reference,owned,launch_state,created_at_ms) VALUES (?,?,?,'implementation',?,0,'planned',?)`)
      .run(implementationResourceId, id, passageId, implementationReference, now);
    db.prepare(`INSERT INTO resources(id,attempt_id,passage_id,kind,reference,owned,launch_state,created_at_ms) VALUES (?,?,?,'terminal',?,0,'planned',?)`)
      .run(randomUUID(), id, passageId, terminalName, now);
    attemptEvent(db, id, 'attempt.accepted');
    const operation = readOperation(db, input.command.operationId);
    if (!operation?.receipt) throw new StorageError('OPERATION_DATA_INVALID');
    return { created: true, operation };
  }).immediate());
}

export function recordImplementationBlocked(db: Database.Database, id: string): void {
  guarded(() => db.transaction(() => {
    readAttempt(db, id);
    const changed = db.prepare("UPDATE attempts SET suspension='HUMAN_DECISION',diagnostic='IMPLEMENTATION_BLOCKED',revision=revision+1,updated_at_ms=? WHERE id=? AND result IS NULL")
      .run(Date.now(), id);
    if (changed.changes) attemptEvent(db, id, 'implementation.blocked');
  }).immediate());
}

export function recordDispatchFailure(db: Database.Database, id: string, code: string): void {
  guarded(() => db.transaction(() => {
    // Internal journal completion remains writable when the observed account changes during IO.
    if (!db.prepare('SELECT id FROM attempts WHERE id=?').get(id)) throw new StorageError('OPERATION_DATA_INVALID');
    db.prepare('UPDATE attempts SET suspension=?,diagnostic=?,revision=revision+1,updated_at_ms=? WHERE id=? AND result IS NULL')
      .run('DISPATCH_FAILED', code, Date.now(), id);
    attemptEvent(db, id, 'dispatch.failed');
  }).immediate());
}

export function recordWorkspaceSnapshot(db: Database.Database, id: string, snapshot: AttemptWorkspaceSnapshot): void {
  if (!Value.Check(OperationId, id) || !Value.Check(AttemptWorkspaceSnapshot, snapshot)) {
    throw new OperationError(400, 'WORKSPACE_SNAPSHOT_INVALID', 'The workspace snapshot is invalid.');
  }
  guarded(() => db.transaction(() => {
    const row = db.prepare<[string], { capture_json: string; phase: string; result: string | null; suspension: string | null }>(
      'SELECT capture_json,phase,result,suspension FROM attempts WHERE id=?').get(id);
    if (!row) throw new OperationError(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found.');
    const capture = readCapturedConfiguration(JSON.parse(row.capture_json) as unknown);
    const pending = capture.workspace.initial_state;
    if (row.phase !== 'preparing' || row.result !== null || row.suspension !== null || pending.kind !== 'pending_inherited_attempt' ||
        snapshot.identity.project_id !== capture.workspace.identity.project_id ||
        snapshot.identity.repository_id !== capture.workspace.identity.repository_id || snapshot.identity.issue_id !== capture.workspace.identity.issue_id ||
        snapshot.predecessor_attempt_id !== capture.workspace.predecessor_attempt_id || snapshot.predecessor_attempt_id !== pending.source_attempt_id ||
        snapshot.initial_state.kind !== 'inherited_attempt' || snapshot.initial_state.source_attempt_id !== pending.source_attempt_id ||
        snapshot.inherited_base_sha !== capture.workspace.inherited_base_sha || snapshot.comparison_base_sha === null ||
        snapshot.comparison_base_sha !== snapshot.initial_state.content_identity) {
      throw new OperationError(409, 'WORKSPACE_SNAPSHOT_CONFLICT', 'The attempt can no longer accept this inherited workspace snapshot.');
    }
    if (!Value.Check(AttemptCapture, { ...capture, workspace: snapshot }) ||
        db.prepare('SELECT attempt_id FROM attempt_workspace_snapshots WHERE attempt_id=?').get(id)) {
      throw new OperationError(409, 'WORKSPACE_SNAPSHOT_CONFLICT', 'The attempt already has a recorded workspace snapshot.');
    }
    db.prepare('INSERT INTO attempt_workspace_snapshots(attempt_id,snapshot_json,created_at_ms) VALUES (?,?,?)')
      .run(id, JSON.stringify(snapshot), Date.now());
  }).immediate());
}

export function recordWorkspace(db: Database.Database, id: string, state: 'starting' | 'ready' | 'failed', owned: boolean, diagnostic: string | null): void {
  guarded(() => db.transaction(() => {
    const attempt = db.prepare<[string], { phase: string; result: string | null; suspension: string | null }>('SELECT phase,result,suspension FROM attempts WHERE id=?').get(id);
    if (!attempt) throw new StorageError('OPERATION_DATA_INVALID');
    const revoked = attempt.phase !== 'preparing' || attempt.result !== null || attempt.suspension !== null;
    if (state === 'starting' && revoked) throw new OperationError(409, 'DISPATCH_REVOKED', 'The attempt cannot advance.');
    const resource = db.prepare("UPDATE resources SET launch_state=?,owned=?,diagnostic=? WHERE attempt_id=? AND kind='implementation' AND launch_state=?")
      .run(state, owned ? 1 : 0, diagnostic, id, state === 'starting' ? 'planned' : 'starting');
    if (resource.changes !== 1) throw new OperationError(409, 'DISPATCH_CLAIMED', 'Workspace dispatch was already claimed.');
    if (revoked) db.prepare('UPDATE attempts SET revision=revision+1,updated_at_ms=? WHERE id=?').run(Date.now(), id);
    else db.prepare('UPDATE attempts SET diagnostic=?,suspension=?,revision=revision+1,updated_at_ms=? WHERE id=?')
      .run(diagnostic, state === 'failed' ? 'WORKSPACE_PREPARATION_FAILED' : null, Date.now(), id);
    attemptEvent(db, id, `workspace.${state}`);
  }).immediate());
}
export function interruptAttempts(db: Database.Database): void {
  guarded(() => db.transaction(() => {
    const runningEffects = db.prepare<[],{ operation_id: string; revision: number }>("SELECT operation_id,revision FROM effects WHERE state='running'").all();
    db.prepare("UPDATE effects SET state='unknown',reason='EFFECT_INTERRUPTED',revision=revision+1 WHERE state='running'").run();
    for (const e of runningEffects) effectEvent(db,e.operation_id,'effect.interrupted',e.revision+1);
    db.prepare("UPDATE publication_requests SET state='unknown',diagnostic='PUBLICATION_INTERRUPTED' WHERE state IN ('accepted','running')").run();
    db.prepare("UPDATE resource_removals SET state='unknown',diagnostic='REMOVAL_INTERRUPTED' WHERE state='accepted'").run();
    db.prepare("UPDATE native_open_requests SET state='unknown' WHERE state='accepted'").run();
    db.prepare("UPDATE resources SET stop_state='uncertain',diagnostic='TRACKING_LOST' WHERE kind='terminal' AND owned=1 AND stop_state<>'confirmed'").run();
    // At boot no workspace preparation is in flight; a leftover 'starting' (even for a finished attempt) would lock project configuration forever.
    db.prepare("UPDATE resources SET launch_state='failed',diagnostic='WORKSPACE_PREPARATION_INTERRUPTED' WHERE kind='implementation' AND launch_state='starting'").run();
    db.prepare("UPDATE terminal_occupancies SET state='uncertain',reason='TRACKING_LOST' WHERE state='occupied'").run();
    db.prepare("UPDATE managed_terminals SET state='uncertain',updated_at_ms=? WHERE state='occupied'").run(Date.now());
    db.prepare("UPDATE attempt_sessions SET state='interrupted',updated_at_ms=? WHERE state IN ('reserved','active')").run(Date.now());
    db.prepare("UPDATE capture_runs SET state='failed',diagnostic='CAPTURE_CONTINUITY_REVOKED',ended_at_ms=? WHERE state='running'").run(Date.now());
    db.prepare("UPDATE deliveries SET capture_state='failed',diagnostic='CAPTURE_CONTINUITY_REVOKED',revision=revision+1 WHERE capture_state IN ('pending','running')").run();
    const rows = db.prepare<[], { id: string }>('SELECT id FROM attempts WHERE result IS NULL').all();
    for (const { id } of rows) {
      // Do not charge controller downtime to any passage after a restart.
      db.prepare("UPDATE passage_measurements SET mode='stopped' WHERE passage_id IN (SELECT id FROM passages WHERE attempt_id=?)").run(id);
      stopQuestions(db, id);
      db.prepare("UPDATE passages SET state='interrupted',tracking_state='lost',diagnostic='TRACKING_LOST' WHERE attempt_id=?").run(id);
      db.prepare("UPDATE attempts SET phase='finished',result='interrupted',suspension=NULL,diagnostic='TRACKING_LOST',revision=revision+1,updated_at_ms=? WHERE id=?").run(Date.now(), id);
      attemptEvent(db, id, 'attempt.interrupted');
    }
  }).immediate());
}
