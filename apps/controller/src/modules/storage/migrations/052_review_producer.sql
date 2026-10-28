-- E1: old review records are deliberately not converted. Never clear an installation.
CREATE TEMP TABLE review_clean_installation (empty INTEGER CHECK(empty=1));
INSERT INTO review_clean_installation SELECT NOT EXISTS (SELECT 1 FROM reviews);
DROP TABLE review_clean_installation;
PRAGMA legacy_alter_table = ON;
CREATE TABLE reviews_next (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL UNIQUE,
  attempt_id TEXT NOT NULL,
  passage_id TEXT NOT NULL UNIQUE,
  implementer_passage_id TEXT NOT NULL REFERENCES passage_results(passage_id) ON DELETE RESTRICT,
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
  FOREIGN KEY(delivery_id,attempt_id,implementer_passage_id) REFERENCES deliveries(id,attempt_id,producer_passage_id) ON DELETE RESTRICT
) STRICT;
DROP TABLE reviews;
ALTER TABLE reviews_next RENAME TO reviews;
PRAGMA legacy_alter_table = OFF;
CREATE INDEX reviews_attempt ON reviews(attempt_id,created_at_ms,id);
CREATE TRIGGER review_role_binding BEFORE INSERT ON reviews WHEN NOT EXISTS (
  SELECT 1 FROM deliveries d JOIN passages p ON p.id=NEW.passage_id
  JOIN passages producer ON producer.id=NEW.implementer_passage_id
  JOIN passage_results result ON result.passage_id=producer.id AND result.attempt_id=d.attempt_id
  JOIN attempts a ON a.id=d.attempt_id
  WHERE d.id=NEW.delivery_id AND d.attempt_id=NEW.attempt_id AND d.capture_state='captured'
    AND d.content_identity=NEW.content_identity AND d.producer_passage_id=producer.id
    AND producer.role='implementer' AND producer.attempt_id=d.attempt_id
    AND producer.round_number=d.round_number AND producer.delivery_version=d.id
    AND producer.state='ready' AND producer.tracking_state='tracked'
    AND p.role='reviewer' AND p.attempt_id=d.attempt_id AND p.round_number=d.round_number AND p.delivery_version=d.id
    AND a.result IS NULL
    AND d.round_number=(SELECT max(round_number) FROM rounds WHERE attempt_id=a.id)
    AND NEW.state='pending' AND NEW.independence_state='pending'
    AND json_extract(result.summary_json,'$.writesStopped')=1
    AND json_extract(result.summary_json,'$.formatVersion')=1
    AND length(trim(json_extract(result.summary_json,'$.summary'))) BETWEEN 1 AND 8192
    AND json_type(result.summary_json,'$.checks')='array'
    AND json_array_length(result.summary_json,'$.checks')<=50
    AND EXISTS (SELECT 1 FROM attempt_criteria WHERE attempt_id=d.attempt_id)
    AND NOT EXISTS (SELECT 1 FROM attempt_criteria c WHERE c.attempt_id=d.attempt_id AND NOT EXISTS (
      SELECT 1 FROM criterion_results cr WHERE cr.passage_id=producer.id AND cr.attempt_id=d.attempt_id AND cr.criterion_id=c.criterion_id))
) BEGIN SELECT RAISE(ABORT,'REVIEW_BINDING_INVALID'); END;
CREATE TRIGGER review_identity BEFORE UPDATE OF id,delivery_id,attempt_id,passage_id,implementer_passage_id,content_identity,created_at_ms ON reviews
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER review_approval_guard BEFORE UPDATE OF state ON reviews WHEN NEW.state='approved' AND (
  NEW.independence_state<>'valid'
  OR NOT EXISTS (SELECT 1 FROM passage_results result JOIN passages p ON p.id=result.passage_id
    JOIN deliveries d ON d.id=NEW.delivery_id
    WHERE result.passage_id=NEW.passage_id AND result.attempt_id=NEW.attempt_id
      AND p.role='reviewer' AND p.attempt_id=d.attempt_id AND p.round_number=d.round_number AND p.delivery_version=d.id
      AND json_extract(result.summary_json,'$.verdict')='approved')
  OR NOT EXISTS (SELECT 1 FROM attempt_criteria WHERE attempt_id=NEW.attempt_id)
  OR (SELECT count(*) FROM criterion_results WHERE passage_id=NEW.passage_id)<>
     (SELECT count(*) FROM attempt_criteria WHERE attempt_id=NEW.attempt_id)
  OR EXISTS (SELECT 1 FROM attempt_criteria a WHERE a.attempt_id=NEW.attempt_id AND NOT EXISTS (
    SELECT 1 FROM criterion_results c WHERE c.passage_id=NEW.passage_id AND c.attempt_id=a.attempt_id
      AND c.criterion_id=a.criterion_id AND c.verdict='passed' AND json_array_length(c.evidence_json)>0))
  OR EXISTS (SELECT 1 FROM criterion_results c,json_each(c.evidence_json) e WHERE c.passage_id=NEW.passage_id
    AND (e.type<>'text' OR length(trim(e.value)) NOT BETWEEN 1 AND 4096
      OR e.value GLOB 'artifact:*' OR (length(trim(e.value)) IN (40,64) AND trim(e.value) NOT GLOB '*[^0-9a-fA-F]*')))
  OR EXISTS (SELECT 1 FROM findings WHERE review_id=NEW.id AND blocking=1)
  OR EXISTS (SELECT 1 FROM findings f JOIN reviews r ON r.id=f.review_id JOIN deliveries old ON old.id=r.delivery_id
    JOIN deliveries current ON current.id=NEW.delivery_id
    WHERE f.attempt_id=NEW.attempt_id AND f.blocking=1 AND old.round_number<current.round_number AND NOT EXISTS (
      SELECT 1 FROM finding_resolutions x JOIN reviews xr ON xr.id=x.review_id JOIN deliveries xd ON xd.id=xr.delivery_id
      WHERE x.finding_id=f.id AND x.verdict='resolved' AND xr.independence_state='valid'
        AND xd.round_number<=current.round_number))
) BEGIN SELECT RAISE(ABORT,'REVIEW_APPROVAL_INVALID'); END;
DROP TRIGGER assessment_evidence;
CREATE TRIGGER assessment_evidence BEFORE INSERT ON finding_assessments WHEN
  EXISTS (SELECT 1 FROM json_each(NEW.evidence_json) e WHERE e.type<>'text' OR length(trim(e.value)) NOT BETWEEN 1 AND 4096
    OR lower(trim(e.value)) GLOB 'artifact:*' OR (length(trim(e.value)) IN (40,64) AND trim(e.value) NOT GLOB '*[^0-9a-fA-F]*'))
  OR NOT EXISTS (
    SELECT 1 FROM reviews r JOIN deliveries d ON d.id=r.delivery_id
    JOIN passages producer ON producer.id=r.implementer_passage_id
    JOIN passages reviewer ON reviewer.id=r.passage_id
    JOIN passage_results rr ON rr.passage_id=reviewer.id AND rr.attempt_id=r.attempt_id
    JOIN json_each(rr.summary_json,'$.assessments') item
    WHERE r.id=NEW.review_id AND r.attempt_id=NEW.attempt_id AND r.independence_state='valid'
      AND d.capture_state='captured' AND d.content_identity=r.content_identity AND d.attempt_id=r.attempt_id
      AND producer.id=d.producer_passage_id AND producer.role='implementer' AND reviewer.role='reviewer'
      AND producer.attempt_id=d.attempt_id AND reviewer.attempt_id=d.attempt_id
      AND producer.round_number=d.round_number AND reviewer.round_number=d.round_number
      AND producer.delivery_version=d.id AND reviewer.delivery_version=d.id
      AND json_extract(item.value,'$.findingId')=NEW.finding_id
      AND json_extract(item.value,'$.progress')=NEW.progress
      AND json_extract(item.value,'$.justification')=NEW.justification
      AND json_extract(item.value,'$.evidence')=json(NEW.evidence_json)
  )
  OR (NEW.progress IN ('proven','partial') AND (
    json_array_length(NEW.evidence_json)=0
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.evidence_json) e WHERE e.value GLOB 'artifact:*'
        OR (length(trim(e.value)) IN (40,64) AND trim(e.value) NOT GLOB '*[^0-9a-fA-F]*')
        OR NOT EXISTS (SELECT 1 FROM reviews r JOIN criterion_results c ON c.passage_id=r.passage_id
          JOIN json_each(c.evidence_json) ce JOIN findings f ON f.id=NEW.finding_id
          WHERE r.id=NEW.review_id AND c.attempt_id=NEW.attempt_id AND ce.value=e.value
            AND (json_array_length(f.criterion_ids_json)=0 OR c.criterion_id IN (SELECT value FROM json_each(f.criterion_ids_json))))
    )
  )) BEGIN SELECT RAISE(ABORT,'ASSESSMENT_EVIDENCE_INVALID'); END;

CREATE TRIGGER review_assessments_complete BEFORE UPDATE OF state ON reviews
WHEN NEW.state<>'pending' AND NEW.independence_state='valid' AND EXISTS (
  SELECT 1 FROM findings f JOIN reviews origin ON origin.id=f.review_id
  JOIN deliveries source ON source.id=origin.delivery_id
  JOIN deliveries current ON current.id=NEW.delivery_id
  WHERE f.attempt_id=NEW.attempt_id AND f.origin_finding_id IS NULL
    AND source.round_number<current.round_number
    AND NOT EXISTS (
      SELECT 1 FROM finding_resolutions x JOIN reviews resolution ON resolution.id=x.review_id
      JOIN deliveries resolved ON resolved.id=resolution.delivery_id
      WHERE x.finding_id=f.id AND x.verdict='resolved' AND resolution.independence_state='valid'
        AND resolved.round_number<current.round_number
    )
    AND NOT EXISTS (SELECT 1 FROM finding_assessments a WHERE a.finding_id=f.id AND a.review_id=NEW.id AND a.attempt_id=NEW.attempt_id)
) BEGIN SELECT RAISE(ABORT,'ASSESSMENT_EVIDENCE_INVALID'); END;
CREATE TRIGGER review_history BEFORE UPDATE ON reviews WHEN OLD.state<>'pending'
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER review_delete BEFORE DELETE ON reviews
WHEN factory_project_deletion_row_allowed('reviews',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER review_disputes_complete BEFORE UPDATE OF state ON reviews WHEN NEW.state<>'pending' AND NEW.independence_state='valid' AND EXISTS (
  SELECT 1 FROM finding_disputes t JOIN passages p ON p.id=t.passage_id JOIN deliveries d ON d.id=NEW.delivery_id
  WHERE t.attempt_id=NEW.attempt_id AND t.response_review_id IS NULL AND p.round_number<=d.round_number
) BEGIN SELECT RAISE(ABORT,'DISPUTE_RESPONSE_REQUIRED'); END;
