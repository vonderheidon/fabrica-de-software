CREATE UNIQUE INDEX deliveries_dispute_binding ON deliveries(id,attempt_id,content_identity);
CREATE TABLE finding_disputes (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  finding_id TEXT NOT NULL,
  passage_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  content_identity TEXT NOT NULL,
  justification TEXT NOT NULL CHECK(length(trim(justification)) BETWEEN 1 AND 8192),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json) AND json_type(evidence_json)='array' AND json_array_length(evidence_json) BETWEEN 1 AND 20),
  response_review_id TEXT,
  response_verdict TEXT CHECK(response_verdict IN ('maintained','resolved')),
  response_justification TEXT,
  response_evidence_json TEXT,
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  responded_at_ms INTEGER,
  UNIQUE(finding_id,passage_id,delivery_id),
  FOREIGN KEY(finding_id,attempt_id) REFERENCES findings(id,attempt_id) ON DELETE RESTRICT,
  FOREIGN KEY(passage_id,attempt_id) REFERENCES passages(id,attempt_id) ON DELETE RESTRICT,
  FOREIGN KEY(delivery_id,attempt_id,content_identity) REFERENCES deliveries(id,attempt_id,content_identity) ON DELETE RESTRICT,
  FOREIGN KEY(response_review_id,attempt_id) REFERENCES reviews(id,attempt_id) ON DELETE RESTRICT,
  CHECK ((response_review_id IS NULL AND response_verdict IS NULL AND response_justification IS NULL AND response_evidence_json IS NULL AND responded_at_ms IS NULL)
    OR (response_review_id IS NOT NULL AND response_verdict IS NOT NULL AND response_justification IS NOT NULL
      AND length(trim(response_justification)) BETWEEN 1 AND 8192 AND response_evidence_json IS NOT NULL
      AND json_valid(response_evidence_json) AND json_type(response_evidence_json)='array' AND json_array_length(response_evidence_json) BETWEEN 1 AND 20
      AND responded_at_ms IS NOT NULL AND responded_at_ms>=created_at_ms))
) STRICT;
CREATE INDEX finding_disputes_attempt ON finding_disputes(attempt_id,created_at_ms,id);
CREATE INDEX finding_disputes_pending ON finding_disputes(attempt_id,passage_id) WHERE response_review_id IS NULL;
CREATE TRIGGER dispute_binding BEFORE INSERT ON finding_disputes WHEN NEW.response_review_id IS NOT NULL OR NOT EXISTS (
  SELECT 1 FROM findings f JOIN reviews r ON r.id=f.review_id JOIN deliveries d ON d.id=r.delivery_id
  JOIN passages p ON p.id=NEW.passage_id JOIN attempts a ON a.id=p.attempt_id
  JOIN passage_results result ON result.passage_id=p.id JOIN json_each(result.summary_json,'$.findingResponses') response
  WHERE f.id=NEW.finding_id AND f.attempt_id=NEW.attempt_id AND p.attempt_id=NEW.attempt_id AND p.role='implementer'
    AND r.state<>'pending' AND r.independence_state='valid' AND d.id=NEW.delivery_id AND d.content_identity=NEW.content_identity
    AND d.round_number<p.round_number AND a.result IS NULL AND a.suspension IS NULL AND a.phase='implementing'
    AND p.round_number=(SELECT max(round_number) FROM rounds WHERE attempt_id=a.id)
    AND json_extract(response.value,'$.findingId')=f.id AND json_extract(response.value,'$.responseType')='disputed'
    AND json_extract(response.value,'$.response')=NEW.justification AND json_extract(response.value,'$.evidence')=json(NEW.evidence_json)
    AND NOT EXISTS (SELECT 1 FROM finding_resolutions x JOIN reviews xr ON xr.id=x.review_id JOIN deliveries xd ON xd.id=xr.delivery_id
      WHERE x.finding_id=f.id AND x.verdict='resolved' AND xr.independence_state='valid' AND xd.round_number<p.round_number)
) BEGIN SELECT RAISE(ABORT,'DISPUTE_BINDING_INVALID'); END;
CREATE TRIGGER dispute_evidence BEFORE INSERT ON finding_disputes WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.evidence_json) e WHERE e.type<>'text' OR length(trim(e.value)) NOT BETWEEN 1 AND 4096
) BEGIN SELECT RAISE(ABORT,'DISPUTE_EVIDENCE_INVALID'); END;
CREATE TRIGGER dispute_identity BEFORE UPDATE OF id,attempt_id,finding_id,passage_id,delivery_id,content_identity,justification,evidence_json,created_at_ms ON finding_disputes
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER dispute_response_sealed BEFORE UPDATE ON finding_disputes WHEN OLD.response_review_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER dispute_response_binding BEFORE UPDATE ON finding_disputes WHEN NEW.response_review_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM reviews r JOIN passages p ON p.id=r.passage_id JOIN deliveries d ON d.id=r.delivery_id
  JOIN passages source ON source.id=OLD.passage_id JOIN attempts a ON a.id=r.attempt_id
  JOIN finding_resolutions x ON x.review_id=r.id AND x.finding_id=OLD.finding_id
  JOIN passage_results result ON result.passage_id=p.id JOIN json_each(result.summary_json,'$.disputeResponses') response
  WHERE r.id=NEW.response_review_id AND r.attempt_id=OLD.attempt_id AND p.role='reviewer'
    AND r.state='pending' AND r.independence_state='valid' AND d.round_number>=source.round_number
    AND d.round_number=(SELECT max(round_number) FROM rounds WHERE attempt_id=a.id)
    AND a.result IS NULL AND a.suspension IS NULL AND a.phase='reviewing'
    AND x.verdict=CASE NEW.response_verdict WHEN 'maintained' THEN 'unresolved' WHEN 'resolved' THEN 'resolved' END
    AND json_extract(response.value,'$.disputeId')=OLD.id AND json_extract(response.value,'$.verdict')=NEW.response_verdict
    AND json_extract(response.value,'$.justification')=NEW.response_justification
    AND json_extract(response.value,'$.evidence')=json(NEW.response_evidence_json)
) BEGIN SELECT RAISE(ABORT,'DISPUTE_RESPONSE_INVALID'); END;
CREATE TRIGGER dispute_response_evidence BEFORE UPDATE ON finding_disputes WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.response_evidence_json) e WHERE e.type<>'text' OR length(trim(e.value)) NOT BETWEEN 1 AND 4096
) BEGIN SELECT RAISE(ABORT,'DISPUTE_EVIDENCE_INVALID'); END;
CREATE TRIGGER dispute_delete BEFORE DELETE ON finding_disputes
WHEN factory_project_deletion_row_allowed('finding_disputes',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER review_disputes_complete BEFORE UPDATE OF state ON reviews WHEN NEW.state<>'pending' AND NEW.independence_state='valid' AND EXISTS (
  SELECT 1 FROM finding_disputes t JOIN passages p ON p.id=t.passage_id JOIN deliveries d ON d.id=NEW.delivery_id
  WHERE t.attempt_id=NEW.attempt_id AND t.response_review_id IS NULL AND p.round_number<=d.round_number
) BEGIN SELECT RAISE(ABORT,'DISPUTE_RESPONSE_REQUIRED'); END;

DROP TRIGGER attempt_block_binding;
CREATE TRIGGER attempt_block_binding BEFORE INSERT ON attempt_blocks WHEN NOT EXISTS (
  SELECT 1 FROM attempts a JOIN deliveries d ON d.attempt_id=a.id JOIN reviews r ON r.delivery_id=d.id
  WHERE a.id=NEW.attempt_id AND a.result IS NULL AND r.state='rejected' AND r.independence_state='valid'
    AND d.round_number=(SELECT max(round_number) FROM rounds WHERE attempt_id=a.id)
    AND d.id=json_extract(NEW.block_json,'$.delivery_id') AND d.content_identity=json_extract(NEW.block_json,'$.content_identity')
    AND json_extract(NEW.block_json,'$.revision')=1 AND json_extract(NEW.block_json,'$.corrections_used')=d.round_number-1
    AND json_extract(NEW.block_json,'$.correction_limit')=json_extract(a.capture_json,'$.configuration.configuration.correctionLimit')
    AND (json_extract(NEW.block_json,'$.reason') IN ('no_progress','correction_limit') OR
      (json_extract(NEW.block_json,'$.reason')='dispute_maintained' AND EXISTS (
        SELECT 1 FROM finding_disputes t WHERE t.attempt_id=a.id AND t.response_review_id=r.id AND t.response_verdict='maintained'
      )))
) BEGIN SELECT RAISE(ABORT,'ATTEMPT_BLOCK_BINDING_INVALID'); END;
