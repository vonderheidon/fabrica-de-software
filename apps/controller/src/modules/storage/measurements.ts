import type Database from 'better-sqlite3';
import { TimeDefaults, CostDefaults, type AttemptMeasurements, type PassageMeasurements } from '#contracts';
import { Value } from '@sinclair/typebox/value';
import { StorageError } from './errors.js';
import { attemptEvent, readAttempt } from './attempts.js';

/** Wall clock elapsed while the passage is tracked; human wait never consumes active time. */
export function checkpoint(db: Database.Database, passageId: string, mode?: 'active' | 'human' | 'stopped', now = Date.now()): void {
  db.prepare(`UPDATE passage_measurements SET
    active_ms=active_ms+CASE WHEN mode='active' THEN max(0,?-checkpoint_ms) ELSE 0 END,
    wait_ms=wait_ms+CASE WHEN mode='human' THEN max(0,?-checkpoint_ms) ELSE 0 END,
    checkpoint_ms=max(checkpoint_ms,?),mode=coalesce(?,mode) WHERE passage_id=?`).run(now, now, now, mode ?? null, passageId);
}
export function beginMeasurement(db: Database.Database, passageId: string): void {
  db.prepare("INSERT INTO passage_measurements(passage_id,checkpoint_ms,mode,observed) VALUES (?,?,'active',1)").run(passageId, Date.now());
}
export function readMeasurements(db: Database.Database, id: string): AttemptMeasurements {
  const a = readAttempt(db, id); const now = Date.now();
  const limits = db.prepare<[string], { times: string; costs: string }>(`SELECT json_extract(capture_json,'$.configuration.timeDefaults') AS times,
    json_extract(capture_json,'$.configuration.costDefaults') AS costs FROM attempts WHERE id=?`).get(id)!;
  const times: unknown = JSON.parse(limits.times); const costs: unknown = JSON.parse(limits.costs);
  if (!Value.Check(TimeDefaults,times) || !Value.Check(CostDefaults,costs)) throw new StorageError('OPERATION_DATA_INVALID');
  const totals = db.prepare<[number, number, string], { active: number; human: number; expired: number | null; unobserved: number }>(`SELECT
    coalesce(sum(active_ms+CASE WHEN mode='active' THEN max(0,?-checkpoint_ms) ELSE 0 END),0) AS active,
    coalesce(sum(wait_ms+CASE WHEN mode='human' THEN max(0,?-checkpoint_ms) ELSE 0 END),0) AS human,
    min(expired_at_ms) AS expired,coalesce(sum(CASE WHEN observed=0 OR p.tracking_state='lost' THEN 1 ELSE 0 END),0) AS unobserved
    FROM passage_measurements m JOIN passages p ON p.id=m.passage_id WHERE p.attempt_id=?`).get(now, now, id)!;
  const missing = totals.unobserved > 0 || a.tracking === 'lost';
  const costApplicable = Boolean(db.prepare('SELECT m.passage_id FROM passage_measurements m JOIN passages p ON p.id=m.passage_id WHERE p.attempt_id=?').get(id));
  const passages = db.prepare<[string], { id: string; role: 'implementer' | 'reviewer'; round_number: number; observed: number | null; active_ms: number; wait_ms: number; mode: string | null; checkpoint_ms: number; expired_at_ms: number | null; tracking_state: string }>(`SELECT p.id,p.role,p.round_number,p.tracking_state,m.observed,m.active_ms,m.wait_ms,m.mode,m.checkpoint_ms,m.expired_at_ms
    FROM passages p LEFT JOIN passage_measurements m ON m.passage_id=p.id WHERE p.attempt_id=? ORDER BY p.round_number,p.role`).all(id).map((p): PassageMeasurements => {
    const unavailable = p.observed === 0 || p.tracking_state === 'lost';
    const active = p.active_ms + (p.mode === 'active' ? Math.max(0, now - p.checkpoint_ms) : 0);
    const human = p.wait_ms + (p.mode === 'human' ? Math.max(0, now - p.checkpoint_ms) : 0);
    const unknown = { state: 'unavailable' as const, reason: 'PASSAGE_TIMING_INCOMPLETE', affectedRequirements: ['RF-61'] };
    return { passageId: p.id, role: p.role, round: p.round_number,
      activeTime: p.observed === null ? { state: 'not_applicable', reason: 'PASSAGE_NOT_STARTED' } : unavailable ? unknown : { state: 'measured', value: active, unit: 'ms' },
      humanWait: p.observed === null ? { state: 'not_applicable', reason: 'PASSAGE_NOT_STARTED' } : unavailable ? unknown : { state: 'measured', value: human, unit: 'ms' },
      activeLimitState: p.expired_at_ms !== null ? 'expired' : p.observed === null ? 'not_applicable' : unavailable ? 'unavailable' : 'within_limit', activeExpiredAtMs: p.expired_at_ms };
  });
  return {
    activeTime: !costApplicable ? { state: 'not_applicable', reason: 'PASSAGE_NOT_STARTED' } : missing ? { state: 'unavailable', reason: 'PASSAGE_TIMING_INCOMPLETE', affectedRequirements: ['RF-61'] } : { state: 'measured', value: totals.active, unit: 'ms' },
    humanWait: missing ? { state: 'unavailable', reason: 'PASSAGE_TIMING_INCOMPLETE', affectedRequirements: ['RF-61'] } : { state: 'measured', value: totals.human, unit: 'ms' },
    cost: costApplicable ? { state: 'unavailable', reason: 'EXECUTOR_COST_NOT_OBSERVED', affectedRequirements: ['RF-61'] } : { state: 'not_applicable', reason: 'PROVIDER_NOT_STARTED' },
    activeLimit: { state: 'configured', value: times.passageActiveTimeMs, unit: 'ms' },
    questionTtl: times.questionTtl, costLimit: costs.limit,
    activeLimitState: totals.expired !== null ? 'expired' : !costApplicable ? 'not_applicable' : missing ? 'unavailable' : 'within_limit',
    costLimitState: !costApplicable ? 'not_applicable' : costs.limit.state === 'not_configured' ? 'not_configured' : 'unavailable',
    activeExpiredAtMs: totals.expired,
    passages,
    pendingRequirements: [
      ...(missing ? [{ cause: 'PASSAGE_TIMING_INCOMPLETE', affectedRequirements: ['RF-61'], pending: 'The unobserved interval cannot be reconstructed after tracking loss or restart.' }] : []),
      ...(costApplicable ? [{ cause: 'EXECUTOR_COST_NOT_OBSERVED', affectedRequirements: ['RF-61'], pending: 'Obtain authoritative cost and currency from the executor before enforcing a cost limit.' }] : []),
    ],
  };
}
/** Called in a short write transaction, never from terminal silence/progress heuristics. */
export function expireLimits(db: Database.Database): string[] {
  const now = Date.now();
  const running = db.prepare<[], { passage_id: string; attempt_id: string; capture_json: string }>(`SELECT m.passage_id,p.attempt_id,a.capture_json FROM passage_measurements m
    JOIN passages p ON p.id=m.passage_id JOIN attempts a ON a.id=p.attempt_id WHERE m.mode<>'stopped' AND a.result IS NULL`).all();
  for (const p of running) {
    checkpoint(db, p.passage_id, undefined, now);
    const limit = (JSON.parse(p.capture_json) as import('#contracts').AttemptCapture).configuration.timeDefaults.passageActiveTimeMs;
    const m = db.prepare<[string], { active_ms: number; expired_at_ms: number | null }>('SELECT active_ms,expired_at_ms FROM passage_measurements WHERE passage_id=?').get(p.passage_id)!;
    if (m.expired_at_ms === null && m.active_ms >= limit) {
      db.prepare("UPDATE passage_measurements SET expired_at_ms=?,mode='stopped' WHERE passage_id=?").run(now, p.passage_id);
      db.prepare("UPDATE attempts SET suspension='ACTIVE_TIME_EXPIRED',diagnostic='ACTIVE_TIME_EXPIRED',revision=revision+1,updated_at_ms=? WHERE id=?").run(now, p.attempt_id);
      attemptEvent(db, p.attempt_id, 'active-time.expired');
    }
  }
  const questions = db.prepare<[number], { id: string; attempt_id: string; passage_id: string }>(`SELECT id,attempt_id,passage_id FROM execution_questions
    WHERE state IN ('pending','recorded','sending','delivery_unknown') AND ttl_ms IS NOT NULL AND created_at_ms+ttl_ms<=?`).all(now);
  for (const q of questions) {
    checkpoint(db, q.passage_id, 'stopped', now);
    db.prepare("UPDATE execution_questions SET state='expired',expired_at_ms=?,revision=revision+1 WHERE id=?").run(now, q.id);
    db.prepare("UPDATE attempts SET suspension=CASE WHEN suspension='HUMAN_DECISION' THEN 'QUESTION_EXPIRED' ELSE suspension END,revision=revision+1,updated_at_ms=? WHERE id=? AND result IS NULL").run(now, q.attempt_id);
    attemptEvent(db, q.attempt_id, 'question.expired');
  }
  // A boundary check may detect expiration before the scheduler. Keep its stop intent discoverable.
  return db.prepare<[], { id: string }>(`SELECT DISTINCT a.id FROM attempts a JOIN passages p ON p.attempt_id=a.id
    JOIN passage_measurements m ON m.passage_id=p.id WHERE m.expired_at_ms IS NOT NULL AND a.result IS NULL AND a.suspension='ACTIVE_TIME_EXPIRED'`).all().map(a => a.id);
}
