import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { ClaimNotification, RecordNotificationReceipt, OperationId, type NotificationClaim, type NotificationReceipt } from '#contracts';
import { readSettings } from './settings.js';
import { digest } from './configuration-reads.js';
import { serializeOperationReceipt, readOperationReceipt } from './common-json.js';
import { OperationError } from './operations.js';
import { assertProjectAvailable } from './project-deletion-barrier.js';

export interface NotificationCommand<T> { operationId: string; expectedRevision: string | undefined; body: T }
interface Source { seq: number; attempt_id: string; project_id: string; event_kind: NotificationClaim['notification']['event_kind'] | null; eligible: number | null }
interface Dispatch { installation_id: string; consumer_id: string; surface: 'browser_host'; event_seq: number; dispatch_id: string; state: NotificationClaim['state']; revision: number; created_at_ms: number }
const missing = () => new OperationError(404, 'NOTIFICATION_NOT_FOUND', 'A notificação não está disponível neste contexto.');
export const notificationETag = (id: string, revision: number): string => `"${id}:${revision}"`;

function source(db: Database.Database, seq: string): Source {
  const settings = readSettings(db);
  if (BigInt(seq) > BigInt(Number.MAX_SAFE_INTEGER)) throw missing();
  const row = db.prepare('SELECT * FROM notification_events WHERE seq=? AND installation_id=? AND account_id IS ?')
    .get(Number(seq), settings.installation_id, settings.account_id) as Source | undefined;
  if (!row || !row.event_kind) throw missing();
  return row;
}
function dispatch(db: Database.Database, id: string): { row: Dispatch; event: Source } {
  const settings = readSettings(db);
  const row = db.prepare('SELECT * FROM notification_dispatches WHERE dispatch_id=? AND installation_id=?').get(id, settings.installation_id) as Dispatch | undefined;
  if (!row) throw missing();
  return { row, event: source(db, String(row.event_seq)) };
}
function hash<T>(command: NotificationCommand<T>, kind: string): string {
  if (!Value.Check(OperationId, command.operationId) || command.expectedRevision !== undefined && (typeof command.expectedRevision !== 'string' || command.expectedRevision.length > 256)) {
    throw new OperationError(400, 'NOTIFICATION_COMMAND_INVALID', 'O comando de notificação é inválido.');
  }
  return digest({ kind, body: command.body, expectedRevision: command.expectedRevision ?? null });
}
function prior(db: Database.Database, operationId: string, kind: string, requestHash: string) {
  const settings = readSettings(db);
  const row = db.prepare('SELECT * FROM operation_requests WHERE operation_id=?').get(operationId) as {
    installation_id: string; account_id: string | null; operation_kind: string; request_hash: string; resource_type: string; resource_id: string; receipt_json: string | null;
  } | undefined;
  if (!row) return null;
  if (row.installation_id !== settings.installation_id || row.account_id !== settings.account_id || row.operation_kind !== kind ||
    row.request_hash !== requestHash || row.resource_type !== 'notification' || row.receipt_json === null) {
    throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'A operação não corresponde ao comando aceito.');
  }
  return { ...dispatch(db, row.resource_id), receipt: readOperationReceipt(JSON.parse(row.receipt_json) as unknown) };
}
function recordOperation<T>(db: Database.Database, command: NotificationCommand<T>, kind: string, requestHash: string, row: Dispatch): void {
  const settings = readSettings(db);
  db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json)
    VALUES (?,?,?,?,'notification',?,?,?,?)`).run(command.operationId, settings.installation_id, settings.account_id, kind, row.dispatch_id,
      requestHash, command.expectedRevision === undefined ? null : JSON.stringify({ etag: command.expectedRevision }),
      serializeOperationReceipt({ revision: row.revision, event_cursor: String(row.event_seq) }));
}
function claimView(row: Dispatch, event: Source, operationId: string, sendAllowed: boolean): NotificationClaim {
  if (!Value.Check(OperationId, event.attempt_id)) throw missing();
  return { dispatch_id: row.dispatch_id, revision: row.revision, consumer_id: row.consumer_id, surface: row.surface,
    event_seq: String(row.event_seq), state: row.state, send_allowed: sendAllowed,
    notification: { title: 'Nova fábrica de software', event_kind: event.event_kind!,
      target_hash: `#principal/tentativas?attemptId=${event.attempt_id}&dialog=detail` }, operation_id: operationId };
}
export function claimNotification(db: Database.Database, command: NotificationCommand<ClaimNotification>): NotificationClaim {
  if (!Value.Check(ClaimNotification, command.body)) throw new OperationError(400, 'NOTIFICATION_COMMAND_INVALID', 'A reserva de notificação é inválida.');
  const requestHash = hash(command, 'notification.claim');
  return db.transaction(() => {
    const recovered = prior(db, command.operationId, 'notification.claim', requestHash);
    if (recovered) return claimView(recovered.row, recovered.event, command.operationId, false);
    const settings = readSettings(db); const body = command.body; const event = source(db, body.event_seq);
    assertProjectAvailable(db, event.project_id);
    let row = db.prepare('SELECT * FROM notification_dispatches WHERE installation_id=? AND consumer_id=? AND surface=? AND event_seq=?')
      .get(settings.installation_id, body.consumer_id, body.surface, event.seq) as Dispatch | undefined;
    const created = row === undefined;
    if (!row) {
      const expiredQuestion = event.event_kind === 'question_pending' && Boolean(db.prepare(`SELECT 1 FROM execution_questions q JOIN passages p ON p.id=q.passage_id
        JOIN events e ON e.seq=? WHERE q.attempt_id=e.attempt_id AND p.round_number=e.context_round AND p.role=e.context_role
          AND q.state='pending' AND q.ttl_ms IS NOT NULL AND q.created_at_ms+q.ttl_ms<=?`).get(event.seq, Date.now()));
      if (event.eligible !== 1 || expiredQuestion) throw new OperationError(409, 'NOTIFICATION_NOT_ELIGIBLE', 'O evento não tem uma notificação pendente elegível.');
      const now = Date.now();
      row = { installation_id: settings.installation_id, consumer_id: body.consumer_id, surface: body.surface, event_seq: event.seq,
        dispatch_id: randomUUID(), state: 'reserved', revision: 1, created_at_ms: now };
      db.prepare(`INSERT INTO notification_dispatches(installation_id,consumer_id,surface,event_seq,dispatch_id,state,created_at_ms,updated_at_ms)
        VALUES (?,?,?,?,?,'reserved',?,?)`).run(row.installation_id, row.consumer_id, row.surface, row.event_seq, row.dispatch_id, now, now);
    }
    recordOperation(db, command, 'notification.claim', requestHash, row);
    return claimView(row, event, command.operationId, created);
  }).immediate();
}
export function recordNotificationReceipt(db: Database.Database, command: NotificationCommand<RecordNotificationReceipt>): NotificationReceipt {
  if (!Value.Check(RecordNotificationReceipt, command.body)) throw new OperationError(400, 'NOTIFICATION_COMMAND_INVALID', 'O recibo de notificação é inválido.');
  const requestHash = hash(command, 'notification.receipt');
  return db.transaction(() => {
    const recovered = prior(db, command.operationId, 'notification.receipt', requestHash);
    if (recovered) return { dispatch_id: recovered.row.dispatch_id, revision: recovered.receipt.revision!, state: command.body.state, operation_id: command.operationId };
    const body = command.body; const { row, event } = dispatch(db, body.dispatch_id);
    assertProjectAvailable(db, event.project_id);
    if (command.expectedRevision === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match é obrigatório para registrar o recibo.');
    if (body.dispatch_revision !== row.revision || command.expectedRevision !== notificationETag(row.dispatch_id, row.revision)) {
      throw new OperationError(412, 'REVISION_CONFLICT', 'A notificação mudou. Consulte a reserva antes de registrar o resultado.');
    }
    if (row.state !== 'reserved' && !(row.state === 'uncertain' && body.state !== 'uncertain')) {
      throw new OperationError(409, 'NOTIFICATION_TRANSITION_INVALID', 'O estado observado não permite este recibo.');
    }
    const now = Date.now();
    // Free-form host errors may contain event content or credentials. Persist a fixed code only.
    const reason = { confirmed: 'SURFACE_CONFIRMED', uncertain: 'SURFACE_UNCERTAIN', unavailable: 'SURFACE_UNAVAILABLE' }[body.state];
    db.prepare(`UPDATE notification_dispatches SET state=?,revision=revision+1,updated_at_ms=max(updated_at_ms,?),dispatched_at_ms=?,reason=?
      WHERE dispatch_id=? AND revision=?`).run(body.state, now, body.state === 'confirmed' ? Math.max(now, row.created_at_ms) : null, reason, row.dispatch_id, row.revision);
    const updated = dispatch(db, row.dispatch_id).row;
    recordOperation(db, command, 'notification.receipt', requestHash, updated);
    return { dispatch_id: row.dispatch_id, revision: updated.revision, state: body.state, operation_id: command.operationId };
  }).immediate();
}
export function interruptNotificationDispatches(db: Database.Database): void {
  db.prepare("UPDATE notification_dispatches SET state='uncertain',revision=revision+1,updated_at_ms=max(updated_at_ms,?),reason='DISPATCH_INTERRUPTED' WHERE state='reserved'").run(Date.now());
}
