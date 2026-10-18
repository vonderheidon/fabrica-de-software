// Public HTTP DTOs; private documents retain their versioned representation.
import { Type, type Static } from '@sinclair/typebox';
import { OperationId, OperationReceipt } from '../base.js';
import { AttemptSummary } from '../http-execution/queries.js';
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
    affected_requirements: Type.Array(text(128), { minItems: 1, maxItems: 20 }),
    facts: Type.Object({
        expected_account_id: Type.Optional(Type.Union([text(256), Type.Null()])),
        observed_account_id: Type.Optional(Type.Union([text(256), Type.Null()])),
        expected_host: Type.Optional(Type.Union([text(256), Type.Null()])), observed_host: Type.Optional(text(256)),
        project_id: Type.Optional(OperationId), creation_id: Type.Optional(OperationId), attempt_id: Type.Optional(OperationId),
        resource_count: Type.Optional(Type.Integer({ minimum: 0 })), uncertain_count: Type.Optional(Type.Integer({ minimum: 0 })),
        profile_count: Type.Optional(Type.Integer({ minimum: 0 })),
        implementer_profile_count: Type.Optional(Type.Integer({ minimum: 0 })),
        reviewer_profile_count: Type.Optional(Type.Integer({ minimum: 0 })),
        onboarding_completed_at_ms: Type.Optional(Type.Union([time, Type.Null()])),
        projects_root_configured: Type.Optional(Type.Boolean()),
        projects_root_confirmed: Type.Optional(Type.Boolean()),
        retry_at_ms: Type.Optional(Type.Union([time, Type.Null()])),
    }, closed),
    recovery: text(), observed_at_ms: time,
}, closed);
export type ContextDiagnostic = Static<typeof ContextDiagnostic>;
export const DiagnosticReport = Type.Object({
    receipt: OperationReceipt,
    operation_id: OperationId, state: Type.Union((['accepted', 'succeeded', 'failed', 'unknown'] as const).map(s => Type.Literal(s))),
    created_at_ms: time, completed_at_ms: Type.Union([time, Type.Null()]),
    checks: Type.Array(DiagnosticCheck, { minItems: 1, maxItems: 4, uniqueItems: true }),
    diagnostics: Type.Array(ContextDiagnostic, { maxItems: 104 }),
}, closed);
export type DiagnosticReport = Static<typeof DiagnosticReport>;
export const DiagnosticsView = Type.Object({
    context: DiagnosticContext, supported_checks: Type.Array(DiagnosticCheck, { maxItems: 4 }),
    diagnostics: Type.Array(ContextDiagnostic, { maxItems: 100 }),
    reports: Type.Array(DiagnosticReport, { maxItems: 4 }),
    event_cursor: Type.String({ pattern: '^[0-9]+$', maxLength: 20 }),
}, closed);
export type DiagnosticsView = Static<typeof DiagnosticsView>;
export const OperationSummaryQuery = Type.Object({ project_id: Type.Optional(OperationId) }, closed);
export type OperationSummaryQuery = Static<typeof OperationSummaryQuery>;
export const OperationSummary = Type.Object({
    account: Type.Object({ id: Type.Union([text(256), Type.Null()]), login: Type.Union([text(100), Type.Null()]),
        observed_id: Type.Union([text(256), Type.Null()]), observed_at_ms: Type.Union([time, Type.Null()]) }, closed),
    host: Type.Object({ designated: Type.Union([text(256), Type.Null()]), current: text(256), matches: Type.Boolean() }, closed),
    automation: Type.Object({ enabled: Type.Boolean(), dispatch_paused: Type.Boolean(), project_enabled: Type.Union([Type.Boolean(), Type.Null()]) }, closed),
    active_attempt: Type.Union([AttemptSummary, Type.Null()]),
    active_attempt_count: Type.Integer({ minimum: 0 }),
    next_candidates: Type.Array(Type.Object({ project_id: OperationId, issue_id: text(256), observed_at_ms: time }, closed), { maxItems: 5 }),
    candidate_observation: Type.Object({ state: Type.Union([Type.Literal('recorded'), Type.Literal('not_observed')]),
        requires_revalidation: Type.Literal(true), order: Type.Literal('observed_queue_order'), has_more: Type.Boolean() }, closed),
    recent_results: Type.Array(AttemptSummary, { maxItems: 5 }),
    impediments: Type.Array(ContextDiagnostic, { maxItems: 100 }),
    integration_status: Type.Object({ kind: Type.Literal('maestri_native'),
        observation: Type.Union([ContextDiagnostic, Type.Null()]),
        state: Type.Union([Type.Literal('not_checked'), Type.Literal('observed')]),
        proves_provider_execution: Type.Literal(false) }, closed),
    event_cursor: Type.String({ pattern: '^[0-9]+$', maxLength: 20 }),
}, closed);
export type OperationSummary = Static<typeof OperationSummary>;
