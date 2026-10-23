// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { SettingsView, HttpContextDiagnostic, HttpDiagnosticsView, GitHubSetupOptions } from '#contracts';
import { ProjectConfigurationForm } from './ProjectForm.js';
import { HttpError } from '../../api/http.js';

const { request, metadata } = vi.hoisted(() => ({ request: vi.fn(), metadata: vi.fn() }));
vi.mock('../../api/http.js', async (original) => ({ ...await original<typeof import('../../api/http.js')>(), getControllerInstanceId: () => 'test-instance', requestJson: request, requestJsonWithMetadata: metadata }));
const roots: ReturnType<typeof createRoot>[] = [];
let sequence = 0;
const condition = (code: string, cause: string, check: HttpContextDiagnostic['check'] = 'configuration'): HttpContextDiagnostic => ({ code, cause, check, state: 'blocked', recovery: 'Corrija esta condição.', affected_requirements: ['RF-01'], facts: {}, observed_at_ms: 1 });
const view = (): HttpDiagnosticsView => ({ context: { scope: 'host' }, supported_checks: ['configuration', 'maestri_context', 'github_identity'], event_cursor: '1', reports: [], diagnostics: [
  condition('ACCOUNT_UNOBSERVED', 'Conta não vinculada.'), condition('PROJECTS_ROOT_CONFIRMATION_REQUIRED', 'Pasta ainda não confirmada.'),
  condition('PROFILES_REQUIRED', 'Nenhum perfil cadastrado.'), condition('IMPLEMENTER_PROFILE_REQUIRED', 'Papel Implementador ausente.'), condition('REVIEWER_PROFILE_REQUIRED', 'Papel Revisor ausente.'),
  condition('MAESTRI_CONTEXT_UNAVAILABLE', 'Contexto nativo indisponível.', 'maestri_context'),
] });
async function mount(diagnostics = view(), github?: GitHubSetupOptions, accountId: string | null = null) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const settings: SettingsView = {
    settings: { id: 'local', installation_id: `installation-${++sequence}`, account_id: accountId, designated_host: null,
      projects_root: 'C:\\saved', automation_enabled: false, revision: 1, created_at_ms: 1, updated_at_ms: 1,
      time_defaults: { format_version: 1, polling_interval_ms: 15000, passage_active_time_ms: 1800000, question_ttl: { state: 'not_configured' } },
      artifact_policy: { format_version: 1, automatic_deletion: false } },
    profiles: [], profile_counts: { all: 0, implementer: 0, reviewer: 0 }, event_cursor: '1',
    onboarding: { suppressed: true, completed_at_ms: null, first_incomplete_step: null, prerequisites: [] },
    selection_capabilities: { projects_root: { available: false }, gh_executable: { available: false } },
  };
  request.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/api/v1/settings') return settings;
    if (path.startsWith('/api/v1/operations/')) return { state: 'succeeded', receipt: { revision: 1 } };
    if (init?.method === 'POST') return { operation_id: new Headers(init.headers).get('Idempotency-Key'), receipt: { revision: 1 } };
    return diagnostics;
  });
  metadata.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === 'PUT') throw new Error('Save failed');
    if (path.includes('github-options')) { if (github) return { data: github, etag: '"original"' }; throw new Error('GitHub unavailable'); }
    return { data: settings, etag: '"original"' };
  });
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  await act(async () => root.render(createElement(ProjectConfigurationForm, { projectId: null, onSaveIssue: () => {} })));
  return container;
}
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren(); request.mockReset(); metadata.mockReset(); vi.unstubAllGlobals();
  sessionStorage.clear();
});
it('distinguishes a lost binding, a divergent identity and unavailable reading', async () => {
  const diagnostics = view();
  diagnostics.diagnostics = [condition('ONBOARDING_ACCOUNT_RELINK_REQUIRED', 'O vínculo anterior precisa ser refeito.')];
  const lostBinding = await mount(diagnostics);
  expect(lostBinding.querySelector('.github-setup-panel')?.textContent).toContain('O vínculo anterior precisa ser refeito');
  const data: GitHubSetupOptions = {
    executable: { state: 'observed', path: 'C:\\tools\\gh.exe', version: '2.0', diagnostics: [] },
    linked_account: { id: 'linked', login: 'linked-login' }, observed_account: { id: 'other', login: 'other-login' },
    accounts: [], diagnostics: [], retry_at_ms: null,
  };
  const container = await mount({ ...diagnostics, diagnostics: [] }, data, 'linked');
  expect(container.textContent).toContain('Conta ativa diferente da vinculada');
  expect(container.textContent).toContain('@linked-login');
  expect(container.textContent).toContain('@other-login');
  metadata.mockImplementation(async (path: string) => { if (path.includes('github-options')) throw new Error('Offline'); return { data: {}, etag: '"original"' }; });
  await act(async () => button(container, 'Verificar status').click());
  expect(container.textContent).toContain('Status do GitHub não confirmado');
  expect(metadata.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
});
it.each([['PROJECTS_ROOT_REQUIRED', 'Confirme a pasta dos projetos'], ['PROJECTS_ROOT_UNAVAILABLE', 'Revise a pasta dos projetos'], ['PROJECTS_ROOT_CHANGED', 'Confirme novamente a pasta']])('keeps %s next to the folder and independent profile restrictions visible', async (code, title) => {
  const diagnostics = view();
  diagnostics.diagnostics.push(condition(code, `Condição da pasta: ${code}`), condition('PROFILE_DELETE_BLOCKED', 'Perfil referenciado por outro projeto.'));
  const container = await mount(diagnostics);
  expect(container.querySelector('.settings-operation')?.textContent).toContain(title);
  expect(container.textContent).toContain('Perfil referenciado por outro projeto');
  expect(container.textContent?.match(/Nenhum perfil de execução cadastrado/g)).toHaveLength(1);
});
function button(container: HTMLElement, label: string) {
  const found = [...container.querySelectorAll('button')].find((node) => node.textContent === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
it('locates independent conditions, consolidates missing profiles and never posts on opening', async () => {
  const container = await mount();
  expect(container.querySelector('.github-setup-panel')?.textContent).toContain('Nenhuma conta vinculada');
  expect(container.querySelector('.settings-operation')?.textContent).toContain('Pasta ainda não confirmada');
  expect(container.textContent?.match(/Nenhum perfil de execução cadastrado/g)).toHaveLength(1);
  expect(container.textContent).not.toContain('Papel Implementador ausente');
  expect(container.textContent).not.toContain('Papel Revisor ausente');
  expect(container.querySelector('a[href="#principal/perfis"]')).not.toBeNull();
  expect(container.textContent).toContain('Observação pontual');
  expect(container.textContent).toContain('Não comprova execução de provider nem disponibilidade de MCP');
  expect(container.querySelector('#diagnostic-scope')).toBeNull();
  expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  expect(metadata.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
  expect([...container.querySelectorAll('button')].filter((node) => node.textContent === 'Verificar status')).toHaveLength(1);
});
it.each([400, 412])('preserves draft and save failure %s through refresh and verification', async (status) => {
  const container = await mount();
  const input = container.querySelector<HTMLInputElement>('#projects-root-path')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'C:\\draft');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const normal = metadata.getMockImplementation()!;
  metadata.mockImplementation((path: string, init?: RequestInit) => init?.method === 'PUT'
    ? Promise.reject(new HttpError(status, status === 412 ? 'REVISION_CONFLICT' : 'DIRECTORY_INVALID', 'Pasta recusada.', null, [], null, null, null)) : normal(path, init));
  await act(async () => button(container, 'Salvar configuração').click());
  const failure = status === 412 ? 'Conflito:' : 'Erro:';
  expect(container.textContent).toContain(failure);
  const sent = metadata.mock.calls.find(([, init]) => init?.method === 'PUT');
  expect(new Headers(sent?.[1].headers).get('If-Match')).toBe('"original"');
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Atualizar leitura de pasta e perfis"]')!.click());
  await act(async () => button(container, 'Verificar pasta e perfis').click());
  expect(input.value).toBe('C:\\draft');
  expect(container.textContent).toContain(failure);
  expect(metadata.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
  if (status === 412) expect(container.textContent).toContain('Dados atuais consultados em separado');
});
it.each(['Verificar pasta e perfis', 'Verificar integração'])('sends only the explicit global check from %s and consults the original operation', async (label) => {
  const container = await mount();
  request.mockImplementationOnce(async () => { throw new Error('Resposta perdida'); });
  await act(async () => button(container, label).click());
  const posts = request.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(posts).toHaveLength(1);
  expect(posts[0]?.[0]).toBe('/api/v1/diagnostics?scope=host');
  expect(JSON.parse(posts[0]?.[1].body as string)).toEqual({ checks: [label === 'Verificar integração' ? 'maestri_context' : 'configuration'] });
  expect([...container.querySelectorAll('button')].filter((node) => node.textContent === 'Consultar resultado')).toHaveLength(1);
  const id = new Headers(posts[0]?.[1].headers).get('Idempotency-Key');
  await act(async () => button(container, 'Consultar resultado').click());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 550)); });
  expect(request.mock.calls.some(([path]) => path === `/api/v1/operations/${id}`)).toBe(true);
  expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  expect(container.textContent).not.toContain('Consultar resultado');
});
it('keeps the unsaved folder and focus when updating diagnostic facts', async () => {
  const container = await mount();
  const input = container.querySelector<HTMLInputElement>('#projects-root-path')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'C:\\draft');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const refresh = container.querySelector<HTMLButtonElement>('[aria-label="Atualizar leitura de pasta e perfis"]')!;
  refresh.focus();
  await act(async () => refresh.click());
  expect(document.activeElement).toBe(refresh);
  expect(container.querySelector('#projects-root-path')).toBe(input);
  expect(input.value).toBe('C:\\draft');
  expect(container.textContent).toContain('A edição atual ainda não foi salva');
  expect(container.textContent).toContain('Não valida o rascunho');
  expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
});

it('keeps verification content stable while a background refresh blocks actions', async () => {
  const container = await mount({ ...view(), diagnostics: [] });
  const sections = [...container.querySelectorAll('.global-verification')];
  const text = sections.map((section) => section.textContent);
  const input = container.querySelector<HTMLInputElement>('#projects-root-path')!;
  input.focus();
  const normal = request.getMockImplementation()!;
  let finish!: (value: HttpDiagnosticsView) => void;
  const pending = new Promise<HttpDiagnosticsView>((resolve) => { finish = resolve; });
  request.mockImplementation((path: string, init?: RequestInit) => path.startsWith('/api/v1/diagnostics') ? pending : normal(path, init));
  await act(async () => button(container, 'Atualizar leitura').click());
  expect(sections.map((section) => section.textContent)).toEqual(text);
  expect(sections.every((section) => section.getAttribute('aria-busy') === 'true')).toBe(true);
  expect(button(container, 'Verificar pasta e perfis').disabled).toBe(true);
  expect(document.activeElement).toBe(input);
  await act(async () => finish({ ...view(), diagnostics: [] }));
  expect(sections.map((section) => section.textContent)).toEqual(text);
  expect(button(container, 'Verificar pasta e perfis').disabled).toBe(false);
});
