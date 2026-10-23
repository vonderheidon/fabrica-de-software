// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { OnboardingController } from '../features/onboarding/useOnboarding.js';

vi.mock('../features/projects/useProjects.js', () => ({ useProjects: () => ({ page: null }) }));
vi.mock('../features/queue/useQueue.js', () => ({ useQueue: () => ({ load: { observation: null } }) }));
vi.mock('../features/records/RecordsPanel.js', () => ({ RecordsPanel: () => createElement('p', null, 'Registros disponíveis') }));
import { PrincipalScreen } from './PrincipalScreen.js';
import { parseHash } from './hash-route.js';

it('keeps the mounted screen usable when an invalid route is entered and corrected', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onboarding: OnboardingController = {
    load: { snapshot: null, loading: false, refreshing: false, error: null },
    operation: { status: 'idle' }, busy: false,
    refresh: async () => null, saveProjectsRoot: async () => {}, complete: async () => {},
    suppress: async () => {}, saveTool: async () => {}, recover: async () => {},
  };
  const render = async (hash: string) => {
    await act(async () => root.render(createElement(PrincipalScreen, {
      route: parseHash(hash), onboarding, onOpenDialog: vi.fn(), onOpenProfileDialog: vi.fn(),
      onOpenInitialSetup: vi.fn(), onActionError: vi.fn(),
    })));
  };
  try {
    await render('#principal/registros');
    expect(container.textContent).toContain('Registros disponíveis');
    await render('#principal/registros?dialog=invalid');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Contexto inválido');
    await render('#principal/registros');
    expect(container.textContent).toContain('Registros disponíveis');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
