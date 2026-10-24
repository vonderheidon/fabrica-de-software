import { Type, type Static } from '@sinclair/typebox';
import { OperationId } from './base.js';
import { CriterionOutcome, ReviewerResult, ImplementerResult, PassageBinding, ReviewCommandRepetition } from './execution.js';

const closed = { additionalProperties: false } as const;
export const Finding = Type.Object({
  ...ReviewerResult.properties.findings.items.properties,
  id: OperationId, reviewId: OperationId, attemptId: OperationId,
  priority: Type.Union([Type.Null(), ...['critical', 'high', 'medium', 'low'].map(v => Type.Literal(v))]),
  originFindingId: Type.Union([OperationId, Type.Null()]),
  deliveryId: Type.Union([OperationId, Type.Null()]), contentIdentity: Type.Union([Type.String(), Type.Null()]),
}, closed);
export type Finding = Static<typeof Finding>;
export const Review = Type.Object({
  commandRepetitions: Type.Optional(Type.Array(ReviewCommandRepetition, { maxItems: 100 })),
  id: OperationId, deliveryId: OperationId, attemptId: OperationId, passageId: OperationId,
  verificationId: OperationId, contentIdentity: Type.String(),
  state: Type.Union(['pending', 'approved', 'rejected'].map(v => Type.Literal(v))),
  declaredVerdict: Type.Union([Type.Null(), Type.Literal('approved'), Type.Literal('rejected')]),
  reason: Type.Union([Type.Null(), Type.String()]),
  independenceState: Type.Union(['pending', 'valid', 'invalid'].map(v => Type.Literal(v))),
  diagnostic: Type.Union([Type.Null(), Type.String()]),
  createdAtMs: Type.Integer(), completedAtMs: Type.Union([Type.Null(), Type.Integer()]),
  criteria: Type.Array(CriterionOutcome, { maxItems: 1000 }),
  findings: Type.Array(Finding, { maxItems: 1000 }),
  resolutions: Type.Array(Type.Object({ findingId: OperationId, verdict: Type.Union([Type.Literal('resolved'), Type.Literal('unresolved')]), evidence: Type.Array(Type.String()) }, closed), { maxItems: 1000 }),
}, closed);
export type Review = Static<typeof Review>;
export const RoundHistory = Type.Object({ entries: Type.Array(Type.Object({
  round: Type.Integer({ minimum: 1, maximum: 6 }), deliveryId: OperationId, producerPassageId: OperationId,
  producerReceiptId: Type.Union([OperationId, Type.Null()]), reviewId: Type.Union([OperationId, Type.Null()]),
  reviewState: Type.Union([Type.Null(), Type.Literal('pending'), Type.Literal('approved'), Type.Literal('rejected')]),
  contentIdentity: Type.Union([Type.Null(), Type.String()]),
}, closed), { maxItems: 6 }) }, closed);
export type RoundHistory = Static<typeof RoundHistory>;
export const ProducerResult = Type.Union([Type.Null(), Type.Object({ binding: PassageBinding, result: ImplementerResult, sha256: Type.String({ pattern: '^[a-f0-9]{64}$' }), receiptId: OperationId }, closed)]);
export type ProducerResult = Static<typeof ProducerResult>;
