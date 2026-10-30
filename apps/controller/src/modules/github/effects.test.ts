import { createHash, randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { EffectView } from '#contracts';
import { createEffectWriter } from './effects.js';
import { GraphQLReader, type CommandResponse, type GhRunner, type GitHubRunnerLifecycle } from './transport.js';
import { createGitHub } from './index.js';

function fixture(monotonicNow: () => number = () => performance.now()) {
  const marker = '<!-- factory:icr:install:attempt:delivery -->'; const body = marker+'\nApproved tree and artifact references.';
  const effect: EffectView = { operationId: randomUUID(),attemptId: randomUUID(),creationId: null,deliveryId: randomUUID(),kind: 'issue_comment',scopeKey: 'result',state: 'running',
    expectedIdentity: { repositoryId: 'R',issueId: 'I',marker,bodyHash: createHash('sha256').update(body).digest('hex') },confirmedIdentity: null,receipt: null,
    reason: null,authorized: true,revision: 2,sentAtMs: 1,confirmedAtMs: null };
  const authorization = { accountId: 'A',repositoryIds: ['R'],projectIds: ['P'] };
  const run = vi.fn<GhRunner>(async (input, onSend) => {
    const request = JSON.parse(input) as { variables: { input: { clientMutationId: string } } };
    onSend?.();
    return { exitCode: 0,stdout: 'HTTP/2.0 200 OK\r\ncontent-type: application/json\r\n\r\n'+JSON.stringify({ data: { addComment: { clientMutationId: request.variables.input.clientMutationId,
      commentEdge: { node: { id: 'C',url: 'https://github.com/org/repo/issues/1#issuecomment-1',body,issue: { id: 'I' },repository: { id: 'R' } } } } } }) };
  });
  return { body,effect,authorization,run,reader: new GraphQLReader(run,Date.now,{ retryAtMs: 0 },undefined,new Set(),monotonicNow) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function flushMicrotasks(): Promise<void> { for (let index = 0; index < 12; index++) await Promise.resolve(); }
function trackAbortControllers() {
  const Original = globalThis.AbortController;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis,'AbortController');
  const controllers: AbortController[] = [];
  class TrackedAbortController extends Original {
    constructor() { super(); controllers.push(this); }
  }
  Object.defineProperty(globalThis,'AbortController',{ ...descriptor,value: TrackedAbortController });
  return { controllers,restore: () => { if (descriptor) Object.defineProperty(globalThis,'AbortController',descriptor); } };
}
it('requires trusted target/account authorization before any mutation and validates the exact comment body hash', async () => {
  const f = fixture();
  expect(await createEffectWriter(f.reader)({ effect: f.effect,accountId: 'A',body: f.body })).toMatchObject({ state: 'failed_known',reason: 'MUTATION_NOT_AUTHORIZED' });
  expect(await createEffectWriter(f.reader,f.authorization)({ effect: f.effect,accountId: 'OTHER',body: f.body })).toMatchObject({ state: 'failed_known' });
  expect(await createEffectWriter(f.reader,f.authorization)({ effect: f.effect,accountId: 'A',body: f.body+'changed' })).toMatchObject({ state: 'failed_known',reason: 'EFFECT_INPUT_INVALID' });
  expect(f.run).not.toHaveBeenCalled();
  const writer = createEffectWriter(f.reader,f.authorization);
  expect(await writer({ effect: f.effect,accountId: 'A',body: f.body })).toMatchObject({ state: 'confirmed',receipt: { id: 'C' } });
  const request = JSON.parse(f.run.mock.calls[0]![0]) as { query: string; variables: { input: object } };
  expect(request.query).toContain('addComment');
  expect(request.variables.input).toEqual({ subjectId: 'I',body: f.body,clientMutationId: f.effect.operationId });
});
it.each(['timeout','malformed','partial','wrong_subject','wrong_correlation'])('preserves unknown after a sent mutation with %s instead of assuming failure', async scenario => {
  const f = fixture();
  if (scenario === 'timeout') f.run.mockImplementationOnce(async (_input, onSend) => { onSend?.(); throw new Error('PRIVATE_NATIVE_MESSAGE'); });
  else if (scenario === 'malformed') f.run.mockImplementationOnce(async (_input, onSend) => { onSend?.(); return { exitCode: 0,stdout: 'not HTTP' }; });
  else if (scenario === 'partial') f.run.mockImplementationOnce(async (_input, onSend) => { onSend?.(); return { exitCode: 1,stdout: 'HTTP/2 200 OK\r\nx:test\r\n\r\n'+JSON.stringify({ data: { addComment: null },errors: [{ type: 'INTERNAL',message: 'PRIVATE_REMOTE_MESSAGE' }] }) }; });
  else {
    const response = await f.run(''+JSON.stringify({ variables: { input: { clientMutationId: f.effect.operationId } } })); f.run.mockClear();
    f.run.mockImplementationOnce(async (_input, onSend) => { onSend?.(); return { ...response,stdout: scenario === 'wrong_subject' ? response.stdout.replace('"id":"I"','"id":"OTHER"') : response.stdout.replace(f.effect.operationId,randomUUID()) }; });
  }
  const result = await createEffectWriter(f.reader,f.authorization)({ effect: f.effect,accountId: 'A',body: f.body });
  expect(result.state).toBe('unknown'); expect(result.receipt).toBeNull(); expect(JSON.stringify(result)).not.toContain('PRIVATE_');
});
it('requires project authorization and only sends the exact mapped single-select field, with mandatory readback', async () => {
  const f = fixture();
  const effect: EffectView = { ...f.effect,kind: 'project_status',expectedIdentity: { repositoryId: 'R',issueId: 'I',projectId: 'P',itemId: 'ITEM',fieldId: 'FIELD',optionId: 'DELIVERED',previousOptionId: 'REVIEW' } };
  const writer = createEffectWriter(f.reader,f.authorization);
  f.run.mockResolvedValueOnce({ exitCode: 0,stdout: 'HTTP/2 200 OK\r\nx:test\r\n\r\n'+JSON.stringify({ data: { updateProjectV2ItemFieldValue: { clientMutationId: effect.operationId,projectV2Item: { id: 'ITEM' } } } }) });
  expect(await writer({ effect,accountId: 'A' })).toMatchObject({ state: 'unknown',reason: 'STATUS_READBACK_REQUIRED' });
  const request = JSON.parse(f.run.mock.calls[0]![0]) as { query: string; variables: { input: object } };
  expect(request.query).toContain('updateProjectV2ItemFieldValue');
  expect(request.variables.input).toEqual({ projectId: 'P',itemId: 'ITEM',fieldId: 'FIELD',value: { singleSelectOptionId: 'DELIVERED' },clientMutationId: effect.operationId });
  expect(request.query).not.toContain('updateIssue');
});
it('shares query rate-limit cooldown with mutations and does not send a second request during the delay', async () => {
  const f = fixture(); f.run.mockImplementationOnce(async (_input, onSend) => { onSend?.(); return { exitCode: 1,stdout: 'HTTP/2 429 Too Many Requests\r\nretry-after: 120\r\n\r\n{}' }; });
  const writer = createEffectWriter(f.reader,f.authorization);
  expect((await writer({ effect: f.effect,accountId: 'A',body: f.body })).state).toBe('unknown');
  expect(await writer({ effect: f.effect,accountId: 'A',body: f.body })).toMatchObject({ state: 'failed_known',reason: 'RATE_LIMITED' });
  expect(f.run).toHaveBeenCalledOnce();
});
it('runs effect authorization after FIFO admission and dispatches before later waiters without replay', async () => {
  const f = fixture();
  const original = f.run.getMockImplementation()!;
  const queryOrder: string[] = [];
  const blockers = new Map<string, ReturnType<typeof deferred<CommandResponse>>>();
  const followerReply = deferred<CommandResponse>();
  const followerStarted = deferred<void>();
  const authorized = deferred<void>();
  const authorizationStarted = deferred<void>();
  const generic = { exitCode: 0,stdout: 'HTTP/2.0 200 OK\r\ncontent-type: application/json\r\n\r\n{"data":{"viewer":{"id":"A"}}}' };
  f.run.mockImplementation((input,onSend) => {
    const query = (JSON.parse(input) as { query: string }).query;
    queryOrder.push(query);
    const blocker = blockers.get(query);
    if (blocker) { onSend?.(); return blocker.promise; }
    if (query === 'query AdmissionFollower') { followerStarted.resolve(); onSend?.(); return followerReply.promise; }
    return original(input,onSend);
  });
  const occupied = ['One','Two','Three'].map(name => {
    const query = `query AdmissionBlocker${name}`;
    const reply = deferred<CommandResponse>();
    blockers.set(query,reply);
    return f.reader.query(query,{});
  });
  const authorize = vi.fn(async () => { authorizationStarted.resolve(); await authorized.promise; });
  const operation = createEffectWriter(f.reader,f.authorization)({ effect: f.effect,accountId: 'A',body: f.body,authorize });
  expect(authorize).not.toHaveBeenCalled();
  blockers.get('query AdmissionBlockerOne')?.resolve(generic);
  await authorizationStarted.promise;

  const follower = f.reader.query('query AdmissionFollower',{});
  authorized.resolve();
  const result = await operation;
  await followerStarted.promise;
  expect(result).toMatchObject({ state: 'confirmed',receipt: { id: 'C' } });
  expect(queryOrder.filter(query => query.includes('mutation FactoryComment'))).toHaveLength(1);
  expect(queryOrder.indexOf(queryOrder.find(query => query.includes('mutation FactoryComment'))!))
    .toBeLessThan(queryOrder.indexOf('query AdmissionFollower'));

  blockers.get('query AdmissionBlockerTwo')?.resolve(generic);
  blockers.get('query AdmissionBlockerThree')?.resolve(generic);
  followerReply.resolve(generic);
  await Promise.all([...occupied,follower]);
});
it('expires effect authorization after acquiring one of three saturated turns without replay', async () => {
  vi.useFakeTimers();
  try {
    let monotonicNow = 0;
    const f = fixture(() => monotonicNow);
    const original = f.run.getMockImplementation()!;
    const blockers = new Map<string, { reply: ReturnType<typeof deferred<CommandResponse>>; close(): void }>();
    const queries: string[] = [];
    f.run.mockImplementation((input,onSend,_bytes,control) => {
      const query = (JSON.parse(input) as { query: string }).query;
      queries.push(query);
      if (!query.includes('query AdmissionBlocker')) return original(input,onSend);
      const reply = deferred<CommandResponse>();
      let physicallyClosed = false;
      let physicallySent = false;
      let resolveClose!: () => void;
      const completion = new Promise<void>(resolve => { resolveClose = resolve; });
      const lifecycle: GitHubRunnerLifecycle = { get sent() { return physicallySent; }, killRequested: false, killFailed: false,
        get physicallyClosed() { return physicallyClosed; }, completion };
      control?.onLifecycle(lifecycle);
      physicallySent = true;
      onSend?.();
      blockers.set(query, { reply, close: () => { physicallyClosed = true; resolveClose(); reply.resolve({ exitCode: 0, stdout: 'HTTP/2.0 200 OK\r\ncontent-type: application/json\r\n\r\n{"data":{"viewer":{"id":"A","login":"test"}}}' }); } });
      return reply.promise;
    });
    const occupied = ['One','Two','Three'].map(name => f.reader.query(`query AdmissionBlocker${name}`,{}));
    await flushMicrotasks();
    expect(blockers.size).toBe(3);

    const authorization = deferred<void>();
    const authorizationStarted = deferred<void>();
    let authorizationDeadline: number | undefined;
    const operation = createEffectWriter(f.reader,f.authorization)({ effect: f.effect,accountId: 'A',body: f.body,authorize: context => {
      authorizationDeadline = context.deadlineMonotonicMs;
      authorizationStarted.resolve();
      return authorization.promise;
    } });
    monotonicNow = 5_000;
    blockers.get('query AdmissionBlockerOne')?.close();
    await vi.advanceTimersByTimeAsync(5_000);
    await authorizationStarted.promise;
    expect(authorizationDeadline).toBe(65_000);

    monotonicNow = 65_000;
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(operation).resolves.toMatchObject({ state: 'failed_known',reason: 'QUERY_LIMIT' });
    authorization.resolve();
    await flushMicrotasks();
    expect(queries.some(query => query.includes('mutation FactoryComment'))).toBe(false);
    expect(f.run).toHaveBeenCalledTimes(3);

    blockers.get('query AdmissionBlockerTwo')?.close();
    blockers.get('query AdmissionBlockerThree')?.close();
    await Promise.all(occupied);
  } finally { vi.useRealTimers(); }
});
it('cancels effect authorization after a saturated FIFO grant without sending or replaying', async () => {
  vi.useFakeTimers();
  const tracked = trackAbortControllers();
  try {
    let monotonicNow = 0;
    const f = fixture(() => monotonicNow);
    const original = f.run.getMockImplementation()!;
    const blockers = new Map<string,ReturnType<typeof deferred<CommandResponse>>>();
    const queries: string[] = [];
    const identityResponse: CommandResponse = { exitCode: 0,stdout: 'HTTP/2.0 200 OK\r\ncontent-type: application/json\r\n\r\n{"data":{"viewer":{"id":"A","login":"test"}}}' };
    f.run.mockImplementation((input,onSend) => {
      const query = (JSON.parse(input) as { query: string }).query;
      queries.push(query);
      if (!query.includes('query AdmissionBlocker')) return original(input,onSend);
      const reply = deferred<CommandResponse>();
      onSend?.();
      blockers.set(query,reply);
      return reply.promise;
    });
    const occupied = ['One','Two','Three'].map(name => f.reader.query(`query AdmissionBlocker${name}`,{}));
    await flushMicrotasks();
    const authorize = vi.fn(async () => {});
    const cancelled = createEffectWriter(f.reader,f.authorization)({ effect: f.effect,accountId: 'A',body: f.body,authorize });
    expect(tracked.controllers).toHaveLength(4);
    tracked.controllers[3]?.abort();

    await expect(cancelled).resolves.toMatchObject({ state: 'failed_known',reason: 'QUERY_FAILED' });
    expect(authorize).not.toHaveBeenCalled();
    expect(queries.some(query => query.includes('mutation FactoryComment'))).toBe(false);
    expect(f.run).toHaveBeenCalledTimes(3);
    blockers.get('query AdmissionBlockerOne')?.resolve(identityResponse);
    blockers.get('query AdmissionBlockerTwo')?.resolve(identityResponse);
    blockers.get('query AdmissionBlockerThree')?.resolve(identityResponse);
    await Promise.all(occupied);
  } finally { tracked.restore(); vi.useRealTimers(); }
});
it('projects a confirmed attempt through runtime authority without accepting an invalid PR body', async () => {
  const f = fixture();
  const writer = createEffectWriter(f.reader, undefined, { kind: 'confirmed_attempt' });
  const effect: EffectView = { ...f.effect, kind: 'project_status', expectedIdentity: { repositoryId: 'R', issueId: 'I', projectId: 'P', itemId: 'ITEM', fieldId: 'FIELD', optionId: 'PROGRESS' } };
  const authorize = vi.fn(async () => {});
  expect(await writer({ effect, accountId: 'A' })).toMatchObject({ reason: 'MUTATION_NOT_AUTHORIZED' });
  expect(await writer({ effect: { ...effect, authorized: false }, accountId: 'A', authorize })).toMatchObject({ reason: 'MUTATION_NOT_AUTHORIZED' });
  expect(await writer({ effect: { ...f.effect, kind: 'pull_request' }, accountId: 'A', body: f.body, authorize })).toMatchObject({ reason: 'EFFECT_INPUT_INVALID' });
  expect(f.run).not.toHaveBeenCalled();
  const revoked = vi.fn(async () => { throw new Error('REVOKED'); });
  expect(await writer({ effect, accountId: 'A', authorize: revoked })).toMatchObject({ reason: 'EFFECT_AUTHORITY_REVOKED' });
  expect(f.run).not.toHaveBeenCalled();
  f.run.mockResolvedValueOnce({ exitCode: 0, stdout: 'HTTP/2 200 OK\r\nx:test\r\n\r\n'+JSON.stringify({ data: { updateProjectV2ItemFieldValue: { clientMutationId: effect.operationId, projectV2Item: { id: 'ITEM' } } } }) });
  expect(await writer({ effect, accountId: 'A', authorize })).toMatchObject({ state: 'unknown', reason: 'STATUS_READBACK_REQUIRED' });
  expect(authorize).toHaveBeenCalledOnce();
  expect(f.run).toHaveBeenCalledOnce();
});
it('publishes the identified delivery comment with current attempt authority and exact body integrity', async () => {
  const f = fixture();
  const writer = createEffectWriter(f.reader, undefined, { kind: 'confirmed_attempt' });
  const authorize = vi.fn(async () => {});
  expect(await writer({ effect: f.effect, accountId: 'A', body: f.body })).toMatchObject({ reason: 'MUTATION_NOT_AUTHORIZED' });
  expect(await writer({ effect: { ...f.effect, authorized: false }, accountId: 'A', body: f.body, authorize })).toMatchObject({ reason: 'MUTATION_NOT_AUTHORIZED' });
  expect(await writer({ effect: f.effect, accountId: 'A', body: f.body+'changed', authorize })).toMatchObject({ reason: 'EFFECT_INPUT_INVALID' });
  expect(await writer({ effect: f.effect, accountId: 'A', body: f.body, authorize: async () => { throw new Error('REVOKED'); } })).toMatchObject({ reason: 'EFFECT_AUTHORITY_REVOKED' });
  expect(f.run).not.toHaveBeenCalled();
  expect(await writer({ effect: f.effect, accountId: 'A', body: f.body, authorize })).toMatchObject({ state: 'confirmed', receipt: { id: 'C' } });
  expect(authorize).toHaveBeenCalledOnce();
  expect(f.run).toHaveBeenCalledOnce();
});
it('fails before IO when the real adapter has no authorized host context', async () => {
  const f = fixture();
  expect(await createGitHub({ mutationAuthorization: f.authorization }).mutateEffect({ effect: f.effect,accountId: 'A',body: f.body })).toMatchObject({ state: 'failed_known',reason: 'CONTEXT_UNAVAILABLE' });
});
