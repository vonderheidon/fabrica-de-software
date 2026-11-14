import { createHash, randomUUID } from 'node:crypto';
import { hostname, tmpdir } from 'node:os';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openStorage } from './index.js';
import { applicationId, inspectHistory, loadSchemaRecognitionResources } from './migrations.js';
import { digest } from './configuration-reads.js';
import { seedSettings } from './settings.js';
import { applyHistoricalSchemaFixture, loadHistoricalSchemaFixtures } from '../../../../../tests/fixtures/historical-schema.js';

const directories: string[] = [];
const resources: { close(): void }[] = [];

function directory(): string {
  const path = mkdtempSync(join(tmpdir(), 'factory-local-installation-'));
  directories.push(path);
  return path;
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function snapshotFiles(filename: string): Record<string, string | null> {
  const files = [`${filename}`, `${filename}-wal`, `${filename}-shm`, `${filename}-journal`];
  return Object.fromEntries(files.map(path => [path, existsSync(path) ? sha256(readFileSync(path)) : null]));
}

function insertProjectWithRevisions(db: Database.Database, includeLegacyInactiveRevision: boolean): string {
  const projectId = randomUUID();
  const activeRevisionId = randomUUID();
  const inactiveRevisionId = randomUUID();
  const insertRevision = db.prepare(`INSERT INTO project_revisions(
    id,project_id,revision_number,source_kind,source_location,repository_id,repository_url,base_branch,
    github_project_id,github_project_owner_id,status_field_id,status_options_json,implementer_profile_id,
    reviewer_profile_id,correction_limit,default_delivery_mode,automation_enabled,queue_order_json,guidance,
    origin_notes_json,created_at_ms,delivery_branch_json
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`);
  db.transaction(() => {
    db.prepare(`INSERT INTO projects(id,account_id,name,current_revision_id,revision,created_at_ms,updated_at_ms)
      VALUES (?,NULL,'Schema fixture',?,2,10,10)`).run(projectId, activeRevisionId);
    if (includeLegacyInactiveRevision) {
      insertRevision.run(inactiveRevisionId, projectId, 1, 'local', 'C:/projects/fixture', null, null, 'main',
        'PROJECT_old', 'ORG_old', 'FIELD_status', JSON.stringify({ ready: 'READY', inProgress: 'PROGRESS', inReview: 'REVIEW', delivered: 'DONE' }),
        null, null, 2, 'icr', 0, JSON.stringify({ useBoardPosition: true }), 'Inactive legacy mapping', '[]', 10);
    }
    insertRevision.run(activeRevisionId, projectId, 2, 'local', 'C:/projects/fixture', null, null, 'main',
      null, null, null, '{}', null, null, 2, 'icr', 0,
      JSON.stringify({ useBoardPosition: true }), 'Current mapping is absent by choice', '[]', 20);
  }).immediate();
  return projectId;
}

function legacyCreationPlan(): Record<string, unknown> {
  return {
    formatVersion: 1,
    installationId: randomUUID(),
    settingsETag: '"legacy"',
    projectsRoot: 'C:/projects',
    destination: 'C:/projects/legacy',
    parentIdentity: 'a'.repeat(64),
    templateDigest: 'b'.repeat(64),
    files: [{ path: 'README.md', bytes: 1, sha256: 'c'.repeat(64) }],
    engineering: { tracker: 'github', domain: 'single-context', instructionFile: 'AGENTS.md', triageEnabled: false,
      installsSkills: false, createsLabels: false },
    account: { state: 'unobserved', id: null, login: null },
    ownerId: null,
    effects: [],
    input: { name: 'Legacy plan', templateId: 'plain', templateDigest: 'b'.repeat(64), destinationRelative: 'legacy',
      creationMode: 'local', baseBranch: 'main', triageEnabled: false },
  };
}

afterEach(() => {
  for (const resource of resources.splice(0).reverse()) resource.close();
  for (const path of directories.splice(0)) rmSync(path, { recursive: true });
});

describe('fixed local installation', () => {
  it('creates the final schema directly with only the local settings seed', () => {
    const path = directory();
    const storage = openStorage({ dataDirectory: path });
    resources.push(storage);
    const db = new Database(join(path, 'factory.sqlite'));
    resources.push(db);
    const metadata = loadSchemaRecognitionResources();
    const objects = db.prepare<[], { type: string; name: string; tbl_name: string; sql: string | null }>(
      "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE substr(name,1,7)<>'sqlite_' ORDER BY type,name",
    ).all();
    const digest = sha256(Buffer.from(JSON.stringify(objects), 'utf8'));

    expect(Number(db.pragma('application_id', { simple: true }))).toBe(applicationId);
    expect(Number(db.pragma('user_version', { simple: true }))).toBe(metadata.directInstallUserVersion);
    expect(digest).toBe(metadata.currentSchemaSha256);
    expect(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='table' AND substr(name,1,7)<>'sqlite_'").get()).toEqual({ n: 59 });
    expect(db.prepare('SELECT count(*) AS n FROM schema_migrations').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT count(*) AS n FROM factory_settings').get()).toEqual({ n: 1 });
    for (const table of ['accounts', 'execution_profiles', 'projects', 'attempts', 'attempt_sessions', 'project_creations']) {
      expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
    expect(storage.getSettings().designated_host).toBe(hostname());
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('reopens a direct installation without executing schema SQL or replacing its settings seed', () => {
    const path = directory();
    const initial = openStorage({ dataDirectory: path });
    const settings = initial.getSettings();
    initial.close();
    const exec = vi.spyOn(Database.prototype, 'exec').mockImplementation(() => {
      throw new Error('SCHEMA_SQL_REEXECUTED');
    });
    try {
      const reopened = openStorage({ dataDirectory: path });
      resources.push(reopened);
      expect(reopened.getSettings()).toEqual(settings);
      expect(exec).not.toHaveBeenCalled();
      const db = new Database(join(path, 'factory.sqlite'), { readonly: true });
      resources.push(db);
      expect(db.prepare('SELECT count(*) AS n FROM factory_settings').get()).toEqual({ n: 1 });
      expect(db.prepare('SELECT count(*) AS n FROM schema_migrations').get()).toEqual({ n: 0 });
      expect(inspectHistory(db)).toEqual({ kind: 'direct', schemaVersion: 58 });
    } finally {
      exec.mockRestore();
    }
  });

  it('opens a current historical ledger without applying or rewriting it', () => {
    const path = directory();
    const filename = join(path, 'factory.sqlite');
    const db = new Database(filename);
    resources.push(db);
    db.pragma('foreign_keys = ON');
    applyHistoricalSchemaFixture(db, loadHistoricalSchemaFixtures(), () => seedSettings(db));
    const schemaObjects = db.prepare<[], { type: string; name: string; tbl_name: string; sql: string | null }>(
      "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE substr(name,1,7)<>'sqlite_' ORDER BY type,name",
    ).all();
    expect(sha256(Buffer.from(JSON.stringify(schemaObjects), 'utf8'))).toBe(loadSchemaRecognitionResources().currentSchemaSha256);
    const ledger = db.prepare('SELECT version,name,checksum,applied_at_ms FROM schema_migrations ORDER BY version').all();
    resources.splice(resources.indexOf(db), 1);
    db.close();

    const storage = openStorage({ dataDirectory: path });
    expect(storage.getSettings().installation_id).toBeTruthy();
    storage.close();
    const reopened = new Database(filename);
    resources.push(reopened);
    expect(Number(reopened.pragma('application_id', { simple: true }))).toBe(applicationId);
    expect(Number(reopened.pragma('user_version', { simple: true }))).toBe(loadSchemaRecognitionResources().currentLedgerUserVersion);
    expect(reopened.prepare('SELECT version,name,checksum,applied_at_ms FROM schema_migrations ORDER BY version').all()).toEqual(ledger);
    expect(reopened.pragma('foreign_key_check')).toEqual([]);
  });

  it('refuses an invalid ledger without changing database, WAL, SHM, or recognition resources', () => {
    const path = directory();
    const storage = openStorage({ dataDirectory: path });
    storage.close();
    const filename = join(path, 'factory.sqlite');
    const db = new Database(filename);
    resources.push(db);
    db.pragma('journal_mode = WAL');
    db.prepare('INSERT INTO schema_migrations(version,name,checksum,applied_at_ms) VALUES (1,?,?,0)')
      .run('001_initial_settings.sql', '0'.repeat(64));
    const before = snapshotFiles(filename);
    const resourcePaths = [
      new URL('../../../../../resources/storage/initial-schema.v55.sql', import.meta.url),
      new URL('../../../../../resources/storage/initial-schema.v56.sql', import.meta.url),
      new URL('../../../../../resources/storage/initial-schema.v57.sql', import.meta.url),
      new URL('../../../../../resources/storage/initial-schema.v58.sql', import.meta.url),
      new URL('../../../../../resources/storage/055_issue_history_repository_reference.sql', import.meta.url),
      new URL('../../../../../resources/storage/056_immediate_controller_shutdown.sql', import.meta.url),
      new URL('../../../../../resources/storage/057_issue_body_effect.sql', import.meta.url),
      new URL('../../../../../resources/storage/schema-recognition.v1.json', import.meta.url),
    ];
    const resourceHashes = resourcePaths.map(url => sha256(readFileSync(url)));
    expect(before[`${filename}-wal`]).not.toBeNull();
    expect(before[`${filename}-shm`]).not.toBeNull();

    expect(() => openStorage({ dataDirectory: path })).toThrowError(
      expect.objectContaining({ code: 'MIGRATION_HISTORY_INVALID' }),
    );

    expect(snapshotFiles(filename)).toEqual(before);
    expect(resourcePaths.map(url => sha256(readFileSync(url)))).toEqual(resourceHashes);
  });

  it.each([
    ['future version', 'PRAGMA user_version = 59', 'DATABASE_NEWER_THAN_APPLICATION'],
    ['unknown identity', 'PRAGMA application_id = 1', 'DATABASE_UNKNOWN'],
    ['partial schema', 'DROP TABLE project_storage_locations', 'DATABASE_SCHEMA_INCOMPATIBLE'],
  ] as const)('refuses %s without changing the current database files', (_name, sql, code) => {
    const path = directory();
    openStorage({ dataDirectory: path }).close();
    const filename = join(path, 'factory.sqlite');
    const db = new Database(filename);
    resources.push(db);
    db.pragma('journal_mode = WAL');
    db.exec(sql);
    const before = snapshotFiles(filename);

    expect(() => openStorage({ dataDirectory: path })).toThrowError(expect.objectContaining({ code }));

    expect(snapshotFiles(filename)).toEqual(before);
  });

  it('checks quick_check before reading any schema object', () => {
    const probe = { pragma: () => 'corrupt' } as unknown as Database.Database;
    expect(() => inspectHistory(probe, loadSchemaRecognitionResources())).toThrowError(
      expect.objectContaining({ code: 'STORAGE_INTEGRITY_FAILED' }),
    );
  });

  it('refuses a foreign key violation without changing database, WAL, or SHM', () => {
    const path = directory();
    openStorage({ dataDirectory: path }).close();
    const filename = join(path, 'factory.sqlite');
    const db = new Database(filename);
    resources.push(db);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = OFF');
    db.prepare("UPDATE factory_settings SET account_id='ACCOUNT_missing'").run();
    const before = snapshotFiles(filename);

    expect(() => openStorage({ dataDirectory: path })).toThrowError(
      expect.objectContaining({ code: 'STORAGE_INTEGRITY_FAILED' }),
    );

    expect(snapshotFiles(filename)).toEqual(before);
  });

  it('refuses a changed historical checksum without modifying database, WAL, or SHM', () => {
    const path = directory();
    const filename = join(path, 'factory.sqlite');
    const fixture = new Database(filename);
    fixture.pragma('foreign_keys = ON');
    applyHistoricalSchemaFixture(fixture, loadHistoricalSchemaFixtures(), () => seedSettings(fixture));
    fixture.close();
    const db = new Database(filename);
    resources.push(db);
    db.pragma('journal_mode = WAL');
    db.prepare('UPDATE schema_migrations SET checksum=? WHERE version=1').run('0'.repeat(64));
    const before = snapshotFiles(filename);

    expect(() => openStorage({ dataDirectory: path })).toThrowError(
      expect.objectContaining({ code: 'MIGRATION_CHECKSUM_MISMATCH' }),
    );

    expect(snapshotFiles(filename)).toEqual(before);
  });

  it('refuses a missing historical sequence entry without modifying database, WAL, or SHM', () => {
    const path = directory();
    const filename = join(path, 'factory.sqlite');
    const fixture = new Database(filename);
    fixture.pragma('foreign_keys = ON');
    applyHistoricalSchemaFixture(fixture, loadHistoricalSchemaFixtures(), () => seedSettings(fixture));
    fixture.close();
    const db = new Database(filename);
    resources.push(db);
    db.pragma('journal_mode = WAL');
    db.prepare('DELETE FROM schema_migrations WHERE version=2').run();
    const before = snapshotFiles(filename);

    expect(() => openStorage({ dataDirectory: path })).toThrowError(
      expect.objectContaining({ code: 'MIGRATION_HISTORY_INVALID' }),
    );

    expect(snapshotFiles(filename)).toEqual(before);
  });

  it('rejects a legacy mapping in an inactive project revision before any file change', () => {
    const path = directory();
    const storage = openStorage({ dataDirectory: path });
    storage.close();
    const filename = join(path, 'factory.sqlite');
    const db = new Database(filename);
    resources.push(db);
    db.pragma('foreign_keys = ON');
    insertProjectWithRevisions(db, true);
    const before = snapshotFiles(filename);

    expect(() => openStorage({ dataDirectory: path })).toThrowError(
      expect.objectContaining({ code: 'PROJECT_DATA_INVALID' }),
    );

    expect(snapshotFiles(filename)).toEqual(before);
  });

  it('rejects a completed creation with a retired plan contract before any file change', () => {
    const path = directory();
    const storage = openStorage({ dataDirectory: path });
    storage.close();
    const filename = join(path, 'factory.sqlite');
    const db = new Database(filename);
    resources.push(db);
    db.pragma('foreign_keys = ON');
    const projectId = insertProjectWithRevisions(db, false);
    const installationId = db.prepare<[], { installation_id: string }>(
      'SELECT installation_id FROM factory_settings WHERE id=\'local\'',
    ).get()?.installation_id;
    if (!installationId) throw new Error('INSTALLATION_FIXTURE_INVALID');
    const operationId = randomUUID();
    db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,operation_kind,resource_type,resource_id,request_hash)
      VALUES (?,?,'settings.update','settings','local',?)`).run(operationId, installationId, 'd'.repeat(64));
    const plan = legacyCreationPlan();
    db.prepare(`INSERT INTO project_creations(
      id,operation_id,installation_id,account_id,project_id,plan_hash,plan_json,destination,state,
      baseline_sha,baseline_ref,diagnostic,created_at_ms
    ) VALUES (?,?,?,NULL,?,?,?,?, 'completed',?,?,NULL,10)`).run(
      randomUUID(), operationId, installationId, projectId, digest(plan), JSON.stringify(plan), 'C:/projects/legacy',
      'e'.repeat(40), 'refs/heads/main',
    );
    const before = snapshotFiles(filename);

    expect(() => openStorage({ dataDirectory: path })).toThrowError(
      expect.objectContaining({ code: 'OPERATION_DATA_INVALID' }),
    );

    expect(snapshotFiles(filename)).toEqual(before);
  });

  it('rejects a change between snapshot inspection and the writable open', () => {
    const path = directory();
    const initial = openStorage({ dataDirectory: path });
    initial.close();
    const filename = join(path, 'factory.sqlite');
    const originalClose = Database.prototype.close;
    let changed = false;
    let changedSnapshot: Record<string, string | null> | null = null;
    Database.prototype.close = function (this: Database.Database) {
      originalClose.call(this);
      if (changed) return this;
      changed = true;
      const concurrent = new Database(filename);
      try {
        concurrent.prepare('INSERT INTO schema_migrations(version,name,checksum,applied_at_ms) VALUES (1,?,?,0)')
          .run('001_initial_settings.sql', '0'.repeat(64));
        concurrent.pragma('journal_mode = DELETE');
      } finally {
        originalClose.call(concurrent);
      }
      changedSnapshot = snapshotFiles(filename);
      return this;
    };

    try {
      expect(() => openStorage({ dataDirectory: path })).toThrowError(
        expect.objectContaining({ code: 'DATABASE_CHANGED_DURING_OPEN' }),
      );
      expect(changedSnapshot).not.toBeNull();
      expect(snapshotFiles(filename)).toEqual(changedSnapshot);
    } finally {
      Database.prototype.close = originalClose;
    }
  });
});
