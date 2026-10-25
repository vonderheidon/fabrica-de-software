import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { OperationId, ShutdownCommand, ShutdownQuery, type ShutdownView } from '#contracts';
import { digest, eventCursor, guarded } from './configuration-reads.js';
import { readSettings } from './settings.js';
import { OperationError, type StoredOperation } from './operations.js';
import { StorageError } from './errors.js';
import { shutdownWork } from './shutdown-work.js';

const integer = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const journal = Type.Object({ revision: integer, eventCursor: Type.String({ pattern: '^[0-9]+$' }), shutdown: Type.Object({
  formatVersion: Type.Literal(1), action: Type.Union(['pause_starts','close_when_idle','resume_starts','restore','commit'].map(action => Type.Literal(action))),
  generation: integer, controlRevision: integer, startsPaused: Type.Boolean(), controllerInstanceId: OperationId,
  drainOperationId: Type.Union([OperationId, Type.Null()]), closingCommitted: Type.Boolean(),
  revokedDrainOperationId: Type.Optional(OperationId), revokedDrainGeneration: Type.Optional(integer),
}, { additionalProperties: false }) }, { additionalProperties: false });
type Journal = Static<typeof journal>;
type Control = Journal['shutdown'] & { operationId: string };
export interface ShutdownRequest { operationId: string; expectedRevision: string | undefined; body: ShutdownCommand }
export interface ShutdownToken { operationId: string; generation: number; instanceId: string }
const kinds = "('shutdown.pause_starts','shutdown.close_when_idle','shutdown.resume_starts','shutdown.restore','shutdown.commit')";

function decode(value: string | null): Journal {
  let parsed: unknown;
  try { parsed = JSON.parse(value ?? 'null'); } catch { throw new StorageError('OPERATION_DATA_INVALID'); }
  if (!Value.Check(journal, parsed)) throw new StorageError('OPERATION_DATA_INVALID');
  const state = parsed.shutdown;
  if ((state.revokedDrainOperationId === undefined) !== (state.revokedDrainGeneration === undefined) ||
    state.revokedDrainGeneration !== undefined && state.revokedDrainGeneration >= state.generation ||
    state.action === 'resume_starts' && state.startsPaused ||
    ['pause_starts','close_when_idle','commit'].includes(state.action) && !state.startsPaused ||
    state.closingCommitted !== (state.action === 'commit') ||
    (state.drainOperationId !== null) !== ['close_when_idle','commit'].includes(state.action)) throw new StorageError('OPERATION_DATA_INVALID');
  return parsed;
}
function control(db: Database.Database): Control | null {
  const row = db.prepare(`SELECT operation_id,receipt_json FROM operation_requests WHERE installation_id=? AND operation_kind IN ${kinds}
    ORDER BY json_extract(receipt_json,'$.shutdown.generation') DESC,json_extract(receipt_json,'$.shutdown.controlRevision') DESC LIMIT 1`)
    .get(readSettings(db).installation_id) as { operation_id: string; receipt_json: string | null } | undefined;
  return row ? { ...decode(row.receipt_json).shutdown, operationId: row.operation_id } : null;
}
export function assertStartsAllowed(db: Database.Database): void {
  const state = control(db);
  if (state?.startsPaused || state?.closingCommitted) throw new OperationError(409, 'SHUTDOWN_STARTS_PAUSED', 'Novos inícios estão pausados pelo encerramento.', {
    recovery: 'Consulte o encerramento e use Retomar novos inícios quando disponível.', affected_requirements: ['RF-81'],
  });
}
export function shutdownETag(view: ShutdownView): string { return `"shutdown:${view.generation}:${view.revision}"`; }
function unavailable(code: string, reason: string) { return { available: false, reason_code: code, reason, recovery: 'Consulte o estado atual do encerramento.' }; }
export function readShutdown(db: Database.Database, instanceId: string, query: ShutdownQuery = {}): ShutdownView {
  if (!Value.Check(ShutdownQuery, query)) throw new OperationError(400, 'SHUTDOWN_QUERY_INVALID', 'A consulta de encerramento é inválida.');
  const settings = readSettings(db), current = control(db), work = shutdownWork(db);
  const fingerprint = digest({ control: current, revision: settings.revision, work });
  let offset = 0;
  if (query.cursor) {
    const match = /^([0-9]+):([a-f0-9]{64})$/.exec(query.cursor);
    if (!match || match[2] !== fingerprint || !Number.isSafeInteger(Number(match[1]))) throw new OperationError(409, 'SHUTDOWN_CURSOR_STALE', 'Os trabalhos mudaram. Consulte a primeira página novamente.');
    offset = Number(match[1]);
    if (offset > work.length) throw new OperationError(400, 'SHUTDOWN_QUERY_INVALID', 'O cursor não pertence a esta consulta.');
  }
  const limit = Number(query.limit ?? 100), paused = current?.startsPaused ?? false;
  const closing = current?.closingCommitted === true && current.controllerInstanceId === instanceId;
  const draining = current?.action === 'close_when_idle' && current.controllerInstanceId === instanceId;
  const blocked = work.some(row => ['unknown','uncertain','partial','pending','blocked','reconfirmation_required','delivery_unknown','TRACKING_LOST'].includes(row.state));
  return { revision: settings.revision, generation: current?.generation ?? 1, starts_paused: paused, automation_enabled: settings.automation_enabled,
    closing_committed: closing, state: closing ? 'closing' : draining ? blocked ? 'blocked' : work.length ? 'draining' : 'ready_to_close' : paused ? 'paused' : 'running',
    active_work: work.slice(offset, offset + limit), remaining_work_count: work.length, has_more: offset + limit < work.length,
    next_cursor: offset + limit < work.length ? `${offset + limit}:${fingerprint}` : null,
    operation_id: current?.drainOperationId ?? current?.operationId ?? null,
    pause_capability: closing ? unavailable('SHUTDOWN_CLOSING', 'O fechamento já foi comprometido.') : paused ? unavailable('SHUTDOWN_ALREADY_PAUSED', 'Novos inícios já estão pausados.') : { available: true },
    close_when_idle_capability: closing ? unavailable('SHUTDOWN_CLOSING', 'O fechamento já foi comprometido.') : draining ? unavailable('SHUTDOWN_ALREADY_DRAINING', 'O encerramento já está em acompanhamento.') : { available: true },
    resume_starts_capability: closing ? unavailable('SHUTDOWN_CLOSING', 'O fechamento já foi comprometido.') :
      !paused ? unavailable('SHUTDOWN_NOT_PAUSED', 'Novos inícios já estão liberados.') :
      current?.controllerInstanceId !== instanceId ? unavailable('SHUTDOWN_INSTANCE_CHANGED', 'O controle pertence a outra instância.') : { available: true }, event_cursor: eventCursor(db) };
}
function append(db: Database.Database, command: { operationId: string; expectedRevision?: string | undefined; requestHash: string }, state: Journal['shutdown']): void {
  const settings = readSettings(db);
  const changed = db.prepare("UPDATE factory_settings SET automation_enabled=0,revision=revision+1,updated_at_ms=? WHERE id='local' AND revision=?").run(Date.now(), settings.revision);
  if (changed.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'A configuração mudou. Consulte o encerramento novamente.');
  const seq = db.prepare('SELECT coalesce(max(seq),0)+1 AS seq FROM events').get() as { seq: number };
  const receipt: Journal = { revision: settings.revision + 1, eventCursor: String(seq.seq), shutdown: state };
  db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json)
    VALUES (?,?,?,?,'controller','local',?,?,?)`).run(command.operationId, settings.installation_id, settings.account_id, `shutdown.${state.action}`,
      command.requestHash, command.expectedRevision ? JSON.stringify({ etag: command.expectedRevision }) : null, JSON.stringify(receipt));
  db.prepare(`INSERT INTO events(seq,entity_type,entity_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms)
    VALUES (?,'controller','local',?,?,?,'{}',?)`).run(seq.seq, command.operationId, `shutdown.${state.action}`, receipt.revision, Date.now());
}
export function initializeShutdown(db: Database.Database, instanceId: string): void {
  guarded(() => db.transaction(() => {
    const previous = control(db);
    if (!previous || previous.controllerInstanceId === instanceId) return;
    append(db, { operationId: randomUUID(), requestHash: digest({ restore: instanceId, previous: previous.operationId }) }, {
      formatVersion: 1, action: 'restore', generation: previous.generation + 1, controlRevision: previous.controlRevision + 1,
      startsPaused: previous.startsPaused, controllerInstanceId: instanceId, drainOperationId: null, closingCommitted: false,
      ...(previous.revokedDrainOperationId ? { revokedDrainOperationId: previous.revokedDrainOperationId, revokedDrainGeneration: previous.revokedDrainGeneration! } : {}),
    });
  }).immediate());
}
export function acceptShutdown(db: Database.Database, instanceId: string, command: ShutdownRequest): StoredOperation {
  if (!Value.Check(OperationId, command.operationId) || !Value.Check(ShutdownCommand, command.body)) throw new OperationError(400, 'SHUTDOWN_COMMAND_INVALID', 'O comando de encerramento é inválido.');
  return guarded(() => db.transaction(() => {
    const settings = readSettings(db), hash = digest({ body: command.body, expectedRevision: command.expectedRevision ?? null });
    const previous = db.prepare('SELECT installation_id,account_id,operation_kind,request_hash FROM operation_requests WHERE operation_id=?').get(command.operationId) as
      { installation_id: string; account_id: string | null; operation_kind: string; request_hash: string } | undefined;
    if (previous) {
      if (previous.installation_id !== settings.installation_id || previous.account_id !== settings.account_id || previous.operation_kind !== `shutdown.${command.body.action}` || previous.request_hash !== hash) throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'A chave pertence a outro pedido.');
      return shutdownOperation(db, instanceId, command.operationId)!;
    }
    if (command.expectedRevision === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match é obrigatório.');
    const view = readShutdown(db, instanceId);
    if (view.closing_committed) throw new OperationError(409, 'SHUTDOWN_CLOSING', 'O fechamento já foi comprometido.', { recovery: 'Aguarde o fechamento e reabra o controlador para consultar o estado.' });
    if (shutdownETag(view) !== command.expectedRevision) throw new OperationError(412, 'REVISION_CONFLICT', 'O encerramento mudou. Consulte a revisão atual.');
    const state = control(db);
    if (command.body.action === 'resume_starts' && (!view.starts_paused || state?.controllerInstanceId !== instanceId)) {
      throw new OperationError(409, !view.starts_paused ? 'SHUTDOWN_NOT_PAUSED' : 'SHUTDOWN_INSTANCE_CHANGED', 'Não há pausa desta instância disponível para retomada.', { recovery: 'Consulte o estado atual do encerramento antes de solicitar outra ação.' });
    }
    if (command.body.action === 'pause_starts' && view.starts_paused) throw new OperationError(409, 'SHUTDOWN_ALREADY_PAUSED', 'Novos inícios já estão pausados; a drenagem vigente permanece preservada.');
    if (command.body.action === 'close_when_idle' && ['draining','blocked','ready_to_close'].includes(view.state)) throw new OperationError(409, 'SHUTDOWN_ALREADY_DRAINING', 'Consulte a operação de encerramento já aceita.');
    append(db, { ...command, requestHash: hash }, { formatVersion: 1, action: command.body.action, generation: (state?.generation ?? 1) + 1,
      controlRevision: (state?.controlRevision ?? 0) + 1, startsPaused: command.body.action !== 'resume_starts', controllerInstanceId: instanceId,
      drainOperationId: command.body.action === 'close_when_idle' ? command.operationId : null, closingCommitted: false,
      ...(command.body.action === 'resume_starts' && state?.drainOperationId ? { revokedDrainOperationId: state.drainOperationId, revokedDrainGeneration: state.generation } : {}) });
    return shutdownOperation(db, instanceId, command.operationId)!;
  }).immediate());
}
export function shutdownOperation(db: Database.Database, instanceId: string, operationId: string): StoredOperation | null {
  const row = db.prepare(`SELECT receipt_json,operation_kind FROM operation_requests WHERE operation_id=? AND operation_kind IN ${kinds}`).get(operationId) as { receipt_json: string; operation_kind: string } | undefined;
  if (!row) return null;
  const receipt = decode(row.receipt_json), current = control(db), view = readShutdown(db, instanceId || current?.controllerInstanceId || '');
  const revoked = row.operation_kind === 'shutdown.close_when_idle' && current?.drainOperationId !== operationId;
  const committed = current?.drainOperationId === operationId && current.closingCommitted;
  return { operation_id: operationId, kind: row.operation_kind, resource: { type: 'controller', id: 'local' },
    state: row.operation_kind === 'shutdown.close_when_idle' && !revoked && !committed ? 'running' : 'succeeded',
    receipt: { revision: receipt.revision, event_cursor: receipt.eventCursor },
    progress: { kind: 'shutdown', state: revoked ? 'revoked' : committed ? 'closing' : view.state, cause: null, recovery: null,
      shutdown: view, target_selection: null, decision: null, transition_step: null } };
}
export function commitShutdown(db: Database.Database, instanceId: string, token: ShutdownToken): boolean {
  return guarded(() => db.transaction(() => {
    const current = control(db);
    if (!current || current.action !== 'close_when_idle' || current.controllerInstanceId !== instanceId || token.instanceId !== instanceId ||
      current.generation !== token.generation || current.drainOperationId !== token.operationId || current.closingCommitted || shutdownWork(db).length > 0) return false;
    const { operationId: _operationId, ...state } = current;
    append(db, { operationId: randomUUID(), requestHash: digest(token) }, { ...state, action: 'commit', controlRevision: current.controlRevision + 1, closingCommitted: true });
    return true;
  }).immediate());
}
