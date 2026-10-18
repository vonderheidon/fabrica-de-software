import { startAttemptBody } from '../attempts/execution-requests.js';
import { changedChoices } from './preparation-requests.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConfigurationView, DeliveryMode, IssueOptions, OperationAccepted, OperationView, Preparation, PreparationCreated, PreparationChoices, PreparationUpdate, HttpAttemptDetail as AttemptDetail, SettingsView, StoredExecutionProfile } from '#contracts';
import { HttpError, requestJson, requestJsonWithMetadata } from '../../api/http.js';
import { readUncertainOperations, recordUncertainOperation, resolveUncertainOperation } from '../../api/uncertain-operations.js';

type Props = { projectId: string | null; previousAttemptId?: string | null; onOpenAttempt: (attemptId: string) => void };
type PreparationDraft = { preparationId: string; etag: string; choices: PreparationChoices; savedChoices: PreparationChoices; current: Preparation; conflict: Preparation | null };
const memory = new Map<string, PreparationDraft>();
const creationPromises = new Map<string, Promise<PreparationDraft>>();
const modes: readonly { value: DeliveryMode; label: string }[] = [
  { value: 'icr', label: 'ICR' }, { value: 'commit', label: 'Commit local' }, { value: 'pr', label: 'Pull request' },
];
const savedKey = (projectId: string, previousAttemptId?: string | null): string => `${projectId}:${previousAttemptId ?? 'new'}`;
const startRequestTimeoutMs = 30_000;

export function PreparationDialog({ projectId, previousAttemptId = null, onOpenAttempt }: Props) {
  const [issues, setIssues] = useState<IssueOptions | null>(null);
  const [profiles, setProfiles] = useState<readonly StoredExecutionProfile[]>([]);
  const [issueReload, setIssueReload] = useState(0);
  const [configurationReady, setConfigurationReady] = useState(false);
  const [issuesError, setIssuesError] = useState<string | null>(null);
  const [issueId, setIssueId] = useState('');
  const [mode, setMode] = useState<DeliveryMode>('icr');
  const [guidance, setGuidance] = useState('');
  const [draft, setDraftState] = useState<PreparationDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [summaryNotice, setSummaryNotice] = useState<string | null>(null);
  const [authorizedHash, setAuthorizedHash] = useState<string | null>(null);
  const [startState, setStartState] = useState<{ status: 'idle' } | { status: 'sending' } | { status: 'accepted'; operation: OperationAccepted } | { status: 'uncertain'; operationId: string } | { status: 'observed'; operation: OperationView }>(() => {
    const pending = readUncertainOperations().find((item) => item.kind === 'attempt-start');
    return pending ? { status: 'uncertain', operationId: pending.operationId } : { status: 'idle' };
  });
  const [activeConflictId, setActiveConflictId] = useState<string | null>(null);
  const draftRef = useRef<PreparationDraft | null>(null);
  const latestChoicesRef = useRef<PreparationChoices | null>(null);
  const saveLoopRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<number | null>(null);
  const startCommandRef = useRef<{ operationId: string; body: ReturnType<typeof startAttemptBody>; etag: string } | null>(null);
  const createPendingRef = useRef(false);
  const startInFlightRef = useRef(false);
  const identity = projectId ? savedKey(projectId, previousAttemptId) : '';

  const installDraft = useCallback((value: PreparationDraft) => {
    draftRef.current = value;
    setDraftState(value);
    memory.set(identity, value);
  }, [identity]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    const controller = new AbortController();
    const key = savedKey(projectId, previousAttemptId);
    const cached = memory.get(key);
    if (cached) {
      draftRef.current = cached;
      setDraftState(cached);
      setIssueId(cached.choices.issue_id);
      setMode(cached.choices.delivery_mode);
      setGuidance(cached.choices.guidance);
      setConfigurationReady(true);
      void requestJsonWithMetadata<{ preparation: Preparation }>(`/api/v1/preparations/${encodeURIComponent(cached.preparationId)}`, { signal: controller.signal }).then(({ data, etag }) => {
        if (!active || !etag) return;
        const refreshed: PreparationDraft = { ...cached, etag, current: data.preparation, savedChoices: data.preparation, conflict: null };
        installDraft(refreshed);
        latestChoicesRef.current = cached.choices;
      }).catch((error: unknown) => { if (active) setSaveError(errorMessage(error)); });
    }
    if (!cached) setConfigurationReady(false);
    void requestJson<ConfigurationView>(`/api/v1/projects/${encodeURIComponent(projectId)}/configuration`, { signal: controller.signal }).then((configuration) => {
      if (!active || cached) return;
      setMode(configuration.configuration.default_delivery_mode);
      setGuidance(configuration.configuration.guidance);
      setConfigurationReady(true);
    }).catch((error: unknown) => { if (active) { setIssuesError(errorMessage(error)); setConfigurationReady(false); } });
    const params = new URLSearchParams({ limit: '100' });
    void requestJson<IssueOptions>(`/api/v1/projects/${encodeURIComponent(projectId)}/issues?${params}`, { signal: controller.signal }).then((result) => {
      if (active) { setIssues(result); setIssuesError(null); }
    }).catch((error: unknown) => {
      if (active && !(error instanceof DOMException && error.name === 'AbortError')) setIssuesError(errorMessage(error));
    });
    if (previousAttemptId && !cached) {
      void requestJson<AttemptDetail>(`/api/v1/attempts/${encodeURIComponent(previousAttemptId)}`, { signal: controller.signal }).then((attempt) => {
        if (active) setIssueId(attempt.issue.id);
      }).catch((error: unknown) => { if (active) setIssuesError(errorMessage(error)); });
    }
    return () => { active = false; controller.abort(); if (timerRef.current !== null) window.clearTimeout(timerRef.current); };
  }, [installDraft, issueReload, projectId, previousAttemptId]);

  useEffect(() => {
    let active = true;
    void requestJson<SettingsView>('/api/v1/settings').then((settings) => { if (active) setProfiles(settings.profiles); }).catch(() => { if (active) setProfiles([]); });
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    if (!issues || !configurationReady || !projectId || draftRef.current || createPendingRef.current || !issueId) return;
    createPendingRef.current = true;
    setCreating(true);
    let active = true;
    const choices: PreparationChoices = { issue_id: issueId, delivery_mode: mode, guidance, overrides: {}, ...(previousAttemptId ? { previous_attempt_id: previousAttemptId } : {}) };
    void createPreparationDraft(identity, projectId, choices).then((value) => {
      if (!active) return;
      installDraft(value);
      setIssueId(value.choices.issue_id); setMode(value.choices.delivery_mode); setGuidance(value.choices.guidance);
    }).catch((error: unknown) => { if (active) setIssuesError(errorMessage(error)); }).finally(() => { createPendingRef.current = false; if (active) setCreating(false); });
    return () => { active = false; };
  }, [configurationReady, guidance, identity, installDraft, issueId, issues, mode, previousAttemptId, projectId]);

  const choices = useMemo<PreparationChoices | null>(() => {
    if (!draft) return null;
    return { ...draft.choices, issue_id: issueId, delivery_mode: mode, guidance, ...(previousAttemptId ? { previous_attempt_id: previousAttemptId } : {}) };
  }, [draft, guidance, issueId, mode, previousAttemptId]);

  useEffect(() => {
    if (!draft || !choices) return;
    latestChoicesRef.current = choices;
    if (sameChoices(choices, draft.savedChoices)) return;
    setAuthorizedHash(null);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => { void saveLatest(); }, 350);
  }, [choices, draft]);

  const saveLatest = useCallback(async (): Promise<void> => {
    if (saveLoopRef.current) return saveLoopRef.current;
    const current = draftRef.current;
    if (!current) return;
    const task = (async () => {
      setSaving(true); setSaveError(null);
      try {
        while (draftRef.current && latestChoicesRef.current && !sameChoices(latestChoicesRef.current, draftRef.current.savedChoices)) {
          const state = draftRef.current;
          const requestChoices = latestChoicesRef.current;
          const { data, etag } = await requestJsonWithMetadata<PreparationCreated>(`/api/v1/preparations/${encodeURIComponent(state.preparationId)}`, {
            method: 'PUT', headers: { 'If-Match': state.etag, 'Idempotency-Key': crypto.randomUUID() },
            body: JSON.stringify({ changes: changedChoices(state.savedChoices, requestChoices) } satisfies PreparationUpdate),
          });
          if (!etag) throw new Error('O controlador não retornou a revisão confirmada da preparação.');
          const latest = draftRef.current;
          if (!latest) break;
          const saved: PreparationDraft = { ...latest, etag, current: data.preparation, savedChoices: data.preparation, conflict: null };
          installDraft(saved);
          if (sameChoices(latestChoicesRef.current, requestChoices)) latestChoicesRef.current = data.preparation;
        }
      } catch (error) {
        if (error instanceof HttpError && error.status === 412 && draftRef.current) {
          try {
            const currentView = await requestJsonWithMetadata<{ preparation: Preparation }>(`/api/v1/preparations/${encodeURIComponent(draftRef.current.preparationId)}`);
            installDraft({ ...draftRef.current, etag: currentView.etag ?? draftRef.current.etag, conflict: currentView.data.preparation });
          } catch { /* Preserve both the local fields and the conflict diagnosis. */ }
          setSaveError('A preparação mudou no controlador. Os dados atuais foram carregados separadamente; seu rascunho continua preservado.');
        } else setSaveError(errorMessage(error));
      } finally { saveLoopRef.current = null; setSaving(false); }
    })();
    saveLoopRef.current = task;
    return task;
  }, [installDraft]);

  function updateChoices(update: (current: PreparationChoices) => PreparationChoices): void {
    const current = draftRef.current;
    if (!current) return;
    const next = update({ ...current.choices, issue_id: issueId, delivery_mode: mode, guidance });
    latestChoicesRef.current = next;
    const value = { ...current, choices: next };
    installDraft(value);
    setIssueId(next.issue_id); setMode(next.delivery_mode); setGuidance(next.guidance);
  }

  function updateProfileChoice(role: 'implementer_profile' | 'reviewer_profile', value: string): void {
    const profile = profiles.find((item) => `${item.id}:${item.revision}` === value);
    const overrides = { ...((draftRef.current?.choices.overrides) ?? {}) };
    if (!profile) delete overrides[role];
    else overrides[role] = { kind: 'reference', id: profile.id, revision: profile.revision };
    updateChoices((current) => ({ ...current, overrides }));
  }

  async function authorizeSummary(): Promise<void> {
    await saveLatest();
    const latest = draftRef.current;
    if (latest && !saveLoopRef.current && sameChoices(latestChoicesRef.current ?? latest.savedChoices, latest.savedChoices) && latest.current.can_start === false) {
      setAuthorizedHash(latest.current.summary_hash);
    }
  }

  async function submitStart(): Promise<void> {
    if (startInFlightRef.current) return;
    const latest = draftRef.current;
    if (!latest || !authorizedHash || authorizedHash !== latest.current.summary_hash) return;
    const command = startCommandRef.current ?? {
      operationId: crypto.randomUUID(), etag: latest.etag,
      body: startAttemptBody(latest.preparationId, latest.current.revision, authorizedHash),
    };
    startCommandRef.current = command;
    startInFlightRef.current = true;
    setStartState({ status: 'sending' });
    try {
      try { recordUncertainOperation({ operationId: command.operationId, kind: 'attempt-start', recordedAt: Date.now() }); } catch { /* Keep the stable operation identity in memory for this tab. */ }
      const { data } = await requestJsonWithMetadata<OperationAccepted>('/api/v1/attempts', {
        method: 'POST', headers: { 'If-Match': command.etag, 'Idempotency-Key': command.operationId }, body: JSON.stringify(command.body), signal: AbortSignal.timeout(startRequestTimeoutMs),
      });
      safelyResolveOperation(command.operationId);
      startCommandRef.current = null;
      setStartState({ status: 'accepted', operation: data });
      if (data.resource.type === 'attempt') onOpenAttempt(data.resource.id);
    } catch (error) {
      if (error instanceof HttpError && error.status < 500) {
        safelyResolveOperation(command.operationId);
        startCommandRef.current = null;
        if (error.code === 'ATTEMPT_ACTIVE' && error.resource?.type === 'attempt') setActiveConflictId(error.resource.id);
        if (error.code === 'SUMMARY_CHANGED') {
          setAuthorizedHash(null);
          setSaveError(null);
          const latest = draftRef.current;
          if (latest) {
            try {
              const refreshed = await requestJsonWithMetadata<{ preparation: Preparation }>(`/api/v1/preparations/${encodeURIComponent(latest.preparationId)}`);
              if (refreshed.etag) {
                installDraft({ ...latest, etag: refreshed.etag, current: refreshed.data.preparation });
                setSummaryNotice('O resumo mudou no controlador. Revise o resumo atualizado antes de iniciar.');
              } else setSaveError('O resumo mudou, mas a revisão atual não pôde ser confirmada. Consulte novamente antes de iniciar.');
            } catch (refreshError) { setSaveError(errorMessage(refreshError)); }
          }
        } else {
          setSaveError(error.message);
        }
        setStartState({ status: 'idle' });
      } else setStartState({ status: 'uncertain', operationId: command.operationId });
    } finally { startInFlightRef.current = false; }
  }

  async function inspectStart(operationId: string): Promise<void> {
    try {
      const operation = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(operationId)}`);
      if (operation.state === 'unknown' || operation.state === 'accepted' || operation.state === 'running') setStartState({ status: 'observed', operation });
      else {
        safelyResolveOperation(operationId);
        startCommandRef.current = null;
        setStartState({ status: 'observed', operation });
        if (operation.state === 'failed') setAuthorizedHash(null);
      }
    } catch (error) { setSaveError(errorMessage(error)); }
  }

  useEffect(() => {
    if (startState.status === 'uncertain') void inspectStart(startState.operationId);
  }, [startState]);

  const pendingStartId = startState.status === 'uncertain' ? startState.operationId : startState.status === 'observed' && ['unknown', 'accepted', 'running'].includes(startState.operation.state) ? startState.operation.operation_id : null;
  if (!projectId) return <div className="preparation-dialog"><div className="notice"><b>Selecione um projeto</b><p>Abra a preparação a partir de um projeto configurado para consultar issues e pré-requisitos atuais.</p></div>{pendingStartId && <div className="notice"><b>Início incerto</b><p>Operação {pendingStartId}</p><button type="button" onClick={() => void inspectStart(pendingStartId)}>Consultar operação original</button>{startState.status === 'observed' && <p>Estado: {startState.operation.state} · recurso {startState.operation.resource.type}/{startState.operation.resource.id}</p>}</div>}</div>;
  const selectedIssue = issues?.items.find((item) => item.content_id === issueId);
  const blocked = Boolean(!draft || saving || saveError || draft.conflict || !draft.current.criteria_preview.executable || draft.current.prerequisites.length > 0 || !draft.current.base_sha || !draft.current.issue || !draft.current.effective_configuration.implementer_profile || !draft.current.effective_configuration.reviewer_profile || !draft.current.summary_hash);
  const configuration = draft?.current.effective_configuration;

  return <div className="preparation-dialog">
    {previousAttemptId && <div className="notice"><b>Nova tentativa · {previousAttemptId}</b><p>A preparação consulta a issue e a base atuais. O histórico, a sessão e as alterações da tentativa anterior não serão reutilizados.</p></div>}
    <section className="card preparation-section"><div className="eyebrow">Escolha do trabalho</div><div className="form-grid">
      <label className="form-field">Projeto<input value={draft?.current.project_id ?? projectId} readOnly aria-label="Projeto" /></label>
      <label className="form-field">Issue<select value={issueId} onChange={(event) => { const value = event.currentTarget.value; if (draftRef.current) updateChoices((current) => ({ ...current, issue_id: value })); else setIssueId(value); }} disabled={!issues || !configurationReady || creating}><option value="">Selecione uma issue elegível</option>{previousAttemptId && issueId && !issues?.items.some((item) => item.content_id === issueId) && <option value={issueId}>Issue da tentativa anterior · {issueId}</option>}{issues?.items.filter((item) => item.kind === 'issue' && item.executable && item.content_id).map((item) => <option key={item.id} value={item.content_id ?? ''}>{item.title} · {item.id}</option>)}</select></label>
      <label className="form-field">Modo de entrega<select value={mode} onChange={(event) => { const value = event.currentTarget.value as DeliveryMode; setMode(value); updateChoices((current) => ({ ...current, delivery_mode: value })); }} disabled={!configurationReady || !draft}>{modes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="form-field field-full">Orientação<textarea value={guidance} onChange={(event) => { setGuidance(event.currentTarget.value); updateChoices((current) => ({ ...current, guidance: event.currentTarget.value })); }} disabled={!draft} maxLength={8192} /></label>
      {draft && <>
        <label className="form-field">Branch-base<input value={String(draft.choices.overrides.base_branch ?? draft.current.effective_configuration.configuration.base_branch)} onChange={(event) => updateChoices((current) => ({ ...current, overrides: { ...current.overrides, base_branch: event.currentTarget.value } }))} /></label>
        <label className="form-field">Limite de correções<input type="number" min={0} max={5} value={draft.choices.overrides.correction_limit ?? draft.current.effective_configuration.configuration.correction_limit} onChange={(event) => updateChoices((current) => ({ ...current, overrides: { ...current.overrides, correction_limit: Math.max(0, Math.min(5, Number(event.currentTarget.value) || 0)) } }))} /></label>
        <label className="form-field">Perfil implementador<select value={profileChoiceId(draft.choices.overrides.implementer_profile, draft.current.effective_configuration.implementer_profile)} onChange={(event) => updateProfileChoice('implementer_profile', event.currentTarget.value)} disabled={profiles.length === 0}><option value="">Usar perfil efetivo do projeto</option>{profiles.map((profile) => <option key={profile.id} value={`${profile.id}:${profile.revision}`}>{profile.name} · {profile.provider}/{profile.model}</option>)}</select></label>
        <label className="form-field">Perfil revisor<select value={profileChoiceId(draft.choices.overrides.reviewer_profile, draft.current.effective_configuration.reviewer_profile)} onChange={(event) => updateProfileChoice('reviewer_profile', event.currentTarget.value)} disabled={profiles.length === 0}><option value="">Usar perfil efetivo do projeto</option>{profiles.map((profile) => <option key={profile.id} value={`${profile.id}:${profile.revision}`}>{profile.name} · {profile.provider}/{profile.model}</option>)}</select></label>
      </>}
    </div>
    {issuesError && <div className="queue-error" role="alert"><p>{issuesError}</p><button type="button" onClick={() => { setIssues(null); setIssuesError(null); setIssueReload((value) => value + 1); }}>Consultar novamente</button></div>}
    {issues && issues.completeness !== 'complete' && <div className="notice"><b>Opções {issues.completeness === 'partial' ? 'parciais' : 'indisponíveis'}</b>{issues.diagnostics.map((item, index) => <p key={`${item.code}-${index}`}>{item.code}: {item.message} {item.recovery}</p>)}</div>}
    {selectedIssue && selectedIssue.reasons.length > 0 && <div className="notice"><b>Impedimentos desta issue</b><ul>{selectedIssue.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}
    </section>

    {draft && <>
      <section className="card preparation-section"><div className="line panel-title"><div><div className="eyebrow">Resumo revalidável</div><h3>Escolhas efetivas</h3></div><span className={`pill ${saving ? 'warn' : 'neutral'}`}>{saving ? 'Salvando' : 'Salvo no controlador'}</span></div>
        <dl className="preparation-facts"><div><dt>Issue atual</dt><dd>{draft.current.issue ? `#${draft.current.issue.number} · ${draft.current.issue.title}` : 'Não confirmada'}</dd></div><div><dt>Estado e responsáveis</dt><dd>{draft.current.issue ? `${draft.current.issue.state} · ${draft.current.issue.assignees.map((person) => `@${person.login}`).join(', ') || 'sem responsável observado'}` : 'Não confirmados'}</dd></div><div><dt>Base consultada</dt><dd className="mono">{draft.current.base_sha ?? 'Indisponível'}</dd></div><div><dt>Modo</dt><dd>{modes.find((item) => item.value === draft.current.delivery_mode)?.label}</dd></div><div><dt>Implementador</dt><dd>{profileName(configuration?.implementer_profile ?? null)}</dd></div><div><dt>Revisor</dt><dd>{profileName(configuration?.reviewer_profile ?? null)}</dd></div><div><dt>Limite de correções</dt><dd>{configuration?.configuration.correction_limit ?? '—'}</dd></div><div><dt>Tempo ativo por passagem</dt><dd>{configuration ? `${Math.round(configuration.time_defaults.passage_active_time_ms / 1000)} s` : '—'}</dd></div><div><dt>TTL da pergunta</dt><dd>{limitLabel(configuration?.time_defaults.question_ttl)}</dd></div><div><dt>Política de artefatos</dt><dd>{configuration?.artifact_policy.automatic_deletion ? 'Exclusão automática habilitada' : 'Sem exclusão automática'}</dd></div></dl>
        <p className="muted">Origem das escolhas: {configuration ? Object.entries(configuration.origins).map(([field, origin]) => `${originLabel(field)}: ${originLabel(origin)}`).join(' · ') : 'aguardando configuração efetiva'}.</p>
        <h3>Checks capturados</h3>{configuration?.configuration.checks.length ? <ul className="compact-list">{configuration.configuration.checks.map((check) => <li key={check.id}><code>{check.command}</code> · cwd {check.cwd_relative} · {check.timeout_ms ?? 'padrão'} ms</li>)}</ul> : <p className="muted">Nenhum check configurado.</p>}
        <h3>Critérios de aceite</h3>{draft.current.criteria_preview.executable ? <ol className="preparation-criteria">{draft.current.criteria_preview.criteria.map((criterion) => <li key={`${criterion.id}:${criterion.occurrence_index}`}><b>{criterion.id}</b> · {criterion.text}</li>)}</ol> : <div className="notice"><b>Critérios não executáveis</b><p>{draft.current.criteria_preview.reasons.join(' · ') || 'A issue atual não contém critérios de aceite válidos.'}</p></div>}
        <h3>Efeitos previstos</h3><ul className="compact-list">{draft.current.effects_preview.map((effect, index) => <li key={`${effect.kind}-${index}`}>{effect.requested ? 'Será solicitado' : 'Não solicitado'} · {effect.description}</li>)}</ul>
        {draft.current.prerequisites.length > 0 && <div className="notice"><b>Pré-requisitos pendentes</b><ul>{draft.current.prerequisites.map((item) => <li key={item.code}>{item.message} {item.recovery}</li>)}</ul></div>}
      </section>
      {draft.conflict && <section className="card conflict-current" role="alert"><h3>Configuração atual do controlador</h3><p>A revisão atual foi consultada separadamente. Seu rascunho continua no formulário.</p><p>Issue atual: {draft.conflict.issue?.title ?? draft.conflict.issue_id} · modo {draft.conflict.delivery_mode}</p><button type="button" onClick={() => { const value = { ...draft, etag: `"${draft.conflict!.id}:${draft.conflict!.revision}"`, current: draft.conflict!, savedChoices: draft.conflict!, conflict: null }; installDraft(value); latestChoicesRef.current = draft.choices; void saveLatest(); }}>Manter meu rascunho e salvar sobre os dados atuais</button></section>}
      {saveError && <div className="queue-error" role="alert"><p>{saveError}</p></div>}
      {summaryNotice && <div className="notice" role="status"><p>{summaryNotice}</p></div>}
      {activeConflictId && <div className="notice" role="alert"><b>Esta issue já tem uma tentativa ativa</b><p>O controlador identificou a tentativa existente. Consulte-a sem criar outra.</p><button type="button" onClick={() => onOpenAttempt(activeConflictId)}>Consultar tentativa</button></div>}
      {startState.status === 'accepted' && <div className="notice" role="status"><b>Início aceito pelo controlador</b><p>Operação {startState.operation.operation_id} · a aceitação não significa que clone ou passagem estejam prontos.</p>{startState.operation.resource.type === 'attempt' && <button type="button" onClick={() => onOpenAttempt(startState.operation.resource.id)}>Consultar tentativa</button>}</div>}
      {pendingStartId && <div className="notice" role="status"><b>Resposta do início incerta</b><p>Consulte a operação original. O cliente não enviará outro início.</p><button type="button" onClick={() => void inspectStart(pendingStartId)}>Consultar operação</button>{startState.status === 'observed' && <p>Estado observado: {startState.operation.state} · recurso {startState.operation.resource.type}/{startState.operation.resource.id}</p>}</div>}
      {startState.status === 'observed' && !pendingStartId && <div className="notice" role="status"><b>Operação de início {startState.operation.state === 'succeeded' ? 'concluída' : 'encerrada'}</b><p>{startState.operation.operation_id} · {startState.operation.resource.type}/{startState.operation.resource.id}</p>{startState.operation.resource.type === 'attempt' && <button type="button" onClick={() => onOpenAttempt(startState.operation.resource.id)}>Consultar tentativa identificada</button>}{startState.operation.state === 'failed' && <p>Revise o estado atual da preparação e autorize novamente antes de tentar outro início.</p>}</div>}
      <div className="preparation-actions">
        {!authorizedHash ? <button type="button" className="primary" disabled={saving || Boolean(saveError) || blocked} onClick={() => void authorizeSummary()}>Revisar e autorizar resumo atual</button> : <><p role="status">Resumo autorizado: {authorizedHash.slice(0, 12)}… · edição invalida esta autorização.</p><button type="button" className="primary" disabled={blocked || authorizedHash !== draft.current.summary_hash || ['sending', 'accepted', 'observed'].includes(startState.status) || Boolean(pendingStartId)} onClick={() => void submitStart()}>Iniciar tentativa</button></>}
        {saving && <span role="status">Aguardando a última gravação…</span>}
      </div>
    </>}
  </div>;
}

function sameChoices(left: PreparationChoices, right: PreparationChoices): boolean { return JSON.stringify(left) === JSON.stringify(right); }
async function createPreparationDraft(identity: string, projectId: string, choices: PreparationChoices): Promise<PreparationDraft> {
  const existing = creationPromises.get(identity);
  if (existing) return existing;
  const operationId = crypto.randomUUID();
  const pending = (async () => {
    const { data, etag } = await requestJsonWithMetadata<PreparationCreated>(`/api/v1/projects/${encodeURIComponent(projectId)}/preparations`, {
      method: 'POST', headers: { 'Idempotency-Key': operationId }, body: JSON.stringify(choices),
    });
    if (!etag) throw new Error('A preparação foi criada sem revisão consultável. Atualize os dados antes de iniciar.');
    const value: PreparationDraft = { preparationId: data.preparation.id, etag, choices: data.preparation, savedChoices: data.preparation, current: data.preparation, conflict: null };
    memory.set(identity, value);
    return value;
  })();
  creationPromises.set(identity, pending);
  try { return await pending; }
  finally { if (creationPromises.get(identity) === pending) creationPromises.delete(identity); }
}
function errorMessage(error: unknown): string { return error instanceof HttpError ? `${error.message}${error.requestId ? ` · Solicitação ${error.requestId}` : ''}` : 'Não foi possível concluir a consulta. Verifique a operação antes de repetir.'; }
function safelyResolveOperation(operationId: string): void { try { resolveUncertainOperation(operationId); } catch { /* A later reload may query this harmless operation again. */ } }
function profileName(profile: Preparation['effective_configuration']['implementer_profile']): string { return profile ? `${profile.name} · ${profile.provider}/${profile.model}` : 'Não confirmado'; }
function profileChoiceId(choice: PreparationChoices['overrides']['implementer_profile'], effective: Preparation['effective_configuration']['implementer_profile']): string {
  if (choice?.kind === 'reference') return `${choice.id}:${choice.revision}`;
  if (effective && 'revision' in effective) return `${effective.id}:${effective.revision}`;
  return '';
}
function limitLabel(value: { state: 'configured'; value: number; unit: string } | { state: 'not_configured' } | undefined): string { return !value || value.state === 'not_configured' ? 'Não configurado' : `${value.value} ${value.unit}`; }
function originLabel(value: string): string { return ({ project: 'Projeto', global: 'Global', preparation: 'Preparação', base_branch: 'Base', implementer_profile: 'Implementador', reviewer_profile: 'Revisor', checks: 'Checks', correction_limit: 'Correções', time_defaults: 'Tempo', artifact_policy: 'Artefatos', guidance: 'Orientação', delivery_mode: 'Entrega' } as Record<string, string>)[value] ?? value; }
