import { Type, type Static } from '@sinclair/typebox';
import { OperationId } from './base.js';
const closed = { additionalProperties: false } as const;
const text = (maxLength: number) => Type.String({ minLength: 1, maxLength, pattern: '.*\\S.*' });
const pendingState = Type.Union([
  Type.Literal('accepted'), Type.Literal('running'), Type.Literal('pending'),
  Type.Literal('reconfirmation_required'), Type.Literal('finalizing'),
]);

export const DeletionSummary = Type.Object({
  operation_id: OperationId, state: pendingState,
  reason: Type.Union([text(2048), Type.Null()]), recovery: Type.Union([text(2048), Type.Null()]),
}, closed);
export type DeletionSummary = Static<typeof DeletionSummary>;
