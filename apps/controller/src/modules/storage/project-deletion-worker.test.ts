import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';
import { applyMigrations, loadMigrations } from '../../../../../tests/fixtures/historical-schema.js';
import { seedSettings } from './settings.js';
import { registerProject } from './configuration-writes.js';
import { digest, readProject } from './configuration-reads.js';
import { readProjectDeletionPaths } from './project-deletion-paths.js';
import { acceptProjectDeletion, readProjectDeletion, recoverProjectDeletion } from './project-deletion-acceptance.js';
import { createProjectDeletionPersistence } from './project-deletions.js';
import { createDeletionWorkerPersistence } from './project-deletion-worker.js';
import { createDeletionInspector } from '../workspaces/index.js';
import { createDeletionCoordinator } from '../projects/index.js';

const databases: Database.Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
async function fixture(kind: 'local' | 'github' = 'local', accountScoped = false) {
  const db = new Database(':memory:'); databases.push(db);
  db.pragma('foreign_keys=ON'); applyMigrations(db, loadMigrations(), () => seedSettings(db));
  const persistence = createProjectDeletionPersistence(db);
  if (accountScoped) {
    db.prepare('INSERT INTO accounts(github_account_id,login,observed_at_ms,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?)').run('account-a', 'user-a', 1, 1, 1);
    db.prepare("UPDATE factory_settings SET account_id='account-a'").run();
  }
  const directory = 'C:\\Factory\\var\\factory';
  const source = { kind, location: kind === 'local' ? 'C:\\Projects\\Exclusive' : 'https://github.com/test/exclusive' };
  const projectId = registerProject(db, { operationId: randomUUID(), expectedRevision: undefined,
    body: { name: 'Exclusive', source, base_branch: 'main' }, source, originNotes: [] }).resource.id;
  let present = true; let substituted = false; let fail = false;
  let release: (() => void) | undefined;
  let wait: Promise<void> | undefined;
  const remove = vi.fn(async () => { if (wait) await wait; if (fail) throw Object.assign(new Error(), { code: 'EBUSY' }); present = false; });
  const workspaces = createDeletionInspector({ pathStyle: 'windows', caseSensitive: false, policyVersion: 'controlled/v1', safeReferenceRemoval: true,
    observe: async path => ({ path, resolvedPath: path === source.location && !present ? null : path,
      kind: path === source.location && !present ? 'absent' : 'directory', identity: path === source.location && !present ? null : substituted && path === source.location ? 'replacement' : path,
      ancestors: [{ path: 'C:\\', identity: 'root', resolvedPath: 'C:\\' }] }), removeReference: remove });
  const inspection = await workspaces.inspectProjectDeletion(readProjectDeletionPaths(db, projectId, directory));
  expect(inspection.preview.blockers).toEqual([]);
  const project = readProject(db, projectId).project;
  const id = randomUUID();
  const command = { operationId: id, projectId,
    expectedRevision: `"${digest([project.id, project.current_revision_id, project.revision])}"`,
    body: { confirmed: true as const, authorization_digest: inspection.preview.authorization_digest } };
  acceptProjectDeletion(db, directory, { inspection, command });
  const storage = { finalizeProjectDeletion: persistence.finalize, deletionWorker: createDeletionWorkerPersistence(db, directory), getProjectDeletion: (operationId: string) => readProjectDeletion(db, operationId) };
  const logFailure = vi.fn();
  const coordinator = createDeletionCoordinator({ storage, workspaces, logFailure });
  return { db, id, projectId, command, storage, workspaces, coordinator, remove, logFailure,
    recreate: () => { present = true; },
    block: () => { wait = new Promise<void>(resolve => { release = resolve; }); },
    release: () => release?.(), fail: () => { fail = true; }, substitute: () => { substituted = true; } };
}

it('owns a single effect across concurrent schedules and resumes, without timeout stealing', async () => {
  const f = await fixture(); f.block();
  const first = f.coordinator.schedule(f.id);
  await vi.waitFor(() => expect(f.remove).toHaveBeenCalledTimes(1));
  const generation = f.db.prepare('SELECT worker_generation FROM project_deletions').get();
  const other = createDeletionCoordinator({ storage: f.storage, workspaces: f.workspaces, logFailure: f.logFailure });
  other.recover(); await other.drain();
  await f.coordinator.resume(f.id);
  expect(f.db.prepare('SELECT worker_generation FROM project_deletions').get()).toEqual(generation);
  expect(f.storage.getProjectDeletion(f.id)).toMatchObject({ state: 'running', can_retry: false });
  f.release(); await first;
  expect(f.remove).toHaveBeenCalledTimes(1);
  expect(f.storage.getProjectDeletion(f.id)).toMatchObject({ state: 'succeeded' });
  expect(f.db.prepare('SELECT * FROM project_deletion_targets').all()).toEqual([]);
});

it('prepares owned work after durable acceptance and before removing any target', async () => {
  const f = await fixture();
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const prepareAttempts = vi.fn(async () => {
    expect(f.storage.getProjectDeletion(f.id)).toMatchObject({ state: 'accepted' });
    expect(f.remove).not.toHaveBeenCalled();
    await wait;
  });
  const coordinator = createDeletionCoordinator({ storage: f.storage, workspaces: f.workspaces, logFailure: f.logFailure, prepareAttempts });
  const task = coordinator.schedule(f.id);
  await vi.waitFor(() => expect(prepareAttempts).toHaveBeenCalledWith([], f.id));
  expect(f.remove).not.toHaveBeenCalled();
  release(); await task;
  expect(f.storage.getProjectDeletion(f.id)).toEqual({ operation_id: f.id, state: 'succeeded' });
});

it('removes the project even when stopping work cannot be confirmed', async () => {
  const f = await fixture();
  const prepareAttempts = vi.fn().mockRejectedValueOnce(new Error('STOP_UNCONFIRMED'));
  const coordinator = createDeletionCoordinator({ storage: f.storage, workspaces: f.workspaces, logFailure: f.logFailure, prepareAttempts });
  await coordinator.schedule(f.id);
  expect(f.logFailure).toHaveBeenCalledWith('PROJECT_DELETION_STOP_UNCONFIRMED');
  expect(f.remove).toHaveBeenCalled();
  expect(f.storage.getProjectDeletion(f.id)).toEqual({ operation_id: f.id, state: 'succeeded' });
});

it.each(['recreated', 'unobservable'])('rechecks absence after removal and refuses a %s target before the SQL commit', async failure => {
  const f = await fixture();
  const reconcile = f.workspaces.reconcileProjectDeletion;
  vi.spyOn(f.workspaces, 'reconcileProjectDeletion').mockImplementation(async (...args) => {
    if (f.remove.mock.calls.length) {
      if (failure === 'unobservable') throw new Error('CONTROLLED_OBSERVATION_FAILURE');
      f.recreate();
    }
    return reconcile(...args);
  });
  await f.coordinator.schedule(f.id);
  expect(f.storage.getProjectDeletion(f.id)).toMatchObject({ state: 'pending' });
  expect(f.db.prepare('SELECT * FROM project_deletion_receipts').all()).toEqual([]);
  expect(f.db.prepare('SELECT id FROM projects WHERE id=?').get(f.projectId)).toBeDefined();
});

it('uses the last absence observation as the boundary without deleting a later external recreation', async () => {
  const f = await fixture();
  const finalize = f.storage.finalizeProjectDeletion;
  vi.spyOn(f.storage, 'finalizeProjectDeletion').mockImplementation(command => {
    f.recreate();
    f.substitute();
    return finalize(command);
  });
  await f.coordinator.schedule(f.id);
  expect(f.storage.getProjectDeletion(f.id)).toMatchObject({ state: 'succeeded' });
  expect(f.remove).toHaveBeenCalledTimes(1);
  expect(f.storage.deletionWorker.recover()).toEqual([]);
  await f.coordinator.drain();
  expect(f.remove).toHaveBeenCalledTimes(1);
});

it('rolls back SQL after physical absence and retries without another removal or a new authorization', async () => {
  const f = await fixture();
  const before = f.db.prepare('SELECT identity_json FROM project_deletion_targets').all();
  f.db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON project_deletion_receipts BEGIN SELECT RAISE(ABORT,'fixture'); END");
  await f.coordinator.schedule(f.id);
  expect(f.storage.getProjectDeletion(f.id)).toMatchObject({ state: 'pending', can_retry: true });
  expect(f.db.prepare('SELECT identity_json FROM project_deletion_targets').all()).toEqual(before);
  expect(f.db.prepare('SELECT id FROM projects WHERE id=?').get(f.projectId)).toBeDefined();
  expect(f.db.prepare('SELECT * FROM project_deletion_receipts').all()).toEqual([]);
  f.db.exec('DROP TRIGGER fail_receipt');
  await f.coordinator.resume(f.id); await f.coordinator.drain();
  expect(f.remove).toHaveBeenCalledTimes(1);
  expect(recoverProjectDeletion(f.db, f.command)).toEqual({ operation_id: f.id, state: 'succeeded' });
  expect(() => recoverProjectDeletion(f.db, { ...f.command, expectedRevision: 'different' }))
    .toThrow(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }));
  expect(f.db.pragma('foreign_key_check')).toEqual([]);
  expect(f.logFailure.mock.calls).toEqual([['PROJECT_DELETION_INTERRUPTED']]);
});

it('cannot finalize with a generation invalidated after the last filesystem observation', async () => {
  const f = await fixture();
  const finalize = f.storage.finalizeProjectDeletion;
  vi.spyOn(f.storage, 'finalizeProjectDeletion').mockImplementation(command => {
    f.db.prepare('UPDATE project_deletions SET worker_generation=worker_generation+1').run();
    return finalize(command);
  });
  await f.coordinator.schedule(f.id);
  expect(f.db.prepare('SELECT * FROM project_deletion_receipts').all()).toEqual([]);
  expect(f.db.prepare('SELECT id FROM projects WHERE id=?').get(f.projectId)).toBeDefined();
});

it('rejects an expanded managed target inventory before any physical effect', async () => {
  const f = await fixture();
  f.db.prepare(`INSERT INTO project_storage_locations(id,project_id,location_key,layout_version,root_relative,object_identity_json,is_current,created_at_ms,verified_at_ms)
    VALUES (?,?,'managed',1,?,?,1,0,0)`).run(randomUUID(),f.projectId,`var/factory/projects/${f.projectId}/v1/managed`,
      JSON.stringify({format_version:1,volume_id:'fixture',object_id:'fixture',ancestors:[{}]}));
  await f.coordinator.schedule(f.id);
  expect(f.remove).not.toHaveBeenCalled();
  expect(f.storage.getProjectDeletion(f.id)).toMatchObject({state:'reconfirmation_required'});
  expect(f.db.prepare('SELECT * FROM project_deletion_receipts').all()).toEqual([]);
});

it('keeps failures pending without polling retries and resumes the same operation manually', async () => {
  const f = await fixture(); f.fail();
  await f.coordinator.schedule(f.id);
  expect(f.storage.getProjectDeletion(f.id)).toMatchObject({ state: 'pending', can_retry: true });
  for (let i = 0; i < 5; i++) f.storage.getProjectDeletion(f.id);
  await f.coordinator.drain(); expect(f.remove).toHaveBeenCalledTimes(1);
  await f.coordinator.resume(f.id);
  await f.coordinator.drain();
  expect(f.remove).toHaveBeenCalledTimes(2);
  expect(f.db.prepare("SELECT count(*) AS n FROM operation_requests WHERE operation_kind='project.delete'").get()).toEqual({ n: 1 });
});

it('never adopts a replacement and manual reinspection preserves the original identity', async () => {
  const f = await fixture(); f.substitute();
  const before = f.db.prepare('SELECT identity_json FROM project_deletion_targets').get();
  await f.coordinator.schedule(f.id);
  expect(f.storage.getProjectDeletion(f.id)).toMatchObject({ state: 'reconfirmation_required', can_retry: true });
  await expect(f.coordinator.resume(f.id)).rejects.toMatchObject({ statusCode: 409 });
  expect(f.remove).not.toHaveBeenCalled();
  expect(f.db.prepare('SELECT identity_json FROM project_deletion_targets').get()).toEqual(before);
});

it.each(['accepted', 'running', 'pending', 'finalizing'])('recovers %s once after reconciling dead ownership', async state => {
  const f = await fixture();
  f.db.prepare("UPDATE project_deletions SET state=?,worker_token='dead-process',reason='Interrupted',recovery='Retry'").run(state);
  f.coordinator.recover(); await f.coordinator.drain();
  expect(f.storage.getProjectDeletion(f.id)).toMatchObject({ state: 'succeeded' });
  expect(f.remove).toHaveBeenCalledTimes(1);
  f.coordinator.recover(); await f.coordinator.drain(); expect(f.remove).toHaveBeenCalledTimes(1);
});

it('does not recover reconfirmation automatically and rejects stale fenced progress', async () => {
  const f = await fixture();
  f.db.prepare("UPDATE project_deletions SET state='reconfirmation_required',reason='Changed',recovery='Inspect'").run();
  f.coordinator.recover(); await f.coordinator.drain(); expect(f.remove).not.toHaveBeenCalled();
  const worker = f.storage.deletionWorker.claim(f.id)!;
  f.db.prepare('UPDATE project_deletions SET worker_generation=worker_generation+1').run();
  expect(() => f.storage.deletionWorker.progress(worker, `original:invalid`, 'removed')).toThrow(expect.objectContaining({ code: 'PROJECT_DELETION_OWNERSHIP_LOST' }));
});

it('reconciles removing after a physical effect whose progress commit failed', async () => {
  const f = await fixture();
  f.db.exec("CREATE TRIGGER fail_removed BEFORE UPDATE ON project_deletion_targets WHEN NEW.state='removed' BEGIN SELECT RAISE(ABORT,'CONTROLLED_FAILURE'); END");
  await f.coordinator.schedule(f.id);
  expect(f.storage.getProjectDeletion(f.id)).toMatchObject({ state: 'pending', can_retry: true });
  expect(f.db.prepare('SELECT state FROM project_deletion_targets').get()).toEqual({ state: 'removing' });
  f.db.exec('DROP TRIGGER fail_removed');
  await f.coordinator.resume(f.id);
  await f.coordinator.drain();
  expect(f.remove).toHaveBeenCalledTimes(1);
  expect(f.storage.getProjectDeletion(f.id)).toMatchObject({ state: 'succeeded' });
});

it('a failed startup attempt waits for manual retry or another process restart', async () => {
  const f = await fixture(); f.fail();
  f.coordinator.recover(); await f.coordinator.drain();
  f.coordinator.recover(); await f.coordinator.drain();
  expect(f.remove).toHaveBeenCalledTimes(1);
  expect(f.storage.getProjectDeletion(f.id)).toMatchObject({ state: 'pending', can_retry: true });
});

it('hands an empty URL-only target set to finalization without discovering folders', async () => {
  const f = await fixture('github');
  await f.coordinator.schedule(f.id);
  expect(f.remove).not.toHaveBeenCalled();
  expect(f.storage.getProjectDeletion(f.id)).toMatchObject({ state: 'succeeded' });
});

it('returns from resume after reconference while an owned removal remains in progress', async () => {
  const f = await fixture(); f.fail(); await f.coordinator.schedule(f.id);
  f.block();
  await f.coordinator.resume(f.id);
  await vi.waitFor(() => expect(f.remove).toHaveBeenCalledTimes(2));
  expect(f.storage.getProjectDeletion(f.id)).toMatchObject({ state: 'running', can_retry: false });
  f.release(); await f.coordinator.drain();
  expect(f.storage.getProjectDeletion(f.id)).toMatchObject({ state: 'pending', can_retry: true });
});

it('recovers the exact authorization after account selection changes without broadening reads', async () => {
  const f = await fixture('local', true);
  f.db.prepare('UPDATE factory_settings SET account_id=NULL').run();
  expect(() => readProject(f.db, f.db.prepare<[], { project_id: string }>('SELECT project_id FROM project_deletions').get()!.project_id)).toThrow();
  f.coordinator.recover(); await f.coordinator.drain();
  expect(f.storage.getProjectDeletion(f.id)).toEqual({ operation_id: f.id, state: 'succeeded' });
  expect(f.remove).toHaveBeenCalledTimes(1);
});
