import Fastify from 'fastify';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { HttpQueueObservation } from '#contracts';
import { installQueueRoutes } from '../../apps/controller/src/http/routes/queue.js';
import { createProjects } from '../../apps/controller/src/modules/projects/index.js';
import { toHttpQueueObservation } from '../../apps/controller/src/http/observation-views.js';
import { BackendMeasurement } from '../fixtures/backend-measurement.js';
import { observationOracle } from '../fixtures/observation-oracle.js';
import { observationScenarios, withObservationFixture } from '../fixtures/observation-baseline.js';

const automationEnabled = process.env.OBSERVATION_AUTOMATION === 'enabled';
const context = { purpose: 'display', trigger: 'mount', repetition: 1, phase: 'cold', consumerId: 'matrix' } as const;
for (const [index, scenario] of observationScenarios.entries()) {
  it(`compares legacy and grouped field pages for ${scenario.id}`, async () => {
    const results: unknown[] = []; const sends: number[] = []; const samples: unknown[] = [];
    for (const legacyValues of [true, false]) {
      const meter = new BackendMeasurement();
      let wireBytes = 0;
      await withObservationFixture(scenario, async f => {
        const start = performance.now();
        const response = await meter.observe('comparison', 'display', () => f.read(context, { limit: '25' }));
        samples.push({ legacyValues, elapsedMs: performance.now() - start, wireBytes, payloadBytes: Buffer.byteLength(JSON.stringify(toHttpQueueObservation(response.observation))), ...meter.report('comparison') });
        results.push(observationOracle(toHttpQueueObservation(response.observation), f.projectIds));
        sends.push(meter.report('comparison').byOperation.find(row => row.key === 'graphql:page')!.count);
      }, { meter, wire: true, controls: { legacyValues, afterResponse: bytes => { wireBytes += bytes; } } });
    }
    expect(results[1]).toEqual(results[0]);
    expect(sends).toEqual([[108, 108], [272, 232], [2612, 2212]][index]);
    console.info('GROUPED_COMPARISON ' + JSON.stringify({ scenario: scenario.id, sends, samples }));
  });
}
for (const scenario of observationScenarios) {
  it(`records backend matrix for ${scenario.id} with independent cold, warm and overlap`, async () => {
    const meter = new BackendMeasurement(); const restore = meter.installSql();
    const operations: Record<string, number> = {};
    const sample = { scenario: scenario.id, automationEnabled, issues: scenario.issuesPerProject * 2, memberships: scenario.memberships,
      pages: scenario.pages, syntheticRemoteDelayMs: 0, measurements: [] as unknown[] };
    try {
      await withObservationFixture(scenario, async f => {
        const settings = f.storage.getGlobalConfiguration(); const changes = { automation_enabled: automationEnabled };
        if (settings.view.settings.automation_enabled !== automationEnabled) f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: settings.etag, changes, body: { changes } });
        const app = Fastify(); const unexpected = async () => { throw new Error('UNEXERCISED_SETUP_OPERATION'); };
        const projects = createProjects({ storage: f.storage, github: { ...f.github, getProjectOwner: unexpected,
          listProjects: unexpected, validateProjectSelection: unexpected }, workspaces: f.workspaces, directoryBase: f.directory });
        installQueueRoutes(app, { ...projects, getQueue: query => f.read(context, query) }); await app.ready();
        const request = () => meter.measure('http', 'GET /api/v1/queue', () => app.inject({ url: '/api/v1/queue?limit=25' }));
        const measure = async (name: string, run: () => Promise<unknown>) => {
          const before = { ...operations }; const start = performance.now();
          const result = await meter.observe(name, 'display', run);
          const elapsedMs = performance.now() - start;
          const operationsDelta = Object.fromEntries(Object.entries(operations).map(([key, value]) => [key, value - (before[key] ?? 0)]));
          sample.measurements.push({ name, elapsedMs, ...meter.report(name), operations: operationsDelta }); return result;
        };
        try {
          const cold = await measure('cold', request) as Awaited<ReturnType<typeof request>>;
          expect(cold.statusCode).toBe(200); const body = cold.json<HttpQueueObservation>();
          expect(body.complete).toBe(true); expect(body.eligible_total).toBe(scenario.issuesPerProject * 2);
          expect(body.enabled).toBe(automationEnabled);
          const warm = await measure('warm', request) as typeof cold;
          expect(warm.body).toBe(cold.body); expect(meter.report('warm').byOperation.some(row => row.key === 'graphql:page')).toBe(false);
          f.advance(11_000);
          const overlapping = await measure('overlap', () => Promise.all([request(), request()])) as [typeof cold, typeof cold];
          expect(overlapping[0].body).toBe(overlapping[1].body);
          const coldPages = meter.report('cold').byOperation.find(row => row.key === 'graphql:page')!.count;
          expect(meter.report('overlap').byOperation.find(row => row.key === 'graphql:page')!.count).toBe(coldPages);
          expect(overlapping[0].statusCode).toBe(200);
          const sqlCounts = (name: string) => meter.report(name).byOperation.filter(row => row.key.startsWith('sql:'));
          sample.measurements.push({ name: 'payloads-and-files', coldPayloadBytes: Buffer.byteLength(cold.body),
            warmPayloadBytes: Buffer.byteLength(warm.body), itemsOnPage: body.page.items.length, coldPages,
            coldSql: sqlCounts('cold'), warmSql: sqlCounts('warm'),
            databaseBytes: (await stat(join(f.directory, 'factory.sqlite'))).size,
            walBytes: (await stat(join(f.directory, 'factory.sqlite-wal'))).size,
            sharedMemoryBytes: (await stat(join(f.directory, 'factory.sqlite-shm'))).size });
          for (const purpose of ['scheduler', 'scope', 'authorization'] as const) {
            const start = performance.now();
            const result = await meter.observe(purpose, purpose, () => f.read({ ...context, purpose }));
            expect(result.observation.complete).toBe(true);
            expect(meter.report(purpose).byOperation.find(row => row.key === 'graphql:page')!.count).toBe(coldPages);
            sample.measurements.push({ name: purpose, elapsedMs: performance.now() - start, ...meter.report(purpose),
              payloadBytes: Buffer.byteLength(JSON.stringify(toHttpQueueObservation(result.observation))) });
          }
        } finally { await app.close(); }
      }, { meter, wire: true, controls: { afterSend: async operation => { operations[operation] = (operations[operation] ?? 0) + 1; } } });
    } finally { restore(); }
    console.info('BACKEND_MATRIX_REPORT ' + JSON.stringify(sample));
  });
}

it('compares different page-size consumers without assuming their observation work is shared', async () => {
  const meter = new BackendMeasurement();
  await withObservationFixture(observationScenarios[1]!, async f => {
    const settings = f.storage.getGlobalConfiguration(); const changes = { automation_enabled: automationEnabled };
    if (settings.view.settings.automation_enabled !== automationEnabled) f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: settings.etag, changes, body: { changes } });
    const start = performance.now();
    const [small, large] = await meter.observe('different-pages', 'display', () => Promise.all([
      f.read(context, { limit: '7' }), f.read(context, { limit: '25' }),
    ]));
    expect(small.observation.complete && large.observation.complete).toBe(true);
    expect(small.items).toHaveLength(20); expect(large.items).toHaveLength(20);
    expect(observationOracle(toHttpQueueObservation(small.observation), f.projectIds)).not.toEqual(observationOracle(toHttpQueueObservation(large.observation), f.projectIds));
    console.info('BACKEND_SCOPE_REPORT ' + JSON.stringify({ automationEnabled, scenario: 'different-page-size', elapsedMs: performance.now() - start,
      ...meter.report(), firstItems: small.observation.page.items.length, secondItems: large.observation.page.items.length }));
  }, { meter, wire: true });
});
