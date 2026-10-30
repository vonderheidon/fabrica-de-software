import { useCallback, useEffect, useRef, useState } from 'react';
import type { HttpQueueObservation as QueueObservation } from '#contracts';
import { queueQuery } from '../../api/observation-requests.js';
import { HttpError, requestJsonWithMetadata } from '../../api/http.js';
import { useAppliedObservation } from '../../app/applied-observations.js';

const EVENT_COALESCE_MS = 250;
const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_BACKOFF_MAX_MS = 60_000;
type RefreshKind = 'poll' | 'event' | 'manual';
type QueueFailure = { message: string; requestId: string | null };
export type QueueLoad =
  | { status: 'loading'; observation: QueueObservation | null; etag: string | null; previousError: QueueFailure | null }
  | { status: 'ready'; observation: QueueObservation; etag: string | null }
  | { status: 'error'; observation: QueueObservation | null; etag: string | null; message: string; requestId: string | null };

export function useQueue(projectId: string | null, enabled: boolean) {
  const [load, setLoad] = useState<QueueLoad>({ status: 'loading', observation: null, etag: null, previousError: null });
  const loadRef = useRef(load);
  const [reloadKey, setReloadKey] = useState(0);
  const [retryAtMs, setRetryAtMs] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<string | null>>([]);
  const [pageNotice, setPageNotice] = useState('');
  const version = useRef(0);
  const readFailures = useRef(0);
  const requestActive = useRef(false);
  const requestScheduled = useRef(false);
  const pendingEvent = useRef(false);
  const retryAt = useRef(0);
  const refreshTimer = useRef<number | undefined>();
  const refreshTimerKind = useRef<RefreshKind | null>(null);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimer.current !== undefined) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = undefined;
    refreshTimerKind.current = null;
  }, []);

  const scheduleRefresh = useCallback((dueAtMs: number, kind: RefreshKind) => {
    if (!enabled) return;
    if (requestActive.current || requestScheduled.current) {
      if (kind === 'event' && requestActive.current) pendingEvent.current = true;
      return;
    }
    const scheduledKind = refreshTimerKind.current;
    if (scheduledKind === 'manual' || (scheduledKind === 'event' && kind !== 'manual')) return;
    clearRefreshTimer();
    refreshTimerKind.current = kind;

    const arm = (atMs: number): void => {
      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = undefined;
        refreshTimerKind.current = null;
        if (!enabled) return;
        if (requestActive.current || requestScheduled.current) {
          if (kind === 'event' && requestActive.current) pendingEvent.current = true;
          return;
        }
        const cooldown = retryAt.current - Date.now();
        if (cooldown > 0) {
          refreshTimerKind.current = 'poll';
          arm(retryAt.current);
          return;
        }
        requestScheduled.current = true;
        pendingEvent.current = false;
        setReloadKey((current) => current + 1);
      }, Math.max(0, atMs - Date.now()));
    };
    arm(Math.max(dueAtMs, retryAt.current));
  }, [clearRefreshTimer, enabled]);

  const refresh = useCallback(() => {
    if (!enabled || Date.now() < retryAt.current || requestActive.current || requestScheduled.current) return;
    scheduleRefresh(Date.now(), 'manual');
  }, [enabled, scheduleRefresh]);

  const onUpdated = useCallback(() => {
    if (!enabled || Date.now() < retryAt.current) return;
    if (requestActive.current) {
      pendingEvent.current = true;
      return;
    }
    if (requestScheduled.current) return;
    scheduleRefresh(Date.now() + EVENT_COALESCE_MS, 'event');
  }, [enabled, scheduleRefresh]);

  useAppliedObservation(enabled, load.status === 'loading', load.status === 'error', load);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('factory-queue-updated', onUpdated);
    window.addEventListener('factory-controller-event', onUpdated);
    window.addEventListener('factory-controller-resync', onUpdated);
    return () => {
      window.removeEventListener('factory-queue-updated', onUpdated);
      window.removeEventListener('factory-controller-event', onUpdated);
      window.removeEventListener('factory-controller-resync', onUpdated);
    };
  }, [enabled, onUpdated]);

  useEffect(() => {
    if (enabled) return;
    clearRefreshTimer();
    pendingEvent.current = false;
    requestScheduled.current = false;
  }, [clearRefreshTimer, enabled]);

  useEffect(() => () => clearRefreshTimer(), [clearRefreshTimer]);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => {
    if (!enabled) return;
    clearRefreshTimer();
    requestScheduled.current = false;
    if (Date.now() < retryAt.current) {
      scheduleRefresh(retryAt.current, 'poll');
      return;
    }

    let active = true;
    const controller = new AbortController();
    const currentVersion = ++version.current;
    const previousLoad = loadRef.current;
    requestActive.current = true;
    setLoad((current) => ({ status: 'loading', observation: current.observation, etag: current.etag,
      previousError: current.status === 'error' ? { message: current.message, requestId: current.requestId } : current.status === 'loading' ? current.previousError : null }));
    const query = queueQuery(projectId, cursor);
    requestJsonWithMetadata<QueueObservation>(`/api/v1/queue?${query}`, { signal: controller.signal }).then(({ data, etag }) => {
      if (!active || currentVersion !== version.current) return;
      requestActive.current = false;
      readFailures.current = 0;
      const remoteRetryAt = data.polling.retry_at_ms ?? 0;
      retryAt.current = remoteRetryAt;
      setRetryAtMs(remoteRetryAt > Date.now() ? remoteRetryAt : null);
      setLoad({ status: 'ready', observation: data, etag });

      const nextPollAt = Math.max(data.polling.next_poll_at_ms, remoteRetryAt);
      if (pendingEvent.current && remoteRetryAt <= Date.now()) {
        pendingEvent.current = false;
        scheduleRefresh(Date.now() + EVENT_COALESCE_MS, 'event');
      } else {
        pendingEvent.current = false;
        scheduleRefresh(nextPollAt, 'poll');
      }
    }).catch((error: unknown) => {
      if (!active || currentVersion !== version.current || (error instanceof DOMException && error.name === 'AbortError')) return;
      requestActive.current = false;
      if (cursor && error instanceof HttpError && error.status === 409) {
        setPageNotice('A ordem ou o conjunto da fila mudou. A consulta foi reiniciada na primeira página; a seleção continua vinculada aos IDs observados.');
        setHistory([]);
        setCursor(null);
        setLoad((current) => current.observation
          ? { status: 'ready', observation: current.observation, etag: current.etag }
          : { status: 'error', observation: null, etag: current.etag, message: error.message, requestId: error.requestId });
        return;
      }
      readFailures.current = Math.min(readFailures.current + 1, 6);
      const interval = previousLoad.observation?.polling.interval_ms ?? DEFAULT_POLL_INTERVAL_MS;
      const maximum = previousLoad.observation?.polling.backoff_max_ms ?? DEFAULT_BACKOFF_MAX_MS;
      const localRetryAt = Date.now() + Math.min(maximum, interval * 2 ** readFailures.current);
      const nextRetryAt = Math.max(localRetryAt, previousLoad.observation?.polling.retry_at_ms ?? 0);
      retryAt.current = nextRetryAt;
      setRetryAtMs(nextRetryAt);
      pendingEvent.current = false;
      setLoad((current) => ({ status: 'error', observation: current.observation, etag: current.etag,
        message: error instanceof HttpError ? error.message : 'Não foi possível consultar a fila.',
        requestId: error instanceof HttpError ? error.requestId : null }));
      scheduleRefresh(nextRetryAt, 'poll');
    });
    return () => {
      active = false;
      controller.abort();
      if (currentVersion === version.current) requestActive.current = false;
    };
  }, [clearRefreshTimer, cursor, enabled, projectId, reloadKey, scheduleRefresh]);

  const nextPage = useCallback(() => {
    const observation = load.observation;
    const nextCursor = observation?.page.next_cursor;
    if (!nextCursor || observation.page.has_more !== true) return;
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
  const resetPages = useCallback(() => {
    setHistory([]);
    setPageNotice('');
    if (cursor === null) refresh();
    else setCursor(null);
  }, [cursor, refresh]);

  return { load, refresh, nextPage, previousPage, resetPages, pageNotice, canGoBack: history.length > 0,
    retryAtMs, canRefresh: enabled && load.status !== 'loading' && (retryAtMs === null || Date.now() >= retryAtMs) };
}
