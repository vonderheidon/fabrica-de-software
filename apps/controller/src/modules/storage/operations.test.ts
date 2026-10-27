import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { createProjectDeletionPersistence } from './project-deletions.js';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireControllerLock, openStorage, type Storage } from './index.js';
import { applyMigrations, loadMigrations } from './migrations.js';
import { seedLegacySettings as seedSettings } from '../../../../../tests/fixtures/legacy-settings.js';

const directories: string[] = [];
const resources: { close(): void }[] = [];
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'factory-operation-'));
  directories.push(directory);
  const storage = openStorage({ dataDirectory: directory, busyTimeoutMs: 25 });
  resources.push(storage);
  return { directory, storage };
}
function save(storage: Storage, operationId = randomUUID()) {
  return storage.saveTimeDefaults({ operationId, expectedRevision: storage.getSettingsETag(), timeDefaults: storage.getSettings().time_defaults });
}
afterEach(() => {
  for (const resource of resources.splice(0)) resource.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});
describe('operations and local ownership', () => {
  it('preserves receipts and sequence after restart without storing command bodies', () => {
    const { directory, storage } = fixture();
    const accepted = save(storage);
    storage.close();
    const next = openStorage({ dataDirectory: directory });
    resources.push(next);
    expect(next.getOperation(accepted.operation_id)).toEqual(accepted);
    expect(save(next).receipt?.event_cursor).toBe('2');
    const db = new Database(join(directory, 'factory.sqlite'));
    createProjectDeletionPersistence(db);
    try {
      const row = db.prepare('SELECT * FROM operation_requests WHERE operation_id = ?').get(accepted.operation_id);
      expect(Object.keys(row as object).sort()).toEqual(['operation_id', 'installation_id', 'account_id', 'operation_kind', 'resource_type', 'resource_id', 'request_hash', 'expected_revision_json', 'receipt_json', 'result_account_id'].sort());
      expect(JSON.stringify(row)).not.toMatch(/pollingIntervalMs|passageActiveTimeMs|csrf|cookie|authorization/i);
      expect(() => db.exec("UPDATE operation_requests SET request_hash = 'changed'")).toThrow('IMMUTABLE_RECORD');
      expect(() => db.exec('DELETE FROM operation_requests')).toThrow('IMMUTABLE_RECORD');
      expect(() => db.exec("UPDATE events SET facts_json = '{}'")).toThrow('IMMUTABLE_RECORD');
      expect(() => db.exec('DELETE FROM events')).toThrow('IMMUTABLE_RECORD');
    } finally { db.close(); }
  });
  it('rolls back on operation index failure and a finite busy wait, leaving no success receipt', () => {
    const { directory, storage } = fixture();
    const before = storage.getSettings();
    const db = new Database(join(directory, 'factory.sqlite'));
    try {
      db.exec("CREATE TRIGGER fail_index BEFORE INSERT ON operation_requests BEGIN SELECT RAISE(ABORT, 'index unavailable'); END");
      expect(() => save(storage)).toThrowError(expect.objectContaining({ code: 'OPERATION_WRITE_FAILED' }));
      expect(storage.getSettings()).toEqual(before);
      db.exec('DROP TRIGGER fail_index');
      db.exec('BEGIN IMMEDIATE');
      expect(() => save(storage)).toThrowError(expect.objectContaining({ code: 'OPERATION_WRITE_FAILED' }));
      db.exec('ROLLBACK');
      expect(storage.getSettings()).toEqual(before);
      expect(storage.getEvents({}).items).toEqual([]);
      expect(db.prepare('SELECT * FROM operation_requests').all()).toEqual([]);
    } finally { db.close(); }
  });
  it('migrates a real version-one database while preserving its identity and settings', () => {
    const { directory, storage } = fixture();
    storage.close();
    const oldDirectory = join(directory, 'version-one');
    // Only this fixture is created through the historical first migration and its real seed.
    const { close: release } = acquireControllerLock(oldDirectory);
    release();
    const db = new Database(join(oldDirectory, 'factory.sqlite'));
    const first = loadMigrations()[0]!;
    try { applyMigrations(db, [first], () => seedSettings(db, oldDirectory)); } finally { db.close(); }
    const snapshot = new Database(join(oldDirectory, 'factory.sqlite'), { readonly: true });
    let identity: unknown;
    try { identity = snapshot.prepare('SELECT installation_id FROM factory_settings').get(); } finally { snapshot.close(); }
    const upgraded = openStorage({ dataDirectory: oldDirectory });
    resources.push(upgraded);
    ;
    expect({ installation_id: upgraded.getSettings().installation_id }).toEqual(identity);
    expect(upgraded.getSettings().revision).toBe(1);
    expect(save(upgraded).state).toBe('succeeded');
  });
  it('excludes another controller independently of port and releases ownership on close', () => {
    const { directory } = fixture();
    const first = acquireControllerLock(directory);
    resources.push(first);
    expect(() => acquireControllerLock(directory)).toThrowError(expect.objectContaining({ code: 'CONTROLLER_LOCK_UNAVAILABLE' }));
    first.close();
    first.close();
    const next = acquireControllerLock(directory);
    resources.push(next);
    expect(() => acquireControllerLock(directory)).toThrow();
  });
});
