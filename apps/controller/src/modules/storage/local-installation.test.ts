import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openStorage } from './index.js';
import { applyMigrations, loadMigrations } from './migrations.js';
import { saveTimeDefaults, settingsETag } from './operations.js';
import { readSettings } from './settings.js';
import { seedLegacySettings } from '../../../../../tests/fixtures/legacy-settings.js';

const directories: string[] = [];
const resources: { close(): void }[] = [];
function directory() {
  const path = mkdtempSync(join(tmpdir(), 'factory-local-installation-'));
  directories.push(path);
  return path;
}
afterEach(() => {
  for (const resource of resources.splice(0).reverse()) resource.close();
  for (const path of directories.splice(0)) rmSync(path, { recursive: true });
});

describe('fixed local installation', () => {
  it('removes retired columns without equivalent storage and seeds the real local identity', () => {
    expect(loadMigrations()[18]?.checksum).toBe('d31378c42e9234389d5ec50accc073f42ed0e211003174869fdd84293d93a1bd');
    const path = directory(); const storage = openStorage({ dataDirectory: path }); resources.push(storage);
    const db = new Database(join(path, 'factory.sqlite')); resources.push(db);
    const columns = db.prepare<[], { name: string }>('PRAGMA table_info(factory_settings)').all().map(c => c.name);
    expect(columns).not.toContain('data_root'); expect(columns).not.toContain('maestri_settings_json');
    expect(columns.filter(name => /data|workspace|maestri/.test(name))).toEqual([]);
    expect(storage.getSettings()).not.toHaveProperty('dataRoot');
    expect(storage.getSettings()).not.toHaveProperty('maestriSettings');
    expect(storage.getSettings().designated_host).toBe(hostname());
    ;
  });

  it('upgrades disposable v19 in place preserving identity, setup facts, historical ledger and receipts', () => {
    const path = directory(); const filename = join(path, 'factory.sqlite'); const db = new Database(filename);
    db.pragma('foreign_keys=ON');
    applyMigrations(db, loadMigrations().slice(0, 19), () => seedLegacySettings(db, 'ignored-legacy-path'));
    db.prepare(`UPDATE factory_settings SET projects_root='fixture-projects',projects_root_confirmed_at_ms=1,
      onboarding_completed_at_ms=2,maestri_settings_json='{"formatVersion":1,"workspaceId":"legacy-only"}'`).run();
    const before = readSettings(db);
    const ledger = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
    const operation = saveTimeDefaults(db, { operationId: randomUUID(), expectedRevision: settingsETag(before.installation_id, before.revision), timeDefaults: before.time_defaults });
    db.close();
    const storage = openStorage({ dataDirectory: path }); resources.push(storage);
    expect(storage.getSettings().installation_id).toBe(before.installation_id);
    expect(storage.getOperation(operation.operation_id)).toEqual(operation);
    const probe = new Database(filename); resources.push(probe);
    expect(probe.prepare('SELECT * FROM schema_migrations WHERE version<=19 ORDER BY version').all()).toEqual(ledger);
    expect(probe.prepare('SELECT projects_root,projects_root_confirmed_at_ms,onboarding_completed_at_ms FROM factory_settings').get())
      .toEqual({ projects_root: 'fixture-projects', projects_root_confirmed_at_ms: 1, onboarding_completed_at_ms: 2 });
    expect(probe.pragma('foreign_key_check')).toEqual([]);
    storage.captureLocalHost();
    const captured = storage.getSettings();
    expect(captured.designated_host).toBe(hostname());
    storage.captureLocalHost(); expect(storage.getSettings()).toEqual(captured);
    expect(storage.getSettings().account_id).toBeNull(); expect(storage.getSettings().automation_enabled).toBe(false);
  });

  it('rejects incompatible historical settings without changing the existing file', () => {
    const path = directory(); const filename = join(path, 'factory.sqlite'); const db = new Database(filename);
    applyMigrations(db, loadMigrations().slice(0, 19), () => seedLegacySettings(db, 'legacy-path'));
    db.prepare(`UPDATE factory_settings SET maestri_settings_json='{"formatVersion":99}'`).run(); db.close();
    const bytes = readFileSync(filename);
    expect(() => openStorage({ dataDirectory: path })).toThrowError(expect.objectContaining({ code: 'SETTINGS_INVALID' }));
    expect(readFileSync(filename)).toEqual(bytes);
  });

  it('rolls back the complete removal delta when a historical dependency prevents the second drop', () => {
    const path = directory(); const db = new Database(join(path, 'factory.sqlite')); resources.push(db);
    applyMigrations(db, loadMigrations().slice(0, 19), () => seedLegacySettings(db, 'legacy-path'));
    db.exec(`CREATE TRIGGER fixture_dependency BEFORE UPDATE ON factory_settings
      BEGIN SELECT NEW.maestri_settings_json; END;`);
    expect(() => applyMigrations(db, loadMigrations(), () => { throw new Error('Must not reseed'); }))
      .toThrowError(expect.objectContaining({ code: 'MIGRATION_FAILED' }));
    expect(db.pragma('user_version', { simple: true })).toBe(19);
    expect(db.prepare('SELECT count(*) AS n FROM schema_migrations').get()).toEqual({ n: 19 });
    expect(db.prepare('SELECT data_root,maestri_settings_json FROM factory_settings').get())
      .toEqual({ data_root: 'legacy-path', maestri_settings_json: '{"formatVersion":1}' });
  });
});
