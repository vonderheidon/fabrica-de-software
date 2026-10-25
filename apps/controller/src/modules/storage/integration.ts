import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { OperationError } from './operations.js';
import { guarded } from './configuration-reads.js';
import { readAttempt, readCapture, attemptEvent } from './attempts.js';
import { readDelivery } from './deliveries.js';
import { readReview, openFindings, type CorrectionPlan } from './reviews.js';
import { assertPublicationEligible } from './publication.js';

export interface IntegrationPlan { baseSha: string; localPath: string; rootIdentity: string }
export function integrationTarget(db: Database.Database, deliveryId: string): IntegrationPlan | null {
  const d = readDelivery(db,deliveryId);
  const row = db.prepare<[string, number], { baseSha: string; localPath: string; rootIdentity: string }>(`SELECT
    json_extract(integration_json,'$.base_sha') AS baseSha,json_extract(integration_json,'$.local_path') AS localPath,
    json_extract(integration_json,'$.root_identity') AS rootIdentity FROM rounds WHERE attempt_id=? AND round_number<=?
    AND integration_json IS NOT NULL ORDER BY round_number DESC LIMIT 1`).get(d.attemptId,d.round);
  return row ?? null;
}
export function beginIntegration(db: Database.Database, deliveryId: string, operationId: string, target: IntegrationPlan): CorrectionPlan | null {
  return guarded(() => db.transaction(() => {
    if (db.prepare("SELECT 1 FROM rounds WHERE json_extract(integration_json,'$.operation_id')=?").get(operationId)) return null;
    const d = readDelivery(db, deliveryId); const a = readAttempt(db, d.attemptId);
    assertPublicationEligible(db, a.id, d.id, true);
    const command = db.prepare<[string, string, string], { authorized_mode: string | null }>(`SELECT authorized_mode FROM publication_requests
      WHERE operation_id=? AND attempt_id=? AND delivery_id=? AND state IN ('accepted','running') AND kind IN ('publication.complete','publication.authorize-upgrade')`).get(operationId,a.id,d.id);
    if (!command || !['commit','pr'].includes(command.authorized_mode ?? '') ||
      db.prepare("SELECT 1 FROM effects WHERE attempt_id=? AND (state IN ('running','unknown') OR (delivery_id=? AND kind IN ('local_commit','push','pull_request') AND state NOT IN ('not_started','failed_known')))").get(a.id,d.id)) {
      throw new OperationError(409,'INTEGRATION_BLOCKED','Reconcilie os efeitos e bloqueios antes de adaptar a integração.');
    }
    const capture = readCapture(db,a.id);
    if (d.round - 1 >= capture.configuration.configuration.correction_limit) throw new OperationError(409,'INTEGRATION_LIMIT','Limite capturado atingido. A versão aprovada foi preservada; encerre a tentativa ou prepare outra.');
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(target.baseSha) || target.baseSha === d.baseSha) throw new OperationError(409,'INTEGRATION_BASE_INVALID','A adaptação exige uma nova base observada.');
    const review = readReview(db,d.id)!; const role = capture.roleResources.find(x => x.role === 'implementer');
    if (!role) throw new OperationError(409,'INTEGRATION_BLOCKED','Perfil capturado indisponível.');
    const passageId = randomUUID(); const version = randomUUID(); const now = Date.now();
    const integration = { ...target, operationId, sourceDeliveryId:d.id, sourceContentIdentity:d.contentIdentity, sourceRef:d.gitRef };
    const upgrade = db.prepare<[string], { current_mode: string }>('SELECT current_mode FROM publication_upgrades WHERE operation_id=?').get(operationId);
    const journal = { format_version:1,base_sha:target.baseSha,local_path:target.localPath,root_identity:target.rootIdentity,
      operation_id:operationId,source_delivery_id:d.id,source_content_identity:d.contentIdentity,source_ref:d.gitRef,
      source_result:a.result,source_mode:upgrade?.current_mode ?? capture.configuration.configuration.default_delivery_mode };
    db.prepare('INSERT INTO rounds(attempt_id,round_number,delivery_version,created_at_ms,integration_json) VALUES (?,?,?,?,?)').run(a.id,d.round+1,version,now,JSON.stringify(journal));
    db.prepare(`INSERT INTO passages(id,attempt_id,round_number,delivery_version,role,role_resource_json,terminal_name,state,tracking_state,session_source_id,created_at_ms,attempt_session_id)
      VALUES (?,?,?,?,'implementer',?,?,'starting','pending',?,?,(SELECT id FROM attempt_sessions WHERE attempt_id=? AND role='implementer'))`)
      .run(passageId,a.id,d.round+1,version,JSON.stringify(role),`factory-${passageId}`,d.producerPassageId,now,a.id);
    db.prepare("UPDATE attempts SET phase='implementing',result=NULL,diagnostic=NULL,suspension=NULL,revision=revision+1,updated_at_ms=? WHERE id=?").run(now,a.id);
    attemptEvent(db,a.id,'integration.planned');
    return { sourcePassageId:d.producerPassageId,passageId,review,findings:openFindings(db,a.id,d.round+1),guidance:null,integration };
  }).immediate());
}
