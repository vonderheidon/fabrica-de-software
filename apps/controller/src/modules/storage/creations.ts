import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { CreateScaffold, CreationView, OperationId, type CreationStep, type ProjectCreation } from '#contracts';
import { configurationETag, digest, eventCursor, guarded, readSettingsView, readProject } from './configuration-reads.js';
import { registerProject } from './configuration-writes.js';
import { readSettings } from './settings.js';
import { OperationError, readOperation, type StoredOperation } from './operations.js';
import { StorageError } from './errors.js';
import { effectView, finishEffect } from './effects.js';

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
  const plan = JSON.parse(r.plan_json) as ProjectCreation['plan'];
  const effects = db.prepare('SELECT * FROM effects WHERE creation_id=? ORDER BY rowid').all(id).map(row => effectView(row as Parameters<typeof effectView>[0]));
  const remoteEffects = (['create_repository','associate_origin','baseline_push'] as const).map(kind => {
    const effect = effects.find(e => e.kind === kind); const requested = plan.input.creationMode !== 'local' && (kind !== 'baseline_push' || plan.input.creationMode === 'remote_push');
    return { kind,state: effect?.state ?? (requested ? 'not_started' : 'not_requested'),operationId: effect?.operationId ?? null,
      identity: effect?.expectedIdentity ?? (plan.input.remote ? { ownerId: plan.input.remote.ownerId,repositoryOwner: plan.ownerLogin,repositoryName: plan.input.remote.name,visibility: plan.input.remote.visibility,planHash: r.plan_hash } : {}),reason: effect?.reason ?? null };
  });
  const view = { creation: { id: r.id, operationId: r.operation_id, projectId: r.project_id, planHash: r.plan_hash, plan: JSON.parse(r.plan_json) as unknown,
    state: r.state, revision: r.revision, baselineSha: r.baseline_sha, baselineRef: r.baseline_ref, diagnostic: r.diagnostic, createdAtMs: r.created_at_ms },
    effects,remoteEffects,
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
    if (plan.installationId !== s.installationId || plan.settingsETag !== configurationETag(readSettingsView(db)) ||
      (plan.input.creationMode !== 'local' && (!s.accountId || plan.account.id !== s.accountId || plan.account.state !== 'complete' || !plan.input.remote || plan.ownerId !== plan.input.remote.ownerId || !plan.ownerLogin))) throw new OperationError(409, 'SCAFFOLD_PLAN_CHANGED', 'Configuration or account changed. Review a new creation plan.');
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
    const effects = readCreation(db,id).effects;
    const required = c.plan.input.creationMode === 'local' ? [] : c.plan.input.creationMode === 'remote_push' ? ['create_repository','associate_origin','baseline_push'] : ['create_repository','associate_origin'];
    if (!['running','partial'].includes(c.state) || !c.baselineSha || c.plan.settingsETag !== configurationETag(readSettingsView(db)) || confirmed !== 4 || required.some(kind => !effects.some(e => e.kind === kind && e.state === 'confirmed'))) throw new OperationError(409,'SCAFFOLD_INCOMPLETE','The creation has unconfirmed effects.');
    const remote = effects.find(e => e.kind === 'create_repository')?.receipt;
    const registration = registerProject(db,{ operationId: randomUUID(), expectedRevision: undefined,
      body: { name: c.plan.input.name, baseBranch: c.plan.input.baseBranch, source: { kind: 'local',location: c.plan.destination } },
      source: { kind: 'local',location: c.plan.destination, ...(remote ? { repositoryId: remote.id, repositoryUrl: remote.url! } : {}) },originNotes: [] });
    db.prepare("INSERT INTO creation_steps(creation_id,step,state) VALUES (?,'registration','confirmed')").run(id);
    db.prepare("UPDATE project_creations SET project_id=?,state='completed',diagnostic=NULL,revision=revision+1 WHERE id=?").run(registration.resource.id,id);
    creationEvent(db,id,'creation.completed');
  }).immediate());
}
export function failCreation(db: Database.Database, id: string, diagnostic: string): void {
  guarded(() => db.transaction(() => {
    if (!/^[A-Z0-9_]{1,128}$/.test(diagnostic)) throw new StorageError('OPERATION_DATA_INVALID');
    for (const effect of readCreation(db,id).effects.filter(e => e.state === 'running')) finishEffect(db,effect.operationId,effect.revision,'unknown',null,diagnostic);
    db.prepare("UPDATE creation_steps SET state='unknown' WHERE creation_id=? AND state='running'").run(id);
    const changed = db.prepare("UPDATE project_creations SET state=CASE WHEN EXISTS(SELECT 1 FROM creation_steps WHERE creation_id=?) THEN 'partial' ELSE 'failed' END,diagnostic=?,revision=revision+1 WHERE id=? AND state IN ('pending','running')").run(id,diagnostic,id);
    if (changed.changes) creationEvent(db,id,'creation.stopped');
  }).immediate());
}
export function interruptCreations(db: Database.Database): void {
  db.prepare("UPDATE creation_reconciliations SET state='unknown',diagnostic='CREATION_INTERRUPTED' WHERE state='accepted'").run();
  for (const { id } of db.prepare<[], { id: string }>("SELECT id FROM project_creations WHERE state IN ('pending','running')").all()) failCreation(db,id,'CREATION_INTERRUPTED');
}

export interface ReconcileCreationCommand { creationId: string; operationId: string; expectedRevision: string | undefined }
function reconciliationHash(c: ReconcileCreationCommand): string {
  if (!Value.Check(OperationId,c.creationId) || !Value.Check(OperationId,c.operationId) || (c.expectedRevision !== undefined && (typeof c.expectedRevision !== 'string' || c.expectedRevision.length > 256))) throw new OperationError(400,'CREATION_COMMAND_INVALID','Invalid reconciliation command.');
  return digest({ method: 'POST',route: `/api/v1/scaffold/creations/${c.creationId}/reconcile`,body: {},expectedRevision: c.expectedRevision ?? null });
}
export function acceptCreationReconciliation(db: Database.Database,c: ReconcileCreationCommand): { created: boolean; operation: StoredOperation } {
  return guarded(() => db.transaction(() => {
    const hash = reconciliationHash(c); const s = readSettings(db);
    const prior = db.prepare<[string],{ request_hash: string; account_id: string | null; installation_id: string }>('SELECT * FROM operation_requests WHERE operation_id=?').get(c.operationId);
    if (prior) {
      if (prior.request_hash !== hash || prior.account_id !== s.accountId || prior.installation_id !== s.installationId) throw new OperationError(409,'IDEMPOTENCY_CONFLICT','Reconciliation identity conflicts with an accepted command.');
      return { created: false,operation: readOperation(db,c.operationId)! };
    }
    const creation = readCreation(db,c.creationId).creation;
    if (c.expectedRevision === undefined) throw new OperationError(428,'PRECONDITION_REQUIRED','If-Match is required.');
    if (c.expectedRevision !== `"creation:${creation.id}:${creation.revision}"`) throw new OperationError(412,'REVISION_CONFLICT','The creation changed. Reload it before reconciling.');
    if (['pending','running'].includes(creation.state)) throw new OperationError(409,'CREATION_BUSY','Wait for creation to stop before reconciling.');
    const revision = creation.revision; const seq = db.prepare<[],{ n: number }>('SELECT coalesce(max(seq),0)+1 AS n FROM events').get()!.n;
    db.prepare("INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json) VALUES (?,?,?,'scaffold.reconcile','creation',?,?,?,?)")
      .run(c.operationId,s.installationId,s.accountId,c.creationId,hash,JSON.stringify({ etag: c.expectedRevision }),JSON.stringify({ revision,eventCursor: String(seq) }));
    db.prepare("INSERT INTO creation_reconciliations(operation_id,creation_id,state) VALUES (?,?,'accepted')").run(c.operationId,c.creationId);
    db.prepare("INSERT INTO events(entity_type,entity_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms) VALUES ('creation',?,?,'creation.reconcile.accepted',?,'{}',?)").run(c.creationId,c.operationId,revision,Date.now());
    return { created: true,operation: readOperation(db,c.operationId)! };
  }).immediate());
}
export function finishCreationReconciliation(db: Database.Database,operationId: string,diagnostic: string | null): void {
  guarded(() => db.transaction(() => {
    if (diagnostic !== null && !/^[A-Z0-9_]{1,128}$/.test(diagnostic)) throw new StorageError('OPERATION_DATA_INVALID');
    const row = db.prepare<[string],{ creation_id: string }>("SELECT creation_id FROM creation_reconciliations WHERE operation_id=? AND state='accepted'").get(operationId);
    if (!row) throw new OperationError(409,'CREATION_RECONCILIATION_CHANGED','Reconciliation is no longer active.');
    readCreation(db,row.creation_id);
    db.prepare("UPDATE creation_reconciliations SET state=?,diagnostic=? WHERE operation_id=?").run(diagnostic ? 'unknown' : 'succeeded',diagnostic,operationId);
    // Unconfirmed observations still change the durable reconciliation state.
    // Completed creations were advanced by completeCreation and are immutable.
    db.prepare("UPDATE project_creations SET revision=revision+1 WHERE id=? AND state<>'completed'").run(row.creation_id);
    const c = readCreation(db,row.creation_id).creation;
    db.prepare("INSERT INTO events(entity_type,entity_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms) VALUES ('creation',?,?,'creation.reconciled',?,'{}',?)").run(c.id,operationId,c.revision,Date.now());
  }).immediate());
}
