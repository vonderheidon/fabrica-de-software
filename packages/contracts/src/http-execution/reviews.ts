// HTTP DTOs only. Private captures and native executor protocols retain their versioned representation.
import { Type, type Static } from "@sinclair/typebox";
import { OperationId } from "../base.js";
import { ReviewCommandRepetition } from '../execution.js';
import { CriterionOutcome, ReviewerResult, ImplementerResult, PassageBinding } from "./protocol-views.js";
const closed = { additionalProperties: false } as const;
export const Finding = Type.Object({
    ...ReviewerResult.properties.findings.items.properties,
    id: OperationId, review_id: OperationId, attempt_id: OperationId,
    priority: Type.Union([Type.Null(), ...['critical', 'high', 'medium', 'low'].map(v => Type.Literal(v))]),
    origin_finding_id: Type.Union([OperationId, Type.Null()]),
    delivery_id: Type.Union([OperationId, Type.Null()]), content_identity: Type.Union([Type.String(), Type.Null()]),
}, closed);
export type Finding = Static<typeof Finding>;
export const Review = Type.Object({
    dispute_details_url: Type.String({ minLength: 1, maxLength: 512 }),
    id: OperationId, delivery_id: OperationId, attempt_id: OperationId, passage_id: OperationId,
    verification_id: OperationId, content_identity: Type.String(),
    state: Type.Union(['pending', 'approved', 'rejected'].map(v => Type.Literal(v))),
    declared_verdict: Type.Union([Type.Null(), Type.Literal('approved'), Type.Literal('rejected')]),
    reason: Type.Union([Type.Null(), Type.String()]),
    independence_state: Type.Union(['pending', 'valid', 'invalid'].map(v => Type.Literal(v))),
    diagnostic: Type.Union([Type.Null(), Type.String()]),
    created_at_ms: Type.Integer(), completed_at_ms: Type.Union([Type.Null(), Type.Integer()]),
    criteria: Type.Array(CriterionOutcome, { maxItems: 1000 }),
    findings: Type.Array(Finding, { maxItems: 1000 }),
    resolutions: Type.Array(Type.Object({ finding_id: OperationId, verdict: Type.Union([Type.Literal('resolved'), Type.Literal('unresolved')]), evidence: Type.Array(Type.String()) }, closed), { maxItems: 1000 }),
    command_repetitions: Type.Array(ReviewCommandRepetition, { maxItems: 100 }),
}, closed);
export type Review = Static<typeof Review>;
export const RoundHistory = Type.Object({ entries: Type.Array(Type.Object({
        round: Type.Integer({ minimum: 1, maximum: 6 }), delivery_id: OperationId, producer_passage_id: OperationId,
        producer_receipt_id: Type.Union([OperationId, Type.Null()]), review_id: Type.Union([OperationId, Type.Null()]),
        review_state: Type.Union([Type.Null(), Type.Literal('pending'), Type.Literal('approved'), Type.Literal('rejected')]),
        content_identity: Type.Union([Type.Null(), Type.String()]),
    }, closed), { maxItems: 6 }) }, closed);
export type RoundHistory = Static<typeof RoundHistory>;
export const ProducerResult = Type.Union([Type.Null(), Type.Object({ binding: PassageBinding, result: ImplementerResult, sha256: Type.String({ pattern: '^[a-f0-9]{64}$' }), receipt_id: OperationId }, closed)]);
export type ProducerResult = Static<typeof ProducerResult>;
