CREATE TABLE project_creations (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  installation_id TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
  plan_hash TEXT NOT NULL CHECK(length(plan_hash)=64),
  plan_json TEXT NOT NULL CHECK(json_valid(plan_json)),
  destination TEXT NOT NULL COLLATE NOCASE UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('pending','running','completed','partial','failed')),
  baseline_sha TEXT,
  baseline_ref TEXT,
  diagnostic TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  CHECK((baseline_sha IS NULL)=(baseline_ref IS NULL)),
  CHECK(state<>'completed' OR (project_id IS NOT NULL AND baseline_sha IS NOT NULL AND diagnostic IS NULL))
) STRICT;
CREATE INDEX project_creations_scope ON project_creations(installation_id,account_id,created_at_ms,id);
CREATE TABLE creation_steps (
  creation_id TEXT NOT NULL REFERENCES project_creations(id) ON DELETE RESTRICT,
  step TEXT NOT NULL CHECK(step IN ('directory','files','git','baseline','registration')),
  state TEXT NOT NULL CHECK(state IN ('running','confirmed','unknown')),
  PRIMARY KEY(creation_id,step)
) STRICT;
CREATE TRIGGER creation_identity BEFORE UPDATE ON project_creations
WHEN NEW.id<>OLD.id OR NEW.operation_id<>OLD.operation_id OR NEW.installation_id<>OLD.installation_id
  OR NEW.account_id IS NOT OLD.account_id OR NEW.plan_hash<>OLD.plan_hash OR NEW.plan_json<>OLD.plan_json
  OR NEW.destination<>OLD.destination OR NEW.created_at_ms<>OLD.created_at_ms
  OR OLD.state IN ('completed','partial','failed') OR NEW.revision<>OLD.revision+1
  OR (OLD.baseline_sha IS NOT NULL AND (NEW.baseline_sha IS NOT OLD.baseline_sha OR NEW.baseline_ref IS NOT OLD.baseline_ref))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CREATION'); END;
CREATE TRIGGER creation_delete BEFORE DELETE ON project_creations BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CREATION'); END;
CREATE TRIGGER creation_step_identity BEFORE UPDATE ON creation_steps
WHEN NEW.creation_id<>OLD.creation_id OR NEW.step<>OLD.step OR OLD.state<>'running'
  OR NEW.state NOT IN ('confirmed','unknown')
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CREATION_STEP'); END;
CREATE TRIGGER creation_step_delete BEFORE DELETE ON creation_steps BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CREATION_STEP'); END;
