import { DeletionSummary } from './deletion-summary.js';
import { Type, type Static } from '@sinclair/typebox';
import { ArtifactPolicy, Capability, DeliveryMode, FactorySettings, OperationId, OperationReceipt, OperationWarning, Page, TimeDefaults } from './base.js';
import { GitHubDiagnostic, GitHubProject, GitHubProjectOwner, StatusField } from './github.js';
import { AccountBinding } from './github-setup.js';
import { OriginSource } from './workspaces.js';

const closed = { additionalProperties: false } as const;
const text = (maxLength = 2048) => Type.String({ minLength: 1, maxLength, pattern: '.*\\S.*' });
const nullable = (maxLength = 256) => Type.Union([text(maxLength), Type.Null()]);
const revision = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const timestamp = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
export const ProfileType = Type.Union([Type.Literal('implementer'), Type.Literal('reviewer')]);
export type ProfileType = Static<typeof ProfileType>;
/** Versioned value used by existing snapshots and the private executor protocol. */
export const ExecutionProfileValue = Type.Object({
  id: Type.Optional(OperationId), name: text(256), executor: Type.Literal('maestri-omp'),
  provider: text(256), model: text(256), effort: nullable(128), guidance: Type.String({ maxLength: 8192 }),
}, closed);
export type ExecutionProfileValue = Static<typeof ExecutionProfileValue>;
export const ExecutionProfile = Type.Object({
  name: text(256), profile_type: ProfileType, executor: Type.Literal('maestri-omp'),
  provider: text(256), model: text(256), effort: nullable(128), guidance: Type.String({ maxLength: 8192 }),
}, closed);
export type ExecutionProfile = Static<typeof ExecutionProfile>;
const profileFields = {
  name: ExecutionProfile.properties.name,
  profile_type: ProfileType,
  executor: ExecutionProfile.properties.executor,
  provider: ExecutionProfile.properties.provider,
  model: ExecutionProfile.properties.model,
  effort: ExecutionProfile.properties.effort,
  guidance: ExecutionProfile.properties.guidance,
};
export const ProfileCreate = Type.Object({
  name: profileFields.name, profile_type: ProfileType, executor: profileFields.executor,
  provider: profileFields.provider, model: profileFields.model, effort: profileFields.effort,
  guidance: Type.Optional(profileFields.guidance),
}, closed);
export type ProfileCreate = Static<typeof ProfileCreate>;
export const ProfilePatch = Type.Partial(Type.Object({
  name: profileFields.name, profile_type: ProfileType, provider: profileFields.provider,
  model: profileFields.model, effort: profileFields.effort, guidance: profileFields.guidance,
}, closed));
export type ProfilePatch = Static<typeof ProfilePatch>;
export const ProfileChanges = Type.Array(Type.Union([
  Type.Object({ action: Type.Literal('create'), profile: ProfileCreate }, closed),
  Type.Object({ action: Type.Literal('update'), id: OperationId, changes: ProfilePatch }, closed),
  Type.Object({ action: Type.Literal('delete'), id: OperationId }, closed),
]), { maxItems: 100 });
export type ProfileChanges = Static<typeof ProfileChanges>;
export const StoredExecutionProfile = Type.Object({ ...ExecutionProfile.properties, id: OperationId, revision, created_at_ms: timestamp, updated_at_ms: timestamp }, closed);
export type StoredExecutionProfile = Static<typeof StoredExecutionProfile>;
export const StoredExecutionProfileValue = Type.Object({ ...ExecutionProfileValue.properties, id: OperationId, revision, created_at_ms: timestamp, updated_at_ms: timestamp }, closed);
export type StoredExecutionProfileValue = Static<typeof StoredExecutionProfileValue>;
export const ProfileCounts = Type.Object({
  all: Type.Integer({ minimum: 0, maximum: 100 }),
  implementer: Type.Integer({ minimum: 0, maximum: 100 }),
  reviewer: Type.Integer({ minimum: 0, maximum: 100 }),
}, closed);
export type ProfileCounts = Static<typeof ProfileCounts>;
export const Prerequisite = Type.Object({ code: text(128), message: text(), recovery: text() }, closed);
export type Prerequisite = Static<typeof Prerequisite>;
export const OnboardingStep = Type.Union([Type.Literal('github'), Type.Literal('projects_root'), Type.Literal('profiles')]);
export type OnboardingStep = Static<typeof OnboardingStep>;
export const OnboardingView = Type.Object({
  suppressed: Type.Boolean(),
  completed_at_ms: Type.Union([timestamp, Type.Null()]),
  first_incomplete_step: Type.Union([OnboardingStep, Type.Null()]),
  prerequisites: Type.Array(Prerequisite, { maxItems: 4 }),
}, closed);
export type OnboardingView = Static<typeof OnboardingView>;
export const OnboardingChanges = Type.Object({
  suppressed: Type.Optional(Type.Boolean()),
  complete: Type.Optional(Type.Literal(true)),
}, { ...closed, minProperties: 1 });
export type OnboardingChanges = Static<typeof OnboardingChanges>;
export const SelectionCapabilities = Type.Object({
  projects_root: Capability,
  gh_executable: Capability,
}, closed);
export type SelectionCapabilities = Static<typeof SelectionCapabilities>;
export const GlobalConfiguration = Type.Object({
  ...Type.Pick(FactorySettings, ['projects_root', 'automation_enabled', 'time_defaults', 'artifact_policy']).properties,
  profiles: Type.Array(StoredExecutionProfile, { maxItems: 100 }),
}, closed);
export type GlobalConfiguration = Static<typeof GlobalConfiguration>;
// Nested edit objects preserve omitted fields too; arrays are explicit replacements.
export const GlobalChanges = Type.Partial(Type.Object({
  projects_root: nullable(4096), automation_enabled: Type.Boolean(),
  time_defaults: Type.Partial(TimeDefaults), artifact_policy: Type.Partial(ArtifactPolicy),
}, closed));
export type GlobalChanges = Static<typeof GlobalChanges>;
export const SettingsUpdate = Type.Object({
  changes: GlobalChanges,
  onboarding_changes: Type.Optional(OnboardingChanges),
  profile_changes: Type.Optional(ProfileChanges),
  // Persisting a GitHub CLI executable is an isolated settings command.
  gh_executable_path: Type.Optional(text(4096)),
  account_binding: Type.Optional(AccountBinding),
}, closed);
export type SettingsUpdate = Static<typeof SettingsUpdate>;
export const NativeSelectionRequest = Type.Object({ kind: Type.Union([Type.Literal('projects_root'), Type.Literal('project_directory'), Type.Literal('gh_executable')]) }, closed);
export type NativeSelectionRequest = Static<typeof NativeSelectionRequest>;
export const NativeSelectionResult = Type.Union([
  Type.Object({ state: Type.Literal('selected'), kind: NativeSelectionRequest.properties.kind, path: text(4096), observed_at_ms: timestamp }, closed),
  Type.Object({ state: Type.Literal('cancelled'), kind: NativeSelectionRequest.properties.kind, path: Type.Null() }, closed),
  Type.Object({ state: Type.Literal('unavailable'), kind: NativeSelectionRequest.properties.kind, path: Type.Null(), diagnostic: text(128) }, closed),
]);
export type NativeSelectionResult = Static<typeof NativeSelectionResult>;
export const CheckDefinition = Type.Object({
  id: text(128), command: text(4096), cwd_relative: Type.String({ minLength: 1, maxLength: 4096 }),
  timeout_ms: Type.Optional(Type.Integer({ minimum: 1, maximum: 2_147_483_647 })),
}, closed);
export type CheckDefinition = Static<typeof CheckDefinition>;
export const StatusOptionIds = Type.Object({ ready: text(256), in_progress: text(256), in_review: text(256), delivered: text(256) }, closed);
export const ProjectMapping = Type.Object({ id: text(256), owner_id: text(256), status_field_id: text(256), status_option_ids: StatusOptionIds }, closed);
export const QueueOrder = Type.Object({ priority_field_id: nullable(), priority_direction: Type.Union([Type.Literal('asc'), Type.Literal('desc')]), use_board_position: Type.Boolean() }, closed);
export const ProjectConfiguration = Type.Object({
  source: Type.Object({ ...OriginSource.properties, repository_id: Type.Optional(text(256)), repository_url: Type.Optional(text(4096)) }, closed),
  base_branch: text(1024), github_project: Type.Union([ProjectMapping, Type.Null()]),
  implementer_profile_id: Type.Union([OperationId, Type.Null()]), reviewer_profile_id: Type.Union([OperationId, Type.Null()]),
  checks: Type.Array(CheckDefinition, { maxItems: 50 }), correction_limit: Type.Integer({ minimum: 0, maximum: 5 }),
  default_delivery_mode: DeliveryMode, automation_enabled: Type.Boolean(), queue_order: QueueOrder,
  guidance: Type.String({ maxLength: 8192 }),
}, closed);
export type ProjectConfiguration = Static<typeof ProjectConfiguration>;
export const ProjectChanges = Type.Partial(Type.Object({
  ...ProjectConfiguration.properties, source: OriginSource, queue_order: Type.Partial(QueueOrder),
}, closed));
export type ProjectChanges = Static<typeof ProjectChanges>;
export const ConfigurationUpdate = Type.Object({ project_changes: ProjectChanges, global_changes: Type.Optional(GlobalChanges), profile_changes: Type.Optional(ProfileChanges) }, closed);
export type ConfigurationUpdate = Static<typeof ConfigurationUpdate>;
export const ProjectRevision = Type.Object({ ...ProjectConfiguration.properties, id: OperationId, project_id: OperationId, revision, created_at_ms: timestamp }, closed);
export type ProjectRevision = Static<typeof ProjectRevision>;
export const CatalogModel = Type.Object({
  provider: text(256), provider_name: text(256), model: text(256), model_name: text(512),
  efforts: Type.Array(text(128), { maxItems: 64 }),
}, closed);
export type CatalogModel = Static<typeof CatalogModel>;
export const ExecutionCatalog = Type.Union([
  Type.Object({
    state: Type.Literal('loaded'), executor: Type.Literal('maestri-omp'), executor_version: text(128),
    observed_at_ms: timestamp, models: Type.Array(CatalogModel, { minItems: 1, maxItems: 10_000 }),
  }, closed),
  Type.Object({
    state: Type.Literal('unavailable'), observed_at_ms: timestamp,
    diagnostics: Type.Array(Prerequisite, { minItems: 1, maxItems: 10 }),
  }, closed),
]);
export type ExecutionCatalog = Static<typeof ExecutionCatalog>;
const deletion = Type.Union([DeletionSummary, Type.Null()]);
export const ProjectSummary = Type.Object({
  deletion,
  id: OperationId, name: text(256), account_id: nullable(), source: ProjectConfiguration.properties.source,
  base_branch: text(1024), revision, current_revision_id: OperationId,
  prerequisites: Type.Array(Prerequisite, { maxItems: 100 }),
}, closed);
export type ProjectSummary = Static<typeof ProjectSummary>;
export const ProjectParams = Type.Object({ projectId: OperationId }, closed);
export const CatalogQuery = Type.Object({ search: Type.Optional(Type.String({ maxLength: 256 })), cursor: Type.Optional(text(512)), limit: Type.Optional(Type.String({ pattern: '^(?:[1-9]|[1-9][0-9]|100)$' })) }, closed);
export type CatalogQuery = Static<typeof CatalogQuery>;
export const ProjectPage = Page(ProjectSummary);
export type ProjectPage = Static<typeof ProjectPage>;
export const ProjectRegistration = Type.Object({ name: text(256), source: OriginSource, base_branch: text(1024) }, closed);
export type ProjectRegistration = Static<typeof ProjectRegistration>;
const cursor = Type.String({ pattern: '^[0-9]+$', maxLength: 20 });
export const ProjectDetail = Type.Object({ deletion, project: ProjectSummary, prerequisites: Type.Array(Prerequisite), event_cursor: cursor }, closed);
export type ProjectDetail = Static<typeof ProjectDetail>;
export const ProjectRegistered = Type.Object({ ...ProjectDetail.properties, operation_id: OperationId }, closed);
export type ProjectRegistered = Static<typeof ProjectRegistered>;
export const SettingsView = Type.Object({
  settings: FactorySettings,
  profiles: Type.Array(StoredExecutionProfile, { maxItems: 100 }),
  profile_counts: ProfileCounts,
  onboarding: OnboardingView,
  selection_capabilities: SelectionCapabilities,
  event_cursor: cursor,
}, closed);
export type SettingsView = Static<typeof SettingsView>;
export const SettingsSaved = Type.Object({
  ...SettingsView.properties, operation_id: OperationId, receipt: OperationReceipt,
  warnings: Type.Optional(Type.Array(OperationWarning, { maxItems: 10 })),
}, closed);
export type SettingsSaved = Static<typeof SettingsSaved>;
export const ConfigurationView = Type.Object({ deletion, configuration_lock: Type.Optional(Type.Union([Type.Object({ attempt_id: Type.String() }, closed), Type.Null()])), configuration: ProjectRevision, ...SettingsView.properties, prerequisites: Type.Array(Prerequisite) }, closed);
export type ConfigurationView = Static<typeof ConfigurationView>;
export const ConfigurationSaved = Type.Object({ ...ConfigurationView.properties, operation_id: OperationId, receipt: OperationReceipt }, closed);
export type ConfigurationSaved = Static<typeof ConfigurationSaved>;
export const ConfigurationOptionsQuery = Type.Object({
  owner_id: Type.Optional(text(256)), owner_kind: Type.Optional(GitHubProjectOwner.properties.kind),
  github_project_id: Type.Optional(text(256)), status_field_id: Type.Optional(text(256)),
  cursor: Type.Optional(text(512)), limit: CatalogQuery.properties.limit,
}, closed);
export type ConfigurationOptionsQuery = Static<typeof ConfigurationOptionsQuery>;
export const ConfigurationOptions = Type.Object({
  projects: Page(GitHubProject), status_fields: Type.Array(StatusField),
  status_options: Type.Array(Type.Object({ id: text(256), name: text(1024) }, closed)),
  profiles: Type.Array(StoredExecutionProfile, { maxItems: 100 }),
  completeness: Type.Union([Type.Literal('complete'), Type.Literal('partial'), Type.Literal('unavailable')]),
  diagnostics: Type.Array(GitHubDiagnostic), retry_at_ms: Type.Union([timestamp, Type.Null()]),
}, closed);
export type ConfigurationOptions = Static<typeof ConfigurationOptions>;
