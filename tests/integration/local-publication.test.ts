import { toHttpCompletePublication, toHttpPublicationSummary } from '../../apps/controller/src/http/execution-views.js';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { publicationFixture, type PublicationFixture } from '../fixtures/publication.js';
import { confirmTerminalStops } from '../fixtures/attempt.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createPublication } from '../../apps/controller/src/modules/publication/index.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { CaptureError } from '../../apps/controller/src/modules/workspaces/index.js';

const fixtures: PublicationFixture[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function fixture(hasDelta = true) { const f = await publicationFixture(true,'commit',hasDelta); fixtures.push(f); return f; }
it.each(['commit','pr'] as const)('publishes inherited approved content in %s mode on the repository base without an integration round, even at the correction limit', async mode => {
  const f = await publicationFixture(true,mode,true,{ inheritPreviousAttempt:true,correctionLimit:0 }); fixtures.push(f);
  await f.implement();
  const delivery = f.storage.getDelivery(f.status().deliveryId!).delivery;
  const capture = f.storage.getAttemptCapture(f.attemptId);
  expect(capture.workspace).toMatchObject({ initial_state:{kind:'inherited_attempt'},comparison_base_sha:'b'.repeat(40),inherited_base_sha:'a'.repeat(40) });
  expect(delivery.baseSha).toBe('b'.repeat(40));
  f.workspaces.inspectDeliveryTarget.mockImplementation(async (root,task) => {
    expect(task.baseSha).toBe('a'.repeat(40));
    return { repository_id:f.issue.repository.id,local_path:root,
      local_identity:{format_version:1,root_identity:'controlled-target',git_directory_identity:'controlled-git',remote_name:'origin',remote_hash:'f'.repeat(64),base_branch:task.baseBranch,base_sha:task.baseSha,
        observed_head:task.baseSha,observed_branch_ref:'refs/heads/main',working_state_hash:'d'.repeat(64),index_hash:'e'.repeat(64)},
      branch_ref:'refs/heads/feat/17-inherited',task_type:'feat',task_description:'Inherited issue' };
  });
  await f.approve();
  expect(f.status()).toMatchObject({phase:'finished',result:'delivered',round:1});
  expect(f.storage.getDelivery(delivery.id).delivery).toEqual(delivery);
  expect(f.storage.getReview(delivery.id)?.state).toBe('approved');
  const effect = f.storage.getEffects(f.attemptId).find(e => e.kind === 'local_commit')!;
  expect(effect).toMatchObject({state:'confirmed',expectedIdentity:{parentSha:'a'.repeat(40),contentIdentity:delivery.contentIdentity},receipt:{parentSha:'a'.repeat(40)}});
  expect(f.workspaces.createTargetCommit).toHaveBeenCalledOnce();
  expect(f.issue.comments).toHaveLength(mode === 'commit' ? 1 : 0);
  for (const remote of f.storage.getEffects(f.attemptId).filter(e => ['push','pull_request'].includes(e.kind))) {
    expect(remote).toMatchObject({state:'confirmed',expectedIdentity:{parentSha:'a'.repeat(40),contentIdentity:delivery.contentIdentity}});
  }
});
it('continues an interrupted inherited delivery without replacing its approved capture or review', async () => {
  const f = await publicationFixture(true,'commit',true,{inheritPreviousAttempt:true,correctionLimit:0}); fixtures.push(f);
  await f.implement();
  f.workspaces.inspectDeliveryTarget.mockRejectedValueOnce(new CaptureError('CONTEXT_UNAVAILABLE'));
  await f.approve();
  const delivery = f.storage.getDelivery(f.status().deliveryId!).delivery;
  const review = f.storage.getReview(delivery.id);
  confirmTerminalStops(f,f.attemptId);
  f.db.prepare("UPDATE attempts SET phase='finished',result='interrupted',diagnostic='CHANNEL_EOF' WHERE id=?").run(f.attemptId);
  const command = f.context();
  f.pipeline.completePublication(f.attemptId,{deliveryId:delivery.id,authorizedMode:'commit',authorized:true},command);
  await f.pipeline.drain();
  expect(f.storage.getOperation(command.operationId)?.state).toBe('succeeded');
  expect(f.status()).toMatchObject({phase:'finished',result:'delivered',round:1});
  expect(f.storage.getDelivery(delivery.id).delivery).toEqual(delivery);
  expect(f.storage.getReview(delivery.id)).toEqual(review);
  expect(f.workspaces.createTargetCommit).toHaveBeenCalledOnce();
});
it('still requires integration when the real publication base moves and preserves the correction limit', async () => {
  const f = await publicationFixture(true,'commit',true,{inheritPreviousAttempt:true,correctionLimit:0}); fixtures.push(f);
  await f.implement();
  f.workspaces.inspectDeliveryTarget.mockRejectedValue(new CaptureError('DELIVERY_BASE_CHANGED'));
  const importIntegrationBase = vi.fn();
  Object.assign(f.workspaces,{
    inspectIntegrationTarget:vi.fn(async () => ({baseSha:'d'.repeat(40),localPath:'controlled-target',rootIdentity:'controlled-target'})),
    importIntegrationBase,
  });
  await f.approve();
  expect(f.db.prepare('SELECT diagnostic FROM publication_requests WHERE attempt_id=? ORDER BY rowid DESC LIMIT 1').get(f.attemptId)).toEqual({diagnostic:'INTEGRATION_LIMIT'});
  expect(f.storage.getReview(f.status().deliveryId!)?.state).toBe('approved');
  expect(f.workspaces.createTargetCommit).not.toHaveBeenCalled();
  expect(importIntegrationBase).not.toHaveBeenCalled();
  expect(f.issue.comments).toHaveLength(0);
});
const request = (f: PublicationFixture) => ({ deliveryId: f.status().deliveryId!, authorizedMode: 'commit' as const, authorized: true as const });

it('commits only after durable intent/claim, then comments and completes without a GitHub code publication', async () => {
  const f = await fixture(); await f.implement();
  const commit = f.workspaces.createLocalCommit.getMockImplementation()!;
  f.workspaces.createLocalCommit.mockImplementation(async (d,e,authorize) => {
    expect(f.storage.getEffect(e.operationId)).toMatchObject({ state: 'running', deliveryId: d.id });
    expect(f.storage.getOperation(e.operationId)?.receipt).toBeDefined();
    expect(f.storage.getReview(d.id)?.state).toBe('approved'); expect(f.issue.comments).toEqual([]);
    return commit(d,e,authorize);
  });
  await f.approve();
  expect(f.status()).toMatchObject({ phase: 'finished', result: 'delivered' });
  expect(f.workspaces.createLocalCommit).toHaveBeenCalledOnce();
  const effects = f.storage.getEffects(f.attemptId);
  expect(effects.map(e => e.kind)).toEqual(['project_status','project_status','local_commit','issue_comment','project_status']);
  const local = effects.find(e => e.kind === 'local_commit')!;
  expect(local.receipt).toMatchObject({ parentSha: 'a'.repeat(40), operationId: local.operationId, contentIdentity: f.storage.getDelivery(local.deliveryId!).delivery.contentIdentity });
  expect(f.issue.comments[0]!.body).toContain(local.receipt!.id);
  expect(f.storage.getDeliveryDetail(local.deliveryId!,{}).publication).toMatchObject({ localState: 'completed', commit: { state: 'confirmed', sha: local.receipt!.id } });
  expect(f.mutateEffect.mock.calls.every(([x]) => ['project_status','issue_comment'].includes(x.effect.kind))).toBe(true);
  expect(f.db.pragma('foreign_key_check')).toEqual([]);
});

it('records a reviewed no-delta delivery as not applicable and creates no empty commit', async () => {
  const f = await fixture(false); await f.implement();
  expect(() => f.pipeline.completePublication(f.attemptId,request(f),f.context())).toThrow(expect.objectContaining({ code: 'PUBLICATION_BLOCKED' }));
  expect(f.workspaces.createLocalCommit).not.toHaveBeenCalled();
  await f.approve();
  const effect = f.storage.getEffects(f.attemptId).find(e => e.kind === 'local_commit')!;
  expect(effect).toMatchObject({ state: 'not_applicable', reason: 'APPROVED_NO_DELTA', receipt: null });
  expect(f.status().result).toBe('delivered');
  expect(f.issue.comments[0]!.body).toContain('nenhum commit vazio');
  expect(f.storage.getDeliveryDetail(effect.deliveryId!,{}).publication.commit).toMatchObject({ state: 'not_applicable', sha: null });
  expect(() => f.storage.finishEffect(effect.operationId,effect.revision,'confirmed',{ id: 'd'.repeat(40) },null)).not.toThrow();
  expect(f.storage.getEffect(effect.operationId).state).toBe('not_applicable');
});

it('reconciles a lost response without a second commit and completes only on an explicit subsequent action', async () => {
  const f = await fixture(); await f.implement();
  const commit = f.workspaces.createLocalCommit.getMockImplementation()!;
  f.workspaces.createLocalCommit.mockImplementation(async (d,e,a) => {
    const result = await commit(d,e,a);
    f.workspaces.reconcileLocalCommit.mockResolvedValue(result);
    return { state: 'unknown',receipt: null,reason: 'RESPONSE_LOST' };
  });
  await f.approve(); expect(f.status().result).toBeNull(); expect(f.issue.comments).toEqual([]);
  const d = f.status().deliveryId!;
  expect(f.storage.getDeliveryDetail(d,{}).publication).toMatchObject({ commit: { state: 'unknown' },reconcileCapability: { available: true } });
  f.pipeline.reconcilePublication(f.attemptId,{ deliveryId: d },f.context()); await f.pipeline.drain();
  expect(f.storage.getEffects(f.attemptId).find(e => e.kind === 'local_commit')?.state).toBe('confirmed');
  expect(f.status().result).toBeNull(); expect(f.issue.comments).toEqual([]);
  const context = f.context(); const op = f.pipeline.completePublication(f.attemptId,request(f),context); await f.pipeline.drain();
  expect(f.storage.getOperation(op.operation_id)?.state).toBe('succeeded');
  expect(f.pipeline.completePublication(f.attemptId,request(f),context).receipt).toEqual(op.receipt); await f.pipeline.drain();
  expect(f.workspaces.createLocalCommit).toHaveBeenCalledOnce(); expect(f.issue.comments).toHaveLength(1);
});

it('turns an observed absent delivery branch into a known failure before an explicit safe retry', async () => {
  const f = await fixture(); await f.implement();
  const create = f.workspaces.createTargetCommit.getMockImplementation()!;
  f.workspaces.createTargetCommit.mockResolvedValueOnce({ state:'unknown',receipt:null,reason:'LOCAL_RESPONSE_LOST' });
  await f.approve();
  const target = f.storage.findDeliveryTarget(f.attemptId,f.status().deliveryId!)!;
  const local = f.storage.getEffects(f.attemptId).find(e => e.kind === 'local_commit')!;
  expect(local.state).toBe('unknown');
  f.workspaces.reconcileTargetCommit.mockResolvedValueOnce({ state:'failed_known',receipt:null,reason:'COMMIT_NOT_OBSERVED' });
  f.pipeline.reconcilePublication(f.attemptId,{ deliveryId:target.delivery_id },f.context()); await f.pipeline.drain();
  expect(f.storage.getEffect(local.operationId)).toMatchObject({ state:'failed_known',reason:'COMMIT_NOT_OBSERVED' });
  expect(f.issue.comments).toEqual([]);
  f.workspaces.createTargetCommit.mockImplementation(create);
  f.pipeline.completePublication(f.attemptId,request(f),f.context()); await f.pipeline.drain();
  expect(f.storage.getEffect(local.operationId).state).toBe('confirmed');
  expect(f.workspaces.createTargetCommit).toHaveBeenCalledTimes(2);
  expect(f.status().result).toBe('delivered');
});

it('preserves approval and earlier effects on a known commit failure without restarting implementation', async () => {
  const f = await fixture(); await f.implement();
  const count = vi.mocked(f.execution.startPassage).mock.calls.length;
  const commit = f.workspaces.createLocalCommit.getMockImplementation()!;
  f.workspaces.createLocalCommit.mockResolvedValueOnce({ state: 'failed_known', receipt: null, reason: 'CONTEXT_UNAVAILABLE' });
  await f.approve(); const d = f.status().deliveryId!;
  expect(f.storage.getReview(d)?.state).toBe('approved'); expect(f.issue.comments).toEqual([]);
  expect(f.storage.getDeliveryDetail(d,{}).publication.commit?.state).toBe('failed_known');
  f.workspaces.createLocalCommit.mockImplementation(commit);
  f.pipeline.completePublication(f.attemptId,request(f),f.context()); await f.pipeline.drain();
  expect(f.status().result).toBe('delivered'); expect(vi.mocked(f.execution.startPassage).mock.calls).toHaveLength(count);
  expect(f.storage.getEffects(f.attemptId).filter(e => e.kind === 'local_commit')).toHaveLength(1);
});

it('blocks commit IO on intention rollback and forbids changing the captured mode', async () => {
  const f = await fixture(); await f.implement();
  f.db.exec("CREATE TRIGGER fail_commit BEFORE INSERT ON effects WHEN NEW.kind='local_commit' BEGIN SELECT RAISE(ABORT,'FIXTURE'); END");
  await f.approve(); expect(f.workspaces.createLocalCommit).not.toHaveBeenCalled(); expect(f.issue.comments).toEqual([]);
  expect(f.storage.getEffects(f.attemptId).some(e => e.kind === 'local_commit')).toBe(false);
  expect(() => f.pipeline.completePublication(f.attemptId,{ ...request(f),authorizedMode: 'icr' },f.context())).toThrow(expect.objectContaining({ code: 'MODE_NOT_AUTHORIZED' }));
  f.db.exec('DROP TRIGGER fail_commit');
  f.pipeline.completePublication(f.attemptId,request(f),f.context()); await f.pipeline.drain(); expect(f.status().result).toBe('delivered');
});

it('retains a late commit fact after cancellation without sending the following comment', async () => {
  const f = await fixture(); await f.implement();
  const commit = f.workspaces.createLocalCommit.getMockImplementation()!;
  f.workspaces.createLocalCommit.mockImplementation(async (d,e,authorize) => {
    const result = await commit(d,e,authorize);
    f.pipeline.cancelAttempt(f.attemptId,{},f.context());
    return result;
  });
  await f.approve();
  expect(f.storage.getEffects(f.attemptId).find(e => e.kind === 'local_commit')?.state).toBe('confirmed');
  expect(f.status().result).toBe('cancelled'); expect(f.issue.comments).toEqual([]);
});

it('completes from retained content after implementation removal and restart with old resources reconciled', async () => {
  const f = await fixture(); await f.implement();
  f.workspaces.createLocalCommit.mockResolvedValueOnce({ state: 'failed_known',receipt: null,reason: 'CONTEXT_UNAVAILABLE' });
  await f.approve(); const deliveryId = f.status().deliveryId!;
  f.db.prepare("UPDATE resources SET removed=1,revision=revision+1 WHERE attempt_id=? AND kind='implementation'").run(f.attemptId);
  await f.pipeline.close(); f.storage.close();
  const storage = openStorage({ dataDirectory: f.directory });
  try {
    confirmTerminalStops(f, f.attemptId, storage.executionPersistence());
    const tasks: Promise<void>[] = [];
    const publication = createPublication({ storage,github: f.github,workspaces: f.workspaces,
      cancelAttempt: async () => {},isClosed: () => false,logFailure: vi.fn(),enqueue: task => { tasks.push(task()); } });
    const op = publication.complete(f.attemptId,{ deliveryId,authorizedMode: 'commit',authorized: true },{ operationId: randomUUID(),expectedRevision: `"${f.attemptId}:${storage.getAttempt(f.attemptId).revision}"` });
    await Promise.all(tasks);
    expect(storage.getOperation(op.operation_id)?.state).toBe('succeeded'); expect(storage.getAttempt(f.attemptId).result).toBe('delivered');
    expect(f.folderCapability).not.toHaveBeenCalled(); expect(storage.getReview(deliveryId)?.state).toBe('approved');
  } finally { storage.close(); }
});

it('does not send a comment when recording the Git receipt fails, and reconciles without another commit', async () => {
  const f = await fixture(); await f.implement();
  const commit = f.workspaces.createLocalCommit.getMockImplementation()!;
  f.workspaces.createLocalCommit.mockImplementation(async (d,e,authorize) => {
    const result = await commit(d,e,authorize); f.workspaces.reconcileLocalCommit.mockResolvedValue(result); return result;
  });
  f.db.exec("CREATE TRIGGER fail_receipt BEFORE UPDATE ON effects WHEN NEW.kind='local_commit' AND NEW.state='confirmed' BEGIN SELECT RAISE(ABORT,'FIXTURE'); END");
  await f.approve(); expect(f.issue.comments).toEqual([]); expect(f.status().result).toBeNull();
  expect(f.storage.getEffects(f.attemptId).find(e => e.kind === 'local_commit')?.state).toBe('running');
  f.db.exec('DROP TRIGGER fail_receipt');
  f.pipeline.reconcilePublication(f.attemptId,{ deliveryId: f.status().deliveryId! },f.context()); await f.pipeline.drain();
  f.pipeline.completePublication(f.attemptId,request(f),f.context()); await f.pipeline.drain();
  expect(f.workspaces.createLocalCommit).toHaveBeenCalledOnce(); expect(f.status().result).toBe('delivered');
});

it('exposes Commit completion and its receipt through the existing protected HTTP contracts', async () => {
  const f = await fixture(); await f.implement();
  f.workspaces.createLocalCommit.mockResolvedValueOnce({ state: 'failed_known',receipt: null,reason: 'CONTEXT_UNAVAILABLE' });
  await f.approve();
  const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory,FACTORY_PORT: '4317',FACTORY_LOG_LEVEL: 'silent' },process.cwd()),f.storage,undefined,undefined,undefined,f.pipeline);
  await app.ready();
  try {
    // App startup revokes old coordination. The fixture supplies an explicit stop observation before completion.
    confirmTerminalStops(f, f.attemptId);
    const boot = await app.inject({ method: 'POST',url: '/api/v1/session',headers: { host: '127.0.0.1:4317',origin: 'http://127.0.0.1:4317','x-factory-client': 'web' },payload: {} });
    const cookie = String(boot.headers['set-cookie']).split(';')[0]!;
    const context = f.context(); const path = `/api/v1/attempts/${f.attemptId}/publication/complete`;
    const headers = { host: '127.0.0.1:4317',origin: 'http://127.0.0.1:4317',cookie,'x-csrf-token': boot.json<{ csrf_token: string }>().csrf_token,'if-match': context.expectedRevision,'idempotency-key': context.operationId };
    const denied = await app.inject({ method: 'POST',url: path,headers: { ...headers,'x-csrf-token': 'invalid' },payload: toHttpCompletePublication(request(f)) });
    expect(denied.statusCode).toBe(403);
    const response = await app.inject({ method: 'POST',url: path,headers,payload: toHttpCompletePublication(request(f)) });
    expect({ status: response.statusCode,code: response.statusCode >= 400 ? response.json<{ code: string }>().code : null }).toEqual({ status: 202,code: null });
    expect(response.headers.location).toBe(`/api/v1/operations/${context.operationId}`);
    await f.pipeline.drain();
    const get = await app.inject({ method: 'GET',url: `/api/v1/deliveries/${f.status().deliveryId}`,headers: { host: headers.host,cookie } });
    expect(get.statusCode).toBe(200);
    expect(get.json<{ publication: { commit: unknown; local_state: string } }>().publication).toMatchObject({ local_state: 'completed',commit: { state: 'confirmed',sha: 'c'.repeat(40) } });
  } finally { await app.close(); }
});

it('keeps a dirty Pasta do projeto visible with its files, then lands on "Tentar de novo" without a second commit effect', async () => {
  const f = await fixture(); await f.implement();
  const commit = f.workspaces.createTargetCommit.getMockImplementation()!;
  const block = { paths:['src/a.ts','z.txt'],pathCount:2,expectedBranch:null,currentBranch:null };
  f.workspaces.createTargetCommit.mockResolvedValueOnce({ state:'failed_known',receipt:null,reason:'PROJECT_FOLDER_DIRTY',block });
  await f.approve(); const d = f.status().deliveryId!;
  expect(f.storage.getReview(d)?.state).toBe('approved'); expect(f.status().result).toBeNull(); expect(f.issue.comments).toEqual([]);
  expect(f.db.prepare('SELECT diagnostic FROM publication_requests WHERE attempt_id=? ORDER BY rowid DESC LIMIT 1').get(f.attemptId)).toEqual({ diagnostic:'PROJECT_FOLDER_DIRTY' });
  const local = f.storage.getEffects(f.attemptId).find(e => e.kind === 'local_commit')!;
  expect(local).toMatchObject({ state:'failed_known',reason:'PROJECT_FOLDER_DIRTY' });
  const shown = f.storage.getDeliveryDetail(d,{}).publication.commit;
  expect(shown).toMatchObject({ state:'failed_known',reason:'PROJECT_FOLDER_DIRTY',blocked:block });
  expect(toHttpPublicationSummary(f.storage.getDeliveryDetail(d,{}).publication).commit?.blocked).toEqual({ paths:block.paths,path_count:2,expected_branch:null,current_branch:null });
  // The operator resolves the folder; "Tentar de novo" is the ordinary completion on the same effect.
  f.workspaces.createTargetCommit.mockImplementation(commit);
  f.pipeline.completePublication(f.attemptId,request(f),f.context()); await f.pipeline.drain();
  expect(f.status().result).toBe('delivered');
  expect(f.storage.getEffects(f.attemptId).filter(e => e.kind === 'local_commit')).toHaveLength(1);
  expect(f.storage.getEffect(local.operationId)).toMatchObject({ state:'confirmed',reason:null });
  expect(f.storage.getDeliveryDetail(d,{}).publication.commit?.blocked).toBeUndefined();
  expect(f.workspaces.createTargetCommit).toHaveBeenCalledTimes(2);
});
