import type Database from 'better-sqlite3';
import { loadMigrations } from './historical-schema.js';
import { removeManagedTerminalSchema } from './managed-terminal-schema.js';

/** Disposable fixtures only; never used to downgrade an installation. */
export function removeProjectDeletionSchema(db: Database.Database): void {
  removeManagedTerminalSchema(db);
  if (db.pragma('user_version', { simple: true }) === 32) {
    db.exec(`ALTER TABLE execution_profiles DROP COLUMN composition_version;
      DELETE FROM schema_migrations WHERE version=32;
      PRAGMA user_version=31;`);
  }
  if (db.pragma('user_version', { simple: true }) === 31) {
    db.exec(`DROP TRIGGER creation_board_operation_identity;
      DROP TRIGGER creation_board_operation_delete;
      DROP TRIGGER creation_board_completion_guard;
      DROP TABLE creation_board_operations;
      DELETE FROM schema_migrations WHERE version=31;
      PRAGMA user_version=30;`);
  }
  if (db.pragma('user_version', { simple: true }) === 30) {
    db.exec(`ALTER TABLE factory_settings DROP COLUMN tool_preferences_json;
      DELETE FROM schema_migrations WHERE version=30;
      PRAGMA user_version=29;`);
  }
  if (db.pragma('user_version', { simple: true }) === 29) {
    db.exec(`DROP TRIGGER project_storage_attempt_insert_barrier;
      DROP TRIGGER project_storage_deletion_insert_barrier;
      DROP TRIGGER project_storage_configuration_revision_barrier;
      DROP TRIGGER project_storage_location_retire_requires_transition;
      DROP TRIGGER project_storage_location_publish_requires_transition;
      DROP TABLE project_storage_transitions;
      DELETE FROM schema_migrations WHERE version=29;
      PRAGMA user_version=28;`);
  }
  if (db.pragma('user_version', { simple: true }) === 28) {
    db.exec('DROP TABLE project_storage_locations; DELETE FROM schema_migrations WHERE version=28; PRAGMA user_version=27;');
  }
  if (db.pragma('user_version', { simple: true }) === 27) {
    db.exec('ALTER TABLE events DROP COLUMN context_role; ALTER TABLE events DROP COLUMN context_round; DELETE FROM schema_migrations WHERE version=27; PRAGMA user_version=26;');
  }
  if (db.pragma('user_version', { simple: true }) === 26) {
    // Restore historical DELETE guards in disposable migration fixtures only.
    const triggers = db.prepare<[], { name: string }>(`SELECT name FROM sqlite_schema WHERE type='trigger'
      AND instr(sql,'factory_project_deletion_row_allowed')>0`).all();
    for (const { name } of triggers) db.exec(`DROP TRIGGER "${name}"`);
    const originals = new Map<string, string>();
    for (const migration of loadMigrations().slice(0, 25)) {
      for (const match of migration.sql.matchAll(/CREATE TRIGGER\s+(\w+)\s+BEFORE DELETE ON\s+\w+[\s\S]*?END;/g)) {
        if (match[1]) originals.set(match[1], match[0]);
      }
    }
    for (const { name } of triggers) {
      const sql = originals.get(name);
      if (sql) db.exec(sql);
    }
    db.exec('DELETE FROM schema_migrations WHERE version=26; PRAGMA user_version=25;');
  }
  if (db.pragma('user_version', { simple: true }) !== 25) return;
  db.exec(`DROP TABLE project_deletion_targets;
    DROP TABLE project_deletions;
    DROP TABLE project_deletion_receipts;
    DELETE FROM schema_migrations WHERE version=25;
    PRAGMA user_version=24;`);
}
