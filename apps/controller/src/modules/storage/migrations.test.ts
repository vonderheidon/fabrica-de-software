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
function seedDirect55(db: Database.Database): void {
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(resolve('resources/storage/initial-schema.v55.sql'), 'utf8'));
  db.pragma(`application_id = ${applicationId}`);
  db.pragma('user_version = 55');
  seedSettings(db);
}
function seedDirect57(db: Database.Database): void {
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(resolve('resources/storage/initial-schema.v57.sql'), 'utf8'));
  db.pragma(`application_id = ${applicationId}`);
  db.pragma('user_version = 57');
  seedSettings(db);
}
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});
const effectObjects = (db: Database.Database) => db.prepare<[], { type: string; name: string }>(
  "SELECT type,name FROM sqlite_schema WHERE tbl_name='effects' ORDER BY type,name").all();

describe('schema 58 issue body effect', () => {
  it('accepts the issue body effect on a direct schema 57 fixture, keeping settings and every effect index and trigger', () => {
    const upgraded = new Database(':memory:');
    try {
      seedDirect57(upgraded);
      const settingsBefore = upgraded.prepare('SELECT * FROM factory_settings').all();
      const objectsBefore = effectObjects(upgraded);
      expect(upgradeRecognizedSchema(upgraded)).toEqual({ kind: 'direct', schemaVersion: 58 });
      expect(upgraded.pragma('user_version', { simple: true })).toBe(58);
      expect(upgraded.prepare<[], { sql: string }>("SELECT sql FROM sqlite_schema WHERE type='table' AND name='effects'").get()?.sql.match(/'issue_body'/g)).toHaveLength(2);
      expect(effectObjects(upgraded)).toEqual(objectsBefore);
      expect(upgraded.prepare('SELECT * FROM factory_settings').all()).toEqual(settingsBefore);
      expect(upgraded.prepare('SELECT * FROM schema_migrations').all()).toEqual([]);
      expect(upgraded.pragma('foreign_key_check')).toEqual([]);
    } finally { upgraded.close(); }
  });

  it('advances the schema 56 ledger through migration 057 without losing earlier entries', () => {
    const legacy = new Database(':memory:');
    legacy.pragma('foreign_keys = ON');
    applyHistoricalSchemaFixture(legacy, loadMigrations().slice(0, 56), () => seedSettings(legacy));
    const before = legacy.prepare('SELECT version,name,checksum,applied_at_ms FROM schema_migrations ORDER BY version').all();
    try {
      expect(upgradeRecognizedSchema(legacy)).toEqual({ kind: 'historical-ledger', schemaVersion: 57 });
      expect(legacy.pragma('user_version', { simple: true })).toBe(57);
      const ledger = legacy.prepare('SELECT version,name,checksum,applied_at_ms FROM schema_migrations ORDER BY version').all();
      expect(ledger).toHaveLength(57);
      expect(ledger.slice(0, 56)).toEqual(before);
      expect(ledger[56]).toMatchObject({ version: 57, name: '057_issue_body_effect.sql' });
      expect(legacy.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { legacy.close(); }
  });

  it('refuses schema 55 without modifying its database file', () => {
    const install = directory(); const dataDirectory = join(install, 'var', 'factory');
    const filename = join(dataDirectory, 'factory.sqlite'); const legacy = new Database(filename);
    seedDirect55(legacy); legacy.close();
    const before = readFileSync(filename);
    expect(() => openStorage({ dataDirectory })).toThrowError(expect.objectContaining({ code: 'DATABASE_SCHEMA_INCOMPATIBLE' }));
    expect(readFileSync(filename)).toEqual(before);
  });
});
