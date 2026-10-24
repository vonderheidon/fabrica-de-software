import { Type, type Static } from '@sinclair/typebox';
import { FindingDispute as InternalDispute } from '../disputes.js';

const p = InternalDispute.properties;
export const FindingDispute = Type.Object({
  id: p.id, attempt_id: p.attemptId, finding_id: p.findingId, passage_id: p.passageId,
  delivery_id: p.deliveryId, content_identity: p.contentIdentity, justification: p.justification, evidence: p.evidence,
  response_review_id: p.responseReviewId, response_verdict: p.responseVerdict,
  response_justification: p.responseJustification, response_evidence: p.responseEvidence,
  created_at_ms: p.createdAtMs, responded_at_ms: p.respondedAtMs,
  response_delivery_id: p.responseDeliveryId, response_content_identity: p.responseContentIdentity,
}, { additionalProperties: false });
export type FindingDispute = Static<typeof FindingDispute>;
