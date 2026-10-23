// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import type { ConfigurationView, HttpDiagnosticsView, Prerequisite, SettingsView, Preparation } from '#contracts';
import { ProjectConfigurationForm } from './ProjectForm.js';
import { ConditionNotices, conditionSection } from './ProjectReadiness.js';
import { IssueOptionsNotice } from '../preparations/IssueOptionsNotice.js';
import { PreparationDialog } from '../preparations/PreparationDialog.js';

const { request, metadata } = vi.hoisted(() => ({ request: vi.fn(), metadata: vi.fn() }));
vi.mock('../../api/http.js', async (original) => ({ ...await original<typeof import('../../api/http.js')>(), getControllerInstanceId: () => 'test-instance', requestJson: request, requestJsonWithMetadata: metadata }));
let root: ReturnType<typeof createRoot> | null = null;
const prerequisite = (code: string): Prerequisite => ({ code, message: `Condição ${code}`, recovery: 'Corrija a configuração correspondente.' });
const projectId = 'ed0ae84a-3f5b-47c3-bfc5-d6e135880356';
let sequence = 0;
let savedConfiguration: ConfigurationView;
async function mount(locked = false) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const settings: SettingsView = {
    settings: { id: 'local', installation_id: `project-test-${++sequence}`, account_id: null, designated_host: null,
      projects_root: 'C:\\saved', automation_enabled: false, revision: 1, created_at_ms: 1, updated_at_ms: 1,
      time_defaults: { format_version: 1, polling_interval_ms: 15000, passage_active_time_ms: 1800000, question_ttl: { state: 'not_configured' } },
      artifact_policy: { format_version: 1, automatic_deletion: false } },
    profiles: [], profile_counts: { all: 0, implementer: 0, reviewer: 0 }, event_cursor: '1',
    onboarding: { suppressed: true, completed_at_ms: null, first_incomplete_step: null, prerequisites: [] },
    selection_capabilities: { projects_root: { available: false }, gh_executable: { available: false } },
  };
  const configuration: ConfigurationView = { ...settings, deletion: null, prerequisites: [],
    configuration_lock: locked ? { attempt_id: 'active-attempt' } : null,
    configuration: { id: 'revision', project_id: projectId, revision: 1, created_at_ms: 1,
      source: { kind: 'local', location: 'C:\\source' }, base_branch: 'main', github_project: null,
      implementer_profile_id: null, reviewer_profile_id: null, checks: [{ id: 'check', command: 'npm test', cwd_relative: '.', timeout_ms: 1000 }],
      correction_limit: 2, default_delivery_mode: 'icr', automation_enabled: false,
      queue_order: { priority_field_id: null, priority_direction: 'asc', use_board_position: true }, guidance: '' },
  };
  savedConfiguration = configuration;
  const diagnostics: HttpDiagnosticsView = { context: { scope: 'project', id: projectId }, supported_checks: ['configuration'], event_cursor: '1', reports: [],
    diagnostics: ['REMOTE_UNCONFIRMED', 'PROJECT_REQUIRED', 'PROFILES_REQUIRED', 'EXECUTION_REVALIDATION_REQUIRED'].map((code) => ({ code, cause: prerequisite(code).message, recovery: prerequisite(code).recovery, check: 'configuration', state: 'blocked', facts: {}, affected_requirements: [], observed_at_ms: 1 })) };
  request.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/api/v1/settings') return settings;
    if (path.includes('/operations/')) return { state: 'succeeded', receipt: { revision: 1 } };
    if (path.includes('/diagnostics')) return init?.method === 'POST' ? { operation_id: new Headers(init.headers).get('Idempotency-Key') } : diagnostics;
    return { project: { id: projectId, name: 'Projeto de teste', revision: 1, current_revision_id: 'revision' }, deletion: null };
  });
  metadata.mockImplementation(async (path: string) => {
    if (path.includes('configuration-options')) return { data: { projects: { items: [], has_more: false, next_cursor: null, event_cursor: '1' }, status_fields: [], completeness: 'complete', diagnostics: [], retry_at_ms: null }, etag: '"options"' };
    return { data: configuration, etag: '"original"' };
  });
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(createElement(ProjectConfigurationForm, { projectId, onSaveIssue: () => {} })));
  return container;
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; document.body.replaceChildren(); request.mockReset(); metadata.mockReset(); sessionStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function button(container: HTMLElement, text: string) { const node = [...container.querySelectorAll('button')].find((item) => item.textContent === text); if (!node) throw new Error(`Missing ${text}`); return node; }
it('locates project conditions and keeps one configuration action without verification on navigation', async () => {
  const container = await mount();
  expect(container.textContent).toContain('selecione um perfil ativo para cada papel');
  expect(container.textContent).toContain('Perfis disponíveis: nenhum Implementador e nenhum Revisor');
  expect(container.querySelector('[aria-label="Configuração do projeto"]')?.textContent).toContain('confirme a origem');
  expect(container.textContent).not.toContain('Bloqueado · Revise os pré-requisitos');
  expect([...container.querySelectorAll('button')].filter((item) => item.textContent === 'Verificar condições do projeto')).toHaveLength(1);
  expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  expect(metadata.mock.calls.filter(([, init]) => init?.method)).toHaveLength(0);
  await act(async () => button(container, 'Verificar condições do projeto').click());
  const posts = request.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(posts).toHaveLength(1); expect(posts[0]![0]).toBe(`/api/v1/diagnostics?scope=project&id=${projectId}`);
  expect(JSON.parse(posts[0]![1].body)).toEqual({ checks: ['configuration'] });
  const operationId = new Headers(posts[0]![1].headers).get('Idempotency-Key');
  vi.useFakeTimers();
  await act(async () => button(container, 'Consultar resultado').click());
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(request.mock.calls.some(([path]) => path === `/api/v1/operations/${operationId}`)).toBe(true);
  expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
});
it('preserves check edits, DOM and focused refresh without a save', async () => {
  const container = await mount();
  const field = [...container.querySelectorAll('input')].find((item) => item.value === 'npm test')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, 'npm run verify'); field.dispatchEvent(new Event('input', { bubbles: true })); });
  const refresh = container.querySelector<HTMLButtonElement>('[aria-label="Atualizar leitura do projeto"]')!; refresh.focus();
  await act(async () => refresh.click());
  expect(field.isConnected).toBe(true); expect(field.value).toBe('npm run verify'); expect(document.activeElement).toBe(refresh);
  expect(metadata.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
  expect(container.textContent).toContain('cwd relativo do check 1'); expect(container.textContent).toContain('Timeout do check 1');
});
it('keeps editing locked while the read-only verification remains available', async () => {
  const container = await mount(true);
  expect(container.querySelector<HTMLFieldSetElement>('[aria-label="Configuração do projeto"]')!.disabled).toBe(true);
  expect(button(container, 'Verificar condições do projeto').disabled).toBe(false);
  expect(button(container, 'Salvar configuração').disabled).toBe(true);
});
it.each([
  ['ACCOUNT_CHANGED', 'global'], ['REMOTE_MISMATCH', 'origin'], ['REPOSITORY_ARCHIVED', 'origin'],
  ['PROJECT_CONFIGURATION_CHANGED', 'configuration'], ['PROFILE_REFERENCE_CHANGED', 'profiles'],
  ['CRITERIA_MISSING', 'criteria'], ['ISSUE_CLOSED', 'issue'], ['BLOCKED', 'issue'], ['STATUS_NOT_READY', 'issue'],
])('locates %s without changing eligibility', (code, section) => expect(conditionSection(code)).toBe(section));
it('shows revalidation as information and gives global correction access', () => {
  const html = renderToStaticMarkup(createElement(ConditionNotices, { items: [prerequisite('EXECUTOR_REVALIDATION_REQUIRED'), prerequisite('ISSUE_REVALIDATION_REQUIRED')], section: 'information', projectId }));
  expect(html).toContain('role="note"'); expect(html).not.toContain('blocked'); expect(html.match(/serão revalidados/g)).toHaveLength(1);
  expect(renderToStaticMarkup(createElement(ConditionNotices, { items: [prerequisite('ACCOUNT_CHANGED')], section: 'global', projectId }))).toContain('Abrir Configuração');
});
it('consolidates equivalent access errors even when a prerequisite carries one', () => {
  const html = renderToStaticMarkup(createElement(IssueOptionsNotice, { projectId, onReload: () => {}, issues: { items: [], next_cursor: null, has_more: false, event_cursor: '1', completeness: 'unavailable', retry_at_ms: null,
    prerequisites: [prerequisite('REFERENCE_INACCESSIBLE')], diagnostics: [{ code: 'NOT_FOUND_OR_INACCESSIBLE', message: 'duplicated access', recovery: 'Retry' }] } }));
  expect(html).toContain('O quadro configurado não foi encontrado'); expect(html).not.toContain('Condição REFERENCE'); expect(html).not.toContain('duplicated access');
});
it('renders a blocked preparation with local conditions and no diagnostic, start or replay', async () => {
  await mount();
  await act(async () => root!.unmount());
  const preparationProjectId = crypto.randomUUID();
  const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _created, ...configuration } = savedConfiguration.configuration;
  const preparation: Preparation = {
    id: crypto.randomUUID(), project_id: preparationProjectId, project_revision_id: 'revision', revision: 1,
    issue_id: 'ISSUE_test', delivery_mode: 'icr', guidance: '', overrides: {}, can_start: false,
    prerequisites: ['ISSUE_CLOSED', 'REMOTE_MISMATCH', 'REPOSITORY_ARCHIVED', 'PROFILE_REFERENCE_CHANGED', 'ACCOUNT_CHANGED', 'EXECUTOR_REVALIDATION_REQUIRED', 'CRITERIA_LIST_INVALID'].map(prerequisite),
    effective_configuration: { configuration, project_revision_id: 'revision', settings_revision: 1,
      implementer_profile: null, reviewer_profile: null, time_defaults: savedConfiguration.settings.time_defaults,
      artifact_policy: savedConfiguration.settings.artifact_policy, guidance: '',
      origins: { base_branch: 'project', implementer_profile: 'project', reviewer_profile: 'project', checks: 'project', correction_limit: 'project', time_defaults: 'global', artifact_policy: 'global', guidance: 'project', delivery_mode: 'preparation' } },
    criteria_preview: { executable: false, objective: '', criteria: [], digest: 'a'.repeat(64), reasons: ['CRITERIA_LIST_INVALID'] },
    effects_preview: [], issue: null, base_sha: null, summary_hash: 'b'.repeat(64), diagnostics: [], retry_at_ms: null,
  };
  request.mockReset(); metadata.mockReset();
  request.mockImplementation(async (path: string) => {
    if (path === '/api/v1/settings') return savedConfiguration;
    if (path.endsWith('/configuration')) return savedConfiguration;
    if (path.includes('/issues?')) return { items: [], next_cursor: null, has_more: false, event_cursor: '1', completeness: 'partial', retry_at_ms: null, diagnostics: [], prerequisites: [] };
    return { project: { name: 'Projeto da preparação' }, deletion: null };
  });
  metadata.mockImplementation(async () => ({ data: { preparation, event_cursor: '1' }, etag: '"preparation"' }));
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(createElement(PreparationDialog, { projectId: preparationProjectId, initialIssueId: 'ISSUE_test', onOpenAttempt: () => {} })));
  expect(container.querySelector('.preparation-section')?.textContent).toContain('A consulta das issues está incompleta');
  expect(container.textContent).toContain('Configuração efetiva'); expect(container.textContent).toContain('Critérios não executáveis');
  expect(container.textContent).toContain('Issue fechada');
  expect(container.textContent).toContain('Base local e remota divergentes');
  expect(container.textContent).toContain('Repositório arquivado');
  expect(container.textContent).toContain('Referência de perfil alterada');
  expect(container.textContent).not.toContain('Atenção necessária');
  expect(container.textContent).not.toContain('CRITERIA_LIST_INVALID');
  expect(container.textContent).toContain('Configuração global necessária para iniciar');
  expect(container.querySelector('a[href="#principal/configuracao"]')).not.toBeNull();
  expect(container.querySelector('a[href="#principal/perfis"]')).not.toBeNull();
  expect(button(container, 'Revisar e autorizar').disabled).toBe(true);
  expect(container.textContent).not.toContain('Verificar condições do projeto');
  expect(request.mock.calls.some(([path]) => path.includes('/diagnostics'))).toBe(false);
  expect(request.mock.calls.filter(([, init]) => init?.method)).toHaveLength(0);
  expect(metadata.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  expect(metadata.mock.calls[0]![0]).toBe(`/api/v1/projects/${preparationProjectId}/preparations`);
});
