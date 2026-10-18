import { readFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { removeInitialConfigurationSchema } from './initial-configuration-schema.js';

/** Reconstruct v16 in disposable fixtures; production migrations only advance. */
export function removeRemoteScaffoldSchema(db: Database.Database): void {
  removeInitialConfigurationSchema(db);
  db.exec('DROP TABLE IF EXISTS diagnostic_runs; DELETE FROM schema_migrations WHERE version>=18');
  db.exec('DROP INDEX IF EXISTS attempts_recent_results');
  if (db.prepare("SELECT 1 FROM pragma_table_info('queue_cycles') WHERE name='last_eligible'").get()) {
    db.exec('DROP INDEX queue_cycles_summary; ALTER TABLE queue_cycles DROP COLUMN last_eligible; ALTER TABLE queue_cycles DROP COLUMN observed_ordinal');
  }
  const rows = db.prepare<[],Record<string,unknown>>('SELECT * FROM effects ORDER BY rowid').all();
  const sql = readFileSync(new URL('../../apps/controller/src/modules/storage/migrations/015_pr_upgrades.sql',import.meta.url),'utf8');
  db.exec('DROP TABLE creation_reconciliations');
  // The original v15 replacement preserves row order, identities, receipts and guards.
  db.exec(sql.slice(0,sql.indexOf('CREATE TABLE publication_requests_next')));
  if (db.prepare('SELECT count(*) AS n FROM effects').get() && rows.length !== db.prepare<[],{ n: number }>('SELECT count(*) AS n FROM effects').get()!.n) throw new Error('FIXTURE_HISTORY_LOST');
  const scaffold = readFileSync(new URL('../../apps/controller/src/modules/storage/migrations/013_scaffold.sql',import.meta.url),'utf8');
  db.exec('DROP TRIGGER creation_identity');
  db.exec(scaffold.slice(scaffold.indexOf('CREATE TRIGGER creation_identity'),scaffold.indexOf('CREATE TRIGGER creation_delete')));
  db.exec('DELETE FROM schema_migrations WHERE version>=17; PRAGMA user_version=16');
}
