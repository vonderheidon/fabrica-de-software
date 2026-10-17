import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { CancelAttempt, RemoveResource, EmptyBody, OperationId, AttemptResource, type Delivery } from '#contracts';
import { digest, eventCursor, guarded } from './configuration-reads.js';
import { readSettings } from './settings.js';
import { readAttempt, readCapture } from './attempts.js';
import { readDelivery } from './deliveries.js';
import { OperationError, readOperation, type StoredOperation } from './operations.js';
import { createExecutionPersistence } from './execution.js';
import { StorageError } from './errors.js';

interface CommandIdentity { operationId: string; attemptId: string; expectedRevision: string | undefined }
export type RecoveryCommand = CommandIdentity & (
  { kind: 'attempt.cancel'; body: CancelAttempt } |
  { kind: 'resource.remove'; resourceId: string; body: RemoveResource } |
  { kind: 'folder.open'; resourceId: string; body: Record<string, never> } |
  { kind: 'interaction.open'; resourceId: string; passageId: string; body: Record<string, never> }
);
export interface ResourceSnapshot {
  resource: AttemptResource; etag: string; stamp: string; stopped: boolean; removalPending: boolean; deliveries: Delivery[]; eventCursor: string;
}
export function readOwnedPassage(db: Database.Database, attemptId: string, passageId: string) {
  readAttempt(db, attemptId);
  if (!Value.Check(OperationId, passageId)) throw new OperationError(400, 'PASSAGE_ID_INVALID', 'Passage ID is invalid.');
  if (!db.prepare('SELECT id FROM passages WHERE id=? AND attempt_id=?').get(passageId, attemptId)) throw new OperationError(404, 'PASSAGE_NOT_FOUND', 'Passage not found in this attempt.');
  return createExecutionPersistence(db).getPassage({ passageId });
}
export function readResources(db: Database.Database, attemptId: string) {
  readAttempt(db, attemptId);
  const entries = db.prepare<[string], Omit<AttemptResource, 'owned' | 'removed'> & { owned: number; removed: number }>(`SELECT id,attempt_id AS attemptId,passage_id AS passageId,kind,reference,owned,
    launch_state AS launchState,stop_state AS stopState,diagnostic,revision,removed FROM resources WHERE attempt_id=? ORDER BY created_at_ms,id`).all(attemptId)
    .map(r => ({ ...r, owned: r.owned === 1, removed: r.removed === 1 }));
  if (entries.some(r => !Value.Check(AttemptResource, r))) throw new StorageError('OPERATION_DATA_INVALID');
  const terminals = entries.filter(r => r.kind === 'terminal');
  const checks = db.prepare<[string], { state: string; diagnostic: string | null; execution_diagnostic: string | null }>('SELECT state,diagnostic,execution_diagnostic FROM checks WHERE attempt_id=?').all(attemptId);
  const uncertain = checks.some(r => r.diagnostic === 'VERIFICATION_INTERRUPTED' || r.diagnostic?.includes('STOP_UNCONFIRMED') || r.execution_diagnostic?.includes('STOP_UNCONFIRMED'));
  const cleanup = uncertain || terminals.some(r => r.stopState === 'uncertain') ? 'uncertain' as const :
    terminals.every(r => r.stopState === 'confirmed') && !entries.some(r => r.launchState === 'starting') && !checks.some(r => ['pending', 'running'].includes(r.state)) ? 'complete' as const : 'pending' as const;
  return { entries, cleanup, eventCursor: eventCursor(db) };
}
export function resourceSnapshot(db: Database.Database, attemptId: string, resourceId: string): ResourceSnapshot {
  if (!Value.Check(OperationId, resourceId)) throw new OperationError(400, 'RESOURCE_ID_INVALID', 'Resource ID is invalid.');
  const attempt = readAttempt(db, attemptId); const resources = readResources(db, attemptId);
  const resource = resources.entries.find(r => r.id === resourceId);
  if (!resource) throw new OperationError(404, 'RESOURCE_NOT_FOUND', 'Resource not found in this attempt.');
  const runs = db.prepare<[string], { state: string; diagnostic: string | null; execution_diagnostic: string | null }>('SELECT state,diagnostic,execution_diagnostic FROM checks WHERE attempt_id=?').all(attemptId);
  const captures = db.prepare<[string], { state: string }>('SELECT c.state FROM capture_runs c JOIN deliveries d ON d.id=c.delivery_id WHERE d.attempt_id=?').all(attemptId);
  const deliveries = db.prepare<[string], { id: string }>('SELECT id FROM deliveries WHERE attempt_id=? ORDER BY round_number').all(attemptId).map(r => readDelivery(db, r.id));
  const { eventCursor: _cursor, ...attemptState } = attempt;
  const stamp = digest({ attempt: attemptState, entries: resources.entries, runs, captures, deliveries });
  const stopped = Boolean(attempt.result) && resources.cleanup === 'complete' && !runs.some(r =>
    ['pending', 'running'].includes(r.state) || r.execution_diagnostic?.includes('STOP_UNCONFIRMED') || r.diagnostic?.includes('STOP_UNCONFIRMED') ||
    r.diagnostic === 'VERIFICATION_INTERRUPTED') && !captures.some(r => r.state === 'running');
  const removalPending = Boolean(db.prepare("SELECT operation_id FROM resource_removals WHERE resource_id=? AND state IN ('accepted','unknown')").get(resourceId));
  return { resource, etag: `"${digest([resource.id, resource.revision])}"`, stamp, stopped, removalPending, deliveries, eventCursor: resources.eventCursor };
}
function commandHash(command: RecoveryCommand): string {
  const schema = command.kind === 'attempt.cancel' ? CancelAttempt : command.kind === 'resource.remove' ? RemoveResource : EmptyBody;
  if (!Value.Check(OperationId, command.operationId) || !Value.Check(OperationId, command.attemptId) || !Value.Check(schema, command.body) ||
    (command.kind !== 'attempt.cancel' && !Value.Check(OperationId, command.resourceId)) ||
    (command.kind === 'interaction.open' && !Value.Check(OperationId, command.passageId)) ||
    (command.expectedRevision !== undefined && command.expectedRevision.length > 256)) throw new OperationError(400, 'RECOVERY_INVALID', 'Invalid recovery command.');
  // Cancellation deliberately has no stale revision precondition.
  return digest({ kind: command.kind, attemptId: command.attemptId, resourceId: command.kind === 'attempt.cancel' ? null : command.resourceId,
    passageId: command.kind === 'interaction.open' ? command.passageId : null,
    body: command.body, expectedRevision: command.kind === 'attempt.cancel' ? null : command.expectedRevision ?? null });
}
export function recoverRecovery(db: Database.Database, command: RecoveryCommand): StoredOperation | null {
  const hash = commandHash(command); const s = readSettings(db);
  const old = db.prepare<[string], { installation_id: string; account_id: string | null; request_hash: string }>('SELECT installation_id,account_id,request_hash FROM operation_requests WHERE operation_id=?').get(command.operationId);
  if (!old) return null;
  if (old.installation_id !== s.installationId || old.account_id !== s.accountId || old.request_hash !== hash) throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'The operation conflicts with an accepted command.');
  const operation = readOperation(db, command.operationId);
  if (!operation?.receipt) throw new StorageError('OPERATION_DATA_INVALID'); return operation;
}
export function acceptRecovery(db: Database.Database, command: RecoveryCommand, snapshotStamp?: string): { operation: StoredOperation; created: boolean } {
  return guarded(() => db.transaction(() => {
    const old = recoverRecovery(db, command); if (old) return { operation: old, created: false };
    const attempt = readAttempt(db, command.attemptId); const s = readSettings(db);
    let created = true; let revision: number;
    if (command.kind === 'attempt.cancel') {
      created = !db.prepare('SELECT operation_id FROM cancellation_requests WHERE attempt_id=?').get(attempt.id);
      createExecutionPersistence(db).recordCancellation(attempt.id, command.operationId);
      revision = readAttempt(db, attempt.id).revision;
    } else {
      const snapshot = resourceSnapshot(db, attempt.id, command.resourceId);
      if (snapshot.stamp !== snapshotStamp) throw new OperationError(409, 'RESOURCE_CHANGED', 'The resource changed during validation.');
      if (command.kind === 'interaction.open') {
        const passage = createExecutionPersistence(db).getPassage({ passageId: command.passageId });
        if (passage.binding.attemptId !== attempt.id || passage.terminalName !== snapshot.resource.reference || passage.state !== 'ready') throw new OperationError(409, 'NATIVE_OPEN_UNAVAILABLE', 'The original passage is no longer available.');
      }
      if (command.kind === 'resource.remove') {
        if (command.expectedRevision === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
        if (command.expectedRevision !== snapshot.etag) throw new OperationError(412, 'REVISION_CONFLICT', 'The resource changed.');
        if (!snapshot.stopped) throw new OperationError(409, 'RESOURCE_NOT_STOPPED', 'Known writers have not been confirmed stopped.');
        if (snapshot.resource.kind !== 'implementation' || !snapshot.resource.owned || snapshot.resource.removed) throw new OperationError(409, 'RESOURCE_REMOVAL_UNAVAILABLE', 'Only an existing owned environment can be removed.');
        if (db.prepare("SELECT operation_id FROM resource_removals WHERE resource_id=? AND state IN ('accepted','unknown')").get(command.resourceId)) throw new OperationError(409, 'REMOVAL_IN_PROGRESS', 'Removal is already accepted or uncertain.');
      }
      revision = snapshot.resource.revision;
    }
    const resourceId = command.kind === 'attempt.cancel' ? attempt.id : command.resourceId;
    const entityType = command.kind === 'attempt.cancel' ? 'attempt' : 'resource';
    const seq = (db.prepare<[], { seq: number }>('SELECT coalesce(max(seq),0)+1 AS seq FROM events').get()?.seq ?? 1);
    const receipt = { revision, eventCursor: String(seq) };
    db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(command.operationId, s.installationId, s.accountId, command.kind, entityType, resourceId, commandHash(command),
        JSON.stringify({ etag: command.kind === 'attempt.cancel' ? null : command.expectedRevision ?? null }), JSON.stringify(receipt));
    if (command.kind === 'attempt.cancel') db.prepare('INSERT INTO cancellation_requests VALUES (?,?,?)').run(command.operationId, attempt.id, Date.now());
    else if (command.kind === 'resource.remove') db.prepare("INSERT INTO resource_removals VALUES (?,?,?,'accepted',NULL,?)").run(command.operationId, command.resourceId, command.body.planHash, Date.now());
    else db.prepare("INSERT INTO native_open_requests VALUES (?,?,?,'accepted',?)").run(command.operationId, command.resourceId, command.kind, Date.now());
    db.prepare(`INSERT INTO events(seq,entity_type,entity_id,project_id,attempt_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms)
      VALUES (?,?,?,?,?,?,?,?,'{}',?)`).run(seq, entityType, resourceId, attempt.projectId, attempt.id, command.operationId, `${command.kind}.accepted`, revision, Date.now());
    const operation = readOperation(db, command.operationId); if (!operation?.receipt) throw new StorageError('OPERATION_DATA_INVALID');
    return { operation, created };
  }).immediate());
}
export function finishRecovery(db: Database.Database, operationId: string, outcome: 'confirmed' | 'failed' | 'unknown'): void {
  guarded(() => db.transaction(() => {
    const removal = db.prepare<[string], { resource_id: string; state: string }>('SELECT resource_id,state FROM resource_removals WHERE operation_id=?').get(operationId);
    if (removal && removal.state !== 'accepted') return;
    if (removal?.state === 'accepted') {
      if (outcome === 'confirmed') db.prepare('UPDATE resources SET removed=1 WHERE id=?').run(removal.resource_id);
      else db.prepare('UPDATE resources SET revision=revision+1 WHERE id=?').run(removal.resource_id);
      db.prepare('UPDATE resource_removals SET state=?,diagnostic=? WHERE operation_id=?').run(outcome === 'confirmed' ? 'removed' : outcome,
        outcome === 'confirmed' ? null : 'REMOVAL_INCOMPLETE', operationId);
    } else {
      const updated = db.prepare("UPDATE native_open_requests SET state=? WHERE operation_id=? AND state='accepted'").run(outcome === 'confirmed' ? 'requested' : 'unknown', operationId);
      if (!updated.changes) return;
      db.prepare('UPDATE resources SET revision=revision+1 WHERE id=(SELECT resource_id FROM native_open_requests WHERE operation_id=?)').run(operationId);
    }
    const operation = readOperation(db, operationId);
    if (!operation?.receipt) throw new StorageError('OPERATION_DATA_INVALID');
    const attemptId = db.prepare<[string], { attempt_id: string }>('SELECT attempt_id FROM resources WHERE id=?').get(operation.resource.id)?.attempt_id;
    if (!attemptId) throw new StorageError('OPERATION_DATA_INVALID');
    const a = readAttempt(db, attemptId);
    const revision = db.prepare<[string], { revision: number }>('SELECT revision FROM resources WHERE id=?').get(operation.resource.id)?.revision;
    if (!revision) throw new StorageError('OPERATION_DATA_INVALID');
    db.prepare(`INSERT INTO events(entity_type,entity_id,project_id,attempt_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms)
      VALUES ('resource',?,?,?,?,?,?,'{}',?)`).run(operation.resource.id, a.projectId, a.id, operationId, `${operation.kind}.${outcome}`, revision, Date.now());
  }).immediate());
}
export function validatePreviousAttempt(db: Database.Database, id: string, projectId: string, issueId: string): void {
  const prior = readAttempt(db, id); const capture = readCapture(db, id);
  if (prior.projectId !== projectId || capture.issue.id !== issueId) throw new OperationError(404, 'PREVIOUS_ATTEMPT_NOT_FOUND', 'The previous attempt does not belong to this project and issue.');
  if (!prior.result) throw new OperationError(409, 'ATTEMPT_ACTIVE', 'End the previous attempt before preparing a new one.');
}
