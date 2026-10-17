import { createHash } from 'node:crypto';
import { Value } from '@sinclair/typebox/value';
import { EffectView, type GitHubMutationResult } from '#contracts';
import { collect, GraphQLReader, object, string } from './transport.js';

export const pullRequestMutation = `mutation FactoryPullRequest($input:CreatePullRequestInput!) {
  createPullRequest(input:$input) { clientMutationId pullRequest { id } }
}`;
const query = `query FactoryPullRequests($repositoryId:ID!,$head:String!,$headRef:String!,$baseRef:String!,$cursor:String) {
  node(id:$repositoryId) { ... on Repository { id headRef:ref(qualifiedName:$headRef) { target { oid } }
    baseRef:ref(qualifiedName:$baseRef) { target { oid } } pullRequests(first:100,after:$cursor,headRefName:$head) {
    nodes { id url title body headRefName headRefOid baseRefName state
      author { ... on User { id } ... on Bot { id } }
      repository { id } headRepository { id } baseRepository { id }
    } pageInfo { hasNextPage endCursor }
  } } }
}`;
export const prUnknown = (reason: string): GitHubMutationResult => ({ state: 'unknown',receipt: null,reason,retryAtMs: null });
export async function inspectPullRequest(reader: GraphQLReader, effect: EffectView, accountId: string): Promise<GitHubMutationResult> {
  if (!Value.Check(EffectView,effect) || effect.kind !== 'pull_request') return prUnknown('EFFECT_INPUT_INVALID');
  const i = effect.expectedIdentity;
  if (!i.branchRef?.startsWith('refs/heads/') || !i.baseBranch || !i.marker || !i.bodyHash || !i.commitSha || !i.title) return prUnknown('EFFECT_INPUT_INVALID');
  const head = i.branchRef.slice('refs/heads/'.length);
  const response = await collect(reader.scope(),query,{ repositoryId: i.repositoryId,head,headRef: i.branchRef,baseRef: `refs/heads/${i.baseBranch}` }, data => {
    const node = object(data.node);
    if (node.id !== i.repositoryId || object(object(node.headRef).target).oid !== i.commitSha || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(string(object(object(node.baseRef).target).oid))) throw new Error('IDENTITY_INVALID');
    return node.pullRequests;
  }, node => node);
  if (response.state !== 'complete' || !response.data) return { ...prUnknown('PR_READ_INCOMPLETE'),retryAtMs: response.retryAtMs };
  // All PRs for this head are inspected; an unrelated or duplicated marker cannot be adopted.
  const matches = response.data.filter(p => typeof p.body === 'string' && p.body.startsWith(i.marker!+'\n'));
  if (matches.length !== 1) return prUnknown(response.data.length ? 'PR_IDENTITY_CONFLICT' : 'PR_NOT_OBSERVED');
  try {
    const p = matches[0]!;
    if (p.state !== 'OPEN' || p.title !== i.title || p.headRefName !== head || p.headRefOid !== i.commitSha || p.baseRefName !== i.baseBranch ||
      object(p.author).id !== accountId || object(p.repository).id !== i.repositoryId || object(p.headRepository).id !== i.repositoryId || object(p.baseRepository).id !== i.repositoryId ||
      createHash('sha256').update(string(p.body)).digest('hex') !== i.bodyHash ||
      typeof p.url !== 'string' || !p.url.startsWith(`https://github.com/${i.repositoryOwner}/${i.repositoryName}/pull/`) || !/\/pull\/[1-9][0-9]*$/.test(p.url)) return prUnknown('PR_IDENTITY_CONFLICT');
    return { state: 'confirmed',receipt: { id: string(p.id),url: p.url,commitSha: i.commitSha,branchRef: i.branchRef,repositoryId: i.repositoryId,baseBranch: i.baseBranch },reason: null,retryAtMs: null };
  } catch { return prUnknown('PR_IDENTITY_CONFLICT'); }
}
