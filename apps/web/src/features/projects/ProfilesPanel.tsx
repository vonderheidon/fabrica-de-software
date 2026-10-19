import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { SettingsSaved, StoredExecutionProfile } from '#contracts';
import {
  consultConfigurationSave, finishConfigurationSave, hasOriginalConfigurationSave,
  resendConfigurationSave, retainConfigurationSave,
} from '../../api/configuration-save.js';
import { getControllerInstanceId, HttpError, requestJsonWithMetadata } from '../../api/http.js';
import { configurationCommand } from './configuration-requests.js';
import { filterProfiles, isLastProfileOfType, profileModelOptions, profileNameConfirmationMatches, type ProfileTypeFilter } from './profile-collection.js';
import { useConfiguration } from './useConfiguration.js';
import { readUncertainOperations } from '../../api/uncertain-operations.js';

type ProfileDeleteFlow = {
  profile: Pick<StoredExecutionProfile, 'id' | 'name' | 'profile_type'>;
  typedName: string;
  status: 'confirm' | 'error' | 'uncertain';
  error: HttpError | null;
  message: string;
  operationId: string | null;
  canResend: boolean;
};

type PendingProfileRefresh = { eventCursor: string | null; previousEtag: string | null };

const roleTabs: readonly { value: ProfileTypeFilter; label: string; count: (counts: { all: number; implementer: number; reviewer: number }) => number }[] = [
  { value: 'all', label: 'Todos', count: (counts) => counts.all },
  { value: 'implementer', label: 'Implementador', count: (counts) => counts.implementer },
  { value: 'reviewer', label: 'Revisor', count: (counts) => counts.reviewer },
];

export function ProfilesPanel({ onOpenProfileDialog }: {
  onOpenProfileDialog: (profileId: string | null, projectId: string | null, trigger: HTMLElement) => void;
}) {
  const { load, setLoad, retry, refreshError } = useConfiguration(null);
  const [query, setQuery] = useState('');
  const [modelKey, setModelKey] = useState('');
  const [profileType, setProfileType] = useState<ProfileTypeFilter>('all');
  const [deleteFlow, setDeleteFlow] = useState<ProfileDeleteFlow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [recoveryOperationId, setRecoveryOperationId] = useState<string | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoveryCanResend, setRecoveryCanResend] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const [pendingProfileRefresh, setPendingProfileRefresh] = useState<PendingProfileRefresh | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const deleteReturnFocusRef = useRef<HTMLElement | null>(null);
  const profiles = load.status === 'ready' ? load.view.profiles : [];
  const counts = load.status === 'ready' ? load.view.profile_counts : { all: 0, implementer: 0, reviewer: 0 };
  const models = profileModelOptions(profiles);
  const visibleProfiles = filterProfiles(profiles, { query, modelKey, profileType });
  const filtersAreActive = query !== '' || modelKey !== '' || profileType !== 'all';

  useEffect(() => {
    if (modelKey && !models.some((model) => model.key === modelKey)) setModelKey('');
  }, [modelKey, models]);

  useEffect(() => {
    const pending = readUncertainOperations()
      .filter((operation) => operation.kind === 'profile-delete')
      .sort((left, right) => left.recordedAt - right.recordedAt)
      .at(-1);
    if (!pending) return;
    setRecoveryOperationId(pending.operationId);
    setRecoveryMessage('Uma exclusão anterior ainda não tem resultado confirmado. Consulte a operação antes de iniciar outra exclusão.');
  }, []);

  useEffect(() => {
    const onProfileSaved = (event: Event): void => {
      const detail = (event as CustomEvent<Partial<PendingProfileRefresh>>).detail;
      if (detail?.eventCursor && /^\d+$/.test(detail.eventCursor)) {
        setPendingProfileRefresh({ eventCursor: detail.eventCursor, previousEtag: detail.previousEtag ?? null });
      } else {
        setPendingProfileRefresh({ eventCursor: null, previousEtag: detail?.previousEtag ?? null });
      }
      setSaveNotice('Perfil salvo. Atualizando a lista e as contagens.');
    };
    window.addEventListener('factory-profile-saved', onProfileSaved);
    return () => window.removeEventListener('factory-profile-saved', onProfileSaved);
  }, []);

  useEffect(() => {
    if (!pendingProfileRefresh || load.status !== 'ready') return;
    const cursorReached = pendingProfileRefresh.eventCursor !== null &&
      BigInt(load.view.event_cursor) >= BigInt(pendingProfileRefresh.eventCursor);
    const revisionChanged = pendingProfileRefresh.eventCursor === null && pendingProfileRefresh.previousEtag !== null &&
      load.etag !== pendingProfileRefresh.previousEtag;
    if (!cursorReached && !revisionChanged) return;
    setPendingProfileRefresh(null);
    setSaveNotice('Perfil salvo. A lista e as contagens foram atualizadas.');
  }, [load, pendingProfileRefresh]);

  function openDelete(profile: StoredExecutionProfile, trigger: HTMLElement): void {
    setSaveNotice('');
    deleteReturnFocusRef.current = trigger;
    setDeleteFlow({
      profile: { id: profile.id, name: profile.name, profile_type: profile.profile_type },
      typedName: '', status: 'confirm', error: null, message: '', operationId: null, canResend: false,
    });
  }

  function updateDeleteFlow(update: (current: ProfileDeleteFlow) => ProfileDeleteFlow): void {
    setDeleteFlow((current) => current ? update(current) : current);
  }

  function applySettingsResponse(operationId: string, data: SettingsSaved, etag: string | null): void {
    if (!etag || data.operation_id !== operationId || !data.receipt) throw new Error('A exclusão foi enviada, mas o recibo ou a revisão não pôde ser confirmado.');
    finishConfigurationSave(operationId);
    setLoad({ status: 'ready', identity: 'global-settings', view: data, etag });
    setDeleteFlow(null);
    setRecoveryOperationId(null);
    setRecoveryCanResend(false);
    setRecoveryMessage('');
    setSaveNotice('Exclusão confirmada. A lista e as contagens foram atualizadas.');
    window.dispatchEvent(new Event('factory-controller-resync'));
  }

  async function submitDelete(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!deleteFlow || deleteBusy || recoveryOperationId || load.status !== 'ready' ||
      !profileNameConfirmationMatches(deleteFlow.profile.name, deleteFlow.typedName)) return;
    const instanceId = getControllerInstanceId();
    if (!instanceId) {
      updateDeleteFlow((current) => ({ ...current, status: 'error', error: null, message: 'Atualize a configuração antes de excluir o perfil.' }));
      return;
    }

    const operationId = crypto.randomUUID();
    const body = JSON.stringify(configurationCommand(null, {}, [{ action: 'delete', id: deleteFlow.profile.id }]));
    const request = {
      operationId,
      path: '/api/v1/settings' as const,
      method: 'PUT' as const,
      body,
      etag: load.etag,
      accountId: load.view.settings.account_id,
      instanceId,
      installationId: load.view.settings.installation_id,
    };
    let requestStarted = false;
    setDeleteBusy(true);
    setSaveNotice('');
    updateDeleteFlow((current) => ({ ...current, status: 'confirm', error: null, message: '', operationId, canResend: false }));
    try {
      retainConfigurationSave(request, 'profile-delete');
      requestStarted = true;
      const { data, etag } = await requestJsonWithMetadata<SettingsSaved>(request.path, {
        method: request.method,
        headers: { 'If-Match': request.etag, 'Idempotency-Key': operationId },
        body,
      });
      applySettingsResponse(operationId, data, etag);
    } catch (error: unknown) {
      const http = error instanceof HttpError ? error : null;
      const uncertain = requestStarted && (!http || http.status === 401 || http.status >= 500);
      if (!uncertain) finishConfigurationSave(operationId);
      if (http?.status === 412) retry();
      if (uncertain) {
        setRecoveryOperationId(operationId);
        setRecoveryMessage('A exclusão não tem resultado confirmado. Consulte a operação antes de iniciar outra exclusão.');
      }
      updateDeleteFlow((current) => ({
        ...current,
        status: uncertain ? 'uncertain' : 'error',
        error: http,
        message: uncertain
          ? 'A resposta da exclusão não foi confirmada. Consulte o resultado antes de enviar outro comando.'
          : http?.message ?? (error instanceof Error ? error.message : 'Não foi possível confirmar a exclusão.'),
        operationId: uncertain ? operationId : null,
        canResend: false,
      }));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function inspectDelete(operationId: string): Promise<void> {
    if (deleteBusy || recoveryBusy) return;
    setDeleteBusy(true);
    updateDeleteFlow((current) => current ? { ...current, message: 'Consultando a exclusão original…', canResend: false } : current);
    try {
      const result = await consultConfigurationSave(operationId);
      if (!result) {
        const canResend = hasOriginalConfigurationSave(operationId);
        setRecoveryCanResend(canResend);
        if (deleteFlow) updateDeleteFlow((current) => ({ ...current, status: 'uncertain', canResend, message: 'A operação não foi localizada. Isso não confirma que a exclusão deixou de ocorrer.' }));
        else setRecoveryMessage('A operação não foi localizada. Isso não confirma que a exclusão deixou de ocorrer.');
      } else if (result.state === 'succeeded' && result.receipt) {
        finishConfigurationSave(operationId);
        setDeleteFlow(null);
        setRecoveryOperationId(null);
        setRecoveryCanResend(false);
        setRecoveryMessage('Exclusão confirmada. Atualizando a lista e as contagens.');
        setSaveNotice('Exclusão confirmada. A lista e as contagens serão atualizadas.');
        retry();
      } else if (result.state === 'failed') {
        finishConfigurationSave(operationId);
        setDeleteFlow((current) => current ? { ...current, status: 'error', error: null, operationId: null, canResend: false, message: result.error?.message ?? 'O controlador confirmou que a exclusão falhou.' } : null);
        setRecoveryOperationId(null);
        setRecoveryCanResend(false);
        setRecoveryMessage('O controlador confirmou que a exclusão falhou. Consulte a coleção atual antes de tentar novamente.');
        retry();
      } else {
        const message = `A exclusão permanece ${result.state}. Consulte novamente antes de enviar outro comando.`;
        if (deleteFlow) updateDeleteFlow((current) => ({ ...current, status: 'uncertain', message, canResend: false }));
        else setRecoveryMessage(message);
      }
    } catch (error: unknown) {
      const message = error instanceof HttpError ? error.message : 'Não foi possível consultar a exclusão original.';
      if (deleteFlow) updateDeleteFlow((current) => ({ ...current, status: 'uncertain', message, canResend: false }));
      else setRecoveryMessage(message);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function resendDelete(operationId: string): Promise<void> {
    if (deleteBusy || recoveryBusy) return;
    setDeleteBusy(true);
    try {
      const saved = await resendConfigurationSave<SettingsSaved>(operationId);
      applySettingsResponse(operationId, saved.data, saved.etag);
    } catch (error: unknown) {
      const http = error instanceof HttpError ? error : null;
      const uncertain = !http || http.status === 401 || http.status >= 500;
      if (!uncertain) finishConfigurationSave(operationId);
      if (http?.status === 412) retry();
      if (uncertain) {
        setRecoveryOperationId(operationId);
        setRecoveryMessage('A reapresentação ainda não tem confirmação. Consulte a mesma operação novamente.');
      }
      const message = uncertain
        ? 'A reapresentação continua sem confirmação. Consulte a mesma operação novamente.'
        : http?.message ?? (error instanceof Error ? error.message : 'Não foi possível reapresentar a exclusão.');
      if (deleteFlow) updateDeleteFlow((current) => ({ ...current, status: uncertain ? 'uncertain' : 'error', error: http, message, operationId: uncertain ? operationId : null, canResend: false }));
      else {
        setRecoveryMessage(message);
        setRecoveryCanResend(false);
        if (!uncertain) setRecoveryOperationId(null);
      }
    } finally {
      setDeleteBusy(false);
    }
  }

  async function inspectOrphanedDelete(): Promise<void> {
    if (!recoveryOperationId || recoveryBusy) return;
    setRecoveryBusy(true);
    try {
      const result = await consultConfigurationSave(recoveryOperationId);
      if (!result) {
        setRecoveryCanResend(hasOriginalConfigurationSave(recoveryOperationId));
        setRecoveryMessage('A operação não foi localizada. Isso não confirma que a exclusão deixou de ocorrer.');
      } else if (result.state === 'succeeded' && result.receipt) {
        finishConfigurationSave(recoveryOperationId);
        setRecoveryOperationId(null);
        setRecoveryCanResend(false);
        setRecoveryMessage('Exclusão confirmada. Atualizando os dados atuais.');
        setSaveNotice('Exclusão confirmada. A lista e as contagens serão atualizadas.');
        retry();
      } else if (result.state === 'failed') {
        finishConfigurationSave(recoveryOperationId);
        setRecoveryOperationId(null);
        setRecoveryCanResend(false);
        setRecoveryMessage(result.error?.message ?? 'O controlador confirmou que a exclusão falhou.');
        retry();
      } else setRecoveryMessage(`A exclusão permanece ${result.state}. Consulte novamente antes de enviar outro comando.`);
    } catch (error: unknown) {
      setRecoveryMessage(error instanceof HttpError ? error.message : 'Não foi possível consultar a exclusão original.');
    } finally {
      setRecoveryBusy(false);
    }
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % roleTabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index + roleTabs.length - 1) % roleTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = roleTabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const tab = roleTabs[nextIndex];
    if (!tab) return;
    setProfileType(tab.value);
    tabRefs.current[nextIndex]?.focus();
  }

  const filters = (
    <>
      <div className="profiles-filter-grid">
        <label className="form-field" htmlFor="profile-search">Buscar por nome ou orientação
          <input id="profile-search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Digite o texto completo" />
        </label>
        <label className="form-field" htmlFor="profile-model-filter">Provider e modelo
          <select id="profile-model-filter" value={modelKey} onChange={(event) => setModelKey(event.currentTarget.value)}>
            <option value="">Todos os providers e modelos</option>
            {models.map((model) => <option key={model.key} value={model.key}>{model.provider} · {model.model}</option>)}
          </select>
        </label>
      </div>
      <div className="profile-type-tabs" role="tablist" aria-label="Filtrar perfis por tipo" aria-orientation="horizontal">
        {roleTabs.map((tab, index) => <button
          key={tab.value}
          ref={(element) => { tabRefs.current[index] = element; }}
          id={`profiles-tab-${tab.value}`}
          type="button"
          role="tab"
          aria-selected={profileType === tab.value}
          aria-controls="profile-results"
          tabIndex={profileType === tab.value ? 0 : -1}
          onClick={() => setProfileType(tab.value)}
          onKeyDown={(event) => onTabKeyDown(event, index)}
        >{tab.label}<span className="profile-count">{tab.count(counts)}</span></button>)}
      </div>
    </>
  );

  return <section className="card profiles-panel">
    <div className="line panel-title profiles-panel-heading">
      <div><span className="eyebrow">Coleção compartilhada</span><h2 id="profiles-heading" tabIndex={-1}>Perfis cadastrados</h2></div>
      <button type="button" className="primary" onClick={(event) => onOpenProfileDialog(null, null, event.currentTarget)} disabled={load.status !== 'ready' || counts.all >= 100 || Boolean(recoveryOperationId) || deleteBusy || Boolean(deleteFlow)}>Novo perfil</button>
    </div>
    {saveNotice && <p className="profile-save-confirmation" role="status">{saveNotice}</p>}
    {load.status === 'error' && <div className="queue-error" role="alert"><p>{load.message}</p><button type="button" onClick={retry}>Tentar novamente</button></div>}
    {load.status === 'loading' && <div className="read-state-inline" role="status"><p>Consultando perfis cadastrados…</p></div>}
    {load.status === 'ready' && refreshError && <div className="notice compact-notice" role="status"><p>A atualização falhou. Os dados visíveis continuam sendo da leitura anterior.</p><button type="button" onClick={retry}>Atualizar perfis</button></div>}
    {recoveryOperationId && !deleteFlow && <div className="notice profile-delete-recovery" role="status"><b>Exclusão sem confirmação</b><p>{recoveryMessage || 'Consulte o resultado antes de enviar outra exclusão.'}</p><div className="row"><button type="button" onClick={() => void inspectOrphanedDelete()} disabled={recoveryBusy || deleteBusy}>{recoveryBusy ? 'Consultando…' : 'Consultar exclusão original'}</button>{recoveryCanResend && <button type="button" onClick={() => void resendDelete(recoveryOperationId)} disabled={recoveryBusy || deleteBusy}>Reapresentar a mesma exclusão</button>}</div></div>}
    {load.status === 'ready' && <>
      {filters}
      <div id="profile-results" className="profile-results" role="tabpanel" aria-labelledby={`profiles-tab-${profileType}`}>
        {profiles.length === 0 ? <div className="profile-empty" role="status"><h3>Nenhum perfil cadastrado</h3><p>Crie um perfil global para disponibilizá-lo nos projetos e preparações.</p>{filtersAreActive && <button type="button" onClick={() => { setQuery(''); setModelKey(''); setProfileType('all'); }}>Limpar filtros</button>}</div>
          : visibleProfiles.length === 0 ? <div className="profile-empty" role="status"><h3>Nenhum perfil encontrado</h3><p>A coleção não contém perfis com esta combinação de filtros.</p>{filtersAreActive && <button type="button" onClick={() => { setQuery(''); setModelKey(''); setProfileType('all'); }}>Limpar filtros</button>}</div>
            : <>
              <p className="profiles-result-count" aria-live="polite">Exibindo {visibleProfiles.length} de {profiles.length} perfis vivos.</p>
              <div className="profile-collection-grid">{visibleProfiles.map((profile) => <ProfileCard
                key={profile.id}
                profile={profile}
                onEdit={(trigger) => onOpenProfileDialog(profile.id, null, trigger)}
                onDelete={(trigger) => openDelete(profile, trigger)}
                deleteDisabled={Boolean(recoveryOperationId) || deleteBusy || Boolean(deleteFlow)}
                editDisabled={Boolean(recoveryOperationId) || deleteBusy || Boolean(deleteFlow)}
              />)}</div>
            </>}
      </div>
      {deleteFlow && <ProfileDeleteConfirmation
        flow={deleteFlow}
        profiles={profiles}
        busy={deleteBusy}
        returnFocusTarget={deleteReturnFocusRef.current}
        onChange={(update) => updateDeleteFlow(update)}
        onCancel={() => setDeleteFlow(null)}
        onSubmit={(event) => void submitDelete(event)}
        onInspect={() => deleteFlow.operationId && void inspectDelete(deleteFlow.operationId)}
        onResend={() => deleteFlow.operationId && void resendDelete(deleteFlow.operationId)}
      />}
    </>}
  </section>;
}

function ProfileCard({ profile, onEdit, onDelete, deleteDisabled, editDisabled }: {
  profile: StoredExecutionProfile;
  onEdit: (trigger: HTMLElement) => void;
  onDelete: (trigger: HTMLElement) => void;
  deleteDisabled: boolean;
  editDisabled: boolean;
}) {
  const role = profile.profile_type === 'implementer' ? 'Implementador' : 'Revisor';
  return <article className="profile-card profile-global-card">
    <div className="profile-card-heading">
      <span className={`profile-card-symbol profile-card-symbol-${profile.profile_type}`} aria-hidden="true">{profile.profile_type === 'implementer' ? '✦' : '◉'}</span>
      <div><h3>{profile.name}</h3><span className="pill neutral">{role}</span></div>
    </div>
    <dl className="profile-card-facts">
      <div><dt>Provider</dt><dd>{profile.provider}</dd></div>
      <div><dt>Modelo</dt><dd>{profile.model}</dd></div>
      <div><dt>Esforço</dt><dd>{profile.effort ?? 'Não se aplica'}</dd></div>
    </dl>
    <div className="profile-card-guidance"><b>Orientações</b><p>{profile.guidance.trim() || 'Sem orientações adicionais.'}</p></div>
    <div className="profile-card-actions">
      <button type="button" onClick={(event) => onEdit(event.currentTarget)} aria-label={`Editar perfil ${profile.name}`} disabled={editDisabled}>Editar</button>
      <button type="button" className="danger-button" onClick={(event) => onDelete(event.currentTarget)} aria-label={`Excluir perfil ${profile.name}`} disabled={deleteDisabled}>Excluir</button>
    </div>
  </article>;
}

function ProfileDeleteConfirmation({ flow, profiles, busy, returnFocusTarget, onChange, onCancel, onSubmit, onInspect, onResend }: {
  flow: ProfileDeleteFlow;
  profiles: readonly StoredExecutionProfile[];
  busy: boolean;
  returnFocusTarget: HTMLElement | null;
  onChange: (update: (current: ProfileDeleteFlow) => ProfileDeleteFlow) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onInspect: () => void;
  onResend: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const typedNameMatches = profileNameConfirmationMatches(flow.profile.name, flow.typedName);
  const isLast = isLastProfileOfType(profiles, flow.profile.id, flow.profile.profile_type);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      requestAnimationFrame(() => {
        if (returnFocusTarget?.isConnected && !returnFocusTarget.matches(':disabled')) returnFocusTarget.focus();
        else document.getElementById('profiles-heading')?.focus();
      });
    };
  }, [returnFocusTarget]);
  useEffect(() => {
    if (flow.status === 'confirm' && flow.operationId === null) nameInputRef.current?.focus();
  }, [flow.operationId, flow.profile.id, flow.status]);
  return <dialog ref={dialogRef} className="profile-delete-dialog" aria-labelledby="profile-delete-title" aria-describedby="profile-delete-description" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
    <form className="profile-delete-confirmation" onSubmit={onSubmit}>
    <div><span className="eyebrow">Confirmação de integridade</span><h2 id="profile-delete-title">Excluir “{flow.profile.name}”?</h2><p id="profile-delete-description">Digite o nome completo do perfil para confirmar a exclusão lógica. Perfis usados por projetos atuais ou tentativas ativas terão a exclusão recusada.</p></div>
    {isLast && <div className="notice compact-notice" role="status"><b>Último perfil de {flow.profile.profile_type === 'implementer' ? 'Implementador' : 'Revisor'}</b><p>Se ele for excluído, novos inícios poderão ser bloqueados até que outro perfil deste papel seja criado.</p></div>}
    {flow.error && <ProfileDeleteBlockers error={flow.error} />}
    {flow.message && !flow.error && <p className={flow.status === 'uncertain' ? 'profile-delete-uncertain' : 'profile-delete-message'} role={flow.status === 'uncertain' ? 'status' : 'alert'}>{flow.message}</p>}
    <label className="form-field" htmlFor="profile-delete-name">Nome do perfil
      <input ref={nameInputRef} id="profile-delete-name" value={flow.typedName} maxLength={256} autoComplete="off" disabled={busy || flow.status === 'uncertain'} aria-invalid={flow.typedName.length > 0 && !typedNameMatches} onChange={(event) => {
        const typedName = event.currentTarget.value;
        onChange((current) => ({ ...current, typedName, status: 'confirm', error: null, message: '', operationId: null, canResend: false }));
      }} aria-describedby="profile-delete-help" />
      <small id="profile-delete-help">Digite exatamente: {flow.profile.name}</small>
    </label>
    <div className="profile-delete-actions">
      <button type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
      {flow.status === 'uncertain' && flow.operationId && <button type="button" onClick={onInspect} disabled={busy}>{busy ? 'Consultando…' : 'Consultar exclusão original'}</button>}
      {flow.status === 'uncertain' && flow.canResend && <button type="button" onClick={onResend} disabled={busy}>Reapresentar a mesma exclusão</button>}
      {flow.status !== 'uncertain' && <button type="submit" className="danger-button" disabled={busy || !typedNameMatches}>{busy ? 'Excluindo…' : 'Excluir perfil'}</button>}
    </div>
    </form>
  </dialog>;
}

function ProfileDeleteBlockers({ error }: { error: HttpError }) {
  const projectIds = typeof error.facts?.blocking_project_ids === 'string'
    ? error.facts.blocking_project_ids.split(',').filter((id) => id.length > 0)
    : [];
  const projectCount = typeof error.facts?.blocking_project_count === 'number' ? error.facts.blocking_project_count : projectIds.length;
  const activeAttemptCount = typeof error.facts?.active_attempt_count === 'number' ? error.facts.active_attempt_count : 0;
  const truncated = error.facts?.blocking_project_ids_truncated === true;
  return <div className="notice profile-delete-blockers" role="alert">
    <b>{error.code === 'PROFILE_ACTIVE_ATTEMPT_BLOCKED' ? 'Perfil usado por tentativa ativa' : error.code === 'PROFILE_DELETE_BLOCKED' ? 'Perfil usado por projetos atuais' : 'A exclusão foi recusada'}</b>
    <p>{error.message}</p>
    {activeAttemptCount > 0 && <p>{activeAttemptCount} tentativa(s) ativa(s) ainda usam este perfil. Aguarde um resultado antes de excluir.</p>}
    {projectCount > 0 && <>
      <p>{projectCount} projeto(s) atual(is) usam este perfil. Substitua o perfil nas configurações indicadas e salve antes de excluir.</p>
      <ul>{projectIds.map((projectId, index) => <li key={projectId}><a href={`#principal/configuracao?projectId=${encodeURIComponent(projectId)}`} aria-label={`Abrir configuração do projeto relacionado ${index + 1}`}>Abrir configuração do projeto relacionado {index + 1}</a></li>)}</ul>
      {truncated && <small>A lista de projetos relacionados foi limitada pelo controlador.</small>}
    </>}
    {error.recovery && <p><b>Próxima ação:</b> {error.recovery}</p>}
    {error.requestId && <small>Consulte o suporte do controlador se o impedimento persistir.</small>}
  </div>;
}
