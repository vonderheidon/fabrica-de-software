import type Database from 'better-sqlite3';
import { OperationError } from './operations.js';
import { deletionTables, identifier, keyExpression, primaryKey, projectDeletionInventory, type DeletionTable } from './project-deletion-inventory.js';

export interface FinalizeProjectDeletion {
  readonly operationId: string;
  readonly projectId: string;
  readonly workerGeneration: number;
  readonly workerToken: string;
}
interface Authorization {
  operation_id: string; project_id: string; worker_generation: number;
  worker_token: string | null; state: string; expected_revision: number;
}
interface FinalizationContext extends FinalizeProjectDeletion {
  readonly keys: ReadonlyMap<string, ReadonlySet<string>>;
  completing: boolean;
}

// Leaves before parents; preparation and project pointer cycles are the only
// intentional residual FK edges during deletion. SQLite checks them at commit.
const removalOrder: readonly DeletionTable[] = [
  'notification_dispatches',
  'attempt_stage_intervals',
  'events', 'effects', 'diagnostic_runs', 'creation_reconciliations', 'creation_board_operations', 'creation_steps',
  'delivery_targets', 'publication_target_selections', 'publication_upgrades', 'publication_requests', 'resource_removals', 'native_open_requests',
  'attempt_decisions', 'cancellation_requests', 'queue_consumptions', 'queue_cycles', 'attempt_authority',
  'finding_disputes', 'finding_assessments', 'attempt_blocks', 'finding_resolutions', 'findings', 'reviews',
  'capture_warnings', 'capture_runs', 'deliveries', 'criterion_results', 'passage_results',
  'passage_events', 'passage_measurements', 'execution_questions', 'terminal_occupancies', 'attempt_sessions', 'resources', 'passages',
  'rounds', 'attempt_criteria', 'attempt_workspace_snapshots', 'retained_history_migrations', 'attempts', 'preparation_revisions', 'preparations',
  'project_imports', 'project_creations', 'project_revisions', 'project_storage_transitions', 'project_storage_locations', 'projects', 'operation_requests',
  'project_deletion_targets', 'project_deletions',
];

/** Connection-owned capability. No context setter, HTTP flag, or persisted bypass. */
export function createProjectDeletionPersistence(db: Database.Database) {
  let context: FinalizationContext | undefined;
  db.function('factory_project_deletion_operation', () => context?.operationId ?? null);
  // SQL supplies live authority to the callback; callbacks never reenter SQLite.
  const active = (authority: string | null): boolean => {
    if (!context || !db.inTransaction) return false;
    const row = authority ? JSON.parse(authority) as Authorization : undefined;
    return row?.state === 'finalizing' && row.project_id === context.projectId &&
      row.operation_id === context.operationId &&
      row.worker_generation === context.workerGeneration && row.worker_token === context.workerToken;
  };
  db.function('factory_project_deletion_row_allowed', (table: string, key: string, authority: string | null) =>
    active(authority) && context?.keys.get(table)?.has(key) ? 1 : 0);
  db.function('factory_project_deletion_finalization_allowed', (operationId: string) =>
    context && db.inTransaction && context.completing && context.operationId === operationId ? 1 : 0);

  return {
    inventory: (projectId: string) => db.transaction(() => projectDeletionInventory(db, projectId))(),
    finalize: (command: FinalizeProjectDeletion): { operation_id: string; state: 'succeeded' } => {
      // A nested savepoint would extend deferral to an unrelated outer transaction.
      if (db.inTransaction || context) throw new Error('PROJECT_DELETION_TRANSACTION_REQUIRED');
      try {
        return db.transaction(() => {
          const row = db.prepare<[string], Authorization>('SELECT * FROM project_deletions WHERE operation_id=?').get(command.operationId);
          if (!row || row.project_id !== command.projectId || row.worker_generation !== command.workerGeneration ||
            row.worker_token !== command.workerToken || !command.workerToken ||
            !['running', 'finalizing'].includes(row.state)) {
            throw new OperationError(409, 'PROJECT_DELETION_OWNERSHIP_LOST', 'A execução mudou. Consulte novamente o andamento da exclusão.');
          }
          const operation = db.prepare<[string], { request_hash: string; operation_kind: string; resource_type: string; resource_id: string }>(
            'SELECT request_hash,operation_kind,resource_type,resource_id FROM operation_requests WHERE operation_id=?',
          ).get(command.operationId);
          const project = db.prepare<[string], { revision: number }>('SELECT revision FROM projects WHERE id=?').get(command.projectId);
          if (!operation || operation.operation_kind !== 'project.delete' || operation.resource_type !== 'project' ||
            operation.resource_id !== command.projectId || project?.revision !== row.expected_revision) {
            throw new OperationError(409, 'PROJECT_DELETION_AUTHORIZATION_INVALID', 'A autorização precisa ser conferida novamente.');
          }
          if (db.prepare(`SELECT 1 FROM project_deletion_targets WHERE operation_id=?
            AND (state<>'removed' OR verified_at_ms IS NULL) LIMIT 1`).get(command.operationId)) {
            throw new OperationError(409, 'PROJECT_DELETION_TARGETS_UNVERIFIED', 'Confirme a ausência de todas as pastas antes de concluir a exclusão.');
          }
          if (db.pragma('foreign_keys', { simple: true }) !== 1) throw new Error('PROJECT_DELETION_FOREIGN_KEYS_REQUIRED');
          const inventory = projectDeletionInventory(db, command.projectId);
          if (inventory.blockers.length) {
            throw new OperationError(409, inventory.blockers[0]?.code ?? 'PROJECT_DELETION_EXTERNAL_REFERENCE',
              'Resolva os vínculos compartilhados antes de excluir este projeto.');
          }
          // Freeze every exact key before the first DELETE, including composite PKs.
          context = { ...command, completing: false, keys: new Map(deletionTables.map(table => [table, new Set(inventory.keys[table])])) };
          db.prepare(`UPDATE project_deletions SET state='finalizing',revision=revision+1,updated_at_ms=max(updated_at_ms,?)
            WHERE operation_id=?`).run(Date.now(), command.operationId);
          db.pragma('defer_foreign_keys = ON');
          for (const table of removalOrder) {
            const pk = primaryKey(db, table);
            // Exact, captured keys remain valid after removal of their parents.
            db.prepare(`DELETE FROM ${identifier(table)} WHERE ${keyExpression(pk)} IN (SELECT value FROM json_each(?))`)
              .run(JSON.stringify(inventory.keys[table]));
          }
          for (const table of deletionTables) {
            if (db.prepare(`SELECT 1 FROM ${identifier(table)} WHERE ${keyExpression(primaryKey(db, table))}
              IN (SELECT value FROM json_each(?)) LIMIT 1`).get(JSON.stringify(inventory.keys[table]))) {
              throw new Error('PROJECT_DELETION_RESIDUE');
            }
          }
          const residual = projectDeletionInventory(db, command.projectId);
          if (deletionTables.some(table => residual.keys[table].length) || residual.blockers.length ||
            (db.pragma('foreign_key_check') as unknown[]).length) throw new Error('PROJECT_DELETION_INTEGRITY_FAILED');
          context.completing = true;
          db.prepare("INSERT INTO project_deletion_receipts(operation_id,request_fingerprint,result) VALUES (?,?,'succeeded')")
            .run(command.operationId, operation.request_hash);
          return { operation_id: command.operationId, state: 'succeeded' as const };
        }).immediate();
      } finally {
        // Also runs on callback errors, constraint failures, and commit rollback.
        context = undefined;
      }
    },
  };
}
