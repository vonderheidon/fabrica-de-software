import { Type, type Static } from '@sinclair/typebox';
import { ArtifactPolicy, CostDefaults, DeliveryMode, OperationId, OperationReceipt, Page, TimeDefaults } from './base.js';
import { GitHubDiagnostic, GitHubId, IssueContext, ProjectItem } from './github.js';
import { ExecutionProfile, Prerequisite, ProjectConfiguration, StoredExecutionProfile } from './projects.js';

const closed = { additionalProperties: false } as const;
const revision = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const text = (maxLength = 256) => Type.String({ minLength: 1, maxLength });
const sha = Type.String({ pattern: '^(?:[0-9a-f]{40}|[0-9a-f]{64})$' });
const hash = Type.String({ pattern: '^[0-9a-f]{64}$' });
const profileChoice = Type.Union([
  Type.Object({ kind: Type.Literal('reference'), id: OperationId, revision }, closed),
  Type.Object({ kind: Type.Literal('value'), profile: ExecutionProfile }, closed),
]);
export const PreparationOverrides = Type.Partial(Type.Object({
  baseBranch: ProjectConfiguration.properties.baseBranch,
  implementerProfile: profileChoice, reviewerProfile: profileChoice,
  checks: ProjectConfiguration.properties.checks, correctionLimit: ProjectConfiguration.properties.correctionLimit,
  timeDefaults: TimeDefaults, costDefaults: CostDefaults, artifactPolicy: ArtifactPolicy,
}, closed));
export type PreparationOverrides = Static<typeof PreparationOverrides>;
export const PreparationChoices = Type.Object({
  issueId: GitHubId, deliveryMode: DeliveryMode, guidance: Type.String({ maxLength: 8192 }), overrides: PreparationOverrides,
  previousAttemptId: Type.Optional(OperationId),
}, closed);
export type PreparationChoices = Static<typeof PreparationChoices>;
export const PreparationChoiceSnapshot = Type.Object({ formatVersion: Type.Literal(1), choices: PreparationChoices }, closed);
export const PreparationChanges = Type.Partial(Type.Omit(PreparationChoices, ['previousAttemptId']));
export const PreparationUpdate = Type.Object({ changes: PreparationChanges }, closed);
export type PreparationUpdate = Static<typeof PreparationUpdate>;
export const PreparationRecord = Type.Object({
  ...PreparationChoices.properties, id: OperationId, projectId: OperationId, projectRevisionId: OperationId, revision,
}, closed);
export type PreparationRecord = Static<typeof PreparationRecord>;
export const Criterion = Type.Object({ id: Type.String({ pattern: '^ac-[1-9][0-9]*$', maxLength: 128 }), text: text(65536), occurrenceIndex: revision, explicit: Type.Boolean() }, closed);
export type Criterion = Static<typeof Criterion>;
export const CriteriaPreview = Type.Object({
  executable: Type.Boolean(), objective: Type.String({ maxLength: 1_000_000 }), criteria: Type.Array(Criterion, { maxItems: 1000 }),
  digest: hash, reasons: Type.Array(text(128), { maxItems: 20 }),
}, closed);
export type CriteriaPreview = Static<typeof CriteriaPreview>;
const origin = Type.Union([Type.Literal('project'), Type.Literal('global'), Type.Literal('preparation')]);
export const ChoiceOrigins = Type.Object({
  baseBranch: origin, implementerProfile: origin, reviewerProfile: origin, checks: origin, correctionLimit: origin,
  timeDefaults: origin, costDefaults: origin, artifactPolicy: origin, guidance: origin, deliveryMode: origin,
}, closed);
export const EffectiveConfiguration = Type.Object({
  configuration: ProjectConfiguration, projectRevisionId: OperationId, settingsRevision: revision,
  implementerProfile: Type.Union([ExecutionProfile, StoredExecutionProfile, Type.Null()]),
  reviewerProfile: Type.Union([ExecutionProfile, StoredExecutionProfile, Type.Null()]),
  timeDefaults: TimeDefaults, costDefaults: CostDefaults, artifactPolicy: ArtifactPolicy,
  guidance: Type.String({ maxLength: 16385 }),
  origins: ChoiceOrigins,
}, closed);
export type EffectiveConfiguration = Static<typeof EffectiveConfiguration>;
export const PreparationEffect = Type.Object({
  kind: Type.Union((['clone', 'execute', 'local_commit', 'push', 'pull_request', 'issue_comment', 'project_status'] as const).map((kind) => Type.Literal(kind))),
  requested: Type.Boolean(), description: text(2048),
}, closed);
export const Preparation = Type.Object({
  ...PreparationRecord.properties, prerequisites: Type.Array(Prerequisite, { maxItems: 100 }), effectiveConfiguration: EffectiveConfiguration,
  criteriaPreview: CriteriaPreview, effectsPreview: Type.Array(PreparationEffect),
  issue: Type.Union([IssueContext, Type.Null()]), baseSha: Type.Union([sha, Type.Null()]),
  summaryHash: hash, diagnostics: Type.Array(GitHubDiagnostic),
  retryAtMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  // Preview only. A future start command must revalidate and persist intent before effects.
  canStart: Type.Literal(false),
}, closed);
export type Preparation = Static<typeof Preparation>;
export const PreparationParams = Type.Object({ preparationId: OperationId }, closed);
export const PreparationView = Type.Object({ preparation: Preparation, eventCursor: Type.String({ pattern: '^[0-9]+$' }) }, closed);
export type PreparationView = Static<typeof PreparationView>;
export const PreparationCreated = Type.Object({ ...PreparationView.properties, operationId: OperationId, receipt: OperationReceipt }, closed);
export type PreparationCreated = Static<typeof PreparationCreated>;
export const IssueOptions = Type.Object({
  ...Page(Type.Object({ ...ProjectItem.properties, reasons: Type.Array(text(128)) }, closed)).properties,
  completeness: Type.Union([Type.Literal('complete'), Type.Literal('partial'), Type.Literal('unavailable')]),
  diagnostics: Type.Array(GitHubDiagnostic), retryAtMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  prerequisites: Type.Array(Prerequisite),
}, closed);
export type IssueOptions = Static<typeof IssueOptions>;
export const WorkspacePreparation = Type.Object({
  attemptId: OperationId, issueNumber: Type.Integer({ minimum: 1, maximum: 2_147_483_647 }),
  source: ProjectConfiguration.properties.source, baseSha: sha,
}, closed);
export type WorkspacePreparation = Static<typeof WorkspacePreparation>;
export const PreparedWorkspace = Type.Object({
  state: Type.Union([Type.Literal('prepared'), Type.Literal('failed')]), attemptId: OperationId,
  resource: Type.Object({ kind: Type.Literal('implementation'), path: text(8192), owned: Type.Boolean() }, closed),
  baseSha: sha, branch: text(1024),
  diagnostic: Type.Union([Type.Object({ code: text(128), message: text(2048), recovery: text(2048) }, closed), Type.Null()]),
}, closed);
export type PreparedWorkspace = Static<typeof PreparedWorkspace>;
