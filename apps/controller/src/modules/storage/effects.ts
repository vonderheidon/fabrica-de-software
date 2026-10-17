import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { EffectIdentity, EffectReceipt, EffectView, OperationId, type DeliveryMode } from '#contracts';
import { digest, guarded } from './configuration-reads.js';
import { readSettings } from './settings.js';
import { readAttempt, readCapture } from './attempts.js';
import { assertPublicationEligible } from './publication.js';
import { OperationError } from './operations.js';
import { StorageError } from './errors.js';
import { authorizedMode } from './publication-modes.js';

export type EffectOrigin = { attemptId: string; creationId?: never; deliveryId?: string } | { creationId: string; attemptId?: never; deliveryId?: never };
export interface EffectIntent {
  origin: EffectOrigin; kind: EffectView['kind']; scopeKey: string; expectedIdentity: EffectIdentity;
  authorization: { accountId: string; mode: DeliveryMode; sourceOperationId: string };
}
function explicitGrant(db: Database.Database, attemptId: string, deliveryId: string | null, operationId?: string): boolean {
  return Boolean(operationId && db.prepare("SELECT operation_id FROM publication_requests WHERE operation_id=? AND attempt_id=? AND delivery_id=? AND kind IN ('publication.complete','publication.authorize-upgrade') AND authorized_mode IN ('icr','commit','pr') AND state IN ('accepted','running')")
    .get(operationId,attemptId,deliveryId));
}
function validateAttemptEffect(db: Database.Database, attemptId: string, deliveryId: string | null, kind: EffectView['kind'], identity: EffectIdentity, sourceOperationId: string): void {
  const a = readAttempt(db,attemptId); const capture = readCapture(db,attemptId);
  const explicit = explicitGrant(db,attemptId,deliveryId,sourceOperationId);
  if (identity.issueId !== capture.issue.id || identity.repositoryId !== capture.issue.repository.id ||
    (a.result && a.result !== 'delivered' && !(a.result === 'interrupted' && explicit)) || a.suspension || a.pendingQuestionId ||
    db.prepare('SELECT operation_id FROM cancellation_requests WHERE attempt_id=?').get(attemptId)) {
    throw new OperationError(409,'PUBLICATION_REVOKED','The effect is outside the current attempt authority.');
  }
  const mode = authorizedMode(db,attemptId);
  if (kind !== 'project_status') {
    if (!deliveryId) throw new OperationError(409,'EFFECT_IDENTITY_CONFLICT','The result comment requires an approved delivery.');
    assertPublicationEligible(db,attemptId,deliveryId,explicit);
    const d = db.prepare<[string],{ content_identity: string; base_sha: string }>('SELECT content_identity,base_sha FROM deliveries WHERE id=?').get(deliveryId);
    if (!d || identity.contentIdentity !== d.content_identity) throw new OperationError(409,'EFFECT_IDENTITY_CONFLICT','The effect must identify the approved tree.');
    if (kind === 'local_commit' && (mode === 'icr' || identity.parentSha !== d.base_sha ||
      identity.issueNumber !== capture.issue.number || !identity.commitTime || identity.branchRef !== `refs/heads/factory/${capture.issue.number}/${attemptId}`)) {
      throw new OperationError(409,'EFFECT_IDENTITY_CONFLICT','The commit must identify the approved tree, base and managed branch.');
    }
    if (kind === 'issue_comment' && mode === 'pr') throw new OperationError(409,'EFFECT_NOT_AUTHORIZED','PR mode records results in its pull request.');
    if (kind === 'issue_comment' && mode === 'commit' && !db.prepare("SELECT operation_id FROM effects WHERE attempt_id=? AND delivery_id=? AND kind='local_commit' AND state IN ('confirmed','not_applicable')").get(attemptId,deliveryId)) {
      throw new OperationError(409,'COMMIT_PENDING','The approved local commit must be resolved before the result comment.');
    }
    if (kind === 'push' || kind === 'pull_request') {
      const commit = db.prepare<[string,string],{ state: string; receipt_json: string | null }>("SELECT state,receipt_json FROM effects WHERE attempt_id=? AND delivery_id=? AND kind='local_commit'").get(attemptId,deliveryId);
      const sha = commit?.receipt_json ? (JSON.parse(commit.receipt_json) as { id: string }).id : undefined;
      if (mode !== 'pr' || !explicit || !commit || !['confirmed','not_applicable'].includes(commit.state) ||
        identity.commitSha !== sha || identity.branchRef !== `refs/heads/factory/${capture.issue.number}/${attemptId}` ||
        identity.repositoryOwner !== capture.issue.repository.owner.login || identity.repositoryName !== capture.issue.repository.name ||
        identity.baseBranch !== capture.configuration.configuration.baseBranch || identity.parentSha !== d.base_sha) {
        throw new OperationError(409,'EFFECT_IDENTITY_CONFLICT','Remote publication requires the authorized repository, branch, base and confirmed commit.');
      }
      if (kind === 'pull_request' && !db.prepare("SELECT operation_id FROM effects WHERE attempt_id=? AND delivery_id=? AND kind='push' AND state IN ('confirmed','not_applicable')").get(attemptId,deliveryId)) throw new OperationError(409,'PUSH_PENDING','Confirm the exact remote ref and SHA before creating a pull request.');
    }
  } else {
    const mapping = capture.configuration.configuration.githubProject;
    const stage = a.result === 'delivered' ? 'delivered' : ['reviewing','publishing'].includes(a.phase) ? 'inReview' : 'inProgress';
    if (!mapping || identity.projectId !== mapping.id || identity.fieldId !== mapping.statusFieldId || identity.optionId !== mapping.statusOptionIds[stage] ||
      identity.itemId !== capture.issue.memberships.find(m => m.projectId === mapping.id)?.itemId || a.result === 'interrupted') {
      throw new OperationError(409,'EFFECT_IDENTITY_CONFLICT','The Status effect does not represent the current factory stage.');
    }
  }
}
interface Row {
  operation_id: string; creation_id: string | null; attempt_id: string | null; delivery_id: string | null;
  kind: EffectView['kind']; scope_key: string; state: EffectView['state']; expected_identity_json: string;
  receipt_json: string | null; reason: string | null; revision: number; sent_at_ms: number | null; confirmed_at_ms: number | null;
  authorization_json: string;
}
export function effectView(row: Row): EffectView {
  const receipt: unknown = row.receipt_json ? JSON.parse(row.receipt_json) : null;
  const value = { operationId: row.operation_id, attemptId: row.attempt_id, creationId: row.creation_id, deliveryId: row.delivery_id,
    kind: row.kind, scopeKey: row.scope_key, state: row.state, expectedIdentity: JSON.parse(row.expected_identity_json) as unknown,
    confirmedIdentity: receipt, receipt, reason: row.reason, authorized: true, revision: row.revision,
    sentAtMs: row.sent_at_ms, confirmedAtMs: row.confirmed_at_ms };
  if (!Value.Check(EffectView, value)) throw new StorageError('OPERATION_DATA_INVALID');
  return value;
}
export function readEffect(db: Database.Database, id: string): EffectView {
  const s = readSettings(db);
  const row = db.prepare<[string, string, string | null], Row>(`SELECT e.* FROM effects e JOIN operation_requests o ON o.operation_id=e.operation_id
    WHERE e.operation_id=? AND o.installation_id=? AND o.account_id IS ?`).get(id, s.installationId, s.accountId);
  if (!row) throw new OperationError(404, 'EFFECT_NOT_FOUND', 'Effect not found in the current scope.');
  if (row.attempt_id) readAttempt(db, row.attempt_id);
  return effectView(row);
}
export function effectEvent(db: Database.Database, id: string, type: string, revision: number): void {
  const e = db.prepare<[string], Row>('SELECT * FROM effects WHERE operation_id=?').get(id);
  if (!e) throw new StorageError('OPERATION_DATA_INVALID');
  db.prepare(`INSERT INTO events(entity_type,entity_id,attempt_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms)
    VALUES ('effect',?,?,?,?,?,'{}',?)`).run(id, e.attempt_id, id, type, revision, Date.now());
  if (e.attempt_id) db.prepare('UPDATE attempts SET revision=revision+1,updated_at_ms=? WHERE id=?').run(Date.now(),e.attempt_id);
}
export function recordEffectIntent(db: Database.Database, input: EffectIntent): EffectView {
  return guarded(() => db.transaction(() => {
    const s = readSettings(db); const { origin, authorization } = input;
    if (!Value.Check(EffectIdentity, input.expectedIdentity) || !Value.Check(OperationId, origin.attemptId ?? origin.creationId) ||
      !Value.Check(OperationId, authorization.sourceOperationId) || authorization.accountId !== s.accountId || !['icr','commit','pr'].includes(authorization.mode) ||
      !['issue_comment','project_status','local_commit','push','pull_request'].includes(input.kind) || input.scopeKey.length < 1 || input.scopeKey.length > 4096 ||
      (['local_commit','push','pull_request'].includes(input.kind) && (input.scopeKey !== origin.deliveryId || !origin.attemptId)) ||
      (origin.attemptId !== undefined) === (origin.creationId !== undefined)) {
      throw new OperationError(400, 'EFFECT_INTENT_INVALID', 'The effect identity or authorization is invalid.');
    }
    if (origin.attemptId) {
      const a = readAttempt(db, origin.attemptId);
      const source = db.prepare(`SELECT operation_id FROM operation_requests WHERE operation_id=? AND account_id IS ? AND resource_id=?`).get(authorization.sourceOperationId, s.accountId, a.id);
      if (!source) throw new OperationError(409, 'EFFECT_AUTHORIZATION_INVALID', 'The effect requires a durable authorization for this attempt.');
      if (authorization.mode !== authorizedMode(db,a.id)) throw new OperationError(409,'EFFECT_AUTHORIZATION_INVALID','The effect mode differs from the durable authorization.');
      validateAttemptEffect(db,a.id,origin.deliveryId ?? null,input.kind,input.expectedIdentity,authorization.sourceOperationId);
      if (a.suspension) throw new OperationError(409, 'PUBLICATION_BLOCKED', 'The attempt is suspended.');
    } else {
      // The scaffold consumer supplies its durable creation operation; no fictitious creation is seeded here.
      const source = db.prepare("SELECT operation_id FROM operation_requests WHERE operation_id=? AND account_id IS ? AND resource_type='creation' AND resource_id=?")
        .get(authorization.sourceOperationId, s.accountId, origin.creationId);
      if (!source) throw new OperationError(409, 'EFFECT_AUTHORIZATION_INVALID', 'The creation requires a durable operation.');
    }
    const prior = db.prepare<[string | null, string | null, string, string], Row>('SELECT * FROM effects WHERE attempt_id IS ? AND creation_id IS ? AND kind=? AND scope_key=?')
      .get(origin.attemptId ?? null, origin.creationId ?? null, input.kind, input.scopeKey);
    if (prior) {
      if (digest(JSON.parse(prior.expected_identity_json) as unknown) !== digest(input.expectedIdentity) || prior.delivery_id !== (origin.deliveryId ?? null)) {
        throw new OperationError(409, 'EFFECT_IDENTITY_CONFLICT', 'The effect scope already has a different identity.');
      }
      return readEffect(db, prior.operation_id);
    }
    const id = randomUUID(); const next = db.prepare<[],{ seq: number }>('SELECT coalesce(max(seq),0)+1 AS seq FROM events').get()!.seq;
    const receipt = { revision: 1, eventCursor: String(next) };
    db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json)
      VALUES (?,?,?,'effect.execute','effect',?,?,'{}',?)`).run(id, s.installationId, s.accountId, id, digest(input), JSON.stringify(receipt));
    db.prepare(`INSERT INTO effects(operation_id,creation_id,attempt_id,delivery_id,kind,scope_key,authorization_json,expected_identity_json,state,created_at_ms)
      VALUES (?,?,?,?,?,?,?,?,'not_started',?)`).run(id, origin.creationId ?? null, origin.attemptId ?? null, origin.deliveryId ?? null, input.kind, input.scopeKey,
      JSON.stringify(authorization), JSON.stringify(input.expectedIdentity), Date.now());
    effectEvent(db, id, 'effect.intended', 1); return readEffect(db, id);
  }).immediate());
}
export function assertEffectAuthorized(db: Database.Database,id: string,sourceOperationId: string): void {
  const e = readEffect(db,id);
  if (e.state !== 'running' || !e.attemptId) throw new OperationError(409,'EFFECT_AUTHORIZATION_INVALID','The effect is no longer authorized for sending.');
  validateAttemptEffect(db,e.attemptId,e.deliveryId,e.kind,e.expectedIdentity,sourceOperationId);
  if (db.prepare("SELECT operation_id FROM effects WHERE attempt_id=? AND operation_id<>? AND state IN ('running','unknown')").get(e.attemptId,id)) throw new OperationError(409,'EFFECT_UNRESOLVED','Another effect requires reconciliation.');
}
export function claimEffect(db: Database.Database, id: string, revision: number, sourceOperationId?: string): boolean {
  return guarded(() => db.transaction(() => {
    const e = readEffect(db, id);
    if (e.revision !== revision || !['not_started','failed_known'].includes(e.state)) return false;
    if (e.attemptId) {
      const source = db.prepare<[string],{ authorization_json: string }>('SELECT authorization_json FROM effects WHERE operation_id=?').get(id)!;
      const authorization = JSON.parse(source.authorization_json) as EffectIntent['authorization'];
      validateAttemptEffect(db,e.attemptId,e.deliveryId,e.kind,e.expectedIdentity,sourceOperationId ?? authorization.sourceOperationId);
      if (db.prepare("SELECT operation_id FROM effects WHERE attempt_id=? AND operation_id<>? AND state IN ('running','unknown')").get(e.attemptId, id)) {
        throw new OperationError(409, 'EFFECT_UNRESOLVED', 'Reconcile the previous unknown effect before sending another.');
      }
    }
    db.prepare("UPDATE effects SET state='running',sent_at_ms=?,reason=NULL,revision=revision+1 WHERE operation_id=? AND revision=?").run(Date.now(), id, revision);
    effectEvent(db, id, 'effect.sent', revision + 1); return true;
  }).immediate());
}
export function finishEffect(db: Database.Database, id: string, revision: number, state: 'confirmed' | 'failed_known' | 'unknown' | 'not_applicable', receipt: EffectReceipt | null, reason: string | null): void {
  guarded(() => db.transaction(() => {
    const e = readEffect(db, id);
    if (e.state === 'confirmed' || e.state === 'not_applicable') return;
    if (e.revision !== revision || !['running','unknown'].includes(e.state) || (e.state === 'unknown' && !['confirmed','not_applicable'].includes(state))) {
      throw new OperationError(409, 'EFFECT_REVISION_CONFLICT', 'The effect changed during observation.');
    }
    if ((state === 'confirmed') !== (receipt !== null) || (receipt && !Value.Check(EffectReceipt, receipt)) || (reason !== null && !/^[A-Z0-9_]{1,128}$/.test(reason))) {
      throw new OperationError(400, 'EFFECT_RECEIPT_INVALID', 'The effect receipt is invalid.');
    }
    if (receipt && e.kind === 'project_status' && (receipt.id !== e.expectedIdentity.itemId || receipt.optionId !== e.expectedIdentity.optionId)) {
      throw new OperationError(409, 'EFFECT_RECEIPT_INVALID', 'The Status receipt does not match the intended item and option.');
    }
    if (e.kind === 'local_commit' && receipt && (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(receipt.id) ||
      receipt.contentIdentity !== e.expectedIdentity.contentIdentity || receipt.parentSha !== e.expectedIdentity.parentSha ||
      receipt.branchRef !== e.expectedIdentity.branchRef || receipt.operationId !== e.operationId)) {
      throw new OperationError(409,'EFFECT_RECEIPT_INVALID','The commit receipt differs from its durable identity.');
    }
    if (receipt && (e.kind === 'push' || e.kind === 'pull_request') && (receipt.commitSha !== e.expectedIdentity.commitSha || receipt.branchRef !== e.expectedIdentity.branchRef || receipt.repositoryId !== e.expectedIdentity.repositoryId ||
      (e.kind === 'push' && receipt.id !== e.expectedIdentity.commitSha) || (e.kind === 'pull_request' && receipt.baseBranch !== e.expectedIdentity.baseBranch))) {
      throw new OperationError(409,'EFFECT_RECEIPT_INVALID','The remote receipt differs from its durable repository, ref, SHA or base.');
    }
    if (state === 'not_applicable' && (!['local_commit','push','pull_request'].includes(e.kind) || reason !== 'APPROVED_NO_DELTA' ||
      db.prepare<[string],{ has_delta: number }>('SELECT has_delta FROM deliveries WHERE id=?').get(e.deliveryId!)?.has_delta !== 0)) {
      throw new OperationError(409,'EFFECT_RECEIPT_INVALID','Only a verified approved delivery without changes skips its local commit.');
    }
    // A late confirmation records a remote fact even after cancellation. It never restores attempt authority.
    db.prepare('UPDATE effects SET state=?,receipt_json=?,reason=?,confirmed_at_ms=?,revision=revision+1 WHERE operation_id=? AND revision=?')
      .run(state, receipt ? JSON.stringify(receipt) : null, reason, state === 'confirmed' ? Date.now() : null, id, revision);
    effectEvent(db, id, `effect.${state}`, revision + 1);
    if (state === 'confirmed' && e.kind === 'project_status' && e.attemptId) {
      const superseded = db.prepare<[string,string],{ operation_id: string; revision: number }>(`SELECT operation_id,revision FROM effects WHERE attempt_id=? AND kind='project_status'
        AND state IN ('not_started','failed_known') AND rowid<(SELECT rowid FROM effects WHERE operation_id=?)`).all(e.attemptId,id);
      for (const prior of superseded) {
        // A later confirmed stage makes an earlier failed projection inapplicable; its diagnostic and history remain.
        db.prepare("UPDATE effects SET state='not_applicable',revision=revision+1 WHERE operation_id=?").run(prior.operation_id);
        effectEvent(db,prior.operation_id,'effect.stage-superseded',prior.revision+1);
      }
    }
  }).immediate());
}
