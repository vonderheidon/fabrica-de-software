import { Type, type Static } from '@sinclair/typebox';
import { Capability, DeliveryMode, OperationId } from './base.js';
import { GitHubId } from './github.js';
import { ProjectConfiguration } from './projects.js';

const closed = { additionalProperties: false } as const;
const text = Type.String({ minLength: 1, maxLength: 4096 });
const nullable = <T extends import('@sinclair/typebox').TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
export const EffectIdentity = Type.Object({
  branchKind: Type.Optional(Type.Union([Type.Literal('new'), Type.Literal('existing')])),
  repositoryId: Type.Optional(GitHubId), issueId: Type.Optional(GitHubId),
  ownerId: Type.Optional(GitHubId), visibility: Type.Optional(Type.Union([Type.Literal('private'), Type.Literal('public')])),
  planHash: Type.Optional(Type.String({ pattern: '^[a-f0-9]{64}$' })),
  contentIdentity: Type.Optional(Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' })),
  parentSha: Type.Optional(Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' })),
  branchRef: Type.Optional(text), issueNumber: Type.Optional(Type.Integer({ minimum: 1 })),
  commitSha: Type.Optional(Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' })),
  commitOperationId: Type.Optional(OperationId),
  repositoryOwner: Type.Optional(text), repositoryName: Type.Optional(text), baseBranch: Type.Optional(text), title: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
  targetOperationId: Type.Optional(OperationId), taskType: Type.Optional(Type.Union(['feat','fix','docs','refactor','test','chore','perf','build','ci','revert'].map(v => Type.Literal(v)))),
  taskDescription: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
  commitTime: Type.Optional(Type.Integer({ minimum: 1, maximum: 253402300799 })),
  marker: Type.Optional(text), bodyHash: Type.Optional(Type.String({ pattern: '^[a-f0-9]{64}$' })),
  criterionIds: Type.Optional(Type.Array(Type.String({ pattern: '^ac-[1-9][0-9]*$', maxLength: 128 }), { minItems: 1, maxItems: 1000 })),
  projectId: Type.Optional(GitHubId), itemId: Type.Optional(GitHubId), fieldId: Type.Optional(GitHubId),
  optionId: Type.Optional(GitHubId), previousOptionId: Type.Optional(nullable(GitHubId)),
}, closed);
export type EffectIdentity = Static<typeof EffectIdentity>;
export const EffectReceipt = Type.Object({ id: GitHubId, url: Type.Optional(text), optionId: Type.Optional(GitHubId),
  contentIdentity: Type.Optional(text), parentSha: Type.Optional(text), branchRef: Type.Optional(text), operationId: Type.Optional(OperationId),
  commitSha: Type.Optional(text), repositoryId: Type.Optional(GitHubId), baseBranch: Type.Optional(text), targetOperationId: Type.Optional(OperationId),
  taskType: Type.Optional(Type.String({ minLength: 1, maxLength: 16 })), taskDescription: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
  ownerId: Type.Optional(GitHubId), repositoryName: Type.Optional(text), visibility: Type.Optional(Type.Union([Type.Literal('private'), Type.Literal('public')])),
}, closed);
export type EffectReceipt = Static<typeof EffectReceipt>;
export const EffectView = Type.Object({
  operationId: OperationId, attemptId: nullable(OperationId), creationId: nullable(OperationId), deliveryId: nullable(OperationId),
  kind: Type.Union([Type.Literal('issue_comment'), Type.Literal('issue_body'), Type.Literal('project_status'), Type.Literal('local_commit'), Type.Literal('push'), Type.Literal('pull_request'), Type.Literal('create_repository'), Type.Literal('associate_origin'), Type.Literal('baseline_push')]), scopeKey: text,
  state: Type.Union(['not_requested', 'not_started', 'running', 'confirmed', 'failed_known', 'unknown', 'not_applicable'].map(v => Type.Literal(v))),
  expectedIdentity: EffectIdentity, confirmedIdentity: nullable(EffectReceipt), receipt: nullable(EffectReceipt),
  reason: nullable(Type.String({ maxLength: 128 })), authorized: Type.Boolean(), revision: Type.Integer({ minimum: 1 }),
  sentAtMs: nullable(Type.Integer()), confirmedAtMs: nullable(Type.Integer()),
}, closed);
export type EffectView = Static<typeof EffectView>;
export const CompletePublication = Type.Object({ deliveryId: OperationId, authorizedMode: DeliveryMode, authorized: Type.Literal(true) }, closed);
export type CompletePublication = Static<typeof CompletePublication>;
export const ReconcilePublication = Type.Object({ deliveryId: OperationId }, closed);
export type ReconcilePublication = Static<typeof ReconcilePublication>;
export const AuthorizeUpgrade = Type.Object({ deliveryId: OperationId, currentMode: DeliveryMode, targetMode: DeliveryMode,
  authorizedAdditionalEffectsHash: Type.String({ pattern: '^[a-f0-9]{64}$' }), authorized: Type.Literal(true) }, closed);
export type AuthorizeUpgrade = Static<typeof AuthorizeUpgrade>;
export const ModeUpgradeSummary = Type.Object({ targetMode: DeliveryMode, additionalEffects: Type.Array(EffectView.properties.kind),
  deliveryBranch: ProjectConfiguration.properties.delivery_branch,
  summaryHash: Type.String({ pattern: '^[a-f0-9]{64}$' }), capability: Capability }, closed);
export type ModeUpgradeSummary = Static<typeof ModeUpgradeSummary>;
/** Why the local commit could not land in the Pasta do projeto; bounded so a dirty folder never inflates the summary. */
export const LocalCommitBlock = Type.Object({
  paths: Type.Array(Type.String({ minLength: 1, maxLength: 1024 }), { maxItems: 100 }), pathCount: Type.Integer({ minimum: 0 }),
  expectedBranch: nullable(Type.String({ minLength: 1, maxLength: 1024 })), currentBranch: nullable(Type.String({ minLength: 1, maxLength: 1024 })),
}, closed);
export type LocalCommitBlock = Static<typeof LocalCommitBlock>;
/** Reasons proving that an unresolved `local_commit` never landed on the target branch and may close as `failed_known`. */
export const localCommitAbsentReasons = [
  'COMMIT_NOT_OBSERVED',
  'PROJECT_FOLDER_DIRTY',
  'PROJECT_FOLDER_UNTRACKED_CONFLICT',
  'PROJECT_FOLDER_PATH_HIDDEN',
  'PROJECT_FOLDER_BUSY',
  'PROJECT_FOLDER_DETACHED_HEAD',
  'PROJECT_FOLDER_BRANCH_CHANGED',
  'PROJECT_FOLDER_CONFIG_CHANGED',
  'PROJECT_FOLDER_REFUSED',
  'PROJECT_FOLDER_REPAIR_REFUSED',
  'PROJECT_FOLDER_SUBMODULE_UNSUPPORTED',
  'PROJECT_FOLDER_SYMLINK_UNSUPPORTED',
  'PROJECT_FOLDER_NTFS_NAME_INVALID',
  'PROJECT_FOLDER_FILTER_UNSUPPORTED',
  'PROJECT_FOLDER_SPARSE_CHECKOUT',
] as const;
/** Project-folder diagnostics that keep `local_commit` `unknown` while surfacing actionable paths to the operator. */
export const localCommitUnresolvedBlockReasons = [
  'PROJECT_FOLDER_REPAIR_FAILED',
  'PROJECT_FOLDER_LANDING_UNVERIFIED',
  'PROJECT_FOLDER_BUSY',
  'PROJECT_FOLDER_DETACHED_HEAD',
  'PROJECT_FOLDER_BRANCH_CHANGED',
  'PROJECT_FOLDER_CONFIG_CHANGED',
  'PROJECT_FOLDER_PATH_HIDDEN',
  'PROJECT_FOLDER_SUBMODULE_UNSUPPORTED',
  'PROJECT_FOLDER_SYMLINK_UNSUPPORTED',
  'PROJECT_FOLDER_NTFS_NAME_INVALID',
  'PROJECT_FOLDER_FILTER_UNSUPPORTED',
  'PROJECT_FOLDER_SPARSE_CHECKOUT',
  'PROJECT_FOLDER_REPAIR_REFUSED',
  'DELIVERY_BASE_CHANGED',
] as const;
/** Project-folder codes surfaced on `local_commit` blocks and operation diagnostics. */
export const localCommitFolderBlockReasons = [
  'PROJECT_FOLDER_DIRTY',
  'PROJECT_FOLDER_UNTRACKED_CONFLICT',
  'PROJECT_FOLDER_PATH_HIDDEN',
  'PROJECT_FOLDER_BUSY',
  'PROJECT_FOLDER_DETACHED_HEAD',
  'PROJECT_FOLDER_BRANCH_CHANGED',
  'PROJECT_FOLDER_CONFIG_CHANGED',
  'PROJECT_FOLDER_REFUSED',
  'PROJECT_FOLDER_REPAIR_REFUSED',
  'PROJECT_FOLDER_REPAIR_FAILED',
  'PROJECT_FOLDER_LANDING_UNVERIFIED',
  'PROJECT_FOLDER_SUBMODULE_UNSUPPORTED',
  'PROJECT_FOLDER_SYMLINK_UNSUPPORTED',
  'PROJECT_FOLDER_NTFS_NAME_INVALID',
  'PROJECT_FOLDER_FILTER_UNSUPPORTED',
  'PROJECT_FOLDER_SPARSE_CHECKOUT',
  'PROJECT_FOLDER_INVALID',
] as const;
export function isAbsentLocalCommitReason(reason: string | null | undefined): boolean {
  return typeof reason === 'string' && (localCommitAbsentReasons as readonly string[]).includes(reason);
}
export function isUnresolvedLocalCommitDiagnostic(reason: string | null | undefined): boolean {
  return typeof reason === 'string' && (localCommitUnresolvedBlockReasons as readonly string[]).includes(reason);
}
export function isLocalCommitFolderBlockReason(reason: string | null | undefined): reason is string {
  return typeof reason === 'string' && (localCommitFolderBlockReasons as readonly string[]).includes(reason);
}
export function canFinishLocalCommit(
  currentState: EffectView['state'],
  nextState: 'confirmed' | 'failed_known' | 'unknown' | 'not_applicable',
  reason: string | null | undefined,
): boolean {
  if (nextState === 'confirmed' || nextState === 'not_applicable') return true;
  if (currentState !== 'unknown' && currentState !== 'running') return false;
  if (nextState === 'failed_known') return isAbsentLocalCommitReason(reason);
  return isUnresolvedLocalCommitDiagnostic(reason);
}
export function canAdaptLocalCommitIntegration(previous: Pick<EffectView, 'state' | 'reason'> | undefined): boolean {
  return !previous || (previous.state === 'failed_known' && previous.reason !== 'PROJECT_FOLDER_REPAIR_REFUSED');
}
export const PublicationSummary = Type.Object({
  mode: DeliveryMode, reviewState: nullable(Type.Union(['pending', 'approved', 'rejected'].map(v => Type.Literal(v)))),
  localState: Type.Union([Type.Literal('pending'), Type.Literal('completed')]),
  commit: Type.Optional(Type.Object({ state: EffectView.properties.state, sha: nullable(text), reason: nullable(text), operationId: nullable(OperationId),
    branchRef: nullable(text), taskType: nullable(Type.String({ minLength: 1, maxLength: 16 })), taskDescription: nullable(Type.String({ minLength: 1, maxLength: 256 })),
    blocked: Type.Optional(LocalCommitBlock) }, closed)),
  upgrades: Type.Optional(Type.Array(ModeUpgradeSummary, { maxItems: 2 })),
  push: Type.Optional(Type.Object({ state: EffectView.properties.state, receipt: nullable(EffectReceipt), reason: nullable(text) }, closed)),
  pullRequest: Type.Optional(Type.Object({ state: EffectView.properties.state, receipt: nullable(EffectReceipt), reason: nullable(text) }, closed)),
  confirmedEffects: Type.Integer({ minimum: 0 }), pendingEffects: Type.Integer({ minimum: 0 }), unknownEffects: Type.Integer({ minimum: 0 }),
  completeCapability: Capability, reconcileCapability: Capability,
}, closed);
export type PublicationSummary = Static<typeof PublicationSummary>;
export const GitHubMutationResult = Type.Object({ state: Type.Union((['confirmed', 'failed_known', 'unknown'] as const).map(v => Type.Literal(v))),
  receipt: nullable(EffectReceipt), reason: nullable(Type.String({ maxLength: 128 })), retryAtMs: nullable(Type.Integer()),
}, closed);
export type GitHubMutationResult = Static<typeof GitHubMutationResult>;
