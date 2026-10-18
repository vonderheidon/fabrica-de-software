import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HttpEventPage as EventPage } from '#contracts';
import { eventListQuery } from '../../api/observation-requests.js';
import { HttpError, requestJson } from '../../api/http.js';

export type RecordFilters = { projectId: string; attemptId: string; operationId: string };
type PageRequest = { cursor: string | null; index: number; stack: Array<string | null>; serial: number };
type RecordState = { page: EventPage | null; loading: boolean; refreshing: boolean; stale: boolean; error: string | null; requestId: string | null; emptyKind: 'none' | 'no-events' | 'no-matches' | 'unknown' };

export function useRecords(filters: RecordFilters) {
  const [request, setRequest] = useState<PageRequest>({ cursor: null, index: 0, stack: [null], serial: 0 });
  const committed = useRef<PageRequest>({ cursor: null, index: 0, stack: [null], serial: 0 });
  const [state, setState] = useState<RecordState>({ page: null, loading: true, refreshing: false, stale: false, error: null, requestId: null, emptyKind: 'none' });
  const filterKey = JSON.stringify([filters.projectId, filters.attemptId, filters.operationId]);
  const stableFilters = useMemo(() => filters, [filterKey]);

  const refresh = useCallback(() => {
    const current = committed.current;
    setRequest({ ...current, serial: current.serial + 1 });
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const hasFilter = Boolean(stableFilters.projectId || stableFilters.attemptId || stableFilters.operationId);
    setState((current) => ({ ...current, loading: current.page === null, refreshing: current.page !== null, stale: current.page !== null }));
    void requestJson<EventPage>(`/api/v1/events?${eventListQuery(stableFilters, request.cursor)}`, { signal: controller.signal }).then(async (page) => {
      let emptyKind: RecordState['emptyKind'] = 'none';
      if (page.items.length === 0) {
        if (!hasFilter) emptyKind = 'no-events';
        else {
          try {
            const unfiltered = await requestJson<EventPage>('/api/v1/events?limit=1', { signal: controller.signal });
            emptyKind = unfiltered.items.length === 0 ? 'no-events' : 'no-matches';
          } catch {
            emptyKind = 'unknown';
          }
        }
      }
      if (!active) return;
      committed.current = request;
      setState({ page, loading: false, refreshing: false, stale: false, error: null, requestId: null, emptyKind });
    }).catch((error: unknown) => {
      if (!active || (error instanceof DOMException && error.name === 'AbortError')) return;
      setState((current) => ({ ...current, loading: false, refreshing: false, stale: current.page !== null,
        error: error instanceof HttpError ? error.message : 'Não foi possível consultar os registros.',
        requestId: error instanceof HttpError ? error.requestId : null }));
    });
    return () => { active = false; controller.abort(); };
  }, [filterKey, stableFilters, request]);

  useEffect(() => {
    const onChange = (): void => refresh();
    window.addEventListener('factory-controller-event', onChange);
    window.addEventListener('factory-controller-resync', onChange);
    return () => {
      window.removeEventListener('factory-controller-event', onChange);
      window.removeEventListener('factory-controller-resync', onChange);
    };
  }, [refresh]);

  function nextPage(): void {
    const nextCursor = state.page?.next_cursor;
    if (!state.page?.has_more || !nextCursor || state.loading || state.refreshing) return;
    setRequest({ cursor: nextCursor, index: committed.current.index + 1, stack: [...committed.current.stack, committed.current.cursor], serial: request.serial + 1 });
  }

  function previousPage(): void {
    if (committed.current.index === 0 || state.loading || state.refreshing) return;
    const previous = committed.current.stack[committed.current.index];
    setRequest({ cursor: previous ?? null, index: committed.current.index - 1, stack: committed.current.stack.slice(0, -1), serial: request.serial + 1 });
  }

  return { ...state, pageIndex: committed.current.index, refresh, nextPage, previousPage, canGoBack: committed.current.index > 0 };
}
