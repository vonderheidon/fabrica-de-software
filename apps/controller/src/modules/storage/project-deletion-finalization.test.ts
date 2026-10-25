import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openStorage } from './index.js';
import { applyMigrations, loadMigrations } from './migrations.js';
import { seedSettings } from './settings.js';
import { createProjectDeletionPersistence } from './project-deletions.js';
import { deletionTables, identifier, keyExpression, primaryKey, type ProjectDeletionInventory } from './project-deletion-inventory.js';
import { projectDeletionHistory } from '../../../../../tests/fixtures/project-deletion-history.js';
import { randomUUID } from 'node:crypto';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });
function fixture(upgrade = false, automationEnabled = false) {
  const path = mkdtempSync(join(tmpdir(), 'factory-deletion-closure-'));
  cleanup.push(() => rmSync(path, { recursive: true }));
  const db = new Database(join(path, 'factory.sqlite'));
  cleanup.push(() => db.close());
  db.pragma('foreign_keys=ON');
  const migrations = loadMigrations();
  applyMigrations(db, upgrade ? migrations.slice(0, 24) : migrations, () => seedSettings(db));
  // Upgrade fixture contains complete historical data before either new delta.
  const history = projectDeletionHistory(db, () => {
    if (upgrade) {
      const before = snapshot(db);
      applyMigrations(db, migrations.slice(0, 25), () => { throw new Error('UNEXPECTED_RESEED'); });
      const after = snapshot(db);
      for (const [table, rows] of Object.entries(before)) {
        if (table !== 'schema_migrations') expect(after[table], table).toEqual(rows);
      }
    }
  }, automationEnabled);
  const ledger = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
  if (upgrade) applyMigrations(db, migrations, () => { throw new Error('UNEXPECTED_RESEED'); });
  expect(db.prepare('SELECT * FROM schema_migrations WHERE version<=? ORDER BY version').all(ledger.length)).toEqual(ledger);
  const storage = openStorage({ dataDirectory: path });
  cleanup.push(() => storage.close());
  // Same production capability on an isolated SQL connection, for adversarial
  // trigger probes. No test setter or callback is part of the production API.
  const persistence = createProjectDeletionPersistence(db);
  expect(db.pragma('foreign_key_check')).toEqual([]);
  return { db, storage, persistence, path, ...history };
}
function snapshot(db: Database.Database) {
  return Object.fromEntries(db.prepare<[], { name: string }>("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    .map(({ name }) => [name, db.prepare(`SELECT * FROM ${identifier(name)} ORDER BY rowid`).all()]));
}
function closed(db: Database.Database, operationId: string) {
  expect(db.inTransaction).toBe(false);
  expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  expect(db.pragma('defer_foreign_keys', { simple: true })).toBe(0);
  expect(db.pragma('foreign_key_check')).toEqual([]);
  expect(db.prepare("SELECT factory_project_deletion_row_allowed('projects','[]',NULL) AS allowed").get()).toEqual({ allowed: 0 });
  expect(db.prepare('SELECT factory_project_deletion_finalization_allowed(?) AS allowed').get(operationId)).toEqual({ allowed: 0 });
}
function guardedRows(db: Database.Database, keys: ProjectDeletionInventory) {
  for (const table of deletionTables) {
    if (!keys.keys[table].length) continue;
    expect(() => db.prepare(`DELETE FROM ${identifier(table)} WHERE ${keyExpression(primaryKey(db, table))}
      IN (SELECT value FROM json_each(?))`).run(JSON.stringify(keys.keys[table]))).toThrow();
  }
}

describe('exclusive project deletion closure and transactional finalization', () => {
  it.each([false, true])('registers the same repository with a fresh identity and no inherited history after reopen (upgrade=%s)', upgrade => {
    const f = fixture(upgrade, true);
    expect(f.storage.getConfiguration(f.selected.projectId).view.configuration.automation_enabled).toBe(true);
    const otherInventory = f.storage.getProjectDeletionInventory(f.other.projectId);
    const before = snapshot(f.db);
    const foreignRows = () => Object.fromEntries(deletionTables.map(table => {
      const pk = primaryKey(f.db, table);
      return [table, (snapshot(f.db)[table] as Record<string, unknown>[]).filter(row =>
        otherInventory.keys[table].includes(JSON.stringify(pk.map(column => row[column]))))];
    }));
    const preserved = foreignRows();
    f.storage.finalizeProjectDeletion(f.command);
    expect(foreignRows()).toEqual(preserved);
    const register = () => f.storage.registerProject({ operationId: randomUUID(), expectedRevision: undefined,
      body: { name: 'Same name', source: { kind: 'github', location: 'https://github.com/fixture/shared' }, base_branch: 'main' },
      source: { kind: 'github', location: 'https://github.com/fixture/shared', repository_id: 'shared-repository',
        repository_url: 'https://github.com/fixture/shared' }, originNotes: [] });
    const operation = register();
    const projectId = operation.resource.id;
    expect([f.selected.projectId, f.other.projectId]).not.toContain(projectId);
    expect(f.storage.getConfiguration(projectId).view.configuration).toMatchObject({ automation_enabled: false,
      implementer_profile_id: null, reviewer_profile_id: null, github_project: null });
    const inventory = f.storage.getProjectDeletionInventory(projectId);
    for (const table of deletionTables.filter(table => !['projects', 'project_revisions', 'operation_requests', 'events'].includes(table))) {
      expect(inventory.keys[table], table).toEqual([]);
    }
    expect(foreignRows()).toEqual(preserved); // Includes the other registration's Ready deduplication.
    for (const table of ['accounts', 'execution_profiles', 'factory_settings', 'controller_authority', 'schema_migrations']) {
      expect(snapshot(f.db)[table], table).toEqual(before[table]);
    }
    f.storage.close();
    const reopened = openStorage({ dataDirectory: f.path });
    cleanup.push(() => reopened.close());
    expect(reopened.getConfiguration(projectId).view.configuration.automation_enabled).toBe(false);
    expect(reopened.getProjectDeletion(f.command.operationId)).toEqual({ operation_id: f.command.operationId, state: 'succeeded' });
    expect(foreignRows()).toEqual(preserved);
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
  });
  it.each([false, true])('selects every exclusive table, isolates shared contexts and removes the complete cycles (upgrade=%s)', upgrade => {
    const f = fixture(upgrade);
    f.db.prepare('UPDATE factory_settings SET account_id=?').run(f.accountId);
    for (const owner of [f.selected, f.other]) {
      const previous = f.db.prepare('SELECT result FROM attempts WHERE id=?').get(owner.attemptId) as { result: string };
      const operationId = f.operation('attempt', owner.attemptId, 'attempt.start');
      const event = (type: string, revision: number) => f.db.prepare(`INSERT INTO events(entity_type,entity_id,project_id,attempt_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms)
        VALUES ('attempt',?,?,?,?,?,?,'{}',1)`).run(owner.attemptId, owner.projectId, owner.attemptId, operationId, type, revision);
      f.db.prepare("UPDATE attempts SET phase='implementing',result=NULL WHERE id=?").run(owner.attemptId);
      event('attempt.accepted', 1);
      f.db.prepare("UPDATE attempts SET phase='finished',result=? WHERE id=?").run(previous.result, owner.attemptId);
      const completion = event('attempt.icr-completed', 2);
      const installation = f.storage.getSettings().installation_id;
      const dispatchId = randomUUID();
      f.db.prepare(`INSERT INTO notification_dispatches(installation_id,consumer_id,surface,event_seq,dispatch_id,state,created_at_ms,updated_at_ms)
        VALUES (?,?,'browser_host',?,?,'reserved',1,1)`).run(installation, randomUUID(), completion.lastInsertRowid, dispatchId);
      f.operation('notification', dispatchId, 'notification.claim');
    }
    const inventory = f.storage.getProjectDeletionInventory(f.selected.projectId);
    const removedNotification = f.db.prepare(`SELECT n.event_seq,n.consumer_id FROM notification_dispatches n JOIN events e ON e.seq=n.event_seq WHERE e.attempt_id=?`)
      .get(f.selected.attemptId) as { event_seq: number; consumer_id: string };
    expect(inventory.blockers).toEqual([]);
    expect(Object.keys(inventory.keys).sort()).toEqual([...deletionTables].sort());
    for (const table of deletionTables) {
      // This historical fixture predates progress tracking; migrations must not invent assessments or blocks.
      if (table === 'delivery_targets' || table === 'publication_target_selections' || table === 'attempt_decisions' || table === 'finding_disputes' || table === 'finding_assessments' || table === 'attempt_blocks' ||
        table === 'project_storage_locations' || table === 'project_storage_transitions' || table === 'creation_board_operations' ||
        (upgrade && (table === 'attempt_sessions' || table === 'terminal_occupancies'))) expect(inventory.keys[table], table).toEqual([]);
      else expect(inventory.keys[table].length, table).toBeGreaterThan(0);
    }
    const other = f.storage.getProjectDeletionInventory(f.other.projectId);
    for (const table of deletionTables) expect(inventory.keys[table].filter(key => other.keys[table].includes(key)), table).toEqual([]);
    expect(inventory.keys.operation_requests).not.toContain(JSON.stringify([f.globalOperation]));
    expect(inventory.keys.operation_requests).not.toContain(JSON.stringify([f.globalQueueOperation]));
    const sharedManagedTerminals = f.db.prepare('SELECT * FROM managed_terminals ORDER BY id').all();
    const preserved = snapshot(f.db);
    const objects = f.db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    guardedRows(f.db, inventory);
    expect(f.storage.finalizeProjectDeletion(f.command)).toEqual({ operation_id: f.command.operationId, state: 'succeeded' });
    expect(f.db.prepare('SELECT * FROM managed_terminals ORDER BY id').all()).toEqual(sharedManagedTerminals);
    for (const table of deletionTables) {
      const actual = f.db.prepare(`SELECT * FROM ${identifier(table)} ORDER BY rowid`).all();
      const pk = primaryKey(f.db, table);
      const expected = (preserved[table] as Record<string, unknown>[]).filter(row => !inventory.keys[table].includes(JSON.stringify(pk.map(column => row[column]))));
      expect(actual, table).toEqual(expected);
    }
    expect(f.storage.getProjectDeletionInventory(f.selected.projectId).keys).toEqual(Object.fromEntries(deletionTables.map(table => [table, []])));
      expect(() => f.storage.claimNotification({ operationId: randomUUID(), expectedRevision: undefined, body: {
        consumer_id: removedNotification.consumer_id, surface: 'browser_host', event_seq: String(removedNotification.event_seq),
      } })).toThrow(expect.objectContaining({ statusCode: 404 }));
    for (const table of ['accounts', 'execution_profiles', 'factory_settings', 'controller_authority', 'schema_migrations']) {
      expect(f.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(), table).toEqual(preserved[table]);
    }
    expect(f.db.prepare('SELECT * FROM project_deletion_receipts').all()).toEqual([
      { operation_id: f.command.operationId, request_fingerprint: 'a'.repeat(64), result: 'succeeded' },
    ]);
    expect(() => f.db.exec("UPDATE project_deletion_receipts SET result='succeeded'")).toThrow('IMMUTABLE_RECORD');
    expect(() => f.db.exec('DELETE FROM project_deletion_receipts')).toThrow('IMMUTABLE_RECORD');
    expect(f.db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()).toEqual(objects);
    closed(f.db, f.command.operationId);
    guardedRows(f.db, other);
    expect(() => f.db.exec("UPDATE project_revisions SET guidance='changed'")).toThrow('IMMUTABLE_RECORD');
    expect(() => f.db.exec('DELETE FROM execution_profiles')).toThrow('IMMUTABLE_RECORD');
  });

  it('blocks a foreign queue cycle without taking its ownership or changing foreign deduplication', () => {
    const f = fixture();
    f.db.prepare('UPDATE queue_cycles SET consumed_attempt_id=? WHERE project_id=?').run(f.selected.attemptId, f.other.projectId);
    const before = snapshot(f.db);
    const inventory = f.storage.getProjectDeletionInventory(f.selected.projectId);
    expect(inventory.blockers).toContainEqual(expect.objectContaining({ table: 'queue_cycles', code: 'PROJECT_DELETION_EXTERNAL_REFERENCE',
      reason: expect.any(String), recovery: expect.any(String) }));
    expect(inventory.keys.queue_cycles).toHaveLength(1);
    expect(() => f.storage.finalizeProjectDeletion(f.command)).toThrow();
    expect(snapshot(f.db)).toEqual(before);
    closed(f.db, f.command.operationId);
  });

  it('blocks conflicting domain ownership without absorbing a global operation', () => {
    const f = fixture();
    f.event('attempt', f.selected.attemptId, f.globalOperation);
    const before = snapshot(f.db);
    const inventory = f.storage.getProjectDeletionInventory(f.selected.projectId);
    expect(inventory.blockers).toContainEqual(expect.objectContaining({ table: 'events', code: 'PROJECT_DELETION_AMBIGUOUS_OWNERSHIP' }));
    expect(inventory.keys.operation_requests).not.toContain(JSON.stringify([f.globalOperation]));
    expect(() => f.storage.finalizeProjectDeletion(f.command)).toThrow();
    expect(snapshot(f.db)).toEqual(before);
  });

  it('rejects existing pending rows, wrong project/generation/token and unverified targets without enabling DELETE', () => {
    const f = fixture(); const inventory = f.persistence.inventory(f.selected.projectId);
    guardedRows(f.db, inventory);
    for (const command of [
      { ...f.command, projectId: f.other.projectId }, { ...f.command, workerGeneration: 1 },
      { ...f.command, workerToken: 'other' }, { ...f.command, operationId: f.globalOperation },
    ]) {
      const before = snapshot(f.db);
      expect(() => f.persistence.finalize(command)).toThrow();
      expect(snapshot(f.db)).toEqual(before);
      closed(f.db, f.command.operationId);
    }
    f.db.prepare("UPDATE project_deletions SET state='finalizing' WHERE operation_id=?").run(f.command.operationId);
    guardedRows(f.db, inventory); // Even finalizing in SQL is not a capability.
    f.db.exec("UPDATE project_deletion_targets SET state='pending'");
    expect(() => f.persistence.finalize(f.command)).toThrow();
    closed(f.db, f.command.operationId);
  });

  it.each(['ABORT', 'ROLLBACK'])('rolls back every SQL record and the pending authorization after injected %s', action => {
    const f = fixture(); const before = snapshot(f.db);
    f.db.exec(`CREATE TRIGGER injected_finalization_failure BEFORE DELETE ON projects
      BEGIN SELECT RAISE(${action},'injected finalization failure'); END;`);
    expect(() => f.persistence.finalize(f.command)).toThrow('injected finalization failure');
    expect(snapshot(f.db)).toEqual(before);
    closed(f.db, f.command.operationId);
    guardedRows(f.db, f.persistence.inventory(f.selected.projectId));
    f.db.exec('DROP TRIGGER injected_finalization_failure');
    expect(f.persistence.finalize(f.command).state).toBe('succeeded');
    closed(f.db, f.command.operationId);
  });

  it('cleans context when the final receipt INSERT fails after all deletes', () => {
    const f = fixture(); const before = snapshot(f.db);
    f.db.exec("CREATE TRIGGER injected_receipt_failure BEFORE INSERT ON project_deletion_receipts BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END;");
    expect(() => f.persistence.finalize(f.command)).toThrow('injected receipt failure');
    expect(snapshot(f.db)).toEqual(before);
    closed(f.db, f.command.operationId);
    guardedRows(f.db, f.persistence.inventory(f.selected.projectId));
    f.db.exec('DROP TRIGGER injected_receipt_failure');
    expect(f.persistence.finalize(f.command).state).toBe('succeeded');
    closed(f.db, f.command.operationId);
  });

  it('checks generation and exact foreign keys inside the active context and preserves UPDATE guards', () => {
    const f = fixture(); const before = snapshot(f.db);
    // Probe during the first DELETE, before the authorizing project disappears.
    f.db.exec(`CREATE TRIGGER probe_context BEFORE DELETE ON events BEGIN
      SELECT CASE WHEN factory_project_deletion_row_allowed('projects',json_array('${f.other.projectId}'),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation()))<>0
        THEN RAISE(ABORT,'foreign key authorized') END;
      SELECT CASE WHEN factory_project_deletion_row_allowed('projects',json_array('${f.selected.projectId}'),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation()))<>1
        THEN RAISE(ABORT,'selected key unauthorized') END;
      UPDATE project_revisions SET guidance='forbidden' WHERE project_id='${f.selected.projectId}';
    END;`);
    expect(() => f.persistence.finalize(f.command)).toThrow('IMMUTABLE_RECORD');
    expect(snapshot(f.db)).toEqual(before);
    f.db.exec('DROP TRIGGER probe_context');
    f.db.exec(`CREATE TRIGGER invalidate_generation BEFORE DELETE ON events BEGIN
      UPDATE project_deletions SET worker_generation=worker_generation+1;
      SELECT CASE WHEN factory_project_deletion_row_allowed('projects',json_array('${f.selected.projectId}'),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation()))<>0
        THEN RAISE(ABORT,'stale generation authorized') END;
    END;`);
    expect(() => f.persistence.finalize(f.command)).toThrow();
    expect(snapshot(f.db)).toEqual(before);
    closed(f.db, f.command.operationId);
  });

  it('refuses nested finalization so deferral cannot escape into a caller transaction', () => {
    const f = fixture(); const before = snapshot(f.db);
    expect(() => f.db.transaction(() => f.persistence.finalize(f.command))()).toThrow('PROJECT_DELETION_TRANSACTION_REQUIRED');
    expect(snapshot(f.db)).toEqual(before);
    closed(f.db, f.command.operationId);
  });

  it.each(["worker_token='replaced'", "state='running'"])(
    'rejects live authority changes during DELETE (%s)', assignment => {
      const f = fixture(); const before = snapshot(f.db);
      f.db.exec(`CREATE TRIGGER invalidate_authority BEFORE DELETE ON events BEGIN
        UPDATE project_deletions SET ${assignment};
      END;`);
      expect(() => f.persistence.finalize(f.command)).toThrow('IMMUTABLE_RECORD');
      expect(snapshot(f.db)).toEqual(before);
      closed(f.db, f.command.operationId);
      guardedRows(f.db, f.persistence.inventory(f.selected.projectId));
    },
  );
});
