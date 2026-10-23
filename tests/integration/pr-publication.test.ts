import { toHttpAuthorizeUpgrade } from '../../apps/controller/src/http/execution-views.js';
import { randomUUID } from 'node:crypto';
import { removeQueueSchedulerSchema } from '../fixtures/queue-schema.js';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import type { AuthorizeUpgrade, EffectView } from '#contracts';
import { publicationFixture, type PublicationFixture } from '../fixtures/publication.js';
import { confirmTerminalStops } from '../fixtures/attempt.js';
import { createPublication } from '../../apps/controller/src/modules/publication/index.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';

const fixtures: PublicationFixture[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function fixture(mode: 'icr' | 'commit' | 'pr' = 'pr',delta = true) { const f = await publicationFixture(true,mode,delta); fixtures.push(f); return f; }
const effects = (f: PublicationFixture) => f.storage.getEffects(f.attemptId);
const effect = (f: PublicationFixture,kind: EffectView['kind']) => effects(f).find(e => e.kind === kind)!;
const complete = (f: PublicationFixture) => f.pipeline.completePublication(f.attemptId,{ deliveryId: f.status().deliveryId!,authorizedMode: f.storage.getPublicationSummary(f.attemptId).mode,authorized: true },f.context());
function upgrade(f: PublicationFixture,targetMode: 'commit' | 'pr'): AuthorizeUpgrade {
  const summary = f.storage.getPublicationSummary(f.attemptId);
  return { deliveryId: f.status().deliveryId!,currentMode: summary.mode,targetMode,authorized: true,authorizedAdditionalEffectsHash: summary.upgrades!.find(u => u.targetMode === targetMode)!.summaryHash };
}

it('completes PR in durable commit/push/PR order using the same approved version and no result comment', async () => {
  const f = await fixture(); await f.implement();
  const push = f.workspaces.pushApproved.getMockImplementation()!;
  f.workspaces.pushApproved.mockImplementation(async (d,e,a,authorize) => {
    expect(f.storage.getOperation(e.operationId)?.receipt).toBeDefined(); expect(f.storage.getEffect(e.operationId).state).toBe('running');
    expect(effect(f,'local_commit').state).toBe('confirmed'); return push(d,e,a,authorize);
  });
  await f.approve();
  expect(f.status()).toMatchObject({ phase: 'finished',result: 'delivered' });
  expect(effects(f).map(e => e.kind)).toEqual(['project_status','project_status','local_commit','push','pull_request','project_status']);
  expect(f.issue.comments).toEqual([]); expect(f.workspaces.pushApproved).toHaveBeenCalledOnce();
  const pr = f.mutateEffect.mock.calls.find(([x]) => x.effect.kind === 'pull_request')![0];
  expect(pr.effect.expectedIdentity).toMatchObject({ baseBranch: 'main',commitSha: effect(f,'local_commit').receipt!.id,contentIdentity: f.storage.getDelivery(pr.effect.deliveryId!).delivery.contentIdentity });
  for (const text of ['Escopo:','Base configurada:','Tree aprovada:','Checks do controlador:','Parecer: approved','Pendências não impeditivas:',f.attemptId]) expect(pr.body).toContain(text);
  expect(pr.body).not.toMatch(/\b(?:closes|fixes|resolves|merge|force-push)\b/i);
  expect(f.storage.getDeliveryDetail(pr.effect.deliveryId!,{}).publication).toMatchObject({ mode: 'pr',localState: 'completed',push: { state: 'confirmed' },pullRequest: { state: 'confirmed' } });
  expect(f.db.pragma('foreign_key_check')).toEqual([]);
});

it('marks all code publication effects not applicable for an approved no-delta version', async () => {
  const f = await fixture('pr',false); await f.implement(); await f.approve();
  for (const kind of ['local_commit','push','pull_request'] as const) expect(effect(f,kind)).toMatchObject({ state: 'not_applicable',reason: 'APPROVED_NO_DELTA',receipt: null });
  expect(f.workspaces.pushApproved).not.toHaveBeenCalled(); expect(f.mutateEffect.mock.calls.some(([x]) => x.effect.kind === 'pull_request')).toBe(false);
  expect(f.status().result).toBe('delivered'); expect(f.issue.comments).toEqual([]);
});

it('includes unresolved nonblocking findings from earlier rounds in the approved PR body', async () => {
  const f = await fixture(); await f.implement();
  await f.approve(false,[{ key: 'docs',criterionIds: [],category: 'documentation',problem: 'Follow-up documentation remains',evidence: ['Missing optional example'],expectedResult: 'Add a usage example',blocking: false }]);
  await f.implement(); await f.approve(true,[],true);
  expect(f.status().result).toBe('delivered');
  const pr = f.mutateEffect.mock.calls.find(([x]) => x.effect.kind === 'pull_request')![0];
  expect(pr.body).toContain('Follow-up documentation remains'); expect(pr.body).toContain('Add a usage example');
  expect(f.storage.getReview(f.status().deliveryId!)!.findings).toEqual([]);
});

it.each(['push','pull_request'] as const)('reconciles lost %s response without replay, then completes only explicit pending effects', async kind => {
  const f = await fixture(); await f.implement();
  if (kind === 'push') {
    const push = f.workspaces.pushApproved.getMockImplementation()!;
    f.workspaces.pushApproved.mockImplementation(async (...args) => { const r = await push(...args); f.workspaces.reconcilePush.mockResolvedValue(r); return { state: 'unknown',receipt: null,reason: 'RESPONSE_LOST' }; });
  } else {
    const mutate = f.mutateEffect.getMockImplementation()!;
    f.mutateEffect.mockImplementation(async input => { const r = await mutate(input); return input.effect.kind === 'pull_request' ? { state: 'unknown',receipt: null,reason: 'RESPONSE_LOST',retryAtMs: null } : r; });
  }
  await f.approve(); expect(effect(f,kind).state).toBe('unknown'); expect(f.status().result).toBeNull();
  const calls = f.workspaces.pushApproved.mock.calls.length; const creates = f.mutateEffect.mock.calls.filter(([x]) => x.effect.kind === 'pull_request').length;
  f.pipeline.reconcilePublication(f.attemptId,{ deliveryId: f.status().deliveryId! },f.context()); await f.pipeline.drain();
  expect(effect(f,kind).state).toBe('confirmed'); expect(f.status().result).toBeNull();
  complete(f); await f.pipeline.drain(); expect(f.status().result).toBe('delivered');
  expect(f.workspaces.pushApproved.mock.calls).toHaveLength(calls);
  expect(f.mutateEffect.mock.calls.filter(([x]) => x.effect.kind === 'pull_request')).toHaveLength(kind === 'push' ? creates+1 : creates);
});

it('does not retry an unobserved push and refuses forged push receipts', async () => {
  const f = await fixture(); await f.implement();
  f.workspaces.pushApproved.mockResolvedValue({ state: 'unknown',receipt: null,reason: 'REMOTE_REF_NOT_OBSERVED' });
  await f.approve(); complete(f); await f.pipeline.drain(); complete(f); await f.pipeline.drain();
  expect(f.workspaces.pushApproved).toHaveBeenCalledOnce(); expect(effect(f,'push').state).toBe('unknown'); expect(effect(f,'pull_request')).toBeUndefined();
  const e = effect(f,'push');
  expect(() => f.storage.finishEffect(e.operationId,e.revision,'confirmed',{ id: 'f'.repeat(40),commitSha: 'f'.repeat(40),branchRef: e.expectedIdentity.branchRef!,repositoryId: e.expectedIdentity.repositoryId! },null)).toThrow(expect.objectContaining({ code: 'EFFECT_RECEIPT_INVALID' }));
});

it.each(['intent','receipt'] as const)('blocks the next remote effect when the push %s transaction fails', async stage => {
  const f = await fixture(); await f.implement();
  const push = f.workspaces.pushApproved.getMockImplementation()!;
  f.workspaces.pushApproved.mockImplementation(async (...args) => { const r = await push(...args); f.workspaces.reconcilePush.mockResolvedValue(r); return r; });
  f.db.exec(stage === 'intent' ? "CREATE TRIGGER fail_push BEFORE INSERT ON effects WHEN NEW.kind='push' BEGIN SELECT RAISE(ABORT,'FIXTURE'); END" : "CREATE TRIGGER fail_push BEFORE UPDATE ON effects WHEN NEW.kind='push' AND NEW.state='confirmed' BEGIN SELECT RAISE(ABORT,'FIXTURE'); END");
  await f.approve(); expect(effect(f,'pull_request')).toBeUndefined(); expect(f.status().result).toBeNull();
  if (stage === 'intent') expect(f.workspaces.pushApproved).not.toHaveBeenCalled(); else expect(effect(f,'push').state).toBe('running');
  f.db.exec('DROP TRIGGER fail_push'); complete(f); await f.pipeline.drain();
  expect(f.status().result).toBe('delivered'); expect(f.workspaces.pushApproved).toHaveBeenCalledOnce();
});

it.each(['push','pull_request'] as const)('records a late %s confirmation after cancellation and prevents following effects', async kind => {
  const f = await fixture(); await f.implement();
  if (kind === 'push') {
    const original = f.workspaces.pushApproved.getMockImplementation()!;
    f.workspaces.pushApproved.mockImplementation(async (...args) => { const r = await original(...args); f.pipeline.cancelAttempt(f.attemptId,{},f.context()); return r; });
  } else {
    const original = f.mutateEffect.getMockImplementation()!;
    f.mutateEffect.mockImplementation(async input => { const r = await original(input); if (input.effect.kind === 'pull_request') f.pipeline.cancelAttempt(f.attemptId,{},f.context()); return r; });
  }
  await f.approve(); expect(effect(f,kind).state).toBe('confirmed'); expect(f.status().result).toBe('cancelled');
  expect(effects(f).some(e => e.kind === 'project_status' && e.expectedIdentity.optionId === 'delivered')).toBe(false);
  if (kind === 'push') expect(effect(f,'pull_request')).toBeUndefined();
});

it('uses a single durable upgrade for ICR to PR, preserves confirmed comments and captured mode, and recovers a lost upgrade response', async () => {
  const f = await fixture('icr'); await f.implement(); await f.approve();
  const deliveryId = f.status().deliveryId!; const capture = f.storage.getAttemptCapture(f.attemptId); const comment = effect(f,'issue_comment');
  const body = upgrade(f,'pr'); const context = f.context();
  expect(f.storage.getPublicationSummary(f.attemptId).upgrades!.find(u => u.targetMode === 'pr')).toMatchObject({ capability: { available: true },additionalEffects: ['local_commit','push','pull_request'] });
  const op = await f.pipeline.authorizePublicationUpgrade(f.attemptId,body,context); await f.pipeline.drain();
  expect(await f.pipeline.authorizePublicationUpgrade(f.attemptId,body,context)).toEqual(f.storage.getOperation(op.operation_id));
  expect(f.storage.getDeliveryDetail(deliveryId,{})).toMatchObject({ authorizations: { capturedMode: 'icr',authorizedMode: 'pr' },publication: { mode: 'pr',localState: 'completed',upgrades: [] } });
  expect(f.storage.getAttemptCapture(f.attemptId)).toEqual(capture); expect(effect(f,'issue_comment')).toEqual(comment); expect(f.issue.comments).toHaveLength(1);
  expect(f.workspaces.createLocalCommit).toHaveBeenCalledOnce(); expect(f.workspaces.pushApproved).toHaveBeenCalledOnce();
  expect(f.db.prepare('SELECT count(*) AS n FROM publication_upgrades').get()).toEqual({ n: 1 });
  expect(() => f.db.prepare("UPDATE publication_upgrades SET target_mode='commit'").run()).toThrow();
});

it('continues an already authorized upgrade after known failure without requesting a second upgrade', async () => {
  const f = await fixture('commit'); await f.implement(); await f.approve();
  const commit = effect(f,'local_commit'); const push = f.workspaces.pushApproved.getMockImplementation()!;
  f.workspaces.pushApproved.mockResolvedValueOnce({ state: 'failed_known',receipt: null,reason: 'PUSH_NOT_AUTHORIZED' });
  const op = await f.pipeline.authorizePublicationUpgrade(f.attemptId,upgrade(f,'pr'),f.context()); await f.pipeline.drain();
  expect(f.storage.getOperation(op.operation_id)?.state).toBe('failed');
  expect(f.storage.getPublicationSummary(f.attemptId)).toMatchObject({ mode: 'pr',localState: 'pending' });
  f.workspaces.pushApproved.mockImplementation(push); complete(f); await f.pipeline.drain();
  expect(f.storage.getPublicationSummary(f.attemptId).localState).toBe('completed'); expect(effect(f,'local_commit')).toEqual(commit);
  expect(f.workspaces.createLocalCommit).toHaveBeenCalledOnce(); expect(f.db.prepare('SELECT count(*) AS n FROM publication_upgrades').get()).toEqual({ n: 1 });
});

it('supports ICR to Commit followed by PR without repeating the local commit or the earlier comment', async () => {
  const f = await fixture('icr'); await f.implement(); await f.approve(); const capture = f.storage.getAttemptCapture(f.attemptId);
  await f.pipeline.authorizePublicationUpgrade(f.attemptId,upgrade(f,'commit'),f.context()); await f.pipeline.drain();
  expect(f.storage.getPublicationSummary(f.attemptId)).toMatchObject({ mode: 'commit',localState: 'completed' });
  const next = f.storage.getPublicationSummary(f.attemptId).upgrades!;
  expect(next).toHaveLength(1); expect(next[0]).toMatchObject({ targetMode: 'pr',additionalEffects: ['push','pull_request'] });
  await f.pipeline.authorizePublicationUpgrade(f.attemptId,upgrade(f,'pr'),f.context()); await f.pipeline.drain();
  expect(f.storage.getPublicationSummary(f.attemptId)).toMatchObject({ mode: 'pr',localState: 'completed' });
  expect(f.workspaces.createLocalCommit).toHaveBeenCalledOnce(); expect(f.issue.comments).toHaveLength(1); expect(f.storage.getAttemptCapture(f.attemptId)).toEqual(capture);
});

it('checks retained version integrity before granting an upgrade', async () => {
  const f = await fixture('commit'); await f.implement(); await f.approve(); const body = upgrade(f,'pr');
  f.verifyRetainedDelivery.mockRejectedValueOnce(new Error('PRIVATE_CORRUPTION'));
  await expect(f.pipeline.authorizePublicationUpgrade(f.attemptId,body,f.context())).rejects.toMatchObject({ code: 'PUBLICATION_BLOCKED' });
  expect(f.db.prepare('SELECT count(*) AS n FROM publication_upgrades').get()).toEqual({ n: 0 }); expect(f.workspaces.pushApproved).not.toHaveBeenCalled();
});

it.each(['push','pull_request'] as const)('reconciles a failed local acknowledgement for no-delta %s without remote IO', async kind => {
  const f = await fixture('pr',false); await f.implement();
  f.db.exec(`CREATE TRIGGER fail_no_delta BEFORE UPDATE ON effects WHEN NEW.kind='${kind}' AND NEW.state='not_applicable' BEGIN SELECT RAISE(ABORT,'FIXTURE'); END`);
  await f.approve(); expect(effect(f,kind).state).toBe('running'); f.db.exec('DROP TRIGGER fail_no_delta');
  complete(f); await f.pipeline.drain(); expect(f.status().result).toBe('delivered');
  expect(effect(f,kind).state).toBe('not_applicable'); expect(f.workspaces.pushApproved).not.toHaveBeenCalled(); expect(f.github.reconcilePullRequest).not.toHaveBeenCalled();
});

it('blocks a PR mutation when cancellation happens during its pre-send read', async () => {
  const f = await fixture(); await f.implement(); const original = f.mutateEffect.getMockImplementation()!;
  f.mutateEffect.mockImplementation(async input => {
    if (input.effect.kind === 'pull_request') f.pipeline.cancelAttempt(f.attemptId,{},f.context());
    return original(input);
  });
  await f.approve(); expect(f.status().result).toBe('cancelled');
  expect(effect(f,'pull_request').state).toBe('unknown'); expect(f.github.reconcilePullRequest).not.toHaveBeenCalled();
  expect(effects(f).some(e => e.kind === 'project_status' && e.expectedIdentity.optionId === 'delivered')).toBe(false);
});

it.each(['hash','current','lower','settings','gate'] as const)('rejects upgrade with changed %s without authorization or new effects', async change => {
  const f = await fixture('commit'); await f.implement(); await f.approve();
  const body = upgrade(f,'pr'); const before = effects(f);
  if (change === 'hash') body.authorizedAdditionalEffectsHash = 'f'.repeat(64);
  if (change === 'current') body.currentMode = 'icr';
  if (change === 'lower') body.targetMode = 'icr';
  if (change === 'settings') f.db.prepare('UPDATE factory_settings SET revision=revision+1').run();
  if (change === 'gate') f.issue.assignees = [];
  await expect(f.pipeline.authorizePublicationUpgrade(f.attemptId,body,f.context())).rejects.toMatchObject({ statusCode: 409 });
  expect(f.db.prepare('SELECT count(*) AS n FROM publication_upgrades').get()).toEqual({ n: 0 }); expect(effects(f)).toEqual(before);
});

it('requires a finished approved current delivery and refuses upgrade rollback on failed journal insertion', async () => {
  const f = await fixture('icr'); await f.implement();
  expect(f.storage.getPublicationSummary(f.attemptId).upgrades).toEqual([]);
  await expect(f.pipeline.authorizePublicationUpgrade(f.attemptId,{ deliveryId: f.status().deliveryId!,currentMode: 'icr',targetMode: 'pr',authorized: true,authorizedAdditionalEffectsHash: 'a'.repeat(64) },f.context())).rejects.toMatchObject({ code: 'MODE_UPGRADE_NOT_ALLOWED' });
  await f.approve(); const before = f.status();
  f.db.exec("CREATE TRIGGER fail_upgrade BEFORE INSERT ON publication_upgrades BEGIN SELECT RAISE(ABORT,'FIXTURE'); END");
  await expect(f.pipeline.authorizePublicationUpgrade(f.attemptId,upgrade(f,'pr'),f.context())).rejects.toThrow();
  expect(f.status().revision).toBe(before.revision); expect(f.storage.getPublicationSummary(f.attemptId).mode).toBe('icr'); expect(f.workspaces.pushApproved).not.toHaveBeenCalled();
});

it('does not restore publication on restart and explicitly completes an authorized upgrade with old resources reconciled', async () => {
  const f = await fixture('commit'); await f.implement(); await f.approve();
  f.workspaces.pushApproved.mockResolvedValueOnce({ state: 'failed_known',receipt: null,reason: 'PUSH_NOT_AUTHORIZED' });
  await f.pipeline.authorizePublicationUpgrade(f.attemptId,upgrade(f,'pr'),f.context()); await f.pipeline.drain();
  const deliveryId = f.status().deliveryId!;
  await f.pipeline.close(); f.storage.close(); const storage = openStorage({ dataDirectory: f.directory });
  try {
    const calls = f.workspaces.pushApproved.mock.calls.length; const tasks: Promise<void>[] = [];
    const publication = createPublication({ storage,github: f.github,workspaces: f.workspaces,verification: f.verification,cancelAttempt: async () => {},isClosed: () => false,logFailure: vi.fn(),enqueue: task => { tasks.push(task()); } });
    expect(tasks).toEqual([]); expect(f.workspaces.pushApproved.mock.calls).toHaveLength(calls);
    storage.interruptAttempts();
    const request = { deliveryId,authorizedMode: 'pr' as const,authorized: true as const };
    const context = () => ({ operationId: randomUUID(),expectedRevision: `"${f.attemptId}:${storage.getAttempt(f.attemptId).revision}"` });
    expect(() => publication.complete(f.attemptId,request,context())).toThrow(expect.objectContaining({ code: 'RESOURCES_NOT_RECONCILED' }));
    confirmTerminalStops(f, f.attemptId, storage.executionPersistence());
    const op = publication.complete(f.attemptId,request,context());
    await Promise.all(tasks); expect(storage.getOperation(op.operation_id)?.state).toBe('succeeded'); expect(storage.getPublicationSummary(f.attemptId).localState).toBe('completed');
  } finally { storage.close(); }
});

it('migrates actual v14 journals without fabricating upgrades, preserving receipts and immutable history', async () => {
  const f = await fixture('commit'); await f.implement(); await f.approve(); const before = effects(f); const instance = f.storage.getSettings().installation_id;
  await f.pipeline.close(); f.storage.close();
  const sql = readFileSync(new URL('../../apps/controller/src/modules/storage/migrations/014_local_publication.sql',import.meta.url),'utf8');
  f.db.transaction(() => {
    removeQueueSchedulerSchema(f.db);
    f.db.exec('DROP TABLE publication_upgrades');
    // v14 reconstructs its own original journal definitions using the existing confirmed rows.
    f.db.exec(sql); f.db.exec('DELETE FROM schema_migrations WHERE version=15; PRAGMA user_version=14');
  })();
  const storage = openStorage({ dataDirectory: f.directory });
  try {
    expect(storage.getDiagnostics().schemaVersion).toBe(34); expect(storage.getSettings().installation_id).toBe(instance); expect(storage.getEffects(f.attemptId)).toEqual(before);
    expect(f.db.prepare('SELECT count(*) AS n FROM publication_upgrades').get()).toEqual({ n: 0 }); expect(f.db.pragma('foreign_key_check')).toEqual([]);
    expect(() => f.db.prepare("UPDATE effects SET reason='CHANGED' WHERE operation_id=?").run(before[0]!.operationId)).toThrow();
  } finally { storage.close(); }
});

it('exposes protected upgrade summary/authorization with CAS and an operation receipt over HTTP', async () => {
  const f = await fixture('icr'); await f.implement(); await f.approve();
  const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory,FACTORY_PORT: '4317',FACTORY_LOG_LEVEL: 'silent' },process.cwd()),f.storage,undefined,undefined,undefined,f.pipeline); await app.ready();
  try {
    const host = '127.0.0.1:4317'; const origin = 'http://'+host;
    confirmTerminalStops(f, f.attemptId);
    const boot = await app.inject({ method: 'POST',url: '/api/v1/session',headers: { host,origin,'x-factory-client': 'web' },payload: {} });
    const cookie = String(boot.headers['set-cookie']).split(';')[0]!;
    const body = upgrade(f,'pr'); const c = f.context(); const url = `/api/v1/attempts/${f.attemptId}/publication/authorize-upgrade`;
    const headers = { host,origin,cookie,'x-csrf-token': boot.json<{ csrf_token: string }>().csrf_token,'if-match': c.expectedRevision,'idempotency-key': c.operationId };
    expect((await app.inject({ method: 'POST',url,headers: { ...headers,'x-csrf-token': 'invalid' },payload: toHttpAuthorizeUpgrade(body) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST',url,headers: { ...headers,'if-match': 'stale' },payload: toHttpAuthorizeUpgrade(body) })).statusCode).toBe(412);
    const response = await app.inject({ method: 'POST',url,headers,payload: toHttpAuthorizeUpgrade(body) });
    expect({ status: response.statusCode,code: response.statusCode >= 400 ? response.json<{ code: string }>().code : null }).toEqual({ status: 202,code: null });
    expect(response.headers.location).toBe(`/api/v1/operations/${c.operationId}`); await f.pipeline.drain();
    const get = await app.inject({ method: 'GET',url: `/api/v1/deliveries/${body.deliveryId}`,headers: { host,cookie } });
    expect(get.json<{ publication: unknown }>().publication).toMatchObject({ mode: 'pr',local_state: 'completed',pull_request: { state: 'confirmed' } });
  } finally { await app.close(); }
});
