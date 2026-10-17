ALTER TABLE passages ADD COLUMN session_source_id TEXT REFERENCES passages(id) ON DELETE RESTRICT;
CREATE TRIGGER passage_source_immutable BEFORE UPDATE OF session_source_id ON passages
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER passage_source_binding BEFORE INSERT ON passages WHEN NEW.session_source_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM passages p WHERE p.id=NEW.session_source_id AND p.attempt_id=NEW.attempt_id
    AND p.role='implementer' AND NEW.role='implementer' AND p.round_number=NEW.round_number-1
) BEGIN SELECT RAISE(ABORT,'CONTINUATION_BINDING_INVALID'); END;
CREATE UNIQUE INDEX passages_review_binding ON passages(id,attempt_id,delivery_version);
CREATE UNIQUE INDEX verification_review_binding ON verification_runs(id,delivery_id,attempt_id,content_identity);
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL UNIQUE,
  attempt_id TEXT NOT NULL,
  passage_id TEXT NOT NULL UNIQUE,
  verification_id TEXT NOT NULL,
  content_identity TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','approved','rejected')),
  reason TEXT,
  independence_state TEXT NOT NULL CHECK(independence_state IN ('pending','valid','invalid')),
  diagnostic TEXT,
  workspace_state TEXT NOT NULL CHECK(workspace_state IN ('planned','ready','partial')),
  created_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER,
  UNIQUE(id,attempt_id),
  FOREIGN KEY(passage_id,attempt_id,delivery_id) REFERENCES passages(id,attempt_id,delivery_version) ON DELETE RESTRICT,
  FOREIGN KEY(verification_id,delivery_id,attempt_id,content_identity) REFERENCES verification_runs(id,delivery_id,attempt_id,content_identity) ON DELETE RESTRICT
) STRICT;
CREATE INDEX reviews_attempt ON reviews(attempt_id,created_at_ms,id);
CREATE TRIGGER review_role_binding BEFORE INSERT ON reviews WHEN NOT EXISTS (
  SELECT 1 FROM passages p JOIN deliveries d ON d.id=NEW.delivery_id JOIN verification_runs v ON v.id=NEW.verification_id
  WHERE p.id=NEW.passage_id AND p.role='reviewer' AND p.round_number=d.round_number
    AND d.capture_state='captured' AND v.state IN ('passed','failed','not_applicable')
) BEGIN SELECT RAISE(ABORT,'REVIEW_BINDING_INVALID'); END;
CREATE TRIGGER review_approval_guard BEFORE UPDATE OF state ON reviews WHEN NEW.state='approved' AND (
  NEW.independence_state<>'valid' OR NOT EXISTS (
    SELECT 1 FROM verification_runs v WHERE v.id=NEW.verification_id AND (v.state='passed' OR
      (v.state='not_applicable' AND NOT EXISTS (SELECT 1 FROM checks c WHERE c.verification_id=v.id)))
  ) OR EXISTS (SELECT 1 FROM criterion_results c WHERE c.passage_id=NEW.passage_id AND c.verdict<>'passed')
  OR EXISTS (SELECT 1 FROM findings f WHERE f.review_id=NEW.id AND f.blocking=1)
  OR EXISTS (SELECT 1 FROM finding_resolutions x JOIN findings f ON f.id=x.finding_id WHERE x.review_id=NEW.id AND x.verdict<>'resolved' AND f.blocking=1)
) BEGIN SELECT RAISE(ABORT,'REVIEW_APPROVAL_INVALID'); END;
CREATE TABLE findings (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  finding_key TEXT NOT NULL,
  criterion_ids_json TEXT NOT NULL CHECK(json_valid(criterion_ids_json) AND json_type(criterion_ids_json)='array'),
  category TEXT NOT NULL CHECK(length(trim(category))>0),
  problem TEXT NOT NULL CHECK(length(trim(problem))>0),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json) AND json_array_length(evidence_json)>0),
  expected_result TEXT NOT NULL CHECK(length(trim(expected_result))>0),
  blocking INTEGER NOT NULL CHECK(blocking IN (0,1)),
  UNIQUE(review_id,finding_key), UNIQUE(id,attempt_id),
  FOREIGN KEY(review_id,attempt_id) REFERENCES reviews(id,attempt_id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX findings_attempt ON findings(attempt_id,review_id);
CREATE TABLE finding_resolutions (
  finding_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK(verdict IN ('resolved','unresolved')),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json) AND json_array_length(evidence_json)>0),
  PRIMARY KEY(finding_id,review_id),
  FOREIGN KEY(finding_id,attempt_id) REFERENCES findings(id,attempt_id) ON DELETE RESTRICT,
  FOREIGN KEY(review_id,attempt_id) REFERENCES reviews(id,attempt_id) ON DELETE RESTRICT
) STRICT;
CREATE TRIGGER resolution_prior BEFORE INSERT ON finding_resolutions WHEN NOT EXISTS (
  SELECT 1 FROM findings f JOIN reviews old ON old.id=f.review_id JOIN reviews new ON new.id=NEW.review_id
  JOIN deliveries od ON od.id=old.delivery_id JOIN deliveries nd ON nd.id=new.delivery_id
  WHERE f.id=NEW.finding_id AND od.round_number<nd.round_number AND old.state<>'pending'
) BEGIN SELECT RAISE(ABORT,'RESOLUTION_BINDING_INVALID'); END;
CREATE TRIGGER findings_criteria BEFORE INSERT ON findings WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.criterion_ids_json) j WHERE NOT EXISTS (
    SELECT 1 FROM attempt_criteria c WHERE c.attempt_id=NEW.attempt_id AND c.criterion_id=j.value
  )
) BEGIN SELECT RAISE(ABORT,'FINDING_CRITERION_INVALID'); END;
CREATE TRIGGER review_history BEFORE UPDATE ON reviews WHEN OLD.state<>'pending'
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER review_identity BEFORE UPDATE OF id,delivery_id,attempt_id,passage_id,verification_id,content_identity,created_at_ms ON reviews
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER review_delete BEFORE DELETE ON reviews BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER finding_update BEFORE UPDATE ON findings BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER finding_delete BEFORE DELETE ON findings BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER resolution_update BEFORE UPDATE ON finding_resolutions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER resolution_delete BEFORE DELETE ON finding_resolutions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER finding_sealed BEFORE INSERT ON findings WHEN (SELECT state FROM reviews WHERE id=NEW.review_id)<>'pending'
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER resolution_sealed BEFORE INSERT ON finding_resolutions WHEN (SELECT state FROM reviews WHERE id=NEW.review_id)<>'pending'
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
