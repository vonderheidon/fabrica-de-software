import { useCallback, useEffect, useState } from 'react';
import type { HttpOperationSummary as OperationSummary } from '#contracts';
import { HttpError, requestJson } from '../../api/http.js';
import { useAppliedObservation } from '../../app/applied-observations.js';

export type OperationLoad = {
  data: OperationSummary | null;
  loading: boolean;
  refreshing: boolean;
  stale: boolean;
  error: string | null;
  requestId: string | null;
  errorCode: string | null;
  errorFacts: Readonly<Record<string, string | number | boolean | null>> | null;
  affectedRequirements: readonly string[];
};

export function useOperation(enabled: boolean) {
  const [reloadKey, setReloadKey] = useState(0);
  const [load, setLoad] = useState<OperationLoad>({ data: null, loading: true, refreshing: false, stale: false, error: null, requestId: null, errorCode: null, errorFacts: null, affectedRequirements: [] });
  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);
  useAppliedObservation(enabled, load.loading || load.refreshing, Boolean(load.error), load);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const controller = new AbortController();
    setLoad((current) => ({ ...current, loading: current.data === null, refreshing: current.data !== null, stale: current.data !== null }));
    void requestJson<OperationSummary>('/api/v1/operation', { signal: controller.signal }).then((data) => {
      if (active) setLoad({ data, loading: false, refreshing: false, stale: false, error: null, requestId: null, errorCode: null, errorFacts: null, affectedRequirements: [] });
    }).catch((error: unknown) => {
      if (!active || (error instanceof DOMException && error.name === 'AbortError')) return;
      setLoad((current) => ({ ...current, loading: false, refreshing: false, stale: current.data !== null,
        error: error instanceof HttpError ? error.message : 'Não foi possível consultar o resumo da operação.',
        requestId: error instanceof HttpError ? error.requestId : null,
        errorCode: error instanceof HttpError ? error.code : null,
        errorFacts: error instanceof HttpError ? error.facts : null,
        affectedRequirements: error instanceof HttpError ? error.affectedRequirements : [] }));
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
  }, [enabled, load.data?.event_cursor, refresh]);

  return { ...load, refresh };
}
