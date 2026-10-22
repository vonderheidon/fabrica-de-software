import { knownProjectDeletion, rememberProjectDeletion, useProjectDeletionRestriction } from '../projects/ProjectDeletionPendingNotice.js';
import { isProjectDeletionCompleted } from '../../api/project-deletion.js';
import { startAttemptBody } from '../attempts/execution-requests.js';
import { changedChoices, hasBlockingPrerequisites } from './preparation-requests.js';
import { IssueOptionsNotice } from './IssueOptionsNotice.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConfigurationView, ProjectDetail, DeliveryMode, IssueOptions, OperationAccepted, OperationView, Preparation, PreparationCreated, PreparationChoices, PreparationUpdate, HttpAttemptDetail as AttemptDetail, SettingsView, StoredExecutionProfile } from '#contracts';
import { HttpError, requestJson, requestJsonWithMetadata } from '../../api/http.js';
import { readUncertainOperations, recordUncertainOperation, resolveUncertainOperation } from '../../api/uncertain-operations.js';
import { profilesForRole } from '../projects/profile-collection.js';
import { formatMinuteValue } from '../projects/time-minutes.js';
import { FieldHelp } from '../projects/FieldHelp.js';
import { OperatorDiagnosticCard, OperatorState } from '../../app/OperatorSupport.js';
import { operatorCodeLabel, operatorErrorMessage, operatorState } from '../../app/operator-language.js';

type Props = { projectId: string | null; initialIssueId?: string | null; previousAttemptId?: string | null; onOpenAttempt: (attemptId: string) => void };
type PreparationDraft = { preparationId: string; etag: string; choices: PreparationChoices; savedChoices: PreparationChoices; current: Preparation; conflict: Preparation | null };
const memory = new Map<string, PreparationDraft>();
const creationPromises = new Map<string, Promise<PreparationDraft>>();
if (typeof window !== 'undefined') window.addEventListener('factory-project-deleted', () => {
  for (const key of memory.keys()) {
    const parts: unknown = JSON.parse(key);
    if (Array.isArray(parts) && typeof parts[0] === 'string' && isProjectDeletionCompleted(parts[0])) {
      memory.delete(key); creationPromises.delete(key);
    }
  }
});
const modes: readonly { value: DeliveryMode; label: string }[] = [
  { value: 'icr', label: 'ICR' }, { value: 'commit', label: 'Commit local' }, { value: 'pr', label: 'Pull request' },
];
const savedKey = (projectId: string, previousAttemptId?: string | null, initialIssueId?: string | null): string => JSON.stringify([projectId, previousAttemptId ?? 'new', initialIssueId ?? null]);
const startRequestTimeoutMs = 30_000;

export function PreparationDialog({ projectId, initialIssueId = null, previousAttemptId = null, onOpenAttempt }: Props) {
  const deletionRestricted = useProjectDeletionRestriction(projectId);
  const [issues, setIssues] = useState<IssueOptions | null>(null);
  const [projectName, setProjectName] = useState('Consultando nome do projeto…');
  const [profiles, setProfiles] = useState<readonly StoredExecutionProfile[]>([]);
  const [profilesLoadState, setProfilesLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [issueReload, setIssueReload] = useState(0);
  const [configurationReady, setConfigurationReady] = useState(false);
  const [issuesError, setIssuesError] = useState<string | null>(null);
  const [issueId, setIssueId] = useState(initialIssueId ?? '');
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
  const identity = projectId ? savedKey(projectId, previousAttemptId, initialIssueId) : '';

  const installDraft = useCallback((value: PreparationDraft) => {
    if (projectId && isProjectDeletionCompleted(projectId)) return;
    draftRef.current = value;
    setDraftState(value);
    if (projectId && !isProjectDeletionCompleted(projectId)) memory.set(identity, value);
  }, [identity]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    const controller = new AbortController();
    const key = savedKey(projectId, previousAttemptId, initialIssueId);
    setProjectName('Consultando nome do projeto…');
    void requestJson<ProjectDetail>(`/api/v1/projects/${encodeURIComponent(projectId)}`, { signal: controller.signal }).then((detail) => {
      if (active) { rememberProjectDeletion(projectId, detail.deletion); setProjectName(detail.project.name); }
    }).catch(() => { if (active) setProjectName('Nome do projeto indisponível. Consulte novamente.'); });
    const saved = memory.get(key);
    const cached = saved && (!initialIssueId || saved.choices.issue_id === initialIssueId) ? saved : undefined;
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
      if (!active) return;
      rememberProjectDeletion(projectId, configuration.deletion);
      window.dispatchEvent(new Event('factory-project-deletion-pending'));
      if (cached) return;
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
  }, [installDraft, issueReload, projectId, previousAttemptId, initialIssueId]);

  useEffect(() => {
    let active = true;
    void requestJson<SettingsView>('/api/v1/settings').then((settings) => {
      if (active) { setProfiles(settings.profiles); setProfilesLoadState('ready'); }
    }).catch(() => {
      if (active) { setProfiles([]); setProfilesLoadState('error'); }
    });
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    if (projectId && (knownProjectDeletion(projectId) || isProjectDeletionCompleted(projectId))) return;
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
    if (projectId && knownProjectDeletion(projectId)) return;
    if (saveLoopRef.current) return saveLoopRef.current;
    const current = draftRef.current;
    if (!current) return;
    // Install the pending promise before even an empty save can clear it.
    const task = Promise.resolve().then(async () => {
      setSaving(true); setSaveError(null);
      try {
        while (!(projectId && knownProjectDeletion(projectId)) && draftRef.current && latestChoicesRef.current && !sameChoices(latestChoicesRef.current, draftRef.current.savedChoices)) {
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
    });
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
    const profileType = role === 'implementer_profile' ? 'implementer' : 'reviewer';
    const profile = profiles.find((item) => item.profile_type === profileType && `${item.id}:${item.revision}` === value);
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
    if (projectId && (knownProjectDeletion(projectId) || isProjectDeletionCompleted(projectId))) return;
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
      setSaveError(null);
      if (operation.state !== 'unknown' && operation.state !== 'failed' && operation.resource.type === 'attempt') {
        safelyResolveOperation(operationId);
        startCommandRef.current = null;
        setStartState({ status: 'observed', operation });
        onOpenAttempt(operation.resource.id);
        return;
      }
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
  if (deletionRestricted) return <p role="alert">Este cadastro está em exclusão. Preparação e início estão indisponíveis. Acompanhe a exclusão na configuração.</p>;
  if (!projectId) return <div className="preparation-dialog"><div className="notice"><b>Selecione um projeto</b><p>Abra a preparação a partir de um projeto configurado para consultar issues e pré-requisitos atuais.</p></div>{pendingStartId && <div className="notice"><b>Início sem confirmação</b><p>Consulte a operação original antes de qualquer outra ação. O cliente não enviará outro início automaticamente.</p><button type="button" onClick={() => void inspectStart(pendingStartId)}>Consultar operação original</button>{startState.status === 'observed' && <><p>Estado: {operatorState(startState.operation.state).label}</p></>}</div>}</div>;
  const selectedIssue = issues?.items.find((item) => item.content_id === issueId);
  const issueBlockers = selectedIssue?.reasons.filter((reason) => reason !== 'ISSUE_REVALIDATION_REQUIRED') ?? [];
  const implementerProfiles = profilesForRole(profiles, 'implementer');
  const reviewerProfiles = profilesForRole(profiles, 'reviewer');
  const implementerChoiceId = draft ? profileChoiceId(draft.choices.overrides.implementer_profile, draft.current.effective_configuration.implementer_profile) : '';
  const reviewerChoiceId = draft ? profileChoiceId(draft.choices.overrides.reviewer_profile, draft.current.effective_configuration.reviewer_profile) : '';
  const implementerChoiceAvailable = profilesLoadState === 'ready' && implementerProfiles.some((profile) => `${profile.id}:${profile.revision}` === implementerChoiceId);
  const reviewerChoiceAvailable = profilesLoadState === 'ready' && reviewerProfiles.some((profile) => `${profile.id}:${profile.revision}` === reviewerChoiceId);
  const hasUnavailableRoleChoice = profilesLoadState === 'ready' && Boolean(draft && (
    implementerChoiceId && !implementerChoiceAvailable || reviewerChoiceId && !reviewerChoiceAvailable
  ));
  const missingProfileRole = profilesLoadState === 'ready' && (implementerProfiles.length === 0 || reviewerProfiles.length === 0);
  const blocked = Boolean(!draft || saving || saveError || draft.conflict || !draft.current.criteria_preview.executable || hasBlockingPrerequisites(draft.current.prerequisites) || !draft.current.base_sha || !draft.current.issue || !draft.current.effective_configuration.implementer_profile || !draft.current.effective_configuration.reviewer_profile || !draft.current.summary_hash);
  const configuration = draft?.current.effective_configuration;

  return <div className="preparation-dialog">
    {previousAttemptId && <div className="notice"><b>Nova tentativa</b><p>A preparação consulta a issue e a base atuais. O histórico, a sessão e as alterações da tentativa anterior não serão reutilizados.</p></div>}
    <section className="card preparation-section"><div className="eyebrow">Escolha do trabalho</div><div className="form-grid">
      <div className="form-field"><label htmlFor="preparation-project">Projeto</label><input id="preparation-project" value={projectName} readOnly aria-describedby="preparation-project-help" /><FieldHelp id="preparation-project-help" label="Projeto" /></div>
      <div className="form-field"><label htmlFor="preparation-issue">Issue</label><select id="preparation-issue" value={issueId} aria-describedby="preparation-issue-help" onChange={(event) => { const value = event.currentTarget.value; if (draftRef.current) updateChoices((current) => ({ ...current, issue_id: value })); else setIssueId(value); }} disabled={!issues || !configurationReady || creating}><option value="">Selecione uma issue elegível</option>{issueId && !issues?.items.some((item) => item.content_id === issueId) && <option value={issueId}>{draft?.current.issue?.id === issueId ? draft.current.issue.title : previousAttemptId ? 'Issue da tentativa anterior (indisponível na lista atual)' : 'Consultando issue selecionada…'}</option>}{issues?.items.filter((item) => item.kind === 'issue' && item.executable && item.content_id).map((item) => <option key={item.id} value={item.content_id ?? ''}>{item.title}</option>)}</select><FieldHelp id="preparation-issue-help" label="Issue" /></div>
      <div className="form-field"><label htmlFor="preparation-delivery-mode">Modo de entrega</label><select id="preparation-delivery-mode" value={mode} aria-describedby="preparation-delivery-mode-help" onChange={(event) => { const value = event.currentTarget.value as DeliveryMode; setMode(value); updateChoices((current) => ({ ...current, delivery_mode: value })); }} disabled={!configurationReady || !draft}>{modes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><FieldHelp id="preparation-delivery-mode-help" label="Modo de entrega" /></div>
      <div className="form-field field-full"><label htmlFor="preparation-guidance">Orientação</label><textarea id="preparation-guidance" value={guidance} aria-describedby="preparation-guidance-help" onChange={(event) => { const value = event.currentTarget.value; setGuidance(value); updateChoices((current) => ({ ...current, guidance: value })); }} disabled={!draft} maxLength={8192} /><FieldHelp id="preparation-guidance-help" label="Orientação" /></div>
      {draft && <>
        <div className="form-field"><label htmlFor="preparation-base-branch">Branch-base</label><input id="preparation-base-branch" value={String(draft.choices.overrides.base_branch ?? draft.current.effective_configuration.configuration.base_branch)} aria-describedby="preparation-base-branch-help" onChange={(event) => { const baseBranch = event.currentTarget.value; updateChoices((current) => ({ ...current, overrides: { ...current.overrides, base_branch: baseBranch } })); }} /><FieldHelp id="preparation-base-branch-help" label="Branch-base" /></div>
        <div className="form-field"><label htmlFor="preparation-correction-limit">Limite de correções</label><input id="preparation-correction-limit" type="number" min={0} max={5} value={draft.choices.overrides.correction_limit ?? draft.current.effective_configuration.configuration.correction_limit} aria-describedby="preparation-correction-limit-help" onChange={(event) => { const correctionLimit = Math.max(0, Math.min(5, Number(event.currentTarget.value) || 0)); updateChoices((current) => ({ ...current, overrides: { ...current.overrides, correction_limit: correctionLimit } })); }} /><FieldHelp id="preparation-correction-limit-help" label="Limite de correções" /></div>
        <div className="form-field"><label htmlFor="preparation-implementer-profile">Perfil implementador</label><select id="preparation-implementer-profile" value={implementerChoiceAvailable ? implementerChoiceId : ''} aria-describedby="preparation-implementer-profile-help" onChange={(event) => updateProfileChoice('implementer_profile', event.currentTarget.value)} disabled={profilesLoadState !== 'ready' || implementerProfiles.length === 0}><option value="">Usar perfil efetivo do projeto</option>{implementerProfiles.map((profile) => <option key={profile.id} value={`${profile.id}:${profile.revision}`}>{profile.name} · {profile.provider}/{profile.model}</option>)}</select><FieldHelp id="preparation-implementer-profile-help" label="Perfil implementador" /></div>
        <div className="form-field"><label htmlFor="preparation-reviewer-profile">Perfil revisor</label><select id="preparation-reviewer-profile" value={reviewerChoiceAvailable ? reviewerChoiceId : ''} aria-describedby="preparation-reviewer-profile-help" onChange={(event) => updateProfileChoice('reviewer_profile', event.currentTarget.value)} disabled={profilesLoadState !== 'ready' || reviewerProfiles.length === 0}><option value="">Usar perfil efetivo do projeto</option>{reviewerProfiles.map((profile) => <option key={profile.id} value={`${profile.id}:${profile.revision}`}>{profile.name} · {profile.provider}/{profile.model}</option>)}</select><FieldHelp id="preparation-reviewer-profile-help" label="Perfil revisor" /></div>
      </>}
    </div>
    {profilesLoadState === 'error' && <div className="notice" role="alert"><b>Perfis indisponíveis</b><p>Não foi possível consultar os perfis cadastrados. Reabra a preparação antes de alterar essas escolhas.</p></div>}
    {draft && profilesLoadState === 'ready' && (missingProfileRole || hasUnavailableRoleChoice) && <div className="notice" role={hasUnavailableRoleChoice ? 'alert' : 'status'}>
      <b>{hasUnavailableRoleChoice ? 'Uma escolha de perfil não corresponde mais ao papel atual' : 'Há um papel sem perfil disponível'}</b>
      <p>{hasUnavailableRoleChoice ? 'A escolha anterior foi preservada nos dados da preparação. Selecione um perfil vivo do papel correto ou use o perfil efetivo do projeto.' : `${implementerProfiles.length === 0 ? 'Nenhum Implementador vivo está disponível. ' : ''}${reviewerProfiles.length === 0 ? 'Nenhum Revisor vivo está disponível.' : ''}`}</p>
      <a className="button-link" href="#principal/perfis">Abrir Perfis Globais</a>
    </div>}
    {issuesError && <div className="queue-error" role="alert"><b>Não foi possível consultar as issues</b><p>{issuesError}</p><p><strong>Próxima ação:</strong> atualize a consulta e confirme que a issue continua elegível.</p><button type="button" onClick={() => { setIssues(null); setIssuesError(null); setIssueReload((value) => value + 1); }}>Consultar novamente</button></div>}
    {issues && <IssueOptionsNotice issues={issues} projectId={projectId} onReload={() => setIssueReload((value) => value + 1)} />}
    {selectedIssue && issueBlockers.length > 0 && <div className="notice"><b>Impedimentos desta issue</b><ul>{issueBlockers.map((reason) => <li key={reason}>{operatorCodeLabel(reason)}</li>)}</ul></div>}
    </section>

    {!draft && <div className="preparation-actions dialog-actions"><p>Selecione uma issue elegível para revisar a tentativa.</p><button type="button" className="primary" disabled>Revisar e autorizar</button></div>}
    {draft && <>
      <section className="card preparation-section"><div className="line panel-title"><div><div className="eyebrow">Antes de iniciar</div><h3>Resumo da tentativa</h3></div><span className={`pill ${saving ? 'warn' : 'neutral'}`}>{saving ? 'Salvando' : 'Salvo no controlador'}</span></div>
        <dl className="preparation-facts"><div><dt>Issue atual</dt><dd>{draft.current.issue ? `#${draft.current.issue.number} · ${draft.current.issue.title}` : 'Não confirmada'}</dd></div><div><dt>Estado e responsáveis</dt><dd>{draft.current.issue ? <><OperatorState value={draft.current.issue.state} /> · {draft.current.issue.assignees.map((person) => `@${person.login}`).join(', ') || 'sem responsável observado'}</> : 'Não confirmados'}</dd></div><div><dt>Modo</dt><dd>{modes.find((item) => item.value === draft.current.delivery_mode)?.label}</dd></div><div><dt>Implementador</dt><dd>{profileName(configuration?.implementer_profile ?? null)}</dd></div><div><dt>Revisor</dt><dd>{profileName(configuration?.reviewer_profile ?? null)}</dd></div><div><dt>Limite de correções</dt><dd>{configuration?.configuration.correction_limit ?? '—'}</dd></div><div><dt>Intervalo de consulta</dt><dd>{configuration ? formatMinuteValue(configuration.time_defaults.polling_interval_ms) : '—'}</dd></div><div><dt>Tempo ativo por passagem</dt><dd>{configuration ? formatMinuteValue(configuration.time_defaults.passage_active_time_ms) : '—'}</dd></div><div><dt>TTL da pergunta</dt><dd>{limitLabel(configuration?.time_defaults.question_ttl)}</dd></div><div><dt>Política de artefatos</dt><dd>{configuration?.artifact_policy.automatic_deletion ? 'Exclusão automática habilitada' : 'Sem exclusão automática'}</dd></div></dl>
        <p className="muted">O prazo da pergunta limita a espera por resposta. Intervalo de consulta e tempo ativo são contados separadamente.</p>

        <p className="muted">Origem das escolhas: {configuration ? Object.entries(configuration.origins).map(([field, origin]) => `${originLabel(field)}: ${originLabel(origin)}`).join(' · ') : 'aguardando configuração efetiva'}.</p>
        <h3>Checks capturados</h3>{configuration?.configuration.checks.length ? <ul className="compact-list">{configuration.configuration.checks.map((check, index) => <li key={check.id}>Check {index + 1} · pasta relativa {check.cwd_relative} · prazo {check.timeout_ms ?? 'padrão'} ms</li>)}</ul> : <p className="muted">Nenhum check configurado.</p>}
        <h3>Critérios de aceite</h3>{draft.current.criteria_preview.executable ? <ol className="preparation-criteria">{draft.current.criteria_preview.criteria.map((criterion) => <li key={`${criterion.id}:${criterion.occurrence_index}`}><b>{criterion.id}</b> · {criterion.text}</li>)}</ol> : <div className="notice"><b>Critérios não executáveis</b><p>{draft.current.criteria_preview.reasons.join(' · ') || 'A issue atual não contém critérios de aceite válidos.'}</p></div>}
        <h3>Efeitos previstos</h3><ul className="compact-list">{draft.current.effects_preview.map((effect, index) => <li key={`${effect.kind}-${index}`}>{effect.requested ? 'Será solicitado' : 'Não solicitado'} · {effectLabel(effect.kind)}</li>)}</ul>
        {draft.current.prerequisites.length > 0 && <div className="notice"><b>Condições para iniciar</b>{draft.current.prerequisites.map((item) => <OperatorDiagnosticCard key={item.code} code={item.code} state={item.code === 'EXECUTOR_REVALIDATION_REQUIRED' ? 'pending' : 'blocked'} cause={item.message} recovery={item.recovery} projectId={projectId} />)}</div>}
      </section>
      {draft.conflict && <section className="card conflict-current" role="alert"><h3>Configuração atual do controlador</h3><p>A revisão atual foi consultada separadamente. Seu rascunho continua no formulário.</p><p>Issue atual: {draft.conflict.issue?.title ?? 'Não disponível'} · modo {modes.find((item) => item.value === draft.conflict!.delivery_mode)?.label ?? 'não reconhecido'}</p><button type="button" onClick={() => { const value = { ...draft, etag: `"${draft.conflict!.id}:${draft.conflict!.revision}"`, current: draft.conflict!, savedChoices: draft.conflict!, conflict: null }; installDraft(value); latestChoicesRef.current = draft.choices; void saveLatest(); }}>Manter meu rascunho e salvar sobre os dados atuais</button></section>}
      {saveError && <div className="queue-error" role="alert"><b>Não foi possível confirmar a preparação</b><p>{saveError}</p><p><strong>Próxima ação:</strong> revise os campos e o resumo atual antes de autorizar o início.</p></div>}
      {summaryNotice && <div className="notice" role="status"><p>{summaryNotice}</p></div>}
      {activeConflictId && <div className="notice" role="alert"><b>Esta issue já tem uma tentativa ativa</b><p>O controlador identificou a tentativa existente. Consulte-a sem criar outra.</p><button type="button" onClick={() => onOpenAttempt(activeConflictId)}>Consultar tentativa</button></div>}
      {startState.status === 'accepted' && <div className="notice" role="status"><b>Início aceito pelo controlador</b><p>A aceitação não significa que o ambiente ou a passagem estejam prontos.</p>{startState.operation.resource.type === 'attempt' && <button type="button" onClick={() => onOpenAttempt(startState.operation.resource.id)}>Consultar tentativa</button>}</div>}
      {pendingStartId && <div className="notice" role="status"><b>Resposta do início sem confirmação</b><p>Consulte o resultado original. O cliente não enviará outro início automaticamente.</p><button type="button" onClick={() => void inspectStart(pendingStartId)}>Consultar resultado</button>{startState.status === 'observed' && <><p>Estado observado: {operatorState(startState.operation.state).label}</p></>}</div>}
      {startState.status === 'observed' && !pendingStartId && <div className="notice" role="status"><b>Início {operatorState(startState.operation.state).label.toLocaleLowerCase('pt-BR')}</b>{startState.operation.error && <p>{operatorErrorMessage(startState.operation.error.code, startState.operation.error.message)}</p>}<>{startState.operation.resource.type === 'attempt' && <button type="button" onClick={() => onOpenAttempt(startState.operation.resource.id)}>Consultar tentativa</button>}{startState.operation.state === 'failed' && <p>Revise os dados atuais da preparação antes de autorizar outro início.</p>}</></div>}
      <div className="preparation-actions dialog-actions">
        {!authorizedHash ? <button type="button" className="primary" disabled={saving || Boolean(saveError) || blocked} onClick={() => void authorizeSummary()}>Revisar e autorizar</button> : <><p role="status">Resumo autorizado. Editar exige nova autorização.</p><button type="button" className="primary" disabled={blocked || authorizedHash !== draft.current.summary_hash || ['sending', 'accepted', 'observed'].includes(startState.status) || Boolean(pendingStartId)} onClick={() => void submitStart()}>Iniciar tentativa</button></>}
        {saving && <span role="status">Salvando alterações…</span>}
      </div>
    </>}
  </div>;
}

function sameChoices(left: PreparationChoices, right: PreparationChoices): boolean {
  return Object.keys(changedChoices(left, right)).length === 0 && left.previous_attempt_id === right.previous_attempt_id;
}
function effectLabel(kind: string): string {
  const labels: Record<string, string> = {
    clone: 'Criar um ambiente de implementação separado a partir do commit-base confirmado.',
    execute: 'Executar implementação, checks e revisão independente.',
    local_commit: 'Criar um commit local da versão aprovada quando houver alterações.',
    push: 'Publicar a versão aprovada em uma branch própria no remoto.',
    pull_request: 'Criar um pull request da versão aprovada, quando aplicável.',
    issue_comment: 'Registrar o resultado em um comentário da issue, sem alterar os critérios.',
    project_status: 'Atualizar o Status no quadro conforme o andamento e a entrega.',
  };
  return labels[kind] ?? 'Efeito ainda não reconhecido. Consulte os detalhes do resumo antes de autorizar.';
}
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
function errorMessage(error: unknown): string { return error instanceof HttpError ? error.message : 'Não foi possível concluir a consulta. Verifique o estado antes de repetir.'; }
function safelyResolveOperation(operationId: string): void { try { resolveUncertainOperation(operationId); } catch { /* A later reload may query this harmless operation again. */ } }
function profileName(profile: Preparation['effective_configuration']['implementer_profile']): string { return profile ? `${profile.name} · ${profile.provider}/${profile.model}` : 'Não confirmado'; }
function profileChoiceId(choice: PreparationChoices['overrides']['implementer_profile'], effective: Preparation['effective_configuration']['implementer_profile']): string {
  if (choice?.kind === 'reference') return `${choice.id}:${choice.revision}`;
  if (effective && 'revision' in effective) return `${effective.id}:${effective.revision}`;
  return '';
}
function limitLabel(value: { state: 'configured'; value: number; unit: string } | { state: 'not_configured' } | undefined): string { return !value || value.state === 'not_configured' ? 'Não configurado' : `${value.value} ${value.unit}`; }
function originLabel(value: string): string { return ({ project: 'Projeto', global: 'Global', preparation: 'Preparação', base_branch: 'Base', implementer_profile: 'Implementador', reviewer_profile: 'Revisor', checks: 'Checks', correction_limit: 'Correções', time_defaults: 'Tempo', artifact_policy: 'Artefatos', guidance: 'Orientação', delivery_mode: 'Entrega' } as Record<string, string>)[value] ?? value; }
