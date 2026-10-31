import { PublicationTargetSelection } from '../publication-targets.js';
import { DeliverySummaryView } from '../delivery-summary.js';
import { FindingDispute } from './disputes.js';
// HTTP DTOs only. Private captures and native executor protocols retain their versioned representation.
import { FindingAssessment, AttemptBlock } from './progress.js';
import { AttemptDecisionView } from './decisions.js';
import { Type, type Static } from "@sinclair/typebox";
import { Capability, DeliveryMode, OperationId, Page } from "../base.js";
import { AttemptStatus } from "./attempts.js";
import { AttemptMeasurements, Question } from "./questions.js";
import { DeliveryView } from "./deliveries.js";
import { PublicationSummary, EffectView } from "./publication.js";
import { AttemptResource } from "./recovery.js";
import { Criterion, PublicationTargetIntent } from "../preparations.js";
import { Finding, Review, RoundHistory } from "./reviews.js";
import { CriterionOutcome } from "./protocol-views.js";
import { PassageRole } from "./protocol-views.js";
import { AttemptWorkspaceSnapshot } from "../workspaces.js";
const closed = { additionalProperties: false } as const;
const nullable = <T extends import('@sinclair/typebox').TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
const text = Type.String({ maxLength: 4096 });
const paging = { cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 2048 })), limit: Type.Optional(Type.String({ pattern: '^(?:[1-9]|[1-9][0-9]|100)$' })) };
export const IssueHeader = Type.Object({ id: Type.String({ maxLength: 256 }), number: Type.Integer({ minimum: 1 }), title: Type.String({ maxLength: 65536 }), url: Type.String({ maxLength: 4096 }) }, closed);
export const AttemptListQuery = Type.Object({
    ...paging,
    project_id: Type.Optional(OperationId),
    result: Type.Optional(Type.Union([Type.Literal('active'), ...['delivered', 'rejected', 'failed', 'cancelled', 'interrupted'].map(v => Type.Literal(v))])),
    issue_number: Type.Optional(Type.String({ pattern: '^[1-9][0-9]{0,9}$' })),
    issue_title: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    date_from: Type.Optional(Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
    date_to: Type.Optional(Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
    time_zone: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
}, closed);
export type AttemptListQuery = Static<typeof AttemptListQuery>;
export const AttemptSummary = Type.Object({
    id: OperationId, project_id: OperationId, issue_id: Type.String(), issue_number: nullable(Type.Integer({ minimum: 1 })), issue_title: Type.Optional(nullable(Type.String({ maxLength: 65536 }))),
    diagnostic: Type.Optional(AttemptStatus.properties.diagnostic),
    phase: AttemptStatus.properties.phase, result: AttemptStatus.properties.result, suspension: AttemptStatus.properties.suspension,
    revision: Type.Integer(), created_at_ms: Type.Integer(), updated_at_ms: Type.Integer(),
}, closed);
export type AttemptSummary = Static<typeof AttemptSummary>;
export const AttemptPage = Page(AttemptSummary);
export type AttemptPage = Static<typeof AttemptPage>;
export const HistoricalEffectiveProfile = Type.Object({
    role: PassageRole, profile_id: Type.Union([OperationId, Type.Null()]), profile_revision: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    executor: Type.String({ minLength: 1, maxLength: 256 }), provider: Type.String({ minLength: 1, maxLength: 256 }),
    model: Type.String({ minLength: 1, maxLength: 256 }), effort: Type.Union([Type.String({ minLength: 1, maxLength: 128 }), Type.Null()]),
    guidance: Type.String({ maxLength: 8192 }), composition_version: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    context_summary: Type.String({ maxLength: 8192 }), technical_contract_summary: Type.String({ minLength: 1, maxLength: 4096 }),
    credentials_redacted: Type.Literal(true),
}, closed);
export const DetailSection = Type.Union(['rounds', 'passages', 'criteria', 'reviews', 'findings', 'questions', 'effects', 'resources', 'profiles', 'finding_assessments', 'finding_disputes', 'decisions', 'target_selections'].map(v => Type.Literal(v)));
export type DetailSection = Static<typeof DetailSection>;
export const AttemptDetailQuery = Type.Object({ ...paging, round_id: Type.Optional(Type.String({ pattern: '^[1-6]$' })), delivery_id: Type.Optional(OperationId), section: Type.Optional(DetailSection) }, closed);
export type AttemptDetailQuery = Static<typeof AttemptDetailQuery>;
export const DeliveryDetailQuery = Type.Object({ ...paging, section: Type.Optional(DetailSection) }, closed);
export type DeliveryDetailQuery = Static<typeof DeliveryDetailQuery>;
export const PassageSummary = Type.Object({ id: OperationId, attempt_id: OperationId, delivery_id: OperationId, round: Type.Integer(),
    role: Type.Union([Type.Literal('implementer'), Type.Literal('reviewer')]), state: text, tracking: text,
    diagnostic: nullable(text), result_receipt_id: nullable(OperationId), created_at_ms: Type.Integer(),
    attempt_session_id: Type.Optional(nullable(OperationId)), session_state: Type.Optional(nullable(text)),
    session_source_id: Type.Optional(nullable(OperationId)), terminal_name: Type.Optional(nullable(text)), occupancy_state: Type.Optional(nullable(text)),
    terminal_state: Type.Optional(nullable(text)),
}, closed);
export const CriterionDetail = Type.Object({ ...Criterion.properties, producer: nullable(Type.Object({ verdict: CriterionOutcome.properties.verdict, evidence: CriterionOutcome.properties.evidence }, closed)),
    reviewer: nullable(Type.Object({ verdict: CriterionOutcome.properties.verdict, evidence: CriterionOutcome.properties.evidence }, closed)) }, closed);
export const ReviewSummary = Type.Omit(Review, ['criteria', 'findings', 'resolutions', 'command_repetitions', 'dispute_details_url']);
export const QuestionSummary = Type.Object({ id: OperationId, attempt_id: OperationId, passage_id: OperationId, delivery_id: OperationId,
    state: Question.properties.state, revision: Type.Integer(), created_at_ms: Type.Integer(), expires_at_ms: nullable(Type.Integer()), delivery_receipt: Question.properties.delivery_receipt }, closed);
export const FindingDetail = Type.Object({ ...Finding.properties, resolutions: Type.Array(Type.Object({ review_id: OperationId, delivery_id: OperationId,
        verdict: Type.Union([Type.Literal('resolved'), Type.Literal('unresolved')]), evidence: CriterionOutcome.properties.evidence }, closed), { maxItems: 6 }) }, closed);
export const DetailItem = Type.Union([RoundHistory.properties.entries.items, PassageSummary, CriterionDetail, ReviewSummary, FindingDetail, QuestionSummary, EffectView, AttemptResource, HistoricalEffectiveProfile, FindingAssessment, FindingDispute, AttemptDecisionView, PublicationTargetSelection]);
export type DetailItem = Static<typeof DetailItem>;
export const DetailPage = Type.Object({ section: DetailSection, ...Page(DetailItem).properties }, closed);
export type DetailPage = Static<typeof DetailPage>;
export const AttemptV3DetailPage = Type.Union([Type.Object({ section: Type.Literal('target_selections'), items: Type.Array(PublicationTargetSelection, { maxItems: 100 }), next_cursor: nullable(Type.String({ minLength: 1, maxLength: 2048 })), has_more: Type.Boolean() }, closed), Type.Object({ section: Type.Literal('finding_assessments'), items: Type.Array(FindingAssessment, { maxItems: 100 }), next_cursor: nullable(Type.String({ minLength: 1, maxLength: 2048 })), has_more: Type.Boolean() }, closed), Type.Object({ section: Type.Literal('finding_disputes'), items: Type.Array(FindingDispute, { maxItems: 100 }), next_cursor: nullable(Type.String({ minLength: 1, maxLength: 2048 })), has_more: Type.Boolean() }, closed), Type.Object({ section: Type.Literal('decisions'), items: Type.Array(AttemptDecisionView, { maxItems: 100 }), next_cursor: nullable(Type.String({ minLength: 1, maxLength: 2048 })), has_more: Type.Boolean() }, closed)]);
export const AttemptDetail = Type.Object({ ...AttemptStatus.properties,
    workspace_lineage: AttemptWorkspaceSnapshot,
    stage_activity: StageActivity,
    expected_account_id: Type.String({ maxLength: 256 }),
    issue: IssueHeader,
    selected_delivery_id: nullable(OperationId), selected_round: Type.Integer({ minimum: 1, maximum: 6 }),
    delivery_summary: nullable(DeliverySummaryView),
    publication_target: nullable(PublicationTargetIntent), publication_target_hash: nullable(Type.String({ pattern: '^[a-f0-9]{64}$' })),
    publication: PublicationSummary, measurements: AttemptMeasurements,
    cleanup: Type.Union(['pending', 'complete', 'uncertain'].map(v => Type.Literal(v))),
    authority: nullable(Type.Object({ reason: nullable(text), expected_status_id: nullable(text), observed_status_id: nullable(text), observed_at_ms: Type.Integer(), recovery: text }, closed)),
    capabilities: Type.Object({ cancel: Capability, complete_publication: Capability, reconcile_publication: Capability, revalidate: Capability }, closed),
    block: AttemptBlock,
    v3_details: nullable(AttemptV3DetailPage),
    history_sections: Type.Optional(Type.Array(Type.Union(['target_selections', 'finding_assessments', 'finding_disputes', 'decisions'].map(value => Type.Literal(value))), { maxItems: 4 })),
    details: nullable(DetailPage),
}, closed);
export type AttemptDetail = Static<typeof AttemptDetail>;
export const DeliveryDetail = Type.Object({ ...DeliveryView.properties,
    delivery_summary: DeliverySummaryView,
    issue: IssueHeader,
    attempt: AttemptStatus, measurements: AttemptMeasurements, cleanup: Type.Union(['pending', 'complete', 'uncertain'].map(v => Type.Literal(v))),
    authorizations: Type.Object({ captured_mode: DeliveryMode, authorized_mode: DeliveryMode, requires_current_gate: Type.Literal(true) }, closed),
    review: nullable(ReviewSummary), publication: PublicationSummary,
    capabilities: Type.Object({ diff: Capability, complete_publication: Capability, reconcile_publication: Capability }, closed),
    details: nullable(DetailPage),
}, closed);
export type DeliveryDetail = Static<typeof DeliveryDetail>;

import { StageActivity } from '../stage-activity.js';
