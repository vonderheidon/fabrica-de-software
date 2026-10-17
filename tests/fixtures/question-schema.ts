import { readFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { removeRecoverySchema } from './recovery-schema.js';

/** Reconstruct v8 in temporary test databases only, before testing historical upgrades. */
export function removeQuestionSchema(db: Database.Database): void {
  removeRecoverySchema(db);
  const old = db.prepare('SELECT id,passage_id,attempt_id,question_hash,question_json,answer_operation_id,answer,state,created_at_ms FROM execution_questions').all() as {
    id: string; passage_id: string; attempt_id: string; question_hash: string; question_json: string; answer_operation_id: string | null; answer: string | null; state: string; created_at_ms: number;
  }[];
  db.exec('DROP TABLE passage_measurements; DROP TABLE execution_questions');
  const sql = readFileSync(new URL('../../apps/controller/src/modules/storage/migrations/005_attempts.sql', import.meta.url), 'utf8');
  db.exec(sql.slice(sql.indexOf('CREATE TABLE execution_questions'), sql.indexOf('ALTER TABLE events')));
  db.exec("CREATE TRIGGER execution_questions_delete_immutable BEFORE DELETE ON execution_questions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END");
  for (const q of old) db.prepare('INSERT INTO execution_questions VALUES (?,?,?,?,?,?,?,?,?)').run(q.id, q.passage_id, q.attempt_id, q.question_hash, q.question_json,
    q.answer_operation_id, q.answer, ['pending','recorded','delivered','delivery_unknown'].includes(q.state) ? q.state : 'delivery_unknown', q.created_at_ms);
  db.exec('DELETE FROM schema_migrations WHERE version>=9; PRAGMA user_version=8');
}
