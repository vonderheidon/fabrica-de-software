import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EffectView } from '#contracts';
import { GraphQLReader, type CommandResponse, type GhRunner, type GitHubRunnerLifecycle } from './transport.js';
import { createRemoteScaffolder, type ScaffoldAuthorization } from './scaffold.js';

const authorization: ScaffoldAuthorization = { accountId: 'ACCOUNT_test',targets: [{ ownerId: 'OWNER_test',name: 'new-repo',visibility: 'private',allowPush: true }] };
function effect(): EffectView {
  const creationId = randomUUID(); return { operationId: randomUUID(),attemptId: null,creationId,deliveryId: null,kind: 'create_repository',scopeKey: creationId,
    state: 'running',expectedIdentity: { ownerId: 'OWNER_test',repositoryOwner: 'test-org',repositoryName: 'new-repo',visibility: 'private',planHash: 'a'.repeat(64),marker: `Factory-Creation:installation:${creationId}:${'a'.repeat(64)}` },
    confirmedIdentity: null,receipt: null,reason: null,authorized: true,revision: 2,sentAtMs: Date.now(),confirmedAtMs: null };
}
const response = (data: unknown) => ({ exitCode: 0,stdout: 'HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n'+JSON.stringify({ data }) });
function fixture(mode = '',grant: ScaffoldAuthorization | undefined = authorization, monotonicNow: () => number = () => performance.now()) {
  let repository: Record<string,unknown> | null = mode === 'exists' ? { id: 'R_existing',name: 'new-repo' } : null;
  let mutations = 0; let viewer = 'ACCOUNT_test';
  const runner = vi.fn<GhRunner>(async (text, onSend) => {
    const request = JSON.parse(text) as { query: string; variables: Record<string,unknown> };
    if (request.query.includes('mutation FactoryDescribeRepository')) {
      onSend?.();
      const input = request.variables.input as Record<string,unknown>;
      if (repository) repository.description = input.description;
      if (mode === 'description-lost') throw new Error('Response lost');
      return response({ updateRepository: { clientMutationId: input.clientMutationId, repository: { id: repository?.id } } });
    }
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
  const reader = new GraphQLReader(runner,Date.now,{ retryAtMs: 0 },undefined,new Set(),monotonicNow);
  return { runner,reader,api: createRemoteScaffolder(reader,grant),mutations: () => mutations,setViewer: () => { viewer = 'OTHER'; },
    change: (key: string,value: unknown) => { if (repository) repository[key] = value; } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
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
afterEach(() => { vi.useRealTimers(); });
describe('remote scaffold GitHub adapter (controlled GraphQL)',() => {
  it.each(['','description-lost'])('cleans the description only after a durable identity receipt and reconciles %s without recreating', async mode => {
    const f = fixture(mode); const e = effect();
    const created = await f.api.createScaffoldRepository(e,'ACCOUNT_test',async () => {});
    const confirmed: EffectView = { ...e, state: 'confirmed', receipt: created.receipt, confirmedIdentity: created.receipt };
    const first = await f.api.describeScaffoldRepository(confirmed,'ACCOUNT_test',async () => {});
    expect(first.state).toBe(mode ? 'unknown' : 'confirmed');
    expect((await f.api.describeScaffoldRepository(confirmed,'ACCOUNT_test',async () => {})).state).toBe('confirmed');
    expect((await f.api.reconcileScaffoldRepository(confirmed,'ACCOUNT_test')).state).toBe('confirmed');
    expect(f.mutations()).toBe(1);
    const update = f.runner.mock.calls.map(([text]) => JSON.parse(text) as { query: string; variables: { input?: { description?: string } } }).find(call => call.query.includes('mutation FactoryDescribeRepository'));
    expect(update?.variables.input?.description).toBe('Projeto new-repo, preparado com configuração de engenharia pela Nova Fábrica.');
  });
  it('preserves a description changed by the operator after confirmation', async () => {
    const f = fixture(); const e = effect(); const result = await f.api.createScaffoldRepository(e,'ACCOUNT_test',async () => {});
    f.change('description','Descrição do operador');
    expect((await f.api.describeScaffoldRepository({ ...e, state: 'confirmed', receipt: result.receipt },'ACCOUNT_test',async () => {})).reason).toBe('CREATION_REMOTE_DESCRIPTION_CHANGED');
    expect(f.runner.mock.calls.some(([text]) => text.includes('mutation FactoryDescribeRepository'))).toBe(false);
  });
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

  it('runs creation authorization after preparation with one shared sixty-second deadline', async () => {
    vi.useFakeTimers();
    let monotonicNow = 0;
    const f = fixture('',authorization,() => monotonicNow);
    const deadlines: number[] = [];
    const original = f.runner.getMockImplementation()!;
    f.runner.mockImplementation(async (text,onSend,responseBytes,control) => {
      deadlines.push(control?.deadlineMonotonicMs ?? -1);
      return original(text,onSend,responseBytes,control);
    });
    const authorize = vi.fn(async (context?: { deadlineMonotonicMs: number; assertActive(): void }) => {
      expect(f.runner).toHaveBeenCalledOnce();
      expect(context?.deadlineMonotonicMs).toBe(60_000);
    });

    const result = await f.api.createScaffoldRepository(effect(),'ACCOUNT_test',authorize);

    expect(result.state).toBe('confirmed');
    expect(authorize).toHaveBeenCalledOnce();
    expect(f.mutations()).toBe(1);
    expect(deadlines).toEqual([60_000,60_000,60_000]);
  });

  it('reuses a shorter enclosing turn for creation reads and refuses its nested mutation', async () => {
    const f = fixture();
    let result: Awaited<ReturnType<typeof f.api.createScaffoldRepository>> | undefined;
    let deadline: number | undefined;
    const outer = await f.reader.query('query OuterAuthorization',{},undefined,1,{
      deadlineMonotonicMs: 7_000,
      beforeSend: async () => {
        result = await f.api.createScaffoldRepository(effect(),'ACCOUNT_test',async context => { deadline = context?.deadlineMonotonicMs; });
        throw new Error('stop outer request before dispatch');
      },
    });

    expect(outer.diagnostics[0]?.code).toBe('QUERY_FAILED');
    expect(result).toMatchObject({ state: 'failed_known',reason: 'CREATION_AUTHORITY_CHANGED' });
    expect(deadline).toBeUndefined();
    expect(f.mutations()).toBe(0);
    expect(f.runner.mock.calls.every(call => call[3]?.deadlineMonotonicMs === 7_000)).toBe(true);
  });

  it('shares one deadline across description identity checks, mutation and readback', async () => {
    vi.useFakeTimers();
    let monotonicNow = 0;
    const f = fixture('',authorization,() => monotonicNow);
    const repository = effect();
    const created = await f.api.createScaffoldRepository(repository,'ACCOUNT_test',async () => {});
    const confirmed: EffectView = { ...repository,state: 'confirmed',receipt: created.receipt };
    const start = f.runner.mock.calls.length;
    const authorize = vi.fn(async (context?: { deadlineMonotonicMs: number }) => {
      expect(context?.deadlineMonotonicMs).toBe(60_000);
      const beforeMutation = f.runner.mock.calls.slice(start).map(([text]) => JSON.parse(text).query);
      expect(beforeMutation.every(query => !query.includes('mutation FactoryDescribeRepository'))).toBe(true);
    });

    const result = await f.api.describeScaffoldRepository(confirmed,'ACCOUNT_test',authorize);

    expect(result.state).toBe('confirmed');
    expect(authorize).toHaveBeenCalledOnce();
    expect(f.runner.mock.calls.slice(start).map(call => call[3]?.deadlineMonotonicMs)).toEqual([60_000,60_000,60_000,60_000,60_000]);
    expect(f.runner.mock.calls.slice(start).map(([text]) => JSON.parse(text).query).filter(query => query.includes('mutation FactoryDescribeRepository'))).toHaveLength(1);
  });

  it('reuses a shorter enclosing turn for description reads and refuses its nested mutation', async () => {
    const f = fixture();
    const repository = effect();
    const created = await f.api.createScaffoldRepository(repository,'ACCOUNT_test',async () => {});
    const confirmed: EffectView = { ...repository,state: 'confirmed',receipt: created.receipt };
    const start = f.runner.mock.calls.length;
    const mutationsBefore = f.mutations();
    let result: Awaited<ReturnType<typeof f.api.describeScaffoldRepository>> | undefined;
    let deadline: number | undefined;
    const outer = await f.reader.query('query OuterAuthorization',{},undefined,1,{
      deadlineMonotonicMs: 7_000,
      beforeSend: async () => {
        result = await f.api.describeScaffoldRepository(confirmed,'ACCOUNT_test',async context => { deadline = context?.deadlineMonotonicMs; });
        throw new Error('stop outer request before dispatch');
      },
    });

    expect(outer.diagnostics[0]?.code).toBe('QUERY_FAILED');
    expect(result).toMatchObject({ state: 'unknown',reason: 'CREATION_AUTHORITY_CHANGED' });
    expect(deadline).toBeUndefined();
    expect(f.mutations()).toBe(mutationsBefore);
    expect(f.runner.mock.calls.slice(start).every(call => call[3]?.deadlineMonotonicMs === 7_000)).toBe(true);
  });

  it('waits for shared admission before creation authorization and sends one mutation', async () => {
    const f = fixture();
    const original = f.runner.getMockImplementation()!;
    const queryOrder: string[] = [];
    const blockers = new Map<string, ReturnType<typeof deferred<CommandResponse>>>();
    const filler = deferred<CommandResponse>();
    const fillerStarted = deferred<void>();
    const authorizationStarted = deferred<void>();
    const authorizationRelease = deferred<void>();
    const generic = response({ viewer: { id: 'ACCOUNT_test' } });
    f.runner.mockImplementation((text,onSend,responseBytes,control) => {
      const query = (JSON.parse(text) as { query: string }).query;
      queryOrder.push(query);
      const blocker = blockers.get(query);
      if (blocker) { onSend?.(); return blocker.promise; }
      if (query === 'query AdmissionFiller') { fillerStarted.resolve(); onSend?.(); return filler.promise; }
      if (query.includes('FactoryCreationOwner')) void f.reader.query('query AdmissionFiller',{});
      return original(text,onSend,responseBytes,control);
    });
    const occupied = ['One','Two','Three'].map(name => {
      const query = `query AdmissionBlocker${name}`;
      const reply = deferred<CommandResponse>();
      blockers.set(query,reply);
      return f.reader.query(query,{});
    });
    const authorize = vi.fn(async () => { authorizationStarted.resolve(); await authorizationRelease.promise; });
    const operation = f.api.createScaffoldRepository(effect(),'ACCOUNT_test',authorize);
    expect(authorize).not.toHaveBeenCalled();
    blockers.get('query AdmissionBlockerOne')?.resolve(generic);
    await fillerStarted.promise;
    expect(authorize).not.toHaveBeenCalled();

    blockers.get('query AdmissionBlockerTwo')?.resolve(generic);
    await authorizationStarted.promise;
    authorizationRelease.resolve();
    const result = await operation;
    expect(result.state).toBe('confirmed');
    expect(authorize).toHaveBeenCalledOnce();
    expect(f.mutations()).toBe(1);
    expect(queryOrder.filter(query => query.includes('mutation FactoryCreateRepository'))).toHaveLength(1);

    blockers.get('query AdmissionBlockerThree')?.resolve(generic);
    filler.resolve(generic);
    await Promise.all(occupied);
  });

  it('expires creation authorization after a saturated FIFO grant without sending or replaying', async () => {
    vi.useFakeTimers();
    try {
      let monotonicNow = 0;
      const f = fixture('',authorization,() => monotonicNow);
      const original = f.runner.getMockImplementation()!;
      const blockers = new Map<string,{ reply: ReturnType<typeof deferred<CommandResponse>>; close(): void }>();
      const queries: string[] = [];
      f.runner.mockImplementation((text,onSend,responseBytes,control) => {
        const query = (JSON.parse(text) as { query: string }).query;
        queries.push(query);
        if (!query.includes('query AdmissionBlocker')) return original(text,onSend,responseBytes,control);
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
        blockers.set(query,{ reply,close: () => { physicallyClosed = true; resolveClose(); reply.resolve(response({ viewer: { id: 'ACCOUNT_test' } })); } });
        return reply.promise;
      });
      const occupied = ['One','Two','Three'].map(name => f.reader.query(`query AdmissionBlocker${name}`,{}));
      await flushMicrotasks();
      expect(blockers.size).toBe(3);

      const authorizationResult = deferred<void>();
      const authorizationStarted = deferred<void>();
      let authorizationDeadline: number | undefined;
      const operation = f.api.createScaffoldRepository(effect(),'ACCOUNT_test',context => {
        authorizationDeadline = context?.deadlineMonotonicMs;
        authorizationStarted.resolve();
        return authorizationResult.promise;
      });
      monotonicNow = 5_000;
      blockers.get('query AdmissionBlockerOne')?.close();
      await vi.advanceTimersByTimeAsync(5_000);
      await authorizationStarted.promise;
      expect(authorizationDeadline).toBe(65_000);

      monotonicNow = 65_000;
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(operation).resolves.toMatchObject({ state: 'failed_known',reason: 'CREATION_AUTHORITY_CHANGED' });
      authorizationResult.resolve();
      await flushMicrotasks();
      expect(queries.some(query => query.includes('mutation FactoryCreateRepository'))).toBe(false);
      expect(f.mutations()).toBe(0);

      blockers.get('query AdmissionBlockerTwo')?.close();
      blockers.get('query AdmissionBlockerThree')?.close();
      await Promise.all(occupied);
    } finally { vi.useRealTimers(); }
  });

  it('cancels creation authorization after a saturated FIFO grant without sending or replaying', async () => {
    vi.useFakeTimers();
    const tracked = trackAbortControllers();
    try {
      let monotonicNow = 0;
      const f = fixture('',authorization,() => monotonicNow);
      const original = f.runner.getMockImplementation()!;
      const blockers = new Map<string,ReturnType<typeof deferred<CommandResponse>>>();
      const queries: string[] = [];
      f.runner.mockImplementation((text,onSend,responseBytes,control) => {
        const query = (JSON.parse(text) as { query: string }).query;
        queries.push(query);
        if (!query.includes('query AdmissionBlocker')) return original(text,onSend,responseBytes,control);
        const reply = deferred<CommandResponse>();
        onSend?.();
        blockers.set(query,reply);
        return reply.promise;
      });
      const occupied = ['One','Two','Three'].map(name => f.reader.query(`query AdmissionBlocker${name}`,{}));
      await flushMicrotasks();
      const authorize = vi.fn(async () => {});
      const cancelled = f.api.createScaffoldRepository(effect(),'ACCOUNT_test',authorize);
      expect(tracked.controllers).toHaveLength(4);
      tracked.controllers[3]?.abort();

      await expect(cancelled).resolves.toMatchObject({ state: 'failed_known',reason: 'CREATION_REMOTE_READ_INCOMPLETE' });
      expect(authorize).not.toHaveBeenCalled();
      expect(queries.some(query => query.includes('mutation FactoryCreateRepository'))).toBe(false);
      expect(f.mutations()).toBe(0);
      blockers.get('query AdmissionBlockerOne')?.resolve(response({ viewer: { id: 'ACCOUNT_test' } }));
      blockers.get('query AdmissionBlockerTwo')?.resolve(response({ viewer: { id: 'ACCOUNT_test' } }));
      blockers.get('query AdmissionBlockerThree')?.resolve(response({ viewer: { id: 'ACCOUNT_test' } }));
      await Promise.all(occupied);
    } finally { tracked.restore(); vi.useRealTimers(); }
  });

  it('blocks creation at the exact deadline and preserves authority revocation', async () => {
    vi.useFakeTimers();
    let monotonicNow = 0;
    const f = fixture('',authorization,() => monotonicNow);
    const authorize = vi.fn(async (context?: { deadlineMonotonicMs: number; assertActive(): void }) => {
      expect(context?.deadlineMonotonicMs).toBe(60_000);
      monotonicNow = 60_000;
      context?.assertActive();
    });

    const result = await f.api.createScaffoldRepository(effect(),'ACCOUNT_test',authorize);

    expect(result).toMatchObject({ state: 'failed_known',reason: 'CREATION_AUTHORITY_CHANGED',receipt: null });
    expect(authorize).toHaveBeenCalledOnce();
    expect(f.runner).toHaveBeenCalledOnce();
    expect(f.mutations()).toBe(0);
  });

  it.each(['resolve','reject'] as const)('does not create after authorization returns or rejects late (%s)', async outcome => {
    vi.useFakeTimers();
    let monotonicNow = 0;
    const f = fixture('',authorization,() => monotonicNow);
    const authorizationResult = deferred<void>();
    const authorize = vi.fn(() => authorizationResult.promise);
    const pending = f.api.createScaffoldRepository(effect(),'ACCOUNT_test',authorize);

    await vi.waitFor(() => expect(authorize).toHaveBeenCalledOnce());
    monotonicNow = 60_000;
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(pending).resolves.toMatchObject({ state: 'failed_known',reason: 'CREATION_AUTHORITY_CHANGED',receipt: null });
    expect(f.runner).toHaveBeenCalledOnce();
    expect(f.mutations()).toBe(0);

    if (outcome === 'resolve') authorizationResult.resolve();
    else authorizationResult.reject(new Error('late authorization rejection'));
    await Promise.resolve();
    expect(f.runner).toHaveBeenCalledOnce();
    expect(f.mutations()).toBe(0);
  });

  it('cancels a dependent authorization read and ignores its late completion', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const controller = new AbortController();
    const original = f.runner.getMockImplementation()!;
    const authorizationReadStarted = deferred<void>();
    let finishLateRead: (() => void) | undefined;
    f.runner.mockImplementation(text => {
      const request = JSON.parse(text) as { query: string };
      if (request.query === 'query AuthorizationContext') {
        authorizationReadStarted.resolve();
        return new Promise(resolve => { finishLateRead = () => resolve(response({ viewer: { id: 'ACCOUNT_test' } })); });
      }
      return original(text);
    });
    const outer = f.reader.query('query OuterAuthorization',{},undefined,1,{
      signal: controller.signal,
      beforeSend: async context => {
        await f.reader.query('query AuthorizationContext',{},undefined,1,{
          signal: context.signal,deadlineMonotonicMs: context.deadlineMonotonicMs,
        });
        context.assertActive();
      },
    });

    await authorizationReadStarted.promise;
    controller.abort();
    await expect(outer).resolves.toMatchObject({ diagnostics: [{ code: 'QUERY_FAILED' }] });
    finishLateRead?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.runner).toHaveBeenCalledOnce();
    expect(f.mutations()).toBe(0);
  });

  it('keeps description authorization revocation unknown at the exact deadline', async () => {
    vi.useFakeTimers();
    let monotonicNow = 0;
    const f = fixture('',authorization,() => monotonicNow);
    const repository = effect();
    const created = await f.api.createScaffoldRepository(repository,'ACCOUNT_test',async () => {});
    const confirmed: EffectView = { ...repository,state: 'confirmed',receipt: created.receipt };
    const start = f.runner.mock.calls.length;
    const authorize = vi.fn(async (context?: { deadlineMonotonicMs: number; assertActive(): void }) => {
      expect(context?.deadlineMonotonicMs).toBe(60_000);
      monotonicNow = 60_000;
      context?.assertActive();
    });

    const result = await f.api.describeScaffoldRepository(confirmed,'ACCOUNT_test',authorize);

    expect(result).toMatchObject({ state: 'unknown',reason: 'CREATION_AUTHORITY_CHANGED',receipt: null });
    expect(authorize).toHaveBeenCalledOnce();
    expect(f.runner.mock.calls.slice(start).map(([text]) => JSON.parse(text).query).some(query => query.includes('mutation FactoryDescribeRepository'))).toBe(false);
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
