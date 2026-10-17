import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { installAssets } from '../../apps/controller/src/http/assets.js';
import { installErrors } from '../../apps/controller/src/http/errors.js';
import { installSecurity } from '../../apps/controller/src/http/security/index.js';

const directories: string[] = [];
const apps: ReturnType<typeof Fastify>[] = [];
const host = '127.0.0.1:4310';
const origin = `http://${host}`;

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'Fábrica assets-'));
  directories.push(directory);
  mkdirSync(join(directory, 'assets'));
  writeFileSync(join(directory, 'index.html'), '<html><script src="/assets/client.js"></script></html>', 'utf8');
  writeFileSync(join(directory, 'assets/client.js'), 'console.log("Fábrica");', 'utf8');
  writeFileSync(join(directory, 'assets/client.css'), 'body { color: black; }', 'utf8');
  writeFileSync(join(directory, '.env'), 'SYNTHETIC_PRIVATE_FILE', 'utf8');
  const app = Fastify();
  apps.push(app);
  installErrors(app);
  // Same ordering and implementations as the controller composition.
  installAssets(app, directory);
  installSecurity(app, loadConfiguration({}, directory), randomUUID());
  app.get('/api/v1/settings', async () => ({ ready: true }));
  app.get('/api/v1/events/stream', async () => ({}));
  return app;
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

describe('public client assets with a protected same-origin API', () => {
  it.each(['/', '/index.html', '/assets/client.js', '/assets/client.css'])('serves GET and HEAD %s before bootstrap without issuing a session', async url => {
    const app = fixture();
    for (const method of ['GET', 'HEAD'] as const) {
      const response = await app.inject({ method, url, headers: { host } });
      expect(response.statusCode).toBe(200);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['cache-control']).toBe(url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store');
      if (method === 'HEAD') expect(response.body).toBe('');
      else expect(response.body.length).toBeGreaterThan(10);
    }
  });

  it('allows direct browser navigation and same-origin assets before session bootstrap', async () => {
    const app = fixture();
    expect((await app.inject({ url: '/', headers: { host, 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate' } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/assets/client.js', headers: { host, origin, 'sec-fetch-site': 'same-origin' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin, 'sec-fetch-site': 'none', 'content-type': 'application/json', 'x-factory-client': 'web' }, payload: {} })).statusCode).toBe(403);
  });

  it.each([
    { host: 'localhost:4310' },
    { host, origin: 'http://127.0.0.1:4311' },
    { host, origin: 'https://foreign.invalid' },
    { host, 'sec-fetch-site': 'cross-site' },
    { host, 'sec-fetch-site': 'same-site' },
  ])('preserves host and browser context checks for public files: %j', async headers => {
    const app = fixture();
    for (const url of ['/', '/assets/client.js']) {
      const response = await app.inject({ url, headers });
      expect(response.statusCode).toBe(403);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('keeps API reads, SSE, unknown API paths and mutations protected after loading the client', async () => {
    const app = fixture();
    expect((await app.inject({ url: '/', headers: { host } })).statusCode).toBe(200);
    for (const url of ['/api/v1/settings', '/api/v1/events/stream', '/api/v1/unknown', '/api/v1/assets/client.js']) {
      for (const method of ['GET', 'HEAD'] as const) {
        const response = await app.inject({ method, url, headers: { host } });
        expect(response.statusCode).toBe(401);
        if (method === 'GET') expect(response.json()).toMatchObject({ code: 'SESSION_REQUIRED' });
      }
    }
    const mutation = await app.inject({ method: 'POST', url: '/assets/client.js', headers: { host, origin, 'content-type': 'application/json' }, payload: {} });
    expect(mutation.statusCode).toBe(401);
    const session = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin, 'content-type': 'application/json', 'x-factory-client': 'web' }, payload: {} });
    expect(session.statusCode).toBe(200);
    const cookie = String(session.headers['set-cookie']).split(';')[0]!;
    expect((await app.inject({ url: '/api/v1/settings', headers: { host, cookie } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/.env', headers: { host, cookie } })).statusCode).toBe(404);
  });
});
