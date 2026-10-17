import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { vi } from 'vitest';
import type { CheckDefinition, GitHubMutationResult, ImplementerResult, ReviewerResult } from '#contracts';
import { attemptFixture, complete } from './attempt.js';
import { createPipeline } from '../../apps/controller/src/modules/pipeline/index.js';
import { digest } from '../../apps/controller/src/modules/execution/roles.js';
import type { GitHubEffectRequest } from '../../apps/controller/src/modules/github/index.js';
import type { Workspaces } from '../../apps/controller/src/modules/workspaces/index.js';

export async function publicationFixture(composed = true, mode: 'icr' | 'commit' | 'pr' = 'icr', hasDelta = true,
  options: { temporaryRoot?: string; checks?: CheckDefinition[]; baseSha?: string } = {}) {
  const f = await attemptFixture(options.temporaryRoot, options.baseSha); await f.pipeline.close();
  if (options.checks) {
    const current = f.storage.getConfiguration(f.projectId);
    const { id: _id, projectId: _project, revision: _revision, createdAtMs: _time, ...configuration } = current.view.configuration;
    f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: current.etag, projectId: f.projectId,
      body: { projectChanges: { checks: options.checks } }, configuration: { ...configuration, checks: options.checks }, globalChanges: {} });
  }
  const verifyRetainedDelivery = vi.fn(async () => {});
  const folderCapability = vi.fn(async () => ({ available: false, reason: 'NATIVE_OPEN_UNAVAILABLE' }));
  const getArtifact = vi.fn(async () => { throw new Error('Artifact not used by this fixture'); });
  const remotePRs = new Map<string,GitHubMutationResult>();
  const mutateEffect = vi.fn(async ({ effect, body, authorize }: GitHubEffectRequest): Promise<GitHubMutationResult> => {
    await authorize?.();
    const identity = effect.expectedIdentity;
    if (effect.kind === 'project_status') {
      f.issue.memberships[0]!.statusValues[0]!.optionId = identity.optionId!;
      return { state: 'unknown', receipt: null, reason: 'STATUS_READBACK_REQUIRED', retryAtMs: null };
    }
    if (effect.kind === 'pull_request') {
      const result: GitHubMutationResult = { state: 'confirmed',receipt: { id: 'PR_test',url: `https://github.com/${identity.repositoryOwner}/${identity.repositoryName}/pull/123`,commitSha: identity.commitSha!,branchRef: identity.branchRef!,repositoryId: identity.repositoryId!,baseBranch: identity.baseBranch! },reason: null,retryAtMs: null };
      remotePRs.set(effect.operationId,result); return result;
    }
    const id = `COMMENT_${randomUUID()}`; const url = `${f.issue.url}#issuecomment-123`;
    f.issue.comments.push({ id, url, body: body!, author: { id: 'ACCOUNT_test', login: 'test-user' }, updatedAt: '2026-10-17T00:00:00Z' });
    return { state: 'confirmed', receipt: { id, url }, reason: null, retryAtMs: null };
  });
  const github = { ...f.github, getRepository: vi.fn(async () => complete(structuredClone(f.issue.repository))), mutateEffect,
    reconcilePullRequest: vi.fn<import('../../apps/controller/src/modules/github/index.js').GitHub['reconcilePullRequest']>(async e => remotePRs.get(e.operationId) ?? { state: 'unknown',receipt: null,reason: 'PR_NOT_OBSERVED',retryAtMs: null }) };
  const workspaces = { ...f.workspaces, verifyRetainedDelivery, folderCapability,
    createLocalCommit: vi.fn<Workspaces['createLocalCommit']>(async (delivery,effect,authorize) => {
      await authorize();
      return hasDelta ? { state: 'confirmed', receipt: { id: 'c'.repeat(40), contentIdentity: delivery.contentIdentity!, parentSha: delivery.baseSha, branchRef: effect.expectedIdentity.branchRef!, operationId: effect.operationId }, reason: null }
        : { state: 'not_applicable', receipt: null, reason: 'APPROVED_NO_DELTA' };
    }),
    reconcileLocalCommit: vi.fn<Workspaces['reconcileLocalCommit']>(async () => ({ state: 'unknown', receipt: null, reason: 'COMMIT_NOT_OBSERVED' })),
    pushApproved: vi.fn<Workspaces['pushApproved']>(async (_d,e,_account,authorize) => { await authorize(); return { state: 'confirmed',receipt: { id: e.expectedIdentity.commitSha!,commitSha: e.expectedIdentity.commitSha!,branchRef: e.expectedIdentity.branchRef!,repositoryId: e.expectedIdentity.repositoryId! },reason: null }; }),
    reconcilePush: vi.fn<Workspaces['reconcilePush']>(async () => ({ state: 'unknown',receipt: null,reason: 'REMOTE_REF_NOT_OBSERVED' })),
    captureDelivery: vi.fn(async (input: { deliveryId: string }) => ({ gitRef: `refs/factory/deliveries/${input.deliveryId}`, contentIdentity: digest(input).slice(0,40), commitSha: digest({ commit: input }).slice(0,40), hasDelta, warnings: [] })),
    materializeReview: vi.fn(async (d: { attemptId: string }, id: string) => join(f.directory,'work',d.attemptId,'reviews',id,'checkout')) };
  const verification = { getArtifact, verifyDelivery: vi.fn(async (id: string) => { const run = f.storage.beginVerification(id); f.storage.finishVerification(run.id); }) };
  const pipeline = createPipeline({ ...f.dependencies, github, workspaces, verification, ...(composed ? { publication: { github, workspaces, verification } } : {}) });
  const prepare = await f.prepare(f.projectId,mode); const op = await pipeline.startAttempt(prepare.body,prepare.context); await pipeline.drain();
  const attemptId = op.resource.id;
  const status = () => f.storage.getAttempt(attemptId);
  const context = () => ({ operationId: randomUUID(), expectedRevision: `"${attemptId}:${status().revision}"` });
  async function implement() {
    const passage = f.persistence.getPassage({ passageId: status().passageId });
    const result: ImplementerResult = { formatVersion: 1, summary: 'Implemented captured scope', writesStopped: true,
      criteria: ['ac-1','ac-2'].map(criterionId => ({ criterionId, verdict: 'passed', evidence: ['Observed version behavior'] })), checks: [],
      ...(passage.binding.round > 1 ? { findingResponses: f.storage.getOpenFindings(attemptId,passage.binding.round).map(x => ({ findingId: x.id,response: 'Corrected the finding',evidence: ['New version evidence'] })) } : {}) };
    f.persistence.acceptResult({ binding: passage.binding, result, sha256: digest(result) }); await pipeline.drain();
  }
  async function approve(approved = true, extraFindings: ReviewerResult['findings'] = [], unresolvedNonblocking = false) {
    const review = f.storage.getReview(status().deliveryId!)!;
    const passage = f.persistence.getPassage({ passageId: review.passageId });
    f.storage.recordReviewIntegrity(passage.binding,true);
    const result: ReviewerResult = { formatVersion: 1, summary: approved ? 'Independent approval' : 'Concrete endpoint failure', verdict: approved ? 'approved' : 'rejected',
      criteria: ['ac-1','ac-2'].map(criterionId => ({ criterionId, verdict: approved ? 'passed' : 'failed', evidence: ['Checked immutable tree'] })),
      findings: [...(approved ? [] : [{ key: 'endpoint',criterionIds: ['ac-1'],category: 'correctness',problem: 'Incorrect endpoint response',evidence: ['Observed wrong value'],expectedResult: 'Correct response',blocking: true }]),...extraFindings],
      resolutions: f.storage.getOpenFindings(attemptId,passage.binding.round).map(x => ({ findingKey: x.id,verdict: approved && (x.blocking || !unresolvedNonblocking) ? 'resolved' : 'unresolved',evidence: ['Independent resolution evidence'] })) };
    const accepted = f.persistence.acceptResult({ binding: passage.binding, result, sha256: digest(result) });
    await pipeline.drain(); return accepted;
  }
  return { ...f, pipeline, workspaces, github, verification, mutateEffect, verifyRetainedDelivery, folderCapability, attemptId, status, context, implement, approve,
    async close() { await pipeline.close(); await f.close(); } };
}
export type PublicationFixture = Awaited<ReturnType<typeof publicationFixture>>;
