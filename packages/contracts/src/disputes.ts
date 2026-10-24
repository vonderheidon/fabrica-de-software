import { Type, type Static } from '@sinclair/typebox';
import { OperationId } from './base.js';

const closed = { additionalProperties: false } as const;
const text = (maxLength: number) => Type.String({ minLength: 1, maxLength, pattern: '.*\\S.*' });
const evidence = Type.Array(text(4096), { minItems: 1, maxItems: 20 });
const nullable = <T extends import('@sinclair/typebox').TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
const contentIdentity = Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' });

export const DisputeResponse = Type.Object({
  disputeId: OperationId, verdict: Type.Union([Type.Literal('maintained'), Type.Literal('resolved')]),
  justification: text(8192), evidence,
}, closed);
export const FindingDispute = Type.Object({
  id: OperationId, attemptId: OperationId, findingId: OperationId, passageId: OperationId,
  deliveryId: OperationId, contentIdentity, justification: text(8192), evidence,
  responseReviewId: nullable(OperationId), responseVerdict: nullable(DisputeResponse.properties.verdict),
  responseJustification: nullable(text(8192)), responseEvidence: nullable(evidence),
  createdAtMs: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  respondedAtMs: nullable(Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })),
  responseDeliveryId: nullable(OperationId), responseContentIdentity: nullable(contentIdentity),
}, closed);
export type FindingDispute = Static<typeof FindingDispute>;
