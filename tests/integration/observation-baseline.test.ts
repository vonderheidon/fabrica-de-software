import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { observationScenarios, withObservationFixture, type ObservationSample } from '../fixtures/observation-baseline.js';

const context = { purpose: 'display', trigger: 'mount', repetition: 1, phase: 'cold', consumerId: 'dashboard' } as const;
const normalized = (samples: ObservationSample[]) => samples.map(({ consumerId: _consumer, ...sample }) => sample);

describe('private observation foundation', () => {
  for (const scenario of observationScenarios) {
    it(`reproduces ${scenario.id} with real temporary SQLite and distinct authority reads`, async () => {
      async function run() {
        return withObservationFixture(scenario, async f => {
          expect(existsSync(`${f.directory}/factory.sqlite`)).toBe(true);
          const cold = await f.read(context);
          expect(cold.observation.complete).toBe(true);
          expect(cold.observation.eligibleTotal).toBe(scenario.issuesPerProject * 2);
          const sent = f.samples.filter(s => s.category === 'synthetic_page').length;
          await f.read({ ...context, phase: 'warm', trigger: 'manual' });
          expect(f.samples.filter(s => s.category === 'synthetic_page')).toHaveLength(sent);
          const consumers = f.samples.filter(s => s.category === 'consumer');
          expect(consumers[1]!.physicalExecutionIds).toEqual(consumers[0]!.physicalExecutionIds);
          for (const purpose of ['scheduler', 'scope', 'authorization'] as const) {
            await f.read({ ...context, purpose, phase: 'warm', trigger: 'timer' });
            expect(f.samples.some(s => s.purpose === purpose && s.category === 'synthetic_page')).toBe(true);
          }
          expect(new Set(f.samples.filter(s => s.category === 'synthetic_page').map(s => s.executionId)).size)
            .toBe(f.samples.filter(s => s.category === 'synthetic_page').length);
          return normalized(f.samples);
        });
      }
      expect(await run()).toEqual(await run());
    });
  }
  it('revalidates account changes without using display data as authority', async () => {
    await withObservationFixture(observationScenarios[0]!, async f => {
      await f.read(context);
      f.changeAccount();
      const result = await f.read({ ...context, purpose: 'authorization' });
      expect(result.observation.eligibleTotal).toBe(0);
    });
  });
  it('closes SQLite and restores the clock after failure; retains only allowlisted measurements', async () => {
    let directory = '';
    let storage: Awaited<ReturnType<typeof import('../fixtures/observation-baseline.js').observationFixture>>['storage'] | undefined;
    await expect(withObservationFixture(observationScenarios[0]!, async f => {
      directory = f.directory; storage = f.storage;
      f.failNextResponse();
      try { await f.read(context); } finally {
        expect(f.samples.some(s => s.completion === 'failed')).toBe(true);
        expect(Object.keys(f.samples[0]!).sort()).toEqual([
          'scenario', 'repetition', 'phase', 'purpose', 'trigger', 'consumerId', 'executionId',
          'category', 'count', 'durationMs', 'completion', 'projects', 'issuesPerProject', 'memberships', 'pages', 'physicalExecutionIds',
        ].sort());
      }
    })).rejects.toThrow('SYNTHETIC_REMOTE_FAILURE');
    expect(existsSync(directory)).toBe(false);
    expect(() => storage!.getSettings()).toThrow();
  });
});
