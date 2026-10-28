import { Type, type Static } from '@sinclair/typebox';
import { OperationId } from './base.js';

const closed = { additionalProperties: false } as const;
export const GitObjectId = Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' });
export const DeliveryParams = Type.Object({ deliveryId: OperationId }, closed);
export const CaptureWarning = Type.Object({
  attemptId: OperationId, passageId: OperationId, deliveryId: OperationId,
  path: Type.String({ minLength: 1, maxLength: 4096 }),
  reason: Type.Union([Type.Literal('DECLARED_NEW_FILE_IGNORED'), Type.Literal('KNOWN_SECRET_EXCLUDED')]),
}, closed);
export type CaptureWarning = Static<typeof CaptureWarning>;
export const Delivery = Type.Object({
  id: OperationId, attemptId: OperationId, producerPassageId: OperationId,
  round: Type.Integer({ minimum: 1, maximum: 6 }), baseSha: GitObjectId,
  captureState: Type.Union(['pending', 'running', 'captured', 'failed'].map(v => Type.Literal(v))),
  gitRef: Type.Union([Type.Null(), Type.String({ pattern: '^refs/factory/deliveries/[a-f0-9-]{36}$' })]),
  repositoryRelative: Type.String({ pattern: '^git/[a-f0-9-]{36}\\.git$' }),
  contentIdentity: Type.Union([Type.Null(), GitObjectId]), commitSha: Type.Union([Type.Null(), GitObjectId]),
  hasDelta: Type.Union([Type.Null(), Type.Boolean()]), diagnostic: Type.Union([Type.Null(), Type.String({ maxLength: 128 })]),
  capturedAtMs: Type.Union([Type.Null(), Type.Integer({ minimum: 0 })]), revision: Type.Integer({ minimum: 1 }),
  warnings: Type.Array(CaptureWarning, { maxItems: 1000 }),
}, closed);
export type Delivery = Static<typeof Delivery>;
export const DeliveryView = Type.Object({ delivery: Delivery, eventCursor: Type.String() }, closed);
export type DeliveryView = Static<typeof DeliveryView>;
export const CaptureRetryParams = Type.Object({ attemptId: OperationId, deliveryId: OperationId }, closed);
export const CaptureRetry = Type.Object({ producerPassageId: OperationId }, closed);
export type CaptureRetry = Static<typeof CaptureRetry>;
export const DeliveryDiffQuery = Type.Object({
  cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })),
  limit: Type.Optional(Type.String({ pattern: '^(?:[1-9]|[1-9][0-9]|100)$' })),
}, closed);
export type DeliveryDiffQuery = Static<typeof DeliveryDiffQuery>;
export const DiffEntry = Type.Object({
  path: Type.String({ minLength: 1, maxLength: 4096 }), oldPath: Type.Union([Type.Null(), Type.String({ maxLength: 4096 })]),
  status: Type.String({ pattern: '^[ACDMRTUXB][0-9]*$' }), oldMode: Type.String(), newMode: Type.String(),
  binary: Type.Boolean(), unsupported: Type.Union([Type.Null(), Type.String()]), patch: Type.Union([Type.Null(), Type.String({ maxLength: 262144 })]),
}, closed);
export type DiffEntry = Static<typeof DiffEntry>;
export const DeliveryDiff = Type.Object({
  deliveryId: OperationId, baseSha: GitObjectId, contentIdentity: GitObjectId,
  entries: Type.Array(DiffEntry, { maxItems: 100 }), nextCursor: Type.Union([Type.Null(), Type.String()]), hasMore: Type.Boolean(),
}, closed);
export type DeliveryDiff = Static<typeof DeliveryDiff>;
