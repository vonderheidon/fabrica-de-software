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
function seedDirect(db: Database.Database, version: 57 | 58): void {
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(resolve(`resources/storage/initial-schema.v${version}.sql`), 'utf8'));
  db.pragma(`application_id = ${applicationId}`);
  db.pragma(`user_version = ${version}`);
  seedSettings(db);
}
function triggerSql(db: Database.Database): string | undefined {
  return db.prepare<[], { sql: string }>("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='effect_transition'").get()?.sql;
}
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('schema 59 Status readback resolution', () => {
  it('upgrades a direct schema 58 fixture to the same effect transition rule as a fresh install, without replacing settings', () => {
    const upgraded = new Database(':memory:'); const fresh = new Database(':memory:');
    try {
      seedDirect(upgraded, 58);
      const settingsBefore = upgraded.prepare('SELECT * FROM factory_settings').all();
      expect(triggerSql(upgraded)).not.toContain('STATUS_NOT_OBSERVED');
      expect(upgradeRecognizedSchema(upgraded)).toEqual({ kind: 'direct', schemaVersion: 59 });
      expect(upgraded.pragma('user_version', { simple: true })).toBe(59);
      expect(upgraded.prepare<[], { sql: string }>("SELECT sql FROM sqlite_schema WHERE type='table' AND name='effects'").get()?.sql.match(/'issue_body'/g)).toHaveLength(2);
      fresh.exec(readFileSync(resolve('resources/storage/initial-schema.v59.sql'), 'utf8'));
      expect(triggerSql(upgraded)).toContain("OLD.kind='project_status' AND NEW.reason='STATUS_NOT_OBSERVED'");
      expect(triggerSql(upgraded)).toBe(triggerSql(fresh));
      expect(upgraded.prepare('SELECT * FROM factory_settings').all()).toEqual(settingsBefore);
      expect(upgraded.prepare('SELECT * FROM schema_migrations').all()).toEqual([]);
      expect(upgraded.pragma('foreign_key_check')).toEqual([]);
    } finally { upgraded.close(); fresh.close(); }
  });

  it('advances the schema 57 ledger through migration 058 without losing earlier entries', () => {
    const legacy = new Database(':memory:');
    legacy.pragma('foreign_keys = ON');
    applyHistoricalSchemaFixture(legacy, loadMigrations().slice(0, 57), () => seedSettings(legacy));
    const before = legacy.prepare('SELECT version,name,checksum,applied_at_ms FROM schema_migrations ORDER BY version').all();
    try {
      expect(upgradeRecognizedSchema(legacy)).toEqual({ kind: 'historical-ledger', schemaVersion: 58 });
      expect(legacy.pragma('user_version', { simple: true })).toBe(58);
      const ledger = legacy.prepare('SELECT version,name,checksum,applied_at_ms FROM schema_migrations ORDER BY version').all();
      expect(ledger).toHaveLength(58);
      expect(ledger.slice(0, 57)).toEqual(before);
      expect(ledger[57]).toMatchObject({ version: 58, name: '058_status_readback_resolution.sql' });
      expect(legacy.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { legacy.close(); }
  });

  it('refuses schema 57 without modifying its database file', () => {
    const install = directory(); const dataDirectory = join(install, 'var', 'factory');
    const filename = join(dataDirectory, 'factory.sqlite'); const legacy = new Database(filename);
    seedDirect(legacy, 57); legacy.close();
    const before = readFileSync(filename);
    expect(() => openStorage({ dataDirectory })).toThrowError(expect.objectContaining({ code: 'DATABASE_SCHEMA_INCOMPATIBLE' }));
    expect(readFileSync(filename)).toEqual(before);
  });

  it('lets only an unchanged Status readback or an absent commit turn an unknown effect into failed_known', () => {
    const db = new Database(':memory:');
    try {
      db.exec('CREATE TABLE effects(operation_id TEXT PRIMARY KEY, kind TEXT NOT NULL, state TEXT NOT NULL, reason TEXT)');
      db.exec(/CREATE TRIGGER effect_transition[\s\S]*?END;/u.exec(readFileSync(resolve('resources/storage/initial-schema.v59.sql'), 'utf8'))![0]);
      const insert = db.prepare("INSERT INTO effects(operation_id,kind,state) VALUES (?,?,'unknown')");
      const fail = db.prepare("UPDATE effects SET state='failed_known',reason=? WHERE operation_id=?");
      for (const [id, kind] of [['status', 'project_status'], ['status-other', 'project_status'], ['comment', 'issue_comment'], ['commit', 'local_commit']]) insert.run(id, kind);
      expect(() => fail.run('STATUS_NOT_OBSERVED', 'status')).not.toThrow();
      expect(() => fail.run('QUERY_FAILED', 'status-other')).toThrow('EFFECT_TRANSITION_INVALID');
      expect(() => fail.run('STATUS_NOT_OBSERVED', 'comment')).toThrow('EFFECT_TRANSITION_INVALID');
      expect(() => fail.run('COMMIT_NOT_OBSERVED', 'commit')).not.toThrow();
    } finally { db.close(); }
  });
});
