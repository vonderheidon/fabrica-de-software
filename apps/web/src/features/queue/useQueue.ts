import { useCallback, useEffect, useRef, useState } from 'react';
import type { QueueObservation } from '#contracts';
import { HttpError, requestJsonWithMetadata } from '../../api/http.js';

export type QueueLoad =
  | { status: 'loading'; observation: QueueObservation | null; etag: string | null }
  | { status: 'ready'; observation: QueueObservation; etag: string | null }
  | { status: 'error'; observation: QueueObservation | null; etag: string | null; message: string; requestId: string | null };

export function useQueue(projectId: string | null, enabled: boolean) {
  const [load, setLoad] = useState<QueueLoad>({ status: 'loading', observation: null, etag: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<string | null>>([]);
  const version = useRef(0);
  const readFailures = useRef(0);
  const refresh = useCallback(() => setReloadKey((current) => current + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const controller = new AbortController();
    const currentVersion = ++version.current;
    setLoad((current) => ({ status: 'loading', observation: current.observation, etag: current.etag }));
    const params = new URLSearchParams({ limit: '25' });
    if (projectId) params.set('projectId', projectId);
    if (cursor) params.set('cursor', cursor);
    requestJsonWithMetadata<QueueObservation>(`/api/v1/queue?${params.toString()}`, { signal: controller.signal }).then(({ data, etag }) => {
      if (active && currentVersion === version.current) {
        readFailures.current = 0;
        setLoad({ status: 'ready', observation: data, etag });
      }
    }).catch((error: unknown) => {
      if (!active || currentVersion !== version.current || (error instanceof DOMException && error.name === 'AbortError')) return;
      readFailures.current = Math.min(readFailures.current + 1, 6);
      setLoad((current) => ({ status: 'error', observation: current.observation, etag: current.etag,
        message: error instanceof HttpError ? error.message : 'Não foi possível consultar a fila.',
        requestId: error instanceof HttpError ? error.requestId : null }));
    });
    return () => { active = false; controller.abort(); };
  }, [cursor, enabled, projectId, reloadKey]);

  useEffect(() => {
    if (!enabled) return;
    const onUpdated = (): void => refresh();
    window.addEventListener('factory-queue-updated', onUpdated);
    const polling = load.observation?.polling;
    const delay = load.status === 'ready' && polling ? Math.max(1, polling.nextPollAtMs - Date.now())
      : Math.min(polling?.backoffMaxMs ?? 60_000, (polling?.intervalMs ?? 15_000) * 2 ** readFailures.current);
    const timer = load.status === 'loading' ? undefined : window.setTimeout(refresh, Math.min(delay, 2_147_483_647));
    return () => { window.clearTimeout(timer); window.removeEventListener('factory-queue-updated', onUpdated); };
  }, [enabled, refresh, load.status, load.observation]);

  const nextPage = useCallback(() => {
    const observation = load.observation;
    const nextCursor = observation?.page.nextCursor;
    if (!nextCursor || observation.page.hasMore !== true) return;
    setHistory((current) => [...current, cursor]);
    setCursor(nextCursor);
  }, [cursor, load.observation]);
  const previousPage = useCallback(() => {
    setHistory((current) => {
      if (!current.length) return current;
      const next = current.slice(0, -1);
      setCursor(current[current.length - 1] ?? null);
      return next;
    });
  }, []);
  const resetPages = useCallback(() => { setHistory([]); setCursor(null); refresh(); }, [refresh]);

  return { load, refresh, nextPage, previousPage, resetPages, canGoBack: history.length > 0 };
}
