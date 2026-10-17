import Fastify, { type FastifyError } from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { installEventRoutes } from '../../apps/controller/src/http/routes/events.js';
import { installSecurity } from '../../apps/controller/src/http/security/index.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';

it('keeps SSE alive beyond the ordinary handler deadline without sending a second response', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'factory-stream-timeout-'));
  const storage = openStorage({ dataDirectory: directory });
  const app = Fastify({ handlerTimeout: 20 });
  const errors: string[] = [];
  // Capture the forbidden second response instead of crashing the test worker.
  app.setErrorHandler<FastifyError>((error, _request, reply) => {
    errors.push(error.code ?? 'UNKNOWN');
    reply.raw.end();
  });
  const security = installSecurity(app, loadConfiguration({}, directory), storage.getSettings().installationId);
  installEventRoutes(app, storage, security);
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
