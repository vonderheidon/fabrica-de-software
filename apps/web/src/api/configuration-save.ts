import type { OperationView, SettingsView } from '#contracts';
import { assertConfigurationBody } from './configuration-body.js';
import { getControllerInstanceId, HttpError, requestJsonWithMetadata } from './http.js';
import { recordUncertainOperation, resolveUncertainOperation } from './uncertain-operations.js';

export const operationNotLocatedMessage = 'A operação não foi localizada neste contexto. Isso não confirma que a gravação deixou de ocorrer.';
export type ConfigurationSaveRequest = Readonly<{
  operationId: string;
  path: `/api/v1/${string}`;
  method: 'PUT';
  body: string;
  etag: string;
  accountId: string | null;
  instanceId: string;
  installationId: string;
}>;
type ConfigurationSaveKind = 'settings-save' | 'profile-delete' | 'github-account-binding' | 'github-executable-save' | 'onboarding-root-save' | 'onboarding-complete' | 'onboarding-suppress';
const requests = new Map<string, ConfigurationSaveRequest>();
const missing = new Set<string>();

export function retainConfigurationSave(request: ConfigurationSaveRequest, kind: ConfigurationSaveKind = 'settings-save'): void {
  if (request.path !== '/api/v1/settings' && !/^\/api\/v1\/projects\/[^/]+\/configuration$/.test(request.path)) throw new TypeError('Rota de configuração inválida.');
  assertConfigurationBody(request.body);
  const prior = requests.get(request.operationId);
  if (prior && JSON.stringify(prior) !== JSON.stringify(request)) throw new Error('A identidade da operação já possui outro conteúdo.');
  requests.set(request.operationId, Object.freeze({ ...request }));
  recordUncertainOperation({ operationId: request.operationId, kind, recordedAt: Date.now() });
}

export async function consultConfigurationSave(operationId: string): Promise<OperationView | null> {
  try {
    const { data } = await requestJsonWithMetadata<OperationView>(`/api/v1/operations/${encodeURIComponent(operationId)}`);
    if (data.operation_id !== operationId) throw new Error('O controlador retornou outra operação.');
    missing.delete(operationId);
    return data;
  } catch (error: unknown) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error;
    missing.add(operationId);
    return null;
  }
}

export function hasOriginalConfigurationSave(operationId: string): boolean {
  return missing.has(operationId) && requests.has(operationId);
}

export async function revalidateConfigurationSave(operationId: string): Promise<ConfigurationSaveRequest> {
  const original = requests.get(operationId);
  if (!original || !missing.has(operationId)) throw new Error('Consulte o resultado original. Sem os dados desta operação, mantenha a consulta aberta e atualize novamente mais tarde.');
  const { data } = await requestJsonWithMetadata<SettingsView>('/api/v1/settings');
  if (getControllerInstanceId() !== original.instanceId || data.settings.installation_id !== original.installationId || data.settings.account_id !== original.accountId) {
    throw new Error('O contexto mudou. Restabeleça explicitamente a instalação e a conta originais para reapresentar a operação.');
  }
  return original;
}

export async function resendConfigurationSave<T>(operationId: string) {
  const original = await revalidateConfigurationSave(operationId);
  return requestJsonWithMetadata<T>(original.path, {
    method: original.method, body: original.body,
    headers: { 'If-Match': original.etag, 'Idempotency-Key': original.operationId },
  });
}

export function finishConfigurationSave(operationId: string): void {
  resolveUncertainOperation(operationId);
  requests.delete(operationId);
  missing.delete(operationId);
}
