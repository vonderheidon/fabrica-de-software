import { useEffect, useRef, useState } from 'react';
import { buildHash, labelForTab, routeIdentity, tabs, type DialogId } from './hash-route.js';
import { useHashRoute } from './useHashRoute.js';
import { PrincipalScreen } from './PrincipalScreen.js';
import { HttpError } from '../api/http.js';
import { ProjectRegistrationForm } from '../features/projects/ProjectForm.js';
import { ProfileForm } from '../features/projects/ProfileForm.js';
import { ProjectCreationDialog } from '../features/projects/ProjectCreationDialog.js';
import { QueueEnableDialog } from '../features/queue/QueueEnableDialog.js';
import { QueueAuthorityDialog } from '../features/queue/QueueAuthorityDialog.js';
import { PreparationDialog } from '../features/preparations/PreparationDialog.js';
import { AttemptDetailDialog } from '../features/attempts/AttemptDetailDialog.js';
import type { HttpAttemptDetail as AttemptDetail } from '#contracts';
import { readUncertainOperations } from '../api/uncertain-operations.js';
import { useControllerEvents } from './useControllerEvents.js';
import { useDialogs } from './useDialogs.js';

type DialogState = { status: 'ready'; message: string } | { status: 'action-error'; message: string; requestId: string | null };

const navSymbols: Record<(typeof tabs)[number], string> = {
  dashboard: '▦', projetos: '▱', fila: '≡', tentativas: '↗', registros: '⌕', configuracao: '⚙',
};

export function AppShell() {
  const route = useHashRoute();
  const dialogs = useDialogs(route);
  const { dialog, setDialog } = dialogs;
  const eventState = useControllerEvents();
  const [dialogState, setDialogState] = useState<DialogState>({ status: 'ready', message: '' });
  const [profileSavePending, setProfileSavePending] = useState(false);
  const profileSavePendingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const title = labelForTab(route.tab);

  useEffect(() => {
    if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#login' || window.location.hash === '#principal') {
      window.history.replaceState(null, '', '#principal/dashboard');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  }, []);

  useEffect(() => {
    if (route.params.has('dialog')) return;
    const pendingStart = readUncertainOperations().find((operation) => operation.kind === 'attempt-start');
    if (!pendingStart) return;
    const params = new URLSearchParams(route.params);
    params.set('dialog', 'start-confirmation');
    window.location.hash = buildHash(route.tab, params);
  }, [route.params, route.tab]);

  useEffect(() => {
    if (dialog) setDialogState({ status: 'ready', message: 'Este conteúdo será carregado pela funcionalidade correspondente.' });
  }, [dialog]);

  useEffect(() => {
    if (!dialog) {
      appRef.current?.removeAttribute('inert');
      returnFocusRef.current?.focus();
      return;
    }
    appRef.current?.setAttribute('inert', '');
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    firstFocusable?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog();
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialog]);

  function openDialog(id: string, trigger: HTMLElement, context?: { projectId?: string; previousAttemptId?: string; attemptId?: string; profileId?: string }): void {
    if (!['register', 'create', 'creation-plan', 'partial', 'preparation', 'start-confirmation', 'enable-queue', 'authority', 'detail', 'decision', 'stop', 'delivery', 'publication', 'diagnostic', 'interaction', 'profile'].includes(id)) return;
    returnFocusRef.current = trigger;
    setDialogState({ status: 'ready', message: id === 'diagnostic' ? 'Revise a origem local autorizada e a proteção da solicitação. O navegador não libera CORS nem repete o bootstrap automaticamente.' : 'O conteúdo desta ação será conectado à funcionalidade correspondente.' });
    dialogs.open(id, context);
  }

  function openAttempt(attemptId: string): void {
    const params = new URLSearchParams(route.params);
    params.set('attemptId', attemptId);
    params.set('dialog', 'detail');
    window.location.hash = buildHash('tentativas', params);
  }

  function reportActionError(error: unknown): void {
    const message = error instanceof HttpError ? error.message : 'A ação não foi concluída. Consulte o controlador antes de tentar novamente.';
    setDialogState({ status: 'action-error', message, requestId: error instanceof HttpError ? error.requestId : null });
  }

  function closeDialog(): void {
    if (dialog === 'profile' && profileSavePendingRef.current) return;
    profileSavePendingRef.current = false;
    setProfileSavePending(false);
    dialogs.close();
  }

  function setProfileSaving(pending: boolean): void {
    profileSavePendingRef.current = pending;
    setProfileSavePending(pending);
  }

  return <>
    <div className="app" ref={appRef}>
      <aside className="sidebar">
        <div className="brand"><span className="mark" aria-hidden="true">nf</span> Nova Fábrica</div>
        <div className="sidebar-navigation"><div className="eyebrow workspace-label">Workspace local</div><nav className="nav" aria-label="Navegação principal">
          {tabs.map((tab) => <a key={tab} href={buildHash(tab, route.params)} className={`nav-link${route.tab === tab && !route.error ? ' active' : ''}`} aria-current={route.tab === tab && !route.error ? 'page' : undefined}><span className="symbol" aria-hidden="true">{navSymbols[tab]}</span>{labelForTab(tab)}</a>)}
        </nav></div>
        <footer className="sidebar-footer"><span className="avatar" aria-hidden="true">NF</span><div><b>Controlador local</b><br /><small>Sessão técnica do navegador</small></div><a className="quiet-button quiet-link" href="#principal/registros">Registros e diagnóstico</a></footer>
      </aside>
      <main className="main">
        <header className="topbar"><span>Workspace <span className="crumb-separator">/</span><b>{title}</b></span><div className="row"><span className={`pill ${eventState === 'connected' ? '' : 'warn'}`} role="status" aria-label={`Eventos do controlador: ${eventState}`}>Eventos {eventState === 'connected' ? 'conectados' : eventState === 'reconnecting' ? 'reconectando' : eventState === 'unavailable' ? 'indisponíveis' : 'conectando'}</span><span className="pill neutral">Acesso local</span><span className="mono muted">Controlador técnico</span></div></header>
        <div className="content"><PrincipalScreen route={route} onOpenDialog={openDialog} onOpenProfileDialog={(profileId, projectId, trigger) => openDialog('profile', trigger, { ...(projectId ? { projectId } : {}), ...(profileId ? { profileId } : {}) })} onActionError={reportActionError} /></div>
      </main>
    </div>
    {dialog && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <div className={`dialog${dialog === 'profile' ? ' profile-dialog' : ''}`} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabIndex={-1}>
        <div className="line"><span className="eyebrow">Nova Fábrica</span><button type="button" className="close-button" aria-label="Fechar diálogo" onClick={closeDialog} disabled={dialog === 'profile' && profileSavePending}>×</button></div>
        <h2 id="dialog-title">{dialog === 'profile' ? (route.params.has('profileId') ? 'Editar perfil' : 'Criar perfil') : dialog === 'diagnostic' ? 'Diagnóstico de acesso' : labelForDialog(dialog)}</h2>
        {dialog === 'profile' ? <ProfileForm key={`${route.params.get('projectId') ?? 'global'}:${route.params.get('profileId') ?? 'new'}`} projectId={route.params.get('projectId')} profileId={route.params.get('profileId')} onClose={closeDialog} onSavingChange={setProfileSaving} onSaved={() => {
          window.dispatchEvent(new Event('factory-controller-resync'));
          closeDialog();
        }} /> : dialog === 'register' ? <ProjectRegistrationForm identity={routeIdentity(route)} onRegistered={(projectId) => {
          setDialog(null);
          const params = new URLSearchParams({ projectId });
          window.location.hash = buildHash('configuracao', params);
        }} /> : dialog === 'create' || dialog === 'creation-plan' || dialog === 'partial' ? <ProjectCreationDialog
          creationId={route.params.get('creationId')}
          onCreationId={(creationId) => {
            const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
            params.set('creationId', creationId);
            params.set('dialog', 'partial');
            window.location.hash = buildHash(route.tab, params);
          }}
          onPlanReview={() => {
            const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
            params.delete('creationId');
            params.set('dialog', 'creation-plan');
            window.location.hash = buildHash(route.tab, params);
          }}
          onPlanEdit={() => {
            const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
            params.delete('creationId');
            params.set('dialog', 'create');
            window.location.hash = buildHash(route.tab, params);
          }}
          onOpenProject={(projectId) => {
            setDialog(null);
            window.location.hash = buildHash('configuracao', new URLSearchParams({ projectId }));
          }}
        /> : <>
          {dialogState.status === 'action-error' && <div className="read-state" role="alert"><h3>A ação não foi concluída</h3><p>{dialogState.message}</p>{dialogState.requestId && <p className="mono muted">Solicitação {dialogState.requestId}</p>}</div>}
          {dialog === 'preparation' || dialog === 'start-confirmation' ? <PreparationDialog key={`${route.params.get('projectId') ?? ''}:${route.params.get('dialog') === 'preparation' ? route.params.get('attemptId') ?? 'new' : 'new'}`} projectId={route.params.get('projectId')} previousAttemptId={route.params.get('dialog') === 'preparation' ? route.params.get('attemptId') : null} onOpenAttempt={openAttempt} /> : dialog === 'detail' && route.params.get('attemptId') ? <AttemptDetailDialog attemptId={route.params.get('attemptId')!} selectedRound={route.params.get('roundId')} selectedDeliveryId={route.params.get('deliveryId')} onSelectionChange={(roundId, deliveryId) => {
            const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
            if (roundId) params.set('roundId', roundId); else params.delete('roundId');
            if (deliveryId) params.set('deliveryId', deliveryId); else params.delete('deliveryId');
            window.history.replaceState(null, '', buildHash('tentativas', params));
            window.dispatchEvent(new HashChangeEvent('hashchange'));
          }} onRetry={(attempt: AttemptDetail) => openDialog('preparation', returnFocusRef.current ?? document.activeElement as HTMLElement, { projectId: attempt.project_id, previousAttemptId: attempt.id })} /> : dialog === 'enable-queue' ? <QueueEnableDialog projectId={null} onClose={closeDialog} onEnabled={() => {
            window.dispatchEvent(new Event('factory-queue-updated'));
            closeDialog();
          }} /> : dialog === 'authority' && route.params.get('attemptId') ? <QueueAuthorityDialog attemptId={route.params.get('attemptId')!} onClose={closeDialog} onChanged={() => window.dispatchEvent(new Event('factory-queue-updated'))} /> : dialogState.status === 'ready' && <p>{dialogState.message}</p>}
        </>}
      </div>
    </div>}
  </>;
}

function labelForDialog(dialog: DialogId): string {
  const labels: Record<DialogId, string> = {
    register: 'Cadastrar origem Git', create: 'Criar projeto', 'creation-plan': 'Plano de criação', partial: 'Criação parcial',
    preparation: 'Preparar issue', 'start-confirmation': 'Confirmar início', 'enable-queue': 'Habilitar fila Ready',
    authority: 'Autoridade do projeto', detail: 'Detalhe da tentativa', decision: 'Responder decisão', stop: 'Parada da tentativa',
    delivery: 'Entrega', publication: 'Reconciliação da publicação', diagnostic: 'Diagnóstico', interaction: 'Sessão operacional', profile: 'Perfil',
  };
  return labels[dialog];
}
