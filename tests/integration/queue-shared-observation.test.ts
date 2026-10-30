import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { BackendMeasurement } from '../fixtures/backend-measurement.js';
import { observationScenarios, withObservationFixture } from '../fixtures/observation-baseline.js';

const context = { purpose: 'display', trigger: 'mount', repetition: 1, phase: 'cold', consumerId: 'screen' } as const;

it('shares pending work across page sizes and scheduler, but keeps later authority reads fresh', async () => {
  const meter = new BackendMeasurement();
  await withObservationFixture(observationScenarios[0]!, async f => {
    const [small, large, scheduler] = await meter.observe('shared', 'display', () => Promise.all([
      f.read(context, { limit: '7' }), f.read(context, { limit: '25' }),
      f.read({ ...context, purpose: 'scheduler' }, { limit: '100' }),
    ]));
    expect(meter.spans.filter(span => span.layer === 'graphql')).toHaveLength(48);
    expect(small.observation.page.items).toHaveLength(7);
    expect(large.observation.page.items).toHaveLength(20);
    expect(scheduler.observation.observationId).toBe(small.observation.observationId);
    const next = await f.read(context, { limit: '7', cursor: small.observation.page.next_cursor! });
    expect(next.observation.page.items[0]!.itemId).toBe(small.items[7]!.itemId);
    expect(meter.spans.filter(span => span.layer === 'graphql')).toHaveLength(48);
    small.items[0]!.reasons.push('READ_INCOMPLETE');
    expect(large.items[0]!.reasons).not.toContain('READ_INCOMPLETE');
    const fresh = await meter.observe('fresh', 'scheduler', () => f.read({ ...context, purpose: 'scheduler' }));
    expect(fresh.observation.observationId).not.toBe(scheduler.observation.observationId);
    expect(meter.spans.filter(span => span.observation === 'fresh' && span.layer === 'graphql')).toHaveLength(48);
    f.changeAccount();
    const changed = await f.read({ ...context, purpose: 'authorization' });
    expect(changed.observation.valid).toBe(false);
    expect(changed.items.every(item => !item.eligible)).toBe(true);
  }, { meter, wire: true, path: 'composed' });
});

it.each([false, true])('reuses a shared board while assessing a divergent project mapping: %s', async divergent => {
  const meter = new BackendMeasurement();
  const sends: string[] = [];
  await withObservationFixture(observationScenarios[0]!, async f => {
    const first = f.storage.getConfiguration(f.projectIds[0]!);
    const second = f.storage.getConfiguration(f.projectIds[1]!);
    const { id: _id, project_id: _project, revision: _revision, created_at_ms: _created, ...configuration } = second.view.configuration;
    const mapping = structuredClone(first.view.configuration.github_project!);
    if (divergent) [mapping.status_option_ids.backlog, mapping.status_option_ids.ready] = [mapping.status_option_ids.ready, mapping.status_option_ids.backlog];
    f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: second.etag, projectId: f.projectIds[1]!,
      body: { project_changes: { github_project: mapping } }, configuration: { ...configuration, github_project: mapping }, globalChanges: {} });
    const result = await meter.observe('shared-board', 'display', () => f.read(context));
    expect(result.observation.complete).toBe(!divergent);
    expect(result.items).toHaveLength(20);
    expect(new Set(result.items.map(item => item.projectId)).size).toBe(2);
    expect(result.items.filter(item => item.projectId === f.projectIds[0]).every(item => item.eligible)).toBe(true);
    expect(result.items.filter(item => item.projectId === f.projectIds[1]).every(item => item.eligible)).toBe(!divergent);
    expect(sends.filter(send => send.startsWith('ProjectItems:'))).toHaveLength(1);
    expect(sends.filter(send => send.startsWith('QueueIssue:'))).toHaveLength(10);
    expect(meter.spans.filter(span => span.layer === 'graphql')).toHaveLength(25);
  }, { meter, wire: true, path: 'composed', controls: { sendOrder: sends } });
});
