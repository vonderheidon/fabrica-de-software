ALTER TABLE factory_settings ADD COLUMN onboarding_suppressed INTEGER NOT NULL DEFAULT 0
  CHECK(onboarding_suppressed IN (0,1));
ALTER TABLE factory_settings ADD COLUMN onboarding_completed_at_ms INTEGER
  CHECK(onboarding_completed_at_ms IS NULL OR onboarding_completed_at_ms >= 0);
ALTER TABLE factory_settings ADD COLUMN projects_root_confirmed_at_ms INTEGER
  CHECK(projects_root_confirmed_at_ms IS NULL OR (projects_root IS NOT NULL AND projects_root_confirmed_at_ms >= 0));
ALTER TABLE factory_settings ADD COLUMN gh_executable_path TEXT
  CHECK(gh_executable_path IS NULL OR length(trim(gh_executable_path)) > 0);

CREATE TRIGGER onboarding_completion_immutable
BEFORE UPDATE OF onboarding_completed_at_ms ON factory_settings
WHEN OLD.onboarding_completed_at_ms IS NOT NULL AND NEW.onboarding_completed_at_ms IS NOT OLD.onboarding_completed_at_ms
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;
CREATE TRIGGER onboarding_completion_delete_immutable
BEFORE DELETE ON factory_settings WHEN OLD.onboarding_completed_at_ms IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;

ALTER TABLE operation_requests ADD COLUMN result_account_id TEXT
  REFERENCES accounts(github_account_id) ON DELETE RESTRICT
  CHECK(
    (operation_kind = 'settings.account.bind' AND resource_type = 'settings' AND resource_id = 'local'
      AND account_id IS NULL AND result_account_id IS NOT NULL)
    OR (operation_kind = 'settings.account.switch' AND resource_type = 'settings' AND resource_id = 'local'
      AND account_id IS NOT NULL AND result_account_id IS NOT NULL AND account_id <> result_account_id)
    OR (operation_kind NOT IN ('settings.account.bind','settings.account.switch') AND result_account_id IS NULL)
  );
DROP TRIGGER operation_identity_immutable;
CREATE TRIGGER operation_identity_immutable
BEFORE UPDATE OF operation_id, installation_id, account_id, operation_kind, resource_type, resource_id, request_hash, expected_revision_json, result_account_id
ON operation_requests
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;
