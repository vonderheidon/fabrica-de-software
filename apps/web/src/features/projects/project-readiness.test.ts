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
import { clearDraft, configurationDraftIdentity, getDraft, setDraft, type DraftValue } from '../../app/drafts.js';
import { HttpError } from '../../api/http.js';

const { request, metadata } = vi.hoisted(() => ({ request: vi.fn(), metadata: vi.fn() }));
vi.mock('../../api/http.js', async (original) => ({ ...await original<typeof import('../../api/http.js')>(), getControllerInstanceId: () => 'test-instance', requestJson: request, requestJsonWithMetadata: metadata }));
let root: ReturnType<typeof createRoot> | null = null;
const prerequisite = (code: string): Prerequisite => ({ code, message: `Condição ${code}`, recovery: 'Corrija a configuração correspondente.' });
const projectId = 'ed0ae84a-3f5b-47c3-bfc5-d6e135880356';
let sequence = 0;
let savedConfiguration: ConfigurationView;
async function mount(locked = false, mapped = false, savedDraft?: DraftValue) {
  const identity = configurationDraftIdentity(null, projectId);
  clearDraft(identity, 'project-configuration');
  if (savedDraft !== undefined) setDraft(identity, 'project-configuration', savedDraft);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const settings: SettingsView = {
    settings: { id: 'local', installation_id: `project-test-${++sequence}`, account_id: null, designated_host: null,
      projects_root: 'C:\\saved', automation_enabled: false, revision: 1, created_at_ms: 1, updated_at_ms: 1,
      time_defaults: { format_version: 1, polling_interval_ms: 15000, passage_active_time_ms: 1800000, question_ttl: { state: 'not_configured' } },
      artifact_policy: { format_version: 1, automatic_deletion: false } },
    profiles: [], profile_counts: { all: 0, implementer: 0, reviewer: 0 }, event_cursor: '1',
    onboarding: { suppressed: true, completed_at_ms: null, first_incomplete_step: null, prerequisites: [] },
    selection_capabilities: { projects_root: { available: false }, gh_executable: { available: false } },
    tool_preferences: { format_version: 1, git: { preferred_path: null, last_validated_at_ms: null }, maestri: { preferred_path: null, last_validated_at_ms: null }, omp: { preferred_path: null, last_validated_at_ms: null }, powershell: { preferred_path: null, last_validated_at_ms: null } },
  };
  const configuration: ConfigurationView = { ...settings, deletion: null, prerequisites: [],
    storage: { managed_root: null, original_path: 'C:\\source', locations: [], transition_plan: null,
      active_transition_operation_id: null, state: 'current', cause: null, recovery: null },
    configuration_lock: locked ? { attempt_id: 'active-attempt' } : null,
    configuration: { id: 'revision', project_id: projectId, revision: 1, created_at_ms: 1,
      source: { kind: 'local', location: 'C:\\source' }, base_branch: 'main', github_project: mapped ? { id: 'board', owner_id: 'owner', status_field_id: 'status', status_option_ids: { backlog: 'backlog', ready: 'ready', in_progress: 'progress', in_review: 'review', delivered: 'done' } } : null,
      implementer_profile_id: null, reviewer_profile_id: null,
      correction_limit: 2, default_delivery_mode: 'icr', automation_enabled: false,
      queue_order: { use_board_position: true }, guidance: '' },
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
  expect(container.querySelector('[aria-label="Configuração do projeto"]')?.textContent).toContain('Confirme o repositório GitHub');
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
it('omits manual check controls and preserves project edits, DOM and focused refresh without a save', async () => {
  const container = await mount();
  const field = [...container.querySelectorAll('input')].find((item) => item.value.startsWith('C:'))!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, 'C:\\source-updated'); field.dispatchEvent(new Event('input', { bubbles: true })); });
  const refresh = container.querySelector<HTMLButtonElement>('[aria-label="Atualizar leitura do projeto"]')!; refresh.focus();
  await act(async () => refresh.click());
  expect(field.isConnected).toBe(true); expect(field.value).toBe('C:\\source-updated'); expect(document.activeElement).toBe(refresh);
  expect(metadata.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
  expect(container.textContent).not.toContain('Adicionar check');
  expect(container.textContent).not.toContain('cwd relativo do check');
  expect(container.textContent?.toLowerCase()).not.toContain('prioridade');
  expect(container.querySelectorAll('.checks-editor, .check-card')).toHaveLength(0);
  expect([...container.querySelectorAll('label')].map((item) => item.textContent)).not.toEqual(expect.arrayContaining([
    expect.stringContaining('Comando do check'), expect.stringContaining('Timeout do check'),
  ]));
});
it('restores current project edits and ignores unsupported draft paths', async () => {
  const container = await mount(false, false, {
    dirty: ['project.guidance', 'project.queue_order', 'project.unlisted_extension'],
    values: {
      'project.guidance': 'Orientação preservada',
      'project.queue_order': { use_board_position: false },
      'project.unlisted_extension': 'unsupported draft value',
    },
  });
  expect(container.querySelector<HTMLTextAreaElement>('#project-guidance')?.value).toBe('Orientação preservada');
  const position = [...container.querySelectorAll('label')].find((item) => item.textContent?.includes('Usar posição do quadro'))?.querySelector<HTMLInputElement>('input');
  expect(position?.checked).toBe(false);
  const restored = JSON.stringify(getDraft(configurationDraftIdentity(null, projectId), 'project-configuration'));
  expect(restored).not.toContain('unlisted_extension');
  expect(container.textContent?.toLowerCase()).not.toContain('prioridade');
  expect(container.querySelectorAll('.checks-editor, .check-card')).toHaveLength(0);
  await act(async () => button(container, 'Salvar configuração').click());
  const put = metadata.mock.calls.find(([, init]) => init?.method === 'PUT');
  expect(put).toBeDefined();
  const payload = JSON.parse(String(put?.[1]?.body)) as { project_changes: Record<string, unknown> };
  expect(payload.project_changes.queue_order).toEqual({ use_board_position: false });
  expect(JSON.stringify(payload)).not.toMatch(/priority_field_id|priority_direction/);
});
it('keeps editing locked while the read-only verification remains available', async () => {
  const container = await mount(true);
  expect(container.querySelector<HTMLFieldSetElement>('[aria-label="Configuração do projeto"]')!.disabled).toBe(true);
  expect(button(container, 'Verificar condições do projeto').disabled).toBe(false);
  expect(button(container, 'Salvar configuração').disabled).toBe(true);
});
it.each([
  ['ACCOUNT_CHANGED', 'global'], ['REMOTE_MISMATCH', 'origin'], ['REPOSITORY_ARCHIVED', 'origin'], ['CODE_NOT_PUBLISHED', 'origin'],
  ['PROJECT_CONFIGURATION_CHANGED', 'configuration'], ['PROFILE_REFERENCE_CHANGED', 'profiles'],
  ['CRITERIA_MISSING', 'criteria'], ['ISSUE_CLOSED', 'issue'], ['BLOCKED', 'issue'], ['STATUS_NOT_READY', 'issue'],
])('locates %s without changing eligibility', (code, section) => expect(conditionSection(code)).toBe(section));
it('preserves the current mapping when saving another field', async () => {
  const container = await mount(false, true);
  expect(container.textContent).not.toContain('Mapeamento histórico de quatro valores');
  const field = container.querySelector<HTMLTextAreaElement>('#project-guidance')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, 'Orientação editada'); field.dispatchEvent(new Event('input', { bubbles: true })); });
  metadata.mockResolvedValueOnce({ data: { ...savedConfiguration, operation_id: crypto.randomUUID(), receipt: { revision: 2, event_cursor: '2' } }, etag: '"saved"' });
  const save = [...container.querySelectorAll('button')].find(item => item.textContent?.includes('Salvar') && item.classList.contains('primary'))!;
  await act(async () => save.click());
  const [, init] = metadata.mock.calls.find(([, options]) => options?.method === 'PUT')!;
  expect(JSON.parse(String(init.body))).toEqual({ project_changes: { guidance: 'Orientação editada' } });
  expect(savedConfiguration.configuration.github_project?.status_option_ids).toHaveProperty('backlog', 'backlog');
});
it.each(['PROJECT_NOT_READY', 'PROJECT_QUEUE_BLOCKED', 'REMOTE_UNCONFIRMED', 'PROJECT_REQUIRED', 'CODE_NOT_PUBLISHED'])('keeps automation edits and displays the server cause and recovery for %s', async (code) => {
  const container = await mount();
  const automation = [...container.querySelectorAll('label')].find(item => item.textContent?.includes('Automação deste projeto habilitada'))!.querySelector<HTMLInputElement>('input')!;
  await act(async () => automation.click());
  const recovery = 'Confira a configuração indicada pelo servidor e tente habilitar novamente.';
  metadata.mockRejectedValueOnce(new HttpError(409, code, 'Publique a branch-base antes de habilitar a automação.', null, [], null, null, null, ['RF-15'], recovery));
  await act(async () => button(container, 'Salvar configuração').click());
  expect(container.textContent).toContain('Publique a branch-base antes de habilitar a automação.');
  expect(container.querySelector('.save-feedback [role="alert"]')?.textContent).toContain('Próxima ação:');
  expect(container.querySelector('.save-feedback [role="alert"]')?.textContent).toContain(recovery);
  expect(container.querySelector('.save-feedback')?.textContent).not.toContain(code);
  expect(automation.checked).toBe(true);
  expect(metadata.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
});
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
    prerequisites: ['ISSUE_CLOSED', 'REMOTE_MISMATCH', 'REMOTE_UNCONFIRMED', 'CODE_NOT_PUBLISHED', 'PROJECT_REQUIRED', 'REPOSITORY_ARCHIVED', 'PROFILE_REFERENCE_CHANGED', 'ACCOUNT_CHANGED', 'EXECUTOR_REVALIDATION_REQUIRED', 'CRITERIA_LIST_INVALID'].map(prerequisite),
    effective_configuration: { configuration, project_revision_id: 'revision', settings_revision: 1,
      implementer_profile: null, reviewer_profile: null, time_defaults: savedConfiguration.settings.time_defaults,
      artifact_policy: savedConfiguration.settings.artifact_policy, guidance: '',
       origins: { base_branch: 'project', implementer_profile: 'project', reviewer_profile: 'project', correction_limit: 'project', time_defaults: 'global', artifact_policy: 'global', guidance: 'project', delivery_mode: 'preparation' } },
    criteria_preview: { executable: false, objective: '', criteria: [], digest: 'a'.repeat(64), reasons: ['CRITERIA_LIST_INVALID'] },
    effects_preview: [], issue: null, base_sha: null, summary_hash: 'b'.repeat(64), diagnostics: [], retry_at_ms: null, publication_target: null,
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
  expect(container.textContent).toContain('Resumo da tentativa'); expect(container.textContent).toContain('Conteúdo da issue precisa de ajuste');
  expect(container.textContent).toContain('Issue fechada');
  expect(container.textContent).toContain('Base local e remota divergentes');
  expect(container.textContent).toContain('Confirme o repositório GitHub');
  expect(container.textContent).toContain('Publique a branch-base');
  expect(container.textContent).toContain('Selecione o quadro do projeto');
  expect(container.textContent).toContain('Repositório arquivado');
  expect(container.textContent).toContain('Referência de perfil alterada');
  expect(container.textContent).not.toContain('Atenção necessária');
  expect(container.textContent).not.toContain('CRITERIA_LIST_INVALID');
  expect(container.textContent).toContain('Configuração global necessária para iniciar');
  expect(container.textContent).not.toContain('Checks capturados');
  expect(container.textContent).not.toContain('Nenhum check configurado.');
  expect(container.querySelectorAll('.checks-editor, .check-card')).toHaveLength(0);
  expect(container.querySelector('a[href="#principal/configuracao"]')).not.toBeNull();
  expect(container.querySelector('a[href="#principal/perfis"]')).not.toBeNull();
  expect(button(container, 'Revisar e autorizar').disabled).toBe(true);
  expect(container.textContent).not.toContain('Verificar condições do projeto');
  expect(request.mock.calls.some(([path]) => path.includes('/diagnostics'))).toBe(false);
  expect(request.mock.calls.filter(([, init]) => init?.method)).toHaveLength(0);
  expect(metadata.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  expect(metadata.mock.calls[0]![0]).toBe(`/api/v1/projects/${preparationProjectId}/preparations`);
});

async function mountReadyStart() {
  await mount(); await act(async () => root!.unmount());
  const projectId = crypto.randomUUID();
  const {id:_id,project_id:_project,revision:_revision,created_at_ms:_created,...configuration} = savedConfiguration.configuration;
  const profile = {name:'Test profile',executor:'maestri-omp' as const,provider:'test',model:'test',effort:null,guidance:''};
  const preparation:Preparation = {
    id:crypto.randomUUID(),project_id:projectId,project_revision_id:'revision',revision:1,issue_id:'I_start',delivery_mode:'icr',guidance:'',overrides:{},can_start:false,
    prerequisites:[prerequisite('EXECUTOR_REVALIDATION_REQUIRED')],
    effective_configuration:{configuration,project_revision_id:'revision',settings_revision:1,implementer_profile:profile,reviewer_profile:profile,
      time_defaults:savedConfiguration.settings.time_defaults,artifact_policy:savedConfiguration.settings.artifact_policy,guidance:'',
       origins:{base_branch:'project',implementer_profile:'project',reviewer_profile:'project',correction_limit:'project',time_defaults:'global',artifact_policy:'global',guidance:'project',delivery_mode:'preparation'}},
    criteria_preview:{executable:true,objective:'Start fixture',criteria:[],digest:'a'.repeat(64),reasons:[]},effects_preview:[],
    issue:{id:'I_start',number:1,title:'Start fixture',state:'OPEN',assignees:[]} as unknown as NonNullable<Preparation['issue']>,
    base_sha:'a'.repeat(40),summary_hash:'b'.repeat(64),diagnostics:[],retry_at_ms:null,publication_target:null,
  };
  request.mockImplementation(async (path:string) => path === '/api/v1/settings' || path.endsWith('/configuration') ? savedConfiguration
    : path.includes('/issues?') ? {items:[],completeness:'complete',has_more:false,diagnostics:[],prerequisites:[]} : {project:{name:'Start fixture'},deletion:null});
  let rejectStart!:(reason:unknown)=>void;
  metadata.mockImplementation((path:string) => path === '/api/v1/attempts' ? new Promise((_resolve,reject) => {rejectStart=reject;}) : Promise.resolve({data:{preparation},etag:'"start"'}));
  const container=document.createElement('div');document.body.append(container);root=createRoot(container);
  await act(async () => root!.render(createElement(PreparationDialog,{projectId,initialIssueId:'I_start',onOpenAttempt:()=>{}})));
  await act(async () => button(container,'Revisar e autorizar').click());
  return {container,rejectStart:(reason:unknown)=>rejectStart(reason)};
}
it('shows pending start feedback in the fixed footer and keeps one request in flight',async () => {
  const f=await mountReadyStart();
  await act(async () => {button(f.container,'Iniciar tentativa').click();button(f.container,'Iniciar tentativa').click();});
  const footer=f.container.querySelector('.preparation-actions')!;
  expect(footer.textContent).toContain('Iniciando tentativa');
  expect(footer.querySelector('[role="status"]')?.textContent).toContain('Conferindo');
  expect(metadata.mock.calls.filter(([path]) => path === '/api/v1/attempts')).toHaveLength(1);
  await act(async () => f.rejectStart(new HttpError(409,'TERMINAL_AVAILABILITY_UNCONFIRMED','Não foi possível confirmar a disponibilidade do terminal próprio.',null,[],null,null,null,[], 'Confira o terminal no Maestri antes de tentar novamente.')));
  expect(footer.querySelector('[role="alert"]')?.textContent).toContain('terminal próprio');
  expect(footer.textContent).not.toContain('Resumo autorizado.');
  expect(footer.querySelector('button')?.textContent).toBe('Revisar preparação');
  await act(async () => button(f.container,'Revisar preparação').click());
  expect(button(f.container,'Revisar e autorizar')).not.toBeNull();
  expect(metadata.mock.calls.filter(([path]) => path === '/api/v1/attempts')).toHaveLength(1);
});
it('keeps recovery of an uncertain start in the footer without sending another start',async () => {
  const f=await mountReadyStart();
  const original=request.getMockImplementation()!;
  request.mockImplementation((path:string,...args:unknown[]) => path.includes('/operations/') ? Promise.reject(new Error('Read unavailable')) : original(path,...args));
  await act(async () => button(f.container,'Iniciar tentativa').click());
  await act(async () => f.rejectStart(new Error('Response lost')));
  const footer=f.container.querySelector('.preparation-actions')!;
  expect(footer.textContent).toContain('Consultar operação original');
  expect(footer.textContent).not.toContain('Iniciar tentativa');
  expect(metadata.mock.calls.filter(([path]) => path === '/api/v1/attempts')).toHaveLength(1);
});
