import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { OperationId, ProjectImportRequest, ProjectImportView, type ProjectConfiguration, type ProjectImportStep, type ProjectImportStepName } from '#contracts';
import { serializeOperationReceipt } from './common-json.js';
import { digest, guarded } from './configuration-reads.js';
import { registerProject } from './configuration-writes.js';
import { StorageError } from './errors.js';
import { OperationError, readOperation, type StoredOperation } from './operations.js';
import { assertDeletionPathsAvailable } from './project-deletion-barrier.js';
import { readSettings } from './settings.js';

export interface ProjectImportCommand { operationId: string; body: ProjectImportRequest }
/** Server-derived facts of an accepted import; storage never resolves paths or parses URLs. */
export interface ProjectImportPlan { projectsRoot: string; destination: string; repositoryUrl: string }
export interface ProjectImportAdvance {
  step: ProjectImportStepName;
  repositoryId?: string;
  baseBranch?: string;
  adopted?: boolean;
  createdDirectoryIdentity?: string;
}
export type ProjectImportCleanup = ProjectImportView['cleanup'];
/** Internal worker view: everything the coordinator needs to continue from the durable step. */
export interface ProjectImportWork {
  id: string; operationId: string; name: string; repositoryUrl: string; repositoryId: string | null; baseBranch: string | null;
  projectsRoot: string; destination: string; step: ProjectImportStepName; state: ProjectImportView['state'];
  adopted: boolean; createdDirectoryIdentity: string | null; revision: number;
}

interface Row {
  id: string; operation_id: string; installation_id: string; account_id: string | null; project_id: string | null; name: string; repository_url: string;
  repository_id: string | null; base_branch: string | null; projects_root: string; destination: string; step: ProjectImportStepName;
  state: ProjectImportView['state']; adopted: number; created_directory_identity: string | null; cleanup: ProjectImportCleanup;
  diagnostic: string | null; revision: number; created_at_ms: number; updated_at_ms: number;
}
const stepOrder = ['repository', 'reservation', 'clone', 'verification', 'registration'] as const satisfies readonly ProjectImportStepName[];
const route = '/api/v1/projects/imports';

function hashCommand(command: ProjectImportCommand): string {
  if (!Value.Check(OperationId, command.operationId) || !Value.Check(ProjectImportRequest, command.body)) {
    throw new OperationError(400, 'IMPORT_COMMAND_INVALID', 'O cadastro por URL é inválido.');
  }
  return digest({ method: 'POST', route, body: command.body });
}
function event(db: Database.Database, id: string, type: string): number | bigint {
  const row = db.prepare<[string], { operation_id: string; revision: number }>('SELECT operation_id,revision FROM project_imports WHERE id=?').get(id)!;
  return db.prepare("INSERT INTO events(entity_type,entity_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms) VALUES ('project_import',?,?,?,?,'{}',?)")
    .run(id, row.operation_id, type, row.revision, Date.now()).lastInsertRowid;
}
function readRow(db: Database.Database, id: string): Row | undefined {
  const s = readSettings(db);
  return db.prepare<[string, string, string | null], Row>('SELECT * FROM project_imports WHERE id=? AND installation_id=? AND account_id IS ?').get(id, s.installation_id, s.account_id);
}
function requireRow(db: Database.Database, id: string): Row {
  if (!Value.Check(OperationId, id)) throw new OperationError(400, 'IMPORT_ID_INVALID', 'O identificador do cadastro deve ser um UUID.');
  const row = readRow(db, id);
  if (!row) throw new OperationError(404, 'PROJECT_IMPORT_NOT_FOUND', 'Cadastro por URL não encontrado no contexto atual.');
  return row;
}
function steps(row: Row): ProjectImportStep[] {
  const current = stepOrder.indexOf(row.step);
  return stepOrder.map((step, index): ProjectImportStep => {
    const skipped = step === 'clone' && row.adopted === 1 && (index < current || row.state === 'completed');
    if (skipped) return { step, state: 'skipped' };
    if (row.state === 'completed' || index < current) return { step, state: 'confirmed' };
    if (index > current) return { step, state: 'not_started' };
    return { step, state: row.state === 'accepted' ? 'not_started' : row.state === 'failed' ? 'failed' : 'running' };
  });
}
function view(row: Row): ProjectImportView {
  const value: ProjectImportView = {
    id: row.id, operation_id: row.operation_id, state: row.state, name: row.name, repository_url: row.repository_url,
    repository_id: row.repository_id, base_branch: row.base_branch, destination: row.destination, adopted: row.adopted === 1,
    steps: steps(row), project_id: row.project_id, diagnostic: row.diagnostic, cleanup: row.cleanup, revision: row.revision,
    created_at_ms: row.created_at_ms, updated_at_ms: row.updated_at_ms,
  };
  if (!Value.Check(ProjectImportView, value)) throw new StorageError('OPERATION_DATA_INVALID');
  return value;
}
function sameFolder(column: string): string { return `lower(rtrim(replace(${column},'\\','/'),'/'))`; }

export function recoverProjectImport(db: Database.Database, command: ProjectImportCommand): StoredOperation | null {
  const hash = hashCommand(command); const settings = readSettings(db);
  const prior = db.prepare<[string], { request_hash: string; installation_id: string; account_id: string | null }>(
    'SELECT request_hash,installation_id,account_id FROM operation_requests WHERE operation_id=?').get(command.operationId);
  if (!prior) return null;
  if (prior.request_hash !== hash || prior.installation_id !== settings.installation_id || prior.account_id !== settings.account_id) {
    throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'A operação conflita com um comando já aceito.');
  }
  const operation = readOperation(db, command.operationId);
  if (!operation) throw new StorageError('OPERATION_DATA_INVALID');
  return operation;
}

export interface ProjectImportAcceptance { created: boolean; operation: StoredOperation }
export function acceptProjectImport(db: Database.Database, command: ProjectImportCommand, plan: ProjectImportPlan): ProjectImportAcceptance {
  return guarded(() => db.transaction(() => {
    const prior = recoverProjectImport(db, command); if (prior) return { created: false, operation: prior };
    const settings = readSettings(db);
    if (!settings.projects_root || settings.projects_root !== plan.projectsRoot) {
      throw new OperationError(409, 'PROJECTS_ROOT_REQUIRED', 'Defina a Pasta dos projetos nas configurações antes de cadastrar por URL.',
        { recovery: 'Escolha a Pasta dos projetos e tente novamente.' });
    }
    assertDeletionPathsAvailable(db, [plan.destination]);
    const reserved = db.prepare<[string, string, string, string], { reason: string }>(
      `SELECT 'import' AS reason FROM project_imports WHERE destination=? COLLATE NOCASE AND state IN ('accepted','running')
       UNION ALL SELECT 'creation' FROM project_creations WHERE destination=? COLLATE NOCASE AND state<>'failed'
       UNION ALL SELECT 'project' FROM projects p JOIN project_revisions r ON r.id=p.current_revision_id AND r.project_id=p.id
         WHERE r.source_kind='local' AND ${sameFolder('r.source_location')}=${sameFolder('?')}
       UNION ALL SELECT 'project' FROM project_imports WHERE state='completed' AND ${sameFolder('destination')}=${sameFolder('?')} LIMIT 1`,
    ).get(plan.destination, plan.destination, plan.destination, plan.destination);
    if (reserved) throw new OperationError(409, 'IMPORT_DESTINATION_RESERVED', 'Esta pasta já está reservada por outro cadastro ou projeto.',
      { recovery: 'Escolha outro nome de pasta.' });
    const id = randomUUID(); const now = Date.now();
    db.prepare("INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json) VALUES (?,?,?,'project.import','project_import',?,?,'{}',NULL)")
      .run(command.operationId, settings.installation_id, settings.account_id, id, hashCommand(command));
    db.prepare(`INSERT INTO project_imports(id,operation_id,installation_id,account_id,name,repository_url,base_branch,projects_root,destination,step,state,created_at_ms,updated_at_ms)
      VALUES (?,?,?,?,?,?,?,?,?,'repository','accepted',?,?)`)
      .run(id, command.operationId, settings.installation_id, settings.account_id, command.body.name, plan.repositoryUrl, command.body.base_branch ?? null,
        plan.projectsRoot, plan.destination, now, now);
    const seq = event(db, id, 'project_import.accepted');
    db.prepare('UPDATE operation_requests SET receipt_json=? WHERE operation_id=?')
      .run(serializeOperationReceipt({ revision: 1, event_cursor: String(seq) }), command.operationId);
    return { created: true, operation: readOperation(db, command.operationId)! };
  }).immediate());
}

export function readProjectImport(db: Database.Database, id: string): ProjectImportView {
  return guarded(() => db.transaction(() => view(requireRow(db, id)))());
}
export function readProjectImportWork(db: Database.Database, id: string): ProjectImportWork {
  return guarded(() => db.transaction(() => {
    const r = requireRow(db, id);
    return { id: r.id, operationId: r.operation_id, name: r.name, repositoryUrl: r.repository_url, repositoryId: r.repository_id, baseBranch: r.base_branch,
      projectsRoot: r.projects_root, destination: r.destination, step: r.step, state: r.state, adopted: r.adopted === 1,
      createdDirectoryIdentity: r.created_directory_identity, revision: r.revision };
  })());
}
/** Accepted or running imports of the current installation and account, oldest first. */
export function resumableProjectImports(db: Database.Database): string[] {
  const s = readSettings(db);
  return db.prepare<[string, string | null], { id: string }>(
    "SELECT id FROM project_imports WHERE state IN ('accepted','running') AND installation_id=? AND account_id IS ? ORDER BY created_at_ms,id").all(s.installation_id, s.account_id)
    .map(row => row.id);
}

function activeRow(db: Database.Database, id: string, revision: number): Row {
  const row = requireRow(db, id);
  if (row.revision !== revision || (row.state !== 'accepted' && row.state !== 'running')) {
    throw new OperationError(409, 'IMPORT_REVISION_CONFLICT', 'O cadastro por URL mudou durante a execução.');
  }
  return row;
}
/** Records the step now running; earlier steps are implied confirmed (or skipped when adopted). One event per revision: `events(operation_id, entity_revision)` is unique. */
export function advanceProjectImport(db: Database.Database, id: string, revision: number, patch: ProjectImportAdvance): ProjectImportView {
  return guarded(() => db.transaction(() => {
    const row = activeRow(db, id, revision);
    const adopted = patch.adopted === undefined ? row.adopted : Number(patch.adopted);
    if (stepOrder.indexOf(patch.step) < stepOrder.indexOf(row.step) || (patch.createdDirectoryIdentity !== undefined && adopted === 1)) {
      throw new StorageError('OPERATION_DATA_INVALID');
    }
    const changed = db.prepare(`UPDATE project_imports SET step=?,state='running',repository_id=coalesce(?,repository_id),base_branch=coalesce(?,base_branch),
      adopted=?,created_directory_identity=coalesce(?,created_directory_identity),revision=revision+1,updated_at_ms=? WHERE id=? AND revision=?`)
      .run(patch.step, patch.repositoryId ?? null, patch.baseBranch ?? null, adopted, patch.createdDirectoryIdentity ?? null, Date.now(), id, revision);
    if (changed.changes !== 1) throw new OperationError(409, 'IMPORT_REVISION_CONFLICT', 'O cadastro por URL mudou durante a execução.');
    if (row.state !== 'running' || patch.step !== row.step) event(db, id, `project_import.${patch.step}.running`);
    return view(readRow(db, id)!);
  }).immediate());
}

export interface ProjectImportCompletion { source: ProjectConfiguration['source']; originNotes: readonly string[] }
/** Registers the project and completes the import in one transaction: no project without a completed import, and the reverse. */
export function completeProjectImport(db: Database.Database, id: string, revision: number, completion: ProjectImportCompletion): ProjectImportView {
  return guarded(() => db.transaction(() => {
    const row = activeRow(db, id, revision);
    if (row.step !== 'registration' || row.state !== 'running' || !row.base_branch || !row.repository_id ||
        completion.source.kind !== 'local' || completion.source.repository_id !== row.repository_id) throw new StorageError('OPERATION_DATA_INVALID');
    const registration = registerProject(db, { operationId: randomUUID(), expectedRevision: undefined,
      body: { name: row.name, base_branch: row.base_branch, source: { kind: 'local', location: row.destination } },
      source: completion.source, originNotes: completion.originNotes });
    const changed = db.prepare("UPDATE project_imports SET project_id=?,state='completed',diagnostic=NULL,revision=revision+1,updated_at_ms=? WHERE id=? AND revision=?")
      .run(registration.resource.id, Date.now(), id, revision);
    if (changed.changes !== 1) throw new OperationError(409, 'IMPORT_REVISION_CONFLICT', 'O cadastro por URL mudou durante a execução.');
    event(db, id, 'project_import.completed');
    return view(readRow(db, id)!);
  }).immediate());
}

/** `cleanup` records what happened to a folder this import created; adopted and pre-existing folders are never removed. */
export function failProjectImport(db: Database.Database, id: string, revision: number, diagnostic: string, cleanup: ProjectImportCleanup): ProjectImportView {
  return guarded(() => db.transaction(() => {
    if (!/^[A-Z0-9_]{1,128}$/.test(diagnostic)) throw new StorageError('OPERATION_DATA_INVALID');
    activeRow(db, id, revision);
    const changed = db.prepare("UPDATE project_imports SET state='failed',diagnostic=?,cleanup=?,revision=revision+1,updated_at_ms=? WHERE id=? AND revision=?")
      .run(diagnostic, cleanup, Date.now(), id, revision);
    if (changed.changes !== 1) throw new OperationError(409, 'IMPORT_REVISION_CONFLICT', 'O cadastro por URL mudou durante a execução.');
    event(db, id, 'project_import.failed');
    return view(readRow(db, id)!);
  }).immediate());
}
