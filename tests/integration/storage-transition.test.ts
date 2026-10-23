import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigurationView, OperationView, SessionResponse, StorageTransitionCommand } from '#contracts';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { createGitHub } from '../../apps/controller/src/modules/github/index.js';
import { openStorage, type Storage } from '../../apps/controller/src/modules/storage/index.js';
import { createWorkspaces } from '../../apps/controller/src/modules/workspaces/index.js';
import { createProjectStorageInspector } from '../../apps/controller/src/modules/workspaces/project-storage.js';
import { attemptFixture } from '../fixtures/attempt.js';

const roots: string[] = [];
const applications: Array<ReturnType<typeof createApp>> = [];
const storages: Storage[] = [];
const host = '127.0.0.1:4310';
const origin = `http://${host}`;
const bootstrap = { host, origin, 'content-type': 'application/json', 'x-factory-client': 'web' };

function environment() {
  const installRoot = mkdtempSync(join(process.cwd(), '.cache', 'factory-storage-transition-'));
  roots.push(installRoot);
  const dataDirectory = resolve(installRoot, 'var', 'factory');
  mkdirSync(dataDirectory, { recursive: true });
  const storage = openStorage({ dataDirectory }); storages.push(storage);
  const github = createGitHub();
  const workspaces = createWorkspaces({ github, dataDirectory, projectStorage: storage });
  const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: dataDirectory, FACTORY_LOG_LEVEL: 'silent' }, installRoot), storage,
    undefined, { workspaces });
  applications.push(app);
  const source = { kind: 'local' as const, location: installRoot };
  const project = storage.registerProject({ operationId: randomUUID(), expectedRevision: undefined,
    body: { name: 'Transition project', source, base_branch: 'main' }, source, originNotes: [] });
  return { installRoot, dataDirectory, storage, github, workspaces, app, projectId: project.resource.id };
}

async function session(app: ReturnType<typeof createApp>) {
  const response = await app.inject({ method: 'POST', url: '/api/v1/session', headers: bootstrap, payload: {} });
  expect(response.statusCode).toBe(200);
  const body = response.json<SessionResponse>();
  return { ...bootstrap, cookie: String(response.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': body.csrf_token };
}

async function prepareLocation(f: ReturnType<typeof environment>) {
  const relative = `var/factory/projects/${f.projectId}/v1/managed`;
  const root = resolve(f.installRoot, ...relative.split('/'));
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'payload.txt'), 'preserve this project data', 'utf8');
  const observed = await f.workspaces.inspectProjectStorageRoot(f.projectId, 'managed', 1);
  const location = f.storage.recordProjectStorageLocation(observed);
  return { root, relative, location };
}

afterEach(async () => {
  for (const app of applications.splice(0).reverse()) { try { await app.close(); } catch { /* already closed during a restart test */ } }
  for (const storage of storages.splice(0).reverse()) { try { storage.close(); } catch { /* already closed by Fastify */ } }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('project storage transition', () => {
  it('refuses an in-use project before authorizing any filesystem movement', async () => {
    const f = await attemptFixture(join(process.cwd(), '.cache'));
    try {
      const attempt = await f.prepare();
      await f.pipeline.startAttempt(attempt.body, attempt.context);
      await f.pipeline.drain();
      expect(f.storage.listAttempts({}).items).toHaveLength(1);
      expect(() => f.storage.assertStorageTransitionQuiescent(f.projectId))
        .toThrow(expect.objectContaining({ code: 'PROJECT_STORAGE_BUSY' }));
    } finally { await f.close(); }
  });

  it('refuses a project with an accepted publication request even when it has no running effects', async () => {
    const f = await attemptFixture(join(process.cwd(), '.cache'));
    try {
      const attempt = await f.prepare();
      await f.pipeline.startAttempt(attempt.body, attempt.context);
      await f.pipeline.drain();
      const entry = f.storage.listAttempts({}).items[0];
      expect(entry).toBeDefined();
      f.db.prepare("UPDATE attempts SET phase='finished',result='delivered' WHERE id=?").run(entry!.id);
      f.storage.acceptPublication({ operationId: randomUUID(), attemptId: entry!.id,
        expectedRevision: `"${entry!.id}:${entry!.revision}"`, kind: 'attempt.revalidate', body: {} });
      expect(f.storage.getEffects(entry!.id).every(effect => !['running', 'unknown'].includes(effect.state))).toBe(true);
      expect(() => f.storage.assertStorageTransitionQuiescent(f.projectId))
        .toThrow(expect.objectContaining({ code: 'PROJECT_STORAGE_BUSY' }));
    } finally { await f.close(); }
  });

  it('publishes the configuration plan and moves the registered root after an explicit V08 command', async () => {
    const f = environment(); const source = await prepareLocation(f); const headers = await session(f.app);
    const view = await f.app.inject({ method: 'GET', url: `/api/v1/projects/${f.projectId}/configuration`, headers });
    expect(view.statusCode).toBe(200);
    const configuration = view.json<ConfigurationView>();
    expect(configuration.storage.transition_plan).toMatchObject({ source_location_id: source.location.id, capability: { available: true } });
    expect(Value.Check(ConfigurationView, configuration)).toBe(true);
    const plan = configuration.storage.transition_plan!;
    const deletionPreviewBefore = f.storage.getProjectDeletionPaths(f.projectId);
    const body: StorageTransitionCommand = { location_key: plan.location_key, source_location_id: plan.source_location_id,
      plan_hash: plan.plan_hash, authorized: true };
    const operationId = randomUUID();
    const accepted = await f.app.inject({ method: 'POST', url: `/api/v1/projects/${f.projectId}/storage-transition`,
      headers: { ...headers, 'idempotency-key': operationId, 'if-match': String(view.headers.etag) }, payload: body });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json()).toMatchObject({ operation_id: operationId, status_url: `/api/v1/operations/${operationId}` });
    expect(existsSync(source.root)).toBe(false);
    const current = f.storage.getProjectStorageView(f.projectId);
    expect(current.state).toBe('current');
    expect(current).toMatchObject({ state: 'current', managed_root: plan.destination_relative,
      locations: [{ id: source.location.id, current: false }, { location_key: 'managed', layout_version: 2, current: true }] });
    const deletion = f.storage.getProjectDeletionPaths(f.projectId);
    expect(deletion.inventoryVersion).not.toBe(deletionPreviewBefore.inventoryVersion);
    expect(f.storage.getProjectDeletionInventory(f.projectId).keys.project_storage_transitions).toEqual([JSON.stringify([operationId])]);
    expect(deletion.targets.map(target => target.path)).toEqual(expect.arrayContaining([
      resolve(f.installRoot, ...source.relative.split('/')), resolve(f.installRoot, ...plan.destination_relative.split('/')),
    ]));
    expect(readFileSync(resolve(f.installRoot, ...plan.destination_relative.split('/'), 'payload.txt'), 'utf8')).toBe('preserve this project data');
    const referenceAttempt = randomUUID();
    const resolver = createProjectStorageInspector(f.dataDirectory, undefined, {
      getAttemptProjectId: () => f.projectId,
      getAttemptWorkspaceReference: () => `projects/${f.projectId}/v1/managed/work/${referenceAttempt}/implementation`,
      getProjectStorageView: id => f.storage.getProjectStorageView(id),
      getStorageTransition: id => f.storage.getStorageTransition(id),
      recordProjectStorageLocation: observation => f.storage.recordProjectStorageLocation(observation),
      assertProjectStorageLocation: observation => f.storage.assertProjectStorageLocation(observation),
    });
    expect(await resolver.resolveAttemptRoot(referenceAttempt)).toBe(resolve(f.installRoot, ...plan.destination_relative.split('/')));
    const operation = await f.app.inject({ method: 'GET', url: `/api/v1/operations/${operationId}`, headers });
    expect(operation.json<OperationView>()).toMatchObject({ state: 'succeeded', progress: { step: 'publishing_location', state: 'verified' } });
  });

  it('refuses a displayed plan when the source directory identity was replaced', async () => {
    const f = environment(); const source = await prepareLocation(f); const headers = await session(f.app);
    const view = await f.app.inject({ method: 'GET', url: `/api/v1/projects/${f.projectId}/configuration`, headers });
    const plan = view.json<ConfigurationView>().storage.transition_plan!;
    const replacement = `${source.root}-previous`;
    renameSync(source.root, replacement); mkdirSync(source.root); writeFileSync(join(source.root, 'replacement.txt'), 'new object', 'utf8');
    const command: StorageTransitionCommand = { location_key: plan.location_key, source_location_id: plan.source_location_id,
      plan_hash: plan.plan_hash, authorized: true };
    const operationId = randomUUID();
    const response = await f.app.inject({ method: 'POST', url: `/api/v1/projects/${f.projectId}/storage-transition`,
      headers: { ...headers, 'idempotency-key': operationId, 'if-match': String(view.headers.etag) }, payload: command });
    expect(response.statusCode).toBe(409);
    expect(f.storage.getStorageTransition(operationId)).toBeNull();
    expect(readFileSync(join(source.root, 'replacement.txt'), 'utf8')).toBe('new object');
    expect(readFileSync(join(replacement, 'payload.txt'), 'utf8')).toBe('preserve this project data');
    expect(existsSync(resolve(f.installRoot, ...plan.destination_relative.split('/')))).toBe(false);
  });

  it('reconciles a response lost after the atomic move across restart without losing the only copy', async () => {
    const f = environment(); const source = await prepareLocation(f); const headers = await session(f.app);
    const view = await f.app.inject({ method: 'GET', url: `/api/v1/projects/${f.projectId}/configuration`, headers });
    const plan = view.json<ConfigurationView>().storage.transition_plan!;
    const command: StorageTransitionCommand = { location_key: plan.location_key, source_location_id: plan.source_location_id,
      plan_hash: plan.plan_hash, authorized: true };
    const operationId = randomUUID(); const etag = String(view.headers.etag);
    const move = f.workspaces.moveProjectStorageTransition;
    f.workspaces.moveProjectStorageTransition = async (input) => { await move(input); throw new Error('SIMULATED_RESPONSE_LOSS'); };
    const first = await f.app.inject({ method: 'POST', url: `/api/v1/projects/${f.projectId}/storage-transition`,
      headers: { ...headers, 'idempotency-key': operationId, 'if-match': etag }, payload: command });
    expect(first.statusCode).toBe(202);
    expect((await f.app.inject({ method: 'GET', url: `/api/v1/operations/${operationId}`, headers })).json<OperationView>())
      .toMatchObject({ state: 'unknown', progress: { step: 'moving', state: 'uncertain' } });
    const destination = resolve(f.installRoot, ...plan.destination_relative.split('/'));
    expect(existsSync(source.root)).toBe(false);
    expect(readFileSync(join(destination, 'payload.txt'), 'utf8')).toBe('preserve this project data');

    await f.app.close();
    const restartedStorage = openStorage({ dataDirectory: f.dataDirectory }); storages.push(restartedStorage);
    const restartedWorkspaces = createWorkspaces({ github: f.github, dataDirectory: f.dataDirectory, projectStorage: restartedStorage });
    const restartedApp = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.dataDirectory, FACTORY_LOG_LEVEL: 'silent' }, f.installRoot),
      restartedStorage, undefined, { workspaces: restartedWorkspaces });
    applications.push(restartedApp);
    const newHeaders = await session(restartedApp);
    const pending = await restartedApp.inject({ method: 'GET', url: `/api/v1/projects/${f.projectId}/configuration`, headers: newHeaders });
    expect(pending.json<ConfigurationView>().storage).toMatchObject({ state: 'uncertain', active_transition_operation_id: operationId });
    const referenceAttempt = randomUUID();
    const resolver = createProjectStorageInspector(f.dataDirectory, undefined, {
      getAttemptProjectId: () => f.projectId,
      getAttemptWorkspaceReference: () => `projects/${f.projectId}/v1/managed/work/${referenceAttempt}/implementation`,
      getProjectStorageView: id => restartedStorage.getProjectStorageView(id),
      getStorageTransition: id => restartedStorage.getStorageTransition(id),
      recordProjectStorageLocation: observation => restartedStorage.recordProjectStorageLocation(observation),
      assertProjectStorageLocation: observation => restartedStorage.assertProjectStorageLocation(observation),
    });
    expect(await resolver.resolveAttemptRoot(referenceAttempt)).toBe(destination);
    const resumed = await restartedApp.inject({ method: 'POST', url: `/api/v1/projects/${f.projectId}/storage-transition`,
      headers: { ...newHeaders, 'idempotency-key': operationId, 'if-match': etag }, payload: command });
    expect(resumed.statusCode).toBe(202);
    const resumedOperation = await restartedApp.inject({ method: 'GET', url: `/api/v1/operations/${operationId}`, headers: newHeaders });
    expect(resumedOperation.json<OperationView>()).toMatchObject({ state: 'succeeded', progress: { step: 'publishing_location', state: 'verified', generation: 3 } });
    expect(restartedStorage.getProjectStorageView(f.projectId)).toMatchObject({ state: 'current', managed_root: plan.destination_relative });
    expect(existsSync(source.root)).toBe(false);
    expect(readFileSync(join(destination, 'payload.txt'), 'utf8')).toBe('preserve this project data');
  });

  it('keeps both copies when destination and source coexist during reconciliation', async () => {
    const f = environment(); const source = await prepareLocation(f); const headers = await session(f.app);
    const view = await f.app.inject({ method: 'GET', url: `/api/v1/projects/${f.projectId}/configuration`, headers });
    const plan = view.json<ConfigurationView>().storage.transition_plan!;
    const command: StorageTransitionCommand = { location_key: plan.location_key, source_location_id: plan.source_location_id,
      plan_hash: plan.plan_hash, authorized: true };
    const operationId = randomUUID(); const etag = String(view.headers.etag);
    const move = f.workspaces.moveProjectStorageTransition;
    f.workspaces.moveProjectStorageTransition = async () => { throw new Error('SIMULATED_INTERRUPTION_BEFORE_MOVE'); };
    const accepted = await f.app.inject({ method: 'POST', url: `/api/v1/projects/${f.projectId}/storage-transition`,
      headers: { ...headers, 'idempotency-key': operationId, 'if-match': etag }, payload: command });
    expect(accepted.statusCode).toBe(202);
    const destination = resolve(f.installRoot, ...plan.destination_relative.split('/'));
    mkdirSync(destination, { recursive: true }); writeFileSync(join(destination, 'partial.txt'), 'partial copy', 'utf8');
    f.workspaces.moveProjectStorageTransition = move;
    const result = await f.app.inject({ method: 'POST', url: `/api/v1/projects/${f.projectId}/storage-transition`,
      headers: { ...headers, 'idempotency-key': operationId, 'if-match': etag }, payload: command });
    expect(result.statusCode).toBe(202);
    expect((await f.app.inject({ method: 'GET', url: `/api/v1/operations/${operationId}`, headers })).json<OperationView>().state).toBe('unknown');
    expect(existsSync(source.root)).toBe(true);
    expect(readFileSync(join(source.root, 'payload.txt'), 'utf8')).toBe('preserve this project data');
    expect(readFileSync(join(destination, 'partial.txt'), 'utf8')).toBe('partial copy');
    const current = f.storage.getConfiguration(f.projectId);
    const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _createdAt, ...configuration } = current.view.configuration;
    expect(() => f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: current.etag, projectId: f.projectId,
      body: { project_changes: { guidance: 'must wait for transition reconciliation' } },
      configuration: { ...configuration, guidance: 'must wait for transition reconciliation' }, globalChanges: {} }))
      .toThrow(expect.objectContaining({ code: 'PROJECT_STORAGE_TRANSITION_ACTIVE' }));
  });
});
