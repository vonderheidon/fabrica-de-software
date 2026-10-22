import Database from 'better-sqlite3';
import Fastify from 'fastify';
import { Value } from '@sinclair/typebox/value';
import { HttpQueueObservation } from '#contracts';
import { installQueueRoutes } from '../../apps/controller/src/http/routes/queue.js';
import type { Projects } from '../../apps/controller/src/modules/projects/index.js';
import { describe, expect, it } from 'vitest';
import { GraphQLReader, GitHubRunnerError, collect, queryLimits, type CommandResponse } from '../../apps/controller/src/modules/github/transport.js';
import { BackendMeasurement } from '../fixtures/backend-measurement.js';
import { observationFixture, observationScenarios, withObservationFixture } from '../fixtures/observation-baseline.js';

const wire = (data: unknown, status = 200): CommandResponse => ({ exitCode: 0,
  stdout: `HTTP/2.0 ${status} Response\r\ncontent-type: application/json\r\n\r\n${JSON.stringify({ data })}` });
const page = (ids: string[], cursor: string | null) => ({ connection: { nodes: ids.map(id => ({ id })),
  pageInfo: { hasNextPage: cursor !== null, endCursor: cursor } } });
const context = { purpose: 'scheduler', trigger: 'timer', repetition: 1, phase: 'cold', consumerId: 'backend' } as const;

describe('backend observation measurement', () => {
  it('counts executions of reused SQLite statements and excludes setup', () => {
    const meter = new BackendMeasurement(); const restore = meter.installSql();
    const db = new Database(':memory:');
    try {
      db.exec('CREATE TABLE sample(id INTEGER UNIQUE)');
      const insert = db.prepare('INSERT INTO sample VALUES (?)');
      const read = db.prepare('SELECT * FROM sample');
      expect(meter.spans).toEqual([]);
      meter.observe('sql', 'display', () => {
        insert.run(1); insert.run(2); read.all(); read.get();
        expect(() => insert.run(1)).toThrow();
        db.exec('DELETE FROM sample');
        expect(() => db.prepare('INSERT INTO missing VALUES (1)').run()).toThrow();
      });
      expect(meter.spans.map(s => s.operation)).toEqual(['run', 'run', 'all', 'get', 'run', 'exec']);
      expect(meter.report().counts.failure).toBe(1);
      expect(JSON.stringify(meter.spans)).not.toContain('sample');
    } finally { db.close(); restore(); }
  });

  it.each([
    { name: 'additional-pages', pages: [wire(page(['a'], 'next')), wire(page(['b'], null))], state: 'complete', sends: 2 },
    { name: 'repeated-id', pages: [wire(page(['a'], 'next')), wire(page(['a'], null))], state: 'partial', sends: 2 },
    { name: 'inconsistent-cursor', pages: [wire(page(['a'], 'same')), wire(page(['b'], 'same'))], state: 'partial', sends: 2 },
    { name: 'denied', pages: [wire({}, 403)], state: 'inaccessible', sends: 1 },
    { name: 'pagination-failure', pages: [wire(page(['a'], 'next')), wire({}, 500)], state: 'partial', sends: 2 },
  ])('counts actual runner invocations for $name', async scenario => {
    const meter = new BackendMeasurement(); const responses = [...scenario.pages];
    const reader = new GraphQLReader(async () => meter.measure('graphql', 'page', async () => {
      const response = responses.shift(); if (!response) throw new Error('UNEXPECTED_SEND'); return response;
    }));
    const result = await meter.observe(scenario.name, 'display', () => meter.measure('logical', 'collect', () =>
      collect(reader.scope(), 'synthetic', {}, data => data.connection, node => node.id, node => String(node.id))));
    expect(result.state).toBe(scenario.state);
    expect(meter.spans.filter(s => s.layer === 'graphql')).toHaveLength(scenario.sends);
  });

  it('does not count sends blocked by context, shared throttle or operation budget', async () => {
    const meter = new BackendMeasurement();
    await meter.observe('limits', 'authorization', async () => {
      const unavailable = new GraphQLReader(undefined);
      expect((await unavailable.query('synthetic', {})).state).toBe('context_unavailable');
      const throttled = new GraphQLReader(async () => meter.measure('graphql', 'page', async () => wire({}, 429)), () => 1000);
      await throttled.scope().query('synthetic', {}); await throttled.scope().query('synthetic', {});
      const budget = new GraphQLReader(async () => meter.measure('graphql', 'page', async () => wire({ ok: true }))).scope();
      for (let i = 0; i < queryLimits.operationQueries; i++) await budget.query('synthetic', {});
      expect((await budget.query('synthetic', {})).diagnostics.map(d => d.code)).toContain('QUERY_LIMIT');
    });
    expect(meter.spans.filter(s => s.layer === 'graphql')).toHaveLength(1 + queryLimits.operationQueries);
  });

  it('starts the physical counter only when the runner confirms send, including late completion', async () => {
    const meter = new BackendMeasurement();
    await meter.observe('native-seam', 'authorization', async () => {
      const blocked = new GraphQLReader(meter.runner(async () => { throw new GitHubRunnerError('CONTEXT_UNAVAILABLE'); }));
      expect((await blocked.query('synthetic', {})).state).toBe('context_unavailable');
      expect(meter.spans).toHaveLength(0);
      const sent = new GraphQLReader(meter.runner(async (_input, onSend) => {
        onSend?.(); meter.abort('native-seam'); await Promise.resolve(); return wire({ ok: true });
      }));
      expect((await sent.query('synthetic', {})).state).toBe('complete');
      expect(meter.spans).toHaveLength(1);
      expect(meter.report().drainedAfterAbort).toBe(1);
    });
  });

  it('separates overlapping dependency work, HTTP duration, pending and drain after web abort', async () => {
    let now = 0; const meter = new BackendMeasurement(() => now);
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const work = (id: string) => meter.observe(id, 'display', () => meter.measure('http', 'GET /api/v1/queue', () =>
      meter.measure('graphql', 'page', () => gate)));
    const first = work('first'); const second = work('second');
    expect(meter.report().peak).toBe(2);
    expect(meter.report().counts.pending).toBe(4);
    meter.abort('first'); now = 10; release!(); await Promise.all([first, second]);
    expect(meter.report()).toMatchObject({ dependencyWorkMs: 20, dependencyWindowMs: 10, httpMs: [10, 10], drainedAfterAbort: 1 });
    expect(meter.report('first').drainedAfterAbort).toBe(1);
    expect(meter.report('second').drainedAfterAbort).toBe(0);
    await meter.observe('outcomes', 'scope', async () => {
      for (const name of ['TimeoutError', 'AbortError', 'Error']) {
        await expect(meter.measure('logical', 'read', async () => { const error = new Error('synthetic'); error.name = name; throw error; })).rejects.toThrow();
      }
    });
    expect(meter.report('outcomes').counts).toMatchObject({ timeout: 1, cancelled: 1, failure: 1 });
  });

  it('measures real storage during the queue journey with setup excluded', async () => {
    await withObservationFixture(observationScenarios[1]!, async fixture => {
      const meter = new BackendMeasurement(); const restore = meter.installSql();
      try {
        await meter.observe('queue', 'scheduler', () => meter.measure('logical', 'queue.observe', () => fixture.read(context)));
        expect(meter.spans.filter(s => s.layer === 'sql').length).toBeGreaterThan(20);
        expect(meter.spans.some(s => s.operation === 'get')).toBe(true);
        expect(meter.spans.some(s => s.operation === 'all')).toBe(true);
      } finally { restore(); }
    });
  });

  it('preserves three issue workers per observation and records aggregate overlap', async () => {
    const meter = new BackendMeasurement();
    const fixture = await observationFixture(observationScenarios[1]!, meter, true);
    try {
      await Promise.all(['one', 'two'].map(id => meter.observe(id, 'scheduler', () => fixture.read({ ...context, consumerId: id }))));
      expect(meter.report('one', 'logical', 'issue').peak).toBe(3);
      expect(meter.report('two', 'logical', 'issue').peak).toBe(3);
      expect(meter.report(undefined, 'logical', 'issue').peak).toBe(6);
    } finally { await fixture.close(); }
  });

  it('runs the installed HTTP route and public page oracle in independent databases', async () => {
    async function run() {
      const meter = new BackendMeasurement();
      return withObservationFixture(observationScenarios[1]!, async fixture => {
        const restore = meter.installSql();
        const app = Fastify();
        // Only the route's Projects port is substituted; queue, DTO serializer and SQL are real.
        const projects = new Proxy({} as Projects, { get(_target, property) {
          if (property === 'getQueue') return (query: Parameters<Projects['getQueue']>[0]) =>
            meter.measure('logical', 'queue.observe', () => fixture.read(context, query));
          throw new Error('UNEXPECTED_PROJECTS_PORT');
        } });
        installQueueRoutes(app, projects);
        const pages: unknown[] = []; let cursor: string | null = null;
        let etag: string | undefined; let hash: string | null = null;
        try {
          do {
            const response = await meter.observe('http', 'display', () => meter.measure('http', 'GET /api/v1/queue', () =>
              app.inject({ method: 'GET', url: `/api/v1/queue?limit=7${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}` })));
            expect(response.statusCode).toBe(200);
            const body: unknown = response.json();
            expect(Value.Check(HttpQueueObservation, body)).toBe(true);
            if (!Value.Check(HttpQueueObservation, body)) throw new Error('INVALID_PUBLIC_ORACLE');
            expect(body.observation_id).toMatch(/^[0-9a-f-]{36}$/);
            expect(Number.isSafeInteger(body.observed_at_ms)).toBe(true);
            expect(body.polling.next_poll_at_ms).toBeGreaterThanOrEqual(body.observed_at_ms!);
            if (etag) { expect(response.headers.etag).toBe(etag); expect(body.summary_hash).toBe(hash); }
            etag = String(response.headers.etag); hash = body.summary_hash;
            cursor = body.page.next_cursor;
            expect(body.page.has_more).toBe(cursor !== null);
            // Exact project IDs vary per independent DB. Every occurrence maps bijectively.
            const normalized = JSON.stringify(body, (key, value: unknown) => {
              if (typeof value === 'string' && fixture.projectIds.includes(value)) return `project-${fixture.projectIds.indexOf(value)}`;
              if (key === 'observation_id') return '<validated-uuid>';
              if (key === 'summary_hash') return '<stable-hash>';
              if (key === 'next_cursor' && value !== null) return '<continuation>';
              return value;
            });
            pages.push(JSON.parse(normalized));
          } while (cursor);
          expect(pages).toHaveLength(3);
          const before = hash;
          fixture.changeAccount();
          const changed = await fixture.read({ ...context, purpose: 'authorization' });
          expect(changed.observation.summaryHash).not.toBe(before);
          expect(changed.observation.eligibleTotal).toBe(0);
          expect(meter.spans.filter(s => s.layer === 'http')).toHaveLength(3);
          expect(meter.spans.some(s => s.layer === 'sql')).toBe(true);
          expect(meter.spans.filter(s => s.layer === 'graphql').length).toBeGreaterThan(100);
          return pages;
        } finally { await app.close(); restore(); }
      }, { meter, wire: true });
    }
    expect(await run()).toEqual(await run());
  });
});

