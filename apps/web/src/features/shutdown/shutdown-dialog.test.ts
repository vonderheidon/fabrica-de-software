// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ShutdownDialog } from './ShutdownDialog.js';
import { requestJson, requestJsonWithMetadata } from '../../api/http.js';
import type { ShutdownView } from '#contracts';

vi.mock('../../api/http.js', () => ({ requestJson: vi.fn(), requestJsonWithMetadata: vi.fn(), HttpError: class extends Error {} }));
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
let view: ShutdownView;
const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('crypto', webcrypto);
  vi.clearAllMocks(); sessionStorage.clear();
  view = { revision: 1, generation: 1, state: 'paused', starts_paused: true, automation_enabled: false, closing_committed: false,
    active_work: [], remaining_work_count: 21, has_more: true, next_cursor: 'next', operation_id: null, event_cursor: '1',
    pause_capability: { available: false }, close_when_idle_capability: { available: false, reason: 'Capacidade indisponível.', recovery: 'Atualize o estado.' }, resume_starts_capability: { available: true } };
  vi.mocked(requestJsonWithMetadata).mockImplementation(async () => ({ data: { ...view }, etag: '"shutdown:1:1"' }));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function mount() { await act(async () => root.render(createElement(ShutdownDialog, { onClose: vi.fn() }))); }
function button(label: string) { const found = [...host.querySelectorAll('button')].find(item => item.textContent === label); if (!found) throw new Error(label); return found; }

it('blocks duplicate resume while transport is pending and reconciles a lost response without resending', async () => {
  let reject!: (error: Error) => void;
  vi.mocked(requestJson).mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  await mount();
  await act(async () => { button('Retomar novos inícios').click(); button('Retomar novos inícios').click(); });
  expect(requestJson).toHaveBeenCalledTimes(1);
  const [, init] = vi.mocked(requestJson).mock.calls[0]!;
  const operationId = new Headers(init?.headers).get('Idempotency-Key');
  expect(new Headers(init?.headers).get('If-Match')).toBe('"shutdown:1:1"');
  expect(JSON.parse(init?.body as string)).toEqual({ action: 'resume_starts', authorized: true });
  await act(async () => reject(new Error('lost')));
  expect(host.textContent).not.toContain('Novos inícios liberados. Automação permanece desligada.');
  expect(button('Consultar operação')).toBeDefined();
  view = { ...view, starts_paused: false, state: 'running' };
  vi.mocked(requestJson).mockResolvedValue({ operation_id: operationId, kind: 'shutdown.resume_starts', state: 'succeeded' });
  await act(async () => button('Consultar operação').click());
  expect(requestJson).toHaveBeenLastCalledWith(`/api/v1/operations/${operationId}`);
  expect(host.textContent).toContain('Novos inícios liberados. Automação permanece desligada.');
  expect(vi.mocked(requestJson).mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});

it('does not authorize closure from a partial work list and paginates by server cursor', async () => {
  await mount(); expect(button('Fechar quando ocioso').disabled).toBe(true);
  expect(host.textContent).toContain('21 trabalho(s)');
  await act(async () => button('Próxima página').click());
  expect(requestJsonWithMetadata).toHaveBeenLastCalledWith('/api/v1/shutdown?limit=20&cursor=next');
  expect(requestJson).not.toHaveBeenCalled();
});

it('preserves correlation across reopening without replaying a mutation', async () => {
  sessionStorage.setItem('factory.uncertain-operations.v1', JSON.stringify([{ operationId: id, kind: 'shutdown.pause_starts', recordedAt: 1 }]));
  await mount(); expect(button('Consultar operação')).toBeDefined(); expect(requestJson).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Fechar esta interface não encerra');
});
