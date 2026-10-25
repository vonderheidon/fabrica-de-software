import { afterEach, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { DeliverySummaryView, HttpAttemptDetail, HttpDeliveryDetail } from '#contracts';
import { publicationFixture, type PublicationFixture } from '../fixtures/publication.js';
import { toHttpAttemptDetail, toHttpDeliveryDetail } from '../../apps/controller/src/http/execution-views.js';
import { CaptureError } from '../../apps/controller/src/modules/workspaces/index.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';

const fixtures: PublicationFixture[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function fixture(mode: 'icr' | 'commit' | 'pr' = 'icr') {
  const f = await publicationFixture(true,mode,true,{ targetForIcr:mode === 'icr' }); fixtures.push(f); return f;
}
const summary = (f: PublicationFixture, id = f.status().deliveryId!) => f.storage.getDeliveryDetail(id,{}).deliverySummary;

it.each(['icr','commit','pr'] as const)('projects confirmed %s facts on E07 and E12 without implying checkout updates', async mode => {
  const f = await fixture(mode); await f.implement(); await f.approve();
  const s = summary(f);
  expect(Value.Check(DeliverySummaryView,s)).toBe(true);
  expect(s).toMatchObject({ attempt_id:f.attemptId,delivery_id:f.status().deliveryId,original_mode:mode,authorized_mode:mode,
    outcome:mode === 'icr' ? 'icr_approved' : 'complete',review_state:'approved',criteria_satisfied:2,criteria_total:2,
    checks_succeeded:0,checks_total:0,checkout_updated:false,pending_effects:[] });
  expect(s.approved_ref).toBe(f.storage.getDelivery(s.delivery_id).delivery.gitRef);
  expect(s.commit_sha !== null).toBe(mode !== 'icr');
  expect(s.local_repository !== null).toBe(mode !== 'icr');
  expect(s.pull_request_url !== null).toBe(mode === 'pr');
  const attempt = toHttpAttemptDetail(f.storage.getAttemptDetail(f.attemptId,{}));
  const delivery = toHttpDeliveryDetail(f.storage.getDeliveryDetail(s.delivery_id,{}));
  expect(attempt.delivery_summary).toEqual(s); expect(delivery.delivery_summary).toEqual(s);
  expect(Value.Check(HttpAttemptDetail,attempt)).toBe(true); expect(Value.Check(HttpDeliveryDetail,delivery)).toBe(true);
});

it('does not infer approval from the implementer and leaves missing review/check facts explicit', async () => {
  const f = await fixture();
  expect(f.storage.getAttemptDetail(f.attemptId,{}).deliverySummary).toBeNull();
  await f.implement(); const s = summary(f);
  expect(s).toMatchObject({ outcome:'pending',review_state:'pending',criteria_satisfied:0,criteria_total:2,approved_ref:null,commit_sha:null });
  expect(s.limitations.join(' ')).toContain('critérios não comprovados');
  expect(s.limitations.join(' ')).toContain('aprovação independente');
});

it('keeps partial publication and uncertainty explicit despite technical approval', async () => {
  const f = await fixture('pr'); await f.implement();
  f.workspaces.pushApproved.mockResolvedValue({ state:'unknown',receipt:null,reason:'RESPONSE_LOST' });
  await f.approve();
  expect(summary(f)).toMatchObject({ outcome:'partial',review_state:'approved',commit_sha:'c'.repeat(40),pull_request_url:null,pending_effects:['push','pull_request'] });
  expect(summary(f).limitations.join(' ')).toContain('sem confirmação');
});

it('does not present completion while the final status projection remains uncertain', async () => {
  const f = await fixture('pr'); await f.implement();
  const mutate = f.mutateEffect.getMockImplementation()!;
  f.mutateEffect.mockImplementation(async input => input.effect.kind === 'project_status' && input.effect.expectedIdentity.optionId === 'DELIVERED'
    ? { state:'unknown',receipt:null,reason:'RESPONSE_LOST',retryAtMs:null } : mutate(input));
  await f.approve();
  expect(summary(f)).toMatchObject({ outcome:'partial',pending_effects:['project_status'],pull_request_url:expect.any(String) });
});

it('updates one version through continuation and preserves the original mode and confirmed receipts', async () => {
  const f = await fixture(); await f.implement(); await f.approve();
  const before = summary(f); const upgrade = f.storage.getPublicationSummary(f.attemptId).upgrades!.find(x => x.targetMode === 'commit')!;
  f.workspaces.createTargetCommit.mockResolvedValueOnce({ state:'failed_known',receipt:null,reason:'TARGET_UNAVAILABLE' });
  await f.pipeline.authorizePublicationUpgrade(f.attemptId,{ deliveryId:before.delivery_id,currentMode:'icr',targetMode:'commit',authorized:true,
    authorizedAdditionalEffectsHash:upgrade.summaryHash },f.context()); await f.pipeline.drain();
  expect(summary(f)).toMatchObject({ original_mode:'icr',authorized_mode:'commit',outcome:'partial',commit_sha:null,pending_effects:['local_commit'] });
  f.pipeline.completePublication(f.attemptId,{ deliveryId:before.delivery_id,authorizedMode:'commit',authorized:true },f.context()); await f.pipeline.drain();
  expect(summary(f)).toMatchObject({ delivery_id:before.delivery_id,original_mode:'icr',authorized_mode:'commit',outcome:'complete',approved_ref:before.approved_ref });
  expect(f.issue.comments).toHaveLength(1);
});

it('isolates adapted and historical selections and never borrows later receipts or resolutions', async () => {
  const f = await fixture(); await f.implement(); await f.approve(); const old = summary(f);
  const upgrade = f.storage.getPublicationSummary(f.attemptId).upgrades!.find(x => x.targetMode === 'commit')!;
  f.workspaces.inspectDeliveryTarget.mockRejectedValueOnce(new CaptureError('DELIVERY_BASE_CHANGED'));
  f.workspaces.inspectIntegrationTarget.mockImplementationOnce(async localPath => ({ localPath,baseSha:'b'.repeat(40),rootIdentity:'controlled-target' }));
  await f.pipeline.authorizePublicationUpgrade(f.attemptId,{ deliveryId:old.delivery_id,currentMode:'icr',targetMode:'commit',authorized:true,
    authorizedAdditionalEffectsHash:upgrade.summaryHash },f.context()); await f.pipeline.drain();
  expect(f.storage.getAttemptDetail(f.attemptId,{}).deliverySummary).toBeNull();
  const historic = f.storage.getAttemptDetail(f.attemptId,{ roundId:'1',deliveryId:old.delivery_id }).deliverySummary!;
  expect(historic).toMatchObject({ outcome:'icr_approved',authorized_mode:'icr',commit_sha:null,approved_ref:old.approved_ref });
  expect(historic.limitations.join(' ')).toContain('adaptação posterior');
  await f.implement(); const next = summary(f);
  expect(next).toMatchObject({ outcome:'pending',approved_ref:null,commit_sha:null,criteria_satisfied:0 });
  expect(next.content_identity).not.toBe(old.content_identity);
  await f.approve(); expect(summary(f).outcome).toBe('complete');
  expect(summary(f,old.delivery_id)).toMatchObject({ authorized_mode:'icr',outcome:'icr_approved',commit_sha:null });
  expect(() => f.storage.getAttemptDetail(f.attemptId,{ roundId:'2',deliveryId:old.delivery_id })).toThrow();
});

it('counts independent resolutions only for the selected version', async () => {
  const f = await fixture(); await f.implement(); const old = f.status().deliveryId!; await f.approve(false);
  await f.implement(); await f.approve();
  expect(summary(f)).toMatchObject({ outcome:'icr_approved',resolved_findings:1 });
  expect(summary(f,old)).toMatchObject({ review_state:'rejected',resolved_findings:0,approved_ref:null });
});

it('preserves legacy commit facts without inventing a local destination', async () => {
  const f = await publicationFixture(false,'commit'); fixtures.push(f); await f.implement(); await f.approve();
  const d = f.storage.getDelivery(f.status().deliveryId!).delivery;
  const context = f.context();
  f.storage.acceptPublication({ ...context,attemptId:f.attemptId,kind:'publication.complete',body:{ deliveryId:d.id,authorizedMode:'commit',authorized:true } });
  const branchRef = `refs/heads/factory/17/${f.attemptId}`;
  const effect = f.storage.recordEffectIntent({ origin:{ attemptId:f.attemptId,deliveryId:d.id },kind:'local_commit',scopeKey:d.id,
    expectedIdentity:{ repositoryId:f.issue.repository.id,issueId:f.issue.id,contentIdentity:d.contentIdentity!,parentSha:d.baseSha,branchRef,issueNumber:17,commitTime:1 },
    authorization:{ accountId:'ACCOUNT_test',mode:'commit',sourceOperationId:context.operationId } });
  f.storage.claimEffect(effect.operationId,effect.revision,context.operationId);
  const running = f.storage.getEffect(effect.operationId);
  f.storage.finishEffect(effect.operationId,running.revision,'confirmed',{ id:'c'.repeat(40),contentIdentity:d.contentIdentity!,parentSha:d.baseSha,branchRef,operationId:effect.operationId },null);
  expect(summary(f)).toMatchObject({ outcome:'partial',commit_sha:'c'.repeat(40),branch_ref:branchRef,local_repository:null,checkout_updated:false });
  expect(summary(f).limitations.join(' ')).toContain('histórico não informa o destino local');
});

it('rejects crossed attempt IDs and keeps authenticated refreshes read-only and bounded', async () => {
  const f = await fixture('pr'); await f.implement(); await f.approve();
  const other = await fixture(); await other.implement();
  expect(() => f.storage.getAttemptDetail(f.attemptId,{ deliveryId:other.status().deliveryId! })).toThrow();
  const app = createApp(loadConfiguration({ FACTORY_DATA_DIR:f.directory,FACTORY_PORT:'4317',FACTORY_LOG_LEVEL:'silent' },process.cwd()),f.storage,undefined,undefined,undefined,f.pipeline);
  await app.ready();
  try {
    const host = '127.0.0.1:4317';
    const boot = await app.inject({ method:'POST',url:'/api/v1/session',headers:{ host,origin:`http://${host}`,'x-factory-client':'web' },payload:{} });
    const headers = { host,cookie:String(boot.headers['set-cookie']).split(';')[0]! };
    const effects = f.storage.getEffects(f.attemptId); const seq = f.db.prepare('SELECT max(seq) AS n FROM events').get();
    const calls = f.mutateEffect.mock.calls.length; const commits = f.workspaces.createTargetCommit.mock.calls.length;
    for (let i=0;i<3;i++) for (const url of [`/api/v1/attempts/${f.attemptId}`,`/api/v1/deliveries/${f.status().deliveryId}`]) {
      const response = await app.inject({ url,headers }); expect(response.statusCode).toBe(200);
      expect(response.json<{ delivery_summary: unknown }>().delivery_summary).toEqual(summary(f));
      expect(JSON.stringify(response.json<{ delivery_summary: unknown }>().delivery_summary).length).toBeLessThan(4096);
    }
    expect(f.storage.getEffects(f.attemptId)).toEqual(effects); expect(f.db.prepare('SELECT max(seq) AS n FROM events').get()).toEqual(seq);
    expect(f.mutateEffect).toHaveBeenCalledTimes(calls); expect(f.workspaces.createTargetCommit).toHaveBeenCalledTimes(commits);
  } finally { await app.close(); }
});
