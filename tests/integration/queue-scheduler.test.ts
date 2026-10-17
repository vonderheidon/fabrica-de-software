import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QueueCommand, QueueObservation } from '#contracts';
import { createQueue } from '../../apps/controller/src/modules/projects/index.js';
import { createPipeline } from '../../apps/controller/src/modules/pipeline/index.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { createGitHub } from '../../apps/controller/src/modules/github/index.js';
import { attemptFixture, complete, type AttemptFixture } from '../fixtures/attempt.js';
import { removeQueueSchedulerSchema } from '../fixtures/queue-schema.js';

const fixtures: AttemptFixture[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const f of fixtures.splice(0)) { await f.pipeline.close(); await f.close(); } });
async function fixture(enabled = true) {
  const f = await attemptFixture(); fixtures.push(f); await f.pipeline.close();
  const settings = f.storage.getGlobalConfiguration();
  if (enabled) f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: settings.etag, body: { changes: { automationEnabled: enabled } }, changes: { automationEnabled: enabled } });
  function automation(projectId: string, value: boolean) {
    const current = f.storage.getConfiguration(projectId);
    const { id: _id, projectId: _project, revision: _revision, createdAtMs: _created, ...configuration } = current.view.configuration;
    f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: current.etag, projectId,
      body: { projectChanges: { automationEnabled: value } }, configuration: { ...configuration, automationEnabled: value }, globalChanges: {} });
  }
  automation(f.projectId, true);
  vi.mocked(f.github.listProjectItems).mockResolvedValue(complete([{ id: 'ITEM_test', archived: false, kind: 'issue', contentId: f.issue.id, title: f.issue.title, url: f.issue.url, executable: true }]));
  const queue = createQueue({ storage: f.storage, github: f.github, hostName: 'test-host' });
  f.pipeline = createPipeline({ ...f.dependencies, github: f.github, queue });
  return { f, queue, automation };
}
function command(observation: QueueObservation, enabled: boolean): QueueCommand {
  return { enabled, scope: observation.scope, ...(observation.observationId ? { observationId: observation.observationId } : {}), ...(observation.summaryHash ? { authorizedSummaryHash: observation.summaryHash } : {}) };
}

describe('authorized queue changes', () => {
  it('requires the precondition and a current summary, then recovers the exact durable operation before another enable', async () => {
    const { f, queue } = await fixture(false); const before = await queue.observe({});
    const body = command(before.observation, true); const context = { operationId: randomUUID(), expectedRevision: before.etag };
    await expect(queue.save(body, { ...context, expectedRevision: undefined })).rejects.toMatchObject({ code: 'PRECONDITION_REQUIRED' });
    const { authorizedSummaryHash: _hash, ...withoutHash } = body;
    await expect(queue.save(withoutHash, context)).rejects.toMatchObject({ code: 'QUEUE_SUMMARY_CHANGED' });
    const saved = await queue.save(body, context);
    expect(saved.queue.enabled).toBe(true); expect(f.storage.getOperation(context.operationId)).toMatchObject({ kind: 'queue.update', state: 'succeeded', receipt: saved.receipt });
    const replay = await queue.save(body, context); expect(replay.receipt).toEqual(saved.receipt);
    await expect(queue.save({ ...body, scope: { kind: 'project', projectIds: [f.projectId] } }, context)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it.each(['count', 'mode', 'account', 'assignee'])('rejects an obsolete %s summary without enabling', async change => {
    const { f, queue } = await fixture(false); const before = await queue.observe({});
    if (change === 'count') vi.mocked(f.github.listProjectItems).mockResolvedValue(complete([]));
    if (change === 'mode') {
      const c = f.storage.getConfiguration(f.projectId); const { id: _id, projectId: _project, revision: _revision, createdAtMs: _created, ...configuration } = c.view.configuration;
      f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: c.etag, projectId: f.projectId,
        body: { projectChanges: { defaultDeliveryMode: 'pr' } }, configuration: { ...configuration, defaultDeliveryMode: 'pr' }, globalChanges: {} });
    }
    if (change === 'account') vi.mocked(f.github.getIdentity).mockResolvedValue(complete({ id: 'OTHER', login: 'other' }));
    if (change === 'assignee') f.issue.assignees = [];
    await expect(queue.save(command(before.observation, true), { operationId: randomUUID(), expectedRevision: before.etag }))
      .rejects.toMatchObject({ code: 'QUEUE_SUMMARY_CHANGED', current: { observation: { summaryHash: expect.any(String) } } });
    expect(f.storage.getSettings().automationEnabled).toBe(false);
  });

  it('changes several projects atomically, previews disabled candidates, and rolls back every project on event failure', async () => {
    const { f, queue, automation } = await fixture(); const other = f.register(); automation(f.projectId, false);
    const ids = [f.projectId, other].sort(); const query = { projectIds: ids.join(',') };
    const before = await queue.observe(query); expect(before.observation.eligibleTotal).toBe(2);
    const body = command(before.observation, true); const context = { operationId: randomUUID(), expectedRevision: before.etag };
    f.db.exec("CREATE TRIGGER fail_queue BEFORE INSERT ON events WHEN NEW.event_type='queue.updated' BEGIN SELECT RAISE(ABORT,'TEST'); END");
    await expect(queue.save(body, context)).rejects.toThrow();
    expect(ids.map(id => f.storage.getConfiguration(id).view.configuration.automationEnabled)).toEqual([false, false]);
    expect(f.storage.getOperation(context.operationId)).toBeNull();
    f.db.exec('DROP TRIGGER fail_queue'); const saved = await queue.save(body, context);
    expect(saved.queue.enabled).toBe(true); expect(ids.map(id => f.storage.getConfiguration(id).view.configuration.automationEnabled)).toEqual([true, true]);
    expect(saved.etag).not.toBe(before.etag);
    const paused = await queue.save(command(saved.queue, false), { operationId: randomUUID(), expectedRevision: saved.etag });
    expect(paused.queue.enabled).toBe(false); expect(f.storage.getSettings().automationEnabled).toBe(true);
  });

  it('returns the current summary and ETag on HTTP conflict and preserves CSRF protection', async () => {
    const { f } = await fixture(false); const github = { ...createGitHub(), ...f.github };
    const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_PORT: '4317', FACTORY_LOG_LEVEL: 'silent' }, f.directory),
      f.storage, undefined, { github, workspaces: f.workspaces }, undefined, f.pipeline);
    try {
      const base = { host: '127.0.0.1:4317', origin: 'http://127.0.0.1:4317', 'content-type': 'application/json', 'x-factory-client': 'web' };
      const session = await app.inject({ method: 'POST', url: '/api/v1/session', headers: base, payload: {} });
      const cookie = String(session.headers['set-cookie']).split(';')[0]!;
      const headers = { ...base, cookie, 'x-csrf-token': session.json<{ csrfToken: string }>().csrfToken };
      const before = await app.inject({ url: '/api/v1/queue', headers });
      const observed = before.json<QueueObservation>(); const body = command(observed, true);
      const denied = await app.inject({ method: 'PUT', url: '/api/v1/queue', headers: { ...headers, 'x-csrf-token': '', 'if-match': String(before.headers.etag), 'idempotency-key': randomUUID() }, payload: body });
      expect(denied.statusCode).toBe(403);
      vi.mocked(f.github.listProjectItems).mockResolvedValue(complete([]));
      const conflict = await app.inject({ method: 'PUT', url: '/api/v1/queue', headers: { ...headers, 'if-match': String(before.headers.etag), 'idempotency-key': randomUUID() }, payload: body });
      expect(conflict.statusCode).toBe(409); expect(conflict.json()).toMatchObject({ code: 'QUEUE_SUMMARY_CHANGED', queue: { eligibleTotal: 0 } });
      expect(conflict.headers.etag).toBeDefined();
    } finally { await app.close(); }
  });
});

describe('durable scheduler', () => {
  it.each(['queue_consumptions', 'rounds', 'events'])('rolls back consumption and attempt together on %s failure', async table => {
    const { f } = await fixture();
    const condition = table === 'events' ? " WHEN NEW.event_type='attempt.accepted'" : '';
    f.db.exec(`CREATE TRIGGER fail_consume BEFORE INSERT ON ${table}${condition} BEGIN SELECT RAISE(ABORT,'TEST'); END`);
    await f.pipeline.tick(); await f.pipeline.drain();
    expect(f.storage.listAttempts({}).items).toHaveLength(0); expect(f.db.prepare('SELECT count(*) AS n FROM queue_consumptions').get()).toEqual({ n: 0 });
    expect(f.storage.getQueueCycle('ACCOUNT_test', f.projectId, f.issue.id)?.consumedAttemptId).toBeNull();
    expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();
  });

  it('confirms consumption before effects and accepts only one concurrent tick; pause preserves its active attempt and history', async () => {
    const { f, queue } = await fixture(); const original = f.workspaces.prepareAttempt.getMockImplementation()!;
    f.workspaces.prepareAttempt.mockImplementation(async input => {
      expect(f.db.prepare('SELECT attempt_id FROM queue_consumptions').get()).toEqual({ attempt_id: input.attemptId });
      return original(input);
    });
    await Promise.all([f.pipeline.tick(), f.pipeline.tick(), f.pipeline.tick()]); await f.pipeline.drain();
    const first = f.storage.listAttempts({}).items[0]!; expect(first).toBeDefined(); expect(f.workspaces.prepareAttempt).toHaveBeenCalledOnce();
    const observed = await queue.observe({}); await queue.save(command(observed.observation, false), { operationId: randomUUID(), expectedRevision: observed.etag });
    expect(f.storage.getAttempt(first.id).result).toBeNull(); expect(f.execution.cancelAttempt).not.toHaveBeenCalled();
    expect(f.db.prepare('SELECT count(*) AS n FROM queue_consumptions').get()).toEqual({ n: 1 });
    expect(() => f.db.prepare('DELETE FROM queue_consumptions').run()).toThrow();
    expect(() => f.db.prepare("UPDATE attempts SET source='manual' WHERE id=?").run(first.id)).toThrow();
  });

  it('refuses a project pause that wins during the final start observations without consuming the candidate', async () => {
    const { f, automation } = await fixture(); f.observeTools.mockImplementation(async () => { automation(f.projectId, false); return structuredClone(f.tools); });
    await f.pipeline.tick(); await f.pipeline.drain();
    expect(f.storage.listAttempts({}).items).toHaveLength(0); expect(f.logFailure).toHaveBeenCalledWith('QUEUE_PAUSED');
    expect(f.storage.getQueueCycle('ACCOUNT_test', f.projectId, f.issue.id)?.consumedAttemptId).toBeNull();
  });

  it('rejects a degraded second observation and honors the supplied backoff deadline', async () => {
    const { f, queue } = await fixture(); await f.pipeline.close(); const observe = vi.fn(queue.observe);
    const first = await queue.observe({}); const base = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(base);
    observe.mockResolvedValueOnce(first).mockResolvedValue({ ...first, observation: { ...first.observation, complete: false, valid: false, polling: { ...first.observation.polling, nextPollAtMs: base + 120_000 } } });
    f.pipeline = createPipeline({ ...f.dependencies, queue: { observe } });
    await f.pipeline.tick(); await f.pipeline.drain(); expect(observe).toHaveBeenCalledTimes(2);
    clock.mockReturnValue(base + 60_000); await f.pipeline.tick(); expect(observe).toHaveBeenCalledTimes(2);
    expect(f.storage.listAttempts({}).items).toHaveLength(0); expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();
  });

  it('keeps a consumed residual Ready cycle after cancellation, response loss and reopening, then records only an observed eligible return', async () => {
    const { f } = await fixture(); const base = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(base);
    await f.pipeline.tick(); await f.pipeline.drain(); const first = f.storage.listAttempts({}).items[0]!;
    expect(f.storage.getOperation(f.storage.getAttempt(first.id).operationId)?.resource.id).toBe(first.id);
    f.persistence.recordCancellation(first.id, randomUUID()); await f.pipeline.close(); f.storage.close();
    const reopened = openStorage({ dataDirectory: f.directory });
    const queue = createQueue({ storage: reopened, github: f.github, hostName: 'test-host' });
    const pipeline = createPipeline({ ...f.dependencies, storage: reopened, queue });
    try {
      await pipeline.tick(); expect(reopened.listAttempts({}).items).toHaveLength(1);
      f.issue.memberships[0]!.statusValues[0]!.optionId = 'BACKLOG'; clock.mockReturnValue(base + 15_001); await pipeline.tick();
      f.issue.memberships[0]!.statusValues[0]!.optionId = 'READY'; f.issue.assignees = []; clock.mockReturnValue(base + 30_002); await pipeline.tick();
      expect(reopened.getQueueCycle('ACCOUNT_test', f.projectId, f.issue.id)?.cycleNumber).toBe(1);
      f.issue.assignees = [{ id: 'ACCOUNT_test', login: 'test-user' }]; clock.mockReturnValue(base + 45_003);
      // Observe rearm without borrowing the old fixture's closed storage for a new start.
      const observed = await queue.observe({}); reopened.recordQueueObservations(observed.items.map(item => ({ accountId: 'ACCOUNT_test', projectId: item.projectId, issueId: item.issueId!, ready: item.ready, eligible: item.readyEligible, existingAttemptId: item.attemptId })));
      expect(reopened.getQueueCycle('ACCOUNT_test', f.projectId, f.issue.id)).toMatchObject({ cycleNumber: 2, consumedAttemptId: null });
      expect(f.db.prepare('SELECT count(*) AS n FROM queue_consumptions').get()).toEqual({ n: 1 });
    } finally { await pipeline.close(); reopened.close(); }
  });

  it('migrates v15 with an actual consumed link and preserves receipts, identity and unknown Ready history', async () => {
    const { f } = await fixture(); await f.pipeline.tick(); await f.pipeline.drain(); const first = f.storage.listAttempts({}).items[0]!;
    const operationId = f.storage.getAttempt(first.id).operationId;
    const receipt = f.storage.getOperation(operationId); const identity = f.storage.getSettings().installationId;
    await f.pipeline.close(); f.storage.close(); removeQueueSchedulerSchema(f.db);
    const reopened = openStorage({ dataDirectory: f.directory });
    try {
      expect(reopened.getDiagnostics().schemaVersion).toBe(16); expect(reopened.getSettings().installationId).toBe(identity);
      expect(reopened.getOperation(operationId)?.receipt).toEqual(receipt?.receipt);
      expect(f.db.prepare('SELECT observed_cycle,attempt_id,ready_exit_observed_at_ms,ready_return_observed_at_ms FROM queue_consumptions').get())
        .toEqual({ observed_cycle: 1, attempt_id: first.id, ready_exit_observed_at_ms: null, ready_return_observed_at_ms: null });
      expect(f.db.pragma('foreign_key_check')).toEqual([]);
    } finally { reopened.close(); }
  });
});
