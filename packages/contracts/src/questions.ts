import { Type, type Static } from '@sinclair/typebox';
import { StageActivity } from './stage-activity.js';
import { ConfiguredLimit, MeasuredValue, OperationId } from './base.js';
import { ExecutionQuestion } from './execution.js';
import { Criterion } from './preparations.js';

const closed = { additionalProperties: false } as const;
const time = Type.Integer({ minimum: 0 });
const hash = Type.String({ pattern: '^[a-f0-9]{64}$' });
const nullableTime = Type.Union([time, Type.Null()]);
export const ScopeChange = Type.Object({
  capturedCriteria: Type.Array(Criterion, { maxItems: 1000 }), currentCriteria: Type.Array(Criterion, { maxItems: 1000 }),
  capturedDigest: hash, currentDigest: hash, reasons: Type.Array(Type.String({ maxLength: 128 }), { maxItems: 20 }), observedAtMs: time,
}, closed);
export type ScopeChange = Static<typeof ScopeChange>;
export const Question = Type.Object({
  id: OperationId, attemptId: OperationId, passageId: OperationId, deliveryId: OperationId,
  question: ExecutionQuestion, scopeChange: Type.Union([ScopeChange, Type.Null()]),
  state: Type.Union(['pending', 'answer_recorded', 'sending', 'delivered', 'delivery_unknown', 'expired', 'cancelled'].map(s => Type.Literal(s))),
  revision: Type.Integer({ minimum: 1 }), raisedAtMs: time, answeredAtMs: nullableTime,
  ttl: ConfiguredLimit, expiredAtMs: nullableTime,
  answer: Type.Union([Type.String({ maxLength: 8192 }), Type.Null()]), answerOperationId: Type.Union([OperationId, Type.Null()]),
  deliveryReceipt: Type.Union([Type.Object({ operationId: OperationId, questionId: OperationId, passageId: OperationId, receivedAtMs: time }, closed), Type.Null()]),
}, closed);
export type Question = Static<typeof Question>;
export const QuestionParams = Type.Object({ attemptId: OperationId, questionId: OperationId }, closed);
export const AnswerQuestion = Type.Object({
  action: Type.Optional(Type.Literal('end_attempt')),
  answer: Type.String({ minLength: 1, maxLength: 8192, pattern: '.*\\S.*' }),
  scopeChoice: Type.Optional(Type.Union([Type.Literal('keep_captured'), Type.Literal('adopt_new')])),
}, closed);
export type AnswerQuestion = Static<typeof AnswerQuestion>;
export const PassageMeasurements = Type.Object({
  passageId: OperationId, role: Type.Union([Type.Literal('implementer'), Type.Literal('reviewer')]), round: Type.Integer({ minimum: 1, maximum: 6 }),
  activeTime: MeasuredValue, humanWait: MeasuredValue,
  activeLimitState: Type.Union(['within_limit', 'expired', 'unavailable', 'not_applicable'].map(s => Type.Literal(s))), activeExpiredAtMs: nullableTime,
}, closed);
export type PassageMeasurements = Static<typeof PassageMeasurements>;
export const AttemptMeasurements = Type.Object({
  stageActivity: StageActivity,
  activeTime: MeasuredValue, humanWait: MeasuredValue, cost: MeasuredValue,
  activeLimit: ConfiguredLimit, questionTtl: ConfiguredLimit,
  activeLimitState: Type.Union(['within_limit', 'expired', 'unavailable', 'not_applicable'].map(s => Type.Literal(s))),
  activeExpiredAtMs: nullableTime,
  passages: Type.Array(PassageMeasurements, { maxItems: 12 }),
  pendingRequirements: Type.Array(Type.Object({ cause: Type.String(), affectedRequirements: Type.Array(Type.String()), pending: Type.String() }, closed), { maxItems: 10 }),
}, closed);
export type AttemptMeasurements = Static<typeof AttemptMeasurements>;
