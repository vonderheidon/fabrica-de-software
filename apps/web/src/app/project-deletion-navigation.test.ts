// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { OnboardingController } from '../features/onboarding/useOnboarding.js';
const api = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../api/http.js', async original => ({ ...await original<typeof import('../api/http.js')>(), requestJson: api.read }));
vi.mock('../features/projects/useProjects.js', () => ({ useProjects: () => ({ page: null }) }));
vi.mock('../features/queue/useQueue.js', () => ({ useQueue: () => ({ load: { observation: null } }) }));
vi.mock('../features/projects/ProjectForm.js', () => ({ ProjectConfigurationForm: ({ projectId }: { projectId: string | null }) => createElement('p', null, projectId ?? 'Configuração global disponível') }));
vi.mock('../features/records/RecordsPanel.js', () => ({ RecordsPanel: ({ filters }: { filters: { projectId: string } }) => createElement('p', null, filters.projectId || 'Registros sem filtro de projeto') }));
import { HttpError } from '../api/http.js';
import { PrincipalScreen } from './PrincipalScreen.js';
import { useHashRoute } from './useHashRoute.js';

const onboarding = { load: { snapshot: null }, refresh: vi.fn() } as unknown as OnboardingController;
let root: Root;
let container: HTMLDivElement;
function Screen() {
  return createElement(PrincipalScreen, { route: useHashRoute(), onboarding, onOpenDialog: vi.fn(), onOpenProfileDialog: vi.fn(), onOpenInitialSetup: vi.fn(), onActionError: vi.fn() });
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  api.read.mockReset().mockResolvedValue({});
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); window.history.replaceState(null, '', '#principal/dashboard'); vi.unstubAllGlobals(); });
async function mount(hash: string) {
  window.history.replaceState(null, '', hash);
  await act(async () => root.render(createElement(Screen)));
}

it('clears deleted selection and dependent record filters and announces completion once', async () => {
  await mount('#principal/registros?projectId=removed&attemptId=old&operationId=old&search=keep');
  await act(async () => { window.dispatchEvent(new CustomEvent('factory-project-deleted', { detail: { projectId: 'removed', operationId: 'deleted-operation' } })); });
  expect(window.location.hash).toBe('#principal/registros?search=keep');
  expect(container.textContent).toContain('Registros sem filtro de projeto');
  expect(container.textContent?.match(/Projeto excluído\./g)).toHaveLength(1);
});
it('preserves the current project when another deletion finishes late', async () => {
  await mount('#principal/configuracao?projectId=other');
  await act(async () => { window.dispatchEvent(new CustomEvent('factory-project-deleted', { detail: { projectId: 'removed' } })); });
  expect(window.location.hash).toBe('#principal/configuracao?projectId=other');
  expect(container.textContent).toContain('other');
});
it('repairs an obsolete saved URL on a confirmed 404 without announcing deletion success', async () => {
  api.read.mockImplementation(async (path: string) => {
    if (path === '/api/v1/projects/removed') throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Indisponível', null, [], null, null, null);
    return {};
  });
  await mount('#principal/configuracao?projectId=removed');
  expect(window.location.hash).toBe('#principal/configuracao');
  expect(container.textContent).toContain('Configuração global disponível');
  expect(container.textContent).toContain('A seleção foi limpa.');
  expect(container.textContent).not.toContain('Projeto excluído.');
});
it('preserves selection and does not infer deletion from a transport failure', async () => {
  api.read.mockRejectedValue(new Error('offline'));
  await mount('#principal/registros?projectId=existing');
  expect(window.location.hash).toContain('projectId=existing');
  expect(container.textContent).not.toContain('Projeto excluído.');
});
