import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { installSecurity } from './index.js';
import { installErrors } from '../errors.js';
import { loadConfiguration } from '../../config.js';

describe('session stream ownership', () => {
  it('bounds streams globally and per session; revocation and shutdown abort their streams', async () => {
    const app = Fastify();
    installErrors(app);
    const configuration = loadConfiguration({}, process.cwd());
    const security = installSecurity(app, configuration, randomUUID());
    const owners: { controller: AbortController; release(): void }[] = [];
    app.get('/api/v1/test/read', async () => ({}));
    app.post('/api/v1/test/track', async (request) => {
      const controller = new AbortController();
      const release = security.trackStream(request, controller);
      owners.push({ controller, release });
      return {};
    });
    const headers = { host: '127.0.0.1:4310', origin: configuration.browserOrigin, 'content-type': 'application/json' };
    const sessions: { cookie: string; csrf: string }[] = [];
    try {
      for (let index = 0; index < 5; index += 1) {
        const session = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { ...headers, 'x-factory-client': 'web' }, payload: {} });
        sessions.push({ cookie: String(session.headers['set-cookie']).split(';')[0]!, csrf: session.json().csrfToken });
      }
      const track = (index: number) => {
        const session = sessions[index]!;
        return app.inject({ method: 'POST', url: '/api/v1/test/track', headers: { ...headers, cookie: session.cookie, 'x-csrf-token': session.csrf }, payload: {} });
      };
      for (let index = 0; index < 4; index += 1) {
        expect((await track(index)).statusCode).toBe(200);
        expect((await track(index)).statusCode).toBe(200);
        expect((await track(index)).statusCode).toBe(429);
      }
      expect((await track(4)).statusCode).toBe(429);
      security.revokeSession(sessions[0]!.cookie.split('=')[1]!);
      expect(owners[0]!.controller.signal.aborted).toBe(true);
      expect(owners[1]!.controller.signal.aborted).toBe(true);
      expect(owners[2]!.controller.signal.aborted).toBe(false);
      expect((await app.inject({ url: '/api/v1/test/read', headers: { ...headers, cookie: sessions[0]!.cookie } })).statusCode).toBe(401);
      owners[0]!.release();
      owners[1]!.release();
      expect((await track(4)).statusCode).toBe(200);
      await app.close();
      expect(owners.every(({ controller }) => controller.signal.aborted)).toBe(true);
    } finally { await app.close(); }
  });
});
