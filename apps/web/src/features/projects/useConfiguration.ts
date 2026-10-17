import { useEffect, useRef, useState } from 'react';
import type { ConfigurationView, SettingsView } from '#contracts';
import { HttpError, requestJsonWithMetadata } from '../../api/http.js';

export type EditableConfigurationView = SettingsView | ConfigurationView;
export type ConfigurationLoadState =
  | { status: 'loading'; identity: string }
  | { status: 'error'; identity: string; message: string; requestId: string | null }
  | { status: 'ready'; identity: string; view: EditableConfigurationView; etag: string };

export function useConfiguration(projectId: string | null) {
  const identity = projectId ?? 'global-settings';
  const [load, setLoad] = useState<ConfigurationLoadState>({ status: 'loading', identity });
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshError, setRefreshError] = useState<{ message: string; requestId: string | null } | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const priorReady = loadRef.current.status === 'ready' && loadRef.current.identity === identity;
    if (!priorReady) setLoad({ status: 'loading', identity });
    const path = projectId ? `/api/v1/projects/${encodeURIComponent(projectId)}/configuration` as const : '/api/v1/settings' as const;
    requestJsonWithMetadata<EditableConfigurationView>(path, { signal: controller.signal }).then(({ data, etag }) => {
      if (!active) return;
      setRefreshError(null);
      if (!etag) { setLoad({ status: 'error', identity, message: 'O controlador não retornou a revisão necessária para salvar.', requestId: null }); return; }
      setLoad({ status: 'ready', identity, view: data, etag });
    }).catch((error: unknown) => {
      if (!active || (error instanceof DOMException && error.name === 'AbortError')) return;
      const http = error instanceof HttpError ? error : null;
      if (priorReady) setRefreshError({ message: http?.message ?? 'Não foi possível atualizar a configuração.', requestId: http?.requestId ?? null });
      else setLoad({ status: 'error', identity, message: http?.message ?? 'Não foi possível carregar a configuração.', requestId: http?.requestId ?? null });
    });
    return () => { active = false; controller.abort(); };
  }, [identity, projectId, reloadKey]);

  useEffect(() => {
    const onEvent = (event: Event): void => {
      const detail = (event as CustomEvent<{ eventType?: string; projectId?: string }>).detail;
      if (detail?.eventType === 'settings.updated' || detail?.eventType === 'project.configuration.updated' && detail.projectId === projectId) setReloadKey((value) => value + 1);
    };
    const onResync = (): void => setReloadKey((value) => value + 1);
    window.addEventListener('factory-controller-event', onEvent);
    window.addEventListener('factory-controller-resync', onResync);
    return () => {
      window.removeEventListener('factory-controller-event', onEvent);
      window.removeEventListener('factory-controller-resync', onResync);
    };
  }, [projectId]);

  return { load, setLoad, retry: () => setReloadKey((value) => value + 1), identity, refreshError, clearRefreshError: () => setRefreshError(null) };
}
