import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { CreationBoardOperation, CreationBoardOperationKind } from '#contracts';
import { GraphQLReader, type GhRunner } from './transport.js';
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
function fixture(mode: string | null = null, groupByStatus = true, readyBoard = false, repositoryLinked = true) {
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
      const input = request.variables.input as { fieldId?: string; projectId?: string; name?: string; singleSelectOptions: Array<{ name: string }> };
      const submittedOptions = mode === 'wrong-order' ? [...input.singleSelectOptions].reverse() : input.singleSelectOptions;
      const observedOptions = submittedOptions.map((option, index) => ({ id: optionIds[index]!, name: option.name }));
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
  const api = createBoardOperations(new GraphQLReader(runner), authorization);
  return { api, runner, mutations: () => mutationCount, setViewer: (id: string) => { viewerId = id; } };
}

describe('GitHub Projects board operations', () => {
  it('observes Kanban columns through vertical grouping even when horizontal grouping is empty', async () => {
    const f = fixture(null, true, true);
    const result = await f.api.createBoardOperation(boardOperation('verify_board', expected('PROJECT', 'STATUS', 'VIEW')), remote, 'REPOSITORY', 'ACCOUNT', async () => {}, () => {});
    expect(result).toMatchObject({ state: 'confirmed', receipt: { group_by_field_ids: ['STATUS'] } });
    const snapshots = f.runner.mock.calls.map(([raw]) => (JSON.parse(raw) as { query: string }).query).filter(query => query.includes('FactoryCreationBoardSnapshot'));
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.every(query => query.includes('verticalGroupByFields(first:100)'))).toBe(true);
  });
  it('creates and reads back five ordered options, repository link, board layout and Status grouping', async () => {
    const f = fixture(); const authorize = vi.fn(async () => {}); let operation = boardOperation('create_board');
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
});
