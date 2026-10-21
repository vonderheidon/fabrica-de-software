import Fastify, { type FastifyError } from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { installEventRoutes } from '../../apps/controller/src/http/routes/events.js';
import { httpLimits, installSecurity } from '../../apps/controller/src/http/security/index.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';

const testStreamLimits = {
  ...httpLimits,
  // Leave scheduling headroom after the bounded stream lifetime under suite load.
  // The first proof separately keeps the ordinary Fastify handler deadline at 10 ms.
  handlerTimeoutMs: 500,
  streamLifetimeMs: 35,
  streamPollMs: 5,
  streamBufferBytes: 1024,
};

it('keeps SSE alive beyond the ordinary handler deadline without sending a second response', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'factory-stream-timeout-'));
  const storage = openStorage({ dataDirectory: directory });
  const app = Fastify({ handlerTimeout: 10 });
  const errors: string[] = [];
  // Capture the forbidden second response instead of crashing the test worker.
  app.setErrorHandler<FastifyError>((error, _request, reply) => {
    errors.push(error.code ?? 'UNKNOWN');
    reply.raw.end();
  });
  const security = installSecurity(app, loadConfiguration({}, directory), storage.getSettings().installation_id);
  installEventRoutes(app, storage, security, testStreamLimits);
  const read = storage.getEvents.bind(storage);
  vi.spyOn(storage, 'getEvents').mockImplementationOnce(query => read(query)).mockImplementation(() => { throw new Error('End stream after the first polling interval'); });
  try {
    const headers = { host: '127.0.0.1:4310', origin: 'http://127.0.0.1:4310', 'content-type': 'application/json', 'x-factory-client': 'web' };
    const session = await app.inject({ method: 'POST', url: '/api/v1/session', headers, payload: {} });
    const response = await app.inject({ url: '/api/v1/events/stream?cursor=0', headers: { ...headers, cookie: String(session.headers['set-cookie']).split(';')[0]! } });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(': heartbeat');
    expect(response.body).toContain('event: resync');
  } finally {
    await app.close();
    storage.close();
    rmSync(directory, { recursive: true });
  }
});

it('prefers Last-Event-ID over the query cursor and resumes after that sequence', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'factory-stream-cursor-'));
  const storage = openStorage({ dataDirectory: directory });
  const app = Fastify({ handlerTimeout: testStreamLimits.handlerTimeoutMs });
  const security = installSecurity(app, loadConfiguration({}, directory), storage.getSettings().installation_id);
  const observedCursors: (string | undefined)[] = [];
  const readEvents = storage.getEvents.bind(storage);
  vi.spyOn(storage, 'getEvents').mockImplementation(query => {
    observedCursors.push(query.cursor);
    return readEvents(query);
  });
  installEventRoutes(app, storage, security, testStreamLimits);
  try {
    let expectedRevision = storage.getSettingsETag();
    let timeDefaults = storage.getSettings().time_defaults;
    for (const [index, operationId] of [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ].entries()) {
      storage.saveTimeDefaults({
        operationId,
        expectedRevision,
        timeDefaults: { ...timeDefaults, passage_active_time_ms: timeDefaults.passage_active_time_ms + index + 1 },
      });
      expectedRevision = storage.getSettingsETag();
      timeDefaults = storage.getSettings().time_defaults;
    }
    const headers = {
      host: '127.0.0.1:4310',
      origin: 'http://127.0.0.1:4310',
      'content-type': 'application/json',
      'x-factory-client': 'web',
    };
    const session = await app.inject({ method: 'POST', url: '/api/v1/session', headers, payload: {} });
    const response = await app.inject({
      url: '/api/v1/events/stream?cursor=0',
      headers: { ...headers, cookie: String(session.headers['set-cookie']).split(';')[0]!, 'last-event-id': '1' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('id: 2\n');
    expect(response.body).not.toContain('id: 1\n');
    expect(observedCursors[0]).toBe('1');
  } finally {
    await app.close();
    storage.close();
    rmSync(directory, { recursive: true });
  }
});
