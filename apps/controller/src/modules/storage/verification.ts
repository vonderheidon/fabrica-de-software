import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { Artifact, CheckRun, CheckHistoryQuery, OperationId, VerificationSummary, type CheckDefinition, type CheckHistory, type Delivery } from '#contracts';
import { readDelivery } from './deliveries.js';
import { attemptEvent, readAttempt, readCapture } from './attempts.js';
import { guarded } from './configuration-reads.js';
import { OperationError } from './operations.js';
import { StorageError } from './errors.js';

export interface VerificationPlan { id: string; delivery: Delivery; checks: { id: string; definition: CheckDefinition; timeoutMs: number }[] }
export interface CheckCompletion {
  state: 'passed' | 'failed' | 'error' | 'not_applicable'; exitCode: number | null;
  endedAtMs: number; durationMs: number; diagnostic: string | null; executionDiagnostic: string | null; artifact: Artifact | null;
}
const denied = () => new OperationError(409, 'VERIFICATION_NOT_ALLOWED', 'Verification requires the captured current version and live attempt continuity.');
function eligible(db: Database.Database, delivery: Delivery): void {
  const a = readAttempt(db, delivery.attemptId);
  if (delivery.captureState !== 'captured' || a.deliveryId !== delivery.id || a.result || a.phase !== 'verifying' || a.tracking !== 'tracked' ||
    (a.suspension !== null && a.suspension !== 'VERIFICATION_FAILED') || db.prepare("SELECT id FROM execution_questions WHERE attempt_id=? AND state<>'delivered'").get(a.id)) throw denied();
}
export function verificationSummary(db: Database.Database, deliveryId: string): VerificationSummary | null {
  const row = db.prepare<[string], VerificationSummary>(`SELECT v.id,v.delivery_id AS deliveryId,v.content_identity AS contentIdentity,v.run_number AS runNumber,
    v.state,v.diagnostic,v.started_at_ms AS startedAtMs,v.ended_at_ms AS endedAtMs,(SELECT count(*) FROM checks c WHERE c.verification_id=v.id) AS checkCount
    FROM verification_runs v WHERE v.delivery_id=? ORDER BY v.run_number DESC LIMIT 1`).get(deliveryId);
  if (row && !Value.Check(VerificationSummary, row)) throw new StorageError('OPERATION_DATA_INVALID');
  return row ?? null;
}
export function beginVerification(db: Database.Database, deliveryId: string): VerificationPlan {
  return guarded(() => db.transaction(() => {
    const delivery = readDelivery(db, deliveryId); eligible(db, delivery);
    if (db.prepare("SELECT id FROM verification_runs WHERE delivery_id=? AND state='running'").get(deliveryId)) throw denied();
    const definitions = readCapture(db, delivery.attemptId).configuration.configuration.checks;
    const id = randomUUID(); const now = Date.now();
    const n = db.prepare<[string], { n: number }>('SELECT coalesce(max(run_number),0)+1 AS n FROM verification_runs WHERE delivery_id=?').get(deliveryId)!.n;
    db.prepare("INSERT INTO verification_runs(id,delivery_id,attempt_id,content_identity,run_number,state,started_at_ms) VALUES (?,?,?,?,?,'running',?)")
      .run(id, deliveryId, delivery.attemptId, delivery.contentIdentity, n, now);
    const checks = definitions.map(definition => ({ id: randomUUID(), definition, timeoutMs: definition.timeout_ms ?? 300_000 }));
    for (const c of checks) db.prepare(`INSERT INTO checks(id,verification_id,delivery_id,attempt_id,content_identity,check_definition_id,run_number,command,cwd_relative,timeout_ms,state)
      VALUES (?,?,?,?,?,?,?,?,?,?,'pending')`).run(c.id, id, deliveryId, delivery.attemptId, delivery.contentIdentity, c.definition.id, n, c.definition.command, c.definition.cwd_relative, c.timeoutMs);
    db.prepare('UPDATE attempts SET suspension=NULL,diagnostic=NULL,revision=revision+1,updated_at_ms=? WHERE id=?').run(now, delivery.attemptId);
    attemptEvent(db, delivery.attemptId, 'verification.started');
    return { id, delivery, checks };
  }).immediate());
}
export function startCheck(db: Database.Database, checkId: string): void {
  guarded(() => db.transaction(() => {
    const row = db.prepare<[string], { delivery_id: string }>('SELECT delivery_id FROM checks WHERE id=?').get(checkId);
    if (!row) throw denied(); eligible(db, readDelivery(db, row.delivery_id));
    if (db.prepare("UPDATE checks SET state='running',started_at_ms=? WHERE id=? AND state='pending'").run(Date.now(), checkId).changes !== 1) throw denied();
  }).immediate());
}
export function finishCheck(db: Database.Database, checkId: string, completion: CheckCompletion): void {
  guarded(() => db.transaction(() => {
    const row = db.prepare<[string], { attempt_id: string; delivery_id: string; started_at_ms: number; state: string }>('SELECT attempt_id,delivery_id,started_at_ms,state FROM checks WHERE id=?').get(checkId);
    if (!row || row.state !== 'running') throw denied();
    let revoked = false;
    try { eligible(db, readDelivery(db, row.delivery_id)); } catch (error) { if (!(error instanceof OperationError)) throw error; revoked = true; }
    const c = revoked ? { ...completion, state: 'error' as const, diagnostic: 'VERIFICATION_CONTINUITY_REVOKED' } : completion;
    if (!Number.isSafeInteger(c.endedAtMs) || c.endedAtMs < row.started_at_ms || !Number.isSafeInteger(c.durationMs) || c.durationMs < 0 ||
      (c.exitCode !== null && !Number.isSafeInteger(c.exitCode)) ||
      (c.executionDiagnostic !== null && !/^[A-Z][A-Z0-9_]{0,127}$/.test(c.executionDiagnostic)) ||
      (c.state === 'passed' && (c.exitCode !== 0 || c.diagnostic !== null || !c.artifact)) ||
      (c.state === 'failed' && (c.exitCode === null || c.exitCode === 0 || !c.artifact)) ||
      (['error', 'not_applicable'].includes(c.state) && (!c.diagnostic || !/^[A-Z][A-Z0-9_]{0,127}$/.test(c.diagnostic)))) throw new OperationError(400, 'CHECK_RESULT_INVALID', 'The controller check result is invalid.');
    if (c.artifact) {
      const a = c.artifact;
      if (!Value.Check(Artifact, a) || a.attemptId !== row.attempt_id || a.deliveryId !== row.delivery_id || a.checkId !== checkId ||
        a.pathRelative !== `${a.attemptId}/${checkId}/${a.id}.log`) throw new OperationError(400, 'ARTIFACT_BINDING_INVALID', 'Artifact binding is invalid.');
      db.prepare('INSERT INTO artifacts(id,attempt_id,delivery_id,check_id,kind,path_relative,sha256,size_bytes,created_at_ms) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(a.id, a.attemptId, a.deliveryId, a.checkId, a.kind, a.pathRelative, a.sha256, a.sizeBytes, Date.now());
    }
    db.prepare('UPDATE checks SET state=?,exit_code=?,ended_at_ms=?,duration_ms=?,diagnostic=?,execution_diagnostic=? WHERE id=? AND state=\'running\'')
      .run(c.state, c.exitCode, c.endedAtMs, c.durationMs, c.diagnostic, c.executionDiagnostic, checkId);
    db.prepare('UPDATE attempts SET revision=revision+1,updated_at_ms=? WHERE id=?').run(Date.now(), row.attempt_id);
    attemptEvent(db, row.attempt_id, 'check.completed');
  }).immediate());
}
export function finishVerification(db: Database.Database, id: string, diagnostic: string | null = null): void {
  guarded(() => db.transaction(() => {
    const row = db.prepare<[string], { delivery_id: string; attempt_id: string; state: string }>('SELECT delivery_id,attempt_id,state FROM verification_runs WHERE id=?').get(id);
    if (!row || row.state !== 'running') throw denied();
    let allowed = true;
    try { eligible(db, readDelivery(db, row.delivery_id)); } catch (error) { if (!(error instanceof OperationError)) throw error; allowed = false; }
    if (!allowed) diagnostic = 'VERIFICATION_CONTINUITY_REVOKED';
    if (diagnostic && !/^[A-Z][A-Z0-9_]{0,127}$/.test(diagnostic)) throw new OperationError(400, 'CHECK_RESULT_INVALID', 'Invalid diagnostic.');
    const now = Date.now();
    db.prepare("UPDATE checks SET state='error',diagnostic=?,ended_at_ms=?,duration_ms=0 WHERE verification_id=? AND state IN ('pending','running')")
      .run(diagnostic ?? 'CHECK_EXECUTION_INCOMPLETE', now, id);
    const checks = db.prepare<[string], { state: string }>('SELECT state FROM checks WHERE verification_id=?').all(id);
    const state = diagnostic || checks.some(c => c.state === 'error') ? 'error' : checks.some(c => c.state === 'failed') ? 'failed' :
      checks.length === 0 || checks.some(c => c.state === 'not_applicable') ? 'not_applicable' : 'passed';
    const code = diagnostic ?? (checks.length === 0 ? 'CHECKS_NOT_CONFIGURED' : state === 'passed' ? null : state === 'failed' ? 'CHECKS_FAILED' : state === 'not_applicable' ? 'CHECK_NOT_APPLICABLE' : 'CHECK_EXECUTION_FAILED');
    db.prepare('UPDATE verification_runs SET state=?,diagnostic=?,ended_at_ms=? WHERE id=?').run(state, code, now, id);
    if (allowed) db.prepare('UPDATE attempts SET suspension=?,diagnostic=?,revision=revision+1,updated_at_ms=? WHERE id=?')
      .run(state === 'failed' || state === 'error' ? 'VERIFICATION_FAILED' : null, code, now, row.attempt_id);
    else db.prepare('UPDATE attempts SET revision=revision+1,updated_at_ms=? WHERE id=?').run(now, row.attempt_id);
    attemptEvent(db, row.attempt_id, `verification.${state}`);
  }).immediate());
}
export function readArtifact(db: Database.Database, id: string): Artifact {
  if (!Value.Check(OperationId, id)) throw new OperationError(400, 'ARTIFACT_ID_INVALID', 'Invalid artifact ID.');
  const row = db.prepare<[string], Artifact>(`SELECT id,attempt_id AS attemptId,delivery_id AS deliveryId,check_id AS checkId,kind,path_relative AS pathRelative,sha256,size_bytes AS sizeBytes FROM artifacts WHERE id=?`).get(id);
  if (!row) throw new OperationError(404, 'ARTIFACT_NOT_FOUND', 'Artifact not found.');
  if (!Value.Check(Artifact, row)) throw new StorageError('OPERATION_DATA_INVALID');
  const delivery = readDelivery(db, row.deliveryId);
  if (delivery.attemptId !== row.attemptId || !db.prepare('SELECT id FROM checks WHERE id=? AND delivery_id=? AND attempt_id=? AND content_identity=?').get(row.checkId, row.deliveryId, row.attemptId, delivery.contentIdentity)) throw new StorageError('OPERATION_DATA_INVALID');
  return row;
}
export function readCheckHistory(db: Database.Database, deliveryId: string, query: CheckHistoryQuery): CheckHistory {
  readDelivery(db, deliveryId);
  if (!Value.Check(CheckHistoryQuery, query)) throw new OperationError(400, 'CHECK_CURSOR_INVALID', 'Invalid check history query.');
  let run = Number.MAX_SAFE_INTEGER; let last = ''; let ceiling = db.prepare<[string], { n: number }>('SELECT coalesce(max(run_number),0) AS n FROM verification_runs WHERE delivery_id=?').get(deliveryId)!.n;
  if (query.cursor) {
    let value: unknown;
    try { value = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')); } catch { throw new OperationError(400, 'CHECK_CURSOR_INVALID', 'Invalid history cursor.'); }
    if (!Array.isArray(value) || value.length !== 4 || value[0] !== deliveryId || !Number.isSafeInteger(value[1]) || value[1] < 0 || !Number.isSafeInteger(value[2]) || value[2] < 1 || !Value.Check(OperationId, value[3])) throw new OperationError(400, 'CHECK_CURSOR_INVALID', 'Invalid history cursor.');
    ceiling = value[1] as number; run = value[2] as number; last = value[3] as string;
  }
  const limit = Number(query.limit ?? '25');
  const rows = db.prepare<[string, number, number, number, string, number], Omit<CheckRun, 'artifacts'>>(`SELECT id,verification_id AS verificationId,delivery_id AS deliveryId,content_identity AS contentIdentity,
    check_definition_id AS checkDefinitionId,run_number AS runNumber,command,cwd_relative AS cwdRelative,timeout_ms AS timeoutMs,state,exit_code AS exitCode,
    started_at_ms AS startedAtMs,ended_at_ms AS endedAtMs,duration_ms AS durationMs,diagnostic,execution_diagnostic AS executionDiagnostic FROM checks
    WHERE delivery_id=? AND run_number<=? AND (run_number<? OR (run_number=? AND id>?)) ORDER BY run_number DESC,id LIMIT ?`).all(deliveryId, ceiling, run, run, last, limit + 1);
  const entries = rows.slice(0, limit).map(row => {
    const ids = db.prepare<[string], { id: string }>('SELECT id FROM artifacts WHERE check_id=?').all(row.id);
    const value = { ...row, artifacts: ids.map(a => readArtifact(db, a.id)) };
    if (!Value.Check(CheckRun, value)) throw new StorageError('OPERATION_DATA_INVALID'); return value;
  });
  const tail = entries.at(-1); const hasMore = rows.length > limit;
  return { entries, hasMore, nextCursor: hasMore && tail ? Buffer.from(JSON.stringify([deliveryId, ceiling, tail.runNumber, tail.id])).toString('base64url') : null };
}
