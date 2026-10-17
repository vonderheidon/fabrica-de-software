import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { CreateScaffold, CreationView, OperationId, type CreationStep, type ProjectCreation } from '#contracts';
import { configurationETag, digest, eventCursor, guarded, readSettingsView, readProject } from './configuration-reads.js';
import { registerProject } from './configuration-writes.js';
import { readSettings } from './settings.js';
import { OperationError, readOperation, type StoredOperation } from './operations.js';
import { StorageError } from './errors.js';

export interface CreationCommand { operationId: string; body: CreateScaffold }
interface Row { id: string; operation_id: string; project_id: string | null; plan_hash: string; plan_json: string; state: ProjectCreation['state']; baseline_sha: string | null; baseline_ref: string | null; diagnostic: string | null; revision: number; created_at_ms: number }
function hashCommand(command: CreationCommand): string {
  if (!Value.Check(OperationId, command.operationId) || !Value.Check(CreateScaffold, command.body) || digest(command.body.plan) !== command.body.planHash) throw new OperationError(400, 'SCAFFOLD_COMMAND_INVALID', 'The authorized plan is invalid.');
  return digest({ method: 'POST', route: '/api/v1/scaffold/creations', body: command.body });
}
export function recoverCreation(db: Database.Database, command: CreationCommand): StoredOperation | null {
  const hash = hashCommand(command); const settings = readSettings(db);
  const prior = db.prepare<[string], { request_hash: string; installation_id: string; account_id: string | null }>('SELECT request_hash,installation_id,account_id FROM operation_requests WHERE operation_id=?').get(command.operationId);
  if (!prior) return null;
  if (prior.request_hash !== hash || prior.installation_id !== settings.installationId || prior.account_id !== settings.accountId) throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'The operation conflicts with an accepted command.');
  const operation = readOperation(db, command.operationId); if (!operation) throw new StorageError('OPERATION_DATA_INVALID'); return operation;
}
export function readCreation(db: Database.Database, id: string): CreationView {
  if (!Value.Check(OperationId, id)) throw new OperationError(400, 'CREATION_ID_INVALID', 'Creation ID must be a UUID.');
  const s = readSettings(db);
  const r = db.prepare<[string, string, string | null], Row>('SELECT * FROM project_creations WHERE id=? AND installation_id=? AND account_id IS ?').get(id, s.installationId, s.accountId);
  if (!r) throw new OperationError(404, 'CREATION_NOT_FOUND', 'Creation not found in the current scope.');
  const recorded = db.prepare<[string], CreationStep>('SELECT step,state FROM creation_steps WHERE creation_id=? ORDER BY rowid').all(id);
  const steps = (['directory','files','git','baseline','registration'] as const).map(step => recorded.find(s => s.step === step) ?? { step, state: 'not_started' as const });
  const view = { creation: { id: r.id, operationId: r.operation_id, projectId: r.project_id, planHash: r.plan_hash, plan: JSON.parse(r.plan_json) as unknown,
    state: r.state, revision: r.revision, baselineSha: r.baseline_sha, baselineRef: r.baseline_ref, diagnostic: r.diagnostic, createdAtMs: r.created_at_ms },
    confirmedEffects: steps.filter(s => s.state === 'confirmed'), pendingEffects: steps.filter(s => s.state !== 'confirmed'), prerequisites: r.project_id ? readProject(db,r.project_id).prerequisites : [], diagnostics: r.diagnostic ? [r.diagnostic] : [], eventCursor: eventCursor(db) };
  if (!Value.Check(CreationView, view) || digest(view.creation.plan) !== r.plan_hash) throw new StorageError('OPERATION_DATA_INVALID');
  return view;
}
function creationEvent(db: Database.Database, id: string, type: string): void {
  const r = db.prepare<[string], { operation_id: string; revision: number }>('SELECT operation_id,revision FROM project_creations WHERE id=?').get(id)!;
  db.prepare("INSERT INTO events(entity_type,entity_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms) VALUES ('creation',?,?,?,?, '{}',?)").run(id,r.operation_id,type,r.revision,Date.now());
}
export function acceptCreation(db: Database.Database, command: CreationCommand): { created: boolean; operation: StoredOperation } {
  return guarded(() => db.transaction(() => {
    const prior = recoverCreation(db, command); if (prior) return { created: false, operation: prior };
    const s = readSettings(db); const plan = command.body.plan;
    if (plan.input.creationMode !== 'local' || plan.installationId !== s.installationId || plan.settingsETag !== configurationETag(readSettingsView(db))) throw new OperationError(409, 'SCAFFOLD_PLAN_CHANGED', 'Configuration changed. Review a new creation plan.');
    if (db.prepare('SELECT id FROM project_creations WHERE destination=? COLLATE NOCASE').get(plan.destination)) throw new OperationError(409, 'SCAFFOLD_DESTINATION_RESERVED', 'A creation already identifies this destination. Inspect that creation.');
    const id = randomUUID(); const next = db.prepare<[], { seq: number }>('SELECT coalesce(max(seq),0)+1 AS seq FROM events').get()!.seq;
    const receipt = { revision: 1, eventCursor: String(next) };
    db.prepare("INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json) VALUES (?,?,?,'scaffold.create','creation',?,?,'{}',?)")
      .run(command.operationId,s.installationId,s.accountId,id,hashCommand(command),JSON.stringify(receipt));
    db.prepare("INSERT INTO project_creations(id,operation_id,installation_id,account_id,plan_hash,plan_json,destination,state,created_at_ms) VALUES (?,?,?,?,?,?,?,'pending',?)")
      .run(id,command.operationId,s.installationId,s.accountId,command.body.planHash,JSON.stringify(plan),plan.destination,Date.now());
    creationEvent(db,id,'creation.accepted');
    return { created: true, operation: readOperation(db,command.operationId)! };
  }).immediate());
}
export function recordCreationStep(db: Database.Database, id: string, step: CreationStep['step'], state: CreationStep['state'], baselineSha?: string): void {
  guarded(() => db.transaction(() => {
    const c = readCreation(db,id).creation;
    if (!['pending','running'].includes(c.state) || c.plan.settingsETag !== configurationETag(readSettingsView(db))) throw new OperationError(409,'SCAFFOLD_PLAN_CHANGED','Creation authority changed. Inspect preserved resources.');
    const order = ['directory','files','git','baseline'] as const;
    const previous = order.slice(0,order.indexOf(step as typeof order[number]));
    if (!order.includes(step as typeof order[number]) || state === 'not_started' || previous.some(p => !readCreation(db,id).confirmedEffects.some(e => e.step === p)) ||
      (baselineSha !== undefined && (step !== 'baseline' || state !== 'confirmed'))) throw new OperationError(409,'SCAFFOLD_STEP_INVALID','The creation step is out of order.');
    if (state === 'running') db.prepare('INSERT INTO creation_steps(creation_id,step,state) VALUES (?,?,?)').run(id,step,state);
    else if (db.prepare("UPDATE creation_steps SET state=? WHERE creation_id=? AND step=? AND state='running'").run(state,id,step).changes !== 1) throw new StorageError('OPERATION_DATA_INVALID');
    if (baselineSha && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(baselineSha)) throw new StorageError('OPERATION_DATA_INVALID');
    db.prepare("UPDATE project_creations SET state='running',revision=revision+1,baseline_sha=coalesce(?,baseline_sha),baseline_ref=coalesce(?,baseline_ref) WHERE id=?")
      .run(baselineSha ?? null,baselineSha ? `refs/heads/${c.plan.input.baseBranch}` : null,id);
    creationEvent(db,id,`creation.${step}.${state}`);
  }).immediate());
}
export function completeCreation(db: Database.Database, id: string): void {
  guarded(() => db.transaction(() => {
    const c = readCreation(db,id).creation;
    const confirmed = db.prepare<[string], { n: number }>("SELECT count(*) AS n FROM creation_steps WHERE creation_id=? AND state='confirmed'").get(id)!.n;
    if (c.state !== 'running' || !c.baselineSha || c.plan.settingsETag !== configurationETag(readSettingsView(db)) || confirmed !== 4) throw new OperationError(409,'SCAFFOLD_INCOMPLETE','The local creation is incomplete.');
    const registration = registerProject(db,{ operationId: randomUUID(), expectedRevision: undefined,
      body: { name: c.plan.input.name, baseBranch: c.plan.input.baseBranch, source: { kind: 'local',location: c.plan.destination } },
      source: { kind: 'local',location: c.plan.destination },originNotes: [] });
    db.prepare("INSERT INTO creation_steps(creation_id,step,state) VALUES (?,'registration','confirmed')").run(id);
    db.prepare("UPDATE project_creations SET project_id=?,state='completed',revision=revision+1 WHERE id=?").run(registration.resource.id,id);
    creationEvent(db,id,'creation.completed');
  }).immediate());
}
export function failCreation(db: Database.Database, id: string, diagnostic: string): void {
  guarded(() => db.transaction(() => {
    if (!/^[A-Z0-9_]{1,128}$/.test(diagnostic)) throw new StorageError('OPERATION_DATA_INVALID');
    db.prepare("UPDATE creation_steps SET state='unknown' WHERE creation_id=? AND state='running'").run(id);
    const changed = db.prepare("UPDATE project_creations SET state=CASE WHEN EXISTS(SELECT 1 FROM creation_steps WHERE creation_id=?) THEN 'partial' ELSE 'failed' END,diagnostic=?,revision=revision+1 WHERE id=? AND state IN ('pending','running')").run(id,diagnostic,id);
    if (changed.changes) creationEvent(db,id,'creation.stopped');
  }).immediate());
}
export function interruptCreations(db: Database.Database): void {
  for (const { id } of db.prepare<[], { id: string }>("SELECT id FROM project_creations WHERE state IN ('pending','running')").all()) failCreation(db,id,'CREATION_INTERRUPTED');
}
