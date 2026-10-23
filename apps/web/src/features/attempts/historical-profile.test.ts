// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { HistoricalProfile } from './HistoricalProfile.js';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../api/http.js', async original => ({ ...await original<typeof import('../../api/http.js')>(), requestJson: request }));
const captured = { role: 'implementer', profile_id: null, profile_revision: 3, executor: 'maestri-omp', provider: 'provider', model: 'model', effort: null, guidance: 'Instrução histórica\n'.repeat(300), composition_version: 1, context_summary: 'Critério capturado', technical_contract_summary: 'Schemas e permissões permanecem técnicos.', credentials_redacted: true };
let root: ReturnType<typeof createRoot>; let container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); request.mockReset(); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
async function render(id = 'attempt') { await act(async () => root.render(createElement(HistoricalProfile, { key: id, attemptId: id }))); }
async function consult() { await act(async () => container.querySelector('button')!.click()); }
it('loads only on demand and preserves captured revision, role and long text after current-profile events', async () => {
  request.mockResolvedValue({ id: 'attempt', details: { section: 'profiles', has_more: false, items: [captured, { ...captured, role: 'reviewer', profile_revision: null, composition_version: null }] } });
  await render(); expect(request).not.toHaveBeenCalled();
  const trigger = container.querySelector('button')!;
  trigger.focus();
  await consult();
  expect(document.activeElement).toBe(trigger);
  expect(request.mock.calls[0]![0]).toBe('/api/v1/attempts/attempt?section=profiles');
  expect(container.textContent).toContain('Revisor'); expect(container.textContent).toContain('Indisponível no histórico');
  expect(container.querySelector('pre')!.textContent).toBe(captured.guidance);
  await act(async () => window.dispatchEvent(new CustomEvent('factory-controller-event', { detail: { event_type: 'settings.updated' } })));
  await render(); expect(request).toHaveBeenCalledOnce(); expect(container.querySelector('pre')!.textContent).toBe(captured.guidance);
  container.querySelector('pre')!.focus(); expect(document.activeElement).toBe(container.querySelector('pre'));
});
it('does not display unvalidated credential-bearing data and allows explicit retry', async () => {
  request.mockResolvedValueOnce({ id: 'attempt', details: { section: 'profiles', has_more: false, items: [{ ...captured, credentials_redacted: false, guidance: 'PRIVATE_TEST_MARKER' }] } });
  await render(); await consult(); expect(container.textContent).not.toContain('PRIVATE_TEST_MARKER');
  request.mockResolvedValueOnce({ id: 'attempt', details: { section: 'profiles', has_more: false, items: [] } }); await consult();
  expect(container.textContent).toContain('indisponível para esta tentativa legada');
});
it('ignores a late response after changing attempts', async () => {
  let finish: (value: unknown) => void = () => undefined;
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render('A'); await consult(); await render('B');
  await act(async () => finish({ id: 'attempt', details: { section: 'profiles', has_more: false, items: [captured] } }));
  expect(container.textContent).not.toContain(captured.guidance); expect(container.querySelector('pre')).toBeNull();
});
