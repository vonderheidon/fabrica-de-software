import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { OperationId, SetPublicationTarget, type PublicationTargetSelection } from '#contracts';
import { readAttempt, readCapture, recoverAttempt } from './attempts.js';
import { readDelivery } from './deliveries.js';
import { assertDeletionPathsAvailable, assertProjectAvailable } from './project-deletion-barrier.js';
import { readSettings } from './settings.js';
import { digest, guarded } from './configuration-reads.js';
import { OperationError, readOperation, type StoredOperation } from './operations.js';
import { serializeOperationReceipt } from './common-json.js';
import { attemptEvent } from './attempts.js';
import { isLocalAbsoluteTargetPath, publicationTargetHash } from './publication-target.js';
import type { TargetIdentity } from '../workspaces/index.js';

export interface TargetCommand { operationId: string; attemptId: string; expectedRevision: string | undefined; body: SetPublicationTarget }
interface TargetRow {
  operation_id: string; attempt_id: string; delivery_id: string; repository_id: string; selection_kind: 'clone' | 'existing_clone'; local_path: string;
  state: PublicationTargetSelection['state']; revision: number; reason: string | null; updated_at_ms: number;
  expected_identity_json: string; confirmed_identity_json: string | null; authorization_json: string;
}
const blocked = (code: string): never => { throw new OperationError(409, code, 'Confira a seleção e a autorização do destino antes de continuar.'); };
function requestHash(c: TargetCommand) {
  if (!Value.Check(OperationId,c.operationId) || !Value.Check(OperationId,c.attemptId) || !Value.Check(SetPublicationTarget,c.body) ||
    (c.body.authorization_operation_id === undefined) !== (c.body.target_intent_hash === undefined) ||
    c.expectedRevision !== undefined && (typeof c.expectedRevision !== 'string' || c.expectedRevision.length > 256)) {
    throw new OperationError(400,'TARGET_COMMAND_INVALID','A seleção de destino é inválida.');
  }
  return digest({ method: 'POST', route: `/api/v1/attempts/${c.attemptId}/publication/target`, body: c.body, expectedRevision: c.expectedRevision ?? null });
}
export function validateTargetCommand(db: Database.Database, c: TargetCommand) {
  requestHash(c);
  const a = readAttempt(db,c.attemptId); const capture = readCapture(db,a.id); const d = readDelivery(db,c.body.delivery_id);
  assertProjectAvailable(db,a.projectId);
  if (d.attemptId !== a.id || d.id !== a.deliveryId || c.body.repository_id !== capture.issue.repository.id) blocked('TARGET_IDENTITY_MISMATCH');
  if (a.result && !['delivered','interrupted'].includes(a.result)) blocked('TARGET_ATTEMPT_ENDED');
  if (c.expectedRevision === undefined) throw new OperationError(428,'PRECONDITION_REQUIRED','If-Match é obrigatório.');
  if (c.expectedRevision !== `"${a.id}:${a.revision}"`) throw new OperationError(412,'REVISION_CONFLICT','A tentativa mudou.');
  const path = c.body.selection.kind === 'clone' ? c.body.selection.destination : c.body.selection.path;
  if (!isLocalAbsoluteTargetPath(path)) blocked('TARGET_PATH_INVALID');
  assertDeletionPathsAvailable(db,[path]);
  if (c.body.authorization_operation_id) {
    const captured = capture.v3Delivery; const intent = { format_version: 1 as const, repository_id: c.body.repository_id, selection: c.body.selection };
    if (!captured?.publication_target || captured.publication_target.repository_id !== c.body.repository_id ||
        captured.publication_target_hash !== c.body.target_intent_hash || publicationTargetHash(intent) !== captured.publication_target_hash ||
        publicationTargetHash(captured.publication_target) !== captured.publication_target_hash || capture.configuration.configuration.source.kind !== 'github') blocked('TARGET_AUTHORIZATION_INVALID');
    const capturedIntent = captured!;
    if (c.body.authorization_operation_id === capturedIntent.authorization_operation_id) {
      if (!['commit','pr'].includes(capture.configuration.configuration.default_delivery_mode)) blocked('TARGET_AUTHORIZATION_INVALID');
      const origin = db.prepare<[string], { expected_revision_json: string; receipt_json: string }>('SELECT expected_revision_json,receipt_json FROM operation_requests WHERE operation_id=?').get(a.operationId);
      const revision = db.prepare<[string,number], { choices_json: string }>('SELECT choices_json FROM preparation_revisions WHERE preparation_id=? AND revision=?').get(capture.preparationId,capture.preparationRevision);
      const choices = revision ? (JSON.parse(revision.choices_json) as { choices: { publication_target?: unknown; deliveryMode?: string } }).choices : null;
      if (!origin || !choices || digest(choices.publication_target) !== digest(capturedIntent.publication_target) || choices.deliveryMode !== capture.configuration.configuration.default_delivery_mode) blocked('TARGET_AUTHORIZATION_INVALID');
      const recovered = recoverAttempt(db,{ operationId: a.operationId, expectedRevision: (JSON.parse(origin!.expected_revision_json) as { etag: string }).etag,
        body: { preparationId: capture.preparationId, preparationRevision: capture.preparationRevision, authorizedSummaryHash: capture.summaryHash, authorized: true } });
      if (recovered?.resource.id !== a.id) blocked('TARGET_AUTHORIZATION_INVALID');
    } else {
      const upgrade = db.prepare<[string,string,string],{ target_mode: string; authorized_mode: string; kind: string; state: string }>(`SELECT u.target_mode,p.authorized_mode,p.kind,p.state
        FROM publication_upgrades u JOIN publication_requests p ON p.operation_id=u.operation_id
        WHERE u.operation_id=? AND u.attempt_id=? AND u.delivery_id=?`).get(c.body.authorization_operation_id,a.id,d.id);
      if (!upgrade || upgrade.kind !== 'publication.authorize-upgrade' || !['accepted','running'].includes(upgrade.state) ||
          !['commit','pr'].includes(upgrade.target_mode) || upgrade.authorized_mode !== upgrade.target_mode ||
          publicationTargetHash(capturedIntent.publication_target) !== c.body.target_intent_hash) blocked('TARGET_AUTHORIZATION_INVALID');
    }
  }
  return { a, capture, path };
}
export function recoverTargetSelection(db: Database.Database,c: TargetCommand): StoredOperation | null {
  const hash = requestHash(c); const settings = readSettings(db);
  const old = db.prepare<[string],{ request_hash: string; account_id: string | null; installation_id: string }>('SELECT request_hash,account_id,installation_id FROM operation_requests WHERE operation_id=?').get(c.operationId);
  if (!old) return null;
  if (old.request_hash !== hash || old.account_id !== settings.account_id || old.installation_id !== settings.installation_id) blocked('IDEMPOTENCY_CONFLICT');
  return readOperation(db,c.operationId);
}
export function targetSelection(db: Database.Database,id: string) {
  const row = db.prepare<[string],TargetRow>('SELECT * FROM publication_target_selections WHERE operation_id=?').get(id);
  if (!row) throw new OperationError(404,'TARGET_NOT_FOUND','Seleção não encontrada.');
  readAttempt(db,row.attempt_id);
  const authorization = JSON.parse(row.authorization_json) as { authorization_operation_id: string | null; target_intent_hash: string | null };
  const view: PublicationTargetSelection = { operation_id: row.operation_id, attempt_id: row.attempt_id, delivery_id: row.delivery_id,
    repository_id: row.repository_id, selection_kind: row.selection_kind, local_path: row.local_path, state: row.state, revision: row.revision,
    identity_verified: row.state === 'confirmed', checked_at_ms: row.state === 'accepted' ? null : row.updated_at_ms, reason: row.reason,
    recovery: row.state === 'unknown' ? 'Reconcilie a mesma seleção; não solicite outro clone.' : null,
    authorization_operation_id: authorization.authorization_operation_id, target_intent_hash: authorization.target_intent_hash };
  return { view, expected: JSON.parse(row.expected_identity_json) as TargetIdentity };
}
export function acceptTargetSelection(db: Database.Database,c: TargetCommand,expected: TargetIdentity) {
  return guarded(() => db.transaction(() => {
    const old = recoverTargetSelection(db,c); if (old) return { operation: old, created: false };
    const { a,capture,path } = validateTargetCommand(db,c); const settings = readSettings(db);
    if (expected.repositoryId !== c.body.repository_id || expected.root !== path || expected.repositoryUrl !== capture.issue.repository.url) blocked('TARGET_IDENTITY_MISMATCH');
    if (db.prepare("SELECT 1 FROM publication_target_selections WHERE (attempt_id=? OR lower(local_path)=lower(?)) AND state IN ('accepted','running','unknown')").get(a.id,path)) blocked('TARGET_SELECTION_PENDING');
    const revision = a.revision + 1; const now = Date.now();
    const seq = db.prepare<[],{ seq: number }>('SELECT coalesce(max(seq),0)+1 AS seq FROM events').get()!.seq;
    const receipt = serializeOperationReceipt({ revision, event_cursor: String(seq) });
    db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json)
      VALUES (?,?,?,'publication.target','attempt',?,?,?,?)`).run(c.operationId,settings.installation_id,settings.account_id,a.id,requestHash(c),JSON.stringify({ etag: c.expectedRevision }),receipt);
    const authorizationKind = c.body.authorization_operation_id
      ? db.prepare<[string],{ operation_kind: string }>('SELECT operation_kind FROM operation_requests WHERE operation_id=?').get(c.body.authorization_operation_id)?.operation_kind
      : null;
    const authorizationOrigin = authorizationKind === 'attempt.start' ? 'attempt_start'
      : authorizationKind === 'publication.authorize-upgrade' ? 'publication_upgrade' : 'operator';
    db.prepare(`INSERT INTO publication_target_selections(operation_id,attempt_id,delivery_id,repository_id,selection_kind,local_path,expected_identity_json,authorization_json,request_hash,state,created_at_ms,updated_at_ms)
      VALUES (?,?,?,?,?,?,?,?,?,'accepted',?,?)`).run(c.operationId,a.id,c.body.delivery_id,c.body.repository_id,c.body.selection.kind,path,JSON.stringify(expected),JSON.stringify({ formatVersion: 1, authorized: true,
        origin: authorizationOrigin, authorization_operation_id: c.body.authorization_operation_id ?? null, target_intent_hash: c.body.target_intent_hash ?? null,
        preparationId: capture.preparationId, preparationRevision: capture.preparationRevision, summaryHash: capture.summaryHash, selection: c.body.selection }),requestHash(c),now,now);
    db.prepare('UPDATE attempts SET revision=?,updated_at_ms=? WHERE id=?').run(revision,now,a.id);
    db.prepare("INSERT INTO events(entity_type,entity_id,project_id,attempt_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms) VALUES ('attempt',?,?,?,?, 'publication.target.accepted',?,'{}',?)").run(a.id,a.projectId,a.id,c.operationId,revision,now);
    return { operation: readOperation(db,c.operationId)!, created: true };
  }).immediate());
}
export function assertTargetSelection(db: Database.Database,id: string) {
  const current = targetSelection(db,id); assertProjectAvailable(db,readAttempt(db,current.view.attempt_id).projectId); assertDeletionPathsAvailable(db,[current.view.local_path]);
}
export function findTargetSelection(db: Database.Database,attemptId: string,deliveryId: string,origin?: { operationId?: string; hash: string }) {
  readAttempt(db,attemptId);
  const found = origin
    ? origin.operationId
      ? db.prepare<[string,string,string,string], { operation_id: string }>(`SELECT operation_id FROM publication_target_selections WHERE attempt_id=? AND delivery_id=?
          AND json_extract(authorization_json,'$.authorization_operation_id')=? AND json_extract(authorization_json,'$.target_intent_hash')=? ORDER BY created_at_ms DESC,rowid DESC LIMIT 1`).get(attemptId,deliveryId,origin.operationId,origin.hash)
      : db.prepare<[string,string,string], { operation_id: string }>(`SELECT operation_id FROM publication_target_selections WHERE attempt_id=? AND delivery_id=?
          AND json_extract(authorization_json,'$.target_intent_hash')=? AND state='confirmed' ORDER BY created_at_ms DESC,rowid DESC LIMIT 1`).get(attemptId,deliveryId,origin.hash)
    : db.prepare<[string,string], { operation_id: string }>("SELECT operation_id FROM publication_target_selections WHERE attempt_id=? AND delivery_id=? AND state IN ('accepted','running','unknown') LIMIT 1").get(attemptId,deliveryId);
  return found ? targetSelection(db,found.operation_id) : null;
}
export function advanceTargetSelection(db: Database.Database,id: string,revision: number,state: PublicationTargetSelection['state'],identity: TargetIdentity | null,reason: string | null) {
  return guarded(() => db.transaction(() => {
    const current = targetSelection(db,id); assertProjectAvailable(db,readAttempt(db,current.view.attempt_id).projectId); assertDeletionPathsAvailable(db,[current.view.local_path]);
    if (current.view.revision !== revision) blocked('TARGET_SELECTION_CHANGED');
    const changed = db.prepare(`UPDATE publication_target_selections SET state=?,revision=revision+1,reason=?,updated_at_ms=?,
      expected_identity_json=?,confirmed_identity_json=? WHERE operation_id=? AND revision=?`).run(state,reason,Date.now(),
        JSON.stringify(['accepted','running'].includes(current.view.state) && state === 'running' && identity ? identity : current.expected),
        state === 'confirmed' && identity ? JSON.stringify(identity) : null,id,revision);
    if (!changed.changes) blocked('TARGET_SELECTION_CHANGED');
    db.prepare('UPDATE attempts SET revision=revision+1,updated_at_ms=? WHERE id=?').run(Date.now(),current.view.attempt_id);
    attemptEvent(db,current.view.attempt_id,`publication.target.${state}`);
    return targetSelection(db,id);
  }).immediate());
}
