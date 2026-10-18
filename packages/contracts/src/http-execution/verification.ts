// HTTP DTOs only. Private captures and native executor protocols retain their versioned representation.
import { Type, type Static } from "@sinclair/typebox";
import { OperationId } from "../base.js";
const closed = { additionalProperties: false } as const;
const nullable = <T extends import('@sinclair/typebox').TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
export const CheckState = Type.Union(['pending', 'running', 'passed', 'failed', 'error', 'not_applicable'].map(x => Type.Literal(x)));
export const Artifact = Type.Object({
    id: OperationId, attempt_id: OperationId, delivery_id: OperationId, check_id: OperationId,
    kind: Type.Literal('check_log'), path_relative: Type.String({ maxLength: 256 }),
    sha256: Type.String({ pattern: '^[a-f0-9]{64}$' }), size_bytes: Type.Integer({ minimum: 0, maximum: 1048576 }),
}, closed);
export type Artifact = Static<typeof Artifact>;
export const CheckRun = Type.Object({
    id: OperationId, verification_id: OperationId, delivery_id: OperationId, content_identity: Type.String(),
    check_definition_id: Type.String({ maxLength: 128 }), run_number: Type.Integer({ minimum: 1 }),
    command: Type.String({ maxLength: 4096 }), cwd_relative: Type.String({ maxLength: 4096 }), timeout_ms: Type.Integer({ minimum: 1 }),
    state: CheckState, exit_code: nullable(Type.Integer()), started_at_ms: nullable(Type.Integer({ minimum: 0 })),
    ended_at_ms: nullable(Type.Integer({ minimum: 0 })), duration_ms: nullable(Type.Integer({ minimum: 0 })),
    diagnostic: nullable(Type.String({ maxLength: 128 })), execution_diagnostic: nullable(Type.String({ maxLength: 128 })), artifacts: Type.Array(Artifact, { maxItems: 1 }),
}, closed);
export type CheckRun = Static<typeof CheckRun>;
export const VerificationSummary = Type.Object({
    id: OperationId, delivery_id: OperationId, content_identity: Type.String(), run_number: Type.Integer({ minimum: 1 }),
    state: CheckState, diagnostic: nullable(Type.String({ maxLength: 128 })),
    started_at_ms: Type.Integer({ minimum: 0 }), ended_at_ms: nullable(Type.Integer({ minimum: 0 })),
    check_count: Type.Integer({ minimum: 0, maximum: 50 }),
}, closed);
export type VerificationSummary = Static<typeof VerificationSummary>;
export const CheckHistoryQuery = Type.Object({
    cursor: Type.Optional(Type.String({ maxLength: 1024 })),
    limit: Type.Optional(Type.String({ pattern: '^(?:[1-9]|[1-9][0-9]|100)$' })),
}, closed);
export type CheckHistoryQuery = Static<typeof CheckHistoryQuery>;
export const CheckHistory = Type.Object({
    entries: Type.Array(CheckRun, { maxItems: 100 }), next_cursor: nullable(Type.String()), has_more: Type.Boolean(),
}, closed);
export type CheckHistory = Static<typeof CheckHistory>;
