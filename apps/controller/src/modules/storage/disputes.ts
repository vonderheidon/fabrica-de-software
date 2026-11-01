import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Finding, FindingDispute, ImplementerResult, PassageBinding, ReviewerResult } from '#contracts';
import { ResultValidationError } from '../execution/index.js';

/** The controller derives the contested version from the finding, never from model identity. */
export function recordDisputes(db: Database.Database, binding: PassageBinding, result: ImplementerResult, findings: Finding[]): void {
  for (const response of result.findingResponses ?? []) {
    const finding = findings.find(f => f.id === response.findingId);
    if (!finding) throw new ResultValidationError([{ path: '/findingResponses', rule: 'must_reference_open_finding' }]);
    if (response.responseType !== 'disputed') continue;
    db.prepare(`INSERT INTO finding_disputes(id,attempt_id,finding_id,passage_id,delivery_id,content_identity,justification,evidence_json,created_at_ms)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(randomUUID(), binding.attemptId, finding.id, binding.passageId, finding.deliveryId, finding.contentIdentity,
      response.response, JSON.stringify(response.evidence), Date.now());
  }
}

export function pendingDisputes(db: Database.Database, attemptId: string, round: number): FindingDispute[] {
  return db.prepare<[string, number], Omit<FindingDispute, 'evidence'> & { evidence_json: string }>(`SELECT t.id,t.attempt_id AS attemptId,t.finding_id AS findingId,
    t.passage_id AS passageId,t.delivery_id AS deliveryId,t.content_identity AS contentIdentity,t.justification,t.evidence_json,
    t.response_review_id AS responseReviewId,t.response_verdict AS responseVerdict,t.response_justification AS responseJustification,
    NULL AS responseEvidence,t.created_at_ms AS createdAtMs,t.responded_at_ms AS respondedAtMs,NULL AS responseDeliveryId,NULL AS responseContentIdentity
    FROM finding_disputes t JOIN passages p ON p.id=t.passage_id
    WHERE t.attempt_id=? AND t.response_review_id IS NULL AND p.round_number<=? ORDER BY t.created_at_ms,t.id LIMIT 1001`)
    .all(attemptId, round).map(({ evidence_json, ...item }) => ({ ...item, evidence: JSON.parse(evidence_json) as string[] }));
}

/** Inside the accepted reviewer result transaction, after finding_resolutions and before sealing the review. */
export function respondToDisputes(db: Database.Database, reviewId: string, result: ReviewerResult): void {
  const review = db.prepare<[string], { attempt_id: string; round_number: number; independence_state: string }>(`SELECT r.attempt_id,d.round_number,r.independence_state
    FROM reviews r JOIN deliveries d ON d.id=r.delivery_id WHERE r.id=?`).get(reviewId)!;
  const supplied = result.disputeResponses ?? [];
  if (review.independence_state !== 'valid') {
    if (supplied.length) throw new ResultValidationError([{ path: '/disputeResponses', rule: 'requires_valid_review_independence' }]);
    return;
  }
  const pending = pendingDisputes(db, review.attempt_id, review.round_number);
  if (pending.length > 1000 || supplied.length !== pending.length || new Set(supplied.map(x => x.disputeId)).size !== pending.length) throw new ResultValidationError([{ path: '/disputeResponses', rule: 'must_match_pending_disputes_within_limit' }]);
  for (const response of supplied) {
    const dispute = pending.find(x => x.id === response.disputeId);
    if (!dispute || !result.resolutions.some(x => x.findingKey === dispute.findingId && x.verdict === (response.verdict === 'resolved' ? 'resolved' : 'unresolved'))) throw new ResultValidationError([{ path: '/disputeResponses', rule: 'must_match_dispute_and_finding_resolution' }]);
    db.prepare(`UPDATE finding_disputes SET response_review_id=?,response_verdict=?,response_justification=?,response_evidence_json=?,responded_at_ms=? WHERE id=?`)
      .run(reviewId, response.verdict, response.justification, JSON.stringify(response.evidence), Date.now(), dispute.id);
  }
}
