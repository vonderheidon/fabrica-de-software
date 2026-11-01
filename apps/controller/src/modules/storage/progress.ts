import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { AttemptBlock, type ReviewerResult } from '#contracts';
import { readAttempt, readCapture, attemptEvent } from './attempts.js';
import { ExecutionError } from '../execution/index.js';
import { ResultValidationError } from '../execution/index.js';

export function readAttemptBlock(db: Database.Database, attemptId: string): AttemptBlock {
  const row = db.prepare<[string], { block_json: string }>('SELECT block_json FROM attempt_blocks WHERE attempt_id=?').get(attemptId);
  const value: unknown = row ? JSON.parse(row.block_json) : null;
  if (!Value.Check(AttemptBlock, value)) throw new ExecutionError('STORAGE_FAILED');
  if (!value) return null;
  const attempt = readAttempt(db, attemptId); const capture = readCapture(db, attemptId);
  const blocked = attempt.result === null && attempt.suspension === 'CORRECTION_BLOCKED';
  const used = attempt.round - 1; const limit = capture.configuration.configuration.correction_limit;
  return { ...value,
    guidance_capability: blocked && value.reason !== 'correction_limit' && used < limit
      ? { available: true } : { available: false, reason: !blocked ? 'A tentativa não está bloqueada no momento.' : 'O limite total de correções capturado foi atingido.' },
    change_profile_capability: blocked ? { available: true } : { available: false, reason: 'A tentativa não está bloqueada no momento.' },
    end_capability: blocked ? { available: true } : { available: false, reason: 'A tentativa não está bloqueada no momento.' },
  };
}

/** Inside the accepted result transaction; omitted assessments never imply progress. */
export function recordAssessments(db: Database.Database, reviewId: string, result: ReviewerResult, roots: string[]): void {
  const supplied = result.assessments ?? [];
  if (new Set(supplied.map(x => x.findingId)).size !== supplied.length || supplied.some(x => !roots.includes(x.findingId))) throw new ResultValidationError([{ path: '/assessments', rule: 'must_use_unique_root_finding_ids' }]);
  const review = db.prepare<[string], { attempt_id: string; independence_state: string }>('SELECT attempt_id,independence_state FROM reviews WHERE id=?').get(reviewId)!;
  if (review.independence_state !== 'valid') {
    if (supplied.length) throw new ResultValidationError([{ path: '/assessments', rule: 'requires_valid_review_independence' }]);
    return;
  }
  if (supplied.length !== roots.length) throw new ResultValidationError([{ path: '/assessments', rule: 'must_cover_all_root_findings' }]);
  for (const findingId of roots) {
    const item = supplied.find(x => x.findingId === findingId);
    if (!item) throw new ResultValidationError([{ path: '/assessments', rule: 'must_cover_all_root_findings' }]);
    if (item.evidence.some(e => {
      const value = e.trim();
      return value.length === 0 || value.toLowerCase().startsWith('artifact:') ||
        (value.length !== 40 && value.length !== 64 ? false : /^[a-f0-9]+$/i.test(value));
    })) throw new ResultValidationError([{ path: '/assessments', rule: 'evidence_must_describe_observed_behavior' }]);
    if (['proven', 'partial'].includes(item.progress)) {
      const finding = db.prepare<[string], { criterion_ids_json: string }>('SELECT criterion_ids_json FROM findings WHERE id=?').get(findingId);
      const criterionIds: unknown = finding ? JSON.parse(finding.criterion_ids_json) : null;
      if (!Array.isArray(criterionIds) || !item.evidence.length || !item.evidence.every(e =>
        e.trim().length > 0 && !/^(?:[a-f0-9]{40}|[a-f0-9]{64}|artifact:[^\s]+)$/i.test(e.trim()) &&
        result.criteria.some(c => (criterionIds.length === 0 || criterionIds.includes(c.criterionId)) && c.evidence.includes(e)))) {
        throw new ResultValidationError([{ path: '/assessments', rule: 'progress_evidence_must_match_criterion_evidence' }]);
      }
    }
    db.prepare(`INSERT INTO finding_assessments(id,attempt_id,finding_id,review_id,progress,evidence_json,justification,created_at_ms) VALUES (?,?,?,?,?,?,?,?)`)
      .run(randomUUID(), review.attempt_id, findingId, reviewId, item.progress, JSON.stringify(item.evidence), item.justification, Date.now());
  }
}

/** First recorded condition wins. No new passage or external effect is allocated here. */
export function blockCorrection(db: Database.Database, deliveryId: string): boolean {
  const d = db.prepare<[string], { attempt_id: string; round_number: number; content_identity: string }>('SELECT attempt_id,round_number,content_identity FROM deliveries WHERE id=?').get(deliveryId)!;
  const existingBlock = readAttemptBlock(db, d.attempt_id);
  const a = readAttempt(db, d.attempt_id);
  const limit = readCapture(db, a.id).configuration.configuration.correction_limit;
  const used = d.round_number - 1;
  const maintained = db.prepare<[string], { finding_id: string; justification: string; evidence_json: string; response_evidence_json: string; response_justification: string }>(`SELECT t.finding_id,t.justification,t.evidence_json,t.response_evidence_json,t.response_justification
    FROM finding_disputes t JOIN reviews r ON r.id=t.response_review_id
    WHERE r.delivery_id=? AND r.state='rejected' AND r.independence_state='valid' AND t.response_verdict='maintained' ORDER BY t.id`).all(deliveryId);
  const roots = db.prepare<[string, number], { id: string; evidence_json: string }>(`SELECT DISTINCT canonical.id,canonical.evidence_json FROM findings f
    JOIN findings canonical ON canonical.id=coalesce(f.origin_finding_id,f.id)
    JOIN reviews r ON r.id=f.review_id JOIN deliveries d ON d.id=r.delivery_id
    WHERE f.attempt_id=? AND f.blocking=1 AND r.independence_state='valid' AND r.state<>'pending' AND d.round_number<=?
      AND NOT EXISTS (SELECT 1 FROM finding_resolutions x JOIN reviews xr ON xr.id=x.review_id
        WHERE x.finding_id=f.id AND x.verdict='resolved' AND xr.independence_state='valid') ORDER BY canonical.id`).all(a.id, d.round_number);
  let maximum = 0; const recurring: string[] = []; const evidence = new Set<string>();
  for (const root of roots) {
    const history = db.prepare<[string, string], { progress: string; evidence_json: string }>(`SELECT x.progress,x.evidence_json FROM finding_assessments x
      JOIN reviews r ON r.id=x.review_id JOIN deliveries d ON d.id=r.delivery_id
      WHERE x.attempt_id=? AND x.finding_id=? AND r.state<>'pending' AND r.independence_state='valid' ORDER BY d.round_number`).all(a.id, root.id);
    let count = 0;
    for (const item of history) count = ['proven', 'partial'].includes(item.progress) ? 0 : count + 1;
    maximum = Math.max(maximum, count);
    if (count >= 2) recurring.push(root.id);
    if (count >= 2 || used >= limit) {
      for (const reference of [...JSON.parse(root.evidence_json) as string[], ...history.flatMap(x => JSON.parse(x.evidence_json) as string[])]) {
        if (evidence.size >= 20) break;
        evidence.add(reference);
      }
    }
  }
  if (used < limit && maximum < 2 && maintained.length === 0) return existingBlock ? a.suspension === 'CORRECTION_BLOCKED' : false;
  if (existingBlock) {
    if (a.suspension !== 'CORRECTION_BLOCKED') {
      db.prepare('UPDATE attempts SET suspension=?,diagnostic=?,revision=revision+1,updated_at_ms=? WHERE id=?')
        .run('CORRECTION_BLOCKED', existingBlock.reason === 'dispute_maintained' ? 'DISPUTE_MAINTAINED' : existingBlock.reason === 'no_progress' ? 'NO_PROGRESS' : 'CORRECTION_LIMIT', Date.now(), a.id);
      attemptEvent(db, a.id, 'attempt.blocked');
    }
    return true;
  }
  // Stable tie break when both conditions become true in this same accepted review.
  const reason = used >= limit ? 'correction_limit' : maintained.length ? 'dispute_maintained' : 'no_progress';
  if (reason === 'dispute_maintained') {
    evidence.clear();
    for (const item of maintained) {
      // Include both positions and the reviewer's cause in the bounded operational block.
      for (const reference of [
        `Contestação do Implementador: ${item.justification.slice(0, 4060)}`,
        `Resposta do Revisor: ${item.response_justification.slice(0, 4070)}`,
        ...JSON.parse(item.evidence_json) as string[],
        ...JSON.parse(item.response_evidence_json) as string[],
      ]) {
        if (evidence.size >= 20) break;
        evidence.add(reference);
      }
    }
  }
  const block: NonNullable<AttemptBlock> = {
    id: randomUUID(), revision: 1, reason, delivery_id: deliveryId, content_identity: d.content_identity,
    finding_ids: reason === 'dispute_maintained' ? [...new Set(maintained.map(x => x.finding_id))] : reason === 'no_progress' ? recurring : roots.map(x => x.id),
    cause: reason === 'dispute_maintained' ? 'O Revisor manteve o achado após contestação fundamentada do Implementador.' : reason === 'no_progress' ? 'Duas correções concluídas sem progresso verificável no mesmo bloqueante.' : 'O limite total de correções capturado foi atingido.',
    recovery: 'Revise o histórico e as evidências para decidir a orientação, preparar outro perfil ou encerrar. Os limites capturados permanecem válidos.',
    consecutive_no_progress: maximum, corrections_used: used, correction_limit: limit,
    guidance_capability: { available: false, reason: 'Orientação contextual depende do fluxo de decisões humanas.' },
    change_profile_capability: { available: false, reason: 'Troca de perfil depende de nova preparação explícita.' },
    end_capability: { available: false, reason: 'Encerramento por decisão depende do fluxo de decisões humanas; o cancelamento existente permanece separado.' },
    evidence: [...evidence],
  };
  if (!Value.Check(AttemptBlock, block)) throw new ExecutionError('STORAGE_FAILED');
  db.prepare('INSERT INTO attempt_blocks(attempt_id,block_json,created_at_ms) VALUES (?,?,?)').run(a.id, JSON.stringify(block), Date.now());
  db.prepare('UPDATE attempts SET suspension=?,diagnostic=?,revision=revision+1,updated_at_ms=? WHERE id=?').run('CORRECTION_BLOCKED', reason === 'dispute_maintained' ? 'DISPUTE_MAINTAINED' : reason === 'no_progress' ? 'NO_PROGRESS' : 'CORRECTION_LIMIT', Date.now(), a.id);
  attemptEvent(db, a.id, 'attempt.blocked');
  return true;
}
