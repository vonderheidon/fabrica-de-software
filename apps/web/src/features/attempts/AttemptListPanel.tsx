import { CustomSelect } from '../../app/CustomSelect.js';
import { useEffect, useState } from 'react';
import type { HttpAttemptPage as AttemptPage } from '#contracts';
import { HttpError, requestJsonWithMetadata } from '../../api/http.js';
import type { ControllerEventNotice } from '../../app/useControllerEvents.js';
import { setAttemptProjectFilter } from './execution-requests.js';
import { ProjectPicker } from '../projects/ProjectPicker.js';
import { operatorCodeLabel, operatorState } from '../../app/operator-language.js';
import { AttemptComparisonDialog } from './AttemptComparisonDialog.js';
import { useAppliedObservation } from '../../app/applied-observations.js';

type Props = {
  projectId: string;
  result: string;
  issueNumber: string;
  issueTitle: string;
  dateFrom: string;
  dateTo: string;
  timeZone: string;
  cursors?: string;
  onPageChange?: (cursors: string) => void;
  onFilterChange: (projectId: string, result: string) => void;
  onSearchChange: (filters: AttemptSearchFilters) => void;
  onPrepareRetry: (attemptId: string, projectId: string) => void;
  onDetail: (attemptId: string, projectId: string) => void;
};
export type AttemptSearchFilters = { issueNumber: string; issueTitle: string; dateFrom: string; dateTo: string; timeZone: string };
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

export function AttemptListPanel({ projectId, result, issueNumber, issueTitle, dateFrom, dateTo, timeZone, cursors = '', onPageChange, onFilterChange, onSearchChange, onPrepareRetry, onDetail }: Props) {
  const [cursorStack, setCursorStack] = useState<Array<string | null>>(() => readCursors(cursors));
  const [pageIndex, setPageIndex] = useState(() => readCursors(cursors).length - 1);
  const [visiblePageIndex, setVisiblePageIndex] = useState(0);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<ListState>({ page: null, error: null, requestId: null, loading: true });
  const [draft, setDraft] = useState<AttemptSearchFilters>({ issueNumber, issueTitle, dateFrom, dateTo, timeZone });
  const [selected, setSelected] = useState<AttemptPage['items']>([]);
  const [comparing, setComparing] = useState(false);
  useAppliedObservation(true, state.loading, Boolean(state.error), state);
  const cursor = cursorStack[pageIndex] ?? null;
  const invertedRange = Boolean(draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo);
  const hasSearchFilters = Boolean(issueNumber || issueTitle || dateFrom || dateTo);

  useEffect(() => { const stack = readCursors(cursors); setCursorStack(stack); setPageIndex(stack.length - 1); }, [cursors]);


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
    if (issueNumber) query.set('issue_number', issueNumber);
    if (issueTitle) query.set('issue_title', issueTitle);
    if (dateFrom) query.set('date_from', dateFrom);
    if (dateTo) query.set('date_to', dateTo);
    if (timeZone) query.set('time_zone', timeZone);
    if (cursor) query.set('cursor', cursor);
    setState((current) => ({ ...current, error: null, requestId: null, loading: true }));
    void requestJsonWithMetadata<AttemptPage>(`/api/v1/attempts?${query}`, { signal: controller.signal }).then(({ data }) => {
      if (active) { setState({ page: data, error: null, requestId: null, loading: false }); setVisiblePageIndex(pageIndex); }
    }).catch((reason: unknown) => {
      if (!active || (reason instanceof DOMException && reason.name === 'AbortError')) return;
      setState((current) => ({ ...current, error: reason instanceof HttpError ? reason.message : 'Não foi possível consultar as tentativas.', requestId: reason instanceof HttpError ? reason.requestId : null, loading: false }));
    });
    return () => { active = false; controller.abort(); };
  }, [projectId, result, issueNumber, issueTitle, dateFrom, dateTo, timeZone, cursor, reload, pageIndex]);

  function refreshHistory(): void {
    setCursorStack([null]);
    setPageIndex(0);
    onPageChange?.('');
    setReload((current) => current + 1);
  }

  function nextPage(): void {
    const nextCursor = state.page?.next_cursor;
    if (!state.page?.has_more || !nextCursor || state.loading) return;
    setCursorStack((current) => current[visiblePageIndex + 1] === nextCursor ? current.slice(0, visiblePageIndex + 2) : [...current.slice(0, visiblePageIndex + 1), nextCursor]);
    setPageIndex(visiblePageIndex + 1);
    onPageChange?.(JSON.stringify([...cursorStack.slice(1, visiblePageIndex + 1), nextCursor]));
  }

  function previousPage(): void {
    if (visiblePageIndex === 0 || state.loading) return;
    setPageIndex(visiblePageIndex - 1);
    onPageChange?.(visiblePageIndex === 1 ? '' : JSON.stringify(cursorStack.slice(1, visiblePageIndex)));
  }

  const page = state.page;
  return <section className="attempt-list-panel" aria-label="Histórico de tentativas">
    <div className="attempt-intro"><span className="eyebrow">Acompanhamento</span><h2>Histórico de execução</h2><p className="muted">Consulte o resultado de cada tentativa ou prepare uma nova execução da issue.</p></div>
    <form className="attempt-filters card" onSubmit={(event) => { event.preventDefault(); if (!invertedRange) { refreshHistory(); onSearchChange(draft); } }}>
      <ProjectPicker id="attempt-project-filter" value={projectId} onChange={(value) => onFilterChange(value, result)} />
      <div className="form-field"><label htmlFor="attempt-result-filter">Resultado
        </label><CustomSelect id="attempt-result-filter" value={result} onChange={(event) => onFilterChange(projectId, event.currentTarget.value)}>
          {resultOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </CustomSelect>
      </div>
      <div className="attempt-search-fields">
        <div className="form-field"><label htmlFor="attempt-issue-number-filter">Número da issue</label><input id="attempt-issue-number-filter" type="text" inputMode="numeric" pattern="[1-9][0-9]{0,9}" maxLength={10} value={draft.issueNumber} onChange={(event) => { const issueNumber = event.currentTarget.value; setDraft((current) => ({ ...current, issueNumber })); }} /></div>
        <div className="form-field"><label htmlFor="attempt-issue-title-filter">Título da issue</label><input id="attempt-issue-title-filter" type="search" maxLength={256} value={draft.issueTitle} onChange={(event) => { const issueTitle = event.currentTarget.value; setDraft((current) => ({ ...current, issueTitle })); }} /></div>
        <div className="form-field"><label htmlFor="attempt-date-from-filter">Início</label><input id="attempt-date-from-filter" type="date" aria-invalid={invertedRange} aria-describedby={invertedRange ? 'attempt-range-error' : undefined} value={draft.dateFrom} onChange={(event) => { const dateFrom = event.currentTarget.value; setDraft((current) => ({ ...current, dateFrom })); }} /></div>
        <div className="form-field"><label htmlFor="attempt-date-to-filter">Fim</label><input id="attempt-date-to-filter" type="date" aria-invalid={invertedRange} aria-describedby={invertedRange ? 'attempt-range-error' : undefined} value={draft.dateTo} onChange={(event) => { const dateTo = event.currentTarget.value; setDraft((current) => ({ ...current, dateTo })); }} /></div>
      </div>
      {invertedRange && <p id="attempt-range-error" className="attempt-search-range-error" role="alert">A data inicial deve ser anterior ou igual à data final.</p>}
      <div className="attempt-search-actions">
        <button type="button" onClick={() => { const cleared = { issueNumber: '', issueTitle: '', dateFrom: '', dateTo: '', timeZone }; setDraft(cleared); refreshHistory(); onSearchChange(cleared); }}>Limpar busca</button>
        <button type="submit" disabled={invertedRange || state.loading}>Buscar</button>
        <button type="button" onClick={refreshHistory} disabled={state.loading}>Atualizar</button>
      </div>
    </form>

    {state.error && <div className="queue-error" role="alert"><h2>Falha ao consultar o histórico</h2><p>{state.error}</p>{page && <p>Dados da consulta anterior. Atualize para conferir a situação atual.</p>}<button type="button" onClick={() => setReload((current) => current + 1)} disabled={state.loading}>Tentar novamente</button></div>}
    <section className="card" aria-label="Seleção para comparação"><p>Selecione duas tentativas da mesma issue e projeto. A conta e o repositório serão conferidos ao abrir.</p><p role="status">{selected.length} de 2 selecionadas</p>{selected.map(item => <button type="button" key={item.id} onClick={() => setSelected(current => current.filter(value => value.id !== item.id))}>Remover {item.id}</button>)}<button type="button" disabled={selected.length !== 2} onClick={() => setComparing(true)}>Comparar tentativas</button></section>
    {comparing && selected[0] && selected[1] && <AttemptComparisonDialog leftId={selected[0].id} rightId={selected[1].id} onClose={() => setComparing(false)} />}
    {!page && state.loading && <section className="card read-state" role="status"><p>Consultando histórico de tentativas…</p></section>}
    {page && page.items.length === 0 && <section className="card empty" role="status"><h2>{projectId || result || hasSearchFilters ? 'Nenhuma tentativa corresponde aos filtros' : 'Nenhuma tentativa registrada'}</h2><p>{projectId || result || hasSearchFilters ? 'Ajuste os filtros para consultar outras tentativas.' : 'Prepare uma issue a partir de um projeto configurado.'}</p></section>}
    {page && page.items.length > 0 && <section className="card attempt-history-card">
      <div className="line attempt-history-heading"><h2>Tentativas registradas</h2><span className="muted">{page.items.length} nesta página</span></div>
      {state.loading && <p className="queue-page-status" role="status">Atualizando histórico…</p>}
      <div className="table-wrap"><table className="attempt-history-table"><thead><tr><th scope="col">Issue</th><th scope="col">Situação</th><th scope="col">Última atualização</th><th scope="col">Ações</th></tr></thead><tbody>{page.items.map((attempt) => <tr key={attempt.id}>
        <td><span className="attempt-issue-title"><b>{attempt.issue_number === null ? 'Issue sem número histórico' : `Issue #${attempt.issue_number}`}</b>{attempt.issue_title ? ` - ${attempt.issue_title}` : ''}</span></td>
        <td data-label="Situação"><span className={`pill result-${attempt.result ?? 'running'}`}>{operatorState(attempt.result ?? 'running').label}</span><small className="attempt-phase">{operatorState(attempt.phase).label}{attempt.suspension ? ` · ${operatorCodeLabel(attempt.suspension)}` : ''}</small></td>
        <td data-label="Última atualização"><time dateTime={new Date(attempt.updated_at_ms).toISOString()}>{new Date(attempt.updated_at_ms).toLocaleDateString('pt-BR')}<small className="attempt-time">{new Date(attempt.updated_at_ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></time></td>
        <td data-label="Ações"><div className="attempt-row-actions"><button type="button" data-attempt-trigger={attempt.id} onClick={() => onDetail(attempt.id, attempt.project_id)}>Consultar</button><button type="button" aria-pressed={selected.some(item => item.id === attempt.id)} disabled={state.loading || Boolean(state.error) || (!selected.some(item => item.id === attempt.id) && (selected.length === 2 || Boolean(selected[0] && (selected[0].project_id !== attempt.project_id || selected[0].issue_id !== attempt.issue_id))))} onClick={() => setSelected(current => current.some(item => item.id === attempt.id) ? current.filter(item => item.id !== attempt.id) : [...current, attempt])}>Selecionar para comparar</button>{attempt.result && <button type="button" className="attempt-retry" onClick={() => onPrepareRetry(attempt.id, attempt.project_id)}>Nova tentativa</button>}</div></td>
      </tr>)}</tbody></table></div>
      <div className="attempt-pagination" aria-label="Paginação do histórico"><button type="button" onClick={previousPage} disabled={visiblePageIndex === 0 || state.loading}>Anterior</button><span>Página {visiblePageIndex + 1}{!page.has_more && ' · Fim do histórico'}</span><button type="button" onClick={nextPage} disabled={!page.has_more || !page.next_cursor || state.loading || state.error !== null}>Próxima</button></div>
    </section>}
  </section>;
}

function readCursors(value: string): Array<string | null> {
  try { const parsed: unknown = JSON.parse(value); if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string' && item.length > 0 && item.length <= 2048)) return [null, ...parsed]; } catch { /* A navegação sem cursor começa na primeira página. */ }
  return [null];
}
