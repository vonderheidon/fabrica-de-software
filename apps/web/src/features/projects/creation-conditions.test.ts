// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { HttpCreationView } from '#contracts';
import { CreationResult, ProjectCreationDialog } from './ProjectCreationDialog.js';
import { visibleCreationEffects } from './creation-effects.js';
import { HttpError } from '../../api/http.js';

const { request, metadata } = vi.hoisted(() => ({ request: vi.fn(), metadata: vi.fn() }));
vi.mock('../../api/http.js', async (original) => ({ ...await original<typeof import('../../api/http.js')>(), requestJson: request, requestJsonWithMetadata: metadata }));
const id = '00000000-0000-4000-8000-000000000061';
const view: HttpCreationView = {
  creation: { id, operation_id: id, project_id: id, plan_hash: 'a'.repeat(64), revision: 1, state: 'completed', baseline_sha: 'a'.repeat(40), baseline_ref: 'refs/heads/main', diagnostic: null, created_at_ms: 1,
    plan: { format_version: 1, installation_id: id, settings_e_tag: '"one"', projects_root: 'C:\\controlled', destination: 'C:\\controlled\\project', parent_identity: 'a'.repeat(64), template_digest: 'a'.repeat(64), files: [{ path: 'AGENTS.md', bytes: 1, sha256: 'a'.repeat(64) }],
       input: { name: 'Projeto controlado', template_id: 'engineering', template_digest: 'a'.repeat(64), destination_relative: 'project', creation_mode: 'remote_push', base_branch: 'main', triage_enabled: true,
         remote: { owner_id: 'account', name: 'project', visibility: 'private' }, board_name: 'Projeto controlado' },
      engineering: { tracker: 'github', domain: 'single-context', instruction_file: 'AGENTS.md', triage_enabled: true, installs_skills: false, creates_labels: false }, account: { state: 'observed', id: 'account', login: 'operator' }, owner_id: 'account', effects: [] } },
  confirmed_effects: [{ step: 'directory', state: 'confirmed' }], pending_effects: [], effects: [],
  remote_effects: [{ kind: 'baseline_push', operation_id: id, state: 'unknown', identity: {}, reason: null }],
  prerequisites: [{ code: 'PROFILES_REQUIRED', message: 'Cadastre os perfis para iniciar.', recovery: 'Abra Perfis.' }], diagnostics: [], board_operations: [],
  board_name: 'Projeto controlado', board_url: null, next_action: 'none', event_cursor: '1',
};
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.replaceChildren(); request.mockReset(); metadata.mockReset(); vi.unstubAllGlobals(); });
async function mount() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  request.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.endsWith('/scaffold/options')) return { templates: [], account: { id: null, login: null }, creation_modes: [], prerequisites: [] };
    if (path.endsWith('/settings')) return { settings: { installation_id: id, account_id: 'account', revision: 1 }, profiles: [] };
    if (path.includes('/scaffold/creations/')) return view;
    if (init?.method === 'POST') throw new HttpError(409, 'DIAGNOSTIC_CONTEXT_CHANGED', 'Falha original da verificação.', null, [], null, null, null);
    if (path.includes('/operations/')) throw new Error('Offline');
    return { supported_checks: ['resources', 'configuration', 'github_identity', 'maestri_context'], reports: [], diagnostics: [], event_cursor: '1' };
  });
  await act(async () => root.render(createElement(CreationResult, { creationId: id, load: { status: 'ready', view, etag: '"one"' }, onRefresh: vi.fn(), onOpenProject: vi.fn(), canReconcile: false, reconciling: false, reconcileUncertain: false, reconcileNotice: '', onReconcile: vi.fn(), onConsultReconcile: vi.fn() })));
  return container;
}
function button(container: HTMLElement, name: string) { const node = [...container.querySelectorAll('button')].find((item) => item.textContent === name); if (!node) throw new Error(name); return node; }
it('keeps conditions visually stable during a background read while blocking verification effects', async () => {
  const container = await mount();
  const region = container.querySelector('[aria-label="Condições da criação"]')!;
  const text = region.textContent;
  const normal = request.getMockImplementation()!;
  let finish: ((value: unknown) => void) | undefined;
  request.mockImplementation((path: string, init?: RequestInit) => path.startsWith('/api/v1/diagnostics') && !init?.method
    ? new Promise(resolve => { finish = resolve; }) : normal(path, init));
  await act(async () => { window.dispatchEvent(new Event('factory-controller-resync')); await new Promise(resolve => setTimeout(resolve, 130)); });
  expect(region.textContent).toBe(text);
  expect(button(container, 'Verificar recursos').disabled).toBe(false);
  expect(button(container, 'Verificar recursos').getAttribute('aria-disabled')).toBe('true');
  await act(async () => button(container, 'Verificar recursos').click());
  expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  await act(async () => finish?.(await normal(`/api/v1/diagnostics?scope=creation&id=${id}`)));
  expect(region.textContent).toBe(text);
  expect(button(container, 'Verificar recursos').getAttribute('aria-disabled')).toBe('false');
});
it('keeps completion independent, renders each remote effect once and opens with GET only', async () => {
  const container = await mount();
  expect(container.textContent).toContain('Criação concluída');
  expect(container.textContent).toContain('Antes de iniciar uma issue');
  expect(container.textContent?.match(/Publicar commit inicial/g)).toHaveLength(1);
  expect(container.textContent).not.toContain('Maestri');
  expect(button(container, 'Abrir configuração do projeto')).toBeDefined();
  expect(request.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
});
it('keeps the original verification error through receipt failure and reopening without another POST', async () => {
  let container = await mount();
  await act(async () => button(container, 'Verificar recursos').click());
  expect(container.textContent).toContain('Falha original da verificação.');
  await act(async () => button(container, 'Consultar resultado original').click());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 550)); });
  expect(container.textContent).toContain('Falha original da verificação.');
  expect(container.textContent).toContain('Não foi possível consultar');
  await act(async () => roots.pop()!.unmount());
  container = await mount();
  expect(container.textContent).toContain('Falha original da verificação.');
  expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  const [path, init] = request.mock.calls.find(([, options]) => options?.method === 'POST')!;
  expect(path).toContain(`scope=creation&id=${id}`);
  expect(JSON.parse(String(init.body))).toEqual({ checks: ['resources'] });
});
it('merges only matching remote operation identities and never mutates the sources', () => {
  const data = structuredClone(view);
  const remote = data.remote_effects[0]!;
  data.effects = [{ kind: remote.kind, operation_id: id, creation_id: id, attempt_id: null, delivery_id: null, scope_key: 'test', state: 'confirmed', expected_identity: {}, confirmed_identity: null, receipt: null, reason: null, authorized: true, revision: 1, sent_at_ms: 1, confirmed_at_ms: 2 }];
  const before = JSON.stringify(data);
  expect(visibleCreationEffects(data)).toHaveLength(1);
  expect(visibleCreationEffects(data)[0]?.state).toBe('confirmed');
  expect(JSON.stringify(data)).toBe(before);
  data.remote_effects.push({ ...remote, operation_id: '00000000-0000-4000-8000-000000000062' }, { ...remote, kind: 'associate_origin' });
  expect(visibleCreationEffects(data)).toHaveLength(3);
});
it('preserves a previous creation on refresh failure and never carries it into another creation', async () => {
  const container = await mount();
  await act(async () => roots.pop()!.unmount());
  const root = createRoot(container); roots.push(root);
  metadata.mockResolvedValue({ data: view, etag: '"one"' });
  const props = { creationId: id, onCreationId: vi.fn(), onPlanReview: vi.fn(), onPlanEdit: vi.fn(), onOpenProject: vi.fn() };
  await act(async () => root.render(createElement(ProjectCreationDialog, props)));
  metadata.mockRejectedValue(new Error('Offline'));
  await act(async () => button(container, 'Consultar criação novamente').click());
  expect(container.textContent).toContain('Criação concluída');
  expect(container.textContent).toContain('Resultado anterior.');
  await act(async () => root.render(createElement(ProjectCreationDialog, { ...props, creationId: '00000000-0000-4000-8000-000000000063' })));
  expect(container.textContent).not.toContain('Criação concluída');
  expect(container.textContent).not.toContain('Projeto controlado');
  expect(container.textContent).toContain('Não foi possível consultar esta criação.');
  expect(metadata.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
});
