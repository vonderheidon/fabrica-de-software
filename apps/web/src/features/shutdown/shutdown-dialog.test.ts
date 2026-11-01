// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ShutdownDialog } from './ShutdownDialog.js';
import { requestJson } from '../../api/http.js';

vi.mock('../../api/http.js', () => ({ requestJson: vi.fn() }));
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
let onClose: () => void;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); onClose = vi.fn<() => void>();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function mount() { await act(async () => root.render(createElement(ShutdownDialog, { onClose }))); }
function button(label: string) { const found = [...host.querySelectorAll('button')].find(item => item.textContent === label); if (!found) throw new Error(label); return found; }

it('shows only the immediate shutdown and cancel actions with a clear warning', async () => {
  await mount();
  expect([...host.querySelectorAll('button')].map(item => item.textContent)).toEqual(['Cancelar', 'Encerrar controlador']);
  expect(host.textContent).toContain('encerra o controlador agora');
  expect(host.textContent).toContain('trabalhos ativos ou incertos');
});

it('cancel closes the dialog without requesting shutdown', async () => {
  await mount();
  await act(async () => button('Cancelar').click());
  expect(onClose).toHaveBeenCalledOnce();
  expect(requestJson).not.toHaveBeenCalled();
});

it('requests immediate controller shutdown once and shows a final accepted state', async () => {
  vi.mocked(requestJson).mockResolvedValue({ state: 'closing' });
  await mount();
  await act(async () => button('Encerrar controlador').click());
  expect(requestJson).toHaveBeenCalledOnce();
  expect(requestJson).toHaveBeenCalledWith('/api/v1/shutdown', { method: 'POST', body: JSON.stringify({ authorized: true }) });
  expect(host.textContent).toContain('Solicitação aceita. Esta tela não será mais atualizada; feche esta aba para sair.');
  expect([...host.querySelectorAll('button')]).toHaveLength(0);
});
