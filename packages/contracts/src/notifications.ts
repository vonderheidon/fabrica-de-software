import { Type, type Static } from '@sinclair/typebox';
import { OperationId } from './base.js';

const closed = { additionalProperties: false } as const;
const revision = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const surface = Type.Literal('browser_host');
const eventSeq = Type.String({ pattern: '^[1-9][0-9]*$', maxLength: 20 });
const receiptState = Type.Union(['confirmed', 'uncertain', 'unavailable'].map(value => Type.Literal(value)));
export const ClaimNotification = Type.Object({ consumer_id: OperationId, surface, event_seq: eventSeq }, closed);
export type ClaimNotification = Static<typeof ClaimNotification>;
export const NotificationClaim = Type.Object({
  dispatch_id: OperationId, revision, consumer_id: OperationId, surface, event_seq: eventSeq,
  state: Type.Union([Type.Literal('reserved'), receiptState]), send_allowed: Type.Boolean(),
  notification: Type.Object({ title: Type.Literal('Nova fábrica de software'),
    event_kind: Type.Union(['question_pending', 'failure', 'completion'].map(value => Type.Literal(value))),
    target_hash: Type.String({ minLength: 1, maxLength: 1024 }),
  }, closed), operation_id: OperationId,
}, closed);
export type NotificationClaim = Static<typeof NotificationClaim>;
export const RecordNotificationReceipt = Type.Object({ dispatch_id: OperationId, dispatch_revision: revision, state: receiptState,
  reason: Type.Optional(Type.String({ minLength: 1, maxLength: 2048 })),
}, closed);
export type RecordNotificationReceipt = Static<typeof RecordNotificationReceipt>;
export const NotificationReceipt = Type.Object({ dispatch_id: OperationId, revision, state: receiptState, operation_id: OperationId }, closed);
export type NotificationReceipt = Static<typeof NotificationReceipt>;
