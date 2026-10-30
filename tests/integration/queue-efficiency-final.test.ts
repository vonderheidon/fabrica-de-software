import { expect, it } from 'vitest';
import { BackendMeasurement } from '../fixtures/backend-measurement.js';
import { observationFixture } from '../fixtures/observation-baseline.js';
import { GraphQLReader, type CommandResponse } from '../../apps/controller/src/modules/github/transport.js';

const context = { purpose: 'display', trigger: 'mount', repetition: 1, phase: 'cold', consumerId: 'screen' } as const;

it.each([10, 100])('measures three unchanged observation cycles with %i issues per project', async issuesPerProject => {
  const meter = new BackendMeasurement();
  const f = await observationFixture({ id: 'final-repeated-window', issuesPerProject, memberships: 1,
    pages: 1, latencyMs: 5, largeCommentBytes: 0 }, meter, true, { applyLatency: true }, 'composed');
  try {
    for (let cycle = 0; cycle < 3; cycle++) {
      if (cycle) f.advance(11_000);
      const name = `cycle-${cycle}`;
      await meter.observe(name, 'display', () => meter.measure('http', 'scenario', async () => {
        const [screen, scheduler] = await Promise.all([
          f.read(context, { limit: '7' }),
          f.read({ ...context, purpose: 'scheduler', consumerId: 'scheduler' }, { limit: '100' }),
        ]);
        expect(screen.observation.complete).toBe(true);
        expect(screen.items).toHaveLength(issuesPerProject * 2);
        expect(screen.observation.observationId).toBe(scheduler.observation.observationId);
        const beforePages = meter.spans.filter(span => span.layer === 'graphql').length;
        await f.read(context, { limit: '7' });
        await f.read(context, { limit: '7', cursor: screen.observation.page.next_cursor! });
        expect(meter.spans.filter(span => span.layer === 'graphql')).toHaveLength(beforePages);
      }));
      const record = meter.record(name, { scenario: `${issuesPerProject * 2}-issues:repeated`,
        purpose: 'display', repetition: cycle + 1, result: 'completed', equivalent: null });
      expect(record.physical_sends).toBe(8 + issuesPerProject * 4);
      expect(record.peak_in_flight).toBeLessThanOrEqual(3);
      console.log(`QUEUE_FINAL ${JSON.stringify({ ...record, virtual_offset_ms: cycle * 11_000,
        points: null, reference_kind: 'historical-send-count-model',
        reference_sends: 2 * (8 + issuesPerProject * 10),
        reduction_percent: 100 * (1 - record.physical_sends / (2 * (8 + issuesPerProject * 10))) })}`);
    }
  } finally { await f.close(); }
}, 60_000);

it('blocks every scope until one millisecond before cooldown and resumes at its boundary', async () => {
  let now = 1_000;
  const sent: number[] = [];
  const root = new GraphQLReader(async (_input, onSend): Promise<CommandResponse> => {
    onSend?.(); sent.push(now);
    return { exitCode: 0, stdout: sent.length === 1
      ? 'HTTP/2.0 429 Response\r\nretry-after: 3\r\ncontent-type: application/json\r\n\r\n{}'
      : 'HTTP/2.0 200 Response\r\ncontent-type: application/json\r\n\r\n{"data":{"viewer":{"id":"U_test"}}}' };
  }, () => now);
  expect(await root.scope().query('query Limited', {})).toMatchObject({ state: 'rate_limited', retryAtMs: 4_000 });
  now = 3_999;
  for (const scope of [root, root.scope(), root.scope()]) {
    expect(await scope.query('query Blocked', {})).toMatchObject({ state: 'rate_limited', retryAtMs: 4_000 });
  }
  expect(sent).toEqual([1_000]);
  now = 4_000;
  expect(await root.scope().query('query Recovered', {})).toMatchObject({ state: 'complete' });
  expect(sent).toEqual([1_000, 4_000]);
});
