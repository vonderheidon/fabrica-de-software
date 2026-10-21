import { readOperationReceipt, serializeOperationReceipt, storeTimeDefaults } from './common-json.js';
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { OperationId, OperationReceipt, TimeDefaults, type OperationView, type ErrorResponse, type DeletionCompleted } from '#contracts';
import { readSettings } from './settings.js';
import { StorageError } from './errors.js';

export class OperationError extends Error {
  constructor(
    readonly statusCode: 400 | 404 | 409 | 412 | 428 | 503,
    readonly code: string,
    message: string,
    readonly details?: {
      readonly facts?: NonNullable<ErrorResponse['facts']>;
      readonly affected_requirements?: string[];
      readonly recovery?: string;
    },
  ) { super(message); }
}

export interface SaveTimeDefaults {
  readonly operationId: string;
  readonly expectedRevision: string | undefined;
  readonly timeDefaults: TimeDefaults;
}
export type StoredOperation = Omit<OperationView, 'request_id' | 'error'> & { error?: Omit<ErrorResponse,'request_id'> };

interface OperationRow {
  operation_kind: string; resource_type: string; resource_id: string; request_hash: string;
  installation_id: string; account_id: string | null; result_account_id: string | null; receipt_json: string | null;
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

function accountHasUncertainCleanup(db: Database.Database, accountId: string): boolean {
  return Boolean(db.prepare<[string], { found: number }>(`SELECT 1 AS found FROM attempts a
    WHERE a.account_id = ? AND a.result IS NOT NULL AND (
      EXISTS (SELECT 1 FROM resources r WHERE r.attempt_id = a.id AND r.stop_state = 'uncertain') OR
      EXISTS (SELECT 1 FROM checks c WHERE c.attempt_id = a.id AND (
        c.diagnostic = 'VERIFICATION_INTERRUPTED' OR c.diagnostic LIKE '%STOP_UNCONFIRMED%' OR c.execution_diagnostic LIKE '%STOP_UNCONFIRMED%'
      ))
    ) LIMIT 1`).get(accountId));
}

function rowFor(db: Database.Database, operationId: string) {
  return db.prepare<[string], OperationRow>('SELECT * FROM operation_requests WHERE operation_id = ?').get(operationId);
}

/** Completed deletions have no account/resource/history left to reconstruct. */
export function readCompletedProjectDeletion(db: Database.Database, operationId: string): DeletionCompleted | null {
  if (!Value.Check(OperationId, operationId)) throw new OperationError(400, 'OPERATION_ID_INVALID', 'A operação é inválida.');
  return db.prepare('SELECT 1 FROM project_deletion_receipts WHERE operation_id=?').get(operationId)
    ? { operation_id: operationId, state: 'succeeded' } : null;
}

export function readOperation(db: Database.Database, operationId: string): StoredOperation | null {
  if (!Value.Check(OperationId, operationId)) throw new OperationError(400, 'OPERATION_ID_INVALID', 'Operation ID must be a UUID.');
  const settings = readSettings(db);
  const row = rowFor(db, operationId);
  if (!row || row.installation_id !== settings.installation_id) return null;
  const isBindingOperation = row.operation_kind === 'settings.account.bind' || row.operation_kind === 'settings.account.switch';
  if (isBindingOperation) {
    const targetAccountId = row.result_account_id;
    const originValid = row.operation_kind === 'settings.account.bind'
      ? row.account_id === null
      : row.account_id !== null && row.account_id !== targetAccountId;
    if (row.resource_type !== 'settings' || row.resource_id !== 'local' || !targetAccountId ||
      settings.account_id !== targetAccountId || !originValid) return null;
  } else if (row.account_id !== settings.account_id || row.result_account_id !== null) return null;
  // Each domain command adds its own projection here. Unknown kinds never imply success.
  const event = db.prepare<[string], { entity_revision: number; seq: number; entity_type: string; entity_id: string; event_type: string; operation_id: string }>(
    'SELECT entity_revision, seq, entity_type, entity_id, event_type, operation_id FROM events WHERE operation_id = ? ORDER BY seq LIMIT 1',
  ).get(operationId);
  const receipt = row.receipt_json === null ? undefined : readOperationReceipt(JSON.parse(row.receipt_json) as unknown);
  if (receipt !== undefined && !Value.Check(OperationReceipt, receipt)) throw new StorageError('OPERATION_DATA_INVALID');
  if (row.operation_kind === 'project.delete' && row.resource_type === 'project') {
    const deletion = db.prepare<[string, string], { state: string }>(
      'SELECT state FROM project_deletions WHERE operation_id=? AND project_id=?',
    ).get(operationId, row.resource_id);
    if (!deletion || !receipt || !event || event.entity_type !== 'project' || event.entity_id !== row.resource_id ||
      event.event_type !== 'project.deletion.accepted' || receipt.revision !== 1 || receipt.event_cursor !== String(event.seq)) {
      throw new StorageError('OPERATION_DATA_INVALID');
    }
    return { operation_id: operationId, kind: row.operation_kind, resource: { type: 'project', id: row.resource_id },
      state: deletion.state === 'accepted' ? 'accepted' : deletion.state === 'running' || deletion.state === 'finalizing' ? 'running' : 'unknown', receipt };
  }
  if (isBindingOperation) {
    const expectedEvent = row.operation_kind === 'settings.account.bind' ? 'settings.account.bound' : 'settings.account.switched';
    const linkedAccount = row.result_account_id ? db.prepare<[string], { login: string }>(
      'SELECT login FROM accounts WHERE github_account_id = ?',
    ).get(row.result_account_id) : undefined;
    if (!linkedAccount || !receipt || !event || event.operation_id !== operationId || event.entity_type !== 'settings' ||
      event.entity_id !== 'local' || event.event_type !== expectedEvent || receipt.revision !== event.entity_revision ||
      receipt.event_cursor !== String(event.seq)) throw new StorageError('OPERATION_DATA_INVALID');
    const warning = row.operation_kind === 'settings.account.switch' && row.account_id !== null && accountHasUncertainCleanup(db, row.account_id)
      ? [{ code: 'PRIOR_ACCOUNT_CLEANUP_UNCERTAIN', message: 'Recursos de tentativas encerradas da conta anterior ainda têm parada ou limpeza incerta e permanecem no contexto de origem.' }]
      : undefined;
    return { operation_id: operationId, kind: row.operation_kind, resource: { type: 'settings', id: 'local' }, state: 'succeeded', receipt,
      ...(warning ? { warnings: warning } : {}) };
  }
  if (row.operation_kind === 'diagnostics.check' && row.resource_type === 'diagnostic') {
    const run = db.prepare<[string], { state: StoredOperation['state'] }>('SELECT state FROM diagnostic_runs WHERE operation_id=?').get(operationId);
    if (!run || !receipt || !event || event.entity_type !== 'diagnostic' || event.entity_id !== operationId ||
      row.resource_id !== operationId || receipt.event_cursor !== String(event.seq) || receipt.revision !== 1) throw new StorageError('OPERATION_DATA_INVALID');
    return { operation_id: operationId, kind: row.operation_kind, resource: { type: 'diagnostic', id: operationId }, state: run.state, receipt,
      ...(['failed', 'unknown'].includes(run.state) ? { error: { code: run.state === 'unknown' ? 'DIAGNOSTIC_INTERRUPTED' : 'DIAGNOSTIC_CONTEXT_CHANGED',
        message: 'Inspect the contextual diagnosis before requesting a new check.', recovery: 'Read /diagnostics for the original context.', affected_requirements: ['RF-88'] } } : {}) };
  }
  if (row.operation_kind === 'queue.update' && row.resource_type === 'queue') {
    if (!receipt || !event || event.entity_type !== 'queue' || event.entity_id !== 'local' || receipt.revision !== event.entity_revision || receipt.event_cursor !== String(event.seq)) throw new StorageError('OPERATION_DATA_INVALID');
    return { operation_id: operationId, kind: row.operation_kind, resource: { type: 'queue', id: 'local' }, state: 'succeeded', receipt };
  }
  if (row.operation_kind === 'scaffold.reconcile' && row.resource_type === 'creation') {
    const request = db.prepare<[string,string],{ state: StoredOperation['state']; diagnostic: string | null }>('SELECT state,diagnostic FROM creation_reconciliations WHERE operation_id=? AND creation_id=?').get(operationId,row.resource_id);
    if (!request || !receipt || !event || event.entity_type !== 'creation' || event.entity_id !== row.resource_id || receipt.revision !== event.entity_revision || receipt.event_cursor !== String(event.seq)) throw new StorageError('OPERATION_DATA_INVALID');
    return { operation_id: operationId,kind: row.operation_kind,resource: { type: 'creation',id: row.resource_id },state: request.state,receipt,
      ...(request.diagnostic ? { error: { code: request.diagnostic,message: 'Inspect the remaining creation effects.',operation_id: operationId } } : {}) };
  }
  if (row.operation_kind === 'scaffold.create' && row.resource_type === 'creation') {
    const creation = db.prepare<[string, string], { state: string; diagnostic: string | null }>('SELECT state,diagnostic FROM project_creations WHERE id=? AND operation_id=?').get(row.resource_id,operationId);
    if (!creation || !receipt || !event || event.entity_type !== 'creation' || event.entity_id !== row.resource_id || receipt.revision !== event.entity_revision || receipt.event_cursor !== String(event.seq)) throw new StorageError('OPERATION_DATA_INVALID');
    const state = creation.state === 'completed' ? 'succeeded' : creation.state === 'partial' ? 'unknown' : creation.state === 'failed' ? 'failed' : creation.state === 'pending' ? 'accepted' : 'running';
    return { operation_id: operationId, kind: row.operation_kind, resource: { type: 'creation', id: row.resource_id }, state, receipt,
      ...(creation.diagnostic ? { error: { code: creation.diagnostic, message: 'Inspect the preserved local creation before any further action.', operation_id: operationId } } : {}) };
  }
  if (['publication.complete','publication.reconcile','publication.authorize-upgrade','attempt.revalidate','effect.execute'].includes(row.operation_kind)) {
    if (!receipt || !event || event.entity_id !== row.resource_id || event.entity_type !== row.resource_type || receipt.revision !== event.entity_revision || receipt.event_cursor !== String(event.seq)) throw new StorageError('OPERATION_DATA_INVALID');
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
    return { operation_id: operationId, kind: row.operation_kind, resource: { type: row.resource_type, id: row.resource_id }, state, receipt,
      ...(['failed','unknown'].includes(state) ? { error: { code: diagnostic ?? 'EFFECT_UNRESOLVED',message: 'Publication or projection remains pending. Inspect the identified effects and revalidate current authority.',operation_id: operationId } } : {}) };
  }
  if (['attempt.cancel', 'resource.remove', 'folder.open', 'interaction.open'].includes(row.operation_kind)) {
    const valid = receipt && event?.entity_id === row.resource_id && event.entity_type === row.resource_type &&
      receipt.revision === event.entity_revision && receipt.event_cursor === String(event.seq);
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
    return { operation_id: operationId, kind: row.operation_kind, resource: { type: row.resource_type, id: row.resource_id }, state, receipt };
  }
  if (row.operation_kind === 'question.answer' && row.resource_type === 'question') {
    const q = db.prepare<[string, string], { state: string }>('SELECT state FROM execution_questions WHERE id=? AND answer_operation_id=?').get(row.resource_id, operationId);
    const valid = q && receipt && event?.entity_type === 'question' && event.entity_id === row.resource_id && receipt.revision === event.entity_revision && receipt.event_cursor === String(event.seq);
    if (!valid) throw new StorageError('OPERATION_DATA_INVALID');
    return { operation_id: operationId, kind: row.operation_kind, resource: { type: 'question', id: row.resource_id }, state:
      q.state === 'delivered' ? 'succeeded' : q.state === 'delivery_unknown' ? 'unknown' : ['expired', 'cancelled'].includes(q.state) ? 'failed' : q.state === 'sending' ? 'running' : 'accepted', ...(receipt ? { receipt } : {}) };
  }
  if (row.operation_kind === 'capture.retry' && row.resource_type === 'delivery') {
    const run = db.prepare<[string, string], { state: string }>('SELECT state FROM capture_runs WHERE operation_id=? AND delivery_id=?').get(operationId, row.resource_id);
    const valid = run && receipt && event?.entity_type === 'delivery' && event.entity_id === row.resource_id && receipt.revision === event.entity_revision && receipt.event_cursor === String(event.seq);
    return { operation_id: operationId, kind: row.operation_kind, resource: { type: 'delivery', id: row.resource_id },
      state: !valid ? 'unknown' : run.state === 'captured' ? 'succeeded' : run.state === 'failed' ? 'failed' : 'running', ...(receipt ? { receipt } : {}) };
  }
  if (row.operation_kind === 'attempt.start' && row.resource_type === 'attempt') {
    const attempt = db.prepare<[string, string], { phase: string; result: string | null }>('SELECT phase,result FROM attempts WHERE id=? AND operation_id=?').get(row.resource_id, operationId);
    const accepted = Boolean(attempt && receipt && event?.entity_type === 'attempt' && event.entity_id === row.resource_id &&
      receipt.revision === event.entity_revision && receipt.event_cursor === String(event.seq));
    return { operation_id: operationId, kind: row.operation_kind, resource: { type: row.resource_type, id: row.resource_id },
      state: !accepted ? 'unknown' : attempt?.result === 'delivered' ? 'succeeded' : attempt?.result ? 'failed' : attempt?.phase === 'preparing' ? 'accepted' : 'running', ...(receipt ? { receipt } : {}) };
  }
  const eventKind = db.prepare<[string], { event_type: string }>('SELECT event_type FROM events WHERE operation_id = ?').get(operationId)?.event_type;
  const kinds: Readonly<Record<string, string>> = { 'preparation.create': 'preparation.created', 'preparation.update': 'preparation.updated', 'settings.time-defaults.update': 'settings.time-defaults.updated', 'settings.update': 'settings.updated', 'settings.onboarding.update': 'settings.onboarding.updated', 'project.register': 'project.registered', 'project.configuration.update': 'project.configuration.updated' };
  const domainExists = row.resource_type === 'project'
    ? Boolean(db.prepare('SELECT id FROM project_revisions WHERE project_id = ? AND revision_number = ?').get(row.resource_id, receipt?.revision ?? 0))
    : row.resource_type === 'preparation'
      ? Boolean(db.prepare('SELECT preparation_id FROM preparation_revisions WHERE preparation_id = ? AND revision = ?').get(row.resource_id, receipt?.revision ?? 0))
      : row.resource_type === 'settings' && row.resource_id === 'local' && settings.revision >= (receipt?.revision ?? Infinity);
  const succeeded = kinds[row.operation_kind] !== undefined && kinds[row.operation_kind] === eventKind
    && event && event.entity_type === row.resource_type && event.entity_id === row.resource_id && domainExists
    && receipt?.revision === event.entity_revision && receipt.event_cursor === String(event.seq);
  return {
    operation_id: operationId, kind: row.operation_kind, resource: { type: row.resource_type, id: row.resource_id },
    state: succeeded ? 'succeeded' : 'unknown', ...(receipt ? { receipt } : {}),
  };
}

/** Reveals only whether the prior account has unresolved cleanup, through its authorized switch receipt. */
export function hasUncertainAccountCleanup(db: Database.Database, operationId: string): boolean {
  const operation = readOperation(db, operationId);
  return operation?.kind === 'settings.account.switch' &&
    operation.warnings?.some(warning => warning.code === 'PRIOR_ACCOUNT_CLEANUP_UNCERTAIN') === true;
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
        if (previous.installation_id !== settings.installation_id || previous.account_id !== settings.account_id || previous.request_hash !== hash) {
          throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'Operation identity conflicts with an accepted request.');
        }
        const recovered = readOperation(db, input.operationId);
        if (!recovered) throw new StorageError('OPERATION_DATA_INVALID');
        return recovered;
      }
      if (input.expectedRevision === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
      if (input.expectedRevision !== settingsETag(settings.installation_id, settings.revision)) {
        throw new OperationError(412, 'REVISION_CONFLICT', 'The configuration revision has changed.');
      }
      const revision = settings.revision + 1;
      const now = Date.now();
      const updated = db.prepare<[string, number, number]>(
        "UPDATE factory_settings SET time_defaults_json = ?, revision = revision + 1, updated_at_ms = ? WHERE id = 'local' AND revision = ?",
      ).run(JSON.stringify(storeTimeDefaults(input.timeDefaults)), now, settings.revision);
      if (updated.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'The configuration revision has changed.');
      // Reserve the event sequence inside the write transaction. Rollback exposes neither index nor event.
      const last = db.prepare<[], { seq: number }>('SELECT coalesce(max(seq), 0) AS seq FROM events').get();
      const seq = (last?.seq ?? 0) + 1;
      const receipt = { revision, event_cursor: String(seq) };
      db.prepare('INSERT INTO operation_requests(operation_id, installation_id, account_id, operation_kind, resource_type, resource_id, request_hash, expected_revision_json, receipt_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(input.operationId, settings.installation_id, settings.account_id, 'settings.time-defaults.update', 'settings', 'local', hash,
          JSON.stringify({ etag: input.expectedRevision }), serializeOperationReceipt(receipt));
      db.prepare('INSERT INTO events(seq, entity_type, entity_id, operation_id, event_type, entity_revision, facts_json, occurred_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(seq, 'settings', 'local', input.operationId, 'settings.time-defaults.updated', revision, '{}', now);
      return { operation_id: input.operationId, kind: 'settings.time-defaults.update', resource: { type: 'settings', id: 'local' }, state: 'succeeded', receipt };
    }).immediate();
  } catch (error) {
    if (error instanceof OperationError || error instanceof StorageError) throw error;
    throw new StorageError('OPERATION_WRITE_FAILED', { cause: error });
  }
}
