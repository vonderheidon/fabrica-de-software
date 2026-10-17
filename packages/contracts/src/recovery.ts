import { Type, type Static } from '@sinclair/typebox';
import { OperationId } from './base.js';

const closed = { additionalProperties: false } as const;
const text = Type.String({ minLength: 1, maxLength: 4096 });
export const RecoveryCapability = Type.Object({ available: Type.Boolean(), reason: Type.Union([text, Type.Null()]) }, closed);
export const CancelAttempt = Type.Object({ reason: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })) }, closed);
export type CancelAttempt = Static<typeof CancelAttempt>;
export const ResourceParams = Type.Object({ attemptId: OperationId, resourceId: OperationId }, closed);
export const InteractionParams = Type.Object({ attemptId: OperationId, passageId: OperationId }, closed);
export const AttemptResource = Type.Object({
  id: OperationId, attemptId: OperationId, passageId: OperationId,
  kind: Type.Union([Type.Literal('implementation'), Type.Literal('terminal')]),
  reference: text, owned: Type.Boolean(),
  launchState: Type.Union(['planned', 'starting', 'ready', 'partial', 'failed'].map(x => Type.Literal(x))),
  stopState: Type.Union(['not_requested', 'requested', 'confirmed', 'uncertain'].map(x => Type.Literal(x))),
  diagnostic: Type.Union([text, Type.Null()]), revision: Type.Integer({ minimum: 1 }), removed: Type.Boolean(),
}, closed);
export type AttemptResource = Static<typeof AttemptResource>;
export const AttemptResources = Type.Object({ entries: Type.Array(AttemptResource, { maxItems: 13 }),
  cleanup: Type.Union(['pending', 'complete', 'uncertain'].map(x => Type.Literal(x))), eventCursor: Type.String() }, closed);
export const RemovalPlan = Type.Object({ resourceId: OperationId, locationDisplay: text,
  losses: Type.Array(text), preservedReferences: Type.Array(text),
  planHash: Type.String({ pattern: '^[a-f0-9]{64}$' }), capability: RecoveryCapability,
}, closed);
export type RemovalPlan = Static<typeof RemovalPlan>;
export const RemoveResource = Type.Object({ planHash: Type.String({ pattern: '^[a-f0-9]{64}$' }), confirmed: Type.Literal(true) }, closed);
export type RemoveResource = Static<typeof RemoveResource>;
export const FolderSurface = Type.Object({ resourceId: OperationId, locationDisplay: text, openCapability: RecoveryCapability, eventCursor: Type.String() }, closed);
export const PassageInteraction = Type.Object({ sessionReference: text, openCapability: RecoveryCapability, eventCursor: Type.String() }, closed);
