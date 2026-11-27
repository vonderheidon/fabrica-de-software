// HTTP DTOs only. Private captures and native executor protocols retain their versioned representation.
import { Type, type Static } from "@sinclair/typebox";
import { Capability, DeliveryMode, OperationId } from "../base.js";
import { GitHubId } from "../github.js";
import { ProjectConfiguration } from '../projects.js';
const closed = { additionalProperties: false } as const;
const text = Type.String({ minLength: 1, maxLength: 4096 });
const nullable = <T extends import('@sinclair/typebox').TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
export const EffectIdentity = Type.Object({
    branch_kind: Type.Optional(Type.Union([Type.Literal('new'), Type.Literal('existing')])),
    repository_id: Type.Optional(GitHubId), issue_id: Type.Optional(GitHubId),
    owner_id: Type.Optional(GitHubId), visibility: Type.Optional(Type.Union([Type.Literal('private'), Type.Literal('public')])),
    plan_hash: Type.Optional(Type.String({ pattern: '^[a-f0-9]{64}$' })),
    content_identity: Type.Optional(Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' })),
    parent_sha: Type.Optional(Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' })),
    branch_ref: Type.Optional(text), issue_number: Type.Optional(Type.Integer({ minimum: 1 })),
    commit_sha: Type.Optional(Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' })),
    commit_operation_id: Type.Optional(OperationId), target_operation_id: Type.Optional(OperationId),
    task_type: Type.Optional(Type.Union(['feat','fix','docs','refactor','test','chore','perf','build','ci','revert'].map(v => Type.Literal(v)))), task_description: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    repository_owner: Type.Optional(text), repository_name: Type.Optional(text), base_branch: Type.Optional(text), title: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    commit_time: Type.Optional(Type.Integer({ minimum: 1, maximum: 253402300799 })),
    marker: Type.Optional(text), body_hash: Type.Optional(Type.String({ pattern: '^[a-f0-9]{64}$' })),
    criterion_ids: Type.Optional(Type.Array(Type.String({ pattern: '^ac-[1-9][0-9]*$', maxLength: 128 }), { minItems: 1, maxItems: 1000 })),
    project_id: Type.Optional(GitHubId), item_id: Type.Optional(GitHubId), field_id: Type.Optional(GitHubId),
    option_id: Type.Optional(GitHubId), previous_option_id: Type.Optional(nullable(GitHubId)),
}, closed);
export type EffectIdentity = Static<typeof EffectIdentity>;
export const EffectReceipt = Type.Object({ id: GitHubId, url: Type.Optional(text), option_id: Type.Optional(GitHubId),
    content_identity: Type.Optional(text), parent_sha: Type.Optional(text), branch_ref: Type.Optional(text), operation_id: Type.Optional(OperationId),
    commit_sha: Type.Optional(text), repository_id: Type.Optional(GitHubId), base_branch: Type.Optional(text), target_operation_id: Type.Optional(OperationId),
    task_type: Type.Optional(Type.String({ minLength: 1, maxLength: 16 })), task_description: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    owner_id: Type.Optional(GitHubId), repository_name: Type.Optional(text), visibility: Type.Optional(Type.Union([Type.Literal('private'), Type.Literal('public')])),
}, closed);
export type EffectReceipt = Static<typeof EffectReceipt>;
export const EffectView = Type.Object({
    operation_id: OperationId, attempt_id: nullable(OperationId), creation_id: nullable(OperationId), delivery_id: nullable(OperationId),
    kind: Type.Union([Type.Literal('issue_comment'), Type.Literal('issue_body'), Type.Literal('project_status'), Type.Literal('local_commit'), Type.Literal('push'), Type.Literal('pull_request'), Type.Literal('create_repository'), Type.Literal('associate_origin'), Type.Literal('baseline_push')]), scope_key: text,
    state: Type.Union(['not_requested', 'not_started', 'running', 'confirmed', 'failed_known', 'unknown', 'not_applicable'].map(v => Type.Literal(v))),
    expected_identity: EffectIdentity, confirmed_identity: nullable(EffectReceipt), receipt: nullable(EffectReceipt),
    reason: nullable(Type.String({ maxLength: 128 })), authorized: Type.Boolean(), revision: Type.Integer({ minimum: 1 }),
    sent_at_ms: nullable(Type.Integer()), confirmed_at_ms: nullable(Type.Integer()),
}, closed);
export type EffectView = Static<typeof EffectView>;
export const CompletePublication = Type.Object({ delivery_id: OperationId, authorized_mode: DeliveryMode, authorized: Type.Literal(true) }, closed);
export type CompletePublication = Static<typeof CompletePublication>;
export const ReconcilePublication = Type.Object({ delivery_id: OperationId }, closed);
export type ReconcilePublication = Static<typeof ReconcilePublication>;
export const AuthorizeUpgrade = Type.Object({ delivery_id: OperationId, current_mode: DeliveryMode, target_mode: DeliveryMode,
    authorized_additional_effects_hash: Type.String({ pattern: '^[a-f0-9]{64}$' }), authorized: Type.Literal(true) }, closed);
export type AuthorizeUpgrade = Static<typeof AuthorizeUpgrade>;
export const ModeUpgradeSummary = Type.Object({ target_mode: DeliveryMode, additional_effects: Type.Array(EffectView.properties.kind),
    delivery_branch: ProjectConfiguration.properties.delivery_branch,
    summary_hash: Type.String({ pattern: '^[a-f0-9]{64}$' }), capability: Capability }, closed);
export type ModeUpgradeSummary = Static<typeof ModeUpgradeSummary>;
export const LocalCommitBlock = Type.Object({
    paths: Type.Array(Type.String({ minLength: 1, maxLength: 1024 }), { maxItems: 100 }), path_count: Type.Integer({ minimum: 0 }),
    expected_branch: nullable(Type.String({ minLength: 1, maxLength: 1024 })), current_branch: nullable(Type.String({ minLength: 1, maxLength: 1024 })),
}, closed);
export type LocalCommitBlock = Static<typeof LocalCommitBlock>;
export const PublicationSummary = Type.Object({
    mode: DeliveryMode, review_state: nullable(Type.Union(['pending', 'approved', 'rejected'].map(v => Type.Literal(v)))),
    local_state: Type.Union([Type.Literal('pending'), Type.Literal('completed')]),
    commit: Type.Optional(Type.Object({ state: EffectView.properties.state, sha: nullable(text), reason: nullable(text), operation_id: nullable(OperationId),
      branch_ref: nullable(text), task_type: nullable(Type.String({ minLength: 1, maxLength: 16 })), task_description: nullable(Type.String({ minLength: 1, maxLength: 256 })),
      blocked: Type.Optional(LocalCommitBlock) }, closed)),
    upgrades: Type.Optional(Type.Array(ModeUpgradeSummary, { maxItems: 2 })),
    push: Type.Optional(Type.Object({ state: EffectView.properties.state, receipt: nullable(EffectReceipt), reason: nullable(text) }, closed)),
    pull_request: Type.Optional(Type.Object({ state: EffectView.properties.state, receipt: nullable(EffectReceipt), reason: nullable(text) }, closed)),
    confirmed_effects: Type.Integer({ minimum: 0 }), pending_effects: Type.Integer({ minimum: 0 }), unknown_effects: Type.Integer({ minimum: 0 }),
    complete_capability: Capability, reconcile_capability: Capability,
}, closed);
export type PublicationSummary = Static<typeof PublicationSummary>;
