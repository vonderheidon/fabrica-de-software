// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ProfileForm } from './ProfileForm.js';
import { HttpError } from '../../api/http.js';

const { metadata, config, retry } = vi.hoisted(() => ({ metadata: vi.fn(), config: { current: {} }, retry: vi.fn() }));
vi.mock('./useConfiguration.js', () => ({ useConfiguration: () => ({ load: config.current, retry, refreshError: null }) }));
vi.mock('../../api/http.js', async original => ({ ...await original<typeof import('../../api/http.js')>(), requestJsonWithMetadata: metadata, getControllerInstanceId: () => 'instance' }));
const profile = { id: '00000000-0000-4000-8000-000000000001', name: 'Perfil', profile_type: 'implementer', executor: 'maestri-omp', provider: 'provider', model: 'model', effort: null, guidance: 'Instruções capturáveis', revision: 1 };
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const saved = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); sessionStorage.clear(); saved.mockReset(); metadata.mockReset(); retry.mockReset();
  config.current = { status: 'ready', identity: 'global-settings', etag: '"one"', view: { settings: { installation_id: 'installation', account_id: null }, profiles: [profile] } };
  metadata.mockResolvedValue({ data: { state: 'unavailable' }, etag: '"one"' });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); sessionStorage.clear(); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(createElement(ProfileForm, { projectId: null, profileId: profile.id, onClose: vi.fn(), onSavingChange: vi.fn(), onSaved: saved }))); }
async function edit(text: string) { await act(async () => { const input = container.querySelector('textarea')!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, text); input.dispatchEvent(new Event('input', { bubbles: true })); }); }
async function submit() { await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); }
it.each(['implementer', 'reviewer'])('edits effective instructions for %s and confirms only a matching receipt', async role => {
  config.current = { status: 'ready', identity: 'global-settings', etag: '"one"', view: { settings: { installation_id: 'installation', account_id: null }, profiles: [{ ...profile, profile_type: role }] } };
  await render(); await edit('Novas instruções');
  let finish: (value: unknown) => void = () => undefined;
  metadata.mockImplementationOnce((_path: string, init: RequestInit) => new Promise(resolve => { finish = () => resolve({ etag: '"two"', data: { operation_id: (init.headers as Record<string, string>)['Idempotency-Key'], receipt: {}, event_cursor: '2' } }); }));
  await submit(); expect(saved).not.toHaveBeenCalled();
  const call = metadata.mock.calls.find(([, init]) => init?.method === 'PUT');
  expect(JSON.parse(call![1].body)).toEqual({ changes: {}, profile_changes: [{ action: 'update', id: profile.id, changes: { guidance: 'Novas instruções' } }] });
  await act(async () => finish({})); expect(saved).toHaveBeenCalledOnce();
});
it.each([412, 422, 413])('preserves instructions after HTTP %s and a subsequent configuration refresh', async status => {
  await render(); await edit('Rascunho preservado');
  metadata.mockRejectedValueOnce(new HttpError(status, 'SAVE_REJECTED', 'Revise as instruções.', null, [{ field: 'profile_changes/0/changes/guidance', message: 'Instruções recusadas pelo controlador.' }], null, null, null));
  await submit(); expect(saved).not.toHaveBeenCalled();
  config.current = { status: 'ready', identity: 'global-settings', etag: '"two"', view: { settings: { installation_id: 'installation', account_id: null }, profiles: [{ ...profile, guidance: 'Outro texto salvo', revision: 2 }] } };
  await render(); expect(container.querySelector('textarea')!.value).toBe('Rascunho preservado');
  expect(container.textContent).toContain(status === 412 ? 'Conflito ao salvar' : 'Revise as instruções.');
  if (status !== 412) { expect(container.textContent).toContain('Instruções recusadas pelo controlador.'); expect(container.querySelector('textarea')!.getAttribute('aria-invalid')).toBe('true'); }
  if (status === 412) {
    await submit();
    expect(metadata.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
    const apply = [...container.querySelectorAll('button')].find(button => button.textContent === 'Aplicar minha edição sobre a revisão atual')!;
    await act(async () => apply.click()); expect(container.querySelector('textarea')!.value).toBe('Rascunho preservado');
    metadata.mockRejectedValueOnce(new HttpError(422, 'SAVE_REJECTED', 'Revise as instruções.', null, [], null, null, null));
    await submit();
    const puts = metadata.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(puts).toHaveLength(2); expect(puts[1]![1].headers['If-Match']).toBe('"two"');
    expect(JSON.parse(puts[1]![1].body).profile_changes[0].changes.guidance).toBe('Rascunho preservado');
  }
});
it('keeps oversized Unicode drafts intact and blocks the combined UTF-8 body before sending', async () => {
  await render(); const text = '界'.repeat(6000); await edit(text);
  expect(container.textContent).toContain('16.384 bytes'); expect(container.querySelector('textarea')!.value).toBe(text);
  await submit(); expect(metadata.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
  await edit('a'.repeat(8193)); expect(container.textContent).toContain('excedem 8.192 caracteres');
  expect(container.querySelector('textarea')!.value).toHaveLength(8193);
});
