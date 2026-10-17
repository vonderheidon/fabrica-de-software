import { Type, type Static } from '@sinclair/typebox';
import { ArtifactPolicy, CostDefaults, DeliveryMode, FactorySettings, MaestriSettings, OperationId, OperationReceipt, Page, TimeDefaults } from './base.js';
import { GitHubDiagnostic, GitHubProject, GitHubProjectOwner, StatusField } from './github.js';
import { OriginSource } from './workspaces.js';

const closed = { additionalProperties: false } as const;
const text = (maxLength = 2048) => Type.String({ minLength: 1, maxLength, pattern: '.*\\S.*' });
const nullable = (maxLength = 256) => Type.Union([text(maxLength), Type.Null()]);
const revision = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const timestamp = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
export const ExecutionProfile = Type.Object({
  id: Type.Optional(OperationId), name: text(256), executor: Type.Literal('maestri-omp'),
  provider: text(256), model: text(256), effort: text(128), guidance: Type.String({ maxLength: 8192 }),
}, closed);
export type ExecutionProfile = Static<typeof ExecutionProfile>;
export const StoredExecutionProfile = Type.Object({ ...ExecutionProfile.properties, id: OperationId, revision, createdAtMs: timestamp, updatedAtMs: timestamp }, closed);
export type StoredExecutionProfile = Static<typeof StoredExecutionProfile>;
export const GlobalConfiguration = Type.Object({
  ...Type.Pick(FactorySettings, ['designatedHost', 'projectsRoot', 'dataRoot', 'maestriSettings', 'automationEnabled', 'timeDefaults', 'costDefaults', 'artifactPolicy']).properties,
  profiles: Type.Array(StoredExecutionProfile, { maxItems: 100 }),
}, closed);
export type GlobalConfiguration = Static<typeof GlobalConfiguration>;
// Nested edit objects preserve omitted fields too; arrays are explicit replacements.
export const GlobalChanges = Type.Partial(Type.Object({
  designatedHost: nullable(), projectsRoot: nullable(4096), dataRoot: text(4096),
  maestriSettings: Type.Partial(MaestriSettings), automationEnabled: Type.Boolean(),
  timeDefaults: Type.Partial(TimeDefaults), costDefaults: Type.Partial(CostDefaults), artifactPolicy: Type.Partial(ArtifactPolicy),
}, closed));
export type GlobalChanges = Static<typeof GlobalChanges>;
const profileChanges = Type.Array(ExecutionProfile, { maxItems: 100 });
export const SettingsUpdate = Type.Object({ changes: GlobalChanges, profileChanges: Type.Optional(profileChanges) }, closed);
export type SettingsUpdate = Static<typeof SettingsUpdate>;
export const CheckDefinition = Type.Object({
  id: text(128), command: text(4096), cwdRelative: Type.String({ minLength: 1, maxLength: 4096 }),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 2_147_483_647 })),
}, closed);
export type CheckDefinition = Static<typeof CheckDefinition>;
export const StatusOptionIds = Type.Object({ ready: text(256), inProgress: text(256), inReview: text(256), delivered: text(256) }, closed);
export const ProjectMapping = Type.Object({ id: text(256), ownerId: text(256), statusFieldId: text(256), statusOptionIds: StatusOptionIds }, closed);
export const QueueOrder = Type.Object({ priorityFieldId: nullable(), priorityDirection: Type.Union([Type.Literal('asc'), Type.Literal('desc')]), useBoardPosition: Type.Boolean() }, closed);
export const ProjectConfiguration = Type.Object({
  source: Type.Object({ ...OriginSource.properties, repositoryId: Type.Optional(text(256)), repositoryUrl: Type.Optional(text(4096)) }, closed),
  baseBranch: text(1024), githubProject: Type.Union([ProjectMapping, Type.Null()]),
  implementerProfileId: Type.Union([OperationId, Type.Null()]), reviewerProfileId: Type.Union([OperationId, Type.Null()]),
  checks: Type.Array(CheckDefinition, { maxItems: 50 }), correctionLimit: Type.Integer({ minimum: 0, maximum: 5 }),
  defaultDeliveryMode: DeliveryMode, automationEnabled: Type.Boolean(), queueOrder: QueueOrder,
  guidance: Type.String({ maxLength: 8192 }),
}, closed);
export type ProjectConfiguration = Static<typeof ProjectConfiguration>;
export const ProjectChanges = Type.Partial(Type.Object({
  ...ProjectConfiguration.properties, source: OriginSource, queueOrder: Type.Partial(QueueOrder),
}, closed));
export type ProjectChanges = Static<typeof ProjectChanges>;
export const ConfigurationUpdate = Type.Object({ projectChanges: ProjectChanges, globalChanges: Type.Optional(GlobalChanges), profileChanges: Type.Optional(profileChanges) }, closed);
export type ConfigurationUpdate = Static<typeof ConfigurationUpdate>;
export const ProjectRevision = Type.Object({ ...ProjectConfiguration.properties, id: OperationId, projectId: OperationId, revision, createdAtMs: timestamp }, closed);
export type ProjectRevision = Static<typeof ProjectRevision>;
export const Prerequisite = Type.Object({ code: text(128), message: text(), recovery: text() }, closed);
export type Prerequisite = Static<typeof Prerequisite>;
export const ProjectSummary = Type.Object({
  id: OperationId, name: text(256), accountId: nullable(), source: ProjectConfiguration.properties.source,
  baseBranch: text(1024), revision, currentRevisionId: OperationId,
  prerequisites: Type.Array(Prerequisite, { maxItems: 100 }),
}, closed);
export type ProjectSummary = Static<typeof ProjectSummary>;
export const ProjectParams = Type.Object({ projectId: OperationId }, closed);
export const CatalogQuery = Type.Object({ search: Type.Optional(Type.String({ maxLength: 256 })), cursor: Type.Optional(text(512)), limit: Type.Optional(Type.String({ pattern: '^(?:[1-9]|[1-9][0-9]|100)$' })) }, closed);
export type CatalogQuery = Static<typeof CatalogQuery>;
export const ProjectPage = Page(ProjectSummary);
export type ProjectPage = Static<typeof ProjectPage>;
export const ProjectRegistration = Type.Object({ name: text(256), source: OriginSource, baseBranch: text(1024) }, closed);
export type ProjectRegistration = Static<typeof ProjectRegistration>;
const cursor = Type.String({ pattern: '^[0-9]+$', maxLength: 20 });
export const ProjectDetail = Type.Object({ project: ProjectSummary, prerequisites: Type.Array(Prerequisite), eventCursor: cursor }, closed);
export type ProjectDetail = Static<typeof ProjectDetail>;
export const ProjectRegistered = Type.Object({ ...ProjectDetail.properties, operationId: OperationId }, closed);
export const SettingsView = Type.Object({ settings: FactorySettings, profiles: Type.Array(StoredExecutionProfile, { maxItems: 100 }), eventCursor: cursor }, closed);
export type SettingsView = Static<typeof SettingsView>;
export const SettingsSaved = Type.Object({ ...SettingsView.properties, operationId: OperationId, receipt: OperationReceipt }, closed);
export const ConfigurationView = Type.Object({ configuration: ProjectRevision, ...SettingsView.properties, prerequisites: Type.Array(Prerequisite) }, closed);
export type ConfigurationView = Static<typeof ConfigurationView>;
export const ConfigurationSaved = Type.Object({ ...ConfigurationView.properties, operationId: OperationId, receipt: OperationReceipt }, closed);
export const ConfigurationOptionsQuery = Type.Object({
  ownerId: Type.Optional(text(256)), ownerKind: Type.Optional(GitHubProjectOwner.properties.kind),
  githubProjectId: Type.Optional(text(256)), statusFieldId: Type.Optional(text(256)),
  cursor: Type.Optional(text(512)), limit: CatalogQuery.properties.limit,
}, closed);
export type ConfigurationOptionsQuery = Static<typeof ConfigurationOptionsQuery>;
export const ConfigurationOptions = Type.Object({
  projects: Page(GitHubProject), statusFields: Type.Array(StatusField),
  statusOptions: Type.Array(Type.Object({ id: text(256), name: text(1024) }, closed)),
  profiles: Type.Array(StoredExecutionProfile, { maxItems: 100 }),
  completeness: Type.Union([Type.Literal('complete'), Type.Literal('partial'), Type.Literal('unavailable')]),
  diagnostics: Type.Array(GitHubDiagnostic), retryAtMs: Type.Union([timestamp, Type.Null()]),
}, closed);
export type ConfigurationOptions = Static<typeof ConfigurationOptions>;
