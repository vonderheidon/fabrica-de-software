import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Writable } from 'node:stream';
import { createApp } from '../../http/app.js';
import { loadConfiguration } from '../../config.js';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyMigrations, loadMigrations } from './migrations.js';
import { seedSettings } from './settings.js';
import { configurationETag, digest, readConfiguration, readProject } from './configuration-reads.js';
import { registerProject, saveConfiguration, saveSettings } from './configuration-writes.js';
import { savePreparation } from './preparations.js';
import { readProjectDeletionPaths } from './project-deletion-paths.js';
import { acceptProjectDeletion, recoverProjectDeletion, type ProjectDeletionCommand } from './project-deletion-acceptance.js';
import { assertDeletionPathsAvailable, assertDeletionQuiescent } from './project-deletion-barrier.js';
import { createProjectDeletionPersistence } from './project-deletions.js';
import { createDeletionInspector } from '../workspaces/index.js';
import { createProjectDeletions, createQueue, createDeletionCoordinator } from '../projects/index.js';
import { createPipeline } from '../pipeline/index.js';
import { recordQueueObservations } from './queue-cycles.js';
import { attemptFixture, complete, confirmTerminalStops } from '../../../../../tests/fixtures/attempt.js';
import { publicationFixture } from '../../../../../tests/fixtures/publication.js';
import { openStorage } from './index.js';

const close: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const action of close.splice(0).reverse()) await action(); });
const inspector = () => createDeletionInspector({ pathStyle: 'windows', caseSensitive: false,
  policyVersion: 'controlled-reference-capability/v1', safeReferenceRemoval: true,
  observe: async path => ({ path, resolvedPath: path, kind: 'directory', identity: path.toLowerCase(),
    ancestors: [{ path: 'C:\\', resolvedPath: 'C:\\', identity: 'volume-root' }] }) });

function fixture() {
  const db = new Database(':memory:'); close.push(() => { db.close(); });
  db.pragma('foreign_keys=ON'); applyMigrations(db, loadMigrations(), () => seedSettings(db));
  const dataDirectory = 'C:\\Factory\\var\\factory';
  const register = (location = 'C:\\Projects\\Árvore', kind: 'local' | 'github' = 'local') => {
    const source = { kind, location };
    return registerProject(db, { operationId: randomUUID(), expectedRevision: undefined,
      body: { name: 'Project', source, base_branch: 'main' }, source, originNotes: [] }).resource.id;
  };
  const projectId = register();
  async function request() {
    const inspection = await inspector().inspectProjectDeletion(readProjectDeletionPaths(db, projectId, dataDirectory));
    expect(inspection.preview.blockers).toEqual([]);
    const project = readProject(db, projectId).project;
    const command: ProjectDeletionCommand = { operationId: randomUUID(), projectId,
      expectedRevision: `"${digest([project.id, project.current_revision_id, project.revision])}"`,
      body: { confirmed: true, authorization_digest: inspection.preview.authorization_digest } };
    return { command, inspection };
  }
  return { db, projectId, dataDirectory, register, request,
    accept: (input: Parameters<typeof acceptProjectDeletion>[2]) => acceptProjectDeletion(db, dataDirectory, input) };
}

describe('durable project deletion acceptance and shared authorization barrier', () => {
  it('accepts active work and automatically stops it before the deletion barrier opens', async () => {
    const f = await attemptFixture(); close.push(() => f.close());
    const prepared = await f.prepare();
    const started = await f.pipeline.startAttempt(prepared.body, prepared.context); await f.pipeline.drain();
    expect(() => assertDeletionQuiescent(f.db, f.projectId)).toThrow();
    const removed = new Set<string>();
    const removeReference = vi.fn(async (observation: { path: string }) => {
      expect(() => assertDeletionQuiescent(f.db, f.projectId)).not.toThrow();
      removed.add(observation.path);
    });
    const workspaces = createDeletionInspector({ pathStyle: 'windows', caseSensitive: false,
      policyVersion: 'controlled-reference-capability/v1', safeReferenceRemoval: true, removeReference,
      observe: async path => ({ path, resolvedPath: removed.has(path) ? null : path,
        kind: removed.has(path) ? 'absent' : 'directory', identity: removed.has(path) ? null : path.toLowerCase(),
        ancestors: [{ path: 'C:\\', resolvedPath: 'C:\\', identity: 'volume-root' }] }) });
    const inspection = await workspaces.inspectProjectDeletion(f.storage.getProjectDeletionPaths(f.projectId));
    expect(inspection.preview.can_confirm).toBe(true);
    const operationId = randomUUID();
    expect(f.storage.acceptProjectDeletion({ inspection, command: { operationId, projectId: f.projectId,
      expectedRevision: f.storage.getProject(f.projectId).etag,
      body: { confirmed: true, authorization_digest: inspection.preview.authorization_digest } } })).toMatchObject({ state: 'accepted' });
    vi.mocked(f.execution.cancelAttempt).mockImplementation(async (attemptId, id) => {
      const handles = f.persistence.recordCancellation(attemptId, id);
      for (const handle of handles) f.persistence.recordStop(handle, { passageId: handle.passageId, state: 'confirmed' });
      return handles.map(handle => ({ passageId: handle.passageId, state: 'confirmed' as const }));
    });
    const coordinator = createDeletionCoordinator({ storage: f.storage, workspaces, logFailure: f.logFailure,
      prepareAttempts: (ids, id) => f.pipeline.prepareProjectDeletion(ids, id) });
    await coordinator.schedule(operationId);
    expect(f.execution.cancelAttempt).toHaveBeenCalledWith(started.resource.id, operationId);
    expect(removeReference).toHaveBeenCalled();
    expect(f.storage.getProjectDeletion(operationId)).toEqual({ operation_id: operationId, state: 'succeeded' });
    expect(f.db.prepare('SELECT id FROM projects WHERE id=?').get(f.projectId)).toBeUndefined();
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
  });
  it('commits one operation, pending authorization, metadata-only targets and event; replay precedes CAS', async () => {
    const f = fixture(); const input = await f.request();
    const pending = f.accept(input);
    expect(pending.state).toBe('accepted');
    expect(recoverProjectDeletion(f.db, input.command)).toEqual(pending);
    expect(f.accept(input)).toEqual(pending);
    expect(f.db.prepare("SELECT count(*) AS n FROM operation_requests WHERE operation_kind='project.delete'").get()).toEqual({ n: 1 });
    expect(f.db.prepare('SELECT count(*) AS n FROM project_deletions').get()).toEqual({ n: 1 });
    expect(f.db.prepare("SELECT count(*) AS n FROM events WHERE event_type='project.deletion.accepted'").get()).toEqual({ n: 1 });
    const targets = f.db.prepare('SELECT * FROM project_deletion_targets').all();
    expect(targets).toHaveLength(1);
    expect(JSON.stringify(targets)).not.toMatch(/checkout|transcript|content_bytes|cache_bytes/);
    expect(() => recoverProjectDeletion(f.db, { ...input.command, expectedRevision: 'different' })).toThrow(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }));
    expect(() => f.accept({ ...input, command: { ...input.command, operationId: randomUUID() } })).toThrow(expect.objectContaining({
      code: 'PROJECT_DELETION_PENDING', details: expect.objectContaining({ facts: { operation_id: input.command.operationId } }),
    }));
  });

  it.each(['operation_requests','project_deletions','project_deletion_targets','events'])('rolls back every authorization component when %s fails', async table => {
    const f = fixture(); const input = await f.request();
    f.db.exec(`CREATE TRIGGER fail_accept BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'INJECTED_FAILURE'); END`);
    expect(() => f.accept(input)).toThrow('INJECTED_FAILURE');
    expect(f.db.inTransaction).toBe(false);
    expect(f.db.prepare('SELECT operation_id FROM operation_requests WHERE operation_id=?').get(input.command.operationId)).toBeUndefined();
    expect(f.db.prepare('SELECT * FROM project_deletions').all()).toEqual([]);
    expect(f.db.prepare('SELECT * FROM project_deletion_targets').all()).toEqual([]);
    f.db.exec('DROP TRIGGER fail_accept');
    expect(f.accept(input).state).toBe('accepted');
  });

  it('rejects missing/stale CAS, altered digest and stale inventory without leaving authorization', async () => {
    const f = fixture(); const input = await f.request();
    expect(() => f.accept({ ...input, command: { ...input.command, expectedRevision: undefined } })).toThrow(expect.objectContaining({ statusCode: 428 }));
    expect(() => f.accept({ ...input, command: { ...input.command, expectedRevision: 'old' } })).toThrow(expect.objectContaining({ statusCode: 412 }));
    expect(() => f.accept({ ...input, command: { ...input.command, body: { confirmed: true, authorization_digest: 'b'.repeat(64) } } })).toThrow(expect.objectContaining({ code: 'PROJECT_DELETION_PREVIEW_CHANGED' }));
    f.register('C:\\Projects\\Árvore\\child');
    expect(() => f.accept(input)).toThrow(expect.objectContaining({ code: 'PROJECT_DELETION_PREVIEW_CHANGED' }));
    expect(f.db.prepare('SELECT * FROM project_deletions').all()).toEqual([]);
  });

  it('serializes later registration, recadastro, source changes, shared roots and scaffold paths against all pending targets', async () => {
    const f = fixture(); const otherId = f.register('C:\\Independent'); const input = await f.request(); f.accept(input);
    for (const path of ['C:\\Projects\\Árvore','c:/projects/árvore/child','C:\\Projects']) {
      expect(() => f.register(path)).toThrow(expect.objectContaining({ code: 'PROJECT_DELETION_PENDING' }));
      expect(() => assertDeletionPathsAvailable(f.db, [path])).toThrow(expect.objectContaining({ code: 'PROJECT_DELETION_PENDING' }));
    }
    const view = readConfiguration(f.db, otherId);
    const { id: _id, project_id: _project, revision: _revision, created_at_ms: _time, ...configuration } = view.configuration;
    const source = { kind: 'local' as const, location: 'C:\\Projects\\Árvore\\child' };
    expect(() => saveConfiguration(f.db, { projectId: otherId, operationId: randomUUID(), expectedRevision: configurationETag(view),
      body: { project_changes: { source } }, configuration: { ...configuration, source }, globalChanges: {} })).toThrow(expect.objectContaining({ code: 'PROJECT_DELETION_PENDING' }));
    const settings = readConfiguration(f.db, otherId);
    const { configuration: _configuration, prerequisites: _prerequisites, ...settingsView } = settings;
    expect(() => saveSettings(f.db, { operationId: randomUUID(), expectedRevision: configurationETag(settingsView),
      body: { changes: { projects_root: source.location } }, changes: { projects_root: source.location } })).toThrow(expect.objectContaining({ code: 'PROJECT_DELETION_PENDING' }));
    expect(f.register('C:\\Independent-copy')).toBeTruthy();
    expect(f.register('https://github.com/example/same-repository', 'github')).toBeTruthy();
  });

  it('rejects configuration and preparation with the pending barrier and exposes a negative prerequisite', async () => {
    const f = fixture(); const view = readConfiguration(f.db, f.projectId);
    const input = await f.request(); f.accept(input);
    const { id: _id, project_id: _project, revision: _revision, created_at_ms: _time, ...configuration } = view.configuration;
    expect(() => saveConfiguration(f.db, { projectId: f.projectId, operationId: randomUUID(), expectedRevision: configurationETag(view),
      body: { project_changes: { guidance: 'new' } }, configuration: { ...configuration, guidance: 'new' }, globalChanges: {} })).toThrow(expect.objectContaining({ code: 'PROJECT_DELETION_PENDING' }));
    expect(() => savePreparation(f.db, { configurationETag: configurationETag(view), command: { kind: 'preparation.create', projectId: f.projectId,
      operationId: randomUUID(), expectedRevision: undefined, body: { issue_id: 'I_test', delivery_mode: 'icr', guidance: '', overrides: {} } } })).toThrow(expect.objectContaining({ code: 'PROJECT_DELETION_PENDING' }));
    expect(readProject(f.db, f.projectId).prerequisites).toContainEqual(expect.objectContaining({ code: 'PROJECT_DELETION_PENDING' }));
    recordQueueObservations(f.db, [{ projectId: f.projectId, accountId: 'unlinked', issueId: 'I_test', ready: true, eligible: true, existingAttemptId: null }]);
    expect(f.db.prepare('SELECT * FROM queue_cycles').all()).toEqual([]);
  });

  it('keeps only the original minimal receipt after SQL finalization and resolves it before the removed registration', async () => {
    const f = fixture(); const input = await f.request(); f.accept(input);
    f.db.prepare("UPDATE project_deletions SET state='running',worker_token='controlled-worker',worker_generation=1 WHERE operation_id=?").run(input.command.operationId);
    // Controlled absence observation; this test does not delete any filesystem path.
    f.db.prepare("UPDATE project_deletion_targets SET state='removed',verified_at_ms=1 WHERE operation_id=?").run(input.command.operationId);
    createProjectDeletionPersistence(f.db).finalize({ projectId: f.projectId, operationId: input.command.operationId, workerToken: 'controlled-worker', workerGeneration: 1 });
    expect(recoverProjectDeletion(f.db, input.command)).toEqual({ operation_id: input.command.operationId, state: 'succeeded' });
    expect(f.db.prepare('SELECT * FROM projects').all()).toEqual([]);
    expect(f.db.prepare('SELECT * FROM operation_requests').all()).toEqual([]);
    expect(f.db.prepare('SELECT * FROM events').all()).toEqual([]);
    expect(f.db.prepare('SELECT * FROM project_deletion_receipts').all()).toEqual([
      { operation_id: input.command.operationId, request_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), result: 'succeeded' },
    ]);
  });

  it('recovers an accepted response before inspection and refuses a second key without another filesystem observation', async () => {
    const f = await attemptFixture(); close.push(() => f.close());
    const inspect = vi.fn(inspector().inspectProjectDeletion);
    const service = createProjectDeletions({ storage: f.storage, workspaces: { inspectProjectDeletion: inspect } });
    const preview = await service.preview(f.projectId);
    const command: ProjectDeletionCommand = { operationId: randomUUID(), projectId: f.projectId,
      expectedRevision: f.storage.getProject(f.projectId).etag, body: { confirmed: true, authorization_digest: preview.view.authorization_digest } };
    const result = await service.accept(command); const calls = inspect.mock.calls.length;
    expect(await service.accept(command)).toEqual(result);
    await expect(service.accept({ ...command, operationId: randomUUID() })).rejects.toMatchObject({ code: 'PROJECT_DELETION_PENDING' });
    expect(inspect).toHaveBeenCalledTimes(calls);
    await f.pipeline.close(); f.storage.close();
    const reopened = openStorage({ dataDirectory: f.directory }); close.push(() => reopened.close());
    expect(reopened.recoverProjectDeletion(command)).toEqual(result);
    expect(reopened.getOperation(command.operationId)).toMatchObject({ kind: 'project.delete', state: 'accepted' });
  });

  it('recovers only the minimal completion over HTTP after commit, reopen and a new technical session', async () => {
    const f = await attemptFixture(); close.push(() => f.close());
    const sharedOperations = f.db.prepare("SELECT * FROM operation_requests WHERE resource_type='settings'").all();
    const sharedEvents = f.db.prepare("SELECT * FROM events WHERE entity_type='settings'").all();
    const inspect = vi.fn(inspector().inspectProjectDeletion);
    const service = createProjectDeletions({ storage: f.storage, workspaces: { inspectProjectDeletion: inspect } });
    const preview = await service.preview(f.projectId);
    const command: ProjectDeletionCommand = { operationId: randomUUID(), projectId: f.projectId,
      expectedRevision: f.storage.getProject(f.projectId).etag,
      body: { confirmed: true, authorization_digest: preview.view.authorization_digest } };
    await service.accept(command);
    const worker = f.storage.deletionWorker.claim(command.operationId)!;
    f.storage.deletionWorker.start(worker);
    // Controlled physical absence, never a deletion of the operational installation.
    f.db.prepare("UPDATE project_deletion_targets SET state='removed',verified_at_ms=1").run();
    const completed = f.storage.finalizeProjectDeletion({ operationId: worker.operationId, projectId: f.projectId,
      workerToken: worker.token, workerGeneration: worker.generation });
    expect(await service.accept(command)).toEqual(completed);
    const observations = inspect.mock.calls.length;
    await f.pipeline.close();
    const logs: string[] = [];
    const stream = new Writable({ write(chunk: Buffer, _encoding, callback) { logs.push(chunk.toString('utf8')); callback(); } });
    let storage = f.storage;
    for (let generation = 0; generation < 2; generation++) {
      if (generation) { storage = openStorage({ dataDirectory: f.directory }); close.push(() => storage.close()); }
      const app = createApp(loadConfiguration({ FACTORY_LOG_LEVEL: 'info' }, f.directory), storage, stream);
      try {
        const path = `/api/v1/operations/${command.operationId}`;
        expect((await app.inject({ url: path, headers: { host: '127.0.0.1:4310' } })).statusCode).toBe(401);
        const auth = await app.inject({ method: 'POST', url: '/api/v1/session',
          headers: { host: '127.0.0.1:4310', origin: 'http://127.0.0.1:4310', 'x-factory-client': 'web' }, payload: {} });
        expect(auth.statusCode).toBe(200);
        const response = await app.inject({ url: path, headers: { host: '127.0.0.1:4310', cookie: String(auth.headers['set-cookie']).split(';')[0]! } });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual(completed);
        const normal = f.db.prepare<[], { operation_id: string }>("SELECT operation_id FROM operation_requests WHERE resource_type='settings'").get()!;
        const normalResponse = await app.inject({ url: `/api/v1/operations/${normal.operation_id}`,
          headers: { host: '127.0.0.1:4310', cookie: String(auth.headers['set-cookie']).split(';')[0]! } });
        expect(normalResponse.statusCode).toBe(200);
        expect(normalResponse.json()).toMatchObject({ operation_id: normal.operation_id, kind: 'settings.update',
          resource: { type: 'settings', id: 'local' }, receipt: expect.any(Object), request_id: expect.any(String) });
        expect(storage.getProjectDeletion(command.operationId)).toEqual(completed);
        expect(storage.recoverProjectDeletion(command)).toEqual(completed);
        expect(() => storage.recoverProjectDeletion({ ...command, expectedRevision: 'changed' }))
          .toThrow(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }));
      } finally { await app.close(); }
    }
    expect(inspect).toHaveBeenCalledTimes(observations);
    expect(f.db.prepare('SELECT * FROM projects').all()).toEqual([]);
    for (const table of ['project_deletions', 'project_deletion_targets']) {
      expect(f.db.prepare(`SELECT * FROM ${table}`).all(), table).toEqual([]);
    }
    expect(f.db.prepare('SELECT * FROM operation_requests').all()).toEqual(sharedOperations);
    expect(f.db.prepare('SELECT * FROM events').all()).toEqual(sharedEvents);
    expect(f.db.prepare('SELECT * FROM project_deletion_receipts').all()).toEqual([
      { operation_id: command.operationId, request_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), result: 'succeeded' },
    ]);
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
    expect(logs.join('')).not.toContain(f.projectId);
    expect(logs.join('')).not.toContain(command.body.authorization_digest);
    expect(logs.join('')).not.toContain(f.directory);
  });

  it('does not authorize under another SQLite writer and accepts only after a confirmed commit', async () => {
    const f = await attemptFixture(); close.push(() => f.close());
    const inspection = await inspector().inspectProjectDeletion(f.storage.getProjectDeletionPaths(f.projectId));
    const command: ProjectDeletionCommand = { operationId: randomUUID(), projectId: f.projectId,
      expectedRevision: f.storage.getProject(f.projectId).etag, body: { confirmed: true, authorization_digest: inspection.preview.authorization_digest } };
    f.db.exec('BEGIN IMMEDIATE');
    try { expect(() => f.storage.acceptProjectDeletion({ command, inspection })).toThrow(); }
    finally { f.db.exec('ROLLBACK'); }
    expect(f.storage.recoverProjectDeletion(command)).toBeNull();
    expect(f.db.prepare('SELECT * FROM project_deletions').all()).toEqual([]);
    expect(f.storage.acceptProjectDeletion({ command, inspection }).state).toBe('accepted');
    expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();
  });

  it.each(['manual','automatic'] as const)('prevents %s start after acceptance, including a request observed before the barrier', async source => {
    const f = await attemptFixture(); close.push(() => f.close());
    if (source === 'automatic') {
      await f.pipeline.close();
      f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: f.storage.getGlobalConfiguration().etag,
        body: { changes: { automation_enabled: true } }, changes: { automation_enabled: true } });
      const current = f.storage.getConfiguration(f.projectId);
      const { id: _id, project_id: _project, revision: _revision, created_at_ms: _time, ...configuration } = current.view.configuration;
      f.storage.saveConfiguration({ projectId: f.projectId, operationId: randomUUID(), expectedRevision: current.etag,
        body: { project_changes: { automation_enabled: true } }, configuration: { ...configuration, automation_enabled: true }, globalChanges: {} });
      vi.mocked(f.github.listProjectItems).mockResolvedValue(complete([{ id: 'ITEM_test', archived: false, kind: 'issue',
        contentId: f.issue.id, title: f.issue.title, url: f.issue.url, executable: true }]));
      const queue = createQueue({ storage: f.storage, github: f.github, workspaces: f.workspaces, hostName: 'test-host' });
      expect((await queue.observe({})).items.filter(item => item.eligible)).toHaveLength(1);
      f.pipeline = createPipeline({ ...f.dependencies, queue });
    }
    const prepared = await f.prepare();
    const inspection = await inspector().inspectProjectDeletion(f.storage.getProjectDeletionPaths(f.projectId));
    f.storage.acceptProjectDeletion({ inspection, command: { operationId: randomUUID(), projectId: f.projectId,
      expectedRevision: f.storage.getProject(f.projectId).etag,
      body: { confirmed: true, authorization_digest: inspection.preview.authorization_digest } } });
    if (source === 'manual') await expect(f.pipeline.startAttempt(prepared.body, prepared.context)).rejects.toMatchObject({ code: 'PROJECT_DELETION_PENDING' });
    else { await f.pipeline.tick(); await f.pipeline.drain(); }
    expect(f.db.prepare('SELECT * FROM attempts').all()).toEqual([]);
    expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();
    expect(f.execution.startPassage).not.toHaveBeenCalled();
  });

  it('repeats the barrier inside start authorization after an async observation has already begun', async () => {
    const f = await attemptFixture(); close.push(() => f.close());
    const prepared = await f.prepare();
    let reached!: () => void; let release!: () => void;
    const observing = new Promise<void>(resolve => { reached = resolve; });
    const pending = new Promise<void>(resolve => { release = resolve; });
    f.observeTools.mockImplementation(async () => { reached(); await pending; return f.tools; });
    const outcome = f.pipeline.startAttempt(prepared.body, prepared.context).then(value => ({ value }), error => ({ error: error as unknown }));
    await observing;
    const inspection = await inspector().inspectProjectDeletion(f.storage.getProjectDeletionPaths(f.projectId));
    f.storage.acceptProjectDeletion({ inspection, command: { operationId: randomUUID(), projectId: f.projectId,
      expectedRevision: f.storage.getProject(f.projectId).etag, body: { confirmed: true, authorization_digest: inspection.preview.authorization_digest } } });
    release();
    expect(await outcome).toMatchObject({ error: expect.objectContaining({ code: 'PROJECT_DELETION_PENDING' }) });
    expect(f.db.prepare('SELECT * FROM attempts').all()).toEqual([]);
    expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();
  });

  it('rejects acceptance after work wins; cancellation/lost tracking without stop confirmation remains blocking', async () => {
    const f = await attemptFixture(); close.push(() => f.close());
    const inspection = await inspector().inspectProjectDeletion(f.storage.getProjectDeletionPaths(f.projectId));
    const command: ProjectDeletionCommand = { operationId: randomUUID(), projectId: f.projectId, expectedRevision: f.storage.getProject(f.projectId).etag,
      body: { confirmed: true, authorization_digest: inspection.preview.authorization_digest } };
    const prepared = await f.prepare(); await f.pipeline.startAttempt(prepared.body, prepared.context); await f.pipeline.drain();
    expect(() => f.storage.acceptProjectDeletion({ command, inspection })).toThrow();
    expect(() => assertDeletionQuiescent(f.db, f.projectId)).toThrow(expect.objectContaining({ code: 'PROJECT_DELETION_ACTIVITY_BLOCKED' }));
    f.db.prepare("UPDATE attempts SET phase='finished',result='cancelled',suspension=NULL WHERE project_id=?").run(f.projectId);
    f.db.prepare("UPDATE resources SET stop_state='uncertain' WHERE attempt_id IN (SELECT id FROM attempts WHERE project_id=?) AND kind='terminal'").run(f.projectId);
    expect(() => assertDeletionQuiescent(f.db, f.projectId)).toThrow(expect.objectContaining({ code: 'PROJECT_DELETION_ACTIVITY_BLOCKED' }));
    expect(f.db.prepare('SELECT * FROM project_deletions').all()).toEqual([]);
    expect(f.execution.cancelAttempt).not.toHaveBeenCalled();
  });

  it.each(['relative', 'absolute', 'traversal', 'foreign-attempt', 'unowned', 'unowned-planned'] as const)(
    'checks implementation ownership for a %s reference', async referenceKind => {
      const f = await attemptFixture(); close.push(() => f.close());
      const prepared = await f.prepare();
      const operation = await f.pipeline.startAttempt(prepared.body, prepared.context); await f.pipeline.drain();
      const attemptId = operation.resource.id;
      const reference = referenceKind === 'absolute' || referenceKind === 'unowned' ? resolve(f.directory, 'work', attemptId, 'implementation')
        : referenceKind === 'traversal' ? `work/${attemptId}/../${attemptId}/implementation`
        : referenceKind === 'foreign-attempt' ? `work/${randomUUID()}/implementation`
        : `work/${attemptId}/implementation`;
      if (referenceKind !== 'relative') {
        f.db.prepare(`INSERT INTO resources(id,attempt_id,passage_id,kind,reference,owned,launch_state,created_at_ms)
          SELECT ?,attempt_id,passage_id,kind,?,?,?,created_at_ms FROM resources
          WHERE attempt_id=? AND kind='implementation'`)
          .run(randomUUID(), reference, referenceKind.startsWith('unowned') ? 0 : 1,
            referenceKind === 'unowned-planned' ? 'planned' : 'ready', attemptId);
      }
      const paths = f.storage.getProjectDeletionPaths(f.projectId);
      const ownershipBlockers = paths.blockers.filter(b => b.reason === 'O pertencimento de um ambiente não pôde ser comprovado.');
      expect(ownershipBlockers).toHaveLength(['relative', 'absolute', 'unowned-planned'].includes(referenceKind) ? 0 : 1);
      expect(paths.targets).toContainEqual(expect.objectContaining({
        kind: 'exclusive_workspace', path: resolve(f.directory, 'work', attemptId), ownerId: attemptId,
      }));
      expect(f.storage.getProjectDeletionPaths(f.register()).protectedPaths)
        .toContain(resolve(f.directory, 'work', attemptId, 'implementation'));
    },
  );

  it.each(['deletion','publication'] as const)('serializes publication and deletion when %s obtains authorization first', async first => {
    const f = await publicationFixture(false, 'commit'); close.push(() => f.close());
    await f.implement(); await f.approve();
    // Completed historical attempt, physically stopped under the controlled host.
    f.db.prepare("UPDATE attempts SET phase='finished',result='delivered' WHERE id=?").run(f.attemptId);
    confirmTerminalStops(f, f.attemptId);
    const inspection = await inspector().inspectProjectDeletion(f.storage.getProjectDeletionPaths(f.projectId));
    expect(inspection.preview.blockers).toEqual([]);
    const deletion = { inspection, command: { operationId: randomUUID(), projectId: f.projectId,
      expectedRevision: f.storage.getProject(f.projectId).etag,
      body: { confirmed: true as const, authorization_digest: inspection.preview.authorization_digest } } };
    const publication = { kind: 'publication.complete' as const, attemptId: f.attemptId, ...f.context(),
      body: { deliveryId: f.status().deliveryId!, authorizedMode: 'commit' as const, authorized: true as const } };
    if (first === 'deletion') {
      f.storage.acceptProjectDeletion(deletion);
      expect(() => f.storage.acceptPublication(publication)).toThrow(expect.objectContaining({ code: 'PROJECT_DELETION_PENDING' }));
      expect(f.db.prepare('SELECT * FROM publication_requests').all()).toEqual([]);
      expect(f.storage.recoverProjectDeletion(deletion.command)).toMatchObject({ state: 'accepted' });
      expect(f.storage.getPublicationSummary(f.attemptId).completeCapability).toMatchObject({ available: false, reason_code: 'PROJECT_DELETION_PENDING' });
      expect(() => f.storage.assertPublicationEligible(f.attemptId, f.status().deliveryId!, true)).toThrow(expect.objectContaining({ code: 'PROJECT_DELETION_PENDING' }));
    } else {
      expect(f.storage.acceptPublication(publication).created).toBe(true);
      expect(() => f.storage.acceptProjectDeletion(deletion)).toThrow(expect.objectContaining({ code: 'PROJECT_DELETION_PREVIEW_CHANGED' }));
      expect(() => assertDeletionQuiescent(f.db, f.projectId)).toThrow(expect.objectContaining({ code: 'PROJECT_DELETION_ACTIVITY_BLOCKED' }));
      expect(f.db.prepare('SELECT * FROM project_deletions').all()).toEqual([]);
    }
    expect(f.workspaces.createLocalCommit).not.toHaveBeenCalled();
    expect(f.mutateEffect).not.toHaveBeenCalled();
  });
});
