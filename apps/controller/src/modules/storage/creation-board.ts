import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { CreationBoardOperation, OperationId, type CreationBoardOperation as BoardOperation, type CreationBoardOperationKind } from '#contracts';
import { OperationError } from './operations.js';
import { StorageError } from './errors.js';
import { digest } from './configuration-reads.js';
import { readSettings } from './settings.js';
import { serializeOperationReceipt } from './common-json.js';

export interface BoardOperationIntent {
  readonly creationId: string;
  readonly operationId: string;
  readonly kind: CreationBoardOperationKind;
  readonly scopeKey: string;
  readonly authorization: BoardOperation['authorization'];
  readonly expectedIdentity: BoardOperation['expected_identity'];
}
interface Row {
  operation_id: string; creation_id: string; kind: CreationBoardOperationKind; scope_key: string; state: BoardOperation['state'];
  revision: number; request_hash: string; authorization_json: string; expected_identity_json: string; receipt_json: string | null;
  reason: string | null; created_at_ms: number; sent_at_ms: number | null; confirmed_at_ms: number | null;
}
function hash(input: BoardOperationIntent): string {
  if (!Value.Check(OperationId, input.creationId) || !Value.Check(OperationId, input.operationId) ||
      !Value.Check(CreationBoardOperation.properties.kind, input.kind) || !Value.Check(CreationBoardOperation.properties.scope_key, input.scopeKey) ||
      !Value.Check(CreationBoardOperation.properties.authorization, input.authorization) ||
      !Value.Check(CreationBoardOperation.properties.expected_identity, input.expectedIdentity)) {
    throw new OperationError(400, 'CREATION_BOARD_COMMAND_INVALID', 'The board operation is invalid.');
  }
  return digest({ formatVersion: 1, kind: input.kind, scopeKey: input.scopeKey, authorization: input.authorization, expectedIdentity: input.expectedIdentity });
}
function view(row: Row): BoardOperation {
  const result: BoardOperation = { operation_id: row.operation_id, creation_id: row.creation_id, kind: row.kind, scope_key: row.scope_key,
    state: row.state, revision: row.revision, request_hash: row.request_hash, authorization: JSON.parse(row.authorization_json) as BoardOperation['authorization'],
    expected_identity: JSON.parse(row.expected_identity_json) as BoardOperation['expected_identity'],
    receipt: row.receipt_json === null ? null : JSON.parse(row.receipt_json) as NonNullable<BoardOperation['receipt']>, reason: row.reason,
    created_at_ms: row.created_at_ms, sent_at_ms: row.sent_at_ms, confirmed_at_ms: row.confirmed_at_ms };
  if (!Value.Check(CreationBoardOperation, result)) throw new StorageError('OPERATION_DATA_INVALID');
  return result;
}
function event(db: Database.Database, creationId: string, operationId: string, type: string, revision: number): number | bigint {
  return db.prepare(`INSERT INTO events(entity_type,entity_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms)
    VALUES ('creation',?,?,?,?,'{}',?)`).run(creationId, operationId, type, revision, Date.now()).lastInsertRowid;
}
function operation(db: Database.Database, operationId: string): Row {
  const settings = readSettings(db);
  const row = db.prepare<[string, string, string | null], Row>(`SELECT b.* FROM creation_board_operations b JOIN project_creations c ON c.id=b.creation_id
    WHERE b.operation_id=? AND c.installation_id=? AND c.account_id IS ?`).get(operationId, settings.installation_id, settings.account_id);
  if (!row) throw new OperationError(404, 'CREATION_BOARD_OPERATION_NOT_FOUND', 'Board operation not found in the current scope.');
  return row;
}
function updateGenericReceipt(db: Database.Database, operationId: string, revision: number, seq: number | bigint): void {
  const receipt = serializeOperationReceipt({ revision, event_cursor: String(seq) });
  db.prepare('UPDATE operation_requests SET receipt_json=? WHERE operation_id=?').run(receipt, operationId);
}
export function listCreationBoardOperations(db: Database.Database, creationId: string): BoardOperation[] {
  if (!Value.Check(OperationId, creationId)) throw new OperationError(400, 'CREATION_ID_INVALID', 'Creation ID must be a UUID.');
  const settings = readSettings(db);
  const creation = db.prepare<[string, string, string | null], { id: string }>('SELECT id FROM project_creations WHERE id=? AND installation_id=? AND account_id IS ?')
    .get(creationId, settings.installation_id, settings.account_id);
  if (!creation) throw new OperationError(404, 'CREATION_NOT_FOUND', 'Creation not found in the current scope.');
  return db.prepare<[string], Row>('SELECT * FROM creation_board_operations WHERE creation_id=? ORDER BY created_at_ms,operation_id').all(creationId).map(view);
}
export function recordCreationBoardIntent(db: Database.Database, input: BoardOperationIntent): BoardOperation {
  return db.transaction(() => {
    const requestHash = hash(input);
    const settings = readSettings(db);
    const creation = db.prepare<[string, string, string | null], { operation_id: string; plan_hash: string; plan_json: string; state: string; baseline_sha: string | null }>(
      'SELECT operation_id,plan_hash,plan_json,state,baseline_sha FROM project_creations WHERE id=? AND installation_id=? AND account_id IS ?')
      .get(input.creationId, settings.installation_id, settings.account_id);
    if (!creation) throw new OperationError(404, 'CREATION_NOT_FOUND', 'Creation not found in the current scope.');
    const plan = JSON.parse(creation.plan_json) as { input?: { creationMode?: string; name?: string; boardName?: string; remote?: { ownerId?: string } }; installationId?: string; account?: { id?: string | null } };
    const auth = input.authorization; const expected = input.expectedIdentity;
    const effects = db.prepare<[string], { kind: string; state: string; receipt_json: string | null }>('SELECT kind,state,receipt_json FROM effects WHERE creation_id=?').all(input.creationId);
    const repository = effects.find(item => item.kind === 'create_repository' && item.state === 'confirmed');
    let repositoryId: string | null = null;
    try { repositoryId = repository?.receipt_json ? (JSON.parse(repository.receipt_json) as { repositoryId?: string }).repositoryId ?? null : null; } catch { repositoryId = null; }
    const confirmedBoards = db.prepare<[string], Row>("SELECT * FROM creation_board_operations WHERE creation_id=? AND state='confirmed'").all(input.creationId).map(view);
    const priorBoardCount = db.prepare<[string], { count: number }>('SELECT count(*) AS count FROM creation_board_operations WHERE creation_id=?').get(input.creationId)!.count;
    const authorizedBoardName = plan.input?.boardName ?? (priorBoardCount > 0 ? plan.input?.name : undefined);
    const priorReceipt = (kind: CreationBoardOperationKind) => confirmedBoards.find(item => item.kind === kind)?.receipt ?? null;
    const createdBoard = priorReceipt('create_board'); const configuredStatus = priorReceipt('configure_status');
    const linkedRepository = priorReceipt('link_repository'); const configuredView = priorReceipt('configure_view');
    const boardDependenciesMatch = input.kind === 'create_board'
      ? expected.project_id === null && expected.status_field_id === null && expected.view_id === null
      : input.kind === 'configure_status'
        ? Boolean(createdBoard?.project_id && expected.project_id === createdBoard.project_id && expected.status_field_id === null && expected.view_id === null)
        : input.kind === 'link_repository'
          ? Boolean(createdBoard?.project_id && configuredStatus?.status_field_id && expected.project_id === createdBoard.project_id &&
            expected.status_field_id === configuredStatus.status_field_id && expected.view_id === null)
          : input.kind === 'configure_view'
            ? Boolean(createdBoard?.project_id && configuredStatus?.status_field_id && linkedRepository && expected.project_id === createdBoard.project_id &&
              expected.status_field_id === configuredStatus.status_field_id && expected.view_id === null)
            : Boolean(createdBoard?.project_id && configuredStatus?.status_field_id && linkedRepository && configuredView?.view_id &&
              expected.project_id === createdBoard.project_id && expected.status_field_id === configuredStatus.status_field_id && expected.view_id === configuredView.view_id);
    if (!['running','partial','failed'].includes(creation.state) || !creation.baseline_sha ||
        !db.prepare("SELECT 1 FROM creation_steps WHERE creation_id=? AND step='baseline' AND state='confirmed'").get(input.creationId) ||
        !repositoryId || !settings.account_id || auth.account_id !== plan.account?.id ||
        auth.source_operation_id !== creation.operation_id || auth.creation_id !== input.creationId ||
        auth.account_id !== settings.account_id || auth.plan_hash !== creation.plan_hash || expected.owner_id !== plan.input?.remote?.ownerId ||
        !authorizedBoardName || expected.board_name !== authorizedBoardName || expected.repository_id !== repositoryId || !boardDependenciesMatch ||
        expected.marker !== `Factory-Board:${plan.installationId}:${input.creationId}:${creation.plan_hash}` || expected.view_name !== 'Kanban' ||
        expected.expected_status_names.join('|') !== 'Backlog|Ready|In progress|In review|Done' || expected.view_layout !== 'BOARD_LAYOUT' ||
        auth.actions.join('|') !== 'create_board|configure_status|link_repository|configure_view|verify_board' ||
        ['create_board','configure_status','link_repository','configure_view','verify_board'].some(kind => !auth.actions.includes(kind as CreationBoardOperationKind))) {
      throw new OperationError(409, 'CREATION_BOARD_AUTHORITY_INVALID', 'Board authorization no longer matches the accepted creation.');
    }
    const existingScope = db.prepare<[string, CreationBoardOperationKind, string], Row>(
      'SELECT * FROM creation_board_operations WHERE creation_id=? AND kind=? AND scope_key=?').get(input.creationId, input.kind, input.scopeKey);
    if (existingScope) {
      const prior = view(existingScope);
      if (prior.request_hash !== requestHash) throw new OperationError(409, 'CREATION_BOARD_SCOPE_CONFLICT', 'This board effect has a different confirmed identity.');
      return prior;
    }
    const existingOperation = db.prepare<[string], { request_hash: string; installation_id: string; account_id: string | null }>(
      'SELECT request_hash,installation_id,account_id FROM operation_requests WHERE operation_id=?').get(input.operationId);
    if (existingOperation) {
      if (existingOperation.request_hash !== requestHash || existingOperation.installation_id !== settings.installation_id || existingOperation.account_id !== settings.account_id) {
        throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'The board operation ID belongs to a different command.');
      }
      const prior = db.prepare<[string], Row>('SELECT * FROM creation_board_operations WHERE operation_id=?').get(input.operationId);
      if (!prior) throw new StorageError('OPERATION_DATA_INVALID');
      return view(prior);
    }
    const now = Date.now();
    db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json)
      VALUES (?,?,?,'scaffold.board.effect','creation',? ,?,'{}',NULL)`)
      .run(input.operationId, settings.installation_id, settings.account_id, input.creationId, requestHash);
    db.prepare(`INSERT INTO creation_board_operations(operation_id,creation_id,kind,scope_key,state,revision,request_hash,authorization_json,
      expected_identity_json,receipt_json,reason,created_at_ms,sent_at_ms,confirmed_at_ms) VALUES (?,?,?,?, 'not_started',1,?,?,?,NULL,NULL,?,NULL,NULL)`)
      .run(input.operationId, input.creationId, input.kind, input.scopeKey, requestHash, JSON.stringify(input.authorization), JSON.stringify(input.expectedIdentity), now);
    const seq = event(db, input.creationId, input.operationId, `creation.board.${input.kind}.accepted`, 1);
    updateGenericReceipt(db, input.operationId, 1, seq);
    const row = db.prepare<[string], Row>('SELECT * FROM creation_board_operations WHERE operation_id=?').get(input.operationId);
    if (!row) throw new StorageError('OPERATION_DATA_INVALID');
    return view(row);
  }).immediate();
}
export function claimCreationBoardOperation(db: Database.Database, operationId: string, revision: number): BoardOperation | null {
  return db.transaction(() => {
    const current = view(operation(db, operationId));
    if (current.revision !== revision || current.state !== 'not_started') return null;
    const result = db.prepare(`UPDATE creation_board_operations SET state='running',revision=revision+1,reason=NULL WHERE operation_id=? AND revision=? AND state='not_started'`)
      .run(operationId, revision);
    if (result.changes !== 1) return null;
    const row = operation(db, operationId); event(db, current.creation_id, operationId, `creation.board.${current.kind}.running`, row.revision);
    return view(row);
  }).immediate();
}
export function markCreationBoardOperationSent(db: Database.Database, operationId: string, revision: number): BoardOperation {
  return db.transaction(() => {
    const current = view(operation(db, operationId));
    if (current.revision !== revision || current.state !== 'running' || current.sent_at_ms !== null) throw new OperationError(409, 'CREATION_BOARD_OPERATION_CHANGED', 'The board operation changed before sending.');
    db.prepare('UPDATE creation_board_operations SET sent_at_ms=?,revision=revision+1 WHERE operation_id=? AND revision=?').run(Date.now(), operationId, revision);
    const row = operation(db, operationId); event(db, row.creation_id, operationId, `creation.board.${row.kind}.sent`, row.revision);
    return view(row);
  }).immediate();
}
export function finishCreationBoardOperation(db: Database.Database, operationId: string, revision: number, state: 'confirmed' | 'failed_known' | 'unknown', receipt: NonNullable<BoardOperation['receipt']> | null, reason: string | null): BoardOperation {
  return db.transaction(() => {
    const current = view(operation(db, operationId));
    const reconciling = current.state === 'unknown' && state === 'confirmed';
    if (current.revision !== revision || (current.state !== 'running' && !reconciling) || (state === 'confirmed') !== (receipt !== null) ||
        (reason !== null && !/^[A-Z0-9_]{1,128}$/.test(reason)) || (receipt !== null && !Value.Check(CreationBoardOperation.properties.receipt, receipt))) {
      throw new OperationError(409, 'CREATION_BOARD_OPERATION_CHANGED', 'The board operation result does not match its current intent.');
    }
    const now = Date.now();
    db.prepare('UPDATE creation_board_operations SET state=?,revision=revision+1,receipt_json=?,reason=?,confirmed_at_ms=? WHERE operation_id=? AND revision=?')
      .run(state, receipt === null ? null : JSON.stringify(receipt), reason, state === 'confirmed' ? now : null, operationId, revision);
    const row = operation(db, operationId); event(db, row.creation_id, operationId, `creation.board.${row.kind}.${state}`, row.revision);
    return view(row);
  }).immediate();
}
export function markRunningCreationBoardOperationsUnknown(db: Database.Database, creationId: string, diagnostic: string): void {
  const rows = db.prepare<[string], { operation_id: string; creation_id: string; kind: CreationBoardOperationKind; revision: number }>(
    "SELECT operation_id,creation_id,kind,revision FROM creation_board_operations WHERE creation_id=? AND state='running'").all(creationId);
  for (const row of rows) {
    db.prepare("UPDATE creation_board_operations SET state='unknown',reason=?,revision=revision+1 WHERE operation_id=? AND revision=? AND state='running'").run(diagnostic, row.operation_id, row.revision);
    event(db, row.creation_id, row.operation_id, `creation.board.${row.kind}.unknown`, row.revision + 1);
  }
}
export function interruptCreationBoardOperations(db: Database.Database): void {
  const rows = db.prepare<[], { creation_id: string }>(
    "SELECT DISTINCT creation_id FROM creation_board_operations WHERE state='running'").all();
  for (const row of rows) markRunningCreationBoardOperationsUnknown(db, row.creation_id, 'CREATION_INTERRUPTED');
}
export function getCreationBoardOperation(db: Database.Database, operationId: string): BoardOperation { return view(operation(db, operationId)); }
