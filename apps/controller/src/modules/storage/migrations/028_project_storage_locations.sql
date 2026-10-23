CREATE TABLE project_storage_locations (
  id TEXT PRIMARY KEY CHECK(length(id)=36),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  location_key TEXT NOT NULL CHECK(length(location_key) BETWEEN 1 AND 256 AND length(trim(location_key))>0 AND
    location_key GLOB '[a-z]*' AND location_key NOT GLOB '*[^a-z0-9._-]*'),
  layout_version INTEGER NOT NULL CHECK(layout_version>=1),
  root_relative TEXT NOT NULL CHECK(length(root_relative) BETWEEN 1 AND 32768 AND
    substr(root_relative,1,1)<>'/' AND instr(root_relative,char(92))=0 AND instr(root_relative,':')=0 AND
    instr(root_relative,char(0))=0 AND root_relative NOT GLOB '*[' || char(1) || '-' || char(31) || char(127) || ']*' AND
    root_relative NOT LIKE '../%' AND root_relative NOT LIKE '%/../%' AND root_relative NOT LIKE '%/..' AND
    root_relative<>'..' AND root_relative NOT LIKE './%' AND root_relative NOT LIKE '%/./%' AND root_relative NOT LIKE '%/.' AND
    root_relative NOT LIKE '%//%'),
  object_identity_json TEXT NOT NULL CHECK(json_valid(object_identity_json) AND json_type(object_identity_json)='object' AND
    json_extract(object_identity_json,'$.format_version')=1 AND
    json_type(object_identity_json,'$.volume_id')='text' AND length(json_extract(object_identity_json,'$.volume_id')) BETWEEN 1 AND 128 AND
    json_type(object_identity_json,'$.object_id')='text' AND length(json_extract(object_identity_json,'$.object_id')) BETWEEN 1 AND 128 AND
    json_type(object_identity_json,'$.ancestors')='array' AND json_array_length(object_identity_json,'$.ancestors') BETWEEN 1 AND 64),
  is_current INTEGER NOT NULL CHECK(is_current IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  verified_at_ms INTEGER NOT NULL CHECK(verified_at_ms>=created_at_ms),
  CHECK(root_relative='var/factory/projects/'||project_id||'/v'||layout_version||'/'||location_key),
  UNIQUE(id,project_id)
) STRICT;

CREATE UNIQUE INDEX project_storage_location_current_key
  ON project_storage_locations(project_id,location_key) WHERE is_current=1;
CREATE UNIQUE INDEX project_storage_location_current_path
  ON project_storage_locations(root_relative COLLATE NOCASE) WHERE is_current=1;
CREATE UNIQUE INDEX project_storage_location_current_identity
  ON project_storage_locations(json_extract(object_identity_json,'$.volume_id'),json_extract(object_identity_json,'$.object_id')) WHERE is_current=1;
CREATE INDEX project_storage_location_project_layout
  ON project_storage_locations(project_id,layout_version);

CREATE TRIGGER project_storage_location_identity_immutable
BEFORE UPDATE OF id,project_id,location_key,layout_version,root_relative,object_identity_json,created_at_ms ON project_storage_locations
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER project_storage_location_revision_monotonic
BEFORE UPDATE ON project_storage_locations
WHEN NEW.revision < OLD.revision OR NEW.verified_at_ms < OLD.verified_at_ms OR
  (NEW.is_current<>OLD.is_current AND NEW.revision<=OLD.revision)
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER project_storage_location_delete_authorized
BEFORE DELETE ON project_storage_locations
WHEN factory_project_deletion_row_allowed('project_storage_locations',json_array(OLD.id),factory_project_deletion_operation())<>1
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_AUTHORIZATION_REQUIRED'); END;
