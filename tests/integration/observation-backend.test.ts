import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { expect, it } from 'vitest';
import type { HttpQueueObservation } from '#contracts';
import { installQueueRoutes } from '../../apps/controller/src/http/routes/queue.js';
import { createProjects } from '../../apps/controller/src/modules/projects/index.js';
import { collect, GraphQLReader, queryLimits, type CommandResponse } from '../../apps/controller/src/modules/github/transport.js';
import { toHttpQueueObservation } from '../../apps/controller/src/http/observation-views.js';
import { BackendMeasurement } from '../fixtures/backend-measurement.js';
import { observationScenarios, withObservationFixture } from '../fixtures/observation-baseline.js';
import { observationOracle } from '../fixtures/observation-oracle.js';

const context = { purpose: 'display', trigger: 'mount', repetition: 1, phase: 'cold', consumerId: 'queue' } as const;
const http = (data: unknown, status = 200): CommandResponse => ({ exitCode: 0,
  stdout: `HTTP/2.0 ${status} Response\r\ncontent-type: application/json\r\n\r\n${JSON.stringify({ data })}` });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

it('counts SQL execution including reused statements and exec, excluding setup and cleanup', () => {
  const meter = new BackendMeasurement();
  const restore = meter.installSql();
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE synthetic(value INTEGER)');
    const insert = db.prepare('INSERT INTO synthetic VALUES (?)');
    const select = db.prepare('SELECT value FROM synthetic');
    expect(meter.spans).toEqual([]);
    meter.observe('sql-proof', 'display', () => {
      insert.run(1); insert.run(2); select.get(); select.all(); db.exec('SELECT 1');
    });
    expect(meter.report().byOperation).toEqual([
      { key: 'sql:run', count: 2 }, { key: 'sql:get', count: 1 },
      { key: 'sql:all', count: 1 }, { key: 'sql:exec', count: 1 },
    ]);
    expect(meter.spans.every(span => !('sql' in span) && !('bindings' in span))).toBe(true);
  } finally { db.close(); restore(); }
});

for (const scenario of observationScenarios.slice(0, 2)) {
  it(`measures the real queue HTTP route and GraphQL client for ${scenario.id}`, async () => {
    const meter = new BackendMeasurement();
    const restore = meter.installSql();
    try {
      await withObservationFixture(scenario, async f => {
        const app = Fastify();
        const unexpected = async () => { throw new Error('UNEXERCISED_SETUP_OPERATION'); };
        const projects = createProjects({ storage: f.storage, github: { ...f.github,
          getProjectOwner: unexpected, listProjects: unexpected, validateProjectSelection: unexpected },
          workspaces: f.workspaces, directoryBase: f.directory });
        installQueueRoutes(app, { ...projects, getQueue: query => f.read(context, query) });
        await app.ready();
        try {
          expect(meter.spans).toEqual([]);
          const response = await meter.observe('http-cold', 'display', () => meter.measure('http', 'GET /api/v1/queue',
            () => app.inject({ url: '/api/v1/queue?limit=7' })));
          expect(response.statusCode).toBe(200);
          const body = response.json<HttpQueueObservation>();
          expect(body.complete).toBe(true);
          expect(body.eligible_total).toBe(20);
          expect(body.page.items).toHaveLength(7);
          const report = meter.report('http-cold');
          expect(report.byOperation).toContainEqual({ key: 'http:GET /api/v1/queue', count: 1 });
          expect(report.byOperation.some(item => item.key === 'sql:get' && item.count > 0)).toBe(true);
          expect(report.byOperation.find(item => item.key === 'logical:issue')?.count).toBe(20);
          expect(report.byOperation.find(item => item.key === 'graphql:page')!.count).toBeGreaterThan(20);
          expect(report.httpMs).toHaveLength(1);
          expect(report.dependencyWorkMs).toBeGreaterThan(0);
          expect(report.dependencyWindowMs).toBeLessThanOrEqual(report.httpMs[0]!);
          const physical = meter.spans.filter(span => span.layer === 'graphql').length;
          const warm = await meter.observe('http-warm', 'display', () => meter.measure('http', 'GET /api/v1/queue',
            () => app.inject({ url: '/api/v1/queue?limit=7' })));
          expect(warm.headers.etag).toBe(response.headers.etag);
          expect(warm.json<HttpQueueObservation>().summary_hash).toBe(body.summary_hash);
          expect(meter.spans.filter(span => span.layer === 'graphql')).toHaveLength(physical);
          await meter.observe('scheduler', 'scheduler', () => f.read({ ...context, purpose: 'scheduler' }));
          expect(meter.report('scheduler').byOperation.find(item => item.key === 'graphql:page')!.count).toBeGreaterThan(0);
          console.info('Synthetic backend measurement', JSON.stringify({ scenario: scenario.id,
            cold: report, warm: meter.report('http-warm'), scheduler: meter.report('scheduler') }));
        } finally { await app.close(); }
      }, { meter, wire: true });
    } finally { restore(); }
  });
}

it.each(['duplicate', 'cursor', 'denied', 'throttle', 'page_failure'] as const)(
  'retains incomplete public outcomes and actual sends for %s', async fault => {
    async function run() {
      const meter = new BackendMeasurement();
      return withObservationFixture(observationScenarios[1]!, async f => {
        const result = await meter.observe('fault', 'display', () => f.read(context));
        expect(result.observation.complete).toBe(false);
        expect(result.observation.eligibleTotal).toBeNull();
        expect(result.observation.diagnostics.length).toBeGreaterThan(0);
        expect(meter.report('fault').counts.failure).toBeGreaterThan(0);
        expect(meter.report('fault').byOperation.find(item => item.key === 'graphql:page')!.count).toBeGreaterThan(0);
        if (fault === 'duplicate' || fault === 'cursor') expect(result.observation.diagnostics.some(item => item.code === 'PAGINATION_INVALID')).toBe(true);
        if (fault === 'throttle') expect(result.observation.polling.retryAtMs).not.toBeNull();
        if (fault === 'denied') expect(result.observation.diagnostics.some(item => item.code === 'ACCESS_DENIED')).toBe(true);
        return observationOracle(toHttpQueueObservation(result.observation), f.projectIds);
      }, { meter, wire: true, controls: { fault } });
    }
    expect(await run()).toEqual(await run());
  },
);

it('does not count pre-send failure, missing context, throttled retry or exhausted query budget as sends', async () => {
  const meter = new BackendMeasurement();
  await meter.observe('gates', 'authorization', async () => {
    const missing = new GraphQLReader(undefined);
    expect((await missing.query('synthetic', {})).state).toBe('context_unavailable');
    const failed = new GraphQLReader(meter.runner(async () => { throw new Error('BEFORE_SEND'); }));
    await failed.query('synthetic', {});
    expect(meter.spans).toEqual([]);
    const budget = new GraphQLReader(meter.runner(async (_body, sent) => { sent?.(); return http({ synthetic: true }); })).scope();
    for (let count = 0; count < queryLimits.operationQueries; count++) await budget.query('synthetic', {});
    expect((await budget.query('synthetic', {})).diagnostics[0]?.code).toBe('QUERY_LIMIT');
    expect(meter.spans).toHaveLength(queryLimits.operationQueries);
    const throttled = new GraphQLReader(meter.runner(async (_body, sent) => { sent?.(); return http({}, 429); }), () => 1000);
    await throttled.query('synthetic', {}); await throttled.query('synthetic', {});
    expect(meter.spans).toHaveLength(queryLimits.operationQueries + 1);
  });
});

it('counts each actual page once when collect fails after returning earlier items', async () => {
  const meter = new BackendMeasurement();
  let page = 0;
  const reader = new GraphQLReader(meter.runner(async (_body, sent) => {
    sent?.(); page++;
    return page === 1 ? http({ connection: { nodes: [{ id: 'synthetic' }], pageInfo: { hasNextPage: true, endCursor: 'next' } } }) : http({}, 503);
  }));
  const result = await meter.observe('partial', 'scope', () => collect(reader, 'synthetic', {}, data => data.connection, node => node.id));
  expect(result).toMatchObject({ state: 'partial', data: ['synthetic'] });
  expect(meter.report().byOperation).toContainEqual({ key: 'graphql:page', count: 2 });
});

it('preserves sends consumed by the byte budget and blocks subsequent work before sending', async () => {
  const meter = new BackendMeasurement();
  const reader = new GraphQLReader(meter.runner(async (_body, sent) => {
    sent?.(); return { exitCode: 0, stdout: 'x'.repeat(queryLimits.operationBytes + 1) };
  })).scope();
  await meter.observe('bytes', 'scope', async () => {
    expect((await reader.query('synthetic', {})).diagnostics[0]?.code).toBe('QUERY_LIMIT');
    expect((await reader.query('synthetic', {})).diagnostics[0]?.code).toBe('QUERY_LIMIT');
  });
  expect(meter.spans).toHaveLength(1);
});

it.each([['TimeoutError', 'timeout'], ['AbortError', 'cancelled']] as const)(
  'classifies physical sends ending in %s without erasing their cost', async (name, completion) => {
    const meter = new BackendMeasurement();
    const reader = new GraphQLReader(meter.runner(async (_body, sent) => {
      sent?.(); throw Object.assign(new Error('synthetic'), { name });
    }));
    const result = await meter.observe('runner-error', 'scope', () => reader.query('synthetic', {}));
    expect(result.state).toBe('unavailable');
    expect(meter.spans).toHaveLength(1);
    expect(meter.spans[0]).toMatchObject({ layer: 'graphql', completion });
  },
);

it('keeps the two-worker display read and its drain attributable after a controlled HTTP consumer abort', async () => {
  const meter = new BackendMeasurement();
  const gate = deferred(); const reached = deferred();
  let blocked = 0;
  await withObservationFixture(observationScenarios[0]!, async f => {
    const aborter = new AbortController();
    const aborted = new Promise<never>((_resolve, reject) => {
      aborter.signal.addEventListener('abort', () => reject(Object.assign(new Error('synthetic abort'), { name: 'AbortError' })), { once: true });
    });
    const remote = meter.observe('queue-abort', 'display', () => f.read(context));
    const consumer = meter.observe('queue-abort', 'display', () => meter.measure('http', 'GET /api/v1/queue',
      () => Promise.race([remote, aborted])));
    try {
      await reached.promise;
      const before = meter.spans.filter(span => span.layer === 'graphql').map(span => span.id);
      aborter.abort(); meter.abort('queue-abort');
      await expect(consumer).rejects.toMatchObject({ name: 'AbortError' });
      expect(meter.spans.filter(span => span.layer === 'graphql' && span.completion === 'pending')).toHaveLength(2);
      gate.resolve();
      expect((await remote).observation.eligibleTotal).toBe(20);
      expect(meter.spans.filter(span => span.layer === 'graphql').map(span => span.id)).toEqual(expect.arrayContaining(before));
      expect(meter.report().counts.pending).toBe(0);
      expect(meter.report().drainedAfterAbort).toBe(2);
      expect(meter.report().sendsAfterAbort).toBeGreaterThan(0);
    } finally { gate.resolve(); await remote; }
  }, { meter, wire: true, controls: { afterSend: async operation => {
    if (operation === 'QueueIssue') { if (++blocked === 2) reached.resolve(); await gate.promise; }
  } } });
});

it('records pending, success, timeout, failure and cancellation separately and retains remote drain after web abort', async () => {
  let now = 0;
  const meter = new BackendMeasurement(() => now);
  const gate = deferred();
  const remote = meter.observe('aborted-web', 'display', () => meter.runner(async (_body, sent) => {
    sent?.(); await gate.promise; return http({ synthetic: true });
  })('synthetic'));
  now = 5;
  const httpWait = meter.observe('aborted-web', 'display', () => meter.measure('http', 'GET /api/v1/queue', async () => {
    throw Object.assign(new Error('synthetic'), { name: 'AbortError' });
  }));
  await expect(httpWait).rejects.toThrow();
  meter.abort('aborted-web');
  expect(meter.report().counts).toMatchObject({ pending: 1, cancelled: 1 });
  now = 15; gate.resolve(); await remote;
  for (const name of ['TimeoutError', 'Error']) {
    await expect(meter.observe('other', 'scope', () => meter.measure('logical', 'synthetic', async () => {
      throw Object.assign(new Error('synthetic'), { name });
    }))).rejects.toThrow();
  }
  expect(meter.report().counts).toEqual({ success: 1, failure: 1, timeout: 1, cancelled: 1, pending: 0 });
  expect(meter.report().drainedAfterAbort).toBe(1);
  expect(meter.report().dependencyWorkMs).toBe(15);
});

it('separates elapsed HTTP critical path from accumulated concurrent dependency work', async () => {
  let now = 0;
  const meter = new BackendMeasurement(() => now);
  const gate = deferred();
  const run = meter.runner(async (_body, sent) => { sent?.(); await gate.promise; return http({ synthetic: true }); });
  const journey = meter.observe('concurrent', 'display', () => meter.measure('http', 'GET /api/v1/queue',
    () => Promise.all([run('synthetic'), run('synthetic')])));
  expect(meter.report().peak).toBe(2);
  now = 10; gate.resolve(); await journey;
  expect(meter.report()).toMatchObject({ httpMs: [10], dependencyWorkMs: 20, dependencyWindowMs: 10, peak: 2 });
});

it('shares overlapping observations with three issue workers and three sends', async () => {
  const meter = new BackendMeasurement();
  const gate = deferred(); const reached = deferred();
  let blocked = 0;
  const task = withObservationFixture(observationScenarios[0]!, async f => {
    const first = meter.observe('first', 'authorization', () => f.read({ ...context, purpose: 'authorization' }));
    const second = meter.observe('second', 'scope', () => f.read({ ...context, purpose: 'scope' }));
    try {
      await reached.promise;
      expect(meter.report('first', 'logical', 'issue').peak).toBe(3);
      expect(meter.report('second', 'logical', 'issue').peak).toBe(0);
      expect(meter.report(undefined, 'logical', 'issue').peak).toBe(3);
      expect(meter.report().counts.pending).toBeGreaterThan(0);
    } finally { gate.resolve(); await Promise.all([first, second]); }
    expect(meter.report('second', 'logical', 'issue').peak).toBe(0);
    expect(meter.report(undefined, 'logical', 'issue').peak).toBe(3);
    expect(meter.report().counts.pending).toBe(0);
  }, { meter, wire: true, controls: { afterSend: async operation => {
    if (operation === 'QueueIssue') { blocked++; if (blocked === 3) reached.resolve(); await gate.promise; }
  } } });
  await task;
});

it('replays public page boundaries independently with stable tokens, invalidation and explicit errors', async () => {
  async function run() {
    const meter = new BackendMeasurement();
    return withObservationFixture(observationScenarios[0]!, async f => {
      const pages: unknown[] = [];
      let cursor: string | undefined;
      const ids: string[] = [];
      do {
        const result = await f.read(context, { limit: '7', ...(cursor ? { cursor } : {}) });
        const value = toHttpQueueObservation(result.observation);
        expect(value.observation_id).toEqual(expect.any(String));
        expect(value.summary_hash).toMatch(/^[a-f0-9]{64}$/);
        expect(value.event_cursor).toMatch(/^\d+$/);
        expect(value.observed_at_ms).toBeGreaterThan(0);
        expect(value.polling.next_poll_at_ms).toBeGreaterThanOrEqual(value.observed_at_ms!);
        expect(value.page.next_cursor === null).toBe(!value.page.has_more);
        pages.push(observationOracle(value, f.projectIds));
        ids.push(...value.page.items.map(item => item.issue_id!));
        cursor = value.page.next_cursor ?? undefined;
      } while (cursor);
      expect(ids).toHaveLength(20); expect(new Set(ids).size).toBe(20);
      const before = await f.read(context, { limit: '7' });
      const warm = await f.read(context, { limit: '7' });
      expect(warm.etag).toBe(before.etag);
      expect(warm.observation.summaryHash).toBe(before.observation.summaryHash);
      await expect(f.read(context, { cursor: 'invalid' })).rejects.toMatchObject({ code: 'QUEUE_CURSOR_INVALID' });
      const settings = f.storage.getGlobalConfiguration();
      const changes = { time_defaults: { ...settings.view.settings.time_defaults, polling_interval_ms: 16_000 } };
      f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: settings.etag, changes, body: { changes } });
      const reconfigured = await f.read(context, { limit: '7' });
      expect(reconfigured.etag).not.toBe(before.etag);
      expect(reconfigured.observation.summaryHash).not.toBe(before.observation.summaryHash);
      await expect(f.read(context, { limit: '7', cursor: before.observation.page.next_cursor! }))
        .rejects.toMatchObject({ code: 'QUEUE_CHANGED' });
      f.changeAccount();
      const changed = await f.read({ ...context, purpose: 'authorization' });
      expect(changed.observation.valid).toBe(false);
      expect(changed.observation.summaryHash).not.toBe(before.observation.summaryHash);
      return pages;
    }, { meter, wire: true });
  }
  expect(await run()).toEqual(await run());
});
