// HTTP DTOs only. Private captures and native executor protocols retain their versioned representation.
import { Type, type Static } from "@sinclair/typebox";
import { Capability, DeliveryMode, OperationId, Page } from "../base.js";
import { AttemptStatus } from "./attempts.js";
import { AttemptMeasurements, Question } from "./questions.js";
import { DeliveryView } from "./deliveries.js";
import { PublicationSummary, EffectView } from "./publication.js";
import { AttemptResource } from "./recovery.js";
import { Criterion } from "../preparations.js";
import { CheckRun } from "./verification.js";
import { Finding, Review, RoundHistory } from "./reviews.js";
import { CriterionOutcome } from "./protocol-views.js";
const closed = { additionalProperties: false } as const;
const nullable = <T extends import('@sinclair/typebox').TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
const text = Type.String({ maxLength: 4096 });
const paging = { cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 2048 })), limit: Type.Optional(Type.String({ pattern: '^(?:[1-9]|[1-9][0-9]|100)$' })) };
export const IssueHeader = Type.Object({ id: Type.String({ maxLength: 256 }), number: Type.Integer({ minimum: 1 }), title: Type.String({ maxLength: 65536 }), url: Type.String({ maxLength: 4096 }) }, closed);
export const AttemptListQuery = Type.Object({ ...paging, project_id: Type.Optional(OperationId), result: Type.Optional(Type.Union([Type.Literal('active'), ...['delivered', 'rejected', 'failed', 'cancelled', 'interrupted'].map(v => Type.Literal(v))])) }, closed);
export type AttemptListQuery = Static<typeof AttemptListQuery>;
export const AttemptSummary = Type.Object({
    id: OperationId, project_id: OperationId, issue_id: Type.String(), issue_number: Type.Integer(),
    phase: AttemptStatus.properties.phase, result: AttemptStatus.properties.result, suspension: AttemptStatus.properties.suspension,
    revision: Type.Integer(), created_at_ms: Type.Integer(), updated_at_ms: Type.Integer(),
}, closed);
export type AttemptSummary = Static<typeof AttemptSummary>;
export const AttemptPage = Page(AttemptSummary);
export type AttemptPage = Static<typeof AttemptPage>;
export const DetailSection = Type.Union(['rounds', 'passages', 'criteria', 'checks', 'reviews', 'findings', 'questions', 'effects', 'resources'].map(v => Type.Literal(v)));
export type DetailSection = Static<typeof DetailSection>;
export const AttemptDetailQuery = Type.Object({ ...paging, round_id: Type.Optional(Type.String({ pattern: '^[1-6]$' })), delivery_id: Type.Optional(OperationId), section: Type.Optional(DetailSection) }, closed);
export type AttemptDetailQuery = Static<typeof AttemptDetailQuery>;
export const DeliveryDetailQuery = Type.Object({ ...paging, section: Type.Optional(DetailSection) }, closed);
export type DeliveryDetailQuery = Static<typeof DeliveryDetailQuery>;
export const PassageSummary = Type.Object({ id: OperationId, attempt_id: OperationId, delivery_id: OperationId, round: Type.Integer(),
    role: Type.Union([Type.Literal('implementer'), Type.Literal('reviewer')]), state: text, tracking: text,
    diagnostic: nullable(text), result_receipt_id: nullable(OperationId), created_at_ms: Type.Integer(),
}, closed);
export const CriterionDetail = Type.Object({ ...Criterion.properties, producer: nullable(Type.Object({ verdict: CriterionOutcome.properties.verdict, evidence: CriterionOutcome.properties.evidence }, closed)),
    reviewer: nullable(Type.Object({ verdict: CriterionOutcome.properties.verdict, evidence: CriterionOutcome.properties.evidence }, closed)) }, closed);
export const ReviewSummary = Type.Omit(Review, ['criteria', 'findings', 'resolutions']);
export const QuestionSummary = Type.Object({ id: OperationId, attempt_id: OperationId, passage_id: OperationId, delivery_id: OperationId,
    state: Question.properties.state, revision: Type.Integer(), created_at_ms: Type.Integer(), expires_at_ms: nullable(Type.Integer()), delivery_receipt: Question.properties.delivery_receipt }, closed);
export const FindingDetail = Type.Object({ ...Finding.properties, resolutions: Type.Array(Type.Object({ review_id: OperationId, delivery_id: OperationId,
        verdict: Type.Union([Type.Literal('resolved'), Type.Literal('unresolved')]), evidence: CriterionOutcome.properties.evidence }, closed), { maxItems: 6 }) }, closed);
export const DetailItem = Type.Union([RoundHistory.properties.entries.items, PassageSummary, CriterionDetail, CheckRun, ReviewSummary, FindingDetail, QuestionSummary, EffectView, AttemptResource]);
export type DetailItem = Static<typeof DetailItem>;
export const DetailPage = Type.Object({ section: DetailSection, ...Page(DetailItem).properties }, closed);
export type DetailPage = Static<typeof DetailPage>;
export const AttemptDetail = Type.Object({ ...AttemptStatus.properties,
    expected_account_id: Type.String({ maxLength: 256 }),
    issue: IssueHeader,
    selected_delivery_id: nullable(OperationId), selected_round: Type.Integer({ minimum: 1, maximum: 6 }),
    publication: PublicationSummary, measurements: AttemptMeasurements,
    cleanup: Type.Union(['pending', 'complete', 'uncertain'].map(v => Type.Literal(v))),
    authority: nullable(Type.Object({ reason: nullable(text), expected_status_id: nullable(text), observed_status_id: nullable(text), observed_at_ms: Type.Integer(), recovery: text }, closed)),
    capabilities: Type.Object({ cancel: Capability, complete_publication: Capability, reconcile_publication: Capability, revalidate: Capability }, closed),
    details: nullable(DetailPage),
}, closed);
export type AttemptDetail = Static<typeof AttemptDetail>;
export const DeliveryDetail = Type.Object({ ...DeliveryView.properties,
    issue: IssueHeader,
    attempt: AttemptStatus, measurements: AttemptMeasurements, cleanup: Type.Union(['pending', 'complete', 'uncertain'].map(v => Type.Literal(v))),
    authorizations: Type.Object({ captured_mode: DeliveryMode, authorized_mode: DeliveryMode, requires_current_gate: Type.Literal(true) }, closed),
    review: nullable(ReviewSummary), publication: PublicationSummary,
    capabilities: Type.Object({ diff: Capability, complete_publication: Capability, reconcile_publication: Capability }, closed),
    details: nullable(DetailPage),
}, closed);
export type DeliveryDetail = Static<typeof DeliveryDetail>;
