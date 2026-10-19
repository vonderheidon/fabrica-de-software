import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { EffectView } from '#contracts';
import { GraphQLReader, type GhRunner } from './transport.js';
import { createRemoteScaffolder, type ScaffoldAuthorization } from './scaffold.js';

const authorization: ScaffoldAuthorization = { accountId: 'ACCOUNT_test',targets: [{ ownerId: 'OWNER_test',name: 'new-repo',visibility: 'private',allowPush: true }] };
function effect(): EffectView {
  const creationId = randomUUID(); return { operationId: randomUUID(),attemptId: null,creationId,deliveryId: null,kind: 'create_repository',scopeKey: creationId,
    state: 'running',expectedIdentity: { ownerId: 'OWNER_test',repositoryOwner: 'test-org',repositoryName: 'new-repo',visibility: 'private',planHash: 'a'.repeat(64),marker: `Factory-Creation:installation:${creationId}:${'a'.repeat(64)}` },
    confirmedIdentity: null,receipt: null,reason: null,authorized: true,revision: 2,sentAtMs: Date.now(),confirmedAtMs: null };
}
const response = (data: unknown) => ({ exitCode: 0,stdout: 'HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n'+JSON.stringify({ data }) });
function fixture(mode = '',grant: ScaffoldAuthorization | undefined = authorization) {
  let repository: Record<string,unknown> | null = mode === 'exists' ? { id: 'R_existing',name: 'new-repo' } : null;
  let mutations = 0; let viewer = 'ACCOUNT_test';
  const runner = vi.fn<GhRunner>(async (text, onSend) => {
    const request = JSON.parse(text) as { query: string; variables: Record<string,unknown> };
    if (request.query.includes('mutation FactoryCreateRepository')) {
      onSend?.();
      mutations++; const input = request.variables.input as Record<string,unknown>;
      expect(input).toMatchObject({ ownerId: 'OWNER_test',name: 'new-repo',visibility: 'PRIVATE',hasWikiEnabled: false });
      expect(input).not.toHaveProperty('autoInit');
      repository = { id: 'R_created',name: 'new-repo',url: 'https://github.com/test-org/new-repo',description: input.description,createdAt: new Date().toISOString(),isPrivate: true,isArchived: false,owner: { id: 'OWNER_test',login: 'test-org' } };
      if (mode === 'lost') throw new Error('Response lost');
      return response({ createRepository: { clientMutationId: mode === 'unexpected' ? 'foreign' : input.clientMutationId,repository: { id: repository.id } } });
    }
    if (request.query.includes('FactoryCreationRepository')) return response({ viewer: { id: viewer },node: repository });
    const after = request.variables.after;
    const paginated = mode === 'pages'; const nodes = after ? [repository ?? { id: 'R_second',name: 'second' }] : paginated ? [{ id: 'R_first',name: 'first' }] : repository ? [repository] : [];
    return response({ viewer: { id: viewer },node: { __typename: 'Organization',id: 'OWNER_test',login: 'test-org',repositories: { nodes: nodes.map(n => ({ ...n,owner: { id: 'OWNER_test' } })),pageInfo: { hasNextPage: paginated && !after,endCursor: paginated && !after ? 'next' : null } } } });
  });
  return { runner,api: createRemoteScaffolder(new GraphQLReader(runner),grant),mutations: () => mutations,setViewer: () => { viewer = 'OTHER'; },
    change: (key: string,value: unknown) => { if (repository) repository[key] = value; } };
}
describe('remote scaffold GitHub adapter (controlled GraphQL)',() => {
  it('accepts the operator-confirmed plan policy without a preconfigured repository list', async () => {
    const f = fixture('', { kind: 'confirmed_plan' });
    expect(f.api.scaffoldRemoteCapability(undefined, 'ACCOUNT_test', true).available).toBe(true);
    const authorize = vi.fn(async () => {});
    expect((await f.api.createScaffoldRepository(effect(), 'ACCOUNT_test', authorize)).state).toBe('confirmed');
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(f.mutations()).toBe(1);
  });
  it('refuses unconfirmed or revoked plans under the operator confirmation policy', async () => {
    const f = fixture('', { kind: 'confirmed_plan' });
    expect((await f.api.createScaffoldRepository({ ...effect(), authorized: false }, 'ACCOUNT_test', async () => {})).state).toBe('failed_known');
    expect(f.mutations()).toBe(0);
    expect((await f.api.createScaffoldRepository(effect(), 'ACCOUNT_test', async () => { throw new Error('Revoked'); })).state).toBe('failed_known');
    expect(f.mutations()).toBe(0);
  });
  it('creates only the planned repository and confirms its immutable identity before returning',async () => {
    const f = fixture(); const e = effect(); const authorize = vi.fn(async () => {});
    const result = await f.api.createScaffoldRepository(e,'ACCOUNT_test',authorize);
    expect(result).toMatchObject({ state: 'confirmed',receipt: { id: 'R_created',repositoryId: 'R_created',ownerId: 'OWNER_test',repositoryName: 'new-repo',visibility: 'private',operationId: e.operationId } });
    expect(authorize).toHaveBeenCalledTimes(1); expect(f.mutations()).toBe(1);
    expect(f.runner.mock.calls.every(([text]) => !/createProject|createIssue|createPullRequest|updateProject|addComment/.test(text))).toBe(true);
  });
  it('does not adopt an existing repository or mutate without the exact host target grant',async () => {
    const existing = fixture('exists'); expect((await existing.api.createScaffoldRepository(effect(),'ACCOUNT_test',async () => {})).reason).toBe('SCAFFOLD_REMOTE_EXISTS'); expect(existing.mutations()).toBe(0);
    const denied = fixture('',{ accountId: 'ACCOUNT_test',targets: [] }); expect((await denied.api.createScaffoldRepository(effect(),'ACCOUNT_test',async () => {})).reason).toBe('CREATION_TARGET_NOT_AUTHORIZED'); expect(denied.runner).not.toHaveBeenCalled();
    expect(denied.api.scaffoldRemoteCapability(undefined,'ACCOUNT_test').available).toBe(false);
    expect(existing.api.scaffoldRemoteCapability({ ownerId: 'OWNER_test',name: 'new-repo',visibility: 'public' },'ACCOUNT_test').available).toBe(false);
  });
  it('refuses a changed viewer or revoked authorization immediately before mutation',async () => {
    const f = fixture(); f.setViewer(); expect((await f.api.createScaffoldRepository(effect(),'ACCOUNT_test',async () => {})).state).toBe('failed_known'); expect(f.mutations()).toBe(0);
    const g = fixture(); expect((await g.api.createScaffoldRepository(effect(),'ACCOUNT_test',async () => { throw new Error('revoked'); })).state).toBe('failed_known'); expect(g.mutations()).toBe(0);
  });
  it.each(['lost','unexpected'])('keeps %s response unknown and reconciles by exact marker and identity without another mutation',async mode => {
    const f = fixture(mode); const e = effect(); expect((await f.api.createScaffoldRepository(e,'ACCOUNT_test',async () => {})).state).toBe('unknown');
    expect((await f.api.reconcileScaffoldRepository({ ...e,state: 'unknown' },'ACCOUNT_test')).state).toBe('confirmed'); expect(f.mutations()).toBe(1);
  });
  it.each([
    ['description','Foreign creation'],['name','similar-repo'],['url','https://github.com/foreign/new-repo'],['isPrivate',false],['isArchived',true],
    ['createdAt','2000-01-01T00:00:00Z'],['owner',{ id: 'OTHER',login: 'test-org' }],
  ] as const)('refuses mismatched repository %s during reconciliation',async (key,value) => {
    const f = fixture('lost'); const e = effect(); await f.api.createScaffoldRepository(e,'ACCOUNT_test',async () => {}); f.change(key,value);
    expect((await f.api.reconcileScaffoldRepository({ ...e,state: 'unknown' },'ACCOUNT_test')).state).toBe('unknown'); expect(f.mutations()).toBe(1);
  });
  it('consults all owner pages before proving name availability',async () => {
    const f = fixture('pages'); const observed = await f.api.inspectScaffoldRemote({ ownerId: 'OWNER_test',name: 'new-repo',visibility: 'private' },'ACCOUNT_test');
    expect(observed).toMatchObject({ state: 'complete',data: { ownerLogin: 'test-org',repositoryId: null } }); expect(f.runner).toHaveBeenCalledTimes(2); expect(f.mutations()).toBe(0);
  });
  it('keeps rate limit, partial reads and malformed pagination from authorizing creation',async () => {
    const runner = vi.fn<GhRunner>(async () => ({ exitCode: 1,stdout: 'HTTP/1.1 429 Too Many Requests\r\nretry-after: 60\r\n\r\n{}' }));
    const api = createRemoteScaffolder(new GraphQLReader(runner),authorization); const e = effect();
    expect((await api.createScaffoldRepository(e,'ACCOUNT_test',async () => {})).state).toBe('failed_known');
    expect((await api.reconcileScaffoldRepository({ ...e,state: 'unknown' },'ACCOUNT_test')).state).toBe('unknown'); expect(runner).toHaveBeenCalledTimes(1);
    const malformed = createRemoteScaffolder(new GraphQLReader(async () => response({ viewer: { id: 'ACCOUNT_test' },node: { __typename: 'Organization',id: 'OWNER_test',login: 'test-org',repositories: { nodes: [],pageInfo: { hasNextPage: true,endCursor: null } } } })),authorization);
    expect((await malformed.inspectScaffoldRemote({ ownerId: 'OWNER_test',name: 'new-repo',visibility: 'private' },'ACCOUNT_test')).state).toBe('unavailable');
  });
});
