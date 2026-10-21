import { rememberProjectDeletion } from './ProjectDeletionPendingNotice.js';
import { useEffect, useRef, useState } from 'react';
import type { ControllerEventNotice } from '../../app/useControllerEvents.js';
import type { ConfigurationView, SettingsView } from '#contracts';
import { HttpError, requestJsonWithMetadata } from '../../api/http.js';
import { isProjectDeletionCompleted } from '../../api/project-deletion.js';

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
    const onCompleted = () => {
      if (projectId && isProjectDeletionCompleted(projectId)) {
        setLoad({ status: 'error', identity, message: 'Este cadastro foi excluído. Volte à lista de projetos.', requestId: null });
        setRefreshError(null);
      }
    };
    window.addEventListener('factory-project-deleted', onCompleted);
    return () => window.removeEventListener('factory-project-deleted', onCompleted);
  }, [identity, projectId]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const priorReady = loadRef.current.status === 'ready' && loadRef.current.identity === identity;
    if (!priorReady) setLoad({ status: 'loading', identity });
    const path = projectId ? `/api/v1/projects/${encodeURIComponent(projectId)}/configuration` as const : '/api/v1/settings' as const;
    requestJsonWithMetadata<EditableConfigurationView>(path, { signal: controller.signal }).then(({ data, etag }) => {
      if (!active || projectId && isProjectDeletionCompleted(projectId)) return;
      setRefreshError(null);
      if (!etag) {
        const failure = { message: 'O controlador não retornou a revisão necessária para salvar.', requestId: null };
        if (priorReady) setRefreshError(failure);
        else setLoad({ status: 'error', identity, ...failure });
        return;
      }
      if (projectId && 'deletion' in data) rememberProjectDeletion(projectId, data.deletion);
      setLoad({ status: 'ready', identity, view: data, etag });
    }).catch((error: unknown) => {
      if (!active || projectId && isProjectDeletionCompleted(projectId) || (error instanceof DOMException && error.name === 'AbortError')) return;
      const http = error instanceof HttpError ? error : null;
      if (projectId && http?.status === 404) {
        setRefreshError(null);
        setLoad({ status: 'error', identity, message: 'O projeto selecionado não está disponível.', requestId: http.requestId });
        window.dispatchEvent(new CustomEvent('factory-project-unavailable', { detail: { projectId } }));
        return;
      }
      if (priorReady) setRefreshError({ message: http?.message ?? 'Não foi possível atualizar a configuração.', requestId: http?.requestId ?? null });
      else setLoad({ status: 'error', identity, message: http?.message ?? 'Não foi possível carregar a configuração.', requestId: http?.requestId ?? null });
    });
    return () => { active = false; controller.abort(); };
  }, [identity, projectId, reloadKey]);

  useEffect(() => {
    const onEvent = (event: Event): void => {
      const detail = (event as CustomEvent<Partial<ControllerEventNotice>>).detail;
      if (detail?.project_id === projectId || detail?.event_type === 'settings.updated' || detail?.event_type === 'project.configuration.updated' && detail.project_id === projectId) setReloadKey((value) => value + 1);
    };
    const onResync = (): void => setReloadKey((value) => value + 1);
    window.addEventListener('factory-controller-event', onEvent);
    window.addEventListener('factory-controller-resync', onResync);
    return () => {
      window.removeEventListener('factory-controller-event', onEvent);
      window.removeEventListener('factory-controller-resync', onResync);
    };
  }, [projectId]);

  const visibleLoad: ConfigurationLoadState = projectId && isProjectDeletionCompleted(projectId)
    ? { status: 'error', identity, message: 'Este cadastro foi excluído. Volte à lista de projetos.', requestId: null } : load;
  return { load: visibleLoad, setLoad, retry: () => setReloadKey((value) => value + 1), identity, refreshError, clearRefreshError: () => setRefreshError(null) };
}
