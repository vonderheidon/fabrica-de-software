import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { DeletionInspection, DeletionPathObservation } from '../workspaces/index.js';
import { readProjectDeletionPaths } from './project-deletion-paths.js';
import { OperationError } from './operations.js';

export interface DeletionWorker { operationId: string; token: string; generation: number }
interface WorkerRow { project_id: string; worker_token: string | null; worker_generation: number; state: string; authorization_digest: string }
export function createDeletionWorkerPersistence(db: Database.Database, directory: string) {
  let recovered = false;
  const row = (id: string) => db.prepare<[string], WorkerRow>('SELECT * FROM project_deletions WHERE operation_id=?').get(id);
  const assert = (worker: DeletionWorker): WorkerRow => {
    const current = row(worker.operationId);
    if (!current || !worker.token ||
      current.worker_token !== worker.token || current.worker_generation !== worker.generation) {
      throw new OperationError(409, 'PROJECT_DELETION_OWNERSHIP_LOST', 'A execução mudou. Consulte o andamento.');
    }
    const operation = db.prepare<[string], { operation_kind: string; resource_type: string; resource_id: string }>(
      'SELECT operation_kind,resource_type,resource_id FROM operation_requests WHERE operation_id=?').get(worker.operationId);
    if (operation?.operation_kind !== 'project.delete' || operation.resource_type !== 'project' || operation.resource_id !== current.project_id) {
      throw new OperationError(409, 'PROJECT_DELETION_AUTHORIZATION_INVALID', 'A autorização persistida não pôde ser comprovada.');
    }
    return current;
  };
  return {
    attempts: (worker: DeletionWorker): string[] => {
      const current = assert(worker);
      return db.prepare<[string], { id: string }>('SELECT id FROM attempts WHERE project_id=? ORDER BY id')
        .all(current.project_id).map(attempt => attempt.id);
    },
    // Only controller composition, while holding the installation lock and before
    // creating any coordinator, may reconcile ownership of the dead process.
    recover: () => {
      if (recovered) return [];
      const operations = db.transaction(() => {
        db.prepare('UPDATE project_deletions SET worker_token=NULL,worker_generation=worker_generation+1').run();
        return db.prepare<[], { operation_id: string }>("SELECT operation_id FROM project_deletions WHERE state IN ('accepted','running','pending','finalizing') ORDER BY created_at_ms").all().map(r => r.operation_id);
      }).immediate();
      recovered = true;
      return operations;
    },
    claim: (id: string): DeletionWorker | null => db.transaction(() => {
      const current = row(id);
      if (!current || current.worker_token) return null;
      recovered = true;
      const worker = { operationId: id, token: randomUUID(), generation: current.worker_generation + 1 };
      db.prepare('UPDATE project_deletions SET worker_token=?,worker_generation=?,revision=revision+1,updated_at_ms=max(updated_at_ms,?) WHERE operation_id=? AND worker_token IS NULL')
        .run(worker.token, worker.generation, Date.now(), id);
      return worker;
    }).immediate(),
    start: (worker: DeletionWorker) => db.transaction(() => {
      assert(worker);
      db.prepare("UPDATE project_deletions SET state='running',reason=NULL,recovery=NULL,revision=revision+1,updated_at_ms=max(updated_at_ms,?) WHERE operation_id=?")
        .run(Date.now(), worker.operationId);
    }).immediate(),
    snapshot: (worker: DeletionWorker) => db.transaction(() => {
      const current = assert(worker);
      const input = readProjectDeletionPaths(db, current.project_id, directory, worker);
      const targets = db.prepare<[string], { target_key: string; target_kind: DeletionInspection['claims'][number]['kind']; authorized_path: string; resolved_path: string | null; object_kind: DeletionPathObservation['kind']; identity_json: string; owner_kind: DeletionInspection['claims'][number]['ownerKind']; owner_id: string }>('SELECT * FROM project_deletion_targets WHERE operation_id=? ORDER BY target_key').all(worker.operationId);
      const claims = targets.map(t => ({ key: t.target_key, kind: t.target_kind, path: t.authorized_path, ownerKind: t.owner_kind, ownerId: t.owner_id }));
      if (JSON.stringify(claims) !== JSON.stringify([...input.targets].sort((a,b) => a.key.localeCompare(b.key)))) {
        throw new OperationError(409, 'PROJECT_DELETION_TARGETS_CHANGED', 'O conjunto autorizado mudou. Confira os vínculos do projeto.');
      }
      const identities = targets.map(t => JSON.parse(t.identity_json) as { identity: string | null; ancestors: DeletionPathObservation['ancestors']; policy: string });
      const authorization: DeletionInspection = { claims, inventoryVersion: input.inventoryVersion,
        policyVersion: identities[0]?.policy ?? '', observations: targets.map((t,i) => ({ path: t.authorized_path, resolvedPath: t.resolved_path, kind: t.object_kind, identity: identities[i]!.identity, ancestors: identities[i]!.ancestors })),
        preview: { project_id: input.projectId, project_name: input.projectName, project_revision: input.projectRevision, source_kind: input.sourceKind, authorization_digest: current.authorization_digest, can_confirm: true, blockers: [], targets: [] } };
      return { input, authorization };
    })(),
    progress: (worker: DeletionWorker, key: string, state: 'removing' | 'removed') => db.transaction(() => {
      if (assert(worker).state !== 'running') throw new Error('PROJECT_DELETION_NOT_RUNNING');
      const result = db.prepare('UPDATE project_deletion_targets SET state=?,verified_at_ms=? WHERE operation_id=? AND target_key=?').run(state, state === 'removed' ? Date.now() : null, worker.operationId, key);
      if (result.changes !== 1) throw new Error('PROJECT_DELETION_TARGET_MISSING');
    }).immediate(),
    finish: (worker: DeletionWorker, state: 'pending' | 'reconfirmation_required' | 'finalizing', reason: string | null, recovery: string | null) => db.transaction(() => {
      assert(worker);
      db.prepare('UPDATE project_deletions SET state=?,reason=?,recovery=?,worker_token=NULL,revision=revision+1,updated_at_ms=max(updated_at_ms,?) WHERE operation_id=?')
        .run(state, reason, recovery, Date.now(), worker.operationId);
    }).immediate(),
  };
}
