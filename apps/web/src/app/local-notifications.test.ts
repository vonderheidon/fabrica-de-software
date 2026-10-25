// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requestJsonWithMetadata, requestJson } from '../api/http.js';
import { notificationConsumer, notificationTarget, presentNotification } from './local-notifications.js';
import { LocalNotificationSettings, useLocalNotifications } from './useLocalNotifications.js';

vi.mock('../api/http.js', () => ({ requestJsonWithMetadata: vi.fn(), requestJson: vi.fn(), HttpError: class extends Error {} }));
const id = '11111111-1111-4111-8111-111111111111';
const target = `#principal/tentativas?attemptId=${id}&dialog=detail`;
let instances: Surface[] = [];
class Surface {
  static permission: NotificationPermission = 'granted';
  static requestPermission = vi.fn(async () => Surface.permission);
  onshow: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclick: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn();
  constructor(readonly title: string, readonly options: NotificationOptions) { instances.push(this); }
}
let root: ReturnType<typeof createRoot> | undefined;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Notification', Surface);
  vi.stubGlobal('isSecureContext', true);
  vi.useFakeTimers();
  vi.clearAllMocks();
  instances = [];
  Surface.permission = 'granted';
  localStorage.clear();
  vi.mocked(requestJson).mockResolvedValue({ items: [], event_cursor: '0', next_cursor: null });
  vi.mocked(requestJsonWithMetadata).mockImplementation(async (path, init) => {
    if (path.endsWith('/receipts')) return { data: {}, etag: null };
    const body = JSON.parse(init!.body as string);
    return { data: { dispatch_id: id, revision: 1, consumer_id: body.consumer_id, surface: 'browser_host', event_seq: body.event_seq,
      state: 'reserved', send_allowed: true, operation_id: new Headers(init!.headers).get('Idempotency-Key'),
      notification: { title: 'Nova fábrica de software', event_kind: 'question_pending', target_hash: target } }, etag: `"${id}:1"` };
  });
});
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });
const receipts = () => vi.mocked(requestJsonWithMetadata).mock.calls.filter(([path]) => path.endsWith('/receipts')).map(([, init]) => JSON.parse(init!.body as string));

it('shares identity across tabs/reloads and isolates installation and origin', async () => {
  const consumer = await notificationConsumer('installation', 'http://127.0.0.1:4310');
  expect(consumer).toBe(await notificationConsumer('installation', 'http://127.0.0.1:4310'));
  expect(consumer).not.toBe(await notificationConsumer('other', 'http://127.0.0.1:4310'));
  expect(consumer).not.toBe(await notificationConsumer('installation', 'http://localhost:4310'));
  expect(consumer).toMatch(/^[a-f0-9-]{14}8[a-f0-9-]{21}$/);
});
it('accepts only the exact local attempt destination', () => {
  expect(notificationTarget(target)).toBe(target);
  for (const unsafe of ['https://example.com', '//example.com', target + '&action=publish', target.replace('detail', 'publication'), target.replace(id, '../settings')]) expect(notificationTarget(unsafe)).toBeNull();
});
it('records confirmation only after show and opens only the validated local detail', async () => {
  await presentNotification(id, '1', () => true, vi.fn());
  expect(receipts()).toEqual([]);
  expect(instances[0]!.options.body).toBe('Uma tentativa aguarda sua decisão.');
  instances[0]!.onshow!();
  expect(receipts()[0].state).toBe('confirmed');
  const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
  instances[0]!.onclick!();
  expect(window.location.hash).toBe(target);
  expect(focus).toHaveBeenCalledOnce();
  instances[0]!.onclose!();
  expect(receipts()).toHaveLength(1);
});
it('never presents a replay or a late claim after teardown', async () => {
  const original = vi.mocked(requestJsonWithMetadata).getMockImplementation()!;
  vi.mocked(requestJsonWithMetadata).mockImplementation(async (...args) => {
    const response = await original(...args);
    return args[0].endsWith('/claims') ? { ...response, data: { ...response.data as object, send_allowed: false } } : response;
  });
  await presentNotification(id, '1', () => true, vi.fn());
  expect(instances).toHaveLength(0);
  vi.mocked(requestJsonWithMetadata).mockImplementation(original);
  await presentNotification(id, '2', () => false, vi.fn());
  expect(instances).toHaveLength(0);
  expect(receipts()[0].state).toBe('uncertain');
});
it('keeps silence uncertain and surface errors unavailable', async () => {
  await presentNotification(id, '1', () => true, vi.fn());
  await vi.advanceTimersByTimeAsync(10000);
  expect(receipts()[0].state).toBe('uncertain');
  await presentNotification(id, '2', () => true, vi.fn());
  instances[1]!.onerror!();
  expect(receipts()[1].state).toBe('unavailable');
});
it('does not retry a lost receipt or turn it into a new presentation', async () => {
  const original = vi.mocked(requestJsonWithMetadata).getMockImplementation()!;
  vi.mocked(requestJsonWithMetadata).mockImplementation(async (...args) => {
    if (args[0].endsWith('/receipts')) throw new Error('lost');
    return original(...args);
  });
  const report = vi.fn();
  await presentNotification(id, '1', () => true, report);
  instances[0]!.onshow!();
  await Promise.resolve(); await Promise.resolve();
  await vi.advanceTimersByTimeAsync(30000);
  expect(instances).toHaveLength(1);
  expect(receipts()).toHaveLength(1);
  expect(report).toHaveBeenCalledWith(expect.stringContaining('não foi confirmado'));
});
it('requires activation and propagates the preference through storage events', async () => {
  Surface.permission = 'default';
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  function Settings() { return createElement(LocalNotificationSettings, { notifications: useLocalNotifications('installation') }); }
  await act(async () => root!.render(createElement(Settings)));
  expect(Surface.requestPermission).not.toHaveBeenCalled();
  expect(requestJsonWithMetadata).not.toHaveBeenCalled();
  Surface.requestPermission.mockImplementationOnce(async () => { Surface.permission = 'granted'; return 'granted'; });
  await act(async () => host.querySelector('button')!.click());
  expect(Surface.requestPermission).toHaveBeenCalledOnce();
  expect(host.textContent).toContain('Ativas neste navegador');
  localStorage.removeItem('factory.notifications.browser_host.installation');
  await act(async () => window.dispatchEvent(new Event('storage')));
  expect(host.textContent).toContain('Desativadas neste navegador');
});

it.each(['denied', 'unsupported'] as const)('keeps %s notifications silent and pendencies accessible', async state => {
  if (state === 'denied') Surface.permission = 'denied';
  else Reflect.deleteProperty(window, 'Notification');
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  function Settings() { return createElement(LocalNotificationSettings, { notifications: useLocalNotifications('installation') }); }
  await act(async () => root!.render(createElement(Settings)));
  expect(host.querySelector('button')!.disabled).toBe(true);
  expect(host.textContent).toContain('continuam acessíveis na interface');
  expect(Surface.requestPermission).not.toHaveBeenCalled();
  expect(requestJsonWithMetadata).not.toHaveBeenCalled();
});
