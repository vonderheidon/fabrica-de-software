// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProjectDeletionPreview, ProjectDeletionStatus } from '../../api/project-deletion.js';

const api = vi.hoisted(() => ({ preview: vi.fn(), confirm: vi.fn(), status: vi.fn(), resume: vi.fn() }));
vi.mock('../../api/project-deletion.js', async (original) => ({
  ...await original<typeof import('../../api/project-deletion.js')>(),
  getProjectDeletionPreview: api.preview,
  confirmProjectDeletion: api.confirm,
  getProjectDeletionStatus: api.status,
  resumeProjectDeletion: api.resume,
}));
import { ProjectDeletionDialog } from './ProjectDeletionDialog.js';
import { ProjectDeletionPendingNotice, knownProjectDeletion } from './ProjectDeletionPendingNotice.js';

const context = { projectId: 'project', projectName: 'Projeto', projectRevision: 1, contextVersion: 3 };
const pending: ProjectDeletionStatus = {
  operationId: 'operation', ...context, state: 'running', revision: 1,
  targets: [{ targetKey: 'original', targetKind: 'original_directory', path: 'C:/projeto', state: 'pending' }],
  blockers: [], canRetry: false,
};
const preview: ProjectDeletionPreview = {
  ...context, sourceKind: 'local', authorizationDigest: 'digest', targets: pending.targets,
  blockers: [], canConfirm: true,
};
let root: Root;
let trigger: HTMLButtonElement;
let observer: MutationObserver | undefined;

function element<T extends Element>(selector: string): T {
  const result = document.querySelector<T>(selector);
  expect(result, selector).not.toBeNull();
  return result!;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  api.preview.mockReset().mockResolvedValue({ preview, etag: 'saved', context });
  api.confirm.mockReset().mockResolvedValue(pending);
  api.status.mockReset().mockResolvedValue(pending);
  api.resume.mockReset().mockResolvedValue(pending);
  trigger = document.createElement('button');
  trigger.textContent = 'Excluir projeto';
  document.body.append(trigger);
  trigger.focus();
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  observer?.disconnect();
  observer = undefined;
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each(['running', 'pending'] as const)('preserves focus and live-region nodes without announcements during unchanged %s polling', async (state) => {
  let revision = 1;
  const blockers = state === 'pending' ? [{ reason: 'Pasta em uso.', recovery: 'Feche os arquivos e tente novamente.' }] : [];
  api.status.mockImplementation(async () => ({ ...pending, state, revision: revision++, targets: pending.targets.map((target) => ({ ...target })), blockers: blockers.map((blocker) => ({ ...blocker })) }));
  const onClose = vi.fn();
  await act(async () => root.render(createElement(ProjectDeletionDialog, {
    originContext: context, currentRevision: 1, installationId: 'installation', accountId: null,
    hasUnsavedChanges: true, pollingIntervalMs: 1000, returnFocusTarget: trigger, onClose,
  })));
  const title = element<HTMLHeadingElement>('#project-deletion-title');
  expect(document.activeElement).toBe(title);
  expect(element('dialog').getAttribute('aria-labelledby')).toBe(title.id);
  expect(element('dialog').getAttribute('aria-modal')).toBe('true');
  await act(async () => element<HTMLButtonElement>('.danger-button').click());
  expect(api.confirm).toHaveBeenCalledTimes(1);
  expect(api.status).toHaveBeenCalledTimes(1);
  const close = element<HTMLButtonElement>('.profile-delete-actions button');
  close.focus();
  const status = element<HTMLElement>('[role="status"]');
  expect(status.getAttribute('aria-live')).toBe('polite');
  expect(status.getAttribute('aria-atomic')).toBe('true');
  const alert = document.querySelector('[role="alert"]');
  expect(Boolean(alert)).toBe(state === 'pending');
  if (alert) expect(alert.textContent).toContain(blockers[0]?.recovery);

  // Observe the dialog, including region removal/replacement, not just text equality.
  const announcements: MutationRecord[] = [];
  observer = new MutationObserver((records) => announcements.push(...records));
  observer.observe(element('dialog'), { subtree: true, childList: true, characterData: true, attributes: true });
  for (let poll = 1; poll <= 3; poll += 1) {
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    announcements.push(...observer.takeRecords());
    expect(api.status).toHaveBeenCalledTimes(poll + 1);
    expect(document.activeElement).toBe(close);
    expect(element('[role="status"]')).toBe(status);
    expect(document.querySelector('[role="alert"]')).toBe(alert);
    expect(document.querySelector('.danger-button')).toBeNull();
    expect(announcements).toHaveLength(0);
  }

  // Positive control: relevant changes must still update the accessible regions.
  api.status.mockResolvedValue({ ...pending, state: 'finalizing', revision: 10 });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  announcements.push(...observer.takeRecords());
  expect(status.textContent).toBe('Finalizando a remoção do cadastro.');
  expect(announcements.length).toBeGreaterThan(0);
  expect(document.activeElement).toBe(close);
  await act(async () => close.click());
  expect(onClose).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
  expect(document.activeElement).toBe(trigger);
  const reads = api.status.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(api.status).toHaveBeenCalledTimes(reads);
  expect(api.confirm).toHaveBeenCalledTimes(1);
});

it('reopens server summary after remount, retains blockers after failed reads and retries only by explicit action', async () => {
  const blocked = { ...pending, state: 'reconfirmation_required', canRetry: true, blockers: [{ reason: 'Alvo substituído.', recovery: 'Retire externamente a pasta substituta antes de tentar novamente.' }] };
  api.status.mockResolvedValue(blocked);
  const props = { originContext: context, currentRevision: 1, installationId: 'installation', accountId: null,
    hasUnsavedChanges: false, pollingIntervalMs: 1000, returnFocusTarget: trigger, onClose: vi.fn(), initialOperationId: 'operation' };
  await act(async () => root.render(createElement(ProjectDeletionDialog, props)));
  expect(api.preview).not.toHaveBeenCalled(); expect(api.confirm).not.toHaveBeenCalled();
  const retry = () => Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Tentar novamente')!;
  expect(retry()).toBeDefined();
  expect(document.body.textContent).toContain('Retire externamente');
  api.status.mockRejectedValue(new Error('offline'));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(document.body.textContent).toContain('Alvo substituído.');
  expect(api.resume).not.toHaveBeenCalled();
  await act(async () => retry().click());
  expect(api.resume).toHaveBeenCalledExactlyOnceWith('operation');
  await act(async () => root.render(null));
  api.status.mockResolvedValue({ ...blocked, canRetry: false });
  await act(async () => root.render(createElement(ProjectDeletionDialog, props)));
  expect(retry()).toBeUndefined(); expect(api.confirm).not.toHaveBeenCalled();
});

it('does not apply a delayed observation after unmount or cancel when closing accepted work', async () => {
  let resolveRead: ((value: ProjectDeletionStatus) => void) | undefined;
  api.status.mockImplementation(() => new Promise<ProjectDeletionStatus>(resolve => { resolveRead = resolve; }));
  await act(async () => root.render(createElement(ProjectDeletionDialog, {
    originContext: context, currentRevision: 1, installationId: 'installation', accountId: null,
    hasUnsavedChanges: false, pollingIntervalMs: 1000, returnFocusTarget: trigger, onClose: vi.fn(), initialOperationId: 'operation',
  })));
  await act(async () => root.render(null));
  await act(async () => resolveRead?.({ operationId: 'operation', state: 'succeeded' }));
  expect(document.querySelector('dialog')).toBeNull();
  expect(api.resume).not.toHaveBeenCalled(); expect(api.confirm).not.toHaveBeenCalled();
});

it('rebuilds pending notice from server summary after reload and opens the same operation without exposing its key', async () => {
  const summary = { operation_id: '00000000-0000-4000-8000-000000000020', state: 'pending' as const, reason: 'Pasta em uso.', recovery: 'Feche os arquivos.' };
  const props = { projectId: '00000000-0000-4000-8000-000000000021', projectName: 'Projeto recarregado', revision: 2, deletion: summary };
  await act(async () => root.render(createElement(ProjectDeletionPendingNotice, props)));
  expect(knownProjectDeletion(props.projectId)?.operation_id).toBe(summary.operation_id);
  await act(async () => root.render(null));
  await act(async () => root.render(createElement(ProjectDeletionPendingNotice, props)));
  const open = Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Acompanhar exclusão')!;
  api.status.mockRejectedValue(new Error('offline'));
  await act(async () => open.click());
  expect(api.status).toHaveBeenCalledWith(summary.operation_id, expect.any(AbortSignal));
  expect(knownProjectDeletion(props.projectId)).not.toBeNull();
  expect(document.body.textContent).not.toContain(summary.operation_id);
  expect(api.confirm).not.toHaveBeenCalled(); expect(api.resume).not.toHaveBeenCalled();
});
