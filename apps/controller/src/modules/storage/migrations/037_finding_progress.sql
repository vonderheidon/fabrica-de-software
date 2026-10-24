CREATE TABLE finding_assessments (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  progress TEXT NOT NULL CHECK(progress IN ('proven','partial','none','not_assessable')),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json) AND json_type(evidence_json)='array' AND json_array_length(evidence_json)<=20),
  justification TEXT NOT NULL CHECK(length(trim(justification)) BETWEEN 1 AND 8192),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  UNIQUE(finding_id,review_id),
  FOREIGN KEY(finding_id,attempt_id) REFERENCES findings(id,attempt_id) ON DELETE RESTRICT,
  FOREIGN KEY(review_id,attempt_id) REFERENCES reviews(id,attempt_id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX finding_assessments_attempt ON finding_assessments(attempt_id,created_at_ms,id);
CREATE TRIGGER assessment_binding BEFORE INSERT ON finding_assessments WHEN NOT EXISTS (
  SELECT 1 FROM findings f JOIN reviews old ON old.id=f.review_id JOIN deliveries od ON od.id=old.delivery_id
  JOIN reviews r ON r.id=NEW.review_id JOIN deliveries d ON d.id=r.delivery_id JOIN attempts a ON a.id=r.attempt_id
  JOIN passage_results p ON p.passage_id=r.passage_id
  WHERE f.id=NEW.finding_id AND f.attempt_id=NEW.attempt_id AND f.origin_finding_id IS NULL
    AND od.round_number<d.round_number AND old.state<>'pending' AND r.state='pending'
    AND r.independence_state='valid' AND d.round_number=(SELECT max(round_number) FROM rounds WHERE attempt_id=a.id) AND a.result IS NULL
) BEGIN SELECT RAISE(ABORT,'ASSESSMENT_BINDING_INVALID'); END;
CREATE TRIGGER assessment_evidence BEFORE INSERT ON finding_assessments WHEN
  EXISTS (SELECT 1 FROM json_each(NEW.evidence_json) e WHERE e.type<>'text' OR length(trim(e.value)) NOT BETWEEN 1 AND 4096)
  OR (NEW.progress IN ('proven','partial') AND NOT EXISTS (
    SELECT 1 FROM json_each(NEW.evidence_json) e JOIN artifacts a ON e.value='artifact:'||a.id
    JOIN checks c ON c.id=a.check_id JOIN reviews r ON r.id=NEW.review_id
    WHERE a.attempt_id=NEW.attempt_id AND a.delivery_id=r.delivery_id AND a.size_bytes>0
      AND c.verification_id=r.verification_id AND c.content_identity=r.content_identity AND c.state='passed'
  )) BEGIN SELECT RAISE(ABORT,'ASSESSMENT_EVIDENCE_INVALID'); END;
CREATE TRIGGER assessment_update BEFORE UPDATE ON finding_assessments BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER assessment_delete BEFORE DELETE ON finding_assessments
WHEN factory_project_deletion_row_allowed('finding_assessments',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TABLE attempt_blocks (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE RESTRICT,
  block_json TEXT NOT NULL CHECK(json_valid(block_json) AND json_type(block_json)='object'),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0)
) STRICT;
CREATE TRIGGER attempt_block_binding BEFORE INSERT ON attempt_blocks WHEN NOT EXISTS (
  SELECT 1 FROM attempts a JOIN deliveries d ON d.attempt_id=a.id JOIN reviews r ON r.delivery_id=d.id
  WHERE a.id=NEW.attempt_id AND a.result IS NULL AND r.state='rejected' AND r.independence_state='valid'
    AND d.round_number=(SELECT max(round_number) FROM rounds WHERE attempt_id=a.id)
    AND d.id=json_extract(NEW.block_json,'$.delivery_id') AND d.content_identity=json_extract(NEW.block_json,'$.content_identity')
    AND json_extract(NEW.block_json,'$.revision')=1 AND json_extract(NEW.block_json,'$.corrections_used')=d.round_number-1
    AND json_extract(NEW.block_json,'$.correction_limit')=json_extract(a.capture_json,'$.configuration.configuration.correctionLimit')
    AND json_extract(NEW.block_json,'$.reason') IN ('no_progress','correction_limit')
) BEGIN SELECT RAISE(ABORT,'ATTEMPT_BLOCK_BINDING_INVALID'); END;
CREATE TRIGGER attempt_block_update BEFORE UPDATE ON attempt_blocks BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER attempt_block_delete BEFORE DELETE ON attempt_blocks
WHEN factory_project_deletion_row_allowed('attempt_blocks',json_array(OLD.attempt_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
