import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreationBoardOperation, CreationBoardOperationKind } from '#contracts';
import { GraphQLReader, type CommandResponse, type GhRunner, type GitHubRunnerLifecycle } from './transport.js';
import { createBoardOperations } from './board.js';

const names = ['Backlog','Ready','In progress','In review','Done'];
const remote = { ownerId: 'OWNER', name: 'repo', visibility: 'private' as const };
const authorization = { accountId: 'ACCOUNT', targets: [{ ...remote, allowPush: true }] };
const expected = (projectId: string | null = null, fieldId: string | null = null, viewId: string | null = null) => ({ format_version: 1 as const,
  owner_id: 'OWNER', board_name: 'Project', marker: 'Factory-Board:test', repository_id: 'REPOSITORY', project_id: projectId,
  status_field_id: fieldId, expected_status_names: names, view_id: viewId, view_name: 'Kanban', view_layout: 'BOARD_LAYOUT' as const });
function boardOperation(kind: CreationBoardOperationKind, identity = expected(), state: CreationBoardOperation['state'] = 'running', sentAt: number | null = null): CreationBoardOperation {
  const creationId = randomUUID();
  return { operation_id: randomUUID(), creation_id: creationId, kind, scope_key: 'board', state, revision: state === 'running' ? 2 : 3,
    request_hash: 'a'.repeat(64), authorization: { format_version: 1, source_operation_id: randomUUID(), plan_hash: 'b'.repeat(64),
      account_id: 'ACCOUNT', creation_id: creationId, actions: ['create_board','configure_status','link_repository','configure_view','verify_board'] },
    expected_identity: identity, receipt: null, reason: null, created_at_ms: Date.now() - 2000, sent_at_ms: sentAt, confirmed_at_ms: null };
}
const httpResponse = (data: unknown) => ({ exitCode: 0, stdout: `HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n${JSON.stringify({ data })}` });
function fixture(mode: string | null = null, groupByStatus = true, readyBoard = false, repositoryLinked = true, monotonicNow: () => number = () => performance.now()) {
  const project = { id: 'PROJECT', title: 'Project', closed: false, createdAt: new Date().toISOString(), owner: { __typename: 'Organization', id: 'OWNER', login: 'owner' } };
  const optionIds = names.map((_, index) => `OPTION_${index}`);
  const viewOptionNames = mode === 'wrong-view-column-order' ? [...names].reverse() : mode === 'extra-view-column' ? [...names, 'Later'] : names;
  const viewOptions = viewOptionNames.map(name => ({ id: name === 'Later' ? 'EXTRA' : optionIds[names.indexOf(name)]!, name }));
  const visibleOptionNames = mode === 'wrong-visible-column-order' ? [...names].reverse() : names;
  const visibleOptions = visibleOptionNames.map(name => ({ id: optionIds[names.indexOf(name)]!, name }));
  let fields: Array<Record<string, unknown>> = [];
  let repositories: string[] = [];
  let views: Array<Record<string, unknown>> = [];
  let boardPages: Array<Record<string, unknown>> = [];
  let mutationCount = 0;
  let viewerId = 'ACCOUNT';
  if (mode === 'default-status' || mode === 'default-status-lowercase') {
    fields = [{ __typename: 'ProjectV2SingleSelectField', id: 'STATUS', name: 'Status', options: [
      { id: 'DEFAULT_TODO', name: 'Todo' },
      { id: 'DEFAULT_PROGRESS', name: mode === 'default-status' ? 'In Progress' : 'In progress' },
      { id: 'DEFAULT_DONE', name: 'Done' },
    ] }];
  }
  if (readyBoard) {
    fields = [{ __typename: 'ProjectV2SingleSelectField', id: 'STATUS', name: 'Status', options: names.map((name,index) => ({ id: optionIds[index]!, name })) }];
    repositories = repositoryLinked ? ['REPOSITORY'] : [];
    views = [{ id: 'VIEW', name: 'Kanban', layout: 'BOARD_LAYOUT', createdAt: new Date().toISOString(),
      configuration: { visibleFields: { nodes: [{ __typename: 'ProjectV2SingleSelectField', id: 'STATUS', options: visibleOptions }], pageInfo: { hasNextPage: false, endCursor: null } } },
      groupByFields: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      verticalGroupByFields: { nodes: groupByStatus ? [{ __typename: 'ProjectV2SingleSelectField', id: 'STATUS', options: viewOptions }] : [], pageInfo: { hasNextPage: false, endCursor: null } } }];
  }
  const runner = vi.fn<GhRunner>(async (raw, onSend) => {
    const request = JSON.parse(raw) as { query: string; variables: Record<string, unknown> };
    const pageInfo = { hasNextPage: false, endCursor: null };
    if (request.query.includes('FactoryCreationBoardSnapshot') && /\b__typename\s+id\b/.test(request.query)) return {
      exitCode: 0, stdout: 'HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n' + JSON.stringify({ errors: [{ message: "Selections can't be made directly on unions", type: 'GRAPHQL_VALIDATION_FAILED' }] }),
    };
    if (request.query.includes('FactoryLinkBoardRepository') && /\bprojectV2\s*\{/.test(request.query)) return {
      exitCode: 0, stdout: 'HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n' + JSON.stringify({ errors: [{ message: "Field 'projectV2' doesn't exist on type 'LinkProjectV2ToRepositoryPayload'", type: 'GRAPHQL_VALIDATION_FAILED' }] }),
    };
    if (request.query.includes('FactoryCreationBoards')) return httpResponse({ viewer: { id: viewerId }, node: { __typename: 'Organization', id: 'OWNER', projectsV2: { nodes: boardPages, pageInfo } } });
    if (request.query.includes('FactoryCreationBoardSnapshot')) return httpResponse({ viewer: { id: viewerId }, node: { __typename: 'ProjectV2', ...project,
      repositories: { nodes: repositories.map(id => ({ id })), pageInfo }, fields: { nodes: fields, pageInfo }, views: { nodes: views, pageInfo } } });
    onSend?.(); mutationCount++;
    if (request.query.includes('FactoryCreateBoard')) {
      boardPages = [{ id: project.id, title: project.title, createdAt: project.createdAt, owner: { id: 'OWNER' } }];
      if (mode === 'lost-create') throw new Error('response lost');
      return httpResponse({ createProjectV2: { clientMutationId: (request.variables.input as { clientMutationId: string }).clientMutationId, projectV2: { id: project.id } } });
    }
    if (request.query.includes('FactoryCreateStatus') || request.query.includes('FactoryUpdateStatus')) {
      const input = request.variables.input as { fieldId?: string; projectId?: string; name?: string; singleSelectOptions: Array<{ id?: string; name: string }> };
      const submittedOptions = mode === 'wrong-order' ? [...input.singleSelectOptions].reverse() : input.singleSelectOptions;
      const observedOptions = submittedOptions.map((option, index) => ({ id: option.id ?? optionIds[index]!, name: option.name }));
      if (mode === 'extra-option') observedOptions.push({ id: 'EXTRA', name: 'Later' });
      fields = [{ __typename: 'ProjectV2SingleSelectField', id: input.fieldId ?? 'STATUS', name: input.name ?? 'Status', options: observedOptions }];
      if (mode === 'lost-status') throw new Error('response lost');
      const field = fields[0]!;
      return httpResponse({ [request.query.includes('FactoryCreateStatus') ? 'createProjectV2Field' : 'updateProjectV2Field']:
        { clientMutationId: (request.variables.input as { clientMutationId: string }).clientMutationId, projectV2Field: { id: field.id, name: field.name, options: field.options } } });
    }
    if (request.query.includes('FactoryLinkBoardRepository')) {
      repositories = ['REPOSITORY'];
      return httpResponse({ linkProjectV2ToRepository: { clientMutationId: (request.variables.input as { clientMutationId: string }).clientMutationId, repository: { id: 'REPOSITORY' } } });
    }
    if (request.query.includes('FactoryCreateKanbanView')) {
      const input = request.variables.input as { name: string; layout: string; configuration: { visibleFieldIds: string[] } };
      views = [{ id: 'VIEW', name: input.name, layout: input.layout, createdAt: new Date().toISOString(),
        configuration: { visibleFields: { nodes: input.configuration.visibleFieldIds.map(id => ({ __typename: 'ProjectV2SingleSelectField', id, options: visibleOptions })), pageInfo } },
        groupByFields: { nodes: [], pageInfo },
        verticalGroupByFields: { nodes: groupByStatus ? [{ __typename: 'ProjectV2SingleSelectField', id: 'STATUS', options: viewOptions }] : [], pageInfo } }];
      return httpResponse({ createProjectV2View: { clientMutationId: (request.variables.input as { clientMutationId: string }).clientMutationId, projectV2View: { id: 'VIEW', name: input.name, layout: input.layout } } });
    }
    throw new Error('unexpected GraphQL query');
  });
  const reader = new GraphQLReader(runner, Date.now, { retryAtMs: 0 }, undefined, new Set(), monotonicNow);
  const api = createBoardOperations(reader, authorization);
  return { api, reader, runner, mutations: () => mutationCount, setViewer: (id: string) => { viewerId = id; } };
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

describe('GitHub Projects board operations', () => {
  it.each(['default-status', 'default-status-lowercase'])('preserves workflow-bound default option IDs when configuring five columns (%s)', async mode => {
    const f = fixture(mode);
    const result = await f.api.createBoardOperation(boardOperation('configure_status', expected('PROJECT')),
      remote, 'REPOSITORY', 'ACCOUNT', async () => {}, () => {});
    expect(result.state).toBe('confirmed');
    const update = f.runner.mock.calls.map(([raw]) => JSON.parse(raw) as { query: string; variables: { input: { singleSelectOptions: Array<{ id?: string; name: string }> } } })
      .find(request => request.query.includes('FactoryUpdateStatus'))!;
    expect(update.variables.input.singleSelectOptions).toMatchObject([
      { id: 'DEFAULT_TODO', name: 'Backlog' }, { name: 'Ready' },
      { id: 'DEFAULT_PROGRESS', name: 'In progress' }, { name: 'In review' },
      { id: 'DEFAULT_DONE', name: 'Done' },
    ]);
    expect(result.receipt?.status_options?.map(option => option.name)).toEqual(names);
    expect(result.receipt?.status_options?.map(option => option.id)).toEqual([
      'DEFAULT_TODO', 'OPTION_1', 'DEFAULT_PROGRESS', 'OPTION_3', 'DEFAULT_DONE',
    ]);
  });
  it('observes Kanban columns through vertical grouping even when horizontal grouping is empty', async () => {
    const f = fixture(null, true, true);
    const result = await f.api.createBoardOperation(boardOperation('verify_board', expected('PROJECT', 'STATUS', 'VIEW')), remote, 'REPOSITORY', 'ACCOUNT', async () => {}, () => {});
    expect(result).toMatchObject({ state: 'confirmed', receipt: { group_by_field_ids: ['STATUS'] } });
    const snapshots = f.runner.mock.calls.map(([raw]) => (JSON.parse(raw) as { query: string }).query).filter(query => query.includes('FactoryCreationBoardSnapshot'));
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.every(query => query.includes('verticalGroupByFields(first:100)'))).toBe(true);
  });
  it('creates and reads back five ordered options, repository link, board layout and Status grouping', async () => {
    const f = fixture(); const authorize = vi.fn(async () => {
      const last = JSON.parse(f.runner.mock.calls.at(-1)![0]) as { query: string };
      expect(last.query).toMatch(/^query /);
    }); let operation = boardOperation('create_board');
    const run = async (kind: CreationBoardOperationKind, identity: CreationBoardOperation['expected_identity']) => {
      operation = { ...operation, operation_id: randomUUID(), kind, expected_identity: identity, state: 'running', sent_at_ms: null };
      const result = await f.api.createBoardOperation(operation, remote, 'REPOSITORY', 'ACCOUNT', authorize, () => { operation = { ...operation, sent_at_ms: Date.now() }; });
      expect(result.state).toBe('confirmed'); return result.receipt!;
    };
    const project = await run('create_board', expected());
    const status = await run('configure_status', expected(project.project_id!, null));
    const linked = await run('link_repository', expected(project.project_id!, status.status_field_id!));
    expect(linked.repository_ids).toContain('REPOSITORY');
    const view = await run('configure_view', expected(project.project_id!, status.status_field_id!));
    const verification = await run('verify_board', expected(project.project_id!, status.status_field_id!, view.view_id!));
    expect(verification.status_options?.map(option => option.name)).toEqual(names);
    expect(verification.group_by_field_ids).toContain(status.status_field_id);
    expect(f.mutations()).toBe(4);
    expect(authorize).toHaveBeenCalledTimes(4);
    expect(f.runner.mock.calls.map(([raw]) => JSON.parse(raw).query)).not.toContain('query FactoryCreateLocalBoard');
  });
  it.each(['wrong-order','extra-option'] as const)('keeps an invalid status field unconfirmed (%s)', async mode => {
    const f = fixture(mode); const op = boardOperation('configure_status', expected('PROJECT'));
    const result = await f.api.createBoardOperation(op,remote,'REPOSITORY','ACCOUNT',async () => {},() => {});
    expect(result.state).toBe('unknown');
    expect(result.receipt).toBeNull();
  });
  it('does not replay a create whose response was lost and reconciles only a unique observed creation', async () => {
    const f = fixture('lost-create'); const op = boardOperation('create_board'); let sentAt = op.created_at_ms;
    const first = await f.api.createBoardOperation(op,remote,'REPOSITORY','ACCOUNT',async () => {},() => { sentAt = Date.now(); });
    expect(first.state).toBe('unknown');
    const unknownOperation = { ...op, state: 'unknown' as const, revision: 3, sent_at_ms: sentAt };
    const reconciled = await f.api.reconcileBoardOperation(unknownOperation,remote,'REPOSITORY','ACCOUNT');
    expect(reconciled.state).toBe('confirmed');
    expect(f.mutations()).toBe(1);
  });
  it('blocks when the board view is not grouped by Status or the viewer changes', async () => {
    const f = fixture(null,false,true); const op = boardOperation('verify_board', expected('PROJECT','STATUS','VIEW'));
    const wrongGroup = await f.api.createBoardOperation(op,remote,'REPOSITORY','ACCOUNT',async () => {},() => {});
    expect(wrongGroup.state).toBe('failed_known');
    expect(wrongGroup.reason).toBe('BOARD_CAPABILITIES_INCOMPLETE');
    f.setViewer('OTHER');
    const wrongViewer = await f.api.reconcileBoardOperation({ ...op, state: 'unknown', sent_at_ms: op.created_at_ms },remote,'REPOSITORY','ACCOUNT');
    expect(wrongViewer.state).not.toBe('confirmed');
    expect(f.mutations()).toBe(0);
  });
  it('blocks when the repository is not linked to the observed board', async () => {
    const f = fixture(null,true,true,false); const op = boardOperation('verify_board', expected('PROJECT','STATUS','VIEW'));
    const result = await f.api.createBoardOperation(op,remote,'REPOSITORY','ACCOUNT',async () => {},() => {});
    expect(result).toMatchObject({ state: 'failed_known', reason: 'BOARD_CAPABILITIES_INCOMPLETE', receipt: null });
    expect(f.mutations()).toBe(0);
  });
  it.each(['wrong-view-column-order','wrong-visible-column-order','extra-view-column'] as const)('blocks when the Kanban view columns are not exactly ordered (%s)', async mode => {
    const f = fixture(mode, true, true); const op = boardOperation('verify_board', expected('PROJECT','STATUS','VIEW'));
    const result = await f.api.createBoardOperation(op,remote,'REPOSITORY','ACCOUNT',async () => {},() => {});
    expect(result).toMatchObject({ state: 'failed_known', reason: 'BOARD_CAPABILITIES_INCOMPLETE', receipt: null });
    expect(f.mutations()).toBe(0);
  });
  it('rejects repository, Status-field and view IDs crossed between operation receipts', async () => {
    const f = fixture();
    const repository = await f.api.createBoardOperation(boardOperation('link_repository', expected('PROJECT','STATUS')),
      remote,'FOREIGN_REPOSITORY','ACCOUNT',async () => {},() => {});
    expect(repository).toMatchObject({ state: 'failed_known', reason: 'BOARD_CROSS_IDENTITY' });
    const wrongField = await f.api.createBoardOperation(boardOperation('verify_board', expected('PROJECT','FOREIGN_STATUS','VIEW')),
      remote,'REPOSITORY','ACCOUNT',async () => {},() => {});
    expect(wrongField).toMatchObject({ state: 'failed_known', reason: 'BOARD_CROSS_IDENTITY' });
    const wrongView = await f.api.createBoardOperation(boardOperation('verify_board', expected('PROJECT','STATUS','FOREIGN_VIEW')),
      remote,'REPOSITORY','ACCOUNT',async () => {},() => {});
    expect(wrongView).toMatchObject({ state: 'failed_known', reason: 'BOARD_CROSS_IDENTITY' });
    expect(f.mutations()).toBe(0);
  });

  it('uses one sixty-second deadline and blocks dispatch at the exact boundary', async () => {
    vi.useFakeTimers();
    let monotonicNow = 0;
    const f = fixture('default-status', true, false, true, () => monotonicNow);
    const authorize = vi.fn(async (context?: { deadlineMonotonicMs: number; assertActive(): void }) => {
      expect(context?.deadlineMonotonicMs).toBe(60_000);
      monotonicNow = 60_000;
      context?.assertActive();
    });
    const markSent = vi.fn();

    const result = await f.api.createBoardOperation(boardOperation('configure_status', expected('PROJECT')),
      remote, 'REPOSITORY', 'ACCOUNT', authorize, markSent);

    expect(result).toMatchObject({ state: 'unknown', reason: 'BOARD_STATUS_UNCONFIRMED', receipt: null });
    expect(authorize).toHaveBeenCalledOnce();
    expect(f.runner).toHaveBeenCalledOnce();
    expect(markSent).not.toHaveBeenCalled();
    expect(f.mutations()).toBe(0);
    expect(f.runner.mock.calls[0]?.[3]?.deadlineMonotonicMs).toBe(60_000);
  });

  it.each(['resolve', 'reject'] as const)('does not dispatch after authorization returns or rejects late (%s)', async outcome => {
    vi.useFakeTimers();
    let monotonicNow = 0;
    const f = fixture(null, true, false, true, () => monotonicNow);
    const authorization = deferred<void>();
    const authorize = vi.fn(() => authorization.promise);
    const markSent = vi.fn();
    const pending = f.api.createBoardOperation(boardOperation('create_board'), remote, 'REPOSITORY', 'ACCOUNT', authorize, markSent);

    await vi.waitFor(() => expect(authorize).toHaveBeenCalledOnce());
    monotonicNow = 60_000;
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(pending).resolves.toMatchObject({ state: 'unknown', reason: 'BOARD_CREATE_UNCONFIRMED', receipt: null });
    expect(f.runner).toHaveBeenCalledOnce();
    expect(f.mutations()).toBe(0);
    expect(markSent).not.toHaveBeenCalled();

    if (outcome === 'resolve') authorization.resolve();
    else authorization.reject(new Error('late authorization rejection'));
    await Promise.resolve();
    expect(f.runner).toHaveBeenCalledOnce();
    expect(f.mutations()).toBe(0);
  });

  it('reuses a shorter enclosing turn for board reads and refuses its nested mutation', async () => {
    const f = fixture();
    let result: Awaited<ReturnType<typeof f.api.createBoardOperation>> | undefined;
    let deadline: number | undefined;
    const outer = await f.reader.query('query OuterAuthorization', {}, undefined, 1, {
      deadlineMonotonicMs: 7_000,
      beforeSend: async () => {
        result = await f.api.createBoardOperation(boardOperation('create_board'), remote, 'REPOSITORY', 'ACCOUNT', async context => {
          deadline = context?.deadlineMonotonicMs;
        }, () => {});
        throw new Error('stop outer request before dispatch');
      },
    });

    expect(outer.diagnostics[0]?.code).toBe('QUERY_FAILED');
    expect(result).toMatchObject({ state: 'unknown', reason: 'BOARD_CREATE_UNCONFIRMED' });
    expect(deadline).toBeUndefined();
    expect(f.mutations()).toBe(0);
    expect(f.runner.mock.calls.every(call => call[3]?.deadlineMonotonicMs === 7_000)).toBe(true);
  });

  it('waits for shared admission before board authorization and sends one mutation', async () => {
    const f = fixture();
    const original = f.runner.getMockImplementation()!;
    const queryOrder: string[] = [];
    const blockers = new Map<string, ReturnType<typeof deferred<CommandResponse>>>();
    const filler = deferred<CommandResponse>();
    const fillerStarted = deferred<void>();
    const authorizationStarted = deferred<void>();
    const authorizationRelease = deferred<void>();
    const generic = httpResponse({ viewer: { id: 'ACCOUNT' } });
    f.runner.mockImplementation((raw,onSend,responseBytes,control) => {
      const query = (JSON.parse(raw) as { query: string }).query;
      queryOrder.push(query);
      const blocker = blockers.get(query);
      if (blocker) { onSend?.(); return blocker.promise; }
      if (query === 'query AdmissionFiller') { fillerStarted.resolve(); onSend?.(); return filler.promise; }
      if (query.includes('FactoryCreationBoards')) void f.reader.query('query AdmissionFiller',{});
      return original(raw,onSend,responseBytes,control);
    });
    const occupied = ['One','Two','Three'].map(name => {
      const query = `query AdmissionBlocker${name}`;
      const reply = deferred<CommandResponse>();
      blockers.set(query,reply);
      return f.reader.query(query,{});
    });
    const authorize = vi.fn(async () => { authorizationStarted.resolve(); await authorizationRelease.promise; });
    const operation = f.api.createBoardOperation(boardOperation('create_board'),remote,'REPOSITORY','ACCOUNT',authorize,() => {});
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
    expect(queryOrder.filter(query => query.includes('mutation FactoryCreateBoard'))).toHaveLength(1);

    blockers.get('query AdmissionBlockerThree')?.resolve(generic);
    filler.resolve(generic);
    await Promise.all(occupied);
  });

  it('expires board authorization after a saturated FIFO grant without sending or replaying', async () => {
    vi.useFakeTimers();
    try {
      let monotonicNow = 0;
      const f = fixture(null,true,false,true,() => monotonicNow);
      const original = f.runner.getMockImplementation()!;
      const blockers = new Map<string,{ reply: ReturnType<typeof deferred<CommandResponse>>; close(): void }>();
      const queries: string[] = [];
      f.runner.mockImplementation((raw,onSend,responseBytes,control) => {
        const query = (JSON.parse(raw) as { query: string }).query;
        queries.push(query);
        if (!query.includes('query AdmissionBlocker')) return original(raw,onSend,responseBytes,control);
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
        blockers.set(query,{ reply,close: () => { physicallyClosed = true; resolveClose(); reply.resolve(httpResponse({ viewer: { id: 'ACCOUNT' } })); } });
        return reply.promise;
      });
      const occupied = ['One','Two','Three'].map(name => f.reader.query(`query AdmissionBlocker${name}`,{}));
      await flushMicrotasks();
      expect(blockers.size).toBe(3);

      const authorization = deferred<void>();
      const authorizationStarted = deferred<void>();
      let authorizationDeadline: number | undefined;
      const markSent = vi.fn();
      const operation = f.api.createBoardOperation(boardOperation('create_board'),remote,'REPOSITORY','ACCOUNT',context => {
        authorizationDeadline = context?.deadlineMonotonicMs;
        authorizationStarted.resolve();
        return authorization.promise;
      },markSent);
      monotonicNow = 5_000;
      blockers.get('query AdmissionBlockerOne')?.close();
      await vi.advanceTimersByTimeAsync(5_000);
      await authorizationStarted.promise;
      expect(authorizationDeadline).toBe(65_000);

      monotonicNow = 65_000;
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(operation).resolves.toMatchObject({ state: 'unknown',reason: 'BOARD_CREATE_UNCONFIRMED' });
      authorization.resolve();
      await flushMicrotasks();
      expect(queries.some(query => query.includes('mutation FactoryCreateBoard'))).toBe(false);
      expect(markSent).not.toHaveBeenCalled();
      expect(f.mutations()).toBe(0);

      blockers.get('query AdmissionBlockerTwo')?.close();
      blockers.get('query AdmissionBlockerThree')?.close();
      await Promise.all(occupied);
    } finally { vi.useRealTimers(); }
  });

  it('cancels board authorization after a saturated FIFO grant without sending or replaying', async () => {
    vi.useFakeTimers();
    const tracked = trackAbortControllers();
    try {
      let monotonicNow = 0;
      const f = fixture(null,true,false,true,() => monotonicNow);
      const original = f.runner.getMockImplementation()!;
      const blockers = new Map<string,ReturnType<typeof deferred<CommandResponse>>>();
      const queries: string[] = [];
      f.runner.mockImplementation((raw,onSend,responseBytes,control) => {
        const query = (JSON.parse(raw) as { query: string }).query;
        queries.push(query);
        if (!query.includes('query AdmissionBlocker')) return original(raw,onSend,responseBytes,control);
        const reply = deferred<CommandResponse>();
        onSend?.();
        blockers.set(query,reply);
        return reply.promise;
      });
      const occupied = ['One','Two','Three'].map(name => f.reader.query(`query AdmissionBlocker${name}`,{}));
      await flushMicrotasks();
      const authorize = vi.fn(async () => {});
      const cancelled = f.api.createBoardOperation(boardOperation('create_board'),remote,'REPOSITORY','ACCOUNT',authorize,() => {});
      expect(tracked.controllers).toHaveLength(4);
      tracked.controllers[3]?.abort();

      await expect(cancelled).resolves.toMatchObject({ state: 'unknown',reason: 'BOARD_OWNER_READ_INCOMPLETE' });
      expect(authorize).not.toHaveBeenCalled();
      expect(queries.some(query => query.includes('mutation FactoryCreateBoard'))).toBe(false);
      expect(f.mutations()).toBe(0);
      blockers.get('query AdmissionBlockerOne')?.resolve(httpResponse({ viewer: { id: 'ACCOUNT' } }));
      blockers.get('query AdmissionBlockerTwo')?.resolve(httpResponse({ viewer: { id: 'ACCOUNT' } }));
      blockers.get('query AdmissionBlockerThree')?.resolve(httpResponse({ viewer: { id: 'ACCOUNT' } }));
      await Promise.all(occupied);
    } finally { tracked.restore(); vi.useRealTimers(); }
  });

  it('cancels a dependent authorization read and ignores its late completion', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const controller = new AbortController();
    const original = f.runner.getMockImplementation()!;
    const authorizationReadStarted = deferred<void>();
    let finishLateRead: (() => void) | undefined;
    f.runner.mockImplementation(raw => {
      const request = JSON.parse(raw) as { query: string };
      if (request.query === 'query AuthorizationContext') {
        authorizationReadStarted.resolve();
        return new Promise(resolve => { finishLateRead = () => resolve(httpResponse({ viewer: { id: 'ACCOUNT' } })); });
      }
      return original(raw);
    });
    const outer = f.reader.query('query OuterAuthorization', {}, undefined, 1, {
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
});
