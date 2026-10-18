import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { OperationView, SettingsSaved, type SessionResponse } from '#contracts';
import { createApp } from '../../apps/controller/src/http/app.js';
import type { ControllerConfiguration } from '../../apps/controller/src/config.js';
import type { ProjectDependencies } from '../../apps/controller/src/modules/projects/index.js';
import { openStorage, type Storage } from '../../apps/controller/src/modules/storage/index.js';
import { attemptFixture, type AttemptFixture } from '../fixtures/attempt.js';

const directories: string[] = [];
const stores: Storage[] = [];
const attempts: AttemptFixture[] = [];
const apps: Array<ReturnType<typeof createApp>> = [];

function freshStorage(): Storage {
  const directory = mkdtempSync(join(tmpdir(), 'factory-account-binding-'));
  directories.push(directory);
  const storage = openStorage({ dataDirectory: directory });
  stores.push(storage);
  return storage;
}

function bindingBody(action: 'bind' | 'switch', accountId: string) {
  return { changes: {}, account_binding: { action, account_id: accountId } } as const;
}

function saveBinding(storage: Storage, action: 'bind' | 'switch', id: string, login: string, operationId = randomUUID()) {
  const before = storage.getGlobalConfiguration();
  const body = bindingBody(action, id);
  const operation = storage.saveSettings({ operationId, expectedRevision: before.etag, changes: {}, body, account: { id, login } });
  return { operation, operationId, body, expectedRevision: before.etag, previousAccountId: before.view.settings.account_id };
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const attempt of attempts.splice(0)) await attempt.close();
  for (const storage of stores.splice(0)) storage.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

function setupDependencies(directory: string, accountId: string, login: string, active = true, valid = true) {
  const github: ProjectDependencies['github'] = {
    getIdentity: async () => ({ state: 'complete', data: { id: accountId, login }, diagnostics: [], retryAtMs: null }),
    getProjectOwner: async () => { throw new Error('Unused by account binding.'); },
    listProjects: async () => { throw new Error('Unused by account binding.'); },
    getProject: async () => { throw new Error('Unused by account binding.'); },
    validateProjectSelection: async () => { throw new Error('Unused by account binding.'); },
    listProjectItems: async () => { throw new Error('Unused by account binding.'); },
    getIssueContextById: async () => { throw new Error('Unused by account binding.'); },
  };
  const githubSetup: NonNullable<ProjectDependencies['githubSetup']> = {
    resolveExecutable: async () => ({ state: 'observed', path: join(directory, 'gh.exe'), version: '2.1.0', diagnostics: [] }),
    validateExecutable: async () => ({ state: 'observed', path: join(directory, 'gh.exe'), version: '2.1.0', diagnostics: [] }),
    activateExecutable: () => undefined,
    getAuthenticationAccounts: async () => ({ state: 'observed', accounts: [{ login, active, valid }], diagnostics: [] }),
  };
  return { github, githubSetup };
}

function controllerConfiguration(dataDirectory: string): ControllerConfiguration {
  return { host: '127.0.0.1', port: 4310, browserOrigin: 'http://127.0.0.1:4310', dataDirectory, logLevel: 'silent' };
}

async function bootstrap(app: ReturnType<typeof createApp>) {
  const host = '127.0.0.1:4310';
  const origin = 'http://127.0.0.1:4310';
  const response = await app.inject({ method: 'POST', url: '/api/v1/session', headers: {
    host, origin, 'content-type': 'application/json', 'x-factory-client': 'web',
  }, payload: {} });
  const session = response.json<SessionResponse>();
  return { host, origin, cookie: String(response.headers['set-cookie']).split(';')[0]!, csrf: session.csrf_token };
}

describe('explicit GitHub account binding', () => {
  it('binds only an active eligible account through PUT settings and recovers the exact receipt after restart', async () => {
    const storage = freshStorage();
    const directory = directories.at(-1)!;
    const accountId = 'ACCOUNT_bound';
    const login = 'bound-user';
    const dependencies = setupDependencies(directory, accountId, login);
    let app = createApp(controllerConfiguration(directory), storage, undefined, dependencies);
    apps.push(app);
    const session = await bootstrap(app);
    const before = storage.getGlobalConfiguration();
    const operationId = randomUUID();
    const body = bindingBody('bind', accountId);
    const headers = { host: session.host, origin: session.origin, cookie: session.cookie, 'x-csrf-token': session.csrf,
      'content-type': 'application/json', 'if-match': before.etag, 'idempotency-key': operationId };

    const response = await app.inject({ method: 'PUT', url: '/api/v1/settings', headers, payload: body });
    expect(response.statusCode, response.body).toBe(200);
    expect(Value.Check(SettingsSaved, response.json())).toBe(true);
    const saved = response.json<SettingsSaved>();
    expect(saved).toMatchObject({ operation_id: operationId, settings: { account_id: accountId, automation_enabled: false } });
    expect(saved.receipt.event_cursor).toBeDefined();
    const acceptedRevision = storage.getSettings().revision;
    const acceptedEtag = response.headers.etag;
    expect(acceptedEtag).not.toBe(before.etag);
    const operation = storage.getOperation(operationId);
    expect(operation).toMatchObject({ kind: 'settings.account.bind', resource: { type: 'settings', id: 'local' }, state: 'succeeded', receipt: saved.receipt });
    expect(storage.getLinkedGitHubAccount()).toEqual({ id: accountId, login });

    const oldApp = app;
    apps.splice(apps.indexOf(oldApp), 1);
    await oldApp.close();
    storage.close();
    const reopened = openStorage({ dataDirectory: directory });
    stores.push(reopened);
    const unavailableAfterRestart = setupDependencies(directory, accountId, login);
    unavailableAfterRestart.githubSetup.resolveExecutable = async () => { throw new Error('Receipt recovery must precede external IO.'); };
    unavailableAfterRestart.githubSetup.getAuthenticationAccounts = async () => { throw new Error('Receipt recovery must precede external IO.'); };
    unavailableAfterRestart.github.getIdentity = async () => { throw new Error('Receipt recovery must precede external IO.'); };
    app = createApp(controllerConfiguration(directory), reopened, undefined, unavailableAfterRestart);
    apps.push(app);
    const retrySession = await bootstrap(app);
    const replay = await app.inject({ method: 'PUT', url: '/api/v1/settings', headers: {
      host: retrySession.host, origin: retrySession.origin, cookie: retrySession.cookie, 'x-csrf-token': retrySession.csrf,
      'content-type': 'application/json', 'if-match': before.etag, 'idempotency-key': operationId,
    }, payload: body });
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json<SettingsSaved>().receipt).toEqual(saved.receipt);
    expect(replay.headers.etag).toBe(acceptedEtag);
    expect(reopened.getSettings().revision).toBe(acceptedRevision);
    expect(reopened.getOperation(operationId)).toEqual(operation);
    const receiptRead = await app.inject({ url: `/api/v1/operations/${operationId}`, headers: { host: retrySession.host, cookie: retrySession.cookie } });
    expect(receiptRead.statusCode, receiptRead.body).toBe(200);
    expect(Value.Check(OperationView, receiptRead.json())).toBe(true);
    expect(receiptRead.json<OperationView>().receipt).toEqual(saved.receipt);
  });

  it('does not bind an inactive or invalid account and does not run other settings commands with account_binding', async () => {
    const storage = freshStorage();
    const directory = directories.at(-1)!;
    const dependencies = setupDependencies(directory, 'ACCOUNT_ineligible', 'inactive-user', false, true);
    const app = createApp(controllerConfiguration(directory), storage, undefined, dependencies);
    apps.push(app);
    const session = await bootstrap(app);
    const current = storage.getGlobalConfiguration();
    const baseHeaders = { host: session.host, origin: session.origin, cookie: session.cookie, 'x-csrf-token': session.csrf,
      'content-type': 'application/json', 'if-match': current.etag };

    const inactive = await app.inject({ method: 'PUT', url: '/api/v1/settings', headers: {
      ...baseHeaders, 'idempotency-key': randomUUID(),
    }, payload: bindingBody('bind', 'ACCOUNT_ineligible') });
    expect(inactive.statusCode).toBe(409);
    expect(storage.getSettings().account_id).toBeNull();

    const combined = await app.inject({ method: 'PUT', url: '/api/v1/settings', headers: {
      ...baseHeaders, 'idempotency-key': randomUUID(),
    }, payload: { changes: { automation_enabled: true }, account_binding: { action: 'bind', account_id: 'ACCOUNT_ineligible' } } });
    expect(combined.statusCode).toBe(400);
    expect(storage.getSettings().account_id).toBeNull();
    expect(storage.getSettings().automation_enabled).toBe(false);
  });

  it('commits only the account, revision, operation receipt and event, then recovers after reopen in the destination scope', () => {
    const storage = freshStorage();
    const directory = directories.at(-1)!;
    const unbound = storage.getGlobalConfiguration();
    const originOperationId = randomUUID();
    storage.saveSettings({ operationId: originOperationId, expectedRevision: unbound.etag,
      changes: { projects_root: directory }, body: { changes: { projects_root: directory } } });
    const before = storage.getGlobalConfiguration();
    const saved = saveBinding(storage, 'bind', 'ACCOUNT_initial', 'initial-user');

    expect(storage.getSettings()).toMatchObject({
      account_id: 'ACCOUNT_initial', automation_enabled: false, projects_root: directory,
      revision: before.view.settings.revision + 1,
    });
    expect(storage.getLinkedGitHubAccount()).toEqual({ id: 'ACCOUNT_initial', login: 'initial-user' });
    expect(saved.operation).toMatchObject({
      kind: 'settings.account.bind', resource: { type: 'settings', id: 'local' }, state: 'succeeded',
      receipt: { revision: before.view.settings.revision + 1, event_cursor: '2' },
    });
    expect(storage.getOperation(saved.operationId)).toEqual(saved.operation);
    expect(storage.getOperation(originOperationId)).toBeNull();
    expect(() => storage.recoverConfigurationCommand({ operationId: originOperationId, expectedRevision: unbound.etag,
      kind: 'settings.update', body: { changes: { projects_root: directory } } })).toThrowError(expect.objectContaining({ statusCode: 409 }));

    storage.close();
    const reopened = openStorage({ dataDirectory: directory });
    stores.push(reopened);
    expect(reopened.recoverConfigurationCommand({
      operationId: saved.operationId, expectedRevision: before.etag, kind: 'settings.account.bind', body: saved.body,
    })).toEqual(saved.operation);

    const switched = saveBinding(reopened, 'switch', 'ACCOUNT_second', 'second-user');
    expect(switched.operation.kind).toBe('settings.account.switch');
    expect(reopened.getSettings().account_id).toBe('ACCOUNT_second');
    expect(reopened.recoverConfigurationCommand({
      operationId: switched.operationId, expectedRevision: switched.expectedRevision,
      kind: 'settings.account.switch', body: switched.body,
    })).toEqual(switched.operation);
    expect(reopened.getOperation(saved.operationId)).toBeNull();
    expect(reopened.hasUncertainAccountCleanup(switched.operationId)).toBe(false);

    const third = saveBinding(reopened, 'switch', 'ACCOUNT_third', 'third-user');
    expect(third.operation.kind).toBe('settings.account.switch');
    expect(reopened.getOperation(switched.operationId)).toBeNull();
    expect(() => reopened.recoverConfigurationCommand({
      operationId: switched.operationId, expectedRevision: switched.expectedRevision,
      kind: 'settings.account.switch', body: switched.body,
    })).toThrowError(expect.objectContaining({ statusCode: 409 }));
  });

  it('rejects bind/switch shape and origin violations without changing settings', () => {
    const storage = freshStorage();
    const initial = storage.getGlobalConfiguration();
    expect(() => storage.saveSettings({ operationId: randomUUID(), expectedRevision: initial.etag,
      changes: {}, body: { changes: {}, account_binding: { action: 'switch', account_id: 'ACCOUNT_next' } },
      account: { id: 'ACCOUNT_next', login: 'next-user' } })).toThrowError(expect.objectContaining({ code: 'ACCOUNT_NOT_BOUND' }));

    saveBinding(storage, 'bind', 'ACCOUNT_initial', 'initial-user');
    const current = storage.getGlobalConfiguration();
    expect(() => storage.saveSettings({ operationId: randomUUID(), expectedRevision: current.etag,
      changes: {}, body: { changes: {}, account_binding: { action: 'bind', account_id: 'ACCOUNT_next' } },
      account: { id: 'ACCOUNT_next', login: 'next-user' } })).toThrowError(expect.objectContaining({ code: 'ACCOUNT_ALREADY_BOUND' }));
    expect(() => storage.saveSettings({ operationId: randomUUID(), expectedRevision: current.etag,
      changes: {}, body: { changes: {}, account_binding: { action: 'switch', account_id: 'ACCOUNT_initial' } },
      account: { id: 'ACCOUNT_initial', login: 'initial-user' } })).toThrowError(expect.objectContaining({ code: 'ACCOUNT_UNCHANGED' }));
    expect(() => storage.saveSettings({ operationId: randomUUID(), expectedRevision: current.etag,
      changes: { automation_enabled: true }, body: { changes: { automation_enabled: true }, account_binding: { action: 'switch', account_id: 'ACCOUNT_next' } },
      account: { id: 'ACCOUNT_next', login: 'next-user' } })).toThrowError(expect.objectContaining({ code: 'SETTINGS_COMMAND_INVALID' }));
    expect(storage.getSettings().account_id).toBe('ACCOUNT_initial');
    expect(storage.getSettings().automation_enabled).toBe(false);
  });

  it('serializes switch with a concurrent start and refuses a switch while any result is null', async () => {
    const fixture = await attemptFixture();
    attempts.push(fixture);
    const command = await fixture.prepare();
    const switchAccount = () => fixture.storage.saveSettings({
      operationId: randomUUID(), expectedRevision: fixture.storage.getGlobalConfiguration().etag,
      changes: {}, body: bindingBody('switch', 'ACCOUNT_next'), account: { id: 'ACCOUNT_next', login: 'next-user' },
    });
    const results = await Promise.allSettled([
      fixture.pipeline.startAttempt(command.body, command.context),
      Promise.resolve().then(switchAccount),
    ]);
    const startSucceeded = results[0]?.status === 'fulfilled';
    const switchSucceeded = results[1]?.status === 'fulfilled';
    expect(startSucceeded && switchSucceeded).toBe(false);
    if (startSucceeded) {
      await fixture.pipeline.drain();
      const attemptsForSource = fixture.db.prepare("SELECT count(*) AS count FROM attempts WHERE account_id='ACCOUNT_test' AND result IS NULL").get();
      expect(attemptsForSource).toEqual({ count: 1 });
      expect(fixture.storage.getSettings().account_id).toBe('ACCOUNT_test');
      await expect(switchAccount()).rejects.toMatchObject({ code: 'ACCOUNT_SWITCH_ATTEMPT_ACTIVE' });
    } else {
      expect(results[1]?.status).toBe('fulfilled');
      expect(fixture.storage.getSettings().account_id).toBe('ACCOUNT_next');
      expect(fixture.db.prepare('SELECT count(*) AS count FROM attempts WHERE result IS NULL').get()).toEqual({ count: 0 });
    }
  });

  it('blocks a start under active/linked account divergence without changing the link or dispatch pause on revalidation', async () => {
    const fixture = await attemptFixture();
    attempts.push(fixture);
    const linked = fixture.storage.getSettings();
    fixture.storage.recordControllerAccount(linked.revision, 'ACCOUNT_observed_elsewhere');
    const command = await fixture.prepare();

    await fixture.preparations.revalidateSummary(command.body);
    expect(fixture.storage.getSettings().account_id).toBe('ACCOUNT_test');
    expect(fixture.db.prepare("SELECT dispatch_paused FROM controller_authority WHERE id='local'").get()).toEqual({ dispatch_paused: 1 });
    await expect(fixture.pipeline.startAttempt(command.body, command.context)).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
    expect(fixture.storage.getSettings().account_id).toBe('ACCOUNT_test');
    expect(fixture.db.prepare("SELECT dispatch_paused FROM controller_authority WHERE id='local'").get()).toEqual({ dispatch_paused: 1 });
    expect(fixture.db.prepare('SELECT count(*) AS count FROM attempts').get()).toEqual({ count: 0 });
  });

  it('allows switching after completion despite uncertain cleanup and exposes only an informational warning fact', async () => {
    const fixture = await attemptFixture();
    attempts.push(fixture);
    const command = await fixture.prepare();
    const operation = await fixture.pipeline.startAttempt(command.body, command.context);
    await fixture.pipeline.drain();
    await fixture.pipeline.cancelAttempt(operation.resource.id, {}, { operationId: randomUUID(), expectedRevision: undefined });
    await fixture.pipeline.drain();
    fixture.db.prepare("UPDATE resources SET stop_state='uncertain' WHERE attempt_id=? AND kind='terminal'").run(operation.resource.id);
    expect(fixture.storage.getAttempt(operation.resource.id).result).not.toBeNull();

    const dependencies = setupDependencies(fixture.directory, 'ACCOUNT_next', 'next-user');
    const app = createApp(controllerConfiguration(fixture.directory), fixture.storage, undefined, dependencies, undefined, fixture.pipeline);
    apps.push(app);
    const session = await bootstrap(app);
    const current = fixture.storage.getGlobalConfiguration();
    const operationId = randomUUID();
    const response = await app.inject({ method: 'PUT', url: '/api/v1/settings', headers: {
      host: session.host, origin: session.origin, cookie: session.cookie, 'x-csrf-token': session.csrf,
      'content-type': 'application/json', 'if-match': current.etag, 'idempotency-key': operationId,
    }, payload: bindingBody('switch', 'ACCOUNT_next') });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<SettingsSaved>().warnings).toEqual([expect.objectContaining({ code: 'PRIOR_ACCOUNT_CLEANUP_UNCERTAIN' })]);
    const operationRead = await app.inject({ url: `/api/v1/operations/${operationId}`, headers: { host: session.host, cookie: session.cookie } });
    expect(operationRead.statusCode, operationRead.body).toBe(200);
    expect(operationRead.json<OperationView>().warnings).toEqual(response.json<SettingsSaved>().warnings);
    expect(fixture.storage.getSettings().account_id).toBe('ACCOUNT_next');
    expect(() => fixture.storage.getAttempt(operation.resource.id)).toThrow();
  });
});
