import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { DeliveryTarget, type DeliveryTarget as DeliveryTargetValue } from '#contracts';
import { readAttempt, readCapture } from './attempts.js';
import { readDelivery } from './deliveries.js';
import { assertProjectAvailable } from './project-deletion-barrier.js';
import { assertDeletionPathsAvailable } from './project-deletion-barrier.js';
import { OperationError } from './operations.js';
import { guarded } from './configuration-reads.js';
export interface DeliveryTargetPlan {
  operation_id: string; selection_operation_id: string | null; delivery_id: string; attempt_id: string; repository_id: string;
  local_path: string; local_identity: DeliveryTargetValue['local_identity']; branch_ref: string; task_type: DeliveryTargetValue['task_type'];
  task_description: string; issue_number: number; base_branch: string; base_sha: string; approved_ref: string; content_identity: string;
}
export function sealDeliveryTarget(db: Database.Database, plan: DeliveryTargetPlan): DeliveryTargetValue {
  return guarded(() => db.transaction(() => {
    const value: DeliveryTargetValue = { ...plan,format_version: 1,created_at_ms: Date.now() };
    if (!Value.Check(DeliveryTarget, value)) {
      throw new OperationError(400,'DELIVERY_TARGET_INVALID','A identidade do destino de entrega é inválida.');
    }
    const attempt = readAttempt(db,plan.attempt_id); const capture = readCapture(db,plan.attempt_id);
    const delivery = readDelivery(db,plan.delivery_id); assertProjectAvailable(db,attempt.projectId); assertDeletionPathsAvailable(db,[plan.local_path]);
    const chosenBranch = capture.configuration.configuration.delivery_branch;
    if (chosenBranch && (plan.branch_ref !== `refs/heads/${chosenBranch.name}` || plan.local_identity.branch_kind !== chosenBranch.kind)) {
      throw new OperationError(409,'DELIVERY_TARGET_AUTHORIZATION_INVALID','A branch de destino diverge da escolha capturada no início.');
    }
    const operation = db.prepare<[string,string,string], { kind: string; authorized_mode: string; state: string }>(`SELECT p.kind,p.authorized_mode,p.state
      FROM publication_requests p WHERE p.operation_id=? AND p.attempt_id=? AND p.delivery_id=?`).get(plan.operation_id,plan.attempt_id,plan.delivery_id);
    if (!operation || !['publication.complete','publication.authorize-upgrade'].includes(operation.kind) ||
        !['commit','pr'].includes(operation.authorized_mode) || !['accepted','running'].includes(operation.state) ||
        capture.issue.repository.id !== plan.repository_id || delivery.baseSha !== plan.base_sha || delivery.gitRef !== plan.approved_ref ||
        delivery.contentIdentity !== plan.content_identity || capture.issue.number !== plan.issue_number ||
        (capture.configuration.configuration.delivery_branch?.kind === 'existing' ? capture.configuration.configuration.delivery_branch.name : capture.configuration.configuration.base_branch) !== plan.base_branch) {
      throw new OperationError(409,'DELIVERY_TARGET_AUTHORIZATION_INVALID','O destino não corresponde à autorização e à versão aprovada atuais.');
    }
    const prior = db.prepare<[string,string], { operation_id: string }>('SELECT operation_id FROM delivery_targets WHERE attempt_id=? AND delivery_id=? ORDER BY created_at_ms,rowid LIMIT 1').get(plan.attempt_id,plan.delivery_id);
    if (prior) {
      const old = readDeliveryTarget(db,prior.operation_id);
      if (old.repository_id !== plan.repository_id || old.local_path.toLowerCase() !== plan.local_path.toLowerCase() ||
          old.selection_operation_id !== plan.selection_operation_id || old.base_sha !== plan.base_sha || old.content_identity !== plan.content_identity) {
        throw new OperationError(409,'DELIVERY_TARGET_CHANGED','O destino anterior permanece selado; reconcilie-o antes de escolher outro.');
      }
      return old;
    }
    try {
      db.prepare(`INSERT INTO delivery_targets(operation_id,selection_operation_id,delivery_id,attempt_id,repository_id,local_path,local_identity_json,
        branch_ref,task_type,task_description,issue_number,base_branch,base_sha,approved_ref,content_identity,format_version,created_at_ms)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(value.operation_id,value.selection_operation_id,value.delivery_id,value.attempt_id,value.repository_id,
          value.local_path,JSON.stringify(value.local_identity),value.branch_ref,value.task_type,value.task_description,value.issue_number,value.base_branch,
          value.base_sha,value.approved_ref,value.content_identity,value.format_version,value.created_at_ms);
    } catch (error) {
      if (String(error).includes('delivery_targets.repository_id') || String(error).includes('delivery_targets_repository_branch')) throw new OperationError(409,'DELIVERY_BRANCH_COLLISION','A branch foi reservada por outra entrega. Reconciliar a seleção da branch anterior preserva sua referência.');
      throw error;
    }
    return value;
  }).immediate());
}
export function readDeliveryTarget(db: Database.Database,operationId: string): DeliveryTargetValue {
  const row = db.prepare<[string], { operation_id: string; selection_operation_id: string | null; delivery_id: string; attempt_id: string; repository_id: string;
    local_path: string; local_identity_json: string; branch_ref: string; task_type: DeliveryTargetValue['task_type']; task_description: string;
    issue_number: number; base_branch: string; base_sha: string; approved_ref: string; content_identity: string; format_version: 1; created_at_ms: number }>(
      'SELECT * FROM delivery_targets WHERE operation_id=?').get(operationId);
  if (!row) throw new OperationError(404,'DELIVERY_TARGET_NOT_FOUND','A identidade do destino da entrega não foi encontrada.');
  readAttempt(db,row.attempt_id);
  const value: DeliveryTargetValue = { operation_id: row.operation_id,selection_operation_id: row.selection_operation_id,delivery_id: row.delivery_id,
    attempt_id: row.attempt_id,repository_id: row.repository_id,local_path: row.local_path,local_identity: JSON.parse(row.local_identity_json) as DeliveryTargetValue['local_identity'],
    branch_ref: row.branch_ref,task_type: row.task_type,task_description: row.task_description,issue_number: row.issue_number,base_branch: row.base_branch,
    base_sha: row.base_sha,approved_ref: row.approved_ref,content_identity: row.content_identity,format_version: row.format_version,created_at_ms: row.created_at_ms };
  if (!Value.Check(DeliveryTarget,value)) throw new OperationError(409,'DELIVERY_TARGET_DATA_INVALID','A identidade selada do destino está inválida.');
  return value;
}
export function findDeliveryTarget(db: Database.Database,attemptId: string,deliveryId: string): DeliveryTargetValue | null {
  readAttempt(db,attemptId);
  const row = db.prepare<[string,string],{ operation_id: string }>('SELECT operation_id FROM delivery_targets WHERE attempt_id=? AND delivery_id=? ORDER BY created_at_ms,rowid LIMIT 1').get(attemptId,deliveryId);
  return row ? readDeliveryTarget(db,row.operation_id) : null;
}
export function assertDeliveryTarget(db: Database.Database,operationId: string): DeliveryTargetValue {
  const value = readDeliveryTarget(db,operationId); const attempt = readAttempt(db,value.attempt_id);
  assertProjectAvailable(db,attempt.projectId); assertDeletionPathsAvailable(db,[value.local_path]); return value;
}

