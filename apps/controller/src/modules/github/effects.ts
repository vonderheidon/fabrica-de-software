import { Value } from '@sinclair/typebox/value';
import { createHash } from 'node:crypto';
import { EffectView, GitHubId, OperationId, type GitHubMutationResult } from '#contracts';
import { GraphQLReader, object, type GitHubBeforeSendContext, type GitHubQueryOptions } from './transport.js';
import { inspectPullRequest, pullRequestMutation } from './pull-requests.js';

/** Granted only by trusted host composition for known real targets. Never sourced from HTTP or environment. */
export interface GitHubMutationAuthorization { accountId: string; repositoryIds: readonly string[]; projectIds: readonly string[] }
export interface AttemptEffectAuthorization { kind: 'confirmed_attempt' }
export interface GitHubEffectRequest { effect: EffectView; accountId: string; body?: string; authorize?: (context: GitHubBeforeSendContext) => Promise<void> }
const commentMutation = `mutation FactoryComment($input:AddCommentInput!) {
  addComment(input:$input) { clientMutationId commentEdge { node { id url body issue { id } repository { id } } } }
}`;
const statusMutation = `mutation FactoryStatus($input:UpdateProjectV2ItemFieldValueInput!) {
  updateProjectV2ItemFieldValue(input:$input) { clientMutationId projectV2Item { id } }
}`;
const issueBodyMutation = `mutation FactoryIssueBody($input:UpdateIssueInput!) {
  updateIssue(input:$input) { clientMutationId issue { id repository { id } } }
}`;
export function createEffectWriter(reader: GraphQLReader, authorization?: GitHubMutationAuthorization, attemptEffectAuthorization?: AttemptEffectAuthorization) {
  return async ({ effect, accountId, body, authorize }: GitHubEffectRequest): Promise<GitHubMutationResult> => {
    const denied = (reason: string): GitHubMutationResult => ({ state: 'failed_known', receipt: null, reason, retryAtMs: null });
    if (!Value.Check(EffectView, effect) || !Value.Check(OperationId, effect.operationId) || !Value.Check(GitHubId, accountId) || effect.state !== 'running') return denied('EFFECT_INPUT_INVALID');
    if (!['issue_comment','issue_body','project_status','pull_request'].includes(effect.kind) || !effect.attemptId || effect.creationId) return denied('EFFECT_INPUT_INVALID');
    const identity = effect.expectedIdentity;
    const confirmedEffect = attemptEffectAuthorization?.kind === 'confirmed_attempt' && effect.authorized && !!authorize;
    const trustedTarget = authorization?.accountId === accountId && authorization.repositoryIds.includes(identity.repositoryId ?? '') &&
      (effect.kind !== 'project_status' || authorization.projectIds.includes(identity.projectId ?? ''));
    if (!identity.repositoryId || (!confirmedEffect && !trustedTarget)) return denied('MUTATION_NOT_AUTHORIZED');
    if ((effect.kind === 'issue_comment' || effect.kind === 'pull_request') && (typeof body !== 'string' || body.length > 60_000 || !identity.marker || !body.startsWith(identity.marker+'\n') || createHash('sha256').update(body).digest('hex') !== identity.bodyHash)) return denied('EFFECT_INPUT_INVALID');
    let authorizationDenied = false;
    const beforeSend: GitHubQueryOptions['beforeSend'] = authorize ? async context => {
      try { await authorize(context); }
      catch (error) { if (!context.signal.aborted) authorizationDenied = true; throw error; }
    } : undefined;
    if (effect.kind === 'pull_request') {
      if (!identity.baseBranch || !identity.branchRef?.startsWith('refs/heads/') || !identity.commitSha || !identity.title || /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:#[0-9]|https:\/\/github\.com\/)/i.test(body!)) return denied('EFFECT_INPUT_INVALID');
      const scope = reader.scope();
      const prior = await inspectPullRequest(scope,effect,accountId,true);
      if (prior.state === 'confirmed') return prior;
      if (prior.reason !== 'PR_NOT_OBSERVED') return denied(prior.reason ?? 'PR_READ_INCOMPLETE');
      let sent = false;
      const response = await scope.query(pullRequestMutation,{ input: { repositoryId: identity.repositoryId,headRepositoryId: identity.repositoryId,
        headRefName: identity.branchRef.slice(11),baseRefName: identity.baseBranch,title: identity.title,body,maintainerCanModify: false,draft: false,clientMutationId: effect.operationId } },() => { sent = true; },1,
        beforeSend ? { beforeSend } : undefined);
      if (!sent) return { ...denied(authorizationDenied ? 'EFFECT_AUTHORITY_REVOKED' : response.diagnostics[0]?.code ?? 'EFFECT_UNCONFIRMED'),retryAtMs: response.retryAtMs };
      // A mutation response alone never confirms PR identity or the remote head SHA.
      return inspectPullRequest(scope,effect,accountId,false);
    }
    if (effect.kind === 'issue_body') {
      // The body is derived from a fresh read by the caller; only check marks of approved criteria may differ from it.
      if (!identity.issueId || !identity.criterionIds?.length || typeof body !== 'string' || body.length > 65_536) return denied('EFFECT_INPUT_INVALID');
      let sent = false;
      const response = await reader.scope().query(issueBodyMutation, { input: { id: identity.issueId, body, clientMutationId: effect.operationId } }, () => { sent = true; },1,
        beforeSend ? { beforeSend } : undefined);
      if (!sent && authorizationDenied) return denied('EFFECT_AUTHORITY_REVOKED');
      if (!sent) return { ...denied(response.diagnostics[0]?.code ?? 'EFFECT_UNCONFIRMED'), retryAtMs: response.retryAtMs };
      // Check marks are confirmed by a subsequent complete read, never by the mutation payload.
      return { state: 'unknown', receipt: null, reason: 'ISSUE_BODY_READBACK_REQUIRED', retryAtMs: response.retryAtMs };
    }
    if (effect.kind === 'project_status' && (!identity.projectId || !identity.itemId || !identity.fieldId || !identity.optionId)) return denied('EFFECT_INPUT_INVALID');
    const input = effect.kind === 'issue_comment' ? { subjectId: identity.issueId, body, clientMutationId: effect.operationId }
      : { projectId: identity.projectId, itemId: identity.itemId, fieldId: identity.fieldId, value: { singleSelectOptionId: identity.optionId }, clientMutationId: effect.operationId };
    let sent = false;
    const response = await reader.scope().query(effect.kind === 'issue_comment' ? commentMutation : statusMutation, { input }, () => { sent = true; },1,
      beforeSend ? { beforeSend } : undefined);
    if (!sent && authorizationDenied) return denied('EFFECT_AUTHORITY_REVOKED');
    if (response.state === 'complete' && response.data) {
      try {
        const payload = object(response.data[effect.kind === 'issue_comment' ? 'addComment' : 'updateProjectV2ItemFieldValue']);
        if (payload.clientMutationId !== effect.operationId) throw new Error('IDENTITY_INVALID');
        const node = effect.kind === 'issue_comment' ? object(object(payload.commentEdge).node) : object(payload.projectV2Item);
        if (!Value.Check(GitHubId, node.id)) throw new Error('IDENTITY_INVALID');
        if (effect.kind === 'issue_comment') {
          if (node.body !== body || object(node.issue).id !== identity.issueId || object(node.repository).id !== identity.repositoryId || typeof node.url !== 'string' || !/^https:\/\/github\.com\//.test(node.url) || node.url.length > 4096) throw new Error('IDENTITY_INVALID');
          return { state: 'confirmed', receipt: { id: node.id, url: node.url }, reason: null, retryAtMs: null };
        }
        if (node.id !== identity.itemId) throw new Error('IDENTITY_INVALID');
        // Status is confirmed by a subsequent complete read, not merely by an item ID in a mutation payload.
        return { state: 'unknown', receipt: null, reason: 'STATUS_READBACK_REQUIRED', retryAtMs: null };
      } catch { return { state: 'unknown', receipt: null, reason: 'EFFECT_RESPONSE_INVALID', retryAtMs: response.retryAtMs }; }
    }
    return { state: sent ? 'unknown' : 'failed_known', receipt: null, reason: response.diagnostics[0]?.code ?? 'EFFECT_UNCONFIRMED', retryAtMs: response.retryAtMs };
  };
}
