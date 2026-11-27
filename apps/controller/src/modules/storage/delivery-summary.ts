import type Database from 'better-sqlite3';
import type { DeliverySummaryView, PublicationSummary } from '#contracts';
import { readAttempt } from './attempts.js';
import { readDelivery } from './deliveries.js';
import { OperationError } from './operations.js';

export function readDeliverySummary(db: Database.Database, attemptId: string, deliveryId: string, publication: PublicationSummary): DeliverySummaryView {
  const attempt = readAttempt(db,attemptId); const d = readDelivery(db,deliveryId);
  if (d.attemptId !== attemptId) throw new OperationError(404,'DELIVERY_NOT_FOUND','The selected version does not belong to this attempt.');
  const original = db.prepare<[string], { mode: DeliverySummaryView['original_mode'] }>(`SELECT
    json_extract(capture_json,'$.configuration.configuration.defaultDeliveryMode') AS mode FROM attempts WHERE id=?`).get(attemptId)!;
  const review = db.prepare<[string], { id: string; passageId: string; state: 'pending' | 'approved' | 'rejected'; independence: string; identity: string; implementerPassageId: string }>(`SELECT id,passage_id AS passageId,state,
    independence_state AS independence,content_identity AS identity,implementer_passage_id AS implementerPassageId FROM reviews WHERE delivery_id=?`).get(deliveryId);
  const total = db.prepare<[string], { n: number }>('SELECT count(*) AS n FROM attempt_criteria WHERE attempt_id=?').get(attemptId)!.n;
  const reviewed = review && review.state !== 'pending' && review.independence === 'valid' && review.identity === d.contentIdentity;
  const satisfied = reviewed ? db.prepare<[string, string], { n: number }>(`SELECT count(*) AS n FROM criterion_results
    WHERE attempt_id=? AND passage_id=? AND verdict='passed'`).get(attemptId,review.passageId)!.n : 0;
  const approved = review?.state === 'approved' && review.independence === 'valid' && review.identity === d.contentIdentity &&
    total > 0 && satisfied === total && review.implementerPassageId === d.producerPassageId;
  const resolved = reviewed ? db.prepare<[string, string], { n: number }>(`SELECT count(*) AS n
    FROM finding_resolutions WHERE attempt_id=? AND review_id=? AND verdict='resolved'`).get(attemptId,review.id)!.n : 0;
  const nonblocking = review ? db.prepare<[string, number, number], { n: number }>(`SELECT count(*) AS n FROM findings f JOIN reviews r ON r.id=f.review_id
    JOIN deliveries fd ON fd.id=r.delivery_id WHERE f.attempt_id=? AND fd.round_number<=? AND f.blocking=0
    AND NOT EXISTS (SELECT 1 FROM finding_resolutions x JOIN reviews xr ON xr.id=x.review_id JOIN deliveries xd ON xd.id=xr.delivery_id
      WHERE x.finding_id=f.id AND x.verdict='resolved' AND xd.round_number<=?)`)
    .get(attemptId,d.round,d.round)!.n : 0;
  const commit = db.prepare<[string, string], { state: string; sha: string | null; branch: string | null; path: string | null; landed: number }>(`SELECT e.state,
    json_extract(e.receipt_json,'$.id') AS sha,json_extract(e.expected_identity_json,'$.branchRef') AS branch,t.local_path AS path,
    coalesce(json_extract(e.expected_identity_json,'$.branchKind')='existing' AND json_type(t.local_identity_json,'$.operator_config') IS NOT NULL,0) AS landed
    FROM effects e LEFT JOIN delivery_targets t ON t.operation_id=json_extract(e.expected_identity_json,'$.targetOperationId')
    WHERE e.attempt_id=? AND e.delivery_id=? AND e.kind='local_commit'`).get(attemptId,deliveryId);
  const resource = d.id === attempt.deliveryId ? db.prepare<[string], { reference: string }>(`SELECT reference FROM resources
    WHERE attempt_id=? AND kind='implementation' AND removed=0 AND launch_state='ready' ORDER BY created_at_ms DESC LIMIT 1`).get(attemptId) : null;
  const confirmedCommit = commit?.state === 'confirmed';
  const pending: string[] = [];
  const required = publication.mode === 'icr' ? ['issue_comment'] : publication.mode === 'commit' ? ['local_commit','issue_comment'] : ['local_commit','push','pull_request'];
  for (const kind of required) {
    if (!db.prepare("SELECT 1 FROM effects WHERE attempt_id=? AND delivery_id=? AND kind=? AND state IN ('confirmed','not_applicable')").get(attemptId,deliveryId,kind)) pending.push(kind);
  }
  for (const effect of db.prepare<[string, string, number], { kind: string }>(`SELECT DISTINCT kind FROM effects e WHERE attempt_id=?
    AND (delivery_id=? OR (delivery_id IS NULL AND ?=1)) AND state NOT IN ('confirmed','not_applicable')
    AND (kind<>'project_status' OR e.rowid=(SELECT max(latest.rowid) FROM effects latest
      WHERE latest.attempt_id=e.attempt_id AND latest.kind='project_status'))`)
    .all(attemptId,deliveryId,d.id === attempt.deliveryId ? 1 : 0)) {
    if (!pending.includes(effect.kind)) pending.push(effect.kind);
  }
  const limitations: string[] = [];
  if (!approved) limitations.push('Esta versão ainda não tem aprovação independente válida; consulte critérios e revisão.');
  if (satisfied < total) limitations.push('Há critérios não comprovados; consulte os resultados da revisão desta versão.');
  if (publication.unknownEffects) limitations.push('Há efeitos sem confirmação; consulte e reconcilie a publicação antes de continuar.');
  if (db.prepare("SELECT 1 FROM effects WHERE attempt_id=? AND delivery_id=? AND kind='issue_comment' AND state='not_applicable'").get(attemptId,deliveryId)) {
    limitations.push('O comentário de entrega não foi encontrado na issue e não será reenviado por esta tentativa.');
  }
  if (attempt.suspension && d.id === attempt.deliveryId) limitations.push('A tentativa está suspensa; consulte a condição atual e siga a ação de recuperação antes de continuar.');
  if (nonblocking) limitations.push('Há observações não bloqueantes; consulte os achados da versão.');
  const integration = db.prepare<[string, number, string], { n: number }>(`SELECT count(*) AS n FROM rounds WHERE attempt_id=?
    AND round_number>? AND json_extract(integration_json,'$.source_delivery_id')=?`).get(attemptId,d.round,deliveryId)!.n;
  if (integration && attempt.result !== 'delivered') limitations.push('Uma adaptação posterior está pendente; acompanhe a nova versão sem reutilizar esta aprovação.');
  if (confirmedCommit && !commit.path) limitations.push('O histórico não informa o destino local do commit; consulte os registros antes de continuar.');
  if (!resource && !confirmedCommit) limitations.push('Localização de código indisponível neste resumo; consulte a referência fixa e os recursos retidos.');
  if (confirmedCommit && !commit.landed) limitations.push('Commit confirmado em branch própria; o checkout do operador não foi atualizado.');
  const lastRequest = db.prepare<[string, string], { state: string; diagnostic: string | null }>(`SELECT state,diagnostic FROM publication_requests
    WHERE attempt_id=? AND delivery_id=? ORDER BY rowid DESC LIMIT 1`).get(attemptId,deliveryId);
  const publicationFailure = attempt.result === null && lastRequest && ['failed','unknown'].includes(lastRequest.state) ? lastRequest.diagnostic : null;
  const completed = approved && publication.localState === 'completed' && pending.length === 0;
  const progress = confirmedCommit || publication.push?.state === 'confirmed' || publication.pullRequest?.state === 'confirmed' ||
    publication.mode !== 'icr' && Boolean(db.prepare("SELECT 1 FROM effects WHERE attempt_id=? AND delivery_id=? AND kind='issue_comment' AND state='confirmed'").get(attemptId,deliveryId));
  const blocked = review?.state === 'rejected' || Boolean(attempt.suspension) || ['failed','cancelled','rejected','interrupted'].includes(attempt.result ?? '');
  return {
    attempt_id:attemptId,delivery_id:deliveryId,original_mode:original.mode,authorized_mode:publication.mode,
    review_state:review?.state ?? null,outcome:d.captureState === 'failed' ? 'unavailable' : completed ? publication.mode === 'icr' ? 'icr_approved' : 'complete'
      : progress || publication.unknownEffects > 0 ? 'partial' : blocked ? 'blocked' : 'pending',
    content_identity:d.contentIdentity,approved_ref:approved ? d.gitRef : null,
    code_location:resource?.reference ?? null,local_repository:confirmedCommit ? commit.path : null,
    branch_ref:confirmedCommit ? commit.branch : null,commit_sha:confirmedCommit ? commit.sha : null,
    pull_request_url:publication.pullRequest?.state === 'confirmed' ? publication.pullRequest.receipt?.url ?? null : null,
    checkout_updated:confirmedCommit && Boolean(commit.landed),pending_effects:pending,limitations,criteria_satisfied:satisfied,criteria_total:total,
    resolved_findings:resolved,details_url:`/api/v1/deliveries/${deliveryId}`,
    publication_failure:publicationFailure,
  };
}
