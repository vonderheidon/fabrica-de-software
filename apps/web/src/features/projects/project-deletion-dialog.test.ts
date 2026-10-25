import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ProjectDeletionPreview, ProjectDeletionStatus } from '../../api/project-deletion.js';

const mocks = vi.hoisted(() => ({ phase: 'preview', preview: null as ProjectDeletionPreview | null, status: null as ProjectDeletionStatus | null, loading: false, confirm: vi.fn(), tree: null as ReactNode }));
vi.mock('react-dom', () => ({ createPortal: (children: ReactNode) => { mocks.tree = children; return children; } }));
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>();
  return { ...react, useState: (initial: unknown) => react.useState(initial === 'preview' ? mocks.phase : initial) };
});
vi.mock('./useProjectDeletion.js', () => ({
  useProjectDeletionPreview: () => ({ preview: mocks.preview, etag: 'saved', loading: mocks.loading, error: null, refetch: vi.fn() }),
  useProjectDeletionStatus: () => ({ status: mocks.status, error: null }),
  confirmProjectDeletion: mocks.confirm, recoverUncertainOperation: vi.fn(),
}));
import { deletionProgress, deletionWarning, ProjectDeletionDialog } from './ProjectDeletionDialog.js';

const context = { projectId: 'private-project-id', projectName: 'Projeto <exemplo>', projectRevision: 1, contextVersion: 3 };
const managedRootPath = 'var/factory/projects/private-project-id/v1/managed';
const targets: ProjectDeletionPreview['targets'] = [
  { targetKey: 'private-target', targetKind: 'original_directory', path: 'C:/pasta muito longa/ação/.git', state: 'pending' },
  { targetKey: 'managed:managed:root', targetKind: 'exclusive_workspace', path: 'C:/fábrica/var/factory/projects/project-root/v1/managed', state: 'pending' },
  { targetKey: 'work', targetKind: 'exclusive_workspace', path: 'C:/ambientes/um', state: 'pending' },
  { targetKey: 'artifact', targetKind: 'exclusive_artifact', path: 'C:/evidências/log', state: 'pending' },
];
function render(currentRevision = 1, initialOperationId: string | null = null) {
  vi.stubGlobal('document', { body: {} });
  return renderToStaticMarkup(createElement(ProjectDeletionDialog, { originContext: context, currentRevision, installationId: 'private-installation', accountId: null,
    initialOperationId, managedRootPath, hasUnsavedChanges: true, pollingIntervalMs: 15000, returnFocusTarget: null, onClose: vi.fn() }));
}
beforeEach(() => {
  mocks.phase = 'preview'; mocks.status = null; mocks.loading = false; mocks.confirm.mockClear();
  mocks.preview = { ...context, sourceKind: 'github', authorizationDigest: 'private-digest', targets, blockers: [], canConfirm: true };
});

it('keeps confirmation compact while exposing every authorized path and preserving the complete warning', () => {
  const html = render();
  expect(html).toContain(deletionWarning);
  expect(html).toContain('Alterações não salvas não serão aplicadas.');
  expect(html).toContain('Não existe busca de pasta externa');
  expect(html).toContain('Pastas de origens anteriores serão preservadas.');
  for (const target of targets) expect(html).toContain(target.path);
  for (const label of ['Pasta original inteira', 'Ambiente local exclusivo', 'Artefato exclusivo']) expect(html).toContain(label);
  expect(html).toContain('Pasta gerenciada');
  expect(html).toContain('4 destinos autorizados');
  expect(html).toContain('Ver outros destinos autorizados (2)');
  expect(html).toContain('<details class="project-deletion-more-targets">');
  expect(html.indexOf('class="danger-button"')).toBeGreaterThan(html.indexOf('project-deletion-more-targets'));
  expect(html).toContain('Projeto &lt;exemplo&gt;');
  expect(html).not.toMatch(/private-|checkbox|<input|request_id|authorization_digest/);
  expect(mocks.confirm).not.toHaveBeenCalled();
});

it('associates the modal title and safe initial focus target and exposes a polite progress region', () => {
  const html = render();
  expect(html).toContain('aria-modal="true" aria-labelledby="project-deletion-title"');
  expect(html).toContain('id="project-deletion-title" tabindex="-1"');
  expect(html).toContain('role="status" aria-live="polite" aria-atomic="true"');
  expect(html).toContain('aria-label="Voltar à configuração"');
  expect(html).toContain('class="project-deletion-action-compact" aria-hidden="true">Voltar</span>');
});

it('prevents confirmation during loading, stale revision, blocked preview and submitting', () => {
  mocks.loading = true;
  expect(render()).toMatch(/disabled="">Excluir definitivamente/);
  mocks.loading = false;
  expect(render(2)).toMatch(/disabled="">Excluir definitivamente/);
  mocks.preview = { ...mocks.preview!, canConfirm: false, blockers: [{ reason: 'Pasta compartilhada.', recovery: 'Escolha uma origem exclusiva.' }] };
  const blocked = render();
  expect(blocked).toContain('role="alert"');
  expect(blocked).toContain('Pasta compartilhada.');
  expect(blocked).toContain('Escolha uma origem exclusiva.');
  expect(blocked).toMatch(/disabled="">Excluir definitivamente/);
  mocks.phase = 'submitting';
  const submitting = render();
  expect(submitting).toContain('Enviando pedido de exclusão');
  expect(submitting).not.toContain('class="danger-button"');
});

it('offers only observation in uncertainty with an alert and no raw metadata', () => {
  mocks.phase = 'uncertain';
  const html = render();
  expect(html).toContain('Consultar andamento');
  expect(html).toContain('Estado da exclusão não confirmado.');
  expect(html).not.toContain('class="danger-button"');
  expect(html).not.toContain('private-');
});

it('renders the same progress text when only the operation revision changes', () => {
  mocks.phase = 'accepted';
  const pending = { operationId: 'private-operation', projectId: context.projectId, projectName: context.projectName, state: 'running' as const, revision: 1, targets, blockers: [], canRetry: false };
  mocks.status = pending;
  const first = render();
  mocks.status = { ...pending, revision: 2 };
  expect(render()).toBe(first);
  expect(deletionProgress(mocks.status)).toBe('Exclusão em andamento.');
  expect(first).not.toContain('class="danger-button"');
});

it('distinguishes accepted, partial and reconfirmation states and links the same operation to records', () => {
  mocks.phase = 'accepted';
  const pending = { operationId: 'private-operation', projectId: context.projectId, projectName: context.projectName, state: 'pending' as const,
    revision: 1, targets, blockers: [{ reason: 'Destino protegido.', recovery: 'Confira o cadastro.' }], canRetry: true };
  mocks.status = { ...pending, state: 'accepted', blockers: [], canRetry: false };
  const accepted = render(1, 'private-operation');
  expect(accepted).toContain('Exclusão aceita. Aguardando execução.');
  expect(accepted).toContain('#principal/registros?operationId=private-operation');
  mocks.status = pending;
  const partial = render(1, 'private-operation');
  expect(partial).toContain('Exclusão pendente. Consulte os impedimentos. Itens já removidos não serão restaurados.');
  expect(partial).toContain('Destino protegido.');
  expect(partial).toContain('Confira o cadastro.');
  mocks.status = { ...pending, state: 'reconfirmation_required' };
  expect(render(1, 'private-operation')).toContain('A conferência dos caminhos precisa ser atualizada. Itens já removidos não serão restaurados.');
});

function findButton(node: ReactNode, label: string): (() => void) | undefined {
  if (Array.isArray(node)) {
    for (const child of node) { const result = findButton(child, label); if (result) return result; }
  }
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void; 'aria-label'?: string }>(node)) return undefined;
  if (node.type === 'button' && (node.props.children === label || node.props['aria-label'] === label)) return node.props.onClick;
  return findButton(node.props.children, label);
}

it('uses a fixed initiating context and one operation for rapid clicks; closing before submission has no effects', async () => {
  render();
  findButton(mocks.tree, 'Voltar à configuração')?.();
  expect(mocks.confirm).not.toHaveBeenCalled();
  mocks.confirm.mockImplementation(() => new Promise(() => undefined));
  const confirm = findButton(mocks.tree, 'Excluir definitivamente');
  expect(confirm).toBeDefined();
  confirm?.(); confirm?.();
  expect(mocks.confirm).toHaveBeenCalledTimes(1);
  expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ context, etag: 'saved', confirmation: { confirmed: true, authorization_digest: 'private-digest' } }));
});

it('a stale revision cannot submit even if its old click handler is invoked', () => {
  render(2);
  findButton(mocks.tree, 'Excluir definitivamente')?.();
  expect(mocks.confirm).not.toHaveBeenCalled();
});
