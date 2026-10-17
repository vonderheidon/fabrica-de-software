// @ts-check
import assert from 'node:assert/strict';
import { execFile, fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { loadConfiguration } from '../../dist/apps/controller/src/config.js';
import { createApp } from '../../dist/apps/controller/src/http/app.js';
import { acquireControllerLock, openStorage } from '../../dist/apps/controller/src/modules/storage/index.js';
import { createGitHub } from '../../dist/apps/controller/src/modules/github/index.js';
import { createWorkspaces } from '../../dist/apps/controller/src/modules/workspaces/index.js';
import { createEnvironmentRecovery } from '../../dist/apps/controller/src/modules/workspaces/recovery.js';
import { createDeliveryDiff } from '../../dist/apps/controller/src/modules/workspaces/diff.js';
import { createRetainedVerifier } from '../../dist/apps/controller/src/modules/workspaces/retention.js';
import { createPreparations } from '../../dist/apps/controller/src/modules/projects/index.js';
import { createExecution } from '../../dist/apps/controller/src/modules/execution/index.js';
import { createPipeline } from '../../dist/apps/controller/src/modules/pipeline/index.js';
import { createVerification } from '../../dist/apps/controller/src/modules/verification/index.js';

// Explicit test composition of compiled controller modules. IPC is test control;
// HTTP routes, SQLite, controller lock, recovery, diff and artifact reads are real.
// No host/keyring attestation, provider, production executor or capture is claimed.
/** @param {number} index */
function argument(index) { const value = process.argv[index]; assert(value); return value; }
const directory = resolve(argument(2));
const attemptId = argument(3); const deliveryId = argument(4); const artifactId = argument(5);
assert(process.send);
let canonicalization = 'real';
/** @type {(path: string) => Promise<string>} */
let canonicalize = path => realpath(path);
try { await realpath(directory); } catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'EPERM')) throw error;
  canonicalization = 'controlled_after_EPERM'; canonicalize = async path => path;
}
/** @type {string[]} */
const gitCommands = [];
/** @type {{command: string, exitCode: number, diagnostic: string} | null} */
let gitFailure = null;
/** Local fixture only. A read-only Git adapter, never a Windows keyring context.
 * @type {import('../../apps/controller/src/modules/workspaces/git.js').GitReader}
 */
const git = async (cwd, args, input) => {
  const location = relative(directory, cwd);
  assert(location && !location.startsWith('..') && !isAbsolute(location));
  assert(location.startsWith('git') || location.startsWith('work'));
  const commands = ['rev-parse', 'rev-list', 'for-each-ref', 'fsck', 'ls-tree', 'hash-object', 'ls-files', 'diff', 'cat-file'];
  const command = args.find(arg => commands.includes(arg));
  assert(command && !args.some(arg => ['-w', '--force', '-f', '--hard'].includes(arg)));
  gitCommands.push(command);
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' };
  for (const key of Object.keys(env)) {
    if (/^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE|CONFIG_(?:COUNT|KEY_.*|VALUE_.*|PARAMETERS))$/.test(key)) delete env[key];
  }
  return await new Promise((resolveResult, reject) => {
    const child = execFile('git', ['--no-optional-locks', '--no-lazy-fetch', ...args], {
      cwd, env, shell: false, windowsHide: true, timeout: 15_000, maxBuffer: 4_194_304, encoding: 'utf8',
    }, (error, stdout, stderr) => {
      if (error && typeof error.code === 'number') gitFailure = { command, exitCode: error.code, diagnostic: stderr.slice(-1000) };
      if (error && (typeof error.code !== 'number' || error.killed)) reject(new Error('LOCAL_GIT_UNAVAILABLE'));
      else resolveResult({ exitCode: error && typeof error.code === 'number' ? error.code : 0, stdout });
    });
    child.stdin?.on('error', reject); child.stdin?.end(input?.input);
  });
};
const lock = acquireControllerLock(directory);
const storage = openStorage({ dataDirectory: directory });
const github = createGitHub();
const workspaces = { ...createWorkspaces({ github }), ...createEnvironmentRecovery(directory, git, undefined, canonicalize),
  getDeliveryDiff: createDeliveryDiff(directory, git, canonicalize) };
const preparations = createPreparations({ storage, github, workspaces });
const execution = createExecution({ dataDirectory: directory, persistence: storage.executionPersistence() });
const failures = /** @type {string[]} */ ([]);
const verification = createVerification({ storage, workspaces, dataDirectory: directory, logFailure: code => failures.push(code) }, { canonicalize });
const pipeline = createPipeline({ storage, preparations, execution, workspaces, verification, observeTools: async () => [], logFailure: code => failures.push(code) });
const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: directory, FACTORY_LOG_LEVEL: 'silent' }, directory), storage,
  undefined, undefined, undefined, pipeline);
await app.ready();
const bootstrap = await app.inject({ method: 'POST', url: '/api/v1/session', headers: {
  host: '127.0.0.1:4310', origin: 'http://127.0.0.1:4310', 'x-factory-client': 'web',
}, payload: {} });
assert.equal(bootstrap.statusCode, 200);
const headers = { host: '127.0.0.1:4310', cookie: bootstrap.cookies.map(c => `${c.name}=${c.value}`).join('; ') };
/** @type {Map<string, import('node:child_process').ChildProcess>} */
const processes = new Map();
/** @param {import('node:child_process').ChildProcess} child */
async function stop(child) {
  assert(child.pid && child.exitCode === null && child.signalCode === null);
  return await new Promise((resolveStop, reject) => {
    const timer = setTimeout(() => reject(new Error('LOCAL_PROCESS_STOP_TIMEOUT')), 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (exitCode, signal) => {
      clearTimeout(timer); resolveStop({ pid: child.pid, exitCode, signal, closeObservedAtMs: Date.now() });
    });
    if (!child.kill('SIGKILL')) { clearTimeout(timer); reject(new Error('LOCAL_PROCESS_STOP_FAILED')); }
  });
}
/** @param {string} action */
async function handle(action) {
  const resource = storage.getResources(attemptId).entries.find(r => r.kind === 'implementation'); assert(resource);
  if (action === 'start-processes') {
    assert.equal(processes.size, 0);
    for (const passage of storage.getResources(attemptId).entries.filter(r => r.kind === 'terminal')) {
      assert(passage.passageId);
      // Owned physical probes associated with fixture passages, not Maestri terminals.
      const child = fork(new URL('./persistence-probe.mjs', import.meta.url), [], {
        cwd: join(directory, 'work', attemptId, 'implementation'), windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      processes.set(passage.passageId, child);
      await new Promise((resolveReady, reject) => {
        const timer = setTimeout(() => reject(new Error('LOCAL_PROCESS_READY_TIMEOUT')), 5000);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('message', message => { clearTimeout(timer); resolveReady(message); });
      });
    }
    return [...processes].map(([passageId, child]) => ({ passageId, pid: child.pid }));
  }
  if (action === 'stop-processes') {
    storage.executionPersistence().recordCancellation(attemptId, randomUUID());
    const stops = [];
    for (const [passageId, child] of processes) {
      const observed = await stop(child);
      // Only an observed OS close permits the durable stop receipt.
      storage.executionPersistence().recordStop({ passageId }, { passageId, state: 'confirmed' });
      stops.push({ passageId, ...observed, receiptRecordedAtMs: Date.now() });
      processes.delete(passageId);
    }
    return stops;
  }
  if (action === 'plan') return await pipeline.getRemovalPlan(attemptId, resource.id);
  if (action === 'remove') {
    const plan = await pipeline.getRemovalPlan(attemptId, resource.id);
    assert(plan.view.capability.available);
    const operation = await pipeline.removeResource(attemptId, resource.id, { confirmed: true, planHash: plan.view.planHash },
      { operationId: randomUUID(), expectedRevision: plan.etag });
    await pipeline.drain(); assert.deepEqual(failures, []);
    return { operation: storage.getOperation(operation.operationId), resources: storage.getResources(attemptId) };
  }
  if (action === 'diff') return await pipeline.getDeliveryDiff(deliveryId, {});
  if (action === 'artifact') {
    const artifact = await pipeline.getArtifact(artifactId);
    return { sha256: storage.getArtifact(artifactId).sha256, sizeBytes: artifact.bytes.length };
  }
  if (action === 'stored-state') return { delivery: storage.getDelivery(deliveryId).delivery, review: storage.getReview(deliveryId), artifact: storage.getArtifact(artifactId) };
  if (action === 'snapshot') {
    await createRetainedVerifier(directory, git, canonicalize)(storage.getDelivery(deliveryId).delivery);
    const response = await app.inject({ url: `/api/v1/deliveries/${deliveryId}`, headers });
    assert.equal(response.statusCode, 200);
    return { pid: process.pid, delivery: storage.getDelivery(deliveryId).delivery, review: storage.getReview(deliveryId),
      artifact: storage.getArtifact(artifactId), resources: storage.getResources(attemptId), httpStatus: response.statusCode,
      httpPayloadSha256: (await import('node:crypto')).createHash('sha256').update(response.body).digest('hex'), gitCommands: [...new Set(gitCommands)] };
  }
  throw new Error('PROOF_ACTION_INVALID');
}
process.on('message', message => {
  assert(message && typeof message === 'object' && 'id' in message && typeof message.id === 'number' && 'action' in message && typeof message.action === 'string');
  const id = message.id;
  void handle(message.action).then(result => process.send?.({ id, result }), error => {
    process.send?.({ id, error: error instanceof Error && 'code' in error ? error.code : 'PROOF_ACTION_FAILED', gitFailure });
  });
});
process.on('disconnect', () => {
  void (async () => {
    for (const child of processes.values()) await stop(child);
    await app.close(); lock.close();
  })().catch(() => { process.exitCode = 1; });
});
process.send({ ready: true, pid: process.pid, readyAtMs: Date.now(), canonicalization });
