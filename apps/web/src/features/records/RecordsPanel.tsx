import { useEffect, useMemo, useState } from 'react';
import type { HttpDiagnosticCheck as DiagnosticCheck, HttpDiagnosticContext as DiagnosticContext } from '#contracts';
import { useDiagnostics } from './useDiagnostics.js';
import { useRecords, type RecordFilters } from './useRecords.js';
import { OperatorDiagnosticCard, OperatorState, TechnicalDetails, UnknownState } from '../../app/OperatorSupport.js';
import { isKnownOperatorEvent, operatorErrorMessage, operatorEventLabel } from '../../app/operator-language.js';
import { DiagnosticContextPicker } from './DiagnosticContextPicker.js';
import { ProjectPicker } from '../projects/ProjectPicker.js';

type Scope = 'host' | 'project' | 'creation' | 'attempt';
type Props = { filters: RecordFilters; onFilterChange: (filters: RecordFilters) => void };
const checkLabels: Record<DiagnosticCheck, string> = { configuration: 'Configuração', github_identity: 'Identidade GitHub', maestri_context: 'Contexto nativo Maestri/OMP', resources: 'Recursos registrados' };

export function RecordsPanel({ filters, onFilterChange }: Props) {
  const records = useRecords(filters);
  const [filterDraft, setFilterDraft] = useState(filters);
  const [scope, setScope] = useState<Scope>(() => filters.attemptId ? 'attempt' : filters.projectId ? 'project' : 'host');
  const [contextId, setContextId] = useState(() => scope === 'attempt' ? filters.attemptId : filters.projectId);
  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);
  const context: DiagnosticContext | null = useMemo(() => scope === 'host' ? { scope } : contextId.trim() ? { scope, id: contextId.trim() } : null, [scope, contextId]);
  const diagnostic = useDiagnostics(context);
  const activeOperation = diagnostic.verification && ['submitting', 'accepted', 'running', 'unavailable'].includes(diagnostic.verification.state);

  useEffect(() => { setFilterDraft(filters); }, [filters.projectId, filters.attemptId, filters.operationId]);

  function setScopeValue(value: Scope): void {
    setScope(value);
    setContextId(value === 'attempt' ? filters.attemptId : value === 'project' ? filters.projectId : '');
    setChecks([]);
  }

  function updateFilterDraft(key: keyof RecordFilters, value: string): void {
    setFilterDraft((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(next = filterDraft): void {
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
      <div className="panel-title"><span className="eyebrow">Consulta persistida</span><h2>Filtrar registros</h2></div>
      <ProjectPicker id="records-project-choice" value={filters.projectId} onChange={(projectId) => applyFilters({ projectId, attemptId: '', operationId: '' })} />
      <details className="technical-filter"><summary>Filtrar por referências de suporte</summary><div className="form-grid"><label htmlFor="records-project-filter">Projeto (ID de suporte)<input id="records-project-filter" value={filterDraft.projectId} maxLength={36} onChange={(event) => updateFilterDraft('projectId', event.currentTarget.value)} /></label><label htmlFor="records-attempt-filter">Tentativa (ID de suporte)<input id="records-attempt-filter" value={filterDraft.attemptId} maxLength={36} onChange={(event) => updateFilterDraft('attemptId', event.currentTarget.value)} /></label><label htmlFor="records-operation-filter">Operação (ID de suporte)<input id="records-operation-filter" value={filterDraft.operationId} maxLength={36} onChange={(event) => updateFilterDraft('operationId', event.currentTarget.value)} /></label><div className="row records-filter-actions"><button type="button" onClick={() => applyFilters()} disabled={filterDraft.projectId === filters.projectId && filterDraft.attemptId === filters.attemptId && filterDraft.operationId === filters.operationId}>Aplicar filtros</button><button type="button" onClick={() => { setFilterDraft({ projectId: '', attemptId: '', operationId: '' }); applyFilters({ projectId: '', attemptId: '', operationId: '' }); }}>Limpar filtros</button><button type="button" onClick={records.refresh} disabled={records.loading || records.refreshing}>Atualizar página</button></div></div></details>
    </section>

    <section className="card" aria-labelledby="records-heading">
      <div className="line panel-title"><div><span className="eyebrow">Eventos</span><h2 id="records-heading">Registros do controlador</h2></div><TechnicalDetails eventCursor={records.page?.event_cursor ?? null} /></div>
      {records.loading && !records.page && <p className="muted" role="status">Consultando registros…</p>}
      {(records.refreshing || records.stale) && <p className="stale-note" role="status">Atualizando. A página anterior continua visível e pode estar desatualizada.</p>}
      {records.error && <div className="queue-error" role="alert"><b>{records.page ? 'Não foi possível carregar a continuação' : 'Falha ao consultar registros'}</b><p>{records.error}</p><p><strong>Próxima ação:</strong> tente consultar esta página novamente.</p><TechnicalDetails code={records.errorCode} requestId={records.requestId} facts={records.facts} affectedRequirements={records.affectedRequirements} eventCursor={records.page?.event_cursor} /><div className="row"><button type="button" onClick={records.refresh}>Tentar novamente nesta página</button></div></div>}
      {records.page?.items.map((event) => <article className="event record-event" key={event.seq}><time>{new Date(event.occurred_at_ms).toLocaleString('pt-BR')}</time><div><b>{operatorEventLabel(event.event_type)}</b>{!isKnownOperatorEvent(event.event_type) && <><UnknownState value={event.event_type} /><TechnicalDetails code={event.event_type} /></>}{event.project_id && <button type="button" className="inline-link" onClick={() => { const next = { ...filterDraft, projectId: event.project_id! }; setFilterDraft(next); applyFilters(next); }}>Filtrar este projeto</button>}{event.attempt_id && <button type="button" className="inline-link" onClick={() => { const next = { ...filterDraft, attemptId: event.attempt_id! }; setFilterDraft(next); applyFilters(next); }}>Filtrar esta tentativa</button>}<TechnicalDetails code={event.event_type} operationId={event.operation_id} eventCursor={String(event.seq)} entityType={event.entity_type} entityId={event.entity_id} technicalNotes={[{ label: 'Horário', value: new Date(event.occurred_at_ms).toLocaleString('pt-BR') }]} /></div></article>)}
      {!records.loading && !records.error && records.page?.items.length === 0 && <p className="empty-inline" role="status">{records.emptyKind === 'no-events' ? 'Nenhum evento foi registrado.' : records.emptyKind === 'no-matches' ? 'Não há eventos correspondentes aos filtros atuais.' : records.emptyKind === 'unknown' ? 'A consulta filtrada não retornou itens e não foi possível confirmar se existem registros sem filtro.' : 'Esta página não contém novos eventos.'}</p>}
      <div className="records-pagination"><button type="button" onClick={records.previousPage} disabled={!records.canGoBack || records.loading || records.refreshing}>Página anterior</button><span>Página {records.pageIndex + 1} · {records.page?.has_more ? 'há mais registros' : 'fim da consulta'}</span><button type="button" onClick={records.nextPage} disabled={!records.page?.has_more || records.loading || records.refreshing}>Próxima página</button></div>
    </section>

    <section className="card diagnostics-panel" aria-labelledby="diagnostics-heading">
      <div className="line panel-title"><div><span className="eyebrow">Verificação contextual</span><h2 id="diagnostics-heading">Diagnóstico acionável</h2></div><button type="button" onClick={diagnostic.refresh} disabled={diagnostic.loading || diagnostic.refreshing || !context}>Atualizar fatos</button></div>
      <p className="muted">Consultas atuais são somente leitura. Verificar inicia apenas as checagens locais e não repete operações de criação, execução ou publicação.</p>
      <div className="form-grid"><label htmlFor="diagnostic-scope">Contexto<select id="diagnostic-scope" value={scope} onChange={(event) => setScopeValue(event.currentTarget.value as Scope)}><option value="host">Host</option><option value="project">Projeto</option><option value="creation">Criação</option><option value="attempt">Tentativa</option></select></label>{scope !== 'host' && <><DiagnosticContextPicker key={scope} scope={scope} value={contextId} onChange={setContextId} /><details className="technical-filter"><summary>Informar referência de suporte</summary><label htmlFor="diagnostic-context-id">ID do contexto<input id="diagnostic-context-id" value={contextId} maxLength={256} onChange={(event) => setContextId(event.currentTarget.value)} /></label></details></>}</div>
      {!context && <p className="notice" role="status">Selecione o projeto, a criação pelo nome ou a tentativa pela issue para carregar seus fatos.</p>}
      {diagnostic.loading && !diagnostic.view && <p className="muted" role="status">Consultando diagnóstico…</p>}
      {(diagnostic.refreshing || diagnostic.stale) && <p className="stale-note" role="status">Atualizando os fatos; o relatório exibido pertence à consulta anterior.</p>}
      {diagnostic.error && <div className="queue-error" role="alert"><b>Falha nesta consulta de diagnóstico</b><p>{diagnostic.error}</p><p><strong>Próxima ação:</strong> atualize os fatos do contexto selecionado.</p><TechnicalDetails code={diagnostic.errorCode} requestId={diagnostic.requestId} facts={diagnostic.facts} affectedRequirements={diagnostic.affectedRequirements} /></div>}
      {diagnostic.actionError && <div className="queue-error" role="alert"><b>A verificação não foi aceita</b><p>{diagnostic.actionError.message}</p><p><strong>Próxima ação:</strong> revise o contexto e as checagens selecionadas antes de tentar novamente.</p><TechnicalDetails code={diagnostic.actionError.code} requestId={diagnostic.actionError.requestId} facts={diagnostic.actionError.facts} affectedRequirements={diagnostic.actionError.affectedRequirements} /></div>}
      {diagnostic.view && <>
        {diagnostic.view.diagnostics.length === 0 && <p className="empty-inline" role="status">{diagnostic.stale ? 'A leitura anterior não registrava impedimentos configuracionais.' : 'Nenhum impedimento configuracional foi observado nesta leitura.'}</p>}
        {diagnostic.view.diagnostics.map((item, index) => <OperatorDiagnosticCard key={`${item.check}:${item.code}:${index}`} code={item.code} state={item.state} cause={item.cause} recovery={item.recovery} facts={item.facts} affectedRequirements={item.affected_requirements} checkLabel={checkLabels[item.check]} observedAtMs={item.observed_at_ms} previous={diagnostic.previous} projectId={filters.projectId || (scope === 'project' ? contextId : null)} />)}
        {diagnostic.view.reports.map((report) => <article className="diagnostic-report" key={report.operation_id}><div className="line"><b>Verificação</b> · <OperatorState value={report.state} /><small>{new Date(report.created_at_ms).toLocaleString('pt-BR')}</small></div><TechnicalDetails operationId={report.operation_id} state={report.state} revision={report.receipt.revision} eventCursor={report.receipt.event_cursor} technicalNotes={[{ label: 'Concluída em', value: report.completed_at_ms === null ? null : new Date(report.completed_at_ms).toLocaleString('pt-BR') }]} />{report.diagnostics.map((item, index) => <OperatorDiagnosticCard key={`${item.check}:${item.code}:${index}`} code={item.code} state={item.state} cause={item.cause} recovery={item.recovery} facts={item.facts} affectedRequirements={item.affected_requirements} checkLabel={checkLabels[item.check]} observedAtMs={item.observed_at_ms} previous={diagnostic.previous || Boolean(diagnostic.verification && report.operation_id !== diagnostic.verification.operationId)} projectId={filters.projectId || (scope === 'project' ? contextId : null)} />)}</article>)}
      </>}
      {diagnostic.supportedChecks.length > 0 && <fieldset className="diagnostic-checks"><legend>Checagens permitidas neste contexto</legend>{diagnostic.supportedChecks.map((check) => <label key={check} className="form-check"><input type="checkbox" checked={checks.includes(check)} onChange={() => toggleCheck(check)} disabled={Boolean(activeOperation)} />{checkLabels[check]}</label>)}</fieldset>}
      {diagnostic.verification && <div className={diagnostic.previous ? 'notice diagnostic-operation' : 'diagnostic-operation'} role={diagnostic.verification.error ? 'alert' : 'status'}><b>{diagnostic.previous ? 'Resultado anterior' : 'Verificação atual'}</b> · <OperatorState value={diagnostic.verification.state} />{diagnostic.verification.error && <p>{operatorErrorMessage(diagnostic.verification.errorCode ?? 'DIAGNOSTIC_CHECK_UNAVAILABLE', diagnostic.verification.error)}</p>}<TechnicalDetails operationId={diagnostic.verification.operationId} state={diagnostic.verification.state} code={diagnostic.verification.errorCode} requestId={diagnostic.verification.requestId} /></div>}
      <div className="row diagnostic-actions"><button type="button" className="primary" onClick={() => void startVerification()} disabled={!context || checks.length === 0 || Boolean(activeOperation) || diagnostic.loading}>Verificar selecionados</button>{diagnostic.verification && ['unknown', 'unavailable'].includes(diagnostic.verification.state) && <button type="button" onClick={diagnostic.retryReceipt}>Consultar recibo</button>}</div>
    </section>
  </div>;
}
