import type Database from 'better-sqlite3';
import { loadMigrations } from '../../apps/controller/src/modules/storage/migrations.js';

/** Disposable fixtures only; never used to downgrade an installation. */
export function removeProjectDeletionSchema(db: Database.Database): void {
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
