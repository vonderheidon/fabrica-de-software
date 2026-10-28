import { DeletionSummary } from './deletion-summary.js';
export { DeletionSummary } from './deletion-summary.js';
import { Type, type Static } from '@sinclair/typebox';
import { OperationId, OperationView, Page } from './base.js';
import { ConfigurationView, ProjectDetail, ProjectSummary } from './projects.js';

const closed = { additionalProperties: false } as const;
const text = (maxLength: number) => Type.String({ minLength: 1, maxLength, pattern: '.*\\S.*' });
const revision = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const digest = Type.String({ pattern: '^[a-f0-9]{64}$', minLength: 64, maxLength: 64 });
const pendingState = Type.Union([
  Type.Literal('accepted'), Type.Literal('running'), Type.Literal('pending'),
  Type.Literal('reconfirmation_required'), Type.Literal('finalizing'),
]);

export const DeletionTarget = Type.Object({
  target_key: text(128),
  target_kind: Type.Union([Type.Literal('original_directory'), Type.Literal('exclusive_workspace')]),
  path: text(4096),
  state: Type.Union([Type.Literal('pending'), Type.Literal('removing'), Type.Literal('removed'), Type.Literal('blocked')]),
}, closed);
export type DeletionTarget = Static<typeof DeletionTarget>;
export const DeletionBlocker = Type.Object({ reason: text(2048), recovery: text(2048) }, closed);
export type DeletionBlocker = Static<typeof DeletionBlocker>;
export const DeletionPreview = Type.Object({
  project_id: OperationId, project_name: ProjectSummary.properties.name, project_revision: revision,
  authorization_digest: digest, source_kind: Type.Union([Type.Literal('local'), Type.Literal('github')]),
  targets: Type.Array(DeletionTarget), blockers: Type.Array(DeletionBlocker), can_confirm: Type.Boolean(),
}, closed);
export type DeletionPreview = Static<typeof DeletionPreview>;
export const DeletionPending = Type.Object({
  operation_id: OperationId, project_id: OperationId, project_name: ProjectSummary.properties.name,
  state: pendingState, revision, targets: Type.Array(DeletionTarget), blockers: Type.Array(DeletionBlocker), can_retry: Type.Boolean(),
}, closed);
export type DeletionPending = Static<typeof DeletionPending>;
export const DeletionCompleted = Type.Object({ operation_id: OperationId, state: Type.Literal('succeeded') }, closed);
export type DeletionCompleted = Static<typeof DeletionCompleted>;
export const DeletionStatus = Type.Union([DeletionPending, DeletionCompleted]);
export type DeletionStatus = Static<typeof DeletionStatus>;
export const DeletionConfirmation = Type.Object({ confirmed: Type.Literal(true), authorization_digest: digest }, closed);
export type DeletionConfirmation = Static<typeof DeletionConfirmation>;
export const DeletionResume = Type.Object({}, closed);
export type DeletionResume = Static<typeof DeletionResume>;

// Compatibility exports; the main project schemas also require the same summary.
const deletion = Type.Union([DeletionSummary, Type.Null()]);
export const ProjectSummaryWithDeletion = Type.Object({ ...ProjectSummary.properties, deletion }, closed);
export type ProjectSummaryWithDeletion = Static<typeof ProjectSummaryWithDeletion>;
export const ProjectPageWithDeletion = Page(ProjectSummaryWithDeletion);
export type ProjectPageWithDeletion = Static<typeof ProjectPageWithDeletion>;
export const ProjectDetailWithDeletion = Type.Object({ ...ProjectDetail.properties, deletion }, closed);
export type ProjectDetailWithDeletion = Static<typeof ProjectDetailWithDeletion>;
export const ConfigurationViewWithDeletion = Type.Object({ ...ConfigurationView.properties, deletion }, closed);
export type ConfigurationViewWithDeletion = Static<typeof ConfigurationViewWithDeletion>;
export const OperationViewWithDeletion = Type.Union([OperationView, DeletionCompleted]);
export type OperationViewWithDeletion = Static<typeof OperationViewWithDeletion>;
