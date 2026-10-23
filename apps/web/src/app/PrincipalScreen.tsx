import { selectionAfterProjectDeletion } from '../features/projects/deletion-selection.js';
import { ProjectDeletionPendingNotice, knownProjectDeletion, forgetProjectDeletion } from '../features/projects/ProjectDeletionPendingNotice.js';
import { isProjectDeletionCompleted } from '../api/project-deletion.js';
import { useEffect, useRef, useState } from 'react';
import { ProjectPage, type SettingsView } from '#contracts';
import { Value } from '@sinclair/typebox/value';
import { requestJson, requestJsonWithMetadata, HttpError } from '../api/http.js';
import { buildHash, parseHash, routeIdentity, type PrincipalTab, type HashRoute } from './hash-route.js';
import { draftIdentity, getDraft, setDraft } from './drafts.js';
import { useProjects } from '../features/projects/useProjects.js';
import { ProjectConfigurationForm } from '../features/projects/ProjectForm.js';
import { QueuePanel } from '../features/queue/QueuePanel.js';
import { useQueue } from '../features/queue/useQueue.js';
import type { OperationView, HttpQueueSaved as QueueSaved } from '#contracts';
import { readUncertainOperations, recordUncertainOperation, resolveUncertainOperation } from '../api/uncertain-operations.js';
import { AttemptListPanel } from '../features/attempts/AttemptListPanel.js';
import { DashboardPanel } from '../features/operations/DashboardPanel.js';
import { RecordsPanel } from '../features/records/RecordsPanel.js';
import { ProfilesPanel } from '../features/projects/ProfilesPanel.js';
import type { OnboardingController } from '../features/onboarding/useOnboarding.js';

import { diagnosticCopyFor } from './operator-language.js';

type LoadState<T> = { status: 'loading'; previous?: T } | { status: 'read-error'; message: string; requestId: string | null; previous?: T } | { status: 'empty'; value: T } | { status: 'ready'; value: T };
type ReadData = ProjectPage | SettingsView | null;
type SaveIssue = { identity: string; message: string; requestId: string | null; kind: 'error' | 'conflict' };

function endpointFor(tab: PrincipalTab, search: string): `/api/v1/${string}` | null {
  const query = new URLSearchParams();
  if (search.trim()) query.set('search', search.trim());
  const suffix = query.toString();
  if (tab === 'dashboard' || tab === 'projetos') return `/api/v1/projects${suffix ? `?${suffix}` : ''}`;
  if (tab === 'configuracao') return '/api/v1/settings';
  return null;
}

function messageFor(error: unknown): { message: string; requestId: string | null } {
  if (error instanceof HttpError) {
    if (error.status === 403) return { message: 'A origem ou a proteção CSRF foi recusada. Reabra a Principal pela origem local autorizada e confira o diagnóstico do controlador.', requestId: error.requestId };
    if (error.status === 401) return { message: 'A sessão técnica não está disponível. Tente atualizar esta leitura.', requestId: error.requestId };
    return { message: error.message, requestId: error.requestId };
  }
  return { message: 'Não foi possível consultar o controlador local.', requestId: null };
}

function isEmptyResult(tab: PrincipalTab, value: ReadData): boolean {
  if (tab === 'projetos' && isProjectPage(value)) return value.items.length === 0;
  return false;
}

function usePanelData(route: HashRoute, search: string, reloadKey: number): LoadState<ReadData> {
  const { tab } = route;
  const identity = routeIdentity(route);
  const requestKey = `${identity}\u0000${search}\u0000${reloadKey}`;
  const [stored, setStored] = useState<{ key: string; state: LoadState<ReadData> }>({ key: '', state: { status: 'loading' } });
  const lastValue = useRef<ReadData | undefined>(undefined);
  const previousValue = 'value' in stored.state ? stored.state.value : stored.state.previous;
  useEffect(() => {
    const previousValue = lastValue.current;
    let current = true;
    const controller = new AbortController();
    const endpoint = endpointFor(tab, search);
    setStored({ key: requestKey, state: { status: 'loading', ...(previousValue !== undefined ? { previous: previousValue } : {}) } });
    if (!endpoint) {
      setStored({ key: requestKey, state: { status: 'ready', value: null } });
      return () => { current = false; controller.abort(); };
    }
    requestJson<ReadData>(endpoint, { signal: controller.signal }).then((value) => {
      if (current) {
        lastValue.current = value;
        setStored({ key: requestKey, state: isEmptyResult(tab, value) ? { status: 'empty', value } : { status: 'ready', value } });
      }
    }).catch((error: unknown) => {
      if (current && !(error instanceof DOMException && error.name === 'AbortError')) setStored({ key: requestKey, state: { status: 'read-error', ...messageFor(error), ...(previousValue !== undefined ? { previous: previousValue } : {}) } });
    });
    return () => { current = false; controller.abort(); };
  }, [tab, search, reloadKey, requestKey, identity]);
  return stored.key === requestKey ? stored.state : { status: 'loading', ...(previousValue !== undefined ? { previous: previousValue } : {}) };
}

function LoadMessage({ state, retry }: { state: LoadState<ReadData>; retry: () => void }) {
  if (state.status === 'loading') return <div className="card read-state" role="status"><span className="eyebrow">Controlador local</span><p>Consultando dados atuais…</p></div>;
  if (state.status === 'read-error') return <div className="card read-state" role="alert"><h2>Não foi possível carregar</h2><p>{state.message}</p><p><strong>Próxima ação:</strong> tente consultar novamente; os dados confirmados anteriormente continuam preservados.</p><button type="button" onClick={retry}>Tentar novamente</button></div>;
  return <></>;
}

function hasReadData(state: LoadState<ReadData>): state is { status: 'empty' | 'ready'; value: ReadData } {
  return state.status === 'empty' || state.status === 'ready';
}

export function PrincipalScreen({ route, onOpenDialog, onOpenProfileDialog, onOpenInitialSetup, onboarding, onActionError }: { route: HashRoute; onOpenDialog: (id: string, trigger: HTMLElement, context?: { projectId?: string; previousAttemptId?: string; attemptId?: string; issueId?: string }) => void; onOpenProfileDialog: (profileId: string | null, projectId: string | null, trigger: HTMLElement) => void; onOpenInitialSetup: (trigger: HTMLElement) => void; onboarding: OnboardingController; onActionError: (error: unknown) => void }) {
  const [saveIssues, setSaveIssues] = useState<SaveIssue[]>([]);
  const [projectNotice, setProjectNotice] = useState<string | null>(null);
  const identity = draftIdentity(route);
  const searchContext = route.params.get('search') ?? '';
  const [search, setSearch] = useState(() => getDraft<string>(identity, 'search') ?? searchContext);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => { setSearch(getDraft<string>(identity, 'search') ?? searchContext); }, [identity, searchContext]);
  const state = usePanelData(route, search, reloadKey);
  const projectsCatalog = useProjects(route.tab === 'projetos' ? search : '', route.tab === 'projetos');
  const queue = useQueue(null, route.tab === 'fila');
  const pauseCommand = useRef<{ operationId: string; scope: NonNullable<typeof queue.load.observation>['scope']; etag: string } | null>(null);
  const [pausing, setPausing] = useState(false);
  const [pauseUncertain, setPauseUncertain] = useState(false);
  const [pauseOperationId, setPauseOperationId] = useState<string | null>(null);
  const [pauseNotice, setPauseNotice] = useState('');
  useEffect(() => {
    const pendingOperations = readUncertainOperations().filter((operation) => ['queue-toggle', 'queue-enable', 'queue-pause'].includes(operation.kind)).sort((left, right) => left.recordedAt - right.recordedAt);
    const pending = pendingOperations[pendingOperations.length - 1];
    if (!pending) return;
    setPauseOperationId(pending.operationId);
    setPauseUncertain(true);
    setPauseNotice('Há uma alteração da fila sem confirmação. Consulte o estado atual antes de tentar outra ação.');
  }, []);
  const title = route.tab === 'dashboard' ? 'Dashboard' : ({ projetos: 'Projetos', perfis: 'Perfis Globais', fila: 'Fila Ready', tentativas: 'Tentativas', registros: 'Registros', configuracao: 'Configuração' } as const)[route.tab];

  const data = hasReadData(state) ? state.value : null;
  const previousData = hasReadData(state) ? null : state.previous ?? null;
  const projectPage = (route.tab === 'dashboard' || route.tab === 'projetos') && isProjectPage(data) ? data : null;
  const dashboardProjects = projectPage ?? ((route.tab === 'dashboard' || route.tab === 'projetos') && isProjectPage(previousData) ? previousData : null);
  const selectedProjectId = route.params.get('projectId') ?? '';
  useEffect(() => {
    const clearSelection = (projectId: string) => {
      const current = parseHash(window.location.hash);
      const next = selectionAfterProjectDeletion(current.params, projectId);
      if (!next) return;
      window.history.replaceState(null, '', buildHash(current.tab, next));
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      requestAnimationFrame(() => { if (new URLSearchParams(window.location.hash.split('?')[1] ?? '').has('projectId')) return; const target = document.querySelector<HTMLElement>('#configuration-project, main h1, main h2'); target?.setAttribute('tabindex', '-1'); target?.focus(); });
    };
    const completed = (event: Event) => {
      const projectId = (event as CustomEvent<{ projectId?: string }>).detail?.projectId;
      if (projectId) {
        forgetProjectDeletion(projectId);
        clearSelection(projectId);
        setSaveIssues(current => current.filter(issue => issue.identity !== projectId));
      }
      setProjectNotice('Projeto excluído.');
      setReloadKey(value => value + 1);
    };
    const unavailable = (event: Event) => {
      const projectId = (event as CustomEvent<{ projectId?: string }>).detail?.projectId;
      if (!projectId || parseHash(window.location.hash).params.get('projectId') !== projectId) return;
      clearSelection(projectId);
      setSaveIssues(current => current.filter(issue => issue.identity !== projectId));
      setProjectNotice(current => current ?? 'O projeto selecionado não está disponível. A seleção foi limpa.');
    };
    window.addEventListener('factory-project-deleted', completed);
    window.addEventListener('factory-project-unavailable', unavailable);
    const controller = new AbortController();
    if (selectedProjectId && !route.error) {
      if (isProjectDeletionCompleted(selectedProjectId)) clearSelection(selectedProjectId);
      else void requestJson<unknown>(`/api/v1/projects/${encodeURIComponent(selectedProjectId)}`, { signal: controller.signal }).catch((error: unknown) => {
        if (!controller.signal.aborted && error instanceof HttpError && error.status === 404) {
          window.dispatchEvent(new CustomEvent('factory-project-unavailable', { detail: { projectId: selectedProjectId } }));
        }
      });
    }
    return () => {
      controller.abort();
      window.removeEventListener('factory-project-deleted', completed);
      window.removeEventListener('factory-project-unavailable', unavailable);
    };
  }, [route.tab, selectedProjectId, route.error]);
  if (route.error) return <section className="card route-error" role="alert"><span className="eyebrow">Navegação</span><h1>Contexto inválido</h1><p>{route.error}</p><a href="#principal/dashboard">Voltar para a Principal</a></section>;

  const preparationProjectId = selectedProjectId || (route.tab === 'dashboard' ? dashboardProjects : projectPage)?.items[0]?.id || '';
  const isFilteredList = route.tab === 'projetos' || route.tab === 'registros';

  async function consultPause(): Promise<void> {
    const operationId = pauseCommand.current?.operationId ?? pauseOperationId;
    if (!operationId || pausing || !pauseUncertain) return;
    setPausing(true);
    try {
      const operation = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(operationId)}`);
      if (operation.state === 'succeeded') {
        resolveUncertainOperation(operationId);
        pauseCommand.current = null;
        setPauseOperationId(null);
        setPauseUncertain(false);
        setPauseNotice('A alteração da fila foi confirmada pelo recibo. O estado atual será consultado novamente; tentativas ativas permanecem preservadas.');
        queue.resetPages();
      } else if (operation.state === 'failed') {
        resolveUncertainOperation(operationId);
        pauseCommand.current = null;
        setPauseOperationId(null);
        setPauseUncertain(false);
        setPauseNotice(operation.error?.message ?? 'O controlador confirmou que a alteração da fila falhou. O estado será consultado novamente.');
        queue.resetPages();
      } else {
        setPauseNotice('A alteração da fila ainda não foi confirmada. Consulte novamente antes de tentar outra ação.');
      }
    } catch (error: unknown) {
      setPauseNotice('Não foi possível consultar o resultado. A alteração não será enviada novamente até confirmar o estado da fila.');
      onActionError(error);
    } finally {
      setPausing(false);
    }
  }

  return <>
    {projectNotice && <section className="notice" role="status"><p>{projectNotice}</p><button type="button" onClick={() => setProjectNotice(null)}>Dispensar aviso</button></section>}
    <div className="line heading">
      <div><h1>{title}</h1>{route.tab === 'dashboard' && <span className="muted">Acompanhe a operação e os últimos resultados dos seus projetos.</span>}</div>
      <div className="row">{route.tab === 'projetos' && <><button type="button" className="primary" onClick={(event) => onOpenDialog('create', event.currentTarget)}>Criar projeto</button><button type="button" onClick={(event) => onOpenDialog('register', event.currentTarget)}>Adicionar existente</button></>}{route.tab === 'dashboard' && <button type="button" className="primary" disabled={!preparationProjectId || Boolean(knownProjectDeletion(preparationProjectId))} aria-describedby={!preparationProjectId ? 'preparation-unavailable' : undefined} onClick={(event) => onOpenDialog('preparation', event.currentTarget, { projectId: preparationProjectId })}>Preparar issue</button>}</div>
    </div>
    {route.tab === 'dashboard' && !preparationProjectId && <p id="preparation-unavailable" className="muted">{state.status === 'loading' ? 'Aguarde a consulta dos projetos para preparar uma issue.' : state.status === 'read-error' ? 'Não foi possível consultar os projetos. Tente novamente abaixo para preparar uma issue.' : <>Cadastre um projeto para preparar uma issue. <a href="#principal/projetos">Abrir projetos</a></>}</p>}
    {route.tab === 'perfis' && <p className="profiles-page-description">Perfis reutilizáveis para os papéis de Implementador e Revisor, compartilhados entre os projetos desta instalação.</p>}
    {isFilteredList && route.tab === 'projetos' && <div className="toolbar"><label className="search-label">Filtrar {title.toLocaleLowerCase('pt-BR')}<input value={search} onChange={(event) => {
      const nextSearch = event.currentTarget.value;
      setSearch(nextSearch);
      setDraft(identity, 'search', nextSearch);
      const params = new URLSearchParams(route.params);
      if (nextSearch) params.set('search', nextSearch); else params.delete('search');
      window.history.replaceState(null, '', `#principal/${route.tab}${params.size ? `?${params.toString()}` : ''}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }} aria-label={`Filtrar ${title.toLocaleLowerCase('pt-BR')}`} placeholder="Filtrar por texto" /></label></div>}
    {route.tab !== 'dashboard' && route.tab !== 'perfis' && <LoadMessage state={state} retry={() => setReloadKey((value) => value + 1)} />}
    {saveIssues.map((issue) => <section className="card read-state" role="alert" key={issue.identity}><h2>{issue.kind === 'conflict' ? 'Conflito ao salvar configuração' : 'Falha ao salvar configuração'}</h2><p>{issue.message}</p><p><strong>Próxima ação:</strong> abra a configuração relacionada e consulte os dados atuais antes de salvar novamente.</p><div className="row"><a className="button-link" href={issue.identity === 'global-settings' ? '#principal/configuracao' : `#principal/projetos?dialog=project-configuration&projectId=${encodeURIComponent(issue.identity)}`}>Abrir configuração relacionada</a><button type="button" onClick={() => setSaveIssues((current) => current.filter((item) => item.identity !== issue.identity))}>Dispensar após conferir</button></div></section>)}
    {route.tab === 'projetos' && <>
      {projectsCatalog.error && <section className="card read-state" role="alert"><h2>Falha ao consultar projetos</h2><p>{projectsCatalog.error.message}</p><button type="button" onClick={projectsCatalog.retry}>Tentar novamente</button></section>}
      {!projectsCatalog.error && projectsCatalog.loading && !projectsCatalog.page && <section className="card read-state" role="status"><p>Consultando catálogo de projetos…</p></section>}
      {!projectsCatalog.error && projectsCatalog.page && projectsCatalog.page.items.length === 0 && <section className="card empty" role="status"><h2>{search.trim() ? 'Nenhuma correspondência' : 'Nenhum projeto cadastrado'}</h2><p>{search.trim() ? 'Altere o filtro ou cadastre uma origem.' : 'Cadastre uma origem para configurar o projeto.'}</p></section>}
      {projectsCatalog.page && projectsCatalog.page.items.length > 0 && <section className="card project-catalog"><div className="table-wrap"><table><thead><tr><th>Projeto / origem</th><th>Branch-base</th><th>Pré-requisitos</th><th>Ações</th></tr></thead><tbody>{projectsCatalog.page.items.map((project) => <tr key={project.id}><td data-label="Projeto / origem"><b>{project.name}</b><br /><small className="mono">{project.source.location}</small><br /><small>{project.source.kind === 'local' ? 'Origem local' : 'GitHub'}</small></td><td data-label="Branch-base" className="mono">{project.base_branch}</td><td data-label="Pré-requisitos">{project.prerequisites.some((item) => item.code !== 'EXECUTION_REVALIDATION_REQUIRED') ? <ul className="compact-list">{project.prerequisites.filter((item) => item.code !== 'EXECUTION_REVALIDATION_REQUIRED').map((item) => <li key={item.code}>{diagnosticCopyFor(item.code, 'blocked', item.message, item.recovery).cause}</li>)}</ul> : <span className="project-ready">Sem impedimentos registrados</span>}</td><td data-label="Ações"><div className="row project-row-actions"><button type="button" className="button-link" onClick={(event) => onOpenDialog('project-configuration', event.currentTarget, { projectId: project.id })}>Selecionar projeto</button>{project.deletion ? <ProjectDeletionPendingNotice projectId={project.id} projectName={project.name} revision={project.revision} deletion={project.deletion} /> : <button type="button" onClick={(event) => onOpenDialog('preparation', event.currentTarget, { projectId: project.id })}>Preparar</button>}</div></td></tr>)}</tbody></table></div>{projectsCatalog.page.has_more && <div className="pagination-actions"><button type="button" onClick={() => void projectsCatalog.loadMore()} disabled={projectsCatalog.loading}>{projectsCatalog.loading ? 'Carregando…' : 'Carregar próxima página'}</button></div>}</section>}
    </>}
    {route.tab === 'dashboard' && <DashboardPanel projects={dashboardProjects} projectsLoad={{ loading: state.status === 'loading', refreshing: state.status === 'loading' && Boolean(dashboardProjects), error: state.status === 'read-error' ? { message: state.message, requestId: state.requestId } : null, stale: Boolean(dashboardProjects) && (state.status === 'loading' || state.status === 'read-error'), empty: state.status !== 'loading' && state.status !== 'read-error' && isProjectPage(state.value) && state.value.items.length === 0 }} onboarding={onboarding} onOpenSetup={onOpenInitialSetup} onRefreshProjects={() => setReloadKey((value) => value + 1)} onPrepare={(projectId, issueId, trigger) => onOpenDialog('preparation', trigger, { projectId, issueId })} onAttempt={(attemptId, projectId) => {
      const params = new URLSearchParams(route.params);
      params.set('attemptId', attemptId); params.set('projectId', projectId); params.set('dialog', 'detail');
      window.location.hash = buildHash('tentativas', params);
    }} />}
    {route.tab === 'registros' && <RecordsPanel key={`${route.params.get('projectId') ?? ''}:${route.params.get('attemptId') ?? ''}:${route.params.get('operationId') ?? ''}`} filters={{ projectId: route.params.get('projectId') ?? '', attemptId: route.params.get('attemptId') ?? '', operationId: route.params.get('operationId') ?? '' }} onFilterChange={(filters) => {
      const params = new URLSearchParams(route.params);
      for (const key of ['projectId', 'attemptId', 'operationId'] as const) { if (filters[key]) params.set(key, filters[key]); else params.delete(key); }
      window.history.replaceState(null, '', buildHash('registros', params));
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }} />}
    {route.tab === 'perfis' && <ProfilesPanel onOpenProfileDialog={onOpenProfileDialog} />}
    {route.tab === 'configuracao' && <>
      <p className="muted">Ajustes compartilhados por todos os projetos desta instalação. Para configurar um projeto, <a href="#principal/projetos">abra o catálogo de projetos</a> e selecione-o.</p>
      <ProjectConfigurationForm projectId={null} onSaveIssue={(issue, identity) => setSaveIssues((current) => issue ? [...current.filter((item) => item.identity !== issue.identity), issue] : current.filter((item) => item.identity !== identity))} />
    </>}
    {route.tab === 'fila' && <QueuePanel load={queue.load} pageNotice={queue.pageNotice} pauseNotice={pauseNotice} pauseUncertain={pauseUncertain} onConsultPause={() => void consultPause()} onRefresh={queue.resetPages} onNextPage={queue.nextPage} onPreviousPage={queue.previousPage} canGoBack={queue.canGoBack} pausing={pausing}
      onEnable={(trigger) => onOpenDialog('enable-queue', trigger)} onPause={() => {
        const observation = queue.load.observation;
        const etag = queue.load.etag;
        if (pausing || pauseUncertain || !observation || !etag || !observation.enabled) return;
        const command = pauseCommand.current ?? { operationId: crypto.randomUUID(), scope: observation.scope, etag };
        pauseCommand.current = command;
        setPausing(true);
        setPauseNotice('');
        void requestJsonWithMetadata<QueueSaved>('/api/v1/queue', { method: 'PUT', headers: { 'If-Match': command.etag, 'Idempotency-Key': command.operationId }, body: JSON.stringify({ enabled: false, scope: command.scope }) })
          .then(({ data }) => {
            if (data.operation_id !== command.operationId || !data.receipt) throw new Error('O recibo de pausa não corresponde à operação solicitada.');
            resolveUncertainOperation(command.operationId);
            pauseCommand.current = null;
            setPauseOperationId(null);
            setPauseUncertain(false);
            queue.resetPages();
          }).catch((error: unknown) => {
            if (error instanceof HttpError && error.status < 500) {
              resolveUncertainOperation(command.operationId);
              pauseCommand.current = null;
              setPauseOperationId(null);
              setPauseUncertain(false);
              queue.resetPages();
            } else {
              try { recordUncertainOperation({ operationId: command.operationId, kind: 'queue-pause', recordedAt: Date.now() }); } catch { /* Keep the command identity in memory. */ }
              setPauseOperationId(command.operationId);
              setPauseUncertain(true);
              setPauseNotice('A resposta não foi confirmada. Consulte o estado atual da fila antes de tentar outra ação.');
            }
            onActionError(error);
          }).finally(() => setPausing(false));
      }} onAuthority={(attemptId, trigger) => onOpenDialog('authority', trigger, { attemptId })} />}
    {route.tab === 'tentativas' && <AttemptListPanel key={`${selectedProjectId}:${route.params.get('filter') ?? ''}`} projectId={selectedProjectId} result={route.params.get('filter') ?? ''} onFilterChange={(projectId, result) => {
      const params = new URLSearchParams(route.params);
      if (projectId) params.set('projectId', projectId); else params.delete('projectId');
      if (result) params.set('filter', result); else params.delete('filter');
      params.delete('attemptId'); params.delete('deliveryId'); params.delete('roundId'); params.delete('dialog');
      window.location.hash = buildHash('tentativas', params);
    }} onPrepareRetry={(attemptId, projectId) => onOpenDialog('preparation', document.activeElement as HTMLElement, { projectId, previousAttemptId: attemptId })} onDetail={(attemptId, projectId) => {
      onOpenDialog('detail', document.activeElement as HTMLElement, { attemptId, projectId });
    }} />}
  </>;
}

export function isProjectPage(value: unknown): value is ProjectPage { return Value.Check(ProjectPage, value); }
