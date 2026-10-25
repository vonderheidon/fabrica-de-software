CREATE INDEX shutdown_control_order ON operation_requests(installation_id,
  json_extract(receipt_json,'$.shutdown.generation') DESC,json_extract(receipt_json,'$.shutdown.controlRevision') DESC)
  WHERE operation_kind IN ('shutdown.pause_starts','shutdown.close_when_idle','shutdown.restore','shutdown.commit');

CREATE TRIGGER shutdown_receipt_immutable BEFORE UPDATE OF receipt_json ON operation_requests
WHEN OLD.operation_kind IN ('shutdown.pause_starts','shutdown.close_when_idle','shutdown.restore','shutdown.commit')
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER shutdown_final_barrier BEFORE INSERT ON operation_requests
WHEN NEW.operation_kind NOT IN ('shutdown.restore') AND coalesce((SELECT json_extract(receipt_json,'$.shutdown.closingCommitted')
  FROM operation_requests WHERE installation_id=NEW.installation_id
    AND operation_kind IN ('shutdown.pause_starts','shutdown.close_when_idle','shutdown.restore','shutdown.commit')
  ORDER BY json_extract(receipt_json,'$.shutdown.generation') DESC,json_extract(receipt_json,'$.shutdown.controlRevision') DESC LIMIT 1),0)=1
BEGIN SELECT RAISE(ABORT,'SHUTDOWN_CLOSING'); END;

CREATE TRIGGER shutdown_start_barrier BEFORE INSERT ON operation_requests
WHEN NEW.operation_kind='attempt.start' AND coalesce((SELECT json_extract(receipt_json,'$.shutdown.startsPaused')
  FROM operation_requests WHERE installation_id=NEW.installation_id
    AND operation_kind IN ('shutdown.pause_starts','shutdown.close_when_idle','shutdown.restore','shutdown.commit')
  ORDER BY json_extract(receipt_json,'$.shutdown.generation') DESC,json_extract(receipt_json,'$.shutdown.controlRevision') DESC LIMIT 1),0)=1
BEGIN SELECT RAISE(ABORT,'SHUTDOWN_STARTS_PAUSED'); END;
