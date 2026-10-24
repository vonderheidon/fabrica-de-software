import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ComposedExecutionProfileValue, DeliveryMode, GitHubId, ExecutionProfileValue, OperationId, OriginSource, PublicationTargetIntent, ScopeChange, type ProjectConfiguration, type PreparationChoices, type EffectiveConfiguration, type Criterion } from '#contracts';
import { StorageError } from './errors.js';
import { storedTimeDefaults, storedArtifactPolicy, readTimeDefaults, storeTimeDefaults, readArtifactPolicy, storeArtifactPolicy } from './common-json.js';

// Private v1 documents keep their original spelling. Never reuse a mutable public
// object shape for immutable persisted JSON. Only known contract fields are mapped.
const closed = { additionalProperties: false } as const;
const text = (maxLength = 2048) => Type.String({ minLength: 1, maxLength, pattern: '.*\\S.*' });
const nullable = (maxLength = 256) => Type.Union([text(maxLength), Type.Null()]);
const revision = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const timestamp = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
export const storedExecutionProfile = Type.Object({ ...ExecutionProfileValue.properties, id: OperationId, revision, createdAtMs: timestamp,
  updatedAtMs: timestamp, composition_version: Type.Optional(Type.Union([revision, Type.Null()])) }, closed);
export const composedExecutionProfile = Type.Object({ ...ComposedExecutionProfileValue.properties }, closed);
export const checkDefinitionJson = Type.Object({
  id: text(128), command: text(4096), cwdRelative: Type.String({ minLength: 1, maxLength: 4096 }),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 2_147_483_647 })),
}, closed);
export const legacyStatusOptionIdsJson = Type.Object({ ready: text(256), inProgress: text(256), inReview: text(256), delivered: text(256) }, closed);
export const statusOptionIdsJson = Type.Object({ backlog: text(256), ...legacyStatusOptionIdsJson.properties }, closed);
export const readStatusOptionIdsJson = Type.Union([statusOptionIdsJson, legacyStatusOptionIdsJson]);
export const projectMappingJson = Type.Object({ id: text(256), ownerId: text(256), statusFieldId: text(256), statusOptionIds: readStatusOptionIdsJson }, closed);
export const queueOrderJson = Type.Object({ priorityFieldId: nullable(), priorityDirection: Type.Union([Type.Literal('asc'), Type.Literal('desc')]), useBoardPosition: Type.Boolean() }, closed);
export const projectConfigurationJson = Type.Object({
  source: Type.Object({ ...OriginSource.properties, repositoryId: Type.Optional(text(256)), repositoryUrl: Type.Optional(text(4096)) }, closed),
  baseBranch: text(1024), githubProject: Type.Union([projectMappingJson, Type.Null()]),
  implementerProfileId: Type.Union([OperationId, Type.Null()]), reviewerProfileId: Type.Union([OperationId, Type.Null()]),
  checks: Type.Array(checkDefinitionJson, { maxItems: 50 }), correctionLimit: Type.Integer({ minimum: 0, maximum: 5 }),
  defaultDeliveryMode: DeliveryMode, automationEnabled: Type.Boolean(), queueOrder: queueOrderJson,
  guidance: Type.String({ maxLength: 8192 }),
}, closed);
const profileChoice = Type.Union([
  Type.Object({ kind: Type.Literal('reference'), id: OperationId, revision }, closed),
  Type.Object({ kind: Type.Literal('value'), profile: ExecutionProfileValue }, closed),
]);
export const preparationOverridesJson = Type.Partial(Type.Object({
  baseBranch: projectConfigurationJson.properties.baseBranch,
  implementerProfile: profileChoice, reviewerProfile: profileChoice,
  checks: projectConfigurationJson.properties.checks, correctionLimit: projectConfigurationJson.properties.correctionLimit,
  timeDefaults: storedTimeDefaults, artifactPolicy: storedArtifactPolicy,
}, closed));
export const preparationChoicesJson = Type.Object({
  issueId: GitHubId, deliveryMode: DeliveryMode, guidance: Type.String({ maxLength: 8192 }), overrides: preparationOverridesJson,
  publication_target: Type.Optional(Type.Union([PublicationTargetIntent, Type.Null()])),
  previousAttemptId: Type.Optional(OperationId),
}, closed);
const origin = Type.Union([Type.Literal('project'), Type.Literal('global'), Type.Literal('preparation')]);
export const choiceOriginsJson = Type.Object({
  baseBranch: origin, implementerProfile: origin, reviewerProfile: origin, checks: origin, correctionLimit: origin,
  timeDefaults: origin, artifactPolicy: origin, guidance: origin, deliveryMode: origin,
}, closed);
export const effectiveConfigurationJson = Type.Object({
  configuration: projectConfigurationJson, projectRevisionId: OperationId, settingsRevision: revision,
  implementerProfile: Type.Union([ExecutionProfileValue, composedExecutionProfile, storedExecutionProfile, Type.Null()]),
  reviewerProfile: Type.Union([ExecutionProfileValue, composedExecutionProfile, storedExecutionProfile, Type.Null()]),
  timeDefaults: storedTimeDefaults, artifactPolicy: storedArtifactPolicy,
  guidance: Type.String({ maxLength: 16385 }),
  origins: choiceOriginsJson,
}, closed);
export const criterionJson = Type.Object({ id: Type.String({ pattern: '^ac-[1-9][0-9]*$', maxLength: 128 }), text: Type.String({ minLength: 1, maxLength: 65536 }), occurrenceIndex: revision, explicit: Type.Boolean() }, closed);

export function readCheck(value: Static<typeof checkDefinitionJson>): ProjectConfiguration['checks'][number] {
  return {
    id: value.id,
    command: value.command,
    cwd_relative: value.cwdRelative,
    ...(value.timeoutMs === undefined ? {} : { timeout_ms: value.timeoutMs }),
  };
}

export function storeCheck(value: ProjectConfiguration['checks'][number]): Static<typeof checkDefinitionJson> {
  return {
    id: value.id,
    command: value.command,
    cwdRelative: value.cwd_relative,
    ...(value.timeout_ms === undefined ? {} : { timeoutMs: value.timeout_ms }),
  };
}

export function readStatusOptions(value: Static<typeof readStatusOptionIdsJson>): NonNullable<ProjectConfiguration['github_project']>['status_option_ids'] {
  return {
    ...('backlog' in value ? { backlog: value.backlog } : {}),
    ready: value.ready,
    in_progress: value.inProgress,
    in_review: value.inReview,
    delivered: value.delivered,
  };
}

export function storeStatusOptions(value: NonNullable<ProjectConfiguration['github_project']>['status_option_ids']): Static<typeof readStatusOptionIdsJson> {
  return {
    ...('backlog' in value ? { backlog: value.backlog } : {}),
    ready: value.ready,
    inProgress: value.in_progress,
    inReview: value.in_review,
    delivered: value.delivered,
  };
}

export function readQueueOrder(value: Static<typeof queueOrderJson>): ProjectConfiguration['queue_order'] {
  return {
    priority_field_id: value.priorityFieldId,
    priority_direction: value.priorityDirection,
    use_board_position: value.useBoardPosition,
  };
}

export function storeQueueOrder(value: ProjectConfiguration['queue_order']): Static<typeof queueOrderJson> {
  return {
    priorityFieldId: value.priority_field_id,
    priorityDirection: value.priority_direction,
    useBoardPosition: value.use_board_position,
  };
}

export function readSource(value: Static<typeof projectConfigurationJson>['source']): ProjectConfiguration['source'] {
  return {
    kind: value.kind,
    location: value.location,
    ...(value.repositoryId === undefined ? {} : { repository_id: value.repositoryId }),
    ...(value.repositoryUrl === undefined ? {} : { repository_url: value.repositoryUrl }),
  };
}

export function storeSource(value: ProjectConfiguration['source']): Static<typeof projectConfigurationJson>['source'] {
  return {
    kind: value.kind,
    location: value.location,
    ...(value.repository_id === undefined ? {} : { repositoryId: value.repository_id }),
    ...(value.repository_url === undefined ? {} : { repositoryUrl: value.repository_url }),
  };
}

export function readMapping(value: Static<typeof projectMappingJson>): NonNullable<ProjectConfiguration['github_project']> {
  return {
    id: value.id,
    owner_id: value.ownerId,
    status_field_id: value.statusFieldId,
    status_option_ids: readStatusOptions(value.statusOptionIds),
  };
}

export function storeMapping(value: NonNullable<ProjectConfiguration['github_project']>): Static<typeof projectMappingJson> {
  return {
    id: value.id,
    ownerId: value.owner_id,
    statusFieldId: value.status_field_id,
    statusOptionIds: storeStatusOptions(value.status_option_ids),
  };
}

export function readProjectConfiguration(value: Static<typeof projectConfigurationJson>): ProjectConfiguration {
  return {
    source: readSource(value.source),
    base_branch: value.baseBranch,
    github_project: value.githubProject === null ? null : readMapping(value.githubProject),
    implementer_profile_id: value.implementerProfileId,
    reviewer_profile_id: value.reviewerProfileId,
    checks: value.checks.map(readCheck),
    correction_limit: value.correctionLimit,
    default_delivery_mode: value.defaultDeliveryMode,
    automation_enabled: value.automationEnabled,
    queue_order: readQueueOrder(value.queueOrder),
    guidance: value.guidance,
  };
}

export function storeProjectConfiguration(value: ProjectConfiguration): Static<typeof projectConfigurationJson> {
  return {
    source: storeSource(value.source),
    baseBranch: value.base_branch,
    githubProject: value.github_project === null ? null : storeMapping(value.github_project),
    implementerProfileId: value.implementer_profile_id,
    reviewerProfileId: value.reviewer_profile_id,
    checks: value.checks.map(storeCheck),
    correctionLimit: value.correction_limit,
    defaultDeliveryMode: value.default_delivery_mode,
    automationEnabled: value.automation_enabled,
    queueOrder: storeQueueOrder(value.queue_order),
    guidance: value.guidance,
  };
}

export function readOrigins(value: Static<typeof choiceOriginsJson>): EffectiveConfiguration['origins'] {
  return {
    base_branch: value.baseBranch,
    implementer_profile: value.implementerProfile,
    reviewer_profile: value.reviewerProfile,
    checks: value.checks,
    correction_limit: value.correctionLimit,
    time_defaults: value.timeDefaults,
    artifact_policy: value.artifactPolicy,
    guidance: value.guidance,
    delivery_mode: value.deliveryMode,
  };
}

export function storeOrigins(value: EffectiveConfiguration['origins']): Static<typeof choiceOriginsJson> {
  return {
    baseBranch: value.base_branch,
    implementerProfile: value.implementer_profile,
    reviewerProfile: value.reviewer_profile,
    checks: value.checks,
    correctionLimit: value.correction_limit,
    timeDefaults: value.time_defaults,
    artifactPolicy: value.artifact_policy,
    guidance: value.guidance,
    deliveryMode: value.delivery_mode,
  };
}

export function readCriterion(value: Static<typeof criterionJson>): Criterion {
  return {
    id: value.id,
    text: value.text,
    occurrence_index: value.occurrenceIndex,
    explicit: value.explicit,
  };
}

export function storeCriterion(value: Criterion): Static<typeof criterionJson> {
  return {
    id: value.id,
    text: value.text,
    occurrenceIndex: value.occurrence_index,
    explicit: value.explicit,
  };
}

function readProfile(value: Static<typeof effectiveConfigurationJson>['implementerProfile']): EffectiveConfiguration['implementer_profile'] {
  if (value === null || !('createdAtMs' in value)) return value;
  const { createdAtMs, updatedAtMs, ...profile } = value;
  return { ...profile, created_at_ms: createdAtMs, updated_at_ms: updatedAtMs };
}
function storeProfile(value: EffectiveConfiguration['implementer_profile']): Static<typeof effectiveConfigurationJson>['implementerProfile'] {
  if (value === null || !('created_at_ms' in value)) return value;
  const { created_at_ms, updated_at_ms, ...profile } = value;
  return { ...profile, createdAtMs: created_at_ms, updatedAtMs: updated_at_ms };
}
export function readEffectiveConfiguration(value: Static<typeof effectiveConfigurationJson>): EffectiveConfiguration {
  return {
    configuration: readProjectConfiguration(value.configuration),
    project_revision_id: value.projectRevisionId,
    settings_revision: value.settingsRevision,
    implementer_profile: readProfile(value.implementerProfile),
    reviewer_profile: readProfile(value.reviewerProfile),
    time_defaults: readTimeDefaults(value.timeDefaults),
    artifact_policy: readArtifactPolicy(value.artifactPolicy),
    guidance: value.guidance,
    origins: readOrigins(value.origins),
  };
}

export function storeEffectiveConfiguration(value: EffectiveConfiguration): Static<typeof effectiveConfigurationJson> {
  return {
    configuration: storeProjectConfiguration(value.configuration),
    projectRevisionId: value.project_revision_id,
    settingsRevision: value.settings_revision,
    implementerProfile: storeProfile(value.implementer_profile),
    reviewerProfile: storeProfile(value.reviewer_profile),
    timeDefaults: storeTimeDefaults(value.time_defaults),
    artifactPolicy: storeArtifactPolicy(value.artifact_policy),
    guidance: value.guidance,
    origins: storeOrigins(value.origins),
  };
}
export function readOverrides(value: Static<typeof preparationOverridesJson>): PreparationChoices['overrides'] {
  return {
    ...(value.baseBranch === undefined ? {} : { base_branch: value.baseBranch }),
    ...(value.implementerProfile === undefined ? {} : { implementer_profile: value.implementerProfile }),
    ...(value.reviewerProfile === undefined ? {} : { reviewer_profile: value.reviewerProfile }),
    ...(value.checks === undefined ? {} : { checks: value.checks.map(readCheck) }),
    ...(value.correctionLimit === undefined ? {} : { correction_limit: value.correctionLimit }),
    ...(value.timeDefaults === undefined ? {} : { time_defaults: readTimeDefaults(value.timeDefaults) }),
    ...(value.artifactPolicy === undefined ? {} : { artifact_policy: readArtifactPolicy(value.artifactPolicy) }),
  };
}

export function storeOverrides(value: PreparationChoices['overrides']): Static<typeof preparationOverridesJson> {
  return {
    ...(value.base_branch === undefined ? {} : { baseBranch: value.base_branch }),
    ...(value.implementer_profile === undefined ? {} : { implementerProfile: value.implementer_profile }),
    ...(value.reviewer_profile === undefined ? {} : { reviewerProfile: value.reviewer_profile }),
    ...(value.checks === undefined ? {} : { checks: value.checks.map(storeCheck) }),
    ...(value.correction_limit === undefined ? {} : { correctionLimit: value.correction_limit }),
    ...(value.time_defaults === undefined ? {} : { timeDefaults: storeTimeDefaults(value.time_defaults) }),
    ...(value.artifact_policy === undefined ? {} : { artifactPolicy: storeArtifactPolicy(value.artifact_policy) }),
  };
}
export function readChoices(value: Static<typeof preparationChoicesJson>): PreparationChoices {
  return {
    issue_id: value.issueId,
    delivery_mode: value.deliveryMode,
    guidance: value.guidance,
    overrides: readOverrides(value.overrides),
    ...(value.publication_target === undefined ? {} : { publication_target: value.publication_target }),
    ...(value.previousAttemptId === undefined ? {} : { previous_attempt_id: value.previousAttemptId }),
  };
}

export function storeChoices(value: PreparationChoices): Static<typeof preparationChoicesJson> {
  return {
    issueId: value.issue_id,
    deliveryMode: value.delivery_mode,
    guidance: value.guidance,
    overrides: storeOverrides(value.overrides),
    ...(value.publication_target === undefined ? {} : { publication_target: value.publication_target }),
    ...(value.previous_attempt_id === undefined ? {} : { previousAttemptId: value.previous_attempt_id }),
  };
}

export function readCheckDefinitions(value: unknown): ProjectConfiguration['checks'] {
  if (!Value.Check(Type.Array(checkDefinitionJson, { maxItems: 50 }), value)) throw new StorageError('PROJECT_DATA_INVALID');
  return value.map(readCheck);
}
export function readStatusOptionIds(value: unknown): NonNullable<ProjectConfiguration['github_project']>['status_option_ids'] {
  if (!Value.Check(readStatusOptionIdsJson, value)) throw new StorageError('PROJECT_DATA_INVALID');
  return readStatusOptions(value);
}
export function readQueueOrderJson(value: unknown): ProjectConfiguration['queue_order'] {
  if (!Value.Check(queueOrderJson, value)) throw new StorageError('PROJECT_DATA_INVALID');
  return readQueueOrder(value);
}

const scopeChangeJson = Type.Object({ ...ScopeChange.properties,
  capturedCriteria: Type.Array(criterionJson, { maxItems: 1000 }),
  currentCriteria: Type.Array(criterionJson, { maxItems: 1000 }),
}, closed);
export function readScopeChange(value: unknown): ScopeChange {
  if (!Value.Check(scopeChangeJson, value)) throw new StorageError('OPERATION_DATA_INVALID');
  return { ...value, capturedCriteria: value.capturedCriteria.map(readCriterion), currentCriteria: value.currentCriteria.map(readCriterion) };
}
export function serializeScopeChange(value: ScopeChange): string {
  if (!Value.Check(ScopeChange, value)) throw new StorageError('OPERATION_DATA_INVALID');
  return JSON.stringify({ ...value, capturedCriteria: value.capturedCriteria.map(storeCriterion), currentCriteria: value.currentCriteria.map(storeCriterion) });
}
