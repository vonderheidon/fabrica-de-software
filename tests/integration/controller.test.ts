import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { afterEach, describe, expect, it } from 'vitest';
import { ErrorResponse } from '#contracts';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';

const directories: string[] = [];
const apps: ReturnType<typeof createApp>[] = [];
function fixture() {
  const path = mkdtempSync(join(tmpdir(), 'factory-http-'));
  directories.push(path);
  const storage = openStorage({ dataDirectory: path });
  const configuration = loadConfiguration({ FACTORY_DATA_DIR: path, FACTORY_LOG_LEVEL: 'silent' }, path);
  const app = createApp(configuration, storage);
  apps.push(app);
  return { app, storage };
}
const headers = { host: '127.0.0.1:4310' };
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const path of directories.splice(0)) rmSync(path, { recursive: true });
});

describe('controller foundation', () => {
  it('serves a schema-limited health response with real SQLite and no dispatch', async () => {
    const { app, storage } = fixture();
    const initial = storage.getSettings();
    const response = await app.inject({ method: 'GET', url: '/api/v1/health', headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(storage.getSettings()).toEqual(initial);
    await app.close();
    expect(() => storage.checkHealth()).toThrow();
  });
  it('rejects untrusted Host and unexpected query fields', async () => {
    const { app } = fixture();
    for (const host of ['attacker.example', 'localhost:4310', '127.0.0.1:4311']) {
      const response = await app.inject({ url: '/api/v1/health', headers: { host } });
      expect(response.statusCode).toBe(403);
      expect(Value.Check(ErrorResponse, response.json())).toBe(true);
    }
    expect((await app.inject({ url: '/api/v1/health?extra=true', headers })).statusCode).toBe(400);
  });
  it('returns standard errors and does not expose database details on failure', async () => {
    const { app, storage } = fixture();
    const missing = await app.inject({ url: '/api/v1/settings', headers });
    expect(missing.statusCode).toBe(401);
    expect(Value.Check(ErrorResponse, missing.json())).toBe(true);
    storage.close();
    const failed = await app.inject({ url: '/api/v1/health', headers });
    expect(failed.statusCode).toBe(503);
    expect(failed.json()).toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    expect(failed.body).not.toMatch(/sqlite|stack|installationId|dataRoot/i);
  });
});
