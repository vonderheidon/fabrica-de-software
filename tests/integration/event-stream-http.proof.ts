import Fastify, { type FastifyError } from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { expect, it } from 'vitest';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { installEventRoutes } from '../../apps/controller/src/http/routes/events.js';
import { httpLimits, installSecurity } from '../../apps/controller/src/http/security/index.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';

const testStreamLimits = {
  ...httpLimits,
  handlerTimeoutMs: 10,
  streamLifetimeMs: 35,
  streamPollMs: 5,
  streamBufferBytes: 1024,
};

async function reserveLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The test server did not expose a TCP address.');
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

it('reproduces the legacy premature close when the deadline signal destroys Readable.from', async () => {
  const app = Fastify();
  let deadline: ReturnType<typeof globalThis.setTimeout> | null = null;
  app.get('/legacy-events', (_request, reply) => {
    const controller = new AbortController();
    const body = Readable.from((async function* () {
      yield ': connected\n\n';
      await new Promise(resolve => globalThis.setTimeout(resolve, 1000));
      yield ': complete\n\n';
    })(), { objectMode: false, signal: controller.signal });
    deadline = globalThis.setTimeout(() => controller.abort(), 50);
    return reply.type('text/event-stream').send(body);
  });

  try {
    const origin = await app.listen({ port: 0, host: '127.0.0.1' });
    const response = await fetch(origin + '/legacy-events');
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    let failure: unknown;
    try {
      while (!(await reader!.read()).done) { /* Read until EOF or transport failure. */ }
    } catch (error: unknown) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(TypeError);
    if (!(failure instanceof TypeError)) return;
    const cause = 'cause' in failure ? failure.cause : undefined;
    const causeCode = cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string'
      ? cause.code : null;
    expect(failure.message).toBe('terminated');
    expect(causeCode).toBe('UND_ERR_SOCKET');
    console.log(JSON.stringify({ reproduction: 'legacy-readable-abort', stage: 'legacy-events-reader.read', error_name: failure.name, error_message: failure.message, cause_code: causeCode }));
  } finally {
    if (deadline !== null) globalThis.clearTimeout(deadline);
    await app.close();
  }
});

it('ends at the bounded stream deadline with expected EOF over real HTTP', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'factory-stream-eof-'));
  const storage = openStorage({ dataDirectory: directory });
  const port = await reserveLoopbackPort();
  const origin = `http://127.0.0.1:${port}`;
  const app = Fastify({ handlerTimeout: testStreamLimits.handlerTimeoutMs });
  const errors: string[] = [];
  app.setErrorHandler<FastifyError>((error, _request, reply) => {
    errors.push(error.code ?? 'UNKNOWN');
    reply.raw.end();
  });
  const security = installSecurity(app, loadConfiguration({ FACTORY_PORT: String(port), FACTORY_BROWSER_ORIGIN: origin }, directory), storage.getSettings().installation_id);
  installEventRoutes(app, storage, security, testStreamLimits);
  try {
    const headers = { host: new URL(origin).host, origin, 'content-type': 'application/json', 'x-factory-client': 'web' };
    const session = await app.inject({ method: 'POST', url: '/api/v1/session', headers, payload: {} });
    const startedAt = Date.now();
    await app.listen({ port, host: '127.0.0.1' });
    const response = await fetch(origin + '/api/v1/events/stream?cursor=0', {
      headers: { cookie: String(session.headers['set-cookie']).split(';')[0]! },
      signal: AbortSignal.timeout(1000),
    });
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    let body = '';
    let ended = false;
    while (!ended) {
      const chunk = await reader!.read();
      ended = chunk.done;
      if (chunk.value) body += new TextDecoder().decode(chunk.value);
    }
    expect(body).toContain(': heartbeat');
    expect(body).not.toContain('event: resync');
    expect(ended).toBe(true);
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ reproduction: 'bounded-production-stream', stage: 'events-reader.read', status: response.status, termination: 'eof', heartbeat: body.includes(': heartbeat'), resync: body.includes('event: resync'), handler_errors: errors }));
  } finally {
    await app.close();
    storage.close();
    rmSync(directory, { recursive: true });
  }
});
