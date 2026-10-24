import { Type, type Static } from '@sinclair/typebox';
import { FindingAssessment as InternalAssessment } from '../progress.js';
export { AttemptBlock } from '../progress.js';
const p = InternalAssessment.properties;
export const FindingAssessment = Type.Object({
  finding_id: p.findingId, progress: p.progress, evidence: p.evidence, justification: p.justification,
  id: p.id, attempt_id: p.attemptId, review_id: p.reviewId,
  delivery_id: p.deliveryId, round: p.round, content_identity: p.contentIdentity,
  created_at_ms: p.createdAtMs,
}, { additionalProperties: false });
export type FindingAssessment = Static<typeof FindingAssessment>;
