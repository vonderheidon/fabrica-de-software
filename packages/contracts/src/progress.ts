import { Type, type Static } from '@sinclair/typebox';
import { Capability, OperationId } from './base.js';

const closed = { additionalProperties: false } as const;
const evidence = Type.Array(Type.String({ minLength: 1, maxLength: 4096 }), { maxItems: 20 });
export const ProgressAssessment = Type.Object({
  findingId: OperationId,
  progress: Type.Union(['proven', 'partial', 'none', 'not_assessable'].map(v => Type.Literal(v))),
  evidence, justification: Type.String({ minLength: 1, maxLength: 8192, pattern: '.*\\S.*' }),
}, closed);
export const FindingAssessment = Type.Object({
  ...ProgressAssessment.properties, id: OperationId, attemptId: OperationId, reviewId: OperationId,
  deliveryId: OperationId, round: Type.Integer({ minimum: 1, maximum: 6 }),
  contentIdentity: Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' }),
  createdAtMs: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
}, closed);
export type FindingAssessment = Static<typeof FindingAssessment>;
export const AttemptBlock = Type.Union([Type.Null(), Type.Object({
  id: OperationId, revision: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  reason: Type.Union(['no_progress', 'dispute_maintained', 'correction_limit'].map(v => Type.Literal(v))),
  delivery_id: OperationId, content_identity: FindingAssessment.properties.contentIdentity,
  finding_ids: Type.Array(OperationId, { maxItems: 1000 }),
  cause: Type.String({ minLength: 1, maxLength: 2048 }), recovery: Type.String({ minLength: 1, maxLength: 2048 }),
  consecutive_no_progress: Type.Integer({ minimum: 0, maximum: 6 }),
  corrections_used: Type.Integer({ minimum: 0, maximum: 5 }), correction_limit: Type.Integer({ minimum: 0, maximum: 5 }),
  guidance_capability: Capability, change_profile_capability: Capability, end_capability: Capability, evidence,
}, closed)]);
export type AttemptBlock = Static<typeof AttemptBlock>;
