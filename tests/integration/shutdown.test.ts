import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'factory-shutdown-'));
  const storage = openStorage({ dataDirectory: directory });
  const db = new Database(join(directory, 'factory.sqlite'));
  db.pragma('foreign_keys=ON');
  const installation = storage.getSettings().installation_id;
  db.prepare("INSERT INTO operation_requests(operation_id,installation_id,operation_kind,resource_type,resource_id,request_hash) VALUES (?,?,'controlled.uncertain','controller','local',?)")
    .run(randomUUID(), installation, 'a'.repeat(64));
  const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: directory, FACTORY_LOG_LEVEL: 'silent' }, directory), storage);
  let closed = false;
  const closeObserved = new Promise<void>(resolve => app.addHook('onClose', async () => { closed = true; resolve(); }));
  cleanups.push(async () => { if (!closed) await app.close(); db.close(); rmSync(directory, { recursive: true, force: true }); });
  return { app, db, closeObserved, isClosed: () => closed };
}

it('closes the controller with unresolved work without a pause, drain, or status query', async () => {
  const fixture = setup();
  const host = '127.0.0.1:4310', origin = `http://${host}`;
  const session = await fixture.app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin, 'x-factory-client': 'web' }, payload: {} });
  const headers = { host, origin, cookie: String(session.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': session.json<{ csrf_token: string }>().csrf_token };
  expect((await fixture.app.inject({ url: '/api/v1/shutdown', headers })).statusCode).toBe(404);
  expect((await fixture.app.inject({ method: 'POST', url: '/api/v1/shutdown', headers: { ...headers, 'x-csrf-token': 'wrong' }, payload: { authorized: true } })).statusCode).toBe(403);
  expect(fixture.isClosed()).toBe(false);

  const response = await fixture.app.inject({ method: 'POST', url: '/api/v1/shutdown', headers, payload: { authorized: true } });
  expect(response.statusCode).toBe(202);
  expect(response.json()).toEqual({ state: 'closing' });
  await fixture.closeObserved;

  expect(fixture.isClosed()).toBe(true);
  expect(fixture.db.prepare("SELECT count(*) AS n FROM operation_requests WHERE operation_kind='controlled.uncertain' AND receipt_json IS NULL").get()).toEqual({ n: 1 });
});
