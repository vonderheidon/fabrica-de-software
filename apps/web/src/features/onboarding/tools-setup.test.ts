// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NativeSelectionResult, SettingsUpdate, SettingsView, ToolOptions } from '#contracts';
import { ToolsSetupPanel } from './ToolsSetupPanel.js';
import { InitialSetupDialog } from './InitialSetupDialog.js';
import { useOnboarding } from './useOnboarding.js';
import { HttpError } from '../../api/http.js';

const { request, metadata } = vi.hoisted(() => ({ request: vi.fn(), metadata: vi.fn() }));
vi.mock('../../api/http.js', async original => ({ ...await original<typeof import('../../api/http.js')>(),
  getControllerInstanceId: () => 'tools-test-instance', requestJson: request, requestJsonWithMetadata: metadata,
}));
const path = 'C:\\Ferramentas á\\git.exe';
const preference = { preferred_path: null, last_validated_at_ms: null };
let settings: SettingsView;
let options: ToolOptions;
let selection: NativeSelectionResult;
let root: Root;
let container: HTMLDivElement;
let writes: SettingsUpdate[];
let failSave: 'known' | 'unknown' | null;
let wizard = false;

function Harness() {
  const onboarding = useOnboarding(true);
  return wizard ? createElement(InitialSetupDialog, { onboarding, closePrompt: false, resetKey: 0,
    onRequestClose: () => {}, onContinueClose: () => {}, onDiscardClose: () => {}, onSuppressed: () => {},
    onGoProjects: () => {}, onDraftStateChange: () => {}, onAccessibleTitleChange: () => {},
  }) : createElement(ToolsSetupPanel, { onboarding });
}
async function mount() {
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(Harness)));
}
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find(item => item.textContent === text);
  expect(button, text).toBeDefined(); expect(button!.disabled, text).toBe(false);
  await act(async () => button!.click());
}
async function choose() {
  await click('Selecionar executável de Git');
  await click('Usar candidato de Git');
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  wizard = false; failSave = null; writes = [];
  settings = {
    settings: { id: 'local', installation_id: 'tools-installation', account_id: null, designated_host: null,
      projects_root: null, automation_enabled: false, revision: 1, created_at_ms: 1, updated_at_ms: 1,
      time_defaults: { format_version: 1, polling_interval_ms: 15000, passage_active_time_ms: 1800000, question_ttl: { state: 'not_configured' } },
      artifact_policy: { format_version: 1, automatic_deletion: false } },
    profiles: [], profile_counts: { all: 0, implementer: 0, reviewer: 0 }, event_cursor: '1',
    onboarding: { suppressed: false, completed_at_ms: null, first_incomplete_step: 'github', prerequisites: [] },
    selection_capabilities: { projects_root: { available: false }, gh_executable: { available: false } },
    tool_preferences: { format_version: 1, git: { ...preference }, maestri: { ...preference }, omp: { ...preference }, powershell: { ...preference } },
  };
  const available = { state: 'available' as const, candidates: [{ path: 'C:\\tools\\tool.exe', version: '1' }], selected_path: 'C:\\tools\\tool.exe', diagnostic: null, recovery: '' };
  options = { tools: { git: { state: 'unavailable', candidates: [], selected_path: null, diagnostic: 'TOOL_NOT_FOUND', recovery: 'Selecione o executável correto.' }, maestri: { ...available }, omp: { ...available }, powershell: { ...available }, gh: { ...available } },
    maestri_connection: { state: 'unavailable', diagnostic: 'MAESTRI_CONTEXT_UNAVAILABLE' }, observed_at_ms: 1 };
  selection = { state: 'selected', kind: 'git_executable', path, observed_at_ms: 1 };
  request.mockImplementation(async (url: string) => {
    if (url.endsWith('tool-options')) return structuredClone(options);
    throw new Error('Unexpected read');
  });
  metadata.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/selections')) return { data: selection };
    if (url.includes('/operations/')) return { data: { operation_id: url.split('/').at(-1), state: 'succeeded', receipt: { revision: 2, event_cursor: '2' } } };
    if (url !== '/api/v1/settings') throw new Error('Unavailable observation');
    if (init?.method !== 'PUT') return { data: structuredClone(settings), etag: '"settings-1"' };
    const body = JSON.parse(String(init.body)) as SettingsUpdate;
    writes.push(body);
    if (failSave === 'known') throw new HttpError(400, 'TOOL_PREFERENCE_INVALID', 'Executável inválido.', 'request', [], null, null, null);
    if (failSave === 'unknown') throw new Error('Response lost');
    if (body.tool_preferences) settings.tool_preferences = structuredClone(body.tool_preferences);
    if (body.changes.projects_root) {
      settings.settings.projects_root = body.changes.projects_root;
      settings.onboarding.first_incomplete_step = 'profiles';
    }
    options.tools.git = { state: 'available', candidates: [{ path, version: '2.0' }], selected_path: path, diagnostic: null, recovery: '' };
    return { data: { ...structuredClone(settings), operation_id: new Headers(init.headers).get('Idempotency-Key'), receipt: { revision: 2, event_cursor: '2' } }, etag: '"settings-2"' };
  });
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.replaceChildren(); sessionStorage.clear(); request.mockReset(); metadata.mockReset(); vi.unstubAllGlobals();
});

it('renders clean installation, explicit correction, receipt and restart revalidation in the wizard', async () => {
  wizard = true; await mount();
  expect(container.querySelector('#onboarding-step-title')?.textContent).toBe('Ferramentas');
  expect(container.textContent).toContain('Localizado e validado');
  expect(container.textContent).toContain('Conexão não confirmada');
  expect(container.textContent).not.toContain('Selecionar executável de OMP');
  await choose(); expect(writes).toHaveLength(0);
  await click('Validar e salvar Git');
  expect(writes).toHaveLength(1);
  expect(writes[0]).toEqual({ changes: {}, tool_preferences: { ...settings.tool_preferences, git: { preferred_path: path, last_validated_at_ms: null } } });
  expect(container.textContent).toContain('Escolha salva com recibo');
  await act(async () => root.unmount());
  options.tools.git = { state: 'unavailable', candidates: [], selected_path: null, diagnostic: 'TOOL_NOT_FOUND', recovery: 'Escolha outro executável.' };
  await mount();
  expect(container.textContent).toContain(`Caminho salvo: ${path}`);
  expect(container.textContent).toContain('não confirmou esse caminho');
  expect(container.textContent).toContain('Selecionar executável de Git');
  expect(writes).toHaveLength(1);
});

it('preserves draft and saved path on cancellation, unavailable picker and failed save', async () => {
  wizard = true;
  settings.tool_preferences.git.preferred_path = 'C:\\old\\git.exe';
  await mount(); await choose();
  selection = { state: 'cancelled', kind: 'git_executable' };
  await click('Selecionar executável de Git');
  expect(container.querySelector<HTMLInputElement>('#tool-git-path')?.value).toBe(path);
  selection = { state: 'unavailable', kind: 'git_executable', diagnostic: 'NATIVE_SELECTION_UNAVAILABLE' };
  await click('Selecionar executável de Git');
  expect(container.querySelector<HTMLInputElement>('#tool-git-path')?.value).toBe(path);
  failSave = 'known'; await click('Validar e salvar Git');
  expect(container.textContent).toContain('A escolha não foi salva');
  expect(container.querySelector<HTMLInputElement>('#tool-git-path')?.value).toBe(path);
  expect(settings.tool_preferences.git.preferred_path).toBe('C:\\old\\git.exe');
  expect(container.querySelector('#onboarding-step-title')?.textContent).toBe('Ferramentas');
});

it('shows tools only in their own step and returns without repeating them in GitHub', async () => {
  wizard = true; await mount();
  expect(container.querySelectorAll('.onboarding-step')).toHaveLength(4);
  expect(container.querySelector('.onboarding-tools-step')?.hasAttribute('hidden')).toBe(false);
  await click('Continuar para o GitHub');
  expect(container.querySelector('#onboarding-step-title')?.textContent).toBe('Conectar GitHub');
  expect(container.querySelector('.onboarding-tools-step')?.hasAttribute('hidden')).toBe(true);
  expect(writes).toHaveLength(0);
  await click('Voltar');
  expect(container.querySelector('#onboarding-step-title')?.textContent).toBe('Ferramentas');
  expect(container.querySelector('.onboarding-tools-step')?.hasAttribute('hidden')).toBe(false);
});

it('saves the picked projects folder once and enables continuing without another confirmation', async () => {
  wizard = true;
  settings.settings.account_id = 'account';
  settings.onboarding.first_incomplete_step = 'projects_root';
  settings.selection_capabilities.projects_root = { available: true };
  selection = { state: 'selected', kind: 'projects_root', path: 'C:\\Projects', observed_at_ms: 1 };
  await mount();
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('.onboarding-step')].find(button => button.textContent?.includes('Escolher a pasta'))!.click());
  await click('Selecionar pasta');
  expect(writes).toHaveLength(1);
  expect(writes[0]?.changes.projects_root).toBe('C:\\Projects');
  expect(container.querySelector<HTMLInputElement>('#projects-root-path')?.value).toBe('C:\\Projects');
  expect(container.textContent).not.toContain('Usar esta pasta');
  expect(container.textContent).not.toContain('Validar e salvar esta pasta');
  await click('Continuar para os perfis');
  expect(container.querySelector('#onboarding-step-title')?.textContent).toBe('Configurar os perfis');
  expect(writes).toHaveLength(1);
});

it.each(['known', 'unknown'] as const)('keeps the picked folder and blocks advancing after a %s save failure without retrying', async failure => {
  wizard = true;
  settings.settings.account_id = 'account';
  settings.settings.projects_root = 'C:\\OldProjects';
  settings.onboarding.first_incomplete_step = 'profiles';
  settings.selection_capabilities.projects_root = { available: true };
  selection = { state: 'selected', kind: 'projects_root', path: 'C:\\NewProjects', observed_at_ms: 1 };
  failSave = failure;
  await mount();
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('.onboarding-step')].find(button => button.textContent?.includes('Escolher a pasta'))!.click());
  await click('Selecionar pasta');
  expect(writes).toHaveLength(1);
  expect(settings.settings.projects_root).toBe('C:\\OldProjects');
  expect(container.querySelector<HTMLInputElement>('#projects-root-path')?.value).toBe('C:\\NewProjects');
  expect([...container.querySelectorAll('button')].find(button => button.textContent === 'Continuar para os perfis')?.disabled).toBe(true);
  await act(async () => {});
  expect(writes).toHaveLength(1);
});

it('keeps manual drafts while detection finishes and distinguishes a confirmed connection', async () => {
  await mount(); await choose();
  let finish: ((value: ToolOptions) => void) | undefined;
  request.mockImplementationOnce(() => new Promise<ToolOptions>(resolve => { finish = resolve; }));
  await click('Detectar novamente');
  const input = container.querySelector<HTMLInputElement>('#tool-git-path')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'C:\\edited\\git.exe'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  const observed = structuredClone(options); observed.maestri_connection = { state: 'connected', diagnostic: null };
  await act(async () => finish?.(observed));
  expect(container.querySelector<HTMLInputElement>('#tool-git-path')?.value).toBe('C:\\edited\\git.exe');
  expect(container.textContent).not.toContain('Conexão Maestri');
  expect(writes).toHaveLength(0);
});

it('shows unresolved ambiguity as a manual choice without selecting or saving automatically', async () => {
  options.tools.git = { state: 'ambiguous', selected_path: null, diagnostic: 'TOOL_SELECTION_AMBIGUOUS', recovery: 'Selecione uma opção.',
    candidates: [{ path, version: '1' }, { path: 'C:\\other\\git.exe', version: '2' }] };
  await mount();
  expect(container.textContent).toContain('Escolha pendente');
  expect(container.querySelector('#tool-git-candidate')).not.toBeNull();
  expect(container.querySelector<HTMLInputElement>('#tool-git-path')?.value).toBe('');
  expect(writes).toHaveLength(0);
});

it('discards late detection from an older request and never overwrites an edited draft', async () => {
  await mount(); await choose();
  let finish: ((value: ToolOptions) => void) | undefined;
  request.mockImplementationOnce(() => new Promise<ToolOptions>(resolve => { finish = resolve; }));
  await click('Detectar novamente');
  const input = container.querySelector<HTMLInputElement>('#tool-git-path')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'C:\\edited\\git.exe'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  const old = structuredClone(options);
  await act(async () => { window.dispatchEvent(new Event('factory-controller-resync')); });
  // Account changes replace the panel context; the old promise is deliberately allowed to finish.
  settings.settings.account_id = 'other-account';
  await act(async () => { window.dispatchEvent(new Event('factory-controller-resync')); });
  old.tools.git.selected_path = 'C:\\obsolete\\git.exe';
  await act(async () => finish?.(old));
  expect(container.textContent).not.toContain('obsolete');
  expect(writes).toHaveLength(0);
});

it('consults an uncertain save without repeating PUT after remount', async () => {
  await mount(); await choose(); failSave = 'unknown'; await click('Validar e salvar Git');
  expect(container.textContent).toContain('gravação está sem confirmação');
  expect(sessionStorage.getItem('factory.uncertain-operations.v1')).not.toContain(path);
  await act(async () => root.unmount()); await mount();
  await click('Consultar gravação das ferramentas');
  expect(writes).toHaveLength(1);
});

