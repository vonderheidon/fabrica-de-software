import { Value } from '@sinclair/typebox/value';
import { DeletionConfirmation, DeletionPreview, DeletionStatus, OperationViewWithDeletion, SettingsView } from '#contracts';
import { HttpError, requestJsonWithMetadata } from './http.js';
import { readUncertainOperations, recordUncertainOperation, resolveUncertainOperation } from './uncertain-operations.js';
import { clearProjectDrafts } from '../app/drafts.js';

export type DeletionOriginContext = Readonly<{ projectId: string; projectName: string; projectRevision: number; contextVersion: number }>;
const targetView = (target: DeletionPreview['targets'][number]) => ({ targetKey: target.target_key, targetKind: target.target_kind, path: target.path, state: target.state });
export function deletionPreviewView(value: DeletionPreview) {
  return { projectId: value.project_id, projectName: value.project_name, projectRevision: value.project_revision,
    authorizationDigest: value.authorization_digest, sourceKind: value.source_kind, targets: value.targets.map(targetView), blockers: value.blockers, canConfirm: value.can_confirm };
}
export function deletionStatusView(value: DeletionStatus) {
  return value.state === 'succeeded' ? { operationId: value.operation_id, state: value.state } : {
    operationId: value.operation_id, projectId: value.project_id, projectName: value.project_name, state: value.state,
    revision: value.revision, targets: value.targets.map(targetView), blockers: value.blockers, canRetry: value.can_retry,
  };
}
export type ProjectDeletionPreview = ReturnType<typeof deletionPreviewView>;
export type ProjectDeletionStatus = ReturnType<typeof deletionStatusView>;
export function isDefiniteDeletionRejection(error: unknown): error is HttpError {
  return error instanceof HttpError && [400, 403, 404, 409, 412, 413, 415, 422, 428, 429].includes(error.status);
}
const completedProjects = new Set<string>();
const completedOperations = new Set<string>();
const operationProjects = new Map<string, string>();
const originals = new Map<string, { context: DeletionOriginContext; etag: string; body: string; installationId: string; accountId: string | null }>();
const flights = new Map<string, Promise<ProjectDeletionStatus>>();
const projectOperations = new Map<string, string>();
export function pendingProjectDeletionOperation(projectId: string): string | null { return projectOperations.get(projectId) ?? null; }
export function bindProjectDeletion(operationId: string, projectId: string): void {
  if (completedOperations.has(operationId) || operationProjects.get(operationId) === projectId) return;
  operationProjects.set(operationId, projectId);
  const previous = readUncertainOperations().find(item => item.operationId === operationId);
  recordUncertainOperation({ operationId, projectId, kind: 'project.delete', recordedAt: previous?.recordedAt ?? Date.now() });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('factory-project-deletion-pending'));
}
export function knownProjectDeletionOperations(): readonly string[] { return [...operationProjects.keys()]; }
export function isProjectDeletionCompleted(projectId: string): boolean { return completedProjects.has(projectId); }
export function isProjectDeletionOperationCompleted(operationId: string): boolean { return completedOperations.has(operationId); }

function acceptStatus(value: DeletionStatus, operationId: string): ProjectDeletionStatus {
  if (value.operation_id !== operationId) throw new Error('O controlador retornou outra exclusão.');
  if (completedOperations.has(operationId)) return { operationId, state: 'succeeded' };
  const original = originals.get(operationId);
  const expectedProject = original?.context.projectId ?? operationProjects.get(operationId);
  if (value.state !== 'succeeded' && expectedProject && value.project_id !== expectedProject) throw new Error('O controlador retornou outro cadastro.');
  if (value.state === 'succeeded') {
    const projectId = original?.context.projectId ?? operationProjects.get(operationId);
    if (projectId) {
      completedProjects.add(projectId);
      clearProjectDrafts(projectId);
      projectOperations.delete(projectId);
    }
    completedOperations.add(operationId);
    operationProjects.delete(operationId);
    originals.delete(operationId);
    resolveUncertainOperation(operationId);
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('factory-project-deleted', { detail: { projectId, operationId } }));
    }
  } else {
    bindProjectDeletion(operationId, value.project_id);
    projectOperations.set(value.project_id, operationId);
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('factory-project-deletion-pending'));
  }
  return deletionStatusView(value);
}
export async function getProjectDeletionPreview(context: DeletionOriginContext, signal?: AbortSignal) {
  context = Object.freeze({ ...context });
  const result = await requestJsonWithMetadata<unknown>(`/api/v1/projects/${encodeURIComponent(context.projectId)}/deletion-preview`, { ...(signal ? { signal } : {}) });
  if (!Value.Check(DeletionPreview, result.data) || result.data.project_id !== context.projectId || result.data.project_revision !== context.projectRevision || completedProjects.has(context.projectId)) throw new Error('A conferência mudou. Consulte novamente o cadastro.');
  return { preview: deletionPreviewView(result.data), etag: result.etag, context };
}
export async function getProjectDeletionStatus(operationId: string, signal?: AbortSignal): Promise<ProjectDeletionStatus> {
  const pending = readUncertainOperations().find(item => item.operationId === operationId && item.kind === 'project.delete');
  if (pending?.projectId) bindProjectDeletion(operationId, pending.projectId);
  const result = await requestJsonWithMetadata<unknown>(`/api/v1/project-deletions/${encodeURIComponent(operationId)}`, { ...(signal ? { signal } : {}) });
  if (!Value.Check(DeletionStatus, result.data)) throw new Error('Resposta de exclusão inválida.');
  return acceptStatus(result.data, operationId);
}
export type DeletionRecovery = { kind: 'missing' } | { kind: 'completed'; status: ProjectDeletionStatus } | { kind: 'pending'; status: ProjectDeletionStatus };
export async function recoverUncertainOperation(operationId: string): Promise<DeletionRecovery> {
  let data: unknown;
  try { data = (await requestJsonWithMetadata<unknown>(`/api/v1/operations/${encodeURIComponent(operationId)}`)).data; }
  catch (error: unknown) { if (error instanceof HttpError && error.status === 404) return { kind: 'missing' }; throw error; }
  if (!Value.Check(OperationViewWithDeletion, data) || data.operation_id !== operationId) throw new Error('Resposta de operação inválida.');
  if (!('kind' in data)) return { kind: 'completed', status: acceptStatus(data, operationId) };
  if (data.kind !== 'project.delete') throw new Error('A operação não corresponde a uma exclusão.');
  return { kind: 'pending', status: await getProjectDeletionStatus(operationId) };
}
async function sendOriginal(operationId: string): Promise<ProjectDeletionStatus> {
  const original = originals.get(operationId);
  if (!original) throw new Error('O pedido original não está disponível. Continue consultando a operação.');
  let result;
  try {
    result = await requestJsonWithMetadata<unknown>(`/api/v1/projects/${encodeURIComponent(original.context.projectId)}/deletion`, {
      method: 'POST', body: original.body, headers: { 'If-Match': original.etag, 'Idempotency-Key': operationId },
    });
  } catch (error: unknown) {
    if (error instanceof HttpError && error.status === 401) {
      try {
        const recovered = await recoverUncertainOperation(operationId);
        if (recovered.kind !== 'missing') return recovered.status;
      } catch (recoveryError: unknown) { error.cause = recoveryError; }
    }
    throw error;
  }
  if (!Value.Check(DeletionStatus, result.data)) throw new Error('Resposta de exclusão inválida.');
  return acceptStatus(result.data, operationId);
}
export function confirmProjectDeletion(input: { context: DeletionOriginContext; etag: string; operationId: string; confirmation: DeletionConfirmation; installationId: string; accountId: string | null }): Promise<ProjectDeletionStatus> {
  const { context, etag, operationId, confirmation, installationId, accountId } = input;
  if (!Value.Check(DeletionConfirmation, confirmation) || !etag || completedProjects.has(context.projectId) || completedOperations.has(operationId)) return Promise.reject(new Error('A confirmação não é válida neste contexto.'));
  if (readUncertainOperations().some((item) => item.kind === 'project.delete' && item.operationId !== operationId && !originals.has(item.operationId) && !operationProjects.has(item.operationId))) return Promise.reject(new Error('Recupere a exclusão anterior antes de confirmar outro pedido.'));
  const body = JSON.stringify(confirmation);
  const prior = originals.get(operationId);
  if (prior && JSON.stringify(prior) !== JSON.stringify({ context, etag, body, installationId, accountId })) return Promise.reject(new Error('A chave original pertence a outro pedido.'));
  const existing = projectOperations.get(context.projectId);
  if (existing && existing !== operationId) return Promise.reject(new Error('Consulte a exclusão já enviada antes de confirmar novamente.'));
  const flight = flights.get(operationId);
  if (flight) return flight;
  if (prior) return Promise.reject(new Error('Consulte a chave original antes de reapresentar o pedido.'));
  originals.set(operationId, { context: Object.freeze({ ...context }), etag, body, installationId, accountId });
  projectOperations.set(context.projectId, operationId);
  recordUncertainOperation({ operationId, projectId: context.projectId, kind: 'project.delete', recordedAt: Date.now() });
  const pending = sendOriginal(operationId).catch((error: unknown) => {
    // A definite rejection did not accept this authorization. Unknown delivery keeps it intact.
    if (isDefiniteDeletionRejection(error)) {
      originals.delete(operationId);
      if (projectOperations.get(context.projectId) === operationId) projectOperations.delete(context.projectId);
      resolveUncertainOperation(operationId);
    }
    throw error;
  }).finally(() => flights.delete(operationId));
  flights.set(operationId, pending);
  return pending;
}
export function resendProjectDeletion(operationId: string): Promise<ProjectDeletionStatus> {
  const flight = flights.get(operationId);
  if (flight) return flight;
  const pending = recoverAndResend(operationId).finally(() => flights.delete(operationId));
  flights.set(operationId, pending);
  return pending;
}
async function recoverAndResend(operationId: string): Promise<ProjectDeletionStatus> {
  const recovery = await recoverUncertainOperation(operationId);
  if (recovery.kind === 'completed' || recovery.kind === 'pending') return recovery.status;
  const original = originals.get(operationId);
  if (!original || recovery.kind !== 'missing') throw new Error('Continue consultando a operação original.');
  const { data } = await requestJsonWithMetadata<unknown>('/api/v1/settings');
  if (!Value.Check(SettingsView, data) || data.settings.installation_id !== original.installationId || data.settings.account_id !== original.accountId) throw new Error('Restabeleça a instalação e a conta originais.');
  // A concurrent query may have completed the deletion while settings was loading.
  if (originals.get(operationId) !== original) throw new Error('A operação já foi concluída.');
  return sendOriginal(operationId);
}
export function resumeProjectDeletion(operationId: string): Promise<ProjectDeletionStatus> {
  const flight = flights.get(operationId);
  if (flight) return flight;
  if (completedOperations.has(operationId)) return Promise.resolve({ operationId, state: 'succeeded' });
  const projectId = operationProjects.get(operationId) ?? readUncertainOperations().find(item => item.operationId === operationId)?.projectId;
  recordUncertainOperation({ operationId, kind: 'project.delete', recordedAt: Date.now(), ...(projectId ? { projectId } : {}) });
  const pending = sendResume(operationId).finally(() => flights.delete(operationId));
  flights.set(operationId, pending);
  return pending;
}
async function sendResume(operationId: string): Promise<ProjectDeletionStatus> {
  let result;
  try {
    result = await requestJsonWithMetadata<unknown>(`/api/v1/project-deletions/${encodeURIComponent(operationId)}/resume`, { method: 'POST', body: '{}', headers: { 'Idempotency-Key': operationId } });
  } catch (error: unknown) {
    if (error instanceof HttpError && error.status === 401) {
      try {
        const recovered = await recoverUncertainOperation(operationId);
        if (recovered.kind !== 'missing') return recovered.status;
      } catch (recoveryError: unknown) { error.cause = recoveryError; }
    }
    throw error;
  }
  if (!Value.Check(DeletionStatus, result.data)) throw new Error('Resposta de exclusão inválida.');
  return acceptStatus(result.data, operationId);
}
