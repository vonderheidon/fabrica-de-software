import type { HttpStartAttempt, HttpAnswerQuestion, HttpCaptureRetry, HttpRemoveResource, HttpCompletePublication, HttpReconcilePublication, HttpAuthorizeUpgrade, DeliveryMode } from '#contracts';

export function startAttemptBody(preparationId: string, preparationRevision: number, summaryHash: string): HttpStartAttempt {
  return { preparation_id: preparationId, preparation_revision: preparationRevision, authorized_summary_hash: summaryHash, authorized: true };
}
export function answerQuestionBody(answer: string, scopeChoice?: HttpAnswerQuestion['scope_choice']): HttpAnswerQuestion {
  return { answer, ...(scopeChoice === undefined ? {} : { scope_choice: scopeChoice }) };
}
export function captureRetryBody(producerPassageId: string): HttpCaptureRetry { return { producer_passage_id: producerPassageId }; }
export function removeResourceBody(planHash: string): HttpRemoveResource { return { plan_hash: planHash, confirmed: true }; }
export function completePublicationBody(deliveryId: string, authorizedMode: DeliveryMode): HttpCompletePublication {
  return { delivery_id: deliveryId, authorized_mode: authorizedMode, authorized: true };
}
export function reconcilePublicationBody(deliveryId: string): HttpReconcilePublication { return { delivery_id: deliveryId }; }
export function authorizeUpgradeBody(deliveryId: string, currentMode: DeliveryMode, targetMode: DeliveryMode, summaryHash: string): HttpAuthorizeUpgrade {
  return { delivery_id: deliveryId, current_mode: currentMode, target_mode: targetMode, authorized_additional_effects_hash: summaryHash, authorized: true };
}
export function setAttemptSelection(query: URLSearchParams, roundId: string | null, deliveryId: string | null): void {
  if (roundId) query.set('round_id', roundId);
  if (deliveryId) query.set('delivery_id', deliveryId);
}
export function setAttemptProjectFilter(query: URLSearchParams, projectId: string): void {
  if (projectId) query.set('project_id', projectId);
}
