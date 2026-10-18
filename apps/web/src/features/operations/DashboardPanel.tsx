import type { ProjectPage } from '#contracts';
import { useActiveAttempt } from './useActiveAttempt.js';
import { useOperation } from './useOperation.js';
import { useQueue } from '../queue/useQueue.js';

type Props = {
  projects: ProjectPage | null;
  projectsLoad: { loading: boolean; refreshing: boolean; error: { message: string; requestId: string | null } | null; stale: boolean; empty: boolean };
  onRefreshProjects: () => void;
  onPrepare: (projectId: string, trigger: HTMLElement) => void;
  onAttempt: (attemptId: string, projectId: string) => void;
};

function RequestNote({ loading, refreshing, error, requestId, stale, empty, label }: {
  loading: boolean; refreshing: boolean; error: string | null; requestId: string | null; stale: boolean; empty?: string | undefined; label: string;
}) {
  if (error) return <div className="read-state read-state-inline" role="alert"><b>Falha nesta seção</b><p>{error}</p>{requestId && <small className="mono">Solicitação {requestId}</small>}{stale && <p className="stale-note">Os dados abaixo são da consulta anterior.</p>}</div>;
  if (loading) return <p className="muted" role="status">Consultando {label}…</p>;
  if (refreshing || stale) return <p className="stale-note" role="status">Atualizando; os dados exibidos são da consulta anterior.</p>;
  if (empty) return <p className="empty-inline" role="status">{empty}</p>;
  return null;
}

export function DashboardPanel({ projects, projectsLoad, onRefreshProjects, onPrepare, onAttempt }: Props) {
  const operation = useOperation(true);
  const active = useActiveAttempt(true);
  const queue = useQueue(null, true);
  const summary = operation.data;
  const queueObservation = queue.load.observation;
  const candidates = queueObservation?.page.items.filter((item) => item.eligible).slice(0, 5) ?? [];
  const queueFailure = queue.load.status === 'error' ? { message: queue.load.message, requestId: queue.load.requestId }
    : queue.load.status === 'loading' ? queue.load.previousError : null;

  return <div className="dashboard-panels" aria-label="Resumo operacional">
    <section className="card dashboard-context-card">
      <div className="line panel-title"><div><span className="eyebrow">Conta e executor</span><h2>Contexto da esteira</h2></div><button type="button" onClick={operation.refresh} disabled={operation.loading || operation.refreshing}>Atualizar</button></div>
      <RequestNote loading={operation.loading} refreshing={operation.refreshing} error={operation.error} requestId={operation.requestId} stale={operation.stale} label="conta e operação" />
      {summary && <><dl className="dashboard-facts"><div><dt>Conta observada</dt><dd>{summary.account.login ?? 'Não observada'}{summary.account.id && <small className="mono">ID {summary.account.id}</small>}</dd></div><div><dt>Automação</dt><dd>{summary.automation.enabled ? 'Habilitada' : 'Desabilitada'}{summary.automation.dispatch_paused && <small>Despacho pausado</small>}</dd></div><div><dt>Integração</dt><dd>Maestri nativo · {summary.integration_status.state === 'observed' ? summary.integration_status.observation?.state ?? 'observado' : 'não verificado'}<small>Não comprova execução do provider.</small></dd></div></dl><a className="button-link" href="#principal/configuracao">Abrir configuração</a></>}
    </section>

    <div className="dashboard-grid">
      <section className="card">
        <div className="line panel-title"><div><span className="eyebrow">Execução atual</span><h2>Tentativa ativa</h2></div><button type="button" onClick={active.refresh} disabled={active.loading || active.refreshing}>Atualizar</button></div>
        <RequestNote loading={active.loading} refreshing={active.refreshing} error={active.error} requestId={active.requestId} stale={active.stale} empty={active.valid && !active.data ? 'Nenhuma tentativa ativa.' : undefined} label="a tentativa ativa" />
        {active.data && <div className="dashboard-record"><b>Issue #{active.data.issue_number}</b><p className="mono">{active.data.id}</p><p>Fase: {active.data.phase} · Resultado: {active.data.result ?? 'em andamento'}{active.data.suspension ? ` · Suspensão: ${active.data.suspension}` : ''}</p><button type="button" onClick={() => onAttempt(active.data!.id, active.data!.project_id)}>Abrir detalhe e ações disponíveis</button></div>}
      </section>

      <section className="card">
        <div className="line panel-title"><div><span className="eyebrow">Fila Ready</span><h2>Próximos candidatos</h2></div><a href="#principal/fila">Abrir fila</a></div>
        <RequestNote loading={queue.load.status === 'loading' && !queueObservation && !queueFailure} refreshing={queue.load.status === 'loading' && Boolean(queueObservation)} error={queueFailure?.message ?? null} requestId={queueFailure?.requestId ?? null} stale={Boolean(queueObservation) && (queue.load.status === 'error' || Boolean(queueFailure))} empty={queue.load.status === 'ready' && queueObservation?.complete && queueObservation.eligible_total === 0 ? 'A observação completa não encontrou candidatos elegíveis.' : undefined} label="candidatos" />
        {queueObservation && <>{queueObservation.complete !== true && <p className="notice compact-notice">Observação incompleta ou inválida. A lista não confirma ausência de candidatos.</p>}{queue.pageNotice && <p className="stale-note" role="status">{queue.pageNotice}</p>}<ul className="dashboard-candidates">{candidates.map((candidate) => <li key={`${candidate.project_id}:${candidate.item_id}`}><div><b>{candidate.title ?? `Issue ${candidate.number ?? candidate.item_id}`}</b><small>{candidate.project_name} · {candidate.status ?? 'Status não observado'} · {candidate.eligible ? 'elegível nesta observação' : candidate.reasons.join(', ') || 'não elegível'}</small></div>{candidate.issue_id && <button type="button" onClick={(event) => onPrepare(candidate.project_id, event.currentTarget)}>Preparar</button>}</li>)}</ul><small className="muted">Total elegível: {queueObservation.eligible_total ?? 'não confirmado'} · Observação {queueObservation.observed_at_ms ? new Date(queueObservation.observed_at_ms).toLocaleTimeString('pt-BR') : 'não realizada'}</small></>}
      </section>

      <section className="card">
        <div className="line panel-title"><div><span className="eyebrow">Histórico</span><h2>Resultados recentes</h2></div><a href="#principal/tentativas">Ver histórico</a></div>
        <RequestNote loading={operation.loading} refreshing={operation.refreshing} error={operation.error} requestId={operation.requestId} stale={operation.stale} empty={summary && summary.recent_results.length === 0 ? 'Nenhum resultado registrado.' : undefined} label="resultados" />
        {summary?.recent_results.map((result) => <article className="dashboard-record" key={result.id}><div className="line"><b>Issue #{result.issue_number}</b><span className="pill neutral">{result.result ?? result.phase}</span></div><small className="mono">{result.id}</small><button type="button" onClick={() => onAttempt(result.id, result.project_id)}>Abrir detalhe</button></article>)}
      </section>

      <section className="card">
        <div className="line panel-title"><div><span className="eyebrow">Bloqueios</span><h2>Impedimentos atuais</h2></div><a href="#principal/registros">Diagnóstico</a></div>
        <RequestNote loading={operation.loading} refreshing={operation.refreshing} error={operation.error} requestId={operation.requestId} stale={operation.stale} empty={summary && summary.impediments.length === 0 ? 'Nenhum impedimento observado nesta consulta.' : undefined} label="impedimentos" />
        {summary?.impediments.map((item, index) => <article className="diagnostic-record" key={`${item.check}:${item.code}:${index}`}><div className="line"><b>{item.code}</b><span className={`pill ${item.state === 'passed' ? '' : 'warn'}`}>{item.state}</span></div><p>{item.cause}</p><small>Requisitos: {item.affected_requirements.join(', ')}</small><p className="muted">{item.recovery}</p>{item.facts.attempt_id && <button type="button" onClick={() => onAttempt(item.facts.attempt_id!, item.facts.project_id ?? '')}>Abrir tentativa</button>}</article>)}
      </section>

      <section className="card dashboard-projects">
        <div className="line panel-title"><h2>Projetos recentes</h2><div className="row"><button type="button" onClick={onRefreshProjects} disabled={projectsLoad.loading}>Atualizar</button><a href="#principal/projetos">Ver projetos</a></div></div>
        <RequestNote loading={projectsLoad.loading && !projects} refreshing={projectsLoad.refreshing} error={projectsLoad.error?.message ?? null} requestId={projectsLoad.error?.requestId ?? null} stale={projectsLoad.stale} empty={projectsLoad.empty ? 'Nenhum projeto cadastrado.' : undefined} label="projetos" />
        {projects?.items.slice(0, 4).map((project) => <div className="event" key={project.id}><span className="mono muted">{project.revision.toString().padStart(2, '0')}</span><div><b>{project.name}</b><p>{project.base_branch} · {project.prerequisites.length ? `${project.prerequisites.length} pré-requisitos pendentes` : 'configuração disponível'}</p></div></div>)}
      </section>
    </div>
  </div>;
}
