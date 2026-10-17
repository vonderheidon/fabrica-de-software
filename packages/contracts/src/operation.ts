import { Type, type Static } from '@sinclair/typebox';
import { OperationId } from './base.js';
import { AttemptSummary } from './queries.js';

const closed = { additionalProperties: false } as const;
const text = (maxLength = 2048) => Type.String({ minLength: 1, maxLength });
const time = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
export const DiagnosticCheck = Type.Union((['configuration', 'github_identity', 'maestri_context', 'resources'] as const).map(c => Type.Literal(c)));
export type DiagnosticCheck = Static<typeof DiagnosticCheck>;
export const DiagnosticContext = Type.Union([
  Type.Object({ scope: Type.Literal('host') }, closed),
  ...(['project', 'creation', 'attempt'] as const).map(scope => Type.Object({ scope: Type.Literal(scope), id: OperationId }, closed)),
]);
export type DiagnosticContext = Static<typeof DiagnosticContext>;
export const DiagnosticChecks = Type.Object({ checks: Type.Array(DiagnosticCheck, { minItems: 1, maxItems: 4, uniqueItems: true }) }, closed);
export const DiagnosticRequest = Type.Union([
  Type.Object({ scope: Type.Literal('host'), checks: Type.Array(DiagnosticCheck, { minItems: 1, maxItems: 4, uniqueItems: true }) }, closed),
  ...(['project', 'creation', 'attempt'] as const).map(scope => Type.Object({ scope: Type.Literal(scope), id: OperationId,
    checks: Type.Array(DiagnosticCheck, { minItems: 1, maxItems: 4, uniqueItems: true }) }, closed)),
]);
export type DiagnosticRequest = Static<typeof DiagnosticRequest>;
export const ContextDiagnostic = Type.Object({
  check: DiagnosticCheck,
  state: Type.Union((['passed', 'blocked', 'unavailable'] as const).map(s => Type.Literal(s))),
  code: Type.String({ pattern: '^[A-Z][A-Z0-9_]{0,127}$' }), cause: text(),
  affectedRequirements: Type.Array(text(128), { minItems: 1, maxItems: 20 }),
  facts: Type.Object({
    expectedAccountId: Type.Optional(Type.Union([text(256), Type.Null()])),
    observedAccountId: Type.Optional(Type.Union([text(256), Type.Null()])),
    expectedHost: Type.Optional(Type.Union([text(256), Type.Null()])), observedHost: Type.Optional(text(256)),
    projectId: Type.Optional(OperationId), creationId: Type.Optional(OperationId), attemptId: Type.Optional(OperationId),
    resourceCount: Type.Optional(Type.Integer({ minimum: 0 })), uncertainCount: Type.Optional(Type.Integer({ minimum: 0 })),
    profileCount: Type.Optional(Type.Integer({ minimum: 0 })),
    retryAtMs: Type.Optional(Type.Union([time, Type.Null()])),
  }, closed),
  recovery: text(), observedAtMs: time,
}, closed);
export type ContextDiagnostic = Static<typeof ContextDiagnostic>;
export const DiagnosticReport = Type.Object({
  operationId: OperationId, state: Type.Union((['accepted', 'succeeded', 'failed', 'unknown'] as const).map(s => Type.Literal(s))),
  createdAtMs: time, completedAtMs: Type.Union([time, Type.Null()]),
  checks: Type.Array(DiagnosticCheck, { minItems: 1, maxItems: 4, uniqueItems: true }),
  diagnostics: Type.Array(ContextDiagnostic, { maxItems: 4 }),
}, closed);
export type DiagnosticReport = Static<typeof DiagnosticReport>;
export const DiagnosticsView = Type.Object({
  context: DiagnosticContext, supportedChecks: Type.Array(DiagnosticCheck, { maxItems: 4 }),
  diagnostics: Type.Array(ContextDiagnostic, { maxItems: 100 }),
  reports: Type.Array(DiagnosticReport, { maxItems: 4 }),
  eventCursor: Type.String({ pattern: '^[0-9]+$', maxLength: 20 }),
}, closed);
export type DiagnosticsView = Static<typeof DiagnosticsView>;
export const OperationSummaryQuery = Type.Object({ projectId: Type.Optional(OperationId) }, closed);
export type OperationSummaryQuery = Static<typeof OperationSummaryQuery>;
export const OperationSummary = Type.Object({
  account: Type.Object({ id: Type.Union([text(256), Type.Null()]), login: Type.Union([text(100), Type.Null()]),
    observedId: Type.Union([text(256), Type.Null()]), observedAtMs: Type.Union([time, Type.Null()]) }, closed),
  host: Type.Object({ designated: Type.Union([text(256), Type.Null()]), current: text(256), matches: Type.Boolean() }, closed),
  automation: Type.Object({ enabled: Type.Boolean(), dispatchPaused: Type.Boolean(), projectEnabled: Type.Union([Type.Boolean(), Type.Null()]) }, closed),
  activeAttempt: Type.Union([AttemptSummary, Type.Null()]),
  activeAttemptCount: Type.Integer({ minimum: 0 }),
  nextCandidates: Type.Array(Type.Object({ projectId: OperationId, issueId: text(256), observedAtMs: time }, closed), { maxItems: 5 }),
  candidateObservation: Type.Object({ state: Type.Union([Type.Literal('recorded'), Type.Literal('not_observed')]),
    requiresRevalidation: Type.Literal(true), order: Type.Literal('observed_queue_order'), hasMore: Type.Boolean() }, closed),
  recentResults: Type.Array(AttemptSummary, { maxItems: 5 }),
  impediments: Type.Array(ContextDiagnostic, { maxItems: 100 }),
  integrationStatus: Type.Object({ kind: Type.Literal('maestri_native'),
    observation: Type.Union([ContextDiagnostic, Type.Null()]),
    state: Type.Union([Type.Literal('not_checked'), Type.Literal('observed')]),
    provesProviderExecution: Type.Literal(false) }, closed),
  eventCursor: Type.String({ pattern: '^[0-9]+$', maxLength: 20 }),
}, closed);
export type OperationSummary = Static<typeof OperationSummary>;
