import { Type, type Static } from '@sinclair/typebox';
import { ArtifactPolicy, DeliveryMode, OperationId, OperationReceipt, Page, TimeDefaults } from './base.js';
import { GitHubDiagnostic, GitHubId, ConfigurationIssueContext, ConfigurationIssueOption } from './github.js';
import { ComposedExecutionProfileValue, ExecutionProfileValue, Prerequisite, ProjectConfiguration, StoredExecutionProfileValue } from './projects.js';
import { AttemptWorkspaceSnapshot, WorkspaceIdentity } from './workspaces.js';

const closed = { additionalProperties: false } as const;
const revision = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const text = (maxLength = 256) => Type.String({ minLength: 1, maxLength });
const sha = Type.String({ pattern: '^(?:[0-9a-f]{40}|[0-9a-f]{64})$' });
const hash = Type.String({ pattern: '^[0-9a-f]{64}$' });
const profileChoice = Type.Union([
  Type.Object({ kind: Type.Literal('reference'), id: OperationId, revision }, closed),
  Type.Object({ kind: Type.Literal('value'), profile: ExecutionProfileValue }, closed),
]);
export const PreparationOverrides = Type.Partial(Type.Object({
  base_branch: ProjectConfiguration.properties.base_branch,
  implementer_profile: profileChoice, reviewer_profile: profileChoice,
  correction_limit: ProjectConfiguration.properties.correction_limit,
  time_defaults: TimeDefaults, artifact_policy: ArtifactPolicy,
}, closed));
export type PreparationOverrides = Static<typeof PreparationOverrides>;
export const PreparationChoices = Type.Object({
  issue_id: GitHubId, delivery_mode: DeliveryMode, guidance: Type.String({ maxLength: 8192 }), overrides: PreparationOverrides,
  previous_attempt_id: Type.Optional(OperationId),
}, closed);
export type PreparationChoices = Static<typeof PreparationChoices>;
export const PreparationChanges = Type.Partial(Type.Omit(PreparationChoices, ['previous_attempt_id']));
export const PreparationUpdate = Type.Object({ changes: PreparationChanges }, closed);
export type PreparationUpdate = Static<typeof PreparationUpdate>;
export const PreparationRecord = Type.Object({
  ...PreparationChoices.properties,
  id: OperationId, project_id: OperationId, project_revision_id: OperationId, revision,
}, closed);
export type PreparationRecord = Static<typeof PreparationRecord>;
export const Criterion = Type.Object({ id: Type.String({ pattern: '^ac-[1-9][0-9]*$', maxLength: 128 }), text: text(65536), occurrence_index: revision, explicit: Type.Boolean() }, closed);
export type Criterion = Static<typeof Criterion>;
export const CriteriaPreview = Type.Object({
  executable: Type.Boolean(), objective: Type.String({ maxLength: 1_000_000 }), criteria: Type.Array(Criterion, { maxItems: 1000 }),
  digest: hash, reasons: Type.Array(text(128), { maxItems: 20 }),
}, closed);
export type CriteriaPreview = Static<typeof CriteriaPreview>;
const origin = Type.Union([Type.Literal('project'), Type.Literal('global'), Type.Literal('preparation')]);
export const ChoiceOrigins = Type.Object({
  base_branch: origin, implementer_profile: origin, reviewer_profile: origin, correction_limit: origin,
  time_defaults: origin, artifact_policy: origin, guidance: origin, delivery_mode: origin,
}, closed);
export const EffectiveConfiguration = Type.Object({
  configuration: ProjectConfiguration, project_revision_id: OperationId, settings_revision: revision,
  implementer_profile: Type.Union([ExecutionProfileValue, ComposedExecutionProfileValue, StoredExecutionProfileValue, Type.Null()]),
  reviewer_profile: Type.Union([ExecutionProfileValue, ComposedExecutionProfileValue, StoredExecutionProfileValue, Type.Null()]),
  time_defaults: TimeDefaults, artifact_policy: ArtifactPolicy,
  guidance: Type.String({ maxLength: 16385 }),
  origins: ChoiceOrigins,
}, closed);
export type EffectiveConfiguration = Static<typeof EffectiveConfiguration>;
export const PreparationEffect = Type.Object({
  kind: Type.Union((['clone', 'execute', 'local_commit', 'push', 'pull_request', 'issue_comment', 'issue_body', 'project_status'] as const).map((kind) => Type.Literal(kind))),
  requested: Type.Boolean(), description: text(2048),
}, closed);
export const Preparation = Type.Object({
  ...PreparationRecord.properties, prerequisites: Type.Array(Prerequisite, { maxItems: 100 }), effective_configuration: EffectiveConfiguration,
  criteria_preview: CriteriaPreview, effects_preview: Type.Array(PreparationEffect),
  issue: Type.Union([ConfigurationIssueContext, Type.Null()]), base_sha: Type.Union([sha, Type.Null()]),
  summary_hash: hash, diagnostics: Type.Array(GitHubDiagnostic),
  retry_at_ms: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  // Preview only. A future start command must revalidate and persist intent before effects.
  can_start: Type.Literal(false),
}, closed);
export type Preparation = Static<typeof Preparation>;
export const PreparationParams = Type.Object({ preparationId: OperationId }, closed);
export const PreparationView = Type.Object({ preparation: Preparation, event_cursor: Type.String({ pattern: '^[0-9]+$' }) }, closed);
export type PreparationView = Static<typeof PreparationView>;
export const PreparationCreated = Type.Object({ ...PreparationView.properties, operation_id: OperationId, receipt: OperationReceipt }, closed);
export type PreparationCreated = Static<typeof PreparationCreated>;
export const IssueOptions = Type.Object({
  ...Page(Type.Object({ ...ConfigurationIssueOption.properties, reasons: Type.Array(text(128)) }, closed)).properties,
  completeness: Type.Union([Type.Literal('complete'), Type.Literal('partial'), Type.Literal('unavailable')]),
  diagnostics: Type.Array(GitHubDiagnostic), retry_at_ms: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  prerequisites: Type.Array(Prerequisite),
}, closed);
export type IssueOptions = Static<typeof IssueOptions>;
export const WorkspacePreparation = Type.Object({
  attemptId: OperationId, workspace: WorkspaceIdentity, issueNumber: Type.Integer({ minimum: 1, maximum: 2_147_483_647 }),
  source: ProjectConfiguration.properties.source, baseSha: sha, predecessorAttemptId: Type.Union([OperationId, Type.Null()]),
  inheritedBaseSha: Type.Union([sha, Type.Null()]),
}, closed);
export type WorkspacePreparation = Static<typeof WorkspacePreparation>;
export const PreparedWorkspace = Type.Object({
  state: Type.Union([Type.Literal('prepared'), Type.Literal('failed')]), attemptId: OperationId, workspace: WorkspaceIdentity,
  resource: Type.Object({ kind: Type.Literal('implementation'), path: text(8192), owned: Type.Boolean() }, closed),
  baseSha: sha, branch: text(1024), snapshot: Type.Union([AttemptWorkspaceSnapshot, Type.Null()]),
  diagnostic: Type.Union([Type.Object({ code: text(128), message: text(2048), recovery: text(2048) }, closed), Type.Null()]),
}, closed);
export type PreparedWorkspace = Static<typeof PreparedWorkspace>;
