import { useEffect, useState } from 'react';
import { useRecords, type RecordFilters } from './useRecords.js';
import { operatorEventLabel } from '../../app/operator-language.js';
import { ProjectPicker } from '../projects/ProjectPicker.js';
import { DeletionInventoryRecord } from './DeletionInventoryRecord.js';
import '../../app/styles/records.css';

type Props = { filters: RecordFilters; onFilterChange: (filters: RecordFilters) => void };

export function RecordsPanel({ filters, onFilterChange }: Props) {
  const [includeTechnical, setIncludeTechnical] = useState(false);
  const [references, setReferences] = useState(filters);
  useEffect(() => setReferences(filters), [filters.projectId, filters.attemptId, filters.operationId]);
  const records = useRecords(filters, includeTechnical);
  const deletionOperationId = filters.operationId && records.page?.items.some((event) =>
    event.operation_id === filters.operationId && event.event_type === 'project.deletion.accepted') ? filters.operationId : null;
  function applyFilters(next: RecordFilters): void {
    onFilterChange({ projectId: next.projectId.trim(), attemptId: next.attemptId.trim(), operationId: next.operationId.trim() });
  }

  return <div className="records-panel">
    <section className="card records-filters">
      <div className="panel-title"><span className="eyebrow">Histórico da operação</span><h2>Filtrar registros</h2><p className="muted">Acompanhe os eventos de todos os projetos ou selecione um projeto.</p></div>
      <div className="records-filter-controls">
      <ProjectPicker id="records-project-choice" value={filters.projectId} onChange={(projectId) => applyFilters({ projectId, attemptId: '', operationId: '' })} />
      <label className="form-check records-technical"><input type="checkbox" checked={includeTechnical} onChange={(event) => setIncludeTechnical(event.currentTarget.checked)} />Incluir eventos técnicos</label>
      {(filters.projectId || filters.attemptId || filters.operationId) && <button type="button" onClick={() => applyFilters({ projectId: '', attemptId: '', operationId: '' })}>Limpar filtros</button>}
      </div>
      <details className="records-reference-filters"><summary>Filtros de tentativa e operação</summary><form onSubmit={event => { event.preventDefault(); applyFilters({ ...filters, attemptId: references.attemptId, operationId: references.operationId }); }}><div className="form-grid">
        <div className="form-field"><label htmlFor="records-attempt">Referência da tentativa</label><input id="records-attempt" value={references.attemptId} onChange={event => setReferences({ ...references, attemptId: event.currentTarget.value })} /></div>
        <div className="form-field"><label htmlFor="records-operation">Referência da operação</label><input id="records-operation" value={references.operationId} onChange={event => setReferences({ ...references, operationId: event.currentTarget.value })} /></div>
      </div><button type="submit">Aplicar referências</button></form></details>
    </section>

    {deletionOperationId && <DeletionInventoryRecord operationId={deletionOperationId} />}

    <section className="card records-events" aria-labelledby="records-heading">
      <div className="line panel-title"><div><span className="eyebrow">Eventos</span><h2 id="records-heading">Histórico de atividades</h2></div>{records.page && <span className="records-count">{records.page.items.length} {records.page.items.length === 1 ? 'evento nesta página' : 'eventos nesta página'}</span>}</div>
      {records.loading && !records.page && <p className="muted" role="status">Consultando registros…</p>}
      {records.error && records.page && <p className="stale-note" role="status">A página anterior continua visível e pode estar desatualizada.</p>}
      {records.error && <div className="queue-error" role="alert"><b>{records.page ? 'Não foi possível carregar a continuação' : 'Falha ao consultar registros'}</b><p>{records.error}</p><p><strong>Próxima ação:</strong> tente consultar esta página novamente.</p><div className="row"><button type="button" onClick={records.refresh}>Tentar novamente nesta página</button></div></div>}
      <div className="records-event-list">{records.page?.items.map((event) => {
        const context = event.context;
        const role = context?.role === 'implementer' ? 'Implementador' : context?.role === 'reviewer' ? 'Revisor' : null;
        const title = event.event_type === 'result-accepted' && role ? `Resultado do ${role} recebido` : operatorEventLabel(event.event_type);
        return <article className="event record-event" key={event.seq}>
          <time dateTime={new Date(event.occurred_at_ms).toISOString()}><span>{new Date(event.occurred_at_ms).toLocaleDateString('pt-BR')}</span><small>{new Date(event.occurred_at_ms).toLocaleTimeString('pt-BR')}</small></time>
          <div className="record-event-content"><b>{title}</b>
            <p className="record-event-origin">{context?.project_name ?? (event.project_id ? 'Projeto indisponível' : event.attempt_id ? 'Tentativa' : event.entity_type === 'creation' ? 'Criação de projeto' : 'Configuração da fábrica')}{context?.issue_number && <> · Issue #{context.issue_number}{context.issue_title && `: ${context.issue_title}`}</>}</p>
            {(context?.attempt_created_at_ms !== undefined || context?.round || role) && <p className="muted record-event-context">{[
              context?.attempt_created_at_ms !== undefined ? `Tentativa de ${new Date(context.attempt_created_at_ms).toLocaleString('pt-BR')}` : null,
              context?.round ? `Rodada ${context.round}` : null, role,
            ].filter(Boolean).join(' · ')}</p>}
            <div className="record-event-actions">
              {event.event_type === 'project.deletion.accepted' && <a href={`#principal/registros?operationId=${encodeURIComponent(event.operation_id)}`}>Ver inventário detalhado</a>}
              {event.attempt_id ? <a href={`#principal/tentativas?dialog=detail&attemptId=${encodeURIComponent(event.attempt_id)}`}>Ver tentativa</a> : event.project_id ? <a href={`#principal/projetos?dialog=project-configuration&projectId=${encodeURIComponent(event.project_id)}`}>Ver projeto</a> : null}
              {event.project_id && filters.projectId !== event.project_id && <button type="button" className="inline-link" onClick={() => applyFilters({ projectId: event.project_id!, attemptId: '', operationId: '' })}>Filtrar projeto</button>}
              {event.attempt_id && filters.attemptId !== event.attempt_id && <button type="button" className="inline-link" onClick={() => applyFilters({ projectId: event.project_id ?? '', attemptId: event.attempt_id!, operationId: '' })}>Filtrar tentativa</button>}
            </div>
          </div>
        </article>;
      })}</div>
      {!records.loading && !records.error && records.page?.items.length === 0 && <p className="empty-inline" role="status">{records.emptyKind === 'no-events' ? (includeTechnical ? 'Nenhum evento foi registrado.' : 'Nenhuma atividade relevante nesta consulta. Ative Incluir eventos técnicos para consultar os registros internos.') : records.emptyKind === 'no-matches' ? 'Não há eventos correspondentes aos filtros atuais.' : records.emptyKind === 'unknown' ? 'A consulta filtrada não retornou itens e não foi possível confirmar se existem registros sem filtro.' : 'Esta página não contém novos eventos.'}</p>}
      <div className="records-pagination"><button type="button" onClick={records.previousPage} disabled={!records.canGoBack || records.loading || records.refreshing}>Página anterior</button><span>Página {records.pageIndex + 1} · {records.page?.has_more ? 'há mais registros' : 'fim da consulta'}</span><button type="button" onClick={records.nextPage} disabled={!records.page?.has_more || records.loading || records.refreshing}>Próxima página</button></div>
    </section>

  </div>;
}
