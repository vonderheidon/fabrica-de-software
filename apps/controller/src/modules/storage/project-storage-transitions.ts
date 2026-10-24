import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { OperationId, ProjectStorageObjectIdentity, ProjectStorageView, StorageTransitionCommand,
  type ProjectStorageObjectIdentity as Identity, type StorageTransitionCommand as Command } from '#contracts';
import { configurationETag, digest, readProject, readConfiguration } from './configuration-reads.js';
import { serializeOperationReceipt } from './common-json.js';
import { OperationError, readOperation, type StoredOperation } from './operations.js';
import { readSettings } from './settings.js';

export interface AcceptStorageTransition {
  readonly operationId: string;
  readonly projectId: string;
  readonly expectedRevision: string | undefined;
  readonly command: Command;
  readonly destinationRelative: string;
  readonly sourceIdentity: Identity;
}

type TransitionStep = 'planned' | 'quiescence_checked' | 'moving' | 'verifying' | 'publishing_location';
type TransitionState = 'planned' | 'running' | 'verified' | 'uncertain' | 'blocked';
interface TransitionRow {
  operation_id: string; project_id: string; location_key: string; source_location_id: string;
  source_relative: string; destination_relative: string; source_identity_json: string;
  destination_identity_json: string | null; plan_hash: string; step: TransitionStep; state: TransitionState;
  revision: number; generation: number; reason: string | null;
}

export interface StorageTransition {
  operation_id: string; project_id: string; location_key: string; source_location_id: string;
  source_relative: string; destination_relative: string; source_identity: Identity;
  destination_identity: Identity | null; plan_hash: string; step: TransitionStep;
  state: TransitionRow['state']; revision: number; generation: number; reason: string | null;
}

function map(row: TransitionRow): StorageTransition {
  const source = JSON.parse(row.source_identity_json) as unknown;
  const destination = row.destination_identity_json === null ? null : JSON.parse(row.destination_identity_json) as unknown;
  if (!Value.Check(ProjectStorageObjectIdentity, source) ||
      (destination !== null && !Value.Check(ProjectStorageObjectIdentity, destination)) ||
      !['planned','quiescence_checked','moving','verifying','publishing_location'].includes(row.step) ||
      !['planned','running','verified','uncertain','blocked'].includes(row.state)) throw new Error('PROJECT_STORAGE_TRANSITION_DATA_INVALID');
  return { operation_id: row.operation_id, project_id: row.project_id, location_key: row.location_key,
    source_location_id: row.source_location_id, source_relative: row.source_relative, destination_relative: row.destination_relative,
    source_identity: source, destination_identity: destination, plan_hash: row.plan_hash, step: row.step as StorageTransition['step'],
    state: row.state as StorageTransition['state'], revision: row.revision, generation: row.generation, reason: row.reason };
}

function transitionRow(db: Database.Database, operationId: string): TransitionRow | undefined {
  return db.prepare<[string], TransitionRow>(`SELECT operation_id,project_id,location_key,source_location_id,source_relative,
    destination_relative,source_identity_json,destination_identity_json,plan_hash,step,state,revision,generation,reason
    FROM project_storage_transitions WHERE operation_id=?`).get(operationId);
}

function assertQuiescent(db: Database.Database, projectId: string): void {
  const blockers = db.prepare<[string,string,string,string,string,string,string], { blocked: number }>(`SELECT
    EXISTS(SELECT 1 FROM attempts WHERE project_id=? AND result IS NULL) OR
    EXISTS(SELECT 1 FROM checks c JOIN attempts a ON a.id=c.attempt_id WHERE a.project_id=? AND c.state IN ('pending','running')) OR
    EXISTS(SELECT 1 FROM resources r JOIN attempts a ON a.id=r.attempt_id WHERE a.project_id=? AND r.kind='terminal' AND r.stop_state IN ('active','uncertain')) OR
    EXISTS(SELECT 1 FROM effects e JOIN attempts a ON a.id=e.attempt_id WHERE a.project_id=? AND e.state IN ('running','unknown')) OR
    EXISTS(SELECT 1 FROM publication_requests p JOIN attempts a ON a.id=p.attempt_id WHERE a.project_id=? AND p.state IN ('accepted','running')) OR
    EXISTS(SELECT 1 FROM publication_target_selections t JOIN attempts a ON a.id=t.attempt_id WHERE a.project_id=? AND t.state IN ('accepted','running','unknown')) OR
    EXISTS(SELECT 1 FROM project_deletions d WHERE d.project_id=? AND NOT EXISTS(SELECT 1 FROM project_deletion_receipts x WHERE x.operation_id=d.operation_id)) AS blocked`)
    .get(projectId, projectId, projectId, projectId, projectId, projectId, projectId);
  if (blockers?.blocked) throw new OperationError(409, 'PROJECT_STORAGE_BUSY', 'A tentativa, efeito ou exclusão ainda depende destes diretórios.', {
    affected_requirements: ['RF-67','RF-68'], recovery: 'Conclua ou reconcilie a atividade e consulte novamente o plano de transição.' });
}

function hashCommand(input: AcceptStorageTransition): string {
  if (!Value.Check(OperationId, input.operationId) || !Value.Check(OperationId, input.projectId) ||
      !Value.Check(StorageTransitionCommand, input.command) || !Value.Check(ProjectStorageObjectIdentity, input.sourceIdentity) ||
      typeof input.destinationRelative !== 'string' || input.destinationRelative.length > 32768 ||
      (input.expectedRevision !== undefined && input.expectedRevision.length > 256)) {
    throw new OperationError(400, 'STORAGE_TRANSITION_INVALID', 'A autorização de transição é inválida.');
  }
  return digest({ kind: 'project.storage.transition', project_id: input.projectId, command: input.command,
    destination_relative: input.destinationRelative, source_identity: input.sourceIdentity, expected_revision: input.expectedRevision ?? null });
}

export function readStorageTransition(db: Database.Database, operationId: string): StorageTransition | null {
  if (!Value.Check(OperationId, operationId)) throw new OperationError(400, 'OPERATION_ID_INVALID', 'A operação é inválida.');
  const row = transitionRow(db, operationId);
  return row ? map(row) : null;
}

export function assertStorageTransitionQuiescent(db: Database.Database, projectId: string): void {
  readProject(db, projectId);
  assertQuiescent(db, projectId);
}

export function acceptStorageTransition(db: Database.Database, input: AcceptStorageTransition): StoredOperation {
  const hash = hashCommand(input);
  return db.transaction(() => {
    const existing = db.prepare<[string], { request_hash: string; resource_id: string; installation_id: string; account_id: string | null }>(
      'SELECT request_hash,resource_id,installation_id,account_id FROM operation_requests WHERE operation_id=?').get(input.operationId);
    const settings = readSettings(db);
    if (existing) {
      if (existing.request_hash !== hash || existing.resource_id !== input.projectId || existing.installation_id !== settings.installation_id || existing.account_id !== settings.account_id) {
        throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'A chave pertence a outra autorização de transição.');
      }
      const operation = readOperation(db, input.operationId);
      if (!operation || operation.kind !== 'project.storage.transition') throw new Error('PROJECT_STORAGE_TRANSITION_DATA_INVALID');
      return operation;
    }
    const project = readProject(db, input.projectId).project;
    if (input.expectedRevision === undefined) throw new OperationError(428, 'PRECONDITION_REQUIRED', 'If-Match é obrigatório.');
  if (input.expectedRevision !== configurationETag(readConfiguration(db, input.projectId))) throw new OperationError(412, 'REVISION_CONFLICT', 'A configuração do projeto mudou; consulte novamente a localização.');
    assertQuiescent(db, input.projectId);
    const source = db.prepare<[string,string], { location_key: string; layout_version: number; root_relative: string; object_identity_json: string }>(
      'SELECT location_key,layout_version,root_relative,object_identity_json FROM project_storage_locations WHERE id=? AND project_id=? AND is_current=1')
      .get(input.command.source_location_id, input.projectId);
    if (!source) throw new OperationError(409, 'STORAGE_TRANSITION_SOURCE_CHANGED', 'A origem não está mais registrada como localização corrente.');
    const expectedPlanHash = createHash('sha256').update(JSON.stringify([project.id, project.revision, source.root_relative,
      source.object_identity_json, input.destinationRelative, input.command.location_key])).digest('hex');
    if (source.location_key !== input.command.location_key || source.object_identity_json !== JSON.stringify(input.sourceIdentity) ||
        input.command.plan_hash !== expectedPlanHash) {
      throw new OperationError(409, 'STORAGE_TRANSITION_PLAN_CHANGED', 'A localização ou o plano mudou desde a consulta.', {
        affected_requirements: ['RF-67','RF-68'], recovery: 'Consulte novamente o plano antes de confirmar a transição.' });
    }
    const active = db.prepare<[string], { operation_id: string }>(`SELECT operation_id FROM project_storage_transitions
      WHERE project_id=? AND state IN ('planned','running','uncertain','blocked')`).get(input.projectId);
    if (active) throw new OperationError(409, 'STORAGE_TRANSITION_ACTIVE', 'Uma transição deste projeto já está pendente.');
    const generation = (db.prepare<[string], { generation: number | null }>(
      'SELECT max(generation) AS generation FROM project_storage_transitions WHERE project_id=?').get(input.projectId)?.generation ?? 0) + 1;
    const now = Date.now();
    const seq = db.prepare<[], { seq: number }>('SELECT coalesce(max(seq),0)+1 AS seq FROM events').get()!.seq;
    const receipt = { revision: 1, event_cursor: String(seq) };
    db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json)
      VALUES (?,?,?,'project.storage.transition','project',?,?,?,?)`).run(input.operationId, settings.installation_id, settings.account_id,
      input.projectId, hash, JSON.stringify({ etag: input.expectedRevision }), serializeOperationReceipt(receipt));
    db.prepare(`INSERT INTO project_storage_transitions(operation_id,project_id,location_key,source_location_id,source_relative,destination_relative,
      source_identity_json,destination_identity_json,plan_hash,step,state,revision,generation,reason,created_at_ms,updated_at_ms)
      VALUES (?,?,?,?,?,?,?,?,?,'planned','planned',1,?,NULL,?,?)`).run(input.operationId, input.projectId, input.command.location_key,
      input.command.source_location_id, source.root_relative, input.destinationRelative, JSON.stringify(input.sourceIdentity), null,
      input.command.plan_hash, generation, now, now);
    db.prepare(`INSERT INTO events(entity_type,entity_id,project_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms)
      VALUES ('project',?,?,?,'project.storage_transition.accepted',1,'{}',?)`).run(input.projectId, input.projectId, input.operationId, now);
    const operation = readOperation(db, input.operationId);
    if (!operation) throw new Error('PROJECT_STORAGE_TRANSITION_DATA_INVALID');
    return operation;
  }).immediate();
}

export function advanceStorageTransition(db: Database.Database, operationId: string, generation: number,
  step: StorageTransition['step'], state: StorageTransition['state'], reason: string | null, destinationIdentity?: Identity): void {
  if (destinationIdentity !== undefined && !Value.Check(ProjectStorageObjectIdentity, destinationIdentity)) {
    throw new OperationError(400, 'STORAGE_TRANSITION_IDENTITY_INVALID', 'A identidade conferida do destino é inválida.');
  }
  db.transaction(() => {
    const row = transitionRow(db, operationId);
    if (!row || row.generation !== generation || row.state === 'verified') throw new OperationError(409, 'STORAGE_TRANSITION_GENERATION_STALE', 'A geração da transição não está mais vigente.');
    db.prepare(`UPDATE project_storage_transitions SET step=?,state=?,revision=revision+1,reason=?,
      destination_identity_json=coalesce(?,destination_identity_json),updated_at_ms=? WHERE operation_id=? AND generation=?`)
      .run(step, state, reason, destinationIdentity ? JSON.stringify(destinationIdentity) : null, Date.now(), operationId, generation);
  }).immediate();
}

export function claimStorageTransition(db: Database.Database, operationId: string): StorageTransition {
  return db.transaction(() => {
    const row = transitionRow(db, operationId);
    if (!row) throw new OperationError(404, 'STORAGE_TRANSITION_NOT_FOUND', 'A transição não foi encontrada.');
    if (row.state === 'verified') return map(row);
    db.prepare(`UPDATE project_storage_transitions SET state='running',reason=NULL,generation=generation+1,
      revision=revision+1,updated_at_ms=? WHERE operation_id=?`).run(Date.now(), operationId);
    const claimed = transitionRow(db, operationId);
    if (!claimed) throw new Error('PROJECT_STORAGE_TRANSITION_DATA_INVALID');
    return map(claimed);
  }).immediate();
}

export function completeStorageTransition(db: Database.Database, operationId: string, generation: number, destination: Identity): void {
  if (!Value.Check(ProjectStorageObjectIdentity, destination)) throw new OperationError(400, 'STORAGE_TRANSITION_IDENTITY_INVALID', 'A identidade conferida do destino é inválida.');
  db.transaction(() => {
    const row = transitionRow(db, operationId);
    if (!row || row.generation !== generation || !['running','uncertain'].includes(row.state)) {
      throw new OperationError(409, 'STORAGE_TRANSITION_GENERATION_STALE', 'Uma geração antiga não pode publicar a localização.');
    }
    const source = db.prepare<[string,string], { id: string; project_id: string; location_key: string; layout_version: number; root_relative: string; object_identity_json: string; is_current: number; revision: number; created_at_ms: number }>(
      `SELECT id,project_id,location_key,layout_version,root_relative,object_identity_json,is_current,revision,created_at_ms
       FROM project_storage_locations WHERE id=? AND project_id=?`).get(row.source_location_id, row.project_id);
    if (!source || source.is_current !== 1 || source.root_relative !== row.source_relative ||
        source.object_identity_json !== row.source_identity_json || row.destination_identity_json !== JSON.stringify(destination)) {
      throw new OperationError(409, 'STORAGE_TRANSITION_SOURCE_CHANGED', 'A origem ou o destino mudou durante a verificação.');
    }
    const dest = row.destination_relative.split('/');
    const layoutVersion = Number(dest[dest.indexOf(row.project_id) + 1]?.slice(1));
    if (!Number.isSafeInteger(layoutVersion) || layoutVersion <= source.layout_version) throw new Error('PROJECT_STORAGE_TRANSITION_DATA_INVALID');
    db.prepare(`UPDATE project_storage_transitions SET step='publishing_location',state='verified',revision=revision+1,reason=NULL,
      updated_at_ms=? WHERE operation_id=? AND generation=?`).run(Date.now(), operationId, generation);
    db.prepare('UPDATE project_storage_locations SET is_current=0,revision=revision+1 WHERE id=? AND is_current=1').run(source.id);
    const revision = db.prepare<[string,string], { revision: number | null }>(`SELECT max(revision) AS revision FROM project_storage_locations
      WHERE project_id=? AND location_key=?`).get(row.project_id,row.location_key)?.revision ?? 0;
    const now = Date.now();
    db.prepare(`INSERT INTO project_storage_locations(id,project_id,location_key,layout_version,root_relative,object_identity_json,is_current,revision,created_at_ms,verified_at_ms)
      VALUES (?,?,?,?,?,?,1,?,?,?)`).run(randomUUID(), row.project_id, row.location_key, layoutVersion, row.destination_relative,
      JSON.stringify(destination), revision + 1, now, now);
  }).immediate();
}

export function interruptStorageTransitions(db: Database.Database): void {
  db.prepare(`UPDATE project_storage_transitions SET state='uncertain',reason='STORAGE_TRANSITION_INTERRUPTED',
    revision=revision+1,generation=generation+1,updated_at_ms=? WHERE state IN ('planned','running')`).run(Date.now());
}

export function storageTransitionView(db: Database.Database, projectId: string): ProjectStorageView {
  const projectStorage = readConfiguration(db, projectId).storage;
  const row = db.prepare<[string], TransitionRow>(`SELECT operation_id,project_id,location_key,source_location_id,source_relative,
    destination_relative,source_identity_json,destination_identity_json,plan_hash,step,state,revision,generation,reason
    FROM project_storage_transitions WHERE project_id=? ORDER BY created_at_ms DESC LIMIT 1`).get(projectId);
  if (!row || row.state === 'verified') return projectStorage;
  const transition = map(row);
  const state = transition.state === 'planned' || transition.state === 'running' ? 'transitioning' : transition.state;
  const cause = transition.reason;
  const recovery = cause ? 'Retome a mesma operação de transição para conferir origem e destino; preserve ambos até a reconciliação.' : null;
  const result = { ...projectStorage, state, active_transition_operation_id: transition.operation_id, cause, recovery };
  if (!Value.Check(ProjectStorageView, result)) throw new Error('PROJECT_STORAGE_TRANSITION_VIEW_INVALID');
  return result;
}

