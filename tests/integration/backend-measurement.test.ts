import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import Fastify from 'fastify';
import { Value } from '@sinclair/typebox/value';
import { HttpQueueObservation, type IssueContext } from '#contracts';
import { installQueueRoutes } from '../../apps/controller/src/http/routes/queue.js';
import type { Projects } from '../../apps/controller/src/modules/projects/index.js';
import { describe, expect, it } from 'vitest';
import { GraphQLReader, GitHubRunnerError, collect, queryLimits, type CommandResponse } from '../../apps/controller/src/modules/github/transport.js';
import { BackendMeasurement } from '../fixtures/backend-measurement.js';
import { c12GroupedResponseScenario, c12ObservationScenarios, observationFixture, observationScenarios, withObservationFixture } from '../fixtures/observation-baseline.js';
import type { ObservationSelectionProfile, ObservationWireControls } from '../fixtures/observation-wire.js';

const wire = (data: unknown, status = 200): CommandResponse => ({ exitCode: 0,
  stdout: `HTTP/2.0 ${status} Response\r\ncontent-type: application/json\r\n\r\n${JSON.stringify({ data })}` });
const page = (ids: string[], cursor: string | null) => ({ connection: { nodes: ids.map(id => ({ id })),
  pageInfo: { hasNextPage: cursor !== null, endCursor: cursor } } });
const context = { purpose: 'scheduler', trigger: 'timer', repetition: 1, phase: 'cold', consumerId: 'backend' } as const;
const orderDigest = (order: readonly string[]) => createHash('sha256').update(JSON.stringify(order), 'utf8').digest('hex');

function issueContext(value: IssueContext | import('#contracts').ProjectItem | null): value is IssueContext {
  return value !== null && 'comments' in value;
}

function confirmationOracles(issue: IssueContext) {
  const expectedBody = 'C12-MARKER\nExpected confirmation';
  const expectedHash = createHash('sha256').update(expectedBody, 'utf8').digest('hex');
  const commentMatches = issue.comments.filter(comment => comment.body === expectedBody
    && createHash('sha256').update(comment.body, 'utf8').digest('hex') === expectedHash
    && comment.author?.id === 'ACCOUNT_test' && comment.url === `${issue.url}#issuecomment-1`).length === 1;
  const membership = issue.memberships.filter(value => value.itemId === 'ITEM_synthetic_0_1'
    && value.projectId === 'PVT_synthetic_0' && !value.archived);
  const statusMatches = membership.length === 1 && membership[0]!.statusValues.length === 1
    && membership[0]!.statusValues[0]!.fieldId === 'FIELD_test'
    && membership[0]!.statusValues[0]!.optionId === 'READY';
  return { commentMatches, statusMatches };
}

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

  it('keeps sent work physically unknown after logical failure until the child close arrives', async () => {
    const meter = new BackendMeasurement();
    let physicallyClosed = false;
    let resolveClose!: () => void;
    const completion = new Promise<void>(resolve => { resolveClose = resolve; });
    const lifecycle = { sent: true, killRequested: true, killFailed: false, get physicallyClosed() { return physicallyClosed; }, completion };
    const runner = meter.runner(async (_input, onSend) => {
      onSend?.(); throw new GitHubRunnerError('CLI_UNAVAILABLE', lifecycle);
    });
    const reader = new GraphQLReader(runner);
    const scopedReader = reader.scope();
    const result = await meter.observe('late-child-close', 'authorization', () => scopedReader.query('synthetic', {}));
    expect(result).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'CLI_UNAVAILABLE' }] });
    expect(reader.pendingPhysicalSends).toBe(1);
    expect(scopedReader.pendingPhysicalSends).toBe(1);
    const input = { scenario: 'late-child-close', purpose: 'authorization', repetition: 1, result: 'unavailable', equivalent: null };
    expect(meter.record('late-child-close', input).physical_completion).toBe('unknown');
    physicallyClosed = true; resolveClose(); await completion; await Promise.resolve();
    expect(reader.pendingPhysicalSends).toBe(0);
    expect(meter.record('late-child-close', input).physical_completion).toBe('observed');
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

  it.each(['client', 'composed'] as const)('preserves logical worker concurrency through %s path', async path => {
    const meter = new BackendMeasurement();
    const fixture = await observationFixture(observationScenarios[1]!, meter, true, {}, path);
    try {
      await meter.observe('aggregate', 'scheduler', () => meter.measure('http', 'scenario', () =>
        Promise.all(['one', 'two'].map(id => meter.observe(id, 'scheduler', () =>
          fixture.read({ ...context, consumerId: id }))))));
      expect(meter.report('one', 'logical', 'issue').peak).toBe(3);
      expect(meter.report('two', 'logical', 'issue').peak).toBe(3);
      expect(meter.report(undefined, 'logical', 'issue').peak).toBe(6);
      expect(meter.report(undefined, 'graphql').peak).toBe(3);
      const record = meter.record(undefined, { scenario: `two-simultaneous-observations-${path}`, purpose: 'scheduler', repetition: 1,
        result: 'complete;logical_issue_peak_per_observation=3;aggregate=6', equivalent: true });
      expect(record).toMatchObject({ peak_in_flight: 3, peak_logical_in_flight: 6, physical_sends: expect.any(Number),
        provider_simulated_ms: expect.any(Number), admission_wait_ms: expect.any(Number) });
      console.log(`C12_MEASUREMENT ${JSON.stringify(record)} logical_peak_per_observation=3,3 aggregate=6`);
    } finally { await fixture.close(); }
  });

  it.each(['client', 'composed'] as const)('runs the installed HTTP route and public page oracle through %s in independent databases', async path => {
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
      }, { meter, wire: true, path });
    }
    expect(await run()).toEqual(await run());
  });

  it.each(['client', 'composed'] as const)('records repeatable C12 loads through %s path', async path => {
    for (const scenario of c12ObservationScenarios) {
      const sendOrder: string[] = [];
      const controls: ObservationWireControls = {
        sendOrder, applyLatency: true,
        commentConfirmation: scenario.pages === 2 ? 'second_page' : 'exact',
        statusConfirmation: scenario.pages === 2 ? 'second_page' : 'exact',
        ...(scenario.pages === 2 && scenario.largeCommentBytes === 0 ? { commentBytes: 64 } : {}),
      };
      const meter = new BackendMeasurement();
      const fixture = await observationFixture(scenario, meter, true, controls, path);
      let priorQueueItems: readonly unknown[] | null = null;
      let priorSendOrder: readonly string[] | null = null;
      try {
        for (let repetition = 1; repetition <= 3; repetition++) {
          const observation = `${scenario.id}-${path}-${repetition}`;
          sendOrder.length = 0;
          const run = await meter.observe(observation, 'scheduler', () => meter.measure('http', 'scenario', async () => {
            const id = 'I_synthetic_0_1';
            const queue = await fixture.read({ ...context, repetition, consumerId: `c12-${path}` }, { limit: '25' });
            const complete = await fixture.readFullIssueContext(id);
            return { queue, complete };
          }));
          const expectedIssueCount = scenario.issuesPerProject * 2;
          expect(run.queue.observation.complete).toBe(true);
          expect(run.queue.items).toHaveLength(expectedIssueCount);
          expect(run.queue.observation.eligibleTotal).toBe(expectedIssueCount);
          if (priorQueueItems) expect(run.queue.items).toEqual(priorQueueItems);
          priorQueueItems = structuredClone(run.queue.items);
          expect(issueContext(run.complete.data), JSON.stringify({ state: run.complete.state, diagnostics: run.complete.diagnostics.map(item => item.code), sendOrder })).toBe(true);
          if (!issueContext(run.complete.data)) throw new Error('SYNTHETIC_CONTEXT_ORACLE_FAILED');
          expect(run.complete.data.id).toBe('I_synthetic_0_1');
          expect(run.complete.data.repository.id).toBe('R_test');
          expect(run.complete.data.number).toBe(1);
          expect(run.complete.data.body).toBe(fixture.issues.get('I_synthetic_0_1')!.body);
          expect(run.complete.data.comments.some(comment => comment.body.length === Math.max(0, scenario.largeCommentBytes))).toBe(scenario.largeCommentBytes > 0);
          const confirmations = confirmationOracles(run.complete.data);
          expect(confirmations).toEqual({ commentMatches: true, statusMatches: true });
          if (priorSendOrder) expect(sendOrder).toEqual(priorSendOrder);
          priorSendOrder = [...sendOrder];
          const equivalent = true;
          const record = meter.record(observation, { scenario: `${scenario.id}-${path}`, purpose: 'scheduler+queue+complete-context', repetition,
            result: `queue=${run.queue.observation.complete ? 'complete' : 'partial'};items=${run.queue.items.length};eligible=${run.queue.observation.eligibleTotal ?? 'unknown'};context=${run.complete.state}`, equivalent });
          expect(record.provider_simulated_ms).toBe(record.physical_sends * scenario.latencyMs);
          console.log(`C12_MEASUREMENT ${JSON.stringify(record)} send_order_sha256=${orderDigest(sendOrder)}`);
        }
      } finally { await fixture.close(); }
    }
  }, 60_000);

  it.each(['client', 'composed'] as const)('measures authority and confirmation projections through %s', async path => {
    const meter = new BackendMeasurement();
    const profiles: ObservationSelectionProfile[] = [];
    const sendOrder: string[] = [];
    const controls: ObservationWireControls = { sendOrder, applyLatency: true, commentConfirmation: 'exact', statusConfirmation: 'exact',
      selectionProfile: profile => profiles.push(profile) };
    const fixture = await observationFixture(c12ObservationScenarios[1]!, meter, true, controls, path);
    const fields = ['issue_title', 'issue_body', 'comments', 'assignees', 'blockers', 'memberships', 'field_values', 'references'] as const;
    const expectations = {
      authority: ['issue_title', 'issue_body', 'comments', 'references'],
      comment_confirmation: ['issue_title', 'issue_body', 'assignees', 'blockers', 'memberships', 'field_values', 'references'],
      status_confirmation: ['issue_title', 'issue_body', 'comments', 'assignees', 'blockers', 'references'],
    } as const;
    try {
      const projectionClient = fixture.purposeGitHub;
      if (!projectionClient) throw new Error('SYNTHETIC_PROJECTION_CLIENT_MISSING');
      for (const purpose of ['authority', 'comment_confirmation', 'status_confirmation'] as const) {
        let priorSendOrder: readonly string[] | null = null;
        for (let repetition = 1; repetition <= 3; repetition++) {
          profiles.length = 0; sendOrder.length = 0;
          const observation = `projection-${purpose}-${path}-${repetition}`;
          const read = async () => purpose === 'authority'
            ? projectionClient.getIssueContextById('I_synthetic_0_1', { purpose: 'authority' })
            : purpose === 'comment_confirmation'
              ? projectionClient.getIssueContextById('I_synthetic_0_1', { purpose: 'comment_confirmation' })
              : projectionClient.getIssueContextById('I_synthetic_0_1', { purpose: 'status_confirmation' });
          const result = await meter.observe(observation, `publication.${purpose}`, () =>
            meter.measure('logical', `issue.${purpose}`, () => meter.measure('http', 'scenario', read)));
          expect(result.state).toBe('complete');
          expect(result.data).not.toBeNull();
          const data = result.data;
          if (!data) throw new Error('SYNTHETIC_PROJECTION_DATA_MISSING');
          const absent = fields.filter(field => profiles.every(profile => !profile[field]));
          expect(absent).toEqual([...expectations[purpose]]);
          if (priorSendOrder) expect(sendOrder).toEqual(priorSendOrder);
          priorSendOrder = [...sendOrder];
          if (purpose === 'authority') {
            expect(Object.keys(data).sort()).toEqual(['assignees', 'blockers', 'id', 'memberships', 'repository', 'state']);
            if (!('memberships' in data)) throw new Error('AUTHORITY_PROJECTION_SHAPE_INVALID');
            expect(data.memberships).toHaveLength(2);
          } else if (purpose === 'comment_confirmation') {
            expect(Object.keys(data).sort()).toEqual(['comments', 'id', 'repository']);
            if (!('comments' in data)) throw new Error('COMMENT_CONFIRMATION_PROJECTION_SHAPE_INVALID');
            expect(data.comments).toHaveLength(1);
          } else {
            expect(Object.keys(data).sort()).toEqual(['id', 'memberships', 'repository']);
            if (!('memberships' in data)) throw new Error('STATUS_CONFIRMATION_PROJECTION_SHAPE_INVALID');
            expect(data.memberships).toHaveLength(2);
          }
          const record = meter.record(observation, { scenario: `projection-${purpose}-${path}`, purpose,
            repetition, result: `${result.state};selected_fields_verified`, equivalent: true, selected_fields_absent: absent });
          expect(record.provider_simulated_ms).toBe(record.physical_sends * c12ObservationScenarios[1]!.latencyMs);
          console.log(`C12_MEASUREMENT ${JSON.stringify(record)} send_order_sha256=${orderDigest(sendOrder)}`);
        }
      }
    } finally { await fixture.close(); }
  }, 60_000);

  it.each(['client', 'composed'] as const)('accepts grouped responses above 4 MiB within the 2 and 3 membership ceilings through %s', async path => {
    for (const memberships of [2, 3] as const) {
      const sendOrder: string[] = [];
      const responseLimits: Array<number | null> = [];
      const responseSizes: number[] = [];
      const controls: ObservationWireControls = { sendOrder, responseLimit: value => responseLimits.push(value),
        afterResponse: bytes => responseSizes.push(bytes), applyLatency: true, groupedResponseExtraBytes: 4_500_000, unicodeEnvelope: true };
      const meter = new BackendMeasurement();
      const scenario = { ...c12GroupedResponseScenario, id: `large-group-${memberships}`, memberships };
      const fixture = await observationFixture(scenario, meter, true, controls, path);
      try {
        let priorSendOrder: readonly string[] | null = null;
        for (let repetition = 1; repetition <= 3; repetition++) {
          const observation = `large-grouped-response-${path}-${memberships}-${repetition}`;
          controls.repetition = repetition; sendOrder.length = 0; responseLimits.length = 0; responseSizes.length = 0;
          const result = await meter.observe(observation, 'scheduler', () => meter.measure('http', 'scenario', () =>
            fixture.github.getIssueContextById('I_synthetic_0_1', { purpose: 'queue' })));
          expect(result.state).toBe('complete');
          expect(result.data?.id).toBe('I_synthetic_0_1');
          expect(issueContext(result.data)).toBe(true);
          if (!issueContext(result.data)) throw new Error('SYNTHETIC_GROUPED_CONTEXT_FAILED');
          expect(result.data.memberships).toHaveLength(memberships);
          const ceiling = queryLimits.responseBytes * memberships;
          const groupedBytes = responseSizes.filter(bytes => bytes > queryLimits.responseBytes);
          expect(groupedBytes).toHaveLength(1);
          expect(groupedBytes[0]).toBeLessThan(ceiling);
          expect(responseLimits).toContain(ceiling);
          expect(sendOrder.filter(operation => operation.startsWith('GroupedValues:'))).toHaveLength(1);
          if (priorSendOrder) expect(sendOrder).toEqual(priorSendOrder);
          priorSendOrder = [...sendOrder];
          const record = meter.record(observation, { scenario: `large-grouped-response-${path}-${memberships}`, purpose: 'queue.grouped-values',
            repetition, result: `${result.state};diagnostics=${result.diagnostics.map(item => item.code).join(',')}`, equivalent: true });
          expect(record.response_bytes).toBe(responseSizes.reduce((total, bytes) => total + bytes, 0));
          console.log(`C12_MEASUREMENT ${JSON.stringify(record)} grouped_response_bytes=${groupedBytes[0]} send_order_sha256=${orderDigest(sendOrder)}`);
        }
      } finally { await fixture.close(); }
    }
  }, 60_000);

  it.each(['client', 'composed'] as const)('rejects a simple response above its 4 MiB ceiling through %s', async path => {
    const sendOrder: string[] = [];
    const responseLimits: Array<number | null> = [];
    const responseSizes: number[] = [];
    const controls: ObservationWireControls = { sendOrder, responseLimit: value => responseLimits.push(value),
      afterResponse: bytes => responseSizes.push(bytes), simpleResponseExtraBytes: queryLimits.responseBytes, unicodeEnvelope: true };
    const meter = new BackendMeasurement();
    const fixture = await observationFixture({ ...c12GroupedResponseScenario, id: 'simple-over-limit', memberships: 1 }, meter, true, controls, path);
    try {
      const result = await fixture.github.getIssueContextById('I_synthetic_0_1', { purpose: 'queue' });
      expect(result.state).toBe('partial');
      expect(result.diagnostics.map(item => item.code)).toContain('QUERY_FAILED');
      expect(responseLimits).toContain(queryLimits.responseBytes);
      expect(responseSizes.filter(bytes => bytes > queryLimits.responseBytes)).toHaveLength(1);
      expect(sendOrder.filter(operation => operation.startsWith('ItemValues:'))).toHaveLength(1);
    } finally { await fixture.close(); }
  }, 60_000);

  it.each([
    { memberships: 2 as const, ceiling: queryLimits.responseBytes * 2 },
    { memberships: 3 as const, ceiling: queryLimits.responseBytes * 3 },
  ])('rejects a grouped response above the $memberships membership ceiling', async ({ memberships, ceiling }) => {
    const sendOrder: string[] = [];
    const responseLimits: Array<number | null> = [];
    const responseSizes: number[] = [];
    const controls: ObservationWireControls = { sendOrder, responseLimit: value => responseLimits.push(value),
      afterResponse: bytes => responseSizes.push(bytes), groupedResponseExtraBytes: ceiling, unicodeEnvelope: true };
    const meter = new BackendMeasurement();
    const scenario = { ...c12GroupedResponseScenario, id: `excess-group-${memberships}`, memberships };
    const fixture = await observationFixture(scenario, meter, true, controls, 'composed');
    try {
      const result = await fixture.github.getIssueContextById('I_synthetic_0_1', { purpose: 'queue' });
      expect(result.state).toBe('partial');
      expect(responseLimits).toContain(ceiling);
      expect(responseSizes.some(bytes => bytes > ceiling)).toBe(true);
      expect(sendOrder.filter(operation => operation.startsWith('GroupedValues:'))).toHaveLength(1);
    } finally { await fixture.close(); }
  }, 60_000);

  it.each(['client', 'composed'] as const)('records exact, divergent and paginated confirmation reads through %s', async path => {
    const cases = [
      { label: 'exact', commentConfirmation: 'exact' as const, statusConfirmation: 'exact' as const, commentBytes: 0, comments: true, status: true },
      { label: 'absent', commentConfirmation: 'absent' as const, statusConfirmation: 'exact' as const, commentBytes: 0, comments: false, status: true },
      { label: 'duplicate', commentConfirmation: 'duplicate' as const, statusConfirmation: 'exact' as const, commentBytes: 0, comments: false, status: true },
      { label: 'divergent', commentConfirmation: 'divergent' as const, statusConfirmation: 'divergent' as const, commentBytes: 0, comments: false, status: false },
      { label: 'second-page', commentConfirmation: 'second_page' as const, statusConfirmation: 'second_page' as const, commentBytes: 64, comments: true, status: true },
    ];
    for (const testCase of cases) {
      let priorSendOrder: readonly string[] | null = null;
      for (let repetition = 1; repetition <= 3; repetition++) {
        const meter = new BackendMeasurement(); const scenario = c12ObservationScenarios[1]!;
        const sendOrder: string[] = [];
        const controls: ObservationWireControls = { sendOrder, commentConfirmation: testCase.commentConfirmation,
          statusConfirmation: testCase.statusConfirmation, commentBytes: testCase.commentBytes, applyLatency: true };
        const fixture = await observationFixture(scenario, meter, true, controls, path);
        try {
          const observation = `confirmation-${testCase.label}-${path}-${repetition}`;
          const result = await meter.observe(observation, 'publication.confirmation', () => meter.measure('http', 'scenario', () =>
            fixture.readFullIssueContext('I_synthetic_0_1')));
          if (!issueContext(result.data)) throw new Error(`SYNTHETIC_CONFIRMATION_CONTEXT_FAILED:${result.state}:${result.diagnostics.map(item => item.code).join(',')}:${controls.sendOrder?.join(',') ?? ''}`);
          const oracle = confirmationOracles(result.data);
          expect(oracle).toEqual({ commentMatches: testCase.comments, statusMatches: testCase.status });
          if (priorSendOrder) expect(sendOrder).toEqual(priorSendOrder);
          priorSendOrder = [...sendOrder];
          const record = meter.record(observation, { scenario: `confirmation-${testCase.label}-${path}`, purpose: 'comment+status-confirmation',
            repetition, result: `${result.state};comment=${oracle.commentMatches ? 'confirmed' : 'not-confirmed'};status=${oracle.statusMatches ? 'confirmed' : 'divergent'}`,
            equivalent: result.state === 'complete' && oracle.commentMatches === testCase.comments && oracle.statusMatches === testCase.status });
          console.log(`C12_MEASUREMENT ${JSON.stringify(record)} send_order_sha256=${orderDigest(sendOrder)}`);
        } finally { await fixture.close(); }
      }
    }
  });

  it('records cooldown and physical saturation separately from logical concurrency', async () => {
    const scenario = observationScenarios[0]!; const meter = new BackendMeasurement();
    const fixture = await observationFixture(scenario, meter, true, { fault: 'throttle', applyLatency: true }, 'client');
    try {
      const observation = 'cooldown-one-instance';
      const results = await meter.observe(observation, 'scheduler', () => meter.measure('http', 'scenario', async () => {
        const first = await fixture.github.listProjectItems('PVT_synthetic_0');
        const second = await fixture.github.listProjectItems('PVT_synthetic_0');
        if (second.state === 'rate_limited') meter.noteCooldownBlock();
        return [first.state, second.state];
      }));
      expect(results).toEqual(['rate_limited', 'rate_limited']);
      expect(meter.report(observation).peak).toBe(1);
      const record = meter.record(observation, { scenario: 'shared-cooldown-client', purpose: 'identity', repetition: 1,
        result: results.join(','), equivalent: true });
      expect(record).toMatchObject({ logical_calls: 2, physical_sends: 1, cooldown_blocks: 1, response_bytes: expect.any(Number) });
      expect(record.provider_simulated_ms).toBe(5);
      console.log(`C12_MEASUREMENT ${JSON.stringify(record)}`);
    } finally { await fixture.close(); }

    const saturatedMeter = new BackendMeasurement();
    const saturated = await observationFixture(scenario, saturatedMeter, true, { applyLatency: true }, 'composed');
    try {
      const observation = 'six-send-saturation';
      const results = await saturatedMeter.observe(observation, 'scheduler', () => saturatedMeter.measure('http', 'scenario', () =>
        Promise.all(Array.from({ length: 6 }, () => saturated.github.getIdentity()))));
      expect(results.every(result => result.state === 'complete')).toBe(true);
      const record = saturatedMeter.record(observation, { scenario: 'six-send-saturation-composed', purpose: 'scheduler', repetition: 1,
        result: 'six-complete', equivalent: true });
      expect(record).toMatchObject({ logical_calls: 6, physical_sends: 6, peak_in_flight: 3, cooldown_blocks: 0 });
      expect(record.peak_logical_in_flight).toBe(6);
      expect(record.admission_wait_ms).toBeGreaterThan(0);
      expect(record.provider_simulated_ms).toBe(30);
      console.log(`C12_MEASUREMENT ${JSON.stringify(record)}`);
    } finally { await saturated.close(); }

    const failedMeter = new BackendMeasurement();
    const failedFixture = await observationFixture(scenario, failedMeter, true, { fault: 'runner_failure', applyLatency: true }, 'client');
    try {
      const observation = 'sent-runner-failure';
      const result = await failedMeter.observe(observation, 'scheduler', () => failedMeter.measure('http', 'scenario', () =>
        failedFixture.github.listProjectItems('PVT_synthetic_0')));
      expect(result.state).toBe('unavailable');
      const record = failedMeter.record(observation, { scenario: 'runner-failure-after-send-client', purpose: 'scheduler', repetition: 1,
        result: result.state, equivalent: false });
      expect(record).toMatchObject({ physical_sends: 1, response_bytes: null, physical_completion: 'unknown' });
      expect(record.conservative_unknown_consumption_bytes).toBe(queryLimits.responseBytes);
      console.log(`C12_MEASUREMENT ${JSON.stringify(record)}`);
    } finally { await failedFixture.close(); }
  });
});

