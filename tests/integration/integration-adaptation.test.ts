import { afterEach, expect, it, vi } from 'vitest';
import { publicationFixture, type PublicationFixture } from '../fixtures/publication.js';
import { CaptureError } from '../../apps/controller/src/modules/workspaces/index.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';

const fixtures: PublicationFixture[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function fixture() { const f = await publicationFixture(true,'commit'); fixtures.push(f); return f; }
function changedBase(f: PublicationFixture) {
  f.workspaces.inspectDeliveryTarget.mockRejectedValueOnce(new CaptureError('DELIVERY_BASE_CHANGED'));
  f.workspaces.inspectIntegrationTarget.mockImplementationOnce(async localPath => ({ localPath,baseSha:'b'.repeat(40),rootIdentity:'controlled-target' }));
}

it('creates one new version on a changed integration base and publishes only after its own independent approval',async () => {
  const f = await fixture(); await f.implement(); const original = f.status().deliveryId!;
  const saved = f.storage.getDelivery(original).delivery;
  changedBase(f); await f.approve();
  expect(f.status()).toMatchObject({ round:2,phase:'implementing',result:null });
  expect(f.storage.getReview(original)?.state).toBe('approved');
  expect(f.storage.getDelivery(original).delivery).toEqual(saved);
  expect(f.workspaces.createTargetCommit).not.toHaveBeenCalled();
  expect(f.workspaces.importIntegrationBase).toHaveBeenCalledOnce();
  expect(f.execution.continuePassage).toHaveBeenCalledOnce();
  expect(JSON.parse(vi.mocked(f.execution.continuePassage).mock.calls[0]![1].task)).toMatchObject({ integration:{ baseSha:'b'.repeat(40),sourceDeliveryId:original } });
  await f.implement(); const adapted = f.status().deliveryId!;
  expect(adapted).not.toBe(original);
  expect(f.storage.getDelivery(adapted).delivery.baseSha).toBe('b'.repeat(40));
  expect(f.storage.getProducerResult(adapted)?.binding.deliveryVersion).toBe(adapted);
  expect(f.workspaces.createTargetCommit).not.toHaveBeenCalled();
  await f.approve();
  expect(f.status()).toMatchObject({ round:2,result:'delivered' });
  expect(f.workspaces.createTargetCommit).toHaveBeenCalledOnce();
  expect(f.workspaces.createTargetCommit.mock.calls[0]![0].id).toBe(adapted);
  expect(f.storage.getReview(original)?.state).toBe('approved');
  expect(f.storage.getReview(adapted)?.state).toBe('approved');
  expect(f.db.pragma('foreign_key_check')).toEqual([]);
});

it('reuses direct approval without a new producer or reviewer',async () => {
  const f = await fixture(); await f.implement(); await f.approve();
  expect(f.status()).toMatchObject({ round:1,result:'delivered' });
  expect(f.execution.continuePassage).not.toHaveBeenCalled();
  expect(f.workspaces.importIntegrationBase).not.toHaveBeenCalled();
});

it('does not start adaptation beyond the captured correction limit',async () => {
  const f = await fixture(); await f.implement();
  await f.approve(false); await f.implement();
  await f.approve(false); await f.implement();
  changedBase(f); const calls = vi.mocked(f.execution.continuePassage).mock.calls.length;
  await f.approve();
  expect(f.storage.getReview(f.status().deliveryId!)?.state).toBe('approved');
  expect(f.workspaces.importIntegrationBase).not.toHaveBeenCalled();
  expect(f.workspaces.createTargetCommit).not.toHaveBeenCalled();
  expect(vi.mocked(f.execution.continuePassage).mock.calls).toHaveLength(calls);
});

it('recovers a lost authorization response without a duplicate round, and restart never publishes the pending adaptation',async () => {
  const f = await fixture(); await f.implement();
  f.workspaces.createLocalCommit.mockResolvedValueOnce({ state:'failed_known',receipt:null,reason:'CONTEXT_UNAVAILABLE' });
  // Fail before sealing a destination so the next explicit action observes a changed base.
  f.workspaces.inspectDeliveryTarget.mockRejectedValueOnce(new CaptureError('CONTEXT_UNAVAILABLE'));
  await f.approve(); const original = f.status().deliveryId!;
  changedBase(f); const context = f.context();
  const body = { deliveryId:original,authorizedMode:'commit' as const,authorized:true as const };
  const op = f.pipeline.completePublication(f.attemptId,body,context); await f.pipeline.drain();
  expect(f.status().round).toBe(2);
  expect(f.pipeline.completePublication(f.attemptId,body,context).receipt).toEqual(op.receipt);
  await f.pipeline.drain();
  expect(f.storage.getRounds(f.attemptId).entries).toHaveLength(2);
  expect(f.workspaces.importIntegrationBase).toHaveBeenCalledOnce();
  await f.pipeline.close(); f.storage.close();
  const storage = openStorage({ dataDirectory:f.directory });
  try {
    expect(storage.getAttempt(f.attemptId).result).toBe('interrupted');
    expect(storage.getRounds(f.attemptId).entries).toHaveLength(2);
    expect(storage.getReview(original)?.state).toBe('approved');
    expect(() => storage.assertPublicationEligible(f.attemptId,original,true)).toThrow();
    expect(f.workspaces.createTargetCommit).not.toHaveBeenCalled();
  } finally { storage.close(); }
});

it('preserves the old approval and never commits when importing the integration base fails',async () => {
  const f = await fixture(); await f.implement(); const original = f.status().deliveryId!;
  f.workspaces.importIntegrationBase.mockRejectedValueOnce(new CaptureError('INTEGRATION_BASE_UNAVAILABLE'));
  changedBase(f); await f.approve();
  expect(f.status()).toMatchObject({ round:2,diagnostic:'INTEGRATION_BASE_UNAVAILABLE' });
  expect(f.storage.getReview(original)?.state).toBe('approved');
  expect(f.execution.continuePassage).not.toHaveBeenCalled();
  expect(f.workspaces.createTargetCommit).not.toHaveBeenCalled();
});

it('does not borrow prior approval when the adapted version is rejected',async () => {
  const f = await fixture(); await f.implement(); const original = f.status().deliveryId!;
  changedBase(f); await f.approve(); await f.implement(); const adapted = f.status().deliveryId!;
  await f.approve(false);
  expect(f.storage.getReview(original)?.state).toBe('approved');
  expect(f.storage.getReview(adapted)?.state).toBe('rejected');
  expect(f.workspaces.createTargetCommit).not.toHaveBeenCalled();
  expect(f.status().round).toBe(3);
  await f.implement();
  expect(f.storage.getDelivery(f.status().deliveryId!).delivery.baseSha).toBe('b'.repeat(40));
});

it('respects a captured zero limit and preserves the approved version with no new IO',async () => {
  const f = await publicationFixture(true,'commit',true,{ correctionLimit:0 }); fixtures.push(f);
  await f.implement(); changedBase(f); await f.approve();
  expect(f.status().round).toBe(1);
  expect(f.storage.getReview(f.status().deliveryId!)?.state).toBe('approved');
  expect(f.workspaces.importIntegrationBase).not.toHaveBeenCalled();
  expect(f.execution.continuePassage).not.toHaveBeenCalled();
  expect(f.workspaces.createTargetCommit).not.toHaveBeenCalled();
});

it('keeps the authorized continuation mode across adaptation after a finished ICR delivery with a closed issue',async () => {
  const f = await publicationFixture(true,'icr',true); fixtures.push(f);
  await f.implement(); await f.approve(); const original = f.status().deliveryId!;
  f.issue.state = 'CLOSED';
  const summary = f.storage.getPublicationSummary(f.attemptId,original);
  const upgrade = summary.upgrades!.find(x => x.targetMode === 'commit')!;
  changedBase(f);
  await f.pipeline.authorizePublicationUpgrade(f.attemptId,{ deliveryId:original,currentMode:'icr',targetMode:'commit',authorized:true,
    authorizedAdditionalEffectsHash:upgrade.summaryHash },f.context()); await f.pipeline.drain();
  expect(f.status().round).toBe(2);
  expect(f.storage.getPublicationSummary(f.attemptId,original)).toMatchObject({ mode:'icr',localState:'completed' });
  await f.implement(); await f.approve();
  expect(f.status().result).toBe('delivered');
  expect(f.storage.getAttemptCapture(f.attemptId).configuration.configuration.default_delivery_mode).toBe('icr');
  expect(f.storage.getPublicationSummary(f.attemptId,f.status().deliveryId!).mode).toBe('commit');
  expect(f.workspaces.createTargetCommit).toHaveBeenCalledOnce();
  expect(f.issue.comments).toHaveLength(2);
  expect(f.storage.getPublicationSummary(f.attemptId,original)).toMatchObject({ mode:'icr',localState:'completed',completeCapability:{ available:false } });
});

it('adapts after a sealed destination only when reconciliation proves that no delivery commit exists',async () => {
  const f = await fixture(); await f.implement();
  f.workspaces.createTargetCommit.mockResolvedValueOnce({ state:'failed_known',receipt:null,reason:'COMMIT_NOT_OBSERVED' });
  await f.approve(); const original = f.status().deliveryId!;
  const oldTarget = f.storage.findDeliveryTarget(f.attemptId,original)!;
  f.workspaces.reconcileTargetCommit.mockResolvedValueOnce({ state:'failed_known',receipt:null,reason:'COMMIT_NOT_OBSERVED' });
  f.workspaces.inspectIntegrationTarget.mockImplementationOnce(async localPath => ({ localPath,baseSha:'b'.repeat(40),rootIdentity:'controlled-target' }));
  f.pipeline.completePublication(f.attemptId,{ deliveryId:original,authorizedMode:'commit',authorized:true },f.context()); await f.pipeline.drain();
  expect(f.status().round).toBe(2);
  await f.implement(); await f.approve();
  expect(f.status().result).toBe('delivered');
  const adapted = f.storage.findDeliveryTarget(f.attemptId,f.status().deliveryId!)!;
  expect(adapted.branch_ref).not.toBe(oldTarget.branch_ref);
  expect(f.storage.findDeliveryTarget(f.attemptId,original)).toEqual(oldTarget);
  expect(f.workspaces.createTargetCommit).toHaveBeenCalledTimes(2);
});
