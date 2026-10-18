import type Database from 'better-sqlite3';
import { removeLocalInstallationSchema } from './local-installation-schema.js';

/** Disposable test databases only; production never downgrades an installation. */
export function removeInitialConfigurationSchema(db: Database.Database): void {
  removeLocalInstallationSchema(db);
  db.exec(`DROP TRIGGER onboarding_completion_immutable;
    DROP TRIGGER onboarding_completion_delete_immutable;
    DROP TRIGGER operation_identity_immutable;
    ALTER TABLE factory_settings DROP COLUMN onboarding_suppressed;
    ALTER TABLE factory_settings DROP COLUMN onboarding_completed_at_ms;
    ALTER TABLE factory_settings DROP COLUMN projects_root_confirmed_at_ms;
    ALTER TABLE factory_settings DROP COLUMN gh_executable_path;
    ALTER TABLE operation_requests DROP COLUMN result_account_id;
    CREATE TRIGGER operation_identity_immutable
    BEFORE UPDATE OF operation_id, installation_id, account_id, operation_kind, resource_type, resource_id, request_hash, expected_revision_json ON operation_requests
    BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;
    DELETE FROM schema_migrations WHERE version>=19;
    PRAGMA user_version=18;`);
}
