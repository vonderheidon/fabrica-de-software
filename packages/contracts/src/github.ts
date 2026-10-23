import { Type, type Static, type TSchema } from '@sinclair/typebox';

const closed = { additionalProperties: false } as const;
const text = (maxLength = 1024) => Type.String({ minLength: 1, maxLength });
export const GitHubId = text(256);
export const GitHubAccount = Type.Object({ id: GitHubId, login: text(100) }, closed);
export type GitHubAccount = Static<typeof GitHubAccount>;
export const RepositoryReference = Type.Object({
  owner: Type.String({ pattern: '^[A-Za-z0-9][A-Za-z0-9-]{0,99}$' }),
  name: Type.String({ pattern: '^[A-Za-z0-9_.-]{1,100}$' }),
}, closed);
export type RepositoryReference = Static<typeof RepositoryReference>;
export const GitHubIssueReference = Type.Object({ ...RepositoryReference.properties, number: Type.Integer({ minimum: 1, maximum: 2_147_483_647 }) }, closed);
export type GitHubIssueReference = Static<typeof GitHubIssueReference>;
export const GitHubProjectOwner = Type.Object({
  kind: Type.Union([Type.Literal('user'), Type.Literal('organization')]), login: RepositoryReference.properties.owner,
}, closed);
export type GitHubProjectOwner = Static<typeof GitHubProjectOwner>;
export const GitHubProjectSelection = Type.Object({ id: GitHubId, statusFieldId: GitHubId, statusOptionIds: Type.Array(GitHubId, { minItems: 5, maxItems: 5 }) }, closed);
export type GitHubProjectSelection = Static<typeof GitHubProjectSelection>;
export const GitHubRepository = Type.Object({
  id: GitHubId, owner: GitHubAccount, name: text(100), url: text(),
  defaultBranch: Type.Union([text(), Type.Null()]), isArchived: Type.Boolean(), isPrivate: Type.Boolean(),
}, closed);
export type GitHubRepository = Static<typeof GitHubRepository>;
export const GitHubBranch = Type.Object({ repositoryId: GitHubId, name: text(), sha: Type.String({ pattern: '^[0-9a-f]{40,64}$' }) }, closed);
export type GitHubBranch = Static<typeof GitHubBranch>;
export const GitHubProject = Type.Object({
  id: GitHubId, number: Type.Integer({ minimum: 1 }), title: text(4096), url: text(),
  owner: Type.Object({ id: GitHubId, login: text(100), kind: Type.Union([Type.Literal('user'), Type.Literal('organization')]) }, closed),
  closed: Type.Boolean(),
}, closed);
export type GitHubProject = Static<typeof GitHubProject>;
export const StatusField = Type.Object({
  id: GitHubId, name: text(1024), options: Type.Array(Type.Object({ id: GitHubId, name: text(1024) }, closed)),
}, closed);
export type StatusField = Static<typeof StatusField>;
export const GitHubProjectDetails = Type.Object({ project: GitHubProject, singleSelectFields: Type.Array(StatusField),
  numberFields: Type.Optional(Type.Array(Type.Object({ id: GitHubId, name: text(1024) }, closed))),
}, closed);
export type GitHubProjectDetails = Static<typeof GitHubProjectDetails>;
export const GitHubDiagnostic = Type.Object({
  code: Type.Union(([
    'CONTEXT_UNAVAILABLE', 'AUTHENTICATION_INVALID', 'RATE_LIMITED', 'ACCESS_DENIED', 'NOT_FOUND_OR_INACCESSIBLE',
    'RESPONSE_INVALID', 'CLI_UNAVAILABLE', 'QUERY_FAILED', 'QUERY_LIMIT', 'PAGINATION_INVALID', 'REFERENCE_INACCESSIBLE',
    'STATUS_FIELD_INACCESSIBLE', 'STATUS_OPTION_INACCESSIBLE', 'STATUS_MAPPING_INCOMPATIBLE', 'INPUT_INVALID', 'BRANCH_NOT_FOUND',
  ] as const).map((code) => Type.Literal(code))),
  message: text(2048), recovery: text(2048),
}, closed);
export type GitHubDiagnostic = Static<typeof GitHubDiagnostic>;
export function GitHubQueryResult<T extends TSchema>(data: T) {
  return Type.Object({
    state: Type.Union((['complete', 'partial', 'context_unavailable', 'authentication_invalid', 'rate_limited',
      'inaccessible', 'invalid_input', 'unavailable'] as const).map((state) => Type.Literal(state))),
    data: Type.Union([data, Type.Null()]), diagnostics: Type.Array(GitHubDiagnostic),
    retryAtMs: Type.Union([Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }), Type.Null()]),
  }, closed);
}
export type GitHubQueryResult<T> = Omit<Static<ReturnType<typeof GitHubQueryResult>>, 'data'> & { data: T | null };
export const ProjectItem = Type.Object({
  id: GitHubId, archived: Type.Boolean(), kind: Type.Union((['issue', 'pull_request', 'draft', 'inaccessible'] as const).map((kind) => Type.Literal(kind))),
  contentId: Type.Union([GitHubId, Type.Null()]), title: Type.Union([text(65536), Type.Null()]),
  url: Type.Union([text(), Type.Null()]), executable: Type.Boolean(),
  position: Type.Optional(Type.Integer({ minimum: 1 })),
}, closed);
export type ProjectItem = Static<typeof ProjectItem>;
export const IssueComment = Type.Object({
  id: GitHubId, url: text(), body: Type.String({ maxLength: 1_000_000 }),
  author: Type.Union([Type.Object({ login: text(100), id: Type.Optional(GitHubId) }, closed), Type.Null()]), updatedAt: text(64),
}, closed);
export type IssueComment = Static<typeof IssueComment>;
export const IssueBlocker = Type.Object({
  id: GitHubId, number: Type.Integer({ minimum: 1 }), url: text(), title: text(65536),
  state: Type.Union([Type.Literal('OPEN'), Type.Literal('CLOSED')]),
}, closed);
export type IssueBlocker = Static<typeof IssueBlocker>;
export const IssueMembership = Type.Object({
  itemId: GitHubId, projectId: GitHubId, archived: Type.Boolean(),
  statusValues: Type.Array(Type.Object({ fieldId: GitHubId, optionId: Type.Union([GitHubId, Type.Null()]), name: Type.Union([text(), Type.Null()]) }, closed)),
  numberValues: Type.Optional(Type.Array(Type.Object({ fieldId: GitHubId, value: Type.Union([Type.Number(), Type.Null()]) }, closed))),
}, closed);
export type IssueMembership = Static<typeof IssueMembership>;
export const IssueContext = Type.Object({
  id: GitHubId, number: Type.Integer({ minimum: 1 }), url: text(), title: text(65536), body: Type.String({ maxLength: 1_000_000 }),
  state: Type.Union([Type.Literal('OPEN'), Type.Literal('CLOSED')]), repository: GitHubRepository,
  assignees: Type.Array(GitHubAccount), comments: Type.Array(IssueComment), blockers: Type.Array(IssueBlocker),
  memberships: Type.Array(IssueMembership), references: Type.Array(text(4096)),
}, closed);
export type IssueContext = Static<typeof IssueContext>;

// Configuration-family DTOs. GitHub adapter models and external GraphQL keys
// retain their own representation; only these explicit public fields change.
const ConfigurationRepository = Type.Object({
  ...Type.Omit(GitHubRepository, ['defaultBranch', 'isArchived', 'isPrivate']).properties,
  default_branch: GitHubRepository.properties.defaultBranch,
  is_archived: GitHubRepository.properties.isArchived, is_private: GitHubRepository.properties.isPrivate,
}, closed);
const ConfigurationComment = Type.Object({ ...Type.Omit(IssueComment, ['updatedAt']).properties, updated_at: IssueComment.properties.updatedAt }, closed);
const ConfigurationMembership = Type.Object({
  ...Type.Omit(IssueMembership, ['itemId', 'projectId', 'statusValues', 'numberValues']).properties,
  item_id: GitHubId, project_id: GitHubId,
  status_values: Type.Array(Type.Object({ field_id: GitHubId, option_id: Type.Union([GitHubId, Type.Null()]), name: Type.Union([text(), Type.Null()]) }, closed)),
  number_values: Type.Optional(Type.Array(Type.Object({ field_id: GitHubId, value: Type.Union([Type.Number(), Type.Null()]) }, closed))),
}, closed);
export const ConfigurationIssueContext = Type.Object({
  ...Type.Omit(IssueContext, ['repository', 'comments', 'memberships']).properties,
  repository: ConfigurationRepository, comments: Type.Array(ConfigurationComment), memberships: Type.Array(ConfigurationMembership),
}, closed);
export type ConfigurationIssueContext = Static<typeof ConfigurationIssueContext>;
export const ConfigurationIssueOption = Type.Object({
  ...Type.Omit(ProjectItem, ['contentId']).properties, content_id: ProjectItem.properties.contentId,
}, closed);
