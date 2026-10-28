// HTTP DTOs only. Private captures and native executor protocols retain their versioned representation.
import { Type, type Static } from "@sinclair/typebox";
import { OperationId } from "../base.js";
const closed = { additionalProperties: false } as const;
export const GitObjectId = Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' });
export const CaptureWarning = Type.Object({
    attempt_id: OperationId, passage_id: OperationId, delivery_id: OperationId,
    path: Type.String({ minLength: 1, maxLength: 4096 }),
    reason: Type.Union([Type.Literal('DECLARED_NEW_FILE_IGNORED'), Type.Literal('KNOWN_SECRET_EXCLUDED')]),
}, closed);
export type CaptureWarning = Static<typeof CaptureWarning>;
export const Delivery = Type.Object({
    id: OperationId, attempt_id: OperationId, producer_passage_id: OperationId,
    round: Type.Integer({ minimum: 1, maximum: 6 }), base_sha: GitObjectId,
    capture_state: Type.Union(['pending', 'running', 'captured', 'failed'].map(v => Type.Literal(v))),
    git_ref: Type.Union([Type.Null(), Type.String({ pattern: '^refs/factory/deliveries/[a-f0-9-]{36}$' })]),
    repository_relative: Type.String({ pattern: '^git/[a-f0-9-]{36}\\.git$' }),
    content_identity: Type.Union([Type.Null(), GitObjectId]), commit_sha: Type.Union([Type.Null(), GitObjectId]),
    has_delta: Type.Union([Type.Null(), Type.Boolean()]), diagnostic: Type.Union([Type.Null(), Type.String({ maxLength: 128 })]),
    captured_at_ms: Type.Union([Type.Null(), Type.Integer({ minimum: 0 })]), revision: Type.Integer({ minimum: 1 }),
    warnings: Type.Array(CaptureWarning, { maxItems: 1000 }),
}, closed);
export type Delivery = Static<typeof Delivery>;
export const DeliveryView = Type.Object({ delivery: Delivery, event_cursor: Type.String() }, closed);
export type DeliveryView = Static<typeof DeliveryView>;
export const CaptureRetry = Type.Object({ producer_passage_id: OperationId }, closed);
export type CaptureRetry = Static<typeof CaptureRetry>;
export const DeliveryDiffQuery = Type.Object({
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })),
    limit: Type.Optional(Type.String({ pattern: '^(?:[1-9]|[1-9][0-9]|100)$' })),
}, closed);
export type DeliveryDiffQuery = Static<typeof DeliveryDiffQuery>;
export const DiffEntry = Type.Object({
    path: Type.String({ minLength: 1, maxLength: 4096 }), old_path: Type.Union([Type.Null(), Type.String({ maxLength: 4096 })]),
    status: Type.String({ pattern: '^[ACDMRTUXB][0-9]*$' }), old_mode: Type.String(), new_mode: Type.String(),
    binary: Type.Boolean(), unsupported: Type.Union([Type.Null(), Type.String()]), patch: Type.Union([Type.Null(), Type.String({ maxLength: 262144 })]),
}, closed);
export type DiffEntry = Static<typeof DiffEntry>;
export const DeliveryDiff = Type.Object({
    delivery_id: OperationId, base_sha: GitObjectId, content_identity: GitObjectId,
    entries: Type.Array(DiffEntry, { maxItems: 100 }), next_cursor: Type.Union([Type.Null(), Type.String()]), has_more: Type.Boolean(),
}, closed);
export type DeliveryDiff = Static<typeof DeliveryDiff>;
