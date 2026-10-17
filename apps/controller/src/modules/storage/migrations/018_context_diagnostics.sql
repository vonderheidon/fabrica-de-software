-- Only new complete scheduler observations populate these fields. Historical Ready
-- cycles alone do not prove eligibility or the observed queue order.
ALTER TABLE queue_cycles ADD COLUMN last_eligible INTEGER CHECK(last_eligible IS NULL OR last_eligible IN (0,1));
ALTER TABLE queue_cycles ADD COLUMN observed_ordinal INTEGER CHECK(observed_ordinal IS NULL OR observed_ordinal>=0);
CREATE INDEX queue_cycles_summary ON queue_cycles(account_id,last_eligible,last_ready,updated_at_ms DESC,observed_ordinal) WHERE consumed_attempt_id IS NULL;

CREATE TABLE diagnostic_runs (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  installation_id TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  scope TEXT NOT NULL CHECK(scope IN ('host','project','creation','attempt')),
  context_id TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
  creation_id TEXT REFERENCES project_creations(id) ON DELETE RESTRICT,
  attempt_id TEXT REFERENCES attempts(id) ON DELETE RESTRICT,
  context_stamp TEXT NOT NULL CHECK(length(context_stamp)=64),
  checks_json TEXT NOT NULL CHECK(json_valid(checks_json) AND json_type(checks_json)='array' AND json_array_length(checks_json) BETWEEN 1 AND 4),
  state TEXT NOT NULL CHECK(state IN ('accepted','succeeded','failed','unknown')),
  diagnostics_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(diagnostics_json) AND json_type(diagnostics_json)='array' AND json_array_length(diagnostics_json)<=4),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  completed_at_ms INTEGER CHECK(completed_at_ms IS NULL OR completed_at_ms>=created_at_ms),
  CHECK((state='accepted')=(completed_at_ms IS NULL)),
  CHECK((scope='host' AND context_id='local' AND project_id IS NULL AND creation_id IS NULL AND attempt_id IS NULL)
    OR (scope='project' AND context_id=project_id AND creation_id IS NULL AND attempt_id IS NULL)
    OR (scope='creation' AND context_id=creation_id AND attempt_id IS NULL)
    OR (scope='attempt' AND context_id=attempt_id AND project_id IS NOT NULL AND creation_id IS NULL))
) STRICT;
CREATE INDEX diagnostic_runs_context ON diagnostic_runs(installation_id,account_id,scope,context_id,created_at_ms DESC,operation_id DESC);
CREATE INDEX diagnostic_runs_project ON diagnostic_runs(project_id,created_at_ms DESC);
CREATE INDEX diagnostic_runs_host_identity ON diagnostic_runs(installation_id,account_id,completed_at_ms DESC,operation_id DESC)
  WHERE scope='host' AND state='succeeded' AND instr(checks_json,'"github_identity"')>0;
CREATE INDEX diagnostic_runs_host_maestri ON diagnostic_runs(installation_id,account_id,completed_at_ms DESC,operation_id DESC)
  WHERE scope='host' AND state='succeeded' AND instr(checks_json,'"maestri_context"')>0;
CREATE INDEX attempts_recent_results ON attempts(account_id,updated_at_ms DESC,id DESC) WHERE result IS NOT NULL;
CREATE TRIGGER diagnostic_run_scope BEFORE INSERT ON diagnostic_runs
WHEN NOT EXISTS (SELECT 1 FROM operation_requests o WHERE o.operation_id=NEW.operation_id AND o.operation_kind='diagnostics.check'
  AND o.resource_type='diagnostic' AND o.resource_id=NEW.operation_id AND o.installation_id=NEW.installation_id AND o.account_id IS NEW.account_id)
  OR (NEW.scope='attempt' AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.id=NEW.attempt_id AND a.account_id IS NEW.account_id AND a.project_id=NEW.project_id))
  OR (NEW.scope='creation' AND NOT EXISTS (SELECT 1 FROM project_creations c WHERE c.id=NEW.creation_id AND c.installation_id=NEW.installation_id AND c.account_id IS NEW.account_id AND c.project_id IS NEW.project_id))
  OR (NEW.scope='project' AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id=NEW.project_id AND (p.account_id IS NULL OR p.account_id IS NEW.account_id)))
BEGIN SELECT RAISE(ABORT,'diagnostic context mismatch'); END;
CREATE TRIGGER diagnostic_run_identity BEFORE UPDATE OF operation_id,installation_id,account_id,scope,context_id,project_id,creation_id,attempt_id,context_stamp,checks_json,created_at_ms ON diagnostic_runs
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER diagnostic_run_terminal BEFORE UPDATE ON diagnostic_runs WHEN OLD.state<>'accepted'
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER diagnostic_run_delete BEFORE DELETE ON diagnostic_runs
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
