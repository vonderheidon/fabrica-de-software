import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { createProjectDeletionPersistence } from './project-deletions.js';
import { afterEach, describe, expect, it } from 'vitest';
import { openStorage } from './index.js';
import { applyMigrations, loadMigrations } from './migrations.js';
import { readOperation, saveTimeDefaults, settingsETag } from './operations.js';
import { readSettings } from './settings.js';
import { seedLegacySettings as seedSettings } from '../../../../../tests/fixtures/legacy-settings.js';

const directories: string[] = [];
const resources: { close(): void }[] = [];
function directory() {
  const path = mkdtempSync(join(tmpdir(), 'factory-initial-configuration-'));
  directories.push(path);
  return path;
}
function database(path: string) {
  const db = new Database(join(path, 'factory.sqlite'));
  createProjectDeletionPersistence(db);
  db.pragma('foreign_keys = ON');
  resources.push(db);
  return db;
}
function fixture() {
  const path = directory();
  const storage = openStorage({ dataDirectory: path });
  resources.push(storage);
  return { path, storage, db: database(path) };
}
afterEach(() => {
  for (const resource of resources.splice(0).reverse()) resource.close();
  for (const path of directories.splice(0)) rmSync(path, { recursive: true });
});

describe('initial configuration persistence foundation', () => {
  it('keeps every historical checksum and registers the sequenced delta', () => {
    expect(loadMigrations().slice(0, 18).map(m => m.checksum)).toEqual([
      '9b7c65d450156dfb163853eb2d4c28d76c3761926d08d9bbd4f1d6b438c7f0ab',
      '1c77a3b92f3036e080f8d645bd4e0583c4234c6ebd1ad555a3bc1e1bc1899b3a',
      '21f42dafbc8e834801e2f3e302844ab6dceda00f8fc85877ca00ef8804d2fb44',
      '1375525e6ad5607e8d6f5817c50aee48dbf775fe1aa545553fb743651bd345a5',
      '0ac56a3e6355a1084545c2d177bf590367b673eceb701106d7af64fc0ded3717',
      'b6802ef42ff54163e960e4e8f1188d6935cfaf8e781b9fde3e6981c1d1a8007b',
      'c013af8fc14a8d3eb20dae4b0e577db0fd3b3533e92810ebaaa40595efe7067e',
      '63f0ad04266edb2e559be1d9c95f24ccae89a2843672d5617eeb3e4a4bc1edd5',
      '6775e2069616da6ee202e350005ac6f288574461d88cef53c4f4eab85572768b',
      '10488f940d2b11f8b90852ca6446f323c194834ed588d4c98965fe4e766f03ed',
      'e96c7ce5bda049adc5e59a6575d619a983713605250a1a24ab2bed4ec99b3d31',
      '718fc37cc706cf968004e1ac3aff026699d7fc6f3cd796452c7083353dd5fb4d',
      '2534b505fb31c2b50430d456b15602958d6ab7761239e7761824c82972ef1620',
      '11ee9002e1248acd59a8f088faae3679aa784881e94a7bc9d8d8ab4d7bb9d225',
      '7aba6b8fb1adac4cc311f5747da31f94a171d319dc4c81f293f022593bb48890',
      'f224400eccb46e87a1f71af11579370e46bed39eca0d5c4c36c09a5b6caf4449',
      '3f9c8b97b1d0c317f19bb4abeb99a4d7b09823d4428975e239775835030a813a',
      '08a177028d9a9eca76b7a67bc943cb1bf47bfade8b483e69bae95cc97bf1d1b7',
    ]);
    const { db, storage } = fixture();
    expect(storage.getDiagnostics().schemaVersion).toBe(50);
    expect(db.prepare('SELECT version,name,checksum FROM schema_migrations ORDER BY version').all())
      .toEqual(loadMigrations().map(({ version, name, checksum }) => ({ version, name, checksum })));
    expect(db.prepare('SELECT applied_at_ms FROM schema_migrations WHERE version=19').get())
      .toEqual({ applied_at_ms: expect.any(Number) });
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('seeds only the singleton with absent setup facts and no domain records', () => {
    const { db } = fixture();
    expect(db.prepare(`SELECT account_id,projects_root,automation_enabled,onboarding_suppressed,
      onboarding_completed_at_ms,projects_root_confirmed_at_ms,gh_executable_path FROM factory_settings`).get()).toEqual({
      account_id: null, projects_root: null, automation_enabled: 0, onboarding_suppressed: 0,
      onboarding_completed_at_ms: null, projects_root_confirmed_at_ms: null, gh_executable_path: null,
    });
    for (const table of ['accounts', 'execution_profiles', 'projects', 'attempts']) {
      expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE '%onboarding%'").all()).toEqual([]);
    const columns = db.prepare<[], { name: string; notnull: number; dflt_value: string | null }>("PRAGMA table_info('factory_settings')").all();
    expect(columns.find(c => c.name === 'onboarding_suppressed')).toMatchObject({ notnull: 1, dflt_value: '0' });
    for (const name of ['onboarding_completed_at_ms', 'projects_root_confirmed_at_ms', 'gh_executable_path']) {
      expect(columns.find(c => c.name === name)).toMatchObject({ notnull: 0, dflt_value: null });
    }
  });

  it('adds the final typed profile schema while the table is empty and enforces live-name uniqueness', () => {
    const { db } = fixture();
    const columns = db.prepare<[], { name: string; type: string; notnull: number; dflt_value: string | null }>(
      "PRAGMA table_info('execution_profiles')",
    ).all();
    expect(columns.find((column) => column.name === 'profile_type')).toMatchObject({ type: 'TEXT', notnull: 1, dflt_value: null });
    expect(columns.find((column) => column.name === 'name_key')).toMatchObject({ type: 'TEXT', notnull: 1, dflt_value: null });
    expect(columns.find((column) => column.name === 'effort')).toMatchObject({ notnull: 0 });
    expect(columns.find((column) => column.name === 'deleted_at_ms')).toMatchObject({ type: 'INTEGER', notnull: 0, dflt_value: null });
    expect(db.prepare<[], { unique: number; partial: number }>(
      "SELECT \"unique\", partial FROM pragma_index_list('execution_profiles') WHERE name='execution_profiles_live_name'",
    ).get()).toEqual({ unique: 1, partial: 1 });

    const insert = db.prepare(`INSERT INTO execution_profiles(
      id, name, profile_type, name_key, executor, provider, model, effort, guidance, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, 'maestri-omp', 'provider', 'model', NULL, '', 0, 0)`);
    insert.run('profile-one', 'Álpha  Beta', 'implementer', 'álpha  beta');
    expect(() => insert.run('profile-two', 'Other display name', 'reviewer', 'álpha  beta')).toThrow();
    expect(() => insert.run('profile-invalid-type', 'Invalid', 'operator', 'invalid')).toThrow();
    expect(() => insert.run('profile-invalid-name-key', 'Invalid', 'reviewer', '   ')).toThrow();
    db.prepare('UPDATE execution_profiles SET deleted_at_ms=0, revision=revision+1 WHERE id=?').run('profile-one');
    expect(() => insert.run('profile-two', 'Other display name', 'reviewer', 'álpha  beta')).not.toThrow();
    expect(() => db.prepare('UPDATE execution_profiles SET created_at_ms=10, updated_at_ms=10, deleted_at_ms=9 WHERE id=?').run('profile-two')).toThrow();
    expect(() => db.prepare('UPDATE execution_profiles SET deleted_at_ms=-1 WHERE id=?').run('profile-two')).toThrow();
  });

  it.each([
    'onboarding_suppressed=NULL', 'onboarding_suppressed=2', 'onboarding_suppressed=-1',
    "onboarding_suppressed='invalid'", 'onboarding_completed_at_ms=-1',
    'projects_root_confirmed_at_ms=-1', 'projects_root_confirmed_at_ms=0',
    "gh_executable_path=''", "gh_executable_path='   '",
  ])('rejects invalid private settings: %s', assignment => {
    const { db } = fixture();
    expect(() => db.exec(`UPDATE factory_settings SET ${assignment}`)).toThrow();
  });

  it('persists independent suppression, root confirmation and an immutable completion including zero', () => {
    const { db, storage, path } = fixture();
    db.prepare('UPDATE factory_settings SET projects_root=?,projects_root_confirmed_at_ms=0,gh_executable_path=?')
      .run('C:/fixture/projects', 'C:/fixture/gh.exe');
    db.exec('UPDATE factory_settings SET onboarding_completed_at_ms=0; UPDATE factory_settings SET onboarding_suppressed=1');
    expect(() => db.exec('UPDATE factory_settings SET onboarding_completed_at_ms=0')).not.toThrow();
    for (const value of ['NULL', '1', '-1']) {
      expect(() => db.exec(`UPDATE factory_settings SET onboarding_completed_at_ms=${value}`)).toThrow('IMMUTABLE_RECORD');
    }
    expect(() => db.exec('DELETE FROM factory_settings')).toThrow('IMMUTABLE_RECORD');
    expect(() => db.exec('UPDATE factory_settings SET projects_root=NULL')).toThrow();
    db.exec('UPDATE factory_settings SET onboarding_suppressed=0');
    db.close(); storage.close();
    const reopened = openStorage({ dataDirectory: path }); resources.push(reopened);
    expect(database(path).prepare('SELECT onboarding_completed_at_ms,onboarding_suppressed FROM factory_settings').get())
      .toEqual({ onboarding_completed_at_ms: 0, onboarding_suppressed: 0 });
  });

  it('migrates actual v18 with no profiles, preserving identity, receipts and all historical ledger rows', () => {
    const path = directory(); const db = database(path);
    applyMigrations(db, loadMigrations().slice(0, 18), () => seedSettings(db, path));
    const settings = readSettings(db);
    const accepted = saveTimeDefaults(db, { operationId: randomUUID(), expectedRevision: settingsETag(settings.installation_id, settings.revision), timeDefaults: settings.time_defaults });
    const before = readSettings(db);
    const ledger = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
    const operations = db.prepare('SELECT * FROM operation_requests').all();
    const profiles = db.prepare('SELECT * FROM execution_profiles').all();
    db.close();
    const storage = openStorage({ dataDirectory: path }); resources.push(storage);
    const probe = database(path);
    expect(storage.getSettings()).toEqual(before);
    expect(storage.getOperation(accepted.operation_id)).toEqual(accepted);
    expect(probe.prepare('SELECT * FROM schema_migrations WHERE version<=18 ORDER BY version').all()).toEqual(ledger);
    expect(probe.prepare('SELECT * FROM execution_profiles').all()).toEqual(profiles);
    expect(probe.prepare('SELECT * FROM operation_requests').all()).toEqual(operations.map(row => ({ ...row as object, result_account_id: null })));
  });

  it('diagnoses and preserves incompatible profile rows before applying the new schema', () => {
    const path = directory(); const db = database(path);
    applyMigrations(db, loadMigrations().slice(0, 18), () => seedSettings(db, path));
    db.exec("INSERT INTO execution_profiles VALUES ('legacy','Legacy','maestri-omp','provider','model','high','guidance',1,1,1)");
    const ledger = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
    const profiles = db.prepare('SELECT * FROM execution_profiles').all();

    expect(() => applyMigrations(db, loadMigrations(), () => { throw new Error('must not reseed'); }))
      .toThrowError(expect.objectContaining({ code: 'PROFILE_SCHEMA_INCOMPATIBLE' }));
    expect(db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()).toEqual(ledger);
    expect(db.prepare('SELECT * FROM execution_profiles').all()).toEqual(profiles);
    expect(db.pragma('user_version', { simple: true })).toBe(18);
  });

  it('diagnoses incompatible persisted settings before changing a v18 file or its ledger', () => {
    const path = directory(); const db = database(path);
    applyMigrations(db, loadMigrations().slice(0, 18), () => seedSettings(db, path));
    db.exec(`UPDATE factory_settings SET time_defaults_json='{"formatVersion":999}'`);
    db.close();
    const filename = join(path, 'factory.sqlite'); const before = readFileSync(filename);
    expect(() => openStorage({ dataDirectory: path })).toThrowError(expect.objectContaining({ code: 'SETTINGS_INVALID' }));
    expect(readFileSync(filename)).toEqual(before);
    const probe = database(path);
    expect(probe.pragma('user_version', { simple: true })).toBe(18);
    expect(probe.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 18 });
  });

  it('rolls back the whole delta when old operation data violates the new CHECK', () => {
    const path = directory(); const db = database(path);
    applyMigrations(db, loadMigrations().slice(0, 18), () => seedSettings(db, path));
    db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,operation_kind,resource_type,resource_id,request_hash)
      VALUES (?,?, 'settings.account.bind','settings','local',?)`).run(randomUUID(), readSettings(db).installation_id, 'a'.repeat(64));
    const before = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
    const operations = db.prepare('SELECT * FROM operation_requests').all();
    expect(() => applyMigrations(db, loadMigrations(), () => { throw new Error('must not reseed'); }))
      .toThrowError(expect.objectContaining({ code: 'MIGRATION_FAILED' }));
    expect(db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()).toEqual(before);
    expect(db.prepare('SELECT * FROM operation_requests').all()).toEqual(operations);
    expect(db.pragma('user_version', { simple: true })).toBe(18);
    expect(db.prepare("SELECT name FROM pragma_table_info('factory_settings') WHERE name LIKE 'onboarding_%'").all()).toEqual([]);
  });
});

describe('binding destination operation identity', () => {
  function bindingFixture() {
    const f = fixture();
    f.db.exec("INSERT INTO accounts VALUES ('A','alpha',1,1,1,1),('B','beta',1,1,1,1)");
    function insert(kind: string, source: string | null, target: string | null, resourceType = 'settings', resourceId = 'local') {
      const id = randomUUID();
      f.db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,result_account_id)
        VALUES (?,?,?,?,?,?,?,?)`).run(id, f.storage.getSettings().installation_id, source, kind, resourceType, resourceId, 'b'.repeat(64), target);
      return id;
    }
    return { ...f, insert };
  }
  it.each([
    ['settings.account.bind', 'A', 'B', 'settings', 'local'],
    ['settings.account.bind', null, null, 'settings', 'local'],
    ['settings.account.switch', 'A', 'A', 'settings', 'local'],
    ['settings.account.switch', 'A', null, 'settings', 'local'],
    ['settings.account.switch', null, 'B', 'settings', 'local'],
    ['settings.update', null, 'B', 'settings', 'local'],
    ['settings.account.bind', null, 'B', 'project', 'local'],
    ['settings.account.switch', 'A', 'B', 'settings', 'other'],
    ['settings.account.bind', null, 'missing', 'settings', 'local'],
  ] as const)('rejects invalid destination for %s / %s / %s / %s / %s', (kind, source, target, type, id) => {
    expect(() => bindingFixture().insert(kind, source, target, type, id)).toThrow();
  });
  it('retains the null bind origin, restricts deletion and protects every identity field', () => {
    const { db, insert } = bindingFixture();
    const id = insert('settings.account.bind', null, 'B');
    insert('settings.account.switch', 'A', 'B');
    insert('settings.update', null, null);
    expect(db.prepare('SELECT account_id,result_account_id FROM operation_requests WHERE operation_id=?').get(id))
      .toEqual({ account_id: null, result_account_id: 'B' });
    for (const field of ['operation_id', 'installation_id', 'account_id', 'operation_kind', 'resource_type', 'resource_id', 'request_hash', 'expected_revision_json', 'result_account_id']) {
      expect(() => db.prepare(`UPDATE operation_requests SET ${field}=${field} WHERE operation_id=?`).run(id)).toThrow('IMMUTABLE_RECORD');
    }
    expect(() => db.prepare("DELETE FROM accounts WHERE github_account_id='B'").run()).toThrow();
    expect(() => db.prepare('DELETE FROM operation_requests WHERE operation_id=?').run(id)).toThrow('IMMUTABLE_RECORD');
    // Persistence alone does not widen read authority or invent a successful bind endpoint.
    expect(readOperation(db, id)).toBeNull();
  });
});
