import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { EffectView } from '#contracts';
import { createGitHub } from './index.js';
import { GitHubExecutableResolver } from './executable.js';
import { collect, GraphQLReader, GitHubRunnerError, queryLimits, type CommandResponse, type GhRunner, type GitHubContext, type GitHubRunnerLifecycle } from './transport.js';

function http(body: unknown, status = 200, headers: Record<string, string> = {}): CommandResponse {
  return { exitCode: 0, stdout: `HTTP/2.0 ${status} Response\r\ncontent-type: application/json\r\n${Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}\r\n`).join('')}\r\n${JSON.stringify(body)}` };
}

function success(): CommandResponse {
  return http({ data: { viewer: { id: 'U_test' } } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}

describe('GitHub operation admission', () => {
  it('shares the rate-limit window, keeps the lowest remaining count, and discards it after reset', async () => {
    let now = 1_000;
    const replies = [
      http({ data: { viewer: { id: 'U_test' } } }, 200, { 'x-ratelimit-limit': '1000', 'x-ratelimit-remaining': '250', 'x-ratelimit-reset': '50' }),
      http({ data: { viewer: { id: 'U_test' } } }, 200, { 'x-ratelimit-limit': '1000', 'x-ratelimit-remaining': '400', 'x-ratelimit-reset': '50' }),
      http({ data: { viewer: { id: 'U_test' } } }, 200, { 'x-ratelimit-limit': '1000', 'x-ratelimit-remaining': '900', 'x-ratelimit-reset': '100' }),
    ];
    const reader = new GraphQLReader(async (_input, onSend) => { onSend?.(); return replies.shift()!; }, () => now);

    await reader.query('query First', {});
    expect(reader.getRateLimitSnapshot()).toEqual({ limit: 1000, remaining: 250, resetAtMs: 50_000 });
    await reader.scope().query('query SameWindow', {});
    expect(reader.getRateLimitSnapshot()).toEqual({ limit: 1000, remaining: 250, resetAtMs: 50_000 });
    await reader.query('query NewWindow', {});
    expect(reader.getRateLimitSnapshot()).toEqual({ limit: 1000, remaining: 900, resetAtMs: 100_000 });
    now = 100_001;
    expect(reader.getRateLimitSnapshot()).toBeNull();
  });

  it('reserves the remaining response bytes across concurrent queries and releases unused capacity', async () => {
    const first = deferred<CommandResponse>();
    const second = deferred<CommandResponse>();
    const limits: number[] = [];
    const replies = [first, second];
    const run: GhRunner = (_input, onSend, responseBytes) => {
      onSend?.();
      limits.push(responseBytes ?? 0);
      const reply = replies.shift();
      if (!reply) throw new Error('UNEXPECTED_SEND');
      return reply.promise;
    };
    const reader = new GraphQLReader(run, Date.now, { retryAtMs: 0 }, { queries: 2, bytes: queryLimits.responseBytes });

    const inFlight = reader.query('query One', {});
    expect(await reader.query('query Concurrent', {})).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_LIMIT' }] });
    expect(limits).toEqual([queryLimits.responseBytes]);

    first.resolve(success());
    await inFlight;
    const afterRelease = reader.query('query AfterRelease', {});
    expect(limits).toHaveLength(2);
    expect(limits[1]).toBe(queryLimits.responseBytes - Buffer.byteLength(success().stdout, 'utf8'));
    second.resolve(success());
    await afterRelease;
  });

  it('caps grouped responses by each scope reservation while keeping operation budgets independent', async () => {
    const replies = [deferred<CommandResponse>(), deferred<CommandResponse>(), deferred<CommandResponse>()];
    const limits: number[] = [];
    let replyIndex = 0;
    const run: GhRunner = (_input, onSend, responseBytes) => {
      onSend?.();
      limits.push(responseBytes ?? 0);
      const reply = replies[replyIndex++];
      if (!reply) throw new Error('UNEXPECTED_SEND');
      return reply.promise;
    };
    const root = new GraphQLReader(run);
    const operation = root.scope();
    const otherOperation = root.scope();
    const first = operation.query('query GroupedOne', {}, undefined, 3);
    const lastCapacity = operation.query('query GroupedTwo', {}, undefined, 3);
    const independent = otherOperation.query('query OtherOperation', {}, undefined, 3);

    expect(limits).toEqual([queryLimits.operationBytes * 3 / 4, queryLimits.operationBytes / 4, queryLimits.operationBytes * 3 / 4]);
    expect(await operation.query('query Exhausted', {})).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_LIMIT' }] });

    for (const reply of replies) reply.resolve(success());
    await Promise.all([first, lastCapacity, independent]);
  });

  it('uses exactly the 16 MiB operation allowance across completed UTF-8 responses', async () => {
    const header = 'HTTP/2.0 200 Response\r\ncontent-type: application/json\r\n\r\n';
    const prefix = '{"data":{"viewer":{"id":"U_test"}},"padding":"';
    const suffix = '"}';
    const size = queryLimits.responseBytes;
    const padding = 'x'.repeat(size - Buffer.byteLength(header + prefix + suffix, 'utf8'));
    const response = { exitCode: 0, stdout: `${header}${prefix}${padding}${suffix}` };
    expect(Buffer.byteLength(response.stdout, 'utf8')).toBe(size);

    let sends = 0;
    const run: GhRunner = async (_input, onSend) => {
      sends++;
      onSend?.();
      return response;
    };
    const reader = new GraphQLReader(run).scope();
    for (let index = 0; index < 4; index++) expect((await reader.query(`query Page${index}`, {})).state).toBe('complete');
    expect(await reader.query('query OverBudget', {})).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_LIMIT' }] });
    expect(sends).toBe(4);
  });

  it('releases query and byte reservations for a pre-send runner failure', async () => {
    const limits: Array<number | undefined> = [];
    let sends = 0;
    const run: GhRunner = async (_input, onSend, responseBytes) => {
      limits.push(responseBytes);
      if (limits.length === 1) throw new GitHubRunnerError('CONTEXT_UNAVAILABLE');
      sends++;
      onSend?.();
      return success();
    };
    const reader = new GraphQLReader(run, Date.now, { retryAtMs: 0 }, { queries: 1, bytes: queryLimits.responseBytes });

    expect(await reader.query('query BeforeSendFailure', {})).toMatchObject({ state: 'context_unavailable' });
    expect((await reader.query('query EligibleAfterFailure', {})).state).toBe('complete');
    expect(await reader.query('query BudgetSpent', {})).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_LIMIT' }] });
    expect(limits).toEqual([queryLimits.responseBytes, queryLimits.responseBytes]);
    expect(sends).toBe(1);
  });

  it('retains the conservative response reservation after a post-send failure', async () => {
    const limits: Array<number | undefined> = [];
    let sends = 0;
    const run: GhRunner = async (_input, onSend, responseBytes) => {
      limits.push(responseBytes);
      if (limits.length === 1) {
        onSend?.();
        throw new GitHubRunnerError('CLI_UNAVAILABLE');
      }
      sends++;
      onSend?.();
      return success();
    };
    const reader = new GraphQLReader(run, Date.now, { retryAtMs: 0 }, { queries: 2, bytes: queryLimits.responseBytes * 3 });

    expect(await reader.query('query SentFailure', {}, undefined, 2)).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'CLI_UNAVAILABLE' }] });
    expect((await reader.query('query RemainingCapacity', {}, undefined, 3)).state).toBe('complete');
    expect(limits).toEqual([queryLimits.responseBytes * 2, queryLimits.responseBytes]);
    expect(sends).toBe(1);
    expect(await reader.query('query QueryLimit', {})).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_LIMIT' }] });
  });

  it('charges a reused collect first page once and enforces the 250-query limit', async () => {
    let sends = 0;
    const run: GhRunner = async (_input, onSend) => {
      sends++;
      onSend?.();
      if (sends === 1) return http({ data: { connection: { nodes: [{ id: 'first' }], pageInfo: { hasNextPage: true, endCursor: 'next' } } } });
      if (sends === 2) return http({ data: { connection: { nodes: [{ id: 'second' }], pageInfo: { hasNextPage: false, endCursor: null } } } });
      return success();
    };
    const reader = new GraphQLReader(run, Date.now, { retryAtMs: 0 }, { queries: 2, bytes: queryLimits.operationBytes });
    const firstPage = await reader.query('query Nodes', {});
    const collected = await collect(reader, 'query Nodes', {}, data => data.connection, node => ({ id: String(node.id) }), undefined, firstPage);

    expect(collected).toMatchObject({ state: 'complete', data: [{ id: 'first' }, { id: 'second' }] });
    expect(sends).toBe(2);
    expect(await reader.query('query OverBudget', {})).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_LIMIT' }] });

    let operationSends = 0;
    const operation = new GraphQLReader(async (_input, onSend) => {
      operationSends++;
      onSend?.();
      return success();
    }).scope();
    for (let index = 0; index < queryLimits.operationQueries; index++) await operation.query('query One', {});
    expect(await operation.query('query 251', {})).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_LIMIT' }] });
    expect(operationSends).toBe(queryLimits.operationQueries);
  });

  it('shares cooldown across scopes without consuming a blocked query reservation', async () => {
    let now = 1_000;
    let sends = 0;
    const run: GhRunner = async (_input, onSend) => {
      sends++;
      onSend?.();
      return sends === 1 ? http({}, 429, { 'retry-after': '2' }) : success();
    };
    const root = new GraphQLReader(run, () => now);
    const firstOperation = root.scope();
    const secondOperation = root.scope();

    expect(await firstOperation.query('query RateLimit', {})).toMatchObject({ state: 'rate_limited', retryAtMs: 3_000 });
    expect(await secondOperation.query('query DuringCooldown', {})).toMatchObject({ state: 'rate_limited', retryAtMs: 3_000 });
    expect(sends).toBe(1);
    now = 3_000;
    expect((await secondOperation.query('query AfterCooldown', {})).state).toBe('complete');
    expect(sends).toBe(2);
  });

  it('admits shared scopes in FIFO order with no more than three active sends', async () => {
    const sent: string[] = [];
    const replies = new Map<string, ReturnType<typeof deferred<CommandResponse>>>();
    const run: GhRunner = (input, onSend) => {
      const query = String((JSON.parse(input) as { query: string }).query);
      sent.push(query);
      onSend?.();
      const reply = deferred<CommandResponse>();
      replies.set(query, reply);
      return reply.promise;
    };
    const root = new GraphQLReader(run);
    const requests = [
      root.query('query First', {}),
      root.scope().query('query Second', {}),
      root.scope().query('query Third', {}),
      root.query('query Fourth', {}),
      root.scope().query('query Fifth', {}),
    ];

    expect(sent).toEqual(['query First', 'query Second', 'query Third']);
    replies.get('query Second')?.resolve(success());
    await flushMicrotasks();
    expect(sent).toEqual(['query First', 'query Second', 'query Third', 'query Fourth']);
    replies.get('query Third')?.resolve(success());
    await flushMicrotasks();
    expect(sent).toEqual(['query First', 'query Second', 'query Third', 'query Fourth', 'query Fifth']);
    for (const query of ['query First', 'query Fourth', 'query Fifth']) replies.get(query)?.resolve(success());
    await Promise.all(requests);
  });

  it('shares admission across createGitHub runnerFactory instances and isolates separate GitHub instances', async () => {
    const context: GitHubContext = { kind: 'windows_keyring', cwd: 'C:\\repo', executable: 'C:\\gh.exe' };
    const resolver = { contextForUse: async () => context } as unknown as GitHubExecutableResolver;
    const pending = new Map<string, ReturnType<typeof deferred<CommandResponse>>>();
    const calls: string[] = [];
    const activeByInstance = new Map<string, number>();
    const peakByInstance = new Map<string, number>();
    let factoryId = 0;
    const create = (instance: string) => createGitHub({ context, resolver, runnerFactory: () => {
      const id = `factory-${++factoryId}`;
      return (_input, onSend) => {
        calls.push(id);
        const active = (activeByInstance.get(instance) ?? 0) + 1;
        activeByInstance.set(instance, active);
        peakByInstance.set(instance, Math.max(peakByInstance.get(instance) ?? 0, active));
        onSend?.();
        const reply = deferred<CommandResponse>();
        pending.set(id, reply);
        return reply.promise.finally(() => activeByInstance.set(instance, (activeByInstance.get(instance) ?? 1) - 1));
      };
    } });
    const first = create('first');
    const second = create('second');
    const firstRequests = [first.getIdentity(), first.getIdentity(), first.getIdentity(), first.getIdentity()];
    await flushMicrotasks();
    expect(calls).toHaveLength(3);
    expect(activeByInstance.get('first')).toBe(3);

    const independentRequests = [second.getIdentity(), second.getIdentity()];
    await flushMicrotasks();
    expect(calls).toHaveLength(5);
    expect(activeByInstance.get('second')).toBe(2);
    const releasedFactory = calls[0]!;
    pending.get(releasedFactory)?.resolve(success());
    await flushMicrotasks();
    expect(calls).toHaveLength(6);
    for (const [id, reply] of pending) if (id !== releasedFactory) reply.resolve(success());
    await Promise.all([...firstRequests, ...independentRequests]);
    expect(peakByInstance.get('first')).toBe(3);
    expect(peakByInstance.get('second')).toBe(2);
  });

  it('keeps later createGitHub pages behind earlier FIFO waiters across operation scopes', async () => {
    const context: GitHubContext = { kind: 'windows_keyring', cwd: 'C:\\repo', executable: 'C:\\gh.exe' };
    const resolver = { contextForUse: async () => context } as unknown as GitHubExecutableResolver;
    const sent: string[] = [];
    const requests: Array<{ name: string; cursor: string | null; reply: ReturnType<typeof deferred<CommandResponse>> }> = [];
    let active = 0;
    let maximumActive = 0;
    const run: GhRunner = (input, onSend) => {
      const request = JSON.parse(input) as { query: string; variables: Record<string, unknown> };
      const name = /(?:query|mutation)\s+(\w+)/u.exec(request.query)?.[1] ?? 'unknown';
      const cursor = typeof request.variables.cursor === 'string' ? request.variables.cursor : null;
      sent.push(`${name}:${cursor ?? 'first'}`);
      active++;
      maximumActive = Math.max(maximumActive, active);
      onSend?.();
      const reply = deferred<CommandResponse>();
      requests.push({ name, cursor, reply });
      return reply.promise.finally(() => { active--; });
    };
    const github = createGitHub({ context, resolver, runnerFactory: () => run });
    const identity = http({ data: { viewer: { id: 'A', login: 'test' } } });
    const occupied = [github.getIdentity(), github.getIdentity(), github.getIdentity()];

    await flushMicrotasks();
    expect(sent).toEqual(['FactoryIdentity:first', 'FactoryIdentity:first', 'FactoryIdentity:first']);

    const pages = github.listProjectItems('PVT_synthetic_0');
    const independent = github.getIdentity();
    await flushMicrotasks();
    expect(sent).toHaveLength(3);

    requests[0]?.reply.resolve(identity);
    await flushMicrotasks();
    expect(sent).toEqual(['FactoryIdentity:first', 'FactoryIdentity:first', 'FactoryIdentity:first', 'FactoryProjectItems:first']);

    requests[3]?.reply.resolve(http({ data: { node: { items: { nodes: [
      { id: 'ITEM_1', isArchived: false, status: null, content: { __typename: 'Issue', id: 'ISSUE_1', title: 'First', url: 'https://github.com/org/repo/issues/1' } },
    ], pageInfo: { hasNextPage: true, endCursor: 'cursor-2' } } } } }));
    await flushMicrotasks();
    expect(sent).toEqual([
      'FactoryIdentity:first', 'FactoryIdentity:first', 'FactoryIdentity:first',
      'FactoryProjectItems:first', 'FactoryIdentity:first',
    ]);

    requests[1]?.reply.resolve(identity);
    await flushMicrotasks();
    expect(sent).toEqual([
      'FactoryIdentity:first', 'FactoryIdentity:first', 'FactoryIdentity:first',
      'FactoryProjectItems:first', 'FactoryIdentity:first', 'FactoryProjectItems:cursor-2',
    ]);

    requests[2]?.reply.resolve(identity);
    await flushMicrotasks();
    expect(sent).toHaveLength(6);

    requests[4]?.reply.resolve(identity);
    requests[5]?.reply.resolve(http({ data: { node: { items: { nodes: [
      { id: 'ITEM_2', isArchived: false, status: null, content: { __typename: 'Issue', id: 'ISSUE_2', title: 'Second', url: 'https://github.com/org/repo/issues/2' } },
    ], pageInfo: { hasNextPage: false, endCursor: null } } } } }));
    const occupiedResults = await Promise.all(occupied);
    const [listed, queued] = await Promise.all([pages, independent]);

    expect([...occupiedResults.map(({ state }) => state), queued.state]).toEqual(['complete', 'complete', 'complete', 'complete']);
    expect(listed).toMatchObject({ state: 'complete', data: [{ id: 'ITEM_1', position: 1 }, { id: 'ITEM_2', position: 2 }] });
    expect(maximumActive).toBe(3);
    expect(active).toBe(0);
    expect(requests.map(({ name, cursor }) => `${name}:${cursor ?? 'first'}`)).toEqual(sent);
  });

  it('runs T10 authorization reads through createGitHub under three occupied turns', async () => {
    const context: GitHubContext = { kind: 'windows_keyring', cwd: 'C:\\repo', executable: 'C:\\gh.exe' };
    const resolver = { contextForUse: async () => context } as unknown as GitHubExecutableResolver;
    const repository = { id: 'R', name: 'repo', url: 'https://github.com/org/repo', isArchived: false, isPrivate: true,
      owner: { id: 'O', login: 'org' }, defaultBranchRef: { name: 'main' } };
    const emptyConnection = { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
    const marker = '<!-- factory:icr:install:attempt:delivery -->';
    const body = `${marker}\nApproved tree and artifact references.`;
    const sent: string[] = [];
    let active = 0;
    let maximumActive = 0;
    const responseData = (request: { query: string; variables: Record<string, unknown> }): unknown => {
      const name = /(?:query|mutation)\s+(\w+)/u.exec(request.query)?.[1];
      if (name === 'FactoryIdentity') return { viewer: { id: 'A', login: 'account' } };
      if (name === 'FactoryIssueReference') return { node: { __typename: 'Issue', id: 'I', number: 1, repository: { name: 'repo', owner: { login: 'org' } } } };
      if (name === 'FactoryIssue') return { repository: { issueOrPullRequest: { __typename: 'Issue', id: 'I', number: 1, title: 'Issue', body: '', state: 'OPEN',
        url: 'https://github.com/org/repo/issues/1', repository } } };
      if (name === 'FactoryAssignees') return { node: { assignees: emptyConnection } };
      if (name === 'FactoryComments') return { node: { comments: emptyConnection } };
      if (name === 'FactoryBlockers') return { node: { blockedBy: emptyConnection } };
      if (name === 'FactoryMemberships') return { node: { projectItems: emptyConnection } };
      if (name === 'FactoryProject') return { node: { __typename: 'ProjectV2', id: 'P', number: 1, title: 'Project', url: 'https://github.com/org/projects/1',
        closed: false, owner: { __typename: 'Organization', id: 'O', login: 'org' } } };
      if (name === 'FactoryProjectFields') return { node: { fields: emptyConnection } };
      if (name === 'FactoryComment') {
        const input = request.variables.input as { clientMutationId: string; subjectId: string; body: string };
        return { addComment: { clientMutationId: input.clientMutationId, commentEdge: { node: { id: 'COMMENT', url: 'https://github.com/org/repo/issues/1#issuecomment-1',
          body: input.body, issue: { id: input.subjectId }, repository: { id: 'R' } } } } };
      }
      throw new Error(`UNEXPECTED_QUERY:${name ?? 'unknown'}`);
    };
    const run: GhRunner = (input, onSend) => {
      const request = JSON.parse(input) as { query: string; variables: Record<string, unknown> };
      const name = /(?:query|mutation)\s+(\w+)/u.exec(request.query)?.[1] ?? 'unknown';
      sent.push(name);
      active++;
      maximumActive = Math.max(maximumActive, active);
      onSend?.();
      return Promise.resolve().then(() => http({ data: responseData(request) })).finally(() => { active--; });
    };
    const github = createGitHub({ context, resolver, runnerFactory: () => run,
      mutationAuthorization: { accountId: 'A', repositoryIds: ['R'], projectIds: [] } });
    const operations = [1, 2, 3].map((_, index) => {
      const effect: EffectView = { operationId: randomUUID(), attemptId: randomUUID(), creationId: null, deliveryId: randomUUID(), kind: 'issue_comment',
        scopeKey: 'result', state: 'running', expectedIdentity: { repositoryId: 'R', issueId: 'I', marker, bodyHash: createHash('sha256').update(body).digest('hex') },
        confirmedIdentity: null, receipt: null, reason: null, authorized: true, revision: 2, sentAtMs: 1, confirmedAtMs: null };
      return github.mutateEffect({ effect, accountId: 'A', body, authorize: async () => {
        const [identity, issue, project] = await Promise.all([github.getIdentity(), github.getIssueContextById('I'), github.getProject('P')]);
        expect(identity.state).toBe('complete');
        expect(issue.state).toBe('complete');
        expect(project.state).toBe('complete');
        if (index === 2) throw new Error('AUTHORITY_REVOKED');
      } });
    });

    const results = await Promise.all(operations);
    expect(results.map(result => result.state)).toEqual(['confirmed', 'confirmed', 'failed_known']);
    expect(results[2]?.reason).toBe('EFFECT_AUTHORITY_REVOKED');
    expect(sent.filter(name => name === 'FactoryComment')).toHaveLength(2);
    expect(sent.filter(name => name === 'FactoryIdentity')).toHaveLength(3);
    expect(sent.filter(name => name === 'FactoryIssueReference')).toHaveLength(3);
    expect(sent.filter(name => name === 'FactoryProject')).toHaveLength(3);
    expect(maximumActive).toBeLessThanOrEqual(3);
  });

  it('starts the internal stage deadline when a queued turn is granted', async () => {
    vi.useFakeTimers();
    try {
      let monotonicNow = 0;
      const replies = new Map<string, ReturnType<typeof deferred<CommandResponse>>>();
      let authorizationDeadline: number | undefined;
      const authorizationStarted = deferred<void>();
      const run: GhRunner = (input, onSend) => {
        const query = String((JSON.parse(input) as { query: string }).query);
        onSend?.();
        if (query === 'mutation QueuedAuthorization') return Promise.resolve(success());
        const reply = deferred<CommandResponse>();
        replies.set(query, reply);
        return reply.promise;
      };
      const reader = new GraphQLReader(run, Date.now, { retryAtMs: 0 }, undefined, new Set(), () => monotonicNow);
      const occupied = ['One', 'Two', 'Three'].map(name => reader.query(`query Occupied${name}`, {}));
      const queued = reader.query('mutation QueuedAuthorization', {}, undefined, 1, {
        beforeSend: context => { authorizationDeadline = context.deadlineMonotonicMs; authorizationStarted.resolve(); },
      });
      await flushMicrotasks();
      setTimeout(() => {
        monotonicNow = 14_999;
        replies.get('query OccupiedOne')?.resolve(success());
      }, 14_999);

      await vi.advanceTimersByTimeAsync(14_999);
      await authorizationStarted.promise;
      expect(authorizationDeadline).toBe(74_999);
      expect((await queued).state).toBe('complete');
      for (const query of ['query OccupiedTwo', 'query OccupiedThree']) replies.get(query)?.resolve(success());
      await Promise.all(occupied);
    } finally { vi.useRealTimers(); }
  });

  it('rechecks cooldown after createGitHub resolves the mutation context', async () => {
    const context: GitHubContext = { kind: 'windows_keyring', cwd: 'C:\\repo', executable: 'C:\\gh.exe' };
    const mutationContext = deferred<GitHubContext>();
    const mutationContextStarted = deferred<void>();
    const blockerReplies: Array<ReturnType<typeof deferred<CommandResponse>>> = [];
    let contextLookups = 0;
    let identitySends = 0;
    const sent: string[] = [];
    const resolver = {
      contextForUse: async () => {
        contextLookups++;
        if (contextLookups === 4) { mutationContextStarted.resolve(); return mutationContext.promise; }
        return context;
      },
    } as unknown as GitHubExecutableResolver;
    const run: GhRunner = (input, onSend) => {
      const query = String((JSON.parse(input) as { query: string }).query);
      sent.push(query);
      if (query.includes('mutation FactoryComment')) { onSend?.(); return Promise.resolve(success()); }
      identitySends++;
      onSend?.();
      if (identitySends <= 3) {
        const reply = deferred<CommandResponse>();
        blockerReplies.push(reply);
        return reply.promise;
      }
      return Promise.resolve(http({}, 429, { 'retry-after': '60' }));
    };
    const github = createGitHub({ context, resolver, runnerFactory: () => run,
      mutationAuthorization: { accountId: 'A', repositoryIds: ['R'], projectIds: [] } });
    const marker = '<!-- factory:icr:install:attempt:delivery -->';
    const body = `${marker}\nApproved tree and artifact references.`;
    const effect: EffectView = {
      operationId: randomUUID(), attemptId: randomUUID(), creationId: null, deliveryId: randomUUID(), kind: 'issue_comment',
      scopeKey: 'result', state: 'running', expectedIdentity: { repositoryId: 'R', issueId: 'I', marker,
        bodyHash: createHash('sha256').update(body).digest('hex') }, confirmedIdentity: null, receipt: null, reason: null,
      authorized: true, revision: 2, sentAtMs: 1, confirmedAtMs: null,
    };
    const occupied = [github.getIdentity(), github.getIdentity(), github.getIdentity()];
    await flushMicrotasks();
    expect(identitySends).toBe(3);
    const mutation = github.mutateEffect({ effect, accountId: 'A', body, authorize: async () => {} });
    blockerReplies[0]?.resolve(http({ data: { viewer: { id: 'A', login: 'test' } } }));
    await mutationContextStarted.promise;

    const cooldownQuery = github.getIdentity();
    blockerReplies[1]?.resolve(http({ data: { viewer: { id: 'A', login: 'test' } } }));
    await expect(cooldownQuery).resolves.toMatchObject({ state: 'rate_limited' });
    mutationContext.resolve(context);

    await expect(mutation).resolves.toMatchObject({ state: 'failed_known', reason: 'RATE_LIMITED' });
    expect(sent.some(query => query.includes('mutation FactoryComment'))).toBe(false);
    blockerReplies[2]?.resolve(http({ data: { viewer: { id: 'A', login: 'test' } } }));
    await Promise.all(occupied);
  });

  it('expires a pending createGitHub context resolution and ignores its late result', async () => {
    vi.useFakeTimers();
    try {
      const context: GitHubContext = { kind: 'windows_keyring', cwd: 'C:\\repo', executable: 'C:\\gh.exe' };
      const lateContext = deferred<GitHubContext>();
      const contextResolutionStarted = deferred<void>();
      const blockerReplies: Array<{ reply: ReturnType<typeof deferred<CommandResponse>>; close(): void }> = [];
      let contextLookups = 0;
      let factoryCalls = 0;
      const resolver = { contextForUse: async () => {
        contextLookups++;
        if (contextLookups === 4) { contextResolutionStarted.resolve(); return lateContext.promise; }
        return context;
      } } as unknown as GitHubExecutableResolver;
      const run: GhRunner = (input, onSend, _bytes, control) => {
        const query = String((JSON.parse(input) as { query: string }).query);
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
        blockerReplies.push({ reply, close: () => {
          physicallyClosed = true;
          resolveClose();
          reply.resolve(http({ data: { viewer: { id: 'A', login: 'test' } } }));
        } });
        expect(query).toContain('FactoryIdentity');
        return reply.promise;
      };
      const github = createGitHub({ context, resolver, runnerFactory: () => { factoryCalls++; return run; } });
      const occupied = [github.getIdentity(), github.getIdentity(), github.getIdentity()];
      await flushMicrotasks();
      expect(factoryCalls).toBe(3);
      const pending = github.getIdentity();
      blockerReplies[0]?.close();
      await contextResolutionStarted.promise;

      await vi.advanceTimersByTimeAsync(60_000);
      await expect(pending).resolves.toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_LIMIT' }] });
      lateContext.resolve(context);
      await flushMicrotasks();
      expect(factoryCalls).toBe(3);
      expect(blockerReplies).toHaveLength(3);

      for (const blocker of blockerReplies.slice(1)) blocker.close();
      await Promise.all(occupied);
    } finally { vi.useRealTimers(); }
  });

  it('rejects a createGitHub context replaced during queued runner preparation', async () => {
    const context: GitHubContext = { kind: 'windows_keyring', cwd: 'C:\\repo', executable: 'C:\\gh.exe' };
    const replacement: GitHubContext = { ...context, executable: 'C:\\other-gh.exe' };
    const lateContext = deferred<GitHubContext>();
    const contextResolutionStarted = deferred<void>();
    const blockerReplies: Array<ReturnType<typeof deferred<CommandResponse>>> = [];
    let currentContext: GitHubContext | null = context;
    let contextLookups = 0;
    let factoryCalls = 0;
    let sent = 0;
    const resolver = {
      contextForUse: async () => {
        contextLookups++;
        if (contextLookups === 4) { contextResolutionStarted.resolve(); return lateContext.promise; }
        return context;
      },
      currentContext: () => currentContext,
    } as unknown as GitHubExecutableResolver;
    const run: GhRunner = (_input, onSend) => {
      sent++;
      onSend?.();
      const reply = deferred<CommandResponse>();
      blockerReplies.push(reply);
      return reply.promise;
    };
    const github = createGitHub({ context, resolver, runnerFactory: () => { factoryCalls++; return run; } });
    const occupied = [github.getIdentity(), github.getIdentity(), github.getIdentity()];
    await flushMicrotasks();
    expect(sent).toBe(3);
    const pending = github.getIdentity();
    blockerReplies[0]?.resolve(http({ data: { viewer: { id: 'A', login: 'test' } } }));
    await contextResolutionStarted.promise;
    currentContext = replacement;
    lateContext.resolve(context);

    await expect(pending).resolves.toMatchObject({ state: 'context_unavailable' });
    expect(factoryCalls).toBe(4);
    expect(sent).toBe(3);
    blockerReplies[1]?.resolve(http({ data: { viewer: { id: 'A', login: 'test' } } }));
    blockerReplies[2]?.resolve(http({ data: { viewer: { id: 'A', login: 'test' } } }));
    await Promise.all(occupied);
  });

  it('expires a queued send at the exact wait boundary without calling onSend', async () => {
    vi.useFakeTimers();
    try {
      let monotonicNow = 0;
      const sent: string[] = [];
      const replies = new Map<string, ReturnType<typeof deferred<CommandResponse>>>();
      const run: GhRunner = (input, onSend) => {
        const query = String((JSON.parse(input) as { query: string }).query);
        sent.push(query);
        onSend?.();
        const reply = deferred<CommandResponse>();
        replies.set(query, reply);
        return reply.promise;
      };
      const reader = new GraphQLReader(run, Date.now, { retryAtMs: 0 }, undefined, new Set(), () => monotonicNow);
      const first = reader.query('query OccupiedOne', {});
      const second = reader.query('query OccupiedTwo', {});
      const third = reader.query('query OccupiedThree', {});
      setTimeout(() => {
        monotonicNow = queryLimits.timeoutMs;
        replies.get('query OccupiedOne')?.resolve(success());
      }, queryLimits.timeoutMs);
      const expired = reader.query('query ExpiresAtBoundary', {});

      await vi.advanceTimersByTimeAsync(queryLimits.timeoutMs);
      await expect(expired).resolves.toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_LIMIT' }] });
      expect(sent).toEqual(['query OccupiedOne', 'query OccupiedTwo', 'query OccupiedThree']);
      replies.get('query OccupiedTwo')?.resolve(success());
      replies.get('query OccupiedThree')?.resolve(success());
      await Promise.all([first, second, third]);
    } finally { vi.useRealTimers(); }
  });

  it('honors pre-aborted signals, cancellation, and a shorter external deadline while waiting', async () => {
    vi.useFakeTimers();
    try {
      let monotonicNow = 0;
      const sent: string[] = [];
      const replies = new Map<string, ReturnType<typeof deferred<CommandResponse>>>();
      const run: GhRunner = (input, onSend) => {
        const query = String((JSON.parse(input) as { query: string }).query);
        sent.push(query);
        onSend?.();
        const reply = deferred<CommandResponse>();
        replies.set(query, reply);
        return reply.promise;
      };
      const reader = new GraphQLReader(run, Date.now, { retryAtMs: 0 }, undefined, new Set(), () => monotonicNow);
      const occupied = ['One','Two','Three'].map(name => reader.query(`query Occupied${name}`,{}));
      const alreadyAborted = new AbortController();
      alreadyAborted.abort();
      await expect(reader.query('query AlreadyAborted',{},undefined,1,{ signal: alreadyAborted.signal }))
        .resolves.toMatchObject({ diagnostics: [{ code: 'QUERY_FAILED' }] });
      expect(sent).toHaveLength(3);

      const cancellation = new AbortController();
      const cancelled = reader.query('query CancelledInQueue',{},undefined,1,{ signal: cancellation.signal });
      cancellation.abort();
      await expect(cancelled).resolves.toMatchObject({ diagnostics: [{ code: 'QUERY_FAILED' }] });
      const externalDeadline = reader.query('query ExternalDeadline',{},undefined,1,{ deadlineMonotonicMs: 5_000 });
      await vi.advanceTimersByTimeAsync(5_000);
      monotonicNow = 5_000;
      await expect(externalDeadline).resolves.toMatchObject({ diagnostics: [{ code: 'QUERY_LIMIT' }] });
      expect(sent).toHaveLength(3);

      for (const query of ['query OccupiedOne','query OccupiedTwo','query OccupiedThree']) replies.get(query)?.resolve(success());
      await Promise.all(occupied);
    } finally { vi.useRealTimers(); }
  });

  it('rechecks shared cooldown after FIFO wait and returns without sleeping to retryAtMs', async () => {
    let now = 1_000;
    const sent: string[] = [];
    const replies = new Map<string, ReturnType<typeof deferred<CommandResponse>>>();
    const run: GhRunner = (input, onSend) => {
      const query = String((JSON.parse(input) as { query: string }).query);
      sent.push(query);
      onSend?.();
      if (query === 'query RateLimited') return Promise.resolve(http({},429,{ 'retry-after': '3' }));
      const reply = deferred<CommandResponse>();
      replies.set(query,reply);
      return reply.promise;
    };
    const reader = new GraphQLReader(run,() => now,{ retryAtMs: 0 });
    const rateLimited = reader.query('query RateLimited',{});
    const occupied = [reader.query('query OccupiedTwo',{}),reader.query('query OccupiedThree',{})];
    const queued = reader.query('query QueuedDuringCooldown',{});

    await expect(rateLimited).resolves.toMatchObject({ state: 'rate_limited',retryAtMs: 4_000 });
    await expect(queued).resolves.toMatchObject({ state: 'rate_limited',retryAtMs: 4_000 });
    expect(sent).toEqual(['query RateLimited','query OccupiedTwo','query OccupiedThree']);
    now = 4_000;
    replies.get('query OccupiedTwo')?.resolve(success());
    replies.get('query OccupiedThree')?.resolve(success());
    await Promise.all(occupied);
  });

  it('keeps a permit occupied until physical close after a logical runner failure', async () => {
    const sent: string[] = [];
    const closes: Array<() => void> = [];
    const run: GhRunner = (input, onSend, _bytes, control) => {
      const query = String((JSON.parse(input) as { query: string }).query);
      sent.push(query);
      if (query === 'query Fourth') {
        onSend?.();
        return Promise.resolve(success());
      }
      let physicallyClosed = false;
      let physicallySent = false;
      let resolveClose!: () => void;
      const completion = new Promise<void>(resolve => { resolveClose = resolve; });
      const lifecycle: GitHubRunnerLifecycle = {
        get sent() { return physicallySent; }, killRequested: false, killFailed: false,
        get physicallyClosed() { return physicallyClosed; }, completion,
      };
      control?.onLifecycle(lifecycle);
      physicallySent = true;
      onSend?.();
      closes.push(() => { physicallyClosed = true; resolveClose(); });
      throw new GitHubRunnerError('CLI_UNAVAILABLE', lifecycle);
    };
    const reader = new GraphQLReader(run);
    for (const query of ['query First', 'query Second', 'query Third']) {
      await reader.query(query, {});
    }
    expect(sent).toEqual(['query First', 'query Second', 'query Third']);
    const fourth = reader.query('query Fourth', {});
    await flushMicrotasks();
    expect(sent).toHaveLength(3);
    closes[0]!();
    await flushMicrotasks();
    expect(sent).toEqual(['query First', 'query Second', 'query Third', 'query Fourth']);
    await fourth;
    for (const close of closes.slice(1)) close();
  });

  it('times out new admissions when failed subprocesses have not emitted close', async () => {
    vi.useFakeTimers();
    try {
      let monotonicNow = 0;
      const sent: string[] = [];
      const closes: Array<() => void> = [];
      const run: GhRunner = (input, onSend, _bytes, control) => {
        const query = String((JSON.parse(input) as { query: string }).query);
        sent.push(query);
        let physicallyClosed = false;
        let physicallySent = false;
        let resolveClose!: () => void;
        const completion = new Promise<void>(resolve => { resolveClose = resolve; });
        const lifecycle: GitHubRunnerLifecycle = {
          get sent() { return physicallySent; }, killRequested: true, killFailed: false,
          get physicallyClosed() { return physicallyClosed; }, completion,
        };
        control?.onLifecycle(lifecycle);
        physicallySent = true;
        onSend?.();
        closes.push(() => { physicallyClosed = true; resolveClose(); });
        throw new GitHubRunnerError('CLI_UNAVAILABLE',lifecycle);
      };
      const reader = new GraphQLReader(run,Date.now,{ retryAtMs: 0 },undefined,new Set(),() => monotonicNow);
      for (const query of ['query First','query Second','query Third']) await reader.query(query,{});
      setTimeout(() => { monotonicNow = queryLimits.timeoutMs; },queryLimits.timeoutMs);
      const waiting = reader.query('query NoPhysicalSlot',{});

      await vi.advanceTimersByTimeAsync(queryLimits.timeoutMs);
      await expect(waiting).resolves.toMatchObject({ diagnostics: [{ code: 'QUERY_LIMIT' }] });
      expect(sent).toEqual(['query First','query Second','query Third']);
      for (const close of closes) close();
      await flushMicrotasks();
    } finally { vi.useRealTimers(); }
  });

  it('serializes dependent identity, issue, and project reads under each of three turns', async () => {
    const sent: string[] = [];
    const pending: Array<{ query: string; reply: ReturnType<typeof deferred<CommandResponse>> }> = [];
    let active = 0;
    let maximumActive = 0;
    const run: GhRunner = (input, onSend) => {
      const query = String((JSON.parse(input) as { query: string }).query);
      sent.push(query);
      onSend?.();
      active++;
      maximumActive = Math.max(maximumActive, active);
      const reply = deferred<CommandResponse>();
      pending.push({ query, reply });
      return reply.promise.finally(() => { active--; });
    };
    const reader = new GraphQLReader(run);
    const parents = [1, 2, 3].map(index => reader.scope().query(`mutation Parent${index}`, {}, undefined, 1, {
      beforeSend: async () => {
        const outcomes = await Promise.all([
          reader.query(`query Identity${index}`, {}),
          reader.scope().query(`query Issue${index}`, {}),
          reader.query(`query Project${index}`, {}),
          reader.query(`mutation Nested${index}`, {}),
        ]);
        expect(outcomes[3]).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_FAILED' }] });
      },
    }));

    for (let round = 0; round < 12 && sent.length < 12; round++) {
      await flushMicrotasks();
      const batch = pending.splice(0);
      for (const item of batch) item.reply.resolve(success());
    }
    await Promise.all(parents);
    expect(sent).toHaveLength(12);
    expect(maximumActive).toBe(3);
    for (const index of [1, 2, 3]) {
      const positions = [`query Identity${index}`, `query Issue${index}`, `query Project${index}`, `mutation Parent${index}`]
        .map(query => sent.indexOf(query));
      expect(positions.every(position => position >= 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((left, right) => left - right));
    }
  });

  it('does not let a late authorization continuation reuse a released permit', async () => {
    const sent: string[] = [];
    const run: GhRunner = async (input, onSend) => {
      sent.push(String((JSON.parse(input) as { query: string }).query));
      onSend?.();
      return success();
    };
    const reader = new GraphQLReader(run);
    let resume!: () => void;
    const delayed = new Promise<void>(resolve => { resume = resolve; });
    await reader.query('mutation Parent', {}, undefined, 1, {
      beforeSend: () => { void delayed.then(() => reader.query('query LateAuthorizationRead', {})); },
    });
    resume();
    await flushMicrotasks();
    expect(sent).toEqual(['mutation Parent']);
  });
});
