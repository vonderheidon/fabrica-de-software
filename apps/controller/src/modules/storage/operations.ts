import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { OperationId, OperationReceipt, TimeDefaults, type OperationView, type ErrorResponse } from '#contracts';
import { readSettings } from './settings.js';
import { StorageError } from './errors.js';

export class OperationError extends Error {
  constructor(readonly statusCode: 400 | 404 | 409 | 412 | 428 | 503, readonly code: string, message: string) { super(message); }
}

export interface SaveTimeDefaults {
  readonly operationId: string;
  readonly expectedRevision: string | undefined;
  readonly timeDefaults: TimeDefaults;
}
export type StoredOperation = Omit<OperationView, 'requestId' | 'error'> & { error?: Omit<ErrorResponse,'requestId'> };

interface OperationRow {
  operation_kind: string; resource_type: string; resource_id: string; request_hash: string;
  installation_id: string; account_id: string | null; receipt_json: string | null;
}

// Canonical JSON is deliberately private; only validated, bounded DTOs reach this function.
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}

export function settingsETag(installationId: string, revision: number): string {
  return `"${createHash('sha256').update(`${installationId}:settings:${revision}`).digest('hex')}"`;
}

function rowFor(db: Database.Database, operationId: string) {
  return db.prepare<[string], OperationRow>('SELECT * FROM operation_requests WHERE operation_id = ?').get(operationId);
}

export function readOperation(db: Database.Database, operationId: string): StoredOperation | null {
  if (!Value.Check(OperationId, operationId)) throw new OperationError(400, 'OPERATION_ID_INVALID', 'Operation ID must be a UUID.');
  const settings = readSettings(db);
  const row = rowFor(db, operationId);
  if (!row || row.installation_id !== settings.installationId || row.account_id !== settings.accountId) return null;
  // Each domain command adds its own projection here. Unknown kinds never imply success.
  const event = db.prepare<[string], { entity_revision: number; seq: number; entity_type: string; entity_id: string }>(
    'SELECT entity_revision, seq, entity_type, entity_id FROM events WHERE operation_id = ? ORDER BY seq LIMIT 1',
  ).get(operationId);
  const receipt: unknown = row.receipt_json === null ? undefined : JSON.parse(row.receipt_json);
  if (receipt !== undefined && !Value.Check(OperationReceipt, receipt)) throw new StorageError('OPERATION_DATA_INVALID');
  if (row.operation_kind === 'diagnostics.check' && row.resource_type === 'diagnostic') {
    const run = db.prepare<[string], { state: StoredOperation['state'] }>('SELECT state FROM diagnostic_runs WHERE operation_id=?').get(operationId);
    if (!run || !receipt || !event || event.entity_type !== 'diagnostic' || event.entity_id !== operationId ||
      row.resource_id !== operationId || receipt.eventCursor !== String(event.seq) || receipt.revision !== 1) throw new StorageError('OPERATION_DATA_INVALID');
    return { operationId, kind: row.operation_kind, resource: { type: 'diagnostic', id: operationId }, state: run.state, receipt,
      ...(['failed', 'unknown'].includes(run.state) ? { error: { code: run.state === 'unknown' ? 'DIAGNOSTIC_INTERRUPTED' : 'DIAGNOSTIC_CONTEXT_CHANGED',
        message: 'Inspect the contextual diagnosis before requesting a new check.', recovery: 'Read /diagnostics for the original context.', affectedRequirements: ['RF-88'] } } : {}) };
  }
  if (row.operation_kind === 'queue.update' && row.resource_type === 'queue') {
    if (!receipt || !event || event.entity_type !== 'queue' || event.entity_id !== 'local' || receipt.revision !== event.entity_revision || receipt.eventCursor !== String(event.seq)) throw new StorageError('OPERATION_DATA_INVALID');
    return { operationId, kind: row.operation_kind, resource: { type: 'queue', id: 'local' }, state: 'succeeded', receipt };
  }
  if (row.operation_kind === 'scaffold.reconcile' && row.resource_type === 'creation') {
    const request = db.prepare<[string,string],{ state: StoredOperation['state']; diagnostic: string | null }>('SELECT state,diagnostic FROM creation_reconciliations WHERE operation_id=? AND creation_id=?').get(operationId,row.resource_id);
    if (!request || !receipt || !event || event.entity_type !== 'creation' || event.entity_id !== row.resource_id || receipt.revision !== event.entity_revision || receipt.eventCursor !== String(event.seq)) throw new StorageError('OPERATION_DATA_INVALID');
    return { operationId,kind: row.operation_kind,resource: { type: 'creation',id: row.resource_id },state: request.state,receipt,
      ...(request.diagnostic ? { error: { code: request.diagnostic,message: 'Inspect the remaining creation effects.',operationId } } : {}) };
  }
  if (row.operation_kind === 'scaffold.create' && row.resource_type === 'creation') {
    const creation = db.prepare<[string, string], { state: string; diagnostic: string | null }>('SELECT state,diagnostic FROM project_creations WHERE id=? AND operation_id=?').get(row.resource_id,operationId);
    if (!creation || !receipt || !event || event.entity_type !== 'creation' || event.entity_id !== row.resource_id || receipt.revision !== event.entity_revision || receipt.eventCursor !== String(event.seq)) throw new StorageError('OPERATION_DATA_INVALID');
    const state = creation.state === 'completed' ? 'succeeded' : creation.state === 'partial' ? 'unknown' : creation.state === 'failed' ? 'failed' : creation.state === 'pending' ? 'accepted' : 'running';
    return { operationId, kind: row.operation_kind, resource: { type: 'creation', id: row.resource_id }, state, receipt,
      ...(creation.diagnostic ? { error: { code: creation.diagnostic, message: 'Inspect the preserved local creation before any further action.', operationId } } : {}) };
  }
  if (['publication.complete','publication.reconcile','publication.authorize-upgrade','attempt.revalidate','effect.execute'].includes(row.operation_kind)) {
    if (!receipt || !event || event.entity_id !== row.resource_id || event.entity_type !== row.resource_type || receipt.revision !== event.entity_revision || receipt.eventCursor !== String(event.seq)) throw new StorageError('OPERATION_DATA_INVALID');
    let state: StoredOperation['state'];
    let diagnostic: string | null = null;
    if (row.operation_kind === 'effect.execute') {
      const effect = db.prepare<[string], { state: string; reason: string | null }>('SELECT state,reason FROM effects WHERE operation_id=?').get(operationId);
      if (!effect) throw new StorageError('OPERATION_DATA_INVALID');
      diagnostic = effect.reason;
      state = effect.state === 'confirmed' || effect.state === 'not_applicable' ? 'succeeded' : effect.state === 'failed_known' ? 'failed' : effect.state === 'unknown' ? 'unknown' : effect.state === 'running' ? 'running' : 'accepted';
    } else {
      const request = db.prepare<[string, string], { state: StoredOperation['state']; diagnostic: string | null }>('SELECT state,diagnostic FROM publication_requests WHERE operation_id=? AND attempt_id=?').get(operationId, row.resource_id);
      if (!request) throw new StorageError('OPERATION_DATA_INVALID'); state = request.state; diagnostic = request.diagnostic;
    }
    if (diagnostic !== null && !/^[A-Z0-9_]{1,128}$/.test(diagnostic)) throw new StorageError('OPERATION_DATA_INVALID');
    return { operationId, kind: row.operation_kind, resource: { type: row.resource_type, id: row.resource_id }, state, receipt,
      ...(['failed','unknown'].includes(state) ? { error: { code: diagnostic ?? 'EFFECT_UNRESOLVED',message: 'Publication or projection remains pending. Inspect the identified effects and revalidate current authority.',operationId } } : {}) };
  }
  if (['attempt.cancel', 'resource.remove', 'folder.open', 'interaction.open'].includes(row.operation_kind)) {
    const valid = receipt && event?.entity_id === row.resource_id && event.entity_type === row.resource_type &&
      receipt.revision === event.entity_revision && receipt.eventCursor === String(event.seq);
    if (!valid) throw new StorageError('OPERATION_DATA_INVALID');
    let state: StoredOperation['state'] = 'unknown';
    if (row.operation_kind === 'attempt.cancel') {
      const request = db.prepare('SELECT operation_id FROM cancellation_requests WHERE operation_id=? AND attempt_id=?').get(operationId, row.resource_id);
      if (request) state = 'succeeded'; // Revocation committed, not physical cleanup.
    } else if (row.operation_kind === 'resource.remove') {
      const request = db.prepare<[string, string], { state: string }>('SELECT state FROM resource_removals WHERE operation_id=? AND resource_id=?').get(operationId, row.resource_id);
      if (request) state = request.state === 'removed' ? 'succeeded' : request.state === 'failed' ? 'failed' : request.state === 'accepted' ? 'accepted' : 'unknown';
    } else {
      const request = db.prepare<[string, string, string], { state: string }>('SELECT state FROM native_open_requests WHERE operation_id=? AND resource_id=? AND kind=?').get(operationId, row.resource_id, row.operation_kind);
      if (request) state = request.state === 'requested' ? 'succeeded' : request.state === 'accepted' ? 'accepted' : 'unknown';
    }
    return { operationId, kind: row.operation_kind, resource: { type: row.resource_type, id: row.resource_id }, state, receipt };
  }
  if (row.operation_kind === 'question.answer' && row.resource_type === 'question') {
    const q = db.prepare<[string, string], { state: string }>('SELECT state FROM execution_questions WHERE id=? AND answer_operation_id=?').get(row.resource_id, operationId);
    const valid = q && receipt && event?.entity_type === 'question' && event.entity_id === row.resource_id && receipt.revision === event.entity_revision && receipt.eventCursor === String(event.seq);
    if (!valid) throw new StorageError('OPERATION_DATA_INVALID');
    return { operationId, kind: row.operation_kind, resource: { type: 'question', id: row.resource_id }, state:
      q.state === 'delivered' ? 'succeeded' : q.state === 'delivery_unknown' ? 'unknown' : ['expired', 'cancelled'].includes(q.state) ? 'failed' : q.state === 'sending' ? 'running' : 'accepted', ...(receipt ? { receipt } : {}) };
  }
  if (row.operation_kind === 'capture.retry' && row.resource_type === 'delivery') {
    const run = db.prepare<[string, string], { state: string }>('SELECT state FROM capture_runs WHERE operation_id=? AND delivery_id=?').get(operationId, row.resource_id);
    const valid = run && receipt && event?.entity_type === 'delivery' && event.entity_id === row.resource_id && receipt.revision === event.entity_revision && receipt.eventCursor === String(event.seq);
    return { operationId, kind: row.operation_kind, resource: { type: 'delivery', id: row.resource_id },
      state: !valid ? 'unknown' : run.state === 'captured' ? 'succeeded' : run.state === 'failed' ? 'failed' : 'running', ...(receipt ? { receipt } : {}) };
  }
  if (row.operation_kind === 'attempt.start' && row.resource_type === 'attempt') {
    const attempt = db.prepare<[string, string], { phase: string; result: string | null }>('SELECT phase,result FROM attempts WHERE id=? AND operation_id=?').get(row.resource_id, operationId);
    const accepted = Boolean(attempt && receipt && event?.entity_type === 'attempt' && event.entity_id === row.resource_id &&
      receipt.revision === event.entity_revision && receipt.eventCursor === String(event.seq));
    return { operationId, kind: row.operation_kind, resource: { type: row.resource_type, id: row.resource_id },
      state: !accepted ? 'unknown' : attempt?.result === 'delivered' ? 'succeeded' : attempt?.result ? 'failed' : attempt?.phase === 'preparing' ? 'accepted' : 'running', ...(receipt ? { receipt } : {}) };
  }
  const eventKind = db.prepare<[string], { event_type: string }>('SELECT event_type FROM events WHERE operation_id = ?').get(operationId)?.event_type;
  const kinds: Readonly<Record<string, string>> = { 'preparation.create': 'preparation.created', 'preparation.update': 'preparation.updated', 'settings.time-defaults.update': 'settings.time-defaults.updated', 'settings.update': 'settings.updated', 'project.register': 'project.registered', 'project.configuration.update': 'project.configuration.updated' };
  const domainExists = row.resource_type === 'project'
    ? Boolean(db.prepare('SELECT id FROM project_revisions WHERE project_id = ? AND revision_number = ?').get(row.resource_id, receipt?.revision ?? 0))
    : row.resource_type === 'preparation'
      ? Boolean(db.prepare('SELECT preparation_id FROM preparation_revisions WHERE preparation_id = ? AND revision = ?').get(row.resource_id, receipt?.revision ?? 0))
      : row.resource_type === 'settings' && row.resource_id === 'local' && settings.revision >= (receipt?.revision ?? Infinity);
  const succeeded = kinds[row.operation_kind] !== undefined && kinds[row.operation_kind] === eventKind
    && event && event.entity_type === row.resource_type && event.entity_id === row.resource_id && domainExists
    && receipt?.revision === event.entity_revision && receipt.eventCursor === String(event.seq);
  return {
    operationId, kind: row.operation_kind, resource: { type: row.resource_type, id: row.resource_id },
    state: succeeded ? 'succeeded' : 'unknown', ...(receipt ? { receipt } : {}),
  };
}

/** Concrete atomic command over the existing singleton. No public transaction/SQL callback or job engine. */
export function saveTimeDefaults(db: Database.Database, input: SaveTimeDefaults): StoredOperation {
  if (!Value.Check(OperationId, input.operationId) || !Value.Check(TimeDefaults, input.timeDefaults)
    || (input.expectedRevision !== undefined && (typeof input.expectedRevision !== 'string' || input.expectedRevision.length > 256))) {
    throw new OperationError(400, 'OPERATION_INPUT_INVALID', 'Operation input is invalid.');
  }
  try {
    return db.transaction(() => {
      const settings = readSettings(db);
      const hash = createHash('sha256').update(canonical({
        method: 'PUT', route: '/api/v1/settings', resource: { type: 'settings', id: 'local' },
        body: { changes: { timeDefaults: input.timeDefaults } }, expectedRevision: input.expectedRevision ?? null,
      })).digest('hex');
      const previous = rowFor(db, input.operationId);
      if (previous) {
        if (previous.installation_id !== settings.installationId || previous.account_id !== settings.accountId || previous.request_hash !== hash) {
          throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'Operation identity conflicts with an accepted request.');
        }
        const recovered = readOperation(db, input.operationId);
        if (!recovered) throw new StorageError('OPERATION_DATA_INVALID');
        return recovered;
      }
      if (input.expectedRevision === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
      if (input.expectedRevision !== settingsETag(settings.installationId, settings.revision)) {
        throw new OperationError(412, 'REVISION_CONFLICT', 'The configuration revision has changed.');
      }
      const revision = settings.revision + 1;
      const now = Date.now();
      const updated = db.prepare<[string, number, number]>(
        "UPDATE factory_settings SET time_defaults_json = ?, revision = revision + 1, updated_at_ms = ? WHERE id = 'local' AND revision = ?",
      ).run(JSON.stringify(input.timeDefaults), now, settings.revision);
      if (updated.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'The configuration revision has changed.');
      // Reserve the event sequence inside the write transaction. Rollback exposes neither index nor event.
      const last = db.prepare<[], { seq: number }>('SELECT coalesce(max(seq), 0) AS seq FROM events').get();
      const seq = (last?.seq ?? 0) + 1;
      const receipt = { revision, eventCursor: String(seq) };
      db.prepare('INSERT INTO operation_requests(operation_id, installation_id, account_id, operation_kind, resource_type, resource_id, request_hash, expected_revision_json, receipt_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(input.operationId, settings.installationId, settings.accountId, 'settings.time-defaults.update', 'settings', 'local', hash,
          JSON.stringify({ etag: input.expectedRevision }), JSON.stringify(receipt));
      db.prepare('INSERT INTO events(seq, entity_type, entity_id, operation_id, event_type, entity_revision, facts_json, occurred_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(seq, 'settings', 'local', input.operationId, 'settings.time-defaults.updated', revision, '{}', now);
      return { operationId: input.operationId, kind: 'settings.time-defaults.update', resource: { type: 'settings', id: 'local' }, state: 'succeeded', receipt };
    }).immediate();
  } catch (error) {
    if (error instanceof OperationError || error instanceof StorageError) throw error;
    throw new StorageError('OPERATION_WRITE_FAILED', { cause: error });
  }
}
