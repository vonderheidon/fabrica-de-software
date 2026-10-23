import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { TimeDefaults, type PreparationCreated, type SessionResponse } from '#contracts';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { applyMigrations, loadMigrations } from '../../apps/controller/src/modules/storage/migrations.js';
import { attemptFixture, complete } from '../fixtures/attempt.js';
import { publicationFixture } from '../fixtures/publication.js';
import { removeInferenceLimitsSchema } from '../fixtures/inference-limits-schema.js';

const resources: { close(): unknown }[] = [];
afterEach(async () => { for (const resource of resources.splice(0).reverse()) await resource.close(); });
const host = '127.0.0.1:4310';
const origin = `http://${host}`;
const invalidTimes = [0, -1, 0.5, 2_147_483_648, Number.MAX_SAFE_INTEGER, '1000', null];

async function fixture() {
  const f = await attemptFixture(); resources.push(f);
  const github = { ...f.github,
    getProjectOwner: async () => complete(f.project.project.owner),
    listProjects: async () => complete([f.project.project]),
    validateProjectSelection: async () => complete(f.project),
  };
  const app = createApp(loadConfiguration({ FACTORY_LOG_LEVEL: 'silent' }, f.directory), f.storage,
    undefined, { github, workspaces: f.workspaces }, { github: f.github, workspaces: f.workspaces });
  resources.push(app);
  const session = await app.inject({ method: 'POST', url: '/api/v1/session',
    headers: { host, origin, 'content-type': 'application/json', 'x-factory-client': 'web' }, payload: {} });
  expect(session.statusCode).toBe(200);
  const headers = { host, origin, 'content-type': 'application/json',
    cookie: String(session.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': session.json<SessionResponse>().csrf_token };
  const choices = { issue_id: f.issue.id, delivery_mode: 'icr', guidance: '', overrides: {} };
  const preparation = await app.inject({ method: 'POST', url: `/api/v1/projects/${f.projectId}/preparations`,
    headers: { ...headers, 'idempotency-key': randomUUID() }, payload: choices });
  expect(preparation.statusCode).toBe(201);
  const preparationId = preparation.json<PreparationCreated>().preparation.id;
  return { ...f, app, headers, choices, preparationId };
}

describe('exact internal times without inference limits', () => {
  it.each(['polling_interval_ms', 'passage_active_time_ms'] as const)('rejects invalid %s at every save boundary without writes', async field => {
    const f = await fixture();
    const before = f.storage.getGlobalConfiguration();
    const current = f.storage.getConfiguration(f.projectId);
    const preparation = f.storage.getPreparation(f.preparationId);
    const events = f.storage.getEvents({});
    for (const value of invalidTimes) {
      const timeDefaults = { ...before.view.settings.time_defaults, [field]: value };
      expect(Value.Check(TimeDefaults, timeDefaults)).toBe(false);
      const requests = [
        { url: '/api/v1/settings', method: 'PUT' as const, etag: before.etag, payload: { changes: { time_defaults: { [field]: value } } } },
        { url: `/api/v1/projects/${f.projectId}/configuration`, method: 'PUT' as const, etag: current.etag, payload: { project_changes: {}, global_changes: { time_defaults: { [field]: value } } } },
        { url: `/api/v1/projects/${f.projectId}/preparations`, method: 'POST' as const, etag: '', payload: { ...f.choices, overrides: { time_defaults: timeDefaults } } },
        { url: `/api/v1/preparations/${f.preparationId}`, method: 'PUT' as const, etag: preparation.etag, payload: { changes: { overrides: { time_defaults: timeDefaults } } } },
      ];
      for (const request of requests) {
        const response = await f.app.inject({ ...request, headers: { ...f.headers,
          'idempotency-key': randomUUID(), 'if-match': request.etag } });
        expect(response.statusCode, `${request.url}: ${response.body}`).toBe(400);
      }
      expect(() => f.storage.saveTimeDefaults({ operationId: randomUUID(), expectedRevision: f.storage.getSettingsETag(),
        timeDefaults: timeDefaults as TimeDefaults })).toThrow();
    }
    expect(f.storage.getGlobalConfiguration()).toEqual(before);
    expect(f.storage.getConfiguration(f.projectId)).toEqual(current);
    expect(f.storage.getPreparation(f.preparationId)).toEqual(preparation);
    expect(f.storage.getEvents({})).toEqual(events);
  });

  it.each([1, 3, 2_147_483_647])('persists %s ms exactly through settings, project configuration and preparation overrides', async value => {
    const f = await fixture();
    const timeDefaults = { ...f.storage.getSettings().time_defaults, polling_interval_ms: value, passage_active_time_ms: value };
    expect(Value.Check(TimeDefaults, timeDefaults)).toBe(true);
    const settings = await f.app.inject({ method: 'PUT', url: '/api/v1/settings',
      headers: { ...f.headers, 'idempotency-key': randomUUID(), 'if-match': f.storage.getGlobalConfiguration().etag }, payload: { changes: { time_defaults: timeDefaults } } });
    expect(settings.statusCode, settings.body).toBe(200);
    expect(f.storage.getSettings().time_defaults).toEqual(timeDefaults);
    const configuration = await f.app.inject({ method: 'PUT', url: `/api/v1/projects/${f.projectId}/configuration`,
      headers: { ...f.headers, 'idempotency-key': randomUUID(), 'if-match': f.storage.getConfiguration(f.projectId).etag },
      payload: { project_changes: { guidance: 'Edited another field' }, global_changes: { time_defaults: timeDefaults } } });
    expect(configuration.statusCode, configuration.body).toBe(200);
    expect(f.storage.getSettings().time_defaults).toEqual(timeDefaults);
    const prepared = await f.app.inject({ method: 'PUT', url: `/api/v1/preparations/${f.preparationId}`,
      headers: { ...f.headers, 'idempotency-key': randomUUID(), 'if-match': f.storage.getPreparation(f.preparationId).etag },
      payload: { changes: { overrides: { time_defaults: timeDefaults } } } });
    expect(prepared.statusCode, prepared.body).toBe(200);
    expect(prepared.json<PreparationCreated>().preparation.effective_configuration.time_defaults).toEqual(timeDefaults);
    const before = f.storage.getSettings().time_defaults;
    f.storage.saveTimeDefaults({ operationId: randomUUID(), expectedRevision: f.storage.getSettingsETag(), timeDefaults: before });
    expect(f.storage.getSettings().time_defaults).toEqual(timeDefaults);
  });

  it('rejects retired financial and inference token properties without weakening CSRF', async () => {
    const f = await fixture(); const before = f.storage.getGlobalConfiguration();
    for (const field of ['costDefaults', 'cost_defaults', 'costLimit', 'tokenLimit', 'token_limit', 'maxTokens']) {
      const retired = { [field]: { formatVersion: 1, limit: { state: 'configured', value: 0, unit: 'USD' } } };
      for (const [url, payload, etag] of [
        ['/api/v1/settings', { changes: retired }, before.etag],
        [`/api/v1/projects/${f.projectId}/configuration`, { global_changes: retired }, f.storage.getConfiguration(f.projectId).etag],
        [`/api/v1/preparations/${f.preparationId}`, { changes: { overrides: retired } }, f.storage.getPreparation(f.preparationId).etag],
      ] as const) {
        const response = await f.app.inject({ method: 'PUT', url, payload,
          headers: { ...f.headers, 'idempotency-key': randomUUID(), 'if-match': etag } });
        expect(response.statusCode, response.body).toBe(400);
      }
    }
    const csrf = await f.app.inject({ method: 'PUT', url: '/api/v1/settings', payload: { changes: { timeDefaults: { pollingIntervalMs: 1000 } } },
      headers: { ...f.headers, 'x-csrf-token': '', 'idempotency-key': randomUUID(), 'if-match': before.etag } });
    expect(csrf.statusCode).toBe(403);
    expect(f.storage.getGlobalConfiguration()).toEqual(before);
  });

  it('prepares and starts a tracked passage with no inference ceiling in new persisted data or measurements', async () => {
    const f = await attemptFixture(); resources.push(f);
    expect(f.storage.getSettings().time_defaults).toMatchObject({ polling_interval_ms: 15_000, passage_active_time_ms: 1_800_000 });
    const command = await f.prepare();
    const operation = await f.pipeline.startAttempt(command.body, command.context); await f.pipeline.drain();
    expect(f.storage.getAttempt(operation.resource.id)).toMatchObject({ phase: 'implementing', tracking: 'tracked', suspension: null });
    expect(f.execution.startPassage).toHaveBeenCalledOnce();
    const persisted = f.db.prepare('SELECT capture_json FROM attempts').all();
    const choices = f.db.prepare('SELECT choices_json FROM preparation_revisions').all();
    expect(JSON.stringify([persisted, choices, f.storage.getMeasurements(operation.resource.id)]))
      .not.toMatch(/costDefaults|costLimit|tokenLimit|maxTokens/);
    expect(f.storage.getMeasurements(operation.resource.id).cost).toMatchObject({ state: 'unavailable', reason: 'EXECUTOR_COST_NOT_OBSERVED' });
  });
});

describe('non-destructive removal of persisted inference ceilings', () => {
  it('migrates v20, preserving historical capture, preparation, review, result and receipt bytes', async () => {
    expect(loadMigrations()[19]?.checksum).toBe('80660c78a09810e5873e7301fc6c695cbab6454865e1f60ccbd0df8323eb4651');
    const f = await publicationFixture(false); resources.push(f);
    await f.implement(); await f.approve(); const deliveryId = f.status().deliveryId!;
    await f.pipeline.close(); f.storage.close();
    removeInferenceLimitsSchema(f.db);
    const retired = { formatVersion: 1, limit: { state: 'configured', value: 7, unit: 'USD' } };
    // Reconstruct old immutable documents only in this disposable historical fixture, then restore their exact guards.
    const triggers = f.db.prepare<[], { sql: string }>("SELECT sql FROM sqlite_schema WHERE name IN ('attempt_capture_immutable','preparation_revision_update_immutable') ORDER BY name").all();
    f.db.exec('DROP TRIGGER attempt_capture_immutable; DROP TRIGGER preparation_revision_update_immutable;');
    f.db.prepare("UPDATE attempts SET capture_json=json_set(capture_json,'$.configuration.costDefaults',json(?),'$.configuration.origins.costDefaults','global')").run(JSON.stringify(retired));
    f.db.prepare("UPDATE preparation_revisions SET choices_json=json_set(choices_json,'$.choices.overrides.costDefaults',json(?))").run(JSON.stringify(retired));
    for (const trigger of triggers) f.db.exec(trigger.sql);
    const history = () => ({ captures: f.db.prepare('SELECT capture_json FROM attempts').all(),
      preparations: f.db.prepare('SELECT choices_json FROM preparation_revisions ORDER BY revision').all(),
      reviews: f.db.prepare('SELECT * FROM reviews ORDER BY id').all(), results: f.db.prepare('SELECT * FROM passage_results ORDER BY passage_id').all(),
      operations: f.db.prepare('SELECT * FROM operation_requests ORDER BY operation_id').all(),
      ledger: f.db.prepare('SELECT * FROM schema_migrations WHERE version<=20 ORDER BY version').all() });
    const before = history(); const identity = f.db.prepare('SELECT installation_id FROM factory_settings').get();
    const storage = openStorage({ dataDirectory: f.directory }); resources.push(storage);
    expect(storage.getDiagnostics().schemaVersion).toBe(34);
    expect(history()).toEqual(before);
    expect(f.db.prepare('SELECT installation_id FROM factory_settings').get()).toEqual(identity);
    expect(f.db.prepare<[], { name: string }>('PRAGMA table_info(factory_settings)').all().map(row => row.name)).not.toContain('cost_defaults_json');
    expect(storage.getAttemptCapture(f.attemptId).configuration).not.toHaveProperty('costDefaults');
    expect(storage.getPreparation(storage.getAttemptCapture(f.attemptId).preparationId).view.overrides).not.toHaveProperty('costDefaults');
    expect(storage.getMeasurements(f.attemptId)).not.toHaveProperty('costLimit');
    expect(storage.getReview(deliveryId)?.state).toBe('approved');
    expect(history()).toEqual(before);
    expect(() => f.db.exec("UPDATE attempts SET capture_json='{}'")).toThrow('IMMUTABLE_RECORD');
    expect(() => f.db.exec("UPDATE preparation_revisions SET choices_json='{}'")).toThrow('IMMUTABLE_RECORD');
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
  });

  it('rolls back the delta when the retired column has an incompatible dependency', async () => {
    const f = await attemptFixture(); resources.push(f); await f.pipeline.close(); f.storage.close();
    removeInferenceLimitsSchema(f.db);
    f.db.exec('CREATE TRIGGER fixture_cost_dependency BEFORE UPDATE ON factory_settings BEGIN SELECT NEW.cost_defaults_json; END;');
    const before = f.db.prepare('SELECT * FROM factory_settings').get();
    expect(() => applyMigrations(f.db, loadMigrations(), () => { throw new Error('Must not reseed'); })).toThrowError(expect.objectContaining({ code: 'MIGRATION_FAILED' }));
    expect(f.db.pragma('user_version', { simple: true })).toBe(20);
    expect(f.db.prepare('SELECT * FROM factory_settings').get()).toEqual(before);
    expect(f.db.prepare('SELECT count(*) AS n FROM schema_migrations').get()).toEqual({ n: 20 });
  });

  it('refuses invalid historical configuration before changing the database', async () => {
    const f = await attemptFixture(); resources.push(f); await f.pipeline.close(); f.storage.close();
    removeInferenceLimitsSchema(f.db);
    f.db.exec(`UPDATE factory_settings SET cost_defaults_json='{"formatVersion":99}';`);
    f.db.close();
    const filename = join(f.directory, 'factory.sqlite'); const before = readFileSync(filename);
    expect(() => openStorage({ dataDirectory: f.directory })).toThrowError(expect.objectContaining({ code: 'SETTINGS_INVALID' }));
    expect(readFileSync(filename)).toEqual(before);
  });
});
