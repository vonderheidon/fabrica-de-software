import type Database from 'better-sqlite3';

// Explicit ownership, not a cascade from every inbound FK: a foreign queue cycle
// referencing our attempt must block deletion, never become part of our project.
const ownership = {
  projects: 'id = @projectId',
  project_storage_locations: 'project_id = @projectId',
  project_storage_transitions: 'project_id = @projectId',
  project_revisions: 'project_id = @projectId',
  preparations: 'project_id = @projectId',
  preparation_revisions: 'project_id = @projectId',
  attempts: 'project_id = @projectId',
  attempt_sessions: 'attempt_id IN (SELECT id FROM owned_attempts)',
  terminal_occupancies: 'attempt_id IN (SELECT id FROM owned_attempts)',
  attempt_criteria: 'attempt_id IN (SELECT id FROM owned_attempts)',
  rounds: 'attempt_id IN (SELECT id FROM owned_attempts)',
  passages: 'attempt_id IN (SELECT id FROM owned_attempts)',
  passage_results: 'passage_id IN (SELECT id FROM owned_passages)',
  criterion_results: 'passage_id IN (SELECT id FROM owned_passages)',
  passage_events: 'passage_id IN (SELECT id FROM owned_passages)',
  passage_measurements: 'passage_id IN (SELECT id FROM owned_passages)',
  execution_questions: 'passage_id IN (SELECT id FROM owned_passages)',
  resources: 'attempt_id IN (SELECT id FROM owned_attempts)',
  resource_removals: 'resource_id IN (SELECT id FROM owned_resources)',
  native_open_requests: 'resource_id IN (SELECT id FROM owned_resources)',
  cancellation_requests: 'attempt_id IN (SELECT id FROM owned_attempts)',
  attempt_decisions: 'attempt_id IN (SELECT id FROM owned_attempts)',
  attempt_stage_intervals: 'attempt_id IN (SELECT id FROM owned_attempts)',
  notification_dispatches: 'event_seq IN (SELECT seq FROM events WHERE attempt_id IN (SELECT id FROM owned_attempts) OR project_id=@projectId)',
  deliveries: 'attempt_id IN (SELECT id FROM owned_attempts)',
  capture_runs: 'delivery_id IN (SELECT id FROM owned_deliveries)',
  capture_warnings: 'delivery_id IN (SELECT id FROM owned_deliveries)',
  verification_runs: 'delivery_id IN (SELECT id FROM owned_deliveries)',
  checks: 'verification_id IN (SELECT id FROM owned_verification_runs)',
  artifacts: 'check_id IN (SELECT id FROM owned_checks)',
  reviews: 'delivery_id IN (SELECT id FROM owned_deliveries)',
  findings: 'review_id IN (SELECT id FROM owned_reviews)',
  finding_assessments: 'attempt_id IN (SELECT id FROM owned_attempts)',
  finding_disputes: 'attempt_id IN (SELECT id FROM owned_attempts)',
  attempt_blocks: 'attempt_id IN (SELECT id FROM owned_attempts)',
  finding_resolutions: 'review_id IN (SELECT id FROM owned_reviews)',
  delivery_targets: 'attempt_id IN (SELECT id FROM owned_attempts)',
  publication_target_selections: 'attempt_id IN (SELECT id FROM owned_attempts)',
  publication_requests: 'attempt_id IN (SELECT id FROM owned_attempts)',
  publication_upgrades: 'attempt_id IN (SELECT id FROM owned_attempts)',
  attempt_authority: 'attempt_id IN (SELECT id FROM owned_attempts)',
  queue_cycles: 'project_id = @projectId',
  queue_consumptions: 'project_id = @projectId',
  project_creations: 'project_id = @projectId',
  creation_steps: 'creation_id IN (SELECT id FROM owned_project_creations)',
  creation_board_operations: 'creation_id IN (SELECT id FROM owned_project_creations)',
  creation_reconciliations: 'creation_id IN (SELECT id FROM owned_project_creations)',
  effects: 'attempt_id IN (SELECT id FROM owned_attempts) OR creation_id IN (SELECT id FROM owned_project_creations)',
  diagnostic_runs: `project_id = @projectId OR creation_id IN (SELECT id FROM owned_project_creations)
    OR attempt_id IN (SELECT id FROM owned_attempts)`,
  project_deletions: 'project_id = @projectId',
  project_deletion_targets: 'operation_id IN (SELECT operation_id FROM owned_project_deletions)',
} as const;

export type DeletionTable = keyof typeof ownership | 'operation_requests' | 'events';
export interface DeletionBlock {
  readonly code: 'PROJECT_DELETION_EXTERNAL_REFERENCE' | 'PROJECT_DELETION_AMBIGUOUS_OWNERSHIP';
  readonly reason: string;
  readonly recovery: string;
  /** Private storage diagnostics; not operator-facing detail. */
  readonly table: string;
}
export interface ProjectDeletionInventory {
  readonly projectId: string;
  /** JSON arrays of primary-key values, in schema PK order. No project content. */
  readonly keys: Readonly<Record<DeletionTable, readonly string[]>>;
  readonly blockers: readonly DeletionBlock[];
}

interface Column { name: string; pk: number }
interface ForeignKey { id: number; seq: number; table: string; from: string; to: string }
export function identifier(name: string): string { return `"${name.replaceAll('"', '""')}"`; }
export function primaryKey(db: Database.Database, table: string): string[] {
  const columns = db.prepare<[string], Column>('SELECT name,pk FROM pragma_table_info(?) WHERE pk>0 ORDER BY pk').all(table);
  if (!columns.length) throw new Error('PROJECT_DELETION_INVENTORY_INVALID');
  return columns.map(column => column.name);
}
export function keyExpression(columns: readonly string[], alias?: string): string {
  return `json_array(${columns.map(column => `${alias ? `${identifier(alias)}.` : ''}${identifier(column)}`).join(',')})`;
}

// These are domain identities, not arbitrary strings or repository identities.
const domains = {
  project: ['projects', 'id'], preparation: ['preparations', 'id'],
  attempt: ['attempts', 'id'], passage: ['passages', 'id'],
  delivery: ['deliveries', 'id'], creation: ['project_creations', 'id'],
  question: ['execution_questions', 'id'], resource: ['resources', 'id'],
  effect: ['effects', 'operation_id'], diagnostic: ['diagnostic_runs', 'operation_id'],
  operation: ['operation_requests', 'operation_id'],
  notification: ['notification_dispatches', 'dispatch_id'],
} as const;

function domainPredicate(type: string, id: string, includeOperations: boolean): string {
  return Object.entries(domains).filter(([domain]) => includeOperations || domain !== 'operation')
    .map(([domain, [table, column]]) => domain === 'project'
      ? `(${type}='project' AND ${id}=@projectId)`
      : `(${type}='${domain}' AND ${id} IN (SELECT ${column} FROM owned_${table}))`).join(' OR ');
}

const operationSources = [
  ['attempts', 'operation_id'], ['project_creations', 'operation_id'], ['creation_board_operations', 'operation_id'],
  ['cancellation_requests', 'operation_id'], ['resource_removals', 'operation_id'],
  ['native_open_requests', 'operation_id'], ['capture_runs', 'operation_id'],
  ['execution_questions', 'answer_operation_id'], ['publication_requests', 'operation_id'],
  ['delivery_targets', 'operation_id'], ['publication_target_selections', 'operation_id'], ['effects', 'operation_id'], ['creation_reconciliations', 'operation_id'],
  ['diagnostic_runs', 'operation_id'], ['project_deletions', 'operation_id'],
] as const;

const cte = `WITH ${Object.entries(ownership).map(([table, where]) =>
  `owned_${table} AS (SELECT * FROM ${table} WHERE ${where})`).join(',\n')},
  owned_operation_requests AS (SELECT * FROM operation_requests WHERE
    resource_type IN (${Object.keys(domains).map(domain => `'${domain}'`).join(',')}) AND (
    ${domainPredicate('resource_type', 'resource_id', false)} OR operation_id IN (
      ${operationSources.map(([table, column]) => `SELECT ${column} FROM owned_${table}`).join(' UNION ')}))),
  owned_events AS (SELECT * FROM events WHERE project_id=@projectId
    OR attempt_id IN (SELECT id FROM owned_attempts)
    OR operation_id IN (SELECT operation_id FROM owned_operation_requests)
    OR ${domainPredicate('entity_type', 'entity_id', true)})`;

export const deletionTables: readonly DeletionTable[] = [...Object.keys(ownership) as (keyof typeof ownership)[], 'operation_requests', 'events'];

/** Caller supplies a read transaction (or the final IMMEDIATE transaction). */
export function projectDeletionInventory(db: Database.Database, projectId: string): ProjectDeletionInventory {
  const keys = {} as Record<DeletionTable, string[]>;
  const columns = new Map<string, string[]>();
  for (const table of deletionTables) {
    const pk = primaryKey(db, table);
    columns.set(table, pk);
    keys[table] = db.prepare<{ projectId: string }, { key: string }>(
      `${cte} SELECT ${keyExpression(pk)} AS key FROM owned_${table} ORDER BY ${pk.map(identifier).join(',')}`,
    ).all({ projectId }).map(row => row.key);
  }
  const blockers: DeletionBlock[] = [];
  const block = (table: string, ambiguous = false): void => {
    const code = ambiguous ? 'PROJECT_DELETION_AMBIGUOUS_OWNERSHIP' : 'PROJECT_DELETION_EXTERNAL_REFERENCE';
    if (blockers.some(item => item.table === table && item.code === code)) return;
    blockers.push({ code, table,
      reason: 'Há registros vinculados a outro cadastro ou a um contexto compartilhado.',
      recovery: 'Resolva o vínculo compartilhado antes de tentar excluir este projeto novamente.' });
  };
  // Inspect both directions of every real FK. Inbound foreign rows are blockers;
  // selected rows pointing to foreign exclusive parents are ambiguous ownership.
  const tables = db.prepare<[], { name: string }>("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  for (const { name: table } of tables) {
    const fks = db.prepare<[string], ForeignKey>('SELECT * FROM pragma_foreign_key_list(?) ORDER BY id,seq').all(table);
    for (const id of new Set(fks.map(fk => fk.id))) {
      const group = fks.filter(fk => fk.id === id);
      const parent = group[0]?.table;
      if (!parent || !columns.has(parent)) continue;
      const childColumns = columns.get(table);
      const childSelected = childColumns ? `${keyExpression(childColumns, 'child')} IN (SELECT value FROM json_each(@childKeys))` : '0';
      const parentSelected = `${keyExpression(columns.get(parent) ?? [], 'parent')} IN (SELECT value FROM json_each(@parentKeys))`;
      const join = group.map(fk => `child.${identifier(fk.from)}=parent.${identifier(fk.to)}`).join(' AND ');
      const args = { parentKeys: JSON.stringify(keys[parent as DeletionTable]), childKeys: JSON.stringify(keys[table as DeletionTable] ?? []) };
      const edges = db.prepare<typeof args, { external: number; ambiguous: number }>(`SELECT
        EXISTS(SELECT 1 FROM ${identifier(table)} child JOIN ${identifier(parent)} parent ON ${join}
          WHERE ${parentSelected} AND NOT (${childSelected})) AS external,
        EXISTS(SELECT 1 FROM ${identifier(table)} child JOIN ${identifier(parent)} parent ON ${join}
          WHERE ${childSelected} AND NOT (${parentSelected})) AS ambiguous`).get(args);
      if (edges?.external) block(table);
      if (edges?.ambiguous) block(table, true);
    }
  }
  // Domain references without FKs need the same cross-context checks. An
  // operation/event selected via one relation cannot hide another foreign owner.
  for (const [table, type, id] of [['operation_requests', 'resource_type', 'resource_id'], ['events', 'entity_type', 'entity_id']] as const) {
    const invalidDomain = db.prepare<{ projectId: string }, { invalid: number }>(`${cte} SELECT EXISTS(
      SELECT 1 FROM owned_${table} WHERE NOT (${domainPredicate(type, id, true)})) AS invalid`).get({ projectId });
    if (invalidDomain?.invalid) block(table, true);
  }
  return { projectId, keys, blockers };
}
