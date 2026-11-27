// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFolderInspection, ProjectImportStep, ProjectImportView } from '#contracts';
import { ProjectRegistrationForm } from './ProjectForm.js';
import { ProjectFolderField, folderInspectionLabels, repositoryLabel } from './ProjectFolderField.js';
import { destinationPreview, readProjectImportSession, suggestedFolderName, writeProjectImportSession } from './project-import-model.js';
import { setDraft } from '../../app/drafts.js';
import { HttpError } from '../../api/http.js';
import { readUncertainOperations } from '../../api/uncertain-operations.js';
import { operatorEventLabel } from '../../app/operator-language.js';

const { request, metadata } = vi.hoisted(() => ({ request: vi.fn(), metadata: vi.fn() }));
vi.mock('../../api/http.js', async (original) => ({ ...await original<typeof import('../../api/http.js')>(), requestJson: request, requestJsonWithMetadata: metadata }));

const identity = 'import-test-identity';
const importId = '00000000-0000-4000-8000-000000000091';
const projectId = '00000000-0000-4000-8000-000000000092';
const url = 'https://github.com/acme/app.git';
const roots: ReturnType<typeof createRoot>[] = [];
const stepNames = ['repository', 'reservation', 'clone', 'verification', 'registration'] as const;
const steps = (...states: ProjectImportStep['state'][]): ProjectImportStep[] => stepNames.map((step, index) => ({ step, state: states[index] ?? 'not_started' }));
const importView = (changes: Partial<ProjectImportView>): ProjectImportView => ({
  id: importId, operation_id: importId, state: 'running', name: 'App', repository_url: url, repository_id: 'R_1', base_branch: 'main', destination: 'C:\\projects\\app',
  adopted: false, steps: steps('confirmed', 'running'), project_id: null, diagnostic: null, cleanup: 'not_needed', revision: 1, created_at_ms: 1, updated_at_ms: 1, ...changes,
});
const accepted = { operation_id: '00000000-0000-4000-8000-000000000093', resource: { type: 'project_import', id: importId }, status_url: `/api/v1/operations/${importId}`, request_id: 'req' };

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  sessionStorage.clear();
});
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren(); request.mockReset(); metadata.mockReset(); sessionStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals();
});

async function mountRegistration(onRegistered = vi.fn()) {
  setDraft(identity, 'project-registration', { name: '', kind: 'github', location: '', baseBranch: 'main', commandId: null });
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  await act(async () => root.render(createElement(ProjectRegistrationForm, { identity, onRegistered })));
  return container;
}
async function fill(container: HTMLElement, selector: string, value: string) {
  const field = container.querySelector<HTMLInputElement>(selector)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); });
}
function button(container: HTMLElement, label: string) {
  const found = [...container.querySelectorAll('button')].find((item) => item.textContent === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('project import model', () => {
  it('suggests a safe folder name from the repository URL', () => {
    expect(suggestedFolderName('https://github.com/acme/app.git')).toBe('app');
    expect(suggestedFolderName('git@github.com:acme/my-repo')).toBe('my-repo');
    expect(suggestedFolderName('https://github.com/acme/app/')).toBe('app');
    expect(suggestedFolderName('')).toBe('');
  });
  it('joins the projects root and the folder name with the root separator', () => {
    expect(destinationPreview('C:\\projects\\', 'app')).toBe('C:\\projects\\app');
    expect(destinationPreview('/srv/projects', 'app')).toBe('/srv/projects/app');
  });
  it('round-trips and rejects malformed session records', () => {
    const body = { name: 'App', repository_url: url, folder_name: 'app' };
    writeProjectImportSession({ commandId: 'key', importId, body });
    expect(readProjectImportSession()).toEqual({ commandId: 'key', importId, body });
    sessionStorage.setItem('factory.project-import.v1', JSON.stringify({ commandId: 1 }));
    expect(readProjectImportSession()).toBeNull();
  });
  it('labels project_import events in Portuguese', () => {
    expect(operatorEventLabel('project_import.accepted')).toBe('Cadastro por URL aceito');
    expect(operatorEventLabel('project_import.clone.running')).toContain('Clonar');
    expect(operatorEventLabel('project_import.verification.confirmed')).toContain('Verificar');
    expect(operatorEventLabel('project_import.failed')).toBe('Cadastro por URL falhou');
  });
});

describe('GitHub registration by URL', () => {
  it('suggests the folder name, posts with a stable key and follows the five steps until the adopted project opens', async () => {
    const views = [
      importView({ state: 'accepted', steps: steps() }),
      importView({ steps: steps('confirmed', 'confirmed', 'running') }),
      importView({ state: 'completed', adopted: true, project_id: projectId, steps: steps('confirmed', 'confirmed', 'skipped', 'confirmed', 'confirmed') }),
    ];
    request.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/v1/settings') return { settings: { projects_root: 'C:\\projects' } };
      if (path === '/api/v1/branches') return { branches: ['main'], state: 'complete' };
      if (path === '/api/v1/projects/imports' && init?.method === 'POST') return accepted;
      if (path === `/api/v1/projects/imports/${importId}`) return views.length > 1 ? views.shift() : views[0];
      throw new Error(`Unexpected request ${path}`);
    });
    const onRegistered = vi.fn();
    const container = await mountRegistration(onRegistered);
    expect(container.textContent).not.toContain('Tipo da origem');
    expect(container.textContent).not.toContain('não clona arquivos');
    await fill(container, '#import-nome-do-projeto', 'App');
    await fill(container, '#import-url-do-reposit-rio-github', url);
    await tick(300);
    expect(container.querySelector<HTMLInputElement>('#import-folder-name')!.value).toBe('app');
    expect(container.textContent).toContain('C:\\projects\\');
    await fill(container, '#import-folder-name', 'app-editado');
    await act(async () => button(container, 'Adicionar existente').click());
    const post = request.mock.calls.find(([path]) => path === '/api/v1/projects/imports')!;
    const key = new Headers(post[1].headers).get('Idempotency-Key')!;
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(post[1].body)).toEqual({ name: 'App', repository_url: url, folder_name: 'app-editado' });
    expect(readUncertainOperations()).toHaveLength(0);
    expect(readProjectImportSession()?.importId).toBe(importId);
    for (const label of ['Conferir repositório', 'Reservar pasta', 'Clonar', 'Verificar', 'Registrar projeto']) expect(container.textContent).toContain(label);
    expect(container.textContent).toContain('Cadastro em andamento');
    await tick(2500);
    expect(container.textContent).toContain('2 de 5 etapas confirmadas');
    await tick(2500);
    expect(container.textContent).toContain('Cadastro concluído');
    expect(container.textContent).toContain('Pasta reaproveitada');
    expect(container.textContent).toContain('Dispensada');
    expect(readProjectImportSession()).toBeNull();
    await act(async () => button(container, 'Abrir configuração do projeto').click());
    expect(onRegistered).toHaveBeenCalledWith(projectId);
  });

  it('keeps the form values and offers a retry with a new key after a failure', async () => {
    request.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/v1/settings') return { settings: { projects_root: 'C:\\projects' } };
      if (path === '/api/v1/branches') return { branches: ['main'], state: 'complete' };
      if (path === '/api/v1/projects/imports' && init?.method === 'POST') return accepted;
      return importView({ state: 'failed', diagnostic: 'IMPORT_CLONE_FAILED', cleanup: 'removed', steps: steps('confirmed', 'confirmed', 'failed') });
    });
    const container = await mountRegistration();
    await fill(container, '#import-nome-do-projeto', 'App');
    await fill(container, '#import-url-do-reposit-rio-github', url);
    await act(async () => button(container, 'Adicionar existente').click());
    expect(container.textContent).toContain('Cadastro não concluído');
    expect(container.textContent).toContain('Clone não concluído');
    expect(container.textContent).toContain('foi removida');
    await act(async () => button(container, 'Tentar novamente').click());
    expect(readProjectImportSession()).toBeNull();
    expect(container.querySelector<HTMLInputElement>('#import-nome-do-projeto')!.value).toBe('App');
    await act(async () => button(container, 'Adicionar existente').click());
    const keys = request.mock.calls.filter(([path]) => path === '/api/v1/projects/imports').map(([, init]) => new Headers(init.headers).get('Idempotency-Key'));
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('resumes the progress after a reload without posting again', async () => {
    writeProjectImportSession({ commandId: '00000000-0000-4000-8000-000000000094', importId, body: { name: 'App', repository_url: url, folder_name: 'app' } });
    request.mockImplementation(async (path: string) => {
      if (path === '/api/v1/settings') return { settings: { projects_root: 'C:\\projects' } };
      if (path === `/api/v1/projects/imports/${importId}`) return importView({ steps: steps('confirmed', 'running') });
      throw new Error(`Unexpected request ${path}`);
    });
    const container = await mountRegistration();
    expect(container.textContent).toContain('Cadastro em andamento');
    expect(container.textContent).toContain('1 de 5 etapas confirmadas');
    expect(request.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('shows a field message for a synchronous rejection and leaves nothing recorded', async () => {
    request.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/v1/settings') return { settings: { projects_root: 'C:\\projects' } };
      if (path === '/api/v1/branches') return { branches: [], state: 'complete' };
      if (init?.method === 'POST') throw new HttpError(409, 'IMPORT_DESTINATION_RESERVED', 'Pasta já reservada.', null, [], null, null, null);
      throw new Error(`Unexpected request ${path}`);
    });
    const container = await mountRegistration();
    await fill(container, '#import-nome-do-projeto', 'App');
    await fill(container, '#import-url-do-reposit-rio-github', url);
    await act(async () => button(container, 'Adicionar existente').click());
    expect(container.querySelector('#import-folder-name')!.closest('.registration-folder-field')!.textContent).toContain('Pasta já reservada.');
    expect(readProjectImportSession()).toBeNull();
    expect(readUncertainOperations()).toHaveLength(0);
  });

  it('keeps the same request for a consultation when the acceptance was not confirmed', async () => {
    request.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/v1/settings') return { settings: { projects_root: 'C:\\projects' } };
      if (path === '/api/v1/branches') return { branches: [], state: 'complete' };
      if (init?.method === 'POST') throw new HttpError(503, 'STORAGE_UNAVAILABLE', 'Indisponível.', null, [], null, null, null);
      throw new Error(`Unexpected request ${path}`);
    });
    const container = await mountRegistration();
    await fill(container, '#import-nome-do-projeto', 'App');
    await fill(container, '#import-url-do-reposit-rio-github', url);
    await act(async () => button(container, 'Adicionar existente').click());
    expect(container.textContent).toContain('Cadastro ainda não confirmado');
    expect(readUncertainOperations().map((item) => item.kind)).toEqual(['project-register']);
    await act(async () => button(container, 'Consultar resultado').click());
    const keys = request.mock.calls.filter(([path]) => path === '/api/v1/projects/imports').map(([, init]) => new Headers(init.headers).get('Idempotency-Key'));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });
});

describe('Pasta do projeto in Configurar projeto', () => {
  const inspection = (changes: Partial<ProjectFolderInspection>): ProjectFolderInspection => ({
    location: 'C:\\repo', clone: 'same_repository', repository: 'acme/app', checkout: { kind: 'branch', name: 'main' }, diagnostic: null, observed_at_ms: 1, ...changes,
  });
  it('labels the clone state and checkout in Portuguese', () => {
    expect(folderInspectionLabels(inspection({}), null)).toEqual({ clone: 'Clone de acme/app', checkout: 'Em checkout: main', ok: true });
    expect(folderInspectionLabels(inspection({ clone: 'other_repository', checkout: { kind: 'detached' } }), null)).toEqual({ clone: 'Não é clone de acme/app', checkout: 'Em checkout: detached HEAD', ok: false });
    expect(folderInspectionLabels(inspection({ clone: 'not_clone', repository: null, checkout: null }), 'acme/fallback')).toEqual({ clone: 'Não é clone de acme/fallback', checkout: null, ok: false });
    expect(folderInspectionLabels(inspection({ clone: 'unavailable', checkout: null }), null).clone).toContain('indisponível');
    expect(repositoryLabel('https://github.com/acme/app.git')).toBe('acme/app');
  });

  it('inspects the folder, shows labels, the URL as information and reports a native selection', async () => {
    request.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === `/api/v1/projects/${projectId}/folder-inspection`) return inspection({ clone: 'other_repository', checkout: { kind: 'detached' }, location: JSON.parse(String(init?.body)).location });
      throw new Error(`Unexpected request ${path}`);
    });
    metadata.mockResolvedValue({ data: { kind: 'project_directory', state: 'selected', path: 'C:\\other', observed_at_ms: 1 }, etag: null });
    const onSelect = vi.fn();
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container); roots.push(root);
    await act(async () => root.render(createElement(ProjectFolderField, { projectId, location: 'C:\\repo', kind: 'local', repositoryUrl: url, disabled: false, error: null, onSelect })));
    expect(container.querySelector<HTMLInputElement>('#project-folder')!.readOnly).toBe(true);
    expect(container.textContent).toContain('Não é clone de acme/app');
    expect(container.textContent).toContain('Em checkout: detached HEAD');
    expect(container.textContent).toContain(url);
    expect(container.textContent).toContain('Somente informação');
    await act(async () => button(container, 'Trocar pasta').click());
    expect(onSelect).toHaveBeenCalledWith('C:\\other');
  });

  it('asks for a folder when the project still has a GitHub source', async () => {
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container); roots.push(root);
    await act(async () => root.render(createElement(ProjectFolderField, { projectId, location: url, kind: 'github', repositoryUrl: url, disabled: false, error: null, onSelect: vi.fn() })));
    expect(container.textContent).toContain('Pasta do projeto ausente');
    expect(container.querySelector<HTMLInputElement>('#project-folder')!.value).toBe('');
    expect(request).not.toHaveBeenCalled();
    expect(button(container, 'Selecionar pasta')).toBeTruthy();
  });
});
