import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openStorage, type PreparationCommand } from './index.js';
import { applyMigrations, loadMigrations } from './migrations.js';
import { readSettings } from './settings.js';
import { seedLegacySettings as seedSettings } from '../../../../../tests/fixtures/legacy-settings.js';
import { saveTimeDefaults, settingsETag } from './operations.js';

const resources: { close(): unknown }[] = []; const directories: string[] = [];
function directory() { const path = mkdtempSync(join(tmpdir(), 'factory-preparation-storage-')); directories.push(path); return path; }
function fixture() {
  const path = directory(); const storage = openStorage({ dataDirectory: path, busyTimeoutMs: 10 }); resources.push(storage);
  const db = new Database(join(path, 'factory.sqlite')); db.pragma('foreign_keys = ON'); resources.push(db);
  const project = storage.registerProject({ operationId: randomUUID(), expectedRevision: undefined,
    body: { name: 'Storage fixture', source: { kind: 'github', location: 'https://github.com/test/repo' }, base_branch: 'main' },
    source: { kind: 'github', location: 'https://github.com/test/repo', repository_id: 'R_test', repository_url: 'https://github.com/test/repo' }, originNotes: [] });
  const command: PreparationCommand = { kind: 'preparation.create', operationId: randomUUID(), expectedRevision: undefined, projectId: project.resource.id,
    body: { issue_id: 'I_test', delivery_mode: 'icr', guidance: '', overrides: {} } };
  return { storage, db, projectId: project.resource.id, command, configurationETag: storage.getConfiguration(project.resource.id).etag };
}
afterEach(async () => {
  for (const r of resources.splice(0).reverse()) await r.close();
  for (const path of directories.splice(0)) rmSync(path, { recursive: true });
});
describe('preparation storage durability and migration', () => {
  it('upgrades version three without reseeding identity, settings or historical receipts', () => {
    const path = directory(); const old = new Database(join(path, 'factory.sqlite'));
    let operationId: string; let installationId: string;
    try {
      old.pragma('foreign_keys = ON'); applyMigrations(old, loadMigrations().slice(0, 3), () => seedSettings(old, path));
      const settings = readSettings(old); installationId = settings.installation_id; operationId = randomUUID();
      saveTimeDefaults(old, { operationId, expectedRevision: settingsETag(settings.installation_id, settings.revision), timeDefaults: settings.time_defaults });
    } finally { old.close(); }
    const storage = openStorage({ dataDirectory: path }); resources.push(storage);
    expect(storage.getDiagnostics().schemaVersion).toBe(27); expect(storage.getSettings().installation_id).toBe(installationId);
    expect(storage.getOperation(operationId)).toMatchObject({ state: 'succeeded', receipt: { revision: 2 } });
    const db = new Database(join(path, 'factory.sqlite')); resources.push(db);
    expect(db.prepare('SELECT count(*) AS n FROM preparations').get()).toEqual({ n: 0 });
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
  it.each(['operation', 'event', 'revision'] as const)('rolls back every component when the %s write fails', (target) => {
    const f = fixture(); const table = { operation: 'operation_requests', event: 'events', revision: 'preparation_revisions' }[target];
    f.db.exec(`CREATE TRIGGER fail_preparation BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'fixture'); END`);
    expect(() => f.storage.savePreparation({ command: f.command, configurationETag: f.configurationETag })).toThrow();
    expect(f.storage.getOperation(f.command.operationId)).toBeNull();
    expect(f.db.prepare('SELECT count(*) AS n FROM preparations').get()).toEqual({ n: 0 });
    expect(f.db.prepare('SELECT count(*) AS n FROM preparation_revisions').get()).toEqual({ n: 0 });
  });
  it('preserves the current revision, original receipt and history on a failed update', () => {
    const f = fixture(); const first = f.storage.savePreparation({ command: f.command, configurationETag: f.configurationETag });
    const before = f.storage.getPreparation(first.resource.id);
    f.db.exec("CREATE TRIGGER fail_preparation_update BEFORE INSERT ON events WHEN NEW.entity_type = 'preparation' BEGIN SELECT RAISE(ABORT, 'fixture'); END");
    const operationId = randomUUID();
    expect(() => f.storage.savePreparation({ command: { kind: 'preparation.update', preparationId: before.view.id, operationId, expectedRevision: before.etag, body: { changes: { guidance: 'Must roll back' } } }, configurationETag: f.configurationETag })).toThrow();
    expect(f.storage.getPreparation(first.resource.id)).toEqual(before); expect(f.storage.getOperation(operationId)).toBeNull();
    expect(f.storage.getOperation(first.operation_id)).toEqual(first);
  });
  it('fails under a finite write lock without accepting a preparation or operation', () => {
    const f = fixture(); f.db.exec('BEGIN IMMEDIATE');
    try { expect(() => f.storage.savePreparation({ command: f.command, configurationETag: f.configurationETag })).toThrow(); }
    finally { f.db.exec('ROLLBACK'); }
    expect(f.storage.getOperation(f.command.operationId)).toBeNull();
    expect(f.db.prepare('SELECT count(*) AS n FROM preparations').get()).toEqual({ n: 0 });
  });
  it('does not allow a project revision from another project to enter preparation history', () => {
    const f = fixture(); const first = f.storage.savePreparation({ command: f.command, configurationETag: f.configurationETag });
    const other = f.storage.registerProject({ operationId: randomUUID(), expectedRevision: undefined,
      body: { name: 'Other', source: { kind: 'github', location: 'https://github.com/test/other' }, base_branch: 'main' },
      source: { kind: 'github', location: 'https://github.com/test/other' }, originNotes: [] });
    const otherRevision = f.storage.getConfiguration(other.resource.id).view.configuration.id;
    expect(() => f.db.prepare('INSERT INTO preparation_revisions(preparation_id, revision, project_id, project_revision_id, choices_json, created_at_ms) VALUES (?, 2, ?, ?, ?, 1)')
      .run(first.resource.id, f.projectId, otherRevision, JSON.stringify({ formatVersion: 1, choices: f.command.body }))).toThrow();
    expect(f.storage.getPreparation(first.resource.id).view.revision).toBe(1);
  });
});
