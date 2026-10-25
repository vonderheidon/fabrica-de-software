import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { startController } from '../dist/apps/controller/src/main.js';

const directory = await mkdtemp(join(tmpdir(), 'factory-shutdown-native-'));
const root = resolve(import.meta.dirname, '..'), origin = 'http://127.0.0.1:4310';
process.env.FACTORY_LOG_LEVEL = 'silent';
let app;
async function boot() {
  app = await startController({}, { dataDirectory: directory });
  const session = await fetch(origin + '/api/v1/session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Factory-Client': 'web' }, body: '{}' });
  assert.equal(session.status, 200);
  const data = await session.json();
  return { instance: data.instance_id, headers: { Origin: origin, Cookie: session.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': data.csrf_token, 'Content-Type': 'application/json' } };
}
async function read(client) {
  const response = await fetch(origin + '/api/v1/shutdown', { headers: client.headers });
  assert.equal(response.status, 200);
  return { view: await response.json(), etag: response.headers.get('etag') };
}
try {
  const first = await boot(), initial = await read(first);
  assert.equal(initial.view.starts_paused, false);
  let response = await fetch(origin + '/api/v1/shutdown', { method: 'POST', headers: { ...first.headers, 'Idempotency-Key': crypto.randomUUID(), 'If-Match': initial.etag }, body: JSON.stringify({ action: 'pause_starts', authorized: true }) });
  assert.equal(response.status, 202);
  assert.equal((await read(first)).view.starts_paused, true);
  assert.equal((await fetch(origin + '/api/v1/health')).status, 200);
  await app.close(); app = undefined;
  const second = await boot(), paused = await read(second);
  assert.notEqual(first.instance, second.instance);
  assert.equal(paused.view.starts_paused, true); assert.equal(paused.view.automation_enabled, false);
  assert.equal(paused.view.closing_committed, false); assert.equal(paused.view.state, 'paused');
  const operation = crypto.randomUUID();
  response = await fetch(origin + '/api/v1/shutdown', { method: 'POST', headers: { ...second.headers, 'Idempotency-Key': operation, 'If-Match': paused.etag }, body: JSON.stringify({ action: 'close_when_idle', authorized: true }) });
  assert.equal(response.status, 202);
  const receipt = await response.json();
  assert.equal(receipt.operation_id, operation);
  for (let i = 0; i < 100 && app.server.listening; i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(app.server.listening, false, 'guided shutdown must close the actual HTTP listener');
  await app.close(); app = undefined;
  const db = new Database(join(directory, 'factory.sqlite'), { readonly: true });
  const commitment = db.prepare("SELECT receipt_json FROM operation_requests WHERE operation_kind='shutdown.commit'").get();
  const journal = JSON.parse(commitment.receipt_json);
  assert.equal(journal.shutdown.closingCommitted, true); assert.equal(journal.shutdown.drainOperationId, operation);
  assert.equal(db.prepare('SELECT count(*) AS n FROM cancellation_requests').get().n, 0);
  db.close();
  const third = await boot(), restored = await read(third);
  assert.equal(restored.view.starts_paused, true); assert.equal(restored.view.closing_committed, false);
  assert.equal(restored.view.state, 'paused'); assert.equal(app.server.listening, true);
  const report = { proof: 'native_compiled_controller_real_http_sqlite', port: 4310, pause_keeps_listener_open: true, pause_survives_restart: true,
    new_controller_instance: true, close_response_202_received: true, complete_inventory_empty: true, closing_committed_durably: true,
    http_listener_closed: true, old_close_not_repeated_after_restart: true, implicit_cancellations: 0,
    providers_or_maestri: false, user_database: false };
  await mkdir(resolve(root, '.cache/sprint040'), { recursive: true });
  await writeFile(resolve(root, '.cache/sprint040/native-shutdown.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
