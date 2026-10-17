import { useEffect, useRef, useState } from 'react';
import type { EventPage, ProjectPage, SettingsView } from '#contracts';
import { requestJson, HttpError } from '../api/http.js';
import { buildHash, routeIdentity, type PrincipalTab, type HashRoute } from './hash-route.js';
import { draftIdentity, getDraft, setDraft } from './drafts.js';
import { useProjects } from '../features/projects/useProjects.js';
import { ProjectConfigurationForm } from '../features/projects/ProjectForm.js';
import { QueuePanel } from '../features/queue/QueuePanel.js';
import { useQueue } from '../features/queue/useQueue.js';
import type { QueueSaved } from '#contracts';
import { requestJsonWithMetadata } from '../api/http.js';
import { recordUncertainOperation, resolveUncertainOperation } from '../api/uncertain-operations.js';
import { AttemptListPanel } from '../features/attempts/AttemptListPanel.js';

type LoadState<T> = { status: 'loading' } | { status: 'read-error'; message: string; requestId: string | null } | { status: 'empty'; value: T } | { status: 'ready'; value: T };
type ReadData = ProjectPage | SettingsView | EventPage | null;

function endpointFor(tab: PrincipalTab, search: string): `/api/v1/${string}` | null {
  const query = new URLSearchParams();
  if (search.trim()) query.set('search', search.trim());
  const suffix = query.toString();
  if (tab === 'dashboard' || tab === 'projetos') return `/api/v1/projects${suffix ? `?${suffix}` : ''}`;
  if (tab === 'configuracao') return '/api/v1/settings';
  if (tab === 'registros') return '/api/v1/events';
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

function isEmptyResult(tab: PrincipalTab, value: ReadData, search: string): boolean {
  if (tab === 'projetos' && isProjectPage(value)) return value.items.length === 0;
  if (tab === 'registros' && isEventPage(value)) return value.items.filter((event) => !search || `${event.entityType} ${event.eventType} ${event.entityId}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).length === 0;
  return false;
}

function usePanelData(route: HashRoute, search: string, reloadKey: number): LoadState<ReadData> {
  const { tab } = route;
  const identity = routeIdentity(route);
  const requestKey = `${identity}\u0000${search}\u0000${reloadKey}`;
  const [stored, setStored] = useState<{ key: string; state: LoadState<ReadData> }>({ key: '', state: { status: 'loading' } });
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const endpoint = endpointFor(tab, search);
    setStored({ key: requestKey, state: { status: 'loading' } });
    if (!endpoint) {
      setStored({ key: requestKey, state: { status: 'ready', value: null } });
      return () => { current = false; controller.abort(); };
    }
    requestJson<ReadData>(endpoint, { signal: controller.signal }).then((value) => {
      if (current) setStored({ key: requestKey, state: isEmptyResult(tab, value, search) ? { status: 'empty', value } : { status: 'ready', value } });
    }).catch((error: unknown) => {
      if (current && !(error instanceof DOMException && error.name === 'AbortError')) setStored({ key: requestKey, state: { status: 'read-error', ...messageFor(error) } });
    });
    return () => { current = false; controller.abort(); };
  }, [tab, search, reloadKey, requestKey, identity]);
  return stored.key === requestKey ? stored.state : { status: 'loading' };
}

function LoadMessage({ state, retry }: { state: LoadState<ReadData>; retry: () => void }) {
  if (state.status === 'loading') return <div className="card read-state" role="status"><span className="eyebrow">Controlador local</span><p>Consultando dados atuais…</p></div>;
  if (state.status === 'read-error') return <div className="card read-state" role="alert"><h2>Não foi possível carregar</h2><p>{state.message}</p>{state.requestId && <p className="mono muted">Solicitação {state.requestId}</p>}<button type="button" onClick={retry}>Tentar novamente</button></div>;
  return <></>;
}

function hasReadData(state: LoadState<ReadData>): state is { status: 'empty' | 'ready'; value: ReadData } {
  return state.status === 'empty' || state.status === 'ready';
}

export function PrincipalScreen({ route, onOpenDialog, onActionError }: { route: HashRoute; onOpenDialog: (id: string, trigger: HTMLElement, context?: { projectId?: string; previousAttemptId?: string; attemptId?: string }) => void; onActionError: (error: unknown) => void }) {
  const identity = draftIdentity(route);
  const searchContext = route.params.get('search') ?? '';
  const [search, setSearch] = useState(() => getDraft<string>(identity, 'search') ?? searchContext);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => { setSearch(getDraft<string>(identity, 'search') ?? searchContext); }, [identity, searchContext]);
  const state = usePanelData(route, search, reloadKey);
  const projectsCatalog = useProjects(route.tab === 'projetos' ? search : '', route.tab === 'projetos' || route.tab === 'configuracao');
  const queue = useQueue(null, route.tab === 'fila');
  const pauseCommand = useRef<{ operationId: string; scope: NonNullable<typeof queue.load.observation>['scope']; etag: string } | null>(null);
  const [pausing, setPausing] = useState(false);
  const title = route.tab === 'dashboard' ? 'Dashboard' : ({ projetos: 'Projetos', fila: 'Fila Ready', tentativas: 'Tentativas', registros: 'Registros', configuracao: 'Configuração' } as const)[route.tab];

  if (route.error) return <section className="card route-error" role="alert"><span className="eyebrow">Navegação</span><h1>Contexto inválido</h1><p>{route.error}</p><a href="#principal/dashboard">Voltar para a Principal</a></section>;

  const data = hasReadData(state) ? state.value : null;
  const projectPage = (route.tab === 'dashboard' || route.tab === 'projetos') && isProjectPage(data) ? data : null;
  const events = route.tab === 'registros' && isEventPage(data) ? data : null;
  const settings = isSettingsView(data) ? data : null;
  const selectedProjectId = route.params.get('projectId') ?? '';
  const selectedProjectIsOnPage = projectsCatalog.page?.items.some((project) => project.id === selectedProjectId) ?? false;
  const preparationProjectId = selectedProjectId || projectPage?.items[0]?.id || '';
  const isFilteredList = route.tab === 'projetos' || route.tab === 'registros';

  return <>
    <div className="line heading">
      <div><div className="eyebrow">Operação / {title}</div><h1>{title}</h1><span className="muted">Controlador local · dados consultados sob demanda</span></div>
      <div className="row">{route.tab === 'projetos' && <><button type="button" className="primary" onClick={(event) => onOpenDialog('register', event.currentTarget)}>Cadastrar origem</button><button type="button" disabled={!selectedProjectId} onClick={(event) => onOpenDialog('preparation', event.currentTarget, { projectId: selectedProjectId })}>Preparar issue</button></>}{route.tab === 'dashboard' && <button type="button" className="primary" disabled={!preparationProjectId} onClick={(event) => onOpenDialog('preparation', event.currentTarget, { projectId: preparationProjectId })}>Preparar issue</button>}</div>
    </div>
    {route.tab === 'dashboard' && <div className="summary" aria-label="Resumo da operação"><div><small>Projetos cadastrados</small><strong>{projectPage?.items.length ?? '—'}</strong><span className="muted">Nesta página</span></div><div><small>Tentativa ativa</small><strong>—</strong><span className="muted">Sem consulta de tentativas disponível</span></div><div><small>Fila automática</small><strong>{settings?.settings.automationEnabled ? 'Habilitada' : settings ? 'Pausada' : '—'}</strong><span className="muted">Configuração persistida</span></div></div>}
    {isFilteredList && <div className="toolbar"><label className="search-label">Filtrar {title.toLocaleLowerCase('pt-BR')}<input value={search} onChange={(event) => {
      const nextSearch = event.currentTarget.value;
      setSearch(nextSearch);
      setDraft(identity, 'search', nextSearch);
      const params = new URLSearchParams(route.params);
      if (nextSearch) params.set('search', nextSearch); else params.delete('search');
      window.history.replaceState(null, '', `#principal/${route.tab}${params.size ? `?${params.toString()}` : ''}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }} aria-label={`Filtrar ${title.toLocaleLowerCase('pt-BR')}`} placeholder="Filtrar por texto" /></label></div>}
    <LoadMessage state={state} retry={() => setReloadKey((value) => value + 1)} />
    {route.tab === 'projetos' && <>
      {projectsCatalog.error && <section className="card read-state" role="alert"><h2>Falha ao consultar projetos</h2><p>{projectsCatalog.error.message}</p>{projectsCatalog.error.requestId && <p className="mono muted">Solicitação {projectsCatalog.error.requestId}</p>}<button type="button" onClick={projectsCatalog.retry}>Tentar novamente</button></section>}
      {!projectsCatalog.error && projectsCatalog.loading && !projectsCatalog.page && <section className="card read-state" role="status"><p>Consultando catálogo de projetos…</p></section>}
      {!projectsCatalog.error && projectsCatalog.page && projectsCatalog.page.items.length === 0 && <section className="card empty" role="status"><h2>{search.trim() ? 'Nenhuma correspondência' : 'Nenhum projeto cadastrado'}</h2><p>{search.trim() ? 'Altere o filtro ou cadastre uma origem.' : 'Cadastre uma origem para configurar o projeto.'}</p></section>}
      {projectsCatalog.page && projectsCatalog.page.items.length > 0 && <section className="card"><div className="table-wrap"><table><thead><tr><th>Projeto / origem</th><th>Branch-base</th><th>Revisão</th><th>Pré-requisitos</th><th>Ação</th></tr></thead><tbody>{projectsCatalog.page.items.map((project) => <tr key={project.id}><td><b>{project.name}</b><br /><small className="mono">{project.source.location}</small><br /><small>{project.source.kind === 'local' ? 'Origem local' : 'GitHub'}</small></td><td className="mono">{project.baseBranch}</td><td>{project.revision}</td><td>{project.prerequisites.length ? <ul className="compact-list">{project.prerequisites.map((item) => <li key={item.code}>{item.message}</li>)}</ul> : 'Sem impedimentos registrados'}</td><td><div className="row"><a className="button-link" href={`#principal/configuracao?projectId=${encodeURIComponent(project.id)}`}>Selecionar projeto</a><button type="button" onClick={(event) => onOpenDialog('preparation', event.currentTarget, { projectId: project.id })}>Preparar</button></div></td></tr>)}</tbody></table></div>{projectsCatalog.page.hasMore && <div className="pagination-actions"><button type="button" onClick={() => void projectsCatalog.loadMore()} disabled={projectsCatalog.loading}>{projectsCatalog.loading ? 'Carregando…' : 'Carregar próxima página'}</button></div>}</section>}
    </>}
    {hasReadData(state) && route.tab === 'dashboard' && <div className="grid"><section className="card"><div className="line panel-title"><h2>Projetos recentes</h2><a href="#principal/projetos">Ver projetos</a></div>{projectPage?.items.slice(0, 4).map((project) => <div className="event" key={project.id}><span className="mono muted">{project.revision.toString().padStart(2, '0')}</span><div><b>{project.name}</b><p>{project.baseBranch} · {project.prerequisites.length ? `${project.prerequisites.length} pré-requisitos pendentes` : 'configuração disponível'}</p></div></div>)}{state.status === 'empty' && <div className="empty" role="status">Nenhum projeto cadastrado.</div>}</section><section className="card"><h2>Atividade recente</h2><p className="muted">Os eventos operacionais estarão disponíveis aqui quando houver atividade registrada.</p><a href="#principal/registros">Abrir registros</a></section></div>}
    {hasReadData(state) && route.tab === 'registros' && <section className="card">{events?.items.filter((event) => !search || `${event.entityType} ${event.eventType} ${event.entityId}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map((event) => <div className="event" key={event.seq}><time>{new Date(event.occurredAtMs).toLocaleString('pt-BR')}</time><div><b>{event.eventType}</b><p className="mono">{event.operationId} · {event.entityType}/{event.entityId}</p></div></div>)}{state.status === 'empty' && <div className="empty" role="status">Nenhum registro encontrado.</div>}</section>}
    {route.tab === 'configuracao' && <>
      <div className="configuration-project-select"><label htmlFor="configuration-project">Projeto selecionado<select id="configuration-project" value={selectedProjectId} onChange={(event) => {
        const params = new URLSearchParams(route.params);
        const projectId = event.currentTarget.value;
        if (projectId) params.set('projectId', projectId); else params.delete('projectId');
        window.location.hash = `#principal/configuracao${params.size ? `?${params.toString()}` : ''}`;
      }}><option value="">Configuração global</option>{selectedProjectId && !selectedProjectIsOnPage && <option value={selectedProjectId}>Projeto selecionado · {selectedProjectId}</option>}{projectsCatalog.page?.items.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><a href="#principal/projetos">Abrir catálogo de projetos</a>{projectsCatalog.page?.hasMore && <small>Há mais projetos no catálogo.</small>}</div>
      <ProjectConfigurationForm projectId={route.params.get('projectId')} />
    </>}
    {route.tab === 'fila' && <QueuePanel load={queue.load} onRefresh={queue.refresh} onNextPage={queue.nextPage} onPreviousPage={queue.previousPage} canGoBack={queue.canGoBack}
      onEnable={(trigger) => onOpenDialog('enable-queue', trigger)} onPause={() => {
        const observation = queue.load.observation;
        const etag = queue.load.etag;
        if (pausing || !observation || !etag || !observation.enabled) return;
        const command = pauseCommand.current ?? { operationId: crypto.randomUUID(), scope: observation.scope, etag };
        pauseCommand.current = command;
        setPausing(true);
        void requestJsonWithMetadata<QueueSaved>('/api/v1/queue', { method: 'PUT', headers: { 'If-Match': command.etag, 'Idempotency-Key': command.operationId }, body: JSON.stringify({ enabled: false, scope: command.scope }) })
          .then(({ data }) => {
            if (data.operationId !== command.operationId || !data.receipt) throw new Error('O recibo de pausa não corresponde à operação solicitada.');
            resolveUncertainOperation(command.operationId);
            pauseCommand.current = null;
            queue.refresh();
          }).catch((error: unknown) => {
            if (error instanceof HttpError && error.status < 500) {
              resolveUncertainOperation(command.operationId);
              pauseCommand.current = null;
            } else {
              try { recordUncertainOperation({ operationId: command.operationId, kind: 'queue-toggle', recordedAt: Date.now() }); } catch { /* Keep the command identity in memory. */ }
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
      const params = new URLSearchParams(route.params); params.set('attemptId', attemptId); params.set('projectId', projectId); params.delete('deliveryId'); params.delete('roundId'); params.set('dialog', 'detail'); window.location.hash = buildHash('tentativas', params);
    }} />}
  </>;
}

function isProjectPage(value: ReadData): value is ProjectPage { return value !== null && typeof value === 'object' && 'items' in value && 'nextCursor' in value && 'eventCursor' in value; }
function isEventPage(value: ReadData): value is EventPage { return value !== null && typeof value === 'object' && 'items' in value && 'nextCursor' in value; }
function isSettingsView(value: ReadData): value is SettingsView { return value !== null && typeof value === 'object' && 'settings' in value && 'profiles' in value; }

