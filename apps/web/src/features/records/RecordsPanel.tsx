import { CustomSelect } from '../../app/CustomSelect.js';
import { useMemo, useState } from 'react';
import type { HttpDiagnosticCheck as DiagnosticCheck, HttpDiagnosticContext as DiagnosticContext } from '#contracts';
import { useDiagnostics } from './useDiagnostics.js';
import { useRecords, type RecordFilters } from './useRecords.js';
import { OperatorDiagnosticCard, OperatorState, UnknownState } from '../../app/OperatorSupport.js';
import { isKnownOperatorEvent, operatorErrorMessage, operatorEventLabel } from '../../app/operator-language.js';
import { DiagnosticContextPicker } from './DiagnosticContextPicker.js';
import { ProjectPicker } from '../projects/ProjectPicker.js';

type Scope = 'host' | 'project' | 'creation' | 'attempt';
type Props = { filters: RecordFilters; onFilterChange: (filters: RecordFilters) => void };
const checkLabels: Record<DiagnosticCheck, string> = { configuration: 'Configuração', github_identity: 'Identidade GitHub', maestri_context: 'Contexto nativo Maestri/OMP', resources: 'Recursos registrados' };

export function RecordsPanel({ filters, onFilterChange }: Props) {
  const records = useRecords(filters);
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
      <div className="panel-title"><span className="eyebrow">Consulta persistida</span><h2>Filtrar registros</h2></div>
      <ProjectPicker id="records-project-choice" value={filters.projectId} onChange={(projectId) => applyFilters({ projectId, attemptId: '', operationId: '' })} />
    </section>

    <section className="card" aria-labelledby="records-heading">
      <div className="line panel-title"><div><span className="eyebrow">Eventos</span><h2 id="records-heading">Registros do controlador</h2></div></div>
      {records.loading && !records.page && <p className="muted" role="status">Consultando registros…</p>}
      {(records.refreshing || records.stale) && <p className="stale-note" role="status">Atualizando. A página anterior continua visível e pode estar desatualizada.</p>}
      {records.error && <div className="queue-error" role="alert"><b>{records.page ? 'Não foi possível carregar a continuação' : 'Falha ao consultar registros'}</b><p>{records.error}</p><p><strong>Próxima ação:</strong> tente consultar esta página novamente.</p><div className="row"><button type="button" onClick={records.refresh}>Tentar novamente nesta página</button></div></div>}
      {records.page?.items.map((event) => <article className="event record-event" key={event.seq}><time>{new Date(event.occurred_at_ms).toLocaleString('pt-BR')}</time><div><b>{operatorEventLabel(event.event_type)}</b>{!isKnownOperatorEvent(event.event_type) && <><UnknownState value={event.event_type} /></>}{event.project_id && <button type="button" className="inline-link" onClick={() => applyFilters({ ...filters, projectId: event.project_id! })}>Filtrar este projeto</button>}{event.attempt_id && <button type="button" className="inline-link" onClick={() => applyFilters({ ...filters, attemptId: event.attempt_id! })}>Filtrar esta tentativa</button>}</div></article>)}
      {!records.loading && !records.error && records.page?.items.length === 0 && <p className="empty-inline" role="status">{records.emptyKind === 'no-events' ? 'Nenhum evento foi registrado.' : records.emptyKind === 'no-matches' ? 'Não há eventos correspondentes aos filtros atuais.' : records.emptyKind === 'unknown' ? 'A consulta filtrada não retornou itens e não foi possível confirmar se existem registros sem filtro.' : 'Esta página não contém novos eventos.'}</p>}
      <div className="records-pagination"><button type="button" onClick={records.previousPage} disabled={!records.canGoBack || records.loading || records.refreshing}>Página anterior</button><span>Página {records.pageIndex + 1} · {records.page?.has_more ? 'há mais registros' : 'fim da consulta'}</span><button type="button" onClick={records.nextPage} disabled={!records.page?.has_more || records.loading || records.refreshing}>Próxima página</button></div>
    </section>

    <section className="card diagnostics-panel" aria-labelledby="diagnostics-heading">
      <div className="line panel-title"><div><span className="eyebrow">Verificação contextual</span><h2 id="diagnostics-heading">Diagnóstico acionável</h2></div><button type="button" onClick={diagnostic.refresh} disabled={diagnostic.loading || diagnostic.refreshing || !context}>Atualizar fatos</button></div>
      <p className="muted">Consultas atuais são somente leitura. Verificar inicia apenas as checagens locais e não repete operações de criação, execução ou publicação.</p>
      <div className="form-grid"><div className="form-field"><label htmlFor="diagnostic-scope">Contexto</label><CustomSelect id="diagnostic-scope" value={scope} onChange={(event) => setScopeValue(event.currentTarget.value as Scope)}><option value="host">Host</option><option value="project">Projeto</option><option value="creation">Criação</option><option value="attempt">Tentativa</option></CustomSelect></div>{scope !== 'host' && <DiagnosticContextPicker key={scope} scope={scope} value={contextId} onChange={setContextId} />}</div>
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
      {diagnostic.supportedChecks.length > 0 && <fieldset className="diagnostic-checks"><legend>Checagens permitidas neste contexto</legend>{diagnostic.supportedChecks.map((check) => <label key={check} className="form-check"><input type="checkbox" checked={checks.includes(check)} onChange={() => toggleCheck(check)} disabled={Boolean(activeOperation)} />{checkLabels[check]}</label>)}</fieldset>}
      {diagnostic.verification && <div className={diagnostic.previous ? 'notice diagnostic-operation' : 'diagnostic-operation'} role={diagnostic.verification.error ? 'alert' : 'status'}><b>{diagnostic.previous ? 'Resultado anterior' : 'Verificação atual'}</b> · <OperatorState value={diagnostic.verification.state} />{diagnostic.verification.error && <p>{operatorErrorMessage(diagnostic.verification.errorCode ?? 'DIAGNOSTIC_CHECK_UNAVAILABLE', diagnostic.verification.error)}</p>}</div>}
      <div className="row diagnostic-actions"><button type="button" className="primary" onClick={() => void startVerification()} disabled={!context || checks.length === 0 || Boolean(activeOperation) || diagnostic.loading}>Verificar selecionados</button>{diagnostic.verification && ['unknown', 'unavailable'].includes(diagnostic.verification.state) && <button type="button" onClick={diagnostic.retryReceipt}>Consultar recibo</button>}</div>
    </section>
  </div>;
}
