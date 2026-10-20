import type { ProjectPage, HttpQueueItem } from '#contracts';
import { useActiveAttempt } from './useActiveAttempt.js';
import { useOperation } from './useOperation.js';
import { useQueue } from '../queue/useQueue.js';
import type { OnboardingController } from '../onboarding/useOnboarding.js';
import { OperatorDiagnosticCard, UnknownState } from '../../app/OperatorSupport.js';
import { operatorState } from '../../app/operator-language.js';

type Props = {
  projects: ProjectPage | null;
  projectsLoad: { loading: boolean; refreshing: boolean; error: { message: string; requestId: string | null } | null; stale: boolean; empty: boolean };
  onRefreshProjects: () => void;
  onboarding: OnboardingController;
  onOpenSetup: (trigger: HTMLElement) => void;
  onPrepare: (projectId: string, issueId: string, trigger: HTMLElement) => void;
  onAttempt: (attemptId: string, projectId: string) => void;
};

export function upcomingCandidates(items: readonly HttpQueueItem[]): HttpQueueItem[] {
  return items.filter((item) => item.eligible || (item.ready_eligible && item.reasons.length > 0 && item.reasons.every((reason) => reason === 'AUTOMATION_DISABLED'))).slice(0, 5);
}

function RequestNote({ loading, refreshing, error, stale, empty, label }: {
  loading: boolean; refreshing: boolean; error: string | null; stale: boolean; empty?: string | undefined; label: string;
}) {
  if (error) return <div className="read-state read-state-inline" role="alert"><b>Falha nesta consulta</b><p>{error}</p><p className="muted"><strong>Próxima ação:</strong> Atualize esta seção; a leitura anterior continua identificada enquanto isso.</p>{stale && <p className="stale-note">Os dados abaixo são da consulta anterior.</p>}</div>;
  if (loading) return <p className="muted" role="status">Consultando {label}…</p>;
  if (refreshing || stale) return <p className="stale-note" role="status">Atualizando; os dados exibidos são da consulta anterior.</p>;
  if (empty) return <p className="empty-inline" role="status">{empty}</p>;
  return null;
}

export function DashboardPanel({ projects, projectsLoad, onRefreshProjects, onboarding, onOpenSetup, onPrepare, onAttempt }: Props) {
  const operation = useOperation(true);
  const active = useActiveAttempt(true);
  const queue = useQueue(null, true);
  const summary = operation.data;
  const queueObservation = queue.load.observation;
  const candidates = upcomingCandidates(queueObservation?.page.items ?? []);
  const queueFailure = queue.load.status === 'error' ? { message: queue.load.message, requestId: queue.load.requestId }
    : queue.load.status === 'loading' ? queue.load.previousError : null;
  const onboardingView = onboarding.load.snapshot?.settings.onboarding;

  return <div className="dashboard-panels" aria-label="Resumo operacional">
    <section className="card dashboard-context-card">
      <div className="line panel-title"><div><span className="eyebrow">Conta e executor</span><h2>Contexto da esteira</h2></div><button type="button" onClick={operation.refresh} disabled={operation.loading || operation.refreshing}>Atualizar</button></div>
      <RequestNote loading={operation.loading} refreshing={operation.refreshing} error={operation.error} stale={operation.stale} label="conta e operação" />
      {summary && <><dl className="dashboard-facts"><div><dt>Conta vinculada</dt><dd>{summary.account.login ?? (summary.account.id ? 'Login ainda não consultado' : 'Sem vínculo confirmado')}</dd></div><div><dt>Automação</dt><dd>{summary.automation.enabled ? 'Habilitada' : 'Desabilitada'}{summary.automation.dispatch_paused && <small>Novos despachos estão pausados.</small>}</dd></div><div><dt>Integração local</dt><dd>Maestri nativo · {summary.integration_status.state === 'observed' ? operatorState(summary.integration_status.observation?.state).label : 'Ainda não consultada'}<small>Esta observação não comprova uma execução do provider.</small>{summary.integration_status.state === 'observed' && summary.integration_status.observation && !operatorState(summary.integration_status.observation.state).known && <UnknownState value={summary.integration_status.observation.state} />}</dd></div></dl><a className="button-link" href="#principal/configuracao">Abrir configuração</a></>}
    </section>

    {!onboardingView && onboarding.load.loading && <section className="card onboarding-dashboard-card" role="status"><div><span className="eyebrow">Configuração inicial</span><h2>Consultando o progresso salvo…</h2></div></section>}
    {!onboardingView && onboarding.load.error && <section className="card onboarding-dashboard-card" aria-labelledby="onboarding-dashboard-title">
      <div><span className="eyebrow">Configuração inicial</span><h2 id="onboarding-dashboard-title">Não foi possível consultar o progresso</h2><p>{onboarding.load.error.message}</p><p><strong>Próxima ação:</strong> tente consultar novamente antes de salvar outra etapa.</p></div>
      <button type="button" onClick={() => void onboarding.refresh()}>Tentar novamente</button>
    </section>}
    {onboardingView && onboardingView.completed_at_ms === null && <section className="card onboarding-dashboard-card" aria-labelledby="onboarding-dashboard-title">
      <div><span className="eyebrow">Primeiros passos</span><h2 id="onboarding-dashboard-title">Configuração inicial</h2>
        <p>{onboardingView.first_incomplete_step ? `Próxima etapa: ${({ github: 'Conectar GitHub', projects_root: 'Escolher a pasta dos projetos', profiles: 'Configurar os perfis' } as const)[onboardingView.first_incomplete_step]}.` : 'As etapas estão prontas para conclusão.'}</p>
        {onboarding.load.refreshing && <small role="status">Atualizando o progresso salvo…</small>}
        {onboarding.load.error && <><small role="alert">A atualização falhou; consulte novamente antes de salvar. {onboarding.load.error.message}</small></>}
      </div>
      <button type="button" className="primary" data-initial-setup-trigger onClick={(event) => onOpenSetup(event.currentTarget)}>Continuar configuração</button>
    </section>}
    {onboardingView && onboardingView.completed_at_ms !== null && onboardingView.prerequisites.length > 0 && <section className="card onboarding-dashboard-card onboarding-dashboard-followup" aria-labelledby="onboarding-followup-title">
      <div><span className="eyebrow">Configuração inicial concluída</span><h2 id="onboarding-followup-title">Pendências da operação</h2>
        <ul className="compact-list">{onboardingView.prerequisites.map((item) => <li key={item.code}><OperatorDiagnosticCard code={item.code} state="blocked" cause={item.message} recovery={item.recovery} /><a href={item.code.toLocaleLowerCase('en').includes('profile') ? '#principal/perfis' : '#principal/configuracao'}>Abrir {item.code.toLocaleLowerCase('en').includes('profile') ? 'Perfis' : 'Configuração'}</a></li>)}</ul>
      </div>
    </section>}

    <div className="dashboard-grid">
      <section className="card">
        <div className="line panel-title"><div><span className="eyebrow">Execução atual</span><h2>Tentativa ativa</h2></div><button type="button" onClick={active.refresh} disabled={active.loading || active.refreshing}>Atualizar</button></div>
        <RequestNote loading={active.loading} refreshing={active.refreshing} error={active.error} stale={active.stale} empty={active.valid && !active.data ? 'Nenhuma tentativa ativa.' : undefined} label="a tentativa ativa" />
        {active.data && <div className="dashboard-record"><b>Issue #{active.data.issue_number}</b><p>Etapa: {operatorState(active.data.phase).label} · Resultado: {operatorState(active.data.result ?? 'running').label}{active.data.suspension ? ` · ${operatorState(active.data.suspension).label}` : ''}</p>{[active.data.phase, ...(active.data.result ? [active.data.result] : []), ...(active.data.suspension ? [active.data.suspension] : [])].filter((value) => !operatorState(value).known).map((value) => <UnknownState key={value} value={value} />)}<button type="button" onClick={() => onAttempt(active.data!.id, active.data!.project_id)}>Abrir detalhe e ações disponíveis</button></div>}
      </section>

      <section className="card">
        <div className="line panel-title"><div><span className="eyebrow">Fila Ready</span><h2>Próximos candidatos</h2></div><a href="#principal/fila">Abrir fila</a></div>
        {queueObservation?.diagnostics.filter(item => ['GLOBAL_AUTOMATION_PAUSED', 'PROJECT_QUEUE_BLOCKED', 'PROJECT_NOT_READY', 'PROJECT_MAPPING_INVALID'].includes(item.code)).map(item => <OperatorDiagnosticCard key={`${item.code}:${item.message}`} code={item.code} state="blocked" cause={item.message} recovery={item.recovery} />)}
        <RequestNote loading={queue.load.status === 'loading' && !queueObservation && !queueFailure} refreshing={queue.load.status === 'loading' && Boolean(queueObservation)} error={queueFailure?.message ?? null} stale={Boolean(queueObservation) && (queue.load.status === 'error' || Boolean(queueFailure))} empty={queue.load.status === 'ready' && queueObservation?.complete && candidates.length === 0 ? 'Nenhuma issue pronta nesta página da fila.' : undefined} label="candidatos" />
        {queueObservation && <>{queueObservation.complete !== true && <p className="notice compact-notice">A consulta está incompleta; a lista não confirma ausência de candidatos.</p>}{queue.pageNotice && <p className="stale-note" role="status">{queue.pageNotice}</p>}<ul className="dashboard-candidates">{candidates.map((candidate) => { const status = operatorState(candidate.status); return <li key={`${candidate.project_id}:${candidate.item_id}`}><div><b>{candidate.title ?? `Issue #${candidate.number ?? 'sem número'}`}</b><small>{candidate.project_name} · {status.label} · {candidate.eligible ? 'elegível nesta consulta' : 'Issue pronta · automação do projeto desabilitada'}</small>{!status.known && <UnknownState value={candidate.status ?? ''} />}</div>{candidate.issue_id && <button type="button" onClick={(event) => onPrepare(candidate.project_id, candidate.issue_id!, event.currentTarget)}>Preparar</button>}</li>; })}</ul><small className="muted">Elegíveis na fila: {queueObservation.eligible_total ?? 'não confirmado'} · Observação {queueObservation.observed_at_ms ? new Date(queueObservation.observed_at_ms).toLocaleTimeString('pt-BR') : 'não realizada'}</small></>}
      </section>

      <section className="card">
        <div className="line panel-title"><div><span className="eyebrow">Histórico</span><h2>Resultados recentes</h2></div><a href="#principal/tentativas">Ver histórico</a></div>
        <RequestNote loading={operation.loading} refreshing={operation.refreshing} error={operation.error} stale={operation.stale} empty={summary && summary.recent_results.length === 0 ? 'Nenhum resultado registrado.' : undefined} label="resultados" />
        {summary?.recent_results.map((result) => <article className="dashboard-record" key={result.id}><div className="line"><b>Issue #{result.issue_number}</b><span className="pill neutral">{operatorState(result.result ?? result.phase).label}</span></div>{!operatorState(result.result ?? result.phase).known && <UnknownState value={result.result ?? result.phase} />}<button type="button" onClick={() => onAttempt(result.id, result.project_id)}>Abrir detalhe</button></article>)}
      </section>

      <section className="card">
        <div className="line panel-title"><div><span className="eyebrow">Bloqueios</span><h2>Impedimentos atuais</h2></div><a href="#principal/registros">Diagnóstico</a></div>
        <RequestNote loading={operation.loading} refreshing={operation.refreshing} error={operation.error} stale={operation.stale} empty={summary && summary.impediments.length === 0 ? 'Nenhum impedimento observado nesta consulta.' : undefined} label="impedimentos" />
        {summary?.impediments.map((item, index) => <div key={`${item.check}:${item.code}:${index}`}><OperatorDiagnosticCard code={item.code} state={item.state} cause={item.cause} recovery={item.recovery} />{item.facts.attempt_id && <button type="button" onClick={() => onAttempt(item.facts.attempt_id!, item.facts.project_id ?? '')}>Abrir tentativa</button>}</div>)}
      </section>

      <section className="card dashboard-projects">
        <div className="line panel-title"><h2>Projetos recentes</h2><div className="row"><button type="button" onClick={onRefreshProjects} disabled={projectsLoad.loading}>Atualizar</button><a href="#principal/projetos">Ver projetos</a></div></div>
        <RequestNote loading={projectsLoad.loading && !projects} refreshing={projectsLoad.refreshing} error={projectsLoad.error?.message ?? null} stale={projectsLoad.stale} empty={projectsLoad.empty ? 'Nenhum projeto cadastrado.' : undefined} label="projetos" />
        {projects?.items.slice(0, 4).map((project) => <div className="event" key={project.id}><span className="eyebrow">Projeto</span><div><b>{project.name}</b><p>{project.base_branch} · {project.prerequisites.length ? `${project.prerequisites.length} pré-requisitos pendentes` : 'configuração disponível'}</p></div></div>)}
      </section>
    </div>
  </div>;
}
