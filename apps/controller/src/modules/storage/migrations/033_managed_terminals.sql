CREATE TABLE managed_terminals (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  host_name TEXT NOT NULL CHECK(length(trim(host_name)) > 0),
  role TEXT NOT NULL CHECK(role IN ('implementer','reviewer')),
  owner TEXT NOT NULL CHECK(owner = 'factory'),
  generation INTEGER NOT NULL CHECK(generation >= 1),
  terminal_name TEXT NOT NULL UNIQUE CHECK(terminal_name GLOB 'factory-*'),
  workspace_id TEXT,
  terminal_id TEXT,
  state TEXT NOT NULL CHECK(state IN ('planned','occupied','available','uncertain','retired')),
  observed_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
  CHECK((workspace_id IS NULL) = (terminal_id IS NULL)),
  CHECK(state NOT IN ('occupied','available') OR terminal_id IS NOT NULL),
  UNIQUE(id,generation),
  UNIQUE(id,installation_id,host_name,role,generation)
) STRICT;
CREATE INDEX managed_terminals_role_state ON managed_terminals(installation_id,host_name,role,state,updated_at_ms DESC);
CREATE UNIQUE INDEX managed_terminals_physical_identity ON managed_terminals(workspace_id,terminal_id) WHERE terminal_id IS NOT NULL AND state <> 'retired';

CREATE TABLE attempt_sessions (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK(role IN ('implementer','reviewer')),
  managed_terminal_id TEXT NOT NULL REFERENCES managed_terminals(id) ON DELETE RESTRICT,
  session_directory_relative TEXT NOT NULL CHECK(length(trim(session_directory_relative)) > 0),
  omp_session_id TEXT,
  terminal_generation INTEGER NOT NULL CHECK(terminal_generation >= 1),
  state TEXT NOT NULL CHECK(state IN ('reserved','active','completed','uncertain','interrupted')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
  UNIQUE(attempt_id,role),
  UNIQUE(id,attempt_id),
  UNIQUE(id,attempt_id,role)
) STRICT;
CREATE INDEX attempt_sessions_terminal ON attempt_sessions(managed_terminal_id,state,updated_at_ms);
CREATE UNIQUE INDEX attempt_sessions_omp_identity ON attempt_sessions(omp_session_id) WHERE omp_session_id IS NOT NULL;

ALTER TABLE passages ADD COLUMN attempt_session_id TEXT REFERENCES attempt_sessions(id) ON DELETE RESTRICT;
CREATE TRIGGER passage_attempt_session_binding BEFORE INSERT ON passages
WHEN NOT EXISTS (SELECT 1 FROM attempt_sessions s WHERE s.id=NEW.attempt_session_id AND s.attempt_id=NEW.attempt_id AND s.role=NEW.role)
BEGIN SELECT RAISE(ABORT,'PASSAGE_SESSION_BINDING_INVALID'); END;
CREATE TRIGGER passage_attempt_session_immutable BEFORE UPDATE OF attempt_session_id ON passages
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE INDEX passages_attempt_session ON passages(attempt_session_id,round_number);

CREATE TABLE terminal_occupancies (
  id TEXT PRIMARY KEY,
  managed_terminal_id TEXT NOT NULL REFERENCES managed_terminals(id) ON DELETE RESTRICT,
  attempt_session_id TEXT NOT NULL REFERENCES attempt_sessions(id) ON DELETE RESTRICT,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  passage_id TEXT NOT NULL REFERENCES passages(id) ON DELETE RESTRICT,
  generation INTEGER NOT NULL CHECK(generation >= 1),
  state TEXT NOT NULL CHECK(state IN ('occupied','released','uncertain')),
  claimed_at_ms INTEGER NOT NULL,
  released_at_ms INTEGER,
  reason TEXT,
  CHECK((state='released') = (released_at_ms IS NOT NULL)),
  UNIQUE(passage_id,generation),
  FOREIGN KEY(attempt_session_id,attempt_id) REFERENCES attempt_sessions(id,attempt_id) ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX terminal_occupancies_terminal_active ON terminal_occupancies(managed_terminal_id) WHERE state IN ('occupied','uncertain');
CREATE UNIQUE INDEX terminal_occupancies_session_active ON terminal_occupancies(attempt_session_id) WHERE state IN ('occupied','uncertain');
CREATE INDEX terminal_occupancies_attempt ON terminal_occupancies(attempt_id,state,claimed_at_ms);

CREATE TRIGGER managed_terminal_identity_immutable BEFORE UPDATE OF id,installation_id,host_name,role,owner,terminal_name,created_at_ms ON managed_terminals
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER managed_terminal_generation_monotonic BEFORE UPDATE OF generation ON managed_terminals WHEN NEW.generation < OLD.generation
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER managed_terminal_physical_identity_immutable BEFORE UPDATE OF workspace_id,terminal_id ON managed_terminals
WHEN OLD.terminal_id IS NOT NULL AND (NEW.workspace_id IS NOT OLD.workspace_id OR NEW.terminal_id IS NOT OLD.terminal_id)
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER attempt_session_identity_immutable BEFORE UPDATE OF id,attempt_id,role,session_directory_relative,created_at_ms ON attempt_sessions
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER attempt_session_terminal_reassignment BEFORE UPDATE OF managed_terminal_id,terminal_generation ON attempt_sessions
WHEN OLD.state<>'reserved' OR OLD.omp_session_id IS NOT NULL OR EXISTS (SELECT 1 FROM terminal_occupancies o WHERE o.attempt_session_id=OLD.id)
  OR NOT EXISTS (
    SELECT 1 FROM managed_terminals old_terminal JOIN managed_terminals new_terminal
      ON new_terminal.id=NEW.managed_terminal_id
    WHERE old_terminal.id=OLD.managed_terminal_id AND old_terminal.installation_id=new_terminal.installation_id
      AND old_terminal.host_name=new_terminal.host_name AND old_terminal.role=new_terminal.role
      AND old_terminal.state='uncertain' AND new_terminal.state='planned' AND NEW.terminal_generation=new_terminal.generation
  )
BEGIN SELECT RAISE(ABORT,'TERMINAL_SESSION_REASSIGNMENT_INVALID'); END;
CREATE TRIGGER attempt_session_terminal_generation BEFORE INSERT ON attempt_sessions WHEN NOT EXISTS (
  SELECT 1 FROM managed_terminals t WHERE t.id=NEW.managed_terminal_id AND
    ((t.state='available' AND NEW.terminal_generation=t.generation+1) OR (t.state='planned' AND NEW.terminal_generation=t.generation))
) BEGIN SELECT RAISE(ABORT,'TERMINAL_GENERATION_INVALID'); END;
CREATE TRIGGER attempt_session_omp_identity_immutable BEFORE UPDATE OF omp_session_id ON attempt_sessions
WHEN OLD.omp_session_id IS NOT NULL AND NEW.omp_session_id IS NOT OLD.omp_session_id
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER terminal_occupancy_identity_immutable BEFORE UPDATE OF id,managed_terminal_id,attempt_session_id,attempt_id,passage_id,generation,claimed_at_ms ON terminal_occupancies
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER terminal_occupancy_state_monotonic BEFORE UPDATE OF state ON terminal_occupancies
WHEN (OLD.state='released' AND NEW.state<>'released') OR (OLD.state='uncertain' AND NEW.state='occupied')
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER terminal_occupancy_terminal_binding BEFORE INSERT ON terminal_occupancies WHEN NOT EXISTS (
  SELECT 1 FROM attempt_sessions s JOIN passages p ON p.id=NEW.passage_id
  JOIN managed_terminals t ON t.id=NEW.managed_terminal_id
  WHERE s.id=NEW.attempt_session_id AND s.attempt_id=NEW.attempt_id AND s.managed_terminal_id=NEW.managed_terminal_id
    AND s.terminal_generation=NEW.generation AND t.generation=NEW.generation
    AND p.attempt_id=NEW.attempt_id AND p.attempt_session_id=s.id AND p.id=NEW.passage_id
) BEGIN SELECT RAISE(ABORT,'TERMINAL_OCCUPANCY_BINDING_INVALID'); END;
CREATE TRIGGER managed_terminals_delete_immutable BEFORE DELETE ON managed_terminals
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER attempt_sessions_delete_immutable BEFORE DELETE ON attempt_sessions
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER terminal_occupancies_delete_immutable BEFORE DELETE ON terminal_occupancies
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER attempt_sessions_delete_immutable;
CREATE TRIGGER attempt_sessions_delete_guard BEFORE DELETE ON attempt_sessions
WHEN factory_project_deletion_row_allowed('attempt_sessions',json_array(OLD.id),
  (SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state)
   FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
DROP TRIGGER terminal_occupancies_delete_immutable;
CREATE TRIGGER terminal_occupancies_delete_guard BEFORE DELETE ON terminal_occupancies
WHEN factory_project_deletion_row_allowed('terminal_occupancies',json_array(OLD.id),
  (SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state)
   FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
