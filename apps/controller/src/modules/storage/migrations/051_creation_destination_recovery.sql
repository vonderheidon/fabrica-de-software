-- Keep every creation and inbound reference; only remove the permanent destination uniqueness.
-- The migration runner disables foreign keys for upgrades and checks every reference before commit.
PRAGMA legacy_alter_table = ON;
CREATE TABLE project_creations_next (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  installation_id TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
  plan_hash TEXT NOT NULL CHECK(length(plan_hash)=64),
  plan_json TEXT NOT NULL CHECK(json_valid(plan_json)),
  destination TEXT NOT NULL COLLATE NOCASE,
  state TEXT NOT NULL CHECK(state IN ('pending','running','completed','partial','failed')),
  baseline_sha TEXT,
  baseline_ref TEXT,
  diagnostic TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  CHECK((baseline_sha IS NULL)=(baseline_ref IS NULL)),
  CHECK(state<>'completed' OR (project_id IS NOT NULL AND baseline_sha IS NOT NULL AND diagnostic IS NULL))
) STRICT;
INSERT INTO project_creations_next SELECT * FROM project_creations ORDER BY rowid;
DROP TABLE project_creations;
ALTER TABLE project_creations_next RENAME TO project_creations;
PRAGMA legacy_alter_table = OFF;
CREATE INDEX project_creations_scope ON project_creations(installation_id,account_id,created_at_ms,id);
CREATE INDEX project_creations_destination ON project_creations(destination);
CREATE UNIQUE INDEX project_creations_reserved_destination ON project_creations(destination) WHERE state<>'failed';
CREATE TRIGGER creation_identity BEFORE UPDATE ON project_creations
WHEN NEW.id<>OLD.id OR NEW.operation_id<>OLD.operation_id OR NEW.installation_id<>OLD.installation_id
  OR NEW.account_id IS NOT OLD.account_id OR NEW.plan_hash<>OLD.plan_hash OR NEW.plan_json<>OLD.plan_json
  OR NEW.destination<>OLD.destination OR NEW.created_at_ms<>OLD.created_at_ms
  OR OLD.state='completed' OR NEW.revision<>OLD.revision+1
  OR (OLD.state IN ('partial','failed') AND NEW.state NOT IN ('partial','failed','completed'))
  OR (OLD.baseline_sha IS NOT NULL AND (NEW.baseline_sha IS NOT OLD.baseline_sha OR NEW.baseline_ref IS NOT OLD.baseline_ref))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CREATION'); END;
CREATE TRIGGER creation_delete BEFORE DELETE ON project_creations
WHEN factory_project_deletion_row_allowed('project_creations',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CREATION'); END;
CREATE TRIGGER creation_board_completion_guard BEFORE UPDATE OF state ON project_creations
WHEN NEW.state='completed' AND OLD.state<>'completed' AND json_extract(OLD.plan_json,'$.input.creationMode')<>'local'
 AND ((SELECT count(*) FROM creation_board_operations b WHERE b.creation_id=OLD.id AND b.state='confirmed'
       AND b.kind IN ('create_board','configure_status','link_repository','configure_view','verify_board'))<>5
   OR (SELECT count(DISTINCT b.kind) FROM creation_board_operations b WHERE b.creation_id=OLD.id AND b.state='confirmed'
       AND b.kind IN ('create_board','configure_status','link_repository','configure_view','verify_board'))<>5)
BEGIN SELECT RAISE(ABORT,'CREATION_BOARD_INCOMPLETE'); END;
