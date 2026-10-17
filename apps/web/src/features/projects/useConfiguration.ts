import { useEffect, useState } from 'react';
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

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoad({ status: 'loading', identity });
    const path = projectId ? `/api/v1/projects/${encodeURIComponent(projectId)}/configuration` as const : '/api/v1/settings' as const;
    requestJsonWithMetadata<EditableConfigurationView>(path, { signal: controller.signal }).then(({ data, etag }) => {
      if (!active) return;
      if (!etag) { setLoad({ status: 'error', identity, message: 'O controlador não retornou a revisão necessária para salvar.', requestId: null }); return; }
      setLoad({ status: 'ready', identity, view: data, etag });
    }).catch((error: unknown) => {
      if (!active || (error instanceof DOMException && error.name === 'AbortError')) return;
      const http = error instanceof HttpError ? error : null;
      setLoad({ status: 'error', identity, message: http?.message ?? 'Não foi possível carregar a configuração.', requestId: http?.requestId ?? null });
    });
    return () => { active = false; controller.abort(); };
  }, [identity, projectId, reloadKey]);

  return { load, setLoad, retry: () => setReloadKey((value) => value + 1), identity };
}
