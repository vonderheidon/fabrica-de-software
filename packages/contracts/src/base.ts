import { Type, type Static } from '@sinclair/typebox';

const text = (maxLength = 2048) => Type.String({ minLength: 1, maxLength });
const timestamp = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const revision = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const unconfigured = Type.Object({ state: Type.Literal('not_configured') }, { additionalProperties: false });
const durationMs = Type.Integer({ minimum: 1, maximum: 2_147_483_647 });
export const OperationId = Type.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' });

export const DeliveryMode = Type.Union([Type.Literal('icr'), Type.Literal('commit'), Type.Literal('pr')]);
export type DeliveryMode = Static<typeof DeliveryMode>;

export const Capability = Type.Object({
  available: Type.Boolean(),
  reason_code: Type.Optional(text(128)),
  reason: Type.Optional(text()),
  recovery: Type.Optional(text()),
}, { additionalProperties: false });
export type Capability = Static<typeof Capability>;

export const MeasuredValue = Type.Union([
  Type.Object({ state: Type.Literal('measured'), value: Type.Number({ minimum: 0 }), unit: text(64) }, { additionalProperties: false }),
  Type.Object({ state: Type.Literal('unavailable'), reason: text(), affected_requirements: Type.Array(text(128), { minItems: 1, maxItems: 100 }) }, { additionalProperties: false }),
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
  request_id: text(128),
  field_errors: Type.Optional(Type.Array(Type.Object({ field: text(256), message: text() }, { additionalProperties: false }), { maxItems: 100 })),
  resource: Type.Optional(Type.Object({ type: text(128), id: text(256) }, { additionalProperties: false })),
  operation_id: Type.Optional(OperationId),
  facts: Type.Optional(Type.Record(Type.String({ maxLength: 128 }), Type.Union([Type.String({ maxLength: 2048 }), Type.Number(), Type.Boolean(), Type.Null()]))),
  affected_requirements: Type.Optional(Type.Array(text(128), { maxItems: 100 })),
  recovery: Type.Optional(text()),
}, { additionalProperties: false });
export type ErrorResponse = Static<typeof ErrorResponse>;

export const TimeDefaults = Type.Object({
  format_version: Type.Literal(1),
  polling_interval_ms: durationMs,
  polling_backoff_max_ms: Type.Optional(durationMs),
  passage_active_time_ms: durationMs,
  question_ttl: ConfiguredLimit,
}, { additionalProperties: false });
export type TimeDefaults = Static<typeof TimeDefaults>;

export const ArtifactPolicy = Type.Object({ format_version: Type.Literal(1), automatic_deletion: Type.Literal(false) }, { additionalProperties: false });
export type ArtifactPolicy = Static<typeof ArtifactPolicy>;

export const FactorySettings = Type.Object({
  id: Type.Literal('local'),
  installation_id: text(128),
  account_id: Type.Union([text(256), Type.Null()]),
  designated_host: Type.Union([text(256), Type.Null()]),
  projects_root: Type.Union([text(4096), Type.Null()]),
  automation_enabled: Type.Boolean(),
  time_defaults: TimeDefaults,
  artifact_policy: ArtifactPolicy,
  revision,
  created_at_ms: timestamp,
  updated_at_ms: timestamp,
}, { additionalProperties: false });
export type FactorySettings = Static<typeof FactorySettings>;

export const HealthResponse = Type.Object({ status: Type.Literal('ok') }, { additionalProperties: false });
export type HealthResponse = Static<typeof HealthResponse>;

export const EmptyQuery = Type.Object({}, { additionalProperties: false });

export const EmptyBody = Type.Object({}, { additionalProperties: false });
export const OperationParams = Type.Object({ operationId: OperationId }, { additionalProperties: false });
export const SessionResponse = Type.Object({
  csrf_token: Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' }),
  instance_id: OperationId,
}, { additionalProperties: false });
export type SessionResponse = Static<typeof SessionResponse>;
export const OperationResource = Type.Object({ type: text(128), id: text(256) }, { additionalProperties: false });
export type OperationResource = Static<typeof OperationResource>;
// Receipts contain only non-sensitive references and counters, never arbitrary payloads.
export const OperationReceipt = Type.Object({
  revision: Type.Optional(revision), event_cursor: Type.Optional(Type.String({ pattern: '^[0-9]+$', maxLength: 20 })),
}, { additionalProperties: false });
export type OperationReceipt = Static<typeof OperationReceipt>;
export const OperationWarning = Type.Object({ code: text(128), message: text() }, { additionalProperties: false });
export type OperationWarning = Static<typeof OperationWarning>;
export const OperationAccepted = Type.Object({
  operation_id: OperationId, resource: OperationResource, status_url: text(512),
  receipt: Type.Optional(OperationReceipt), request_id: text(128),
}, { additionalProperties: false });
export type OperationAccepted = Static<typeof OperationAccepted>;
export const OperationProgress = Type.Object({
  step: Type.Union(['planned', 'quiescence_checked', 'moving', 'verifying', 'publishing_location'].map(step => Type.Literal(step))),
  state: Type.Union(['planned', 'running', 'verified', 'uncertain', 'blocked'].map(state => Type.Literal(state))),
  generation: Type.Integer({ minimum: 1 }), revision: Type.Integer({ minimum: 1 }),
}, { additionalProperties: false });
export type OperationProgress = Static<typeof OperationProgress>;
export const OperationView = Type.Object({
  operation_id: OperationId, kind: text(128), resource: OperationResource,
  state: Type.Union(['accepted', 'running', 'succeeded', 'failed', 'unknown'].map((state) => Type.Literal(state))),
  receipt: Type.Optional(OperationReceipt), progress: Type.Optional(OperationProgress), warnings: Type.Optional(Type.Array(OperationWarning, { maxItems: 10 })),
  error: Type.Optional(ErrorResponse), request_id: text(128),
}, { additionalProperties: false });
export type OperationView = Static<typeof OperationView>;

export const ControllerEvent = Type.Object({
  context: Type.Optional(Type.Object({
    projectName: Type.Optional(text(1024)), issueNumber: Type.Optional(Type.Integer({ minimum: 1 })),
    issueTitle: Type.Optional(text(16384)), attemptCreatedAtMs: Type.Optional(timestamp),
    round: Type.Optional(Type.Integer({ minimum: 1 })), role: Type.Optional(Type.Union([Type.Literal('implementer'), Type.Literal('reviewer')])),
  }, { additionalProperties: false })),
  seq: Type.String({ pattern: '^[1-9][0-9]*$', maxLength: 20 }),
  entityType: text(128), entityId: text(256), operationId: OperationId,
  eventType: text(128), entityRevision: revision, occurredAtMs: timestamp,
  facts: Type.Object({}, { additionalProperties: false }),
  projectId: Type.Optional(OperationId), attemptId: Type.Optional(OperationId),
}, { additionalProperties: false });
export type ControllerEvent = Static<typeof ControllerEvent>;
export const EventQuery = Type.Object({
  cursor: Type.Optional(Type.String({ pattern: '^(0|[1-9][0-9]{0,15})$' })),
  limit: Type.Optional(Type.String({ pattern: '^(?:[1-9]|[1-9][0-9]|100)$' })),
  operationId: Type.Optional(OperationId),
  projectId: Type.Optional(OperationId), attemptId: Type.Optional(OperationId),
}, { additionalProperties: false });
export type EventQuery = Static<typeof EventQuery>;
export const EventListQuery = Type.Object({
  includeTechnical: Type.Optional(Type.Union([Type.Literal('true'), Type.Literal('false')])),
  cursor: Type.Optional(Type.String({ pattern: '^[A-Za-z0-9_-]+$', minLength: 1, maxLength: 256 })),
  limit: Type.Optional(Type.String({ pattern: '^(?:[1-9]|[1-9][0-9]|100)$' })),
  operationId: Type.Optional(OperationId),
  projectId: Type.Optional(OperationId), attemptId: Type.Optional(OperationId),
}, { additionalProperties: false });
export const EventStreamQuery = Type.Object({
  cursor: Type.Optional(Type.String({ maxLength: 256 })),
  projectId: Type.Optional(OperationId), attemptId: Type.Optional(OperationId), operationId: Type.Optional(OperationId),
}, { additionalProperties: false });
export function Page<T extends import('@sinclair/typebox').TSchema>(item: T) {
  return Type.Object({
    items: Type.Array(item, { maxItems: 100 }), next_cursor: Type.Union([text(512), Type.Null()]),
    has_more: Type.Boolean(), event_cursor: Type.String({ pattern: '^[0-9]+$', maxLength: 20 }),
  }, { additionalProperties: false });
}
export const EventPage = Page(ControllerEvent);
export type EventPage = Static<typeof EventPage>;
