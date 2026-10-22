import { CustomSelect } from '../../app/CustomSelect.js';
import { useMemo, useState } from 'react';
import type { HttpDiagnosticCheck as DiagnosticCheck, HttpDiagnosticContext as DiagnosticContext } from '#contracts';
import { useDiagnostics } from './useDiagnostics.js';
import { useRecords, type RecordFilters } from './useRecords.js';
import { OperatorDiagnosticCard, OperatorState } from '../../app/OperatorSupport.js';
import { operatorErrorMessage, operatorEventLabel } from '../../app/operator-language.js';
import { DiagnosticContextPicker } from './DiagnosticContextPicker.js';
import { ProjectPicker } from '../projects/ProjectPicker.js';
import '../../app/styles/records.css';

type Scope = 'host' | 'project' | 'creation' | 'attempt';
type Props = { filters: RecordFilters; onFilterChange: (filters: RecordFilters) => void };
const checkLabels: Record<DiagnosticCheck, string> = { configuration: 'Configuração', github_identity: 'Identidade GitHub', maestri_context: 'Contexto nativo Maestri/OMP', resources: 'Recursos registrados' };

export function RecordsPanel({ filters, onFilterChange }: Props) {
  const [includeTechnical, setIncludeTechnical] = useState(false);
  const records = useRecords(filters, includeTechnical);
  const [scope, setScope] = useState<Scope>(() => filters.attemptId ? 'attempt' : filters.projectId ? 'project' : 'host');
  const [contextId, setContextId] = useState(() => scope === 'attempt' ? filters.attemptId : filters.projectId);
  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);
  const context: DiagnosticContext | null = useMemo(() => scope === 'host' ? { scope } : contextId.trim() ? { scope, id: contextId.trim() } : null, [scope, contextId]);
  const diagnostic = useDiagnostics(context);
  const activeOperation = diagnostic.verification && ['submitting', 'accepted', 'running', 'unavailable'].includes(diagnostic.verification.state);

  function setScopeValue(value: Scope): void {
    setScope(value);
    setContextId(value === 'attempt' ? filters.attemptId : value === 'project' ? filters.projectId : '');
    setChecks([]);
  }

  function applyFilters(next: RecordFilters): void {
    onFilterChange({ projectId: next.projectId.trim(), attemptId: next.attemptId.trim(), operationId: next.operationId.trim() });
  }

  function toggleCheck(check: DiagnosticCheck): void {
    setChecks((current) => current.includes(check) ? current.filter((value) => value !== check) : [...current, check]);
  }

  async function startVerification(): Promise<void> {
    if (checks.length === 0 || activeOperation) return;
    await diagnostic.verify(checks);
  }

  return <div className="records-panel">
    <section className="card records-filters">
      <div className="panel-title"><span className="eyebrow">Histórico da operação</span><h2>Filtrar registros</h2><p className="muted">Acompanhe os eventos de todos os projetos ou selecione um projeto.</p></div>
      <div className="records-filter-controls">
      <label className="form-check records-technical"><input type="checkbox" checked={includeTechnical} onChange={(event) => setIncludeTechnical(event.currentTarget.checked)} />Incluir eventos técnicos</label>
      <ProjectPicker id="records-project-choice" value={filters.projectId} onChange={(projectId) => applyFilters({ projectId, attemptId: '', operationId: '' })} />
      {(filters.projectId || filters.attemptId || filters.operationId) && <button type="button" onClick={() => applyFilters({ projectId: '', attemptId: '', operationId: '' })}>Limpar filtros</button>}
      </div>
    </section>

    <section className="card records-events" aria-labelledby="records-heading">
      <div className="line panel-title"><div><span className="eyebrow">Eventos</span><h2 id="records-heading">Histórico de atividades</h2></div>{records.page && <span className="records-count">{records.page.items.length} {records.page.items.length === 1 ? 'evento nesta página' : 'eventos nesta página'}</span>}</div>
      {records.loading && !records.page && <p className="muted" role="status">Consultando registros…</p>}
      {(records.refreshing || records.stale) && <p className="stale-note" role="status">Atualizando. A página anterior continua visível e pode estar desatualizada.</p>}
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

    <section className="card diagnostics-panel" aria-labelledby="diagnostics-heading">
      <div className="line panel-title"><div><span className="eyebrow">Verificação</span><h2 id="diagnostics-heading">Diagnóstico</h2></div><button type="button" onClick={diagnostic.refresh} disabled={diagnostic.loading || diagnostic.refreshing || !context}>Atualizar diagnóstico</button></div>
      <p className="muted records-diagnostic-description">Consulte impedimentos e execute verificações locais para o contexto selecionado.</p>
      <div className="form-grid records-context"><div className="form-field"><label htmlFor="diagnostic-scope">Contexto</label><CustomSelect id="diagnostic-scope" value={scope} onChange={(event) => setScopeValue(event.currentTarget.value as Scope)}><option value="host">Controlador local</option><option value="project">Projeto</option><option value="creation">Criação</option><option value="attempt">Tentativa</option></CustomSelect></div>{scope !== 'host' && <DiagnosticContextPicker key={scope} scope={scope} value={contextId} onChange={setContextId} />}</div>
      {!context && <p className="notice" role="status">Selecione o projeto, a criação pelo nome ou a tentativa pela issue para carregar seus fatos.</p>}
      {diagnostic.loading && !diagnostic.view && <p className="muted" role="status">Consultando diagnóstico…</p>}
      {(diagnostic.refreshing || diagnostic.stale) && <p className="stale-note" role="status">Atualizando os fatos; o relatório exibido pertence à consulta anterior.</p>}
      {diagnostic.error && <div className="queue-error" role="alert"><b>Falha nesta consulta de diagnóstico</b><p>{diagnostic.error}</p><p><strong>Próxima ação:</strong> atualize os fatos do contexto selecionado.</p></div>}
      {diagnostic.actionError && <div className="queue-error" role="alert"><b>A verificação não foi aceita</b><p>{diagnostic.actionError.message}</p><p><strong>Próxima ação:</strong> revise o contexto e as checagens selecionadas antes de tentar novamente.</p></div>}
      {diagnostic.view && <>
        {diagnostic.view.diagnostics.length === 0 && <p className="empty-inline" role="status">{diagnostic.stale ? 'A leitura anterior não registrava impedimentos configuracionais.' : 'Nenhum impedimento configuracional foi observado nesta leitura.'}</p>}
        {diagnostic.view.diagnostics.map((item, index) => <OperatorDiagnosticCard key={`${item.check}:${item.code}:${index}`} code={item.code} state={item.state} cause={item.cause} recovery={item.recovery} previous={diagnostic.previous} projectId={filters.projectId || (scope === 'project' ? contextId : null)} />)}
        {diagnostic.view.reports.map((report) => <article className="diagnostic-report" key={report.operation_id}><div className="line"><b>Verificação</b> · <OperatorState value={report.state} /><small>{new Date(report.created_at_ms).toLocaleString('pt-BR')}</small></div>{report.diagnostics.map((item, index) => <OperatorDiagnosticCard key={`${item.check}:${item.code}:${index}`} code={item.code} state={item.state} cause={item.cause} recovery={item.recovery} previous={diagnostic.previous || Boolean(diagnostic.verification && report.operation_id !== diagnostic.verification.operationId)} projectId={filters.projectId || (scope === 'project' ? contextId : null)} />)}</article>)}
      </>}
      {diagnostic.supportedChecks.length > 0 && <fieldset className="diagnostic-checks"><legend>O que verificar</legend>{diagnostic.supportedChecks.map((check) => <label key={check} className="form-check"><input type="checkbox" checked={checks.includes(check)} onChange={() => toggleCheck(check)} disabled={Boolean(activeOperation)} />{checkLabels[check]}</label>)}</fieldset>}
      {diagnostic.verification && <div className={diagnostic.previous ? 'notice diagnostic-operation' : 'diagnostic-operation'} role={diagnostic.verification.error ? 'alert' : 'status'}><b>{diagnostic.previous ? 'Resultado anterior' : 'Verificação atual'}</b> · <OperatorState value={diagnostic.verification.state} />{diagnostic.verification.error && <p>{operatorErrorMessage(diagnostic.verification.errorCode ?? 'DIAGNOSTIC_CHECK_UNAVAILABLE', diagnostic.verification.error)}</p>}</div>}
      <div className="diagnostic-footer"><p className="muted">A verificação não repete criações, execuções ou publicações.</p><div className="row diagnostic-actions"><button type="button" className="primary" onClick={() => void startVerification()} disabled={!context || checks.length === 0 || Boolean(activeOperation) || diagnostic.loading}>Verificar selecionados</button>{diagnostic.verification && ['unknown', 'unavailable'].includes(diagnostic.verification.state) && <button type="button" onClick={diagnostic.retryReceipt}>Consultar resultado</button>}</div></div>
    </section>
  </div>;
}
