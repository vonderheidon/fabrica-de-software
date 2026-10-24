import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { MakeAttemptDecision, OperationId, type PreparationChoices } from '#contracts';
import { serializeOperationReceipt } from './common-json.js';
import { assertProjectAvailable } from './project-deletion-barrier.js';
import { readAttempt, readCapture } from './attempts.js';
import { readAttemptBlock } from './progress.js';
import { savePreparationInTransaction, type PreparationCommand } from './preparations.js';
import { readSettings } from './settings.js';
import { digest, guarded } from './configuration-reads.js';
import { OperationError, readOperation, type StoredOperation } from './operations.js';
import { StorageError } from './errors.js';
import { createExecutionPersistence } from './execution.js';

export interface AttemptDecisionCommand {
  operationId: string;
  attemptId: string;
  expectedRevision: string | undefined;
  body: MakeAttemptDecision;
}
export interface SuccessorPreparationInput {
  projectId: string;
  configurationETag: string;
  body: PreparationChoices;
}

function commandHash(command: AttemptDecisionCommand): string {
  if (!Value.Check(OperationId, command.operationId) || !Value.Check(OperationId, command.attemptId) ||
    !Value.Check(MakeAttemptDecision, command.body) ||
    (command.expectedRevision !== undefined && (typeof command.expectedRevision !== 'string' || command.expectedRevision.length > 256))) {
    throw new OperationError(400, 'ATTEMPT_DECISION_INVALID', 'The attempt decision command is invalid.');
  }
  return digest({ method: 'POST', route: `/api/v1/attempts/${command.attemptId}/decisions`, body: command.body,
    expectedRevision: command.expectedRevision ?? null });
}

export function recoverAttemptDecision(db: Database.Database, command: AttemptDecisionCommand): StoredOperation | null {
  const hash = commandHash(command); const settings = readSettings(db);
  const prior = db.prepare<[string], { installation_id: string; account_id: string | null; request_hash: string }>(
    'SELECT installation_id,account_id,request_hash FROM operation_requests WHERE operation_id=?',
  ).get(command.operationId);
  if (!prior) return null;
  if (prior.installation_id !== settings.installation_id || prior.account_id !== settings.account_id || prior.request_hash !== hash) {
    throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'The operation conflicts with an accepted decision.');
  }
  const operation = readOperation(db, command.operationId);
  if (!operation || operation.kind !== 'attempt.decision' || operation.resource.id !== command.attemptId || !operation.receipt) {
    throw new StorageError('OPERATION_DATA_INVALID');
  }
  return operation;
}

export function acceptAttemptDecision(db: Database.Database, command: AttemptDecisionCommand, successor?: SuccessorPreparationInput): { operation: StoredOperation; created: boolean } {
  const hash = commandHash(command);
  return guarded(() => db.transaction(() => {
    const old = recoverAttemptDecision(db, command);
    if (old) return { operation: old, created: false };
    if (command.expectedRevision === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
    const attempt = readAttempt(db, command.attemptId);
    const block = readAttemptBlock(db, attempt.id);
    if (attempt.result !== null || attempt.suspension !== 'CORRECTION_BLOCKED' || attempt.phase !== 'reviewing' || !block) {
      throw new OperationError(409, 'ATTEMPT_DECISION_NOT_CURRENT', 'The attempt no longer has a current correction block.');
    }
    if (command.expectedRevision !== `"${attempt.id}:${attempt.revision}"`) {
      throw new OperationError(412, 'REVISION_CONFLICT', 'The attempt changed. Reload its current block before deciding.');
    }
    const { body } = command;
    if (body.blockId !== block.id || body.blockRevision !== block.revision || body.deliveryId !== attempt.deliveryId || !attempt.deliveryId) {
      throw new OperationError(409, 'ATTEMPT_DECISION_STALE', 'The selected block or delivery is no longer current.');
    }
    const review = db.prepare<[string, string], { state: string; independence_state: string; content_identity: string }>(
      'SELECT r.state,r.independence_state,d.content_identity FROM reviews r JOIN deliveries d ON d.id=r.delivery_id WHERE r.attempt_id=? AND r.delivery_id=?',
    ).get(attempt.id, body.deliveryId);
    if (review?.state !== 'rejected' || review.independence_state !== 'valid') {
      throw new OperationError(409, 'ATTEMPT_DECISION_STALE', 'A valid rejected review is required for this decision.');
    }
    const capture = readCapture(db, attempt.id);
    const used = attempt.round - 1; const limit = capture.configuration.configuration.correction_limit;
    if (body.action === 'guidance' && (block.reason === 'correction_limit' || used >= limit)) {
      throw new OperationError(409, 'CORRECTION_LIMIT_REACHED', 'Guidance cannot bypass the captured correction limit.');
    }
    if (body.action === 'change_profile') {
      const profileChoice = successor?.body.overrides[`${body.role}_profile`];
      if (!successor || successor.projectId !== attempt.projectId || successor.body.issue_id !== capture.issue.id ||
        successor.body.previous_attempt_id !== attempt.id || profileChoice?.kind !== 'reference' ||
        profileChoice.id !== body.profileId || profileChoice.revision !== body.profileRevision) {
        throw new OperationError(409, 'ATTEMPT_DECISION_INVALID', 'The successor preparation does not match the authorized profile choice.');
      }
      const selectedProfile = db.prepare<[string], { profile_type: string; revision: number; deleted_at_ms: number | null }>(
        'SELECT profile_type,revision,deleted_at_ms FROM execution_profiles WHERE id=?',
      ).get(body.profileId);
      if (!selectedProfile || selectedProfile.deleted_at_ms !== null) throw new OperationError(404, 'PROFILE_NOT_FOUND', 'O perfil de execução selecionado não está mais disponível.');
      if (selectedProfile.profile_type !== body.role) throw new OperationError(409, 'PROFILE_TYPE_MISMATCH', 'O perfil escolhido não corresponde ao papel solicitado.');
      if (selectedProfile.revision !== body.profileRevision) throw new OperationError(409, 'PROFILE_REFERENCE_CHANGED', 'A revisão exata do perfil selecionado não está mais atual.');
    } else if (successor) throw new OperationError(400, 'ATTEMPT_DECISION_INVALID', 'This decision cannot include a successor preparation.');

    assertProjectAvailable(db, attempt.projectId);
    const settings = readSettings(db); const requestHash = hash; const id = randomUUID(); const now = Date.now();
    const authorization = {
      formatVersion: 1, authorized: true, requestHash, attemptId: attempt.id, deliveryId: body.deliveryId,
      contentIdentity: review.content_identity, blockId: block.id, blockRevision: block.revision, blockReason: block.reason, expectedRevision: command.expectedRevision,
      action: body.action,
      ...(body.action === 'change_profile' ? { profileId: body.profileId, profileRevision: body.profileRevision, role: body.role } : {}),
      ...(body.action === 'guidance' ? { guidance: body.guidance } : {}),
    };
    db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json)
      VALUES (?,?,?,'attempt.decision','attempt',?,?,?,NULL)`).run(command.operationId, settings.installation_id, settings.account_id,
      attempt.id, hash, JSON.stringify({ etag: command.expectedRevision }));

    let successorPreparationId: string | null = null; let successorPreparationRevision: number | null = null;
    if (body.action === 'change_profile') {
      const preparationCommand: PreparationCommand = { kind: 'preparation.create', projectId: successor!.projectId, body: successor!.body,
        operationId: randomUUID(), expectedRevision: undefined };
      const prepared = savePreparationInTransaction(db, { command: preparationCommand, configurationETag: successor!.configurationETag,
        blockedSuccessorAttemptId: attempt.id });
      const preparationReceipt = prepared.receipt;
      if (!preparationReceipt || typeof preparationReceipt.revision !== 'number' || prepared.state !== 'succeeded') throw new StorageError('OPERATION_DATA_INVALID');
      successorPreparationId = prepared.resource.id; successorPreparationRevision = preparationReceipt.revision;
    }
    if (body.action === 'end') db.prepare('INSERT INTO cancellation_requests(operation_id,attempt_id,created_at_ms) VALUES (?,?,?)')
      .run(command.operationId, attempt.id, now);
    const guidanceJson = body.action === 'guidance' ? JSON.stringify({ formatVersion: 1, text: body.guidance }) : null;
    db.prepare(`INSERT INTO attempt_decisions(id,operation_id,attempt_id,delivery_id,block_id,block_revision,block_reason,action,authorization_json,guidance_json,
      successor_preparation_id,successor_preparation_revision,created_at_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, command.operationId, attempt.id, body.deliveryId, block.id, block.revision, block.reason, body.action, JSON.stringify(authorization), guidanceJson,
        successorPreparationId, successorPreparationRevision, now);

    if (body.action === 'end') createExecutionPersistence(db).recordCancellation(attempt.id, command.operationId);
    else if (body.action === 'guidance') {
      const changed = db.prepare(`UPDATE attempts SET suspension=NULL,diagnostic=NULL,revision=revision+1,updated_at_ms=?
        WHERE id=? AND revision=? AND result IS NULL AND suspension='CORRECTION_BLOCKED'`).run(Date.now(), attempt.id, attempt.revision);
      if (changed.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'The attempt changed before the decision was accepted.');
    } else {
      const changed = db.prepare(`UPDATE attempts SET revision=revision+1,updated_at_ms=?
        WHERE id=? AND revision=? AND result IS NULL AND suspension='CORRECTION_BLOCKED'`).run(Date.now(), attempt.id, attempt.revision);
      if (changed.changes !== 1) throw new OperationError(412, 'REVISION_CONFLICT', 'The attempt changed before the decision was accepted.');
    }
    const current = readAttempt(db, attempt.id);
    db.prepare(`INSERT INTO events(entity_type,entity_id,project_id,attempt_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms)
      VALUES ('attempt',?,?,?,?, 'attempt.decision.accepted',?,'{}',?)`).run(attempt.id, attempt.projectId, attempt.id, command.operationId, current.revision, now);
    const seq = db.prepare<[string], { seq: number }>('SELECT seq FROM events WHERE operation_id=? AND event_type=\'attempt.decision.accepted\'').get(command.operationId)!.seq;
    const receipt = { revision: current.revision, event_cursor: String(seq) };
    db.prepare('UPDATE operation_requests SET receipt_json=? WHERE operation_id=?').run(serializeOperationReceipt(receipt), command.operationId);
    const operation = readOperation(db, command.operationId);
    if (!operation?.receipt) throw new StorageError('OPERATION_DATA_INVALID');
    return { operation, created: true };
  }).immediate());
}

