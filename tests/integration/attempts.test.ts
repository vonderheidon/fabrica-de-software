import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { AttemptCapture, OperationAccepted, type SessionResponse } from '#contracts';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { attemptFixture, complete, type AttemptFixture } from '../fixtures/attempt.js';

const fixtures: AttemptFixture[] = [];
const apps: ReturnType<typeof createApp>[] = [];
async function fixture() { const f = await attemptFixture(); fixtures.push(f); return f; }
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const f of fixtures.splice(0)) await f.close();
});
async function start(f: AttemptFixture) {
  const command = await f.prepare(); const operation = await f.pipeline.startAttempt(command.body, command.context);
  await f.pipeline.drain();
  return { ...command, operation, id: operation.resource.id, status: f.storage.getAttempt(operation.resource.id), capture: f.storage.getAttemptCapture(operation.resource.id) };
}

describe('manual attempt composition and HTTP', () => {
  it('commits capture, criteria, round, passage and resource intentions before any clone or process', async () => {
    const f = await fixture(); const command = await f.prepare();
    f.workspaces.prepareAttempt.mockImplementationOnce(async input => {
      const a = f.storage.getAttempt(input.attemptId);
      expect(f.storage.getOperation(command.context.operationId)?.receipt).toBeDefined();
      expect(f.db.prepare('SELECT count(*) AS n FROM attempt_criteria WHERE attempt_id=?').get(a.id)).toEqual({ n: 2 });
      expect(f.db.prepare('SELECT count(*) AS n FROM rounds WHERE attempt_id=?').get(a.id)).toEqual({ n: 1 });
      expect(f.db.prepare('SELECT count(*) AS n FROM resources WHERE attempt_id=?').get(a.id)).toEqual({ n: 2 });
      expect(f.storage.getAttemptCapture(a.id).roleResources).toEqual(f.roles);
      expect(f.execution.startPassage).not.toHaveBeenCalled();
      return { state: 'prepared', attemptId: a.id, baseSha: input.baseSha, branch: `factory/17/${a.id}`,
        resource: { kind: 'implementation', path: join(f.directory, 'work', a.id, 'implementation'), owned: true }, diagnostic: null };
    });
    const operation = await f.pipeline.startAttempt(command.body, command.context);
    expect(operation.state).toBe('accepted'); expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();
    await f.pipeline.drain();
    expect(f.storage.getAttempt(operation.resource.id)).toMatchObject({ phase: 'implementing', result: null, suspension: null, tracking: 'tracked', round: 1 });
    expect(f.execution.startPassage).toHaveBeenCalledTimes(1);
    expect(f.execution.preflight).not.toHaveBeenCalled();
    const capture = f.storage.getAttemptCapture(operation.resource.id);
    expect(Value.Check(AttemptCapture, capture)).toBe(true);
    expect(capture.criteria.map(c => c.id)).toEqual(['ac-1', 'ac-2']);
    expect(capture.configuration.origins).toMatchObject({ checks: 'project', timeDefaults: 'global', deliveryMode: 'preparation' });
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
  });
  it('returns 202 and Location without awaiting a clone, then recovers a lost response before new IO', async () => {
    const f = await fixture();
    const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory), f.storage,
      undefined, undefined, { github: f.github, workspaces: f.workspaces }, f.pipeline); apps.push(app);
    const command = await f.prepare();
    const host = '127.0.0.1:4310'; const origin = `http://${host}`;
    const bootstrap = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin, 'content-type': 'application/json', 'x-factory-client': 'web' }, payload: {} });
    const headers = { host, origin, 'content-type': 'application/json', cookie: String(bootstrap.headers['set-cookie']).split(';')[0]!,
      'x-csrf-token': bootstrap.json<SessionResponse>().csrfToken, 'idempotency-key': command.context.operationId, 'if-match': command.context.expectedRevision };
    let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
    const original = f.workspaces.prepareAttempt.getMockImplementation()!;
    f.workspaces.prepareAttempt.mockImplementationOnce(async input => { await wait; return original(input); });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/v1/attempts', headers, payload: command.body });
      expect(response.statusCode, response.body).toBe(202); expect(Value.Check(OperationAccepted, response.json())).toBe(true);
      expect(response.headers.location).toBe(`/api/v1/operations/${command.context.operationId}`);
      const attempts = f.db.prepare('SELECT count(*) AS n FROM attempts').get();
      const replay = await app.inject({ method: 'POST', url: '/api/v1/attempts', headers, payload: command.body });
      expect(replay.statusCode).toBe(202); expect(replay.json<OperationAccepted>().receipt).toEqual(response.json<OperationAccepted>().receipt);
      expect(f.db.prepare('SELECT count(*) AS n FROM attempts').get()).toEqual(attempts);
      expect(f.observeTools).toHaveBeenCalledTimes(1);
      const get = await app.inject({ url: String(response.headers.location), headers: { host, cookie: headers.cookie } });
      expect(get.statusCode).toBe(200); expect(get.json().resource).toEqual(response.json().resource);
      expect((await app.inject({ method: 'POST', url: '/api/v1/attempts', headers: { ...headers, 'x-csrf-token': '' }, payload: command.body })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: '/api/v1/attempts', headers, payload: { ...command.body, extra: 'secret-marker' } })).statusCode).toBe(400);
    } finally { release(); await f.pipeline.drain(); }
    const id = f.storage.getOperation(command.context.operationId)!.resource.id;
    const detail = await app.inject({ url: `/api/v1/attempts/${id}`, headers: { host, cookie: headers.cookie } });
    expect(detail.statusCode).toBe(200); expect(detail.headers.etag).toBeDefined(); expect(detail.body).not.toContain('capture_json');
    const second = await f.prepare(f.register());
    const conflict = await app.inject({ method: 'POST', url: '/api/v1/attempts', headers: { ...headers, 'idempotency-key': second.context.operationId, 'if-match': second.context.expectedRevision }, payload: second.body });
    expect(conflict.statusCode, conflict.body).toBe(409); expect(conflict.json()).toMatchObject({ code: 'ATTEMPT_ACTIVE', resource: { type: 'attempt', id } });
  });
  it('serializes simultaneous starts across duplicate project registrations by account/repository/issue', async () => {
    const f = await fixture(); const a = await f.prepare(); const b = await f.prepare(f.register());
    const results = await Promise.allSettled([f.pipeline.startAttempt(a.body, a.context), f.pipeline.startAttempt(b.body, b.context)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'ATTEMPT_ACTIVE', resource: { type: 'attempt' } } });
    await f.pipeline.drain(); expect(f.workspaces.prepareAttempt).toHaveBeenCalledTimes(1); expect(f.execution.startPassage).toHaveBeenCalledTimes(1);
  });
  it.each(['icr', 'commit', 'pr'] as const)('revalidates Ready and all authority prerequisites for %s', async mode => {
    const f = await fixture(); const p = await f.prepare();
    const updated = await f.preparations.updatePreparation(p.body.preparationId, { changes: { deliveryMode: mode } }, { operationId: randomUUID(), expectedRevision: p.context.expectedRevision });
    const body = { ...p.body, preparationRevision: 2, authorizedSummaryHash: updated.view.preparation.summaryHash };
    f.issue.assignees.push({ id: 'OTHER', login: 'other' });
    await expect(f.pipeline.startAttempt(body, { operationId: randomUUID(), expectedRevision: updated.etag })).rejects.toMatchObject({ code: 'SUMMARY_CHANGED' });
    const current = await f.preparations.getPreparation(p.body.preparationId);
    await expect(f.pipeline.startAttempt({ ...body, authorizedSummaryHash: current.view.preparation.summaryHash }, { operationId: randomUUID(), expectedRevision: updated.etag })).rejects.toMatchObject({ code: 'START_PREREQUISITES' });
    expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled();
  });
  it.each(['closed', 'ready', 'project', 'membership', 'remote', 'base', 'dependency', 'account', 'partial'] as const)('refuses invalid %s observations before effects', async target => {
    const f = await fixture();
    if (target === 'closed') f.issue.state = 'CLOSED';
    if (target === 'ready') f.issue.memberships[0]!.statusValues[0]!.optionId = 'PROGRESS';
    if (target === 'project') f.project.project.closed = true;
    if (target === 'membership') f.issue.memberships = [];
    if (target === 'remote') f.observation.remote!.confirmed = false;
    if (target === 'base') f.observation.remote!.branch!.sha = 'b'.repeat(40);
    if (target === 'dependency') f.issue.blockers.push({ id: 'I_block', number: 4, title: 'Blocker', url: 'https://github.com/test-org/repo/issues/4', state: 'OPEN' });
    if (target === 'account') vi.mocked(f.github.getIdentity).mockResolvedValue(complete({ id: 'OTHER', login: 'other' }));
    if (target === 'partial') vi.mocked(f.github.getIdentity).mockResolvedValue({ state: 'partial', data: null, diagnostics: [], retryAtMs: null });
    const c = await f.prepare(); await expect(f.pipeline.startAttempt(c.body, c.context)).rejects.toMatchObject({ code: 'START_PREREQUISITES' });
    expect(f.db.prepare('SELECT count(*) AS n FROM attempts').get()).toEqual({ n: 0 }); expect(f.execution.startPassage).not.toHaveBeenCalled();
  });
  it('rejects stale CAS, missing precondition and conflicting operation contents', async () => {
    const f = await fixture(); const c = await f.prepare();
    await expect(f.pipeline.startAttempt(c.body, { ...c.context, expectedRevision: undefined })).rejects.toMatchObject({ statusCode: 428 });
    await expect(f.pipeline.startAttempt(c.body, { ...c.context, expectedRevision: 'stale' })).rejects.toMatchObject({ statusCode: 412 });
    await f.pipeline.startAttempt(c.body, c.context);
    await expect(f.pipeline.startAttempt({ ...c.body, authorizedSummaryHash: 'b'.repeat(64) }, c.context)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await f.pipeline.drain(); expect(f.workspaces.prepareAttempt).toHaveBeenCalledTimes(1);
  });
  it('rechecks configuration after version observation and revalidates authority again after clone', async () => {
    const f = await fixture(); const c = await f.prepare();
    f.observeTools.mockImplementationOnce(async () => {
      f.storage.saveTimeDefaults({ operationId: randomUUID(), expectedRevision: f.storage.getSettingsETag(), timeDefaults: f.storage.getSettings().timeDefaults }); return f.tools;
    });
    await expect(f.pipeline.startAttempt(c.body, c.context)).rejects.toMatchObject({ statusCode: 412 });
    const original = f.workspaces.prepareAttempt.getMockImplementation()!;
    f.workspaces.prepareAttempt.mockImplementationOnce(async input => { f.issue.assignees = []; return original(input); });
    const a = await start(f);
    expect(f.storage.getAttempt(a.id)).toMatchObject({ phase: 'preparing', result: null, suspension: 'DISPATCH_FAILED', diagnostic: 'SUMMARY_CHANGED' });
    expect(f.execution.startPassage).not.toHaveBeenCalled();
    expect(f.db.prepare("SELECT owned,launch_state FROM resources WHERE attempt_id=? AND kind='implementation'").get(a.id)).toEqual({ owned: 1, launch_state: 'ready' });
  });
  it('refuses missing role contracts and records unobservable versions with pending requirements before effects', async () => {
    const f = await fixture(); const c = await f.prepare();
    vi.mocked(f.execution.roleResources).mockReturnValueOnce([f.roles[0]!]);
    await expect(f.pipeline.startAttempt(c.body, c.context)).rejects.toMatchObject({ code: 'ROLE_RESOURCE_REQUIRED' });
    f.tools[3] = { tool: 'maestri', state: 'unavailable', version: null, cause: 'VERSION_NOT_EXPOSED', affectedRequirements: ['RF-22'], observedAtMs: 2 };
    const op = await f.pipeline.startAttempt(c.body, c.context); await f.pipeline.drain();
    expect(f.storage.getAttempt(op.resource.id)).toMatchObject({ suspension: 'TOOL_VERSION_UNAVAILABLE', result: null });
    expect(f.storage.getAttemptCapture(op.resource.id).tools[3]).toMatchObject({ cause: 'VERSION_NOT_EXPOSED', version: null, affectedRequirements: ['RF-22'] });
    expect(f.workspaces.prepareAttempt).not.toHaveBeenCalled(); expect(f.execution.preflight).not.toHaveBeenCalled();
  });
  it('keeps independent captures when defaults, resources and observed versions change', async () => {
    const f = await fixture(); const first = await start(f); const bytes = JSON.stringify(first.capture);
    f.storage.saveTimeDefaults({ operationId: randomUUID(), expectedRevision: f.storage.getSettingsETag(), timeDefaults: { ...f.storage.getSettings().timeDefaults, passageActiveTimeMs: 123456 } });
    f.roles[0]!.sha256 = 'f'.repeat(64); f.tools[1]!.version = '2.0.0'; f.issue.id = 'I_second'; f.issue.number = 18;
    const second = await start(f);
    expect(second.capture.configuration.timeDefaults.passageActiveTimeMs).toBe(123456);
    expect(second.capture.roleResources).not.toEqual(first.capture.roleResources); expect(second.capture.tools).not.toEqual(first.capture.tools);
    expect(JSON.stringify(f.storage.getAttemptCapture(first.id))).toBe(bytes);
    const passage = f.persistence.getPassage({ passageId: second.status.passageId });
    expect(passage.executorVersion).toBe('18.11.1'); expect(passage.effectiveProfile).toMatchObject({ model: 'model', effort: 'high' });
  });
  it('preserves partial ownership and late clone completion after cancellation without launching', async () => {
    const f = await fixture(); const original = f.workspaces.prepareAttempt.getMockImplementation()!;
    f.workspaces.prepareAttempt.mockImplementationOnce(async input => {
      f.persistence.recordCancellation(input.attemptId, randomUUID()); return original(input);
    });
    const a = await start(f);
    expect(f.storage.getAttempt(a.id).result).toBe('cancelled'); expect(f.execution.startPassage).not.toHaveBeenCalled();
    expect(f.db.prepare("SELECT owned,launch_state FROM resources WHERE attempt_id=? AND kind='implementation'").get(a.id)).toEqual({ owned: 1, launch_state: 'ready' });
  });
  it('preserves failed owned clone diagnostics without treating creation as ready', async () => {
    const f = await fixture(); const original = f.workspaces.prepareAttempt.getMockImplementation()!;
    f.workspaces.prepareAttempt.mockImplementationOnce(async input => ({ ...await original(input), state: 'failed', diagnostic: { code: 'CLONE_FAILED', message: 'Failed', recovery: 'Preserve work' } }));
    const a = await start(f);
    expect(a.status).toMatchObject({ suspension: 'WORKSPACE_PREPARATION_FAILED', diagnostic: 'CLONE_FAILED', result: null });
    expect(f.execution.startPassage).not.toHaveBeenCalled();
    expect(f.db.prepare("SELECT owned,launch_state FROM resources WHERE attempt_id=? AND kind='implementation'").get(a.id)).toEqual({ owned: 1, launch_state: 'failed' });
  });
  it('recovers after reopen and interrupts history without automatically scheduling a second launch', async () => {
    const f = await fixture(); const a = await start(f); await f.pipeline.close(); f.storage.close();
    const reopened = openStorage({ dataDirectory: f.directory });
    try {
      expect(reopened.getAttempt(a.id)).toMatchObject({ result: 'interrupted', phase: 'finished', tracking: 'lost' });
      expect(reopened.recoverAttempt({ body: a.body, ...a.context })?.receipt).toEqual(a.operation.receipt);
      expect(reopened.getAttemptCapture(a.id)).toEqual(a.capture);
      expect(f.execution.startPassage).toHaveBeenCalledTimes(1);
    } finally { reopened.close(); }
  });
});
