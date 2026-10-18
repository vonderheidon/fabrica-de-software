// HTTP DTOs only. Private captures and native executor protocols retain their versioned representation.
import { Type, type Static } from "@sinclair/typebox";
import { OperationId } from "../base.js";
const closed = { additionalProperties: false } as const;
const text = Type.String({ minLength: 1, maxLength: 4096 });
export const RecoveryCapability = Type.Object({ available: Type.Boolean(), reason: Type.Union([text, Type.Null()]) }, closed);
export const CancelAttempt = Type.Object({ reason: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })) }, closed);
export type CancelAttempt = Static<typeof CancelAttempt>;
export const AttemptResource = Type.Object({
    id: OperationId, attempt_id: OperationId, passage_id: OperationId,
    kind: Type.Union([Type.Literal('implementation'), Type.Literal('terminal')]),
    reference: text, owned: Type.Boolean(),
    launch_state: Type.Union(['planned', 'starting', 'ready', 'partial', 'failed'].map(x => Type.Literal(x))),
    stop_state: Type.Union(['not_requested', 'requested', 'confirmed', 'uncertain'].map(x => Type.Literal(x))),
    diagnostic: Type.Union([text, Type.Null()]), revision: Type.Integer({ minimum: 1 }), removed: Type.Boolean(),
}, closed);
export type AttemptResource = Static<typeof AttemptResource>;
export const AttemptResources = Type.Object({ entries: Type.Array(AttemptResource, { maxItems: 13 }),
    cleanup: Type.Union(['pending', 'complete', 'uncertain'].map(x => Type.Literal(x))), event_cursor: Type.String() }, closed);
export const RemovalPlan = Type.Object({ resource_id: OperationId, location_display: text,
    losses: Type.Array(text), preserved_references: Type.Array(text),
    plan_hash: Type.String({ pattern: '^[a-f0-9]{64}$' }), capability: RecoveryCapability,
}, closed);
export type RemovalPlan = Static<typeof RemovalPlan>;
export const RemoveResource = Type.Object({ plan_hash: Type.String({ pattern: '^[a-f0-9]{64}$' }), confirmed: Type.Literal(true) }, closed);
export type RemoveResource = Static<typeof RemoveResource>;
export const FolderSurface = Type.Object({ resource_id: OperationId, location_display: text, open_capability: RecoveryCapability, event_cursor: Type.String() }, closed);
export const PassageInteraction = Type.Object({ session_reference: text, open_capability: RecoveryCapability, event_cursor: Type.String() }, closed);
