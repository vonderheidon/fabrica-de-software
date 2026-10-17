CREATE TABLE execution_questions_v9 (
  id TEXT PRIMARY KEY,
  passage_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  question_hash TEXT NOT NULL CHECK(length(question_hash)=64),
  question_json TEXT NOT NULL CHECK(json_valid(question_json)),
  answer_operation_id TEXT UNIQUE,
  answer TEXT,
  state TEXT NOT NULL CHECK(state IN ('pending','recorded','sending','delivered','delivery_unknown','expired','cancelled')),
  created_at_ms INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  answer_hash TEXT CHECK(answer_hash IS NULL OR length(answer_hash)=64),
  answered_at_ms INTEGER,
  ttl_ms INTEGER CHECK(ttl_ms IS NULL OR ttl_ms>=0),
  expired_at_ms INTEGER,
  receipt_json TEXT CHECK(receipt_json IS NULL OR json_valid(receipt_json)),
  scope_json TEXT CHECK(scope_json IS NULL OR json_valid(scope_json)),
  FOREIGN KEY(passage_id,attempt_id) REFERENCES passages(id,attempt_id) ON DELETE RESTRICT,
  UNIQUE(passage_id,question_hash)
) STRICT;
INSERT INTO execution_questions_v9(id,passage_id,attempt_id,question_hash,question_json,answer_operation_id,answer,state,created_at_ms)
  SELECT id,passage_id,attempt_id,question_hash,question_json,answer_operation_id,answer,
    CASE WHEN state='delivered' THEN 'delivered' ELSE 'cancelled' END,created_at_ms FROM execution_questions;
DROP TABLE execution_questions;
ALTER TABLE execution_questions_v9 RENAME TO execution_questions;
CREATE UNIQUE INDEX execution_question_pending ON execution_questions(passage_id) WHERE state IN ('pending','recorded','sending','delivery_unknown','expired');
CREATE INDEX questions_attempt ON execution_questions(attempt_id,created_at_ms,id);
CREATE TRIGGER execution_questions_delete_immutable BEFORE DELETE ON execution_questions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER question_identity_immutable BEFORE UPDATE OF id,passage_id,attempt_id,question_hash,question_json,created_at_ms,ttl_ms,scope_json ON execution_questions
  BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER question_answer_binding BEFORE UPDATE OF answer_operation_id ON execution_questions WHEN NEW.answer_operation_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM operation_requests WHERE operation_id=NEW.answer_operation_id AND resource_type='question' AND resource_id=NEW.id AND operation_kind='question.answer'
) BEGIN SELECT RAISE(ABORT,'QUESTION_OPERATION_MISMATCH'); END;
CREATE TRIGGER question_answer_immutable BEFORE UPDATE OF answer_operation_id,answer,answer_hash,answered_at_ms ON execution_questions WHEN OLD.answer_operation_id IS NOT NULL
  BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER question_terminal_immutable BEFORE UPDATE ON execution_questions WHEN OLD.state IN ('delivered','expired','cancelled')
  BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TABLE passage_measurements (
  passage_id TEXT PRIMARY KEY REFERENCES passages(id) ON DELETE RESTRICT,
  active_ms INTEGER NOT NULL DEFAULT 0 CHECK(active_ms>=0),
  wait_ms INTEGER NOT NULL DEFAULT 0 CHECK(wait_ms>=0),
  checkpoint_ms INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('active','human','stopped')),
  expired_at_ms INTEGER,
  observed INTEGER NOT NULL CHECK(observed IN (0,1))
) STRICT;
INSERT INTO passage_measurements(passage_id,checkpoint_ms,mode,observed) SELECT id,created_at_ms,'stopped',0 FROM passages;
CREATE TRIGGER measurement_identity_immutable BEFORE UPDATE OF passage_id,observed ON passage_measurements BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER measurement_delete_immutable BEFORE DELETE ON passage_measurements BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
