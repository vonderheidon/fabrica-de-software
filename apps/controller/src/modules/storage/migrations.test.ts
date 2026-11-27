import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { applyHistoricalSchemaFixture, loadMigrations } from '../../../../../tests/fixtures/historical-schema.js';
import { openStorage } from './index.js';
import { applicationId, upgradeRecognizedSchema } from './migrations.js';
import { seedSettings } from './settings.js';

const directories: string[] = [];
function directory(): string {
  const value = mkdtempSync(join(tmpdir(), 'factory-storage-upgrade-'));
  directories.push(value);
  mkdirSync(join(value, 'var', 'factory'), { recursive: true });
  return value;
}
function seedDirect(db: Database.Database, version: 58 | 59): void {
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(resolve(`resources/storage/initial-schema.v${version}.sql`), 'utf8'));
  db.pragma(`application_id = ${applicationId}`);
  db.pragma(`user_version = ${version}`);
  seedSettings(db);
}
const importObjects = (db: Database.Database) => db.prepare<[], { type: string; name: string; sql: string | null }>(
  "SELECT type,name,sql FROM sqlite_schema WHERE tbl_name='project_imports' ORDER BY type,name").all();
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('schema 60 project imports', () => {
  it('upgrades a direct schema 59 fixture to the same project_imports objects as a fresh install, without replacing settings', () => {
    const upgraded = new Database(':memory:'); const fresh = new Database(':memory:');
    try {
      seedDirect(upgraded, 59);
      const settingsBefore = upgraded.prepare('SELECT * FROM factory_settings').all();
      expect(importObjects(upgraded)).toEqual([]);
      expect(upgradeRecognizedSchema(upgraded)).toEqual({ kind: 'direct', schemaVersion: 60 });
      expect(upgraded.pragma('user_version', { simple: true })).toBe(60);
      fresh.exec(readFileSync(resolve('resources/storage/initial-schema.v60.sql'), 'utf8'));
      expect(importObjects(upgraded).map(object => object.name).sort()).toEqual([
        'project_import_delete_authorized', 'project_import_identity', 'project_imports', 'project_imports_active_destination',
        'project_imports_project', 'sqlite_autoindex_project_imports_1', 'sqlite_autoindex_project_imports_2',
      ]);
      expect(importObjects(upgraded)).toEqual(importObjects(fresh));
      expect(upgraded.prepare('SELECT * FROM factory_settings').all()).toEqual(settingsBefore);
      expect(upgraded.prepare('SELECT * FROM schema_migrations').all()).toEqual([]);
      expect(upgraded.pragma('foreign_key_check')).toEqual([]);
    } finally { upgraded.close(); fresh.close(); }
  });

  it('advances the schema 58 ledger through migration 059 without losing earlier entries', () => {
    const legacy = new Database(':memory:');
    legacy.pragma('foreign_keys = ON');
    applyHistoricalSchemaFixture(legacy, loadMigrations().slice(0, 58), () => seedSettings(legacy));
    const before = legacy.prepare('SELECT version,name,checksum,applied_at_ms FROM schema_migrations ORDER BY version').all();
    try {
      expect(upgradeRecognizedSchema(legacy)).toEqual({ kind: 'historical-ledger', schemaVersion: 59 });
      expect(legacy.pragma('user_version', { simple: true })).toBe(59);
      const ledger = legacy.prepare('SELECT version,name,checksum,applied_at_ms FROM schema_migrations ORDER BY version').all();
      expect(ledger).toHaveLength(59);
      expect(ledger.slice(0, 58)).toEqual(before);
      expect(ledger[58]).toMatchObject({ version: 59, name: '059_project_imports.sql' });
      expect(legacy.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { legacy.close(); }
  });

  it('refuses schema 58 without modifying its database file', () => {
    const install = directory(); const dataDirectory = join(install, 'var', 'factory');
    const filename = join(dataDirectory, 'factory.sqlite'); const legacy = new Database(filename);
    seedDirect(legacy, 58); legacy.close();
    const before = readFileSync(filename);
    expect(() => openStorage({ dataDirectory })).toThrowError(expect.objectContaining({ code: 'DATABASE_SCHEMA_INCOMPATIBLE' }));
    expect(readFileSync(filename)).toEqual(before);
  });

  it('keeps identity and terminal states of an import immutable, allowing only the failed cleanup update', () => {
    const db = new Database(':memory:');
    try {
      db.pragma('foreign_keys = OFF');
      db.exec(readFileSync(resolve('resources/storage/initial-schema.v60.sql'), 'utf8'));
      const insert = db.prepare(`INSERT INTO project_imports(id,operation_id,installation_id,name,repository_url,projects_root,destination,step,state,created_at_ms,updated_at_ms)
        VALUES (?,?,'installation','name','https://github.com/o/r','C:/root',?,'repository','accepted',1,1)`);
      insert.run('a', 'op-a', 'C:/root/r');
      expect(() => insert.run('b', 'op-b', 'c:/ROOT/R')).toThrow(/UNIQUE/u);
      expect(() => db.prepare("UPDATE project_imports SET name='x',revision=2 WHERE id='a'").run()).toThrow('IMMUTABLE_PROJECT_IMPORT');
      expect(() => db.prepare("UPDATE project_imports SET step='clone' WHERE id='a'").run()).toThrow('IMMUTABLE_PROJECT_IMPORT');
      db.prepare("UPDATE project_imports SET step='clone',state='running',created_directory_identity='1:2:3',revision=2 WHERE id='a'").run();
      expect(() => db.prepare("UPDATE project_imports SET created_directory_identity='9',revision=3 WHERE id='a'").run()).toThrow('IMMUTABLE_PROJECT_IMPORT');
      db.prepare("UPDATE project_imports SET state='failed',diagnostic='IMPORT_CLONE_FAILED',cleanup='failed',revision=3 WHERE id='a'").run();
      expect(() => db.prepare("UPDATE project_imports SET diagnostic='OTHER',revision=4 WHERE id='a'").run()).toThrow('IMMUTABLE_PROJECT_IMPORT');
      db.prepare("UPDATE project_imports SET cleanup='removed',revision=4 WHERE id='a'").run();
      expect(() => db.prepare("UPDATE project_imports SET cleanup='failed',revision=5 WHERE id='a'").run()).toThrow('IMMUTABLE_PROJECT_IMPORT');
      insert.run('c', 'op-c', 'C:/root/r');
      expect(() => db.prepare("UPDATE project_imports SET state='failed',revision=2 WHERE id='c'").run()).toThrow(/CHECK/u);
    } finally { db.close(); }
  });
});
