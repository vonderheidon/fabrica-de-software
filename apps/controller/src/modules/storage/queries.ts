import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { AttemptListQuery, AttemptDetailQuery, DeliveryDetailQuery, DetailItem, type AttemptPage, type AttemptDetail, type DeliveryDetail, type DetailPage, type DetailSection } from '#contracts';
import { readAttempt } from './attempts.js';
import { deliveryView, readDelivery } from './deliveries.js';
import { digest, eventCursor } from './configuration-reads.js';
import { readSettings } from './settings.js';
import { readMeasurements } from './measurements.js';
import { readResources } from './recovery.js';
import { publicationSummary } from './publication.js';
import { readArtifact } from './verification.js';
import { readEffect } from './effects.js';
import { OperationError } from './operations.js';
import { StorageError } from './errors.js';

const cursorError = () => new OperationError(400, 'QUERY_CURSOR_INVALID', 'The cursor does not match this scope, section, filter or order.');
function decodeCursor(cursor: string | undefined, fingerprint: string, ceiling: number) {
  if (!cursor) return { ceiling, after: '' };
  let value: unknown;
  try { value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); } catch { throw cursorError(); }
  if (!Array.isArray(value) || value.length !== 3 || value[0] !== fingerprint || !Number.isSafeInteger(value[1]) || value[1] < 0 || typeof value[2] !== 'string' || value[2].length > 512) throw cursorError();
  return { ceiling: value[1] as number, after: value[2] };
}
function encodeCursor(fingerprint: string, ceiling: number, key: string) { return Buffer.from(JSON.stringify([fingerprint, ceiling, key])).toString('base64url'); }
function issueHeader(db: Database.Database,id: string): AttemptDetail['issue'] {
  return db.prepare<[string],AttemptDetail['issue']>(`SELECT issue_id AS id,json_extract(capture_json,'$.issue.number') AS number,
    json_extract(capture_json,'$.issue.title') AS title,json_extract(capture_json,'$.issue.url') AS url FROM attempts WHERE id=?`).get(id)!;
}
export function readAttemptPage(db: Database.Database, query: AttemptListQuery): AttemptPage {
  if (!Value.Check(AttemptListQuery, query)) throw cursorError();
  const s = readSettings(db);
  const fingerprint = digest([s.installation_id, s.account_id, query.projectId ?? null, query.result ?? null, 'attempts:created-desc:id']);
  const maximum = db.prepare<[], { ceiling: number }>('SELECT coalesce(max(rowid),0) AS ceiling FROM attempts').get()!.ceiling;
  const cursor = decodeCursor(query.cursor, fingerprint, maximum); const limit = Number(query.limit ?? '25');
  // Fixed-width timestamp plus UUID makes ties deterministic. New inserts above ceiling never enter continuation pages.
  const key = "printf('%020d',a.created_at_ms)||':'||a.id";
  const rows = db.prepare<{ account: string | null; project: string | null; result: string | null; ceiling: number; after: string; limit: number },
    AttemptPage['items'][number] & { pageKey: string }>(`SELECT a.id,a.project_id AS projectId,a.issue_id AS issueId,
    json_extract(a.capture_json,'$.issue.number') AS issueNumber,a.phase,a.result,a.suspension,a.revision,a.created_at_ms AS createdAtMs,a.updated_at_ms AS updatedAtMs,${key} AS pageKey
    FROM attempts a WHERE a.account_id IS @account AND (@project IS NULL OR a.project_id=@project)
    AND (@result IS NULL OR (@result='active' AND a.result IS NULL) OR a.result=@result) AND a.rowid<=@ceiling
    AND (@after='' OR ${key}<@after) ORDER BY a.created_at_ms DESC,a.id DESC LIMIT @limit`)
    .all({ account: s.account_id, project: query.projectId ?? null, result: query.result ?? null, ...cursor, limit: limit + 1 });
  const selected = rows.slice(0, limit); const last = selected.at(-1); const hasMore = rows.length > limit;
  return { items: selected.map(({ pageKey: _key, ...row }) => row), has_more: hasMore, next_cursor: hasMore && last ? encodeCursor(fingerprint, cursor.ceiling, last.pageKey) : null, event_cursor: eventCursor(db) };
}
interface SectionPlan { from: string; key: string; delivery: string; round: string; select: string }
const plans: Record<DetailSection, SectionPlan> = {
  rounds: { from: 'rounds t LEFT JOIN passages p ON p.attempt_id=t.attempt_id AND p.round_number=t.round_number AND p.role=\'implementer\' LEFT JOIN passage_results z ON z.passage_id=p.id LEFT JOIN deliveries d ON d.id=t.delivery_version LEFT JOIN reviews r ON r.delivery_id=d.id', key: "printf('%02d',t.round_number)", delivery: 't.delivery_version', round: 't.round_number',
    select: 't.round_number AS round,t.delivery_version AS deliveryId,p.id AS producerPassageId,z.receipt_id AS producerReceiptId,r.id AS reviewId,r.state AS reviewState,d.content_identity AS contentIdentity' },
  passages: { from: 'passages t LEFT JOIN passage_results z ON z.passage_id=t.id', key: "printf('%02d',t.round_number)||':'||t.role||':'||t.id", delivery: 't.delivery_version', round: 't.round_number',
    select: 't.id,t.attempt_id AS attemptId,t.delivery_version AS deliveryId,t.round_number AS round,t.role,t.state,t.tracking_state AS tracking,t.diagnostic,z.receipt_id AS resultReceiptId,t.created_at_ms AS createdAtMs' },
  criteria: { from: 'attempt_criteria t', key: "printf('%06d',t.occurrence_index)||':'||t.criterion_id", delivery: 'NULL', round: 'NULL',
    select: `t.criterion_id AS id,t.text,t.occurrence_index AS occurrence_index,
      (SELECT json_extract(j.value,'$.explicit') FROM attempts a,json_each(a.capture_json,'$.criteria') j WHERE a.id=t.attempt_id AND json_extract(j.value,'$.id')=t.criterion_id) AS explicit,
      (SELECT json_object('verdict',c.verdict,'evidence',json(c.evidence_json)) FROM criterion_results c JOIN passages p ON p.id=c.passage_id WHERE c.attempt_id=t.attempt_id AND c.criterion_id=t.criterion_id AND p.delivery_version=@delivery AND p.role='implementer') AS producer_json,
      (SELECT json_object('verdict',c.verdict,'evidence',json(c.evidence_json)) FROM criterion_results c JOIN passages p ON p.id=c.passage_id WHERE c.attempt_id=t.attempt_id AND c.criterion_id=t.criterion_id AND p.delivery_version=@delivery AND p.role='reviewer') AS reviewer_json` },
  checks: { from: 'checks t JOIN deliveries d ON d.id=t.delivery_id', key: "printf('%010d',t.run_number)||':'||t.id", delivery: 't.delivery_id', round: 'd.round_number',
    select: 't.id,t.verification_id AS verificationId,t.delivery_id AS deliveryId,t.content_identity AS contentIdentity,t.check_definition_id AS checkDefinitionId,t.run_number AS runNumber,t.command,t.cwd_relative AS cwdRelative,t.timeout_ms AS timeoutMs,t.state,t.exit_code AS exitCode,t.started_at_ms AS startedAtMs,t.ended_at_ms AS endedAtMs,t.duration_ms AS durationMs,t.diagnostic,t.execution_diagnostic AS executionDiagnostic' },
  reviews: { from: 'reviews t JOIN deliveries d ON d.id=t.delivery_id', key: "printf('%020d',t.created_at_ms)||':'||t.id", delivery: 't.delivery_id', round: 'd.round_number',
    select: `t.id,t.delivery_id AS deliveryId,t.attempt_id AS attemptId,t.passage_id AS passageId,t.verification_id AS verificationId,t.content_identity AS contentIdentity,t.state,t.reason,t.independence_state AS independenceState,t.diagnostic,t.created_at_ms AS createdAtMs,t.completed_at_ms AS completedAtMs,(SELECT json_extract(z.summary_json,'$.verdict') FROM passage_results z WHERE z.passage_id=t.passage_id) AS declaredVerdict` },
  findings: { from: 'findings t JOIN reviews r ON r.id=t.review_id JOIN deliveries d ON d.id=r.delivery_id', key: "printf('%02d',d.round_number)||':'||t.id", delivery: 'r.delivery_id', round: 'd.round_number',
    select: `t.id,t.review_id AS reviewId,t.attempt_id AS attemptId,t.finding_key AS key,t.criterion_ids_json,t.category,t.problem,t.evidence_json,t.expected_result AS expectedResult,t.blocking,
      (SELECT json_group_array(json_object('reviewId',x.review_id,'deliveryId',xr.delivery_id,'verdict',x.verdict,'evidence',json(x.evidence_json))) FROM finding_resolutions x JOIN reviews xr ON xr.id=x.review_id WHERE x.finding_id=t.id) AS resolutions_json` },
  questions: { from: 'execution_questions t JOIN passages p ON p.id=t.passage_id', key: "printf('%020d',t.created_at_ms)||':'||t.id", delivery: 'p.delivery_version', round: 'p.round_number',
    select: "t.id,t.attempt_id AS attemptId,t.passage_id AS passageId,p.delivery_version AS deliveryId,CASE WHEN t.state='recorded' THEN 'answer_recorded' ELSE t.state END AS state,t.revision,t.created_at_ms AS createdAtMs,CASE WHEN t.ttl_ms IS NULL THEN NULL ELSE t.created_at_ms+t.ttl_ms END AS expiresAtMs,t.receipt_json AS receipt_json" },
  effects: { from: 'effects t LEFT JOIN deliveries d ON d.id=t.delivery_id', key: "printf('%020d',t.created_at_ms)||':'||t.operation_id", delivery: 't.delivery_id', round: 'd.round_number', select: 't.operation_id AS operationId' },
  resources: { from: 'resources t JOIN passages p ON p.id=t.passage_id', key: "printf('%020d',t.created_at_ms)||':'||t.id", delivery: 'p.delivery_version', round: 'p.round_number',
    select: 't.id,t.attempt_id AS attemptId,t.passage_id AS passageId,t.kind,t.reference,t.owned,t.launch_state AS launchState,t.stop_state AS stopState,t.diagnostic,t.revision,t.removed' },
};
export function readDetailPage(db: Database.Database, attemptId: string, query: AttemptDetailQuery): DetailPage | null {
  if (!query.section) { if (query.cursor) throw cursorError(); return null; }
  const a = readAttempt(db, attemptId); const s = readSettings(db); const plan = plans[query.section];
  if (!plan) throw cursorError();
  const selected = query.deliveryId ?? (query.roundId ? db.prepare<[string, number], { id: string }>('SELECT delivery_version AS id FROM rounds WHERE attempt_id=? AND round_number=?').get(attemptId, Number(query.roundId))?.id : a.deliveryId) ?? null;
  if (query.deliveryId && readDelivery(db, query.deliveryId).attemptId !== attemptId) throw new OperationError(404, 'DELIVERY_NOT_FOUND', 'The selected version does not belong to this attempt.');
  const fingerprint = digest([s.installation_id,s.account_id,attemptId,query.section,query.deliveryId ?? null,query.roundId ?? null,selected,'ascending:stable-id']);
  const filter = `t.attempt_id=@attempt AND (@round IS NULL OR ${plan.round}=@round OR ${plan.round} IS NULL)
    AND (@filterDelivery IS NULL OR ${plan.delivery}=@filterDelivery OR ${plan.delivery} IS NULL)`;
  const parameters = { attempt: attemptId, round: query.roundId ? Number(query.roundId) : null, filterDelivery: query.deliveryId ?? null, delivery: selected };
  const maximum = db.prepare<Record<string, unknown>, { ceiling: number }>(`SELECT coalesce(max(t.rowid),0) AS ceiling FROM ${plan.from} WHERE ${filter}`).get(parameters)!.ceiling;
  const cursor = decodeCursor(query.cursor, fingerprint, maximum); const limit = Number(query.limit ?? '25');
  const rows = db.prepare<Record<string, unknown>, Record<string, unknown>>(`SELECT ${plan.select},${plan.key} AS pageKey FROM ${plan.from}
    WHERE ${filter} AND t.rowid<=@ceiling AND (@after='' OR ${plan.key}>@after) ORDER BY ${plan.key} LIMIT @limit`).all({ ...parameters, ...cursor, limit: limit + 1 });
  const selectedRows = rows.slice(0,limit); const items: DetailItem[] = selectedRows.map(({ pageKey: _key, ...row }) => {
    let value: unknown = row;
    if (query.section === 'effects') value = readEffect(db, String(row.operationId));
    if (query.section === 'criteria') {
      const { producer_json, reviewer_json, ...c } = row;
      value = { ...c, explicit: c.explicit === 1, producer: typeof producer_json === 'string' ? JSON.parse(producer_json) as unknown : null, reviewer: typeof reviewer_json === 'string' ? JSON.parse(reviewer_json) as unknown : null };
    }
    if (query.section === 'findings') {
      const { criterion_ids_json, evidence_json, resolutions_json, ...f } = row;
      value = { ...f, blocking: f.blocking === 1, criterionIds: JSON.parse(String(criterion_ids_json)) as unknown, evidence: JSON.parse(String(evidence_json)) as unknown, resolutions: JSON.parse(String(resolutions_json)) as unknown };
    }
    if (query.section === 'questions') { const { receipt_json, ...q } = row; value = { ...q, deliveryReceipt: typeof receipt_json === 'string' ? JSON.parse(receipt_json) as unknown : null }; }
    if (query.section === 'resources') value = { ...row, owned: row.owned === 1, removed: row.removed === 1 };
    if (query.section === 'checks') value = { ...row, artifacts: db.prepare<[string], { id: string }>('SELECT id FROM artifacts WHERE check_id=?').all(String(row.id)).map(v => readArtifact(db,v.id)) };
    if (!Value.Check(DetailItem,value)) throw new StorageError('OPERATION_DATA_INVALID'); return value;
  });
  const last = selectedRows.at(-1); const hasMore = rows.length > limit;
  return { section: query.section, items, has_more: hasMore, next_cursor: hasMore && last ? encodeCursor(fingerprint,cursor.ceiling,String(last.pageKey)) : null, event_cursor: eventCursor(db) };
}
export function readAttemptDetail(db: Database.Database, id: string, query: AttemptDetailQuery): AttemptDetail {
  if (!Value.Check(AttemptDetailQuery,query)) throw cursorError();
  const a = readAttempt(db,id);
  let selectedRound = query.roundId ? Number(query.roundId) : a.round;
  let selectedDeliveryId = query.deliveryId ?? (query.roundId ? db.prepare<[string,number],{ id: string }>('SELECT delivery_version AS id FROM rounds WHERE attempt_id=? AND round_number=?').get(id,selectedRound)?.id ?? null : a.deliveryId);
  if (query.roundId && !selectedDeliveryId) throw new OperationError(404,'ROUND_NOT_FOUND','The selected round does not exist.');
  if (query.deliveryId) {
    const d = readDelivery(db,query.deliveryId); if (d.attemptId !== id || (query.roundId && d.round !== selectedRound)) throw new OperationError(404,'DELIVERY_NOT_FOUND','The selected version does not belong to this round.');
    selectedRound = d.round; selectedDeliveryId = d.id;
  }
  // A planned round has a delivery identity before the delivery row exists.
  const exists = selectedDeliveryId ? db.prepare('SELECT id FROM deliveries WHERE id=?').get(selectedDeliveryId) : null;
  const authority = db.prepare<[string], { reason: string | null; expectedStatusId: string | null; observedStatusId: string | null; observedAtMs: number }>('SELECT reason,expected_status_id AS expectedStatusId,observed_status_id AS observedStatusId,observed_at_ms AS observedAtMs FROM attempt_authority WHERE attempt_id=?').get(id) ?? null;
  const expectedAccountId = db.prepare<[string], { account_id: string }>('SELECT account_id FROM attempts WHERE id=?').get(id)?.account_id;
  if (!expectedAccountId) throw new StorageError('ATTEMPT_DATA_INVALID');
  const publication = publicationSummary(db,id,exists ? selectedDeliveryId! : undefined);
  return { ...a, expectedAccountId, issue: issueHeader(db,id),selectedDeliveryId, selectedRound, publication, measurements: readMeasurements(db,id), cleanup: readResources(db,id).cleanup,
    authority: authority ? { ...authority,recovery: authority.reason === 'ASSIGNEE_CHANGED' ? 'Encerre a tentativa anterior antes de transferir responsabilidade e rearmar Ready no GitHub.' : authority.reason ? 'Corrija conta, vínculo ou Status no GitHub e use Revalidar. A fábrica não altera o quadro para resolver divergências.' : 'Autoridade observada; cada despacho ou efeito ainda exige revalidação atual.' } : null,
    capabilities: { cancel: { available: a.result === null }, completePublication: publication.completeCapability, reconcilePublication: publication.reconcileCapability, revalidate: { available: a.result === null || publication.reviewState === 'approved' } },
    details: readDetailPage(db,id,query) };
}
export function readDeliveryDetail(db: Database.Database, id: string, query: DeliveryDetailQuery): DeliveryDetail {
  if (!Value.Check(DeliveryDetailQuery,query)) throw cursorError();
  const view = deliveryView(db,id); const publication = publicationSummary(db,view.delivery.attemptId,id);
  const page = readDetailPage(db,view.delivery.attemptId,{ section: 'reviews', deliveryId: id, limit: '1' });
  const review = page?.items[0];
  const capturedMode = db.prepare<[string],{ mode: DeliveryDetail['authorizations']['capturedMode'] }>("SELECT json_extract(capture_json,'$.configuration.configuration.defaultDeliveryMode') AS mode FROM attempts WHERE id=?").get(view.delivery.attemptId)!.mode;
  return { ...view,issue: issueHeader(db,view.delivery.attemptId), attempt: readAttempt(db,view.delivery.attemptId),measurements: readMeasurements(db,view.delivery.attemptId),cleanup: readResources(db,view.delivery.attemptId).cleanup,
    authorizations: { capturedMode,authorizedMode: publication.mode,requiresCurrentGate: true },
    review: review && 'independenceState' in review ? review : null, publication,
    capabilities: { diff: { available: view.delivery.captureState === 'captured' }, completePublication: publication.completeCapability, reconcilePublication: publication.reconcileCapability },
    details: readDetailPage(db,view.delivery.attemptId,{ ...query, deliveryId: id }) };
}
