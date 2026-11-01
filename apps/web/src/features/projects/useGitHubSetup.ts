import { useCallback, useEffect, useRef, useState } from 'react';
import type { GitHubSetupOptions, HttpAttemptPage, OperationWarning, SettingsSaved, SettingsUpdate, SettingsView } from '#contracts';
import { consultConfigurationSave, finishConfigurationSave, operationNotLocatedMessage, retainConfigurationSave } from '../../api/configuration-save.js';
import { getControllerInstanceId, HttpError, requestJsonWithMetadata } from '../../api/http.js';
import { readUncertainOperations } from '../../api/uncertain-operations.js';
import { accountBindingAction, eligibleGitHubAccounts, linkedAccountMatchesSettings } from './github-setup-model.js';

export type GitHubVerificationState =
  | { status: 'idle'; data: null; settingsEtag: null; error: null }
  | { status: 'checking'; data: GitHubSetupOptions | null; settingsEtag: string; error: null }
  | { status: 'ready'; data: GitHubSetupOptions; settingsEtag: string; error: null }
  | { status: 'error'; data: GitHubSetupOptions | null; settingsEtag: string | null; error: { message: string; requestId: string | null } };

export type GitHubSettingsOperation =
  | { status: 'idle' }
  | { status: 'saving'; operationId: string }
  | { status: 'uncertain'; operationId: string; message: string; targetLogin: string | null; targetPath: string | null; recoveryError: string | null }
  | { status: 'confirmed'; operationId: string; message: string; warnings: readonly OperationWarning[]; savedPath?: string }
  | { status: 'error'; message: string; requestId: string | null; activeAttemptId: string | null; recovery: string | null };

export type GitHubSetupController = {
  verification: GitHubVerificationState;
  selectedLogin: string;
  setSelectedLogin: (login: string) => void;
  resetSelection: () => void;
  observationCurrent: boolean;
  eligibleAccounts: GitHubSetupOptions['accounts'];
  selectedAccount: GitHubSetupOptions['accounts'][number] | null;
  bindingAction: 'bind' | 'switch' | null;
  verify: () => Promise<void>;
  bindSelectedAccount: () => Promise<void>;
  saveExecutable: (path: string) => Promise<void>;
  accountOperation: GitHubSettingsOperation;
  executableOperation: GitHubSettingsOperation;
  recoverAccountOperation: () => Promise<void>;
  recoverExecutableOperation: () => Promise<void>;
};

type SaveKind = 'github-account-binding' | 'github-executable-save';
type SaveRequest = Parameters<typeof retainConfigurationSave>[0];

function initialOperation(kind: SaveKind): GitHubSettingsOperation {
  const operation = readUncertainOperations().find((item) => item.kind === kind);
  return operation
    ? { status: 'uncertain', operationId: operation.operationId, message: 'A operação original continua sem confirmação. Consulte o mesmo ID antes de qualquer nova alteração.', targetLogin: null, targetPath: null, recoveryError: null }
    : { status: 'idle' };
}

function activeAttemptId(error: HttpError): string | null {
  if (error.resource?.type === 'attempt') return error.resource.id;
  const facts = error.facts;
  if (!facts) return null;
  for (const key of ['active_attempt_id', 'attempt_id']) {
    const value = facts[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

async function firstActiveAttemptId(): Promise<string | null> {
  try {
    const params = new URLSearchParams({ result: 'active', limit: '100' });
    const { data } = await requestJsonWithMetadata<HttpAttemptPage>(`/api/v1/attempts?${params.toString()}`);
    return data.items[0]?.id ?? null;
  } catch {
    return null;
  }
}

function accountOperationFromView(operationId: string, targetLogin: string | null, warnings: readonly OperationWarning[]): GitHubSettingsOperation {
  return {
    status: 'confirmed', operationId,
    message: targetLogin ? `Conta @${targetLogin} vinculada com sucesso.` : 'Vínculo da conta confirmado.',
    warnings,
  };
}

export function useGitHubSetup(input: {
  enabled: boolean;
  settings: SettingsView | null;
  etag: string | null;
  onSettingsSaved: () => void;
}): GitHubSetupController {
  const [verification, setVerification] = useState<GitHubVerificationState>({ status: 'idle', data: null, settingsEtag: null, error: null });
  const [selectedLogin, setSelectedLoginState] = useState('');
  const [accountOperation, setAccountOperation] = useState<GitHubSettingsOperation>(() => initialOperation('github-account-binding'));
  const [executableOperation, setExecutableOperation] = useState<GitHubSettingsOperation>(() => initialOperation('github-executable-save'));
  const requestIdRef = useRef(0);
  const verificationControllerRef = useRef<AbortController | null>(null);
  const commandInFlightRef = useRef(false);
  const latestInputRef = useRef(input);
  latestInputRef.current = input;

  useEffect(() => () => {
    requestIdRef.current += 1;
    verificationControllerRef.current?.abort();
    verificationControllerRef.current = null;
  }, []);

  const verify = useCallback(async (): Promise<void> => {
    const current = latestInputRef.current;
    const currentEtag = current.etag;
    if (!current.enabled || !current.settings || !currentEtag) return;
    const requestId = ++requestIdRef.current;
    verificationControllerRef.current?.abort();
    const controller = new AbortController();
    verificationControllerRef.current = controller;
    setVerification((previous) => ({ status: 'checking', data: previous.data, settingsEtag: currentEtag, error: null }));
    try {
      const { data } = await requestJsonWithMetadata<GitHubSetupOptions>('/api/v1/settings/github-options', { signal: controller.signal });
      if (requestId !== requestIdRef.current) return;
      setVerification({ status: 'ready', data, settingsEtag: currentEtag, error: null });
      setSelectedLoginState((previous) => {
        const eligible = data.accounts.filter((account) => account.active && account.valid && account.eligible);
        if (eligible.some((account) => account.login === previous)) return previous;
        const observed = data.observed_account;
        if (observed && eligible.some((account) => account.id === observed.id)) return observed.login;
        return eligible.length === 1 ? eligible[0]?.login ?? '' : '';
      });
    } catch (error: unknown) {
      if (requestId !== requestIdRef.current || (error instanceof DOMException && error.name === 'AbortError')) return;
      const http = error instanceof HttpError ? error : null;
      setVerification((previous) => ({
        status: 'error', data: previous.data, settingsEtag: previous.settingsEtag,
        error: { message: http?.message ?? 'Não foi possível consultar o status do GitHub.', requestId: http?.requestId ?? null },
      }));
    } finally {
      if (requestId === requestIdRef.current) verificationControllerRef.current = null;
    }
  }, []);

  const settingsReady = input.settings !== null;
  useEffect(() => {
    if (input.enabled && settingsReady && input.etag) void verify();
  }, [input.enabled, input.etag, settingsReady, verify]);

  const eligibleAccounts = eligibleGitHubAccounts(verification.data);
  const selectedAccount = eligibleAccounts.find((account) => account.login === selectedLogin) ?? null;
  const settingsAccountId = input.settings?.settings.account_id ?? null;
  const observationCurrent = input.enabled && input.settings !== null && input.etag !== null &&
    verification.status === 'ready' && verification.settingsEtag === input.etag &&
    linkedAccountMatchesSettings(verification.data, settingsAccountId);
  const bindingAction = verification.data ? accountBindingAction(verification.data, settingsAccountId, selectedAccount?.id ?? null, observationCurrent) : null;

  function setSelectedLogin(login: string): void {
    setSelectedLoginState(eligibleAccounts.some((account) => account.login === login) ? login : '');
  }

  function resetSelection(): void {
    const accountId = latestInputRef.current.settings?.settings.account_id ?? null;
    const linked = verification.data?.linked_account;
    setSelectedLoginState(linked && linked.id === accountId ? linked.login : '');
  }

  async function saveCommand(kind: SaveKind, body: SettingsUpdate, targetLogin: string | null, targetPath: string | null = null): Promise<void> {
    const current = latestInputRef.current;
    const settings = current.settings;
    const etag = current.etag;
    if (!current.enabled || !settings || !etag || commandInFlightRef.current) return;
    const operationId = crypto.randomUUID();
    const instanceId = getControllerInstanceId();
    if (!instanceId) {
      const failure = { status: 'error' as const, message: 'Consulte a configuração novamente antes de salvar.', requestId: null, activeAttemptId: null, recovery: null };
      if (kind === 'github-account-binding') setAccountOperation(failure); else setExecutableOperation(failure);
      return;
    }
    const path = '/api/v1/settings' as const;
    const requestBody = JSON.stringify(body);
    const saveRequest: SaveRequest = {
      operationId, path, method: 'PUT', body: requestBody, etag,
      accountId: settings.settings.account_id,
      installationId: settings.settings.installation_id,
      instanceId,
    };
    commandInFlightRef.current = true;
    if (kind === 'github-account-binding') setAccountOperation({ status: 'saving', operationId });
    else setExecutableOperation({ status: 'saving', operationId });
    try {
      retainConfigurationSave(saveRequest, kind);
      const response = await requestJsonWithMetadata<SettingsSaved>(path, {
        method: 'PUT', headers: { 'If-Match': etag, 'Idempotency-Key': operationId }, body: requestBody,
      });
      if (response.data.operation_id !== operationId || !response.data.receipt || !response.etag) {
        throw new Error('A gravação retornou sem o recibo ou a revisão atualizados.');
      }
      finishConfigurationSave(operationId);
      if (kind === 'github-account-binding') setAccountOperation(accountOperationFromView(operationId, targetLogin, response.data.warnings ?? []));
      else setExecutableOperation({ status: 'confirmed', operationId, message: 'Caminho do executável salvo com sucesso.', warnings: response.data.warnings ?? [], ...(targetPath ? { savedPath: targetPath } : {}) });
      if (kind === 'github-account-binding') setVerification({ status: 'idle', data: null, settingsEtag: null, error: null });
      current.onSettingsSaved();
    } catch (error: unknown) {
      const http = error instanceof HttpError ? error : null;
      const uncertain = !http || http.status === 401 || http.status >= 500;
      if (!uncertain) finishConfigurationSave(operationId);
      const reportedAttemptId = http ? activeAttemptId(http) : null;
      const blockedAttemptId = http?.code === 'ACCOUNT_SWITCH_ATTEMPT_ACTIVE' && settings.settings.account_id !== null
        ? reportedAttemptId ?? await firstActiveAttemptId()
        : reportedAttemptId;
      const failureMessage = http?.code === 'ACCOUNT_SWITCH_ATTEMPT_ACTIVE' && !blockedAttemptId
        ? `${http.message} Atualize a aba Tentativas da conta vinculada para localizar a execução ativa.`
        : http?.message ?? (error instanceof Error ? error.message : 'A gravação falhou.');
      const failure = uncertain
        ? { status: 'uncertain' as const, operationId, message: 'A operação não foi confirmada. Acompanhe o resultado pela identidade original antes de tentar novamente.', targetLogin, targetPath, recoveryError: null }
        : { status: 'error' as const, message: failureMessage, requestId: http?.requestId ?? null, activeAttemptId: blockedAttemptId, recovery: http?.recovery ?? null };
      if (kind === 'github-account-binding') setAccountOperation(failure); else setExecutableOperation(failure);
    } finally {
      commandInFlightRef.current = false;
    }
  }

  async function bindSelectedAccount(): Promise<void> {
    const current = latestInputRef.current;
    const selected = eligibleAccounts.find((account) => account.login === selectedLogin);
    if (!observationCurrent || !current.settings || !selected || !bindingAction || accountOperation.status === 'uncertain' || accountOperation.status === 'saving') return;
    await saveCommand('github-account-binding', { changes: {}, account_binding: { action: bindingAction, account_id: selected.id } }, selected.login);
  }

  async function saveExecutable(path: string): Promise<void> {
    if (!path.trim()) return;
    await saveCommand('github-executable-save', { changes: {}, gh_executable_path: path }, null, path);
  }

  async function recover(kind: SaveKind): Promise<void> {
    const operation = kind === 'github-account-binding' ? accountOperation : executableOperation;
    if (operation.status !== 'uncertain') return;
    try {
      const result = await consultConfigurationSave(operation.operationId);
      if (!result) {
        const next = { ...operation, recoveryError: operationNotLocatedMessage };
        if (kind === 'github-account-binding') setAccountOperation(next); else setExecutableOperation(next);
        return;
      }
      if (result.state === 'succeeded' && result.receipt) {
        finishConfigurationSave(operation.operationId);
        const next = kind === 'github-account-binding'
          ? accountOperationFromView(operation.operationId, operation.targetLogin, result.warnings ?? [])
          : { status: 'confirmed' as const, operationId: operation.operationId, message: 'Caminho do executável salvo com sucesso.', warnings: result.warnings ?? [], ...(operation.targetPath ? { savedPath: operation.targetPath } : {}) };
        if (kind === 'github-account-binding') {
          setAccountOperation(next);
          setVerification({ status: 'idle', data: null, settingsEtag: null, error: null });
        } else setExecutableOperation(next);
        latestInputRef.current.onSettingsSaved();
        return;
      }
      if (result.state === 'failed') {
        finishConfigurationSave(operation.operationId);
        const failure = { status: 'error' as const, message: result.error?.message ?? 'O controlador confirmou que a operação falhou.', requestId: result.request_id, activeAttemptId: null, recovery: result.error?.recovery ?? null };
        if (kind === 'github-account-binding') setAccountOperation(failure); else setExecutableOperation(failure);
        return;
      }
      const next = { ...operation, recoveryError: 'A operação permanece em andamento ou sem confirmação. Consulte novamente o mesmo ID.' };
      if (kind === 'github-account-binding') setAccountOperation(next); else setExecutableOperation(next);
    } catch (error: unknown) {
      const message = error instanceof HttpError ? error.message : 'Não foi possível consultar a operação original.';
      const next = { ...operation, recoveryError: message };
      if (kind === 'github-account-binding') setAccountOperation(next); else setExecutableOperation(next);
    }
  }

  return {
    verification, selectedLogin, setSelectedLogin, resetSelection, observationCurrent, eligibleAccounts, selectedAccount, bindingAction,
    verify, bindSelectedAccount, saveExecutable, accountOperation, executableOperation,
    recoverAccountOperation: () => recover('github-account-binding'),
    recoverExecutableOperation: () => recover('github-executable-save'),
  };
}
