CREATE TABLE attempt_decisions (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE RESTRICT,
  block_id TEXT NOT NULL,
  block_revision INTEGER NOT NULL CHECK(block_revision>=1),
  block_reason TEXT NOT NULL CHECK(block_reason IN ('no_progress','dispute_maintained','correction_limit')),
  action TEXT NOT NULL CHECK(action IN ('guidance','change_profile','end')),
  authorization_json TEXT NOT NULL CHECK(json_valid(authorization_json) AND json_type(authorization_json)='object'),
  guidance_json TEXT CHECK(guidance_json IS NULL OR (json_valid(guidance_json) AND json_type(guidance_json)='object'
    AND json_extract(guidance_json,'$.formatVersion')=1 AND length(trim(json_extract(guidance_json,'$.text'))) BETWEEN 1 AND 8192)),
  successor_preparation_id TEXT,
  successor_preparation_revision INTEGER,
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  FOREIGN KEY(successor_preparation_id,successor_preparation_revision)
    REFERENCES preparation_revisions(preparation_id,revision) ON DELETE RESTRICT,
  CHECK ((action='guidance' AND guidance_json IS NOT NULL AND successor_preparation_id IS NULL AND successor_preparation_revision IS NULL)
    OR (action='change_profile' AND guidance_json IS NULL AND successor_preparation_id IS NOT NULL AND successor_preparation_revision IS NOT NULL)
    OR (action='end' AND guidance_json IS NULL AND successor_preparation_id IS NULL AND successor_preparation_revision IS NULL))
) STRICT;
CREATE INDEX attempt_decisions_attempt ON attempt_decisions(attempt_id,created_at_ms,id);
CREATE INDEX attempt_decisions_delivery ON attempt_decisions(delivery_id,created_at_ms,id);

CREATE TRIGGER attempt_decision_binding BEFORE INSERT ON attempt_decisions WHEN NOT EXISTS (
  SELECT 1 FROM operation_requests o JOIN attempts a ON a.id=NEW.attempt_id
  JOIN attempt_blocks b ON b.attempt_id=a.id JOIN deliveries d ON d.id=NEW.delivery_id AND d.attempt_id=a.id
  JOIN reviews r ON r.delivery_id=d.id
  WHERE o.operation_id=NEW.operation_id AND o.operation_kind='attempt.decision' AND o.resource_type='attempt' AND o.resource_id=a.id
    AND o.installation_id=(SELECT installation_id FROM factory_settings WHERE id='local')
    AND o.account_id=a.account_id AND o.request_hash=json_extract(NEW.authorization_json,'$.requestHash')
    AND json_extract(NEW.authorization_json,'$.formatVersion')=1 AND json_extract(NEW.authorization_json,'$.authorized')=1
    AND json_extract(NEW.authorization_json,'$.action')=NEW.action
    AND json_extract(NEW.authorization_json,'$.attemptId')=a.id
    AND json_extract(NEW.authorization_json,'$.deliveryId')=d.id
    AND json_extract(NEW.authorization_json,'$.contentIdentity')=d.content_identity
    AND json_extract(NEW.authorization_json,'$.blockId')=NEW.block_id
    AND json_extract(NEW.authorization_json,'$.blockRevision')=NEW.block_revision
    AND json_extract(NEW.authorization_json,'$.blockReason')=NEW.block_reason
    AND (NEW.action<>'guidance' OR json_extract(NEW.authorization_json,'$.guidance')=json_extract(NEW.guidance_json,'$.text'))
    AND json_extract(o.expected_revision_json,'$.etag')=printf('"%s:%d"',a.id,a.revision)
    AND a.result IS NULL AND a.suspension='CORRECTION_BLOCKED' AND a.phase='reviewing'
    AND r.state='rejected' AND r.independence_state='valid'
    AND d.id=(SELECT delivery_id FROM deliveries WHERE attempt_id=a.id ORDER BY round_number DESC LIMIT 1)
    AND json_extract(b.block_json,'$.id')=NEW.block_id
    AND json_extract(b.block_json,'$.revision')=NEW.block_revision
    AND json_extract(b.block_json,'$.reason')=NEW.block_reason
    AND json_extract(b.block_json,'$.delivery_id')=(SELECT delivery_id FROM attempt_blocks WHERE attempt_id=a.id)
    AND (NEW.action<>'guidance' OR (NEW.block_reason<>'correction_limit' AND d.round_number-1<json_extract(a.capture_json,'$.configuration.configuration.correctionLimit')))
    AND (NEW.action<>'end' OR EXISTS (SELECT 1 FROM cancellation_requests c WHERE c.operation_id=NEW.operation_id AND c.attempt_id=a.id))
    AND (NEW.action<>'change_profile' OR EXISTS (
      SELECT 1 FROM preparations p JOIN preparation_revisions pr ON pr.preparation_id=p.id AND pr.revision=NEW.successor_preparation_revision
      WHERE p.id=NEW.successor_preparation_id AND p.revision=NEW.successor_preparation_revision AND p.project_id=a.project_id
        AND json_extract(pr.choices_json,'$.choices.issueId')=a.issue_id
        AND json_extract(pr.choices_json,'$.choices.previousAttemptId')=a.id
        AND json_extract(NEW.authorization_json,'$.profileId') IS NOT NULL
        AND json_extract(NEW.authorization_json,'$.profileRevision') IS NOT NULL
        AND ((json_extract(NEW.authorization_json,'$.role')='implementer'
          AND json_extract(pr.choices_json,'$.choices.overrides.implementerProfile.kind')='reference'
          AND json_extract(pr.choices_json,'$.choices.overrides.implementerProfile.id')=json_extract(NEW.authorization_json,'$.profileId')
          AND json_extract(pr.choices_json,'$.choices.overrides.implementerProfile.revision')=json_extract(NEW.authorization_json,'$.profileRevision'))
          OR (json_extract(NEW.authorization_json,'$.role')='reviewer'
          AND json_extract(pr.choices_json,'$.choices.overrides.reviewerProfile.kind')='reference'
          AND json_extract(pr.choices_json,'$.choices.overrides.reviewerProfile.id')=json_extract(NEW.authorization_json,'$.profileId')
          AND json_extract(pr.choices_json,'$.choices.overrides.reviewerProfile.revision')=json_extract(NEW.authorization_json,'$.profileRevision')))
    ))
) BEGIN SELECT RAISE(ABORT,'ATTEMPT_DECISION_BINDING_INVALID'); END;

CREATE TRIGGER attempt_decision_immutable BEFORE UPDATE ON attempt_decisions
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER attempt_decision_delete BEFORE DELETE ON attempt_decisions
WHEN factory_project_deletion_row_allowed('attempt_decisions',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
