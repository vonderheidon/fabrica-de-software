import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { buildHash, labelForTab, parseHash, routeIdentity, tabs, type DialogId } from './hash-route.js';
import { useHashRoute } from './useHashRoute.js';
import { PrincipalScreen } from './PrincipalScreen.js';
import { HttpError } from '../api/http.js';
import { operatorErrorMessage } from './operator-language.js';
import { ProjectConfigurationForm, ProjectRegistrationForm } from '../features/projects/ProjectForm.js';
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
import { wrapDialogTabFocus } from './dialog-focus.js';
import { EventConnectionStatus } from './EventConnectionStatus.js';
import './styles/event-connection-status.css';
import { useOnboarding } from '../features/onboarding/useOnboarding.js';
import { InitialSetupDialog } from '../features/onboarding/InitialSetupDialog.js';
import { trackProjectDeletions } from '../features/projects/project-deletion-observer.js';

type DialogState = { status: 'ready'; message: string } | { status: 'action-error'; message: string };

const navSymbols: Record<(typeof tabs)[number], string> = {
  dashboard: '▦', projetos: '▱', perfis: '◇', fila: '≡', tentativas: '↗', registros: '⌕', configuracao: '⚙',
};

const navLabels: Record<(typeof tabs)[number], string> = {
  dashboard: 'Principal', projetos: 'Projetos', perfis: 'Perfis', fila: 'Fila Ready',
  tentativas: 'Tentativas', registros: 'Registros', configuracao: 'Configuração',
};

export function AppShell() {
  const route = useHashRoute();
  const dialogs = useDialogs(route);
  const { dialog, setDialog } = dialogs;
  const onboarding = useOnboarding(route.tab === 'dashboard' || route.params.get('dialog') === 'initial-setup');
  const eventState = useControllerEvents();
  const deletionPollingIntervalMs = onboarding.load.snapshot?.settings.settings.time_defaults.polling_interval_ms ?? 15000;
  useEffect(() => trackProjectDeletions(deletionPollingIntervalMs), [deletionPollingIntervalMs]);
  const [dialogState, setDialogState] = useState<DialogState>({ status: 'ready', message: '' });
  const [profileSavePending, setProfileSavePending] = useState(false);
  const profileSavePendingRef = useRef(false);
  const profileHasUnsavedRef = useRef(false);
  const [profileClosePrompt, setProfileClosePrompt] = useState(false);
  const profilePromptFocusRef = useRef<HTMLElement | null>(null);
  const profilePromptContinueRef = useRef<HTMLButtonElement>(null);
  const profileContentRef = useRef<HTMLDivElement>(null);
  const [wizardClosePrompt, setWizardClosePrompt] = useState(false);
  const [wizardResetKey, setWizardResetKey] = useState(0);
  const [wizardHasUnsaved, setWizardHasUnsaved] = useState(false);
  const [wizardSaving, setWizardSaving] = useState(false);
  const [pendingWizardNavigation, setPendingWizardNavigation] = useState<string | null>(null);
  const wizardHasUnsavedRef = useRef(false);
  const wizardSavingRef = useRef(false);
  const wizardPromptFocusRef = useRef<HTMLElement | null>(null);
  const allowHashChangeRef = useRef(false);
  const lastKnownHashRef = useRef(window.location.hash);
  const previousTabRef = useRef<typeof route.tab | null>(null);
  const dashboardVisitRef = useRef(0);
  const handledDashboardVisitRef = useRef(0);
  const [readyDashboardVisit, setReadyDashboardVisit] = useState(0);
  const [wizardDialogTitle, setWizardDialogTitle] = useState('Configuração inicial');
  const wizardRouteRef = useRef({ dialog, dirty: wizardHasUnsaved, saving: wizardSaving });
  wizardHasUnsavedRef.current = wizardHasUnsaved;
  wizardSavingRef.current = wizardSaving;
  wizardRouteRef.current = { dialog, dirty: wizardHasUnsaved, saving: wizardSaving };
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const dialogHadFocusRef = useRef(false);
  const appRef = useRef<HTMLDivElement>(null);
  const title = labelForTab(route.tab);

  useEffect(() => {
    const enteredDashboard = route.tab === 'dashboard' && previousTabRef.current !== 'dashboard';
    if (enteredDashboard) {
      dashboardVisitRef.current += 1;
      const visit = dashboardVisitRef.current;
      if (onboarding.load.snapshot) {
        void onboarding.refresh().then((snapshot) => {
          if (snapshot && dashboardVisitRef.current === visit) setReadyDashboardVisit(visit);
        });
      }
    }
    previousTabRef.current = route.tab;
  }, [onboarding.load.snapshot, onboarding.refresh, route.tab]);

  useEffect(() => {
    const visit = dashboardVisitRef.current;
    if (route.tab !== 'dashboard' || visit === 0 || handledDashboardVisitRef.current === visit || !onboarding.load.snapshot) return;
    if (visit > 1 && readyDashboardVisit !== visit) return;
    if (visit === 1 && (onboarding.load.loading || onboarding.load.refreshing)) return;
    if (route.error) return;
    if (route.params.get('dialog') === 'initial-setup' || dialog === 'initial-setup') {
      handledDashboardVisitRef.current = visit;
      return;
    }
    if (route.params.has('dialog') || dialog) return;
    const current = onboarding.load.snapshot.settings.onboarding;
    if (current.completed_at_ms !== null || current.suppressed) {
      handledDashboardVisitRef.current = visit;
      return;
    }
    handledDashboardVisitRef.current = visit;
    returnFocusRef.current = document.querySelector<HTMLElement>('[data-initial-setup-trigger]') ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setWizardDialogTitle('Configuração inicial');
    dialogs.open('initial-setup');
  }, [dialog, dialogs, onboarding.load.loading, onboarding.load.refreshing, onboarding.load.snapshot, readyDashboardVisit, route.error, route.params, route.tab]);

  useEffect(() => {
    const onHashChange = (): void => {
      const nextHash = window.location.hash;
      if (allowHashChangeRef.current) {
        allowHashChangeRef.current = false;
        lastKnownHashRef.current = nextHash;
        return;
      }
      const current = wizardRouteRef.current;
      const previousHash = lastKnownHashRef.current;
      if ((current.dialog === 'initial-setup' || current.dialog === 'project-configuration') && (current.dirty || current.saving) && nextHash !== previousHash) {
        if (current.saving) {
          window.history.replaceState(null, '', previousHash);
          window.dispatchEvent(new HashChangeEvent('hashchange'));
          return;
        }
        const destination = cleanInternalTarget(nextHash);
        wizardPromptFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setPendingWizardNavigation(destination);
        setWizardClosePrompt(true);
        window.history.replaceState(null, '', previousHash);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
        return;
      }
      lastKnownHashRef.current = nextHash;
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      const current = wizardRouteRef.current;
      if (current.dialog !== 'project-configuration' || !current.dirty && !current.saving) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const projectRemoved = (event: Event): void => {
      const id = (event as CustomEvent<{ projectId?: string }>).detail?.projectId;
      const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
      if (id && params.get('projectId') === id) {
        wizardRouteRef.current = { dialog: null, dirty: false, saving: false };
        wizardHasUnsavedRef.current = false;
        setWizardHasUnsaved(false);
        setWizardClosePrompt(false);
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('factory-project-deleted', projectRemoved, true);
    window.addEventListener('factory-project-unavailable', projectRemoved, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('factory-project-deleted', projectRemoved, true);
      window.removeEventListener('factory-project-unavailable', projectRemoved, true);
    };
  }, []);

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
      if (!dialogHadFocusRef.current) return;
      dialogHadFocusRef.current = false;
      const returnTarget = returnFocusRef.current;
      returnFocusRef.current = null;
      if (returnTarget?.isConnected) returnTarget.focus();
      else appRef.current?.querySelector<HTMLElement>('.nav-link[aria-current="page"]')?.focus();
      return;
    }
    dialogHadFocusRef.current = true;
    appRef.current?.setAttribute('inert', '');
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    firstFocusable?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog();
      }
      if (event.key !== 'Tab') return;
      const candidates = dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const focusable = Array.from(candidates ?? []).filter((element) =>
        !element.matches(':disabled, [aria-disabled="true"]') && !element.closest('[aria-hidden="true"], [inert]') &&
        element.getClientRects().length > 0 && window.getComputedStyle(element).visibility === 'visible');
      const activeDialog = dialogRef.current;
      if (!activeDialog) { event.preventDefault(); return; }
      const activeElement = document.activeElement;
      wrapDialogTabFocus({
        shiftKey: event.shiftKey,
        activeElement: activeElement instanceof HTMLElement ? activeElement : null,
        dialog: activeDialog,
        focusables: focusable,
        activeOutsideDialog: !activeDialog.contains(activeElement),
        preventDefault: () => event.preventDefault(),
      });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialog, profileClosePrompt, wizardClosePrompt]);

  useEffect(() => {
    const content = profileContentRef.current;
    if (!content) return;
    if (dialog === 'profile' && profileClosePrompt) content.setAttribute('inert', '');
    else content.removeAttribute('inert');
  }, [dialog, profileClosePrompt]);

  useEffect(() => {
    if (profileClosePrompt) requestAnimationFrame(() => profilePromptContinueRef.current?.focus());
  }, [profileClosePrompt]);

  function openDialog(id: string, trigger: HTMLElement, context?: { projectId?: string; previousAttemptId?: string; attemptId?: string; profileId?: string; issueId?: string }): void {
    if (!['register', 'create', 'creation-plan', 'partial', 'preparation', 'start-confirmation', 'enable-queue', 'authority', 'detail', 'decision', 'stop', 'delivery', 'publication', 'diagnostic', 'interaction', 'profile', 'initial-setup', 'project-configuration'].includes(id)) return;
    returnFocusRef.current = trigger;
    if (id === 'initial-setup') setWizardDialogTitle('Configuração inicial');
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
    const message = error instanceof HttpError
      ? operatorErrorMessage(error.code, error.message, error.status)
      : 'A ação não foi concluída. Consulte o estado atual antes de tentar novamente.';
    setDialogState({ status: 'action-error', message });
  }

  function closeDialogImmediately(): void {
    if (dialog === 'profile' && profileSavePendingRef.current) return;
    profileSavePendingRef.current = false;
    setProfileSavePending(false);
    profileHasUnsavedRef.current = false;
    setProfileClosePrompt(false);
    setWizardClosePrompt(false);
    setPendingWizardNavigation(null);
    setWizardHasUnsaved(false);
    setWizardSaving(false);
    setWizardDialogTitle('Configuração inicial');
    wizardHasUnsavedRef.current = false;
    wizardSavingRef.current = false;
    wizardRouteRef.current = { dialog: null, dirty: false, saving: false };
    allowHashChangeRef.current = true;
    dialogs.close();
  }

  function continueProfileEditing(): void {
    setProfileClosePrompt(false);
    requestAnimationFrame(() => {
      const target = profilePromptFocusRef.current;
      if (target?.isConnected) target.focus();
      else dialogRef.current?.querySelector<HTMLElement>('#profile-name')?.focus();
    });
  }

  function discardProfileAndClose(): void {
    profileHasUnsavedRef.current = false;
    setProfileClosePrompt(false);
    closeDialogImmediately();
  }

  function requestWizardClose(): void {
    if (wizardSavingRef.current) return;
    if (!wizardHasUnsavedRef.current) {
      closeDialogImmediately();
      return;
    }
    wizardPromptFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPendingWizardNavigation(null);
    setWizardClosePrompt(true);
  }

  function closeDialog(): void {
    if (dialog === 'initial-setup' || dialog === 'project-configuration') {
      requestWizardClose();
      return;
    }
    if (dialog === 'profile') {
      if (profileSavePendingRef.current) return;
      if (profileClosePrompt) {
        continueProfileEditing();
        return;
      }
      if (profileHasUnsavedRef.current) {
        profilePromptFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setProfileClosePrompt(true);
        return;
      }
    }
    closeDialogImmediately();
  }

  function updateProfileDraftState(dirty: boolean): void {
    profileHasUnsavedRef.current = dirty;
  }

  function continueWizard(): void {
    setWizardClosePrompt(false);
    setPendingWizardNavigation(null);
    requestAnimationFrame(() => {
      const target = wizardPromptFocusRef.current;
      if (target?.isConnected) target.focus();
      else dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus();
    });
  }

  function discardWizard(): void {
    const destination = pendingWizardNavigation;
    setWizardClosePrompt(false);
    setPendingWizardNavigation(null);
    setWizardHasUnsaved(false);
    wizardHasUnsavedRef.current = false;
    setWizardResetKey((value) => value + 1);
    closeDialogImmediately();
    if (destination) window.location.hash = destination;
  }

  function navigateToProjects(): void {
    closeDialogImmediately();
    window.location.hash = '#principal/projetos';
  }

  function interceptWizardNavigation(event: MouseEvent<HTMLDivElement>): void {
    if (dialog !== 'initial-setup' && dialog !== 'project-configuration') return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>('a[href^="#principal/"]');
    if (!anchor) return;
    event.preventDefault();
    const destination = cleanInternalTarget(anchor.href);
    if (wizardSavingRef.current) return;
    if (wizardHasUnsavedRef.current) {
      wizardPromptFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPendingWizardNavigation(destination);
      setWizardClosePrompt(true);
      return;
    }
    allowHashChangeRef.current = true;
    window.location.hash = destination;
  }

  function updateWizardDraftState(dirty: boolean, saving: boolean): void {
    wizardHasUnsavedRef.current = dirty;
    wizardSavingRef.current = saving;
    setWizardHasUnsaved((current) => current === dirty ? current : dirty);
    setWizardSaving((current) => current === saving ? current : saving);
  }

  function setProfileSaving(pending: boolean): void {
    profileSavePendingRef.current = pending;
    setProfileSavePending(pending);
  }

  return <>
    <div className="app" ref={appRef} onClickCapture={interceptWizardNavigation}>
      <aside className="sidebar">
        <div className="brand"><span className="mark" aria-hidden="true">nf</span> Nova Fábrica</div>
        <div className="sidebar-navigation"><div className="eyebrow workspace-label">Workspace local</div><nav className="nav" aria-label="Navegação principal">
          {tabs.map((tab) => <a key={tab} href={buildHash(tab, tab === 'configuracao' ? new URLSearchParams() : route.params)} className={`nav-link${route.tab === tab && !route.error ? ' active' : ''}`} aria-current={route.tab === tab && !route.error ? 'page' : undefined}><span className="symbol" aria-hidden="true">{navSymbols[tab]}</span>{navLabels[tab]}</a>)}
        </nav></div>
        <footer className="sidebar-footer"><span className="avatar" aria-hidden="true">NF</span><div><b>Controlador local</b><br /><small>Sessão técnica do navegador</small></div><a className="quiet-button quiet-link" href="#principal/registros">Registros e diagnóstico</a></footer>
      </aside>
      <main className="main">
        <header className="topbar"><span>Workspace <span className="crumb-separator">/</span><b>{title}</b></span><div className="row"><EventConnectionStatus state={eventState} /><span className="pill neutral">Acesso local</span><span className="mono muted">Controlador técnico</span></div></header>
        <div className="content"><PrincipalScreen route={route} onOpenDialog={openDialog} onOpenInitialSetup={(trigger) => openDialog('initial-setup', trigger)} onboarding={onboarding} onOpenProfileDialog={(profileId, projectId, trigger) => openDialog('profile', trigger, { ...(projectId ? { projectId } : {}), ...(profileId ? { profileId } : {}) })} onActionError={reportActionError} /></div>
      </main>
    </div>
    {dialog && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <div className={`dialog${dialog === 'profile' ? ' profile-dialog' : ''}${dialog === 'initial-setup' ? ' initial-setup-dialog' : ''}${dialog === 'project-configuration' ? ' project-configuration-dialog' : ''}`} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabIndex={-1} onClickCapture={interceptWizardNavigation}>
        <div className="line dialog-toolbar"><span className="eyebrow">Nova Fábrica</span><button type="button" className="close-button" aria-label={dialog === 'profile' && profileClosePrompt ? 'Voltar à edição do perfil' : 'Fechar diálogo'} onClick={closeDialog} disabled={dialog === 'profile' && profileSavePending || (dialog === 'initial-setup' || dialog === 'project-configuration') && wizardSaving}>×</button></div>
        <h2 id="dialog-title">{dialog === 'initial-setup' ? wizardDialogTitle : dialog === 'profile' && profileClosePrompt ? 'Descartar alterações do perfil?' : dialog === 'profile' ? (route.params.has('profileId') ? 'Editar perfil' : 'Criar perfil') : dialog === 'diagnostic' ? 'Diagnóstico de acesso' : labelForDialog(dialog)}</h2>
        {dialog === 'project-configuration' ? <>
          {wizardClosePrompt ? <section className="dialog-prompt" aria-labelledby="configuration-close-title">
            <span className="eyebrow">Alterações não salvas</span><h3 id="configuration-close-title">Sair da configuração do projeto?</h3>
            <p>As alterações ainda não foram salvas. Você pode continuar editando ou sair e manter o rascunho nesta sessão para retomar depois.</p>
            <div className="dialog-prompt-actions"><button type="button" autoFocus onClick={continueWizard}>Continuar editando</button><button type="button" onClick={discardWizard}>Sair e manter rascunho</button></div>
          </section> : null}
          <div hidden={wizardClosePrompt}>
            {route.params.get('projectId') ? <ProjectConfigurationForm key={route.params.get('projectId')} projectId={route.params.get('projectId')} onDraftStateChange={updateWizardDraftState} onSaveIssue={() => undefined} /> : <p>Selecione um projeto no catálogo para abrir sua configuração.</p>}
          </div>
        </> : dialog === 'initial-setup' ? <InitialSetupDialog
          onboarding={onboarding}
          closePrompt={wizardClosePrompt}
          resetKey={wizardResetKey}
          onRequestClose={requestWizardClose}
          onContinueClose={continueWizard}
          onDiscardClose={discardWizard}
          onSuppressed={closeDialogImmediately}
          onGoProjects={navigateToProjects}
          onDraftStateChange={updateWizardDraftState}
          onAccessibleTitleChange={setWizardDialogTitle}
        /> : dialog === 'profile' ? <>
          <div ref={profileContentRef} aria-hidden={profileClosePrompt}>
          <ProfileForm key={`${route.params.get('projectId') ?? 'global'}:${route.params.get('profileId') ?? 'new'}`} projectId={route.params.get('projectId')} profileId={route.params.get('profileId')} onClose={closeDialog} onSavingChange={setProfileSaving} onSaved={(eventCursor, previousEtag) => {
          window.dispatchEvent(new CustomEvent('factory-profile-saved', { detail: { eventCursor, previousEtag } }));
          window.dispatchEvent(new Event('factory-controller-resync'));
          updateProfileDraftState(false);
          closeDialog();
        }} onDirtyChange={updateProfileDraftState} />
          </div>
          {profileClosePrompt && <section className="dialog-prompt" aria-labelledby="profile-close-title" aria-describedby="profile-close-description">
            <span className="eyebrow">Alterações locais</span>
            <h3 id="profile-close-title">Descartar as alterações do perfil?</h3>
            <p id="profile-close-description">O perfil ainda não foi salvo. Continue editando para manter os valores ou descarte as alterações locais para fechar este diálogo.</p>
            <div className="dialog-prompt-actions">
              <button ref={profilePromptContinueRef} type="button" onClick={continueProfileEditing}>Continuar editando</button>
              <button type="button" className="danger-button" onClick={discardProfileAndClose}>Descartar e fechar</button>
            </div>
          </section>}
        </> : dialog === 'register' ? <ProjectRegistrationForm identity={routeIdentity(route)} onRegistered={(projectId) => {
          setDialog(null);
          const params = new URLSearchParams({ projectId, dialog: 'project-configuration' });
          window.location.hash = buildHash('projetos', params);
        }} /> : dialog === 'create' || dialog === 'creation-plan' || dialog === 'partial' ? <ProjectCreationDialog
          creationId={dialog === 'partial' ? route.params.get('creationId') : null}
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
            window.location.hash = buildHash('projetos', new URLSearchParams({ projectId, dialog: 'project-configuration' }));
          }}
        /> : <>
          {dialogState.status === 'action-error' && <div className="read-state" role="alert"><h3>A ação não foi concluída</h3><p>{dialogState.message}</p></div>}
          {dialog === 'preparation' || dialog === 'start-confirmation' ? <PreparationDialog key={`${route.params.get('projectId') ?? ''}:${route.params.get('dialog') === 'preparation' ? route.params.get('attemptId') ?? 'new' : 'new'}:${route.params.get('issueId') ?? ''}`} projectId={route.params.get('projectId')} initialIssueId={dialog === 'preparation' ? route.params.get('issueId') : null} previousAttemptId={route.params.get('dialog') === 'preparation' ? route.params.get('attemptId') : null} onOpenAttempt={openAttempt} /> : dialog === 'detail' && route.params.get('attemptId') ? <AttemptDetailDialog attemptId={route.params.get('attemptId')!} selectedRound={route.params.get('roundId')} selectedDeliveryId={route.params.get('deliveryId')} onSelectionChange={(roundId, deliveryId) => {
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
    register: 'Adicionar existente', create: 'Criar projeto', 'creation-plan': 'Plano de criação', partial: 'Resultado da criação',
    preparation: 'Preparar issue', 'start-confirmation': 'Confirmar início', 'enable-queue': 'Habilitar fila Ready',
    authority: 'Autoridade do projeto', detail: 'Detalhe da tentativa', decision: 'Responder decisão', stop: 'Parada da tentativa',
    delivery: 'Entrega', publication: 'Reconciliação da publicação', diagnostic: 'Diagnóstico', interaction: 'Sessão operacional', profile: 'Perfil',
    'initial-setup': 'Configuração inicial', 'project-configuration': 'Configuração do projeto',
  };
  return labels[dialog];
}

function cleanInternalTarget(href: string): string {
  const hash = new URL(href, window.location.href).hash;
  const target = parseHash(hash);
  const params = new URLSearchParams(target.params);
  if (params.get('dialog') === 'initial-setup') params.delete('dialog');
  if (params.get('dialog') !== 'profile') params.delete('profileId');
  return buildHash(target.tab, params);
}
