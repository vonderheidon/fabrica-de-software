import { serializeOperationReceipt } from './common-json.js';
import { assertStartsAllowed } from './shutdown.js';
import { assertProjectAvailable } from './project-deletion-barrier.js';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { OperationId, QueueCommand, QueueScope } from '#contracts';
import { configurationETag, digest, guarded, readConfiguration, readSettingsView } from './configuration-reads.js';
import { insertRevision } from './configuration-writes.js';
import { readSettings } from './settings.js';
import { OperationError, readOperation, type StoredOperation } from './operations.js';
import { StorageError } from './errors.js';

export interface QueueChange { body: QueueCommand; operationId: string; expectedRevision: string | undefined }

function projectIds(db: Database.Database, scope: QueueScope): string[] {
  if (!Value.Check(QueueScope, scope) || (scope.kind === 'project' && !scope.projectIds.length)) {
    throw new OperationError(400, 'QUEUE_SCOPE_INVALID', 'Select distinct projects in the current account.');
  }
  return scope.kind === 'account'
    ? db.prepare<[string | null], { id: string }>('SELECT id FROM projects WHERE account_id IS ? OR account_id IS NULL ORDER BY id').all(readSettings(db).account_id).map(p => p.id)
    : [...scope.projectIds].sort();
}

export function queueETag(db: Database.Database, scope: QueueScope): string {
  const ids = projectIds(db, scope);
  return `"${digest([scope.kind, configurationETag(readSettingsView(db)), ids.map(id => [id, configurationETag(readConfiguration(db, id))])])}"`;
}

function commandHash(command: QueueChange): string {
  if (!Value.Check(OperationId, command.operationId) || !Value.Check(QueueCommand, command.body) ||
    (command.expectedRevision !== undefined && (typeof command.expectedRevision !== 'string' || command.expectedRevision.length > 256))) {
    throw new OperationError(400, 'QUEUE_COMMAND_INVALID', 'The queue command is invalid.');
  }
  return digest({ method: 'PUT', route: '/api/v1/queue', body: command.body, expectedRevision: command.expectedRevision ?? null });
}

export function recoverQueueChange(db: Database.Database, command: QueueChange): StoredOperation | null {
  const hash = commandHash(command); const settings = readSettings(db);
  const row = db.prepare<[string], { request_hash: string; installation_id: string; account_id: string | null; operation_kind: string }>(
    'SELECT request_hash,installation_id,account_id,operation_kind FROM operation_requests WHERE operation_id=?').get(command.operationId);
  if (!row) return null;
  if (row.request_hash !== hash || row.installation_id !== settings.installation_id || row.account_id !== settings.account_id || row.operation_kind !== 'queue.update') {
    throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'The operation conflicts with an accepted command.');
  }
  const operation = readOperation(db, command.operationId);
  if (!operation?.receipt) throw new StorageError('OPERATION_DATA_INVALID');
  return operation;
}

export function saveQueueChange(db: Database.Database, command: QueueChange): StoredOperation {
  return guarded(() => db.transaction(() => {
    const recovered = recoverQueueChange(db, command); if (recovered) return recovered;
    if (command.expectedRevision === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
    const { scope, enabled } = command.body;
    if (enabled) assertStartsAllowed(db);
    const ids = projectIds(db, scope); const settings = readSettings(db);
    if (enabled) for (const id of ids) assertProjectAvailable(db, id);
    if (queueETag(db, scope) !== command.expectedRevision) throw new OperationError(412, 'REVISION_CONFLICT', 'Queue configuration changed.');
    if (scope.kind === 'account' && digest(ids) !== digest([...scope.projectIds].sort())) throw new OperationError(409, 'QUEUE_SCOPE_CHANGED', 'The configured project set changed.');
    if (enabled && (!settings.account_id || !settings.projects_root ||
      (scope.kind === 'project' && !settings.automation_enabled) ||
      db.prepare("SELECT id FROM controller_authority WHERE id='local' AND dispatch_paused=1").get())) {
      throw new OperationError(409, 'QUEUE_AUTHORITY_REQUIRED', 'Configure and revalidate the account and project root before enabling.');
    }
    if (scope.kind === 'account') {
      const changed = db.prepare("UPDATE factory_settings SET automation_enabled=?,revision=revision+1,updated_at_ms=? WHERE id='local' AND revision=?")
        .run(Number(enabled), Date.now(), settings.revision);
      if (changed.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'Queue settings changed.');
    } else for (const id of ids) {
      const view = readConfiguration(db, id);
      const { id: oldId, project_id: _project, revision, created_at_ms: _created, ...configuration } = view.configuration;
      const nextId = randomUUID();
      const notes = JSON.parse(db.prepare<[string], { origin_notes_json: string }>('SELECT origin_notes_json FROM project_revisions WHERE id=?').get(oldId)!.origin_notes_json) as string[];
      insertRevision(db, id, nextId, revision + 1, { ...configuration, automation_enabled: enabled }, notes);
      const changed = db.prepare('UPDATE projects SET current_revision_id=?,revision=revision+1,updated_at_ms=? WHERE id=? AND revision=?')
        .run(nextId, Date.now(), id, revision);
      if (changed.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'Queue project changed.');
    }
    const seq = db.prepare<[], { seq: number }>('SELECT coalesce(max(seq),0)+1 AS seq FROM events').get()!.seq;
    const receipt = { revision: readSettings(db).revision, event_cursor: String(seq) };
    db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json)
      VALUES (?,?,?,'queue.update','queue','local',?,?,?)`).run(command.operationId, settings.installation_id, settings.account_id,
      commandHash(command), JSON.stringify({ etag: command.expectedRevision }), serializeOperationReceipt(receipt));
    db.prepare(`INSERT INTO events(seq,entity_type,entity_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms)
      VALUES (?,'queue','local',?,'queue.updated',?,'{}',?)`).run(seq, command.operationId, receipt.revision, Date.now());
    const operation = readOperation(db, command.operationId);
    if (!operation?.receipt) throw new StorageError('OPERATION_DATA_INVALID');
    return operation;
  }).immediate());
}
