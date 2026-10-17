import { Value } from '@sinclair/typebox/value';
import { createHash } from 'node:crypto';
import { EffectView, GitHubId, OperationId, type GitHubMutationResult } from '#contracts';
import { GraphQLReader, object } from './transport.js';
import { inspectPullRequest, pullRequestMutation } from './pull-requests.js';

/** Granted only by trusted host composition for known real targets. Never sourced from HTTP or environment. */
export interface GitHubMutationAuthorization { accountId: string; repositoryIds: readonly string[]; projectIds: readonly string[] }
export interface GitHubEffectRequest { effect: EffectView; accountId: string; body?: string; authorize?: () => Promise<void> }
const commentMutation = `mutation FactoryComment($input:AddCommentInput!) {
  addComment(input:$input) { clientMutationId commentEdge { node { id url body issue { id } repository { id } } } }
}`;
const statusMutation = `mutation FactoryStatus($input:UpdateProjectV2ItemFieldValueInput!) {
  updateProjectV2ItemFieldValue(input:$input) { clientMutationId projectV2Item { id } }
}`;
export function createEffectWriter(reader: GraphQLReader, authorization?: GitHubMutationAuthorization) {
  return async ({ effect, accountId, body, authorize }: GitHubEffectRequest): Promise<GitHubMutationResult> => {
    const denied = (reason: string): GitHubMutationResult => ({ state: 'failed_known', receipt: null, reason, retryAtMs: null });
    if (!Value.Check(EffectView, effect) || !Value.Check(OperationId, effect.operationId) || !Value.Check(GitHubId, accountId) || effect.state !== 'running') return denied('EFFECT_INPUT_INVALID');
    if (effect.kind === 'local_commit' || effect.kind === 'push') return denied('EFFECT_INPUT_INVALID');
    const identity = effect.expectedIdentity;
    if (!authorization || authorization.accountId !== accountId || !authorization.repositoryIds.includes(identity.repositoryId) ||
      (effect.kind === 'project_status' && (!identity.projectId || !authorization.projectIds.includes(identity.projectId)))) return denied('MUTATION_NOT_AUTHORIZED');
    if ((effect.kind === 'issue_comment' || effect.kind === 'pull_request') && (typeof body !== 'string' || body.length > 60_000 || !identity.marker || !body.startsWith(identity.marker+'\n') || createHash('sha256').update(body).digest('hex') !== identity.bodyHash)) return denied('EFFECT_INPUT_INVALID');
    if (effect.kind === 'pull_request') {
      if (!identity.baseBranch || !identity.branchRef?.startsWith('refs/heads/') || !identity.commitSha || !identity.title || /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:#[0-9]|https:\/\/github\.com\/)/i.test(body!)) return denied('EFFECT_INPUT_INVALID');
      const prior = await inspectPullRequest(reader,effect,accountId);
      if (prior.state === 'confirmed') return prior;
      if (prior.reason !== 'PR_NOT_OBSERVED') return denied(prior.reason ?? 'PR_READ_INCOMPLETE');
      try { await authorize?.(); } catch { return denied('EFFECT_AUTHORITY_REVOKED'); }
      let sent = false;
      const response = await reader.scope().query(pullRequestMutation,{ input: { repositoryId: identity.repositoryId,headRepositoryId: identity.repositoryId,
        headRefName: identity.branchRef.slice(11),baseRefName: identity.baseBranch,title: identity.title,body,maintainerCanModify: false,draft: false,clientMutationId: effect.operationId } },() => { sent = true; });
      if (!sent) return { ...denied(response.diagnostics[0]?.code ?? 'EFFECT_UNCONFIRMED'),retryAtMs: response.retryAtMs };
      // A mutation response alone never confirms PR identity or the remote head SHA.
      return inspectPullRequest(reader,effect,accountId);
    }
    if (effect.kind === 'project_status' && (!identity.projectId || !identity.itemId || !identity.fieldId || !identity.optionId)) return denied('EFFECT_INPUT_INVALID');
    const input = effect.kind === 'issue_comment' ? { subjectId: identity.issueId, body, clientMutationId: effect.operationId }
      : { projectId: identity.projectId, itemId: identity.itemId, fieldId: identity.fieldId, value: { singleSelectOptionId: identity.optionId }, clientMutationId: effect.operationId };
    try { await authorize?.(); } catch { return denied('EFFECT_AUTHORITY_REVOKED'); }
    let sent = false;
    const response = await reader.scope().query(effect.kind === 'issue_comment' ? commentMutation : statusMutation, { input }, () => { sent = true; });
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
