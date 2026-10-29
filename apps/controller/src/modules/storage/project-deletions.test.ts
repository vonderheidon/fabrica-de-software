import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openStorage, type Storage } from './index.js';
import { applyMigrations, loadMigrations } from '../../../../../tests/fixtures/historical-schema.js';
import { seedSettings } from './settings.js';
import { registerProject } from './configuration-writes.js';

const directories: string[] = [];
const resources: { close(): void }[] = [];
const tables = ['project_deletions', 'project_deletion_targets', 'project_deletion_receipts', 'project_storage_locations'];
function directory() {
  const path = mkdtempSync(join(tmpdir(), 'factory-deletion-foundation-'));
  directories.push(path);
  return path;
}
function connect(path: string) {
  const db = new Database(join(path, 'factory.sqlite'));
  db.pragma('foreign_keys = ON');
  resources.push(db);
  return db;
}
function open(path: string) {
  const storage = openStorage({ dataDirectory: path });
  resources.push(storage);
  return storage;
}
function register(storage: Pick<Storage, 'registerProject'>) {
  const source = { kind: 'local' as const, location: 'C:\\fixture\\projeto' };
  return storage.registerProject({ operationId: randomUUID(), expectedRevision: undefined,
    body: { name: 'Preservar ação', source, base_branch: 'main' }, source, originNotes: [] });
}
function authorizeFixture(storage: Storage, db: Database.Database) {
  const operation = register(storage);
  const operationId = operation.operation_id;
  const projectId = operation.resource.id;
  db.prepare(`INSERT INTO project_deletions(operation_id,project_id,expected_revision,authorization_digest,state,created_at_ms,updated_at_ms)
    VALUES (?,?,1,?,'accepted',0,0)`).run(operationId, projectId, 'a'.repeat(64));
  db.prepare(`INSERT INTO project_deletion_targets(operation_id,target_key,target_kind,authorized_path,normalized_path,resolved_path,object_kind,identity_json,owner_kind,owner_id,state)
    VALUES (?,'original','original_directory','C:\\fixture','c:/fixture','C:\\fixture','directory','{}','project',?,'pending')`).run(operationId, projectId);
  return { operationId, projectId };
}
afterEach(() => {
  for (const resource of resources.splice(0).reverse()) resource.close();
  for (const path of directories.splice(0)) rmSync(path, { recursive: true });
});

describe('project deletion persistence foundation', () => {
  it('creates the deletion and managed-location tables as empty STRICT tables on fresh storage', () => {
    const path = directory(); open(path); const db = connect(path);
    for (const name of tables) {
      expect(db.prepare(`SELECT * FROM ${name}`).all()).toEqual([]);
      expect(db.prepare('SELECT strict FROM pragma_table_list WHERE name=?').get(name)).toEqual({ strict: 1 });
    }
    expect(db.prepare("SELECT name FROM pragma_index_list('project_deletions') ORDER BY name").all()).toEqual([
      { name: 'project_deletions_recovery' }, { name: 'sqlite_autoindex_project_deletions_1' }, { name: 'sqlite_autoindex_project_deletions_2' },
    ]);
    expect(db.prepare("SELECT count(*) AS count FROM pragma_index_list('project_deletion_targets')").get()).toEqual({ count: 2 });
    expect(db.prepare("SELECT count(*) AS count FROM pragma_index_list('project_deletion_receipts')").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT * FROM pragma_foreign_key_list('project_deletion_receipts')").all()).toEqual([]);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('reapplies the current schema without rewriting project records, seeds or ledger', () => {
    const path = directory(); const db = connect(path);
    const migrations = loadMigrations();
    applyMigrations(db, migrations, () => seedSettings(db));
    register({ registerProject: input => registerProject(db, input) });
    const beforeProject = db.prepare('SELECT * FROM projects').all();
    const beforeRevisions = db.prepare('SELECT * FROM project_revisions').all();
    const beforeOperations = db.prepare('SELECT * FROM operation_requests').all();
    const beforeEvents = db.prepare('SELECT * FROM events').all();
    const beforeSettings = db.prepare('SELECT * FROM factory_settings').all();
    db.prepare("INSERT INTO accounts VALUES ('account','preserved',0,0,0,1)").run();
    const beforeObjects = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    const beforeLedger = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
    applyMigrations(db, migrations, () => { throw new Error('UNEXPECTED_RESEED'); });
    expect(db.prepare('SELECT * FROM factory_settings').all()).toEqual(beforeSettings);
    expect(db.prepare('SELECT * FROM projects').all()).toEqual(beforeProject);
    expect(db.prepare('SELECT * FROM project_revisions').all()).toEqual(beforeRevisions);
    expect(db.prepare('SELECT * FROM operation_requests').all()).toEqual(beforeOperations);
    expect(db.prepare('SELECT * FROM events').all()).toEqual(beforeEvents);
    expect(db.prepare('SELECT * FROM accounts').all()).toEqual([{ github_account_id: 'account', login: 'preserved', observed_at_ms: 0, created_at_ms: 0, updated_at_ms: 0, revision: 1 }]);
    expect(db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()).toEqual(beforeLedger);
    const afterObjects = db.prepare<{ name: string }, { type: string; name: string; tbl_name: string; sql: string }>('SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name=@name');
    for (const object of beforeObjects as { type: string; name: string; tbl_name: string; sql: string }[]) {
      // 026 replaces only exclusive DELETE guards; all other objects stay exact.
      if (object.type === 'trigger' && /BEFORE DELETE ON/.test(object.sql) &&
        /factory_project_deletion_row_allowed/.test(afterObjects.get({ name: object.name })?.sql ?? '')) continue;
      expect(afterObjects.get({ name: object.name })).toEqual(object);
    }
    for (const name of tables.filter(item => item !== 'project_storage_locations')) expect(db.prepare(`SELECT * FROM ${name}`).all()).toEqual([]);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    const storage = open(path);
    const records = db.prepare('SELECT * FROM projects').all();
    storage.close();
    expect(open(path).listProjects({}).items).toHaveLength(1);
    expect(db.prepare('SELECT * FROM projects').all()).toEqual(records);
    expect(db.prepare('SELECT version,name,checksum FROM schema_migrations ORDER BY version').all())
      .toEqual(migrations.map(({ version, name, checksum }) => ({ version, name, checksum })));
  });

  it('rejects authorization and target identity updates while allowing progress updates', () => {
    const path = directory(); const storage = open(path); const db = connect(path);
    const { operationId } = authorizeFixture(storage, db);
    for (const column of ['operation_id', 'project_id', 'expected_revision', 'authorization_digest', 'created_at_ms']) {
      expect(() => db.exec(`UPDATE project_deletions SET ${column}=${column}`)).toThrow('IMMUTABLE_RECORD');
    }
    for (const column of ['operation_id', 'target_key', 'target_kind', 'authorized_path', 'normalized_path', 'resolved_path', 'object_kind', 'identity_json', 'owner_kind', 'owner_id']) {
      expect(() => db.exec(`UPDATE project_deletion_targets SET ${column}=${column}`)).toThrow('IMMUTABLE_RECORD');
    }
    db.exec("UPDATE project_deletions SET state='running',revision=2,worker_generation=1; UPDATE project_deletion_targets SET state='removing',verified_at_ms=1");
    expect(() => db.exec("UPDATE project_deletions SET state='pending'")).toThrow();
    db.exec("UPDATE project_deletions SET state='pending',reason='Falha.',recovery='Tente novamente.'");
    expect(() => db.exec('DELETE FROM project_deletions')).toThrow();
    expect(() => db.prepare(`INSERT INTO project_deletion_receipts VALUES (?,?,'succeeded')`).run(operationId, 'a'.repeat(64))).toThrow();
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('rolls back the entire additive migration if any new object cannot be created', () => {
    const path = directory(); const db = connect(path); const migrations = loadMigrations();
    applyMigrations(db, migrations.slice(0, 24), () => seedSettings(db));
    const settings = db.prepare('SELECT * FROM factory_settings').all();
    const ledger = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
    db.exec('CREATE TABLE project_deletion_receipts (fixture TEXT) STRICT');
    expect(() => applyMigrations(db, migrations, () => { throw new Error('UNEXPECTED_RESEED'); })).toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(24);
    expect(db.prepare('SELECT * FROM factory_settings').all()).toEqual(settings);
    expect(db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()).toEqual(ledger);
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE name IN ('project_deletions','project_deletion_targets','project_deletions_recovery')").all()).toEqual([]);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('enforces constraints, unique ownership, foreign keys and absence metadata', () => {
    const path = directory(); const storage = open(path); const db = connect(path);
    const { operationId } = authorizeFixture(storage, db);
    for (const assignment of ["state='succeeded'", 'revision=0', 'worker_generation=-1', 'updated_at_ms=-1']) {
      expect(() => db.exec(`UPDATE project_deletions SET ${assignment}`)).toThrow();
    }
    for (const assignment of ["state='unknown'", 'verified_at_ms=-1']) expect(() => db.exec(`UPDATE project_deletion_targets SET ${assignment}`)).toThrow();
    expect(() => db.exec("INSERT INTO project_deletions SELECT * FROM project_deletions")).toThrow();
    const insert = db.prepare(`INSERT INTO project_deletion_targets(operation_id,target_key,target_kind,authorized_path,normalized_path,resolved_path,object_kind,identity_json,owner_kind,owner_id,state)
      VALUES (?,'second','exclusive_workspace','C:\\second',?,NULL,?,?,'attempt',?,'pending')`);
    expect(() => insert.run(operationId, 'second', 'directory', '{}', randomUUID())).toThrow();
    expect(() => insert.run(operationId, 'second', 'absent', 'invalid', randomUUID())).toThrow();
    expect(() => insert.run(randomUUID(), 'second', 'absent', '{}', randomUUID())).toThrow();
    expect(() => insert.run(operationId, 'c:/fixture', 'absent', '{}', randomUUID())).toThrow();
    insert.run(operationId, 'second', 'absent', '{}', randomUUID());
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('keeps receipt INSERT closed by default with exactly the minimal columns', () => {
    const path = directory(); open(path); const db = connect(path);
    db.function('factory_project_deletion_finalization_allowed', (_id: string) => 0);
    expect(() => db.prepare("INSERT INTO project_deletion_receipts VALUES (?,?,'succeeded')").run(randomUUID(), 'a'.repeat(64))).toThrow('PROJECT_DELETION_FINALIZATION_REQUIRED');
    for (const values of [[randomUUID(), 'short', 'succeeded'], [randomUUID(), 'a'.repeat(64), 'failed']]) {
      expect(() => db.prepare('INSERT INTO project_deletion_receipts VALUES (?,?,?)').run(...values)).toThrow();
    }
    expect(db.prepare("SELECT name FROM pragma_table_info('project_deletion_receipts')").all()).toEqual(['operation_id', 'request_fingerprint', 'result'].map(name => ({ name })));
  });
});
