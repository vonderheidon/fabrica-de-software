import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { startController } from '../dist/apps/controller/src/main.js';

const directory = await mkdtemp(join(tmpdir(), 'factory-shutdown-native-'));
const root = resolve(import.meta.dirname, '..'), origin = 'http://127.0.0.1:4310';
process.env.FACTORY_LOG_LEVEL = 'silent';
let app, db;
async function boot() {
  app = await startController({}, { dataDirectory: directory });
  const response = await fetch(origin + '/api/v1/session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Factory-Client': 'web' }, body: '{}' });
  assert.equal(response.status, 200);
  const session = await response.json();
  return { headers: { Origin: origin, Cookie: response.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': session.csrf_token, 'Content-Type': 'application/json' } };
}
try {
  const client = await boot();
  db = new Database(join(directory, 'factory.sqlite'));
  const installation = db.prepare("SELECT installation_id FROM factory_settings WHERE id='local'").get().installation_id;
  db.prepare("INSERT INTO operation_requests(operation_id,installation_id,operation_kind,resource_type,resource_id,request_hash) VALUES (?,?,'controlled.native_work','controller','local',?)")
    .run(crypto.randomUUID(), installation, 'a'.repeat(64));
  db.close(); db = undefined;

  const response = await fetch(origin + '/api/v1/shutdown', { method: 'POST', headers: client.headers, body: JSON.stringify({ authorized: true }) });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { state: 'closing' });
  for (let i = 0; i < 100 && app.server.listening; i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(app.server.listening, false, 'immediate shutdown must close the HTTP listener despite unresolved work');

  await app.close(); app = undefined;
  await boot();
  assert.equal((await fetch(origin + '/api/v1/health')).status, 200);
  db = new Database(join(directory, 'factory.sqlite'), { readonly: true });
  assert.equal(db.prepare("SELECT count(*) AS n FROM operation_requests WHERE operation_kind='controlled.native_work' AND receipt_json IS NULL").get().n, 1);
  db.close(); db = undefined;
  const report = { proof: 'native_compiled_controller_real_http_sqlite', immediate_shutdown: true, unresolved_work_present: true,
    http_listener_closed: true, controller_restarts_with_legacy_work_record: true, providers_or_maestri: false, user_database: false };
  await mkdir(resolve(root, '.cache/sprint056'), { recursive: true });
  await writeFile(resolve(root, '.cache/sprint056/native-shutdown.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  db?.close(); await app?.close();
  await rm(directory, { recursive: true, force: true });
}
