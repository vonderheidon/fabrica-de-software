ALTER TABLE deliveries ADD COLUMN history_repository_relative TEXT;

CREATE INDEX deliveries_history_repository_reference ON deliveries(history_repository_relative) WHERE history_repository_relative IS NOT NULL;

CREATE TRIGGER delivery_history_repository_reference_insert BEFORE INSERT ON deliveries
WHEN NEW.history_repository_relative IS NOT NULL AND NEW.history_repository_relative<>'issues/'||
  (SELECT issue_number FROM attempts WHERE id=NEW.attempt_id)||'/history.git'
BEGIN SELECT RAISE(ABORT,'DELIVERY_HISTORY_REFERENCE_INVALID'); END;

CREATE TABLE retained_history_migrations (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  repository_id TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  issue_number INTEGER NOT NULL CHECK(issue_number BETWEEN 1 AND 2147483647),
  source_relative TEXT NOT NULL CHECK(source_relative='git/'||attempt_id||'.git'),
  destination_relative TEXT NOT NULL CHECK(destination_relative='issues/'||issue_number||'/history.git'),
  source_identity_json TEXT NOT NULL CHECK(json_valid(source_identity_json)),
  refs_sha256 TEXT NOT NULL CHECK(length(refs_sha256)=64 AND refs_sha256 NOT GLOB '*[^0-9a-f]*'),
  ref_count INTEGER NOT NULL CHECK(ref_count BETWEEN 0 AND 100000),
  destination_identity_json TEXT CHECK(destination_identity_json IS NULL OR json_valid(destination_identity_json)),
  state TEXT NOT NULL CHECK(state IN ('copying','blocked','verified')),
  reason TEXT,
  revision INTEGER NOT NULL CHECK(revision>=1),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms>=created_at_ms),
  FOREIGN KEY(attempt_id,project_id) REFERENCES attempts(id,project_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX retained_history_migrations_project_issue_state
  ON retained_history_migrations(project_id,repository_id,issue_id,state);

CREATE TRIGGER retained_history_migration_identity_insert BEFORE INSERT ON retained_history_migrations
WHEN NOT EXISTS(SELECT 1 FROM attempts a WHERE a.id=NEW.attempt_id AND a.project_id=NEW.project_id
  AND a.repository_id=NEW.repository_id AND a.issue_id=NEW.issue_id AND a.issue_number=NEW.issue_number)
BEGIN SELECT RAISE(ABORT,'RETAINED_HISTORY_MIGRATION_IDENTITY_INVALID'); END;

CREATE TRIGGER retained_history_migration_identity_update
BEFORE UPDATE OF attempt_id,project_id,repository_id,issue_id,issue_number,source_relative,destination_relative,
  source_identity_json,refs_sha256,ref_count,created_at_ms ON retained_history_migrations
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER retained_history_migration_destination_identity_update
BEFORE UPDATE OF destination_identity_json ON retained_history_migrations
WHEN OLD.destination_identity_json IS NOT NULL AND NEW.destination_identity_json IS NOT OLD.destination_identity_json
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER retained_history_migration_state_update BEFORE UPDATE OF state ON retained_history_migrations
WHEN OLD.state<>'copying' OR NEW.state NOT IN ('blocked','verified')
BEGIN SELECT RAISE(ABORT,'INVALID_RETAINED_HISTORY_MIGRATION_TRANSITION'); END;

CREATE TRIGGER retained_history_migration_delete_authorized BEFORE DELETE ON retained_history_migrations
WHEN factory_project_deletion_row_allowed('retained_history_migrations',json_array(OLD.attempt_id),
  (SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,
    'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_AUTHORIZATION_REQUIRED'); END;

CREATE TRIGGER project_deletion_retained_history_insert BEFORE INSERT ON project_deletions
WHEN EXISTS(SELECT 1 FROM retained_history_migrations WHERE project_id=NEW.project_id AND state='copying')
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_BLOCKED_BY_HISTORY_MIGRATION'); END;

CREATE TRIGGER project_deletion_retained_history_update BEFORE UPDATE OF state ON project_deletions
WHEN NEW.state IN ('running','finalizing') AND EXISTS(
  SELECT 1 FROM retained_history_migrations WHERE project_id=NEW.project_id AND state='copying')
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_BLOCKED_BY_HISTORY_MIGRATION'); END;

CREATE TRIGGER delivery_history_repository_reference_update BEFORE UPDATE OF history_repository_relative ON deliveries
WHEN (NEW.history_repository_relative IS NOT NULL AND NEW.history_repository_relative<>'issues/'||
    (SELECT issue_number FROM attempts WHERE id=NEW.attempt_id)||'/history.git') OR
  (OLD.history_repository_relative IS NOT NULL AND NEW.history_repository_relative IS NOT OLD.history_repository_relative)
BEGIN SELECT RAISE(ABORT,'DELIVERY_HISTORY_REFERENCE_INVALID'); END;
