import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { vi, type Mock } from 'vitest';
import type { GitHubMutationResult, GitHubQueryResult, ImplementerResult, IssueContext, ProjectItem, ReviewerResult, ProjectConfiguration, PreparationChoices } from '#contracts';
import { attemptFixture, complete, confirmTerminalStops } from './attempt.js';
import { createPipeline } from '../../apps/controller/src/modules/pipeline/index.js';
import { digest } from '../../apps/controller/src/modules/execution/roles.js';
import type { GitHub, GitHubBeforeSendContext, GitHubEffectRequest, IssueAuthorityContext, IssueCommentConfirmationContext, IssueStatusConfirmationContext } from '../../apps/controller/src/modules/github/index.js';
import type { Workspaces } from '../../apps/controller/src/modules/workspaces/index.js';

type PurposeIssueContext = IssueAuthorityContext | IssueCommentConfirmationContext | IssueStatusConfirmationContext | IssueContext | ProjectItem;
type Purpose = 'queue' | 'authority' | 'comment_confirmation' | 'status_confirmation';
type PurposeIssueReader = Mock<(id: string, purpose: Purpose) => Promise<GitHubQueryResult<PurposeIssueContext>>>;

export function withPublicationIssueProjections<T extends Pick<GitHub, 'getIssueContextById'>>(github: T) {
  const issueReader: PurposeIssueReader = vi.fn(async (id: string, purpose: Purpose): Promise<GitHubQueryResult<PurposeIssueContext>> => {
    const response = await github.getIssueContextById(id);
    const issue = response.state === 'complete' && response.data && 'body' in response.data ? response.data : null;
    if (!issue) return { ...response, data: null };
    if (purpose === 'authority') {
      return { ...response, data: { id: issue.id, state: issue.state, repository: issue.repository, assignees: issue.assignees, blockers: issue.blockers, memberships: issue.memberships } };
    }
    if (purpose === 'comment_confirmation') {
      return { ...response, data: { id: issue.id, repository: { id: issue.repository.id }, comments: issue.comments } };
    }
    if (purpose === 'status_confirmation') {
      return { ...response, data: { id: issue.id, repository: { id: issue.repository.id }, memberships: issue.memberships } };
    }
    return response;
  });
  function getIssueContextById(id: string, options: { purpose: 'authority' }): Promise<GitHubQueryResult<IssueAuthorityContext>>;
  function getIssueContextById(id: string, options: { purpose: 'comment_confirmation' }): Promise<GitHubQueryResult<IssueCommentConfirmationContext>>;
  function getIssueContextById(id: string, options: { purpose: 'status_confirmation' }): Promise<GitHubQueryResult<IssueStatusConfirmationContext>>;
  function getIssueContextById(id: string, options?: { purpose?: 'queue' }): Promise<GitHubQueryResult<IssueContext | ProjectItem>>;
  function getIssueContextById(id: string, options?: { purpose?: 'queue' | 'authority' | 'comment_confirmation' | 'status_confirmation' }): Promise<GitHubQueryResult<PurposeIssueContext>> {
    return issueReader(id, options?.purpose ?? 'queue');
  }
  return { github: { ...github, getIssueContextById }, issueReader };
}

export async function publicationFixture(composed = true, mode: 'icr' | 'commit' | 'pr' = 'icr', hasDelta = true,
  options: { baseBranch?: string; temporaryRoot?: string; correctionLimit?: number; baseSha?: string; deliveryBranch?: ProjectConfiguration['delivery_branch']; recordCleanInitialization?: boolean; inheritPreviousAttempt?: boolean; sourceKind?: 'local' | 'github'; projectFolder?: string;
    /** The Preparar choice for this attempt; the project default applies when absent. */
    preparationBranch?: PreparationChoices['overrides']['delivery_branch']; folderBranches?: string[] } = {}) {
  const f = await attemptFixture(options.temporaryRoot, options.baseSha, undefined, undefined, options.recordCleanInitialization ?? false, options.sourceKind, options.projectFolder); await f.pipeline.close();
  if (options.folderBranches) f.workspaces.projectFolderBranches.mockResolvedValue(options.folderBranches);
  if (options.correctionLimit !== undefined || options.deliveryBranch !== undefined) {
    const current = f.storage.getConfiguration(f.projectId);
    const { id: _id, project_id: _project, revision: _revision, created_at_ms: _time, ...configuration } = current.view.configuration;
    f.storage.saveConfiguration({ operationId: randomUUID(), expectedRevision: current.etag, projectId: f.projectId,
      body: { project_changes: { ...(options.correctionLimit === undefined ? {} : { correction_limit:options.correctionLimit }),...(options.deliveryBranch === undefined ? {} : { delivery_branch:options.deliveryBranch }) } },
      configuration: { ...configuration,...(options.correctionLimit === undefined ? {} : { correction_limit:options.correctionLimit }),...(options.deliveryBranch === undefined ? {} : { delivery_branch:options.deliveryBranch }) }, globalChanges: {} });
  }
  const verifyRetainedDelivery = vi.fn(async () => {});
  const folderCapability = vi.fn(async () => ({ available: false, reason: 'NATIVE_OPEN_UNAVAILABLE' }));
  const reconcileLocalCommit = vi.fn<Workspaces['reconcileLocalCommit']>(async () => ({ state: 'unknown', receipt: null, reason: 'COMMIT_NOT_OBSERVED' }));
  async function authorizeMutation(authorize: GitHubEffectRequest['authorize']): Promise<void> {
    if (!authorize) return;
    const signal = new AbortController().signal;
    const context: GitHubBeforeSendContext = { signal, deadlineMonotonicMs: Number.MAX_SAFE_INTEGER,
      assertActive() { if (signal.aborted) throw new Error('AUTHORIZATION_REVOKED'); } };
    await authorize(context);
  }
  const createLocalCommit = vi.fn<Workspaces['createLocalCommit']>(async (delivery,effect,authorize) => {
    await authorize();
    const deliveryIdentity = effect.expectedIdentity.targetOperationId ? { targetOperationId:effect.expectedIdentity.targetOperationId,
      taskType:effect.expectedIdentity.taskType!,taskDescription:effect.expectedIdentity.taskDescription! } : {};
    const result = hasDelta ? { state: 'confirmed' as const, receipt: { id: 'c'.repeat(40), contentIdentity: delivery.contentIdentity!, parentSha: effect.expectedIdentity.parentSha!,
      branchRef: effect.expectedIdentity.branchRef!, operationId: effect.operationId, ...deliveryIdentity }, reason: null }
      : { state: 'not_applicable' as const, receipt: null, reason: 'APPROVED_NO_DELTA' };
    if (result.state === 'confirmed') reconcileLocalCommit.mockResolvedValue(result);
    return result;
  });
  const remotePRs = new Map<string,GitHubMutationResult>();
  const mutateEffect = vi.fn(async ({ effect, body, authorize }: GitHubEffectRequest): Promise<GitHubMutationResult> => {
    await authorizeMutation(authorize);
    const identity = effect.expectedIdentity;
    if (effect.kind === 'project_status') {
      f.issue.memberships[0]!.statusValues[0]!.optionId = identity.optionId!;
      return { state: 'unknown', receipt: null, reason: 'STATUS_READBACK_REQUIRED', retryAtMs: null };
    }
    if (effect.kind === 'issue_body') {
      f.issue.body = body!;
      return { state: 'unknown', receipt: null, reason: 'ISSUE_BODY_READBACK_REQUIRED', retryAtMs: null };
    }
    if (effect.kind === 'pull_request') {
      const result: GitHubMutationResult = { state: 'confirmed',receipt: { id: 'PR_test',url: `https://github.com/${identity.repositoryOwner}/${identity.repositoryName}/pull/123`,commitSha: identity.commitSha!,branchRef: identity.branchRef!,repositoryId: identity.repositoryId!,baseBranch: identity.baseBranch!, ...(identity.targetOperationId ? { targetOperationId:identity.targetOperationId,taskType:identity.taskType!,taskDescription:identity.taskDescription! } : {}) },reason: null,retryAtMs: null };
      remotePRs.set(effect.operationId,result); return result;
    }
    const id = `COMMENT_${randomUUID()}`; const url = `${f.issue.url}#issuecomment-123`;
    f.issue.comments.push({ id, url, body: body!, author: { id: 'ACCOUNT_test', login: 'test-user' }, updatedAt: '2026-10-17T00:00:00Z' });
    return { state: 'confirmed', receipt: { id, url }, reason: null, retryAtMs: null };
  });
  const projected = withPublicationIssueProjections({ ...f.github, getRepository: vi.fn(async () => complete(structuredClone(f.issue.repository))), mutateEffect,
    reconcilePullRequest: vi.fn<GitHub['reconcilePullRequest']>(async e => remotePRs.get(e.operationId) ?? { state: 'unknown',receipt: null,reason: 'PR_NOT_OBSERVED',retryAtMs: null }) });
  const { github, issueReader } = projected;
  const workspaces = { ...f.workspaces, verifyRetainedDelivery, folderCapability,
    importIntegrationBase: vi.fn<Workspaces['importIntegrationBase']>(async () => {}),
    inspectIntegrationTarget: vi.fn<Workspaces['inspectIntegrationTarget']>(async (localPath,task) => ({ localPath,baseSha:task.baseSha,rootIdentity:'controlled-target' })),
    inspectDeliveryTarget: vi.fn<Workspaces['inspectDeliveryTarget']>(async (root,task) => ({ repository_id: f.issue.repository.id,local_path: root,
      local_identity: { ...(task.deliveryBranch ? { branch_kind:task.deliveryBranch.kind } : {}),format_version: 1,root_identity: 'controlled-target',git_directory_identity: 'controlled-git',remote_name:'origin',remote_hash:'f'.repeat(64),base_branch: task.baseBranch,base_sha: task.baseSha,
        observed_head: options.baseSha ?? 'a'.repeat(40),observed_branch_ref: 'refs/heads/main',working_state_hash: 'd'.repeat(64),index_hash: 'e'.repeat(64) },
      branch_ref: task.deliveryBranch ? `refs/heads/${task.deliveryBranch.name}` : 'refs/heads/feat/17-executable-issue',task_type: 'feat',task_description: 'Executable issue' })),
    getDeliveryDiff: vi.fn<Workspaces['getDeliveryDiff']>(async delivery => ({ deliveryId: delivery.id, baseSha: delivery.baseSha,
      contentIdentity: delivery.contentIdentity!, entries: [], nextCursor: null, hasMore: false })),
    createLocalCommit,
    reconcileLocalCommit,
    createTargetCommit: vi.fn<Workspaces['createTargetCommit']>(async (delivery,effect,_target,authorize) => createLocalCommit(delivery,effect,authorize)),
    reconcileTargetCommit: vi.fn<Workspaces['reconcileTargetCommit']>(async (delivery,effect,_target) => reconcileLocalCommit(delivery,effect)),
    pushApproved: vi.fn<Workspaces['pushApproved']>(async (_d,e,_account,authorize) => { await authorize(); const targetIdentity = e.expectedIdentity.targetOperationId
      ? { targetOperationId:e.expectedIdentity.targetOperationId,taskType:e.expectedIdentity.taskType!,taskDescription:e.expectedIdentity.taskDescription! } : {};
      return { state: 'confirmed',receipt: { id: e.expectedIdentity.commitSha!,commitSha: e.expectedIdentity.commitSha!,branchRef: e.expectedIdentity.branchRef!,repositoryId: e.expectedIdentity.repositoryId!, ...targetIdentity },reason: null }; }),
    reconcilePush: vi.fn<Workspaces['reconcilePush']>(async () => ({ state: 'unknown',receipt: null,reason: 'REMOTE_REF_NOT_OBSERVED' })),
    captureDelivery: vi.fn(async (input: { deliveryId: string }) => ({ gitRef: `refs/factory/deliveries/${input.deliveryId}`, contentIdentity: digest(input).slice(0,40), commitSha: digest({ commit: input }).slice(0,40), hasDelta, warnings: [] })),
    materializeReview: vi.fn(async (d: { attemptId: string }, id: string) => join(f.directory,'work',d.attemptId,'reviews',id,'checkout')) };
  const pipeline = createPipeline({ ...f.dependencies, github, workspaces, ...(composed ? { publication: { github, workspaces } } : {}) });
  if (options.baseBranch) { f.observation.base!.branch = options.baseBranch; f.observation.remote!.branch!.name = options.baseBranch; }
  let predecessorId: string | undefined;
  if (options.inheritPreviousAttempt) {
    const initial = await f.prepare(f.projectId,mode,options.baseBranch);
    const predecessor = await pipeline.startAttempt(initial.body,initial.context); await pipeline.drain();
    predecessorId = predecessor.resource.id;
    confirmTerminalStops(f,predecessorId);
    f.db.prepare("UPDATE attempts SET phase='finished',result='interrupted' WHERE id=?").run(predecessorId);
  }
  const prepare = await f.prepare(f.projectId,mode,options.baseBranch,predecessorId,options.preparationBranch); const op = await pipeline.startAttempt(prepare.body,prepare.context); await pipeline.drain();
  const attemptId = op.resource.id;
  const status = () => f.storage.getAttempt(attemptId);
  const context = () => ({ operationId: randomUUID(), expectedRevision: `"${attemptId}:${status().revision}"` });
  async function implement(checks: ImplementerResult['checks'] = []) {
    const passage = f.persistence.getPassage({ passageId: status().passageId });
    const result: ImplementerResult = { formatVersion: 1, summary: 'Implemented captured scope', writesStopped: true, additionalChangesJustification: null,
       criteria: ['ac-1','ac-2'].map(criterionId => ({ criterionId, verdict: 'passed', evidence: ['Observed version behavior'] })), checks,
      ...(passage.binding.round > 1 ? { findingResponses: f.storage.getOpenFindings(attemptId,passage.binding.round).map(x => ({ findingId: x.id,response: 'Corrected the finding',evidence: ['New version evidence'] })) } : {}) };
    f.persistence.acceptResult({ binding: passage.binding, result, sha256: digest(result) }); await pipeline.drain();
  }
  async function approve(approved = true, extraFindings: ReviewerResult['findings'] = [], unresolvedNonblocking = false) {
    const review = f.storage.getReview(status().deliveryId!)!;
    const passage = f.persistence.getPassage({ passageId: review.passageId });
    f.storage.recordReviewIntegrity(passage.binding,true);
    const prior = f.storage.getOpenFindings(attemptId,passage.binding.round);
    const result: ReviewerResult = { formatVersion: 1, summary: approved ? 'Independent approval' : 'Concrete endpoint failure', verdict: approved ? 'approved' : 'rejected',
      assessments: prior.map(finding => ({ findingId:finding.id,progress:'not_assessable',evidence:[],justification:'The fixture has no independent evidence of progress for this version.' })),
      criteria: ['ac-1','ac-2'].map(criterionId => ({ criterionId, verdict: approved ? 'passed' : 'failed', evidence: ['Checked immutable tree'] })),
      findings: [...(approved ? [] : [{ key: 'endpoint',criterionIds: ['ac-1'],category: 'correctness',problem: 'Incorrect endpoint response',evidence: ['Observed wrong value'],expectedResult: 'Correct response',priority: 'high' as const,blocking: true }]),...extraFindings],
      resolutions: prior.map(x => ({ findingKey: x.id,verdict: approved && (x.blocking || !unresolvedNonblocking) ? 'resolved' : 'unresolved',evidence: ['Independent resolution evidence'] })) };
    const accepted = f.persistence.acceptResult({ binding: passage.binding, result, sha256: digest(result) });
    await pipeline.drain(); return accepted;
  }
  return { ...f, pipeline, workspaces, github, issueReader, mutateEffect, verifyRetainedDelivery, folderCapability, attemptId, status, context, implement, approve,
    async close() { await pipeline.close(); await f.close(); } };
}
export type PublicationFixture = Awaited<ReturnType<typeof publicationFixture>>;
