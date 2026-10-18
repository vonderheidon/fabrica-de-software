import { useCallback, useEffect, useState } from 'react';
import type { HttpAttemptPage as AttemptPage, HttpAttemptSummary as AttemptSummary } from '#contracts';
import { HttpError, requestJson } from '../../api/http.js';

type ActiveAttemptLoad = {
  data: AttemptSummary | null;
  loading: boolean;
  refreshing: boolean;
  stale: boolean;
  error: string | null;
  requestId: string | null;
  valid: boolean;
};

export function useActiveAttempt(enabled: boolean) {
  const [reloadKey, setReloadKey] = useState(0);
  const [load, setLoad] = useState<ActiveAttemptLoad>({ data: null, loading: true, refreshing: false, stale: false, error: null, requestId: null, valid: false });
  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const controller = new AbortController();
    setLoad((current) => ({ ...current, loading: current.data === null, refreshing: current.data !== null, stale: current.data !== null }));
    void requestJson<AttemptPage>('/api/v1/attempts?result=active&limit=1', { signal: controller.signal }).then((page) => {
      if (active) setLoad({ data: page.items[0] ?? null, loading: false, refreshing: false, stale: false, error: null, requestId: null, valid: true });
    }).catch((error: unknown) => {
      if (!active || (error instanceof DOMException && error.name === 'AbortError')) return;
      setLoad((current) => ({ ...current, loading: false, refreshing: false, stale: current.data !== null, valid: false,
        error: error instanceof HttpError ? error.message : 'Não foi possível consultar a tentativa ativa.',
        requestId: error instanceof HttpError ? error.requestId : null }));
    });
    return () => { active = false; controller.abort(); };
  }, [enabled, reloadKey]);

  useEffect(() => {
    if (!enabled) return;
    const onChange = (): void => refresh();
    window.addEventListener('factory-controller-event', onChange);
    window.addEventListener('factory-controller-resync', onChange);
    const timer = window.setTimeout(refresh, 15_000);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('factory-controller-event', onChange);
      window.removeEventListener('factory-controller-resync', onChange);
    };
  }, [enabled, load.data?.revision, refresh]);

  return { ...load, refresh };
}
