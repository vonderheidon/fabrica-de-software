// HTTP DTOs only. Private captures and native executor protocols retain their versioned representation.
import { Type, type Static } from "@sinclair/typebox";
import { StageActivity } from '../stage-activity.js';
import { ConfiguredLimit, MeasuredValue, OperationId } from "../base.js";
import { ExecutionQuestion } from "./protocol-views.js";
import { Criterion } from "../preparations.js";
const closed = { additionalProperties: false } as const;
const time = Type.Integer({ minimum: 0 });
const hash = Type.String({ pattern: '^[a-f0-9]{64}$' });
const nullableTime = Type.Union([time, Type.Null()]);
export const ScopeChange = Type.Object({
    captured_criteria: Type.Array(Criterion, { maxItems: 1000 }), current_criteria: Type.Array(Criterion, { maxItems: 1000 }),
    captured_digest: hash, current_digest: hash, reasons: Type.Array(Type.String({ maxLength: 128 }), { maxItems: 20 }), observed_at_ms: time,
}, closed);
export type ScopeChange = Static<typeof ScopeChange>;
export const Question = Type.Object({
    id: OperationId, attempt_id: OperationId, passage_id: OperationId, delivery_id: OperationId,
    question: ExecutionQuestion, scope_change: Type.Union([ScopeChange, Type.Null()]),
    state: Type.Union(['pending', 'answer_recorded', 'sending', 'delivered', 'delivery_unknown', 'expired', 'cancelled'].map(s => Type.Literal(s))),
    revision: Type.Integer({ minimum: 1 }), raised_at_ms: time, answered_at_ms: nullableTime,
    ttl: ConfiguredLimit, expired_at_ms: nullableTime,
    answer: Type.Union([Type.String({ maxLength: 8192 }), Type.Null()]), answer_operation_id: Type.Union([OperationId, Type.Null()]),
    delivery_receipt: Type.Union([Type.Object({ operation_id: OperationId, question_id: OperationId, passage_id: OperationId, received_at_ms: time }, closed), Type.Null()]),
}, closed);
export type Question = Static<typeof Question>;
export const AnswerQuestion = Type.Object({
    action: Type.Optional(Type.Literal('end_attempt')),
    answer: Type.String({ minLength: 1, maxLength: 8192, pattern: '.*\\S.*' }),
    scope_choice: Type.Optional(Type.Union([Type.Literal('keep_captured'), Type.Literal('adopt_new')])),
}, closed);
export type AnswerQuestion = Static<typeof AnswerQuestion>;
export const PassageMeasurements = Type.Object({
    passage_id: OperationId, role: Type.Union([Type.Literal('implementer'), Type.Literal('reviewer')]), round: Type.Integer({ minimum: 1, maximum: 6 }),
    active_time: MeasuredValue, human_wait: MeasuredValue,
    active_limit_state: Type.Union(['within_limit', 'expired', 'unavailable', 'not_applicable'].map(s => Type.Literal(s))), active_expired_at_ms: nullableTime,
}, closed);
export type PassageMeasurements = Static<typeof PassageMeasurements>;
export const AttemptMeasurements = Type.Object({
    stage_activity: StageActivity,
    active_time: MeasuredValue, human_wait: MeasuredValue, cost: MeasuredValue,
    active_limit: ConfiguredLimit, question_ttl: ConfiguredLimit,
    active_limit_state: Type.Union(['within_limit', 'expired', 'unavailable', 'not_applicable'].map(s => Type.Literal(s))),
    active_expired_at_ms: nullableTime,
    passages: Type.Array(PassageMeasurements, { maxItems: 12 }),
    pending_requirements: Type.Array(Type.Object({ cause: Type.String(), affected_requirements: Type.Array(Type.String()), pending: Type.String() }, closed), { maxItems: 10 }),
}, closed);
export type AttemptMeasurements = Static<typeof AttemptMeasurements>;
