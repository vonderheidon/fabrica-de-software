import { serializeOperationReceipt } from './common-json.js';
import { assertAttemptProjectAvailable, assertProjectAvailable, deletionOperation } from './project-deletion-barrier.js';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { CompletePublication, ReconcilePublication, AuthorizeUpgrade, OperationId, type EffectView, type PublicationSummary } from '#contracts';
import { attemptEvent, readAttempt, readCapture } from './attempts.js';
import { readDelivery, publicationBaseSha } from './deliveries.js';
import { configurationETag, digest, guarded, readConfiguration } from './configuration-reads.js';
import { readSettings } from './settings.js';
import { OperationError, readOperation, type StoredOperation } from './operations.js';
import { StorageError } from './errors.js';
import { effectView, splitEffectReason } from './effects.js';
import { authorizedMode, upgradeSummaries } from './publication-modes.js';

export interface PublicationCommand {
  operationId: string; attemptId: string; expectedRevision: string | undefined;
  kind: 'publication.complete' | 'publication.reconcile' | 'publication.authorize-upgrade' | 'attempt.revalidate';
  body: CompletePublication | ReconcilePublication | AuthorizeUpgrade | Record<string, never>;
}
export const authorityReasons = ['ACCOUNT_CHANGED','AUTHORITY_UNAVAILABLE','ASSIGNEE_CHANGED','KANBAN_DIVERGENCE','PUBLICATION_CONFIGURATION_CHANGED','ISSUE_INELIGIBLE'] as const;
export interface AuthorityObservation { reason: typeof authorityReasons[number] | null; observedAccountId: string | null; expectedStatusId: string | null; observedStatusId: string | null }
export function effectsFor(db: Database.Database, attemptId: string): EffectView[] {
  readAttempt(db, attemptId);
  return db.prepare<[string], Parameters<typeof effectView>[0]>('SELECT * FROM effects WHERE attempt_id=? ORDER BY rowid').all(attemptId).map(effectView);
}
export function publicationSnapshot(db: Database.Database, attemptId: string, deliveryId?: string) {
  const status = readAttempt(db, attemptId); const capture = readCapture(db, attemptId);
  const settings = readSettings(db); const configuration = readConfiguration(db, status.projectId);
  const selected = deliveryId ?? status.deliveryId;
  const delivery = selected ? readDelivery(db, selected) : null;
  if (delivery && delivery.attemptId !== attemptId) throw new OperationError(404, 'DELIVERY_NOT_FOUND', 'The delivery does not belong to this attempt.');
  const review = delivery ? db.prepare<[string], { state: 'pending' | 'approved' | 'rejected'; independence_state: string; content_identity: string; passage_id: string; implementer_passage_id: string }>('SELECT state,independence_state,content_identity,passage_id,implementer_passage_id FROM reviews WHERE delivery_id=?').get(delivery.id) ?? null : null;
  const effects = effectsFor(db, attemptId);
  const authority = db.prepare<[string], { reason: string | null; expected_status_id: string | null; observed_status_id: string | null; observed_at_ms: number }>('SELECT reason,expected_status_id,observed_status_id,observed_at_ms FROM attempt_authority WHERE attempt_id=?').get(attemptId) ?? null;
  const stamp = digest([status.id,status.revision,configurationETag(configuration),delivery?.id,delivery?.revision,effects.map(e => [e.operationId,e.revision])]);
  return { status, capture, settings, configuration, delivery, publicationBaseSha: delivery ? publicationBaseSha(db,delivery.id) : null, review, effects, authority, stamp, mode: authorizedMode(db,attemptId) };
}
/** Local eligibility uses scalar projections; polling never deserializes the captured task or evidence. */
function publicationBlockReason(db: Database.Database, attemptId: string, deliveryId: string, explicit: boolean): string | null {
  const a = readAttempt(db, attemptId); const d = readDelivery(db, deliveryId);
  if (deletionOperation(db, a.projectId)) return 'PROJECT_DELETION_PENDING';
  if (d.attemptId !== attemptId) throw new OperationError(404, 'DELIVERY_NOT_FOUND', 'The delivery does not belong to this attempt.');
  const r = db.prepare<[string], { state: string; independence_state: string; content_identity: string; passage_id: string; implementer_passage_id: string }>(
    'SELECT state,independence_state,content_identity,passage_id,implementer_passage_id FROM reviews WHERE delivery_id=?').get(deliveryId);
  const mode = authorizedMode(db,attemptId);
  const interrupted = a.result === 'interrupted' && explicit;
  const producer = d ? db.prepare<[string], { writes_stopped: number }>("SELECT json_extract(summary_json,'$.writesStopped') AS writes_stopped FROM passage_results WHERE passage_id=?").get(d.producerPassageId) : null;
  const reviewer = r ? db.prepare('SELECT passage_id FROM passage_results WHERE passage_id=?').get(r.passage_id) : null;
  if (!d || d.captureState !== 'captured' || d.id !== a.deliveryId || !r || r.state !== 'approved' || r.independence_state !== 'valid' ||
    r.content_identity !== d.contentIdentity || !producer?.writes_stopped || !reviewer || r.implementer_passage_id !== d.producerPassageId ||
    !['icr','commit','pr'].includes(mode) ||
    (a.result !== null && a.result !== 'delivered' && !interrupted) ||
    (a.tracking !== 'tracked' && !interrupted && a.result !== 'delivered') ||
    (!interrupted && a.result !== 'delivered' && a.phase !== 'publishing') ||
    (a.suspension !== null && !authorityReasons.some(reason => reason === a.suspension)) ||
    db.prepare("SELECT id FROM execution_questions WHERE attempt_id=? AND state NOT IN ('delivered','cancelled')").get(attemptId) ||
    db.prepare('SELECT operation_id FROM cancellation_requests WHERE attempt_id=?').get(attemptId)) {
    return 'PUBLICATION_BLOCKED';
  }
  const lostResources = a.result === 'delivered' && db.prepare("SELECT id FROM resources WHERE attempt_id=? AND kind='terminal' AND diagnostic='TRACKING_LOST' AND stop_state<>'confirmed'").get(attemptId);
  if ((interrupted || lostResources) && (db.prepare("SELECT id FROM resources WHERE attempt_id=? AND kind='terminal' AND stop_state<>'confirmed'").get(attemptId) ||
    db.prepare("SELECT id FROM capture_runs WHERE delivery_id=? AND state='running'").get(deliveryId))) {
    return 'RESOURCES_NOT_RECONCILED';
  }
  if (mode === 'icr' && !db.prepare("SELECT id FROM resources WHERE attempt_id=? AND kind='implementation' AND owned=1 AND removed=0 AND launch_state='ready'").get(attemptId)) return 'ICR_ENVIRONMENT_UNAVAILABLE';
  return null;
}
export function assertPublicationEligible(db: Database.Database, attemptId: string, deliveryId: string, explicit: boolean): void {
  assertAttemptProjectAvailable(db, attemptId);
  const reason = publicationBlockReason(db, attemptId, deliveryId, explicit);
  if (reason) throw new OperationError(409, reason, 'ICR requires the approved current version, completed passages, reconciled resources and current authority.');
}
function commandHash(c: PublicationCommand): string {
  const bodyValid = c.kind === 'publication.complete' ? Value.Check(CompletePublication, c.body) : c.kind === 'publication.authorize-upgrade' ? Value.Check(AuthorizeUpgrade,c.body) : c.kind === 'publication.reconcile' ? Value.Check(ReconcilePublication, c.body) : Object.keys(c.body).length === 0;
  if (!Value.Check(OperationId, c.operationId) || !Value.Check(OperationId, c.attemptId) || !bodyValid ||
    !['publication.complete','publication.reconcile','publication.authorize-upgrade','attempt.revalidate'].includes(c.kind) || (c.expectedRevision !== undefined && c.expectedRevision.length > 256)) {
    throw new OperationError(400, 'PUBLICATION_COMMAND_INVALID', 'The publication command is invalid.');
  }
  return digest({ method: 'POST', kind: c.kind, attemptId: c.attemptId, body: c.body, expectedRevision: c.expectedRevision ?? null });
}
export function recoverPublication(db: Database.Database, c: PublicationCommand): StoredOperation | null {
  const hash = commandHash(c); const s = readSettings(db);
  const old = db.prepare<[string], { installation_id: string; account_id: string | null; request_hash: string }>('SELECT installation_id,account_id,request_hash FROM operation_requests WHERE operation_id=?').get(c.operationId);
  if (!old) return null;
  if (old.installation_id !== s.installation_id || old.account_id !== s.account_id || old.request_hash !== hash) throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'The command conflicts with a previously accepted operation.');
  const op = readOperation(db, c.operationId); if (!op?.receipt) throw new StorageError('OPERATION_DATA_INVALID'); return op;
}
export function acceptPublication(db: Database.Database, c: PublicationCommand): { created: boolean; operation: StoredOperation } {
  return guarded(() => db.transaction(() => {
    const old = recoverPublication(db, c); if (old) return { created: false, operation: old };
    const a = readAttempt(db, c.attemptId); const s = readSettings(db);
    assertProjectAvailable(db, a.projectId);
    if (c.expectedRevision === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
    if (c.expectedRevision !== `"${a.id}:${a.revision}"`) throw new OperationError(412, 'REVISION_CONFLICT', 'The attempt changed.');
    const deliveryId = 'deliveryId' in c.body ? c.body.deliveryId : null;
    if (deliveryId) { const d = readDelivery(db, deliveryId); if (d.attemptId !== a.id) throw new OperationError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found in this attempt.'); }
    if (c.kind === 'publication.complete') {
      if (!('authorizedMode' in c.body) || !deliveryId) throw new OperationError(409, 'MODE_NOT_AUTHORIZED', 'A durably authorized mode is required.');
      if (c.body.authorizedMode !== authorizedMode(db,a.id)) throw new OperationError(409,'MODE_NOT_AUTHORIZED','Completion must use the durably authorized mode.');
      assertPublicationEligible(db, a.id, deliveryId, true);
    }
    if (c.kind === 'publication.authorize-upgrade') {
      const body = c.body as AuthorizeUpgrade;
      const summary = publicationSummary(db,a.id,body.deliveryId).upgrades?.find(u => u.targetMode === body.targetMode);
      if (body.currentMode !== authorizedMode(db,a.id) || !summary || !summary.capability.available || summary.summaryHash !== body.authorizedAdditionalEffectsHash) {
        throw new OperationError(409,'MODE_UPGRADE_NOT_ALLOWED',summary?.capability.reason_code ?? 'The additional effects summary or mode changed.');
      }
      assertPublicationEligible(db,a.id,body.deliveryId,true);
      if (db.prepare('SELECT reason FROM attempt_authority WHERE attempt_id=? AND reason IS NOT NULL').get(a.id)) throw new OperationError(409,'PUBLICATION_BLOCKED','Current publication authority is blocked.');
    }
    if (db.prepare("SELECT operation_id FROM publication_requests WHERE attempt_id=? AND state IN ('accepted','running')").get(a.id)) throw new OperationError(409, 'PUBLICATION_BUSY', 'Another publication command is still active.');
    const revision = a.revision + 1;
    const next = db.prepare<[],{ seq: number }>('SELECT coalesce(max(seq),0)+1 AS seq FROM events').get()!.seq;
    const receipt = { revision, event_cursor: String(next) };
    db.prepare('UPDATE attempts SET revision=?,updated_at_ms=? WHERE id=? AND revision=?').run(revision, Date.now(), a.id, a.revision);
    db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json)
      VALUES (?,?,?,?,'attempt',?,?,?,?)`).run(c.operationId, s.installation_id, s.account_id, c.kind, a.id, commandHash(c), JSON.stringify({ etag: c.expectedRevision }), serializeOperationReceipt(receipt));
    db.prepare(`INSERT INTO publication_requests(operation_id,attempt_id,delivery_id,kind,authorized_mode,state,created_at_ms) VALUES (?,?,?,?,?,'accepted',?)`)
      .run(c.operationId, a.id, deliveryId, c.kind, c.kind === 'publication.complete' && 'authorizedMode' in c.body ? c.body.authorizedMode : c.kind === 'publication.authorize-upgrade' && 'targetMode' in c.body ? c.body.targetMode : null, Date.now());
    if (c.kind === 'publication.authorize-upgrade' && 'targetMode' in c.body) {
      db.prepare('INSERT INTO publication_upgrades(operation_id,attempt_id,delivery_id,current_mode,target_mode,summary_hash,created_at_ms) VALUES (?,?,?,?,?,?,?)')
        .run(c.operationId,a.id,deliveryId,c.body.currentMode,c.body.targetMode,c.body.authorizedAdditionalEffectsHash,Date.now());
    }
    db.prepare(`INSERT INTO events(entity_type,entity_id,attempt_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms)
      VALUES ('attempt',?,?,?, ?,?,'{}',?)`).run(a.id, a.id, c.operationId, `${c.kind}.accepted`, revision, Date.now());
    const operation = readOperation(db, c.operationId); if (!operation?.receipt) throw new StorageError('OPERATION_DATA_INVALID');
    return { created: true, operation };
  }).immediate());
}
export function finishPublicationRequest(db: Database.Database, id: string, state: 'succeeded' | 'failed' | 'unknown', diagnostic: string | null): void {
  guarded(() => db.transaction(() => {
    const changed = db.prepare("UPDATE publication_requests SET state=?,diagnostic=? WHERE operation_id=? AND state IN ('accepted','running')").run(state, diagnostic, id);
    if (!changed.changes) return;
    const row = db.prepare<[string], { attempt_id: string }>('SELECT attempt_id FROM publication_requests WHERE operation_id=?').get(id)!;
    db.prepare('UPDATE attempts SET revision=revision+1,updated_at_ms=? WHERE id=?').run(Date.now(), row.attempt_id);
    attemptEvent(db, row.attempt_id, `publication.${state}`);
  }).immediate());
}
export function recordAuthority(db: Database.Database, id: string, stamp: string, observation: AuthorityObservation): void {
  guarded(() => db.transaction(() => {
    const snapshot = publicationSnapshot(db, id);
    if (snapshot.stamp !== stamp) throw new OperationError(412, 'AUTHORITY_OBSERVATION_STALE', 'The attempt changed during the authority observation.');
    const old = snapshot.authority?.reason ?? null;
    db.prepare(`INSERT INTO controller_authority(id,configured_account_id,observed_account_id,dispatch_paused,observed_at_ms) VALUES ('local',?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET configured_account_id=excluded.configured_account_id,observed_account_id=excluded.observed_account_id,dispatch_paused=excluded.dispatch_paused,observed_at_ms=excluded.observed_at_ms`)
      .run(snapshot.settings.account_id, observation.observedAccountId, observation.observedAccountId === snapshot.settings.account_id ? 0 : 1, Date.now());
    db.prepare(`INSERT INTO attempt_authority(attempt_id,reason,expected_status_id,observed_status_id,observed_at_ms) VALUES (?,?,?,?,?)
      ON CONFLICT(attempt_id) DO UPDATE SET reason=excluded.reason,expected_status_id=excluded.expected_status_id,observed_status_id=excluded.observed_status_id,observed_at_ms=excluded.observed_at_ms`)
      .run(id, observation.reason, observation.expectedStatusId, observation.observedStatusId, Date.now());
    const a = snapshot.status;
    // Only the suspension owned by this authority observation can be removed.
    const suspension = observation.reason ? (a.suspension === null || a.suspension === old ? observation.reason : a.suspension) : a.suspension === old ? null : a.suspension;
    if (a.suspension !== suspension || old !== observation.reason) {
      db.prepare('UPDATE attempts SET suspension=?,revision=revision+1,updated_at_ms=? WHERE id=?').run(suspension, Date.now(), id);
      attemptEvent(db, id, 'attempt.authority-observed');
    }
  }).immediate());
}
export function finalizeICR(db: Database.Database, id: string, deliveryId: string, stamp: string, explicit: boolean): void {
  guarded(() => db.transaction(() => {
    const s = publicationSnapshot(db, id, deliveryId);
    if (s.stamp !== stamp) throw new OperationError(412, 'PUBLICATION_CHANGED', 'The attempt changed before local ICR completion.');
    assertPublicationEligible(db, id, deliveryId, explicit);
    const mode = s.mode;
    const resolved = (kind: EffectView['kind']) => s.effects.some(e => e.kind === kind && e.deliveryId === deliveryId && ['confirmed','not_applicable'].includes(e.state));
    if (s.status.suspension || !(mode === 'pr' ? resolved('push') && resolved('pull_request') : resolved('issue_comment')) ||
      s.effects.some(e => ['running','unknown'].includes(e.state))) throw new OperationError(409, 'PUBLICATION_BLOCKED', 'The result comment or another effect is unresolved.');
    if (mode !== 'icr' && !resolved('local_commit')) {
      throw new OperationError(409,'COMMIT_PENDING','The local commit is unresolved.');
    }
    if (s.status.result === 'delivered') return;
    db.prepare("UPDATE attempts SET phase='finished',result='delivered',diagnostic=NULL,revision=revision+1,updated_at_ms=? WHERE id=?").run(Date.now(), id);
    attemptEvent(db, id, `attempt.${mode}-completed`);
  }).immediate());
}
export function publicationSummary(db: Database.Database, attemptId: string, deliveryId?: string): PublicationSummary {
  const a = readAttempt(db,attemptId); const selectedId = deliveryId ?? a.deliveryId;
  const d = selectedId ? readDelivery(db,selectedId) : null;
  if (d && d.attemptId !== attemptId) throw new OperationError(404,'DELIVERY_NOT_FOUND','The version does not belong to this attempt.');
  const historical = selectedId && selectedId !== a.deliveryId ? db.prepare<[string, string], { mode: 'icr' | 'commit' | 'pr' }>(`SELECT json_extract(integration_json,'$.source_mode') AS mode
    FROM rounds WHERE attempt_id=? AND json_extract(integration_json,'$.source_delivery_id')=?
    AND json_extract(integration_json,'$.source_result')='delivered' LIMIT 1`).get(attemptId,selectedId) : null;
  const mode = historical?.mode ?? authorizedMode(db,attemptId);
  const review = selectedId ? db.prepare<[string], { state: 'pending' | 'approved' | 'rejected' }>('SELECT state FROM reviews WHERE delivery_id=?').get(selectedId) : null;
  let reason: string | null = !d ? 'DELIVERY_NOT_CAPTURED' : d.id !== a.deliveryId || review?.state !== 'approved' ? 'VERSION_NOT_APPROVED' : null;
  if (a.result && !['delivered','interrupted'].includes(a.result)) reason = 'PUBLICATION_REVOKED';
  if (a.pendingQuestionId) reason = 'HUMAN_DECISION';
  if (a.suspension) reason = a.suspension;
  if (deletionOperation(db, a.projectId)) reason = 'PROJECT_DELETION_PENDING';
  // Count effects without loading their identities, receipts or authorization documents.
  const counts = db.prepare<[string, string | null], { confirmed: number; pending: number; unknown: number }>(`SELECT
    coalesce(sum(state='confirmed'),0) AS confirmed,
    coalesce(sum(state NOT IN ('confirmed','not_applicable')),0) AS pending,
    coalesce(sum(state IN ('unknown','running')),0) AS unknown
    FROM effects WHERE attempt_id=? AND (delivery_id IS ? OR delivery_id IS NULL)`).get(attemptId,selectedId)!;
  if (!reason && d) reason = publicationBlockReason(db, attemptId, d.id, true);
  if (!reason && counts.unknown > 0) reason = 'EFFECT_UNRESOLVED';
  const targetPending = Boolean(db.prepare("SELECT 1 FROM publication_target_selections WHERE attempt_id=? AND state IN ('accepted','running','unknown')").get(attemptId));
  if (!reason && targetPending) reason = 'TARGET_SELECTION_PENDING';
  if (!reason && db.prepare("SELECT operation_id FROM publication_requests WHERE attempt_id=? AND state IN ('accepted','running')").get(attemptId)) reason = 'PUBLICATION_BUSY';
  // A closed comment is never sent again, so this version cannot be completed here.
  if (!reason && db.prepare("SELECT operation_id FROM effects WHERE attempt_id=? AND delivery_id IS ? AND kind='issue_comment' AND state='not_applicable'").get(attemptId,selectedId)) reason = 'COMMENT_NOT_OBSERVED';
  const resolved = (kind: EffectView['kind']) => Boolean(db.prepare("SELECT operation_id FROM effects WHERE attempt_id=? AND delivery_id IS ? AND kind=? AND state IN ('confirmed','not_applicable')").get(attemptId,selectedId,kind));
  const completed = (a.result === 'delivered' || Boolean(historical)) && (mode === 'icr' ? resolved('issue_comment') : resolved('local_commit') && (mode === 'commit' ? resolved('issue_comment') : resolved('push') && resolved('pull_request')));
  const upgrades = completed && d && d.id === a.deliveryId && review?.state === 'approved' && a.phase === 'finished' ? upgradeSummaries(db,attemptId,d.id,reason) : [];
  if (!reason && completed && counts.pending === 0) reason = 'MODE_COMPLETED';
  const commitRow = db.prepare<[string,string | null],{ state: EffectView['state']; sha: string | null; reason: string | null; operationId: string; branchRef: string | null; taskType: string | null; taskDescription: string | null }>(`SELECT e.state,json_extract(e.receipt_json,'$.id') AS sha,e.reason,e.operation_id AS operationId,
    t.branch_ref AS branchRef,t.task_type AS taskType,t.task_description AS taskDescription FROM effects e LEFT JOIN delivery_targets t
      ON t.operation_id=json_extract(e.expected_identity_json,'$.targetOperationId')
    WHERE e.attempt_id=? AND e.delivery_id IS ? AND e.kind='local_commit' ORDER BY e.rowid DESC LIMIT 1`).get(attemptId,selectedId);
  const split = commitRow ? splitEffectReason(commitRow.reason) : null;
  const commit = commitRow && split ? { ...commitRow,reason: split.code,...(split.blocked ? { blocked: split.blocked } : {}) } : undefined;
  const remote = (kind: 'push' | 'pull_request') => { const row = db.prepare<[string,string | null,string],Parameters<typeof effectView>[0]>('SELECT * FROM effects WHERE attempt_id=? AND delivery_id IS ? AND kind=?').get(attemptId,selectedId,kind); const e = row ? effectView(row) : null; return { state: e?.state ?? 'not_requested' as const,receipt: e?.receipt ?? null,reason: e?.reason ?? null }; };
  return { mode, reviewState: review?.state ?? null, upgrades, push: remote('push'), pullRequest: remote('pull_request'),
    commit: commit ?? { state: 'not_requested', sha: null, reason: mode === 'icr' ? 'MODE_ICR' : 'COMMIT_NOT_STARTED', operationId: null,branchRef: null,taskType: null,taskDescription: null },
    localState: completed && (a.deliveryId === selectedId || Boolean(historical)) ? 'completed' : 'pending',
    confirmedEffects: counts.confirmed,
    pendingEffects: counts.pending,
    unknownEffects: counts.unknown,
    completeCapability: reason ? { available: false, reason_code: reason } : { available: true },
    reconcileCapability: reason === 'PROJECT_DELETION_PENDING' ? { available: false, reason_code: reason }
      : counts.unknown > 0 || targetPending ? { available: true } : { available: false, reason_code: 'NO_UNRESOLVED_EFFECTS' } };
}
