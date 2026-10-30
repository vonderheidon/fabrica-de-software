import { describe, expect, it } from 'vitest';
import { BackendMeasurement } from '../fixtures/backend-measurement.js';
import { observationFixture, type ObservationScenario } from '../fixtures/observation-baseline.js';

const context = { purpose: 'display', trigger: 'mount', repetition: 1, phase: 'cold', consumerId: 'screen' } as const;

describe('queue efficiency baseline without external services', () => {
  it('counts overlapping waits once and retains time outside those windows', async () => {
    let now = 0;
    const meter = new BackendMeasurement(() => now);
    await meter.observe('overlap', 'display', () => meter.measure('http', 'scenario', async () => {
      now = 2;
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const first = meter.measure('graphql', 'page', () => gate);
      now = 4;
      const second = meter.measure('graphql', 'page', () => gate);
      now = 8; meter.noteAdmissionWaitMs(5);
      now = 10; release(); await Promise.all([first, second]);
      now = 12;
    }));
    expect(meter.timingBreakdown('overlap')).toEqual({ totalMs: 12, sendWindowMs: 8,
      admissionWindowMs: 5, waitingWindowMs: 8, outsideWaitingWindowMs: 4 });
  });

  it.each([10, 100])('measures the queue journey with %i issues per project', async issuesPerProject => {
    const scenario: ObservationScenario = { id: 'efficiency-baseline', issuesPerProject, memberships: 1,
      pages: 1, latencyMs: 5, largeCommentBytes: 0 };
    const meter = new BackendMeasurement();
    const fixture = await observationFixture(scenario, meter, true, { applyLatency: true }, 'composed');
    const records: ReturnType<BackendMeasurement['record']>[] = [];
    async function measure(name: string, run: () => Promise<unknown>) {
      const cpuStart = process.cpuUsage();
      await meter.observe(name, 'display', () => meter.measure('http', 'scenario', run));
      const cpu = process.cpuUsage(cpuStart);
      const record = meter.record(name, { scenario: `${issuesPerProject * 2}-issues:${name}`,
        purpose: 'display', repetition: 1, result: 'completed', equivalent: null });
      records.push(record);
      const timing = meter.timingBreakdown(name);
      expect(timing.waitingWindowMs + timing.outsideWaitingWindowMs).toBeCloseTo(timing.totalMs, 6);
      expect(timing.waitingWindowMs).toBeGreaterThanOrEqual(timing.sendWindowMs);
      console.log(`QUEUE_BASELINE ${JSON.stringify({ ...record, timing, process_cpu_user_ms: cpu.user / 1000, process_cpu_system_ms: cpu.system / 1000 })}`);
      return record;
    }
    try {
      let cursor: string | null = null;
      const cold = await measure('cold', async () => {
        const result = await fixture.read(context, { limit: '7' });
        expect(result.observation.complete).toBe(true);
        expect(result.observation.eligibleTotal).toBe(issuesPerProject * 2);
        cursor = result.observation.page.next_cursor;
      });
      expect(cold.physical_sends).toBe(8 + issuesPerProject * 4);
      const warm = await measure('warm-cache', () => fixture.read({ ...context, phase: 'warm' }, { limit: '7' }));
      expect(warm.physical_sends).toBe(0);
      expect(cursor).not.toBeNull();
      const page = await measure('next-page', () => fixture.read(context, { limit: '7', cursor: cursor! }));
      expect(page.physical_sends).toBe(0);
      fixture.advance(11_000);
      const refresh = await measure('refresh-expired', () => fixture.read({ ...context, trigger: 'timer' }, { limit: '7' }));
      expect(refresh.physical_sends).toBe(cold.physical_sends);
      fixture.advance(11_000);
      const together = await measure('screen-and-scheduler-observation', () => Promise.all([
        fixture.read(context, { limit: '7' }),
        fixture.read({ ...context, purpose: 'scheduler', consumerId: 'scheduler' }, { limit: '100' }),
      ]));
      expect(together.physical_sends).toBe(cold.physical_sends);
      const changed = fixture.issues.values().next().value;
      expect(changed).toBeDefined();
      changed!.title = 'Synthetic changed title';
      fixture.advance(11_000);
      const update = await measure('one-issue-changed', () => fixture.read(context, { limit: '7' }));
      expect(update.physical_sends).toBe(cold.physical_sends);
      expect(records.every(record => record.response_bytes !== null && record.physical_completion !== 'unknown')).toBe(true);
    } finally { await fixture.close(); }
  }, 60_000);

  it('measures rate limit blocking without sending another request', async () => {
    const meter = new BackendMeasurement();
    const fixture = await observationFixture({ id: 'efficiency-throttle', issuesPerProject: 10,
      memberships: 1, pages: 1, latencyMs: 0, largeCommentBytes: 0 }, meter, true, { fault: 'throttle' }, 'composed');
    try {
      for (const name of ['throttle', 'during-cooldown']) {
        await meter.observe(name, 'scheduler', () => meter.measure('http', 'scenario', async () => {
          const result = await fixture.read({ ...context, purpose: 'scheduler' });
          expect(result.observation.valid).toBe(false);
        }));
        const record = meter.record(name, { scenario: name, purpose: 'scheduler', repetition: 1,
          result: 'unavailable', equivalent: null });
        console.log(`QUEUE_BASELINE ${JSON.stringify(record)}`);
        if (name === 'during-cooldown') expect(record.physical_sends).toBe(0);
      }
    } finally { await fixture.close(); }
  });
});
