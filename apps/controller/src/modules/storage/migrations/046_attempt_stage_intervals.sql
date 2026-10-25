CREATE TABLE attempt_stage_intervals (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  round_number INTEGER,
  delivery_version TEXT,
  stage TEXT NOT NULL CHECK(stage IN ('preparing','implementing','verifying','reviewing','publishing','waiting_decision','tracking_lost')),
  source_event_seq INTEGER NOT NULL UNIQUE REFERENCES events(seq) ON DELETE RESTRICT,
  started_at_ms INTEGER NOT NULL CHECK(started_at_ms>=0),
  ended_at_ms INTEGER CHECK(ended_at_ms>=started_at_ms),
  last_activity_at_ms INTEGER CHECK(last_activity_at_ms>=started_at_ms AND (ended_at_ms IS NULL OR last_activity_at_ms<=ended_at_ms)),
  deadline_at_ms INTEGER CHECK(deadline_at_ms>=started_at_ms),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  CHECK((round_number IS NULL)=(delivery_version IS NULL)),
  FOREIGN KEY(attempt_id,round_number,delivery_version) REFERENCES rounds(attempt_id,round_number,delivery_version) ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX attempt_stage_open ON attempt_stage_intervals(attempt_id) WHERE ended_at_ms IS NULL;
CREATE INDEX attempt_stage_history ON attempt_stage_intervals(attempt_id,started_at_ms);

CREATE VIEW attempt_stage_state AS SELECT a.id AS attempt_id,
  CASE WHEN a.result IS NOT NULL THEN 'finished' WHEN a.suspension='TRACKING_LOST' THEN 'tracking_lost'
    WHEN a.suspension IS NOT NULL THEN 'waiting_decision' ELSE a.phase END AS stage,
  r.round_number,r.delivery_version
  FROM attempts a LEFT JOIN rounds r ON r.attempt_id=a.id
    AND r.round_number=(SELECT max(rr.round_number) FROM rounds rr WHERE rr.attempt_id=a.id);

CREATE TRIGGER attempt_stage_binding BEFORE INSERT ON attempt_stage_intervals
WHEN NOT EXISTS(SELECT 1 FROM events e WHERE e.seq=NEW.source_event_seq AND e.attempt_id=NEW.attempt_id
  AND e.occurred_at_ms=NEW.started_at_ms AND (e.context_round IS NULL OR e.context_round IS NEW.round_number))
  OR NOT EXISTS(SELECT 1 FROM attempt_stage_state s WHERE s.attempt_id=NEW.attempt_id AND s.stage=NEW.stage
    AND s.round_number IS NEW.round_number AND s.delivery_version IS NEW.delivery_version)
  OR EXISTS(SELECT 1 FROM attempt_stage_intervals i WHERE i.attempt_id=NEW.attempt_id
    AND (i.ended_at_ms IS NULL OR i.ended_at_ms>NEW.started_at_ms))
BEGIN SELECT RAISE(ABORT,'STAGE_EVENT_INVALID'); END;

CREATE TRIGGER attempt_stage_update BEFORE UPDATE ON attempt_stage_intervals
WHEN OLD.ended_at_ms IS NOT NULL OR NEW.id IS NOT OLD.id OR NEW.attempt_id IS NOT OLD.attempt_id
  OR NEW.round_number IS NOT OLD.round_number OR NEW.delivery_version IS NOT OLD.delivery_version
  OR NEW.stage IS NOT OLD.stage OR NEW.source_event_seq IS NOT OLD.source_event_seq
  OR NEW.started_at_ms IS NOT OLD.started_at_ms OR NEW.revision<>OLD.revision+1
  OR (OLD.last_activity_at_ms IS NOT NULL AND (NEW.last_activity_at_ms IS NULL OR NEW.last_activity_at_ms<OLD.last_activity_at_ms))
  OR (NEW.last_activity_at_ms IS NOT OLD.last_activity_at_ms AND NOT EXISTS(
    SELECT 1 FROM events e WHERE e.attempt_id=NEW.attempt_id AND e.occurred_at_ms=NEW.last_activity_at_ms
      AND e.seq>=NEW.source_event_seq AND e.event_type IN ('passage-ready','result-accepted','check.completed','capture.captured','question-raised','question-answer-receipt','publication.completed')))
  OR (NEW.ended_at_ms IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM events e WHERE e.attempt_id=NEW.attempt_id AND e.occurred_at_ms=NEW.ended_at_ms AND e.seq>NEW.source_event_seq))
BEGIN SELECT RAISE(ABORT,'STAGE_INTERVAL_INVALID'); END;

CREATE TRIGGER attempt_stage_delete BEFORE DELETE ON attempt_stage_intervals
WHEN factory_project_deletion_row_allowed('attempt_stage_intervals',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER attempt_stage_event AFTER INSERT ON events
WHEN NEW.attempt_id IS NOT NULL
  AND NEW.event_type NOT IN ('attempt.authority-observed','cleanup-updated','heartbeat')
  AND (NEW.context_round IS NULL OR NEW.context_round=(SELECT round_number FROM attempt_stage_state WHERE attempt_id=NEW.attempt_id))
  AND NEW.occurred_at_ms>=coalesce((SELECT max(coalesce(ended_at_ms,last_activity_at_ms,started_at_ms)) FROM attempt_stage_intervals WHERE attempt_id=NEW.attempt_id),0)
BEGIN
  UPDATE attempt_stage_intervals SET ended_at_ms=NEW.occurred_at_ms,
    last_activity_at_ms=CASE WHEN NEW.event_type IN ('passage-ready','result-accepted','check.completed','capture.captured','question-raised','question-answer-receipt','publication.completed') THEN NEW.occurred_at_ms ELSE last_activity_at_ms END,
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
        OR NEW.event_type IN ('attempt.accepted','passage-ready','verification.started','review.planned','publication.running'));
  UPDATE attempt_stage_intervals SET last_activity_at_ms=NEW.occurred_at_ms,revision=revision+1
    WHERE attempt_id=NEW.attempt_id AND ended_at_ms IS NULL
      AND NEW.event_type IN ('passage-ready','result-accepted','check.completed','capture.captured','question-raised','question-answer-receipt','publication.completed');
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
