// HTTP DTOs only. Private captures and native executor protocols retain their versioned representation.
import { Type, type Static } from "@sinclair/typebox";
import { OperationId } from "../base.js";



const closed = { additionalProperties: false } as const;
const hash = Type.String({ pattern: '^[a-f0-9]{64}$' });
const text = (maxLength = 256) => Type.String({ minLength: 1, maxLength });
export const StartAttempt = Type.Object({
    preparation_id: OperationId, preparation_revision: Type.Integer({ minimum: 1 }),
    authorized_summary_hash: hash, authorized: Type.Literal(true),
}, closed);
export type StartAttempt = Static<typeof StartAttempt>;
// Small operational view; the capture and criterion evidence are loaded through storage on demand.
export const AttemptStatus = Type.Object({
    id: OperationId, project_id: OperationId, operation_id: OperationId, passage_id: OperationId, round: Type.Integer({ minimum: 1, maximum: 6 }),
    phase: Type.Union(['preparing', 'implementing', 'verifying', 'reviewing', 'publishing', 'finished'].map(x => Type.Literal(x))),
    result: Type.Union([Type.Null(), ...['delivered', 'rejected', 'failed', 'cancelled', 'interrupted'].map(x => Type.Literal(x))]),
    suspension: Type.Union([Type.Null(), text()]), tracking: Type.Union(['pending', 'tracked', 'lost'].map(x => Type.Literal(x))),
    diagnostic: Type.Union([Type.Null(), text()]), result_receipt_id: Type.Union([Type.Null(), OperationId]),
    delivery_id: Type.Union([Type.Null(), OperationId]),
    pending_question_id: Type.Optional(Type.Union([Type.Null(), OperationId])),
    revision: Type.Integer({ minimum: 1 }), event_cursor: Type.String({ pattern: '^[0-9]+$' }),
}, closed);
export type AttemptStatus = Static<typeof AttemptStatus>;
