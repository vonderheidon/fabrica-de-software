CREATE TABLE attempt_workspace_snapshots (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE RESTRICT,
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0)
) STRICT;

CREATE TRIGGER attempt_workspace_snapshot_insert_guard BEFORE INSERT ON attempt_workspace_snapshots
WHEN NOT EXISTS (
  SELECT 1 FROM attempts a
  WHERE a.id=NEW.attempt_id AND a.phase='preparing' AND a.result IS NULL AND a.suspension IS NULL
    AND json_extract(a.capture_json,'$.workspace.initial_state.kind')='pending_inherited_attempt'
    AND json_extract(NEW.snapshot_json,'$.identity.project_id')=a.project_id
    AND json_extract(NEW.snapshot_json,'$.identity.repository_id')=a.repository_id
    AND json_extract(NEW.snapshot_json,'$.identity.issue_id')=a.issue_id
    AND json_extract(NEW.snapshot_json,'$.predecessor_attempt_id')=json_extract(a.capture_json,'$.workspace.predecessor_attempt_id')
    AND json_extract(NEW.snapshot_json,'$.initial_state.kind')='inherited_attempt'
    AND json_extract(NEW.snapshot_json,'$.initial_state.source_attempt_id')=json_extract(a.capture_json,'$.workspace.predecessor_attempt_id')
    AND json_extract(NEW.snapshot_json,'$.inherited_base_sha') IS json_extract(a.capture_json,'$.workspace.inherited_base_sha')
    AND json_extract(NEW.snapshot_json,'$.comparison_base_sha')=json_extract(NEW.snapshot_json,'$.initial_state.content_identity')
    AND EXISTS (SELECT 1 FROM resources r WHERE r.attempt_id=a.id AND r.kind='implementation' AND r.launch_state='starting')
)
BEGIN SELECT RAISE(ABORT,'WORKSPACE_SNAPSHOT_INVALID'); END;

CREATE TRIGGER attempt_workspace_snapshot_update_immutable BEFORE UPDATE ON attempt_workspace_snapshots
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER attempt_workspace_snapshots_delete_guard BEFORE DELETE ON attempt_workspace_snapshots
WHEN factory_project_deletion_row_allowed('attempt_workspace_snapshots',json_array(OLD.attempt_id),
  (SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state)
   FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
