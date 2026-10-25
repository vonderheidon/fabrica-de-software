import { useEffect, useState } from 'react';
import type { HttpEventPage } from '#contracts';
import { HttpError, requestJson } from '../api/http.js';
import type { ControllerEventNotice } from './controller-events.js';
import { isNotificationEvent, notificationConsumer, presentNotification } from './local-notifications.js';

export function useLocalNotifications(installation: string | undefined) {
  const key = installation ? `factory.notifications.browser_host.${installation}` : null;
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => capability());
  useEffect(() => {
    const refresh = () => {
      setPermission(capability());
      try { setEnabled(key !== null && localStorage.getItem(key) === 'enabled'); }
      catch { setEnabled(false); setMessage('O armazenamento local está indisponível. As pendências continuam na interface.'); }
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh); };
  }, [key]);
  useEffect(() => {
    if (!installation || !enabled || permission !== 'granted') return;
    let active = true;
    let scanning = false;
    let scanAgain = false;
    let generation = 0;
    let watermark: string | null = null;
    const pending = new Set<string>();
    const consumer = notificationConsumer(installation, window.location.origin);
    const current = () => {
      try { return active && key !== null && localStorage.getItem(key) === 'enabled' && capability() === 'granted'; }
      catch { return false; }
    };
    const send = async (seq: string) => {
      if (!current() || pending.has(seq)) return;
      pending.add(seq);
      const requestedGeneration = generation;
      try { await presentNotification(await consumer, seq, () => current() && requestedGeneration === generation, value => { if (active) setMessage(value); }); }
      catch (error: unknown) { if (active && !(error instanceof HttpError && [404, 409].includes(error.status))) setMessage('Não foi possível confirmar a notificação. Consulte as pendências na interface.'); }
      finally { pending.delete(seq); }
    };
    const event = (value: Event) => {
      const notice = (value as CustomEvent<ControllerEventNotice>).detail;
      if (notice && isNotificationEvent(notice.event_type)) void send(notice.seq);
    };
    const scan = async () => {
      if (scanning) { scanAgain = true; return; }
      scanning = true;
      try {
        let cursor: string | null = null;
        let through: string | null = null;
        do {
          const page: HttpEventPage = await requestJson<HttpEventPage>(`/api/v1/events?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
          if (!current()) return;
          through ??= page.event_cursor;
          for (const item of page.items) {
            if (watermark !== null && BigInt(item.seq) <= BigInt(watermark)) continue;
            if (isNotificationEvent(item.event_type)) await send(item.seq);
          }
          const previous = watermark;
          cursor = previous !== null && page.items.every(item => BigInt(item.seq) > BigInt(previous)) ? page.next_cursor : null;
        } while (cursor && current());
        watermark = through;
      } catch { if (active) setMessage('Não foi possível consultar notificações. As pendências continuam na interface.'); }
      finally { scanning = false; if (scanAgain && active) { scanAgain = false; void scan(); } }
    };
    const resync = () => { generation += 1; void scan(); };
    window.addEventListener('factory-controller-event', event);
    window.addEventListener('factory-controller-resync', resync);
    void scan();
    return () => { active = false; window.removeEventListener('factory-controller-event', event); window.removeEventListener('factory-controller-resync', resync); };
  }, [installation, key, enabled, permission]);
  async function activate() {
    setMessage('');
    if (!key || capability() === 'unsupported') return;
    try {
      const result = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      setPermission(result);
      if (result === 'granted') { localStorage.setItem(key, 'enabled'); setEnabled(true); }
    } catch { setMessage('Não foi possível ativar notificações. Consulte as pendências na interface.'); }
  }
  function deactivate() {
    try { if (key) localStorage.removeItem(key); setEnabled(false); }
    catch { setMessage('Não foi possível salvar a preferência neste navegador.'); }
  }
  return { enabled, permission, message, activate, deactivate, ready: key !== null };
}
function capability(): NotificationPermission | 'unsupported' {
  return window.isSecureContext && 'Notification' in window ? Notification.permission : 'unsupported';
}
export function LocalNotificationSettings({ notifications }: { notifications: ReturnType<typeof useLocalNotifications> }) {
  const { enabled, permission, message, ready, activate, deactivate } = notifications;
  return <section className="card form-section settings-notifications" aria-labelledby="notification-settings-title">
    <div className="settings-section-heading">
      <div><h2 id="notification-settings-title">Notificações locais</h2><p className="notification-state">{permission === 'unsupported' ? 'Indisponíveis neste navegador.' : permission === 'denied' ? 'Permissão negada. Para permitir, altere a permissão deste site no navegador.' : enabled && permission === 'granted' ? 'Ativas neste navegador.' : 'Desativadas neste navegador.'}</p></div>
      {enabled ? <button type="button" onClick={deactivate}>Desativar notificações</button> : <button type="button" disabled={!ready || permission === 'unsupported' || permission === 'denied'} onClick={() => void activate()}>Ativar notificações</button>}
    </div>
    <p className="notification-guidance">Perguntas, falhas e conclusões continuam acessíveis na interface. Com a aplicação fechada, não há garantia de entrega posterior.</p>
    {message && <p role="status">{message}</p>}
  </section>;
}
