import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { OperationError } from './operations.js';
import { readSettings } from './settings.js';

export function latestIssueAttempt(db: Database.Database, repositoryId: string, issueId: string): { id: string; active: boolean } | null {
  const row = db.prepare<[string | null, string, string], { id: string; result: string | null }>(`SELECT id,result FROM attempts
    WHERE account_id IS ? AND repository_id=? AND issue_id=? ORDER BY (result IS NULL) DESC,created_at_ms DESC,id DESC LIMIT 1`)
    .get(readSettings(db).account_id, repositoryId, issueId);
  return row ? { id: row.id, active: row.result === null } : null;
}

export interface QueueCycleObservation {
  accountId: string;
  projectId: string;
  issueId: string;
  ready: boolean;
  eligible: boolean;
  existingAttemptId: string | null;
}
export interface QueueCycle {
  accountId: string;
  projectId: string;
  issueId: string;
  cycleNumber: number;
  ready: boolean;
  consumedAttemptId: string | null;
  updatedAtMs: number;
}

export function readQueueCycle(db: Database.Database, accountId: string, projectId: string, issueId: string): QueueCycle | null {
  const row = db.prepare<[string, string, string], { account_id: string; project_id: string; issue_id: string; cycle_number: number; last_ready: number; consumed_attempt_id: string | null; updated_at_ms: number }>(
    'SELECT * FROM queue_cycles WHERE account_id=? AND project_id=? AND issue_id=?').get(accountId, projectId, issueId);
  return row ? { accountId: row.account_id, projectId: row.project_id, issueId: row.issue_id, cycleNumber: row.cycle_number, ready: row.last_ready === 1,
    consumedAttemptId: row.consumed_attempt_id, updatedAtMs: row.updated_at_ms } : null;
}

export function recordQueueObservations(db: Database.Database, observations: readonly QueueCycleObservation[]): void {
  if (!observations.length) return;
  const write = db.transaction(() => {
    const now = Date.now();
    for (const [ordinal, observation] of observations.entries()) {
      const current = readQueueCycle(db, observation.accountId, observation.projectId, observation.issueId);
      if (!current) {
        db.prepare(`INSERT INTO queue_cycles(account_id,project_id,issue_id,cycle_number,last_ready,consumed_attempt_id,updated_at_ms,last_eligible,observed_ordinal)
          VALUES (?,?,?,1,?,?,?,?,?)`).run(observation.accountId, observation.projectId, observation.issueId, Number(observation.ready), observation.existingAttemptId, now, Number(observation.eligible), ordinal);
        continue;
      }
      let cycleNumber = current.cycleNumber;
      let consumedAttemptId = current.consumedAttemptId;
      let ready = current.ready;
      if (!observation.ready) ready = false;
      else if (observation.eligible) {
        if (!ready && consumedAttemptId !== null) { cycleNumber += 1; consumedAttemptId = null; }
        ready = true;
        if (consumedAttemptId === null && cycleNumber === 1 && observation.existingAttemptId) consumedAttemptId = observation.existingAttemptId;
      }
      db.prepare(`UPDATE queue_cycles SET cycle_number=?,last_ready=?,consumed_attempt_id=?,updated_at_ms=?,last_eligible=?,observed_ordinal=?,
        ready_exit_observed_at_ms=CASE WHEN ?=0 AND last_ready=1 THEN ? ELSE ready_exit_observed_at_ms END,
        ready_return_observed_at_ms=CASE WHEN ?>cycle_number THEN ? ELSE ready_return_observed_at_ms END
        WHERE account_id=? AND project_id=? AND issue_id=?`)
        .run(cycleNumber, Number(ready), consumedAttemptId, now, Number(observation.eligible), ordinal, Number(observation.ready), now, cycleNumber, now, observation.accountId, observation.projectId, observation.issueId);
    }
  });
  try { write.immediate(); }
  catch (error) {
    if (error instanceof OperationError) throw error;
    throw new OperationError(503, 'QUEUE_CYCLE_WRITE_FAILED', 'The queue observation could not be recorded.');
  }
}

export function consumeQueueCycle(db: Database.Database, accountId: string, projectId: string, issueId: string, cycleNumber: number, attemptId: string): void {
  const changed = db.prepare(`UPDATE queue_cycles SET consumed_attempt_id=?,updated_at_ms=? WHERE account_id=? AND project_id=? AND issue_id=?
    AND cycle_number=? AND last_ready=1 AND consumed_attempt_id IS NULL`).run(attemptId, Date.now(), accountId, projectId, issueId, cycleNumber);
  if (changed.changes !== 1) throw new OperationError(409, 'QUEUE_CYCLE_ALREADY_CONSUMED', 'The observed Ready cycle was already consumed or has changed.');
  db.prepare(`INSERT INTO queue_consumptions(id,account_id,project_id,repository_id,issue_id,observed_cycle,
    ready_exit_observed_at_ms,ready_return_observed_at_ms,consumed_at_ms,attempt_id)
    SELECT ?,c.account_id,c.project_id,a.repository_id,c.issue_id,c.cycle_number,c.ready_exit_observed_at_ms,c.ready_return_observed_at_ms,?,a.id
    FROM queue_cycles c JOIN attempts a ON a.id=? WHERE c.account_id=? AND c.project_id=? AND c.issue_id=?`)
    .run(randomUUID(), Date.now(), attemptId, accountId, projectId, issueId);
  // A duplicate project registration cannot turn the same observed Ready into a new job.
  db.prepare(`UPDATE queue_cycles SET consumed_attempt_id=?,updated_at_ms=? WHERE account_id=? AND issue_id=?
    AND last_ready=1 AND consumed_attempt_id IS NULL AND project_id IN (
      SELECT p.id FROM projects p JOIN project_revisions r ON r.id=p.current_revision_id
      JOIN attempts a ON a.id=? AND a.repository_id=r.repository_id)`)
    .run(attemptId, Date.now(), accountId, issueId, attemptId);
}
