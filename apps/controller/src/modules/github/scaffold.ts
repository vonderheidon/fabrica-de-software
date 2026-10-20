import { Value } from '@sinclair/typebox/value';
import { EffectView, GitHubId, type GitHubMutationResult, type ScaffoldInput } from '#contracts';
import { GraphQLReader, object, result } from './transport.js';

/** The interactive host uses the persisted operator confirmation; restricted hosts may pin targets. */
export type ScaffoldAuthorization = { kind: 'confirmed_plan' } | {
  accountId: string;
  targets: readonly { ownerId: string; name: string; visibility: 'private' | 'public'; allowPush: boolean }[];
};
type Remote = NonNullable<ScaffoldInput['remote']>;
const listing = `query FactoryCreationOwner($id:ID!,$after:String) {
  viewer { id } node(id:$id) { __typename
    ... on User { id login repositories(first:100,after:$after) { nodes { id name owner { id } } pageInfo { hasNextPage endCursor } } }
    ... on Organization { id login repositories(first:100,after:$after) { nodes { id name owner { id } } pageInfo { hasNextPage endCursor } } }
  }
}`;
const details = `query FactoryCreationRepository($id:ID!) { viewer { id } node(id:$id) {
  ... on Repository { id name url description createdAt isPrivate isArchived owner { id login } }
} }`;
const mutation = `mutation FactoryCreateRepository($input:CreateRepositoryInput!) {
  createRepository(input:$input) { clientMutationId repository { id } }
}`;
const updateDescription = `mutation FactoryDescribeRepository($input:UpdateRepositoryInput!) {
  updateRepository(input:$input) { clientMutationId repository { id } }
}`;
export function createRemoteScaffolder(reader: GraphQLReader, authorization?: ScaffoldAuthorization) {
  const allowed = (remote: Remote | undefined, accountId: string, push = false) => Boolean(authorization &&
    (('kind' in authorization && authorization.kind === 'confirmed_plan') || ('accountId' in authorization && authorization.accountId === accountId &&
      authorization.targets.some(t => (!remote || (t.ownerId === remote.ownerId && t.name === remote.name && t.visibility === remote.visibility)) && (!push || t.allowPush)))));
  async function inspect(remote: Remote, accountId: string): Promise<import('#contracts').GitHubQueryResult<{ ownerLogin: string; repositoryId: string | null }>> {
    if (!Value.Check(GitHubId,remote.ownerId) || !Value.Check(GitHubId,accountId) || !/^[A-Za-z0-9_.-]{1,100}$/.test(remote.name) || /^\.+$/.test(remote.name)) return result('invalid_input',null,['INPUT_INVALID']);
    const scope = reader.scope(); let after: string | null = null; const cursors = new Set<string>(); const ids = new Set<string>();
    let ownerLogin: string | null = null; let repositoryId: string | null = null;
    for (let page = 0; page < 100; page++) {
      const response = await scope.query(listing,{ id: remote.ownerId,after });
      if (response.state !== 'complete' || !response.data) return { ...response,data: null };
      try {
        if (object(response.data.viewer).id !== accountId) return result('authentication_invalid',null,['AUTHENTICATION_INVALID']);
        const owner = object(response.data.node);
        if (!['User','Organization'].includes(String(owner.__typename)) || owner.id !== remote.ownerId || typeof owner.login !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(owner.login) || (ownerLogin && ownerLogin !== owner.login)) throw new Error('INVALID');
        ownerLogin = owner.login; const connection = object(owner.repositories); const info = object(connection.pageInfo);
        if (!Array.isArray(connection.nodes) || typeof info.hasNextPage !== 'boolean') throw new Error('INVALID');
        for (const value of connection.nodes) {
          const node = object(value);
          const repositoryOwner = object(node.owner);
          if (!Value.Check(GitHubId,node.id) || !Value.Check(GitHubId,repositoryOwner.id) || typeof node.name !== 'string' || ids.has(node.id)) throw new Error('INVALID');
          ids.add(node.id);
          if (repositoryOwner.id === remote.ownerId && node.name.toLowerCase() === remote.name.toLowerCase()) { if (repositoryId) throw new Error('INVALID'); repositoryId = node.id; }
        }
        if (!info.hasNextPage) return result('complete',{ ownerLogin,repositoryId });
        if (typeof info.endCursor !== 'string' || !info.endCursor || cursors.has(info.endCursor)) throw new Error('INVALID');
        cursors.add(info.endCursor); after = info.endCursor;
      } catch { return result('unavailable',null,['RESPONSE_INVALID']); }
    }
    return result('partial',null,['QUERY_LIMIT']);
  }
  function remoteOf(effect: EffectView): Remote | null {
    if (!Value.Check(EffectView,effect)) return null;
    const i = effect.expectedIdentity;
    return Value.Check(EffectView,effect) && effect.creationId && !effect.attemptId && !effect.deliveryId && effect.kind === 'create_repository' &&
      effect.scopeKey === effect.creationId && i.ownerId && i.repositoryName && i.visibility && i.repositoryOwner && i.marker && i.planHash
      ? { ownerId: i.ownerId,name: i.repositoryName,visibility: i.visibility } : null;
  }
  const denied = (reason: string, state: GitHubMutationResult['state'] = 'failed_known'): GitHubMutationResult => ({ state,receipt: null,reason,retryAtMs: null });
  async function confirm(effect: EffectView, accountId: string, repositoryId?: string): Promise<GitHubMutationResult> {
    const remote = remoteOf(effect); if (!remote || !['running','unknown','confirmed'].includes(effect.state)) return denied('EFFECT_INPUT_INVALID','unknown');
    if (!repositoryId) {
      const observed = await inspect(remote,accountId);
      if (observed.state !== 'complete' || !observed.data?.repositoryId || observed.data.ownerLogin !== effect.expectedIdentity.repositoryOwner) return { ...denied('CREATION_REMOTE_NOT_CONFIRMED','unknown'),retryAtMs: observed.retryAtMs };
      repositoryId = observed.data.repositoryId;
    }
    const response = await reader.scope().query(details,{ id: repositoryId });
    if (response.state !== 'complete' || !response.data) return { ...denied('CREATION_REMOTE_READ_INCOMPLETE','unknown'),retryAtMs: response.retryAtMs };
    try {
      const node = object(response.data.node); const owner = object(node.owner); const i = effect.expectedIdentity;
      if (object(response.data.viewer).id !== accountId || node.id !== repositoryId || node.name !== remote.name || owner.id !== remote.ownerId || owner.login !== i.repositoryOwner ||
        node.url !== `https://github.com/${i.repositoryOwner}/${remote.name}` || node.isPrivate !== (remote.visibility === 'private') || node.isArchived !== false ||
        (effect.receipt?.id !== repositoryId && node.description !== `${i.marker} Factory-Operation:${effect.operationId}`) || !effect.sentAtMs || typeof node.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(node.createdAt)) || Date.parse(node.createdAt) < effect.sentAtMs - 1000) return denied('CREATION_REMOTE_IDENTITY_CONFLICT','unknown');
      return { state: 'confirmed',receipt: { id: repositoryId,repositoryId,ownerId: remote.ownerId,repositoryName: remote.name,visibility: remote.visibility,
        url: node.url as string,operationId: effect.operationId },reason: null,retryAtMs: null };
    } catch { return denied('CREATION_REMOTE_RESPONSE_INVALID','unknown'); }
  }
  return {
    scaffoldRemoteCapability(remote: Remote | undefined, accountId: string, push = false) { return { available: allowed(remote, accountId, push), reason_code: 'CREATION_TARGET_NOT_AUTHORIZED' }; },
    inspectScaffoldRemote: inspect,
    reconcileScaffoldRepository: confirm,
    async describeScaffoldRepository(effect: EffectView, accountId: string, authorize: () => Promise<void>): Promise<GitHubMutationResult> {
      if (effect.state !== 'confirmed' || !effect.receipt || !allowed(remoteOf(effect) ?? undefined, accountId)) return denied('CREATION_REMOTE_IDENTITY_CONFLICT','unknown');
      const verified = await confirm(effect, accountId, effect.receipt.id);
      if (verified.state !== 'confirmed') return verified;
      const description = `Projeto ${effect.expectedIdentity.repositoryName}, preparado com configuração de engenharia pela Nova Fábrica.`;
      const read = await reader.scope().query(details, { id: effect.receipt.id });
      if (read.state !== 'complete' || !read.data) return denied('CREATION_REMOTE_READ_INCOMPLETE','unknown');
      const node = object(read.data.node);
      if (node.description === description) return verified;
      if (node.description !== `${effect.expectedIdentity.marker} Factory-Operation:${effect.operationId}`) return denied('CREATION_REMOTE_DESCRIPTION_CHANGED','unknown');
      try { await authorize(); } catch { return denied('CREATION_AUTHORITY_CHANGED','unknown'); }
      const updated = await reader.scope().query(updateDescription, { input: { repositoryId: effect.receipt.id, description, clientMutationId: effect.operationId } });
      if (updated.state !== 'complete') return denied('CREATION_REMOTE_DESCRIPTION_UNCONFIRMED','unknown');
      const observed = await reader.scope().query(details, { id: effect.receipt.id });
      if (observed.state !== 'complete' || !observed.data || object(observed.data.node).description !== description) return denied('CREATION_REMOTE_DESCRIPTION_UNCONFIRMED','unknown');
      return confirm(effect, accountId, effect.receipt.id);
    },
    async createScaffoldRepository(effect: EffectView, accountId: string, authorize: () => Promise<void>): Promise<GitHubMutationResult> {
      const remote = remoteOf(effect);
      if (!remote || effect.state !== 'running' || !effect.authorized || !allowed(remote,accountId)) return denied('CREATION_TARGET_NOT_AUTHORIZED');
      const prior = await inspect(remote,accountId);
      if (prior.state !== 'complete' || !prior.data || prior.data.ownerLogin !== effect.expectedIdentity.repositoryOwner) return denied('CREATION_REMOTE_READ_INCOMPLETE');
      if (prior.data.repositoryId) return denied('SCAFFOLD_REMOTE_EXISTS');
      try { await authorize(); } catch { return denied('CREATION_AUTHORITY_CHANGED'); }
      let sent = false;
      const response = await reader.scope().query(mutation,{ input: { ownerId: remote.ownerId,name: remote.name,visibility: remote.visibility.toUpperCase(),
        description: `${effect.expectedIdentity.marker} Factory-Operation:${effect.operationId}`,hasIssuesEnabled: true,hasWikiEnabled: false,clientMutationId: effect.operationId } },() => { sent = true; });
      if (response.state !== 'complete' || !response.data) return { ...denied('CREATION_REMOTE_UNCONFIRMED',sent ? 'unknown' : 'failed_known'),retryAtMs: response.retryAtMs };
      try {
        const payload = object(response.data.createRepository); const node = object(payload.repository);
        if (payload.clientMutationId !== effect.operationId || !Value.Check(GitHubId,node.id)) return denied('CREATION_REMOTE_RESPONSE_INVALID','unknown');
        return await confirm(effect,accountId,node.id);
      } catch { return denied('CREATION_REMOTE_RESPONSE_INVALID','unknown'); }
    },
  };
}
