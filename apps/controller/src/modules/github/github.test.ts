import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { GitHubQueryResult, IssueContext, type GitHubAccount, type GitHubProjectDetails, type ProjectItem } from '#contracts';
import { assessIssueReadiness, createClient } from './client.js';
import { createGitHub } from './index.js';
import { GraphQLReader, collect, result, type CommandResponse, type GhRunner } from './transport.js';

const account = { id: 'U_900719925474099312345', login: 'operator' };
const wireRepository = { id: 'R_1', name: 'actual-repo', owner: account, url: 'https://github.com/operator/actual-repo', defaultBranchRef: { name: 'main' }, isPrivate: true, isArchived: false };
const wireProject = { id: 'PVT_1', number: 5, title: 'Work', url: 'https://github.com/users/operator/projects/5', closed: false, owner: { ...account, __typename: 'User' } };
const page = (nodes: unknown[], cursor: string | null = null) => ({ nodes, pageInfo: { hasNextPage: cursor !== null, endCursor: cursor } });
function http(body: unknown, status = 200, headers: Record<string, string> = {}, exitCode = 0): CommandResponse {
  return { exitCode, stdout: `HTTP/2.0 ${status} Response\r\ncontent-type: application/json\r\n${Object.entries(headers).map(([key, value]) => `${key}: ${value}\r\n`).join('')}\r\n${JSON.stringify(body)}` };
}
function fixture(responses: CommandResponse[]) {
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  const run: GhRunner = async (input) => {
    const request: { query: string; variables: Record<string, unknown> } = JSON.parse(input);
    calls.push(request);
    const response = responses.shift();
    if (!response) throw new Error('Unexpected query');
    return response;
  };
  return { client: createClient(new GraphQLReader(run)), calls };
}

describe('GitHub identity and query diagnostics', () => {
  it('groups queue field pages by identity, retaining independent cursors, values and failures', async () => {
    const header = http({ data: { node: { __typename: 'Issue', id: 'I_group', number: 17, title: 'Title', state: 'OPEN', url: 'https://github.com/operator/actual-repo/issues/17', repository: wireRepository } } });
    const ids = ['item-a', 'item-b', 'item-c'];
    const prefix = () => [header, http({ data: { node: { assignees: page([]) } } }), http({ data: { node: { blockedBy: page([]) } } }),
      http({ data: { node: { projectItems: page(ids.map(id => ({ id, isArchived: false, project: { id: 'PVT_1' } }))) } } })];
    const value = (id: string) => ({ __typename: 'ProjectV2ItemFieldNumberValue', id, number: 7, field: { id: 'number' } });
    const nodes = ids.map(id => ({ id, __typename: 'ProjectV2Item', fieldValues: page([value(id)], `${id}-cursor`) }));
    const valid = fixture([...prefix(), http({ data: { nodes: [...nodes].reverse() } }), ...ids.map(id => http({ data: { node: { fieldValues: page([value(`${id}-next`)]) } } }))]);
    const response = await valid.client.getIssueContextById('I_group', { purpose: 'queue' });
    expect(response.state).toBe('complete');
    expect((response.data as IssueContext).memberships.map(m => [m.itemId, m.numberValues?.length])).toEqual(ids.map(id => [id, 2]));
    expect(valid.calls.slice(5).map(call => call.variables)).toEqual(ids.map(id => ({ id, cursor: `${id}-cursor` })));
    for (const broken of [null, { ...nodes[1], id: 'item-a' }, { ...nodes[1], __typename: 'Issue' }]) {
      const failed = fixture([...prefix(), http({ data: { nodes: [nodes[0], broken, nodes[2]] } }), http({ data: { node: { fieldValues: page([]) } } }), http({ data: { node: { fieldValues: page([]) } } })]);
      expect(await failed.client.getIssueContextById('I_group', { purpose: 'queue' })).toMatchObject({ state: 'partial', diagnostics: [{ code: 'RESPONSE_INVALID' }] });
    }
    const partial = fixture([...prefix(), http({ data: { nodes }, errors: [{ type: 'FORBIDDEN' }] })]);
    expect(await partial.client.getIssueContextById('I_group', { purpose: 'queue' })).toMatchObject({ state: 'partial', diagnostics: [{ code: 'REFERENCE_INACCESSIBLE' }] });
    expect(partial.calls).toHaveLength(5);
    const continuationFailure = fixture([...prefix(), http({ data: { nodes } }), http({}, 403), http({ data: { node: { fieldValues: page([]) } } }), http({ data: { node: { fieldValues: page([]) } } })]);
    expect(await continuationFailure.client.getIssueContextById('I_group', { purpose: 'queue' })).toMatchObject({ state: 'partial', diagnostics: [{ code: 'ACCESS_DENIED' }] });
  });
  it('resolves an issue by exact textual node ID and verifies the identity after the full query', async () => {
    const header = http({ data: { node: { __typename: 'Issue', id: 'I_exact', number: 17, repository: { name: wireRepository.name, owner: { login: account.login } } } } });
    const issue = (id: string) => http({ data: { repository: { issueOrPullRequest: { __typename: 'Issue', id, number: 17, title: 'Title', body: 'Goal', state: 'OPEN', url: 'https://github.com/operator/actual-repo/issues/17', repository: wireRepository } } } });
    const parts = () => ['assignees', 'comments', 'blockedBy', 'projectItems'].map((key) => http({ data: { node: { [key]: page([]) } } }));
    const valid = fixture([header, issue('I_exact'), ...parts()]);
    expect(await valid.client.getIssueContextById('I_exact')).toMatchObject({ state: 'complete', data: { id: 'I_exact', number: 17 } });
    expect(valid.calls[0]?.variables).toEqual({ id: 'I_exact' });
    expect(valid.calls[1]?.variables).toEqual({ owner: account.login, name: wireRepository.name, number: 17 });
    const changed = fixture([header, issue('I_changed'), ...parts()]);
    expect(await changed.client.getIssueContextById('I_exact')).toMatchObject({ state: 'unavailable', data: null, diagnostics: [{ code: 'RESPONSE_INVALID' }] });
  });
  it('rejects inaccessible or non-issue node identities without querying another issue', async () => {
    for (const node of [null, { __typename: 'PullRequest', id: 'PR_test' }, { __typename: 'DraftIssue', id: 'D_test' }]) {
      const f = fixture([http({ data: { node } })]);
      const response = await f.client.getIssueContextById('I_test'); expect(response.data).toBeNull(); expect(response.state).not.toBe('complete'); expect(f.calls).toHaveLength(1);
    }
  });
  it('does not invent an identity or start a process without keyring context', async () => {
    const response = await createGitHub().getIdentity();
    expect(response).toMatchObject({ state: 'context_unavailable', data: null, diagnostics: [{ code: 'CONTEXT_UNAVAILABLE' }] });
  });
  it('keeps external IDs textual, including IDs larger than safe integers', async () => {
    const { client } = fixture([http({ data: { viewer: account } })]);
    expect(await client.getIdentity()).toMatchObject({ state: 'complete', data: account });
    const bad = fixture([http({ data: { viewer: { ...account, id: 123 } } })]);
    expect((await bad.client.getIdentity()).state).toBe('unavailable');
  });
  it.each([http({}, 401), { exitCode: 4, stdout: 'private auth diagnostics' }])('reports invalid authentication without raw output', async (response) => {
    const { client } = fixture([response]);
    const observed = await client.getIdentity();
    expect(observed).toMatchObject({ state: 'authentication_invalid', data: null });
    expect(JSON.stringify(observed)).not.toContain('private');
  });
  it('preserves GraphQL partial data and does not turn inaccessible identity into a demo account', async () => {
    const { client } = fixture([http({ data: { viewer: account }, errors: [{ type: 'FORBIDDEN', message: 'synthetic-secret' }] }), http({ data: { viewer: null } })]);
    const response = await client.getIdentity();
    expect(response.state).toBe('partial');
    expect(response.data).toEqual(account);
    expect(JSON.stringify(response)).not.toContain('synthetic-secret');
    expect(await client.getIdentity()).toMatchObject({ state: 'inaccessible', data: null });
  });
  it.each([
    [429, { 'retry-after': '120' }, {}, 121000],
    [403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '200' }, {}, 200000],
    [200, {}, { errors: [{ type: 'RATE_LIMITED' }], data: { rateLimit: { resetAt: '1970-01-01T00:03:00.000Z' } } }, 180000],
    [429, { 'retry-after': 'Thu, 01 Jan 1970 00:04:00 GMT' }, {}, 240000],
  ] as const)('honors delay/reset and avoids another query before the deadline', async (status, headers, body, expected) => {
    let now = 1000;
    let calls = 0;
    const reader = new GraphQLReader(async () => { calls++; return calls === 1 ? http(body, status, headers) : http({ data: { viewer: account } }); }, () => now);
    expect(await reader.query('query { viewer { id } }', {})).toMatchObject({ state: 'rate_limited', retryAtMs: expected });
    expect((await reader.query('query { viewer { id } }', {})).state).toBe('rate_limited');
    expect(calls).toBe(1);
    now = expected;
    expect((await reader.query('query { viewer { id } }', {})).state).toBe('complete');
    expect(calls).toBe(2);
  });
  it('uses the longest rate hint and a finite fallback for secondary limits', async () => {
    const reader = new GraphQLReader(async () => http({}, 403, { 'retry-after': '2', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '90' }), () => 1000);
    expect((await reader.query('query { viewer { id } }', {})).retryAtMs).toBe(90000);
    const fallback = new GraphQLReader(async () => http({}, 429), () => 1000);
    expect((await fallback.query('query { viewer { id } }', {})).retryAtMs).toBe(61000);
  });
  it('shares cooldown between query scopes and bounds the total queries and bytes of an operation', async () => {
    let requests = 0;
    const root = new GraphQLReader(async () => { requests++; return http({}, 429, { 'retry-after': '120' }); }, () => 1000);
    await root.scope().query('query One', {});
    expect((await root.scope().query('query Two', {})).state).toBe('rate_limited');
    expect(requests).toBe(1);
    const budget = new GraphQLReader(async () => http({ data: { viewer: account } }), () => 1000, { retryAtMs: 0 }, { queries: 1, bytes: 10000 });
    expect((await budget.query('query One', {})).state).toBe('complete');
    expect(await budget.query('query Two', {})).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_LIMIT' }] });
    const bytes = new GraphQLReader(async () => http({ data: { viewer: account } }), () => 1000, { retryAtMs: 0 }, { queries: 2, bytes: 1 });
    expect(await bytes.query('query One', {})).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_LIMIT' }] });
  });
  it('honors HTTP rate-limit headers even if the error body is malformed', async () => {
    const reader = new GraphQLReader(async () => http({ errors: [null], data: [] }, 429, { 'retry-after': '120' }), () => 1000);
    expect(await reader.query('query One', {})).toMatchObject({ state: 'rate_limited', retryAtMs: 121000 });
  });
  it.each([http({}, 403), http({}, 404), http({}, 503), { exitCode: 0, stdout: 'not JSON' }, http({ data: { viewer: {} } })])('fails closed on forbidden, missing, malformed and server responses', async (response) => {
    expect((await fixture([response]).client.getIdentity()).state).not.toBe('complete');
  });
});

describe('complete repository and Project queries', () => {
  it('reads numeric field definitions on later pages and retains documented item positions across pages', async () => {
    const f = fixture([
      http({ data: { node: { ...wireProject, __typename: 'ProjectV2' } } }),
      http({ data: { node: { fields: page([], 'fields2') } } }),
      http({ data: { node: { fields: page([{ __typename: 'ProjectV2Field', id: 'PRIORITY', name: 'Priority', dataType: 'NUMBER' }]) } } }),
      http({ data: { node: { items: page([{ id: 'ITEM9', isArchived: false, content: { __typename: 'Issue', id: 'I9', title: 'Ninth', url: 'https://github.com/o/r/issues/9' } }], 'items2') } } }),
      http({ data: { node: { items: page([{ id: 'ITEM1', isArchived: false, content: { __typename: 'Issue', id: 'I1', title: 'First', url: 'https://github.com/o/r/issues/1' } }]) } } }),
    ]);
    expect(await f.client.getProject('PVT_1')).toMatchObject({ state: 'complete', data: { numberFields: [{ id: 'PRIORITY', name: 'Priority' }] } });
    expect((await f.client.listProjectItems('PVT_1')).data?.map((item) => [item.id, item.position])).toEqual([['ITEM9', 1], ['ITEM1', 2]]);
    expect(f.calls[3]?.query).toContain('orderBy:{field:POSITION,direction:ASC}');
    expect(f.calls[4]?.variables.cursor).toBe('items2');
  });
  it.each(['User', 'Organization'])('resolves a Project owner by exact node ID for %s', async (kind) => {
    const { client, calls } = fixture([http({ data: { node: { __typename: kind, ...account } } })]);
    expect(await client.getProjectOwner(account.id)).toMatchObject({ state: 'complete', data: { ...account, kind: kind === 'User' ? 'user' : 'organization' } });
    expect(calls[0]?.variables).toEqual({ id: account.id });
    expect(calls[0]?.query).toContain('node(id:$id)');
  });
  it('does not treat inaccessible or wrong-type owners as complete configuration options', async () => {
    const missing = fixture([http({ data: { node: null } })]); expect((await missing.client.getProjectOwner(account.id)).state).toBe('inaccessible');
    const wrong = fixture([http({ data: { node: { __typename: 'Repository', ...account } } })]); expect((await wrong.client.getProjectOwner(account.id)).state).toBe('unavailable');
  });
  it('follows every repository cursor and resolves actual remote identity and selected branch', async () => {
    const { client, calls } = fixture([
      http({ data: { viewer: { repositories: page([wireRepository], 'page2') } } }),
      http({ data: { viewer: { repositories: page([{ ...wireRepository, id: 'R_2', name: 'second' }]) } } }),
      http({ data: { repository: wireRepository } }),
      http({ data: { repository: { id: 'R_1', ref: { name: 'release/v1', target: { oid: 'a'.repeat(40) } } } } }),
      http({ data: { repository: { id: 'R_1', ref: null } } }),
    ]);
    const list = await client.listRepositories();
    expect(list).toMatchObject({ state: 'complete', data: [{ id: 'R_1' }, { id: 'R_2' }] });
    expect(calls[1]?.variables.cursor).toBe('page2');
    expect(await client.getRepository({ owner: 'operator', name: 'alias' })).toMatchObject({ state: 'complete', data: { name: 'actual-repo' } });
    expect(await client.resolveBranch({ owner: 'operator', name: 'actual-repo' }, 'release/v1')).toMatchObject({ state: 'complete', data: { sha: 'a'.repeat(40) } });
    expect(calls[3]?.variables.qualifiedName).toBe('refs/heads/release/v1');
    expect(await client.resolveBranch({ owner: 'operator', name: 'actual-repo' }, 'missing')).toMatchObject({ state: 'inaccessible', diagnostics: [{ code: 'BRANCH_NOT_FOUND' }] });
    expect(calls.every((call) => call.query.startsWith('query ') && !call.query.includes('mutation'))).toBe(true);
  });
  it.each(['--help', '../main', 'a..b', 'a b', 'a.lock', 'a//b', 'a@{b', 'a\\b', '', 'a[1]'])('rejects invalid branch input before GH: %s', async (branch) => {
    const { client, calls } = fixture([]);
    expect((await client.resolveBranch({ owner: 'operator', name: 'repo' }, branch)).state).toBe('invalid_input');
    expect(calls).toHaveLength(0);
  });
  it('reports null nodes and interrupted pagination as partial, preserving earlier pages', async () => {
    const { client } = fixture([http({ data: { viewer: { repositories: page([wireRepository, null], 'next') } } }), http({}, 401)]);
    expect(await client.listRepositories()).toMatchObject({ state: 'partial', data: [{ id: 'R_1' }], diagnostics: [{ code: 'REFERENCE_INACCESSIBLE' }, { code: 'AUTHENTICATION_INVALID' }] });
  });
  it('rejects repeated cursors, duplicate objects, malformed pages and page budget exhaustion', async () => {
    const repeated = fixture([http({ data: { viewer: { repositories: page([wireRepository], 'repeat') } } }), http({ data: { viewer: { repositories: page([wireRepository], 'repeat') } } })]);
    expect(await repeated.client.listRepositories()).toMatchObject({ state: 'partial', diagnostics: [{ code: 'PAGINATION_INVALID' }] });
    let requests = 0;
    const limited = new GraphQLReader(async () => { requests++; return http({ data: { connection: page([{ id: `R_${requests}` }], `c${requests}`) } }); });
    expect(await collect(limited, 'query Limited', {}, (data) => data.connection, (node) => node.id)).toMatchObject({ state: 'partial', diagnostics: [{ code: 'QUERY_LIMIT' }] });
    expect(requests).toBe(100);
    const malformed = fixture([http({ data: { viewer: { repositories: { nodes: [wireRepository], pageInfo: {} } } } })]);
    expect((await malformed.client.listRepositories()).state).toBe('partial');
  });
  it.each(['user', 'organization'] as const)('lists accessible %s Projects without fixed owners', async (kind) => {
    const { client, calls } = fixture([http({ data: { [kind]: { projectsV2: page([wireProject], 'p2') } } }), http({ data: { [kind]: { projectsV2: page([{ ...wireProject, id: 'PVT_2' }]) } } })]);
    expect(await client.listProjects({ kind, login: 'another-owner' })).toMatchObject({ state: 'complete', data: [{ id: 'PVT_1' }, { id: 'PVT_2' }] });
    expect(calls[0]?.variables.login).toBe('another-owner');
    expect(calls[1]?.variables.cursor).toBe('p2');
  });
  it('loads all field pages and validates V3 Status names, order and option identity', async () => {
    const names = ['Backlog', 'Ready', 'In progress', 'In review', 'Done'];
    const ids = ['BACKLOG', 'READY', 'PROGRESS', 'REVIEW', 'DONE'];
    const responses = (options = names.map((name, index) => ({ id: ids[index]!, name })), fieldName = 'Status') => [
      http({ data: { node: { ...wireProject, __typename: 'ProjectV2' } } }),
      http({ data: { node: { fields: page([{ id: 'F_TEXT', __typename: 'ProjectV2Field' }], 'f2') } } }),
      http({ data: { node: { fields: page([{ id: 'F_STATUS', name: fieldName, __typename: 'ProjectV2SingleSelectField', options }]) } } }),
    ];
    const selection = { id: 'PVT_1', statusFieldId: 'F_STATUS', statusOptionIds: ids };
    const good = await fixture(responses()).client.validateProjectSelection(selection);
    expect(good.state).toBe('complete');
    expect(good.data?.singleSelectFields[0]).toMatchObject({ id: 'F_STATUS', options: names.map((name, index) => ({ id: ids[index], name })) });
    const wrongName = await fixture(responses(names.map((name, index) => ({ id: ids[index]!, name: index === 0 ? 'Icebox' : name })))).client.validateProjectSelection(selection);
    expect(wrongName).toMatchObject({ state: 'partial', diagnostics: [{ code: 'STATUS_MAPPING_INCOMPATIBLE' }] });
    const wrongOrder = await fixture(responses([...names].reverse().map((name) => ({ id: ids[names.indexOf(name)]!, name })))).client.validateProjectSelection(selection);
    expect(wrongOrder).toMatchObject({ state: 'partial', diagnostics: [{ code: 'STATUS_MAPPING_INCOMPATIBLE' }] });
    const wrongLink = await fixture(responses(names.map((name, index) => ({ id: ids[(index + 1) % ids.length]!, name })))).client.validateProjectSelection(selection);
    expect(wrongLink).toMatchObject({ state: 'partial', diagnostics: [{ code: 'STATUS_MAPPING_INCOMPATIBLE' }] });
    const wrongField = await fixture(responses(undefined, 'Custom status')).client.validateProjectSelection(selection);
    expect(wrongField).toMatchObject({ state: 'partial', diagnostics: [{ code: 'STATUS_MAPPING_INCOMPATIBLE' }] });
    expect(await fixture(responses()).client.validateProjectSelection({ id: 'PVT_1', statusFieldId: 'old-field', statusOptionIds: ids })).toMatchObject({ state: 'partial', diagnostics: [{ code: 'STATUS_FIELD_INACCESSIBLE' }] });
    expect(await fixture(responses()).client.validateProjectSelection({ ...selection, statusOptionIds: ['BACKLOG', 'READY', 'PROGRESS', 'REVIEW', 'old-option'] })).toMatchObject({ state: 'partial', diagnostics: [{ code: 'STATUS_OPTION_INACCESSIBLE' }] });
    expect(await fixture([http({ data: { node: null } })]).client.getProject('PVT_MISSING')).toMatchObject({ state: 'inaccessible', data: null });
  });
  it('keeps PR, draft and inaccessible cards explicitly non-executable', async () => {
    const { client } = fixture([http({ data: { node: { items: page([
      { id: 'ITEM1', isArchived: false, content: { __typename: 'PullRequest', id: 'PR1', title: 'PR', url: 'https://github.com/o/r/pull/1' } },
      { id: 'ITEM2', isArchived: false, content: { __typename: 'DraftIssue', id: 'D1', title: 'Draft' } },
      { id: 'ITEM3', isArchived: false, content: null },
    ]) } } })]);
    const response = await client.listProjectItems('PVT_1');
    expect(response.state).toBe('partial');
    expect(response.data?.map((item) => [item.kind, item.executable])).toEqual([['pull_request', false], ['draft', false], ['inaccessible', false]]);
  });
});

function issueResponses() {
  return [
    http({ data: { repository: { issueOrPullRequest: { __typename: 'Issue', id: 'I_1', number: 1, title: 'Implement', body: '## Critérios de aceite\n- Works\nSee #2 and https://example.org/spec', url: 'https://github.com/operator/actual-repo/issues/1', state: 'OPEN', repository: wireRepository } } } }),
    http({ data: { node: { assignees: page([account], 'a2') } } }),
    http({ data: { node: { assignees: page([{ id: 'U_OTHER', login: 'other' }]) } } }),
    http({ data: { node: { comments: page([{ id: 'C1', body: 'Refer owner/repo#3', url: 'https://github.com/o/r/issues/1#issuecomment-1', author: null, updatedAt: '2026-10-16T00:00:00Z' }], 'c2') } } }),
    http({ data: { node: { comments: page([{ id: 'C2', body: 'Contexto português 😀', url: 'https://github.com/o/r/issues/1#issuecomment-2', author: { login: 'operator' }, updatedAt: '2026-10-16T01:00:00Z' }]) } } }),
    http({ data: { node: { blockedBy: page([{ id: 'I2', number: 2, title: 'Dependency', url: 'https://github.com/o/r/issues/2', state: 'OPEN' }], 'b2') } } }),
    http({ data: { node: { blockedBy: page([{ id: 'I3', number: 3, title: 'Done dependency', url: 'https://github.com/o/r/issues/3', state: 'CLOSED' }]) } } }),
    http({ data: { node: { projectItems: page([{ id: 'ITEM', isArchived: false, project: { id: 'PVT_1' } }], 'p2') } } }),
    http({ data: { node: { projectItems: page([]) } } }),
    http({ data: { node: { fieldValues: page([{ __typename: 'ProjectV2ItemFieldLabelValue' }], 'v2') } } }),
    http({ data: { node: { fieldValues: page([{ id: 'V_STATUS', __typename: 'ProjectV2ItemFieldSingleSelectValue', field: { id: 'F_STATUS' }, name: 'Pronto', optionId: 'READY' }]) } } }),
  ];
}
describe('issue preparation context', () => {
  it('reads queue eligibility without fetching comments or references, retaining nested pagination', async () => {
    const responses = issueResponses();
    responses.splice(3, 2);
    responses.shift();
    const header = http({ data: { node: { __typename: 'Issue', id: 'I_1', number: 1, title: 'Implement', state: 'OPEN', url: 'https://github.com/operator/actual-repo/issues/1', repository: wireRepository } } });
    const { client, calls } = fixture([header, ...responses]);
    const response = await client.getIssueContextById('I_1', { purpose: 'queue' });
    expect(response).toMatchObject({ state: 'complete', data: { id: 'I_1', comments: [], references: [], blockers: [{ state: 'OPEN' }, { state: 'CLOSED' }], memberships: [{ statusValues: [{ optionId: 'READY' }] }] } });
    expect(calls.some(call => call.query.includes('FactoryComments'))).toBe(false);
  });
  it('reads numeric priority values by exact field ID on independent field-value pages', async () => {
    const responses = issueResponses();
    responses[9] = http({ data: { node: { fieldValues: page([
      { id: 'V_PRIORITY', __typename: 'ProjectV2ItemFieldNumberValue', field: { id: 'PRIORITY' }, number: 0 },
    ], 'v2') } } });
    const f = fixture(responses);
    expect(await f.client.getIssueContext({ owner: 'operator', name: 'actual-repo', number: 1 })).toMatchObject({ state: 'complete', data: {
      memberships: [{ numberValues: [{ fieldId: 'PRIORITY', value: 0 }], statusValues: [{ fieldId: 'F_STATUS', optionId: 'READY' }] }],
    } });
    expect(f.calls[9]?.query).toContain('ProjectV2ItemFieldNumberValue');
  });
  it('loads all nested pages, body, comments, references, assignees, blockers and Status IDs', async () => {
    const { client, calls } = fixture(issueResponses());
    const response = await client.getIssueContext({ owner: 'operator', name: 'actual-repo', number: 1 });
    expect(response.state).toBe('complete');
    expect(Value.Check(GitHubQueryResult(IssueContext), response)).toBe(true);
    expect(response.data).toMatchObject({ id: 'I_1', assignees: [account, { id: 'U_OTHER' }], comments: [{ id: 'C1' }, { id: 'C2', body: 'Contexto português 😀' }], blockers: [{ state: 'OPEN' }, { state: 'CLOSED' }], memberships: [{ projectId: 'PVT_1', statusValues: [{ fieldId: 'F_STATUS', optionId: 'READY' }] }], references: ['#2', 'https://example.org/spec', 'owner/repo#3'] });
    expect(calls.map((call) => call.variables.cursor).filter(Boolean)).toEqual(['a2', 'c2', 'b2', 'p2', 'v2']);
    expect(calls.every((call) => call.query.startsWith('query '))).toBe(true);
  });
  it('marks missing nested dependencies as partial and never claims readiness', async () => {
    const responses = issueResponses();
    responses[5] = http({ data: { node: { blockedBy: null } }, errors: [{ type: 'FORBIDDEN', message: 'private' }] });
    // The second blocker page is no longer requested after the incomplete first page.
    responses.splice(6, 1);
    expect((await fixture(responses).client.getIssueContext({ owner: 'operator', name: 'actual-repo', number: 1 })).state).toBe('partial');
  });
  it('returns a PR context as non-executable without querying Issue-only fields', async () => {
    const { client, calls } = fixture([http({ data: { repository: { issueOrPullRequest: { __typename: 'PullRequest', id: 'PR1', number: 3, title: 'PR', url: 'https://github.com/o/r/pull/3' } } } })]);
    expect(await client.getIssueContext({ owner: 'operator', name: 'actual-repo', number: 3 })).toMatchObject({ state: 'complete', data: { kind: 'pull_request', executable: false } });
    expect(calls).toHaveLength(1);
  });
  it('assesses exact account/repository/Project/Status/assignees and closed blockers', async () => {
    const response = await fixture(issueResponses()).client.getIssueContext({ owner: 'operator', name: 'actual-repo', number: 1 });
    if (!response.data || !('repository' in response.data)) throw new Error('Fixture invalid');
    const details: GitHubProjectDetails = { project: { id: 'PVT_1', number: 5, title: 'Work', url: wireProject.url, closed: false, owner: { ...account, kind: 'user' } }, singleSelectFields: [{ id: 'F_STATUS', name: 'Custom', options: [{ id: 'READY', name: 'Pronto' }] }] };
    const input = { identity: result<GitHubAccount>('complete', account), issue: response, project: result('complete', details), expectedAccountId: account.id, repositoryId: 'R_1', projectId: 'PVT_1', statusFieldId: 'F_STATUS', readyOptionId: 'READY' };
    expect(assessIssueReadiness(input)).toEqual({ eligible: false, reasons: ['ASSIGNEE_MISMATCH', 'OPEN_BLOCKERS'] });
    const ready = { ...response.data, assignees: [account], blockers: response.data.blockers.filter((blocker) => blocker.state === 'CLOSED') };
    const good = { ...input, issue: result<IssueContext | ProjectItem>('complete', ready) };
    expect(assessIssueReadiness(good)).toEqual({ eligible: true, reasons: [] });
    expect(assessIssueReadiness({ ...good, expectedAccountId: 'OTHER' }).reasons).toContain('ACCOUNT_CHANGED');
    expect(assessIssueReadiness({ ...good, repositoryId: 'OTHER' }).reasons).toContain('REPOSITORY_MISMATCH');
    expect(assessIssueReadiness({ ...good, projectId: 'OTHER' }).reasons).toContain('PROJECT_MEMBERSHIP_MISSING');
    expect(assessIssueReadiness({ ...good, readyOptionId: 'OTHER' }).reasons).toContain('STATUS_MISMATCH');
    expect(assessIssueReadiness({ ...good, issue: { ...good.issue, state: 'partial' } }).reasons).toEqual(['READ_INCOMPLETE']);
  });
});
