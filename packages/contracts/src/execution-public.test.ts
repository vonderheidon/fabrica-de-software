import { expect, it } from 'vitest';
import { AttemptDecisionView, HttpAttemptDecisionView, HttpMakeAttemptDecision, MakeAttemptDecision } from './index.js';
import type { TSchema } from '@sinclair/typebox';
import { Type, TypeGuard } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { PassageBinding, HttpPassageBinding, ExecutionQuestion, HttpExecutionQuestion, CriterionOutcome, HttpCriterionOutcome, ImplementerResult, HttpImplementerResult, ReviewerResult, HttpReviewerResult, StartAttempt, HttpStartAttempt, AttemptStatus, HttpAttemptStatus, ScopeChange, HttpScopeChange, Question, HttpQuestion, AnswerQuestion, HttpAnswerQuestion, PassageMeasurements, HttpPassageMeasurements, AttemptMeasurements, HttpAttemptMeasurements, RecoveryCapability, HttpRecoveryCapability, CancelAttempt, HttpCancelAttempt, AttemptResource, HttpAttemptResource, AttemptResources, HttpAttemptResources, RemovalPlan, HttpRemovalPlan, RemoveResource, HttpRemoveResource, FolderSurface, HttpFolderSurface, PassageInteraction, HttpPassageInteraction, GitObjectId, HttpGitObjectId, CaptureWarning, HttpCaptureWarning, Delivery, HttpDelivery, DeliveryView, HttpDeliveryView, CaptureRetry, HttpCaptureRetry, DeliveryDiffQuery, HttpDeliveryDiffQuery, DiffEntry, HttpDiffEntry, DeliveryDiff, HttpDeliveryDiff, CheckState, HttpCheckState, Artifact, HttpArtifact, CheckRun, HttpCheckRun, VerificationSummary, HttpVerificationSummary, CheckHistoryQuery, HttpCheckHistoryQuery, CheckHistory, HttpCheckHistory, Finding, HttpFinding, Review, HttpReview, RoundHistory, HttpRoundHistory, ProducerResult, HttpProducerResult, EffectIdentity, HttpEffectIdentity, EffectReceipt, HttpEffectReceipt, EffectView, HttpEffectView, CompletePublication, HttpCompletePublication, ReconcilePublication, HttpReconcilePublication, AuthorizeUpgrade, HttpAuthorizeUpgrade, ModeUpgradeSummary, HttpModeUpgradeSummary, PublicationSummary, HttpPublicationSummary, IssueHeader, HttpIssueHeader, AttemptListQuery, HttpAttemptListQuery, AttemptSummary, HttpAttemptSummary, AttemptPage, HttpAttemptPage, DetailSection, HttpDetailSection, AttemptDetailQuery, HttpAttemptDetailQuery, DeliveryDetailQuery, HttpDeliveryDetailQuery, PassageSummary, HttpPassageSummary, CriterionDetail, HttpCriterionDetail, ReviewSummary, HttpReviewSummary, QuestionSummary, HttpQuestionSummary, FindingDetail, HttpFindingDetail, DetailItem, HttpDetailItem, DetailPage, HttpDetailPage, AttemptDetail, HttpAttemptDetail, DeliveryDetail, HttpDeliveryDetail, AttemptParams, QuestionParams, ResourceParams, InteractionParams, DeliveryParams, CaptureRetryParams, ArtifactParams } from './index.js';

// Historical optional fields have explicit HTTP projections while private envelopes remain unchanged.
function expectedHttpSchema(schema: TSchema): unknown {
  const rename = (key: string): string => key.replace(/[A-Z]/g, letter => '_'+letter.toLowerCase());
  const requiredProjection = (key: string) => key === 'responseType' || key === 'additionalChangesJustification' || key === 'repeatReason' || (key === 'commandRepetitions' && 'verificationId' in (schema.properties ?? {}));
  const reviewProjection = 'declaredVerdict' in (schema.properties ?? {}) && 'resolutions' in (schema.properties ?? {});
  if (TypeGuard.IsObject(schema)) return { ...schema,
    properties: { ...Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [rename(key),
      expectedHttpSchema(key === 'responseType' ? Type.Union([...value.anyOf, Type.Null()]) : requiredProjection(key) ? Type.Optional(value, false) : value)])),
      ...(reviewProjection ? { dispute_details_url: Type.String({ minLength: 1, maxLength: 512 }) } : {}) },
    ...(schema.required ? { required: [...(reviewProjection ? ['dispute_details_url'] : []),
      ...schema.required.flatMap(key => key === 'findingId' && 'responseType' in schema.properties ? [rename(key), 'response_type'] : [rename(key)]),
      ...Object.keys(schema.properties).filter(key => key !== 'responseType' && requiredProjection(key)).map(rename)] } : {}) };
  if (TypeGuard.IsArray(schema)) return { ...schema, items: expectedHttpSchema(schema.items) };
  if (TypeGuard.IsUnion(schema)) return { ...schema, anyOf: schema.anyOf.map((item: TSchema) => expectedHttpSchema(item)) };
  return schema;
}
const pairs: readonly (readonly [string, TSchema, TSchema])[] = [
  ['PassageBinding', PassageBinding, HttpPassageBinding],
  ['ExecutionQuestion', ExecutionQuestion, HttpExecutionQuestion],
  ['CriterionOutcome', CriterionOutcome, HttpCriterionOutcome],
  ['ImplementerResult', ImplementerResult, HttpImplementerResult],
  ['ReviewerResult', ReviewerResult, HttpReviewerResult],
  ['StartAttempt', StartAttempt, HttpStartAttempt],
  ['AttemptStatus', AttemptStatus, HttpAttemptStatus],
  ['ScopeChange', ScopeChange, HttpScopeChange],
  ['Question', Question, HttpQuestion],
  ['AnswerQuestion', AnswerQuestion, HttpAnswerQuestion],
  ['PassageMeasurements', PassageMeasurements, HttpPassageMeasurements],
  ['AttemptMeasurements', AttemptMeasurements, HttpAttemptMeasurements],
  ['RecoveryCapability', RecoveryCapability, HttpRecoveryCapability],
  ['CancelAttempt', CancelAttempt, HttpCancelAttempt],
  ['AttemptResource', AttemptResource, HttpAttemptResource],
  ['AttemptResources', AttemptResources, HttpAttemptResources],
  ['RemovalPlan', RemovalPlan, HttpRemovalPlan],
  ['RemoveResource', RemoveResource, HttpRemoveResource],
  ['FolderSurface', FolderSurface, HttpFolderSurface],
  ['PassageInteraction', PassageInteraction, HttpPassageInteraction],
  ['GitObjectId', GitObjectId, HttpGitObjectId],
  ['CaptureWarning', CaptureWarning, HttpCaptureWarning],
  ['Delivery', Delivery, HttpDelivery],
  ['DeliveryView', DeliveryView, HttpDeliveryView],
  ['CaptureRetry', CaptureRetry, HttpCaptureRetry],
  ['DeliveryDiffQuery', DeliveryDiffQuery, HttpDeliveryDiffQuery],
  ['DiffEntry', DiffEntry, HttpDiffEntry],
  ['DeliveryDiff', DeliveryDiff, HttpDeliveryDiff],
  ['CheckState', CheckState, HttpCheckState],
  ['Artifact', Artifact, HttpArtifact],
  ['CheckRun', CheckRun, HttpCheckRun],
  ['VerificationSummary', VerificationSummary, HttpVerificationSummary],
  ['CheckHistoryQuery', CheckHistoryQuery, HttpCheckHistoryQuery],
  ['CheckHistory', CheckHistory, HttpCheckHistory],
  ['Finding', Finding, HttpFinding],
  ['Review', Review, HttpReview],
  ['RoundHistory', RoundHistory, HttpRoundHistory],
  ['ProducerResult', ProducerResult, HttpProducerResult],
  ['EffectIdentity', EffectIdentity, HttpEffectIdentity],
  ['EffectReceipt', EffectReceipt, HttpEffectReceipt],
  ['EffectView', EffectView, HttpEffectView],
  ['CompletePublication', CompletePublication, HttpCompletePublication],
  ['ReconcilePublication', ReconcilePublication, HttpReconcilePublication],
  ['AuthorizeUpgrade', AuthorizeUpgrade, HttpAuthorizeUpgrade],
  ['ModeUpgradeSummary', ModeUpgradeSummary, HttpModeUpgradeSummary],
  ['PublicationSummary', PublicationSummary, HttpPublicationSummary],
  ['IssueHeader', IssueHeader, HttpIssueHeader],
  ['AttemptListQuery', AttemptListQuery, HttpAttemptListQuery],
  ['AttemptSummary', AttemptSummary, HttpAttemptSummary],
  ['AttemptPage', AttemptPage, HttpAttemptPage],
  ['DetailSection', DetailSection, HttpDetailSection],
  ['AttemptDetailQuery', AttemptDetailQuery, HttpAttemptDetailQuery],
  ['DeliveryDetailQuery', DeliveryDetailQuery, HttpDeliveryDetailQuery],
  ['PassageSummary', PassageSummary, HttpPassageSummary],
  ['CriterionDetail', CriterionDetail, HttpCriterionDetail],
  ['ReviewSummary', ReviewSummary, HttpReviewSummary],
  ['QuestionSummary', QuestionSummary, HttpQuestionSummary],
  ['FindingDetail', FindingDetail, HttpFindingDetail],
  ['DetailItem', DetailItem, HttpDetailItem],
  ['DetailPage', DetailPage, HttpDetailPage],
  ['AttemptDetail', AttemptDetail, HttpAttemptDetail],
  ['DeliveryDetail', DeliveryDetail, HttpDeliveryDetail],
  ['MakeAttemptDecision', MakeAttemptDecision, HttpMakeAttemptDecision],
  ['AttemptDecisionView', AttemptDecisionView, HttpAttemptDecisionView],
];
it.each(pairs)('preserves all constraints and closes the HTTP representation of %s', (_name, internal, http) => {
  expect(http).toEqual(expectedHttpSchema(internal));
});
const id = '11111111-1111-4111-8111-111111111111';
const hash = 'a'.repeat(64);
const commands: readonly (readonly [TSchema, Record<string, unknown>, string, string])[] = [
  [HttpStartAttempt, { preparation_id: id, preparation_revision: 1, authorized_summary_hash: hash, authorized: true }, 'preparation_id', 'preparationId'],
  [HttpAnswerQuestion, { answer: 'Manter scopeChoice literalmente', scope_choice: 'keep_captured' }, 'scope_choice', 'scopeChoice'],
  [HttpCaptureRetry, { producer_passage_id: id }, 'producer_passage_id', 'producerPassageId'],
  [HttpRemoveResource, { plan_hash: hash, confirmed: true }, 'plan_hash', 'planHash'],
  [HttpCompletePublication, { delivery_id: id, authorized_mode: 'commit', authorized: true }, 'authorized_mode', 'authorizedMode'],
  [HttpReconcilePublication, { delivery_id: id }, 'delivery_id', 'deliveryId'],
  [HttpAuthorizeUpgrade, { delivery_id: id, current_mode: 'icr', target_mode: 'pr', authorized_additional_effects_hash: hash, authorized: true }, 'target_mode', 'targetMode'],
  [HttpAttemptListQuery, { project_id: id }, 'project_id', 'projectId'],
  [HttpAttemptDetailQuery, { round_id: '1', delivery_id: id }, 'round_id', 'roundId'],
];
it.each(commands)('rejects aliases alone and alongside canonical request fields %#', (schema, canonical, key, alias) => {
  expect(Value.Check(schema, canonical)).toBe(true);
  expect(Value.Check(schema, { ...canonical, [alias]: canonical[key] })).toBe(false);
  const { [key]: value, ...rest } = canonical;
  expect(Value.Check(schema, { ...rest, [alias]: value })).toBe(false);
});
it('preserves every path identifier, including question, resource, passage, delivery and artifact', () => {
  for (const schema of [AttemptParams, QuestionParams, ResourceParams, InteractionParams, DeliveryParams, CaptureRetryParams, ArtifactParams]) {
    expect(Object.keys(schema.properties).some(key => /[A-Z]/.test(key))).toBe(true);
    for (const key of Object.keys(schema.properties)) expect(key).not.toContain('_');
  }
});
