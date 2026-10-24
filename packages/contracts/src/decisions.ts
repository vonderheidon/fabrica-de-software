import { Type, type Static } from '@sinclair/typebox';
import { OperationId } from './base.js';
import { PassageRole } from './execution.js';

const closed = { additionalProperties: false } as const;
const revision = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const common = { blockId: OperationId, blockRevision: revision, deliveryId: OperationId, authorized: Type.Literal(true) };

export const MakeAttemptDecision = Type.Union([
  Type.Object({ ...common, action: Type.Literal('guidance'), guidance: Type.String({ minLength: 1, maxLength: 8192, pattern: '.*\\S.*' }) }, closed),
  Type.Object({ ...common, action: Type.Literal('change_profile'), profileId: OperationId, profileRevision: revision, role: PassageRole }, closed),
  Type.Object({ ...common, action: Type.Literal('end') }, closed),
]);
export type MakeAttemptDecision = Static<typeof MakeAttemptDecision>;

export const AttemptDecisionView = Type.Object({
  id: OperationId, operationId: OperationId, attemptId: OperationId, deliveryId: OperationId,
  blockId: OperationId, blockRevision: revision,
  blockReason: Type.Union(['no_progress', 'dispute_maintained', 'correction_limit'].map(value => Type.Literal(value))),
  action: Type.Union(['guidance', 'change_profile', 'end'].map(value => Type.Literal(value))),
  guidance: Type.Union([Type.String({ minLength: 1, maxLength: 8192 }), Type.Null()]),
  successorPreparationId: Type.Union([OperationId, Type.Null()]),
  successorPreparationRevision: Type.Union([revision, Type.Null()]),
  createdAtMs: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
}, closed);
export type AttemptDecisionView = Static<typeof AttemptDecisionView>;

