CREATE TABLE notification_dispatches (
  installation_id TEXT NOT NULL,
  consumer_id TEXT NOT NULL CHECK(length(consumer_id)=36 AND substr(consumer_id,9,1)='-' AND substr(consumer_id,14,1)='-'
    AND substr(consumer_id,19,1)='-' AND substr(consumer_id,24,1)='-' AND substr(consumer_id,15,1) IN ('1','2','3','4','5','6','7','8')
    AND substr(consumer_id,20,1) IN ('8','9','a','b') AND length(replace(consumer_id,'-',''))=32 AND replace(consumer_id,'-','') NOT GLOB '*[^0-9a-f]*'),
  surface TEXT NOT NULL CHECK(surface='browser_host'),
  event_seq INTEGER NOT NULL REFERENCES events(seq) ON DELETE RESTRICT,
  dispatch_id TEXT NOT NULL UNIQUE CHECK(length(dispatch_id)=36 AND substr(dispatch_id,9,1)='-' AND substr(dispatch_id,14,1)='-'
    AND substr(dispatch_id,19,1)='-' AND substr(dispatch_id,24,1)='-' AND substr(dispatch_id,15,1) IN ('1','2','3','4','5','6','7','8')
    AND substr(dispatch_id,20,1) IN ('8','9','a','b') AND length(replace(dispatch_id,'-',''))=32 AND replace(dispatch_id,'-','') NOT GLOB '*[^0-9a-f]*'),
  state TEXT NOT NULL CHECK(state IN ('reserved','confirmed','uncertain','unavailable')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms>=created_at_ms),
  dispatched_at_ms INTEGER CHECK(dispatched_at_ms>=created_at_ms),
  reason TEXT CHECK(reason IN ('SURFACE_CONFIRMED','SURFACE_UNCERTAIN','SURFACE_UNAVAILABLE','DISPATCH_INTERRUPTED')),
  CHECK((state='confirmed')=(dispatched_at_ms IS NOT NULL)),
  CHECK((state='reserved' AND reason IS NULL) OR (state='confirmed' AND reason='SURFACE_CONFIRMED')
    OR (state='uncertain' AND reason IN ('SURFACE_UNCERTAIN','DISPATCH_INTERRUPTED')) OR (state='unavailable' AND reason='SURFACE_UNAVAILABLE')),
  PRIMARY KEY(installation_id,consumer_id,surface,event_seq)
) STRICT;
CREATE INDEX notification_dispatches_event_consumer ON notification_dispatches(event_seq,consumer_id);

CREATE VIEW notification_events AS SELECT e.seq,e.attempt_id,a.project_id,o.installation_id,o.account_id,
  CASE WHEN e.event_type='question-raised' THEN 'question_pending'
    WHEN e.event_type IN ('attempt.icr-completed','attempt.commit-completed','attempt.pr-completed') THEN 'completion'
    WHEN e.event_type IN ('dispatch.failed','workspace.failed','capture.failed','verification.failed','review.workspace.partial',
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

CREATE TRIGGER notification_dispatch_insert BEFORE INSERT ON notification_dispatches
WHEN NEW.state<>'reserved' OR NEW.revision<>1 OR NEW.updated_at_ms<>NEW.created_at_ms
  OR NEW.reason IS NOT NULL OR NEW.dispatched_at_ms IS NOT NULL
  OR NOT EXISTS(SELECT 1 FROM notification_events e JOIN factory_settings s ON s.id='local'
    WHERE e.seq=NEW.event_seq AND e.event_kind IS NOT NULL AND e.eligible=1
      AND e.installation_id=NEW.installation_id AND s.installation_id=NEW.installation_id AND e.account_id IS s.account_id)
BEGIN SELECT RAISE(ABORT,'NOTIFICATION_EVENT_INVALID'); END;

CREATE TRIGGER notification_dispatch_update BEFORE UPDATE ON notification_dispatches
WHEN NEW.installation_id IS NOT OLD.installation_id OR NEW.consumer_id IS NOT OLD.consumer_id
  OR NEW.surface IS NOT OLD.surface OR NEW.event_seq IS NOT OLD.event_seq OR NEW.dispatch_id IS NOT OLD.dispatch_id
  OR NEW.created_at_ms<>OLD.created_at_ms OR NEW.updated_at_ms<OLD.updated_at_ms OR NEW.revision<>OLD.revision+1
  OR NOT ((OLD.state='reserved' AND NEW.state IN ('confirmed','uncertain','unavailable'))
    OR (OLD.state='uncertain' AND NEW.state IN ('confirmed','unavailable')))
BEGIN SELECT RAISE(ABORT,'NOTIFICATION_TRANSITION_INVALID'); END;

CREATE TRIGGER notification_dispatch_delete BEFORE DELETE ON notification_dispatches
WHEN factory_project_deletion_row_allowed('notification_dispatches',json_array(OLD.installation_id,OLD.consumer_id,OLD.surface,OLD.event_seq),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
