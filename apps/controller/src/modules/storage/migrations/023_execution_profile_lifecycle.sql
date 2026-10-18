ALTER TABLE execution_profiles ADD COLUMN profile_type TEXT
  CHECK(profile_type IS NULL OR profile_type IN ('implementer', 'reviewer'));
ALTER TABLE execution_profiles ADD COLUMN name_key TEXT
  CHECK(name_key IS NULL OR length(trim(name_key)) > 0);
ALTER TABLE execution_profiles ADD COLUMN deleted_at_ms INTEGER
  CHECK(deleted_at_ms IS NULL OR deleted_at_ms >= created_at_ms);

CREATE UNIQUE INDEX IF NOT EXISTS execution_profiles_live_name
  ON execution_profiles(name_key)
  WHERE deleted_at_ms IS NULL;

CREATE TRIGGER execution_profiles_lifecycle_insert_valid
BEFORE INSERT ON execution_profiles
WHEN NEW.profile_type IS NULL OR NEW.name_key IS NULL OR length(trim(NEW.name_key)) = 0
  OR NEW.deleted_at_ms IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'PROFILE_DATA_INVALID');
END;

CREATE TRIGGER execution_profiles_lifecycle_update_valid
BEFORE UPDATE ON execution_profiles
WHEN NEW.id <> OLD.id OR NEW.created_at_ms <> OLD.created_at_ms
  OR NEW.profile_type IS NULL OR NEW.profile_type NOT IN ('implementer', 'reviewer')
  OR NEW.name_key IS NULL OR length(trim(NEW.name_key)) = 0
  OR NEW.updated_at_ms < OLD.updated_at_ms OR NEW.revision <> OLD.revision + 1
  OR (OLD.deleted_at_ms IS NOT NULL AND NEW.deleted_at_ms IS NOT OLD.deleted_at_ms)
  OR (OLD.deleted_at_ms IS NULL AND NEW.deleted_at_ms IS NOT NULL AND NEW.deleted_at_ms < OLD.created_at_ms)
BEGIN
  SELECT RAISE(ABORT, 'PROFILE_DATA_INVALID');
END;

CREATE TRIGGER execution_profiles_physical_delete_forbidden
BEFORE DELETE ON execution_profiles
BEGIN
  SELECT RAISE(ABORT, 'IMMUTABLE_RECORD');
END;

CREATE INDEX IF NOT EXISTS attempts_active_implementer_profile
  ON attempts(json_extract(capture_json, '$.configuration.implementerProfile.id'))
  WHERE result IS NULL AND json_extract(capture_json, '$.formatVersion') = 1;

CREATE INDEX IF NOT EXISTS attempts_active_reviewer_profile
  ON attempts(json_extract(capture_json, '$.configuration.reviewerProfile.id'))
  WHERE result IS NULL AND json_extract(capture_json, '$.formatVersion') = 1;
