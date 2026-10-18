import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImplementerResult, SessionResponse } from '#contracts';
import { attemptFixture, type AttemptFixture } from '../fixtures/attempt.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { digest } from '../../apps/controller/src/modules/execution/roles.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { removeRecoverySchema } from '../fixtures/recovery-schema.js';

const fixtures: AttemptFixture[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function fixture(start = true) {
  const f = await attemptFixture(); fixtures.push(f);
  const prepared = await f.prepare();
  const op = start ? await f.pipeline.startAttempt(prepared.body, prepared.context) : null;
  if (start) await f.pipeline.drain();
  const context = () => ({ operationId: randomUUID(), expectedRevision: undefined });
  const result: ImplementerResult = { formatVersion: 1, summary: 'Official result', writesStopped: true, checks: [],
    criteria: ['ac-1','ac-2'].map(criterionId => ({ criterionId, verdict: 'passed', evidence: ['Observed evidence'] })) };
  return { ...f, prepared, id: op?.resource.id ?? '', context, result };
}
async function environmentFixture() {
  const f = await fixture(); const a = f.storage.getAttempt(f.id); const binding = f.persistence.getPassage({ passageId: a.passageId }).binding;
  Object.assign(f.workspaces, { captureDelivery: vi.fn(async () => ({ gitRef: `refs/factory/deliveries/${binding.deliveryVersion}`,
    commitSha: 'b'.repeat(40), contentIdentity: 'c'.repeat(40), hasDelta: true, warnings: [] })) });
  f.persistence.acceptResult({ binding, result: f.result, sha256: digest(f.result) }); await f.pipeline.drain();
  f.persistence.recordCancellation(f.id, randomUUID());
  f.persistence.recordStop({ passageId: a.passageId }, { passageId: a.passageId, state: 'confirmed' });
  const observation = { exists: true, contentSafe: true, stamp: 'filesystem-identity', reason: null, fileCount: 5, bytes: 123 };
  const inspectEnvironment = vi.fn(async () => ({ ...observation }));
  const removeEnvironment = vi.fn(async (_id, _deliveries, _stamp, gate: () => void) => { gate(); });
  const folderCapability = vi.fn(async () => ({ available: true, reason: null }));
  const openEnvironment = vi.fn(async () => {});
  Object.assign(f.workspaces, { inspectEnvironment, removeEnvironment, folderCapability, openEnvironment });
  const resource = f.storage.getResources(f.id).entries.find(r => r.kind === 'implementation')!;
  return { ...f, resource, observation, inspectEnvironment, removeEnvironment, folderCapability, openEnvironment };
}

describe('revocation and explicit retry', () => {
  it('revokes before stop, accepts an obsolete If-Match, deduplicates retries and distinguishes uncertain cleanup', async () => {
    const f = await fixture(); const a = f.storage.getAttempt(f.id); const c = { ...f.context(), expectedRevision: '"obsolete"' };
    vi.mocked(f.execution.cancelAttempt).mockImplementation(async (id, operationId) => {
      expect(f.storage.getAttempt(id)).toMatchObject({ phase: 'finished', result: 'cancelled', tracking: 'lost' });
      expect(f.storage.getOperation(operationId)).toMatchObject({ kind: 'attempt.cancel', state: 'succeeded' });
      f.persistence.recordStop({ passageId: a.passageId }, { passageId: a.passageId, state: 'uncertain' }); return [];
    });
    const op = await f.pipeline.cancelAttempt(f.id, { reason: 'Stop own work' }, c);
    expect(op.resource.id).toBe(f.id); expect(f.storage.getResources(f.id).cleanup).toBe('pending');
    expect(await f.pipeline.cancelAttempt(f.id, { reason: 'Stop own work' }, { ...c, expectedRevision: '"another"' })).toEqual(op);
    await f.pipeline.cancelAttempt(f.id, {}, f.context()); await f.pipeline.drain();
    expect(f.execution.cancelAttempt).toHaveBeenCalledTimes(1); expect(f.storage.getResources(f.id).cleanup).toBe('uncertain');
    expect(() => f.persistence.confirmReady({ passageId: a.passageId }, f.profile, '18.11.1')).toThrow();
    const binding = f.persistence.getPassage({ passageId: a.passageId }).binding;
    expect(() => f.persistence.acceptResult({ binding, result: f.result, sha256: digest(f.result) })).toThrow();
    await expect(f.pipeline.cancelAttempt(f.id, { reason: 'Different content' }, c)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it.each(['attempts','operation_requests','cancellation_requests','events'])('rolls back cancellation completely when %s fails', async table => {
    const f = await fixture(); const before = f.storage.getAttempt(f.id); const c = f.context();
    f.db.exec(`CREATE TRIGGER fixture_cancel BEFORE ${table === 'attempts' ? 'UPDATE' : 'INSERT'} ON ${table} BEGIN SELECT RAISE(ABORT,'fixture'); END`);
    await expect(f.pipeline.cancelAttempt(f.id, {}, c)).rejects.toBeDefined();
    expect(f.storage.getAttempt(f.id)).toEqual(before); expect(f.storage.getOperation(c.operationId)).toBeNull();
    expect(f.execution.cancelAttempt).not.toHaveBeenCalled(); f.db.exec('DROP TRIGGER fixture_cancel');
    await f.pipeline.cancelAttempt(f.id, {}, c); await f.pipeline.drain();
  });
  it('records a late workspace without launching a terminal after cancellation during clone', async () => {
    const f = await fixture(false); let release!: () => void; let started!: () => void;
    const pending = new Promise<void>(r => { release = r; }); const entered = new Promise<void>(r => { started = r; });
    const normal = f.workspaces.prepareAttempt.getMockImplementation()!;
    f.workspaces.prepareAttempt.mockImplementation(async input => { started(); await pending; return normal(input); });
    const op = await f.pipeline.startAttempt(f.prepared.body, f.prepared.context); await entered;
    await f.pipeline.cancelAttempt(op.resource.id, {}, f.context()); release(); await f.pipeline.drain();
    expect(f.execution.startPassage).not.toHaveBeenCalled();
    expect(f.storage.getResources(op.resource.id).entries.find(r => r.kind === 'implementation')).toMatchObject({ owned: true, launchState: 'ready', removed: false });
    expect(f.storage.getAttempt(op.resource.id).result).toBe('cancelled');
  });
  it('starts a fresh retry outside Ready with current criteria/base, separate clone and no old authority', async () => {
    const f = await fixture(); const oldCapture = f.storage.getAttemptCapture(f.id); const oldStatus = f.storage.getAttempt(f.id);
    f.persistence.record({ passageId: oldStatus.passageId }, 'interrupted', 'TRACKING_LOST', 'tracking-lost');
    expect(f.storage.getAttempt(f.id).result).toBe('interrupted');
    f.issue.memberships[0]!.statusValues[0]!.optionId = 'PROGRESS';
    f.issue.body = f.issue.body.replace('- Same text', '- Current criterion');
    f.observation.base!.sha = 'd'.repeat(40); f.observation.remote!.branch!.sha = 'd'.repeat(40);
    const saved = await f.preparations.createPreparation(f.projectId, { issue_id: f.issue.id, delivery_mode: 'icr', guidance: 'Revised retry guidance', overrides: {}, previous_attempt_id: f.id }, f.context());
    expect(saved.view.preparation.prerequisites.map(r => r.code)).toEqual(['EXECUTOR_REVALIDATION_REQUIRED']);
    const p = saved.view.preparation;
    const op = await f.pipeline.startAttempt({ preparationId: p.id, preparationRevision: p.revision, authorizedSummaryHash: p.summary_hash, authorized: true }, { ...f.context(), expectedRevision: saved.etag });
    await f.pipeline.drain(); const fresh = f.storage.getAttemptCapture(op.resource.id);
    expect(op.resource.id).not.toBe(f.id); expect(fresh.baseSha).toBe('d'.repeat(40)); expect(fresh.criteriaDigest).not.toBe(oldCapture.criteriaDigest);
    expect(fresh.configuration.guidance).toContain('Revised retry guidance'); expect(f.storage.getAttemptCapture(f.id)).toEqual(oldCapture);
    expect(f.workspaces.prepareAttempt).toHaveBeenCalledTimes(2); expect(f.execution.startPassage).toHaveBeenCalledTimes(2); expect(f.execution.continuePassage).not.toHaveBeenCalled();
    expect(f.storage.getResources(f.id).cleanup).not.toBe('complete');
    expect(() => f.persistence.confirmReady({ passageId: oldStatus.passageId }, f.profile, '18.11.1')).toThrow();
    await expect(f.preparations.createPreparation(f.projectId, { issue_id: f.issue.id, delivery_mode: 'icr', guidance: '', overrides: {}, previous_attempt_id: op.resource.id }, f.context())).rejects.toMatchObject({ code: 'ATTEMPT_ACTIVE' });
  });
  it.each(['assignee','blocked','closed','membership'])('does not waive %s eligibility for explicit retry', async kind => {
    const f = await fixture(); f.persistence.recordCancellation(f.id, randomUUID());
    if (kind === 'assignee') f.issue.assignees = [];
    if (kind === 'blocked') f.issue.blockers = [{ id: 'I_blocker', number: 3, title: 'Blocker', state: 'OPEN', url: 'https://github.com/test-org/repo/issues/3' }];
    if (kind === 'closed') f.issue.state = 'CLOSED';
    if (kind === 'membership') f.issue.memberships = [];
    const saved = await f.preparations.createPreparation(f.projectId, { issue_id: f.issue.id, delivery_mode: 'icr', guidance: '', overrides: {}, previous_attempt_id: f.id }, f.context());
    const p = saved.view.preparation;
    await expect(f.pipeline.startAttempt({ preparationId: p.id, preparationRevision: p.revision, authorizedSummaryHash: p.summary_hash, authorized: true }, { ...f.context(), expectedRevision: saved.etag })).rejects.toMatchObject({ code: 'START_PREREQUISITES' });
    expect(f.workspaces.prepareAttempt).toHaveBeenCalledTimes(1);
  });
  it('migrates v9 without replacing captures/results; restart revokes active coordination and marks native intentions unknown', async () => {
    const f = await fixture(); const a = f.storage.getAttempt(f.id); const capture = f.storage.getAttemptCapture(f.id); const instance = f.storage.getSettings().installation_id;
    await f.pipeline.close(); f.storage.close(); removeRecoverySchema(f.db);
    const reopened = openStorage({ dataDirectory: f.directory });
    try {
    expect(reopened.getDiagnostics().schemaVersion).toBe(23); expect(reopened.getSettings().installation_id).toBe(instance);
      expect(reopened.getAttemptCapture(f.id)).toEqual(capture); expect(reopened.getAttempt(f.id).result).toBe('interrupted');
      expect(() => reopened.executionPersistence().confirmReady({ passageId: a.passageId }, f.profile, '18.11.1')).toThrow();
    } finally { reopened.close(); }
  });
  it('refuses busy cancellation before any effect and preserves its receipt after reopening', async () => {
    const f = await fixture(); const c = f.context(); f.db.exec('BEGIN IMMEDIATE');
    try { await expect(f.pipeline.cancelAttempt(f.id, {}, c)).rejects.toBeDefined(); }
    finally { f.db.exec('ROLLBACK'); }
    expect(f.storage.getAttempt(f.id).result).toBeNull(); expect(f.execution.cancelAttempt).not.toHaveBeenCalled();
    const op = await f.pipeline.cancelAttempt(f.id, {}, c); await f.pipeline.drain(); await f.pipeline.close(); f.storage.close();
    const reopened = openStorage({ dataDirectory: f.directory });
    try { expect(reopened.getOperation(c.operationId)).toEqual(op); expect(reopened.getAttempt(f.id).result).toBe('cancelled'); }
    finally { reopened.close(); }
  });
});

describe('removal and native opening', () => {
  it('requires confirmation/ETag and unchanged plan, commits before removal, preserves history and never repeats deletion', async () => {
    const f = await environmentFixture(); const history = f.storage.getRounds(f.id);
    const plan = await f.pipeline.getRemovalPlan(f.id, f.resource.id); expect(plan.view.capability.available).toBe(true);
    const c = { ...f.context(), expectedRevision: plan.etag }; const body = { planHash: plan.view.planHash, confirmed: true as const };
    await expect(f.pipeline.removeResource(f.id, f.resource.id, body, f.context())).rejects.toMatchObject({ statusCode: 428 });
    await expect(f.pipeline.removeResource(f.id, f.resource.id, { ...body, planHash: '0'.repeat(64) }, c)).rejects.toMatchObject({ code: 'REMOVAL_PLAN_CHANGED' });
    f.removeEnvironment.mockImplementation(async (_id, _ds, _stamp, gate) => {
      expect(f.storage.getOperation(c.operationId)?.state).toBe('accepted'); gate();
    });
    const op = await f.pipeline.removeResource(f.id, f.resource.id, body, c); await f.pipeline.drain();
    expect(f.storage.getOperation(op.operation_id)?.state).toBe('succeeded'); expect(f.storage.getResources(f.id).entries.find(r => r.id === f.resource.id)?.removed).toBe(true);
    expect((await f.pipeline.removeResource(f.id, f.resource.id, body, c)).operation_id).toBe(op.operation_id);
    expect(f.removeEnvironment).toHaveBeenCalledTimes(1); expect(f.storage.getRounds(f.id)).toEqual(history);
    expect(f.storage.getProducerResult(history.entries[0]!.deliveryId)).toMatchObject({ result: f.result });
    expect((await f.pipeline.getFolder(f.id, f.resource.id)).openCapability).toEqual({ available: false, reason: 'RESOURCE_REMOVED' });
  });
  it.each(['uncertain','changed','risk','missing'])('prevents deletion when %s', async kind => {
    const f = await environmentFixture(); const before = await f.pipeline.getRemovalPlan(f.id, f.resource.id);
    if (kind === 'uncertain') f.db.prepare("UPDATE resources SET stop_state='uncertain' WHERE kind='terminal'").run();
    if (kind === 'changed') f.observation.stamp = 'new-filesystem-identity';
    if (kind === 'risk') f.observation.contentSafe = false;
    if (kind === 'missing') { f.observation.contentSafe = false; f.observation.exists = false; }
    await expect(f.pipeline.removeResource(f.id, f.resource.id, { planHash: before.view.planHash, confirmed: true }, { ...f.context(), expectedRevision: before.etag })).rejects.toMatchObject({ statusCode: 409 });
    expect(f.removeEnvironment).not.toHaveBeenCalled();
  });
  it('preserves uncertain/partial deletion and makes response-loss replay consultable without another removal', async () => {
    const f = await environmentFixture(); const plan = await f.pipeline.getRemovalPlan(f.id, f.resource.id); const c = { ...f.context(), expectedRevision: plan.etag };
    f.removeEnvironment.mockRejectedValue(new Error('Private filesystem failure'));
    const body = { confirmed: true as const, planHash: plan.view.planHash };
    await f.pipeline.removeResource(f.id, f.resource.id, body, c); await f.pipeline.drain();
    expect(f.storage.getOperation(c.operationId)?.state).toBe('unknown');
    expect((await f.pipeline.removeResource(f.id, f.resource.id, body, c)).state).toBe('unknown');
    const latest = await f.pipeline.getRemovalPlan(f.id, f.resource.id);
    await expect(f.pipeline.removeResource(f.id, f.resource.id, { ...body, planHash: latest.view.planHash }, { ...c, operationId: randomUUID(), expectedRevision: latest.etag })).rejects.toMatchObject({ code: 'REMOVAL_IN_PROGRESS' });
    expect(f.removeEnvironment).toHaveBeenCalledTimes(1);
  });
  it('opens only the registered folder; revalidates availability and deduplicates accepted requests', async () => {
    const f = await environmentFixture(); const c = f.context();
    expect((await f.pipeline.getFolder(f.id, f.resource.id)).openCapability.available).toBe(true);
    await f.pipeline.openFolder(f.id, f.resource.id, c); await f.pipeline.drain();
    expect(f.openEnvironment).toHaveBeenCalledExactlyOnceWith(f.id); expect(f.storage.getOperation(c.operationId)?.state).toBe('succeeded');
    f.folderCapability.mockResolvedValue({ available: false, reason: null });
    expect((await f.pipeline.openFolder(f.id, f.resource.id, c)).state).toBe('succeeded');
    await expect(f.pipeline.openFolder(f.id, f.resource.id, f.context())).rejects.toMatchObject({ code: 'NATIVE_OPEN_UNAVAILABLE' });
    await expect(f.pipeline.openFolder(f.id, randomUUID(), f.context())).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });
  it('opens the same current native passage or reports unsupported context without recruiting', async () => {
    const f = await fixture(); const a = f.storage.getAttempt(f.id); const open = vi.fn(async () => {});
    await expect(f.pipeline.openInteraction(f.id, a.passageId, f.context())).rejects.toMatchObject({ code: 'NATIVE_OPEN_UNAVAILABLE' });
    vi.spyOn(f.execution, 'interactionSurface').mockReturnValue({ kind: 'terminal', reference: `factory-${a.passageId}`, available: true, reason: null, open });
    const c = f.context(); await f.pipeline.openInteraction(f.id, a.passageId, c); await f.pipeline.drain();
    expect(open).toHaveBeenCalledTimes(1); await f.pipeline.openInteraction(f.id, a.passageId, c); await f.pipeline.drain(); expect(open).toHaveBeenCalledTimes(1);
    expect(f.execution.startPassage).toHaveBeenCalledTimes(1); expect(f.execution.continuePassage).not.toHaveBeenCalled();
  });
  it.each(['operation_requests','resource_removals','events'])('does not remove if acceptance fails in %s', async table => {
    const f = await environmentFixture(); const p = await f.pipeline.getRemovalPlan(f.id, f.resource.id); const c = { ...f.context(), expectedRevision: p.etag };
    f.db.exec(`CREATE TRIGGER fixture_removal BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'fixture'); END`);
    await expect(f.pipeline.removeResource(f.id, f.resource.id, { planHash: p.view.planHash, confirmed: true }, c)).rejects.toBeDefined();
    expect(f.storage.getOperation(c.operationId)).toBeNull(); expect(f.removeEnvironment).not.toHaveBeenCalled(); f.db.exec('DROP TRIGGER fixture_removal');
  });
  it('rechecks native capability after durable acceptance and records uncertainty without calling the native hook', async () => {
    const f = await environmentFixture(); const c = f.context();
    f.folderCapability.mockResolvedValueOnce({ available: true, reason: null }).mockResolvedValue({ available: false, reason: null });
    await f.pipeline.openFolder(f.id, f.resource.id, c); await f.pipeline.drain();
    expect(f.openEnvironment).not.toHaveBeenCalled(); expect(f.storage.getOperation(c.operationId)?.state).toBe('unknown');
    await f.pipeline.openFolder(f.id, f.resource.id, c); expect(f.openEnvironment).not.toHaveBeenCalled();
  });
  it('marks accepted native/removal intentions unknown on restart without deleting or opening again', async () => {
    const f = await environmentFixture(); const c = f.context();
    const snapshot = f.storage.getResourceSnapshot(f.id, f.resource.id);
    f.storage.acceptRecovery({ ...c, kind: 'folder.open', attemptId: f.id, resourceId: f.resource.id, body: {} }, snapshot.stamp);
    const p = await f.pipeline.getRemovalPlan(f.id, f.resource.id); const removalId = randomUUID();
    f.storage.acceptRecovery({ operationId: removalId, expectedRevision: p.etag, kind: 'resource.remove', attemptId: f.id, resourceId: f.resource.id,
      body: { planHash: p.view.planHash, confirmed: true } }, snapshot.stamp);
    f.storage.interruptAttempts();
    expect(f.storage.getOperation(c.operationId)?.state).toBe('unknown'); expect(f.storage.getOperation(removalId)?.state).toBe('unknown');
    expect(f.removeEnvironment).not.toHaveBeenCalled(); expect(f.openEnvironment).not.toHaveBeenCalled();
    expect(f.storage.getResources(f.id).entries.find(r => r.id === f.resource.id)?.removed).toBe(false);
  });
});

it('protects recovery endpoints, validates closed bodies, returns durable cancellation and enforces account scope', async () => {
  const f = await fixture(false); const config = loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory);
  const app = createApp(config, f.storage, undefined, undefined, { github: f.github, workspaces: f.workspaces }, f.pipeline);
  await app.ready(); const op = await f.pipeline.startAttempt(f.prepared.body, f.prepared.context); await f.pipeline.drain();
  const id = op.resource.id; const url = `/api/v1/attempts/${id}/cancel`; const host = '127.0.0.1:4310'; const origin = `http://${host}`;
  try {
    expect((await app.inject({ method: 'POST', url, headers: { host, origin }, payload: {} })).statusCode).toBe(401);
    const session = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin, 'x-factory-client': 'web', 'content-type': 'application/json' }, payload: {} });
    const headers = { host, origin, cookie: String(session.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': session.json<SessionResponse>().csrf_token, 'idempotency-key': randomUUID(), 'content-type': 'application/json', 'if-match': '"obsolete"' };
    expect((await app.inject({ method: 'POST', url, headers, payload: { pid: 123 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url, headers: { ...headers, 'x-csrf-token': '' }, payload: {} })).statusCode).toBe(403);
    const accepted = await app.inject({ method: 'POST', url, headers, payload: {} }); expect(accepted.statusCode, accepted.body).toBe(202);
    await f.pipeline.drain(); expect((await app.inject({ url: String(accepted.headers.location), headers })).json()).toMatchObject({ kind: 'attempt.cancel', state: 'succeeded' });
    expect((await app.inject({ url: `/api/v1/attempts/${id}/resources`, headers })).statusCode).toBe(200);
    const missingPassage = await app.inject({ url: `/api/v1/attempts/${id}/passages/${randomUUID()}/interaction`, headers });
    expect(missingPassage.statusCode).toBe(404); expect(missingPassage.json()).toMatchObject({ code: 'PASSAGE_NOT_FOUND' });
    expect((await app.inject({ method: 'POST', url, headers, payload: {} })).statusCode).toBe(202); expect(f.execution.cancelAttempt).toHaveBeenCalledTimes(1);
    f.db.prepare('UPDATE factory_settings SET account_id=NULL').run(); expect((await app.inject({ url: `/api/v1/attempts/${id}/resources`, headers })).statusCode).toBe(404);
  } finally { await app.close(); }
});
