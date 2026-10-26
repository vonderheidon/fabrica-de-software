import type Database from 'better-sqlite3';
import type { DeliveryMode, ModeUpgradeSummary } from '#contracts';
import { readAttempt, readCapture } from './attempts.js';
import { digest, configurationETag, readConfiguration } from './configuration-reads.js';
import { readSettings } from './settings.js';

export const modeOrder: readonly DeliveryMode[] = ['icr', 'commit', 'pr'];
export function authorizedMode(db: Database.Database, attemptId: string): DeliveryMode {
  const upgrade = db.prepare<[string], { target_mode: DeliveryMode }>('SELECT target_mode FROM publication_upgrades WHERE attempt_id=? ORDER BY rowid DESC LIMIT 1').get(attemptId);
  return upgrade?.target_mode ?? db.prepare<[string], { mode: DeliveryMode }>("SELECT json_extract(capture_json,'$.configuration.configuration.defaultDeliveryMode') AS mode FROM attempts WHERE id=?").get(attemptId)!.mode;
}
/** Hash only bounded operational references; never load project files or evidence bytes. */
export function upgradeSummaries(db: Database.Database, attemptId: string, deliveryId: string, reason: string | null): ModeUpgradeSummary[] {
  const a = readAttempt(db, attemptId); const mode = authorizedMode(db, attemptId); const s = readSettings(db);
  const capture = readCapture(db,attemptId);
  const publicationTarget = capture.v3Delivery?.publication_target ?? null;
  const version = db.prepare('SELECT id,revision,content_identity,base_sha,git_ref,has_delta FROM deliveries WHERE id=? AND attempt_id=?').get(deliveryId, attemptId);
  const review = db.prepare('SELECT id,state,independence_state,content_identity,verification_id FROM reviews WHERE delivery_id=?').get(deliveryId);
  const effects = db.prepare('SELECT operation_id,kind,state,revision FROM effects WHERE attempt_id=? ORDER BY rowid').all(attemptId);
  const selections = db.prepare(`SELECT operation_id,repository_id,selection_kind,local_path,state,revision,request_hash
    FROM publication_target_selections WHERE attempt_id=? AND delivery_id=? ORDER BY rowid`).all(attemptId,deliveryId);
  const targets = db.prepare(`SELECT operation_id,selection_operation_id,repository_id,local_path,local_identity_json,branch_ref,
    base_branch,base_sha,approved_ref,content_identity,task_type,task_description FROM delivery_targets
    WHERE attempt_id=? AND delivery_id=? ORDER BY rowid`).all(attemptId,deliveryId);
  return modeOrder.slice(modeOrder.indexOf(mode) + 1).map(targetMode => {
    const additionalEffects: ModeUpgradeSummary['additionalEffects'] = [...(mode === 'icr' ? ['local_commit' as const] : []), ...(targetMode === 'pr' ? ['push' as const, 'pull_request' as const] : [])];
    const targetRequired = capture.configuration.configuration.source.kind === 'github' && targetMode !== 'icr';
    const deliveryBranch = capture.configuration.configuration.delivery_branch;
    const blocked = a.phase !== 'finished' || !a.result ? 'ATTEMPT_NOT_FINISHED' : reason ?? (targetRequired && !publicationTarget ? 'PUBLICATION_TARGET_REQUIRED' : targetMode === 'pr' && deliveryBranch?.name === capture.configuration.configuration.base_branch ? 'PR_BRANCH_EQUALS_BASE' : null);
    return { targetMode, additionalEffects,publicationTarget,...(deliveryBranch === undefined ? {} : { deliveryBranch }),
      summaryHash: digest([s.installation_id,s.account_id,s.revision,a.id,a.revision,deliveryId,version,review,mode,targetMode,additionalEffects,effects,publicationTarget,selections,targets,
        configurationETag(readConfiguration(db,a.projectId))]),
      capability: blocked ? { available: false, reason_code: blocked } : { available: true } };
  });
}
