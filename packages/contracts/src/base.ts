import { Type, type Static } from '@sinclair/typebox';

const text = (maxLength = 2048) => Type.String({ minLength: 1, maxLength });
const timestamp = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const revision = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const unconfigured = Type.Object({ state: Type.Literal('not_configured') }, { additionalProperties: false });

export const DeliveryMode = Type.Union([Type.Literal('icr'), Type.Literal('commit'), Type.Literal('pr')]);
export type DeliveryMode = Static<typeof DeliveryMode>;

export const Capability = Type.Object({
  available: Type.Boolean(),
  reasonCode: Type.Optional(text(128)),
  reason: Type.Optional(text()),
  recovery: Type.Optional(text()),
}, { additionalProperties: false });
export type Capability = Static<typeof Capability>;

export const MeasuredValue = Type.Union([
  Type.Object({ state: Type.Literal('measured'), value: Type.Number({ minimum: 0 }), unit: text(64) }, { additionalProperties: false }),
  Type.Object({ state: Type.Literal('unavailable'), reason: text(), affectedRequirements: Type.Array(text(128), { minItems: 1, maxItems: 100 }) }, { additionalProperties: false }),
  Type.Object({ state: Type.Literal('not_applicable'), reason: text() }, { additionalProperties: false }),
]);
export type MeasuredValue = Static<typeof MeasuredValue>;

export const ConfiguredLimit = Type.Union([
  Type.Object({ state: Type.Literal('configured'), value: Type.Number({ minimum: 0 }), unit: text(64) }, { additionalProperties: false }),
  unconfigured,
]);
export type ConfiguredLimit = Static<typeof ConfiguredLimit>;

export const ErrorResponse = Type.Object({
  code: text(128),
  message: text(),
  requestId: text(128),
  fieldErrors: Type.Optional(Type.Array(Type.Object({ field: text(256), message: text() }, { additionalProperties: false }), { maxItems: 100 })),
  resource: Type.Optional(Type.Object({ type: text(128), id: text(256) }, { additionalProperties: false })),
  operationId: Type.Optional(text(256)),
  facts: Type.Optional(Type.Record(Type.String({ maxLength: 128 }), Type.Union([Type.String({ maxLength: 2048 }), Type.Number(), Type.Boolean(), Type.Null()]))),
  affectedRequirements: Type.Optional(Type.Array(text(128), { maxItems: 100 })),
  recovery: Type.Optional(text()),
}, { additionalProperties: false });
export type ErrorResponse = Static<typeof ErrorResponse>;

export const TimeDefaults = Type.Object({
  formatVersion: Type.Literal(1),
  pollingIntervalMs: Type.Integer({ minimum: 1, maximum: 2_147_483_647 }),
  pollingBackoffMaxMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 2_147_483_647 })),
  passageActiveTimeMs: Type.Integer({ minimum: 1, maximum: 2_147_483_647 }),
  questionTtl: ConfiguredLimit,
}, { additionalProperties: false });
export type TimeDefaults = Static<typeof TimeDefaults>;

export const CostDefaults = Type.Object({ formatVersion: Type.Literal(1), limit: ConfiguredLimit }, { additionalProperties: false });
export type CostDefaults = Static<typeof CostDefaults>;

export const ArtifactPolicy = Type.Object({ formatVersion: Type.Literal(1), automaticDeletion: Type.Literal(false) }, { additionalProperties: false });
export type ArtifactPolicy = Static<typeof ArtifactPolicy>;

export const MaestriSettings = Type.Object({
  formatVersion: Type.Literal(1),
  workspaceId: Type.Optional(Type.Union([text(256), Type.Null()])),
}, { additionalProperties: false });
export type MaestriSettings = Static<typeof MaestriSettings>;

export const FactorySettings = Type.Object({
  id: Type.Literal('local'),
  installationId: text(128),
  accountId: Type.Union([text(256), Type.Null()]),
  designatedHost: Type.Union([text(256), Type.Null()]),
  projectsRoot: Type.Union([text(4096), Type.Null()]),
  dataRoot: text(4096),
  maestriSettings: MaestriSettings,
  automationEnabled: Type.Boolean(),
  timeDefaults: TimeDefaults,
  costDefaults: CostDefaults,
  artifactPolicy: ArtifactPolicy,
  revision,
  createdAtMs: timestamp,
  updatedAtMs: timestamp,
}, { additionalProperties: false });
export type FactorySettings = Static<typeof FactorySettings>;

export const HealthResponse = Type.Object({ status: Type.Literal('ok') }, { additionalProperties: false });
export type HealthResponse = Static<typeof HealthResponse>;

export const EmptyQuery = Type.Object({}, { additionalProperties: false });

export const EmptyBody = Type.Object({}, { additionalProperties: false });
export const OperationId = Type.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' });
export const OperationParams = Type.Object({ operationId: OperationId }, { additionalProperties: false });
export const SessionResponse = Type.Object({
  csrfToken: Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' }),
  instanceId: OperationId,
}, { additionalProperties: false });
export type SessionResponse = Static<typeof SessionResponse>;
export const OperationResource = Type.Object({ type: text(128), id: text(256) }, { additionalProperties: false });
export type OperationResource = Static<typeof OperationResource>;
// Receipts contain only non-sensitive references and counters, never arbitrary payloads.
export const OperationReceipt = Type.Object({
  revision: Type.Optional(revision), eventCursor: Type.Optional(Type.String({ pattern: '^[0-9]+$', maxLength: 20 })),
}, { additionalProperties: false });
export const OperationAccepted = Type.Object({
  operationId: OperationId, resource: OperationResource, statusUrl: text(512),
  receipt: Type.Optional(OperationReceipt), requestId: text(128),
}, { additionalProperties: false });
export type OperationAccepted = Static<typeof OperationAccepted>;
export const OperationView = Type.Object({
  operationId: OperationId, kind: text(128), resource: OperationResource,
  state: Type.Union(['accepted', 'running', 'succeeded', 'failed', 'unknown'].map((state) => Type.Literal(state))),
  receipt: Type.Optional(OperationReceipt), error: Type.Optional(ErrorResponse), requestId: text(128),
}, { additionalProperties: false });
export type OperationView = Static<typeof OperationView>;

export const ControllerEvent = Type.Object({
  seq: Type.String({ pattern: '^[1-9][0-9]*$', maxLength: 20 }),
  entityType: text(128), entityId: text(256), operationId: OperationId,
  eventType: text(128), entityRevision: revision, occurredAtMs: timestamp,
  facts: Type.Object({}, { additionalProperties: false }),
}, { additionalProperties: false });
export type ControllerEvent = Static<typeof ControllerEvent>;
export const EventQuery = Type.Object({
  cursor: Type.Optional(Type.String({ pattern: '^(0|[1-9][0-9]{0,15})$' })),
  limit: Type.Optional(Type.String({ pattern: '^(?:[1-9]|[1-9][0-9]|100)$' })),
  operationId: Type.Optional(OperationId),
}, { additionalProperties: false });
export type EventQuery = Static<typeof EventQuery>;
export const EventListQuery = Type.Object({
  cursor: Type.Optional(Type.String({ pattern: '^[A-Za-z0-9_-]+$', minLength: 1, maxLength: 256 })),
  limit: Type.Optional(Type.String({ pattern: '^(?:[1-9]|[1-9][0-9]|100)$' })),
  operationId: Type.Optional(OperationId),
}, { additionalProperties: false });
export function Page<T extends import('@sinclair/typebox').TSchema>(item: T) {
  return Type.Object({
    items: Type.Array(item, { maxItems: 100 }), nextCursor: Type.Union([text(512), Type.Null()]),
    hasMore: Type.Boolean(), eventCursor: Type.String({ pattern: '^[0-9]+$', maxLength: 20 }),
  }, { additionalProperties: false });
}
export const EventPage = Page(ControllerEvent);
export type EventPage = Static<typeof EventPage>;
