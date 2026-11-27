// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProjectStorageView } from '#contracts';
import { ProjectConfigurationDialog } from './ProjectConfigurationDialog.js';

const storage: ProjectStorageView = {
  original_path: 'C:\\Projetos\\Minha pasta original',
  managed_root: 'var/factory/projects/project/v1/managed',
  state: 'current', cause: null, recovery: null,
  active_transition_operation_id: null, locations: [], transition_plan: null,
};
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount(value = storage) {
  await act(async () => root.render(createElement(ProjectConfigurationDialog, { storage: value })));
}
it('shows only the project folder even when internal storage needs attention', async () => {
  await mount({ ...storage, state: 'blocked', cause: 'STORAGE_TRANSITION_ACCESS_DENIED', recovery: 'Confira a pasta gerenciada.' });
  expect(container.textContent).toContain('Armazenamento do projeto');
  expect(container.textContent).toContain(storage.original_path);
  expect(container.textContent).not.toContain(storage.managed_root);
  expect(container.textContent).not.toContain('transição');
  expect(container.querySelectorAll('button')).toHaveLength(1);
  expect(container.querySelectorAll('input, details, a')).toHaveLength(0);
});
it('copies the full project folder and confirms the action', async () => {
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  await mount();
  await act(async () => container.querySelector('button')!.click());
  expect(copy).toHaveBeenCalledWith(storage.original_path);
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Caminho copiado.');
});
it('uses the managed folder for a project without an original local folder', async () => {
  await mount({ ...storage, original_path: null });
  expect(container.textContent).toContain(storage.managed_root);
  expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Copiar pasta do projeto');
});
it('shows a concise empty state without a copy action when no folder exists', async () => {
  await mount({ ...storage, original_path: null, managed_root: null });
  expect(container.textContent).toContain('Este projeto ainda não tem uma pasta local.');
  expect(container.querySelector('button')).toBeNull();
});
