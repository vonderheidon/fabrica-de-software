import { serializeOperationReceipt } from './common-json.js';
import { assertProjectAvailable } from './project-deletion-barrier.js';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { AttemptCapture, AttemptStatus, OperationId, StartAttempt, type RoleResourceReference } from '#contracts';
import { configurationETag, digest, eventCursor, guarded, readConfiguration } from './configuration-reads.js';
import { readPreparation } from './preparations.js';
import { readSettings } from './settings.js';
import { OperationError, readOperation, type StoredOperation } from './operations.js';
import { StorageError } from './errors.js';
import { readCapturedConfiguration, serializeCapture } from './historical-configuration.js';
import { assertPreparationProfileRoles, assertProfileTypesAvailable } from './profile-integrity.js';
import { stopQuestions } from './questions.js';
import { validatePreviousAttempt } from './recovery.js';
import { effectEvent } from './effects.js';
import { consumeQueueCycle } from './queue-cycles.js';

export interface AttemptCommand { operationId: string; expectedRevision: string | undefined; body: StartAttempt }
export interface CreateAttempt {
  command: AttemptCommand; capture: AttemptCapture; configurationETag: string; preparationETag: string;
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
export function readCapture(db: Database.Database, id: string): AttemptCapture {
  readAttempt(db, id);
  const row = db.prepare<[string], { capture_json: string }>('SELECT capture_json FROM attempts WHERE id=?').get(id);
  const capture: unknown = row ? JSON.parse(row.capture_json) : null;
  return readCapturedConfiguration(capture);
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
    // A first manual start cannot repeat a consumed issue after failure/restart. Retry is a separate explicit command.
    const previous = db.prepare('SELECT id FROM attempts WHERE account_id=? AND repository_id=? AND issue_id=?').get(capture.accountId, capture.issue.repository.id, capture.issue.id);
    if (preparation.view.previous_attempt_id) validatePreviousAttempt(db, preparation.view.previous_attempt_id, preparation.view.project_id, capture.issue.id);
    else if (previous && !input.queueCycle) throw new OperationError(409, 'EXPLICIT_RETRY_REQUIRED', 'This issue has already started. Prepare an explicit new attempt.');
    const id = randomUUID(); const passageId = randomUUID(); const deliveryVersion = randomUUID(); const now = Date.now();
    const suspension = capture.tools.some(t => t.state === 'unavailable') ? 'TOOL_VERSION_UNAVAILABLE' : null;
    const seq = Number(eventCursor(db)) + 1;
    // Global sequence, including other account histories.
    const next = db.prepare<[], { seq: number }>('SELECT coalesce(max(seq),0)+1 AS seq FROM events').get()?.seq ?? seq;
    const receipt = { revision: 1, event_cursor: String(next) };
    db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json)
      VALUES (?,?,?,'attempt.start','attempt',?,?,?,?)`).run(input.command.operationId, settings.installation_id, settings.account_id, id,
      commandHash(input.command), JSON.stringify({ etag: input.command.expectedRevision }), serializeOperationReceipt(receipt));
    db.prepare(`INSERT INTO attempts(id,operation_id,project_id,project_revision_id,preparation_id,preparation_revision,account_id,repository_id,issue_id,capture_json,phase,suspension,diagnostic,created_at_ms,updated_at_ms,source)
      VALUES (?,?,?,?,?,?,?,?,?,?,'preparing',?,?,?,?,?)`).run(id, input.command.operationId, preparation.view.project_id, config.configuration.id,
      preparation.view.id, preparation.view.revision, capture.accountId, capture.issue.repository.id, capture.issue.id, serializeCapture(capture), suspension, suspension, now, now,
      input.queueCycle ? 'automatic' : preparation.view.previous_attempt_id ? 'retry' : 'manual');
    if (input.queueCycle) consumeQueueCycle(db, input.queueCycle.accountId, input.queueCycle.projectId, input.queueCycle.issueId, input.queueCycle.cycleNumber, id);
    for (const c of capture.criteria) db.prepare('INSERT INTO attempt_criteria(attempt_id,criterion_id,occurrence_index,text) VALUES (?,?,?,?)').run(id, c.id, c.occurrence_index, c.text);
    db.prepare('INSERT INTO rounds(attempt_id,round_number,delivery_version,created_at_ms) VALUES (?,1,?,?)').run(id, deliveryVersion, now);
    const resource: RoleResourceReference = roles.get('implementer')!;
    const terminalName = `factory-${passageId}`;
    db.prepare(`INSERT INTO passages(id,attempt_id,round_number,delivery_version,role,role_resource_json,terminal_name,state,tracking_state,created_at_ms)
      VALUES (?,?,1,?,'implementer',?,?,'starting','pending',?)`).run(passageId, id, deliveryVersion, JSON.stringify(resource), terminalName, now);
    db.prepare(`INSERT INTO resources(id,attempt_id,passage_id,kind,reference,owned,launch_state,created_at_ms) VALUES (?,?,?,'implementation',?,0,'planned',?)`)
      .run(randomUUID(), id, passageId, `work/${id}/implementation`, now);
    db.prepare(`INSERT INTO resources(id,attempt_id,passage_id,kind,reference,owned,launch_state,created_at_ms) VALUES (?,?,?,'terminal',?,0,'planned',?)`)
      .run(randomUUID(), id, passageId, terminalName, now);
    attemptEvent(db, id, 'attempt.accepted');
    const operation = readOperation(db, input.command.operationId);
    if (!operation?.receipt) throw new StorageError('OPERATION_DATA_INVALID');
    return { created: true, operation };
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
    db.prepare("UPDATE checks SET state='error',diagnostic='VERIFICATION_INTERRUPTED',ended_at_ms=?,duration_ms=0 WHERE state IN ('pending','running')").run(Date.now());
    db.prepare("UPDATE verification_runs SET state='error',diagnostic='VERIFICATION_INTERRUPTED',ended_at_ms=? WHERE state='running'").run(Date.now());
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
