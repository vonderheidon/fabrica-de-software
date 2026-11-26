import { posix, win32 } from 'node:path';
import type Database from 'better-sqlite3';
import { OperationError } from './operations.js';

export const deletionRecovery = 'Acompanhe a exclusão deste projeto e aguarde sua conclusão.';
export function deletionOperation(db: Database.Database, projectId: string): string | null {
  return db.prepare<[string], { operation_id: string }>('SELECT operation_id FROM project_deletions WHERE project_id=?')
    .get(projectId)?.operation_id ?? null;
}
export function deletionPending(operationId: string): never {
  throw new OperationError(409, 'PROJECT_DELETION_PENDING', 'Este projeto tem uma exclusão pendente.', {
    recovery: deletionRecovery, facts: { operation_id: operationId },
  });
}
/** Called within the transaction that grants work, never just in middleware. */
export function assertProjectAvailable(db: Database.Database, projectId: string): void {
  const operationId = deletionOperation(db, projectId);
  if (operationId) deletionPending(operationId);
  {
    const transition = db.prepare<[string], { operation_id: string }>(`SELECT operation_id FROM project_storage_transitions
      WHERE project_id=? AND state IN ('planned','running','uncertain','blocked')`).get(projectId);
    if (transition) throw new OperationError(409, 'PROJECT_STORAGE_TRANSITION_ACTIVE', 'A transição desta área gerenciada precisa ser concluída ou reconciliada.', {
      affected_requirements: ['RF-67','RF-68'], recovery: 'Consulte a operação da transição e retome a mesma autorização antes de iniciar outras ações no projeto.',
    });
  }
}
export function assertAttemptProjectAvailable(db: Database.Database, attemptId: string): void {
  const row = db.prepare<[string], { project_id: string }>('SELECT project_id FROM attempts WHERE id=?').get(attemptId);
  if (row) assertProjectAvailable(db, row.project_id);
}

export function normalizedDeletionPath(path: string): string {
  const windows = /^[A-Za-z]:[\\/]/u.test(path);
  const paths = windows ? win32 : posix;
  if (!paths.isAbsolute(path) || /[\u0000-\u001f]/u.test(path)) {
    throw new OperationError(409, 'PROJECT_DELETION_PATH_UNCERTAIN', 'O vínculo não tem um caminho absoluto conferido.', {
      recovery: 'Confira a origem ou a pasta antes de salvar o vínculo.',
    });
  }
  const normalized = paths.normalize(path).replace(/[\\/]$/u, '');
  return windows ? normalized.toLowerCase() : normalized;
}
function overlaps(a: string, b: string): boolean {
  const separator = /^[A-Za-z]:/u.test(a) ? '\\' : '/';
  return a === b || a.startsWith(`${b}${separator}`) || b.startsWith(`${a}${separator}`);
}
/** Candidates include the supplied lexical and the externally inspected canonical path.
 * No filesystem call is allowed here. Pending targets keep both representations.
 */
export function assertDeletionPathsAvailable(db: Database.Database, candidates: readonly string[]): void {
  if (!candidates.length) return;
  const targets = db.prepare<[], { operation_id: string; authorized_path: string; resolved_path: string | null; identity_json: string }>(
    'SELECT operation_id,authorized_path,resolved_path,identity_json FROM project_deletion_targets ORDER BY operation_id,target_key',
  ).all();
  if (!targets.length) return;
  for (const candidate of candidates) {
    const path = normalizedDeletionPath(candidate);
    for (const target of targets) {
      let effective = target.resolved_path;
      if (effective === null) {
        const metadata = JSON.parse(target.identity_json) as { ancestors?: { path: string; resolvedPath: string }[] };
        const parent = metadata.ancestors?.at(-1);
        const paths = /^[A-Za-z]:[\\/]/u.test(target.authorized_path) ? win32 : posix;
        if (parent) effective = paths.resolve(parent.resolvedPath, paths.relative(parent.path, target.authorized_path));
      }
      if ([target.authorized_path, effective].some(value => value !== null && overlaps(path, normalizedDeletionPath(value)))) {
        deletionPending(target.operation_id);
      }
    }
  }
}
