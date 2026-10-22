import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { HttpQueueObservation } from '#contracts';
import { toHttpQueueObservation } from '../../apps/controller/src/http/observation-views.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { createGitHub } from '../../apps/controller/src/modules/github/index.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { BackendMeasurement } from '../fixtures/backend-measurement.js';
import { observationOracle } from '../fixtures/observation-oracle.js';
import { observationScenarios, withObservationFixture } from '../fixtures/observation-baseline.js';
import type { ObservationWireControls } from '../fixtures/observation-wire.js';

const scenario = { ...observationScenarios[1]!, issuesPerProject: 3 };
const context = { purpose: 'display', trigger: 'mount', repetition: 1, phase: 'cold', consumerId: 'regression' } as const;
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

it.each([undefined, 'duplicate', 'cursor', 'denied', 'page_failure'] as const)(
  'preserves public pages, tokens and partial project isolation against legacy: %s', async fault => {
    const runs: unknown[] = [];
    for (const legacyValues of [true, false]) {
      const meter = new BackendMeasurement();
      runs.push(await withObservationFixture(scenario, async f => {
        const pages: unknown[] = []; const ids: string[] = [];
        let cursor: string | undefined;
        do {
          const response = await f.read(context, { limit: '2', ...(cursor ? { cursor } : {}) });
          const value = toHttpQueueObservation(response.observation);
          expect(Object.hasOwn(value, 'eligible_total')).toBe(true);
          expect(value.eligible_total).toBe(fault ? null : 6);
          expect(value.complete).toBe(!fault);
          expect(value.valid).toBe(true);
          const healthy = response.items.filter(item => item.projectId === f.projectIds[1]);
          expect(healthy).toHaveLength(3); expect(healthy.every(item => item.eligible)).toBe(true);
          if (fault) expect(value.diagnostics.length).toBeGreaterThan(0);
          pages.push(observationOracle(value, f.projectIds));
          ids.push(...value.page.items.map(item => item.item_id));
          cursor = value.page.next_cursor ?? undefined;
          if (fault) {
            if (cursor && fault !== 'denied') await expect(f.read(context, { limit: '2', cursor })).rejects.toMatchObject({ code: 'QUEUE_CHANGED' });
            break;
          }
        } while (cursor);
        expect(new Set(ids).size).toBe(ids.length);
        if (!fault) {
          const first = await f.read(context, { limit: '2' });
          const warm = await f.read(context, { limit: '2' });
          expect(warm.etag).toBe(first.etag);
          expect(warm.observation.summaryHash).toBe(first.observation.summaryHash);
          const settings = f.storage.getGlobalConfiguration();
          const changes = { time_defaults: { ...settings.view.settings.time_defaults, polling_interval_ms: 16_000 } };
          f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: settings.etag, changes, body: { changes } });
          await expect(f.read(context, { limit: '2', cursor: first.observation.page.next_cursor! })).rejects.toMatchObject({ code: 'QUEUE_CHANGED' });
          const next = await f.read(context, { limit: '2' });
          expect(next.etag).not.toBe(first.etag);
          expect(next.observation.page.items.map(item => item.itemId)).toEqual(first.observation.page.items.map(item => item.itemId));
        }
        return pages;
      }, { meter, wire: true, controls: { legacyValues, ...(fault ? { fault } : {}), faultProjectId: 'PVT_synthetic_0' } }));
    }
    expect(runs[1]).toEqual(runs[0]);
  },
);

it.each(['identity', 'catalog', 'configuration'] as const)('invalidates grouped reads when %s changes during IO', async change => {
  const meter = new BackendMeasurement(); let mutate = () => {}; let changed = false;
  await withObservationFixture(scenario, async f => {
    mutate = () => {
      if (change === 'identity') f.changeAccount();
      else if (change === 'catalog') f.storage.registerProject({ operationId: randomUUID(), expectedRevision: undefined,
        body: { name: 'Added while reading', source: { kind: 'local', location: f.directory }, base_branch: 'main' },
        source: { kind: 'local', location: f.directory }, originNotes: [] });
      else {
        const current = f.storage.getGlobalConfiguration(); const changes = { automation_enabled: true };
        f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: current.etag, changes, body: { changes } });
      }
    };
    const result = await f.read(context);
    expect(changed).toBe(true); expect(result.observation.valid).toBe(false);
    expect(result.items.every(item => !item.eligible)).toBe(true);
    expect(result.observation.diagnostics.length).toBeGreaterThan(0);
  }, { meter, wire: true, controls: { afterSend: async operation => {
    if (operation === 'GroupedValues' && !changed) { changed = true; mutate(); }
  } } });
});

it('recovers a rejected grouped read and keeps an older completion out of the newer cache', async () => {
  const meter = new BackendMeasurement(); const reached = gate(); const release = gate();
  let fail = true; let block = false; let blocked = false;
  await withObservationFixture(scenario, async f => {
    const partial = await f.read(context);
    expect(partial.observation.complete).toBe(false);
    f.advance(120_000);
    const recovered = await f.read(context);
    expect(recovered.observation.complete).toBe(true);
    f.advance(11_000); block = true;
    const old = f.read(context);
    try {
      await reached.promise;
      const current = f.storage.getGlobalConfiguration();
      const changes = { time_defaults: { ...current.view.settings.time_defaults, polling_interval_ms: 16_000 } };
      f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: current.etag, changes, body: { changes } });
      const newer = await f.read(context);
      expect(newer.observation.valid).toBe(true);
      release.resolve(); expect((await old).observation.valid).toBe(false);
      const sends = meter.spans.filter(span => span.layer === 'graphql').length;
      expect((await f.read(context)).etag).toBe(newer.etag);
      expect(meter.spans.filter(span => span.layer === 'graphql')).toHaveLength(sends);
    } finally { release.resolve(); await old; }
  }, { meter, wire: true, controls: { afterSend: async operation => {
    if (operation !== 'GroupedValues') return;
    if (fail) { fail = false; throw new Error('CONTROLLED_REJECTION'); }
    if (block && !blocked) { blocked = true; reached.resolve(); await release.promise; }
  } } });
});

it('requires session and CSRF with a warmed or shared grouped queue cache', async () => {
  const meter = new BackendMeasurement(); const reached = gate(); const release = gate(); let block = false; let blocked = false;
  let physicalSends = 0;
  const controls: ObservationWireControls = { afterSend: async operation => {
    physicalSends++;
    if (block && !blocked && operation === 'GroupedValues') { blocked = true; reached.resolve(); await release.promise; }
  } };
  await withObservationFixture(scenario, async f => {
    const github = { ...createGitHub(), ...f.github };
    const configuration = loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_PORT: '4310', FACTORY_LOG_LEVEL: 'silent' }, f.directory);
    const app = createApp(configuration,
      f.storage, undefined, { github, workspaces: f.workspaces }, undefined, f.pipeline);
    const base = { host: '127.0.0.1:4310', origin: 'http://127.0.0.1:4310', 'content-type': 'application/json', 'x-factory-client': 'web' };
    async function session(target = app) {
      const response = await target.inject({ method: 'POST', url: '/api/v1/session', headers: base, payload: {} });
      expect(response.statusCode).toBe(200);
      return { ...base, cookie: String(response.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': response.json<{ csrf_token: string }>().csrf_token };
    }
    try {
      const first = await session(); const second = await session();
      const read = (headers = first) => meter.observe('secured-http', 'display', () => app.inject({ url: '/api/v1/queue', headers }));
      const warm = await read(); expect(warm.statusCode).toBe(200);
      const body = warm.json<HttpQueueObservation>();
      const sends = physicalSends;
      expect(sends).toBeGreaterThan(0);
      expect((await read(second)).headers.etag).toBe(warm.headers.etag);
      expect((await read({ ...first, cookie: '' })).statusCode).toBe(401);
      const payload = { enabled: true, scope: body.scope, observation_id: body.observation_id, authorized_summary_hash: body.summary_hash };
      for (const headers of [{ ...first, cookie: '' }, { ...first, 'x-csrf-token': '' }, { ...first, 'x-csrf-token': 'invalid' }, { ...first, 'x-csrf-token': second['x-csrf-token'] }]) {
        const response = await meter.observe('secured-http', 'authorization', () => app.inject({ method: 'PUT', url: '/api/v1/queue', headers: { ...headers, 'if-match': warm.headers.etag!, 'idempotency-key': randomUUID() }, payload }));
        expect(response.statusCode).toBe(headers.cookie ? 403 : 401);
      }
      expect(physicalSends).toBe(sends);
      f.advance(11_000); block = true;
      const pending = read(); await reached.promise;
      const shared = read(second);
      expect((await read({ ...first, cookie: 'invalid' })).statusCode).toBe(401);
      release.resolve(); const results = await Promise.all([pending, shared]);
      expect(results.map(response => response.statusCode)).toEqual([200, 200]);
      expect(results[0]!.body).toBe(results[1]!.body);
      expect(physicalSends).toBe(sends * 2);
      const enable = await meter.observe('secured-http', 'authorization', () => app.inject({ method: 'PUT', url: '/api/v1/queue',
        headers: { ...first, 'if-match': results[0]!.headers.etag!, 'idempotency-key': randomUUID() }, payload }));
      expect(enable.statusCode).toBe(200);
      expect(physicalSends).toBeGreaterThan(sends * 2);
      expect(f.storage.listAttempts({}).items).toHaveLength(0);
      const installationId = f.storage.getSettings().installation_id;
      await app.close();
      const reopened = openStorage({ dataDirectory: f.directory });
      const restarted = createApp(configuration, reopened, undefined, { github, workspaces: f.workspaces }, undefined, f.pipeline);
      try {
        const before = physicalSends;
        expect((await restarted.inject({ url: '/api/v1/queue', headers: first })).statusCode).toBe(401);
        const fresh = await session(restarted);
        const afterRestart = await meter.observe('restarted-http', 'display', () => restarted.inject({ url: '/api/v1/queue', headers: fresh }));
        expect(afterRestart.statusCode).toBe(200);
        expect(afterRestart.json<HttpQueueObservation>().complete).toBe(true);
        expect(physicalSends).toBeGreaterThan(before);
        const staleCsrf = await restarted.inject({ method: 'PUT', url: '/api/v1/queue', headers: { ...fresh, 'x-csrf-token': first['x-csrf-token'],
          'if-match': afterRestart.headers.etag!, 'idempotency-key': randomUUID() }, payload });
        expect(staleCsrf.statusCode).toBe(403);
        expect(reopened.getSettings().installation_id).toBe(installationId);
        expect(reopened.listAttempts({}).items).toHaveLength(0);
        expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();
      } finally { await restarted.close(); }
    } finally { release.resolve(); await app.close(); }
  }, { meter, wire: true, controls });
});
