import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startController } from '../dist/apps/controller/src/main.js';
import { openStorage } from '../dist/apps/controller/src/modules/storage/index.js';
import { controlledDependencies } from '../tests/native/controller-fixture.mjs';

// Explicit local HTTP smoke of compiled production code; no Git, provider or Maestri.
const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once('error', reject);
  reservation.listen(0, '127.0.0.1', resolve);
});
const address = reservation.address();
assert(address && typeof address !== 'string');
await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));

const directory = mkdtempSync(join(tmpdir(), 'factory-compiled-'));
const changes = {
  NODE_ENV: 'production', FACTORY_BIND_HOST: '127.0.0.1', FACTORY_PORT: String(address.port),
  FACTORY_BROWSER_ORIGIN: `http://127.0.0.1:${address.port}`, FACTORY_DATA_DIR: directory, FACTORY_LOG_LEVEL: 'silent',
};
const previous = Object.fromEntries(Object.keys(changes).map((key) => [key, process.env[key]]));
const previousCwd = process.cwd();
const signals = { SIGINT: process.listenerCount('SIGINT'), SIGTERM: process.listenerCount('SIGTERM') };
let app;
let child;
const main = fileURLToPath(new URL('../tests/native/controller-fixture.mjs', import.meta.url));
async function waitForExit(processHandle) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) return processHandle.exitCode;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Child exit timed out')), 5000);
    processHandle.once('error', (error) => { clearTimeout(timer); reject(error); });
    processHandle.once('exit', (code) => { clearTimeout(timer); resolve(code); });
  });
}
function startChild(environment) {
  return fork(main, [], { cwd: directory, env: { ...process.env, ...environment }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
}
try {
  Object.assign(process.env, changes);
  process.chdir(directory);
  app = await startController({}, controlledDependencies);
  const response = await fetch(changes.FACTORY_BROWSER_ORIGIN + '/api/v1/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.equal(response.headers.get('set-cookie'), null);
  const origin = changes.FACTORY_BROWSER_ORIGIN;
  const session = await fetch(origin + '/api/v1/session', {
    method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-factory-client': 'web' }, body: '{}',
  });
  assert.equal(session.status, 200);
  const cookie = session.headers.get('set-cookie')?.split(';')[0];
  assert(cookie);
  const bootstrap = await session.json();
  const scaffoldResponse = await fetch(origin + '/api/v1/scaffold/options', { headers: { cookie } });
  assert.equal(scaffoldResponse.status, 200);
  const scaffoldOptions = await scaffoldResponse.json();
  assert.equal(scaffoldOptions.catalog.id, 'factory.engineering');
  assert.match(scaffoldOptions.catalog.digest, /^[a-f0-9]{64}$/);
  assert.equal(scaffoldOptions.templates[0]?.id, 'engineering.v1');
  assert.equal(scaffoldOptions.projectsRoot, null);
  assert(scaffoldOptions.prerequisites.some(p => p.code === 'PROJECTS_ROOT_REQUIRED'));
  assert(scaffoldOptions.creationModes.every(m => !m.capability.available));
  const storage = openStorage({ dataDirectory: directory });
  const operationId = randomUUID();
  try {
    storage.saveTimeDefaults({ operationId, expectedRevision: storage.getSettingsETag(), timeDefaults: storage.getSettings().timeDefaults });
  } finally { storage.close(); }
  const operation = await fetch(origin + '/api/v1/operations/'+operationId, { headers: { cookie } });
  assert.equal(operation.status, 200);
  assert.equal((await operation.json()).operationId, operationId);
  const settingsRead = await fetch(origin + '/api/v1/settings', { headers: { cookie } });
  assert.equal(settingsRead.status, 200);
  const settingsETag = settingsRead.headers.get('etag');
  assert(settingsETag);
  const settingsBefore = await settingsRead.json();
  const settingsKey = randomUUID();
  const settingsHeaders = { cookie, origin, 'content-type': 'application/json', 'x-csrf-token': bootstrap.csrfToken, 'idempotency-key': settingsKey, 'if-match': settingsETag };
  const settingsBody = JSON.stringify({ changes: { timeDefaults: { passageActiveTimeMs: settingsBefore.settings.timeDefaults.passageActiveTimeMs + 1 } } });
  const settingsWrite = await fetch(origin + '/api/v1/settings', { method: 'PUT', headers: settingsHeaders, body: settingsBody });
  assert.equal(settingsWrite.status, 200);
  const settingsSaved = await settingsWrite.json();
  assert.equal(settingsSaved.settings.timeDefaults.pollingIntervalMs, settingsBefore.settings.timeDefaults.pollingIntervalMs);
  assert.equal(settingsSaved.settings.timeDefaults.passageActiveTimeMs, settingsBefore.settings.timeDefaults.passageActiveTimeMs + 1);
  assert.notEqual(settingsWrite.headers.get('etag'), settingsETag);
  const recoveredSettings = await fetch(origin + '/api/v1/settings', { method: 'PUT', headers: settingsHeaders, body: settingsBody });
  assert.equal(recoveredSettings.status, 200);
  assert.deepEqual((await recoveredSettings.json()).receipt, settingsSaved.receipt);
  const staleSettings = await fetch(origin + '/api/v1/settings', { method: 'PUT', headers: { ...settingsHeaders, 'idempotency-key': randomUUID() }, body: settingsBody });
  assert.equal(staleSettings.status, 412);
  await staleSettings.arrayBuffer();
  const catalog = await fetch(origin + '/api/v1/projects', { headers: { cookie } });
  assert.equal(catalog.status, 200); assert.deepEqual((await catalog.json()).items, []);
  const noGitContext = await fetch(origin + '/api/v1/projects', { method: 'POST', headers: { ...settingsHeaders, 'idempotency-key': randomUUID() }, body: JSON.stringify({ name: 'Smoke origin', source: { kind: 'local', location: directory }, baseBranch: 'main' }) });
  assert.equal(noGitContext.status, 503);
  assert.equal((await noGitContext.json()).code, 'ORIGIN_UNAVAILABLE');
  const anonymous = await fetch(origin + '/api/v1/events/stream');
  assert.equal(anonymous.status, 401);
  await anonymous.arrayBuffer();
  const operational = await fetch(origin + '/api/v1/operation', { headers: { cookie } });
  assert.equal(operational.status, 200);
  const snapshot = await operational.json();
  assert.equal(snapshot.activeAttempt, null);
  assert.deepEqual(snapshot.nextCandidates, []);
  assert.equal(snapshot.integrationStatus.provesProviderExecution, false);
  const priorDiagnosis = await fetch(origin + '/api/v1/diagnostics?scope=host', { headers: { cookie } });
  assert.equal(priorDiagnosis.status, 200); assert.deepEqual((await priorDiagnosis.json()).reports, []);
  const diagnosticId = randomUUID();
  const diagnosticResponse = await fetch(origin + '/api/v1/diagnostics?scope=host', { method: 'POST',
    headers: { ...settingsHeaders, 'idempotency-key': diagnosticId }, body: JSON.stringify({ checks: ['configuration', 'github_identity', 'maestri_context'] }) });
  assert.equal(diagnosticResponse.status, 202);
  assert.equal(diagnosticResponse.headers.get('location'), '/api/v1/operations/' + diagnosticId);
  await diagnosticResponse.arrayBuffer();
  const diagnosisDeadline = Date.now() + 5000;
  let diagnosis;
  do {
    const response = await fetch(origin + '/api/v1/diagnostics?scope=host', { headers: { cookie } });
    assert.equal(response.status, 200); diagnosis = await response.json();
    if (diagnosis.reports[0]?.state === 'succeeded') break;
    await new Promise(resolve => setTimeout(resolve, 10));
  } while (Date.now() < diagnosisDeadline);
  assert.equal(diagnosis.reports[0]?.state, 'succeeded');
  assert.equal(diagnosis.reports[0]?.operationId, diagnosticId);
  assert.equal(diagnosis.reports[0]?.diagnostics.length, 3);
  assert(Number(diagnosis.eventCursor) > Number(snapshot.eventCursor));
  const replay = await fetch(origin + '/api/v1/events/stream?cursor=invalid', { headers: { cookie, 'last-event-id': snapshot.eventCursor } });
  assert.equal(replay.status, 200);
  const replayReader = replay.body?.getReader(); assert(replayReader);
  let replayText = '';
  while (!replayText.includes('event: diagnostic.completed')) {
    const chunk = await replayReader.read(); assert(!chunk.done);
    replayText += new TextDecoder().decode(chunk.value);
  }
  assert(replayText.includes(diagnosticId)); assert(!replayText.includes(bootstrap.csrfToken));
  const replayIds = [...replayText.matchAll(/^id: ([0-9]+)$/gm)].map(match => match[1]);
  assert.equal(new Set(replayIds).size, replayIds.length);
  assert(replayIds.every(id => Number(id) > Number(snapshot.eventCursor)));
  await replayReader.cancel();
  await new Promise(resolve => setTimeout(resolve, 10));
  const malformedHeaders = await fetch(origin + '/api/v1/health', { headers: { 'x-large': 'S'.repeat(9000) } });
  assert.equal(malformedHeaders.status, 431);
  assert.equal(typeof (await malformedHeaders.json()).requestId, 'string');
  const manyHeaders = Object.fromEntries(Array.from({ length: 70 }, (_, index) => [`x-test-${index}`, 'value']));
  const excessiveHeaders = await fetch(origin + '/api/v1/health', { headers: manyHeaders });
  assert.equal(excessiveHeaders.status, 431);
  await excessiveHeaders.arrayBuffer();
  const streams = [];
  for (let index = 0; index < 2; index += 1) {
    const stream = await fetch(origin + '/api/v1/events/stream?cursor=99', { headers: { cookie, 'last-event-id': '0' } });
    assert.equal(stream.status, 200);
    assert.equal(stream.headers.get('content-type'), 'text/event-stream');
    const reader = stream.body?.getReader();
    assert(reader);
    let text = '';
    while (!text.includes('id: 1')) {
      const chunk = await reader.read();
      assert(!chunk.done);
      text += new TextDecoder().decode(chunk.value);
    }
    assert(text.includes(operationId));
    assert(!text.includes(bootstrap.csrfToken));
    assert(!text.includes(cookie.split('=')[1]));
    streams.push(reader);
  }
  const excessStream = await fetch(origin + '/api/v1/events/stream', { headers: { cookie } });
  assert.equal(excessStream.status, 429);
  await excessStream.arrayBuffer();
  const secondPort = address.port === 65535 ? 4311 : address.port + 1;
  child = startChild({ FACTORY_PORT: String(secondPort), FACTORY_BROWSER_ORIGIN: `http://127.0.0.1:${secondPort}` });
  let rejectedOutput = '';
  child.stderr?.on('data', (data) => { rejectedOutput += data.toString(); });
  assert.equal(await waitForExit(child), 1);
  assert(rejectedOutput.includes('CONTROLLER_LOCK_UNAVAILABLE'));
  child = undefined;
  // Keep SSE connections open through shutdown to exercise preClose cancellation.
  // Exercise the registered shutdown path without sending a signal to the test runner.
  const closed = new Promise((resolve) => app.server.once('close', resolve));
  process.emit('SIGTERM', 'SIGTERM');
  await closed;
  await app.close();
  await Promise.all(streams.map(async (reader) => {
    try { while (!(await reader.read()).done) { /* Drain final buffered frames. */ } }
    catch (error) {
      // Revocation may close the HTTP transport after SSE headers were already sent.
      assert(error instanceof TypeError && error.cause?.code === 'UND_ERR_SOCKET');
    }
    finally { reader.releaseLock(); }
  }));
  assert.equal(process.listenerCount('SIGINT'), signals.SIGINT);
  assert.equal(process.listenerCount('SIGTERM'), signals.SIGTERM);
  child = startChild({ FACTORY_LOG_LEVEL: 'info' });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Child readiness timed out')), 5000);
    let output = '';
    child.stdout?.on('data', (data) => {
      output += data.toString();
      if (output.includes('Controller ready')) { clearTimeout(timer); resolve(); }
    });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Child exited before readiness')); });
  });
  const exited = waitForExit(child);
  assert(child.kill('SIGKILL'));
  await exited;
  child = undefined;
  app = await startController({}, controlledDependencies);
  const revoked = await fetch(origin + '/api/v1/operations/'+operationId, { headers: { cookie } });
  assert.equal(revoked.status, 401);
  await revoked.arrayBuffer();
  console.log('Compiled controller: real HTTP/SSE/SQLite, settings/CAS/idempotency, distributed scaffold catalog, context diagnostics, shutdown and process lock OK; anchor preflight controlled, Maestri/OMP not executed');
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = waitForExit(child);
    child.kill('SIGKILL');
    await exited;
  }
  if (app) await app.close();
  process.chdir(previousCwd);
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  rmSync(directory, { recursive: true });
}
