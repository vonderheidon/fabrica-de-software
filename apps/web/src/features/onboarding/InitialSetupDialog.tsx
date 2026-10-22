import { useEffect, useRef, useState } from 'react';
import type { OnboardingStep, ProfileType } from '#contracts';
import type { OnboardingController } from './useOnboarding.js';
import { GitHubSetupPanel } from '../projects/GitHubSetupPanel.js';
import { ProfileForm } from '../projects/ProfileForm.js';
import { ProjectsFolderField } from '../projects/ProjectsFolderField.js';
import { useGitHubSetup } from '../projects/useGitHubSetup.js';
import { useNativeSelection } from '../projects/useNativeSelection.js';


const steps: readonly { id: OnboardingStep; title: string; description: string }[] = [
  { id: 'github', title: 'Conectar GitHub', description: 'Confirme a conta ativa e vincule a identidade que a fábrica usará.' },
  { id: 'projects_root', title: 'Escolher a pasta dos projetos', description: 'Escolha e valide a pasta onde novos projetos poderão ser criados.' },
  { id: 'profiles', title: 'Configurar os perfis', description: 'Crie ou confirme os perfis de Implementador e Revisor.' },
];

type Props = {
  onboarding: OnboardingController;
  closePrompt: boolean;
  resetKey: number;
  onRequestClose: () => void;
  onContinueClose: () => void;
  onDiscardClose: () => void;
  onSuppressed: () => void;
  onGoProjects: () => void;
  onDraftStateChange: (dirty: boolean, saving: boolean) => void;
  onAccessibleTitleChange: (title: string) => void;
};

export function InitialSetupDialog({
  onboarding, closePrompt, resetKey, onRequestClose, onContinueClose, onDiscardClose, onSuppressed, onGoProjects, onDraftStateChange, onAccessibleTitleChange,
}: Props) {
  const snapshot = onboarding.load.snapshot;
  const settings = snapshot?.settings ?? null;
  const view = settings?.onboarding ?? null;
  const hasSettings = settings !== null;
  const settingsEventCursor = settings?.event_cursor;
  const selection = useNativeSelection();
  const setup = useGitHubSetup({
    enabled: settings !== null,
    settings,
    etag: snapshot?.etag ?? null,
    onSettingsSaved: () => { void onboarding.refresh(); },
  });
  const [activeStep, setActiveStep] = useState<OnboardingStep>('github');
  const [stepInitialized, setStepInitialized] = useState(false);
  const [rootPath, setRootPath] = useState('');
  const rootTouchedRef = useRef(false);
  const [profileFormOpen, setProfileFormOpen] = useState(false);
  const [profileType, setProfileType] = useState<ProfileType>('implementer');
  const [profileDirty, setProfileDirty] = useState(false);
  const profileDirtyRef = useRef(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileFormKey, setProfileFormKey] = useState(0);
  const [profileReceipt, setProfileReceipt] = useState<{ role: ProfileType; eventCursor: string | null } | null>(null);
  const [pendingStep, setPendingStep] = useState<OnboardingStep | null>(null);
  const showExitPrompt = closePrompt || pendingStep !== null;
  const stepReturnFocusRef = useRef<HTMLElement | null>(null);
  const exitContinueRef = useRef<HTMLButtonElement | null>(null);
  const suppressionHandledRef = useRef<string | null>(null);
  const onDraftStateChangeRef = useRef(onDraftStateChange);
  const selectionRef = useRef(selection);
  const setupRef = useRef(setup);
  onDraftStateChangeRef.current = onDraftStateChange;
  selectionRef.current = selection;
  setupRef.current = setup;

  const firstIncomplete = view?.first_incomplete_step ?? null;
  const serverStepIndex = firstIncomplete === null ? steps.length : steps.findIndex((step) => step.id === firstIncomplete);
  const completed = view?.completed_at_ms !== null && view?.completed_at_ms !== undefined;
  const profileCounts = settings?.profile_counts ?? { all: 0, implementer: 0, reviewer: 0 };
  const missingProfileType: ProfileType | null = profileCounts.implementer === 0 ? 'implementer' : profileCounts.reviewer === 0 ? 'reviewer' : null;
  const hasUnsavedGitHub = Boolean(settings && setup.selectedAccount && setup.selectedAccount.id !== settings.settings.account_id);
  const candidateRoot = selection.candidates.projects_root;
  const candidateGh = selection.candidates.gh_executable;
  const savedGhPath = setup.executableOperation.status === 'confirmed' ? setup.executableOperation.savedPath : undefined;
  const persistedRoot = settings?.settings.projects_root ?? null;
  const rootValue = rootTouchedRef.current ? rootPath : persistedRoot ?? '';
  const hasUnappliedSelection = Boolean(candidateRoot && candidateRoot !== persistedRoot && candidateRoot !== rootValue || candidateGh && candidateGh !== savedGhPath);
  const hasUnsaved = !completed && (Boolean(settings && rootValue !== (persistedRoot ?? '')) || hasUnsavedGitHub || hasUnappliedSelection || profileDirty);
  const saving = onboarding.busy || profileSaving || setup.accountOperation.status === 'saving' || setup.executableOperation.status === 'saving' || selection.state.status === 'selecting';
  const blockedByUncertain = onboarding.operation.status === 'uncertain' || setup.accountOperation.status === 'uncertain' || setup.executableOperation.status === 'uncertain';
  const commandBlocked = saving || blockedByUncertain;

  useEffect(() => {
    onDraftStateChangeRef.current(hasUnsaved, saving);
  }, [hasUnsaved, saving]);

  useEffect(() => {
    if (!hasSettings || rootTouchedRef.current) return;
    setRootPath(persistedRoot ?? '');
  }, [hasSettings, persistedRoot, settingsEventCursor]);

  useEffect(() => {
    if (!hasSettings || stepInitialized) return;
    setActiveStep(firstIncomplete ?? 'profiles');
    setStepInitialized(true);
  }, [firstIncomplete, hasSettings, stepInitialized]);

  useEffect(() => {
    if (stepInitialized) requestAnimationFrame(() => document.getElementById('onboarding-step-title')?.focus());
  }, [activeStep, stepInitialized]);

  useEffect(() => {
    if (!settings || onboarding.operation.status !== 'confirmed' || onboarding.operation.kind !== 'projects-root') return;
    if (settings.onboarding.first_incomplete_step !== 'projects_root') {
      rootTouchedRef.current = false;
      setRootPath(settings.settings.projects_root ?? '');
    }
  }, [onboarding.operation, settings]);

  useEffect(() => {
    if (onboarding.operation.status !== 'confirmed' || onboarding.operation.kind !== 'suppress') return;
    if (suppressionHandledRef.current === onboarding.operation.operationId) return;
    suppressionHandledRef.current = onboarding.operation.operationId;
    onSuppressed();
  }, [onSuppressed, onboarding.operation]);

  useEffect(() => {
    if (profileFormOpen) requestAnimationFrame(() => document.getElementById('profile-name')?.focus());
  }, [profileFormKey, profileFormOpen]);

  useEffect(() => {
    if (showExitPrompt) requestAnimationFrame(() => exitContinueRef.current?.focus());
  }, [showExitPrompt]);

  const lastResetKeyRef = useRef(resetKey);
  useEffect(() => {
    if (resetKey === lastResetKeyRef.current) return;
    lastResetKeyRef.current = resetKey;
    rootTouchedRef.current = false;
    setRootPath(persistedRoot ?? '');
    selectionRef.current.clearCandidate('projects_root');
    selectionRef.current.clearCandidate('gh_executable');
    setupRef.current.resetSelection();
    profileDirtyRef.current = false;
    setProfileDirty(false);
    setProfileSaving(false);
    setProfileFormOpen(false);
    setProfileFormKey((value) => value + 1);
    setPendingStep(null);
  }, [persistedRoot, resetKey]);

  function isStepComplete(step: OnboardingStep): boolean {
    const index = steps.findIndex((item) => item.id === step);
    return completed || serverStepIndex > index;
  }

  function canVisitStep(step: OnboardingStep): boolean {
    return completed || steps.findIndex((item) => item.id === step) <= serverStepIndex;
  }

  function requestStep(step: OnboardingStep): void {
    if (step === activeStep || !canVisitStep(step) || saving) return;
    if (hasUnsaved) {
      stepReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPendingStep(step);
      return;
    }
    setActiveStep(step);
    setProfileFormOpen(false);
  }

  function continuePendingStep(): void {
    setPendingStep(null);
    requestAnimationFrame(() => stepReturnFocusRef.current?.focus());
  }

  function discardPendingStep(): void {
    const destination = pendingStep;
    resetDrafts();
    setPendingStep(null);
    if (destination) setActiveStep(destination);
  }

  function resetDrafts(): void {
    rootTouchedRef.current = false;
    setRootPath(settings?.settings.projects_root ?? '');
    selection.clearCandidate('projects_root');
    selection.clearCandidate('gh_executable');
    setup.resetSelection();
    profileDirtyRef.current = false;
    setProfileDirty(false);
    setProfileFormOpen(false);
    setProfileFormKey((value) => value + 1);
  }

  function openProfileForm(nextType: ProfileType): void {
    setProfileType(nextType);
    setProfileReceipt(null);
    setProfileFormKey((value) => value + 1);
    setProfileFormOpen(true);
  }

  function profileSaved(eventCursor: string | null): void {
    setProfileReceipt({ role: profileType, eventCursor });
    setProfileDirty(false);
    profileDirtyRef.current = false;
    setProfileSaving(false);
    setProfileFormOpen(false);
    window.dispatchEvent(new Event('factory-controller-resync'));
    void onboarding.refresh();
    requestAnimationFrame(focusProfileStepHeading);
  }

  function focusProfileStepHeading(): void {
    document.getElementById('onboarding-step-title')?.focus();
  }

  function saveRoot(): void {
    if (!rootValue.trim() || saving || blockedByUncertain) return;
    void onboarding.saveProjectsRoot(rootValue);
  }

  const canAdvanceGitHub = isStepComplete('github') && !blockedByUncertain;
  const canAdvanceRoot = Boolean(settings && firstIncomplete !== 'projects_root' && settings.settings.projects_root && !blockedByUncertain);
  const completionReceiptPending = onboarding.operation.status === 'confirmed' && onboarding.operation.kind === 'complete' && !completed;
  const canComplete = Boolean(settings && firstIncomplete === null && profileCounts.implementer > 0 && profileCounts.reviewer > 0 && !completed && !completionReceiptPending && !blockedByUncertain);
  const latestProfileReceipt = profileReceipt && (profileReceipt.role === 'implementer' ? profileCounts.implementer > 0 : profileCounts.reviewer > 0);
  const profileReceiptPending = profileReceipt !== null && !latestProfileReceipt;
  const activeStepTitle = steps.find((step) => step.id === activeStep)?.title ?? steps[0]!.title;
  const accessibleTitle = showExitPrompt
    ? pendingStep ? 'Confirmar troca de etapa' : 'Confirmar saída da configuração inicial'
    : profileFormOpen ? `Criar perfil de ${profileType === 'implementer' ? 'Implementador' : 'Revisor'}`
      : completed ? 'Configuração inicial concluída' : activeStepTitle;

  useEffect(() => {
    onAccessibleTitleChange(accessibleTitle);
  }, [accessibleTitle, onAccessibleTitleChange]);

  function suppress(): void {
    if (saving || blockedByUncertain || hasUnsaved) return;
    void onboarding.suppress();
  }

  if (onboarding.load.loading && !settings) return <div className="onboarding-loading" role="status"><p>Consultando o progresso salvo…</p></div>;
  if (!settings) return <div className="onboarding-load-error" role="alert"><h3>Não foi possível abrir a configuração inicial</h3><p>{onboarding.load.error?.message ?? 'A configuração atual ainda não foi carregada.'}</p><div className="onboarding-step-actions"><button type="button" onClick={() => void onboarding.refresh()}>Tentar novamente</button><button type="button" onClick={onRequestClose}>Fechar</button></div></div>;
  if (!snapshot) return <div className="onboarding-load-error" role="alert"><h3>Não foi possível abrir a configuração inicial</h3><p>Consulte novamente a configuração do controlador.</p><button type="button" onClick={() => void onboarding.refresh()}>Tentar novamente</button></div>;

  if (completed) return <div className="onboarding-complete" role="status" aria-live="polite">
    <span className="onboarding-complete-mark" aria-hidden="true">✓</span>
    <h3>Tudo pronto</h3>
    <p>Tudo configurado. Você já pode cadastrar seus projetos.</p>
    <div className="dialog-actions"><button type="button" className="primary" onClick={onGoProjects}>Ir para Projetos</button></div>
  </div>;

  const currentStep = steps.find((step) => step.id === activeStep) ?? steps[0]!;
  const isFinalSetupState = firstIncomplete === null && canComplete;
  const operationMessage = operationFeedback(onboarding.operation);
  const operationBusy = saving;

  return <div className="initial-setup">
    <div className={`onboarding-content${showExitPrompt ? ' onboarding-content-blocked' : ''}`} aria-hidden={showExitPrompt}>
    <div className="onboarding-intro"><span className="eyebrow">Primeiro acesso</span><h3>Vamos preparar a fábrica</h3><p>Conecte o GitHub, escolha a pasta e configure os perfis de execução.</p></div>
    <ol className="onboarding-stepper" aria-label="Etapas da configuração inicial">
      {steps.map((step, index) => {
        const active = activeStep === step.id;
        const stepEnabled = canVisitStep(step.id) && !operationBusy;
        return <li key={step.id}>
          <button type="button" className={active ? 'onboarding-step active' : 'onboarding-step'} aria-current={active ? 'step' : undefined} disabled={!stepEnabled} onClick={() => requestStep(step.id)}>
            <span className="onboarding-step-number" aria-hidden="true">{isStepComplete(step.id) ? '✓' : index + 1}</span>
            <span><b>{step.title}</b><small>{isStepComplete(step.id) ? 'Confirmada' : active ? 'Etapa atual' : 'Pendente'}</small></span>
          </button>
        </li>;
      })}
    </ol>
    <section className="onboarding-step-content" aria-labelledby="onboarding-step-title">
      <div className="onboarding-step-heading"><span className="eyebrow">Etapa {steps.findIndex((step) => step.id === activeStep) + 1} de 3</span><h3 id="onboarding-step-title" tabIndex={-1}>{currentStep.title}</h3><p>{currentStep.description}</p></div>
      {activeStep === 'github' && <>
        <GitHubSetupPanel settings={settings} settingsEtag={snapshot.etag} setup={setup} selection={selection} disabled={commandBlocked} />
        {!canAdvanceGitHub && setup.verification.status !== 'ready' && <p className="muted" role="status">Verifique o status para consultar a conta ativa. A etapa não avança com uma identidade apenas digitada.</p>}
        {!canAdvanceGitHub && setup.verification.status === 'ready' && <p className="notice compact-notice" role="status">Vincule a conta elegível que está ativa no GitHub CLI antes de avançar.</p>}
      </>}
      {activeStep === 'projects_root' && <>
        <ProjectsFolderField
          persistedValue={settings.settings.projects_root}
          value={rootValue || null}
          capability={settings.selection_capabilities.projects_root}
          selection={selection}
          onChange={(value) => { rootTouchedRef.current = true; setRootPath(value ?? ''); }}
          onRevalidate={rootValue.trim() ? saveRoot : null}
          saveError={onboarding.operation.status === 'failed' && onboarding.operation.kind === 'projects-root' ? { message: onboarding.operation.message, requestId: onboarding.operation.requestId } : null}
          disabled={commandBlocked}
        />
        {onboarding.operation.status === 'confirmed' && onboarding.operation.kind === 'projects-root' && <div className="onboarding-receipt" role="status"><p>Pasta salva e confirmada pelo recibo do controlador.</p></div>}
        {onboarding.operation.status === 'failed' && onboarding.operation.kind === 'projects-root' && <p className="error" role="alert">{onboarding.operation.message}</p>}
      </>}
      {activeStep === 'profiles' && <>
        <div className="onboarding-profile-progress">
          {(['implementer', 'reviewer'] as const).map((role) => {
            const count = profileCounts[role];
            const existing = settings.profiles.find((profile) => profile.profile_type === role);
            const label = role === 'implementer' ? 'Implementador' : 'Revisor';
            return <article key={role} className={`onboarding-profile-card${count > 0 ? ' complete' : ''}`}>
              <span className="onboarding-profile-icon" aria-hidden="true">{role === 'implementer' ? '✦' : '◉'}</span>
              <div><b>{label}</b><p>{count > 0 ? existing?.name ?? `${count} perfil(is) disponível(is)` : 'Ainda não há perfil deste tipo.'}</p></div>
              <span className={`pill ${count > 0 ? '' : 'warn'}`}>{count > 0 ? 'Confirmado' : 'Pendente'}</span>
            </article>;
          })}
        </div>
        {profileReceipt && <div className="onboarding-receipt" role="status"><p>O perfil de {profileReceipt.role === 'implementer' ? 'Implementador' : 'Revisor'} foi salvo com recibo confirmado. {latestProfileReceipt ? 'A coleção foi atualizada.' : 'Consultando a coleção atual antes de prosseguir.'}</p>{profileReceiptPending && <button type="button" onClick={() => void onboarding.refresh()}>Atualizar perfis</button>}</div>}
        {!missingProfileType && <p className="notice compact-notice" role="status">Os dois papéis já têm perfis vivos. Você pode concluir a configuração inicial.</p>}
        {profileFormOpen && missingProfileType && <ProfileForm
          key={`${profileFormKey}:${profileType}`}
          projectId={null}
          profileId={null}
          initialProfileType={profileType}
          lockInitialProfileType
          onClose={() => {
            if (profileDirtyRef.current) onRequestClose();
            else {
              setProfileFormOpen(false);
              requestAnimationFrame(focusProfileStepHeading);
            }
          }}
          onSavingChange={setProfileSaving}
          onDirtyChange={(dirty) => { profileDirtyRef.current = dirty; setProfileDirty(dirty); }}
          catalogRetryLabel="Tentar novamente"
          onSaved={(eventCursor) => profileSaved(eventCursor)}
        />}
        {!profileFormOpen && missingProfileType && <div className="onboarding-profile-create">
          <p>{missingProfileType === 'implementer' ? 'Comece criando o perfil usado para implementar as issues.' : 'O perfil de Implementador está confirmado. Agora crie o perfil usado na revisão independente.'}</p>
          <button type="button" className="primary" onClick={() => openProfileForm(missingProfileType)} disabled={commandBlocked || profileReceiptPending}>
            Criar perfil de {missingProfileType === 'implementer' ? 'Implementador' : 'Revisor'}
          </button>
        </div>}
      </>}
    </section>

    {operationMessage && <div className={onboarding.operation.status === 'failed' ? 'notice onboarding-error' : 'notice onboarding-status'} role={onboarding.operation.status === 'failed' ? 'alert' : 'status'}><p>{operationMessage}</p></div>}
    {completionReceiptPending && <button type="button" onClick={() => void onboarding.refresh()} disabled={onboarding.load.refreshing}>Atualizar confirmação</button>}
    {activeStep !== 'github' && setup.accountOperation.status === 'uncertain' && <div className="notice onboarding-uncertain" role="alert"><b>Vínculo do GitHub sem confirmação</b><p>{setup.accountOperation.message}</p><button type="button" onClick={() => void setup.recoverAccountOperation()}>Consultar operação original</button>{setup.accountOperation.recoveryError && <p>{setup.accountOperation.recoveryError}</p>}</div>}
    {activeStep !== 'github' && setup.executableOperation.status === 'uncertain' && <div className="notice onboarding-uncertain" role="alert"><b>Caminho do GitHub CLI sem confirmação</b><p>{setup.executableOperation.message}</p><button type="button" onClick={() => void setup.recoverExecutableOperation()}>Consultar operação original</button>{setup.executableOperation.recoveryError && <p>{setup.executableOperation.recoveryError}</p>}</div>}
    {onboarding.operation.status === 'uncertain' && <UncertainOperationFeedback operation={onboarding.operation} onRecover={onboarding.recover} />}
    {onboarding.load.error && settings && <div className="notice onboarding-read-error" role="alert"><p>A consulta mais recente falhou; os dados exibidos continuam sendo da última leitura confirmada. {onboarding.load.error.message}</p><button type="button" onClick={() => void onboarding.refresh()} disabled={onboarding.load.refreshing}>Tentar atualizar</button></div>}

    <div className="onboarding-footer dialog-actions">
      <div className="onboarding-footer-secondary">
        <button type="button" onClick={onRequestClose} disabled={saving}>Fechar por enquanto</button>
        <button type="button" className="quiet-button" onClick={suppress} disabled={operationBusy || hasUnsaved}>Não exibir novamente</button>
        {hasUnsaved && <small className="muted">Salve ou descarte as alterações antes de ocultar este assistente.</small>}
      </div>
      <div className="onboarding-step-actions">
        {activeStep === 'projects_root' && <button type="button" onClick={() => requestStep('github')} disabled={!canVisitStep('github') || operationBusy}>Voltar</button>}
        {activeStep === 'profiles' && <button type="button" onClick={() => requestStep('projects_root')} disabled={!canVisitStep('projects_root') || operationBusy}>Voltar</button>}
        {activeStep === 'github' && <button type="button" className="primary" onClick={() => requestStep('projects_root')} disabled={!canAdvanceGitHub || operationBusy}>Continuar para a pasta</button>}
        {activeStep === 'projects_root' && <button type="button" className="primary" onClick={() => requestStep('profiles')} disabled={!canAdvanceRoot || operationBusy}>Continuar para os perfis</button>}
        {activeStep === 'profiles' && isFinalSetupState && <button type="button" className="primary" onClick={() => void onboarding.complete()} disabled={!canComplete || operationBusy}>Concluir configuração</button>}
      </div>
    </div>
    {onboarding.operation.status === 'failed' && onboarding.operation.kind === 'suppress' && <div className="error" role="alert"><p>Não foi possível salvar a preferência. {onboarding.operation.message}</p></div>}
    </div>
    {showExitPrompt && <div className="onboarding-prompt-layer"><section className="onboarding-exit-prompt" role="alert" aria-labelledby="onboarding-exit-title" aria-describedby="onboarding-exit-description">
      <span className="eyebrow">Configuração inicial</span>
      <h3 id="onboarding-exit-title">Há alterações ainda não salvas</h3>
      <p id="onboarding-exit-description">Continuar mantém o formulário, a etapa e os valores digitados. Descartar remove somente as edições locais; as etapas já confirmadas continuam salvas.</p>
      {closePrompt
        ? <div className="onboarding-exit-actions"><button ref={exitContinueRef} type="button" onClick={onContinueClose}>Continuar configurando</button><button type="button" className="danger-button" onClick={onDiscardClose}>Descartar alterações</button></div>
        : <div className="onboarding-exit-actions"><button ref={exitContinueRef} type="button" onClick={continuePendingStep}>Continuar configurando</button><button type="button" className="danger-button" onClick={discardPendingStep}>Descartar alterações</button></div>}
    </section></div>}
  </div>;
}

function operationFeedback(operation: OnboardingController['operation']): string | null {
  if (operation.status === 'saving') return operation.kind === 'projects-root' ? 'Validando e salvando a pasta…' : operation.kind === 'complete' ? 'Confirmando a conclusão no controlador…' : 'Salvando a preferência de abertura…';
  if (operation.status === 'failed') return operation.kind === 'complete' ? operation.message : null;
  if (operation.status === 'confirmed' && operation.kind === 'complete') return operation.receipt ? 'O recibo de conclusão foi confirmado. Consultando o marco salvo…' : null;
  if (operation.status === 'confirmed' && operation.kind === 'suppress') return 'A preferência para não reexibir foi salva.';
  return null;
}

function UncertainOperationFeedback({ operation, onRecover }: {
  operation: Extract<OnboardingController['operation'], { status: 'uncertain' }>;
  onRecover: (resend?: boolean) => Promise<void>;
}) {
  return <div className="notice onboarding-uncertain" role="alert">
    <b>Operação sem confirmação</b>
    <p>{operation.message}</p>

    <div className="row"><button type="button" onClick={() => void onRecover()} disabled={operation.status !== 'uncertain'}>Consultar resultado</button>{operation.canResend && <button type="button" onClick={() => void onRecover(true)}>Reapresentar a mesma operação</button>}</div>
    {operation.recoveryError && <p>{operation.recoveryError}</p>}
  </div>;
}
