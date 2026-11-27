-- Registration by GitHub URL: one durable row per accepted import. The row is the only proof that the
-- factory created (or merely adopted) the destination folder, so cleanup never touches foreign content.
CREATE TABLE project_imports (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  installation_id TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 256),
  repository_url TEXT NOT NULL CHECK(length(repository_url) BETWEEN 1 AND 4096),
  repository_id TEXT CHECK(repository_id IS NULL OR length(repository_id) BETWEEN 1 AND 256),
  base_branch TEXT CHECK(base_branch IS NULL OR length(base_branch) BETWEEN 1 AND 1024),
  projects_root TEXT NOT NULL CHECK(length(projects_root) BETWEEN 1 AND 4096),
  destination TEXT NOT NULL COLLATE NOCASE CHECK(length(destination) BETWEEN 1 AND 32768),
  step TEXT NOT NULL CHECK(step IN ('repository','reservation','clone','verification','registration')),
  state TEXT NOT NULL CHECK(state IN ('accepted','running','completed','failed')),
  adopted INTEGER NOT NULL DEFAULT 0 CHECK(adopted IN (0,1)),
  created_directory_identity TEXT CHECK(created_directory_identity IS NULL OR length(created_directory_identity) BETWEEN 1 AND 512),
  cleanup TEXT NOT NULL DEFAULT 'not_needed' CHECK(cleanup IN ('not_needed','removed','failed')),
  diagnostic TEXT CHECK(diagnostic IS NULL OR (length(diagnostic) BETWEEN 1 AND 128 AND diagnostic NOT GLOB '*[^A-Z0-9_]*')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms>=created_at_ms),
  CHECK((project_id IS NOT NULL)=(state='completed')),
  CHECK(state<>'completed' OR (diagnostic IS NULL AND step='registration')),
  CHECK(state<>'failed' OR diagnostic IS NOT NULL),
  CHECK(adopted=0 OR created_directory_identity IS NULL),
  CHECK(cleanup='not_needed' OR state='failed')
) STRICT;

CREATE INDEX project_imports_project ON project_imports(project_id);

CREATE UNIQUE INDEX project_imports_active_destination ON project_imports(destination) WHERE state IN ('accepted','running');

CREATE TRIGGER project_import_identity BEFORE UPDATE ON project_imports
WHEN NEW.id<>OLD.id OR NEW.operation_id<>OLD.operation_id OR NEW.installation_id<>OLD.installation_id
  OR NEW.account_id IS NOT OLD.account_id OR NEW.name<>OLD.name OR NEW.repository_url<>OLD.repository_url
  OR NEW.projects_root<>OLD.projects_root OR NEW.destination<>OLD.destination OR NEW.created_at_ms<>OLD.created_at_ms
  OR NEW.revision<>OLD.revision+1
  OR (OLD.created_directory_identity IS NOT NULL AND NEW.created_directory_identity IS NOT OLD.created_directory_identity)
  OR OLD.state='completed'
  OR (OLD.state='failed' AND (NEW.state<>'failed' OR OLD.cleanup<>'failed' OR NEW.cleanup NOT IN ('removed','failed')
    OR NEW.step<>OLD.step OR NEW.diagnostic IS NOT OLD.diagnostic OR NEW.project_id IS NOT OLD.project_id
    OR NEW.repository_id IS NOT OLD.repository_id OR NEW.base_branch IS NOT OLD.base_branch OR NEW.adopted<>OLD.adopted))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_PROJECT_IMPORT'); END;

CREATE TRIGGER project_import_delete_authorized BEFORE DELETE ON project_imports
WHEN factory_project_deletion_row_allowed('project_imports',json_array(OLD.id),
  (SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,
    'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_AUTHORIZATION_REQUIRED'); END;
