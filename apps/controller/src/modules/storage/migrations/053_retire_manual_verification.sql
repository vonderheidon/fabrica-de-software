-- E1: verification data is not converted or deleted. Populated installations are refused by the migration preflight.
DROP TRIGGER IF EXISTS review_complete_approval_guard;
DROP TABLE IF EXISTS artifacts;
DROP TABLE IF EXISTS checks;
DROP TABLE IF EXISTS verification_runs;
ALTER TABLE project_revisions DROP COLUMN checks_json;

DROP TRIGGER IF EXISTS project_deletion_targets_identity;
DROP TRIGGER IF EXISTS project_deletion_targets_project_deletion_guard;
CREATE TABLE project_deletion_targets_next (
  operation_id TEXT NOT NULL REFERENCES project_deletions(operation_id) ON DELETE RESTRICT,
  target_key TEXT NOT NULL,
  target_kind TEXT NOT NULL CHECK(target_kind IN ('original_directory','exclusive_workspace')),
  authorized_path TEXT NOT NULL,
  normalized_path TEXT NOT NULL,
  resolved_path TEXT,
  object_kind TEXT NOT NULL CHECK(object_kind IN ('directory','file','symlink','junction','absent')),
  identity_json TEXT NOT NULL CHECK(json_valid(identity_json)),
  owner_kind TEXT NOT NULL CHECK(owner_kind IN ('project','attempt','delivery','creation')),
  owner_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','removing','removed','blocked')),
  verified_at_ms INTEGER CHECK(verified_at_ms IS NULL OR verified_at_ms >= 0),
  reason_code TEXT,
  PRIMARY KEY(operation_id,target_key),
  UNIQUE(operation_id,normalized_path),
  CHECK(resolved_path IS NOT NULL OR object_kind = 'absent')
) STRICT;
INSERT INTO project_deletion_targets_next SELECT * FROM project_deletion_targets;
DROP TABLE project_deletion_targets;
ALTER TABLE project_deletion_targets_next RENAME TO project_deletion_targets;
CREATE TRIGGER project_deletion_targets_identity
BEFORE UPDATE OF operation_id,target_key,target_kind,authorized_path,normalized_path,resolved_path,object_kind,identity_json,owner_kind,owner_id ON project_deletion_targets
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER project_deletion_targets_project_deletion_guard BEFORE DELETE ON project_deletion_targets
WHEN factory_project_deletion_row_allowed('project_deletion_targets',json_array(OLD.operation_id,OLD.target_key),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_FINALIZATION_REQUIRED'); END;

DROP TRIGGER attempt_stage_event;
CREATE TRIGGER attempt_stage_event AFTER INSERT ON events
WHEN NEW.attempt_id IS NOT NULL
  AND NEW.event_type NOT IN ('attempt.authority-observed','cleanup-updated','heartbeat')
  AND (NEW.context_round IS NULL OR NEW.context_round=(SELECT round_number FROM attempt_stage_state WHERE attempt_id=NEW.attempt_id))
  AND NEW.occurred_at_ms>=coalesce((SELECT max(coalesce(ended_at_ms,last_activity_at_ms,started_at_ms)) FROM attempt_stage_intervals WHERE attempt_id=NEW.attempt_id),0)
BEGIN
  UPDATE attempt_stage_intervals SET ended_at_ms=NEW.occurred_at_ms,
    last_activity_at_ms=CASE WHEN NEW.event_type IN ('passage-ready','result-accepted','capture.captured','question-raised','question-answer-receipt','publication.completed') THEN NEW.occurred_at_ms ELSE last_activity_at_ms END,
    revision=revision+1
    WHERE attempt_id=NEW.attempt_id AND ended_at_ms IS NULL AND EXISTS (
      SELECT 1 FROM attempt_stage_state s WHERE s.attempt_id=NEW.attempt_id AND
        (s.stage<>attempt_stage_intervals.stage OR s.round_number IS NOT attempt_stage_intervals.round_number OR s.delivery_version IS NOT attempt_stage_intervals.delivery_version));
  INSERT INTO attempt_stage_intervals(id,attempt_id,round_number,delivery_version,stage,source_event_seq,started_at_ms)
    SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-8'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),
      s.attempt_id,s.round_number,s.delivery_version,s.stage,NEW.seq,NEW.occurred_at_ms FROM attempt_stage_state s
    WHERE s.attempt_id=NEW.attempt_id AND s.stage<>'finished'
      AND NOT EXISTS(SELECT 1 FROM attempt_stage_intervals i WHERE i.attempt_id=s.attempt_id AND i.ended_at_ms IS NULL)
      AND (EXISTS(SELECT 1 FROM attempt_stage_intervals i WHERE i.attempt_id=s.attempt_id)
        OR NEW.event_type IN ('attempt.accepted','passage-ready','review.planned','publication.running'));
  UPDATE attempt_stage_intervals SET last_activity_at_ms=NEW.occurred_at_ms,revision=revision+1
    WHERE attempt_id=NEW.attempt_id AND ended_at_ms IS NULL
      AND NEW.event_type IN ('passage-ready','result-accepted','capture.captured','question-raised','question-answer-receipt','publication.completed');
  UPDATE attempt_stage_intervals SET deadline_at_ms=(
    SELECT max(NEW.occurred_at_ms,min(q.created_at_ms+q.ttl_ms)) FROM execution_questions q WHERE q.attempt_id=NEW.attempt_id
      AND q.state NOT IN ('delivered','cancelled') AND q.ttl_ms IS NOT NULL),revision=revision+1
    WHERE attempt_id=NEW.attempt_id AND ended_at_ms IS NULL AND stage='waiting_decision' AND NEW.event_type='question-raised';
  UPDATE attempt_stage_intervals SET deadline_at_ms=(
    SELECT max(NEW.occurred_at_ms,m.checkpoint_ms+max(0,json_extract(a.capture_json,'$.configuration.timeDefaults.passageActiveTimeMs')-m.active_ms))
      FROM passages p JOIN passage_measurements m ON m.passage_id=p.id JOIN attempts a ON a.id=p.attempt_id
      WHERE p.attempt_id=NEW.attempt_id AND p.round_number=NEW.context_round AND p.role=NEW.context_role
        AND m.mode='active' AND m.observed=1),revision=revision+1
    WHERE attempt_id=NEW.attempt_id AND ended_at_ms IS NULL AND stage IN ('implementing','reviewing')
      AND NEW.event_type IN ('passage-ready','question-answer-receipt');
END;

DROP VIEW notification_events;
CREATE VIEW notification_events AS SELECT e.seq,e.attempt_id,a.project_id,o.installation_id,o.account_id,
  CASE WHEN e.event_type='question-raised' THEN 'question_pending'
    WHEN e.event_type IN ('attempt.icr-completed','attempt.commit-completed','attempt.pr-completed') THEN 'completion'
    WHEN e.event_type IN ('dispatch.failed','workspace.failed','capture.failed','review.workspace.partial',
      'attempt.failed','attempt.blocked','active-time.expired','question.expired','tracking-lost','publication.failed','publication.partial') THEN 'failure'
    ELSE NULL END AS event_kind,
  CASE WHEN e.event_type='question-raised' THEN
    a.result IS NULL AND a.suspension='HUMAN_DECISION'
      AND e.context_round=(SELECT max(r.round_number) FROM rounds r WHERE r.attempt_id=a.id) AND EXISTS(
      SELECT 1 FROM execution_questions q JOIN passages p ON p.id=q.passage_id
      WHERE q.attempt_id=a.id AND q.state='pending' AND p.round_number=e.context_round AND p.role=e.context_role
        AND (q.ttl_ms IS NULL OR q.created_at_ms+q.ttl_ms>e.occurred_at_ms)
        AND e.seq=(SELECT max(qe.seq) FROM events qe WHERE qe.attempt_id=a.id AND qe.event_type='question-raised'
          AND qe.context_round=e.context_round AND qe.context_role=e.context_role))
    WHEN e.event_type IN ('attempt.icr-completed','attempt.commit-completed','attempt.pr-completed') THEN a.result='delivered'
    ELSE a.result IN ('failed','rejected') OR (a.result IS NULL AND a.suspension IS NOT NULL) END AS eligible
  FROM events e JOIN operation_requests o ON o.operation_id=e.operation_id JOIN attempts a ON a.id=e.attempt_id
  WHERE o.account_id=a.account_id AND (e.project_id IS NULL OR e.project_id=a.project_id);
