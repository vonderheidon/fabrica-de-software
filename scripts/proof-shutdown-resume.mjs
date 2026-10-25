import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { startController } from '../dist/apps/controller/src/main.js';

const directory = await mkdtemp(join(tmpdir(), 'factory-shutdown-resume-'));
const root = resolve(import.meta.dirname, '..'), origin = 'http://127.0.0.1:4310';
process.env.FACTORY_LOG_LEVEL = 'silent';
let app, db;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function boot() {
  app = await startController({}, { dataDirectory: directory });
  const response = await fetch(origin + '/api/v1/session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Factory-Client': 'web' }, body: '{}' });
  assert.equal(response.status, 200);
  const session = await response.json();
  return { instance: session.instance_id, headers: { Origin: origin, Cookie: response.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': session.csrf_token, 'Content-Type': 'application/json' } };
}
async function read(client) {
  const response = await fetch(origin + '/api/v1/shutdown', { headers: client.headers }); assert.equal(response.status, 200);
  return { view: await response.json(), etag: response.headers.get('etag') };
}
async function send(client, action) {
  const current = await read(client), operationId = crypto.randomUUID();
  const request = { method: 'POST', headers: { ...client.headers, 'Idempotency-Key': operationId, 'If-Match': current.etag }, body: JSON.stringify({ action, authorized: true }) };
  const response = await fetch(origin + '/api/v1/shutdown', request); assert.equal(response.status, 202);
  return { operationId, request, accepted: await response.json() };
}
function pending(installation) {
  const id = crypto.randomUUID();
  // Controlled work, restricted to this disposable database; no executor is recruited.
  db.prepare("INSERT INTO operation_requests(operation_id,installation_id,operation_kind,resource_type,resource_id,request_hash) VALUES (?,?,'controlled.native_work','controller','local',?)").run(id, installation, 'a'.repeat(64));
  return () => db.prepare("UPDATE operation_requests SET receipt_json='{}' WHERE operation_id=?").run(id);
}
try {
  const client = await boot();
  db = new Database(join(directory, 'factory.sqlite'));
  const installation = db.prepare("SELECT installation_id FROM factory_settings WHERE id='local'").get().installation_id;
  const resolveFirst = pending(installation), drain = await send(client, 'close_when_idle');
  const original = db.prepare('SELECT receipt_json FROM operation_requests WHERE operation_id=?').get(drain.operationId);
  await wait(300); assert.equal(app.server.listening, true);
  const resume = await send(client, 'resume_starts'), running = await read(client);
  assert.equal(running.view.starts_paused, false); assert.equal(running.view.automation_enabled, false); assert.equal(running.view.state, 'running');
  const status = await fetch(origin + '/api/v1/operations/' + drain.operationId, { headers: client.headers });
  assert.equal((await status.json()).progress.state, 'revoked');
  resolveFirst(); await wait(400);
  assert.equal((await fetch(origin + '/api/v1/health')).status, 200);
  assert.equal(db.prepare("SELECT count(*) AS n FROM operation_requests WHERE operation_kind='shutdown.commit'").get().n, 0);
  const lateDrain = await fetch(origin + '/api/v1/shutdown', drain.request); assert.equal(lateDrain.status, 202);
  await wait(200); assert.equal(app.server.listening, true); assert.equal((await read(client)).view.starts_paused, false);
  const resolveSecond = pending(installation), nextDrain = await send(client, 'close_when_idle'), beforeReplay = await read(client);
  const replay = await fetch(origin + '/api/v1/shutdown', resume.request); assert.equal(replay.status, 202);
  assert.deepEqual((await replay.json()).receipt, resume.accepted.receipt);
  const afterReplay = await read(client);
  assert.equal(afterReplay.view.starts_paused, true); assert.equal(afterReplay.view.operation_id, nextDrain.operationId); assert.equal(afterReplay.view.generation, beforeReplay.view.generation);
  await send(client, 'resume_starts'); resolveSecond(); await wait(400); assert.equal(app.server.listening, true);
  assert.deepEqual(db.prepare('SELECT receipt_json FROM operation_requests WHERE operation_id=?').get(drain.operationId), original);
  assert.equal(db.prepare('SELECT count(*) AS n FROM cancellation_requests').get().n, 0);
  db.close(); db = undefined; await app.close(); app = undefined;
  const restarted = await boot(), restored = await read(restarted);
  assert.notEqual(restarted.instance, client.instance);
  assert.equal(restored.view.starts_paused, false); assert.equal(restored.view.automation_enabled, false); assert.equal(restored.view.state, 'running');
  await wait(300); assert.equal(app.server.listening, true);
  const report = { proof: 'native_compiled_controller_real_http_sqlite', inventory_work: 'controlled_journal_fixture', port: 4310,
    resume_received_202: true, starts_released_automation_off: true, revoked_progress: true, old_drain_replay_does_not_close: true,
    old_resume_replay_preserves_new_drain: true, no_old_commit_after_resume: true, withdrawal_survives_restart: true, immutable_original_receipt: true,
    implicit_cancellations: 0, providers_or_maestri: false, user_database: false };
  await mkdir(resolve(root, '.cache/sprint041'), { recursive: true });
  await writeFile(resolve(root, '.cache/sprint041/native-resume.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  db?.close(); await app?.close();
  await rm(directory, { recursive: true, force: true });
}
