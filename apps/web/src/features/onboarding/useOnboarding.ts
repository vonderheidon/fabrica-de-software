import { useCallback, useEffect, useRef, useState } from 'react';
import type { OperationReceipt, SettingsSaved, SettingsUpdate, SettingsView } from '#contracts';
import {
  consultConfigurationSave,
  finishConfigurationSave,
  hasOriginalConfigurationSave,
  retainConfigurationSave,
  resendConfigurationSave,
} from '../../api/configuration-save.js';
import { getControllerInstanceId, HttpError, requestJsonWithMetadata } from '../../api/http.js';
import { readUncertainOperations } from '../../api/uncertain-operations.js';

export type OnboardingCommandKind = 'projects-root' | 'complete' | 'suppress' | 'tools';

export type OnboardingSnapshot = {
  settings: SettingsView;
  etag: string;
};

export type OnboardingLoadState = {
  snapshot: OnboardingSnapshot | null;
  loading: boolean;
  refreshing: boolean;
  error: { message: string; requestId: string | null } | null;
};

export type OnboardingOperation =
  | { status: 'idle' }
  | { status: 'saving'; kind: OnboardingCommandKind; operationId: string }
  | { status: 'uncertain'; kind: OnboardingCommandKind; operationId: string; message: string; recoveryError: string | null; canResend: boolean }
  | { status: 'failed'; kind: OnboardingCommandKind; message: string; requestId: string | null }
  | { status: 'confirmed'; kind: OnboardingCommandKind; operationId: string; receipt: OperationReceipt };

export type OnboardingController = {
  load: OnboardingLoadState;
  operation: OnboardingOperation;
  busy: boolean;
  refresh: () => Promise<OnboardingSnapshot | null>;
  saveProjectsRoot: (path: string) => Promise<void>;
  complete: () => Promise<void>;
  suppress: () => Promise<void>;
  saveTool: (tool: 'git' | 'maestri' | 'omp' | 'powershell' | 'gh', path: string) => Promise<void>;
  recover: (resend?: boolean) => Promise<void>;
};

const uncertainKinds = {
  'projects-root': 'onboarding-root-save',
  complete: 'onboarding-complete',
  suppress: 'onboarding-suppress',
  tools: 'tool-preference-save',
} as const;

function initialOperation(): OnboardingOperation {
  const pending = readUncertainOperations().find((item) =>
    Object.values(uncertainKinds).some(kind => kind === item.kind),
  );
  if (!pending) return { status: 'idle' };
  const kind = pending.kind === uncertainKinds['projects-root'] ? 'projects-root' : pending.kind === uncertainKinds.complete ? 'complete' : pending.kind === uncertainKinds.tools ? 'tools' : 'suppress';
  return {
    status: 'uncertain', kind, operationId: pending.operationId,
    message: 'A operação original continua sem confirmação. Consulte o mesmo ID antes de iniciar outra alteração.',
    recoveryError: null, canResend: false,
  };
}

function errorDetails(error: unknown): { message: string; requestId: string | null; uncertain: boolean } {
  if (error instanceof HttpError) {
    return {
      message: error.message,
      requestId: error.requestId,
      uncertain: error.status === 401 || error.status >= 500,
    };
  }
  return {
    message: error instanceof Error ? error.message : 'Não foi possível confirmar a operação.',
    requestId: null,
    uncertain: true,
  };
}

export function useOnboarding(enabled: boolean): OnboardingController {
  const [load, setLoad] = useState<OnboardingLoadState>({ snapshot: null, loading: true, refreshing: false, error: null });
  const [operation, setOperation] = useState<OnboardingOperation>(initialOperation);
  const requestSequenceRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const commandInFlightRef = useRef(false);
  const lifecycleRef = useRef(0);
  const contextRef = useRef('');
  contextRef.current = JSON.stringify([load.snapshot?.settings.settings.installation_id, load.snapshot?.settings.settings.account_id]);
  const contextIdentity = contextRef.current;
  useEffect(() => { setOperation(initialOperation()); }, [contextIdentity]);
  useEffect(() => {
    lifecycleRef.current += 1;
    return () => { lifecycleRef.current += 1; };
  }, [enabled]);

  const refresh = useCallback(async (): Promise<OnboardingSnapshot | null> => {
    const requestSequence = ++requestSequenceRef.current;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setLoad((current) => ({ ...current, loading: current.snapshot === null, refreshing: current.snapshot !== null, error: null }));
    try {
      const { data, etag } = await requestJsonWithMetadata<SettingsView>('/api/v1/settings', { signal: controller.signal });
      if (requestSequence !== requestSequenceRef.current) return null;
      if (!etag) throw new Error('O controlador não retornou a revisão da configuração.');
      const snapshot = { settings: data, etag };
      contextRef.current = JSON.stringify([data.settings.installation_id, data.settings.account_id]);
      setLoad({ snapshot, loading: false, refreshing: false, error: null });
      return snapshot;
    } catch (error: unknown) {
      if (requestSequence !== requestSequenceRef.current || error instanceof DOMException && error.name === 'AbortError') return null;
      const http = error instanceof HttpError ? error : null;
      setLoad((current) => ({
        ...current,
        loading: false,
        refreshing: false,
        error: { message: http?.message ?? 'Não foi possível consultar a configuração inicial.', requestId: http?.requestId ?? null },
      }));
      return null;
    } finally {
      if (requestSequence === requestSequenceRef.current) requestControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    const onControllerEvent = (event: Event): void => {
      const detail = (event as CustomEvent<{ event_type?: string }>).detail;
      if (detail?.event_type === 'settings.updated') void refresh();
    };
    const onResync = (): void => void refresh();
    window.addEventListener('factory-controller-event', onControllerEvent);
    window.addEventListener('factory-controller-resync', onResync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('factory-controller-event', onControllerEvent);
      window.removeEventListener('factory-controller-resync', onResync);
      requestSequenceRef.current += 1;
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
    };
  }, [enabled, refresh]);

  const save = useCallback(async (kind: OnboardingCommandKind, body: SettingsUpdate): Promise<void> => {
    const snapshot = load.snapshot;
    if (!enabled || !snapshot || commandInFlightRef.current || operation.status === 'uncertain' || operation.status === 'saving') return;
    const operationId = crypto.randomUUID();
    const lifecycle = lifecycleRef.current;
    const context = contextRef.current;
    const isCurrent = () => lifecycle === lifecycleRef.current && context === contextRef.current;
    const instanceId = getControllerInstanceId();
    if (!instanceId) {
      setOperation({ status: 'failed', kind, message: 'Consulte a configuração novamente antes de salvar.', requestId: null });
      return;
    }
    const requestBody = JSON.stringify(body);
    const path = '/api/v1/settings' as const;
    const request = {
      operationId,
      path,
      method: 'PUT' as const,
      body: requestBody,
      etag: snapshot.etag,
      accountId: snapshot.settings.settings.account_id,
      installationId: snapshot.settings.settings.installation_id,
      instanceId,
    };
    commandInFlightRef.current = true;
    setOperation({ status: 'saving', kind, operationId });
    let requestStarted = false;
    try {
      retainConfigurationSave(request, uncertainKinds[kind]);
      requestStarted = true;
      const { data, etag } = await requestJsonWithMetadata<SettingsSaved>(path, {
        method: 'PUT',
        headers: { 'If-Match': snapshot.etag, 'Idempotency-Key': operationId },
        body: requestBody,
      });
      if (data.operation_id !== operationId || !data.receipt || !etag) throw new Error('O controlador não confirmou a operação com o recibo e a revisão esperados.');
      finishConfigurationSave(operationId);
      if (!isCurrent()) return;
      requestSequenceRef.current += 1;
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
      setLoad({ snapshot: { settings: data, etag }, loading: false, refreshing: false, error: null });
      setOperation({ status: 'confirmed', kind, operationId, receipt: data.receipt });
    } catch (error: unknown) {
      const details = errorDetails(error);
      if (!isCurrent()) return;
      if (requestStarted && details.uncertain) {
        setOperation({ status: 'uncertain', kind, operationId, message: 'A resposta não foi confirmada. Consulte a operação original antes de qualquer novo comando.', recoveryError: null, canResend: false });
      } else {
        finishConfigurationSave(operationId);
        setOperation({ status: 'failed', kind, message: details.message, requestId: details.requestId });
        if (error instanceof HttpError && error.status === 412) void refresh();
      }
    } finally {
      commandInFlightRef.current = false;
    }
  }, [enabled, load.snapshot, operation.status, refresh]);

  const saveProjectsRoot = useCallback(async (path: string): Promise<void> => {
    const normalized = path.trim();
    if (!normalized) {
      setOperation({ status: 'failed', kind: 'projects-root', message: 'Escolha uma pasta antes de salvá-la.', requestId: null });
      return;
    }
    await save('projects-root', { changes: { projects_root: normalized } });
  }, [save]);

  const complete = useCallback(async (): Promise<void> => {
    await save('complete', { changes: {}, onboarding_changes: { complete: true } });
  }, [save]);

  const suppress = useCallback(async (): Promise<void> => {
    await save('suppress', { changes: {}, onboarding_changes: { suppressed: true } });
  }, [save]);

  const saveTool = useCallback(async (tool: 'git' | 'maestri' | 'omp' | 'powershell' | 'gh', path: string): Promise<void> => {
    const preferences = load.snapshot?.settings.tool_preferences;
    if (!preferences || !path.trim()) return;
    await save('tools', tool === 'gh' ? { changes: {}, gh_executable_path: path.trim() } : {
      changes: {}, tool_preferences: { ...preferences, [tool]: { ...preferences[tool], preferred_path: path.trim() } },
    });
  }, [load.snapshot, save]);

  const recover = useCallback(async (resend = false): Promise<void> => {
    if (operation.status !== 'uncertain' || commandInFlightRef.current) return;
    commandInFlightRef.current = true;
    const lifecycle = lifecycleRef.current;
    const context = contextRef.current;
    const isCurrent = () => lifecycle === lifecycleRef.current && context === contextRef.current;
    setOperation((current) => current.status === 'uncertain' ? { ...current, recoveryError: null } : current);
    try {
      if (resend) {
        const saved = await resendConfigurationSave<SettingsSaved>(operation.operationId);
        if (!isCurrent()) return;
        if (saved.data.operation_id !== operation.operationId || !saved.data.receipt || !saved.etag) throw new Error('A reapresentação não confirmou o recibo original.');
        finishConfigurationSave(operation.operationId);
        requestSequenceRef.current += 1;
        requestControllerRef.current?.abort();
        requestControllerRef.current = null;
        setLoad({ snapshot: { settings: saved.data, etag: saved.etag }, loading: false, refreshing: false, error: null });
        setOperation({ status: 'confirmed', kind: operation.kind, operationId: operation.operationId, receipt: saved.data.receipt });
        return;
      }
      const result = await consultConfigurationSave(operation.operationId);
      if (!isCurrent()) return;
      if (!result) {
        const canResend = hasOriginalConfigurationSave(operation.operationId);
        setOperation({ ...operation, canResend, recoveryError: 'A operação não foi localizada. Isso não confirma que a gravação deixou de ocorrer.' });
        return;
      }
      if (result.state === 'succeeded' && result.receipt) {
        finishConfigurationSave(operation.operationId);
        setOperation({ status: 'confirmed', kind: operation.kind, operationId: operation.operationId, receipt: result.receipt });
        await refresh();
      } else if (result.state === 'failed') {
        finishConfigurationSave(operation.operationId);
        setOperation({ status: 'failed', kind: operation.kind, message: result.error?.message ?? 'O controlador confirmou que a operação falhou.', requestId: result.request_id });
      } else {
        setOperation({ ...operation, recoveryError: `A operação permanece ${result.state}. Consulte novamente antes de enviar outro comando.` });
      }
    } catch (error: unknown) {
      if (!isCurrent()) return;
      const details = errorDetails(error);
      setOperation({ ...operation, recoveryError: details.message });
    } finally {
      commandInFlightRef.current = false;
    }
  }, [operation, refresh]);

  return { load, operation, busy: commandInFlightRef.current || operation.status === 'saving', refresh, saveProjectsRoot, complete, suppress, saveTool, recover };
}
