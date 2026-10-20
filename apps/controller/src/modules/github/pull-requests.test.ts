import { createHash, randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { EffectView } from '#contracts';
import { createEffectWriter } from './effects.js';
import { inspectPullRequest } from './pull-requests.js';
import { GraphQLReader } from './transport.js';

function fixture() {
  const marker = '<!-- factory:pr:installation:attempt:delivery -->'; const body = marker+'\nEscopo aprovado e evidências.';
  const branchRef = 'refs/heads/factory/17/'+randomUUID(); const sha = 'c'.repeat(40);
  const effect: EffectView = { operationId: randomUUID(),attemptId: randomUUID(),creationId: null,deliveryId: randomUUID(),kind: 'pull_request',scopeKey: 'version',state: 'running',
    expectedIdentity: { repositoryId: 'R',issueId: 'I',repositoryOwner: 'org',repositoryName: 'repo',branchRef,baseBranch: 'main',commitSha: sha,marker,title: 'feat: deliver issue #17',bodyHash: createHash('sha256').update(body).digest('hex') },
    confirmedIdentity: null,receipt: null,reason: null,authorized: true,revision: 2,sentAtMs: 1,confirmedAtMs: null };
  const node: Record<string,unknown> = { id: 'PR_123',url: 'https://github.com/org/repo/pull/123',title: effect.expectedIdentity.title,body,
    headRefName: branchRef.slice(11),headRefOid: sha,baseRefName: 'main',state: 'OPEN',author: { id: 'A' },repository: { id: 'R' },headRepository: { id: 'R' },baseRepository: { id: 'R' } };
  let created = false; let hidden = false; let lost = false; let partial = false; let duplicate = false; let pageTwo = false;
  const run = vi.fn(async (input: string, onSend?: () => void) => {
    const request = JSON.parse(input) as { query: string; variables: { cursor?: string; input?: object } };
    let data: unknown;
    if (request.query.includes('mutation FactoryPullRequest')) { onSend?.(); created = true; if (lost) throw new Error('PRIVATE_TRANSPORT'); data = { createPullRequest: { clientMutationId: effect.operationId,pullRequest: { id: 'SIMILAR' } } }; }
    else {
      const nodes = created && !hidden ? [node,...(duplicate ? [{ ...node,id: 'PR_duplicate' }] : [])] : [];
      data = { node: { id: 'R',headRef: { target: { oid: sha } },baseRef: { target: { oid: 'a'.repeat(40) } },pullRequests: { nodes: pageTwo && !request.variables.cursor ? [] : nodes,pageInfo: { hasNextPage: pageTwo && !request.variables.cursor,endCursor: 'page-2' } } } };
    }
    return { exitCode: 0,stdout: 'HTTP/2 200 OK\r\ncontent-type: application/json\r\n\r\n'+JSON.stringify({ data,...(partial ? { errors: [{ type: 'INTERNAL',message: 'PRIVATE_REMOTE' }] } : {}) }) };
  });
  const reader = new GraphQLReader(run); const authorization = { accountId: 'A',repositoryIds: ['R'],projectIds: [] };
  return { effect,node,body,reader,run,authorization,writer: createEffectWriter(reader,authorization),existing: () => { created = true; },hide: () => { hidden = true; },show: () => { hidden = false; },lose: () => { lost = true; },partial: () => { partial = true; },duplicate: () => { duplicate = true; },paginate: () => { pageTwo = true; } };
}

it('creates a PR for a confirmed attempt without another host grant and preserves revocation and readback', async () => {
  const f = fixture(); const writer = createEffectWriter(f.reader,undefined,{ kind: 'confirmed_attempt' });
  expect(await writer({ effect: { ...f.effect,authorized: false },accountId: 'A',body: f.body,authorize: async () => {} })).toMatchObject({ reason: 'MUTATION_NOT_AUTHORIZED' });
  expect(await writer({ effect: f.effect,accountId: 'A',body: f.body })).toMatchObject({ reason: 'MUTATION_NOT_AUTHORIZED' });
  expect(f.run).not.toHaveBeenCalled();
  expect(await writer({ effect: f.effect,accountId: 'A',body: f.body,authorize: async () => { throw new Error('REVOKED'); } })).toMatchObject({ reason: 'EFFECT_AUTHORITY_REVOKED' });
  expect(f.run.mock.calls.some(([x]) => JSON.parse(x).query.includes('mutation'))).toBe(false);
  const input = { effect: f.effect,accountId: 'A',body: f.body,authorize: async () => {} };
  expect(await writer(input)).toMatchObject({ state: 'confirmed' });
  expect(await writer(input)).toMatchObject({ state: 'confirmed' });
  expect(f.run.mock.calls.filter(([x]) => JSON.parse(x).query.includes('mutation'))).toHaveLength(1);
});

it('creates with exact base/head/repository and confirms only after full readback with the approved head SHA', async () => {
  const f = fixture(); const result = await f.writer({ effect: f.effect,accountId: 'A',body: f.body });
  expect(result).toMatchObject({ state: 'confirmed',receipt: { id: 'PR_123',baseBranch: 'main',repositoryId: 'R',commitSha: 'c'.repeat(40) } });
  const calls = f.run.mock.calls.map(([x]) => JSON.parse(x) as { query: string; variables: { input: object } });
  expect(calls).toHaveLength(3); expect(calls[0]!.query).toContain('pullRequests'); expect(calls[2]!.query).toContain('pullRequests');
  expect(calls[1]!.variables.input).toEqual({ repositoryId: 'R',headRepositoryId: 'R',headRefName: f.effect.expectedIdentity.branchRef!.slice(11),baseRefName: 'main',title: f.effect.expectedIdentity.title,body: f.body,maintainerCanModify: false,draft: false,clientMutationId: f.effect.operationId });
});

it.each(['base','sha','head','repository','headRepository','author','body','marker','state','title','url','duplicate','partial'] as const)('never adopts a similar PR with mismatching %s', async kind => {
  const f = fixture(); f.existing();
  if (kind === 'base') f.node.baseRefName = 'other';
  if (kind === 'sha') f.node.headRefOid = 'd'.repeat(40);
  if (kind === 'head') f.node.headRefName = 'similar-branch';
  if (kind === 'repository') f.node.repository = { id: 'OTHER' };
  if (kind === 'headRepository') f.node.headRepository = { id: 'FORK' };
  if (kind === 'author') f.node.author = { id: 'OTHER' };
  if (kind === 'body') f.node.body = f.body+'changed';
  if (kind === 'marker') f.node.body = 'a similar result';
  if (kind === 'state') f.node.state = 'CLOSED';
  if (kind === 'title') f.node.title = 'changed title';
  if (kind === 'url') f.node.url = 'https://github.com/other/repo/pull/123';
  if (kind === 'duplicate') f.duplicate();
  if (kind === 'partial') f.partial();
  expect((await inspectPullRequest(f.reader,f.effect,'A')).state).toBe('unknown');
  expect((await f.writer({ effect: f.effect,accountId: 'A',body: f.body })).state).toBe('failed_known');
  expect(f.run.mock.calls.every(([x]) => !JSON.parse(x).query.includes('mutation'))).toBe(true);
});

it('keeps sent response loss unknown until explicit identity read, without replaying the mutation', async () => {
  const f = fixture(); f.hide(); f.lose();
  expect((await f.writer({ effect: f.effect,accountId: 'A',body: f.body })).state).toBe('unknown');
  f.show(); expect((await inspectPullRequest(f.reader,{ ...f.effect,state: 'unknown' },'A')).state).toBe('confirmed');
  expect(f.run.mock.calls.filter(([x]) => JSON.parse(x).query.includes('mutation'))).toHaveLength(1);
});

it('paginates all matching heads and rejects mutation before IO for missing host authorization or invalid body', async () => {
  const f = fixture();
  expect((await createEffectWriter(f.reader)({ effect: f.effect,accountId: 'A',body: f.body })).reason).toBe('MUTATION_NOT_AUTHORIZED');
  expect((await f.writer({ effect: f.effect,accountId: 'A',body: f.body+'changed' })).reason).toBe('EFFECT_INPUT_INVALID');
  expect(f.run).not.toHaveBeenCalled(); f.existing(); f.paginate();
  expect((await inspectPullRequest(f.reader,f.effect,'A')).state).toBe('confirmed'); expect(f.run).toHaveBeenCalledTimes(2);
});

it('refuses auto-close content even with its matching durable hash', async () => {
  const f = fixture(); const body = f.body+'\nCloses #17'; f.effect.expectedIdentity.bodyHash = createHash('sha256').update(body).digest('hex');
  expect((await f.writer({ effect: f.effect,accountId: 'A',body })).reason).toBe('EFFECT_INPUT_INVALID'); expect(f.run).not.toHaveBeenCalled();
});

it('rechecks the durable grant after PR lookup and refuses a revoked grant before mutation', async () => {
  const f = fixture(); const authorize = vi.fn(async () => { throw new Error('PRIVATE_CANCELLED'); });
  const result = await f.writer({ effect: f.effect,accountId: 'A',body: f.body,authorize });
  expect(result).toMatchObject({ state: 'failed_known',reason: 'EFFECT_AUTHORITY_REVOKED' }); expect(authorize).toHaveBeenCalledOnce();
  expect(f.run.mock.calls.some(([x]) => JSON.parse(x).query.includes('mutation'))).toBe(false);
});
