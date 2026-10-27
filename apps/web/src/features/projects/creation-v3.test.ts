// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HttpCreationView } from '#contracts';
import { ProjectCreationDialog, CreationResult } from './ProjectCreationDialog.js';
import { ProjectRegistrationForm } from './ProjectForm.js';
import { HttpError } from '../../api/http.js';
import { readUncertainOperations, recordUncertainOperation } from '../../api/uncertain-operations.js';

const { request, metadata } = vi.hoisted(() => ({ request: vi.fn(), metadata: vi.fn() }));
vi.mock('../../api/http.js', async (original) => ({ ...await original<typeof import('../../api/http.js')>(), requestJson: request, requestJsonWithMetadata: metadata }));
vi.mock('./CreationConditions.js', () => ({ CreationConditions: () => null }));
const id = '00000000-0000-4000-8000-000000000081';
const operationId = '00000000-0000-4000-8000-000000000082';
const view: HttpCreationView = {
  creation: { id, operation_id: operationId, project_id: null, plan_hash: 'a'.repeat(64), revision: 1, state: 'partial', baseline_sha: 'a'.repeat(40), baseline_ref: 'refs/heads/main', diagnostic: null, created_at_ms: 1,
    plan: { format_version: 1, installation_id: id, settings_e_tag: '"one"', projects_root: 'C:\\projects', destination: 'C:\\projects\\project', parent_identity: 'a'.repeat(64), template_digest: 'a'.repeat(64), files: [],
      input: { name: 'Projeto', template_id: 'engineering', template_digest: 'a'.repeat(64), destination_relative: 'project', creation_mode: 'remote_push', base_branch: 'main', triage_enabled: true,
        remote: { owner_id: 'account', name: 'project', visibility: 'private' }, board_name: 'Quadro editado' },
      engineering: { tracker: 'github', domain: 'single-context', instruction_file: 'AGENTS.md', triage_enabled: true, installs_skills: false, creates_labels: false }, account: { state: 'observed', id: 'account', login: 'operator' }, owner_id: 'account',
      effects: ['create_directory', 'write_template_and_engineering', 'initialize_git', 'create_conventional_baseline', 'create_repository', 'associate_origin', 'baseline_push', 'create_board', 'configure_status', 'link_repository', 'configure_view', 'verify_board', 'register_local_project'] } },
  confirmed_effects: [{ step: 'directory', state: 'confirmed' }], pending_effects: [{ step: 'registration', state: 'not_started' }], effects: [], remote_effects: [],
  prerequisites: [], diagnostics: [], board_operations: [], board_name: 'Quadro editado', board_url: null, next_action: 'reconcile', event_cursor: '1',
};
const roots: ReturnType<typeof createRoot>[] = [];
const onCreationId = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  sessionStorage.clear();
  request.mockImplementation(async (path: string) => {
    if (path.endsWith('/scaffold/options')) return {
      templates: [{ id: 'engineering', digest: 'a'.repeat(64), label: 'Engenharia' }], projects_root: 'C:\\projects',
      account: { id: 'account', login: 'operator' }, creation_modes: [{ mode: 'remote_push', capability: { available: true } }], prerequisites: [],
    };
    if (path.endsWith('/scaffold/plans')) return { plan_hash: view.creation.plan_hash, plan: view.creation.plan, prerequisites: [] };
    throw new Error('Unexpected request');
  });
});
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren(); request.mockReset(); metadata.mockReset(); onCreationId.mockReset(); sessionStorage.clear(); vi.unstubAllGlobals();
});
async function mount(creationId: string | null = null) {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  await act(async () => root.render(createElement(ProjectCreationDialog, { creationId, onCreationId, onPlanEdit: vi.fn(), onPlanReview: vi.fn(), onOpenProject: vi.fn() })));
  return container;
}
function button(container: HTMLElement, label: string) {
  const found = [...container.querySelectorAll('button')].find(item => item.textContent === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function input(container: HTMLElement, selector: string, value: string) {
  const field = container.querySelector<HTMLInputElement>(selector)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function plan(container: HTMLElement) {
  await input(container, '#creation-name', 'Projeto');
  await act(async () => button(container, 'Revisar plano').click());
  const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  await act(async () => checkbox.click());
}
it('renders only complete creation and preserves a manually edited board name in the request', async () => {
  const container = await mount();
  expect(container.textContent).not.toContain('Somente local');
  expect(container.textContent).not.toContain('Remoto sem push');
  await input(container, '#creation-name', 'Primeiro nome');
  expect(container.querySelector<HTMLInputElement>('#creation-board-name')!.value).toBe('Primeiro nome');
  await input(container, '#creation-board-name', 'Quadro independente');
  await input(container, '#creation-name', 'Segundo nome');
  expect(container.querySelector<HTMLInputElement>('#creation-board-name')!.value).toBe('Quadro independente');
  await act(async () => button(container, 'Revisar plano').click());
  const [, init] = request.mock.calls.find(([path]) => path.endsWith('/scaffold/plans'))!;
  expect(JSON.parse(String(init.body))).toMatchObject({ creation_mode: 'remote_push', board_name: 'Quadro independente', triage_enabled: true });
  expect(container.textContent).toContain('Criar quadro Kanban');
  expect(container.textContent).toContain('Conferir quadro e colunas');
  expect(container.textContent).toContain(view.creation.plan.destination);
});
it('records the operation before sending and recovers after closing during the request without navigation or another POST', async () => {
  const container = await mount(); await plan(container);
  let accept: ((value: unknown) => void) | undefined;
  request.mockImplementationOnce(() => {
    expect(readUncertainOperations()).toHaveLength(1);
    return new Promise(resolve => { accept = resolve; });
  });
  await act(async () => button(container, 'Criar projeto').click());
  const pendingId = readUncertainOperations()[0]!.operationId;
  expect(button(container, 'Voltar e editar').disabled).toBe(true);
  await act(async () => roots.pop()!.unmount());
  await act(async () => accept!({ operation_id: pendingId, resource: { type: 'creation', id }, state: 'pending' }));
  expect(onCreationId).not.toHaveBeenCalled();
  const reopened = await mount();
  request.mockResolvedValueOnce({ operation_id: pendingId, resource: { type: 'creation', id }, state: 'pending' });
  await act(async () => button(reopened, 'Consultar operação').click());
  expect(onCreationId).toHaveBeenCalledWith(id);
  expect(request.mock.calls.filter(([path]) => path === '/api/v1/scaffold/creations')).toHaveLength(1);
});
it('keeps a missing operation uncertain and prevents creation after a 404', async () => {
  recordUncertainOperation({ operationId, kind: 'scaffold-create', recordedAt: 1 });
  const container = await mount();
  request.mockRejectedValueOnce(new HttpError(404, 'OPERATION_NOT_FOUND', 'Ausente', null, [], null, null, null));
  await act(async () => button(container, 'Consultar operação').click());
  expect(container.textContent).toContain('Confirme a conta e consulte novamente');
  expect(readUncertainOperations()[0]!.operationId).toBe(operationId);
  expect(button(container, 'Revisar plano').disabled).toBe(true);
  expect(request.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});
it('restores reconciliation by its original operation and refreshes only by GET', async () => {
  const reconciliationId = '00000000-0000-4000-8000-000000000083';
  recordUncertainOperation({ operationId: reconciliationId, kind: 'scaffold-reconcile', recordedAt: 1 });
  metadata.mockResolvedValue({ data: view, etag: '"one"' });
  const container = await mount(id);
  expect(readUncertainOperations()[0]!.operationId).toBe(reconciliationId);
  request.mockResolvedValueOnce({ operation_id: reconciliationId, resource: { type: 'creation', id }, state: 'succeeded' });
  await act(async () => button(container, 'Consultar conferência').click());
  await act(async () => button(container, 'Consultar criação novamente').click());
  expect(request.mock.calls.some(([path]) => path === `/api/v1/operations/${reconciliationId}`)).toBe(true);
  expect(request.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  expect(container.textContent).toContain('Criação parcial');
  expect(container.textContent).not.toContain('Criação concluída');
});
it('renders each board stage and keeps unknown separate from completion', async () => {
  const boardOperations: HttpCreationView['board_operations'] = ['create_board', 'configure_status', 'link_repository', 'configure_view', 'verify_board'].map((kind, index) => ({
    operation_id: `${id.slice(0, -1)}${index}`, creation_id: id, kind: kind as HttpCreationView['board_operations'][number]['kind'], scope_key: kind, state: index === 4 ? 'unknown' : 'confirmed', revision: 1, request_hash: 'a'.repeat(64),
    authorization: { format_version: 1, source_operation_id: operationId, plan_hash: 'a'.repeat(64), account_id: 'account', creation_id: id, actions: ['create_board', 'configure_status', 'link_repository', 'configure_view', 'verify_board'] },
    expected_identity: { format_version: 1, owner_id: 'account', board_name: 'Quadro editado', marker: 'marker', repository_id: null, project_id: null, status_field_id: null, expected_status_names: ['Backlog', 'Ready', 'In progress', 'In review', 'Done'], view_id: null, view_name: 'Kanban', view_layout: 'BOARD_LAYOUT' },
    receipt: null, reason: null, created_at_ms: 1, sent_at_ms: 1, confirmed_at_ms: null,
  }));
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container); roots.push(root);
  await act(async () => root.render(createElement(CreationResult, { creationId: id, load: { status: 'ready', view: { ...view, board_operations: boardOperations }, etag: '"one"' }, onRefresh: vi.fn(), onOpenProject: vi.fn(), canReconcile: true, reconciling: false, reconcileUncertain: false, reconcileNotice: '', onReconcile: vi.fn(), onConsultReconcile: vi.fn() })));
  for (const text of ['Criar quadro Kanban', 'Configurar as cinco colunas', 'Vincular quadro ao repositório', 'Configurar visualização Kanban', 'Conferir quadro e colunas']) expect(container.textContent).toContain(text);
  expect(container.textContent).not.toContain('Criação concluída');
});
it('registers a local incomplete project and renders the three independent causes and next actions', async () => {
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container); roots.push(root);
  await act(async () => root.render(createElement(ProjectRegistrationForm, { identity: id, onRegistered: vi.fn() })));
  await input(container, 'input:not([readonly])', 'Existente');
  metadata.mockResolvedValueOnce({ data: { project: { id, name: 'Existente', source: { kind: 'local' } }, prerequisites: [
    { code: 'REMOTE_UNCONFIRMED', message: 'Remoto GitHub ausente.', recovery: 'Configure um remoto GitHub.' },
    { code: 'CODE_NOT_PUBLISHED', message: 'Publicação inicial ausente.', recovery: 'Publique a branch-base.' },
    { code: 'PROJECT_REQUIRED', message: 'Quadro ausente.', recovery: 'Vincule um quadro V3.' },
  ] } });
  // Reopen the existing registration draft without invoking a native picker.
  const { setDraft } = await import('../../app/drafts.js');
  setDraft(id, 'project-registration', { name: 'Existente', kind: 'local', location: 'C:\\existing', baseBranch: 'main', commandId: null });
  await act(async () => root.unmount()); roots.pop();
  const nextRoot = createRoot(container); roots.push(nextRoot);
  await act(async () => nextRoot.render(createElement(ProjectRegistrationForm, { identity: id, onRegistered: vi.fn() })));
  await act(async () => button(container, 'Adicionar existente').click());
  expect(container.textContent).toContain('Cadastro confirmado');
  for (const text of ['Confirme o repositório GitHub', 'Publicação inicial ausente.', 'Selecione o quadro do projeto', 'Publique a branch-base configurada']) expect(container.textContent).toContain(text);
  const [, init] = metadata.mock.calls[0]!;
  expect(JSON.parse(String(init.body))).toEqual({ name: 'Existente', source: { kind: 'local', location: 'C:\\existing' }, base_branch: 'main' });
});

it('preserves the failed creation and requires a fresh reviewed authorization before retrying', async () => {
  const failed: HttpCreationView = { ...view, creation: { ...view.creation, state: 'failed', baseline_sha: null, baseline_ref: null, diagnostic: 'SCAFFOLD_PATH_GUARD_UNAVAILABLE' },
    confirmed_effects: [], pending_effects: [{ step: 'directory', state: 'not_started' }], next_action: 'create_new_plan' };
  metadata.mockResolvedValue({ data: failed, etag: '"failed"' });
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  const edit = vi.fn();
  const props = { creationId: id, onCreationId, onPlanEdit: edit, onPlanReview: vi.fn(), onOpenProject: vi.fn() };
  await act(async () => root.render(createElement(ProjectCreationDialog, props)));
  expect(container.textContent).toContain('SCAFFOLD_PATH_GUARD_UNAVAILABLE');
  await act(async () => button(container, 'Revisar novo plano').click());
  expect(edit).toHaveBeenCalledOnce();
  expect(request.mock.calls.filter(([path]) => path.endsWith('/scaffold/plans') || path.endsWith('/scaffold/creations'))).toHaveLength(0);
  await act(async () => root.render(createElement(ProjectCreationDialog, { ...props, creationId: null })));
  expect(container.querySelector<HTMLInputElement>('#creation-destination')!.value).toBe('project');
  expect(container.textContent).toContain(`A criação anterior ${id} permanece no histórico`);
  await act(async () => button(container, 'Revisar plano').click());
  expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
  expect(button(container, 'Criar projeto').disabled).toBe(true);
  expect(request.mock.calls.filter(([path]) => path.endsWith('/scaffold/creations'))).toHaveLength(0);
});

it('does not offer a new attempt while the existing effects require review', async () => {
  metadata.mockResolvedValue({ data: view, etag: '"partial"' });
  const container = await mount(id);
  expect(container.textContent).not.toContain('Revisar novo plano');
});
