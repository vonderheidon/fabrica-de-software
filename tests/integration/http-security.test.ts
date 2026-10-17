import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { setTimeout } from 'node:timers/promises';
import Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyQuery, ErrorResponse, OperationAccepted, OperationView, SessionResponse, TimeDefaults } from '#contracts';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { commandHeaders, httpLimits, sendOperationAccepted } from '../../apps/controller/src/http/security/index.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';

const directories: string[] = [];
const apps: ReturnType<typeof createApp>[] = [];
const host = '127.0.0.1:4310';
const origin = `http://${host}`;
const bootstrapHeaders = { host, origin, 'content-type': 'application/json', 'x-factory-client': 'web' };
function fixture(logging = false) {
  const directory = mkdtempSync(join(tmpdir(), 'factory-security-'));
  directories.push(directory);
  const storage = openStorage({ dataDirectory: directory, busyTimeoutMs: 25 });
  const logs: string[] = [];
  const stream = new Writable({ write(chunk: Buffer, _encoding, callback) { logs.push(chunk.toString('utf8')); callback(); } });
  const configuration = loadConfiguration({ FACTORY_DATA_DIR: directory, FACTORY_LOG_LEVEL: logging ? 'info' : 'silent' }, directory);
  const app = createApp(configuration, storage, stream);
  apps.push(app);
  let executions = 0;
  // Test-only domain route: production exposes no settings command in this sprint.
  app.put('/api/v1/test/time-defaults', { schema: { body: TimeDefaults, querystring: EmptyQuery, response: { 202: OperationAccepted } } }, async (request, reply) => {
    const input = commandHeaders(request);
    storage.saveTimeDefaults({ ...input, timeDefaults: request.body });
    executions += 1;
    return sendOperationAccepted(reply, request.id, storage, input.operationId);
  });
  app.get('/api/v1/test/failure', async () => { throw new Error('SYNTHETIC_SECRET_HANDLE bootstrap authorization'); });
  app.get('/api/v1/test/etag', async (_request, reply) => reply.header('ETag', storage.getSettingsETag()).send({}));
  return { app, storage, directory, logs, executions: () => executions };
}
async function session(app: ReturnType<typeof createApp>, existing?: string) {
  const response = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { ...bootstrapHeaders, ...(existing ? { cookie: existing } : {}) }, payload: {} });
  expect(response.statusCode).toBe(200);
  expect(Value.Check(SessionResponse, response.json())).toBe(true);
  const setCookie = response.headers['set-cookie'];
  const cookie = existing ?? String(setCookie).split(';')[0]!;
  const body = response.json<SessionResponse>();
  return { cookie, body, response, headers: { host, origin, cookie, 'content-type': 'application/json', 'x-csrf-token': body.csrfToken } };
}
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

describe('technical session boundary', () => {
  it.each([undefined, 'null', 'https://example.com', 'http://127.0.0.1:4311', 'http://localhost:4310'])('rejects Origin %s', async (badOrigin) => {
    const { app } = fixture();
    const headers: Record<string, string> = { ...bootstrapHeaders };
    if (badOrigin === undefined) delete headers.origin; else headers.origin = badOrigin;
    const response = await app.inject({ method: 'POST', url: '/api/v1/session', headers, payload: {} });
    expect(response.statusCode).toBe(403);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(Value.Check(ErrorResponse, response.json())).toBe(true);
  });
  it.each(['cross-site', 'same-site', 'none'])('rejects Fetch-Site %s', async (site) => {
    const { app } = fixture();
    expect((await app.inject({ method: 'POST', url: '/api/v1/session', headers: { ...bootstrapHeaders, 'sec-fetch-site': site }, payload: {} })).statusCode).toBe(403);
  });
  it('requires exact Host, web header, JSON and empty object, without issuing cookie for invalid requests', async () => {
    const { app } = fixture();
    for (const [headers, payload, status] of [
      [{ ...bootstrapHeaders, host: 'localhost:4310' }, {}, 403],
      [{ ...bootstrapHeaders, 'x-factory-client': '' }, {}, 400],
      [{ ...bootstrapHeaders, 'content-type': 'text/plain' }, '{}', 415],
      [bootstrapHeaders, { value: 'SYNTHETIC_SECRET' }, 400],
      [bootstrapHeaders, [], 400],
      [bootstrapHeaders, null, 400],
    ] as const) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/session', headers, payload: JSON.stringify(payload) });
      expect(response.statusCode).toBe(status);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });
  it('generates independent 32-byte secrets, session-only host-only cookie and reuses the same session', async () => {
    const { app, storage } = fixture();
    const before = storage.getSettings();
    const first = await session(app);
    const cookieValue = first.cookie.split('=')[1]!;
    expect(Buffer.from(cookieValue, 'base64url')).toHaveLength(32);
    expect(Buffer.from(first.body.csrfToken, 'base64url')).toHaveLength(32);
    expect(cookieValue).not.toBe(first.body.csrfToken);
    expect(first.response.headers['set-cookie']).toMatch(/Path=\/api\/v1; HttpOnly; SameSite=Strict/);
    expect(first.response.headers['set-cookie']).not.toMatch(/Domain=|Secure|Expires=|Max-Age=|__Host-|__Secure-/);
    expect(first.response.headers['cache-control']).toBe('no-store');
    const next = await session(app, first.cookie);
    expect(next.body).toEqual(first.body);
    expect(next.response.headers['set-cookie']).toBeUndefined();
    expect(storage.getSettings()).toEqual(before);
    const unknown = await session(app, first.cookie.replace(cookieValue, 'A'.repeat(43)));
    expect(unknown.body.csrfToken).not.toBe(first.body.csrfToken);
  });
  it('GETs never bootstrap; operational reads and SSE require session; preflight remains closed', async () => {
    const { app } = fixture();
    for (const url of ['/api/v1/session', `/api/v1/operations/${randomUUID()}`, '/api/v1/events', '/api/v1/events/stream']) {
      const response = await app.inject({ url, headers: { host } });
      expect(response.statusCode).toBe(401);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    const preflight = await app.inject({ method: 'OPTIONS', url: '/api/v1/session', headers: { host, origin: 'https://external.example', 'access-control-request-method': 'POST' } });
    expect(preflight.statusCode).toBe(403);
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    const valid = await session(app);
    expect((await app.inject({ url: '/api/v1/session', headers: { host, cookie: valid.cookie } })).statusCode).toBe(404);
  });
  it('rejects absent/wrong/cross-session CSRF, Origin, JSON and missing session for mutations', async () => {
    const { app, storage } = fixture();
    const first = await session(app);
    const second = await session(app);
    const headers = { ...first.headers, 'idempotency-key': randomUUID(), 'if-match': storage.getSettingsETag() };
    for (const [changed, expected] of [
      [{ ...headers, cookie: '' }, 401],
      [{ ...headers, 'x-csrf-token': '' }, 403],
      [{ ...headers, 'x-csrf-token': 'bad' }, 403],
      [{ ...headers, 'x-csrf-token': second.body.csrfToken }, 403],
      [{ ...headers, origin: '' }, 403],
      [{ ...headers, 'content-type': 'text/plain' }, 415],
    ] as const) expect((await app.inject({ method: 'PUT', url: '/api/v1/test/time-defaults', headers: changed, payload: JSON.stringify(storage.getSettings().timeDefaults) })).statusCode).toBe(expected);
    expect(storage.getSettings().revision).toBe(1);
  });
  it('revokes previous-instance cookies and CSRF at restart', async () => {
    const first = fixture();
    const valid = await session(first.app);
    await first.app.close();
    const storage = openStorage({ dataDirectory: first.directory });
    const configuration = loadConfiguration({ FACTORY_DATA_DIR: first.directory, FACTORY_LOG_LEVEL: 'silent' }, first.directory);
    const next = createApp(configuration, storage);
    apps.push(next);
    expect((await next.inject({ url: '/api/v1/events', headers: { host, cookie: valid.cookie } })).statusCode).toBe(401);
    const renewed = await session(next, valid.cookie);
    expect(renewed.body.instanceId).not.toBe(valid.body.instanceId);
    expect(renewed.body.csrfToken).not.toBe(valid.body.csrfToken);
    expect(renewed.response.headers['set-cookie']).toBeDefined();
  });
  it('bounds bootstrap rate and documents finite server limits', async () => {
    const { app } = fixture();
    const valid = await session(app);
    for (let index = 1; index < httpLimits.bootstrapPerMinute; index += 1) await session(app, valid.cookie);
    const response = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { ...bootstrapHeaders, cookie: valid.cookie }, payload: {} });
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('60');
    expect(app.server.maxConnections).toBe(128);
    expect(app.server.headersTimeout).toBe(10_000);
    expect(app.server.requestTimeout).toBe(15_000);
  });
  it('bounds session memory without evicting valid sessions, and limits total requests', async () => {
    const { app } = fixture();
    const first = await session(app);
    let now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      for (let index = 1; index < httpLimits.sessions; index += 1) {
        if (index % 40 === 0) now += 60_001;
        await session(app);
      }
      const rejected = await app.inject({ method: 'POST', url: '/api/v1/session', headers: bootstrapHeaders, payload: {} });
      expect(rejected.statusCode).toBe(503);
      expect(rejected.headers['set-cookie']).toBeUndefined();
      expect((await session(app, first.cookie)).body).toEqual(first.body);
      now += 60_001;
      for (let index = 0; index < httpLimits.requestsPerMinute; index += 1) {
        expect((await app.inject({ url: '/api/v1/health', headers: { host } })).statusCode).toBe(200);
      }
      expect((await app.inject({ url: '/api/v1/health', headers: { host } })).statusCode).toBe(429);
    } finally { clock.mockRestore(); }
  });
  it('returns 413 and sanitized errors; secrets never enter logs, receipts or events', async () => {
    const { app, logs, storage, directory } = fixture(true);
    const valid = await session(app);
    const marker = 'SYNTHETIC_SECRET_HANDLE';
    const headers = { ...valid.headers, authorization: marker, 'x-request-id': marker, 'x-bootstrap': marker };
    const oversized = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { ...headers, 'x-factory-client': 'web' }, payload: { value: marker.repeat(2000) } });
    expect(oversized.statusCode).toBe(413);
    expect(Value.Check(ErrorResponse, oversized.json())).toBe(true);
    const failed = await app.inject({ url: '/api/v1/test/failure?bootstrap='+marker, headers });
    expect(failed.statusCode).toBe(500);
    expect(Value.Check(ErrorResponse, failed.json())).toBe(true);
    const invalid = await app.inject({ method: 'PUT', url: '/api/v1/test/time-defaults', headers, payload: { handle: marker } });
    expect(invalid.statusCode).toBe(400);
    const combined = [...logs, oversized.body, failed.body, invalid.body, JSON.stringify(storage.getEvents({}))].join('\n');
    for (const secret of [marker, valid.body.csrfToken, valid.cookie.split('=')[1]!]) expect(combined).not.toContain(secret);
    const db = new Database(join(directory, 'factory.sqlite'), { readonly: true });
    try { expect(db.prepare('SELECT * FROM operation_requests').all()).toEqual([]); } finally { db.close(); }
  });
  it('ends a handler wait with a sanitized 503 envelope', async () => {
    const { app } = fixture();
    app.get('/api/v1/test/timeout', { handlerTimeout: 10 }, async () => { await setTimeout(30); return {}; });
    const valid = await session(app);
    const response = await app.inject({ url: '/api/v1/test/timeout', headers: { host, cookie: valid.cookie } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'REQUEST_TIMEOUT' });
    expect(Value.Check(ErrorResponse, response.json())).toBe(true);
  });
});

describe('durable operation HTTP boundary', () => {
  it('recovers a lost response with the client UUID, replays before new CAS checks and scopes queries', async () => {
    const { app, storage, directory } = fixture();
    const valid = await session(app);
    const operationId = randomUUID();
    const headers = { ...valid.headers, 'idempotency-key': operationId, 'if-match': storage.getSettingsETag() };
    const payload = { ...storage.getSettings().timeDefaults, pollingIntervalMs: 25_000 };
    const response = await app.inject({ method: 'PUT', url: '/api/v1/test/time-defaults', headers, payload });
    expect(response.statusCode).toBe(202);
    expect(Value.Check(OperationAccepted, response.json())).toBe(true);
    expect(response.headers.location).toBe(`/api/v1/operations/${operationId}`);
    const receipt = await app.inject({ url: response.headers.location!, headers: { host, cookie: valid.cookie } });
    expect(receipt.statusCode).toBe(200);
    expect(Value.Check(OperationView, receipt.json())).toBe(true);
    expect(receipt.json()).toMatchObject({ operationId, state: 'succeeded', receipt: { revision: 2, eventCursor: '1' } });
    const replay = await app.inject({ method: 'PUT', url: '/api/v1/test/time-defaults', headers, payload: { questionTtl: payload.questionTtl, passageActiveTimeMs: payload.passageActiveTimeMs, pollingIntervalMs: payload.pollingIntervalMs, formatVersion: 1 } });
    expect(replay.statusCode).toBe(202);
    expect(replay.json().receipt).toEqual(response.json().receipt);
    expect(replay.json().requestId).not.toBe(response.json().requestId);
    expect(storage.getSettings().revision).toBe(2);
    for (const modified of [
      { headers, payload: { ...payload, pollingIntervalMs: 99 } },
      { headers: { ...headers, 'if-match': storage.getSettingsETag() }, payload },
    ]) expect((await app.inject({ method: 'PUT', url: '/api/v1/test/time-defaults', ...modified })).statusCode).toBe(409);
    expect((await app.inject({ method: 'PUT', url: '/api/v1/test/time-defaults', headers: { ...headers, 'idempotency-key': randomUUID() }, payload })).statusCode).toBe(412);
    const noMatch = { ...valid.headers, 'idempotency-key': randomUUID() };
    expect((await app.inject({ method: 'PUT', url: '/api/v1/test/time-defaults', headers: noMatch, payload })).statusCode).toBe(428);
    expect((await app.inject({ method: 'PUT', url: '/api/v1/test/time-defaults', headers: valid.headers, payload })).statusCode).toBe(400);
    expect((await app.inject({ url: `/api/v1/operations/${randomUUID()}`, headers: { host, cookie: valid.cookie } })).statusCode).toBe(404);
    const db = new Database(join(directory, 'factory.sqlite'));
    try {
      db.prepare("INSERT INTO accounts VALUES ('other', 'other', 1, 1, 1, 1)").run();
      db.prepare("UPDATE factory_settings SET account_id = 'other'").run();
      expect(storage.getOperation(operationId)).toBeNull();
      expect((await app.inject({ method: 'PUT', url: '/api/v1/test/time-defaults', headers, payload })).statusCode).toBe(409);
    } finally { db.close(); }
  });
  it('never ACKs or continues after event write failure; restores resource and operation index', async () => {
    const { app, storage, directory, executions } = fixture();
    const valid = await session(app);
    const operationId = randomUUID();
    const initial = storage.getSettings();
    const db = new Database(join(directory, 'factory.sqlite'));
    try {
      db.exec("CREATE TRIGGER fail_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'SYNTHETIC_SECRET_DISK'); END");
      const response = await app.inject({ method: 'PUT', url: '/api/v1/test/time-defaults', headers: { ...valid.headers, 'idempotency-key': operationId, 'if-match': storage.getSettingsETag() }, payload: initial.timeDefaults });
      expect(response.statusCode).toBe(503);
      expect(response.headers.location).toBeUndefined();
      expect(response.body).not.toContain('SYNTHETIC_SECRET');
      expect(executions()).toBe(0);
      expect(storage.getOperation(operationId)).toBeNull();
      expect(storage.getSettings()).toEqual(initial);
      expect(storage.getEvents({}).items).toEqual([]);
    } finally { db.close(); }
  });
  it('rejects a receipt response for an operation without a durable domain record', async () => {
    const { app, storage } = fixture();
    const operationId = randomUUID();
    app.post('/api/v1/test/uncommitted', async (request, reply) => sendOperationAccepted(reply, request.id, storage, operationId));
    const valid = await session(app);
    const response = await app.inject({ method: 'POST', url: '/api/v1/test/uncommitted', headers: valid.headers, payload: {} });
    expect(response.statusCode).toBe(503);
    expect(response.headers.location).toBeUndefined();
  });
  it('returns ETags, rejects malformed operation IDs, and keeps GET read-only', async () => {
    const { app, storage } = fixture();
    const valid = await session(app);
    const before = storage.getSettings();
    const response = await app.inject({ url: '/api/v1/test/etag', headers: { host, cookie: valid.cookie } });
    expect(response.headers.etag).toBe(storage.getSettingsETag());
    expect(response.headers.etag).toMatch(/^"[a-f0-9]{64}"$/);
    for (const suffix of ['invalid', randomUUID()+'?secret=SYNTHETIC_SECRET']) {
      const rejected = await app.inject({ url: '/api/v1/operations/'+suffix, headers: { host, cookie: valid.cookie } });
      expect(rejected.statusCode).toBe(400);
      expect(Value.Check(ErrorResponse, rejected.json())).toBe(true);
      expect(rejected.body).not.toContain('SYNTHETIC_SECRET');
    }
    expect(storage.getSettings()).toEqual(before);
    expect(storage.getEvents({}).items).toEqual([]);
  });
  it('pages durable events with stable order, no duplicated replay events, scoped queries and resync', async () => {
    const { app, storage } = fixture();
    const valid = await session(app);
    const operationIds: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const operationId = randomUUID();
      operationIds.push(operationId);
      const command = { operationId, expectedRevision: storage.getSettingsETag(), timeDefaults: storage.getSettings().timeDefaults };
      storage.saveTimeDefaults(command);
      storage.saveTimeDefaults(command);
    }
    const readHeaders = { host, cookie: valid.cookie };
    const first = await app.inject({ url: '/api/v1/events?limit=2', headers: readHeaders });
    expect(first.json()).toMatchObject({ items: [{ seq: '1' }, { seq: '2' }], hasMore: true, eventCursor: '3' });
    const nextCursor: string = first.json().nextCursor;
    expect(nextCursor).not.toBe('2');
    const next = await app.inject({ url: '/api/v1/events?limit=2&cursor='+nextCursor, headers: readHeaders });
    expect(next.json()).toMatchObject({ items: [{ seq: '3' }], nextCursor: null, hasMore: false });
    const filtered = await app.inject({ url: '/api/v1/events?operationId='+operationIds[1], headers: readHeaders });
    expect(filtered.json().items).toHaveLength(1);
    expect(filtered.json().items[0].seq).toBe('2');
    expect((await app.inject({ url: `/api/v1/events?cursor=${nextCursor}&operationId=${operationIds[0]}`, headers: readHeaders })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/v1/events?cursor=invalid', headers: readHeaders })).statusCode).toBe(400);
    expect(() => storage.getEvents({ cursor: '99' })).toThrowError(expect.objectContaining({ code: 'EVENT_RESYNC_REQUIRED' }));
    expect((await app.inject({ url: '/api/v1/events?limit=101', headers: readHeaders })).statusCode).toBe(400);
    const resync = await app.inject({ url: '/api/v1/events/stream?cursor=99', headers: readHeaders });
    expect(resync.headers['content-type']).toBe('text/event-stream');
    expect(resync.body).toContain('event: resync');
    expect((await app.inject({ url: '/api/v1/events/stream', headers: { ...readHeaders, 'last-event-id': 'SYNTHETIC_SECRET' } })).statusCode).toBe(400);
  });
});
