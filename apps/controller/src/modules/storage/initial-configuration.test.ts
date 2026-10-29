import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { createProjectDeletionPersistence } from './project-deletions.js';
import { afterEach, describe, expect, it } from 'vitest';
import { openStorage } from './index.js';
import { applicationId, loadSchemaRecognitionResources } from './migrations.js';
import { readOperation } from './operations.js';

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
  it('records the direct-install baseline without claiming historical migration execution', () => {
    const { db } = fixture();
    const metadata = loadSchemaRecognitionResources();
    expect(Number(db.pragma('application_id', { simple: true }))).toBe(applicationId);
    expect(Number(db.pragma('user_version', { simple: true }))).toBe(metadata.directInstallUserVersion);
    expect(db.prepare('SELECT version,name,checksum,applied_at_ms FROM schema_migrations').all()).toEqual([]);
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
