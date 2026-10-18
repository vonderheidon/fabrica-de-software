import { useEffect, useState } from 'react';
import type { HttpAttemptPage as AttemptPage } from '#contracts';
import { HttpError, requestJsonWithMetadata } from '../../api/http.js';
import type { ControllerEventNotice } from '../../app/useControllerEvents.js';
import { setAttemptProjectFilter } from './execution-requests.js';

type Props = {
  projectId: string;
  result: string;
  onFilterChange: (projectId: string, result: string) => void;
  onPrepareRetry: (attemptId: string, projectId: string) => void;
  onDetail: (attemptId: string, projectId: string) => void;
};
type ListState = { page: AttemptPage | null; error: string | null; requestId: string | null; loading: boolean };

const resultOptions = [
  { value: '', label: 'Todos os resultados' },
  { value: 'active', label: 'Em andamento' },
  { value: 'delivered', label: 'Entregue' },
  { value: 'rejected', label: 'Rejeitada' },
  { value: 'failed', label: 'Falha' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'interrupted', label: 'Interrompida' },
] as const;

export function AttemptListPanel({ projectId, result, onFilterChange, onPrepareRetry, onDetail }: Props) {
  const [projectDraft, setProjectDraft] = useState(projectId);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [visiblePageIndex, setVisiblePageIndex] = useState(0);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<ListState>({ page: null, error: null, requestId: null, loading: true });
  const cursor = cursorStack[pageIndex] ?? null;

  useEffect(() => { setProjectDraft(projectId); }, [projectId]);

  useEffect(() => {
    const onControllerEvent = (event: Event): void => {
      const notice = (event as CustomEvent<ControllerEventNotice>).detail;
      if (!notice) return;
      const changedAttemptId = notice.attempt_id ?? (notice.entity.type === 'attempt' ? notice.entity.id : null);
      if (!changedAttemptId) return;
      const currentPageContainsAttempt = state.page?.items.some((attempt) => attempt.id === changedAttemptId) ?? false;
      const matchesProject = !projectId || notice.project_id === projectId || currentPageContainsAttempt;
      if (matchesProject) setReload((current) => current + 1);
    };
    const onResync = (): void => { setReload((current) => current + 1); };
    window.addEventListener('factory-controller-event', onControllerEvent);
    window.addEventListener('factory-controller-resync', onResync);
    return () => {
      window.removeEventListener('factory-controller-event', onControllerEvent);
      window.removeEventListener('factory-controller-resync', onResync);
    };
  }, [projectId, state.page]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const query = new URLSearchParams({ limit: '25' });
    setAttemptProjectFilter(query, projectId);
    if (result) query.set('result', result);
    if (cursor) query.set('cursor', cursor);
    setState((current) => ({ ...current, error: null, requestId: null, loading: true }));
    void requestJsonWithMetadata<AttemptPage>(`/api/v1/attempts?${query}`, { signal: controller.signal }).then(({ data }) => {
      if (active) { setState({ page: data, error: null, requestId: null, loading: false }); setVisiblePageIndex(pageIndex); }
    }).catch((reason: unknown) => {
      if (!active || (reason instanceof DOMException && reason.name === 'AbortError')) return;
      setState((current) => ({ ...current, error: reason instanceof HttpError ? reason.message : 'Não foi possível consultar as tentativas.', requestId: reason instanceof HttpError ? reason.requestId : null, loading: false }));
    });
    return () => { active = false; controller.abort(); };
  }, [projectId, result, cursor, reload, pageIndex]);

  function nextPage(): void {
    const nextCursor = state.page?.next_cursor;
    if (!state.page?.has_more || !nextCursor || state.loading) return;
    setCursorStack((current) => current[visiblePageIndex + 1] === nextCursor ? current.slice(0, visiblePageIndex + 2) : [...current.slice(0, visiblePageIndex + 1), nextCursor]);
    setPageIndex(visiblePageIndex + 1);
  }

  function previousPage(): void {
    if (visiblePageIndex === 0 || state.loading) return;
    setPageIndex(visiblePageIndex - 1);
  }

  function applyProjectFilter(): void {
    const normalized = projectDraft.trim();
    if (normalized !== projectId) onFilterChange(normalized, result);
  }

  const page = state.page;
  return <section className="attempt-list-panel" aria-label="Histórico de tentativas">
    <div className="attempt-filters card">
      <label htmlFor="attempt-project-filter">Projeto <span className="muted">ID</span>
        <input id="attempt-project-filter" value={projectDraft} maxLength={256} onChange={(event) => setProjectDraft(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') applyProjectFilter(); }} placeholder="Todos os projetos" />
      </label>
      <label htmlFor="attempt-result-filter">Resultado
        <select id="attempt-result-filter" value={result} onChange={(event) => onFilterChange(projectId, event.currentTarget.value)}>
          {resultOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <div className="attempt-filter-actions"><button type="button" onClick={applyProjectFilter} disabled={projectDraft.trim() === projectId}>Aplicar projeto</button><button type="button" onClick={() => setReload((current) => current + 1)} disabled={state.loading}>Atualizar</button></div>
    </div>

    {state.error && <div className="queue-error" role="alert"><h2>{page ? 'Não foi possível abrir a próxima página' : 'Falha ao consultar o histórico'}</h2><p>{state.error}</p>{state.requestId && <p className="mono muted">Solicitação {state.requestId}</p>}<button type="button" onClick={() => setReload((current) => current + 1)} disabled={state.loading}>Tentar novamente</button></div>}
    {!page && state.loading && <section className="card read-state" role="status"><p>Consultando histórico de tentativas…</p></section>}
    {page && page.items.length === 0 && <section className="card empty" role="status"><h2>{projectId || result ? 'Nenhuma tentativa corresponde aos filtros' : 'Nenhuma tentativa registrada'}</h2><p>{projectId || result ? 'Ajuste os filtros para consultar outras tentativas.' : 'Prepare uma issue a partir de um projeto configurado.'}</p></section>}
    {page && page.items.length > 0 && <section className="card attempt-history-card">
      {state.loading && <p className="queue-page-status" role="status">Atualizando o histórico; a página atual permanece disponível.</p>}
      <div className="table-wrap"><table className="attempt-history-table"><thead><tr><th>Issue</th><th>Etapa / resultado</th><th>Atualizada</th><th>Ações</th></tr></thead><tbody>{page.items.map((attempt) => <tr key={attempt.id}>
        <td><b>#{attempt.issue_number}</b><br /><small className="mono">{attempt.id}</small></td>
        <td>{attempt.phase}<br /><small>{attempt.result ?? 'Em andamento'}{attempt.suspension ? ` · ${attempt.suspension}` : ''}</small></td>
        <td><time dateTime={new Date(attempt.updated_at_ms).toISOString()}>{new Date(attempt.updated_at_ms).toLocaleString('pt-BR')}</time></td>
        <td><div className="row"><button type="button" onClick={() => onDetail(attempt.id, attempt.project_id)}>Consultar</button>{attempt.result && <button type="button" onClick={() => onPrepareRetry(attempt.id, attempt.project_id)}>Nova tentativa</button>}</div></td>
      </tr>)}</tbody></table></div>
      <div className="attempt-pagination" aria-label="Paginação do histórico"><button type="button" onClick={previousPage} disabled={visiblePageIndex === 0 || state.loading}>Anterior</button><span>Página {visiblePageIndex + 1} · {page.has_more ? 'há mais tentativas' : 'fim do histórico observado'}</span><button type="button" onClick={nextPage} disabled={!page.has_more || !page.next_cursor || state.loading || state.error !== null}>Próxima</button></div>
      {state.loading && <p className="queue-page-status" role="status">Consultando página…</p>}
    </section>}
  </section>;
}
