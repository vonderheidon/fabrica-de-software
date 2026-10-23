import { Type, type Static } from '@sinclair/typebox';
import { OperationId, OperationReceipt, Page, DeliveryMode, ErrorResponse } from './base.js';

const closed = { additionalProperties: false } as const;
const text = (maxLength = 2048) => Type.String({ minLength: 1, maxLength });
const timestamp = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const cursor = Type.String({ pattern: '^(0|[1-9][0-9]{0,15})$' });

export const QueueScope = Type.Object({
  kind: Type.Union([Type.Literal('account'), Type.Literal('project')]),
  projectIds: Type.Array(OperationId, { maxItems: 100, uniqueItems: true }),
}, closed);
export type QueueScope = Static<typeof QueueScope>;

export const QueueReason = Type.Union(([
  'READ_INCOMPLETE', 'ACCOUNT_CHANGED', 'NOT_AN_ISSUE', 'ISSUE_CLOSED', 'REPOSITORY_MISMATCH',
  'ASSIGNEE_MISMATCH', 'PROJECT_MEMBERSHIP_MISSING', 'STATUS_MISMATCH', 'OPEN_BLOCKERS',
  'DRAFT_ITEM', 'PULL_REQUEST', 'ARCHIVED_ITEM', 'ALREADY_CONSUMED', 'ATTEMPT_ACTIVE',
  'PROJECT_UNAVAILABLE', 'AUTOMATION_DISABLED',
  'ASSIGNEE_MISSING', 'ASSIGNEE_OTHER', 'MULTIPLE_ASSIGNEES',
  'REMOTE_UNCONFIRMED', 'CODE_NOT_PUBLISHED', 'PROJECT_REQUIRED', 'STATUS_MAPPING_LEGACY', 'STATUS_MAPPING_INVALID',
] as const).map((code) => Type.Literal(code)));

export const QueueItem = Type.Object({
  projectId: OperationId,
  projectName: text(256),
  itemId: text(256),
  kind: Type.Union([Type.Literal('issue'), Type.Literal('draft'), Type.Literal('pull_request'), Type.Literal('inaccessible')]),
  issueId: Type.Union([text(256), Type.Null()]),
  number: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  title: Type.Union([text(65536), Type.Null()]),
  url: Type.Union([text(), Type.Null()]),
  assignees: Type.Array(Type.Object({ id: text(256), login: text(100) }, closed), { maxItems: 100 }),
  status: Type.Union([text(1024), Type.Null()]),
  ready: Type.Boolean(),
  readyEligible: Type.Boolean(),
  eligible: Type.Boolean(),
  reasons: Type.Array(QueueReason, { maxItems: 20 }),
  consumption: Type.Union([Type.Literal('available'), Type.Literal('consumed'), Type.Literal('active'), Type.Literal('unknown')]),
  attemptId: Type.Union([OperationId, Type.Null()]),
  order: Type.Object({ position: Type.Integer({ minimum: 1 }), criterion: text(256), value: Type.Union([text(1024), Type.Null()]) }, closed),
}, closed);
export type QueueItem = Static<typeof QueueItem>;

export const QueueDiagnostic = Type.Object({ code: text(128), message: text(2048), recovery: text(2048) }, closed);

export const QueueObservation = Type.Object({
  scope: QueueScope,
  enabled: Type.Boolean(),
  valid: Type.Boolean(),
  complete: Type.Boolean(),
  observationId: Type.Union([OperationId, Type.Null()]),
  summaryHash: Type.Union([text(128), Type.Null()]),
  observedAtMs: Type.Union([timestamp, Type.Null()]),
  eligibleTotal: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  modesByProject: Type.Array(Type.Object({ projectId: OperationId, mode: DeliveryMode }, closed), { maxItems: 100 }),
  account: Type.Object({ id: Type.Union([text(256), Type.Null()]), login: Type.Union([text(100), Type.Null()]) }, closed),
  host: Type.Object({ expected: Type.Union([text(256), Type.Null()]), observed: text(256), matches: Type.Boolean() }, closed),
  order: Type.Object({ criterion: text(256), description: text(1024) }, closed),
  page: Page(QueueItem),
  diagnostics: Type.Array(QueueDiagnostic, { maxItems: 100 }),
  eventCursor: cursor,
  polling: Type.Object({ intervalMs: timestamp, backoffMaxMs: timestamp, retryAtMs: Type.Union([timestamp, Type.Null()]), nextPollAtMs: timestamp }, closed),
}, closed);
export type QueueObservation = Static<typeof QueueObservation>;

export const QueueQuery = Type.Object({
  projectId: Type.Optional(OperationId),
  projectIds: Type.Optional(Type.String({ minLength: 36, maxLength: 3699, pattern: '^[0-9a-fA-F-]{36}(,[0-9a-fA-F-]{36})*$' })),
  cursor: Type.Optional(text(512)),
  limit: Type.Optional(Type.String({ pattern: '^(?:[1-9]|[1-9][0-9]|100)$' })),
}, closed);
export type QueueQuery = Static<typeof QueueQuery>;

export const QueueCommand = Type.Object({
  enabled: Type.Boolean(),
  scope: QueueScope,
  observationId: Type.Optional(OperationId),
  authorizedSummaryHash: Type.Optional(text(128)),
}, closed);
export type QueueCommand = Static<typeof QueueCommand>;

export const QueueSaved = Type.Object({
  queue: QueueObservation,
  operationId: OperationId,
  receipt: OperationReceipt,
}, closed);
export type QueueSaved = Static<typeof QueueSaved>;

export const QueueConflict = Type.Object({ ...ErrorResponse.properties, queue: QueueObservation }, closed);
