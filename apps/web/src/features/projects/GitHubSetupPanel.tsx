import { CustomSelect } from '../../app/CustomSelect.js';
import type { ReactNode } from 'react';
import type { GitHubSetupOptions, SettingsView } from '#contracts';
import type { NativeSelectionController } from './useNativeSelection.js';
import { nativeSelectionMessage } from './useNativeSelection.js';
import type { GitHubSettingsOperation, GitHubSetupController } from './useGitHubSetup.js';
import { FieldHelp } from './FieldHelp.js';
import { OperatorDiagnosticCard } from '../../app/OperatorSupport.js';

export function GitHubSetupPanel({ settings, settingsEtag, setup, selection, disabled = false, conditions, compactHeading = false }: {
  compactHeading?: boolean;
  conditions?: ReactNode;
  settings: SettingsView;
  settingsEtag: string;
  setup: GitHubSetupController;
  selection: NativeSelectionController;
  disabled?: boolean;
}) {
  const options = setup.verification.data;
  const verificationReady = setup.verification.status === 'ready';
  const verificationError = setup.verification.status === 'error' ? setup.verification.error : null;
  const verificationStale = options !== null && (setup.verification.status !== 'ready' || setup.verification.settingsEtag !== settingsEtag);
  const checking = setup.verification.status === 'idle' || setup.verification.status === 'checking';
  const linkedAccount = options?.linked_account?.id === settings.settings.account_id ? options?.linked_account : null;
  const linkedLogin = linkedAccount ? `@${linkedAccount.login}` : !settings.settings.account_id ? 'Nenhuma conta vinculada' : checking ? 'Consultando conta…' : 'Vínculo salvo; consulta não confirmada';
  const accountMismatch = Boolean(options?.linked_account && options.observed_account && options.linked_account.id !== options.observed_account.id);
  const settingsMismatch = options !== null && (options.linked_account?.id ?? null) !== settings.settings.account_id;
  const operationBusy = setup.accountOperation.status === 'saving' || setup.executableOperation.status === 'saving' || disabled;
  const ghCandidate = selection.candidates.gh_executable;
  const ghCandidateSaved = setup.executableOperation.status === 'confirmed' && setup.executableOperation.savedPath === ghCandidate;
  const ghSelectionState = selection.state.status !== 'idle' && selection.state.kind === 'gh_executable' ? selection.state : null;
  const ghSelectionBusy = ghSelectionState?.status === 'selecting';
  const ghSelectionWarning = ghSelectionState?.status === 'unavailable' || ghSelectionState?.status === 'expired' || ghSelectionState?.status === 'concurrent';
  const executableMissing = options !== null && options.executable.state !== 'observed' &&
    !options.executable.diagnostics.some((item) => item.code === 'GITHUB_CONTEXT_UNAVAILABLE');
  const canLocateExecutable = executableMissing && !verificationStale && settings.selection_capabilities.gh_executable.available;
  const bindingPending = setup.accountOperation.status === 'uncertain' || setup.accountOperation.status === 'saving';
  const accountActionLabel = setup.bindingAction === 'bind' || settings.settings.account_id === null ? 'Vincular conta' : 'Trocar conta';

  return <section className={`card form-section github-setup-panel${compactHeading ? ' github-setup-compact' : ''}`} aria-labelledby={compactHeading ? 'onboarding-step-title' : 'github-setup-title'}>
    <div className={compactHeading ? 'github-verification-action' : 'panel-title line'}>
      {!compactHeading && <div><h2 id="github-setup-title">Conta GitHub</h2></div>}
      <button type="button" onClick={() => void setup.verify()} disabled={disabled || setup.verification.status === 'checking'} aria-busy={setup.verification.status === 'checking'}>
        {setup.verification.status === 'checking' ? 'Verificando…' : 'Verificar status'}
      </button>
    </div>

    {verificationError && <div className="notice" role="alert"><b>Status do GitHub não confirmado</b><p>{verificationError.message}</p><p>A falha desta consulta não altera nem apaga o resultado de uma gravação.</p></div>}
    {verificationStale && <div className="notice" role="status"><b>Observação anterior à configuração atual</b><p>Atualize a configuração e verifique o status novamente antes de vincular ou trocar a conta.</p></div>}

    <div className="github-account-summary github-factory-account" aria-live="polite">
      <div><span className="eyebrow">Vinculada à fábrica</span><strong>{linkedLogin}</strong></div>
    </div>
    {conditions}
    {accountMismatch && <div className="notice" role="alert">
      <b>Conta ativa diferente da vinculada</b>
      <p>A fábrica está vinculada a <strong>@{options?.linked_account?.login}</strong>, enquanto o GitHub CLI observa <strong>@{options?.observed_account?.login}</strong>. Verificar status atualiza somente a observação; a troca é uma ação separada.</p>
    </div>}
    {settingsMismatch && !verificationStale && <div className="notice" role="alert"><b>A configuração mudou durante a consulta</b><p>Releia a configuração e verifique o status antes de vincular uma conta.</p></div>}

    {options && <>
      {options.retry_at_ms !== null && <p className="notice" role="status">A próxima consulta GitHub está prevista para {new Date(options.retry_at_ms).toLocaleString('pt-BR')}.</p>}

      {setup.eligibleAccounts.length > 0 && <div className="form-grid github-binding-controls">
        <div className="form-field"><label htmlFor="github-eligible-login">Conta elegível</label>
          <CustomSelect id="github-eligible-login" value={setup.selectedLogin} aria-describedby="github-eligible-login-help" onChange={(event) => setup.setSelectedLogin(event.currentTarget.value)} disabled={!setup.observationCurrent || operationBusy || bindingPending}>
            <option value="">Selecione pelo login</option>
            {setup.eligibleAccounts.map((account) => <option key={account.id} value={account.login}>@{account.login}</option>)}
          </CustomSelect>
          <FieldHelp id="github-eligible-login-help" label="Conta elegível" />
        </div>
        <div className="form-field github-binding-action">
          <span>Vínculo com a fábrica</span>
          <button type="button" className="primary" onClick={() => void setup.bindSelectedAccount()} disabled={!setup.bindingAction || !setup.observationCurrent || operationBusy || bindingPending}>
            {setup.accountOperation.status === 'saving' ? 'Salvando vínculo…' : accountActionLabel}
          </button>
        </div>
      </div>}
      {setup.eligibleAccounts.length === 0 && verificationReady && <p className="empty">Nenhuma conta ativa, válida e confirmada está disponível para vínculo.</p>}

      <GitHubDiagnostics options={options} />
    </>}

    <GitHubOperationFeedback operation={setup.accountOperation} kind="binding" onConsult={() => void setup.recoverAccountOperation()} />

    {canLocateExecutable && <section className="github-executable-picker" aria-label="Localizar GitHub CLI">
      <p className="muted">Não há candidato válido no contexto atual. Localize o executável somente como último recurso.</p>
      <button type="button" onClick={() => void selection.select('gh_executable')} disabled={disabled || ghSelectionBusy || operationBusy}>
        {ghSelectionBusy ? 'Aguardando a janela…' : 'Localizar gh.exe'}
      </button>
    </section>}
    {options && !options.executable.diagnostics.some((item) => item.code === 'GITHUB_CONTEXT_UNAVAILABLE') && executableMissing && !settings.selection_capabilities.gh_executable.available && settings.selection_capabilities.gh_executable.reason &&
      <p className="notice" role="status">{settings.selection_capabilities.gh_executable.reason}</p>}

    {ghSelectionState && !ghCandidateSaved && <p className={ghSelectionWarning ? 'selection-message selection-message-warning' : 'selection-message'} role={ghSelectionWarning ? 'alert' : 'status'}>
      {nativeSelectionMessage(ghSelectionState)}
    </p>}
    {ghCandidate && <div className="github-executable-candidate">
      <p><strong>{ghCandidateSaved ? 'Caminho salvo' : 'Candidato escolhido'}:</strong> <span className="mono">{ghCandidate}</span></p>
      {ghCandidateSaved
        ? <p role="status">O recibo confirmou o save. Verifique novamente o status para confirmar que este executável está ativo.</p>
        : <><p className="muted">A escolha ainda não foi salva. O controlador validará o executável antes de gravar.</p><button type="button" onClick={() => void setup.saveExecutable(ghCandidate)} disabled={disabled || operationBusy || setup.executableOperation.status === 'uncertain'}>
          {setup.executableOperation.status === 'saving' ? 'Validando e salvando…' : 'Validar e salvar caminho'}
        </button></>}
    </div>}
    <GitHubOperationFeedback operation={setup.executableOperation} kind="executable" onConsult={() => void setup.recoverExecutableOperation()} />
  </section>;
}

export function GitHubDiagnostics({ options }: { options: GitHubSetupOptions }) {
  const diagnostics = [...new Map([...options.executable.diagnostics, ...options.diagnostics]
    .map((item) => [JSON.stringify([item.code, item.message, item.recovery]), item])).values()];
  const searchCodes = new Set(['GH_CANDIDATE_NOT_FOUND', 'GH_CANDIDATE_INVALID', 'GH_CANDIDATE_PATH_INVALID']);
  const actionable = diagnostics.filter((item) => !searchCodes.has(item.code));
  if (diagnostics.length === 0) return null;
  return <div className="github-diagnostics" aria-label="Diagnóstico do GitHub">
    {actionable.map((item, index) => <OperatorDiagnosticCard key={`${item.code}-${index}`} code={item.code} state="unavailable" cause={item.message} recovery={item.recovery} />)}
  </div>;
}

function GitHubOperationFeedback({ operation, kind, onConsult }: { operation: GitHubSettingsOperation; kind: 'binding' | 'executable'; onConsult: () => void }) {
  if (operation.status === 'idle' || operation.status === 'saving') return null;
  if (operation.status === 'confirmed') return <div className="notice" role="status">
    <b>{operation.message}</b>
    {operation.warnings.map((warning, index) => <p key={`${warning.code}-${index}`}>{warning.message}</p>)}
  </div>;
  if (operation.status === 'uncertain') return <div className="notice" role="alert">
    <b>{kind === 'binding' ? 'Vínculo sem confirmação' : 'Gravação do executável sem confirmação'}</b>
    <p>{operation.message}</p>
    {operation.targetLogin && <p>Conta selecionada para a operação original: @{operation.targetLogin}</p>}
    {operation.targetPath && <p>O caminho da operação original foi preservado em memória para consulta.</p>}

    <button type="button" onClick={onConsult}>Consultar operação original</button>
    {operation.recoveryError && <p role="alert">{operation.recoveryError}</p>}
  </div>;
  return <div className="notice" role="alert">
    <b>{kind === 'binding' ? 'Vínculo não salvo' : 'Caminho do executável não salvo'}</b>
    <p>{operation.message}</p>
    {operation.recovery && <p>{operation.recovery}</p>}

    {operation.activeAttemptId && <p><a href={attemptDetailHref(operation.activeAttemptId)}>Abrir a tentativa ativa que bloqueou a troca</a></p>}
  </div>;
}

function attemptDetailHref(attemptId: string): string {
  const params = new URLSearchParams({ attemptId, dialog: 'detail' });
  return `#principal/tentativas?${params.toString()}`;
}
