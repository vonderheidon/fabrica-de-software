import { Value } from '@sinclair/typebox/value';
import { CreationBoardMutationResult, CreationBoardOperation, V3StatusMapping, type CreationBoardMutationResult as BoardResult, type CreationBoardOperationKind, type ScaffoldInput } from '#contracts';
import type { GraphQLReader } from './transport.js';
import { object } from './transport.js';
import type { ScaffoldAuthorization } from './scaffold.js';

type Remote = NonNullable<ScaffoldInput['remote']>;
type Receipt = NonNullable<CreationBoardOperation['receipt']>;
const names = V3StatusMapping.map(({ name }) => name);
const fieldName = 'Status';
const viewName = 'Kanban';
const ownerBoards = `query FactoryCreationBoards($id:ID!,$after:String) { viewer { id } node(id:$id) { __typename
  ... on User { id login projectsV2(first:100,after:$after) { nodes { id title createdAt owner { id } } pageInfo { hasNextPage endCursor } } }
  ... on Organization { id login projectsV2(first:100,after:$after) { nodes { id title createdAt owner { id } } pageInfo { hasNextPage endCursor } } }
} }`;
const projectSnapshot = `query FactoryCreationBoardSnapshot($id:ID!) { viewer { id } node(id:$id) { __typename ... on ProjectV2 {
  id title url closed createdAt owner { __typename ... on User { id login } ... on Organization { id login } }
  repositories(first:100) { nodes { id } pageInfo { hasNextPage endCursor } }
  fields(first:100) { nodes { __typename ... on ProjectV2Field { id name dataType } ... on ProjectV2IterationField { id }
    ... on ProjectV2MultiSelectField { id } ... on ProjectV2SingleSelectField { id name options { id name } } } pageInfo { hasNextPage endCursor } }
  views(first:100) { nodes { id name layout createdAt configuration { visibleFields(first:100) { nodes { __typename id ... on ProjectV2SingleSelectField { options { id name } } } pageInfo { hasNextPage endCursor } } }
    groupByFields(first:100) { nodes { __typename id ... on ProjectV2SingleSelectField { options { id name } } } pageInfo { hasNextPage endCursor } } } pageInfo { hasNextPage endCursor } }
} } }`;
const createBoardMutation = `mutation FactoryCreateBoard($input:CreateProjectV2Input!) { createProjectV2(input:$input) { clientMutationId projectV2 { id } } }`;
const createStatusMutation = `mutation FactoryCreateStatus($input:CreateProjectV2FieldInput!) { createProjectV2Field(input:$input) { clientMutationId projectV2Field { ... on ProjectV2SingleSelectField { id name options { id name } } } } }`;
const updateStatusMutation = `mutation FactoryUpdateStatus($input:UpdateProjectV2FieldInput!) { updateProjectV2Field(input:$input) { clientMutationId projectV2Field { ... on ProjectV2SingleSelectField { id name options { id name } } } } }`;
const linkRepositoryMutation = `mutation FactoryLinkBoardRepository($input:LinkProjectV2ToRepositoryInput!) { linkProjectV2ToRepository(input:$input) { clientMutationId projectV2 { id } } }`;
const createViewMutation = `mutation FactoryCreateKanbanView($input:CreateProjectV2ViewInput!) { createProjectV2View(input:$input) { clientMutationId projectV2View { id name layout } } }`;
type Option = { id: string; name: string };
interface BoardSnapshot {
  id: string; title: string; projectUrl: string | null; closed: boolean; ownerId: string; viewerId: string; repositories: string[];
  fields: Array<{ id: string; name: string; kind: string; options: Option[] }>;
  views: Array<{ id: string; name: string; layout: string; createdAt: number;
    visibleFields: Array<{ id: string; kind: string; options: Option[] | null }>;
    groupByFields: Array<{ id: string; kind: string; options: Option[] | null }> }>;
}
const unknown = (reason: string): BoardResult => ({ state: 'unknown', receipt: null, reason });
const failed = (reason: string): BoardResult => ({ state: 'failed_known', receipt: null, reason });
function confirmed(value: Omit<Receipt, 'format_version' | 'observed_at_ms'>, observedAt = Date.now()): BoardResult {
  const receipt = { format_version: 1 as const, observed_at_ms: observedAt, ...value };
  return Value.Check(CreationBoardMutationResult, { state: 'confirmed', receipt, reason: null })
    ? { state: 'confirmed', receipt, reason: null } : unknown('BOARD_RECEIPT_INVALID');
}
function page(connection: unknown): { nodes: unknown[]; more: boolean; cursor: string | null } {
  const value = object(connection); const info = object(value.pageInfo);
  if (!Array.isArray(value.nodes) || typeof info.hasNextPage !== 'boolean' ||
      (info.hasNextPage && (typeof info.endCursor !== 'string' || info.endCursor.length === 0))) throw new Error('INVALID');
  return { nodes: value.nodes, more: info.hasNextPage, cursor: typeof info.endCursor === 'string' ? info.endCursor : null };
}
function successful(response: { state: string; data: Record<string, unknown> | null }): response is { state: 'complete'; data: Record<string, unknown> } {
  return response.state === 'complete' && response.data !== null;
}
function decodeSnapshot(data: Record<string, unknown>, expected: CreationBoardOperation): BoardSnapshot {
  if (typeof data.viewer !== 'object' || data.viewer === null) throw new Error('INVALID');
  const viewerId = object(data.viewer).id; const raw = object(data.node); const owner = object(raw.owner);
  if (raw.__typename !== 'ProjectV2' || raw.id !== expected.expected_identity.project_id ||
      owner.id !== expected.expected_identity.owner_id || raw.title !== expected.expected_identity.board_name ||
      typeof viewerId !== 'string' || typeof raw.closed !== 'boolean' || typeof raw.createdAt !== 'string' || !Number.isFinite(Date.parse(raw.createdAt))) throw new Error('INVALID');
  const repositoriesPage = page(raw.repositories); const fieldsPage = page(raw.fields); const viewsPage = page(raw.views);
  if (repositoriesPage.more || fieldsPage.more || viewsPage.more) throw new Error('INCOMPLETE');
  const repositories = repositoriesPage.nodes.map(node => {
    const value = object(node); if (typeof value.id !== 'string' || !value.id) throw new Error('INVALID'); return value.id;
  });
  const fields = fieldsPage.nodes.map(node => {
    const value = object(node); if (typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.__typename !== 'string') throw new Error('INVALID');
    const options = value.__typename === 'ProjectV2SingleSelectField' && Array.isArray(value.options)
      ? value.options.map(item => { const option = object(item); if (typeof option.id !== 'string' || typeof option.name !== 'string') throw new Error('INVALID'); return { id: option.id, name: option.name }; }) : [];
    return { id: value.id, name: value.name, kind: value.__typename, options };
  });
  const views = viewsPage.nodes.map(node => {
    const value = object(node); const configuration = object(value.configuration);
    const visible = page(configuration.visibleFields); const grouped = page(value.groupByFields);
    if (visible.more || grouped.more || typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.layout !== 'string' ||
        typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new Error('INCOMPLETE');
    return { id: value.id, name: value.name, layout: value.layout, createdAt: Date.parse(value.createdAt),
      visibleFields: visible.nodes.map(field => {
        const item = object(field);
        if (typeof item.id !== 'string' || typeof item.__typename !== 'string') throw new Error('INVALID');
        const options = item.__typename === 'ProjectV2SingleSelectField' && Array.isArray(item.options)
          ? item.options.map(option => { const entry = object(option); if (typeof entry.id !== 'string' || typeof entry.name !== 'string') throw new Error('INVALID'); return { id: entry.id, name: entry.name }; })
          : null;
        return { id: item.id, kind: item.__typename, options };
      }),
      groupByFields: grouped.nodes.map(field => {
        const item = object(field);
        if (typeof item.id !== 'string' || typeof item.__typename !== 'string') throw new Error('INVALID');
        const options = item.__typename === 'ProjectV2SingleSelectField' && Array.isArray(item.options)
          ? item.options.map(option => { const entry = object(option); if (typeof entry.id !== 'string' || typeof entry.name !== 'string') throw new Error('INVALID'); return { id: entry.id, name: entry.name }; })
          : null;
        return { id: item.id, kind: item.__typename, options };
      }) };
  });
  const projectUrl = typeof raw.url === 'string' && /^https:\/\/github\.com\//.test(raw.url) ? raw.url : null;
  return { id: raw.id as string, title: raw.title as string, projectUrl, closed: raw.closed as boolean, ownerId: owner.id as string,
    viewerId, repositories, fields, views };
}
function receiptFor(snapshot: BoardSnapshot): Omit<Receipt, 'format_version' | 'observed_at_ms'> {
  return { project_id: snapshot.id, owner_id: snapshot.ownerId, title: snapshot.title, ...(snapshot.projectUrl ? { project_url: snapshot.projectUrl } : {}), repository_ids: snapshot.repositories };
}
function statusField(snapshot: BoardSnapshot): BoardSnapshot['fields'][number] | null {
  const fields = snapshot.fields.filter(field => field.name === fieldName && field.kind === 'ProjectV2SingleSelectField');
  return fields.length === 1 ? fields[0]! : null;
}
function exactOptions(field: BoardSnapshot['fields'][number]): boolean {
  return exactStatusOptions(field.options);
}
function exactStatusOptions(options: Option[] | null): options is Option[] {
  return options !== null && options.length === names.length && options.every((option, index) => option.name === names[index]) &&
    new Set(options.map(option => option.id)).size === names.length;
}
function viewHasOrderedStatusColumns(view: BoardSnapshot['views'][number], field: BoardSnapshot['fields'][number]): boolean {
  const visibleStatus = view.visibleFields.filter(candidate => candidate.id === field.id);
  if (view.groupByFields.length !== 1) return false;
  const grouped = view.groupByFields[0]!;
  if (visibleStatus.length !== 1 || visibleStatus[0]!.kind !== 'ProjectV2SingleSelectField' || !exactStatusOptions(visibleStatus[0]!.options) ||
      grouped.id !== field.id || grouped.kind !== 'ProjectV2SingleSelectField' || !exactStatusOptions(grouped.options)) return false;
  return [visibleStatus[0]!.options, grouped.options].every(options =>
    options.every((option, index) => option.id === field.options[index]?.id && option.name === field.options[index]?.name));
}
function viewReceipt(snapshot: BoardSnapshot, view: BoardSnapshot['views'][number]): Omit<Receipt, 'format_version' | 'observed_at_ms'> {
  const field = statusField(snapshot);
  return { ...receiptFor(snapshot), ...(field ? { status_field_id: field.id, status_field_name: field.name, status_options: field.options } : {}),
    view_id: view.id, view_name: view.name, ...(view.layout === 'BOARD_LAYOUT' ? { view_layout: 'BOARD_LAYOUT' as const } : {}),
    visible_field_ids: view.visibleFields.map(field => field.id), group_by_field_ids: view.groupByFields.map(field => field.id) };
}
function expectedProject(operation: CreationBoardOperation): string | null { return operation.expected_identity.project_id; }
function mutationValid(operation: CreationBoardOperation, kind: CreationBoardOperationKind): boolean {
  return operation.kind === kind && operation.state === 'running' && operation.authorization.actions.includes(kind) &&
    operation.authorization.creation_id === operation.creation_id && operation.authorization.plan_hash.length === 64;
}
export function createBoardOperations(reader: GraphQLReader, authorization?: ScaffoldAuthorization) {
  const authorized = (ownerId: string, remote: Remote, accountId: string): boolean => Boolean(authorization &&
    (('kind' in authorization && authorization.kind === 'confirmed_plan') || ('accountId' in authorization && authorization.accountId === accountId &&
      authorization.targets.some(target => target.ownerId === ownerId && target.name === remote.name && target.visibility === remote.visibility))));
  const readSnapshot = async (operation: CreationBoardOperation): Promise<BoardSnapshot | null> => {
    const projectId = expectedProject(operation); if (!projectId) return null;
    const response = await reader.scope().query(projectSnapshot, { id: projectId });
    if (!successful(response)) return null;
    try { return decodeSnapshot(response.data, operation); } catch { return null; }
  };
  async function listCreatedBoards(operation: CreationBoardOperation, accountId: string): Promise<Array<{ id: string; createdAt: number }>|null> {
    let cursor: string | null = null; const cursors = new Set<string>(); const seen = new Set<string>(); const matches: Array<{ id: string; createdAt: number }> = [];
    for (let i = 0; i < 100; i++) {
      const response = await reader.scope().query(ownerBoards, { id: operation.expected_identity.owner_id, after: cursor });
      if (!successful(response)) return null;
      try {
        if (object(response.data.viewer).id !== accountId) return null;
        const owner = object(response.data.node);
        if (owner.id !== operation.expected_identity.owner_id || !['User','Organization'].includes(String(owner.__typename))) return null;
        const connection = page(owner.projectsV2);
        for (const entry of connection.nodes) {
          const item = object(entry); const itemOwner = object(item.owner);
          if (typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt)) || seen.has(item.id)) return null;
          seen.add(item.id);
          if (item.title === operation.expected_identity.board_name && itemOwner.id === operation.expected_identity.owner_id) matches.push({ id: item.id, createdAt: Date.parse(item.createdAt) });
        }
        if (!connection.more) return matches;
        if (!connection.cursor || cursors.has(connection.cursor)) return null;
        cursors.add(connection.cursor); cursor = connection.cursor;
      } catch { return null; }
    }
    return null;
  }
  async function verify(operation: CreationBoardOperation, remote: Remote, accountId: string): Promise<BoardResult> {
    const snapshot = await readSnapshot(operation); if (!snapshot) return unknown('BOARD_READ_INCOMPLETE');
    if (snapshot.viewerId !== accountId || snapshot.ownerId !== remote.ownerId || snapshot.closed) return failed('BOARD_IDENTITY_MISMATCH');
    const field = statusField(snapshot); const view = snapshot.views.find(candidate => candidate.id === operation.expected_identity.view_id) ??
      snapshot.views.find(candidate => candidate.name === viewName);
    if (!field || field.id !== operation.expected_identity.status_field_id || !view ||
        (operation.expected_identity.view_id !== null && view.id !== operation.expected_identity.view_id)) return failed('BOARD_CROSS_IDENTITY');
    const exact = Boolean(field && exactOptions(field) && names.every((name,index) => field.options[index]?.name === name) &&
      snapshot.repositories.includes(remoteRepositoryId(operation)) && view && view.layout === 'BOARD_LAYOUT' &&
      view.visibleFields.some(visible => visible.id === (field?.id ?? '')) && viewHasOrderedStatusColumns(view, field));
    if (!exact || !field || !view) return failed('BOARD_CAPABILITIES_INCOMPLETE');
    const result = confirmed({ ...viewReceipt(snapshot,view), status_options: field.options });
    return result;
  }
  function remoteRepositoryId(operation: CreationBoardOperation): string {
    return operation.expected_identity.repository_id ?? '';
  }
  async function mutation(operation: CreationBoardOperation, query: string, variables: Record<string, unknown>, authorize: () => Promise<void>, markSent: () => void): Promise<Record<string, unknown> | null> {
    try { await authorize(); } catch { return null; }
    let sent = false;
    const response = await reader.scope().query(query, { ...variables, input: { ...object(variables.input), clientMutationId: operation.operation_id } }, () => { markSent(); sent = true; });
    if (!sent || !successful(response)) return null;
    return response.data;
  }
  const statusInputs = (existing: BoardSnapshot['fields'][number] | null) => names.map((name,index) => ({
    ...(existing?.options.find(option => option.name === name) ? { id: existing.options.find(option => option.name === name)!.id } : {}),
    name, color: (['GRAY','BLUE','YELLOW','PURPLE','GREEN'] as const)[index], description: `Factory status: ${name}`,
  }));
  async function doOperation(operation: CreationBoardOperation, remote: Remote, repositoryId: string, accountId: string,
    authorize: () => Promise<void>, markSent: () => void): Promise<BoardResult> {
    if (!Value.Check(CreationBoardOperation, operation) || !authorized(remote.ownerId, remote, accountId) || operation.authorization.account_id !== accountId) return failed('BOARD_TARGET_NOT_AUTHORIZED');
    if (operation.kind === 'create_board') {
      if (!mutationValid(operation, 'create_board')) return failed('BOARD_OPERATION_INVALID');
      const matches = await listCreatedBoards(operation, accountId);
      if (!matches) return unknown('BOARD_OWNER_READ_INCOMPLETE');
      if (matches.length) return failed('BOARD_NAME_ALREADY_EXISTS');
      const data = await mutation(operation, createBoardMutation, { input: { ownerId: remote.ownerId, title: operation.expected_identity.board_name } }, authorize, markSent);
      if (!data) return unknown('BOARD_CREATE_UNCONFIRMED');
      try {
        const payload = object(data.createProjectV2); const project = object(payload.projectV2);
        if (payload.clientMutationId !== operation.operation_id || typeof project.id !== 'string' || !project.id) return unknown('BOARD_CREATE_UNCONFIRMED');
        const snapshot = await readSnapshot({ ...operation, expected_identity: { ...operation.expected_identity, project_id: project.id } });
        if (!snapshot || snapshot.id !== project.id || snapshot.viewerId !== accountId || snapshot.ownerId !== remote.ownerId || snapshot.title !== operation.expected_identity.board_name) return unknown('BOARD_CREATE_UNCONFIRMED');
        return confirmed(receiptFor(snapshot));
      } catch { return unknown('BOARD_CREATE_UNCONFIRMED'); }
    }
    const snapshot = await readSnapshot(operation);
    if (!snapshot) return unknown('BOARD_READ_INCOMPLETE');
    if (snapshot.viewerId !== accountId || snapshot.closed || snapshot.ownerId !== remote.ownerId) return failed('BOARD_IDENTITY_MISMATCH');
    if (operation.kind === 'configure_status') {
      if (!mutationValid(operation, 'configure_status')) return failed('BOARD_OPERATION_INVALID');
      const field = statusField(snapshot);
      if (field && exactOptions(field)) return confirmed({ ...receiptFor(snapshot), status_field_id: field.id, status_field_name: field.name, status_options: field.options });
      if (snapshot.fields.filter(candidate => candidate.name === fieldName).length > 1) return failed('BOARD_STATUS_FIELD_AMBIGUOUS');
      const input = field ? { fieldId: field.id, singleSelectOptions: statusInputs(field) } :
        { projectId: snapshot.id, name: fieldName, dataType: 'SINGLE_SELECT', singleSelectOptions: statusInputs(null) };
      const data = await mutation(operation, field ? updateStatusMutation : createStatusMutation, { input }, authorize, markSent);
      if (!data) return unknown('BOARD_STATUS_UNCONFIRMED');
      const checkedSnapshot = await readSnapshot(operation); const status = checkedSnapshot && statusField(checkedSnapshot);
      if (!checkedSnapshot || checkedSnapshot.viewerId !== accountId || !status || !exactOptions(status)) return unknown('BOARD_STATUS_UNCONFIRMED');
      return confirmed({ ...receiptFor(checkedSnapshot), status_field_id: status.id, status_field_name: status.name, status_options: status.options });
    }
    if (operation.kind === 'link_repository') {
      if (!mutationValid(operation, 'link_repository')) return failed('BOARD_OPERATION_INVALID');
      if (operation.expected_identity.repository_id !== repositoryId) return failed('BOARD_CROSS_IDENTITY');
      if (snapshot.repositories.includes(repositoryId)) return confirmed({ ...receiptFor(snapshot), repository_ids: snapshot.repositories });
      const data = await mutation(operation, linkRepositoryMutation, { input: { projectId: snapshot.id, repositoryId } }, authorize, markSent);
      if (!data) return unknown('BOARD_LINK_UNCONFIRMED');
      const checkedSnapshot = await readSnapshot(operation);
      return checkedSnapshot?.viewerId === accountId && checkedSnapshot.repositories.includes(repositoryId)
        ? confirmed({ ...receiptFor(checkedSnapshot), repository_ids: checkedSnapshot.repositories }) : unknown('BOARD_LINK_UNCONFIRMED');
    }
    if (operation.kind === 'configure_view') {
      if (!mutationValid(operation, 'configure_view')) return failed('BOARD_OPERATION_INVALID');
      const field = statusField(snapshot); if (!field || !exactOptions(field)) return failed('BOARD_STATUS_NOT_READY');
      if (field.id !== operation.expected_identity.status_field_id) return failed('BOARD_CROSS_IDENTITY');
      const existing = snapshot.views.filter(candidate => candidate.name === viewName);
      if (existing.length > 1) return failed('BOARD_VIEW_AMBIGUOUS');
      if (existing.length === 1) {
        const view = existing[0]!;
        return view.layout === 'BOARD_LAYOUT' && view.visibleFields.some(visible => visible.id === field.id) && viewHasOrderedStatusColumns(view, field)
          ? confirmed(viewReceipt(snapshot,view)) : failed('BOARD_VIEW_CONFIGURATION_CONFLICT');
      }
      const data = await mutation(operation, createViewMutation, { input: { projectId: snapshot.id, name: viewName, layout: 'BOARD_LAYOUT', configuration: { visibleFieldIds: [field.id] } } }, authorize, markSent);
      if (!data) return unknown('BOARD_VIEW_UNCONFIRMED');
      const checkedSnapshot = await readSnapshot(operation); const created = checkedSnapshot?.views.filter(candidate => candidate.name === viewName) ?? [];
      if (!checkedSnapshot || created.length !== 1 || created[0]!.layout !== 'BOARD_LAYOUT' || !created[0]!.visibleFields.some(visible => visible.id === field.id) ||
          !viewHasOrderedStatusColumns(created[0]!, field)) return unknown('BOARD_VIEW_UNCONFIRMED');
      return confirmed(viewReceipt(checkedSnapshot,created[0]!));
    }
    if (!mutationValid(operation, 'verify_board')) return failed('BOARD_OPERATION_INVALID');
    return verify(operation, remote, accountId);
  }
  async function reconcile(operation: CreationBoardOperation, remote: Remote, repositoryId: string, accountId: string): Promise<BoardResult> {
    if (!Value.Check(CreationBoardOperation, operation) || !authorized(remote.ownerId, remote, accountId) ||
        operation.authorization.account_id !== accountId || !['running','unknown'].includes(operation.state)) return failed('BOARD_OPERATION_INVALID');
    if (operation.kind === 'create_board') {
      const matches = await listCreatedBoards(operation, accountId); if (!matches) return unknown('BOARD_OWNER_READ_INCOMPLETE');
      const since = operation.sent_at_ms;
      const created = matches.filter(candidate => since !== null && candidate.createdAt >= since - 1000);
      if (created.length !== 1) return unknown(created.length > 1 ? 'BOARD_CREATE_AMBIGUOUS' : 'BOARD_CREATE_NOT_OBSERVED');
      const snapshot = await readSnapshot({ ...operation, expected_identity: { ...operation.expected_identity, project_id: created[0]!.id } });
      if (!snapshot || snapshot.viewerId !== accountId || snapshot.ownerId !== remote.ownerId || snapshot.title !== operation.expected_identity.board_name) return unknown('BOARD_CREATE_UNCONFIRMED');
      return confirmed(receiptFor(snapshot));
    }
    const snapshot = await readSnapshot(operation); if (!snapshot) return unknown('BOARD_READ_INCOMPLETE');
    if (snapshot.viewerId !== accountId || snapshot.closed || snapshot.ownerId !== remote.ownerId) return unknown('BOARD_IDENTITY_CONFLICT');
    if (operation.kind === 'configure_status') {
      const field = statusField(snapshot); return field && exactOptions(field)
        ? confirmed({ ...receiptFor(snapshot), status_field_id: field.id, status_field_name: field.name, status_options: field.options }) : unknown('BOARD_STATUS_NOT_OBSERVED');
    }
    if (operation.kind === 'link_repository') return operation.expected_identity.repository_id === repositoryId && snapshot.repositories.includes(repositoryId)
      ? confirmed({ ...receiptFor(snapshot), repository_ids: snapshot.repositories }) : unknown('BOARD_LINK_NOT_OBSERVED');
    if (operation.kind === 'configure_view') {
      const view = snapshot.views.find(candidate => candidate.name === viewName); const field = statusField(snapshot);
      return view && field && field.id === operation.expected_identity.status_field_id &&
        (operation.expected_identity.view_id === null || view.id === operation.expected_identity.view_id) &&
        view.layout === 'BOARD_LAYOUT' && view.visibleFields.some(visible => visible.id === field.id) && viewHasOrderedStatusColumns(view, field)
        ? confirmed(viewReceipt(snapshot,view)) : unknown('BOARD_VIEW_NOT_OBSERVED');
    }
    return verify(operation, remote, accountId);
  }
  return {
    scaffoldBoardCapability(ownerId: string, remote: Remote, accountId: string) { return { available: authorized(ownerId, remote, accountId), reason_code: 'BOARD_TARGET_NOT_AUTHORIZED' }; },
    createBoardOperation: doOperation,
    reconcileBoardOperation: reconcile,
  };
}
