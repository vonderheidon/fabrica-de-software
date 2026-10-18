import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { ConfigurationOptions, ConfigurationSaved, PreparationCreated, PreparationView, SettingsSaved, SettingsView } from '#contracts';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { attemptFixture, complete, type AttemptFixture } from '../fixtures/attempt.js';
import { digest } from '../../apps/controller/src/modules/storage/configuration-reads.js';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function fixture() {
  const f = await attemptFixture(); cleanup.push(() => f.close());
  const github = { ...f.github,
    getProjectOwner: vi.fn(async () => complete(f.project.project.owner)),
    listProjects: vi.fn(async () => complete([f.project.project])),
    validateProjectSelection: vi.fn(async () => complete(f.project)),
  };
  const app = createApp(loadConfiguration({ FACTORY_LOG_LEVEL: 'silent' }, f.directory), f.storage, undefined,
    { github, workspaces: f.workspaces }, { github: f.github, workspaces: f.workspaces });
  cleanup.push(() => app.close());
  const bootstrap = { host: '127.0.0.1:4310', origin: 'http://127.0.0.1:4310', 'content-type': 'application/json', 'x-factory-client': 'web' };
  const session = await app.inject({ method: 'POST', url: '/api/v1/session', headers: bootstrap, payload: {} });
  expect(session.statusCode).toBe(200);
  const headers = { ...bootstrap, cookie: String(session.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': session.json<{ csrf_token: string }>().csrf_token };
  return { ...f, app, headers };
}
function durableRows(f: AttemptFixture) {
  return { settings: f.storage.getGlobalConfiguration(), projects: f.db.prepare('SELECT * FROM project_revisions ORDER BY id').all(),
    preparations: f.db.prepare('SELECT * FROM preparation_revisions ORDER BY preparation_id, revision').all(),
    operations: f.db.prepare('SELECT * FROM operation_requests ORDER BY operation_id').all(), events: f.storage.getEvents({}) };
}

it('serves and saves the same configuration schemas, preserving omission, null, exact time and receipt semantics', async () => {
  const f = await fixture();
  const before = f.storage.getGlobalConfiguration();
  const settings = await f.app.inject({ url: '/api/v1/settings', headers: f.headers });
  expect(Value.Check(SettingsView, settings.json())).toBe(true);
  const key = randomUUID();
  const command = { method: 'PUT' as const, url: '/api/v1/settings', headers: { ...f.headers, 'if-match': before.etag, 'idempotency-key': key },
    payload: { changes: { time_defaults: { polling_interval_ms: 3 } }, profile_changes: [] } };
  const saved = await f.app.inject(command);
  expect(saved.statusCode, saved.body).toBe(200);
  expect(Value.Check(SettingsSaved, saved.json())).toBe(true);
  expect(saved.json<SettingsSaved>()).toMatchObject({ operation_id: key, settings: { time_defaults: { polling_interval_ms: 3, passage_active_time_ms: before.view.settings.time_defaults.passage_active_time_ms } } });
  expect((await f.app.inject(command)).json()).toEqual(saved.json());
  expect(f.storage.getOperation(key)?.receipt).toEqual(saved.json<SettingsSaved>().receipt);
  expect(f.db.prepare('SELECT request_hash FROM operation_requests WHERE operation_id=?').get(key)).toEqual({ request_hash: digest({
    method: 'PUT', route: '/api/v1/settings', kind: 'settings.update', expectedRevision: before.etag,
    body: { changes: { time_defaults: { polling_interval_ms: 3 } }, profileChanges: [] },
  }) });
  const current = f.storage.getConfiguration(f.projectId);
  const projectKey = randomUUID();
  const updated = await f.app.inject({ method: 'PUT', url: `/api/v1/projects/${f.projectId}/configuration`,
    headers: { ...f.headers, 'if-match': current.etag, 'idempotency-key': projectKey }, payload: { project_changes: { reviewer_profile_id: null, guidance: '{"baseBranch":"texto do operador"}' } } });
  expect(updated.statusCode, updated.body).toBe(200);
  expect(Value.Check(ConfigurationSaved, updated.json())).toBe(true);
  expect(updated.json<ConfigurationSaved>().configuration).toMatchObject({ reviewer_profile_id: null, implementer_profile_id: current.view.configuration.implementer_profile_id,
    base_branch: current.view.configuration.base_branch, guidance: '{"baseBranch":"texto do operador"}' });
  expect(f.db.prepare('SELECT request_hash FROM operation_requests WHERE operation_id=?').get(projectKey)).toEqual({ request_hash: digest({
    method: 'PUT', route: `/api/v1/projects/${f.projectId}/configuration`, kind: 'project.configuration.update', expectedRevision: current.etag,
    body: { projectChanges: { reviewerProfileId: null, guidance: '{"baseBranch":"texto do operador"}' } },
  }) });
});

it('rejects camelCase aliases, forbidden null and query aliases without accepting any durable write', async () => {
  const f = await fixture(); const before = durableRows(f);
  const requests = [
    { url: '/api/v1/settings', payload: { changes: {}, profile_changes: [], profileChanges: [] } },
    { url: `/api/v1/projects/${f.projectId}/configuration`, payload: { project_changes: {}, projectChanges: {} } },
    { url: `/api/v1/projects/${f.projectId}/configuration`, payload: { project_changes: { queue_order: { useBoardPosition: false } } } },
    { url: `/api/v1/projects/${f.projectId}/configuration`, payload: { project_changes: { base_branch: null } } },
  ];
  for (const request of requests) {
    const response = await f.app.inject({ ...request, method: 'PUT', headers: { ...f.headers, 'idempotency-key': randomUUID(), 'if-match': f.storage.getConfiguration(f.projectId).etag } });
    expect(response.statusCode, response.body).toBe(400);
  }
  const registration = await f.app.inject({ method: 'POST', url: '/api/v1/projects', headers: { ...f.headers, 'idempotency-key': randomUUID() },
    payload: { name: 'Alias', source: { kind: 'github', location: f.issue.repository.url }, base_branch: 'main', baseBranch: 'main' } });
  expect(registration.statusCode).toBe(400);
  for (const alias of ['ownerId', 'ownerKind', 'githubProjectId', 'statusFieldId']) {
    expect((await f.app.inject({ url: `/api/v1/projects/${f.projectId}/configuration-options?${alias}=VALUE`, headers: f.headers })).statusCode).toBe(400);
  }
  const options = await f.app.inject({ url: `/api/v1/projects/${f.projectId}/configuration-options?owner_id=OWNER_test&owner_kind=organization&github_project_id=PVT_test&status_field_id=FIELD_test`, headers: f.headers });
  expect(options.statusCode, options.body).toBe(200);
  expect(Value.Check(ConfigurationOptions, options.json())).toBe(true);
  expect(durableRows(f)).toEqual(before);
});

it('shares POST GET PUT preparation DTOs including nested issues while leaving external models and operator text intact', async () => {
  const f = await fixture(); const originalIssue = structuredClone(f.issue);
  const guidance = '{"issueId":"texto literal","timeDefaults":{"pollingIntervalMs":7}}';
  const key = randomUUID();
  const response = await f.app.inject({ method: 'POST', url: `/api/v1/projects/${f.projectId}/preparations`, headers: { ...f.headers, 'idempotency-key': key },
    payload: { issue_id: f.issue.id, delivery_mode: 'icr', guidance, overrides: { correction_limit: 0 } } });
  expect(response.statusCode, response.body).toBe(201);
  expect(Value.Check(PreparationCreated, response.json())).toBe(true);
  const created = response.json<PreparationCreated>();
  expect(f.db.prepare('SELECT request_hash FROM operation_requests WHERE operation_id=?').get(key)).toEqual({ request_hash: digest({
    method: 'POST', route: `/api/v1/projects/${f.projectId}/preparations`, expectedRevision: null,
    body: { issueId: f.issue.id, deliveryMode: 'icr', guidance, overrides: { correctionLimit: 0 } },
  }) });
  expect(created).toMatchObject({ operation_id: key, preparation: { issue_id: f.issue.id, guidance,
    issue: { repository: { default_branch: 'main', is_archived: false }, memberships: [{ item_id: 'ITEM_test', project_id: 'PVT_test', status_values: [{ field_id: 'FIELD_test', option_id: 'READY' }] }] },
    effective_configuration: { configuration: { correction_limit: 0 }, origins: { correction_limit: 'preparation' }, time_defaults: { polling_interval_ms: 15_000 } },
    criteria_preview: { criteria: [{ occurrence_index: 1 }, { occurrence_index: 2 }] } } });
  const id = created.preparation.id; const url = `/api/v1/preparations/${id}`;
  const read = await f.app.inject({ url, headers: f.headers }); expect(Value.Check(PreparationView, read.json())).toBe(true);
  const before = durableRows(f);
  for (const changes of [{ deliveryMode: 'pr' }, { delivery_mode: 'pr', deliveryMode: 'pr' }, { overrides: { timeDefaults: {} } }, { overrides: null }]) {
    const invalid = await f.app.inject({ method: 'PUT', url, headers: { ...f.headers, 'if-match': String(read.headers.etag), 'idempotency-key': randomUUID() }, payload: { changes } });
    expect(invalid.statusCode, invalid.body).toBe(400);
  }
  expect(durableRows(f)).toEqual(before);
  const updated = await f.app.inject({ method: 'PUT', url, headers: { ...f.headers, 'if-match': String(read.headers.etag), 'idempotency-key': randomUUID() }, payload: { changes: { delivery_mode: 'pr' } } });
  expect(updated.statusCode, updated.body).toBe(200); expect(Value.Check(PreparationCreated, updated.json())).toBe(true);
  expect(updated.json<PreparationCreated>().preparation).toMatchObject({ delivery_mode: 'pr', guidance, overrides: { correction_limit: 0 } });
  expect(f.issue).toEqual(originalIssue);
  expect(f.storage.getPreparation(id).view.guidance).toBe(guidance);
});
