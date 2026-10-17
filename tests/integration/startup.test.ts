import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startController } from '../../apps/controller/src/main.js';
import * as http from '../../apps/controller/src/http/app.js';
import * as pipelines from '../../apps/controller/src/modules/pipeline/index.js';
import { createExecution, ExecutionError, type Execution } from '../../apps/controller/src/modules/execution/index.js';
import { acquireControllerLock, openStorage } from '../../apps/controller/src/modules/storage/index.js';

const directories: string[] = [];
const apps: Awaited<ReturnType<typeof startController>>[] = [];
const createApp = http.createApp;
function environment() {
  mkdirSync(resolve('.cache'), { recursive: true });
  const directory = mkdtempSync(resolve('.cache', 'startup espaço-'));
  directories.push(directory);
  vi.stubEnv('FACTORY_DATA_DIR', directory);
  vi.stubEnv('FACTORY_LOG_LEVEL', 'silent');
  vi.stubEnv('FACTORY_PORT', '4310');
  vi.stubEnv('FACTORY_BIND_HOST', '127.0.0.1');
  vi.stubEnv('FACTORY_BROWSER_ORIGIN', 'http://127.0.0.1:4310');
  return directory;
}
function factory(preflight: Execution['preflight']) {
  return vi.fn<typeof createExecution>(options => ({ ...createExecution(options), preflight }));
}
function localHttp(fail = false) {
  return vi.spyOn(http, 'createApp').mockImplementation((...args) => {
    const app = createApp(...args);
    vi.spyOn(app, 'listen').mockImplementation(async () => {
      if (fail) throw new Error('Synthetic bind failure');
      await app.ready();
      return 'http://127.0.0.1:4310';
    });
    return app;
  });
}
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

describe('production startup ordering', () => {
  it('rejects missing native context without HTTP or scheduler and releases the lock', async () => {
    const directory = environment();
    const worker = vi.spyOn(pipelines, 'createPipeline'); const server = vi.spyOn(http, 'createApp');
    await expect(startController()).rejects.toMatchObject({ code: 'CONTEXT_MISSING' });
    expect(worker).not.toHaveBeenCalled(); expect(server).not.toHaveBeenCalled();
    const lock = acquireControllerLock(directory); lock.close();
    const storage = openStorage({ dataDirectory: directory });
    expect(storage.getSettings().automationEnabled).toBe(false); storage.close();
  });
  it('holds the local lock while checking context, after migrations and before composition', async () => {
    const directory = environment();
    let finish!: (result: Awaited<ReturnType<Execution['preflight']>>) => void;
    const preflight = vi.fn<Execution['preflight']>(() => new Promise(resolve => { finish = resolve; }));
    const executionFactory = factory(preflight);
    const worker = vi.spyOn(pipelines, 'createPipeline'); const server = vi.spyOn(http, 'createApp');
    const starting = startController({}, { executionFactory });
    await vi.waitFor(() => expect(preflight).toHaveBeenCalledOnce());
    expect(() => acquireControllerLock(directory)).toThrow();
    const storage = openStorage({ dataDirectory: directory }); expect(storage.getDiagnostics().schemaVersion).toBeGreaterThan(0); storage.close();
    expect(worker).not.toHaveBeenCalled(); expect(server).not.toHaveBeenCalled();
    finish({ ready: false, code: 'CONTEXT_STALE', ompVersion: null });
    await expect(starting).rejects.toMatchObject({ code: 'CONTEXT_STALE' });
    const lock = acquireControllerLock(directory); lock.close();
  });
  it('rejects configuration before creating storage or checking native context', async () => {
    environment(); vi.stubEnv('FACTORY_BIND_HOST', '0.0.0.0');
    const executionFactory = factory(vi.fn());
    await expect(startController({}, { executionFactory })).rejects.toMatchObject({ code: 'CONFIGURATION_INVALID' });
    expect(executionFactory).not.toHaveBeenCalled();
  });
  it('revokes sessions and preserves installation and operation receipts across restart', async () => {
    const directory = environment(); localHttp();
    const preflight = vi.fn<Execution['preflight']>(async () => ({ ready: true, code: null, ompVersion: '18.11.1' }));
    const deps = { executionFactory: factory(preflight) };
    const first = await startController({}, deps); apps.push(first);
    const headers = { host: '127.0.0.1:4310', origin: 'http://127.0.0.1:4310', 'x-factory-client': 'web' };
    const session = await first.inject({ method: 'POST', url: '/api/v1/session', headers, payload: {} });
    expect(session.statusCode).toBe(200);
    const cookie = String(session.headers['set-cookie']).split(';')[0]!;
    const storage = openStorage({ dataDirectory: directory });
    const identity = storage.getSettings().installationId;
    const operationId = '11111111-1111-4111-8111-111111111111';
    const receipt = storage.saveTimeDefaults({ operationId, expectedRevision: storage.getSettingsETag(), timeDefaults: storage.getSettings().timeDefaults }).receipt;
    storage.close();
    await first.close(); apps.splice(apps.indexOf(first), 1);
    const second = await startController({}, deps); apps.push(second);
    expect((await second.inject({ url: '/api/v1/settings', headers: { host: headers.host, cookie } })).statusCode).toBe(401);
    const reopened = openStorage({ dataDirectory: directory });
    expect(reopened.getSettings().installationId).toBe(identity);
    expect(reopened.getOperation(operationId)?.receipt).toEqual(receipt); reopened.close();
    expect(preflight).toHaveBeenCalledTimes(2);
  });
  it('cleans up scheduler, signal listeners and lock after a bind failure', async () => {
    const directory = environment(); localHttp(true);
    const before = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')];
    const close = vi.fn(async () => {});
    const executionFactory = vi.fn<typeof createExecution>(options => ({ ...createExecution(options), close,
      preflight: async () => ({ ready: true, code: null, ompVersion: '18.11.1' }) }));
    await expect(startController({}, { executionFactory })).rejects.toThrow('Synthetic bind failure');
    expect(close).toHaveBeenCalledOnce();
    expect([process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]).toEqual(before);
    const lock = acquireControllerLock(directory); lock.close();
    expect(() => openStorage({ dataDirectory: join(directory, 'other') }).close()).not.toThrow();
  });
  it('retains the sanitized preflight diagnostic', async () => {
    environment();
    await expect(startController({}, { executionFactory: factory(async () => { throw new ExecutionError('CLI_UNAVAILABLE'); }) })).rejects.toMatchObject({ code: 'CLI_UNAVAILABLE' });
  });
});
