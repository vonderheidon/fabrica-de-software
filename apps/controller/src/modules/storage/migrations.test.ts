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
function seedDirect56(db: Database.Database): void {
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(resolve('resources/storage/initial-schema.v56.sql'), 'utf8'));
  db.pragma(`application_id = ${applicationId}`);
  db.pragma('user_version = 56');
  seedSettings(db);
}
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('schema 57 immediate controller shutdown', () => {
  it('removes the persisted shutdown barriers from a direct schema 56 fixture without replacing settings', () => {
    const upgraded = new Database(':memory:');
    try {
      seedDirect56(upgraded);
      const settingsBefore = upgraded.prepare('SELECT * FROM factory_settings').all();
      expect(upgradeRecognizedSchema(upgraded)).toEqual({ kind: 'direct', schemaVersion: 57 });
      expect(upgraded.pragma('user_version', { simple: true })).toBe(57);
      expect(upgraded.prepare<[], { name: string }>("SELECT name FROM sqlite_schema WHERE type='trigger' AND name LIKE 'shutdown_%'").all()).toEqual([]);
      expect(upgraded.prepare<[], { name: string }>("SELECT name FROM sqlite_schema WHERE type='index' AND name='shutdown_control_order'").all()).toEqual([]);
      expect(upgraded.prepare('SELECT * FROM factory_settings').all()).toEqual(settingsBefore);
      expect(upgraded.prepare('SELECT * FROM schema_migrations').all()).toEqual([]);
      expect(upgraded.pragma('foreign_key_check')).toEqual([]);
    } finally { upgraded.close(); }
  });

  it('advances the schema 55 ledger through migration 056 without losing earlier entries', () => {
    const legacy = new Database(':memory:');
    legacy.pragma('foreign_keys = ON');
    applyHistoricalSchemaFixture(legacy, loadMigrations().slice(0, 55), () => seedSettings(legacy));
    const before = legacy.prepare('SELECT version,name,checksum,applied_at_ms FROM schema_migrations ORDER BY version').all();
    try {
      expect(upgradeRecognizedSchema(legacy)).toEqual({ kind: 'historical-ledger', schemaVersion: 56 });
      expect(legacy.pragma('user_version', { simple: true })).toBe(56);
      const ledger = legacy.prepare('SELECT version,name,checksum,applied_at_ms FROM schema_migrations ORDER BY version').all();
      expect(ledger).toHaveLength(56);
      expect(ledger.slice(0, 55)).toEqual(before);
      expect(ledger[55]).toMatchObject({ version: 56, name: '056_immediate_controller_shutdown.sql' });
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
