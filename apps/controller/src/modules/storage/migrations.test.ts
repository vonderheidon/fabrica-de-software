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
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('schema 56 issue history repository reference', () => {
  it('adds the new reference field to a direct schema 55 fixture without replacing settings', () => {
    const upgraded = new Database(':memory:');
    try {
      seedDirect55(upgraded);
      const settingsBefore = upgraded.prepare('SELECT * FROM factory_settings').all();
      expect(upgradeRecognizedSchema(upgraded)).toEqual({ kind: 'direct', schemaVersion: 56 });
      expect(upgraded.pragma('user_version', { simple: true })).toBe(56);
      expect(upgraded.prepare<[], { name: string }>("PRAGMA table_info('deliveries')").all().map(row => row.name))
        .toContain('history_repository_relative');
      expect(upgraded.prepare('SELECT * FROM factory_settings').all()).toEqual(settingsBefore);
      expect(upgraded.prepare('SELECT * FROM schema_migrations').all()).toEqual([]);
      expect(upgraded.pragma('foreign_key_check')).toEqual([]);
    } finally { upgraded.close(); }
  });

  it('advances the existing migration ledger without losing its earlier entries', () => {
    const legacy = new Database(':memory:');
    legacy.pragma('foreign_keys = ON');
    applyHistoricalSchemaFixture(legacy, loadMigrations().slice(0, 54), () => seedSettings(legacy));
    const before = legacy.prepare('SELECT version,name,checksum,applied_at_ms FROM schema_migrations ORDER BY version').all();
    try {
      expect(upgradeRecognizedSchema(legacy)).toEqual({ kind: 'historical-ledger', schemaVersion: 55 });
      expect(legacy.pragma('user_version', { simple: true })).toBe(55);
      const ledger = legacy.prepare('SELECT version,name,checksum,applied_at_ms FROM schema_migrations ORDER BY version').all();
      expect(ledger).toHaveLength(55);
      expect(ledger.slice(0, 54)).toEqual(before);
      expect(ledger[54]).toMatchObject({ version: 55, name: '055_issue_history_repository_reference.sql' });
      expect(legacy.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { legacy.close(); }
  });

  it('refuses the previous schema at runtime without modifying its database file', () => {
    const install = directory(); const dataDirectory = join(install, 'var', 'factory');
    const filename = join(dataDirectory, 'factory.sqlite'); const legacy = new Database(filename);
    seedDirect55(legacy); legacy.close();
    const before = readFileSync(filename);
    expect(() => openStorage({ dataDirectory })).toThrowError(expect.objectContaining({ code: 'DATABASE_SCHEMA_INCOMPATIBLE' }));
    expect(readFileSync(filename)).toEqual(before);
  });
});
