import type { ProjectPage, HttpQueueItem } from '#contracts';
import { useActiveAttempt } from './useActiveAttempt.js';
import { useOperation } from './useOperation.js';
import { useQueue } from '../queue/useQueue.js';
import type { OnboardingController } from '../onboarding/useOnboarding.js';
import { UnknownState } from '../../app/OperatorSupport.js';
import { dashboardConditions, conditionDestination } from './dashboard-conditions.js';
import { diagnosticCopyFor, operatorCodeLabel, operatorState } from '../../app/operator-language.js';
import { AttemptStageSummary } from '../attempts/AttemptStageSummary.js';

type Props = {
  projects: ProjectPage | null;
  projectsLoad: { loading: boolean; refreshing: boolean; error: { message: string; requestId: string | null } | null; stale: boolean; empty: boolean };
  onRefreshProjects: () => void;
  onboarding: OnboardingController;
  onOpenSetup: (trigger: HTMLElement) => void;
  onPrepare: (projectId: string, issueId: string, trigger: HTMLElement) => void;
  onAttempt: (attemptId: string, projectId: string) => void;
};

export function ProjectPrerequisiteStatus({ prerequisites }: { prerequisites: ProjectPage['items'][number]['prerequisites'] }) {
  const pending = prerequisites.filter((item) => item.code !== 'EXECUTION_REVALIDATION_REQUIRED').length;
  return <span className={pending ? 'project-pending' : 'success'}>{pending ? `${pending} ${pending === 1 ? 'pré-requisito pendente' : 'pré-requisitos pendentes'}` : 'Sem impedimentos registrados'}</span>;
}

export function upcomingCandidates(items: readonly HttpQueueItem[]): HttpQueueItem[] {
  return items.filter((item) => item.eligible || (item.ready_eligible && item.reasons.length > 0 && item.reasons.every((reason) => reason === 'AUTOMATION_DISABLED'))).slice(0, 5);
}

function RequestNote({ loading, error, stale, empty, label }: {
  loading: boolean; refreshing: boolean; error: string | null; stale: boolean; empty?: string | undefined; label: string;
}) {
  if (error) return <div className="read-state read-state-inline" role="alert"><b>Falha nesta consulta</b><p>{error}</p><p className="muted"><strong>Próxima ação:</strong> Atualize esta seção; a leitura anterior continua identificada enquanto isso.</p>{stale && <p className="stale-note">Os dados abaixo são da consulta anterior.</p>}</div>;
  if (loading) return <p className="muted" role="status">Consultando {label}…</p>;
  if (empty) return <p className="empty-inline" role="status">{empty}</p>;
  return null;
}

export function DashboardPanel({ projects, projectsLoad, onRefreshProjects, onboarding, onOpenSetup, onPrepare, onAttempt }: Props) {
  const operation = useOperation(true);
  const active = useActiveAttempt(true);
  const queue = useQueue(null, true);
  const summary = operation.data;
  const refreshing = operation.loading || operation.refreshing || active.loading || active.refreshing || projectsLoad.loading || queue.load.status === 'loading';
  const queueObservation = queue.load.observation;
  const candidates = upcomingCandidates(queueObservation?.page.items ?? []);
  const queueFailure = queue.load.status === 'error' ? { message: queue.load.message, requestId: queue.load.requestId }
    : queue.load.status === 'loading' ? queue.load.previousError : null;
  const onboardingView = onboarding.load.snapshot?.settings.onboarding;

  const conditions = dashboardConditions([
    ...(summary?.impediments.filter(item => item.state !== 'passed').map(item => ({ ...item, previous: operation.stale || operation.refreshing })) ?? []),
    ...(onboardingView?.prerequisites.map(item => ({ code: item.code, cause: item.message, recovery: item.recovery, previous: Boolean(onboarding.load.error) || onboarding.load.refreshing })) ?? []),
    ...(queueObservation?.diagnostics.map(item => ({ code: item.code, cause: item.message, recovery: item.recovery, previous: Boolean(queueFailure), ...((item.code.startsWith('PROJECT_') && queueObservation.scope.project_ids.length === 1) ? { facts: { project_id: queueObservation.scope.project_ids[0]! } } : {}) })) ?? []),
  ]);

  return <div className="dashboard-panels" aria-label="Resumo operacional">
    <section className="card dashboard-context-card">
      <div className="line panel-title"><div><span className="eyebrow">Visão geral</span><h2>Operação</h2></div><div className="row"><button type="button" onClick={() => { if (refreshing) return; operation.refresh(); active.refresh(); queue.resetPages(); onRefreshProjects(); }} aria-disabled={refreshing}>Atualizar painel</button></div></div>
      <RequestNote loading={operation.loading} refreshing={operation.refreshing} error={operation.error} stale={operation.stale} label="conta e operação" />
{summary && <dl className="dashboard-facts"><div><dt>Conta GitHub</dt><dd>{summary.account.login ?? (summary.account.id ? 'Login ainda não consultado' : 'Sem vínculo confirmado')}</dd></div><div><dt>Automação</dt><dd>{summary.automation.dispatch_paused ? 'Pausada' : summary.automation.enabled ? 'Habilitada' : 'Desabilitada'}</dd></div><div><dt>Última observação Maestri</dt><dd>{summary.integration_status.state === 'observed' ? operatorState(summary.integration_status.observation?.state).label : 'Ainda não consultada'}{summary.integration_status.state === 'observed' && summary.integration_status.observation && !operatorState(summary.integration_status.observation.state).known && <UnknownState value={summary.integration_status.observation.state} />}</dd></div></dl>}
    </section>

    {!onboardingView && onboarding.load.loading && <section className="card onboarding-dashboard-card" role="status"><div><span className="eyebrow">Configuração inicial</span><h2>Consultando o progresso salvo…</h2></div></section>}
    {!onboardingView && onboarding.load.error && <section className="card onboarding-dashboard-card" aria-labelledby="onboarding-dashboard-title">
      <div><span className="eyebrow">Configuração inicial</span><h2 id="onboarding-dashboard-title">Não foi possível consultar o progresso</h2><p>{onboarding.load.error.message}</p><p><strong>Próxima ação:</strong> tente consultar novamente antes de salvar outra etapa.</p></div>
      <button type="button" onClick={() => void onboarding.refresh()}>Tentar novamente</button>
    </section>}
    {onboardingView && onboardingView.completed_at_ms === null && <section className="card onboarding-dashboard-card" aria-labelledby="onboarding-dashboard-title">
      <div><span className="eyebrow">Primeiros passos</span><h2 id="onboarding-dashboard-title">Configuração inicial</h2>
        <p>{onboardingView.first_incomplete_step ? `Próxima etapa: ${({ github: 'Conectar GitHub', projects_root: 'Escolher a pasta dos projetos', profiles: 'Configurar os perfis' } as const)[onboardingView.first_incomplete_step]}.` : 'As etapas estão prontas para conclusão.'}</p>
        {onboarding.load.error && <><small role="alert">A atualização falhou; consulte novamente antes de salvar. {onboarding.load.error.message}</small></>}
      </div>
      <button type="button" className="primary" data-initial-setup-trigger onClick={(event) => onOpenSetup(event.currentTarget)}>Continuar configuração</button>
    </section>}
    <div className="dashboard-grid">
      <section className="card dashboard-active">
        <div className="line panel-title"><div><span className="eyebrow">Agora</span><h2>Tentativa ativa</h2></div></div>
        <RequestNote loading={active.loading && !active.valid} refreshing={active.refreshing} error={active.error} stale={active.stale} empty={active.valid && !active.data ? 'Nenhuma tentativa ativa.' : undefined} label="a tentativa ativa" />
        {active.data && <AttemptStageSummary activity={summary?.active_attempt?.id === active.data.id ? summary.stage_activity : null} stale={active.stale || active.refreshing || operation.stale || operation.refreshing} />}
        {active.data && <div className="dashboard-record"><b>Issue #{active.data.issue_number}</b><p>Resultado: {operatorState(active.data.result ?? 'running').label}{active.data.suspension && !['HUMAN_DECISION', 'TRACKING_LOST'].includes(active.data.suspension) ? ` · ${operatorCodeLabel(active.data.suspension)}` : ''}</p>{[active.data.phase, ...(active.data.result ? [active.data.result] : [])].filter((value) => !operatorState(value).known).map((value) => <UnknownState key={value} value={value} />)}<button type="button" onClick={() => onAttempt(active.data!.id, active.data!.project_id)}>Abrir detalhe e ações disponíveis</button></div>}
      </section>

      <section className="card dashboard-blockers">
        <div className="line panel-title"><div><span className="eyebrow">Bloqueios</span><h2>Impedimentos atuais</h2></div><a href="#principal/configuracao">Configuração</a></div>
        <RequestNote loading={operation.loading} refreshing={operation.refreshing} error={operation.error} stale={operation.stale} empty={summary && conditions.length === 0 ? 'Nenhum impedimento observado nesta consulta.' : undefined} label="impedimentos" />
        {conditions.map((item, index) => { const destination = conditionDestination(item); const copy = diagnosticCopyFor(item.code, 'blocked', item.cause, item.recovery); return <div className="dashboard-record" key={index}><p>{item.previous && <strong>Leitura anterior · </strong>}{copy.cause}</p><a href={destination.href}>{destination.label}</a></div>; })}
      </section>

      <section className="card dashboard-queue">
        <div className="line panel-title"><div><span className="eyebrow">A seguir</span><h2>Próximos candidatos</h2></div><a href="#principal/fila">Abrir fila</a></div>
        <RequestNote loading={queue.load.status === 'loading' && !queueObservation && !queueFailure} refreshing={queue.load.status === 'loading' && Boolean(queueObservation)} error={queueFailure?.message ?? null} stale={Boolean(queueObservation) && (queue.load.status === 'error' || Boolean(queueFailure))} empty={queueObservation?.complete && candidates.length === 0 ? 'Nenhuma issue pronta nesta página da fila.' : undefined} label="candidatos" />
        {queueObservation && <>{queueObservation.complete !== true && <p className="notice compact-notice">A consulta está incompleta; a lista não confirma ausência de candidatos.</p>}{queue.pageNotice && <p className="stale-note" role="status">{queue.pageNotice}</p>}<ul className="dashboard-candidates">{candidates.map((candidate) => { const status = operatorState(candidate.status); return <li key={`${candidate.project_id}:${candidate.item_id}`}><div><b>{candidate.title ?? `Issue #${candidate.number ?? 'sem número'}`}</b><small>{candidate.project_name} · {status.label} · {candidate.eligible ? 'elegível nesta consulta' : 'Issue pronta · automação do projeto desabilitada'}</small>{!status.known && <UnknownState value={candidate.status ?? ''} />}</div>{candidate.issue_id && <button type="button" onClick={(event) => onPrepare(candidate.project_id, candidate.issue_id!, event.currentTarget)}>Preparar</button>}</li>; })}</ul><small className="muted">Elegíveis na fila: {queueObservation.eligible_total ?? 'não confirmado'} · Última atualização {queueObservation.observed_at_ms ? new Date(queueObservation.observed_at_ms).toLocaleTimeString('pt-BR') : 'não realizada'}</small></>}
      </section>

      <section className="card dashboard-results">
        <div className="line panel-title"><div><span className="eyebrow">Histórico</span><h2>Resultados recentes</h2></div><a href="#principal/tentativas">Ver histórico</a></div>
        <RequestNote loading={operation.loading} refreshing={operation.refreshing} error={operation.error} stale={operation.stale} empty={summary && summary.recent_results.length === 0 ? 'Nenhum resultado registrado.' : undefined} label="resultados" />
        {summary?.recent_results.map((result) => <article className="dashboard-record dashboard-result" key={result.id}><div><button type="button" className="result-link" onClick={() => onAttempt(result.id, result.project_id)}><b>Issue #{result.issue_number}</b>{result.issue_title ? ` - ${result.issue_title}` : ''}</button><small>{projects?.items.find(project => project.id === result.project_id)?.name ?? 'Projeto fora desta lista'}</small></div><div className="result-meta"><span className={`pill result-${result.result ?? 'running'}`}>{operatorState(result.result ?? result.phase).label}</span><time dateTime={new Date(result.updated_at_ms).toISOString()}>{new Date(result.updated_at_ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></div>{!operatorState(result.result ?? result.phase).known && <UnknownState value={result.result ?? result.phase} />}</article>)}
      </section>



      <section className="card dashboard-projects">
        <div className="line panel-title"><h2>Projetos recentes</h2><a href="#principal/projetos">Ver projetos</a></div>
        <RequestNote loading={projectsLoad.loading && !projects} refreshing={projectsLoad.refreshing} error={projectsLoad.error?.message ?? null} stale={projectsLoad.stale} empty={projectsLoad.empty ? 'Nenhum projeto cadastrado.' : undefined} label="projetos" />
        {projects?.items.slice(0, 4).map((project) => <div className="event" key={project.id}><div><b>{project.name}</b><p>{project.base_branch}</p></div><ProjectPrerequisiteStatus prerequisites={project.prerequisites} /></div>)}
      </section>
    </div>
  </div>;
}
