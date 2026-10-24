import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openStorage, StorageError, type Storage } from './index.js';
import { applicationId, applyMigrations, loadMigrations, type Migration } from './migrations.js';

const directories: string[] = [];
const stores: Storage[] = [];
function directory() {
  const value = mkdtempSync(join(tmpdir(), 'factory-storage-'));
  directories.push(value);
  return value;
}
function open(dataDirectory: string, busyTimeoutMs = 5000) {
  const store = openStorage({ dataDirectory, busyTimeoutMs });
  stores.push(store);
  return store;
}
function inspect(dataDirectory: string, action: (db: Database.Database) => void) {
  const db = new Database(join(dataDirectory, 'factory.sqlite'));
  try { action(db); } finally { db.close(); }
}
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const path of directories.splice(0)) rmSync(path, { recursive: true });
});

describe('initial storage', () => {
  it('checks effective pragmas and persists only the installation and normative defaults', () => {
    const path = directory();
    const store = open(path, 250);
      expect(store.getDiagnostics()).toEqual({ foreignKeys: 1, journalMode: 'wal', synchronous: 2, busyTimeoutMs: 250, schemaVersion: 42 });
    const settings = store.getSettings();
    expect(settings).toMatchObject({
      id: 'local', account_id: null, designated_host: hostname(), projects_root: null,
      automation_enabled: false, revision: 1,
      time_defaults: { format_version: 1, polling_interval_ms: 15_000, passage_active_time_ms: 1_800_000, question_ttl: { state: 'not_configured' } },
      artifact_policy: { format_version: 1, automatic_deletion: false },
    });
    expect(settings.installation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(settings.created_at_ms).toBe(settings.updated_at_ms);
    inspect(path, (db) => {
      const tables = db.prepare("SELECT name, strict FROM pragma_table_list WHERE schema = 'main' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
      expect(tables).toEqual(['accounts', 'artifacts', 'attempt_authority', 'attempt_blocks', 'attempt_criteria', 'attempt_decisions', 'attempt_sessions', 'attempts', 'cancellation_requests', 'capture_runs', 'capture_warnings', 'checks', 'controller_authority', 'creation_board_operations', 'creation_reconciliations', 'creation_steps', 'criterion_results', 'deliveries', 'delivery_targets', 'diagnostic_runs', 'effects', 'events', 'execution_profiles', 'execution_questions', 'factory_settings', 'finding_assessments', 'finding_disputes', 'finding_resolutions', 'findings', 'managed_terminals', 'native_open_requests', 'operation_requests', 'passage_events', 'passage_measurements', 'passage_results', 'passages', 'preparation_revisions', 'preparations', 'project_creations', 'project_deletion_receipts', 'project_deletion_targets', 'project_deletions', 'project_revisions', 'project_storage_locations', 'project_storage_transitions', 'projects', 'publication_requests', 'publication_target_selections', 'publication_upgrades', 'queue_consumptions', 'queue_cycles', 'resource_removals', 'resources', 'reviews', 'rounds', 'schema_migrations', 'terminal_occupancies', 'verification_runs'].map((name) => ({ name, strict: 1 })));
      expect(db.prepare('SELECT * FROM accounts').all()).toEqual([]);
      expect(db.pragma('application_id', { simple: true })).toBe(applicationId);
      expect(db.prepare('SELECT version, name, checksum FROM schema_migrations').all()).toEqual(loadMigrations().map(({ version, name, checksum }) => ({ version, name, checksum })));
    });
    store.close();
    expect(open(path).getSettings()).toEqual(settings);
  });

  it('enforces singleton, STRICT columns, JSON, booleans and foreign keys in SQLite', () => {
    const path = directory();
    open(path);
    inspect(path, (db) => {
      db.pragma('foreign_keys = ON');
      expect(() => db.prepare("UPDATE factory_settings SET id = 'other'").run()).toThrow();
      expect(() => db.prepare("UPDATE factory_settings SET revision = 'invalid'").run()).toThrow();
      expect(() => db.prepare('UPDATE factory_settings SET automation_enabled = 2').run()).toThrow();
      expect(() => db.prepare('UPDATE factory_settings SET automation_enabled = 1').run()).toThrow();
      expect(() => db.prepare("UPDATE factory_settings SET time_defaults_json = 'invalid'").run()).toThrow();
      expect(() => db.prepare("UPDATE factory_settings SET account_id = 'unknown'").run()).toThrow();
      expect(() => db.prepare('INSERT INTO factory_settings SELECT * FROM factory_settings').run()).toThrow();
    });
  });

  it('preserves configured values and installation identity across restarts', () => {
    const path = directory();
    const store = open(path);
    const identity = store.getSettings().installation_id;
    store.close();
    inspect(path, (db) => {
      db.prepare("UPDATE factory_settings SET designated_host = 'fixture-host', revision = 2").run();
    });
    expect(open(path).getSettings()).toMatchObject({ installation_id: identity, designated_host: 'fixture-host', revision: 2, automation_enabled: false });
  });

  it.each([0, -1, 60_001, Infinity, 1.5])('rejects invalid timeout %s before opening a database', (timeout) => {
    expect(() => open(directory(), timeout)).toThrowError(expect.objectContaining({ code: 'STORAGE_CONFIGURATION_INVALID' }));
  });

  it('fails after a finite timeout under a write lock and preserves installation data', () => {
    const path = directory();
    const original = open(path).getSettings();
    inspect(path, (db) => {
      db.exec('BEGIN IMMEDIATE');
      try {
        expect(() => open(path, 25)).toThrow(StorageError);
      } finally { db.exec('ROLLBACK'); }
    });
    expect(open(path).getSettings()).toEqual(original);
  });

  it.each(['missing', 'invalid'])('does not silently reseed %s settings', (kind) => {
    const path = directory();
    open(path).close();
    inspect(path, (db) => db.exec(kind === 'missing' ? 'DELETE FROM factory_settings' : `UPDATE factory_settings SET time_defaults_json = '{"formatVersion":999}'`));
    expect(() => open(path)).toThrowError(expect.objectContaining({ code: 'SETTINGS_INVALID' }));
  });
});

describe('migration safety', () => {
  it.each([
    ['checksum', "UPDATE schema_migrations SET checksum = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'", 'MIGRATION_CHECKSUM_MISMATCH'],
    ['name', "UPDATE schema_migrations SET name = 'unknown.sql' WHERE version = 1", 'MIGRATION_HISTORY_INVALID'],
    ['gap', 'UPDATE schema_migrations SET version = 999 WHERE version = 2', 'DATABASE_NEWER_THAN_APPLICATION'],
    ['newer pragma', 'PRAGMA user_version = 999', 'DATABASE_NEWER_THAN_APPLICATION'],
    ['missing ledger row', 'DELETE FROM schema_migrations', 'MIGRATION_HISTORY_INVALID'],
    ['mismatched pragma', 'PRAGMA user_version = 0', 'MIGRATION_HISTORY_INVALID'],
    ['foreign identity', 'PRAGMA application_id = 1', 'DATABASE_UNKNOWN'],
  ])('refuses %s without changing the existing bytes', (_name, sql, code) => {
    const path = directory();
    open(path).close();
    inspect(path, (db) => {
      db.prepare("INSERT INTO accounts VALUES ('fixture-id', 'fixture-login', 1, 1, 1, 1)").run();
      db.exec(sql);
    });
    const filename = join(path, 'factory.sqlite');
    const before = readFileSync(filename);
    expect(() => open(path)).toThrowError(expect.objectContaining({ code }));
    expect(readFileSync(filename)).toEqual(before);
    inspect(path, (db) => expect(db.prepare('SELECT login FROM accounts').get()).toEqual({ login: 'fixture-login' }));
  });

  it('refuses an unknown database without replacing it', () => {
    const path = directory();
    inspect(path, (db) => db.exec("CREATE TABLE legacy_data(value TEXT); INSERT INTO legacy_data VALUES ('preserve me')"));
    const filename = join(path, 'factory.sqlite');
    const before = readFileSync(filename);
    expect(() => open(path)).toThrowError(expect.objectContaining({ code: 'DATABASE_UNKNOWN' }));
    expect(readFileSync(filename)).toEqual(before);
  });

  it('refuses a corrupt file without replacing it', () => {
    const path = directory();
    const filename = join(path, 'factory.sqlite');
    const bytes = Buffer.from('not a SQLite database: preserve this evidence');
    writeFileSync(filename, bytes);
    expect(() => open(path)).toThrow(StorageError);
    expect(readFileSync(filename)).toEqual(bytes);
  });

  function migration(version: number, sql: string): Migration {
    return { version, name: `${version}.sql`, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }

  it('applies known migrations in order and never reapplies committed migrations', () => {
    const db = new Database(':memory:');
    try {
      const migrations = [migration(1, 'CREATE TABLE fixture (value TEXT) STRICT'), migration(2, "INSERT INTO fixture VALUES ('second')")];
      let seeds = 0;
      applyMigrations(db, migrations, () => { seeds += 1; });
      applyMigrations(db, migrations, () => { seeds += 1; });
      expect(seeds).toBe(1);
      expect(db.prepare('SELECT * FROM fixture').all()).toEqual([{ value: 'second' }]);
      expect(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([{ version: 1 }, { version: 2 }]);
      expect(db.pragma('user_version', { simple: true })).toBe(2);
    } finally { db.close(); }
  });

  it('rolls back schema, ledger and seed together on migration failure', () => {
    const db = new Database(':memory:');
    try {
      const migrations = [migration(1, 'CREATE TABLE fixture (value TEXT) STRICT'), migration(2, 'INVALID SQL')];
      expect(() => applyMigrations(db, migrations, () => { throw new Error('seed must not run'); })).toThrowError(expect.objectContaining({ code: 'MIGRATION_FAILED' }));
      expect(db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all()).toEqual([]);
      expect(db.pragma('user_version', { simple: true })).toBe(0);
    } finally { db.close(); }
  });

  it('rolls back migrations when initial configuration cannot be persisted', () => {
    const db = new Database(':memory:');
    try {
      expect(() => applyMigrations(db, [migration(1, 'CREATE TABLE fixture (value TEXT) STRICT')], () => { throw new Error('write failed'); })).toThrow(StorageError);
      expect(db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all()).toEqual([]);
    } finally { db.close(); }
  });
});
