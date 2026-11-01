import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { Review, RoundHistory, PassageBinding, ImplementerResult, type Finding, type ReviewerResult } from '#contracts';
import { readAttempt, readCapture, attemptEvent } from './attempts.js';
import { readDelivery } from './deliveries.js';
import { guarded } from './configuration-reads.js';
import { OperationError } from './operations.js';
import { ExecutionError } from '../execution/index.js';
import { ResultValidationError } from '../execution/index.js';

import { blockCorrection, readAttemptBlock, recordAssessments } from './progress.js';
import { respondToDisputes } from './disputes.js';

const digestCriteria = (ids: string[]) => JSON.stringify([...ids].sort());
const denied = () => new OperationError(409, 'REVIEW_NOT_ALLOWED', 'Review requires the current captured delivery, its accepted producer result and live continuity.');
export function openFindings(db: Database.Database, attemptId: string, beforeRound: number): Finding[] {
  return db.prepare<[string, number, number], { id: string; reviewId: string; attemptId: string; key: string; criterion_ids_json: string; category: string; problem: string; evidence_json: string; expectedResult: string; blocking: number; priority: Finding["priority"]; originFindingId: string | null; deliveryId: string; contentIdentity: string }>(`
    SELECT f.id,f.review_id AS reviewId,f.attempt_id AS attemptId,f.finding_key AS key,f.criterion_ids_json,f.category,f.problem,f.evidence_json,f.expected_result AS expectedResult,f.blocking,f.priority,f.origin_finding_id AS originFindingId,r.delivery_id AS deliveryId,r.content_identity AS contentIdentity
    FROM findings f JOIN reviews r ON r.id=f.review_id JOIN deliveries d ON d.id=r.delivery_id
    WHERE f.attempt_id=? AND d.round_number<? AND NOT EXISTS (
      SELECT 1 FROM finding_resolutions x JOIN reviews xr ON xr.id=x.review_id JOIN deliveries xd ON xd.id=xr.delivery_id
      WHERE x.finding_id=f.id AND x.verdict='resolved' AND xr.independence_state='valid' AND xd.round_number< ?
    ) ORDER BY d.round_number,f.id LIMIT 1001`).all(attemptId, beforeRound, beforeRound).map(f => ({
      id: f.id, reviewId: f.reviewId, attemptId: f.attemptId, key: f.key,
      criterionIds: JSON.parse(f.criterion_ids_json) as string[], category: f.category, problem: f.problem,
      evidence: JSON.parse(f.evidence_json) as string[], expectedResult: f.expectedResult, blocking: f.blocking === 1, priority: f.priority, originFindingId: f.originFindingId, deliveryId: f.deliveryId, contentIdentity: f.contentIdentity,
    }));
}
export function readReview(db: Database.Database, deliveryId: string): Review | null {
  readDelivery(db, deliveryId);
  const row = db.prepare<[string], Omit<Review, 'criteria' | 'findings' | 'resolutions'>>(`SELECT id,delivery_id AS deliveryId,attempt_id AS attemptId,passage_id AS passageId,
    implementer_passage_id AS implementerPassageId,content_identity AS contentIdentity,state,reason,independence_state AS independenceState,diagnostic,
    (SELECT json_extract(summary_json,'$.verdict') FROM passage_results WHERE passage_id=reviews.passage_id) AS declaredVerdict,
    created_at_ms AS createdAtMs,completed_at_ms AS completedAtMs FROM reviews WHERE delivery_id=?`).get(deliveryId);
  if (!row) return null;
  const findings = db.prepare<[string], { id: string; finding_key: string; criterion_ids_json: string; category: string; problem: string; evidence_json: string; expected_result: string; blocking: number; priority: Finding["priority"]; originFindingId: string | null; deliveryId: string; contentIdentity: string }>('SELECT *,origin_finding_id AS originFindingId FROM findings WHERE review_id=? ORDER BY id').all(row.id).map(f => ({
    id: f.id, reviewId: row.id, attemptId: row.attemptId, key: f.finding_key, criterionIds: JSON.parse(f.criterion_ids_json) as string[], category: f.category,
    problem: f.problem, evidence: JSON.parse(f.evidence_json) as string[], expectedResult: f.expected_result, blocking: f.blocking === 1, priority: f.priority, originFindingId: f.originFindingId, deliveryId: row.deliveryId, contentIdentity: row.contentIdentity,
  }));
  const criteria = db.prepare<[string], { criterionId: string; verdict: 'passed' | 'failed' | 'not_verified'; evidence_json: string }>('SELECT criterion_id AS criterionId,verdict,evidence_json FROM criterion_results WHERE passage_id=? ORDER BY criterion_id').all(row.passageId).map(c => ({ criterionId: c.criterionId, verdict: c.verdict, evidence: JSON.parse(c.evidence_json) as string[] }));
  const resolutions = db.prepare<[string], { findingId: string; verdict: 'resolved' | 'unresolved'; evidence_json: string }>('SELECT finding_id AS findingId,verdict,evidence_json FROM finding_resolutions WHERE review_id=? ORDER BY finding_id').all(row.id).map(x => ({ findingId: x.findingId, verdict: x.verdict, evidence: JSON.parse(x.evidence_json) as string[] }));
  const summary = db.prepare<[string], { summary_json: string }>('SELECT summary_json FROM passage_results WHERE passage_id=?').get(row.passageId);
  const commandRepetitions = summary ? (JSON.parse(summary.summary_json) as ReviewerResult).commandRepetitions ?? [] : [];
  const review = { ...row, criteria, findings, resolutions, commandRepetitions };
  if (!Value.Check(Review, review)) throw new ExecutionError('STORAGE_FAILED');
  return review;
}
export function beginReview(db: Database.Database, deliveryId: string): Review | null {
  return guarded(() => db.transaction(() => {
    const delivery = readDelivery(db, deliveryId); const a = readAttempt(db, delivery.attemptId);
    const old = readReview(db, deliveryId); if (old) return null; // Never relaunch a claimed review.
    const producer = db.prepare<[string, string, number, string], { summary_json: string }>(`SELECT result.summary_json FROM passages p
      JOIN passage_results result ON result.passage_id=p.id AND result.attempt_id=p.attempt_id
      WHERE p.id=? AND p.attempt_id=? AND p.round_number=? AND p.delivery_version=?
        AND p.role='implementer' AND p.state='ready' AND p.tracking_state='tracked'`)
      .get(delivery.producerPassageId, a.id, delivery.round, delivery.id);
    const producerCriteria = db.prepare<[string], { criterionId: string; verdict: string; evidence_json: string }>(
      'SELECT criterion_id AS criterionId,verdict,evidence_json FROM criterion_results WHERE passage_id=?').all(delivery.producerPassageId);
    const producerResult: unknown = producer ? { ...JSON.parse(producer.summary_json), criteria: producerCriteria.map(c => ({ criterionId: c.criterionId, verdict: c.verdict, evidence: JSON.parse(c.evidence_json) })) } : null;
    const expectedCriteria = db.prepare<[string], { id: string }>('SELECT criterion_id AS id FROM attempt_criteria WHERE attempt_id=?').all(a.id).map(c => c.id);
    if (a.result || a.suspension || a.phase !== 'verifying' || a.tracking !== 'tracked' ||
      a.deliveryId !== delivery.id || delivery.captureState !== 'captured' || !Value.Check(ImplementerResult, producerResult) ||
      expectedCriteria.length === 0 || digestCriteria(expectedCriteria) !== digestCriteria(producerCriteria.map(c => c.criterionId)) ||
      db.prepare("SELECT id FROM execution_questions WHERE attempt_id=? AND state<>'delivered'").get(a.id)) throw denied();
    const capture = readCapture(db, a.id); const role = capture.roleResources.find(r => r.role === 'reviewer');
    if (!role) throw denied();
    if (openFindings(db, a.id, delivery.round).length > 1000) throw new OperationError(503, 'FINDING_CONTEXT_LIMIT', 'The unresolved finding context exceeds the supported limit.');
    const id = randomUUID(); const passageId = randomUUID(); const now = Date.now();
    const source = db.prepare<[string, number], { id: string }>(`SELECT p.id FROM passages p JOIN attempt_sessions s ON s.id=p.attempt_session_id
      WHERE p.attempt_id=? AND p.role='reviewer' AND p.round_number=? AND p.state='ready' AND p.tracking_state='tracked'
        AND s.role='reviewer' AND s.attempt_id=p.attempt_id AND s.state='completed'
        AND EXISTS (SELECT 1 FROM passage_results r WHERE r.passage_id=p.id)`).get(a.id, delivery.round - 1);
    if (delivery.round > 1 && !source) throw denied();
    db.prepare(`INSERT INTO passages(id,attempt_id,round_number,delivery_version,role,role_resource_json,terminal_name,state,tracking_state,created_at_ms,attempt_session_id,session_source_id)
      VALUES (?,?,?,?,'reviewer',?,?,'starting','pending',?,(SELECT id FROM attempt_sessions WHERE attempt_id=? AND role='reviewer'),?)`)
      .run(passageId, a.id, delivery.round, delivery.id, JSON.stringify(role), `factory-${passageId}`, now, a.id, source?.id ?? null);
    db.prepare(`INSERT INTO reviews(id,delivery_id,attempt_id,passage_id,implementer_passage_id,content_identity,state,independence_state,workspace_state,created_at_ms)
      VALUES (?,?,?,?,?,?,'pending','pending','planned',?)`).run(id, delivery.id, a.id, passageId, delivery.producerPassageId, delivery.contentIdentity, now);
    db.prepare(`INSERT INTO resources(id,attempt_id,passage_id,kind,reference,owned,launch_state,created_at_ms) VALUES (?,?,?,'terminal',?,0,'planned',?)`).run(randomUUID(), a.id, passageId, `factory-${passageId}`, now);
    db.prepare("UPDATE attempts SET phase='reviewing',suspension=NULL,diagnostic=NULL,revision=revision+1,updated_at_ms=? WHERE id=?").run(now, a.id);
    attemptEvent(db, a.id, 'review.planned');
    return readReview(db, deliveryId);
  }).immediate());
}
export function recordReviewWorkspace(db: Database.Database, deliveryId: string, ready: boolean, diagnostic: string | null): void {
  guarded(() => db.transaction(() => {
    const review = readReview(db, deliveryId); if (!review || review.state !== 'pending') throw denied();
    db.prepare('UPDATE reviews SET workspace_state=?,diagnostic=? WHERE id=? AND workspace_state=\'planned\'').run(ready ? 'ready' : 'partial', diagnostic, review.id);
    db.prepare('UPDATE attempts SET revision=revision+1 WHERE id=?').run(review.attemptId);
    attemptEvent(db, review.attemptId, ready ? 'review.workspace.ready' : 'review.workspace.partial');
  }).immediate());
}
export function recordReviewIntegrity(db: Database.Database, binding: PassageBinding, valid: boolean): void {
  guarded(() => db.transaction(() => {
    if (!Value.Check(PassageBinding, binding) || binding.role !== 'reviewer' || typeof valid !== 'boolean') throw denied();
    const r = readReview(db, binding.deliveryVersion); const a = readAttempt(db, binding.attemptId);
    const passage = db.prepare<[string], { attempt_id: string; round_number: number; delivery_version: string; role: string; state: string; tracking_state: string }>(
      'SELECT attempt_id,round_number,delivery_version,role,state,tracking_state FROM passages WHERE id=?').get(binding.passageId);
    if (!r || r.passageId !== binding.passageId || r.attemptId !== binding.attemptId || !passage || passage.attempt_id !== binding.attemptId ||
      passage.round_number !== binding.round || passage.delivery_version !== binding.deliveryVersion || passage.role !== 'reviewer' ||
      passage.state !== 'ready' || passage.tracking_state !== 'tracked' ||
      r.state !== 'pending' || a.result || a.suspension || a.deliveryId !== r.deliveryId || a.phase !== 'reviewing') throw denied();
    // Once observed invalid, a repaired checkout cannot recover independence for this review.
    db.prepare("UPDATE reviews SET independence_state=CASE WHEN independence_state='invalid' OR ?=0 THEN 'invalid' ELSE 'valid' END,diagnostic=CASE WHEN independence_state='invalid' OR ?=0 THEN 'REVIEW_PRODUCT_CHANGED' ELSE NULL END WHERE id=?")
      .run(valid ? 1 : 0, valid ? 1 : 0, r.id);
  }).immediate());
}
export function readRounds(db: Database.Database, attemptId: string): RoundHistory {
  readAttempt(db, attemptId);
  const entries = db.prepare<[string], RoundHistory['entries'][number]>(`SELECT r.round_number AS round,r.delivery_version AS deliveryId,p.id AS producerPassageId,
    pr.receipt_id AS producerReceiptId,rv.id AS reviewId,rv.state AS reviewState,d.content_identity AS contentIdentity
    FROM rounds r JOIN passages p ON p.attempt_id=r.attempt_id AND p.round_number=r.round_number AND p.role='implementer'
    LEFT JOIN passage_results pr ON pr.passage_id=p.id LEFT JOIN deliveries d ON d.id=r.delivery_version
    LEFT JOIN reviews rv ON rv.delivery_id=r.delivery_version WHERE r.attempt_id=? ORDER BY r.round_number`).all(attemptId);
  const view = { entries }; if (!Value.Check(RoundHistory, view)) throw new ExecutionError('STORAGE_FAILED'); return view;
}
/** Called inside acceptResult's transaction. No IO and no provider calls. */
export function acceptReview(db: Database.Database, binding: PassageBinding, result: ReviewerResult): void {
  const r = readReview(db, binding.deliveryVersion); const a = readAttempt(db, binding.attemptId);
  if (!r || r.passageId !== binding.passageId || r.state !== 'pending' || r.independenceState === 'pending' || a.deliveryId !== r.deliveryId) throw new ResultValidationError([{ path: '/review', rule: 'requires_current_pending_review_and_independence_check' }]);
  if (result.verdict === 'approved' && result.criteria.some(c => c.evidence.some(e =>
    /^(?:[a-f0-9]{40}|[a-f0-9]{64}|artifact:[^\s]+)$/i.test(e.trim())))) throw new ResultValidationError([{ path: '/criteria', rule: 'approval_evidence_must_describe_observed_behavior' }]);
  const prior = openFindings(db, a.id, binding.round);
  for (const repetition of result.commandRepetitions ?? []) {
    if (!repetition.prior_evidence.length || !repetition.prior_evidence.every(e => db.prepare(`
      SELECT 1 FROM passage_results p,json_each(p.summary_json,'$.checks') c
      WHERE p.passage_id=? AND json_extract(c.value,'$.evidence')=?`).get(r.implementerPassageId, e))) throw new ResultValidationError([{ path: '/commandRepetitions', rule: 'must_reference_producer_check_evidence' }]);
  }
  if (prior.length > 1000 || result.resolutions.length !== prior.length || result.resolutions.some(x => !prior.some(f => f.id === x.findingKey)) ||
    new Set(result.resolutions.map(x => x.findingKey)).size !== prior.length ||
    (result.verdict === 'rejected' && !result.findings.some(f => f.blocking) && !result.criteria.some(c => c.verdict !== 'passed') && !result.resolutions.some(x => x.verdict === 'unresolved'))) throw new ResultValidationError([{ path: '/resolutions', rule: 'must_cover_prior_findings_and_justify_rejection' }]);
  for (const f of result.findings) {
    if (f.originFindingId) {
      const origin = prior.find(x => x.id === f.originFindingId);
      if (!origin || origin.originFindingId !== null || !result.resolutions.some(x => x.findingKey === origin.id && x.verdict === 'unresolved') ||
        digestCriteria(origin.criterionIds) !== digestCriteria(f.criterionIds) || origin.category !== f.category) throw new ResultValidationError([{ path: '/findings', rule: 'origin_must_match_unresolved_root_finding' }]);
    }
  }
  if (new Set(result.findings.flatMap(f => f.originFindingId ? [f.originFindingId] : [])).size !== result.findings.filter(f => f.originFindingId).length) throw new ResultValidationError([{ path: '/findings', rule: 'origin_finding_ids_must_be_unique' }]);
  for (const f of result.findings) db.prepare(`INSERT INTO findings(id,review_id,attempt_id,finding_key,criterion_ids_json,category,problem,evidence_json,expected_result,blocking,priority,origin_finding_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(randomUUID(), r.id, a.id, f.key, JSON.stringify(f.criterionIds), f.category, f.problem, JSON.stringify(f.evidence), f.expectedResult, f.blocking ? 1 : 0, f.priority ?? null, f.originFindingId ?? null);
  for (const x of result.resolutions) db.prepare('INSERT INTO finding_resolutions(finding_id,review_id,attempt_id,verdict,evidence_json) VALUES (?,?,?,?,?)')
    .run(x.findingKey, r.id, a.id, r.independenceState === 'valid' ? x.verdict : 'unresolved', JSON.stringify(x.evidence));
  recordAssessments(db, r.id, result, [...new Set(prior.map(f => f.originFindingId ?? f.id))]);
  respondToDisputes(db, r.id, result);
  const approved = result.verdict === 'approved' && r.independenceState === 'valid' && result.criteria.length > 0 &&
    result.criteria.every(c => c.verdict === 'passed') && !result.findings.some(f => f.blocking) &&
    !prior.some(f => f.blocking && !result.resolutions.some(x => x.findingKey === f.id && x.verdict === 'resolved'));
  db.prepare('UPDATE reviews SET state=?,reason=?,completed_at_ms=? WHERE id=?').run(approved ? 'approved' : 'rejected', result.summary, Date.now(), r.id);
  // Technical approval is historical. Publication still needs its current authority gate.
  db.prepare('UPDATE attempts SET phase=?,diagnostic=? WHERE id=?').run(approved ? 'publishing' : 'reviewing', approved ? null : r.diagnostic ?? 'REVIEW_REJECTED', a.id);
  if (!approved && r.independenceState === 'valid') blockCorrection(db, r.deliveryId);
}
export interface CorrectionPlan { sourcePassageId: string; passageId: string; findings: Finding[]; review: Review; guidance: string | null;
  integration?: import('./integration.js').IntegrationPlan & { operationId: string; sourceDeliveryId: string; sourceContentIdentity: string | null; sourceRef: string | null } }
export function beginCorrection(db: Database.Database, deliveryId: string): CorrectionPlan | null {
  return guarded(() => db.transaction(() => {
    const review = readReview(db, deliveryId); const d = readDelivery(db, deliveryId); const a = readAttempt(db, d.attemptId);
    const block = readAttemptBlock(db, a.id);
    const latestGuidance = block ? db.prepare<[string, string], { guidance_json: string }>(`SELECT guidance_json FROM attempt_decisions
      WHERE attempt_id=? AND block_id=? AND action='guidance' ORDER BY created_at_ms DESC,id DESC LIMIT 1`).get(a.id, block.id) : null;
    if (block && (!latestGuidance || a.suspension !== null)) return null;
    if (!review || review.state !== 'rejected' || a.result || a.suspension || a.deliveryId !== d.id || a.phase !== 'reviewing') return null;
    // An invalid reviewer workspace is not evidence that implementation needs correction.
    if (review.independenceState !== 'valid') {
      db.prepare("UPDATE attempts SET phase='finished',result='failed',suspension=NULL,diagnostic=?,revision=revision+1,updated_at_ms=? WHERE id=?")
        .run(review.diagnostic ?? 'REVIEW_PRODUCT_CHANGED', Date.now(), a.id);
      attemptEvent(db, a.id, 'attempt.failed'); return null;
    }
    const capture = readCapture(db, a.id);
    if (block) {
      if (block.reason === 'correction_limit' || d.round - 1 >= capture.configuration.configuration.correction_limit) return null;
    } else if (blockCorrection(db, deliveryId)) return null;
    const source = db.prepare<[string], { state: string; tracking_state: string }>('SELECT state,tracking_state FROM passages WHERE id=?').get(d.producerPassageId);
    if (source?.state !== 'ready' || source.tracking_state !== 'tracked') throw denied();
    const passageId = randomUUID(); const version = randomUUID(); const now = Date.now();
    const role = capture.roleResources.find(x => x.role === 'implementer'); if (!role) throw denied();
    const findings = openFindings(db, a.id, d.round + 1);
    if (findings.length > 1000) throw new OperationError(503, 'FINDING_CONTEXT_LIMIT', 'The unresolved finding context exceeds the supported limit.');
    db.prepare('INSERT INTO rounds(attempt_id,round_number,delivery_version,created_at_ms) VALUES (?,?,?,?)').run(a.id, d.round + 1, version, now);
    db.prepare(`INSERT INTO passages(id,attempt_id,round_number,delivery_version,role,role_resource_json,terminal_name,state,tracking_state,session_source_id,created_at_ms,attempt_session_id)
      VALUES (?,?,?,?,'implementer',?,?,'starting','pending',?,?,(SELECT id FROM attempt_sessions WHERE attempt_id=? AND role='implementer'))`)
      .run(passageId, a.id, d.round + 1, version, JSON.stringify(role), `factory-${passageId}`, d.producerPassageId, now, a.id);
    db.prepare("UPDATE attempts SET phase='implementing',diagnostic=NULL,revision=revision+1,updated_at_ms=? WHERE id=?").run(now, a.id);
    attemptEvent(db, a.id, 'correction.planned');
    const guidance = latestGuidance ? (JSON.parse(latestGuidance.guidance_json) as { text: string }).text : null;
    return { sourcePassageId: d.producerPassageId, passageId, findings, review, guidance };
  }).immediate());
}
