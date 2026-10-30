import { Value } from '@sinclair/typebox/value';
import type { Static, TSchema } from '@sinclair/typebox';
import {
  GitHubAccount, GitHubBranch, GitHubProject, GitHubProjectDetails, GitHubRepository,
  GitHubId, GitHubIssueReference, GitHubProjectOwner, GitHubProjectSelection,
  IssueBlocker, IssueComment, IssueContext, IssueMembership, ProjectItem, RepositoryReference, StatusField,
  V3StatusMapping, type GitHubQueryResult,
} from '#contracts';
import { GraphQLReader, collect, object, result, string } from './transport.js';
import * as queries from './queries.js';

export function checked<T extends TSchema>(schema: T, value: unknown): Static<T> {
  if (!Value.Check(schema, value)) throw new Error('RESPONSE_INVALID');
  return value;
}
export function validBranch(branch: unknown): branch is string {
  return typeof branch === 'string' && branch.length > 0 && branch.length <= 1024 &&
    !/[\x00-\x20\x7f~^:?*\[\\]/.test(branch) && !branch.startsWith('-') && !branch.startsWith('/') &&
    !branch.endsWith('/') && !branch.endsWith('.') && !branch.includes('..') && !branch.includes('@{') &&
    branch !== '@' && branch.split('/').every((part) => part.length > 0 && !part.startsWith('.') && !part.endsWith('.lock'));
}
export function repository(node: unknown): GitHubRepository {
  const raw = object(node);
  return checked(GitHubRepository, {
    id: raw.id, owner: raw.owner, name: raw.name, url: raw.url, isArchived: raw.isArchived, isPrivate: raw.isPrivate,
    defaultBranch: raw.defaultBranchRef === null ? null : object(raw.defaultBranchRef).name,
  });
}
function project(node: unknown): GitHubProject {
  const raw = object(node);
  const owner = object(raw.owner);
  return checked(GitHubProject, { id: raw.id, number: raw.number, title: raw.title, url: raw.url, closed: raw.closed,
    owner: { id: owner.id, login: owner.login, kind: owner.__typename === 'User' ? 'user' : owner.__typename === 'Organization' ? 'organization' : null } });
}
function child(data: Record<string, unknown>, parent: string, key: string): unknown {
  return data[parent] === null ? null : object(data[parent])[key];
}
function invalid<T>(): GitHubQueryResult<T> { return result('invalid_input', null, ['INPUT_INVALID']); }
function inaccessible<T>(): GitHubQueryResult<T> { return result('inaccessible', null, ['NOT_FOUND_OR_INACCESSIBLE']); }
function mapResponse<T>(response: GitHubQueryResult<Record<string, unknown>>, select: (data: Record<string, unknown>) => unknown, decode: (value: unknown) => T): GitHubQueryResult<T> {
  if (!response.data) return { ...response, data: null };
  try {
    const value = select(response.data);
    if (value === null) return response.state === 'complete' ? inaccessible() : { ...response, data: null };
    return { ...response, data: decode(value) };
  } catch { return result('unavailable', null, ['RESPONSE_INVALID']); }
}
export type ProjectSelection = GitHubProjectSelection;
export type IssueReference = GitHubIssueReference;

export type IssueAuthorityContext = Pick<IssueContext, 'id' | 'state' | 'repository' | 'assignees' | 'blockers' | 'memberships'>;
export interface IssueCommentConfirmationContext {
  id: IssueContext['id'];
  repository: Pick<GitHubRepository, 'id'>;
  comments: IssueComment[];
}
export interface IssueStatusConfirmationContext {
  id: IssueContext['id'];
  repository: Pick<GitHubRepository, 'id'>;
  memberships: IssueMembership[];
}

function issueNodeById(response: GitHubQueryResult<Record<string, unknown>>, id: string): GitHubQueryResult<Record<string, unknown>> {
  if (!response.data) return { ...response, data: null };
  try {
    const raw = response.data.node === null ? null : object(response.data.node);
    if (raw === null) return response.state === 'complete' ? inaccessible() : { ...response, data: null };
    if (raw.__typename !== 'Issue' || raw.id !== id) return result('unavailable', null, ['RESPONSE_INVALID'], response.retryAtMs);
    checked(IssueContext.properties.id, raw.id);
    return { ...response, data: raw };
  } catch { return result('unavailable', null, ['RESPONSE_INVALID'], response.retryAtMs); }
}

function projectionResult<T>(data: T, parts: GitHubQueryResult<unknown>[]): GitHubQueryResult<T> {
  const codes = parts.flatMap((part) => part.diagnostics.map((entry) => entry.code));
  const retryAtMs = Math.max(0, ...parts.map((part) => part.retryAtMs ?? 0)) || null;
  const failureStates: GitHubQueryResult<unknown>['state'][] = ['authentication_invalid', 'context_unavailable', 'rate_limited', 'unavailable'];
  const failureCodes: Record<string, GitHubQueryResult<unknown>['state']> = {
    AUTHENTICATION_INVALID: 'authentication_invalid', CONTEXT_UNAVAILABLE: 'context_unavailable', RATE_LIMITED: 'rate_limited',
    CLI_UNAVAILABLE: 'unavailable', QUERY_FAILED: 'unavailable', QUERY_LIMIT: 'unavailable',
  };
  const state = failureStates.find((candidate) => parts.some((part) => part.state === candidate ||
    part.diagnostics.some(({ code }) => failureCodes[code] === candidate))) ??
    (parts.every((part) => part.state === 'complete') ? 'complete' : 'partial');
  return result(state, data, codes, retryAtMs);
}

function hasGlobalFailure(part: GitHubQueryResult<unknown>): boolean {
  return ['authentication_invalid', 'context_unavailable', 'rate_limited', 'unavailable'].includes(part.state) ||
    part.diagnostics.some(({ code }) => ['AUTHENTICATION_INVALID', 'CONTEXT_UNAVAILABLE', 'RATE_LIMITED', 'CLI_UNAVAILABLE', 'QUERY_FAILED', 'QUERY_LIMIT'].includes(code));
}

async function readMembershipsWithValues(reader: GraphQLReader, id: string,
  firstPage?: GitHubQueryResult<Record<string, unknown>>): Promise<{ memberships: IssueMembership[]; parts: GitHubQueryResult<unknown>[] }> {
  const memberships = await collect(reader, queries.membershipsQuery, { id }, (data) => child(data, 'node', 'projectItems'), (node) => checked(IssueMembership, {
    itemId: node.id, projectId: object(node.project).id, archived: node.isArchived, statusValues: [],
  }), undefined, firstPage);
  const parts: GitHubQueryResult<unknown>[] = [memberships];
  const populated: IssueMembership[] = [];
  if (hasGlobalFailure(memberships)) {
    return { memberships: (memberships.data ?? []).map((membership) => ({ ...membership, statusValues: [] })), parts };
  }
  for (const membership of memberships.data ?? []) {
    const fields = await collect(reader, queries.valuesQuery, { id: membership.itemId }, (data) => child(data, 'node', 'fieldValues'), (node) => {
      if (node.__typename !== 'ProjectV2ItemFieldSingleSelectValue') return null;
      return { kind: 'select' as const, field: checked(IssueMembership.properties.statusValues.items, {
        fieldId: object(node.field).id, optionId: node.optionId, name: node.name,
      }) };
    }, (node) => ['ProjectV2ItemFieldSingleSelectValue', 'ProjectV2ItemFieldNumberValue'].includes(String(node.__typename)) ? string(node.id) : null);
    parts.push(fields);
    populated.push({ ...membership, statusValues: (fields.data ?? []).flatMap((entry) => entry?.kind === 'select' ? [entry.field] : []) });
    if (hasGlobalFailure(fields)) break;
  }
  return { memberships: populated, parts };
}

async function readIssueAuthority(reader: GraphQLReader, id: string): Promise<GitHubQueryResult<IssueAuthorityContext>> {
  const response = await reader.query(queries.issueAuthorityQuery, { id });
  const header = issueNodeById(response, id);
  if (!header.data) return { ...header, data: null };
  let data: IssueAuthorityContext;
  try {
    data = {
      id: checked(IssueContext.properties.id, header.data.id),
      state: checked(IssueContext.properties.state, header.data.state),
      repository: repository(header.data.repository), assignees: [], blockers: [], memberships: [],
    };
  } catch { return result('unavailable', null, ['RESPONSE_INVALID'], response.retryAtMs); }
  const parts: GitHubQueryResult<unknown>[] = [header];
  if (hasGlobalFailure(header)) return projectionResult(data, parts);

  const assignees = await collect(reader, queries.assigneesQuery, { id }, (value) => child(value, 'node', 'assignees'), (node) => checked(GitHubAccount, node));
  parts.push(assignees);
  data.assignees = assignees.data ?? [];
  if (hasGlobalFailure(assignees)) return projectionResult(data, parts);

  const blockers = await collect(reader, queries.blockersQuery, { id }, (value) => child(value, 'node', 'blockedBy'), (node) => checked(IssueBlocker, node));
  parts.push(blockers);
  data.blockers = blockers.data ?? [];
  if (hasGlobalFailure(blockers)) return projectionResult(data, parts);

  const membershipResult = await readMembershipsWithValues(reader, id);
  parts.push(...membershipResult.parts);
  data.memberships = membershipResult.memberships;
  return projectionResult(data, parts);
}

async function readIssueCommentConfirmation(reader: GraphQLReader, id: string): Promise<GitHubQueryResult<IssueCommentConfirmationContext>> {
  const response = await reader.query(queries.issueCommentConfirmationQuery, { id });
  const header = issueNodeById(response, id);
  if (!header.data) return { ...header, data: null };
  let data: IssueCommentConfirmationContext;
  try {
    data = {
      id: checked(IssueContext.properties.id, header.data.id),
      repository: { id: checked(GitHubRepository.properties.id, object(header.data.repository).id) },
      comments: [],
    };
  } catch { return result('unavailable', null, ['RESPONSE_INVALID'], response.retryAtMs); }
  const comments = await collect(reader, queries.commentsQuery, { id }, (value) => child(value, 'node', 'comments'), (node) => checked(IssueComment, node), undefined, response);
  data.comments = comments.data ?? [];
  return projectionResult(data, [header, comments]);
}

async function readIssueStatusConfirmation(reader: GraphQLReader, id: string): Promise<GitHubQueryResult<IssueStatusConfirmationContext>> {
  const response = await reader.query(queries.issueStatusConfirmationQuery, { id });
  const header = issueNodeById(response, id);
  if (!header.data) return { ...header, data: null };
  let data: IssueStatusConfirmationContext;
  try {
    data = {
      id: checked(IssueContext.properties.id, header.data.id),
      repository: { id: checked(GitHubRepository.properties.id, object(header.data.repository).id) },
      memberships: [],
    };
  } catch { return result('unavailable', null, ['RESPONSE_INVALID'], response.retryAtMs); }
  if (hasGlobalFailure(header)) return projectionResult(data, [header]);
  const memberships = await readMembershipsWithValues(reader, id, response);
  data.memberships = memberships.memberships;
  return projectionResult(data, [header, ...memberships.parts]);
}

export function createClient(rootReader: GraphQLReader) {
  async function getProjectOwner(id: string): Promise<GitHubQueryResult<GitHubProject['owner']>> {
    if (!Value.Check(GitHubProject.properties.owner.properties.id, id)) return invalid();
    return mapResponse(await rootReader.scope().query(queries.projectOwnerQuery, { id }), (data) => data.node, (value) => {
      const raw = object(value);
      if (raw.id !== id) throw new Error('RESPONSE_INVALID');
      return checked(GitHubProject.properties.owner, { id: raw.id, login: raw.login, kind: raw.__typename === 'User' ? 'user' : raw.__typename === 'Organization' ? 'organization' : null });
    });
  }
  async function getIdentity(): Promise<GitHubQueryResult<GitHubAccount>> {
    const reader = rootReader.scope();
    return mapResponse(await reader.query(queries.identityQuery, {}), (data) => data.viewer, (value) => checked(GitHubAccount, value));
  }
  async function listRepositories(): Promise<GitHubQueryResult<GitHubRepository[]>> {
    const reader = rootReader.scope();
    return collect(reader, queries.repositoriesQuery, {}, (data) => child(data, 'viewer', 'repositories'), repository);
  }
  async function listBranches(reference: RepositoryReference): Promise<GitHubQueryResult<string[]>> {
    if (!Value.Check(RepositoryReference,reference)) return invalid();
    return collect(rootReader.scope(),queries.branchesQuery,reference,data => child(data,'repository','refs'),node => {
      if (!validBranch(node.name)) throw new Error('RESPONSE_INVALID');
      return node.name;
    },node => string(node.name));
  }
  async function getRepository(reference: RepositoryReference): Promise<GitHubQueryResult<GitHubRepository>> {
    const reader = rootReader.scope();
    if (!Value.Check(RepositoryReference, reference)) return invalid();
    return mapResponse(await reader.query(queries.repositoryQuery, reference), (data) => data.repository, repository);
  }
  async function resolveBranch(reference: RepositoryReference, branch: string): Promise<GitHubQueryResult<GitHubBranch>> {
    const reader = rootReader.scope();
    if (!Value.Check(RepositoryReference, reference) || !validBranch(branch)) return invalid();
    const response = await reader.query(queries.branchQuery, { ...reference, qualifiedName: `refs/heads/${branch}` });
    try {
      if (response.data?.repository && object(response.data.repository).ref === null) return result(response.state === 'complete' ? 'inaccessible' : 'partial', null, [...response.diagnostics.map((entry) => entry.code), 'BRANCH_NOT_FOUND']);
    } catch { return result('unavailable', null, ['RESPONSE_INVALID']); }
    return mapResponse(response, (data) => data.repository, (value) => {
      const repo = object(value);
      if (repo.ref === null) throw new Error('BRANCH_NOT_FOUND');
      const ref = object(repo.ref);
      return checked(GitHubBranch, { repositoryId: repo.id, name: ref.name, sha: object(ref.target).oid });
    });
  }
  async function listProjects(owner: GitHubProjectOwner): Promise<GitHubQueryResult<GitHubProject[]>> {
    const reader = rootReader.scope();
    if (!Value.Check(GitHubProjectOwner, owner)) return invalid();
    return collect(reader, queries.projectsQuery(owner.kind), { login: owner.login }, (data) => child(data, owner.kind, 'projectsV2'), project);
  }
  async function getProject(id: string): Promise<GitHubQueryResult<GitHubProjectDetails>> {
    const reader = rootReader.scope();
    if (!Value.Check(GitHubProject.properties.id, id)) return invalid();
    const header = mapResponse(await reader.query(queries.projectQuery, { id }), (data) => data.node, project);
    if (!header.data) return { ...header, data: null };
    const fields = await collect(reader, queries.fieldsQuery, { id }, (data) => child(data, 'node', 'fields'), (node) => {
      if (node.__typename === 'ProjectV2SingleSelectField') return { kind: 'select' as const, field: checked(StatusField, { id: node.id, name: node.name, options: node.options }) };
      if (!['ProjectV2Field', 'ProjectV2IterationField', 'ProjectV2MultiSelectField'].includes(String(node.__typename))) throw new Error('RESPONSE_INVALID');
      return null;
    });
    const notes = [...header.diagnostics, ...fields.diagnostics].map((entry) => entry.code);
    return result(header.state === 'complete' && fields.state === 'complete' ? 'complete' : 'partial',
      checked(GitHubProjectDetails, { project: header.data,
        singleSelectFields: (fields.data ?? []).flatMap((entry) => entry?.kind === 'select' ? [entry.field] : []) }), notes, fields.retryAtMs);
  }
  async function validateProjectSelection(selection: ProjectSelection): Promise<GitHubQueryResult<GitHubProjectDetails>> {
    if (!Value.Check(GitHubProjectSelection, selection)) return invalid();
    const response = await getProject(selection.id);
    if (!response.data) return response;
    const field = response.data.singleSelectFields.find((candidate) => candidate.id === selection.statusFieldId);
    const missingOption = field && selection.statusOptionIds.some((id) => !field.options.some((option) => option.id === id));
    const compatible = field?.name === 'Status' && response.data.singleSelectFields.filter((candidate) => candidate.name === 'Status').length === 1 &&
      field.options.length === V3StatusMapping.length && V3StatusMapping.every(({ name }, index) =>
        field.options[index]?.id === selection.statusOptionIds[index] && field.options[index]?.name === name);
    const code = !field ? 'STATUS_FIELD_INACCESSIBLE' : missingOption ? 'STATUS_OPTION_INACCESSIBLE' : !compatible ? 'STATUS_MAPPING_INCOMPATIBLE' : null;
    return code ? result('partial', response.data, [...response.diagnostics.map((entry) => entry.code), code], response.retryAtMs) : response;
  }
  async function listProjectItems(id: string): Promise<GitHubQueryResult<ProjectItem[]>> {
    const reader = rootReader.scope();
    if (!Value.Check(GitHubProject.properties.id, id)) return invalid();
    const response = await collect(reader, queries.itemsQuery, { id }, (data) => child(data, 'node', 'items'), (node) => {
      const content = node.content === null ? null : object(node.content);
      const kind = content?.__typename === 'Issue' ? 'issue' : content?.__typename === 'PullRequest' ? 'pull_request' : content?.__typename === 'DraftIssue' ? 'draft' : 'inaccessible';
      const status = node.status ? object(node.status) : null;
      return checked(ProjectItem, { id: node.id, archived: node.isArchived, kind, contentId: content?.id ?? null,
        ...(status?.field ? { status: { fieldId: object(status.field).id, optionId: status.optionId ?? null } } : {}),
        title: content?.title ?? null, url: content?.url ?? null, executable: kind === 'issue' && node.isArchived === false });
    });
    if (response.data?.some((item) => item.kind === 'inaccessible')) return result('partial', response.data, [...response.diagnostics.map((entry) => entry.code), 'REFERENCE_INACCESSIBLE'], response.retryAtMs);
    // The query explicitly requests POSITION ASC; pagination preserves that documented order.
    return { ...response, data: response.data?.map((item, index) => ({ ...item, position: index + 1 })) ?? null };
  }
  async function getIssueContext(reference: IssueReference): Promise<GitHubQueryResult<IssueContext | ProjectItem>> {
    return readIssueContext(reference, rootReader.scope());
  }
  async function readIssueContext(reference: IssueReference, reader: GraphQLReader, queueHeader?: GitHubQueryResult<Record<string, unknown>>): Promise<GitHubQueryResult<IssueContext | ProjectItem>> {
    if (!Value.Check(GitHubIssueReference, reference)) return invalid();
    const header = queueHeader ?? await reader.query(queries.issueQuery, { owner: reference.owner, name: reference.name, number: reference.number });
    if (!header.data) return { ...header, data: null };
    let issue: Record<string, unknown>;
    try {
      const raw = child(header.data, 'repository', 'issueOrPullRequest');
      if (raw === null) return inaccessible();
      issue = object(raw);
      if (issue.__typename === 'PullRequest') return { ...header, data: checked(ProjectItem, { id: issue.id, contentId: issue.id, title: issue.title, url: issue.url, kind: 'pull_request', archived: false, executable: false }) };
      if (issue.__typename !== 'Issue') return result('unavailable', null, ['RESPONSE_INVALID']);
      checked(IssueContext, { ...baseIssue(issue), assignees: [], comments: [], blockers: [], memberships: [], references: [] });
    } catch { return result('unavailable', null, ['RESPONSE_INVALID']); }
    const id = string(issue.id);
    // Each nested connection has its own cursor. Never rely on a top-level --paginate to cover nested pages.
    const assignees = await collect(reader, queries.assigneesQuery, { id }, (data) => child(data, 'node', 'assignees'), (node) => checked(GitHubAccount, node));
    const comments = queueHeader ? result<IssueComment[]>('complete', []) : await collect(reader, queries.commentsQuery, { id }, (data) => child(data, 'node', 'comments'), (node) => checked(IssueComment, node));
    const blockers = await collect(reader, queries.blockersQuery, { id }, (data) => child(data, 'node', 'blockedBy'), (node) => checked(IssueBlocker, node));
    const memberships = await collect(reader, queries.membershipsQuery, { id }, (data) => child(data, 'node', 'projectItems'), (node) => checked(IssueMembership, {
      itemId: node.id, projectId: object(node.project).id, archived: node.isArchived, statusValues: [],
    }));
    const parts: GitHubQueryResult<unknown>[] = [header, assignees, comments, blockers, memberships];
    const populated: IssueMembership[] = [];
    const firstPages = new Map<string, GitHubQueryResult<Record<string, unknown>>>();
    for (const membership of memberships.data ?? []) {
      if (queueHeader && !firstPages.has(membership.itemId)) {
        const offset = (memberships.data ?? []).indexOf(membership);
        const group = (memberships.data ?? []).slice(offset, offset + 3);
        if (group.length > 1) {
          const response = await reader.query(queries.groupedValuesQuery, { ids: group.map(item => item.itemId) }, undefined, group.length === 3 ? 3 : 2);
          for (const item of group) {
            let first: GitHubQueryResult<Record<string, unknown>> = { ...response, data: null };
            if (response.data) {
              try {
                const nodes = response.data.nodes;
                if (!Array.isArray(nodes) || nodes.length !== group.length) throw new Error('RESPONSE_INVALID');
                const matches = nodes.filter(node => node !== null && object(node).id === item.itemId);
                if (matches.length !== 1 || object(matches[0]).__typename !== 'ProjectV2Item') throw new Error('RESPONSE_INVALID');
                first = { ...response, data: { node: matches[0] } };
              } catch { first = result('unavailable', null, [...response.diagnostics.map(entry => entry.code), 'RESPONSE_INVALID'], response.retryAtMs); }
            }
            firstPages.set(item.itemId, first);
          }
        }
      }
      const fields = await collect(reader, queries.valuesQuery, { id: membership.itemId }, (data) => child(data, 'node', 'fieldValues'), (node) => {
        if (node.__typename !== 'ProjectV2ItemFieldSingleSelectValue') return null;
        return { kind: 'select' as const, field: checked(IssueMembership.properties.statusValues.items, { fieldId: object(node.field).id, optionId: node.optionId, name: node.name }) };
      }, (node) => ['ProjectV2ItemFieldSingleSelectValue', 'ProjectV2ItemFieldNumberValue'].includes(String(node.__typename)) ? string(node.id) : null, firstPages.get(membership.itemId));
      parts.push(fields);
      populated.push({ ...membership, statusValues: (fields.data ?? []).flatMap((entry) => entry?.kind === 'select' ? [entry.field] : []) });
    }
    const bodies = queueHeader ? [] : [String(issue.body), ...(comments.data ?? []).map((comment) => comment.body)];
    const references = [...new Set(bodies.flatMap((body) => body.match(/https?:\/\/[^\s<>\)\]]+|(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?#[1-9][0-9]*/g) ?? []))].filter((ref) => ref.length <= 4096);
    const data = checked(IssueContext, { ...baseIssue(issue), assignees: assignees.data ?? [], comments: comments.data ?? [], blockers: blockers.data ?? [], memberships: populated, references });
    return result(parts.every((part) => part.state === 'complete') ? 'complete' : 'partial', data,
      parts.flatMap((part) => part.diagnostics.map((entry) => entry.code)), Math.max(0, ...parts.map((part) => part.retryAtMs ?? 0)) || null);
  }
  function getIssueContextById(id: string, options: { purpose: 'authority' }): Promise<GitHubQueryResult<IssueAuthorityContext>>;
  function getIssueContextById(id: string, options: { purpose: 'comment_confirmation' }): Promise<GitHubQueryResult<IssueCommentConfirmationContext>>;
  function getIssueContextById(id: string, options: { purpose: 'status_confirmation' }): Promise<GitHubQueryResult<IssueStatusConfirmationContext>>;
  function getIssueContextById(id: string, options?: { purpose?: 'queue' }): Promise<GitHubQueryResult<IssueContext | ProjectItem>>;
  async function getIssueContextById(id: string, options?: { purpose?: 'queue' | 'authority' | 'comment_confirmation' | 'status_confirmation' }): Promise<GitHubQueryResult<unknown>> {
    if (!Value.Check(GitHubId, id)) return invalid();
    const reader = rootReader.scope();
    if (options?.purpose === 'authority') return readIssueAuthority(reader, id);
    if (options?.purpose === 'comment_confirmation') return readIssueCommentConfirmation(reader, id);
    if (options?.purpose === 'status_confirmation') return readIssueStatusConfirmation(reader, id);
    const header = await reader.query(options?.purpose === 'queue' ? queries.queueIssueQuery : queries.issueReferenceQuery, { id });
    if (header.state !== 'complete' || !header.data) return { ...header, data: null };
    let reference: IssueReference;
    try {
      if (header.data.node === null) return inaccessible();
      const raw = object(header.data.node);
      if (raw.__typename !== 'Issue' || raw.id !== id) return result('unavailable', null, ['RESPONSE_INVALID'], header.retryAtMs);
      const repo = object(raw.repository);
      reference = checked(GitHubIssueReference, { owner: object(repo.owner).login, name: repo.name, number: raw.number });
    } catch { return result('unavailable', null, ['RESPONSE_INVALID']); }
    const queueHeader = options?.purpose === 'queue' ? { ...header, data: { repository: { issueOrPullRequest: header.data.node } } } : undefined;
    const context = await readIssueContext(reference, reader, queueHeader);
    if (context.data && context.data.id !== id) return result('unavailable', null, ['RESPONSE_INVALID']);
    return context;
  }
  return { getIdentity, getProjectOwner, listRepositories, listBranches, getRepository, resolveBranch, listProjects, getProject, validateProjectSelection, listProjectItems, getIssueContext, getIssueContextById };
}
function baseIssue(issue: Record<string, unknown>) {
  return { id: issue.id, number: issue.number, url: issue.url, title: issue.title, body: issue.body, state: issue.state, repository: repository(issue.repository) };
}

export type GitHub = ReturnType<typeof createClient>;
export type ReadinessReason = 'READ_INCOMPLETE' | 'ACCOUNT_CHANGED' | 'NOT_AN_ISSUE' | 'ISSUE_CLOSED' | 'REPOSITORY_MISMATCH' | 'ASSIGNEE_MISMATCH' | 'PROJECT_MEMBERSHIP_MISSING' | 'STATUS_MISMATCH' | 'OPEN_BLOCKERS';
/** A current observation for preparation, never a durable grant to dispatch or publish. */
export function assessIssueReadiness(input: {
  identity: GitHubQueryResult<GitHubAccount>; issue: GitHubQueryResult<IssueContext | ProjectItem>;
  project: GitHubQueryResult<GitHubProjectDetails>; expectedAccountId: string; repositoryId: string;
  projectId: string; statusFieldId: string; readyOptionId: string;
}): { eligible: boolean; reasons: ReadinessReason[] } {
  const reasons: ReadinessReason[] = [];
  if (input.identity.state !== 'complete' || input.issue.state !== 'complete' || input.project.state !== 'complete' || !input.identity.data || !input.issue.data || !input.project.data) return { eligible: false, reasons: ['READ_INCOMPLETE'] };
  if (input.identity.data.id !== input.expectedAccountId) reasons.push('ACCOUNT_CHANGED');
  const issue = input.issue.data;
  if (!('repository' in issue)) return { eligible: false, reasons: [...reasons, 'NOT_AN_ISSUE'] };
  if (issue.state !== 'OPEN') reasons.push('ISSUE_CLOSED');
  if (issue.repository.id !== input.repositoryId) reasons.push('REPOSITORY_MISMATCH');
  if (issue.assignees.length !== 1 || issue.assignees[0]?.id !== input.identity.data.id) reasons.push('ASSIGNEE_MISMATCH');
  const memberships = issue.memberships.filter((item) => item.projectId === input.projectId && !item.archived);
  if (memberships.length !== 1 || input.project.data.project.id !== input.projectId || input.project.data.project.closed) reasons.push('PROJECT_MEMBERSHIP_MISSING');
  const field = input.project.data.singleSelectFields.find((candidate) => candidate.id === input.statusFieldId);
  if (!field?.options.some((option) => option.id === input.readyOptionId) || !memberships[0]?.statusValues.some((value) => value.fieldId === input.statusFieldId && value.optionId === input.readyOptionId)) reasons.push('STATUS_MISMATCH');
  if (issue.blockers.some((blocker) => blocker.state === 'OPEN')) reasons.push('OPEN_BLOCKERS');
  return { eligible: reasons.length === 0, reasons };
}
