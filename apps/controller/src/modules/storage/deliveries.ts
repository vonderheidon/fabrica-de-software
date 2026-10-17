import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { CaptureRetry, Delivery, OperationId, type CaptureWarning, type PassageBinding } from '#contracts';
import { OperationError, readOperation, type StoredOperation } from './operations.js';
import { attemptEvent, readAttempt, readCapture } from './attempts.js';
import { digest, eventCursor, guarded } from './configuration-reads.js';
import { readSettings } from './settings.js';
import { StorageError } from './errors.js';
import type { CapturedContent, CaptureInput } from '../workspaces/index.js';
import { verificationSummary } from './verification.js';

export interface RetryCaptureCommand {
  operationId: string; expectedRevision: string | undefined; attemptId: string; deliveryId: string; body: CaptureRetry;
}
export interface CaptureClaim { id: string; deliveryId: string; attemptRevision: number; input: CaptureInput }
export function createPendingDelivery(db: Database.Database, binding: PassageBinding): void {
  const capture = readCapture(db, binding.attemptId);
  db.prepare(`INSERT INTO deliveries(id,attempt_id,round_number,producer_passage_id,base_sha,repository_relative,capture_state)
    VALUES (?,?,?,?,?,?,'pending')`).run(binding.deliveryVersion, binding.attemptId, binding.round, binding.passageId, capture.baseSha, `git/${binding.attemptId}.git`);
}
export function readDelivery(db: Database.Database, id: string, authorize = true): Delivery {
  if (!Value.Check(OperationId, id)) throw new OperationError(400, 'DELIVERY_ID_INVALID', 'Delivery ID is invalid.');
  const row = db.prepare<[string], Omit<Delivery, 'hasDelta' | 'warnings'> & { hasDelta: number | null }>(`SELECT id,attempt_id AS attemptId,
    producer_passage_id AS producerPassageId,round_number AS round,base_sha AS baseSha,repository_relative AS repositoryRelative,
    capture_state AS captureState,git_ref AS gitRef,content_identity AS contentIdentity,commit_sha AS commitSha,has_delta AS hasDelta,
    diagnostic,captured_at_ms AS capturedAtMs,revision FROM deliveries WHERE id=?`).get(id);
  if (!row) throw new OperationError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found in the current scope.');
  if (authorize) readAttempt(db, row.attemptId);
  const warnings = db.prepare<[string], CaptureWarning>('SELECT attempt_id AS attemptId,passage_id AS passageId,delivery_id AS deliveryId,path,reason FROM capture_warnings WHERE delivery_id=? ORDER BY path').all(id);
  const value = { ...row, hasDelta: row.hasDelta === null ? null : row.hasDelta === 1, warnings };
  if (!Value.Check(Delivery, value)) throw new StorageError('OPERATION_DATA_INVALID'); return value;
}
const retryDenied = () => new OperationError(409, 'CAPTURE_RETRY_NOT_ALLOWED', 'Only a completed eligible producer with a technical capture failure can repeat capture.');
function eligible(db: Database.Database, d: Delivery): number {
  const a = readAttempt(db, d.attemptId);
  const p = db.prepare<[string], { role: string; state: string; tracking_state: string; writes_stopped: number; declared_files: string | null; round_number: number }>(`SELECT p.role,p.state,p.tracking_state,p.round_number,
    json_extract(r.summary_json,'$.writesStopped') AS writes_stopped,json_extract(r.summary_json,'$.declaredFiles') AS declared_files
    FROM passages p JOIN passage_results r ON r.passage_id=p.id WHERE p.id=?`).get(d.producerPassageId);
  if (!p || p.role !== 'implementer' || p.state !== 'ready' || p.tracking_state !== 'tracked' || p.writes_stopped !== 1 ||
    p.round_number !== a.round || a.phase !== 'verifying' || a.result || (a.suspension !== null && a.suspension !== 'CAPTURE_FAILED') ||
    db.prepare("SELECT id FROM execution_questions WHERE attempt_id=? AND state<>'delivered'").get(a.id)) throw retryDenied();
  return a.revision;
}
function claim(db: Database.Database, d: Delivery, operationId: string | null): CaptureClaim {
  const previousRevision = eligible(db, d); const attemptRevision = previousRevision + 1; const id = randomUUID();
  const advanced = db.prepare('UPDATE attempts SET revision=revision+1,updated_at_ms=? WHERE id=? AND revision=?').run(Date.now(), d.attemptId, previousRevision);
  if (advanced.changes !== 1) throw retryDenied();
  const changed = db.prepare("UPDATE deliveries SET capture_state='running',diagnostic=NULL,claim_id=?,claim_attempt_revision=?,revision=revision+1 WHERE id=? AND revision=? AND capture_state IN ('pending','failed')")
    .run(id, attemptRevision, d.id, d.revision);
  if (changed.changes !== 1) throw retryDenied();
  db.prepare("INSERT INTO capture_runs(id,delivery_id,operation_id,state,started_at_ms) VALUES (?,?,?,'running',?)").run(id, d.id, operationId, Date.now());
  const summary = db.prepare<[string], { summary_json: string }>('SELECT summary_json FROM passage_results WHERE passage_id=?').get(d.producerPassageId);
  const result = JSON.parse(summary!.summary_json) as { declaredFiles?: string[] };
  attemptEvent(db, d.attemptId, 'capture.running');
  return { id, deliveryId: d.id, attemptRevision, input: { attemptId: d.attemptId, passageId: d.producerPassageId, deliveryId: d.id, baseSha: d.baseSha, declaredFiles: result.declaredFiles ?? [] } };
}
export function beginCapture(db: Database.Database, id: string): CaptureClaim | null {
  return guarded(() => db.transaction(() => {
    const d = readDelivery(db, id, false); if (d.captureState !== 'pending') return null;
    try { eligible(db, d); }
    catch (error) {
      if (!(error instanceof OperationError)) throw error;
      db.prepare("UPDATE deliveries SET capture_state='failed',diagnostic='CAPTURE_CONTINUITY_REVOKED',revision=revision+1 WHERE id=?").run(id);
      db.prepare('UPDATE attempts SET revision=revision+1,updated_at_ms=? WHERE id=?').run(Date.now(), d.attemptId);
      attemptEvent(db, d.attemptId, 'capture.failed'); return null;
    }
    return claim(db, d, null);
  }).immediate());
}
function retryHash(c: RetryCaptureCommand) {
  if (!Value.Check(OperationId, c.operationId) || !Value.Check(OperationId, c.attemptId) || !Value.Check(OperationId, c.deliveryId) || !Value.Check(CaptureRetry, c.body) ||
    (c.expectedRevision !== undefined && c.expectedRevision.length > 256)) throw new OperationError(400, 'CAPTURE_RETRY_INVALID', 'Capture retry input is invalid.');
  return digest({ method: 'POST', route: `/api/v1/attempts/${c.attemptId}/deliveries/${c.deliveryId}/capture/retry`, body: c.body, expectedRevision: c.expectedRevision ?? null });
}
export function recoverCaptureRetry(db: Database.Database, c: RetryCaptureCommand): StoredOperation | null {
  const hash = retryHash(c); const settings = readSettings(db);
  const old = db.prepare<[string], { installation_id: string; account_id: string | null; request_hash: string }>('SELECT installation_id,account_id,request_hash FROM operation_requests WHERE operation_id=?').get(c.operationId);
  if (!old) return null;
  if (old.installation_id !== settings.installationId || old.account_id !== settings.accountId || old.request_hash !== hash) throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'The operation conflicts with an accepted command.');
  const op = readOperation(db, c.operationId); if (!op?.receipt || op.kind !== 'capture.retry') throw new StorageError('OPERATION_DATA_INVALID'); return op;
}
export function retryCapture(db: Database.Database, c: RetryCaptureCommand): { operation: StoredOperation; claim: CaptureClaim | null } {
  return guarded(() => db.transaction(() => {
    const previous = recoverCaptureRetry(db, c); if (previous) return { operation: previous, claim: null };
    const d = readDelivery(db, c.deliveryId); const a = readAttempt(db, c.attemptId);
    if (d.attemptId !== a.id || d.producerPassageId !== c.body.producerPassageId || d.captureState !== 'failed' ||
      ['CAPTURE_CONTINUITY_REVOKED', 'CAPTURE_REF_CONFLICT', 'DELIVERY_INTEGRITY_FAILED'].includes(d.diagnostic ?? '')) throw retryDenied();
    if (!c.expectedRevision) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
    if (c.expectedRevision !== `"${a.id}:${a.revision}"`) throw retryDenied();
    eligible(db, d);
    const settings = readSettings(db); const seq = db.prepare<[], { n: number }>('SELECT coalesce(max(seq),0)+1 AS n FROM events').get()!.n;
    const receipt = { revision: d.revision + 1, eventCursor: String(seq) };
    db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json)
      VALUES (?,?,?,'capture.retry','delivery',?,?,?,?)`).run(c.operationId, settings.installationId, settings.accountId, d.id, retryHash(c), JSON.stringify({ etag: c.expectedRevision }), JSON.stringify(receipt));
    db.prepare(`INSERT INTO events(entity_type,entity_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms,project_id,attempt_id)
      VALUES ('delivery',?,?,'capture.retry.accepted',?,'{}',?,?,?)`).run(d.id, c.operationId, receipt.revision, Date.now(), a.projectId, a.id);
    const reserved = claim(db, d, c.operationId);
    const op = readOperation(db, c.operationId); if (!op?.receipt) throw new StorageError('OPERATION_DATA_INVALID');
    return { operation: op, claim: reserved };
  }).immediate());
}
export function finishCapture(db: Database.Database, c: CaptureClaim, content: CapturedContent | null, diagnostic: string | null): void {
  guarded(() => db.transaction(() => {
    // This is completion of an owned IO effect, even if the observed account changed meanwhile.
    const d = readDelivery(db, c.deliveryId, false);
    const ownership = db.prepare<[string], { claim_id: string; claim_attempt_revision: number }>('SELECT claim_id,claim_attempt_revision FROM deliveries WHERE id=?').get(d.id);
    if (d.captureState !== 'running' || ownership?.claim_id !== c.id || ownership.claim_attempt_revision !== c.attemptRevision) throw retryDenied();
    let allowed = false;
    try { allowed = eligible(db, d) === c.attemptRevision; } catch (error) {
      if (!(error instanceof OperationError)) throw error;
    }
    const accepted = allowed ? content : null; const code = allowed ? diagnostic : 'CAPTURE_CONTINUITY_REVOKED';
    if (accepted) {
      const candidate = { ...d, ...accepted, captureState: 'captured' as const, diagnostic: null, capturedAtMs: Date.now(), revision: d.revision + 1 };
      if (!Value.Check(Delivery, candidate) || candidate.gitRef !== `refs/factory/deliveries/${d.id}` || accepted.warnings.some(w =>
        w.attemptId !== d.attemptId || w.passageId !== d.producerPassageId || w.deliveryId !== d.id)) throw new OperationError(400, 'CAPTURE_METADATA_INVALID', 'Captured references or warning bindings are invalid.');
      for (const w of accepted.warnings) db.prepare('INSERT OR IGNORE INTO capture_warnings(delivery_id,attempt_id,passage_id,path,reason) VALUES (?,?,?,?,?)')
        .run(w.deliveryId, w.attemptId, w.passageId, w.path, w.reason);
      db.prepare("UPDATE deliveries SET capture_state='captured',git_ref=?,content_identity=?,commit_sha=?,has_delta=?,captured_at_ms=?,diagnostic=NULL,revision=revision+1 WHERE id=?")
        .run(accepted.gitRef, accepted.contentIdentity, accepted.commitSha, accepted.hasDelta ? 1 : 0, candidate.capturedAtMs, d.id);
    } else {
      if (!code || !/^[A-Z][A-Z0-9_]{0,127}$/.test(code)) throw new OperationError(400, 'CAPTURE_DIAGNOSTIC_INVALID', 'Capture diagnostic is invalid.');
      db.prepare("UPDATE deliveries SET capture_state='failed',diagnostic=?,revision=revision+1 WHERE id=?").run(code, d.id);
    }
    db.prepare('UPDATE capture_runs SET state=?,diagnostic=?,ended_at_ms=? WHERE id=? AND state=\'running\'').run(accepted ? 'captured' : 'failed', accepted ? null : code, Date.now(), c.id);
    if (allowed) db.prepare('UPDATE attempts SET suspension=?,diagnostic=?,revision=revision+1,updated_at_ms=? WHERE id=?')
      .run(accepted ? null : 'CAPTURE_FAILED', accepted ? null : code, Date.now(), d.attemptId);
    else db.prepare('UPDATE attempts SET revision=revision+1,updated_at_ms=? WHERE id=?').run(Date.now(), d.attemptId);
    attemptEvent(db, d.attemptId, accepted ? 'capture.captured' : 'capture.failed');
  }).immediate());
}
export function deliveryView(db: Database.Database, id: string) { return { delivery: readDelivery(db, id), verification: verificationSummary(db, id), eventCursor: eventCursor(db) }; }
