import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { OperationId, PreparationChoices, PreparationChoiceSnapshot, PreparationRecord, PreparationUpdate } from '#contracts';
import { readSettings } from './settings.js';
import { configurationETag, digest, eventCursor, guarded, readConfiguration } from './configuration-reads.js';
import { OperationError, readOperation, type StoredOperation } from './operations.js';
import { StorageError } from './errors.js';
import { validatePreviousAttempt } from './recovery.js';

interface Identity { operationId: string; expectedRevision: string | undefined }
export type PreparationCommand = Identity & (
  { kind: 'preparation.create'; projectId: string; body: PreparationChoices } |
  { kind: 'preparation.update'; preparationId: string; body: PreparationUpdate }
);
export interface SavePreparation { command: PreparationCommand; configurationETag: string }
export interface StoredPreparation { view: PreparationRecord; etag: string; eventCursor: string }
export function preparationETag(db: Database.Database, record: PreparationRecord): string {
  const s = readSettings(db);
  return `"${digest([s.installationId, s.accountId, record.id, record.revision])}"`;
}
export function readPreparation(db: Database.Database, id: string): StoredPreparation {
  if (!Value.Check(OperationId, id)) throw new OperationError(400, 'PREPARATION_ID_INVALID', 'Preparation ID is invalid.');
  const s = readSettings(db);
  const row = db.prepare<[string, string | null], { id: string; project_id: string; project_revision_id: string; revision: number; choices_json: string }>(
    `SELECT p.id, p.project_id, p.revision, r.project_revision_id, r.choices_json FROM preparations p
     JOIN preparation_revisions r ON r.preparation_id = p.id AND r.revision = p.revision
     WHERE p.id = ? AND p.account_id IS ?`,
  ).get(id, s.accountId);
  if (!row) throw new OperationError(404, 'PREPARATION_NOT_FOUND', 'Preparation not found in the current scope.');
  // Also enforce the current visibility of the owning project.
  readConfiguration(db, row.project_id);
  const snapshot: unknown = JSON.parse(row.choices_json);
  if (!Value.Check(PreparationChoiceSnapshot, snapshot)) throw new StorageError('PREPARATION_DATA_INVALID');
  const choices = snapshot.choices;
  const record = { ...choices, id: row.id, projectId: row.project_id, projectRevisionId: row.project_revision_id, revision: row.revision };
  if (!Value.Check(PreparationRecord, record)) throw new StorageError('PREPARATION_DATA_INVALID');
  return { view: record, etag: preparationETag(db, record), eventCursor: eventCursor(db) };
}
function commandHash(command: PreparationCommand): string {
  const create = command.kind === 'preparation.create';
  if (!Value.Check(OperationId, command.operationId) ||
    !Value.Check(create ? PreparationChoices : PreparationUpdate, command.body) ||
    !Value.Check(OperationId, create ? command.projectId : command.preparationId) ||
    (command.expectedRevision !== undefined && (typeof command.expectedRevision !== 'string' || command.expectedRevision.length > 256))) {
    throw new OperationError(400, 'COMMAND_INVALID', 'Preparation command is invalid.');
  }
  return digest({ method: create ? 'POST' : 'PUT',
    route: create ? `/api/v1/projects/${command.projectId}/preparations` : `/api/v1/preparations/${command.preparationId}`,
    body: command.body, expectedRevision: command.expectedRevision ?? null });
}
export function recoverPreparationCommand(db: Database.Database, command: PreparationCommand): StoredOperation | null {
  const hash = commandHash(command); const s = readSettings(db);
  const row = db.prepare<[string], { installation_id: string; account_id: string | null; request_hash: string }>(
    'SELECT installation_id, account_id, request_hash FROM operation_requests WHERE operation_id = ?',
  ).get(command.operationId);
  if (!row) return null;
  if (row.installation_id !== s.installationId || row.account_id !== s.accountId || row.request_hash !== hash) {
    throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'The operation conflicts with an accepted command.');
  }
  const operation = readOperation(db, command.operationId);
  if (!operation || operation.state !== 'succeeded') throw new StorageError('OPERATION_DATA_INVALID');
  return operation;
}
export function savePreparation(db: Database.Database, input: SavePreparation): StoredOperation {
  return guarded(() => db.transaction(() => {
    const command = input.command;
    const recovered = recoverPreparationCommand(db, command); if (recovered) return recovered;
    const previous = command.kind === 'preparation.update' ? readPreparation(db, command.preparationId) : null;
    if (previous && command.expectedRevision === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
    if (previous && command.expectedRevision !== previous.etag) throw new OperationError(412, 'REVISION_CONFLICT', 'Preparation changed. Reload current data.');
    const projectId = command.kind === 'preparation.create' ? command.projectId : previous!.view.projectId;
    const config = readConfiguration(db, projectId);
    if (configurationETag(config) !== input.configurationETag) throw new OperationError(412, 'REVISION_CONFLICT', 'Configuration changed while preparing the issue.');
    const choices: PreparationChoices = command.kind === 'preparation.create' ? command.body : {
      issueId: previous!.view.issueId, deliveryMode: previous!.view.deliveryMode, guidance: previous!.view.guidance,
      overrides: previous!.view.overrides, ...command.body.changes,
      ...(previous!.view.previousAttemptId ? { previousAttemptId: previous!.view.previousAttemptId } : {}),
    };
    if (!Value.Check(PreparationChoices, choices)) throw new OperationError(400, 'PREPARATION_INVALID', 'Preparation choices are invalid.');
    if (choices.previousAttemptId) validatePreviousAttempt(db, choices.previousAttemptId, projectId, choices.issueId);
    const id = previous?.view.id ?? randomUUID(); const revision = (previous?.view.revision ?? 0) + 1;
    const now = Date.now(); const settings = readSettings(db);
    if (!previous) db.prepare('INSERT INTO preparations(id, project_id, account_id, revision, created_at_ms, updated_at_ms) VALUES (?, ?, ?, 1, ?, ?)')
      .run(id, projectId, settings.accountId, now, now);
    db.prepare('INSERT INTO preparation_revisions(preparation_id, revision, project_id, project_revision_id, choices_json, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, revision, projectId, config.configuration.id, JSON.stringify({ formatVersion: 1, choices }), now);
    if (previous) {
      const result = db.prepare('UPDATE preparations SET revision = ?, updated_at_ms = ? WHERE id = ? AND revision = ?').run(revision, now, id, previous.view.revision);
      if (result.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'Preparation changed.');
    }
    const seq = (db.prepare<[], { seq: number }>('SELECT coalesce(max(seq),0) AS seq FROM events').get()?.seq ?? 0) + 1;
    const receipt = { revision, eventCursor: String(seq) };
    db.prepare('INSERT INTO operation_requests(operation_id, installation_id, account_id, operation_kind, resource_type, resource_id, request_hash, expected_revision_json, receipt_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(command.operationId, settings.installationId, settings.accountId, command.kind, 'preparation', id, commandHash(command), JSON.stringify({ etag: command.expectedRevision ?? null }), JSON.stringify(receipt));
    db.prepare('INSERT INTO events(seq, entity_type, entity_id, project_id, operation_id, event_type, entity_revision, facts_json, occurred_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(seq, 'preparation', id, projectId, command.operationId, command.kind === 'preparation.create' ? 'preparation.created' : 'preparation.updated', revision, '{}', now);
    return { operationId: command.operationId, kind: command.kind, resource: { type: 'preparation', id }, state: 'succeeded', receipt };
  }).immediate());
}
