import { PublicationTargetSelection } from './publication-targets.js';
import { StageActivity } from './stage-activity.js';
import { DeliverySummaryView } from './delivery-summary.js';
import { FindingDispute } from './disputes.js';
import { FindingAssessment, AttemptBlock } from './progress.js';
import { AttemptDecisionView } from './decisions.js';
import { Type, type Static } from '@sinclair/typebox';
import { Capability, DeliveryMode, OperationId, Page } from './base.js';
import { AttemptStatus } from './attempts.js';
import { AttemptMeasurements, Question } from './questions.js';
import { DeliveryView } from './deliveries.js';
import { PublicationSummary, EffectView } from './publication.js';
import { AttemptResource } from './recovery.js';
import { Criterion, PublicationTargetIntent } from './preparations.js';
import { CheckRun } from './verification.js';
import { Finding, Review, RoundHistory } from './reviews.js';
import { CriterionOutcome } from './execution.js';
import { PassageRole } from './execution.js';

const closed = { additionalProperties: false } as const;
const nullable = <T extends import('@sinclair/typebox').TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
const text = Type.String({ maxLength: 4096 });
const paging = { cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 2048 })), limit: Type.Optional(Type.String({ pattern: '^(?:[1-9]|[1-9][0-9]|100)$' })) };
export const IssueHeader = Type.Object({ id: Type.String({ maxLength: 256 }),number: Type.Integer({ minimum: 1 }),title: Type.String({ maxLength: 65536 }),url: Type.String({ maxLength: 4096 }) },closed);
export const AttemptListQuery = Type.Object({
  ...paging,
  projectId: Type.Optional(OperationId),
  result: Type.Optional(Type.Union([Type.Literal('active'), ...['delivered','rejected','failed','cancelled','interrupted'].map(v => Type.Literal(v))])),
  issueNumber: Type.Optional(Type.String({ pattern: '^[1-9][0-9]{0,9}$' })),
  issueTitle: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
  dateFrom: Type.Optional(Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
  dateTo: Type.Optional(Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
  timeZone: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
}, closed);
export type AttemptListQuery = Static<typeof AttemptListQuery>;
export const AttemptSummary = Type.Object({
  id: OperationId, projectId: OperationId, issueId: Type.String(), issueNumber: nullable(Type.Integer({ minimum: 1 })), issueTitle: Type.Optional(nullable(Type.String({ maxLength: 65536 }))),
  phase: AttemptStatus.properties.phase, result: AttemptStatus.properties.result, suspension: AttemptStatus.properties.suspension,
  revision: Type.Integer(), createdAtMs: Type.Integer(), updatedAtMs: Type.Integer(),
}, closed);
export type AttemptSummary = Static<typeof AttemptSummary>;
export const AttemptPage = Page(AttemptSummary);
export type AttemptPage = Static<typeof AttemptPage>;
export const HistoricalEffectiveProfile = Type.Object({
  role: PassageRole, profileId: nullable(OperationId), profileRevision: nullable(Type.Integer({ minimum: 1 })),
  executor: Type.String({ minLength: 1, maxLength: 256 }), provider: Type.String({ minLength: 1, maxLength: 256 }),
  model: Type.String({ minLength: 1, maxLength: 256 }), effort: nullable(Type.String({ minLength: 1, maxLength: 128 })),
  guidance: Type.String({ maxLength: 8192 }), compositionVersion: nullable(Type.Integer({ minimum: 1 })),
  contextSummary: Type.String({ maxLength: 8192 }), technicalContractSummary: Type.String({ minLength: 1, maxLength: 4096 }),
  credentialsRedacted: Type.Literal(true),
}, closed);
export type HistoricalEffectiveProfile = Static<typeof HistoricalEffectiveProfile>;
export const DetailSection = Type.Union(['rounds','passages','criteria','checks','reviews','findings','questions','effects','resources','profiles','finding_assessments', 'finding_disputes', 'decisions', 'target_selections'].map(v => Type.Literal(v)));
export type DetailSection = Static<typeof DetailSection>;
export const AttemptDetailQuery = Type.Object({ ...paging, roundId: Type.Optional(Type.String({ pattern: '^[1-6]$' })), deliveryId: Type.Optional(OperationId), section: Type.Optional(DetailSection) }, closed);
export type AttemptDetailQuery = Static<typeof AttemptDetailQuery>;
export const DeliveryDetailQuery = Type.Object({ ...paging, section: Type.Optional(DetailSection) }, closed);
export type DeliveryDetailQuery = Static<typeof DeliveryDetailQuery>;
export const PassageSummary = Type.Object({ id: OperationId, attemptId: OperationId, deliveryId: OperationId, round: Type.Integer(),
  role: Type.Union([Type.Literal('implementer'), Type.Literal('reviewer')]), state: text, tracking: text,
  diagnostic: nullable(text), resultReceiptId: nullable(OperationId), createdAtMs: Type.Integer(),
  attemptSessionId: Type.Optional(nullable(OperationId)), sessionState: Type.Optional(nullable(text)),
  sessionSourceId: Type.Optional(nullable(OperationId)), terminalName: Type.Optional(nullable(text)), occupancyState: Type.Optional(nullable(text)),
  terminalState: Type.Optional(nullable(text)),
}, closed);
export const CriterionDetail = Type.Object({ ...Criterion.properties, producer: nullable(Type.Object({ verdict: CriterionOutcome.properties.verdict, evidence: CriterionOutcome.properties.evidence }, closed)),
  reviewer: nullable(Type.Object({ verdict: CriterionOutcome.properties.verdict, evidence: CriterionOutcome.properties.evidence }, closed)) }, closed);
export const ReviewSummary = Type.Omit(Review, ['criteria','findings','resolutions','commandRepetitions']);
export const QuestionSummary = Type.Object({ id: OperationId, attemptId: OperationId, passageId: OperationId, deliveryId: OperationId,
  state: Question.properties.state, revision: Type.Integer(), createdAtMs: Type.Integer(), expiresAtMs: nullable(Type.Integer()), deliveryReceipt: Question.properties.deliveryReceipt }, closed);
export const FindingDetail = Type.Object({ ...Finding.properties, resolutions: Type.Array(Type.Object({ reviewId: OperationId, deliveryId: OperationId,
  verdict: Type.Union([Type.Literal('resolved'),Type.Literal('unresolved')]), evidence: CriterionOutcome.properties.evidence },closed),{ maxItems: 6 }) },closed);
export const DetailItem = Type.Union([RoundHistory.properties.entries.items, PassageSummary, CriterionDetail, CheckRun, ReviewSummary, FindingDetail, QuestionSummary, EffectView, AttemptResource, HistoricalEffectiveProfile, FindingAssessment, FindingDispute, AttemptDecisionView, PublicationTargetSelection]);
export type DetailItem = Static<typeof DetailItem>;
export const DetailPage = Type.Object({ section: DetailSection, ...Page(DetailItem).properties }, closed);
export type DetailPage = Static<typeof DetailPage>;
export const AttemptV3DetailPage = Type.Union([Type.Object({ section: Type.Literal('target_selections'), items: Type.Array(PublicationTargetSelection, { maxItems: 100 }), next_cursor: nullable(Type.String({ minLength: 1, maxLength: 2048 })), has_more: Type.Boolean() }, closed), Type.Object({ section: Type.Literal('finding_assessments'), items: Type.Array(FindingAssessment, { maxItems: 100 }), next_cursor: nullable(Type.String({ minLength: 1, maxLength: 2048 })), has_more: Type.Boolean() }, closed), Type.Object({ section: Type.Literal('finding_disputes'), items: Type.Array(FindingDispute, { maxItems: 100 }), next_cursor: nullable(Type.String({ minLength: 1, maxLength: 2048 })), has_more: Type.Boolean() }, closed), Type.Object({ section: Type.Literal('decisions'), items: Type.Array(AttemptDecisionView, { maxItems: 100 }), next_cursor: nullable(Type.String({ minLength: 1, maxLength: 2048 })), has_more: Type.Boolean() }, closed)]);
export const AttemptDetail = Type.Object({ ...AttemptStatus.properties,
  stageActivity: StageActivity,
  expectedAccountId: Type.String({ maxLength: 256 }),
  issue: IssueHeader,
  selectedDeliveryId: nullable(OperationId), selectedRound: Type.Integer({ minimum: 1, maximum: 6 }),
  deliverySummary: nullable(DeliverySummaryView),
  publicationTarget: nullable(PublicationTargetIntent), publicationTargetHash: nullable(Type.String({ pattern: '^[a-f0-9]{64}$' })),
  publication: PublicationSummary, measurements: AttemptMeasurements,
  cleanup: Type.Union(['pending','complete','uncertain'].map(v => Type.Literal(v))),
  authority: nullable(Type.Object({ reason: nullable(text), expectedStatusId: nullable(text), observedStatusId: nullable(text), observedAtMs: Type.Integer(),recovery: text }, closed)),
  capabilities: Type.Object({ cancel: Capability, completePublication: Capability, reconcilePublication: Capability, revalidate: Capability }, closed),
  block: AttemptBlock,
  v3Details: nullable(AttemptV3DetailPage),
  historySections: Type.Optional(Type.Array(Type.Union(['target_selections', 'finding_assessments', 'finding_disputes', 'decisions'].map(value => Type.Literal(value))), { maxItems: 4 })),
  details: nullable(DetailPage),
}, closed);
export type AttemptDetail = Static<typeof AttemptDetail>;
export const DeliveryDetail = Type.Object({ ...DeliveryView.properties,
  deliverySummary: DeliverySummaryView,
  issue: IssueHeader,
  attempt: AttemptStatus, measurements: AttemptMeasurements, cleanup: Type.Union(['pending','complete','uncertain'].map(v => Type.Literal(v))),
  authorizations: Type.Object({ capturedMode: DeliveryMode, authorizedMode: DeliveryMode, requiresCurrentGate: Type.Literal(true) },closed),
  review: nullable(ReviewSummary), publication: PublicationSummary,
  capabilities: Type.Object({ diff: Capability, completePublication: Capability, reconcilePublication: Capability }, closed),
  details: nullable(DetailPage),
}, closed);
export type DeliveryDetail = Static<typeof DeliveryDetail>;

export const AttemptComparisonQuery = Type.Object({ leftAttemptId: OperationId, rightAttemptId: OperationId }, closed);
export type AttemptComparisonQuery = Static<typeof AttemptComparisonQuery>;
export const HistoricalComparisonValue = Type.Object({
  state: Type.Union(['available', 'unavailable', 'not_comparable'].map(value => Type.Literal(value))),
  value: Type.Union([Type.String({ maxLength: 8192 }), Type.Integer({ minimum: 0 }), Type.Boolean(), Type.Null()]),
  reason: nullable(Type.String({ minLength: 1, maxLength: 2048 })),
}, closed);
export type HistoricalComparisonValue = Static<typeof HistoricalComparisonValue>;
export const AttemptComparisonSide = Type.Object({
  attemptId: OperationId, startedAtMs: Type.Integer({ minimum: 0 }),
  result: nullable(Type.Union(['delivered', 'rejected', 'failed', 'cancelled', 'interrupted'].map(value => Type.Literal(value)))),
  failureReason: nullable(Type.String({ minLength: 1, maxLength: 2048 })),
  round: nullable(Type.Integer({ minimum: 1, maximum: 6 })), deliveryId: nullable(OperationId),
  contentIdentity: nullable(Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' })),
  projectRevisionId: nullable(OperationId), preparationRevision: nullable(Type.Integer({ minimum: 1 })),
  configurationState: Type.Union([Type.Literal('available'), Type.Literal('unavailable')]),
  detailsUrl: Type.String({ minLength: 1, maxLength: 512 }),
}, closed);
export type AttemptComparisonSide = Static<typeof AttemptComparisonSide>;
export const AttemptComparison = Type.Object({
  projectId: OperationId, repositoryId: Type.String({ minLength: 1, maxLength: 256 }), issueId: Type.String({ minLength: 1, maxLength: 256 }),
  issueNumber: nullable(Type.Integer({ minimum: 1 })), left: AttemptComparisonSide, right: AttemptComparisonSide,
  differences: Type.Array(Type.Object({ field: Type.String({ minLength: 1, maxLength: 256 }),
    left: HistoricalComparisonValue, right: HistoricalComparisonValue }, closed), { maxItems: 100 }),
  limitations: Type.Array(Type.String({ minLength: 1, maxLength: 2048 }), { maxItems: 100 }),
}, closed);
export type AttemptComparison = Static<typeof AttemptComparison>;
