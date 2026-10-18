import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectPage } from '#contracts';
import { HttpError, requestJson } from '../../api/http.js';

type ProjectsState = {
  page: ProjectPage | null;
  loading: boolean;
  error: { message: string; requestId: string | null } | null;
};

export function useProjects(search: string, enabled = true) {
  const [state, setState] = useState<ProjectsState>({ page: null, loading: true, error: null });
  const [reload, setReload] = useState(0);
  const requestVersion = useRef(0);
  const query = search.trim();

  useEffect(() => {
    const version = ++requestVersion.current;
    if (!enabled) { setState({ page: null, loading: false, error: null }); return; }
    let active = true;
    const controller = new AbortController();
    setState({ page: null, loading: true, error: null });
    const params = new URLSearchParams({ limit: '25' });
    if (query) params.set('search', query);
    requestJson<ProjectPage>(`/api/v1/projects?${params.toString()}`, { signal: controller.signal }).then((page) => {
      if (active && requestVersion.current === version) setState({ page, loading: false, error: null });
    }).catch((error: unknown) => {
      if (!active || requestVersion.current !== version || (error instanceof DOMException && error.name === 'AbortError')) return;
      setState({ page: null, loading: false, error: {
        message: error instanceof HttpError ? error.message : 'Não foi possível consultar o catálogo de projetos.',
        requestId: error instanceof HttpError ? error.requestId : null,
      } });
    });
    return () => { active = false; controller.abort(); };
  }, [enabled, query, reload]);

  const loadMore = useCallback(async () => {
    const current = state.page;
    if (!current?.next_cursor || state.loading) return;
    const version = requestVersion.current;
    setState((value) => ({ ...value, loading: true, error: null }));
    const params = new URLSearchParams({ cursor: current.next_cursor, limit: '25' });
    if (query) params.set('search', query);
    try {
      const next = await requestJson<ProjectPage>(`/api/v1/projects?${params.toString()}`);
      if (requestVersion.current !== version) return;
      setState((value) => ({ page: value.page ? { ...next, items: [...value.page.items, ...next.items] } : next, loading: false, error: null }));
    } catch (error: unknown) {
      if (requestVersion.current !== version) return;
      setState((value) => ({ ...value, loading: false, error: {
        message: error instanceof HttpError ? error.message : 'Não foi possível carregar a próxima página.',
        requestId: error instanceof HttpError ? error.requestId : null,
      } }));
    }
  }, [query, state.loading, state.page]);

  return { ...state, retry: () => setReload((value) => value + 1), loadMore };
}
