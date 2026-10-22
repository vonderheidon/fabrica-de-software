// Public HTTP DTOs; private documents retain their versioned representation.
import { Type, type Static } from '@sinclair/typebox';
import { OperationId, Page } from '../base.js';
const text = (maxLength = 256) => Type.String({ minLength: 1, maxLength });
const revision = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const timestamp = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
export const ControllerEvent = Type.Object({
    context: Type.Optional(Type.Object({
        project_name: Type.Optional(text(1024)), issue_number: Type.Optional(Type.Integer({ minimum: 1 })),
        issue_title: Type.Optional(text(16384)), attempt_created_at_ms: Type.Optional(timestamp),
        round: Type.Optional(Type.Integer({ minimum: 1 })), role: Type.Optional(Type.Union([Type.Literal('implementer'), Type.Literal('reviewer')])),
    }, { additionalProperties: false })),
    seq: Type.String({ pattern: '^[1-9][0-9]*$', maxLength: 20 }),
    entity_type: text(128), entity_id: text(256), operation_id: OperationId,
    event_type: text(128), entity_revision: revision, occurred_at_ms: timestamp,
    facts: Type.Object({}, { additionalProperties: false }),
    project_id: Type.Optional(OperationId), attempt_id: Type.Optional(OperationId),
}, { additionalProperties: false });
export type ControllerEvent = Static<typeof ControllerEvent>;
export const EventQuery = Type.Object({
    cursor: Type.Optional(Type.String({ pattern: '^(0|[1-9][0-9]{0,15})$' })),
    limit: Type.Optional(Type.String({ pattern: '^(?:[1-9]|[1-9][0-9]|100)$' })),
    operation_id: Type.Optional(OperationId),
    project_id: Type.Optional(OperationId), attempt_id: Type.Optional(OperationId),
}, { additionalProperties: false });
export type EventQuery = Static<typeof EventQuery>;
export const EventListQuery = Type.Object({
    include_technical: Type.Optional(Type.Union([Type.Literal('true'), Type.Literal('false')])),
    cursor: Type.Optional(Type.String({ pattern: '^[A-Za-z0-9_-]+$', minLength: 1, maxLength: 256 })),
    limit: Type.Optional(Type.String({ pattern: '^(?:[1-9]|[1-9][0-9]|100)$' })),
    operation_id: Type.Optional(OperationId),
    project_id: Type.Optional(OperationId), attempt_id: Type.Optional(OperationId),
}, { additionalProperties: false });
export const EventStreamQuery = Type.Object({
    cursor: Type.Optional(Type.String({ maxLength: 256 })),
    project_id: Type.Optional(OperationId), attempt_id: Type.Optional(OperationId), operation_id: Type.Optional(OperationId),
}, { additionalProperties: false });
export const EventPage = Page(ControllerEvent);
export type EventPage = Static<typeof EventPage>;

// The SSE id carries seq; its JSON payload is distinct from a paginated event.
export const ControllerEventFrame = Type.Object({
  entity: Type.Object({ type: text(128), id: text(256) }, { additionalProperties: false }),
  revision, operation_id: OperationId, event_type: text(128),
  project_id: Type.Optional(OperationId), attempt_id: Type.Optional(OperationId),
  facts: Type.Object({}, { additionalProperties: false }),
}, { additionalProperties: false });
export type ControllerEventFrame = Static<typeof ControllerEventFrame>;

export type EventListQuery = Static<typeof EventListQuery>;
export type EventStreamQuery = Static<typeof EventStreamQuery>;
