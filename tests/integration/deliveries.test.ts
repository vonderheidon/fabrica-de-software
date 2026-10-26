import { toHttpCaptureRetry } from '../../apps/controller/src/http/execution-views.js';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImplementerResult, SessionResponse } from '#contracts';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { CaptureError } from '../../apps/controller/src/modules/workspaces/index.js';
import { openStorage, type RetryCaptureCommand } from '../../apps/controller/src/modules/storage/index.js';
import { digest } from '../../apps/controller/src/modules/execution/roles.js';
import { attemptFixture, type AttemptFixture } from '../fixtures/attempt.js';
import { captureFixture } from '../fixtures/capture.js';
import { removeReviewSchema } from '../fixtures/review-schema.js';
import { createProjectDeletionPersistence } from '../../apps/controller/src/modules/storage/project-deletions.js';

const fixtures: AttemptFixture[] = []; const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); for (const f of fixtures.splice(0)) await f.close(); });
async function fixture(http = false) {
  const f = await attemptFixture(); fixtures.push(f);
  createProjectDeletionPersistence(f.db);
  const app = http ? createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory), f.storage,
    undefined, undefined, { github: f.github, workspaces: f.workspaces }, f.pipeline) : null;
  if (app) { apps.push(app); await app.ready(); }
  const prepared = await f.prepare(); const operation = await f.pipeline.startAttempt(prepared.body, prepared.context); await f.pipeline.drain();
  const a = f.storage.getAttempt(operation.resource.id); const binding = f.persistence.getPassage({ passageId: a.passageId }).binding;
  const controlled = await captureFixture(f.directory, { attemptId: a.id, passageId: a.passageId, deliveryId: binding.deliveryVersion, baseSha: f.storage.getAttemptCapture(a.id).baseSha });
  const capture = vi.fn(controlled.capture);
  Object.assign(f.workspaces, { captureDelivery: capture, getDeliveryDiff: controlled.diff });
  const result: ImplementerResult = { formatVersion: 1, summary: 'Official result', writesStopped: true, declaredFiles: ['cache/declared.txt'],
    criteria: ['ac-1', 'ac-2'].map(criterionId => ({ criterionId, verdict: 'passed', evidence: ['Observed'] })), checks: [] };
  const accept = () => f.persistence.acceptResult({ binding, result, sha256: digest(result) });
  const retry = (): RetryCaptureCommand => ({ operationId: randomUUID(), expectedRevision: `"${a.id}:${f.storage.getAttempt(a.id).revision}"`, attemptId: a.id,
    deliveryId: binding.deliveryVersion, body: { producerPassageId: a.passageId } });
  return { ...f, app, a, binding, controlled, capture, result, accept, retry };
}

describe('durable immutable deliveries', () => {
  it('migrates an actual version-five database preserving prior results and receipt, without restoring capture authority', async () => {
    const f = await fixture(); const accepted = f.accept(); await f.pipeline.drain();
    const identity = f.storage.getSettings().installation_id; await f.pipeline.close(); f.storage.close();
    // Reconstruct the prior schema only inside this temporary fixture; production never downgrades.
    removeReviewSchema(f.db);
    f.db.exec('DROP TABLE artifacts; DROP TABLE checks; DROP TABLE verification_runs; DROP INDEX delivery_attempt_version; DROP TABLE capture_warnings; DROP TABLE capture_runs; DROP TABLE deliveries; DELETE FROM schema_migrations WHERE version>=6; PRAGMA user_version=5;');
    const reopened = openStorage({ dataDirectory: f.directory });
    try {
    expect(reopened.getDiagnostics().schemaVersion).toBe(50); expect(reopened.getSettings().installation_id).toBe(identity);
      expect(reopened.executionPersistence().getResult({ passageId: f.a.passageId })).toEqual(accepted);
      expect(reopened.getDelivery(f.binding.deliveryVersion).delivery).toMatchObject({ captureState: 'failed', diagnostic: 'CAPTURE_CONTINUITY_REVOKED', contentIdentity: null });
      const command = { operationId: randomUUID(), attemptId: f.a.id, deliveryId: f.binding.deliveryVersion, body: { producerPassageId: f.a.passageId },
        expectedRevision: `"${f.a.id}:${reopened.getAttempt(f.a.id).revision}"` };
      expect(() => reopened.retryCapture(command)).toThrow(expect.objectContaining({ code: 'CAPTURE_RETRY_NOT_ALLOWED' })); expect(f.db.pragma('foreign_key_check')).toEqual([]);
    } finally { reopened.close(); }
  });
  it('does not confirm a retry under SQLite contention and accepts the same command after the lock is released', async () => {
    const f = await fixture(); f.capture.mockRejectedValueOnce(new CaptureError('CAPTURE_IO_FAILED')); f.accept(); await f.pipeline.drain();
    const command = f.retry(); f.db.exec('BEGIN IMMEDIATE');
    try {
      await expect(f.pipeline.retryCapture(command)).rejects.toMatchObject({ code: 'CONFIGURATION_STORAGE_FAILED' });
      expect(f.storage.getOperation(command.operationId)).toBeNull();
    } finally { f.db.exec('ROLLBACK'); }
    await f.pipeline.retryCapture(command); await f.pipeline.drain(); expect(f.storage.getOperation(command.operationId)?.state).toBe('succeeded');
    expect(f.execution.startPassage).toHaveBeenCalledOnce();
  });
  it('starts capture only after the official result commits and keeps ignored warning metadata queryable without its bytes', async () => {
    const f = await fixture(); expect(f.capture).not.toHaveBeenCalled();
    expect(f.db.prepare('SELECT count(*) AS n FROM deliveries').get()).toEqual({ n: 0 });
    f.capture.mockImplementationOnce(async input => {
      expect(f.persistence.getResult({ passageId: f.a.passageId })?.receiptId).toBeDefined();
      expect(f.storage.getDelivery(input.deliveryId).delivery.captureState).toBe('running');
      return f.controlled.capture(input);
    });
    const accepted = f.accept(); const d = f.binding.deliveryVersion;
    expect(f.storage.getDelivery(d).delivery.captureState).toBe('pending'); expect(f.capture).not.toHaveBeenCalled();
    await f.pipeline.drain();
    const view = f.storage.getDelivery(d); expect(view.delivery).toMatchObject({ captureState: 'captured', hasDelta: true,
      gitRef: `refs/factory/deliveries/${d}`, repositoryRelative: `git/${f.a.id}.git`,
      warnings: [{ attemptId: f.a.id, passageId: f.a.passageId, deliveryId: d, path: 'cache/declared.txt', reason: 'DECLARED_NEW_FILE_IGNORED' }] });
    expect(f.storage.getAttempt(f.a.id)).toMatchObject({ deliveryId: d, resultReceiptId: accepted.receiptId, phase: 'verifying', suspension: null });
    f.accept(); await f.pipeline.drain(); expect(f.capture).toHaveBeenCalledTimes(1);
    const official = JSON.stringify({ view, events: f.storage.getEvents({}), result: f.persistence.getResult({ passageId: f.a.passageId }),
      rows: ['deliveries', 'capture_warnings', 'capture_runs', 'passage_results'].map(t => f.db.prepare(`SELECT * FROM ${t}`).all()) });
    expect(official).not.toContain('EXCLUDED_IGNORED_BYTES'); expect(official).not.toContain('EXCLUDED_SECRET_BYTES');
    for (const bytes of f.controlled.blobs.values()) { expect(bytes.toString()).not.toContain('EXCLUDED_IGNORED_BYTES'); expect(bytes.toString()).not.toContain('EXCLUDED_SECRET_BYTES'); }
    await f.pipeline.close(); f.storage.close();
    const reopened = openStorage({ dataDirectory: f.directory });
    try { expect(reopened.getDelivery(d).delivery).toEqual(view.delivery); } finally { reopened.close(); }
    await rm(f.controlled.implementation, { recursive: true });
    const page = await f.controlled.diff(view.delivery, { limit: '1' }); expect(page.entries).toHaveLength(1); expect(page.nextCursor).not.toBeNull();
  });
  it('retries only capture with a durable operation, recovers a lost response and keeps the producer/clone count fixed', async () => {
    const f = await fixture(); f.capture.mockRejectedValueOnce(new CaptureError('CAPTURE_CONCURRENT_CHANGE'));
    f.accept(); await f.pipeline.drain(); const d = f.binding.deliveryVersion;
    expect(f.storage.getDelivery(d).delivery).toMatchObject({ captureState: 'failed', diagnostic: 'CAPTURE_CONCURRENT_CHANGE', gitRef: null });
    const command = f.retry(); const op = await f.pipeline.retryCapture(command);
    expect(op.resource).toEqual({ type: 'delivery', id: d }); expect(f.storage.getOperation(command.operationId)?.receipt).toBeDefined();
    expect((await f.pipeline.retryCapture(command)).receipt).toEqual(op.receipt);
    await f.pipeline.drain(); expect(f.storage.getOperation(command.operationId)?.state).toBe('succeeded');
    expect(f.storage.getDelivery(d).delivery.captureState).toBe('captured');
    expect(f.execution.startPassage).toHaveBeenCalledTimes(1); expect(f.workspaces.prepareAttempt).toHaveBeenCalledTimes(1); expect(f.capture).toHaveBeenCalledTimes(2);
    expect((await f.pipeline.retryCapture(command)).receipt).toEqual(op.receipt);
    await expect(f.pipeline.retryCapture({ ...command, body: { producerPassageId: randomUUID() } })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(f.pipeline.retryCapture(f.retry())).rejects.toMatchObject({ code: 'CAPTURE_RETRY_NOT_ALLOWED' });
  });
  it('recovers a retained ref after metadata commit failure without overwriting it or launching another producer', async () => {
    const f = await fixture();
    f.db.exec("CREATE TRIGGER fail_metadata BEFORE UPDATE OF capture_state ON deliveries WHEN NEW.capture_state='captured' BEGIN SELECT RAISE(ABORT,'fixture'); END");
    f.accept(); await f.pipeline.drain();
    const id = f.binding.deliveryVersion; const ref = `refs/factory/deliveries/${id}`; const commit = f.controlled.refs.get(ref);
    expect(commit).toBeDefined(); expect(f.storage.getDelivery(id).delivery).toMatchObject({ captureState: 'failed', diagnostic: 'CAPTURE_PERSISTENCE_FAILED', gitRef: null });
    f.db.exec('DROP TRIGGER fail_metadata'); const command = f.retry(); await f.pipeline.retryCapture(command); await f.pipeline.drain();
    expect(f.storage.getDelivery(id).delivery).toMatchObject({ captureState: 'captured', commitSha: commit });
    expect(f.controlled.calls.filter(c => c.args.includes('commit-tree'))).toHaveLength(1);
    expect(f.execution.startPassage).toHaveBeenCalledOnce();
  });
  it.each(['producer', 'revision', 'phase', 'tracking', 'cancelled', 'simultaneous'] as const)('refuses retry after %s changes without another Implementer', async reason => {
    const f = await fixture(); f.capture.mockRejectedValueOnce(new CaptureError('CAPTURE_IO_FAILED')); f.accept(); await f.pipeline.drain();
    const command = f.retry();
    if (reason === 'producer') command.body.producerPassageId = randomUUID();
    if (reason === 'revision') f.db.prepare('UPDATE attempts SET revision=revision+1 WHERE id=?').run(f.a.id);
    if (reason === 'phase') f.db.prepare("UPDATE attempts SET phase='reviewing' WHERE id=?").run(f.a.id);
    if (reason === 'tracking') f.persistence.record({ passageId: f.a.passageId }, 'interrupted', 'TRACKING_LOST', 'tracking-lost');
    if (reason === 'cancelled') f.persistence.recordCancellation(f.a.id, randomUUID());
    if (reason === 'simultaneous') await f.pipeline.retryCapture(command);
    await expect(f.pipeline.retryCapture(reason === 'simultaneous' ? f.retry() : command)).rejects.toMatchObject({ code: 'CAPTURE_RETRY_NOT_ALLOWED' });
    await f.pipeline.drain(); expect(f.execution.startPassage).toHaveBeenCalledTimes(1);
  });
  it('refuses late capture advancement after cancellation, preserving the retained resource and official result', async () => {
    const f = await fixture(); let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
    f.capture.mockImplementationOnce(async input => { await wait; return f.controlled.capture(input); });
    const result = f.accept(); await vi.waitFor(() => expect(f.capture).toHaveBeenCalledOnce());
    f.persistence.recordCancellation(f.a.id, randomUUID()); release(); await f.pipeline.drain();
    expect(f.storage.getDelivery(f.binding.deliveryVersion).delivery).toMatchObject({ captureState: 'failed', diagnostic: 'CAPTURE_CONTINUITY_REVOKED', gitRef: null });
    expect(f.controlled.refs.size).toBe(1); expect(f.persistence.getResult({ passageId: f.a.passageId })).toEqual(result);
    await expect(f.pipeline.retryCapture(f.retry())).rejects.toMatchObject({ code: 'CAPTURE_RETRY_NOT_ALLOWED' });
  });
  it('does not start capture when continuity is revoked after the result and before the scheduled capture', async () => {
    const f = await fixture(); f.accept(); f.persistence.recordCancellation(f.a.id, randomUUID()); await f.pipeline.drain();
    expect(f.capture).not.toHaveBeenCalled();
    expect(f.storage.getDelivery(f.binding.deliveryVersion).delivery).toMatchObject({ captureState: 'failed', diagnostic: 'CAPTURE_CONTINUITY_REVOKED' });
  });
  it.each(['deliveries', 'capture_warnings', 'capture_runs', 'events'] as const)('rolls back the corresponding capture transaction on %s failure', async table => {
    const f = await fixture();
    // Isolate the manually claimed SQL transaction from a separately scheduled runtime handoff event.
    vi.mocked(f.execution.preparePassageHandoff).mockResolvedValue();
    if (table === 'deliveries') {
      f.db.exec("CREATE TRIGGER fail_capture BEFORE INSERT ON deliveries BEGIN SELECT RAISE(ABORT,'fixture'); END");
      expect(() => f.accept()).toThrow('STORAGE_FAILED'); expect(f.persistence.getResult({ passageId: f.a.passageId })).toBeNull();
      expect(f.db.prepare('SELECT count(*) AS n FROM deliveries').get()).toEqual({ n: 0 }); f.db.exec('DROP TRIGGER fail_capture');
    }
    f.accept(); const c = f.storage.beginCapture(f.binding.deliveryVersion)!;
    const metadata = await f.controlled.capture(c.input);
    if (table !== 'deliveries') {
      f.db.exec(`CREATE TRIGGER fail_capture BEFORE ${table === 'capture_runs' ? 'UPDATE' : 'INSERT'} ON ${table} BEGIN SELECT RAISE(ABORT,'fixture'); END`);
      expect(() => f.storage.finishCapture(c, metadata, null)).toThrow(); expect(f.storage.getDelivery(c.deliveryId).delivery.captureState).toBe('running');
      expect(f.db.prepare('SELECT count(*) AS n FROM capture_warnings').get()).toEqual({ n: 0 }); f.db.exec('DROP TRIGGER fail_capture');
    }
    f.storage.finishCapture(c, metadata, null); expect(f.storage.getDelivery(c.deliveryId).delivery.captureState).toBe('captured');
    expect(() => f.db.prepare("UPDATE deliveries SET content_identity=? WHERE id=?").run('d'.repeat(40), c.deliveryId)).toThrow('IMMUTABLE_RECORD');
    expect(() => f.db.exec('DELETE FROM capture_warnings')).toThrow('IMMUTABLE_RECORD'); expect(f.db.pragma('foreign_key_check')).toEqual([]);
  });
  it('protects the HTTP detail/diff/retry contracts with session, CSRF, exact linkage and recoverable operation IDs', async () => {
    const f = await fixture(true); const app = f.app!; const host = '127.0.0.1:4310'; const origin = `http://${host}`;
    const bootstrap = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin, 'content-type': 'application/json', 'x-factory-client': 'web' }, payload: {} });
    const cookie = String(bootstrap.headers['set-cookie']).split(';')[0]!; const csrf = bootstrap.json<SessionResponse>().csrf_token;
    f.capture.mockRejectedValueOnce(new CaptureError('CAPTURE_IO_FAILED')); f.accept(); await f.pipeline.drain();
    const id = f.binding.deliveryVersion; const command = f.retry(); const url = `/api/v1/attempts/${f.a.id}/deliveries/${id}/capture/retry`;
    expect((await app.inject({ url: `/api/v1/deliveries/${id}`, headers: { host } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url, headers: { host, origin, cookie, 'content-type': 'application/json' }, payload: toHttpCaptureRetry(command.body) })).statusCode).toBe(403);
    const headers = { host, origin, cookie, 'content-type': 'application/json', 'x-csrf-token': csrf, 'idempotency-key': command.operationId, 'if-match': command.expectedRevision! };
    const response = await app.inject({ method: 'POST', url, headers, payload: toHttpCaptureRetry(command.body) });
    expect(response.statusCode, response.body).toBe(202); expect(response.headers.location).toBe(`/api/v1/operations/${command.operationId}`);
    await f.pipeline.drain();
    const detail = await app.inject({ url: `/api/v1/deliveries/${id}`, headers: { host, cookie } }); expect(detail.statusCode).toBe(200); expect(detail.json().delivery.capture_state).toBe('captured');
    expect(detail.body).not.toContain(f.directory); expect(detail.body).not.toContain('EXCLUDED_IGNORED_BYTES');
    const diff = await app.inject({ url: `/api/v1/deliveries/${id}/diff`, headers: { host, cookie } }); expect(diff.statusCode, diff.body).toBe(200); expect(diff.json().entries.length).toBeGreaterThan(0);
    const paged = await app.inject({ url: `/api/v1/deliveries/${id}/diff?limit=1`, headers: { host, cookie } });
    expect(paged.statusCode, paged.body).toBe(200); expect(paged.json().entries).toHaveLength(1); expect(paged.json().has_more).toBe(true);
    expect((await app.inject({ url: `/api/v1/deliveries/${id}/diff?limit=101`, headers: { host, cookie } })).statusCode).toBe(400);
    expect((await app.inject({ url: `/api/v1/deliveries/${id}/diff?cursor=invalid`, headers: { host, cookie } })).json()).toMatchObject({ code: 'DIFF_CURSOR_INVALID' });
    expect((await app.inject({ method: 'POST', url, headers, payload: toHttpCaptureRetry(command.body) })).statusCode).toBe(202);
  });
  it('measures database/WAL, auxiliary bytes and summary payload/latency before and after growing ignored caches', async () => {
    const f = await fixture(); f.accept(); await f.pipeline.drain(); const id = f.binding.deliveryVersion;
    async function directoryBytes(path: string): Promise<number> {
      let bytes = 0; for (const item of await readdir(path, { withFileTypes: true })) {
        const p = join(path, item.name); bytes += item.isDirectory() ? await directoryBytes(p) : (await stat(p)).size;
      } return bytes;
    }
    async function measure() {
      const queries = { catalog: () => f.storage.listProjects({}), polling: () => f.storage.getAttempt(f.a.id), history: () => f.storage.getEvents({}), delivery: () => f.storage.getDelivery(id) };
      const times: Record<string, number> = {}; const payloads: Record<string, string> = {};
      for (const [key, query] of Object.entries(queries)) {
        const start = performance.now(); for (let i = 0; i < 20; i++) payloads[key] = JSON.stringify(query()); times[key] = performance.now() - start;
      }
      return { times, databaseBytes: (await stat(join(f.directory, 'factory.sqlite'))).size,
        walBytes: (await stat(join(f.directory, 'factory.sqlite-wal'))).size,
        retainedMetadataBytes: await directoryBytes(join(f.directory, 'git')), payloadBytes: Buffer.byteLength(JSON.stringify(payloads)), payload: JSON.stringify(payloads) };
    }
    const before = await measure(); await writeFile(join(f.controlled.implementation, 'cache/declared.txt'), Buffer.alloc(16_777_216, 65));
    const after = await measure();
    expect(after.payload).toBe(before.payload); expect(after.databaseBytes).toBe(before.databaseBytes); expect(after.walBytes).toBe(before.walBytes);
    expect(after.retainedMetadataBytes).toBe(before.retainedMetadataBytes); expect(f.capture).toHaveBeenCalledOnce();
    const { payload: _before, ...a } = before; const { payload: _after, ...b } = after;
    console.info(JSON.stringify({ evidence: 'AC29_CONTROLLED_GIT', iterations: 20, ignoredBytesAfter: 16_777_216, before: a, after: b }));
    expect((await readFile(join(f.controlled.implementation, 'cache/declared.txt'))).length).toBe(16_777_216);
  });
});
