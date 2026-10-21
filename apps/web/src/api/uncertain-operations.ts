export type UncertainOperationKind = 'project.delete' | 'project-create' | 'project-register' | 'scaffold-create' | 'scaffold-reconcile' | 'settings-save' | 'profile-delete' | 'github-account-binding' | 'github-executable-save' | 'onboarding-root-save' | 'onboarding-complete' | 'onboarding-suppress' | 'queue-toggle' | 'queue-enable' | 'queue-pause' | 'attempt-start' | 'attempt-decision' | 'attempt-cancel' | 'delivery-publish';

export type UncertainOperation = {
  operationId: string;
  kind: UncertainOperationKind;
  recordedAt: number;
  projectId?: string;
};

const storageKey = 'factory.uncertain-operations.v1';
const kinds: readonly UncertainOperationKind[] = ['project.delete', 'project-create', 'project-register', 'scaffold-create', 'scaffold-reconcile', 'settings-save', 'profile-delete', 'github-account-binding', 'github-executable-save', 'onboarding-root-save', 'onboarding-complete', 'onboarding-suppress', 'queue-toggle', 'queue-enable', 'queue-pause', 'attempt-start', 'attempt-decision', 'attempt-cancel', 'delivery-publish'];

function isUncertainOperation(value: unknown): value is UncertainOperation {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.operationId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.operationId) &&
    kinds.some((kind) => kind === record.kind) && typeof record.recordedAt === 'number' && Number.isFinite(record.recordedAt) &&
    (record.projectId === undefined || record.kind === 'project.delete' && typeof record.projectId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.projectId));
}

export function readUncertainOperations(): UncertainOperation[] {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isUncertainOperation).map(({ operationId, kind, recordedAt, projectId }) => ({ operationId, kind, recordedAt, ...(projectId ? { projectId } : {}) }));
  } catch {
    return [];
  }
}

export function recordUncertainOperation(operation: UncertainOperation): void {
  if (!isUncertainOperation(operation)) throw new TypeError('Registro de operação incerta inválido.');
  const operations = readUncertainOperations().filter((item) => item.operationId !== operation.operationId);
  operations.push({ operationId: operation.operationId, kind: operation.kind, recordedAt: operation.recordedAt, ...(operation.projectId ? { projectId: operation.projectId } : {}) });
  window.sessionStorage.setItem(storageKey, JSON.stringify(operations));
}

export function resolveUncertainOperation(operationId: string): void {
  const operations = readUncertainOperations().filter((item) => item.operationId !== operationId);
  if (operations.length === 0) window.sessionStorage.removeItem(storageKey);
  else window.sessionStorage.setItem(storageKey, JSON.stringify(operations));
}
