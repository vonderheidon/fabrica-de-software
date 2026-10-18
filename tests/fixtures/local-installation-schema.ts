import type Database from 'better-sqlite3';
import { removeInferenceLimitsSchema } from './inference-limits-schema.js';

/** Reconstruct v19 only in disposable fixtures. No production downgrade or data migration. */
export function removeLocalInstallationSchema(db: Database.Database): void {
  removeInferenceLimitsSchema(db);
  db.exec(`ALTER TABLE factory_settings ADD COLUMN data_root TEXT NOT NULL DEFAULT 'fixture-data' CHECK(length(data_root)>0);
    ALTER TABLE factory_settings ADD COLUMN maestri_settings_json TEXT NOT NULL DEFAULT '{"formatVersion":1}' CHECK(json_valid(maestri_settings_json));
    DELETE FROM schema_migrations WHERE version=20;
    PRAGMA user_version=19;`);
}
