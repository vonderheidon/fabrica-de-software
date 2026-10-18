// HTTP DTOs only. Private captures and native executor protocols retain their versioned representation.
import { Type, type Static } from "@sinclair/typebox";
import { OperationId } from "../base.js";

const closed = { additionalProperties: false } as const;
const text = (maxLength = 4096) => Type.String({ minLength: 1, maxLength, pattern: '.*\\S.*' });
export const PassageRole = Type.Union([Type.Literal('implementer'), Type.Literal('reviewer')]);
export type PassageRole = Static<typeof PassageRole>;
export const PassageBinding = Type.Object({
    attempt_id: OperationId, passage_id: OperationId, role: PassageRole,
    round: Type.Integer({ minimum: 1, maximum: 6 }), delivery_version: OperationId,
}, closed);
export type PassageBinding = Static<typeof PassageBinding>;
export const RoleResourceReference = Type.Object({
    id: Type.Union([Type.Literal('factory.implementer'), Type.Literal('factory.reviewer')]),
    role: PassageRole, version: Type.Literal(1), path: text(256), sha256: Type.String({ pattern: '^[a-f0-9]{64}$' }),
}, closed);
export type RoleResourceReference = Static<typeof RoleResourceReference>;
export const ExecutionQuestion = Type.Object({
    format_version: Type.Literal(1), decision: text(2048), context: text(8192),
    alternatives: Type.Array(text(2048), { minItems: 2, maxItems: 10, uniqueItems: true }),
}, closed);
export type ExecutionQuestion = Static<typeof ExecutionQuestion>;
export const CriterionOutcome = Type.Object({
    criterion_id: Type.String({ pattern: '^ac-[1-9][0-9]*$', maxLength: 128 }),
    verdict: Type.Union([Type.Literal('passed'), Type.Literal('failed'), Type.Literal('not_verified')]),
    evidence: Type.Array(text(4096), { minItems: 1, maxItems: 20 }),
}, closed);
export const ImplementerResult = Type.Object({
    format_version: Type.Literal(1), summary: text(8192), writes_stopped: Type.Literal(true),
    declared_files: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 4096 }), { maxItems: 1000, uniqueItems: true })),
    finding_responses: Type.Optional(Type.Array(Type.Object({ finding_id: OperationId, response: text(4096), evidence: Type.Array(text(4096), { minItems: 1, maxItems: 20 }) }, closed), { maxItems: 1000 })),
    criteria: Type.Array(CriterionOutcome, { minItems: 1, maxItems: 1000 }),
    checks: Type.Array(Type.Object({ id: text(128), outcome: text(1024), evidence: text(4096) }, closed), { maxItems: 50 }),
}, closed);
export type ImplementerResult = Static<typeof ImplementerResult>;
export const ReviewerResult = Type.Object({
    format_version: Type.Literal(1), summary: text(8192), verdict: Type.Union([Type.Literal('approved'), Type.Literal('rejected')]),
    criteria: Type.Array(CriterionOutcome, { minItems: 1, maxItems: 1000 }),
    findings: Type.Array(Type.Object({
        key: text(128), criterion_ids: Type.Array(CriterionOutcome.properties.criterion_id, { maxItems: 1000, uniqueItems: true }),
        category: text(128), problem: text(4096), evidence: Type.Array(text(4096), { minItems: 1, maxItems: 20 }),
        expected_result: text(4096), blocking: Type.Boolean(),
    }, closed), { maxItems: 1000 }),
    resolutions: Type.Array(Type.Object({
        finding_key: text(128), verdict: Type.Union([Type.Literal('resolved'), Type.Literal('unresolved')]),
        evidence: Type.Array(text(4096), { minItems: 1, maxItems: 20 }),
    }, closed), { maxItems: 1000 }),
}, closed);
export type ReviewerResult = Static<typeof ReviewerResult>;
