import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { ShutdownView, OperationView } from '#contracts';
import { openStorage, shutdownETag } from '../../apps/controller/src/modules/storage/index.js';
import { assertStartsAllowed } from '../../apps/controller/src/modules/storage/shutdown.js';
import { createShutdownCoordinator } from '../../apps/controller/src/modules/shutdown/index.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { acceptShutdown, commitShutdown } from '../../apps/controller/src/modules/storage/shutdown.js';
import { attemptFixture, type AttemptFixture } from '../fixtures/attempt.js';
import { projectDeletionHistory } from '../fixtures/project-deletion-history.js';
import { publicationFixture } from '../fixtures/publication.js';

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { vi.useRealTimers(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'factory-shutdown-'));
  let storage = openStorage({ dataDirectory: directory });
  const db = new Database(join(directory, 'factory.sqlite'));
  db.pragma('foreign_keys=ON');
  cleanups.push(() => { storage.close(); db.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, db, get storage() { return storage; }, reopen() { storage.close(); storage = openStorage({ dataDirectory: directory }); return storage; } };
}
function command(f: ReturnType<typeof setup>, action: 'pause_starts' | 'close_when_idle' | 'resume_starts' = 'pause_starts') {
  return { operationId: randomUUID(), expectedRevision: shutdownETag(f.storage.getShutdown()), body: { action, authorized: true as const } };
}
function unknown(db: Database.Database, count = 1) {
  const installation = (db.prepare("SELECT installation_id FROM factory_settings WHERE id='local'").get() as { installation_id: string }).installation_id;
  const insert = db.prepare("INSERT INTO operation_requests(operation_id,installation_id,operation_kind,resource_type,resource_id,request_hash) VALUES (?,?,'controlled.uncertain','controller','local',?)");
  for (let i = 0; i < count; i++) insert.run(randomUUID(), installation, 'a'.repeat(64));
}
function token(f: ReturnType<typeof setup>, operationId: string) {
  return { operationId, instanceId: f.storage.controllerInstanceId, generation: f.storage.getShutdown().generation };
}
it('distinguishes normal disabled automation from durable pause and returns only public receipt fields', () => {
  const f = setup();
  expect(f.storage.getShutdown()).toMatchObject({ state: 'running', starts_paused: false, automation_enabled: false, remaining_work_count: 0 });
  expect(() => assertStartsAllowed(f.db)).not.toThrow();
  const request = command(f), operation = f.storage.acceptShutdown(request), view = f.storage.getShutdown();
  expect(Value.Check(ShutdownView, view)).toBe(true);
  expect(Value.Check(OperationView, { ...operation, request_id: 'test' })).toBe(true);
  expect(view).toMatchObject({ state: 'paused', starts_paused: true, automation_enabled: false, generation: 2 });
  expect(operation.receipt).toEqual({ revision: view.revision, event_cursor: view.event_cursor });
  expect(() => assertStartsAllowed(f.db)).toThrow(expect.objectContaining({ code: 'SHUTDOWN_STARTS_PAUSED' }));
  expect(f.storage.acceptShutdown(request)).toEqual(operation);
  expect(f.storage.getShutdown()).toEqual(view);
});
it('recovers before CAS and refuses divergent keys, missing or stale revision', () => {
  const f = setup(), request = command(f);
  expect(() => f.storage.acceptShutdown({ ...request, expectedRevision: undefined })).toThrow(expect.objectContaining({ statusCode: 428 }));
  expect(() => f.storage.acceptShutdown({ ...request, expectedRevision: '"stale"' })).toThrow(expect.objectContaining({ statusCode: 412 }));
  const accepted = f.storage.acceptShutdown(request);
  f.storage.acceptShutdown(command(f, 'close_when_idle'));
  const before = f.storage.getShutdown();
  expect(f.storage.acceptShutdown(request).receipt).toEqual(accepted.receipt);
  expect(f.storage.getShutdown()).toEqual(before);
  expect(() => f.storage.acceptShutdown({ ...request, body: { action: 'close_when_idle', authorized: true } })).toThrow(expect.objectContaining({ statusCode: 409 }));
});
it('retains pause across restart and never revives a previous process drain', () => {
  const f = setup(), request = command(f, 'close_when_idle');
  f.storage.acceptShutdown(request); const oldToken = token(f, request.operationId), previous = f.storage.getShutdown();
  f.reopen();
  expect(f.storage.getShutdown()).toMatchObject({ state: 'paused', starts_paused: true, automation_enabled: false, generation: previous.generation + 1, closing_committed: false });
  expect(f.storage.commitShutdown(oldToken)).toBe(false);
  expect(f.storage.getOperation(request.operationId)?.progress).toMatchObject({ kind: 'shutdown', state: 'revoked' });
  expect(() => assertStartsAllowed(f.db)).toThrow();
});
it('checks the complete inventory and binds pagination to its snapshot', () => {
  const f = setup(); unknown(f.db, 105);
  const first = f.storage.getShutdown({ limit: '100' });
  expect(first).toMatchObject({ remaining_work_count: 105, has_more: true });
  expect(first.active_work).toHaveLength(100);
  const second = f.storage.getShutdown({ cursor: first.next_cursor!, limit: '100' });
  expect(second.active_work).toHaveLength(5); expect(second.remaining_work_count).toBe(105);
  expect(f.storage.getShutdown({ cursor: `105:${first.next_cursor!.split(':')[1]}` })).toMatchObject({ active_work: [], remaining_work_count: 105 });
  const request = command(f, 'close_when_idle'); f.storage.acceptShutdown(request);
  expect(f.storage.commitShutdown(token(f, request.operationId))).toBe(false);
  expect(f.storage.getShutdown().state).toBe('blocked');
  expect(() => f.storage.getShutdown({ cursor: first.next_cursor! })).toThrow(expect.objectContaining({ code: 'SHUTDOWN_CURSOR_STALE' }));
});
it('journals commitment before close, blocks new effects and does not repeat the old close after restart', () => {
  const f = setup(), request = command(f, 'close_when_idle'); f.storage.acceptShutdown(request);
  const captured = token(f, request.operationId);
  expect(f.storage.commitShutdown({ ...captured, generation: captured.generation + 1 })).toBe(false);
  expect(f.storage.commitShutdown(captured)).toBe(true);
  expect(f.storage.getShutdown()).toMatchObject({ closing_committed: true, state: 'closing', starts_paused: true });
  expect(f.storage.commitShutdown(captured)).toBe(false);
  expect(() => unknown(f.db)).toThrow('SHUTDOWN_CLOSING');
  expect(() => f.storage.acceptShutdown(command(f))).toThrow(expect.objectContaining({ code: 'SHUTDOWN_CLOSING' }));
  f.reopen();
  expect(f.storage.getShutdown()).toMatchObject({ closing_committed: false, state: 'paused', starts_paused: true });
  expect(f.storage.commitShutdown(captured)).toBe(false);
});
it('rolls back the pause if its durable journal cannot be written', () => {
  const f = setup(), before = f.storage.getShutdown();
  f.db.exec("CREATE TRIGGER refuse_shutdown BEFORE INSERT ON operation_requests WHEN NEW.operation_kind='shutdown.pause_starts' BEGIN SELECT RAISE(ABORT,'CONTROLLED'); END");
  expect(() => f.storage.acceptShutdown(command(f))).toThrow();
  expect(f.storage.getShutdown()).toEqual(before);
});
it('keeps the coordinator alive while work is unresolved and commits before invoking close', async () => {
  vi.useFakeTimers(); const f = setup(); unknown(f.db);
  const request = command(f, 'close_when_idle'); f.storage.acceptShutdown(request);
  const close = vi.fn(async () => { expect(f.storage.getShutdown().closing_committed).toBe(true); });
  const coordinator = createShutdownCoordinator({ storage: f.storage, close, reportFailure: vi.fn() }); cleanups.push(() => coordinator.stop());
  coordinator.follow(request.operationId); await vi.advanceTimersByTimeAsync(500);
  expect(close).not.toHaveBeenCalled();
  // Resolve the controlled operation; no production cleanup or cancellation is invoked.
  f.db.prepare("UPDATE operation_requests SET receipt_json=? WHERE operation_kind='controlled.uncertain'").run('{}');
  await vi.advanceTimersByTimeAsync(100);
  expect(close).toHaveBeenCalledOnce();
});
it('serializes the manual-start race in both orders without cancelling accepted work', async () => {
  const f: AttemptFixture = await attemptFixture(); cleanups.push(() => f.close());
  const prepared = await f.prepare();
  const pause = { operationId: randomUUID(), expectedRevision: shutdownETag(f.storage.getShutdown()), body: { action: 'pause_starts' as const, authorized: true as const } };
  f.storage.acceptShutdown(pause);
  await expect(f.pipeline.startAttempt(prepared.body, prepared.context)).rejects.toMatchObject({ code: 'SHUTDOWN_STARTS_PAUSED' });
  const other = await attemptFixture(); cleanups.push(() => other.close());
  const prepared2 = await other.prepare(), started = await other.pipeline.startAttempt(prepared2.body, prepared2.context); await other.pipeline.drain();
  const status = other.storage.getAttempt(started.resource.id);
  other.storage.acceptShutdown({ operationId: randomUUID(), expectedRevision: shutdownETag(other.storage.getShutdown()), body: pause.body });
  expect(other.storage.getAttempt(started.resource.id)).toEqual({ ...status, eventCursor: other.storage.getAttempt(started.resource.id).eventCursor });
  expect(other.storage.getShutdown().active_work).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'attempt', id: status.id })]));
});

it('serializes two database connections and enforces the durable start guard at insertion', () => {
  const f = setup(), peer = new Database(join(f.directory, 'factory.sqlite'), { timeout: 1 });
  cleanups.push(() => { peer.close(); }); peer.pragma('foreign_keys=ON');
  const request = command(f);
  f.db.exec('BEGIN IMMEDIATE');
  expect(() => acceptShutdown(peer, f.storage.controllerInstanceId, request)).toThrow();
  f.db.exec('ROLLBACK');
  expect(f.storage.getShutdown().starts_paused).toBe(false);
  acceptShutdown(peer, f.storage.controllerInstanceId, request);
  const installation = f.storage.getSettings().installation_id;
  expect(() => peer.prepare("INSERT INTO operation_requests(operation_id,installation_id,operation_kind,resource_type,resource_id,request_hash) VALUES (?,?,'attempt.start','attempt',?,?)")
    .run(randomUUID(), installation, randomUUID(), 'a'.repeat(64))).toThrow('SHUTDOWN_STARTS_PAUSED');
});

it('rejects a start whose asynchronous preparation was already in flight when pause won', async () => {
  const f = await attemptFixture(); cleanups.push(() => f.close());
  const prepared = await f.prepare();
  let release!: (value: typeof f.observation) => void;
  let entered!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  f.workspaces.inspectOrigin.mockImplementationOnce(() => { entered(); return new Promise(resolve => { release = resolve; }); });
  const starting = f.pipeline.startAttempt(prepared.body, prepared.context);
  const rejected = expect(starting).rejects.toBeInstanceOf(Error);
  await waiting;
  f.storage.acceptShutdown({ operationId: randomUUID(), expectedRevision: shutdownETag(f.storage.getShutdown()), body: { action: 'pause_starts', authorized: true } });
  release(structuredClone(f.observation));
  await rejected;
  expect(f.db.prepare('SELECT count(*) AS n FROM attempts').get()).toEqual({ n: 0 });
  expect(f.storage.getOperation(prepared.context.operationId)).toBeNull();
});

it('does not withdraw draining when a second pause is requested', () => {
  const f = setup(), request = command(f, 'close_when_idle'); f.storage.acceptShutdown(request);
  const before = f.storage.getShutdown();
  expect(before.pause_capability.available).toBe(false);
  expect(() => f.storage.acceptShutdown(command(f))).toThrow(expect.objectContaining({ code: 'SHUTDOWN_ALREADY_PAUSED' }));
  expect(f.storage.getShutdown()).toEqual(before);
  expect(f.storage.commitShutdown(token(f, request.operationId))).toBe(true);
});

it('guards HTTP commands with session, origin, CSRF, CAS and idempotency while reads never withdraw pause', async () => {
  const f = setup();
  const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory), f.storage);
  cleanups.push(() => app.close());
  const host = '127.0.0.1:4310', origin = `http://${host}`, body = { action: 'pause_starts', authorized: true };
  expect((await app.inject({ method: 'POST', url: '/api/v1/shutdown', headers: { host, origin }, payload: body })).statusCode).toBe(401);
  const session = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin, 'x-factory-client': 'web' }, payload: {} });
  const headers = { host, origin, cookie: String(session.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': session.json<{ csrf_token: string }>().csrf_token };
  const current = await app.inject({ url: '/api/v1/shutdown', headers });
  expect(current.statusCode, current.body).toBe(200);
  expect(Value.Check(ShutdownView, current.json())).toBe(true);
  const auth = { ...headers, 'idempotency-key': randomUUID(), 'if-match': String(current.headers.etag) };
  expect((await app.inject({ method: 'POST', url: '/api/v1/shutdown', headers: { ...auth, 'x-csrf-token': 'wrong' }, payload: body })).statusCode).toBe(403);
  expect((await app.inject({ method: 'POST', url: '/api/v1/shutdown', headers: { ...auth, origin: 'http://foreign.invalid' }, payload: body })).statusCode).toBe(403);
  const accepted = await app.inject({ method: 'POST', url: '/api/v1/shutdown', headers: auth, payload: body });
  expect(accepted.statusCode, accepted.body).toBe(202);
  expect(accepted.headers.location).toBe(`/api/v1/operations/${auth['idempotency-key']}`);
  expect((await app.inject({ method: 'POST', url: '/api/v1/shutdown', headers: auth, payload: body })).json()).toMatchObject({ operation_id: auth['idempotency-key'], receipt: accepted.json().receipt });
  const operation = await app.inject({ url: String(accepted.headers.location), headers });
  expect(operation.statusCode, operation.body).toBe(200);
  expect(operation.json()).toMatchObject({ state: 'succeeded', progress: { kind: 'shutdown', shutdown: { starts_paused: true } } });
  expect(operation.body).not.toContain('controllerInstanceId');
  await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin, 'x-factory-client': 'web' }, payload: {} });
  expect(f.storage.getShutdown().starts_paused).toBe(true);
  expect((await app.inject({ url: '/api/v1/shutdown?limit=101', headers })).statusCode).toBe(400);
  const resume = { ...headers, 'idempotency-key': randomUUID(), 'if-match': shutdownETag(f.storage.getShutdown()) };
  const resumed = await app.inject({ method: 'POST', url: '/api/v1/shutdown', headers: resume, payload: { action: 'resume_starts', authorized: true } });
  expect(resumed.statusCode, resumed.body).toBe(202);
  expect(f.storage.getShutdown()).toMatchObject({ state: 'running', starts_paused: false, automation_enabled: false });
  const drain = command(f, 'close_when_idle'); f.storage.acceptShutdown(drain);
  const replay = await app.inject({ method: 'POST', url: '/api/v1/shutdown', headers: resume, payload: { action: 'resume_starts', authorized: true } });
  expect(replay.statusCode, replay.body).toBe(202); expect(replay.json().receipt).toEqual(resumed.json().receipt);
  expect(f.storage.getShutdown()).toMatchObject({ starts_paused: true, operation_id: drain.operationId });
  const closingResume = { ...headers, 'idempotency-key': randomUUID(), 'if-match': shutdownETag(f.storage.getShutdown()) };
  expect(f.storage.commitShutdown(token(f, drain.operationId))).toBe(true);
  const refused = await app.inject({ method: 'POST', url: '/api/v1/shutdown', headers: closingResume, payload: { action: 'resume_starts', authorized: true } });
  expect(refused.statusCode, refused.body).toBe(409); expect(refused.json().code).toBe('SHUTDOWN_CLOSING');
  expect(f.storage.getOperation(closingResume['idempotency-key'])).toBeNull();
});

it('includes publication, creation, deletion, storage transition and uncertain execution outside the current account', () => {
  const f = setup(), history = projectDeletionHistory(f.db);
  const { selected } = history, hash = 'a'.repeat(64), creationId = randomUUID();
  const creationOperation = history.operation('creation', creationId, 'scaffold.create');
  history.insert('project_creations', { id: creationId, operation_id: creationOperation, installation_id: f.storage.getSettings().installation_id,
    account_id: history.accountId, project_id: null, plan_hash: hash, plan_json: '{}', destination: join(f.directory, 'controlled-creation'), state: 'pending', revision: 1, created_at_ms: 0 });
  const publicationOperation = history.operation('attempt', selected.attemptId, 'publication.complete');
  history.insert('publication_requests', { operation_id: publicationOperation, attempt_id: selected.attemptId, delivery_id: selected.deliveryId,
    kind: 'publication.complete', authorized_mode: 'commit', state: 'unknown', diagnostic: 'CONTROLLED', created_at_ms: 0 });
  const resourceId = randomUUID();
  history.insert('resources', { id: resourceId, attempt_id: selected.attemptId, passage_id: selected.passageId, kind: 'terminal', reference: 'controlled-terminal',
    owned: 1, launch_state: 'partial', stop_state: 'uncertain', created_at_ms: 0 });
  const locationId = randomUUID(), root = `var/factory/projects/${selected.projectId}/v1/managed`;
  const identity = JSON.stringify({ format_version: 1, volume_id: 'controlled', object_id: locationId, ancestors: [{}] });
  history.insert('project_storage_locations', { id: locationId, project_id: selected.projectId, layout_version: 1, location_key: 'managed', root_relative: root,
    object_identity_json: identity, is_current: 1, revision: 1, created_at_ms: 0, verified_at_ms: 0 });
  const transition = history.operation('project', selected.projectId, 'project.storage.transition');
  history.insert('project_storage_transitions', { operation_id: transition, project_id: selected.projectId, location_key: 'managed', source_location_id: locationId,
    source_relative: root, destination_relative: root.replace('/v1/', '/v2/'), source_identity_json: identity, plan_hash: hash,
    step: 'planned', state: 'planned', revision: 1, generation: 1, created_at_ms: 0, updated_at_ms: 0 });
  f.db.exec("UPDATE factory_settings SET account_id=NULL WHERE id='local'");
  const work = f.storage.getShutdown().active_work;
  for (const [type, id] of [['creation', creationId], ['publication', publicationOperation], ['deletion', history.command.operationId], ['storage_transition', transition], ['execution', resourceId]]) {
    expect(work).toEqual(expect.arrayContaining([expect.objectContaining({ type, id })]));
  }
  const request = command(f, 'close_when_idle'); f.storage.acceptShutdown(request);
  expect(f.storage.commitShutdown(token(f, request.operationId))).toBe(false);
  expect(f.db.prepare('SELECT state FROM project_deletions WHERE operation_id=?').get(history.command.operationId)).toMatchObject({ state: 'running' });
});

it('treats delivered work with released terminals as idle without stopping or removing those terminals', async () => {
  const f = await publicationFixture(); cleanups.push(() => f.close());
  await f.implement(); await f.approve();
  expect(f.status().result).toBe('delivered');
  const resources = f.storage.getResources(f.attemptId);
  expect(f.storage.getShutdown().remaining_work_count).toBe(0);
  f.storage.acceptShutdown({ operationId: randomUUID(), expectedRevision: shutdownETag(f.storage.getShutdown()), body: { action: 'pause_starts', authorized: true } });
  expect(f.storage.getResources(f.attemptId)).toEqual({ ...resources, eventCursor: f.storage.getResources(f.attemptId).eventCursor });
});

it('resumes only a current pause and keeps automation disabled without creating other work', () => {
  const f = setup(), invalid = command(f, 'resume_starts');
  expect(f.storage.getShutdown().resume_starts_capability.available).toBe(false);
  expect(() => f.storage.acceptShutdown(invalid)).toThrow(expect.objectContaining({ code: 'SHUTDOWN_NOT_PAUSED', statusCode: 409 }));
  f.storage.acceptShutdown(command(f)); const paused = f.storage.getShutdown();
  expect(paused.resume_starts_capability.available).toBe(true);
  const request = command(f, 'resume_starts'), accepted = f.storage.acceptShutdown(request), running = f.storage.getShutdown();
  expect(running).toMatchObject({ state: 'running', starts_paused: false, automation_enabled: false, generation: paused.generation + 1, revision: paused.revision + 1 });
  expect(() => f.storage.assertStartsAllowed()).not.toThrow();
  expect(accepted.kind).toBe('shutdown.resume_starts');
  expect(f.storage.acceptShutdown(request).receipt).toEqual(accepted.receipt);
  for (const table of ['attempts','cancellation_requests','publication_requests','effects']) expect(f.db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
  expect(() => f.storage.acceptShutdown({ ...request, operationId: randomUUID() })).toThrow(expect.objectContaining({ statusCode: 412 }));
  expect(() => f.storage.acceptShutdown(command(f, 'resume_starts'))).toThrow(expect.objectContaining({ statusCode: 409 }));
});

it('durably references the revoked drain, preserves receipts and makes replay harmless to a later drain', () => {
  const f = setup(), drain = command(f, 'close_when_idle'); f.storage.acceptShutdown(drain);
  const original = f.db.prepare('SELECT receipt_json FROM operation_requests WHERE operation_id=?').get(drain.operationId);
  const captured = token(f, drain.operationId), resume = command(f, 'resume_starts'), accepted = f.storage.acceptShutdown(resume);
  const row = f.db.prepare('SELECT receipt_json FROM operation_requests WHERE operation_id=?').get(resume.operationId) as { receipt_json: string };
  expect(JSON.parse(row.receipt_json).shutdown).toMatchObject({ action: 'resume_starts', startsPaused: false, revokedDrainOperationId: drain.operationId, revokedDrainGeneration: captured.generation });
  expect(f.storage.getOperation(drain.operationId)).toMatchObject({ state: 'succeeded', progress: { state: 'revoked' } });
  expect(f.storage.commitShutdown(captured)).toBe(false);
  expect(f.db.prepare('SELECT receipt_json FROM operation_requests WHERE operation_id=?').get(drain.operationId)).toEqual(original);
  expect(() => f.db.prepare("UPDATE operation_requests SET receipt_json='{}' WHERE operation_id=?").run(resume.operationId)).toThrow('IMMUTABLE_RECORD');
  const next = command(f, 'close_when_idle'); f.storage.acceptShutdown(next); const before = f.storage.getShutdown();
  expect(f.storage.acceptShutdown(resume).receipt).toEqual(accepted.receipt);
  expect(f.storage.getShutdown()).toEqual(before);
  expect(() => f.storage.acceptShutdown({ ...resume, body: { action: 'pause_starts', authorized: true } })).toThrow(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }));
  expect(() => f.storage.assertStartsAllowed()).toThrow();
});

it('permits a fresh manual start after resume while keeping automated starts disabled', async () => {
  const f = await attemptFixture(); cleanups.push(() => f.close());
  f.db.exec("UPDATE factory_settings SET automation_enabled=1 WHERE id='local'");
  expect(f.storage.getSettings().automation_enabled).toBe(true);
  f.storage.acceptShutdown({ operationId: randomUUID(), expectedRevision: shutdownETag(f.storage.getShutdown()), body: { action: 'pause_starts', authorized: true } });
  f.storage.acceptShutdown({ operationId: randomUUID(), expectedRevision: shutdownETag(f.storage.getShutdown()), body: { action: 'resume_starts', authorized: true } });
  expect(f.db.prepare('SELECT count(*) AS n FROM attempts').get()).toEqual({ n: 0 });
  expect(f.storage.getSettings().automation_enabled).toBe(false);
  const prepared = await f.prepare();
  const started = await f.pipeline.startAttempt(prepared.body, prepared.context); await f.pipeline.drain();
  expect(f.storage.getAttempt(started.resource.id)).toMatchObject({ result: null, suspension: null });
  expect(f.storage.getSettings().automation_enabled).toBe(false);
});

it('does not cancel, restart or publish an active attempt when withdrawing its drain', async () => {
  const f = await attemptFixture(); cleanups.push(() => f.close());
  const prepared = await f.prepare(), started = await f.pipeline.startAttempt(prepared.body, prepared.context); await f.pipeline.drain();
  const status = f.storage.getAttempt(started.resource.id), resources = f.storage.getResources(status.id);
  const tables = ['attempts','passages','rounds','resources','effects','publication_requests','cancellation_requests'];
  const before = tables.map(table => JSON.stringify(f.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
  f.storage.acceptShutdown({ operationId: randomUUID(), expectedRevision: shutdownETag(f.storage.getShutdown()), body: { action: 'close_when_idle', authorized: true } });
  f.storage.acceptShutdown({ operationId: randomUUID(), expectedRevision: shutdownETag(f.storage.getShutdown()), body: { action: 'resume_starts', authorized: true } });
  expect(tables.map(table => JSON.stringify(f.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))).toEqual(before);
  expect(f.storage.getAttempt(status.id)).toEqual({ ...status, eventCursor: f.storage.getAttempt(status.id).eventCursor });
  expect(f.storage.getResources(status.id)).toEqual({ ...resources, eventCursor: f.storage.getResources(status.id).eventCursor });
  expect(f.storage.getShutdown()).toMatchObject({ state: 'running', starts_paused: false, automation_enabled: false });
});

it('preserves withdrawal and revocation across restart without replaying the old command', () => {
  const f = setup(), drain = command(f, 'close_when_idle'); f.storage.acceptShutdown(drain); const old = token(f, drain.operationId);
  const resume = command(f, 'resume_starts'), receipt = f.storage.acceptShutdown(resume).receipt, running = f.storage.getShutdown();
  f.reopen(); const restored = f.storage.getShutdown();
  expect(restored).toMatchObject({ state: 'running', starts_paused: false, automation_enabled: false, closing_committed: false, generation: running.generation + 1 });
  expect(f.storage.commitShutdown(old)).toBe(false);
  expect(f.storage.getOperation(drain.operationId)?.progress).toMatchObject({ state: 'revoked' });
  expect(f.storage.acceptShutdown(resume).receipt).toEqual(receipt);
  expect(f.storage.getShutdown()).toEqual(restored);
});

it('rolls back withdrawal and revocation if the resume journal cannot be accepted', () => {
  const f = setup(); f.storage.acceptShutdown(command(f, 'close_when_idle')); const before = f.storage.getShutdown(), request = command(f, 'resume_starts');
  f.db.exec("CREATE TRIGGER refuse_resume BEFORE INSERT ON operation_requests WHEN NEW.operation_kind='shutdown.resume_starts' BEGIN SELECT RAISE(ABORT,'CONTROLLED'); END");
  expect(() => f.storage.acceptShutdown(request)).toThrow();
  expect(f.storage.getOperation(request.operationId)).toBeNull(); expect(f.storage.getShutdown()).toEqual(before);
});

it('serializes resume versus commitment in both orders on separate SQLite connections', () => {
  for (const winner of ['resume', 'commit']) {
    const f = setup(), peer = new Database(join(f.directory, 'factory.sqlite')); peer.pragma('foreign_keys=ON'); cleanups.push(() => { peer.close(); });
    const drain = command(f, 'close_when_idle'); f.storage.acceptShutdown(drain); const old = token(f, drain.operationId), resume = command(f, 'resume_starts');
    if (winner === 'resume') {
      acceptShutdown(peer, f.storage.controllerInstanceId, resume);
      expect(f.storage.commitShutdown(old)).toBe(false);
      expect(f.storage.getShutdown()).toMatchObject({ state: 'running', starts_paused: false });
    } else {
      expect(commitShutdown(peer, f.storage.controllerInstanceId, old)).toBe(true);
      expect(() => f.storage.acceptShutdown(resume)).toThrow(expect.objectContaining({ code: 'SHUTDOWN_CLOSING', statusCode: 409 }));
      expect(f.storage.getOperation(resume.operationId)).toBeNull();
      expect(f.storage.getShutdown().resume_starts_capability.available).toBe(false);
      const installation = f.storage.getSettings().installation_id;
      expect(() => peer.prepare("INSERT INTO operation_requests(operation_id,installation_id,operation_kind,resource_type,resource_id,request_hash) VALUES (?,?,'attempt.start','attempt',?,?)")
        .run(randomUUID(), installation, randomUUID(), 'a'.repeat(64))).toThrow(/SHUTDOWN_(CLOSING|STARTS_PAUSED)/);
    }
  }
});

it('rejects old timers, late follow callbacks and final commit callbacks after an accepted resume', async () => {
  vi.useFakeTimers(); const f = setup(), drain = command(f, 'close_when_idle'); f.storage.acceptShutdown(drain);
  const timer = vi.spyOn(globalThis, 'setTimeout'), close = vi.fn(async () => {}), reportFailure = vi.fn();
  const coordinator = createShutdownCoordinator({ storage: f.storage, close, reportFailure }); cleanups.push(() => coordinator.stop());
  coordinator.follow(drain.operationId);
  const oldCallback = timer.mock.calls.at(-1)![0] as () => void, old = token(f, drain.operationId);
  f.storage.acceptShutdown(command(f, 'resume_starts'));
  oldCallback(); coordinator.follow(drain.operationId); await vi.advanceTimersByTimeAsync(1000);
  expect(f.storage.commitShutdown(old)).toBe(false); expect(close).not.toHaveBeenCalled();
  const next = command(f, 'close_when_idle'); f.storage.acceptShutdown(next); coordinator.follow(next.operationId);
  oldCallback(); expect(close).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(100); expect(close).toHaveBeenCalledOnce(); expect(reportFailure).not.toHaveBeenCalled();
  timer.mockRestore();
});

it('revalidates final commitment if resume wins after the worker read its view', async () => {
  vi.useFakeTimers(); const f = setup(), drain = command(f, 'close_when_idle'); f.storage.acceptShutdown(drain);
  const close = vi.fn(async () => {}), storage = { controllerInstanceId: f.storage.controllerInstanceId, getShutdown: () => f.storage.getShutdown(),
    commitShutdown: (captured: ReturnType<typeof token>) => { f.storage.acceptShutdown(command(f, 'resume_starts')); return f.storage.commitShutdown(captured); } };
  const coordinator = createShutdownCoordinator({ storage, close, reportFailure: vi.fn() }); cleanups.push(() => coordinator.stop());
  coordinator.follow(drain.operationId); await vi.advanceTimersByTimeAsync(1000);
  expect(close).not.toHaveBeenCalled(); expect(f.storage.getShutdown().starts_paused).toBe(false);
});

it('upgrades schema 48 without rewriting accepted receipts and offers resume in the restored instance', () => {
  const f = setup(), pause = command(f); f.storage.acceptShutdown(pause);
  const before = f.db.prepare('SELECT receipt_json FROM operation_requests WHERE operation_id=?').get(pause.operationId);
  f.db.exec('DROP TRIGGER shutdown_start_barrier; DROP TRIGGER shutdown_final_barrier; DROP TRIGGER shutdown_receipt_immutable; DROP INDEX shutdown_control_order;');
  f.db.exec(readFileSync(new URL('../../apps/controller/src/modules/storage/migrations/048_shutdown_barriers.sql', import.meta.url), 'utf8'));
  f.db.exec('DROP INDEX delivery_targets_existing_branch_base; DROP INDEX delivery_targets_repository_branch; CREATE UNIQUE INDEX delivery_targets_repository_branch ON delivery_targets(repository_id,branch_ref); ALTER TABLE project_revisions DROP COLUMN delivery_branch_json; DELETE FROM schema_migrations WHERE version>=49; PRAGMA user_version=48;');
  f.reopen();
  expect(f.storage.getDiagnostics().schemaVersion).toBe(50);
  expect(f.db.prepare('SELECT receipt_json FROM operation_requests WHERE operation_id=?').get(pause.operationId)).toEqual(before);
  expect(f.storage.getShutdown().resume_starts_capability.available).toBe(true);
  f.storage.acceptShutdown(command(f, 'resume_starts'));
  expect(f.storage.getShutdown()).toMatchObject({ state: 'running', starts_paused: false, automation_enabled: false });
});
