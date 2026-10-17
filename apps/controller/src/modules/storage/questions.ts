import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { AnswerQuestion, OperationId, Question, type ScopeChange } from '#contracts';
import { readAttempt, readCapture } from './attempts.js';
import { digest, guarded } from './configuration-reads.js';
import { readSettings } from './settings.js';
import { OperationError, readOperation, type StoredOperation } from './operations.js';
import { checkpoint, expireLimits } from './measurements.js';

export interface AnswerCommand { attemptId: string; questionId: string; operationId: string; expectedRevision: string | undefined; body: AnswerQuestion }
export interface QuestionRow {
  id: string; passage_id: string; attempt_id: string; delivery_version: string; question_hash: string; question_json: string;
  answer_operation_id: string | null; answer: string | null; state: 'pending' | 'recorded' | 'sending' | 'delivered' | 'delivery_unknown' | 'expired' | 'cancelled';
  created_at_ms: number; revision: number; answered_at_ms: number | null; ttl_ms: number | null; expired_at_ms: number | null; receipt_json: string | null; scope_json: string | null;
}
export function questionRow(db: Database.Database, attemptId: string, id: string): QuestionRow {
  readAttempt(db, attemptId);
  if (!Value.Check(OperationId, id)) throw new OperationError(400, 'QUESTION_INVALID', 'Question ID is invalid.');
  const row = db.prepare<[string, string], QuestionRow>(`SELECT q.*,p.delivery_version FROM execution_questions q JOIN passages p ON p.id=q.passage_id WHERE q.id=? AND q.attempt_id=?`).get(id, attemptId);
  if (!row) throw new OperationError(404, 'QUESTION_NOT_FOUND', 'Question not found in the current attempt.');
  return row;
}
export const questionETag = (q: { id: string; revision: number }): string => `"${q.id}:${q.revision}"`;
export function readQuestion(db: Database.Database, attemptId: string, id: string): { view: Question; etag: string } {
  const q = questionRow(db, attemptId, id);
  const view: Question = {
    id: q.id, attemptId, passageId: q.passage_id, deliveryId: q.delivery_version, question: JSON.parse(q.question_json) as Question['question'],
    scopeChange: q.scope_json ? JSON.parse(q.scope_json) as ScopeChange : null,
    state: q.state === 'recorded' ? 'answer_recorded' : q.state, revision: q.revision, raisedAtMs: q.created_at_ms,
    answeredAtMs: q.answered_at_ms, ttl: readCapture(db, attemptId).configuration.timeDefaults.questionTtl, expiredAtMs: q.expired_at_ms,
    answer: q.answer, answerOperationId: q.answer_operation_id, deliveryReceipt: q.receipt_json ? JSON.parse(q.receipt_json) as Question['deliveryReceipt'] : null,
  };
  if (!Value.Check(Question, view)) throw new OperationError(503, 'QUESTION_DATA_INVALID', 'The question record is invalid.');
  return { view, etag: questionETag(q) };
}
function commandHash(c: AnswerCommand): string {
  if (![c.attemptId, c.questionId, c.operationId].every(id => Value.Check(OperationId, id)) || !Value.Check(AnswerQuestion, c.body) ||
    (c.expectedRevision !== undefined && (typeof c.expectedRevision !== 'string' || c.expectedRevision.length > 256))) throw new OperationError(400, 'ANSWER_INVALID', 'The answer command is invalid.');
  return digest({ method: 'POST', route: `/api/v1/attempts/${c.attemptId}/questions/${c.questionId}/answer`, body: c.body, expectedRevision: c.expectedRevision ?? null });
}
export function recoverAnswer(db: Database.Database, c: AnswerCommand): StoredOperation | null {
  const hash = commandHash(c); const s = readSettings(db);
  const previous = db.prepare<[string], { request_hash: string; installation_id: string; account_id: string | null }>('SELECT request_hash,installation_id,account_id FROM operation_requests WHERE operation_id=?').get(c.operationId);
  if (!previous) return null;
  if (previous.request_hash !== hash || previous.installation_id !== s.installationId || previous.account_id !== s.accountId) throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'The operation conflicts with an accepted command.');
  return readOperation(db, c.operationId);
}
export function recordAnswer(db: Database.Database, c: AnswerCommand): StoredOperation {
  return guarded(() => db.transaction(() => {
    const prior = recoverAnswer(db, c); if (prior) return prior;
    const q = questionRow(db, c.attemptId, c.questionId); const a = readAttempt(db, c.attemptId); const s = readSettings(db);
    if (c.expectedRevision === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match of the question is required.');
    if (c.expectedRevision !== questionETag(q)) throw new OperationError(412, 'REVISION_CONFLICT', 'The question changed.');
    const passage = db.prepare<[string], { state: string; tracking_state: string; round_number: number }>('SELECT state,tracking_state,round_number FROM passages WHERE id=?').get(q.passage_id)!;
    if (q.state !== 'pending' || (q.ttl_ms !== null && q.created_at_ms + q.ttl_ms <= Date.now()) || a.result || a.suspension !== 'HUMAN_DECISION' || a.round !== passage.round_number || passage.state !== 'ready' || passage.tracking_state !== 'tracked') {
      throw new OperationError(409, 'ANSWER_NOT_ALLOWED', 'The question is not pending in a tracked passage.');
    }
    if (c.body.scopeChoice === 'adopt_new') throw new OperationError(409, 'NEW_ATTEMPT_REQUIRED', 'Update the GitHub issue and prepare a new attempt to adopt new criteria.');
    if (q.scope_json && c.body.scopeChoice !== 'keep_captured') throw new OperationError(409, 'SCOPE_DECISION_REQUIRED', 'Explicitly keep the captured scope or prepare a new attempt.');
    const seq = db.prepare<[], { seq: number }>('SELECT coalesce(max(seq),0)+1 AS seq FROM events').get()!.seq;
    const receipt = { revision: q.revision + 1, eventCursor: String(seq) }; const now = Date.now();
    db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json)
      VALUES (?,?,?,'question.answer','question',?,?,?,?)`).run(c.operationId, s.installationId, s.accountId, q.id, commandHash(c), JSON.stringify({ etag: c.expectedRevision }), JSON.stringify(receipt));
    const updated = db.prepare("UPDATE execution_questions SET answer=?,answer_hash=?,answer_operation_id=?,answered_at_ms=?,state='recorded',revision=revision+1 WHERE id=? AND revision=?")
      .run(c.body.answer, digest(c.body), c.operationId, now, q.id, q.revision);
    if (updated.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'The question changed.');
    db.prepare('UPDATE attempts SET revision=revision+1,updated_at_ms=? WHERE id=?').run(now, c.attemptId);
    db.prepare(`INSERT INTO events(seq,entity_type,entity_id,project_id,attempt_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms)
      VALUES (?,'question',?,?,?,?,'question.answer-recorded',?,'{}',?)`).run(seq, q.id, a.projectId, a.id, c.operationId, receipt.revision, now);
    return readOperation(db, c.operationId)!;
  }).immediate());
}
/** Exclusive send claim before channel IO. A second caller can only consult, never resend. */
export function claimAnswer(db: Database.Database, passageId: string, operationId: string): boolean {
  return guarded(() => db.transaction(() => {
    expireLimits(db);
    const q = db.prepare<[string, string], { attempt_id: string; state: string }>('SELECT attempt_id,state FROM execution_questions WHERE passage_id=? AND answer_operation_id=?').get(passageId, operationId);
    if (!q || q.state !== 'recorded') return false;
    const a = readAttempt(db, q.attempt_id);
    if (a.result || a.suspension !== 'HUMAN_DECISION') return false;
    return db.prepare("UPDATE execution_questions SET state='sending',revision=revision+1 WHERE passage_id=? AND answer_operation_id=? AND state='recorded'").run(passageId, operationId).changes === 1;
  }).immediate());
}
export function stopQuestions(db: Database.Database, attemptId: string): void {
  const rows = db.prepare<[string], { passage_id: string }>("SELECT passage_id FROM execution_questions WHERE attempt_id=? AND state IN ('pending','recorded','sending','delivery_unknown')").all(attemptId);
  for (const q of rows) checkpoint(db, q.passage_id, 'stopped');
  db.prepare("UPDATE execution_questions SET state='cancelled',revision=revision+1 WHERE attempt_id=? AND state IN ('pending','recorded','sending','delivery_unknown')").run(attemptId);
}
