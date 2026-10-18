import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { ConfigurationSaved, ExecutionCatalog, ExecutionProfile, ProfileType, SettingsSaved, StoredExecutionProfile } from '#contracts';
import { finishConfigurationSave, retainConfigurationSave, consultConfigurationSave, hasOriginalConfigurationSave, revalidateConfigurationSave, resendConfigurationSave } from '../../api/configuration-save.js';
import { getControllerInstanceId, HttpError, requestJsonWithMetadata } from '../../api/http.js';
import { useConfiguration } from './useConfiguration.js';
import { configurationCommand } from './configuration-requests.js';
import { createSaveLifecycle } from './save-lifecycle.js';
import { catalogModel, profileChangesForSave, profileCombinationValid, selectProfileModel, selectProfileProvider } from './profile-editor.js';

type CatalogState = { status: 'loading' | 'ready' | 'error'; data: ExecutionCatalog | null; message?: string };
type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'error' | 'conflict'; message: string };
type ProfileValues = ExecutionProfile;

const emptyProfile = (): ProfileValues => ({
  name: '', profile_type: 'implementer', executor: 'maestri-omp', provider: '', model: '', effort: null, guidance: '',
});

function profileValues(profile: StoredExecutionProfile): ProfileValues {
  return {
    name: profile.name, profile_type: profile.profile_type, executor: profile.executor,
    provider: profile.provider, model: profile.model, effort: profile.effort, guidance: profile.guidance,
  };
}

function sameName(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase('pt-BR') === right.trim().toLocaleLowerCase('pt-BR');
}

export function ProfileForm({ projectId, profileId, onClose, onSavingChange, onSaved }: {
  projectId: string | null;
  profileId: string | null;
  onClose: () => void;
  onSavingChange: (pending: boolean) => void;
  onSaved: () => void;
}) {
  const identity = projectId ?? 'global-settings';
  const { load, retry: retryConfiguration, refreshError } = useConfiguration(projectId);
  const lifecycleRef = useRef(createSaveLifecycle(identity));
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const initializedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const [baseline, setBaseline] = useState<ProfileValues | null>(null);
  const [baselineEtag, setBaselineEtag] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileValues | null>(null);
  const [profileLoadError, setProfileLoadError] = useState('');
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading', data: null });
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const catalogRequestRef = useRef(0);
  const catalogControllerRef = useRef<AbortController | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [uncertainId, setUncertainId] = useState<string | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    lifecycleRef.current.activate();
    return () => lifecycleRef.current.dispose();
  }, []);

  useLayoutEffect(() => {
    lifecycleRef.current.dispose();
    lifecycleRef.current.updateIdentity(identity);
    lifecycleRef.current.activate();
  }, [identity]);

  useEffect(() => {
    if (load.status !== 'ready' || load.identity !== identity) return;
    if (initializedRef.current) {
      const refreshed = profileId ? load.view.profiles.find((profile) => profile.id === profileId) : null;
      if (!profileLoadError || !refreshed) return;
      const refreshedValues = profileValues(refreshed);
      setBaseline(refreshedValues);
      setBaselineEtag(load.etag);
      setDraft(refreshedValues);
      setProfileLoadError('');
      return;
    }
    initializedRef.current = true;
    setBaselineEtag(load.etag);
    if (profileId) {
      const stored = load.view.profiles.find((profile) => profile.id === profileId);
      if (!stored) {
        setProfileLoadError('Este perfil não está disponível na configuração atual. Consulte os dados e tente novamente.');
        return;
      }
      const values = profileValues(stored);
      setBaseline(values);
      setDraft(values);
      return;
    }
    setBaseline(null);
    setDraft(emptyProfile());
  }, [identity, load, profileId, profileLoadError]);

  const refreshCatalog = useCallback(async (): Promise<void> => {
    const requestId = catalogRequestRef.current + 1;
    catalogRequestRef.current = requestId;
    catalogControllerRef.current?.abort();
    const controller = new AbortController();
    catalogControllerRef.current = controller;
    setCatalog((current) => ({ status: 'loading', data: current.data }));
    try {
      const { data } = await requestJsonWithMetadata<ExecutionCatalog>('/api/v1/settings/execution-options', { signal: controller.signal });
      if (requestId !== catalogRequestRef.current) return;
      setCatalog({ status: 'ready', data });
    } catch (error: unknown) {
      if (requestId !== catalogRequestRef.current || error instanceof DOMException && error.name === 'AbortError') return;
      const message = error instanceof HttpError ? error.message : 'Não foi possível consultar o catálogo agora.';
      setCatalog((current) => ({ status: 'error', data: current.data, message }));
    }
  }, []);

  useEffect(() => {
    void refreshCatalog();
    return () => {
      catalogRequestRef.current += 1;
      catalogControllerRef.current?.abort();
    };
  }, [refreshCatalog]);

  const loadedCatalog = catalog.status === 'ready' && catalog.data?.state === 'loaded' ? catalog.data : null;
  const displayedCatalog = catalog.data?.state === 'loaded' ? catalog.data : null;
  const canEditSelections = catalog.status === 'ready' && Boolean(loadedCatalog);
  const changes = draft ? profileChangesForSave(profileId, baseline, draft, loadedCatalog) : [];
  const profiles = load.status === 'ready' && load.identity === identity ? load.view.profiles : [];
  const hasValidName = Boolean(draft?.name.trim());
  const duplicateName = Boolean(draft?.name.trim()) && profiles.some((profile) => profile.id !== profileId && sameName(profile.name, draft?.name ?? ''));
  const hasSelectionChanges = Boolean(baseline && draft && (baseline.provider !== draft.provider || baseline.model !== draft.model || baseline.effort !== draft.effort));
  const invalidDraftSelection = Boolean(draft && (!baseline || hasSelectionChanges) && !profileCombinationValid(loadedCatalog, draft));
  const currentModel = useMemo(() => draft ? catalogModel(displayedCatalog, draft.provider, draft.model) : undefined, [displayedCatalog, draft?.provider, draft?.model]);
  const providerExists = Boolean(displayedCatalog?.models.some((model) => model.provider === draft?.provider));
  const modelExists = Boolean(currentModel);
  const effortExists = draft?.effort === null ? currentModel?.efforts.length === 0 : Boolean(currentModel?.efforts.includes(draft?.effort ?? ''));
  const currentChoiceMissing = Boolean(baseline && displayedCatalog && (!providerExists || !modelExists || !effortExists));
  const canApplyConflict = Boolean(saveState.status === 'conflict' && load.status === 'ready' && load.identity === identity && load.etag !== baselineEtag);

  function updateDraft(update: (current: ProfileValues) => ProfileValues): void {
    setDraft((current) => current ? update(current) : current);
  }

  function applyLatestRevision(): void {
    if (!profileId || !baseline || !draft || load.status !== 'ready' || load.identity !== identity) return;
    const stored = load.view.profiles.find((profile) => profile.id === profileId);
    if (!stored) {
      setProfileLoadError('O perfil foi removido na revisão atual. Sua edição continua preservada neste diálogo.');
      return;
    }
    const latest = profileValues(stored);
    const rebased = { ...latest };
    for (const key of ['name', 'profile_type', 'executor', 'provider', 'model', 'effort', 'guidance'] as const) {
      if (baseline[key] !== draft[key]) Object.assign(rebased, { [key]: draft[key] });
    }
    setBaseline(latest);
    setBaselineEtag(load.etag);
    setDraft(rebased);
    setProfileLoadError('');
    setSaveState({ status: 'idle' });
  }

  async function finishUncertainSave(resend = false): Promise<void> {
    if (!uncertainId || saveInFlightRef.current || !draft) return;
    const operation = lifecycleRef.current.begin(identity);
    saveInFlightRef.current = true;
    setSaveState({ status: 'saving' });
    onSavingChange(true);
    setRecoveryMessage('Consultando a gravação original…');
    try {
      if (resend) {
        const original = await revalidateConfigurationSave(uncertainId);
        const saved = projectId
          ? await resendConfigurationSave<ConfigurationSaved>(uncertainId)
          : await resendConfigurationSave<SettingsSaved>(uncertainId);
        if (!saved.etag || saved.data.operation_id !== original.operationId || !saved.data.receipt) throw new Error('A reapresentação não retornou o recibo da operação original.');
        if (!lifecycleRef.current.isCurrent(identityRef.current, operation)) return;
        finishConfigurationSave(uncertainId);
        setUncertainId(null);
        onSavingChange(false);
        onSaved();
        return;
      }
      const result = await consultConfigurationSave(uncertainId);
      if (!lifecycleRef.current.isCurrent(identityRef.current, operation)) return;
      if (!result) {
        setCanResend(hasOriginalConfigurationSave(uncertainId));
        setSaveState({ status: 'error', message: 'A operação não foi localizada. Isso não confirma que a gravação deixou de ocorrer.' });
        setRecoveryMessage('Consulte novamente ou reapresente a mesma operação após revalidar o contexto.');
      } else if (result.state === 'succeeded' && result.receipt) {
        finishConfigurationSave(uncertainId);
        setUncertainId(null);
        onSavingChange(false);
        onSaved();
      } else if (result.state === 'failed') {
        finishConfigurationSave(uncertainId);
        setUncertainId(null);
        setSaveState({ status: 'error', message: result.error?.message ?? 'O controlador confirmou que a gravação falhou.' });
        setRecoveryMessage('A edição continua neste diálogo. Corrija os campos e tente novamente.');
      } else {
        setSaveState({ status: 'error', message: 'A gravação ainda não tem um resultado confirmado.' });
        setRecoveryMessage(`A operação permanece ${result.state}; consulte novamente antes de enviar outro comando.`);
      }
    } catch (error: unknown) {
      if (!lifecycleRef.current.isCurrent(identityRef.current, operation)) return;
      const http = error instanceof HttpError ? error : null;
      setSaveState({ status: 'error', message: http?.message ?? (error instanceof Error ? error.message : 'Não foi possível consultar a operação.') });
      setRecoveryMessage('O rascunho e a identidade da gravação foram preservados.');
    } finally {
      if (lifecycleRef.current.isCurrent(identityRef.current, operation)) {
        saveInFlightRef.current = false;
        onSavingChange(false);
      }
    }
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saveInFlightRef.current || uncertainId || !draft || !draft.name.trim() || changes.length !== 1 || duplicateName) return;
    if (load.status !== 'ready' || load.identity !== identity || !baselineEtag) return;
    const instanceId = getControllerInstanceId();
    if (!instanceId) {
      setSaveState({ status: 'error', message: 'Consulte a configuração antes de salvar.' });
      return;
    }

    const operationId = crypto.randomUUID();
    const payload = configurationCommand(projectId ? {} : null, {}, changes);
    const body = JSON.stringify(payload);
    const path = projectId ? `/api/v1/projects/${encodeURIComponent(projectId)}/configuration` as const : '/api/v1/settings' as const;
    const operation = lifecycleRef.current.begin(identity);
    const headers = { 'If-Match': baselineEtag, 'Idempotency-Key': operationId };
    setSaveState({ status: 'saving' });
    onSavingChange(true);
    setProfileLoadError('');
    saveInFlightRef.current = true;
    let requestStarted = false;
    try {
      retainConfigurationSave({
        operationId, path, method: 'PUT', body, etag: baselineEtag,
        accountId: load.view.settings.account_id, installationId: load.view.settings.installation_id, instanceId,
      });
      requestStarted = true;
      let operationIdFromResponse = '';
      let receiptConfirmed = false;
      let etag: string | null = null;
      if (projectId) {
        const response = await requestJsonWithMetadata<ConfigurationSaved>(path, { method: 'PUT', headers, body });
        operationIdFromResponse = response.data.operation_id;
        receiptConfirmed = Boolean(response.data.receipt);
        etag = response.etag;
      } else {
        const response = await requestJsonWithMetadata<SettingsSaved>(path, { method: 'PUT', headers, body });
        operationIdFromResponse = response.data.operation_id;
        receiptConfirmed = Boolean(response.data.receipt);
        etag = response.etag;
      }
      if (!etag || operationIdFromResponse !== operationId || !receiptConfirmed) throw new Error('O commit não retornou o ETag e o recibo da operação solicitada.');
      if (!lifecycleRef.current.isCurrent(identityRef.current, operation)) return;
      finishConfigurationSave(operationId);
      onSavingChange(false);
      onSaved();
    } catch (error: unknown) {
      const http = error instanceof HttpError ? error : null;
      const uncertain = requestStarted && (!http || http.status === 401 || http.status >= 500);
      if (!uncertain) finishConfigurationSave(operationId);
      if (!lifecycleRef.current.isCurrent(identityRef.current, operation)) return;
      if (uncertain) {
        setUncertainId(operationId);
        setCanResend(false);
        setRecoveryMessage('A gravação ainda não foi confirmada. Consulte o resultado antes de qualquer novo comando.');
      }
      if (http?.status === 412) {
        setSaveState({ status: 'conflict', message: 'A configuração mudou desde a leitura. Sua edição foi preservada; consulte a revisão atual para decidir se deseja reaplicá-la.' });
        retryConfiguration();
      } else {
        setSaveState({ status: 'error', message: http?.message ?? (error instanceof Error ? error.message : 'A gravação não foi confirmada.') });
      }
    } finally {
      if (lifecycleRef.current.isCurrent(identityRef.current, operation)) {
        saveInFlightRef.current = false;
        onSavingChange(false);
      }
    }
  }

  const providers = useMemo(() => displayedCatalog ? [...new Map(displayedCatalog.models.map((model) => [model.provider, model.provider_name])).entries()].sort(([left], [right]) => left.localeCompare(right, 'pt-BR')) : [], [displayedCatalog]);
  const models = useMemo(() => displayedCatalog ? [...new Map(displayedCatalog.models.filter((model) => model.provider === draft?.provider).map((model) => [model.model, model])).values()] : [], [displayedCatalog, draft?.provider]);
  const effortOptions = useMemo(() => currentModel ? [...new Set(currentModel.efforts)] : [], [currentModel]);
  const actionBlockedByConflict = saveState.status === 'conflict';
  const canSave = Boolean(draft && hasValidName && changes.length === 1 && !duplicateName && !uncertainId && !saveInFlightRef.current && !actionBlockedByConflict);

  if (load.status === 'error' && load.identity === identity) return <div className="profile-form-state" role="alert"><p>{load.message}</p><div className="profile-dialog-footer"><button type="button" onClick={onClose}>Cancelar</button><button type="button" onClick={retryConfiguration}>Tentar novamente</button></div></div>;
  if (!draft) return <div className="profile-form-state" role="status"><p>{profileLoadError || 'Consultando o perfil e sua configuração atual…'}</p>{profileLoadError && <button type="button" onClick={retryConfiguration}>Consultar novamente</button>}</div>;

  return <form className="profile-form" onSubmit={(event) => void save(event)}>
    <div className="profile-catalog-row">
      <div>
        <p className="profile-catalog-heading">Opções de modelo</p>
        {catalog.status === 'loading' && <p className="muted" role="status">Consultando catálogo…</p>}
        {catalog.status === 'error' && <p className="error" role="alert">{catalog.message}</p>}
        {catalog.status === 'error' && baseline && <p className="muted">As escolhas salvas continuam visíveis; você pode salvar alterações apenas de Nome e Orientações.</p>}
        {catalog.status === 'ready' && catalog.data?.state === 'unavailable' && <p className="notice compact-notice" role="status">O catálogo está indisponível. As escolhas salvas permanecem visíveis; você ainda pode alterar nome e orientações.</p>}
        {catalog.status === 'ready' && catalog.data?.state === 'loaded' && <p className="muted" role="status">Catálogo consultado. Confira as escolhas antes de salvar.</p>}
      </div>
      <button type="button" onClick={() => void refreshCatalog()} aria-label="Consultar catálogo novamente">Consultar catálogo novamente</button>
    </div>

    {currentChoiceMissing && <div className="notice compact-notice" role="status"><b>Escolha fora do catálogo atual</b><p>O valor salvo continua no rascunho. Atualize Provider, Modelo e Esforço para uma combinação válida antes de salvar essas escolhas.</p></div>}
    {invalidDraftSelection && profileId && hasSelectionChanges && <div className="notice compact-notice" role="status"><b>Combinação não disponível</b><p>As escolhas alteradas não serão salvas. Você pode salvar somente Nome e Orientações, preservando a combinação já gravada.</p></div>}
    {invalidDraftSelection && !profileId && <p className="error" role="status">Selecione uma combinação válida do catálogo para criar o perfil.</p>}

    <div className="profile-form-grid">
      <label className="form-field field-full" htmlFor="profile-name">Nome
        <input id="profile-name" value={draft.name} required maxLength={256} aria-describedby="profile-name-help" aria-invalid={duplicateName} onChange={(event) => updateDraft((current) => ({ ...current, name: event.currentTarget.value }))} />
        <small id="profile-name-help" className={duplicateName ? 'error' : 'muted'}>{duplicateName ? 'Já existe um perfil com este nome.' : 'Use um nome que ajude a identificar este perfil.'}</small>
      </label>
      <label className="form-field field-full" htmlFor="profile-type">Tipo
        <select id="profile-type" value={draft.profile_type} disabled={Boolean(profileId)} aria-describedby="profile-type-help" onChange={(event) => updateDraft((current) => ({ ...current, profile_type: event.currentTarget.value as ProfileType }))}>
          <option value="implementer">Implementador</option><option value="reviewer">Revisor</option>
        </select>
        <small id="profile-type-help" className="muted">Define o papel deste perfil no ciclo de execução.</small>
      </label>
      <label className="form-field field-full" htmlFor="profile-executor">Executor
        <select id="profile-executor" value={draft.executor} disabled aria-describedby="profile-executor-help"><option value="maestri-omp">Maestri / OMP</option></select>
        <small id="profile-executor-help" className="muted">Maestri / OMP é o executor disponível nesta entrega.</small>
      </label>
      <label className="form-field" htmlFor="profile-provider">Provider
        <select id="profile-provider" value={draft.provider} required disabled={!canEditSelections} aria-describedby="profile-provider-help" onChange={(event) => updateDraft((current) => selectProfileProvider(current, loadedCatalog, event.currentTarget.value))}>
          <option value="">Selecione…</option>
          {draft.provider && !providerExists && <option value={draft.provider}>{draft.provider} · fora do catálogo atual</option>}
          {providers.map(([provider, name]) => <option value={provider} key={provider}>{name}</option>)}
        </select>
        <small id="profile-provider-help" className="muted">Escolha um provider disponível no catálogo OMP.</small>
      </label>
      <label className="form-field" htmlFor="profile-model">Modelo
        <select id="profile-model" value={draft.model} required disabled={!canEditSelections || !draft.provider} aria-describedby="profile-model-help" onChange={(event) => updateDraft((current) => selectProfileModel(current, loadedCatalog, event.currentTarget.value))}>
          <option value="">Selecione…</option>
          {draft.model && !modelExists && <option value={draft.model}>{draft.model} · fora do catálogo atual</option>}
          {models.map((model) => <option value={model.model} key={`${model.provider}:${model.model}`}>{model.model_name}</option>)}
        </select>
        <small id="profile-model-help" className="muted">Os modelos dependem do provider escolhido.</small>
      </label>
      <label className="form-field" htmlFor="profile-effort">Esforço
        <select id="profile-effort" value={draft.effort ?? ''} disabled={!canEditSelections || !currentModel} aria-describedby="profile-effort-help" onChange={(event) => updateDraft((current) => ({ ...current, effort: event.currentTarget.value || null }))}>
          <option value="" disabled={Boolean(currentModel && currentModel.efforts.length > 0 && draft.effort !== null)}>Não se aplica</option>
          {draft.effort && !effortExists && <option value={draft.effort}>{draft.effort} · fora do catálogo atual</option>}
          {effortOptions.map((effort) => <option value={effort} key={effort}>{effort}</option>)}
        </select>
        <small id="profile-effort-help" className="muted">Quando não houver esforço aplicável, o valor salvo é null.</small>
      </label>
      <label className="form-field field-full" htmlFor="profile-guidance">Orientações opcionais
        <textarea id="profile-guidance" value={draft.guidance} maxLength={8192} aria-describedby="profile-guidance-help" onChange={(event) => updateDraft((current) => ({ ...current, guidance: event.currentTarget.value }))} />
        <small id="profile-guidance-help" className="muted">Instruções extras para este papel. Não inclua credenciais ou tokens.</small>
      </label>
    </div>

    {profileLoadError && <p role="alert" className="error">{profileLoadError}</p>}
    {refreshError && <div className="notice compact-notice" role="status"><p>A consulta da configuração mais recente falhou. Sua edição continua preservada.</p><button type="button" onClick={retryConfiguration}>Tentar consultar novamente</button></div>}
    {saveState.status === 'error' && <div className="notice profile-save-error" role="alert"><b>Não foi possível confirmar o salvamento</b><p>{saveState.message}</p></div>}
    {saveState.status === 'conflict' && <div className="notice profile-save-error" role="alert"><b>Conflito ao salvar</b><p>{saveState.message}</p>{canApplyConflict && <button type="button" onClick={applyLatestRevision}>Aplicar minha edição sobre a revisão atual</button>}</div>}
    {uncertainId && <div className="notice profile-save-error" role="alert"><b>Gravação ainda não confirmada</b><p>{recoveryMessage}</p><button type="button" onClick={() => void finishUncertainSave()} disabled={saveInFlightRef.current}>Consultar resultado</button>{canResend && <button type="button" onClick={() => void finishUncertainSave(true)} disabled={saveInFlightRef.current}>Reapresentar a mesma operação</button>}</div>}

    <div className="profile-dialog-footer">
      <button type="button" onClick={onClose}>Cancelar</button>
      <button type="submit" className="primary" disabled={!canSave}>{saveState.status === 'saving' ? 'Salvando…' : profileId ? 'Salvar alterações' : 'Criar perfil'}</button>
    </div>
  </form>;
}
