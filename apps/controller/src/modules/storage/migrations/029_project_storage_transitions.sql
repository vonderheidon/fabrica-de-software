CREATE TABLE project_storage_transitions (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  location_key TEXT NOT NULL CHECK(length(location_key) BETWEEN 1 AND 256),
  source_location_id TEXT NOT NULL,
  source_relative TEXT NOT NULL CHECK(length(source_relative) BETWEEN 1 AND 32768),
  destination_relative TEXT NOT NULL CHECK(length(destination_relative) BETWEEN 1 AND 32768 AND destination_relative<>source_relative),
  source_identity_json TEXT NOT NULL CHECK(json_valid(source_identity_json) AND json_type(source_identity_json)='object'),
  destination_identity_json TEXT CHECK(destination_identity_json IS NULL OR (json_valid(destination_identity_json) AND json_type(destination_identity_json)='object')),
  plan_hash TEXT NOT NULL CHECK(length(plan_hash)=64 AND plan_hash NOT GLOB '*[^a-f0-9]*'),
  step TEXT NOT NULL CHECK(step IN ('planned','quiescence_checked','moving','verifying','publishing_location')),
  state TEXT NOT NULL CHECK(state IN ('planned','running','verified','uncertain','blocked')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  generation INTEGER NOT NULL CHECK(generation>=1),
  reason TEXT CHECK(reason IS NULL OR length(reason)<=2048),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms>=created_at_ms),
  FOREIGN KEY(source_location_id,project_id) REFERENCES project_storage_locations(id,project_id) ON DELETE RESTRICT,
  CHECK(state<>'verified' OR (destination_identity_json IS NOT NULL AND step='publishing_location'))
) STRICT;

CREATE INDEX project_storage_transitions_project_state ON project_storage_transitions(project_id,state);
CREATE UNIQUE INDEX project_storage_transitions_active_project ON project_storage_transitions(project_id)
  WHERE state IN ('planned','running','uncertain','blocked');

CREATE TRIGGER project_storage_transition_insert_valid
BEFORE INSERT ON project_storage_transitions
WHEN NEW.source_relative NOT LIKE 'var/factory/projects/'||NEW.project_id||'/v%' OR
  NEW.source_relative NOT LIKE '%/managed' OR NEW.destination_relative<>'var/factory/projects/'||NEW.project_id||'/v'||(
    SELECT layout_version+1 FROM project_storage_locations WHERE id=NEW.source_location_id AND project_id=NEW.project_id
  )||'/'||NEW.location_key OR
  instr(NEW.source_relative,char(92))>0 OR instr(NEW.destination_relative,char(92))>0 OR
  instr(NEW.source_relative,':')>0 OR instr(NEW.destination_relative,':')>0 OR
  NEW.source_relative GLOB '*..*' OR NEW.destination_relative GLOB '*..*' OR
  NOT EXISTS(SELECT 1 FROM project_storage_locations l WHERE l.id=NEW.source_location_id AND l.project_id=NEW.project_id
    AND l.is_current=1 AND l.location_key=NEW.location_key AND l.root_relative=NEW.source_relative
    AND l.object_identity_json=NEW.source_identity_json) OR
  NOT EXISTS(SELECT 1 FROM operation_requests o WHERE o.operation_id=NEW.operation_id AND o.operation_kind='project.storage.transition'
    AND o.resource_type='project' AND o.resource_id=NEW.project_id)
BEGIN SELECT RAISE(ABORT,'PROJECT_STORAGE_TRANSITION_INVALID'); END;

CREATE TRIGGER project_storage_transition_identity_immutable
BEFORE UPDATE OF operation_id,project_id,location_key,source_location_id,source_relative,destination_relative,
  source_identity_json,plan_hash,created_at_ms ON project_storage_transitions
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER project_storage_transition_revision_monotonic
BEFORE UPDATE ON project_storage_transitions
WHEN OLD.state='verified' OR NEW.revision<>OLD.revision+1 OR NEW.generation NOT IN (OLD.generation,OLD.generation+1) OR
  NEW.updated_at_ms<OLD.updated_at_ms OR
  (OLD.destination_identity_json IS NOT NULL AND NEW.destination_identity_json IS NOT OLD.destination_identity_json) OR
  (CASE OLD.step WHEN 'planned' THEN 1 WHEN 'quiescence_checked' THEN 2 WHEN 'moving' THEN 3 WHEN 'verifying' THEN 4 ELSE 5 END) >
  (CASE NEW.step WHEN 'planned' THEN 1 WHEN 'quiescence_checked' THEN 2 WHEN 'moving' THEN 3 WHEN 'verifying' THEN 4 ELSE 5 END) OR
  NOT ((OLD.state='planned' AND NEW.state IN ('planned','running','uncertain','blocked')) OR
       (OLD.state='running' AND NEW.state IN ('running','uncertain','blocked','verified')) OR
       (OLD.state='uncertain' AND NEW.state IN ('running','uncertain','blocked','verified')) OR
       (OLD.state='blocked' AND NEW.state IN ('running','uncertain','blocked','verified')))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER project_storage_transition_delete_authorized
BEFORE DELETE ON project_storage_transitions
WHEN factory_project_deletion_row_allowed('project_storage_transitions',json_array(OLD.operation_id),factory_project_deletion_operation())<>1
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_AUTHORIZATION_REQUIRED'); END;

CREATE TRIGGER project_storage_attempt_insert_barrier
BEFORE INSERT ON attempts
WHEN EXISTS(SELECT 1 FROM project_storage_transitions WHERE project_id=NEW.project_id AND state IN ('planned','running','uncertain','blocked'))
BEGIN SELECT RAISE(ABORT,'PROJECT_STORAGE_TRANSITION_ACTIVE'); END;

CREATE TRIGGER project_storage_deletion_insert_barrier
BEFORE INSERT ON project_deletions
WHEN EXISTS(SELECT 1 FROM project_storage_transitions WHERE project_id=NEW.project_id AND state IN ('planned','running','uncertain','blocked'))
BEGIN SELECT RAISE(ABORT,'PROJECT_STORAGE_TRANSITION_ACTIVE'); END;

CREATE TRIGGER project_storage_configuration_revision_barrier
BEFORE INSERT ON project_revisions
WHEN EXISTS(SELECT 1 FROM project_storage_transitions WHERE project_id=NEW.project_id AND state IN ('planned','running','uncertain','blocked'))
BEGIN SELECT RAISE(ABORT,'PROJECT_STORAGE_TRANSITION_ACTIVE'); END;

CREATE TRIGGER project_storage_location_retire_requires_transition
BEFORE UPDATE OF is_current ON project_storage_locations
WHEN OLD.is_current=1 AND NEW.is_current=0 AND NOT EXISTS(
  SELECT 1 FROM project_storage_transitions t WHERE t.project_id=OLD.project_id AND t.location_key=OLD.location_key
    AND t.source_location_id=OLD.id AND t.source_relative=OLD.root_relative AND t.state='verified'
)
BEGIN SELECT RAISE(ABORT,'PROJECT_STORAGE_TRANSITION_REQUIRED'); END;

CREATE TRIGGER project_storage_location_publish_requires_transition
BEFORE INSERT ON project_storage_locations
WHEN NEW.is_current=1 AND EXISTS(SELECT 1 FROM project_storage_locations WHERE project_id=NEW.project_id AND location_key=NEW.location_key AND is_current=1)
  AND NOT EXISTS(
    SELECT 1 FROM project_storage_transitions t WHERE t.project_id=NEW.project_id AND t.location_key=NEW.location_key
      AND t.destination_relative=NEW.root_relative AND t.destination_identity_json=NEW.object_identity_json
      AND t.state='verified' AND t.step='publishing_location'
  )
BEGIN SELECT RAISE(ABORT,'PROJECT_STORAGE_TRANSITION_REQUIRED'); END;
