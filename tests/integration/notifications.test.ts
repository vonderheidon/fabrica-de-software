import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { NotificationClaim, NotificationReceipt } from '#contracts';
import { attemptFixture, type AttemptFixture } from '../fixtures/attempt.js';
import { digest } from '../../apps/controller/src/modules/storage/configuration-reads.js';
import { claimNotification, notificationETag } from '../../apps/controller/src/modules/storage/notifications.js';
import { attemptEvent, recordDispatchFailure } from '../../apps/controller/src/modules/storage/attempts.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';

const fixtures: AttemptFixture[] = [];
const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); for (const f of fixtures.splice(0)) await f.close(); });
async function setup() { const f = await attemptFixture(); fixtures.push(f); return f; }
async function pending(f: AttemptFixture) {
  const prepared = await f.prepare(); const operation = await f.pipeline.startAttempt(prepared.body, prepared.context); await f.pipeline.drain();
  const id = operation.resource.id; const handle = { passageId: f.storage.getAttempt(id).passageId };
  const question = { formatVersion: 1 as const, decision: 'Escolha o comportamento', context: 'Contexto privado da decisão', alternatives: ['Primeiro', 'Segundo'] };
  const q = f.persistence.raiseQuestion({ binding: f.persistence.getPassage(handle).binding, question, sha256: digest(question) });
  const seq = f.db.prepare("SELECT max(seq) AS seq FROM events WHERE attempt_id=? AND event_type='question-raised'").get(id) as { seq: number };
  return { id, questionId: q.questionId, command: { operationId: randomUUID(), expectedRevision: undefined, body: { consumer_id: randomUUID(), surface: 'browser_host' as const, event_seq: String(seq.seq) } } };
}
it('gives a single exclusive right, recovers responses with false and keeps notification content minimal', async () => {
  const f = await setup(); const p = await pending(f);
  const before = f.storage.getQuestion(p.id, p.questionId);
  const first = f.storage.claimNotification(p.command);
  expect(Value.Check(NotificationClaim, first)).toBe(true); expect(first.send_allowed).toBe(true);
  expect(first.notification).toEqual({ title: 'Nova fábrica de software', event_kind: 'question_pending', target_hash: `#principal/tentativas?attemptId=${p.id}&dialog=detail` });
  expect(f.storage.claimNotification(p.command).send_allowed).toBe(false);
  const other = f.storage.claimNotification({ ...p.command, operationId: randomUUID() });
  expect(other.send_allowed).toBe(false); expect(other.dispatch_id).toBe(first.dispatch_id);
  expect(f.storage.getOperation(p.command.operationId)).toMatchObject({ kind: 'notification.claim', state: 'succeeded', resource: { type: 'notification', id: first.dispatch_id } });
  expect(f.storage.getOperation(p.command.operationId)).not.toHaveProperty('send_allowed');
  expect(f.storage.getQuestion(p.id, p.questionId)).toEqual(before);
  expect(JSON.stringify(first.notification)).not.toContain('Contexto privado');
});
it('deduplicates writers on two SQLite connections and rolls back a claim that cannot journal its operation', async () => {
  const f = await setup(); const p = await pending(f);
  const other = new Database(join(f.directory, 'factory.sqlite'));
  try {
    other.pragma('foreign_keys=ON'); other.pragma('busy_timeout=1');
    const first = f.storage.claimNotification(p.command);
    expect(claimNotification(other, { ...p.command, operationId: randomUUID() }).send_allowed).toBe(false);
    other.exec('BEGIN IMMEDIATE');
    expect(() => f.storage.claimNotification({ ...p.command, operationId: randomUUID(), body: { ...p.command.body, consumer_id: randomUUID() } })).toThrow();
    other.exec('ROLLBACK');
    f.db.exec("CREATE TRIGGER refuse_notification_operation BEFORE INSERT ON operation_requests WHEN NEW.operation_kind='notification.claim' BEGIN SELECT RAISE(ABORT,'CONTROLLED'); END");
    const command = { ...p.command, operationId: randomUUID(), body: { ...p.command.body, consumer_id: randomUUID() } };
    expect(() => f.storage.claimNotification(command)).toThrow();
    expect(f.db.prepare('SELECT count(*) AS n FROM notification_dispatches').get()).toEqual({ n: 1 });
    f.db.exec('DROP TRIGGER refuse_notification_operation');
    expect(f.storage.claimNotification(command).send_allowed).toBe(true);
    expect(f.storage.claimNotification(p.command).dispatch_id).toBe(first.dispatch_id);
  } finally { if (other.inTransaction) other.exec('ROLLBACK'); other.close(); }
});
it('requires CAS and valid transitions, redacts host reasons and never reopens sending after a receipt', async () => {
  const f = await setup(); const p = await pending(f); const first = f.storage.claimNotification(p.command);
  const command = { operationId: randomUUID(), expectedRevision: notificationETag(first.dispatch_id, 1), body: {
    dispatch_id: first.dispatch_id, dispatch_revision: 1, state: 'uncertain' as const, reason: 'PRIVATE_TOKEN_NOT_FOR_STORAGE' } };
  expect(() => f.storage.recordNotificationReceipt({ ...command, expectedRevision: undefined })).toThrow(expect.objectContaining({ statusCode: 428 }));
  expect(() => f.storage.recordNotificationReceipt({ ...command, expectedRevision: '"wrong"' })).toThrow(expect.objectContaining({ statusCode: 412 }));
  const receipt = f.storage.recordNotificationReceipt(command); expect(Value.Check(NotificationReceipt, receipt)).toBe(true);
  expect(receipt.state).toBe('uncertain'); expect(f.storage.recordNotificationReceipt(command)).toEqual(receipt);
  expect(f.storage.claimNotification(p.command)).toMatchObject({ state: 'uncertain', send_allowed: false });
  const confirmed = f.storage.recordNotificationReceipt({ operationId: randomUUID(), expectedRevision: notificationETag(first.dispatch_id, 2),
    body: { dispatch_id: first.dispatch_id, dispatch_revision: 2, state: 'confirmed' } });
  expect(confirmed.revision).toBe(3);
  expect(f.storage.recordNotificationReceipt(command)).toEqual(receipt);
  expect(() => f.storage.recordNotificationReceipt({ operationId: randomUUID(), expectedRevision: notificationETag(first.dispatch_id, 3), body: { dispatch_id: first.dispatch_id, dispatch_revision: 3, state: 'unavailable' } })).toThrow(expect.objectContaining({ statusCode: 409 }));
  const row = f.db.prepare('SELECT * FROM notification_dispatches').get();
  expect(JSON.stringify(row)).not.toContain('PRIVATE_TOKEN');
  expect(row).toMatchObject({ reason: 'SURFACE_CONFIRMED' });
  expect(f.storage.getQuestion(p.id, p.questionId).view.state).toBe('pending');
});
it('preserves unavailable dispatches and keeps the original question consultable', async () => {
  const f = await setup(); const p = await pending(f); const claim = f.storage.claimNotification(p.command);
  f.storage.recordNotificationReceipt({ operationId: randomUUID(), expectedRevision: notificationETag(claim.dispatch_id, 1), body: { dispatch_id: claim.dispatch_id, dispatch_revision: 1, state: 'unavailable' } });
  expect(f.storage.claimNotification({ ...p.command, operationId: randomUUID() })).toMatchObject({ state: 'unavailable', send_allowed: false });
  expect(f.storage.getQuestion(p.id, p.questionId).view.state).toBe('pending');
});
it('preserves a lost response and reserved rights across restart as uncertain without a new send', async () => {
  const f = await setup(); const p = await pending(f); const claim = f.storage.claimNotification(p.command);
  await f.pipeline.close(); const questionBeforeRestart = f.storage.getQuestion(p.id, p.questionId); f.storage.close();
  const reopened = openStorage({ dataDirectory: f.directory });
  try {
    expect(reopened.claimNotification(p.command)).toMatchObject({ dispatch_id: claim.dispatch_id, state: 'uncertain', revision: 2, send_allowed: false });
    expect(reopened.claimNotification({ ...p.command, operationId: randomUUID() }).send_allowed).toBe(false);
    const receipt = reopened.recordNotificationReceipt({ operationId: randomUUID(), expectedRevision: notificationETag(claim.dispatch_id, 2), body: { dispatch_id: claim.dispatch_id, dispatch_revision: 2, state: 'confirmed' } });
    expect(receipt.state).toBe('confirmed');
    expect(reopened.getQuestion(p.id, p.questionId)).toEqual(questionBeforeRestart);
  } finally { reopened.close(); }
});
it('rejects unrelated events, expired questions, stale operation bodies and unknown IDs', async () => {
  const f = await setup(); const p = await pending(f);
  const claim = f.storage.claimNotification(p.command);
  expect(() => f.storage.claimNotification({ ...p.command, body: { ...p.command.body, consumer_id: randomUUID() } })).toThrow(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }));
  expect(() => f.storage.claimNotification({ ...p.command, operationId: randomUUID(), body: { ...p.command.body, event_seq: '99999999999999999999' } })).toThrow(expect.objectContaining({ statusCode: 404 }));
  f.db.prepare('UPDATE attempts SET revision=revision+1 WHERE id=?').run(p.id); attemptEvent(f.db, p.id, 'heartbeat');
  const seq = f.db.prepare('SELECT max(seq) AS seq FROM events').get() as { seq: number };
  expect(() => f.storage.claimNotification({ ...p.command, operationId: randomUUID(), body: { ...p.command.body, event_seq: String(seq.seq) } })).toThrow(expect.objectContaining({ statusCode: 404 }));
  f.db.prepare("UPDATE execution_questions SET state='expired',revision=revision+1 WHERE id=?").run(p.questionId);
  expect(() => f.storage.claimNotification({ ...p.command, operationId: randomUUID(), body: { ...p.command.body, consumer_id: randomUUID() } })).toThrow(expect.objectContaining({ statusCode: 409 }));
  expect(f.storage.claimNotification(p.command).send_allowed).toBe(false);
  expect(() => f.storage.recordNotificationReceipt({ operationId: randomUUID(), expectedRevision: '"1"', body: { dispatch_id: randomUUID(), dispatch_revision: claim.revision, state: 'confirmed' } })).toThrow(expect.objectContaining({ statusCode: 404 }));
});
it('allows distinct failure and completion events, while preserving their original facts', async () => {
  const f = await setup(); const prepared = await f.prepare(); const accepted = await f.pipeline.startAttempt(prepared.body, prepared.context); await f.pipeline.drain();
  const id = accepted.resource.id;
  recordDispatchFailure(f.db, id, 'CONTROLLED_FAILURE');
  let seq = f.db.prepare('SELECT max(seq) AS seq FROM events').get() as { seq: number };
  const body = { consumer_id: randomUUID(), surface: 'browser_host' as const, event_seq: String(seq.seq) };
  expect(f.storage.claimNotification({ operationId: randomUUID(), expectedRevision: undefined, body }).notification.event_kind).toBe('failure');
  f.db.transaction(() => { f.db.prepare("UPDATE attempts SET phase='finished',result='delivered',suspension=NULL,revision=revision+1 WHERE id=?").run(id); attemptEvent(f.db, id, 'attempt.icr-completed'); })();
  seq = f.db.prepare('SELECT max(seq) AS seq FROM events').get() as { seq: number };
  const result = f.storage.claimNotification({ operationId: randomUUID(), expectedRevision: undefined, body: { ...body, event_seq: String(seq.seq) } });
  expect(result.send_allowed).toBe(true); expect(result.notification.event_kind).toBe('completion'); expect(f.storage.getAttempt(id).result).toBe('delivered');
});

it('does not grant authority through a known consumer or dispatch in another account scope', async () => {
  const f = await setup(); const p = await pending(f); const claim = f.storage.claimNotification(p.command);
  const account = f.storage.getSettings().account_id;
  try {
    f.db.prepare('UPDATE factory_settings SET account_id=NULL').run();
    expect(() => f.storage.claimNotification({ ...p.command, operationId: randomUUID() })).toThrow(expect.objectContaining({ statusCode: 404 }));
    expect(() => f.storage.recordNotificationReceipt({ operationId: randomUUID(), expectedRevision: notificationETag(claim.dispatch_id, 1), body: { dispatch_id: claim.dispatch_id, dispatch_revision: 1, state: 'confirmed' } })).toThrow(expect.objectContaining({ statusCode: 404 }));
    expect(f.storage.getOperation(p.command.operationId)).toBeNull();
  } finally { f.db.prepare('UPDATE factory_settings SET account_id=?').run(account); }
  expect(f.storage.claimNotification(p.command).send_allowed).toBe(false);
});
it('protects claims and receipts with technical session, CSRF, idempotency and current revision over HTTP', async () => {
  const f = await setup();
  const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory), f.storage, undefined, undefined, { github: f.github, workspaces: f.workspaces }, f.pipeline); apps.push(app);
  const host = '127.0.0.1:4310', origin = `http://${host}`;
  expect((await app.inject({ method: 'POST', url: '/api/v1/notifications/claims', headers: { host, origin }, payload: {} })).statusCode).toBe(401);
  const session = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin, 'x-factory-client': 'web' }, payload: {} });
  const headers = { host, origin, cookie: String(session.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': session.json<{ csrf_token: string }>().csrf_token };
  const p = await pending(f);
  const response = await app.inject({ method: 'POST', url: '/api/v1/notifications/claims', headers: { ...headers, 'idempotency-key': p.command.operationId }, payload: p.command.body });
  expect(response.statusCode, response.body).toBe(200);
  const claim = response.json<NotificationClaim>(); expect(Value.Check(NotificationClaim, claim)).toBe(true); expect(claim.send_allowed).toBe(true);
  const replay = await app.inject({ method: 'POST', url: '/api/v1/notifications/claims', headers: { ...headers, 'idempotency-key': p.command.operationId }, payload: p.command.body });
  expect(replay.json<NotificationClaim>().send_allowed).toBe(false);
  const receipt = await app.inject({ method: 'POST', url: '/api/v1/notifications/receipts', headers: { ...headers, 'idempotency-key': randomUUID(), 'if-match': String(response.headers.etag) }, payload: { dispatch_id: claim.dispatch_id, dispatch_revision: claim.revision, state: 'confirmed' } });
  expect(receipt.statusCode, receipt.body).toBe(200); expect(Value.Check(NotificationReceipt, receipt.json())).toBe(true);
  const concurrentBody = { ...p.command.body, consumer_id: randomUUID() };
  const concurrent = await Promise.all(Array.from({ length: 8 }, () => app.inject({ method: 'POST', url: '/api/v1/notifications/claims',
    headers: { ...headers, 'idempotency-key': randomUUID() }, payload: concurrentBody })));
  expect(concurrent.every(result => result.statusCode === 200)).toBe(true);
  expect(concurrent.filter(result => result.json<NotificationClaim>().send_allowed)).toHaveLength(1);
  expect(new Set(concurrent.map(result => result.json<NotificationClaim>().dispatch_id)).size).toBe(1);
  const operation = await app.inject({ url: `/api/v1/operations/${p.command.operationId}`, headers });
  expect(operation.statusCode, operation.body).toBe(200); expect(operation.body).not.toContain('send_allowed');
  expect((await app.inject({ method: 'POST', url: '/api/v1/notifications/claims', headers, payload: p.command.body })).statusCode).toBe(400);
  expect((await app.inject({ method: 'POST', url: '/api/v1/notifications/claims', headers: { ...headers, origin: 'http://foreign.invalid', 'idempotency-key': randomUUID() }, payload: p.command.body })).statusCode).toBe(403);
});
