import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { StorageError } from './errors.js';

export const applicationId = 0x4e465331;

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
}

export function loadMigrations(): readonly Migration[] {
  const directory = new URL('./migrations/', import.meta.url);
    const files = ['001_initial_settings.sql', '002_operations_events.sql', '003_projects_configuration.sql', '004_preparations.sql', '005_attempts.sql', '006_deliveries.sql', '007_verification.sql', '008_reviews.sql', '009_questions_limits.sql', '010_recovery.sql', '011_publication_queries.sql', '012_queue_cycles.sql', '013_scaffold.sql', '014_local_publication.sql', '015_pr_upgrades.sql', '016_queue_scheduler.sql'];
  try {
    const actual = readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();
    if (JSON.stringify(files) !== JSON.stringify(actual)) {
      throw new StorageError('MIGRATION_RESOURCES_INVALID');
    }
    return files.map((name, index) => {
      const sql = readFileSync(new URL(name, directory), 'utf8');
      return { version: index + 1, name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    });
  } catch (error) {
    throw new StorageError('MIGRATION_RESOURCES_INVALID', { cause: error });
  }
}

/** Read-only compatibility check; also repeated under the write lock before migration. */
export function inspectHistory(db: Database.Database, migrations: readonly Migration[]): number {
  if (db.pragma('quick_check', { simple: true }) !== 'ok') {
    throw new StorageError('STORAGE_INTEGRITY_FAILED');
  }
  const version: unknown = db.pragma('user_version', { simple: true });
  const identity: unknown = db.pragma('application_id', { simple: true });
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
    throw new StorageError('MIGRATION_HISTORY_INVALID');
  }
  if (version > migrations.length) throw new StorageError('DATABASE_NEWER_THAN_APPLICATION');

  const objects = db.prepare<[], { name: string }>(
    "SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all();
  if (!objects.some((object) => object.name === 'schema_migrations')) {
    if (version !== 0 || identity !== 0 || objects.length !== 0) throw new StorageError('DATABASE_UNKNOWN');
    return 0;
  }
  if (identity !== applicationId) throw new StorageError('DATABASE_UNKNOWN');
  const rows = db.prepare<[], { version: number; name: string; checksum: string }>(
    'SELECT version, name, checksum FROM schema_migrations ORDER BY version',
  ).all();
  if (rows.length > migrations.length || rows.some((row) => row.version > migrations.length)) {
    throw new StorageError('DATABASE_NEWER_THAN_APPLICATION');
  }
  if (version !== rows.length || rows.length === 0) throw new StorageError('MIGRATION_HISTORY_INVALID');
  rows.forEach((row, index) => {
    const expected = migrations[index];
    if (!expected || row.version !== expected.version || row.name !== expected.name) {
      throw new StorageError('MIGRATION_HISTORY_INVALID');
    }
    if (row.checksum !== expected.checksum) throw new StorageError('MIGRATION_CHECKSUM_MISMATCH');
  });
  return rows.length;
}

export function applyMigrations(
  db: Database.Database,
  migrations: readonly Migration[],
  initializeSettings: () => void,
): void {
  try {
    db.transaction(() => {
      const applied = inspectHistory(db, migrations);
      if (applied === 0) {
        db.exec(`CREATE TABLE schema_migrations (
          version INTEGER PRIMARY KEY CHECK(version >= 1),
          name TEXT NOT NULL UNIQUE,
          checksum TEXT NOT NULL CHECK(length(checksum) = 64),
          applied_at_ms INTEGER NOT NULL CHECK(applied_at_ms >= 0)
        ) STRICT`);
      }
      const insert = db.prepare<[number, string, string, number]>(
        'INSERT INTO schema_migrations(version, name, checksum, applied_at_ms) VALUES (?, ?, ?, ?)',
      );
      for (const migration of migrations.slice(applied)) {
        db.exec(migration.sql);
        insert.run(migration.version, migration.name, migration.checksum, Date.now());
        db.pragma(`user_version = ${migration.version}`);
      }
      db.pragma(`application_id = ${applicationId}`);
      if (applied === 0) initializeSettings();
    }).immediate();
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError('MIGRATION_FAILED', { cause: error });
  }
}
