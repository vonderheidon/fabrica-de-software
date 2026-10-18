import type Database from 'better-sqlite3';

/** Disposable historical fixtures only. Production never restores retired settings. */
export function removeInferenceLimitsSchema(db: Database.Database): void {
  if (db.pragma('user_version', { simple: true }) === 23) db.exec('DELETE FROM schema_migrations WHERE version>=22; PRAGMA user_version=21;');
  db.exec(`ALTER TABLE factory_settings ADD COLUMN cost_defaults_json TEXT NOT NULL
    DEFAULT '{"formatVersion":1,"limit":{"state":"not_configured"}}' CHECK(json_valid(cost_defaults_json));
    DELETE FROM schema_migrations WHERE version=21;
    PRAGMA user_version=20;`);
}
