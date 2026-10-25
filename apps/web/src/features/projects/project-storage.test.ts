// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProjectStorageView } from '#contracts';
import { ProjectConfigurationDialog } from './ProjectConfigurationDialog.js';
import { HttpError } from '../../api/http.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../api/http.js', async original => ({ ...await original<typeof import('../../api/http.js')>(), requestJson: request, getControllerInstanceId: () => 'storage-test' }));
const projectId = '00000000-0000-4000-8000-000000000091';
const locationId = '00000000-0000-4000-8000-000000000092';
const storage: ProjectStorageView = { managed_root: 'var/factory/projects/project/v1/managed', original_path: 'C:\\Projetos\\Minha pasta original', state: 'current', cause: null, recovery: null,
  active_transition_operation_id: null, locations: [{ id: locationId, location_key: 'managed', layout_version: 1, current: true, path: 'var/factory/projects/project/v1/managed', verified_at_ms: 1 }],
  transition_plan: { location_key: 'managed', source_location_id: locationId, destination_relative: 'var/factory/projects/project/v2/managed', plan_hash: 'a'.repeat(64), capability: { available: true } } };
let roots: ReturnType<typeof createRoot>[] = [];
let id = '';
let state = 'running';
const refresh = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); sessionStorage.clear(); id = ''; state = 'running'; refresh.mockReset();
  request.mockImplementation(async (_path: string, init?: RequestInit) => {
    if (init?.method === 'POST') { id = (init.headers as Record<string, string>)['Idempotency-Key']!; return { operation_id: id, resource: { type: 'project', id: projectId } }; }
    return { operation_id: id, kind: 'project.storage.transition', resource: { type: 'project', id: projectId }, state,
      request_id: 'request', progress: { step: state === 'succeeded' ? 'publishing_location' : 'moving', state: state === 'succeeded' ? 'verified' : state === 'unknown' ? 'uncertain' : 'running', generation: 1, revision: 2 } };
  });
});
afterEach(async () => { for (const root of roots) await act(async () => root.unmount()); roots = []; document.body.replaceChildren(); request.mockReset(); sessionStorage.clear(); vi.unstubAllGlobals(); });
async function mount(value = storage, accountId = 'account', etag = '"revision-one"') {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  const render = async (next: ProjectStorageView, nextEtag = etag, nextAccount = accountId) => {
    await act(async () => root.render(createElement(ProjectConfigurationDialog, { projectId, installationId: 'installation', accountId: nextAccount, storage: next, etag: nextEtag, onRefresh: refresh, disabled: false })));
  };
  await render(value); return { container, root, render };
}
function button(container: HTMLElement, text: string) {
  const value = [...container.querySelectorAll('button')].find(item => item.textContent === text);
  if (!value) throw new Error(`Missing ${text}`); return value;
}
it('shows an unregistered managed environment without a legacy migration warning or writes', async () => {
  const { container } = await mount({ ...storage, state: 'legacy', managed_root: null, locations: [], transition_plan: null });
  expect(container.textContent).toContain('Sem ambiente gerenciado');
  expect(container.textContent).toContain('Ainda não registrada.');
  expect(container.textContent).not.toContain('Organização legada');
  expect(container.textContent).not.toContain('Próxima ação:');
  expect(container.textContent).toContain(storage.original_path);
  expect(button(container, 'Atualizar localizações')).toBeDefined();
  expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
});
it('keeps the legacy warning and transition controls when managed locations exist', async () => {
  const { container } = await mount({ ...storage, state: 'legacy' });
  expect(container.textContent).toContain('Organização legada');
  expect(container.textContent).toContain('Próxima ação:');
  expect(button(container, 'Autorizar transição gerenciada').disabled).toBe(true);
  expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
});
async function authorize(container: HTMLElement) {
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await act(async () => button(container, 'Autorizar transição gerenciada').click());
}
it('shows separate unabridged paths and sends only the authorized server plan with the current revision once', async () => {
  const { container } = await mount();
  expect(container.textContent).toContain(storage.original_path); expect(container.textContent).toContain(storage.managed_root);
  expect(button(container, 'Autorizar transição gerenciada').disabled).toBe(true);
  await authorize(container);
  const posts = request.mock.calls.filter(([, init]) => init?.method === 'POST'); expect(posts).toHaveLength(1);
  expect(posts[0]![0]).toBe(`/api/v1/projects/${projectId}/storage-transition`);
  expect(JSON.parse(posts[0]![1].body)).toEqual({ location_key: 'managed', source_location_id: locationId, plan_hash: 'a'.repeat(64), authorized: true });
  expect(posts[0]![1].headers['If-Match']).toBe('"revision-one"');
  expect(container.textContent).not.toContain('Transição concluída e verificada');
  expect(container.textContent).toContain('Movimento em andamento');
});
it('invalidates authorization when the plan or revision changes without touching sibling draft fields', async () => {
  const { container, render } = await mount();
  await act(async () => container.querySelector<HTMLInputElement>('input')!.click());
  await render(storage, '"revision-two"');
  expect(container.querySelector<HTMLInputElement>('input')!.checked).toBe(false);
  expect(button(container, 'Autorizar transição gerenciada').disabled).toBe(true);
});
it('recovers a lost response after close and reopen through GET only, including 404 and confirmed completion', async () => {
  const first = await mount();
  request.mockImplementationOnce(async (_path: string, init: RequestInit) => { id = (init.headers as Record<string, string>)['Idempotency-Key']!; throw new Error('lost'); });
  await authorize(first.container);
  expect(sessionStorage.length).toBe(1);
  expect(sessionStorage.getItem(sessionStorage.key(0)!)).not.toContain('plan_hash');
  await act(async () => first.root.unmount()); roots = roots.filter(root => root !== first.root);
  request.mockRejectedValueOnce(new HttpError(404, 'NOT_FOUND', 'Operação ainda não localizada.', null, [], null, null, null));
  const second = await mount();
  expect(second.container.textContent).toContain('Operação ainda não localizada.');
  expect(second.container.querySelector('input')).toBeNull();
  state = 'succeeded';
  await act(async () => button(second.container, 'Consultar transição original').click());
  expect(second.container.textContent).toContain('Transição concluída e verificada');
  expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
});
it('distinguishes uncertainty and allows only explicit resumption of the original in-memory command', async () => {
  const { container } = await mount(); state = 'unknown'; await authorize(container);
  expect(container.textContent).toContain('Resultado incerto');
  const first = request.mock.calls.find(([, init]) => init?.method === 'POST')!;
  await act(async () => button(container, 'Retomar a mesma operação').click());
  const posts = request.mock.calls.filter(([, init]) => init?.method === 'POST'); expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(first);
});
it('shows backend refusal and recovery and requires reviewing the current plan again', async () => {
  const { container } = await mount();
  request.mockRejectedValueOnce(new HttpError(409, 'STORAGE_TRANSITION_PLAN_CHANGED', 'O plano exibido não é mais atual.', null, [], null, null, null, [], 'Consulte novamente o plano.'));
  await authorize(container);
  expect(container.textContent).toContain('O plano exibido não é mais atual.');
  expect(container.textContent).toContain('Consulte novamente o plano.');
  expect(button(container, 'Autorizar transição gerenciada').disabled).toBe(true); expect(sessionStorage.length).toBe(0);
});
it('keeps unavailable, legacy and blocked states readable without offering an unsupported command', async () => {
  const { container } = await mount({ ...storage, state: 'blocked', cause: 'Há uma tentativa ativa.', recovery: 'Aguarde a parada confirmada.', transition_plan: { ...storage.transition_plan!, capability: { available: false, reason: 'Ambiente em uso.', recovery: 'Conclua a tentativa.' } } });
  expect(container.textContent).toContain('Há uma tentativa ativa.'); expect(container.textContent).toContain('Conclua a tentativa.');
  expect(container.querySelector('input')).toBeNull(); expect(request).not.toHaveBeenCalled();
});
it('does not apply a late response to a different account context', async () => {
  const { container, render } = await mount();
  let resolve: ((value: unknown) => void) | undefined;
  request.mockImplementationOnce((_path: string, init: RequestInit) => { id = (init.headers as Record<string, string>)['Idempotency-Key']!; return new Promise(done => { resolve = done; }); });
  await authorize(container); await render(storage, '"revision-two"', 'other-account');
  await act(async () => resolve!({ operation_id: id, resource: { type: 'project', id: projectId } }));
  expect(container.textContent).not.toContain('Transição aceita');
  expect(container.querySelector('input')).not.toBeNull();
});
it('blocks duplicate clicks during acceptance and preserves correlation when closing with a pending POST', async () => {
  const { container, root } = await mount();
  let accept: ((value: unknown) => void) | undefined;
  request.mockImplementationOnce((_path: string, init: RequestInit) => {
    id = (init.headers as Record<string, string>)['Idempotency-Key']!;
    expect(sessionStorage.length).toBe(1);
    return new Promise(resolve => { accept = resolve; });
  });
  await act(async () => container.querySelector<HTMLInputElement>('input')!.click());
  const send = button(container, 'Autorizar transição gerenciada');
  await act(async () => { send.click(); send.click(); });
  expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  await act(async () => root.unmount()); roots = roots.filter(item => item !== root);
  await act(async () => accept!({ operation_id: id, resource: { type: 'project', id: projectId } }));
  const reopened = await mount();
  expect(reopened.container.textContent).toContain('Movimento em andamento');
  expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
});
it('rejects a mismatched operation instead of announcing completion', async () => {
  const { container } = await mount();
  request.mockImplementationOnce(async (_path: string, init: RequestInit) => { id = (init.headers as Record<string, string>)['Idempotency-Key']!; throw new Error('lost'); });
  await authorize(container);
  request.mockResolvedValueOnce({ operation_id: id, kind: 'project.storage.transition', resource: { type: 'project', id: locationId }, state: 'succeeded', request_id: 'request' });
  await act(async () => button(container, 'Consultar transição original').click());
  expect(container.textContent).not.toContain('Transição concluída e verificada');
  expect(container.textContent).toContain('O resultado da transição não pôde ser consultado.');
});
