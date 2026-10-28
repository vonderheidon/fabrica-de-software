import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { AttemptListQuery, AttemptDetailQuery, DeliveryDetailQuery, DetailItem, OperationId, type AttemptPage, type AttemptDetail, type DeliveryDetail, type DetailPage, type DetailSection, type HistoricalEffectiveProfile } from '#contracts';
import { readAttempt, readCapture } from './attempts.js';
import { deliveryView, readDelivery } from './deliveries.js';
import { digest, eventCursor } from './configuration-reads.js';
import { readSettings } from './settings.js';
import { readMeasurements } from './measurements.js';
import { readStageActivity } from './stage-activity.js';
import { readResources } from './recovery.js';
import { publicationSummary } from './publication.js';
import { readEffect } from './effects.js';
import { OperationError } from './operations.js';
import { StorageError } from './errors.js';
import { readDeliverySummary } from './delivery-summary.js';
import { InvalidAttemptSearch, normalizeAttemptTitle, prepareAttemptSearch } from './attempt-search.js';

const cursorError = () => new OperationError(400, 'QUERY_CURSOR_INVALID', 'The cursor does not match this scope, section, filter or order.');
function redactProfileText(value: string): string {
  return value
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]')
    .replace(/(https?:\/\/)[^/\s:@]+(?::[^/\s@]*)?@/gi, '$1[REDACTED]@')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b/g, '[REDACTED CREDENTIAL]')
    .replace(/\b(authorization|cookie|set-cookie|x-csrf-token|password|secret|token|api[_-]?key)\b\s*[:=]\s*(?:bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[REDACTED]');
}
function profileContextSummary(capture: ReturnType<typeof readCapture>): string {
  const body = redactProfileText(capture.issue.body);
  const bodyExcerpt = body.length <= 4096 ? body : `${body.slice(0, 4096)}\n[Conteúdo restante omitido; SHA-256 ${digest(body)}]`;
  const title = redactProfileText(capture.issue.title);
  const titleExcerpt = title.length <= 512 ? title : `${title.slice(0, 512)} [título resumido; SHA-256 ${digest(title)}]`;
  const criteria = capture.criteria.slice(0, 10).map((criterion) => `${criterion.id}: ${redactProfileText(criterion.text).slice(0, 256)}`);
  if (capture.criteria.length > 10) criteria.push(`${capture.criteria.length - 10} critérios adicionais; SHA-256 ${digest(capture.criteria.slice(10))}`);
  return `Issue #${capture.issue.number}: ${titleExcerpt}\n${bodyExcerpt}\nCritérios capturados:\n${criteria.join('\n')}`;
}
function profileComposition(role: 'implementer' | 'reviewer', profile: NonNullable<ReturnType<typeof readCapture>['configuration']['implementer_profile']>, contextSummary: string): HistoricalEffectiveProfile {
  return {
    role, profileId: profile.id ?? null, profileRevision: 'revision' in profile ? profile.revision : null,
    executor: redactProfileText(profile.executor), provider: redactProfileText(profile.provider), model: redactProfileText(profile.model),
    effort: profile.effort === null ? null : redactProfileText(profile.effort),
    guidance: redactProfileText(profile.guidance),
    compositionVersion: 'composition_version' in profile ? profile.composition_version ?? null : null,
    contextSummary, technicalContractSummary: role === 'implementer'
      ? 'Contrato do Implementador v1. O controlador fixa tentativa, papel, rodada, versão e IDs de critérios; execution_complete e execution_question usam schemas fechados e validação do servidor. Guidance não altera permissões, checkout, autorização de publicação ou limites.'
      : 'Contrato do Revisor v1. O controlador fixa tentativa, papel, rodada, versão, IDs de critérios e achados; execution_complete e execution_question usam schemas fechados e validação do servidor. Guidance não concede escrita no produto, altera a versão revisada nem muda limites.',
    credentialsRedacted: true,
  };
}
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
  let search: ReturnType<typeof prepareAttemptSearch>;
  try { search = prepareAttemptSearch(query); }
  catch (error) {
    if (error instanceof InvalidAttemptSearch) throw new OperationError(400, 'ATTEMPT_SEARCH_INVALID', error.message);
    throw error;
  }
  const limit = Number(query.limit ?? '25');
  const fingerprint = digest({
    version: 'attempt-search-v1', installation: s.installation_id, account: s.account_id,
    project: query.projectId ?? null, result: query.result ?? null, issueNumber: search.issueNumber,
    title: search.titleNeedle, dateFrom: query.dateFrom ?? null, dateTo: query.dateTo ?? null,
    timeZone: search.timeZone, fromMs: search.fromMs, untilMs: search.untilMs, limit,
    order: 'created_at_ms-desc-id-desc', ceiling: 'account-rowid',
  });
  const maximum = db.prepare<[string | null], { ceiling: number }>(
    'SELECT coalesce(max(rowid),0) AS ceiling FROM attempts WHERE account_id IS ?',
  ).get(s.account_id)!.ceiling;
  const cursor = decodeCursor(query.cursor, fingerprint, maximum);
  if (cursor.ceiling > maximum) throw cursorError();
  const initialPosition = attemptPagePosition(cursor.after);
  const clauses = ['a.account_id IS @account', 'a.rowid<=@ceiling'];
  const bindings: AttemptPageBindings = { account: s.account_id, ceiling: cursor.ceiling, batch: search.titleNeedle === null ? limit + 1 : 100 };
  if (query.projectId !== undefined) { clauses.push('a.project_id=@project'); bindings.project = query.projectId; }
  if (query.result === 'active') clauses.push('a.result IS NULL');
  else if (query.result !== undefined) { clauses.push('a.result=@result'); bindings.result = query.result; }
  if (search.issueNumber !== null) { clauses.push('a.issue_number=@issueNumber'); bindings.issueNumber = search.issueNumber; }
  if (search.fromMs !== null) { clauses.push('a.created_at_ms>=@fromMs'); bindings.fromMs = search.fromMs; }
  if (search.untilMs !== null) { clauses.push('a.created_at_ms<@untilMs'); bindings.untilMs = search.untilMs; }

  const pageKey = "printf('%020d',a.created_at_ms)||':'||a.id";
  const buildStatement = (after: boolean) => db.prepare<AttemptPageBindings, AttemptPageRow>(`SELECT a.id,a.project_id AS projectId,a.issue_id AS issueId,
    a.issue_number AS issueNumber,a.issue_title AS issueTitle,a.phase,a.result,a.suspension,a.diagnostic,a.revision,
    a.created_at_ms AS createdAtMs,a.updated_at_ms AS updatedAtMs,${pageKey} AS pageKey
    FROM attempts a WHERE ${[...clauses, ...(after ? ['(a.created_at_ms<@afterAt OR (a.created_at_ms=@afterAt AND a.id<@afterId))'] : [])].join(' AND ')}
    ORDER BY a.created_at_ms DESC,a.id DESC LIMIT @batch`);
  const firstPageStatement = buildStatement(false);
  const continuationStatement = buildStatement(true);
  const selected: AttemptPageRow[] = [];
  let scanPosition = initialPosition;
  let resumeAfter = '';
  let hasMore = false;
  let exhausted = false;
  while (!exhausted && !hasMore) {
    const statement = scanPosition === null ? firstPageStatement : continuationStatement;
    const rows = statement.all({ ...bindings, ...(scanPosition === null ? {} : { afterAt: scanPosition.createdAtMs, afterId: scanPosition.id }) });
    if (rows.length === 0) break;
    for (const row of rows) {
      const positionBeforeRow = scanPosition?.key ?? '';
      scanPosition = { createdAtMs: row.createdAtMs, id: row.id, key: row.pageKey };
      const matchesTitle = search.titleNeedle === null || row.issueTitle != null && normalizeAttemptTitle(row.issueTitle).includes(search.titleNeedle);
      if (!matchesTitle) continue;
      selected.push(row);
      if (selected.length > limit) {
        selected.pop();
        resumeAfter = positionBeforeRow;
        hasMore = true;
        break;
      }
    }
    if (!hasMore && rows.length < bindings.batch) exhausted = true;
  }
  return {
    items: selected.map(({ pageKey: _key, ...row }) => row), has_more: hasMore,
    next_cursor: hasMore ? encodeCursor(fingerprint, cursor.ceiling, resumeAfter) : null,
    event_cursor: eventCursor(db),
  };
}

interface AttemptPagePosition { createdAtMs: number; id: string; key: string }
type AttemptPageRow = AttemptPage['items'][number] & { pageKey: string };
interface AttemptPageBindings {
  account: string | null; ceiling: number; batch: number; project?: string; result?: string; issueNumber?: number;
  fromMs?: number; untilMs?: number; afterAt?: number; afterId?: string;
}

function attemptPagePosition(key: string): AttemptPagePosition | null {
  if (!key) return null;
  const match = /^(\d{20}):([0-9a-f-]{36})$/i.exec(key);
  const createdAtMs = match ? Number(match[1]) : NaN;
  const id = match?.[2];
  if (!Number.isSafeInteger(createdAtMs) || createdAtMs < 0 || !id || !Value.Check(OperationId, id)) throw cursorError();
  return { createdAtMs, id, key };
}
import { targetSelection } from './target-selections.js';
import { readAttemptBlock } from './progress.js';
import { AttemptDecisionView } from '#contracts';

interface SectionPlan { from: string; key: string; delivery: string; round: string; select: string }
const plans: Record<DetailSection, SectionPlan> = {
  target_selections: { from: 'publication_target_selections t JOIN deliveries d ON d.id=t.delivery_id', key: "printf('%020d',t.created_at_ms)||':'||t.operation_id", delivery: 't.delivery_id', round: 'd.round_number', select: 't.operation_id' },
  finding_disputes: { from: 'finding_disputes t JOIN deliveries d ON d.id=t.delivery_id LEFT JOIN reviews response ON response.id=t.response_review_id', key: "printf('%020d',t.created_at_ms)||':'||t.id", delivery: 't.delivery_id', round: 'd.round_number',
    select: `t.id,t.attempt_id AS attemptId,t.finding_id AS findingId,t.passage_id AS passageId,t.delivery_id AS deliveryId,t.content_identity AS contentIdentity,
      t.justification,t.evidence_json,t.response_review_id AS responseReviewId,t.response_verdict AS responseVerdict,t.response_justification AS responseJustification,
      t.response_evidence_json,t.created_at_ms AS createdAtMs,t.responded_at_ms AS respondedAtMs,response.delivery_id AS responseDeliveryId,response.content_identity AS responseContentIdentity` },
  finding_assessments: { from: 'finding_assessments t JOIN reviews r ON r.id=t.review_id JOIN deliveries d ON d.id=r.delivery_id', key: "printf('%02d',d.round_number)||':'||t.id", delivery: 'r.delivery_id', round: 'd.round_number',
    select: 't.id,t.attempt_id AS attemptId,t.finding_id AS findingId,t.review_id AS reviewId,r.delivery_id AS deliveryId,d.round_number AS round,r.content_identity AS contentIdentity,t.progress,t.evidence_json,t.justification,t.created_at_ms AS createdAtMs' },
  decisions: { from: 'attempt_decisions t JOIN deliveries d ON d.id=t.delivery_id', key: "printf('%020d',t.created_at_ms)||':'||t.id", delivery: 't.delivery_id', round: 'd.round_number',
    select: `t.id,t.operation_id AS operationId,t.attempt_id AS attemptId,t.delivery_id AS deliveryId,t.block_id AS blockId,t.block_revision AS blockRevision,
      t.block_reason AS blockReason,t.action,t.guidance_json,t.successor_preparation_id AS successorPreparationId,
      t.successor_preparation_revision AS successorPreparationRevision,t.created_at_ms AS createdAtMs` },
  rounds: { from: 'rounds t LEFT JOIN passages p ON p.attempt_id=t.attempt_id AND p.round_number=t.round_number AND p.role=\'implementer\' LEFT JOIN passage_results z ON z.passage_id=p.id LEFT JOIN deliveries d ON d.id=t.delivery_version LEFT JOIN reviews r ON r.delivery_id=d.id', key: "printf('%02d',t.round_number)", delivery: 't.delivery_version', round: 't.round_number',
    select: 't.round_number AS round,t.delivery_version AS deliveryId,p.id AS producerPassageId,z.receipt_id AS producerReceiptId,r.id AS reviewId,r.state AS reviewState,d.content_identity AS contentIdentity' },
  passages: { from: 'passages t LEFT JOIN passage_results z ON z.passage_id=t.id LEFT JOIN attempt_sessions s ON s.id=t.attempt_session_id LEFT JOIN managed_terminals m ON m.id=s.managed_terminal_id', key: "printf('%02d',t.round_number)||':'||t.role||':'||t.id", delivery: 't.delivery_version', round: 't.round_number',
    select: `t.id,t.attempt_id AS attemptId,t.delivery_version AS deliveryId,t.round_number AS round,t.role,t.state,t.tracking_state AS tracking,t.diagnostic,z.receipt_id AS resultReceiptId,t.created_at_ms AS createdAtMs,
      s.id AS attemptSessionId,s.state AS sessionState,t.session_source_id AS sessionSourceId,m.terminal_name AS terminalName,m.state AS terminalState,
      (SELECT o.state FROM terminal_occupancies o WHERE o.passage_id=t.id ORDER BY o.claimed_at_ms DESC,o.id DESC LIMIT 1) AS occupancyState` },
  criteria: { from: 'attempt_criteria t', key: "printf('%06d',t.occurrence_index)||':'||t.criterion_id", delivery: 'NULL', round: 'NULL',
    select: `t.criterion_id AS id,t.text,t.occurrence_index AS occurrence_index,
      (SELECT json_extract(j.value,'$.explicit') FROM attempts a,json_each(a.capture_json,'$.criteria') j WHERE a.id=t.attempt_id AND json_extract(j.value,'$.id')=t.criterion_id) AS explicit,
      (SELECT json_object('verdict',c.verdict,'evidence',json(c.evidence_json)) FROM criterion_results c JOIN passages p ON p.id=c.passage_id WHERE c.attempt_id=t.attempt_id AND c.criterion_id=t.criterion_id AND p.delivery_version=@delivery AND p.role='implementer') AS producer_json,
      (SELECT json_object('verdict',c.verdict,'evidence',json(c.evidence_json)) FROM criterion_results c JOIN passages p ON p.id=c.passage_id WHERE c.attempt_id=t.attempt_id AND c.criterion_id=t.criterion_id AND p.delivery_version=@delivery AND p.role='reviewer') AS reviewer_json` },
  reviews: { from: 'reviews t JOIN deliveries d ON d.id=t.delivery_id', key: "printf('%020d',t.created_at_ms)||':'||t.id", delivery: 't.delivery_id', round: 'd.round_number',
    select: `t.id,t.delivery_id AS deliveryId,t.attempt_id AS attemptId,t.passage_id AS passageId,t.implementer_passage_id AS implementerPassageId,t.content_identity AS contentIdentity,t.state,t.reason,t.independence_state AS independenceState,t.diagnostic,t.created_at_ms AS createdAtMs,t.completed_at_ms AS completedAtMs,(SELECT json_extract(z.summary_json,'$.verdict') FROM passage_results z WHERE z.passage_id=t.passage_id) AS declaredVerdict` },
  findings: { from: 'findings t JOIN reviews r ON r.id=t.review_id JOIN deliveries d ON d.id=r.delivery_id', key: "printf('%02d',d.round_number)||':'||t.id", delivery: 'r.delivery_id', round: 'd.round_number',
    select: `t.id,t.review_id AS reviewId,t.attempt_id AS attemptId,t.finding_key AS key,t.criterion_ids_json,t.category,t.problem,t.evidence_json,t.expected_result AS expectedResult,t.blocking,t.priority,t.origin_finding_id AS originFindingId,r.delivery_id AS deliveryId,r.content_identity AS contentIdentity,
      (SELECT json_group_array(json_object('reviewId',x.review_id,'deliveryId',xr.delivery_id,'verdict',x.verdict,'evidence',json(x.evidence_json))) FROM finding_resolutions x JOIN reviews xr ON xr.id=x.review_id WHERE x.finding_id=t.id) AS resolutions_json` },
  questions: { from: 'execution_questions t JOIN passages p ON p.id=t.passage_id', key: "printf('%020d',t.created_at_ms)||':'||t.id", delivery: 'p.delivery_version', round: 'p.round_number',
    select: "t.id,t.attempt_id AS attemptId,t.passage_id AS passageId,p.delivery_version AS deliveryId,CASE WHEN t.state='recorded' THEN 'answer_recorded' ELSE t.state END AS state,t.revision,t.created_at_ms AS createdAtMs,CASE WHEN t.ttl_ms IS NULL THEN NULL ELSE t.created_at_ms+t.ttl_ms END AS expiresAtMs,t.receipt_json AS receipt_json" },
  effects: { from: 'effects t LEFT JOIN deliveries d ON d.id=t.delivery_id', key: "printf('%020d',t.created_at_ms)||':'||t.operation_id", delivery: 't.delivery_id', round: 'd.round_number', select: 't.operation_id AS operationId' },
  resources: { from: 'resources t JOIN passages p ON p.id=t.passage_id', key: "printf('%020d',t.created_at_ms)||':'||t.id", delivery: 'p.delivery_version', round: 'p.round_number',
    select: 't.id,t.attempt_id AS attemptId,t.passage_id AS passageId,t.kind,t.reference,t.owned,t.launch_state AS launchState,t.stop_state AS stopState,t.diagnostic,t.revision,t.removed' },
};
export function readDetailPage(db: Database.Database, attemptId: string, query: AttemptDetailQuery): DetailPage | null {
  if (!query.section) { if (query.cursor) throw cursorError(); return null; }
  const a = readAttempt(db, attemptId); const s = readSettings(db);
  if (query.section === 'profiles') {
    if (query.deliveryId && readDelivery(db, query.deliveryId).attemptId !== attemptId) throw new OperationError(404, 'DELIVERY_NOT_FOUND', 'The selected version does not belong to this attempt.');
    const fingerprint = digest([s.installation_id, s.account_id, attemptId, 'profiles:captured-effective-instructions']);
    const cursor = decodeCursor(query.cursor, fingerprint, 2); const limit = Number(query.limit ?? '25');
    const capture = readCapture(db, attemptId); const context = profileContextSummary(capture);
    const profiles = [
      ['implementer', capture.configuration.implementer_profile],
      ['reviewer', capture.configuration.reviewer_profile],
    ] as const;
    const rows = profiles.map(([role, profile]) => {
      if (!profile) throw new StorageError('OPERATION_DATA_INVALID');
      return { role, value: profileComposition(role, profile, context) };
    }).filter((row) => row.role > cursor.after).slice(0, limit + 1);
    const selected = rows.slice(0, limit); const last = selected.at(-1); const hasMore = rows.length > limit;
    const items = selected.map(({ value }) => value);
    if (items.some((item) => !Value.Check(DetailItem, item))) throw new StorageError('OPERATION_DATA_INVALID');
    return { section: query.section, items, has_more: hasMore,
      next_cursor: hasMore && last ? encodeCursor(fingerprint, cursor.ceiling, last.role) : null, event_cursor: eventCursor(db) };
  }
  const plan = plans[query.section];
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
    if (query.section === 'finding_disputes') { const { evidence_json, response_evidence_json, ...entry } = row; value = { ...entry,
      evidence: JSON.parse(String(evidence_json)) as unknown, responseEvidence: typeof response_evidence_json === 'string' ? JSON.parse(response_evidence_json) as unknown : null }; }
    if (query.section === 'finding_assessments') { const { evidence_json, ...entry } = row; value = { ...entry, evidence: JSON.parse(String(evidence_json)) as unknown }; }
    if (query.section === 'decisions') { const { guidance_json, ...entry } = row; value = { ...entry,
      guidance: typeof guidance_json === 'string' ? (JSON.parse(guidance_json) as { text: string }).text : null }; }
    if (query.section === 'target_selections') value = targetSelection(db,String(row.operation_id)).view;
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
  const targetCapture = readCapture(db,id).v3Delivery;
  const details = readDetailPage(db,id,query);
   const v3Details = details?.section === 'target_selections' ? { section: 'target_selections' as const, items: details.items.filter((item): item is import('#contracts').PublicationTargetSelection => 'selection_kind' in item), next_cursor: details.next_cursor, has_more: details.has_more }
     : details?.section === 'finding_assessments' ? { section: 'finding_assessments' as const, items: details.items.filter((item): item is import('#contracts').FindingAssessment => 'progress' in item && 'findingId' in item), next_cursor: details.next_cursor, has_more: details.has_more }
     : details?.section === 'finding_disputes' ? { section: 'finding_disputes' as const, items: details.items.filter((item): item is import('#contracts').FindingDispute => 'responseReviewId' in item), next_cursor: details.next_cursor, has_more: details.has_more }
     : details?.section === 'decisions' ? { section: 'decisions' as const, items: details.items.filter((item): item is AttemptDecisionView => 'operationId' in item && 'blockId' in item), next_cursor: details.next_cursor, has_more: details.has_more } : null;
  const historySections = (['target_selections', 'finding_assessments', 'finding_disputes', 'decisions'] as const).filter(section => {
    const plan = plans[section]!;
    return Boolean(db.prepare(`SELECT 1 FROM ${plan.from} WHERE t.attempt_id=? AND ${plan.round}=?${selectedDeliveryId ? ` AND ${plan.delivery}=?` : ''} LIMIT 1`)
      .get(...(selectedDeliveryId ? [id, selectedRound, selectedDeliveryId] : [id, selectedRound])));
  });
  return { ...a, v3Details, historySections, block: readAttemptBlock(db,id), expectedAccountId, issue: issueHeader(db,id),selectedDeliveryId, selectedRound,
    deliverySummary: exists ? readDeliverySummary(db,id,selectedDeliveryId!,publication) : null,
    publicationTarget: targetCapture?.publication_target ?? null, publicationTargetHash: targetCapture?.publication_target_hash ?? null,
    stageActivity: readStageActivity(db,id), publication, measurements: readMeasurements(db,id), cleanup: readResources(db,id).cleanup,
    authority: authority ? { ...authority,recovery: authority.reason === 'ASSIGNEE_CHANGED' ? 'Encerre a tentativa anterior antes de transferir responsabilidade e rearmar Ready no GitHub.' : authority.reason ? 'Corrija conta, vínculo ou Status no GitHub e use Revalidar. A fábrica não altera o quadro para resolver divergências.' : 'Autoridade observada; cada despacho ou efeito ainda exige revalidação atual.' } : null,
    capabilities: { cancel: { available: a.result === null }, completePublication: publication.completeCapability, reconcilePublication: publication.reconcileCapability, revalidate: { available: a.result === null || publication.reviewState === 'approved' } },
    details: v3Details ? null : details };
}
export function readDeliveryDetail(db: Database.Database, id: string, query: DeliveryDetailQuery): DeliveryDetail {
  if (!Value.Check(DeliveryDetailQuery,query)) throw cursorError();
  const view = deliveryView(db,id); const publication = publicationSummary(db,view.delivery.attemptId,id);
  const page = readDetailPage(db,view.delivery.attemptId,{ section: 'reviews', deliveryId: id, limit: '1' });
  const review = page?.items[0];
  const capturedMode = db.prepare<[string],{ mode: DeliveryDetail['authorizations']['capturedMode'] }>("SELECT json_extract(capture_json,'$.configuration.configuration.defaultDeliveryMode') AS mode FROM attempts WHERE id=?").get(view.delivery.attemptId)!.mode;
  return { ...view,issue: issueHeader(db,view.delivery.attemptId), attempt: readAttempt(db,view.delivery.attemptId),measurements: readMeasurements(db,view.delivery.attemptId),cleanup: readResources(db,view.delivery.attemptId).cleanup,
    deliverySummary: readDeliverySummary(db,view.delivery.attemptId,id,publication),
    authorizations: { capturedMode,authorizedMode: publication.mode,requiresCurrentGate: true },
    review: review && 'independenceState' in review ? review : null, publication,
    capabilities: { diff: { available: view.delivery.captureState === 'captured' }, completePublication: publication.completeCapability, reconcilePublication: publication.reconcileCapability },
    details: readDetailPage(db,view.delivery.attemptId,{ ...query, deliveryId: id }) };
}
