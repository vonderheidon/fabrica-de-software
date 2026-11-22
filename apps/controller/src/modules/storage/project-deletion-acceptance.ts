import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { blocksDeletion, DeletionConfirmation, DeletionPending, OperationId, type DeletionStatus } from '#contracts';
import type { DeletionInspection } from '../workspaces/index.js';
import { digest, readProject } from './configuration-reads.js';
import { serializeOperationReceipt } from './common-json.js';
import { OperationError, readOperation } from './operations.js';
import { StorageError } from './errors.js';
import { readSettings } from './settings.js';
import { readProjectDeletionPaths } from './project-deletion-paths.js';
import { assertProjectAvailable, normalizedDeletionPath } from './project-deletion-barrier.js';

export interface ProjectDeletionCommand {
  readonly operationId: string;
  readonly projectId: string;
  readonly expectedRevision: string | undefined;
  readonly body: DeletionConfirmation;
}
export interface AcceptProjectDeletion {
  readonly command: ProjectDeletionCommand;
  readonly inspection: DeletionInspection;
}
function fingerprint(db: Database.Database, command: ProjectDeletionCommand): string {
  if (!Value.Check(OperationId, command.operationId) || !Value.Check(OperationId, command.projectId) ||
    !Value.Check(DeletionConfirmation, command.body) ||
    (command.expectedRevision !== undefined && (typeof command.expectedRevision !== 'string' || command.expectedRevision.length > 256))) {
    throw new OperationError(400, 'PROJECT_DELETION_COMMAND_INVALID', 'A confirmação de exclusão é inválida.');
  }
  return digest({ kind: 'project.delete', installation: readSettings(db).installation_id,
    projectId: command.projectId, body: command.body, expectedRevision: command.expectedRevision ?? null });
}
export function readProjectDeletion(db: Database.Database, operationId: string): DeletionStatus | null {
  if (!Value.Check(OperationId, operationId)) throw new OperationError(400, 'OPERATION_ID_INVALID', 'A operação é inválida.');
  if (db.prepare('SELECT operation_id FROM project_deletion_receipts WHERE operation_id=?').get(operationId)) {
    return { operation_id: operationId, state: 'succeeded' };
  }
  // Existing operation projection checks installation, account, event and receipt.
  const op = readOperation(db, operationId);
  if (!op || op.kind !== 'project.delete') return null;
  const row = db.prepare<[string], { project_id: string; state: DeletionPending['state']; revision: number; reason: string | null; recovery: string | null; worker_token: string | null }>(
    'SELECT project_id,state,revision,reason,recovery,worker_token FROM project_deletions WHERE operation_id=?',
  ).get(operationId);
  if (!row) throw new StorageError('OPERATION_DATA_INVALID');
  const project = readProject(db, row.project_id).project;
  const targets = db.prepare<[string], DeletionPending['targets'][number]>(
    'SELECT target_key,target_kind,authorized_path AS path,state FROM project_deletion_targets WHERE operation_id=? ORDER BY target_key',
  ).all(operationId);
  const result: DeletionPending = { operation_id: operationId, project_id: row.project_id, project_name: project.name,
    state: row.state, revision: row.revision, targets, can_retry: row.worker_token === null && ['pending','reconfirmation_required'].includes(row.state),
    blockers: row.reason && row.recovery ? [{ reason: row.reason, recovery: row.recovery }] : [] };
  if (!Value.Check(DeletionPending, result)) throw new StorageError('OPERATION_DATA_INVALID');
  return result;
}
/** Resolves the original key before project lookup, CAS or external inspection. */
export function recoverProjectDeletion(db: Database.Database, command: ProjectDeletionCommand): DeletionStatus | null {
  const hash = fingerprint(db, command);
  const receipt = db.prepare<[string], { request_fingerprint: string }>(
    'SELECT request_fingerprint FROM project_deletion_receipts WHERE operation_id=?',
  ).get(command.operationId);
  if (receipt) {
    if (receipt.request_fingerprint !== hash) throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'A chave pertence a outra confirmação.');
    return { operation_id: command.operationId, state: 'succeeded' };
  }
  const row = db.prepare<[string], { request_hash: string; operation_kind: string; resource_id: string; installation_id: string; account_id: string | null }>(
    'SELECT request_hash,operation_kind,resource_id,installation_id,account_id FROM operation_requests WHERE operation_id=?',
  ).get(command.operationId);
  if (!row) {
    // A different key cannot start another inspection/authorization for this registration.
    if (db.prepare('SELECT operation_id FROM project_deletions WHERE project_id=?').get(command.projectId)) {
      readProject(db, command.projectId);
      assertProjectAvailable(db, command.projectId);
    }
    return null;
  }
  const settings = readSettings(db);
  if (row.request_hash !== hash || row.operation_kind !== 'project.delete' || row.resource_id !== command.projectId ||
    row.installation_id !== settings.installation_id || row.account_id !== settings.account_id) {
    throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'A chave pertence a outra confirmação.');
  }
  const status = readProjectDeletion(db, command.operationId);
  if (!status) throw new StorageError('OPERATION_DATA_INVALID');
  return status;
}
export function acceptProjectDeletion(db: Database.Database, dataDirectory: string, input: AcceptProjectDeletion): DeletionStatus {
  return db.transaction(() => {
    const command = input.command;
    const recovered = recoverProjectDeletion(db, command);
    if (recovered) return recovered;
    const project = readProject(db, command.projectId).project;
    assertProjectAvailable(db, project.id);
    if (command.expectedRevision === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match é obrigatório.');
    if (command.expectedRevision !== `"${digest([project.id, project.current_revision_id, project.revision])}"`) {
      throw new OperationError(412, 'REVISION_CONFLICT', 'O cadastro mudou. Consulte novamente a exclusão.');
    }
    const snapshot = readProjectDeletionPaths(db, project.id, dataDirectory);
    const inspection = input.inspection;
    if (!inspection.preview.can_confirm || blocksDeletion(inspection.preview.blockers) || blocksDeletion(snapshot.blockers) ||
      inspection.inventoryVersion !== snapshot.inventoryVersion || inspection.preview.project_id !== project.id ||
      inspection.preview.project_revision !== project.revision || inspection.preview.source_kind !== project.source.kind ||
      inspection.preview.authorization_digest !== command.body.authorization_digest ||
      digest([...snapshot.targets].sort((a,b) => a.key.localeCompare(b.key))) !== digest([...inspection.claims].sort((a,b) => a.key.localeCompare(b.key))) ||
      inspection.observations.length !== snapshot.targets.length) {
      throw new OperationError(409, 'PROJECT_DELETION_PREVIEW_CHANGED', 'A conferência mudou ou tem impedimentos.', {
        recovery: 'Consulte novamente os alvos antes de confirmar a exclusão.',
      });
    }
    const settings = readSettings(db); const now = Date.now();
    const seq = db.prepare<[], { seq: number }>('SELECT coalesce(max(seq),0)+1 AS seq FROM events').get()!.seq;
    db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json)
      VALUES (?,?,?,'project.delete','project',?,?,?,?)`).run(command.operationId, settings.installation_id, settings.account_id,
      project.id, fingerprint(db, command), JSON.stringify({ etag: command.expectedRevision }),
      serializeOperationReceipt({ revision: 1, event_cursor: String(seq) }));
    db.prepare(`INSERT INTO project_deletions(operation_id,project_id,expected_revision,authorization_digest,state,created_at_ms,updated_at_ms)
      VALUES (?,?,?,?,'accepted',?,?)`).run(command.operationId, project.id, project.revision, command.body.authorization_digest, now, now);
    for (const claim of snapshot.targets) {
      const observation = inspection.observations.find(o => o.path === claim.path);
      if (!observation || (observation.kind === 'absent') !== (observation.resolvedPath === null) ||
        (observation.kind !== 'absent' && !observation.identity) || !observation.ancestors.length) {
        throw new OperationError(409, 'PROJECT_DELETION_PREVIEW_CHANGED', 'A identidade de um alvo não foi comprovada.');
      }
      db.prepare(`INSERT INTO project_deletion_targets(operation_id,target_key,target_kind,authorized_path,normalized_path,resolved_path,
        object_kind,identity_json,owner_kind,owner_id,state) VALUES (?,?,?,?,?,?,?,?,?,?,'pending')`)
        .run(command.operationId, claim.key, claim.kind, claim.path, normalizedDeletionPath(claim.path), observation.resolvedPath,
          observation.kind, JSON.stringify({ identity: observation.identity,
            ancestors: observation.ancestors.map(({ path, identity, resolvedPath }) => ({ path, identity, resolvedPath })),
            policy: inspection.policyVersion }), claim.ownerKind, claim.ownerId);
    }
    db.prepare(`INSERT INTO events(seq,entity_type,entity_id,project_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms)
      VALUES (?,'project',?,?,?,'project.deletion.accepted',1,'{}',?)`).run(seq, project.id, project.id, command.operationId, now);
    const status = readProjectDeletion(db, command.operationId);
    if (!status) throw new StorageError('OPERATION_DATA_INVALID');
    return status;
  }).immediate();
}
