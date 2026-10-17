CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  project_revision_id TEXT NOT NULL,
  preparation_id TEXT NOT NULL,
  preparation_revision INTEGER NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  repository_id TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  capture_json TEXT NOT NULL CHECK(json_valid(capture_json) AND json_extract(capture_json,'$.formatVersion') = 1),
  phase TEXT NOT NULL CHECK(phase IN ('preparing','implementing','verifying','reviewing','publishing','finished')),
  result TEXT CHECK(result IS NULL OR result IN ('delivered','rejected','failed','cancelled','interrupted')),
  suspension TEXT,
  diagnostic TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  CHECK((phase = 'finished') = (result IS NOT NULL)),
  UNIQUE(id, project_id),
  FOREIGN KEY(project_revision_id,project_id) REFERENCES project_revisions(id,project_id) ON DELETE RESTRICT,
  FOREIGN KEY(preparation_id,preparation_revision) REFERENCES preparation_revisions(preparation_id,revision) ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX attempts_active_issue ON attempts(account_id,repository_id,issue_id) WHERE result IS NULL;
CREATE INDEX attempts_project_created ON attempts(project_id,created_at_ms,id);
CREATE TABLE attempt_criteria (
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  criterion_id TEXT NOT NULL,
  occurrence_index INTEGER NOT NULL CHECK(occurrence_index >= 1),
  text TEXT NOT NULL,
  PRIMARY KEY(attempt_id,criterion_id), UNIQUE(attempt_id,occurrence_index)
) STRICT;
CREATE TABLE rounds (
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  round_number INTEGER NOT NULL CHECK(round_number BETWEEN 1 AND 6),
  delivery_version TEXT NOT NULL UNIQUE,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY(attempt_id,round_number), UNIQUE(attempt_id,round_number,delivery_version)
) STRICT;
CREATE TABLE passages (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  delivery_version TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('implementer','reviewer')),
  role_resource_json TEXT NOT NULL CHECK(json_valid(role_resource_json)),
  request_hash TEXT CHECK(request_hash IS NULL OR length(request_hash) = 64),
  terminal_name TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('starting','ready','partial','interrupted','cancelled')),
  tracking_state TEXT NOT NULL CHECK(tracking_state IN ('pending','tracked','lost')),
  diagnostic TEXT,
  effective_profile_json TEXT CHECK(effective_profile_json IS NULL OR json_valid(effective_profile_json)),
  executor_version TEXT,
  created_at_ms INTEGER NOT NULL,
  UNIQUE(id,attempt_id), UNIQUE(attempt_id,round_number,role),
  FOREIGN KEY(attempt_id,round_number,delivery_version) REFERENCES rounds(attempt_id,round_number,delivery_version) ON DELETE RESTRICT
) STRICT;
CREATE TABLE resources (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  passage_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('implementation','terminal')),
  reference TEXT NOT NULL,
  owned INTEGER NOT NULL CHECK(owned IN (0,1)),
  launch_state TEXT NOT NULL CHECK(launch_state IN ('planned','starting','ready','partial','failed')),
  stop_state TEXT NOT NULL DEFAULT 'not_requested' CHECK(stop_state IN ('not_requested','requested','confirmed','uncertain')),
  diagnostic TEXT,
  created_at_ms INTEGER NOT NULL,
  UNIQUE(attempt_id,kind,reference),
  FOREIGN KEY(passage_id,attempt_id) REFERENCES passages(id,attempt_id) ON DELETE RESTRICT
) STRICT;
CREATE TABLE passage_results (
  passage_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  result_hash TEXT NOT NULL CHECK(length(result_hash) = 64),
  receipt_id TEXT NOT NULL UNIQUE,
  summary_json TEXT NOT NULL CHECK(json_valid(summary_json)),
  accepted_at_ms INTEGER NOT NULL,
  FOREIGN KEY(passage_id,attempt_id) REFERENCES passages(id,attempt_id) ON DELETE RESTRICT
) STRICT;
CREATE TABLE criterion_results (
  passage_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  criterion_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK(verdict IN ('passed','failed','not_verified')),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json) AND json_array_length(evidence_json) >= 1),
  PRIMARY KEY(passage_id,criterion_id),
  FOREIGN KEY(passage_id,attempt_id) REFERENCES passages(id,attempt_id) ON DELETE RESTRICT,
  FOREIGN KEY(passage_id) REFERENCES passage_results(passage_id) ON DELETE RESTRICT,
  FOREIGN KEY(attempt_id,criterion_id) REFERENCES attempt_criteria(attempt_id,criterion_id) ON DELETE RESTRICT
) STRICT;
CREATE TABLE passage_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  passage_id TEXT NOT NULL REFERENCES passages(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  code TEXT,
  created_at_ms INTEGER NOT NULL
) STRICT;
CREATE INDEX passage_events_page ON passage_events(passage_id,seq);
CREATE TABLE execution_questions (
  id TEXT PRIMARY KEY,
  passage_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  question_hash TEXT NOT NULL CHECK(length(question_hash) = 64),
  question_json TEXT NOT NULL CHECK(json_valid(question_json)),
  answer_operation_id TEXT UNIQUE,
  answer TEXT,
  state TEXT NOT NULL CHECK(state IN ('pending','recorded','delivered','delivery_unknown')),
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(passage_id,attempt_id) REFERENCES passages(id,attempt_id) ON DELETE RESTRICT,
  UNIQUE(passage_id,question_hash)
) STRICT;
CREATE UNIQUE INDEX execution_question_pending ON execution_questions(passage_id) WHERE state <> 'delivered';
ALTER TABLE events ADD COLUMN attempt_id TEXT REFERENCES attempts(id) ON DELETE RESTRICT;
CREATE INDEX events_attempt_seq ON events(attempt_id,seq);
CREATE TRIGGER attempt_capture_immutable BEFORE UPDATE OF id,operation_id,project_id,project_revision_id,preparation_id,preparation_revision,account_id,repository_id,issue_id,capture_json,created_at_ms ON attempts
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER attempt_preparation_binding BEFORE INSERT ON attempts WHEN NOT EXISTS (
  SELECT 1 FROM preparation_revisions r WHERE r.preparation_id=NEW.preparation_id AND r.revision=NEW.preparation_revision AND r.project_id=NEW.project_id AND r.project_revision_id=NEW.project_revision_id
) BEGIN SELECT RAISE(ABORT,'ATTEMPT_PREPARATION_MISMATCH'); END;
CREATE TRIGGER passage_identity_immutable BEFORE UPDATE OF id,attempt_id,round_number,delivery_version,role,role_resource_json,terminal_name,created_at_ms ON passages
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER passage_request_immutable BEFORE UPDATE OF request_hash ON passages WHEN OLD.request_hash IS NOT NULL
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER passage_observation_immutable BEFORE UPDATE OF effective_profile_json,executor_version ON passages WHEN OLD.effective_profile_json IS NOT NULL
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER resource_identity_immutable BEFORE UPDATE OF id,attempt_id,passage_id,kind,reference,created_at_ms ON resources
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER attempt_criteria_update_immutable BEFORE UPDATE ON attempt_criteria
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER attempt_criteria_insert_sealed BEFORE INSERT ON attempt_criteria WHEN EXISTS (
  SELECT 1 FROM rounds WHERE attempt_id=NEW.attempt_id
) BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER attempt_criteria_delete_immutable BEFORE DELETE ON attempt_criteria
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER rounds_update_immutable BEFORE UPDATE ON rounds
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER rounds_delete_immutable BEFORE DELETE ON rounds
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER passage_results_update_immutable BEFORE UPDATE ON passage_results
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER passage_results_delete_immutable BEFORE DELETE ON passage_results
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER criterion_results_update_immutable BEFORE UPDATE ON criterion_results
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER criterion_results_delete_immutable BEFORE DELETE ON criterion_results
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER passage_events_update_immutable BEFORE UPDATE ON passage_events
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER passage_events_delete_immutable BEFORE DELETE ON passage_events
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER attempts_delete_immutable BEFORE DELETE ON attempts
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER passages_delete_immutable BEFORE DELETE ON passages
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER resources_delete_immutable BEFORE DELETE ON resources
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER execution_questions_delete_immutable BEFORE DELETE ON execution_questions
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
