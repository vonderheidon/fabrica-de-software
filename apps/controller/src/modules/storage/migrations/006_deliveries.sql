CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  producer_passage_id TEXT NOT NULL UNIQUE,
  base_sha TEXT NOT NULL CHECK(length(base_sha) IN (40,64)),
  repository_relative TEXT NOT NULL,
  capture_state TEXT NOT NULL CHECK(capture_state IN ('pending','running','captured','failed')),
  git_ref TEXT UNIQUE,
  content_identity TEXT CHECK(content_identity IS NULL OR length(content_identity) IN (40,64)),
  commit_sha TEXT CHECK(commit_sha IS NULL OR length(commit_sha) IN (40,64)),
  has_delta INTEGER CHECK(has_delta IS NULL OR has_delta IN (0,1)),
  diagnostic TEXT,
  captured_at_ms INTEGER,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  claim_id TEXT,
  claim_attempt_revision INTEGER,
  CHECK((capture_state='captured') = (git_ref IS NOT NULL AND content_identity IS NOT NULL AND commit_sha IS NOT NULL AND has_delta IS NOT NULL AND captured_at_ms IS NOT NULL)),
  CHECK(repository_relative = 'git/' || attempt_id || '.git'),
  CHECK(git_ref IS NULL OR git_ref = 'refs/factory/deliveries/' || id),
  UNIQUE(id,attempt_id,producer_passage_id),
  FOREIGN KEY(producer_passage_id,attempt_id) REFERENCES passages(id,attempt_id) ON DELETE RESTRICT,
  FOREIGN KEY(attempt_id,round_number,id) REFERENCES rounds(attempt_id,round_number,delivery_version) ON DELETE RESTRICT
) STRICT;
CREATE INDEX deliveries_attempt_round ON deliveries(attempt_id,round_number);
CREATE TABLE capture_runs (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE RESTRICT,
  operation_id TEXT UNIQUE REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK(state IN ('running','captured','failed')),
  diagnostic TEXT,
  started_at_ms INTEGER NOT NULL,
  ended_at_ms INTEGER
) STRICT;
CREATE TRIGGER capture_run_history BEFORE UPDATE ON capture_runs WHEN OLD.state<>'running'
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER capture_run_identity BEFORE UPDATE OF id,delivery_id,operation_id,started_at_ms ON capture_runs
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER capture_run_delete BEFORE DELETE ON capture_runs
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TABLE capture_warnings (
  delivery_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  passage_id TEXT NOT NULL,
  path TEXT NOT NULL CHECK(length(path) BETWEEN 1 AND 4096),
  reason TEXT NOT NULL CHECK(reason IN ('DECLARED_NEW_FILE_IGNORED','KNOWN_SECRET_EXCLUDED')),
  PRIMARY KEY(delivery_id,path),
  FOREIGN KEY(delivery_id,attempt_id,passage_id) REFERENCES deliveries(id,attempt_id,producer_passage_id) ON DELETE RESTRICT
) STRICT;
CREATE TRIGGER delivery_identity_immutable BEFORE UPDATE OF id,attempt_id,round_number,producer_passage_id,base_sha,repository_relative ON deliveries
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER delivery_content_immutable BEFORE UPDATE OF capture_state,git_ref,content_identity,commit_sha,has_delta,captured_at_ms ON deliveries WHEN OLD.capture_state='captured'
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER delivery_delete_immutable BEFORE DELETE ON deliveries
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER delivery_producer_binding BEFORE INSERT ON deliveries WHEN NOT EXISTS (
  SELECT 1 FROM passages p JOIN passage_results r ON r.passage_id=p.id
  WHERE p.id=NEW.producer_passage_id AND p.attempt_id=NEW.attempt_id AND p.round_number=NEW.round_number AND p.delivery_version=NEW.id AND p.role='implementer'
) BEGIN SELECT RAISE(ABORT,'DELIVERY_PRODUCER_INVALID'); END;
-- Preserve old accepted results as identifiable versions without restoring execution authority.
INSERT INTO deliveries(id,attempt_id,round_number,producer_passage_id,base_sha,repository_relative,capture_state,diagnostic)
SELECT p.delivery_version,p.attempt_id,p.round_number,p.id,json_extract(a.capture_json,'$.baseSha'),
  'git/' || p.attempt_id || '.git','failed','CAPTURE_CONTINUITY_REVOKED'
FROM passages p JOIN passage_results r ON r.passage_id=p.id JOIN attempts a ON a.id=p.attempt_id
WHERE p.role='implementer';
CREATE TRIGGER capture_warning_update_immutable BEFORE UPDATE ON capture_warnings
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER capture_warning_delete_immutable BEFORE DELETE ON capture_warnings
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER captured_warning_sealed BEFORE INSERT ON capture_warnings WHEN EXISTS (
  SELECT 1 FROM deliveries d WHERE d.id=NEW.delivery_id AND d.capture_state='captured'
) BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
