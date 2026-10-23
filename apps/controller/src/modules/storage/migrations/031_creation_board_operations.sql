CREATE TABLE creation_board_operations (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  creation_id TEXT NOT NULL REFERENCES project_creations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  kind TEXT NOT NULL CHECK(kind IN ('create_board','configure_status','link_repository','configure_view','verify_board')),
  scope_key TEXT NOT NULL CHECK(length(scope_key) BETWEEN 1 AND 512),
  state TEXT NOT NULL CHECK(state IN ('not_started','running','confirmed','failed_known','unknown')),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64 AND request_hash NOT GLOB '*[^0-9a-f]*'),
  authorization_json TEXT NOT NULL CHECK(json_valid(authorization_json) AND json_type(authorization_json)='object' AND json_extract(authorization_json,'$.formatVersion')=1),
  expected_identity_json TEXT NOT NULL CHECK(json_valid(expected_identity_json) AND json_type(expected_identity_json)='object' AND json_extract(expected_identity_json,'$.formatVersion')=1),
  receipt_json TEXT CHECK(receipt_json IS NULL OR (json_valid(receipt_json) AND json_type(receipt_json)='object' AND json_extract(receipt_json,'$.formatVersion')=1)),
  reason TEXT CHECK(reason IS NULL OR length(reason)<=2048),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  sent_at_ms INTEGER CHECK(sent_at_ms IS NULL OR sent_at_ms>=created_at_ms),
  confirmed_at_ms INTEGER CHECK(confirmed_at_ms IS NULL OR confirmed_at_ms>=created_at_ms),
  CHECK((state='confirmed')=(receipt_json IS NOT NULL)),
  CHECK((state='confirmed')=(confirmed_at_ms IS NOT NULL)),
  UNIQUE(creation_id,kind,scope_key)
) STRICT;
CREATE INDEX creation_board_operations_state ON creation_board_operations(creation_id,state);

CREATE TRIGGER creation_board_operation_identity BEFORE UPDATE ON creation_board_operations
WHEN NEW.operation_id<>OLD.operation_id OR NEW.creation_id<>OLD.creation_id OR NEW.kind<>OLD.kind OR NEW.scope_key<>OLD.scope_key
  OR NEW.request_hash<>OLD.request_hash OR NEW.authorization_json<>OLD.authorization_json
  OR NEW.expected_identity_json<>OLD.expected_identity_json OR NEW.created_at_ms<>OLD.created_at_ms
  OR NEW.revision<>OLD.revision+1 OR OLD.state IN ('confirmed','failed_known')
  OR (OLD.sent_at_ms IS NOT NULL AND NEW.sent_at_ms IS NOT OLD.sent_at_ms)
  OR (OLD.confirmed_at_ms IS NOT NULL AND NEW.confirmed_at_ms IS NOT OLD.confirmed_at_ms)
  OR NEW.state NOT IN ('running','confirmed','failed_known','unknown')
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CREATION_BOARD_OPERATION'); END;
CREATE TRIGGER creation_board_operation_delete BEFORE DELETE ON creation_board_operations
WHEN factory_project_deletion_row_allowed('creation_board_operations',json_array(OLD.operation_id),
  (SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state)
   FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CREATION_BOARD_OPERATION'); END;

CREATE TRIGGER creation_board_completion_guard BEFORE UPDATE OF state ON project_creations
WHEN NEW.state='completed' AND OLD.state<>'completed' AND json_extract(OLD.plan_json,'$.input.creationMode')<>'local'
 AND ((SELECT count(*) FROM creation_board_operations b WHERE b.creation_id=OLD.id AND b.state='confirmed'
       AND b.kind IN ('create_board','configure_status','link_repository','configure_view','verify_board'))<>5
   OR (SELECT count(DISTINCT b.kind) FROM creation_board_operations b WHERE b.creation_id=OLD.id AND b.state='confirmed'
       AND b.kind IN ('create_board','configure_status','link_repository','configure_view','verify_board'))<>5)
BEGIN SELECT RAISE(ABORT,'CREATION_BOARD_INCOMPLETE'); END;
