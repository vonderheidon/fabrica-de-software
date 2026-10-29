import { randomUUID } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HttpQueueObservation, QueueCommand, QueueObservation } from '#contracts';
import { createQueue } from '../../apps/controller/src/modules/projects/index.js';
import { createPipeline } from '../../apps/controller/src/modules/pipeline/index.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { createGitHub } from '../../apps/controller/src/modules/github/index.js';
import { createWorkspaces } from '../../apps/controller/src/modules/workspaces/index.js';
import { attemptFixture, complete, type AttemptFixture } from '../fixtures/attempt.js';
import { toHttpQueueObservation } from '../../apps/controller/src/http/observation-views.js';
import { QueuePanel } from '../../apps/web/src/features/queue/QueuePanel.js';
import { observationWire } from '../fixtures/observation-wire.js';
import { BackendMeasurement } from '../fixtures/backend-measurement.js';
import { createInspector } from '../../apps/controller/src/modules/workspaces/inspect.js';

const fixtures: AttemptFixture[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const f of fixtures.splice(0)) { await f.pipeline.close(); await f.close(); } });
async function fixture(enabled = true) {
  const f = await attemptFixture(); fixtures.push(f); await f.pipeline.close();
  const settings = f.storage.getGlobalConfiguration();
  if (enabled) f.storage.saveSettings({ operationId: randomUUID(), expectedRevision: settings.etag, body: { changes: { automation_enabled: enabled } }, changes: { automation_enabled: enabled } });
  function automation(projectId: string, value: boolean) {
    const current = f.storage.getConfiguration(projectId);
    const { id: _id, project_id: _project, revision: _revision, created_at_ms: _created, ...configuration } = current.view.configuration;
    f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: current.etag, projectId,
      body: { project_changes: { automation_enabled: value } }, configuration: { ...configuration, automation_enabled: value }, globalChanges: {} });
  }
  automation(f.projectId, true);
  vi.mocked(f.github.listProjectItems).mockResolvedValue(complete([{ id: 'ITEM_test', archived: false, kind: 'issue', contentId: f.issue.id, title: f.issue.title, url: f.issue.url, executable: true }]));
  const queue = createQueue({ storage: f.storage, github: f.github, workspaces: f.workspaces, hostName: 'test-host' });
  f.pipeline = createPipeline({ ...f.dependencies, github: f.github, queue });
  return { f, queue, automation };
}
it('shows invalid ticket content in the queue and avoids repeated automatic preparations', async () => {
  const { f, queue } = await fixture();
  f.issue.body = '## Parent\n#23\n## Acceptance criteria\n- Observable result';
  const observed = await queue.read({});
  expect(observed.items[0]).toMatchObject({ ready: true, eligible: false, reasons: ['ISSUE_OBJECTIVE_REQUIRED'] });
  await f.pipeline.tick(); await f.pipeline.drain();
  expect(f.db.prepare('SELECT count(*) AS n FROM preparations').get()).toEqual({ n: 0 });
  expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();
  f.issue.body = '## Parent\n#23\n## What to build\nConfigure installation.\n## Acceptance criteria\n- Settings persist.';
  expect((await queue.observe({})).items[0]).toMatchObject({ ready: true, eligible: true, reasons: [] });
});

function command(observation: QueueObservation, enabled: boolean): QueueCommand {
  return { enabled, scope: observation.scope, ...(observation.observationId ? { observationId: observation.observationId } : {}), ...(observation.summaryHash ? { authorizedSummaryHash: observation.summaryHash } : {}) };
}

it('observes an enabled registered source using the real origin request validator', async () => {
  const { f, queue } = await fixture();
  Object.assign(f.workspaces, createInspector({
    getRepository: vi.fn(async () => complete(f.issue.repository)),
    resolveBranch: vi.fn(async () => complete(f.observation.remote!.branch!)),
  }));
  const observed = await queue.observe({ projectId: f.projectId });
  expect(observed.observation.complete).toBe(true);
  expect(observed.observation.diagnostics.some(item => item.code === 'REMOTE_UNCONFIRMED')).toBe(false);
  expect(observed.observation.page.items.some(item => item.eligible)).toBe(true);
});

describe('authorized queue changes', () => {
  it.each(['none', 'account', 'assignee', 'status', 'criteria', 'configuration'] as const)(
    'keeps two fresh dispatch observations after grouped display and revalidates %s before effects', async change => {
      const { f, automation } = await fixture(); await f.pipeline.close();
      f.issue.memberships.push(...['extra-a', 'extra-b'].map(itemId => ({ ...structuredClone(f.issue.memberships[0]!), itemId, projectId: itemId })));
      const meter = new BackendMeasurement();
      const remote = observationWire({ issues: new Map([[f.issue.id, f.issue]]), projects: new Map([[f.project.project.id, f.project]]),
        items: new Map([[f.project.project.id, (await f.github.listProjectItems(f.project.project.id)).data!]]), pages: 1,
        account: () => 'ACCOUNT_test' }, meter);
      const queue = createQueue({ storage: f.storage, github: remote, workspaces: f.workspaces, hostName: 'test-host' });
      const warm = await queue.read({}); expect(warm.items[0]?.eligible).toBe(true);
      const trace: string[] = [];
      const record = f.storage.recordQueueObservations.bind(f.storage);
      vi.spyOn(f.storage, 'recordQueueObservations').mockImplementation(input => { trace.push('record'); return record(input); });
      const observe = vi.fn(async (query: Parameters<typeof queue.observe>[0]) => { trace.push('observe'); return queue.observe(query); });
      const mutate = () => {
        if (change === 'account') vi.mocked(f.github.getIdentity).mockResolvedValue(complete({ id: 'OTHER', login: 'other' }));
        if (change === 'assignee') f.issue.assignees = [];
        if (change === 'status') f.issue.memberships[0]!.statusValues[0]!.optionId = 'BACKLOG';
        if (change === 'criteria') f.issue.body += '\n- Newly added acceptance criterion';
        if (change === 'configuration') automation(f.projectId, false);
      };
      const preparations = { ...f.preparations, getPreparation: async (id: string) => {
        const prepared = await f.preparations.getPreparation(id); mutate(); return prepared;
      } };
      f.pipeline = createPipeline({ ...f.dependencies, preparations, github: f.github, queue: { observe } });
      await f.pipeline.tick(); await f.pipeline.drain();
      expect(trace.slice(0, 3)).toEqual(['observe', 'record', 'observe']);
      expect(observe).toHaveBeenCalledTimes(2);
      expect(f.workspaces.prepareAttempt).toHaveBeenCalledTimes(change === 'none' ? 1 : 0);
      expect(f.execution.startPassage).toHaveBeenCalledTimes(change === 'none' ? 1 : 0);
      expect(f.storage.listAttempts({}).items).toHaveLength(change === 'none' ? 1 : 0);
      expect(f.db.prepare('SELECT count(*) AS n FROM queue_consumptions').get()).toEqual({ n: change === 'none' ? 1 : 0 });
    },
  );
  it('explains a global pause and authorizes only confirmed projects while another enabled project is incomplete', async () => {
    const { f, queue, automation } = await fixture(false);
    const other = f.storage.registerProject({ operationId: randomUUID(), expectedRevision: undefined,
      body: { name: 'Projeto pendente', source: { kind: 'local', location: f.directory }, base_branch: 'main' },
      source: { kind: 'local', location: f.directory }, originNotes: [] }).resource.id;
    automation(other, true);
    const observed = await queue.observe({});
    expect(observed.observation).toMatchObject({ complete: false, valid: true, enabled: false, eligibleTotal: null });
    const noop = () => {};
    const html = renderToStaticMarkup(createElement(QueuePanel, {
      load: { status: 'ready', observation: toHttpQueueObservation(observed.observation), etag: observed.etag },
      pageNotice: '', pauseNotice: '', pauseUncertain: false, onConsultPause: noop, onRefresh: noop,
      onNextPage: noop, onPreviousPage: noop, canGoBack: false, pausing: false, onEnable: noop, onPause: noop, onAuthority: noop,
    }));
    expect(html).toContain('Fila global pausada');
    expect(html).toContain('Projeto pendente');
    expect(html).toContain('Aguardando habilitação');
    expect(html).toContain('Os candidatos confirmados dos demais continuam disponíveis');
    expect(html).toContain('class="primary">Habilitar fila</button>');
    expect(html).not.toContain('PROJECT_NOT_READY');
    const saved = await queue.save(command(observed.observation, true), { operationId: randomUUID(), expectedRevision: observed.etag });
    expect(saved.queue).toMatchObject({ enabled: true, complete: false, valid: true });
  });

  it('shares display reads but always reads again for authority observations', async () => {
    const { f, queue } = await fixture(false);
    const identity = vi.mocked(f.github.getIdentity);
    await Promise.all([queue.read({}), queue.read({})]);
    expect(identity).toHaveBeenCalledTimes(2);
    await queue.read({});
    expect(identity).toHaveBeenCalledTimes(2);
    await queue.observe({});
    expect(identity).toHaveBeenCalledTimes(4);
  });
  it('expires display observations and invalidates them after local configuration changes', async () => {
    const { f, queue, automation } = await fixture(false);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
    const first = await queue.read({});
    first.observation.page.items.length = 0;
    expect((await queue.read({})).observation.page.items).toHaveLength(1);
    const identity = vi.mocked(f.github.getIdentity);
    automation(f.projectId, false);
    expect((await queue.read({})).observation.page.items).toHaveLength(0);
    expect(identity).toHaveBeenCalledTimes(4);
    clock.mockReturnValue(Date.now() + 10_001);
    await queue.read({});
    expect(identity).toHaveBeenCalledTimes(6);
  });
  it('bounds simultaneous issue reads and preserves every row in board order', async () => {
    const { f, queue } = await fixture();
    vi.mocked(f.github.listProjectItems).mockResolvedValue(complete(Array.from({ length: 7 }, (_, i) => ({ id: `ITEM_${i}`, contentId: `I_${i}`, archived: false, kind: 'issue' as const, title: 'Issue', url: f.issue.url, executable: true }))));
    let active = 0; let peak = 0;
    vi.mocked(f.github.getIssueContextById).mockImplementation(async (id) => {
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      return complete({ ...structuredClone(f.issue), id });
    });
    const result = await queue.observe({});
    expect(peak).toBe(3);
    expect(result.items).toHaveLength(7);
  });
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
      const c = f.storage.getConfiguration(f.projectId); const { id: _id, project_id: _project, revision: _revision, created_at_ms: _created, ...configuration } = c.view.configuration;
      f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: c.etag, projectId: f.projectId,
        body: { project_changes: { default_delivery_mode: 'pr' } }, configuration: { ...configuration, default_delivery_mode: 'pr' }, globalChanges: {} });
    }
    if (change === 'account') vi.mocked(f.github.getIdentity).mockResolvedValue(complete({ id: 'OTHER', login: 'other' }));
    if (change === 'assignee') f.issue.assignees = [];
    await expect(queue.save(command(before.observation, true), { operationId: randomUUID(), expectedRevision: before.etag }))
      .rejects.toMatchObject({ code: 'QUEUE_SUMMARY_CHANGED', current: { observation: { summaryHash: expect.any(String) } } });
    expect(f.storage.getSettings().automation_enabled).toBe(false);
  });

  it('changes several projects atomically, previews disabled candidates, and rolls back every project on event failure', async () => {
    const { f, queue, automation } = await fixture(); const other = f.register(); automation(f.projectId, false);
    const ids = [f.projectId, other].sort(); const query = { projectIds: ids.join(',') };
    const before = await queue.observe(query); expect(before.observation.eligibleTotal).toBe(2);
    const body = command(before.observation, true); const context = { operationId: randomUUID(), expectedRevision: before.etag };
    f.db.exec("CREATE TRIGGER fail_queue BEFORE INSERT ON events WHEN NEW.event_type='queue.updated' BEGIN SELECT RAISE(ABORT,'TEST'); END");
    await expect(queue.save(body, context)).rejects.toThrow();
    expect(ids.map(id => f.storage.getConfiguration(id).view.configuration.automation_enabled)).toEqual([false, false]);
    expect(f.storage.getOperation(context.operationId)).toBeNull();
    f.db.exec('DROP TRIGGER fail_queue'); const saved = await queue.save(body, context);
    expect(saved.queue.enabled).toBe(true); expect(ids.map(id => f.storage.getConfiguration(id).view.configuration.automation_enabled)).toEqual([true, true]);
    expect(saved.etag).not.toBe(before.etag);
    const paused = await queue.save(command(saved.queue, false), { operationId: randomUUID(), expectedRevision: saved.etag });
    expect(paused.queue.enabled).toBe(false); expect(f.storage.getSettings().automation_enabled).toBe(true);
  });

  it('returns the current summary and ETag on HTTP conflict and preserves CSRF protection', async () => {
    const { f } = await fixture(false); const github = { ...createGitHub(), ...f.github };
    const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_PORT: '4317', FACTORY_LOG_LEVEL: 'silent' }, f.directory),
      f.storage, undefined, { github, workspaces: f.workspaces }, undefined, f.pipeline);
    try {
      const base = { host: '127.0.0.1:4317', origin: 'http://127.0.0.1:4317', 'content-type': 'application/json', 'x-factory-client': 'web' };
      const session = await app.inject({ method: 'POST', url: '/api/v1/session', headers: base, payload: {} });
      const cookie = String(session.headers['set-cookie']).split(';')[0]!;
      const headers = { ...base, cookie, 'x-csrf-token': session.json<{ csrf_token: string }>().csrf_token };
      const before = await app.inject({ url: '/api/v1/queue', headers });
      const observed = before.json<HttpQueueObservation>(); const body = { enabled: true, scope: observed.scope, observation_id: observed.observation_id, authorized_summary_hash: observed.summary_hash };
      const denied = await app.inject({ method: 'PUT', url: '/api/v1/queue', headers: { ...headers, 'x-csrf-token': '', 'if-match': String(before.headers.etag), 'idempotency-key': randomUUID() }, payload: body });
      expect(denied.statusCode).toBe(403);
      vi.mocked(f.github.listProjectItems).mockResolvedValue(complete([]));
      const conflict = await app.inject({ method: 'PUT', url: '/api/v1/queue', headers: { ...headers, 'if-match': String(before.headers.etag), 'idempotency-key': randomUUID() }, payload: body });
      expect(conflict.statusCode).toBe(409); expect(conflict.json()).toMatchObject({ code: 'QUEUE_SUMMARY_CHANGED', queue: { eligible_total: 0 } });
      expect(conflict.headers.etag).toBeDefined();
    } finally { await app.close(); }
  });
});

describe('durable scheduler', () => {
  it('requires a complete project observation before enabling that project', async () => {
    const { f, queue, automation } = await fixture(); automation(f.projectId, false);
    vi.mocked(f.github.listProjectItems).mockResolvedValue({ state: 'partial', data: [], retryAtMs: null, diagnostics: [] });
    const observed = await queue.observe({ projectId: f.projectId });
    expect(observed.observation).toMatchObject({ complete: false, valid: false });
    await expect(queue.save(command(observed.observation, true), { operationId: randomUUID(), expectedRevision: observed.etag }))
      .rejects.toMatchObject({ code: 'QUEUE_SUMMARY_CHANGED' });
    expect(f.storage.getConfiguration(f.projectId).view.configuration.automation_enabled).toBe(false);
  });

  it.each(['remote', 'published_base', 'board'] as const)('does not enable or dispatch a Ready issue with missing %s readiness', async missing => {
    const { f, queue, automation } = await fixture(false);
    automation(f.projectId, false);
    if (missing === 'remote') {
      f.observation.remote = null;
      f.observation.diagnostics.push({ code: 'REMOTE_MISSING', message: 'No remote.', recovery: 'Configure remote.' });
    }
    if (missing === 'published_base') f.observation.remote!.branch!.sha = 'b'.repeat(40);
    if (missing === 'board') {
      const current = f.storage.getConfiguration(f.projectId);
      const { id: _id, project_id: _project, revision: _revision, created_at_ms: _created, ...configuration } = current.view.configuration;
      f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: current.etag, projectId: f.projectId,
        body: { project_changes: { github_project: null } }, configuration: { ...configuration, github_project: null }, globalChanges: {} });
    }
    const observed = await queue.observe({ projectId: f.projectId });
    expect(observed.observation).toMatchObject({ complete: false, valid: false });
    const expected = missing === 'remote' ? 'REMOTE_UNCONFIRMED' : missing === 'published_base' ? 'CODE_NOT_PUBLISHED' : 'PROJECT_REQUIRED';
    expect(observed.observation.diagnostics.map(item => item.code)).toContain(expected);
    await expect(queue.save(command(observed.observation, true), { operationId: randomUUID(), expectedRevision: observed.etag }))
      .rejects.toMatchObject({ code: 'QUEUE_SUMMARY_CHANGED' });
    await f.pipeline.tick(); await f.pipeline.drain();
    expect(f.storage.getConfiguration(f.projectId).view.configuration.automation_enabled).toBe(false);
    expect(f.storage.listAttempts({}).items).toHaveLength(0);
    expect(f.db.prepare('SELECT count(*) AS n FROM queue_consumptions').get()).toEqual({ n: 0 });
    expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();
    expect(f.execution.startPassage).not.toHaveBeenCalled();
  });

  it.each(['remote', 'published_base', 'board'] as const)('does not dispatch an already enabled Ready issue while %s readiness is missing', async missing => {
    const { f } = await fixture(true);
    if (missing === 'remote') {
      f.observation.remote = null;
      f.observation.diagnostics.push({ code: 'REMOTE_MISSING', message: 'No remote.', recovery: 'Configure remote.' });
    }
    if (missing === 'published_base') f.observation.remote!.branch!.sha = 'b'.repeat(40);
    if (missing === 'board') {
      const current = f.storage.getConfiguration(f.projectId);
      const { id: _id, project_id: _project, revision: _revision, created_at_ms: _created, ...configuration } = current.view.configuration;
      f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: current.etag, projectId: f.projectId,
        body: { project_changes: { github_project: null } }, configuration: { ...configuration, github_project: null }, globalChanges: {} });
    }
    await f.pipeline.tick(); await f.pipeline.drain();
    expect(f.storage.getSettings().automation_enabled).toBe(true);
    expect(f.storage.getConfiguration(f.projectId).view.configuration.automation_enabled).toBe(true);
    expect(f.storage.listAttempts({}).items).toHaveLength(0);
    expect(f.db.prepare('SELECT count(*) AS n FROM queue_consumptions').get()).toEqual({ n: 0 });
    expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();
    expect(f.execution.startPassage).not.toHaveBeenCalled();
  });

  it('keeps shared identity failures blocking every project', async () => {
    const { f, queue, automation } = await fixture(); automation(f.register(), true);
    vi.mocked(f.github.getIdentity).mockResolvedValue({ state: 'authentication_invalid', data: null, retryAtMs: null, diagnostics: [] });
    expect((await queue.observe({})).observation).toMatchObject({ complete: false, valid: false });
    await f.pipeline.tick(); await f.pipeline.drain();
    expect(f.storage.listAttempts({}).items).toHaveLength(0);
    expect(f.execution.startPassage).not.toHaveBeenCalled();
  });

  it('blocks all rows from a partially read project without consuming or rearming their cycles', async () => {
    const { f, queue } = await fixture();
    const original = await f.github.listProjectItems('PVT_test');
    vi.mocked(f.github.listProjectItems).mockResolvedValue({ ...original, state: 'partial' });
    const observed = await queue.observe({});
    expect(observed.items).toHaveLength(1);
    expect(observed.items[0]).toMatchObject({ eligible: false, readyEligible: false, reasons: expect.arrayContaining(['READ_INCOMPLETE']) });
    await f.pipeline.tick(); await f.pipeline.drain();
    expect(f.storage.getQueueCycle('ACCOUNT_test', f.projectId, f.issue.id)).toBeNull();
    expect(f.storage.listAttempts({}).items).toHaveLength(0);
  });

  it('starts an eligible project despite disabled incomplete registrations', async () => {
    const { f, queue } = await fixture();
    f.storage.registerProject({ operationId: randomUUID(), expectedRevision: undefined,
      body: { name: 'Incomplete test', source: { kind: 'local', location: f.directory }, base_branch: 'main' },
      source: { kind: 'local', location: f.directory }, originNotes: [] });
    const observed = await queue.observe({});
    expect(observed.observation.complete).toBe(true);
    expect(observed.items).toHaveLength(1);
    await f.pipeline.tick(); await f.pipeline.drain();
    expect(f.storage.listAttempts({}).items).toHaveLength(1);
    expect(f.execution.startPassage).toHaveBeenCalledOnce();
  });

  it('isolates an unavailable enabled project and its retry deadline from a healthy project', async () => {
    const { f, queue, automation } = await fixture(); const other = f.register(); automation(other, true);
    const current = f.storage.getConfiguration(other);
    const { id: _id, project_id: _project, revision: _revision, created_at_ms: _created, ...configuration } = current.view.configuration;
    const mapping = { ...configuration.github_project!, id: 'UNAVAILABLE_BOARD' } as import('#contracts').ProjectMapping;
    f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: current.etag, projectId: other,
      body: { project_changes: { github_project: mapping } }, configuration: { ...configuration, github_project: mapping }, globalChanges: {} });
    const original = vi.mocked(f.github.listProjectItems).getMockImplementation()!;
    vi.mocked(f.github.listProjectItems).mockImplementation(async id => id === mapping.id
      ? { state: 'inaccessible', data: null, retryAtMs: Date.now() + 120_000, diagnostics: [] } : original(id));
    const observed = await queue.observe({});
    expect(observed.observation.complete).toBe(false);
    expect(observed.observation.valid).toBe(true);
    expect(observed.observation.diagnostics).toContainEqual(expect.objectContaining({ code: 'PROJECT_QUEUE_BLOCKED' }));
    expect(observed.items.filter(item => item.eligible).map(item => item.projectId)).toEqual([f.projectId]);
    await f.pipeline.tick(); await f.pipeline.drain();
    expect(f.storage.listAttempts({}).items).toHaveLength(1);
    expect(f.execution.startPassage).toHaveBeenCalledOnce();
  });

  it('keeps candidates visible while global automation is paused without starting', async () => {
    const { f, queue } = await fixture(false);
    const observed = await queue.observe({});
    expect(observed.observation.enabled).toBe(false);
    expect(observed.items[0]?.eligible).toBe(true);
    expect(observed.observation.diagnostics).toContainEqual(expect.objectContaining({ code: 'GLOBAL_AUTOMATION_PAUSED' }));
    await f.pipeline.tick(); await f.pipeline.drain();
    expect(f.storage.listAttempts({}).items).toHaveLength(0);
    expect(f.execution.startPassage).not.toHaveBeenCalled();
  });

  it.each(['account', 'assignee', 'status'])('applies existing authority governance to an automatic attempt after %s changes', async kind => {
    const { f, queue } = await fixture(); await f.pipeline.close();
    const github = { ...createGitHub(), ...f.github, getRepository: vi.fn(async () => complete(structuredClone(f.issue.repository))),
      mutateEffect: vi.fn(async () => ({ state: 'failed_known' as const, receipt: null, reason: 'TEST_PROJECTION_FAILED', retryAtMs: null })) };
    const workspaces = { ...createWorkspaces({ github }), ...f.workspaces };
    f.pipeline = createPipeline({ ...f.dependencies, github, queue, workspaces, publication: { github, workspaces } });
    const base = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(base);
    await f.pipeline.tick(); await f.pipeline.drain(); const first = f.storage.listAttempts({}).items[0]!;
    expect(first).toBeDefined(); expect(f.execution.startPassage).toHaveBeenCalledOnce();
    expect(f.storage.getEffects(first.id)[0]?.state).toBe('failed_known');
    const calls = github.mutateEffect.mock.calls.length;
    if (kind === 'account') vi.mocked(github.getIdentity).mockResolvedValue(complete({ id: 'OTHER', login: 'other' }));
    if (kind === 'assignee') f.issue.assignees = [];
    if (kind === 'status') f.issue.memberships[0]!.statusValues[0]!.optionId = 'BACKLOG';
    clock.mockReturnValue(base + 15_001); await f.pipeline.tick(); await f.pipeline.drain();
    const current = f.storage.getAttempt(first.id);
    if (kind === 'assignee') { expect(current.result).toBe('cancelled'); expect(f.execution.cancelAttempt).toHaveBeenCalled(); }
    else expect(current.suspension).toBe(kind === 'account' ? 'ACCOUNT_CHANGED' : 'KANBAN_DIVERGENCE');
    if (kind === 'account') expect(f.db.prepare('SELECT dispatch_paused FROM controller_authority').get()).toEqual({ dispatch_paused: 1 });
    expect(github.mutateEffect).toHaveBeenCalledTimes(calls); expect(f.storage.listAttempts({}).items).toHaveLength(1);
    expect(f.db.prepare('SELECT count(*) AS n FROM queue_consumptions').get()).toEqual({ n: 1 });
  });

  it('does not execute the same residual Ready cycle through a duplicate project registration', async () => {
    const { f, automation } = await fixture(); const duplicate = f.register(); automation(duplicate, true);
    const base = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(base);
    await f.pipeline.tick(); await f.pipeline.drain(); const first = f.storage.listAttempts({}).items[0]!;
    expect(f.storage.getQueueCycle('ACCOUNT_test', duplicate, f.issue.id)?.consumedAttemptId).toBe(first.id);
    expect(f.storage.getQueueCycle('ACCOUNT_test', f.projectId, f.issue.id)?.consumedAttemptId).toBe(first.id);
    f.persistence.recordCancellation(first.id, randomUUID()); clock.mockReturnValue(base + 15_001);
    await f.pipeline.tick(); await f.pipeline.drain(); expect(f.storage.listAttempts({}).items).toHaveLength(1);
    expect(f.db.prepare('SELECT count(*) AS n FROM queue_consumptions').get()).toEqual({ n: 1 });
  });

  it('enforces automatic account concurrency in SQLite even for a different issue', async () => {
    const { f } = await fixture(); await f.pipeline.tick(); await f.pipeline.drain(); const first = f.storage.listAttempts({}).items[0]!;
    const operationId = f.storage.getAttempt(first.id).operationId;
    expect(f.db.prepare('SELECT source FROM attempts WHERE id=?').get(first.id)).toEqual({ source: 'automatic' });
    const duplicate = () => f.db.transaction(() => {
      const op = randomUUID(); const id = randomUUID();
      f.db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json)
        SELECT ?,installation_id,account_id,operation_kind,resource_type,?,request_hash,expected_revision_json,receipt_json FROM operation_requests WHERE operation_id=?`).run(op, id, operationId);
      f.db.prepare(`INSERT INTO attempts(id,operation_id,project_id,project_revision_id,preparation_id,preparation_revision,account_id,repository_id,issue_id,issue_number,issue_title,capture_json,phase,suspension,diagnostic,created_at_ms,updated_at_ms,source)
        SELECT ?,?,project_id,project_revision_id,preparation_id,preparation_revision,account_id,repository_id,'OTHER_ISSUE',issue_number,issue_title,capture_json,'preparing',NULL,NULL,created_at_ms,updated_at_ms,'automatic' FROM attempts WHERE id=?`).run(id, op, first.id);
    })();
    expect(duplicate).toThrow('UNIQUE constraint failed: attempts.account_id');
    expect(f.storage.listAttempts({}).items).toHaveLength(1);
  });

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
    await f.pipeline.close();
    f.issue.memberships.push(...['extra-a', 'extra-b'].map(itemId => ({ ...structuredClone(f.issue.memberships[0]!), itemId, projectId: itemId })));
    let grouped = 0;
    const remote = observationWire({ issues: new Map([[f.issue.id, f.issue]]), projects: new Map([[f.project.project.id, f.project]]),
      items: new Map([[f.project.project.id, (await f.github.listProjectItems(f.project.project.id)).data!]]), pages: 1,
      account: () => 'ACCOUNT_test' }, new BackendMeasurement(), { afterSend: async operation => { if (operation === 'GroupedValues') grouped++; } });
    const displayQueue = createQueue({ storage: f.storage, github: remote, workspaces: f.workspaces, hostName: 'test-host' });
    await displayQueue.read({}); expect(grouped).toBe(1);
    f.pipeline = createPipeline({ ...f.dependencies, github: f.github, queue: displayQueue });
    await f.pipeline.tick(); await f.pipeline.drain(); const first = f.storage.listAttempts({}).items[0]!;
    const commandsBefore = { workspace: f.workspaces.prepareAttempt.mock.calls.length, passage: vi.mocked(f.execution.startPassage).mock.calls.length };
    expect(commandsBefore).toEqual({ workspace: 1, passage: 1 });
    expect(f.storage.getOperation(f.storage.getAttempt(first.id).operationId)?.resource.id).toBe(first.id);
    f.persistence.recordCancellation(first.id, randomUUID()); await f.pipeline.close(); f.storage.close();
    const reopened = openStorage({ dataDirectory: f.directory });
    const queue = createQueue({ storage: reopened, github: remote, workspaces: f.workspaces, hostName: 'test-host' });
    const pipeline = createPipeline({ ...f.dependencies, storage: reopened, queue });
    try {
      const beforeReads = grouped;
      await pipeline.tick(); expect(reopened.listAttempts({}).items).toHaveLength(1);
      expect(grouped).toBeGreaterThan(beforeReads);
      expect(f.workspaces.prepareAttempt).toHaveBeenCalledTimes(commandsBefore.workspace);
      expect(f.execution.startPassage).toHaveBeenCalledTimes(commandsBefore.passage);
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

  it('preserves queue receipts and history when reopening the current schema', async () => {
    const { f } = await fixture(true); await f.pipeline.tick(); await f.pipeline.drain(); const first = f.storage.listAttempts({}).items[0]!;
    const operationId = f.storage.getAttempt(first.id).operationId;
    const receipt = f.storage.getOperation(operationId); const identity = f.storage.getSettings().installation_id;
    await f.pipeline.close(); f.storage.close();
    const reopened = openStorage({ dataDirectory: f.directory });
    try {
    ; expect(reopened.getSettings().installation_id).toBe(identity);
      expect(reopened.getOperation(operationId)?.receipt).toEqual(receipt?.receipt);
      expect(f.db.prepare('SELECT observed_cycle,attempt_id,ready_exit_observed_at_ms,ready_return_observed_at_ms FROM queue_consumptions').get())
        .toEqual({ observed_cycle: 1, attempt_id: first.id, ready_exit_observed_at_ms: null, ready_return_observed_at_ms: null });
      expect(f.db.pragma('foreign_key_check')).toEqual([]);
    } finally { reopened.close(); }
  });
});
