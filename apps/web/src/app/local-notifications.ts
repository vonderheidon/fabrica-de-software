import { Value } from '@sinclair/typebox/value';
import { NotificationClaim, type NotificationReceipt } from '#contracts';
import { requestJsonWithMetadata } from '../api/http.js';

export function notificationTarget(hash: string): string | null {
  return /^#principal\/tentativas\?attemptId=[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}&dialog=detail$/.test(hash) ? hash : null;
}
export const notificationBodies = { question_pending: 'Uma tentativa aguarda sua decisão.', failure: 'Uma tentativa precisa de atenção.', completion: 'Uma tentativa foi concluída.' };
export function isNotificationEvent(type: string): boolean {
  return ['question-raised', 'attempt.icr-completed', 'attempt.commit-completed', 'attempt.pr-completed', 'dispatch.failed', 'workspace.failed', 'capture.failed', 'verification.failed', 'review.workspace.partial', 'attempt.failed', 'attempt.blocked', 'active-time.expired', 'question.expired', 'tracking-lost', 'publication.failed', 'publication.partial'].includes(type);
}
// Deriving a non-secret identity avoids first-use races between tabs.
export async function notificationConsumer(installation: string, origin: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([installation, origin, 'browser_host']))));
  bytes[6] = (bytes[6]! & 15) | 128;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes.slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export async function presentNotification(consumer: string, seq: string, current: () => boolean, report: (message: string) => void): Promise<void> {
  const operation = crypto.randomUUID();
  const { data: claim, etag } = await requestJsonWithMetadata<NotificationClaim>('/api/v1/notifications/claims', {
    method: 'POST', headers: { 'Idempotency-Key': operation }, body: JSON.stringify({ consumer_id: consumer, surface: 'browser_host', event_seq: seq }),
  });
  if (!Value.Check(NotificationClaim, claim) || claim.operation_id !== operation || claim.consumer_id !== consumer || claim.event_seq !== seq || !claim.send_allowed || claim.state !== 'reserved') return;
  const target = notificationTarget(claim.notification.target_hash);
  let recorded = false;
  const receipt = (state: 'confirmed' | 'uncertain' | 'unavailable'): void => {
    if (recorded) return;
    recorded = true;
    void requestJsonWithMetadata<NotificationReceipt>('/api/v1/notifications/receipts', {
      method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID(), 'If-Match': etag ?? `"${claim.dispatch_id}:${claim.revision}"` },
      body: JSON.stringify({ dispatch_id: claim.dispatch_id, dispatch_revision: claim.revision, state }),
    }).catch(() => report('O resultado da notificação não foi confirmado. Consulte a tentativa; não haverá reenvio automático.'));
  };
  if (!current()) { receipt('uncertain'); return; }
  if (!target || !('Notification' in window) || Notification.permission !== 'granted') { receipt('unavailable'); return; }
  try {
    const kind = claim.notification.event_kind as keyof typeof notificationBodies;
    const notification = new Notification(claim.notification.title, { body: notificationBodies[kind], tag: claim.dispatch_id });
    const timer = window.setTimeout(() => { receipt('uncertain'); report('A apresentação não foi confirmada pelo navegador. Consulte as pendências na interface.'); }, 10000);
    notification.onshow = () => { window.clearTimeout(timer); receipt('confirmed'); };
    notification.onerror = () => { window.clearTimeout(timer); receipt('unavailable'); report('O navegador não apresentou a notificação. Consulte as pendências na interface.'); };
    notification.onclick = () => { window.focus(); window.location.hash = target; notification.close(); };
    notification.onclose = () => { window.clearTimeout(timer); receipt('uncertain'); };
  } catch { receipt('unavailable'); report('Notificações indisponíveis neste navegador. Consulte as pendências na interface.'); }
}
