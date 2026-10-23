import { CustomSelect } from '../../app/CustomSelect.js';
import { knownProjectDeletion, useProjectDeletionRestriction } from './ProjectDeletionPendingNotice.js';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type {
  ConfigurationOptions, ConfigurationView, ExecutionProfile, GlobalConfiguration, ProjectConfiguration,
  ConfigurationSaved, SettingsSaved, SettingsView, ProjectRegistered, ProjectRegistration, StoredExecutionProfile,
} from '#contracts';
import { HttpError, requestJsonWithMetadata } from '../../api/http.js';
import { clearDraft, configurationDraftIdentity, getDraft, setDraft as persistDraft, type DraftValue } from '../../app/drafts.js';
import { useConfiguration, type EditableConfigurationView } from './useConfiguration.js';
import { configurationCommand, configurationOptionsParams } from './configuration-requests.js';
import { createSaveLifecycle, type SaveOperation } from './save-lifecycle.js';
import { consultConfigurationSave, finishConfigurationSave, hasOriginalConfigurationSave, operationNotLocatedMessage, resendConfigurationSave, retainConfigurationSave, revalidateConfigurationSave } from '../../api/configuration-save.js';
import { readUncertainOperations } from '../../api/uncertain-operations.js';
import { getControllerInstanceId } from '../../api/http.js';
import { profilesForRole } from './profile-collection.js';
import { GitHubSetupPanel } from './GitHubSetupPanel.js';
import { ProjectsFolderField } from './ProjectsFolderField.js';
import { MinutesField } from './MinutesField.js';
import { useGitHubSetup } from './useGitHubSetup.js';
import { nativeSelectionMessage, useNativeSelection } from './useNativeSelection.js';
import { FieldHelp, fieldGuidanceFor } from './FieldHelp.js';
import { OperatorDiagnosticCard } from '../../app/OperatorSupport.js';
import { ProjectDeletionAction } from './ProjectDeletionAction.js';
import { GlobalConditions, GlobalVerification, useGlobalDiagnostics } from './GlobalReadiness.js';
import { ProjectConditions, ProjectVerification, useProjectDiagnostics } from './ProjectReadiness.js';

type EditableView = EditableConfigurationView;
type EditableProfile = ExecutionProfile & { id?: string };
type EditorDraft = {
  global: GlobalConfiguration; profiles: EditableProfile[]; project: ProjectConfiguration | null; dirty: string[];
  baselineGlobal: GlobalConfiguration; baselineProfiles: EditableProfile[]; baselineProject: ProjectConfiguration | null;
  pendingCommand?: { signature: string; id: string };
};
type PersistedEditorDraft = {
  dirty: string[];
  values: Record<string, DraftValue>;
  pendingCommand?: { signature: string; id: string };
};
type SavedSettingsView = SettingsSaved;
type SavedConfigurationView = ConfigurationSaved;
type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'saved'; operationId: string; message: string } | { status: 'error'; message: string; requestId: string | null; code?: string; facts?: Readonly<Record<string, string | number | boolean | null>> | null; affectedRequirements?: readonly string[] } | { status: 'conflict'; message: string; requestId: string | null; code?: string; facts?: Readonly<Record<string, string | number | boolean | null>> | null; affectedRequirements?: readonly string[] };

const editorKey = 'project-configuration';
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const isConfigurationView = (view: EditableView): view is ConfigurationView => 'configuration' in view;
const editableProfile = (profile: StoredExecutionProfile): EditableProfile => ({
  id: profile.id, name: profile.name, profile_type: profile.profile_type, executor: profile.executor, provider: profile.provider, model: profile.model, effort: profile.effort, guidance: profile.guidance,
});
function changedPaths(prefix: string, before: unknown, after: unknown, paths: string[] = []): string[] {
  if (same(before, after)) return paths;
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    const oldRecord = before as Record<string, unknown>;
    const newRecord = after as Record<string, unknown>;
    for (const key of new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)])) changedPaths(`${prefix}.${key}`, oldRecord[key], newRecord[key], paths);
    return paths;
  }
  paths.push(prefix);
  return paths;
}
function setPath(target: Record<string, unknown>, path: readonly string[], value: unknown): void {
  const [key, ...rest] = path;
  if (!key) return;
  if (rest.length === 0) { target[key] = value; return; }
  const child = target[key];
  if (!child || typeof child !== 'object' || Array.isArray(child)) return;
  setPath(child as Record<string, unknown>, rest, value);
}
function readPath(source: Record<string, unknown>, path: readonly string[]): unknown {
  let value: unknown = source;
  for (const key of path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
function rebaseDraft(latest: EditorDraft, saved: EditorDraft): EditorDraft {
  const merged = structuredClone(latest) as EditorDraft;
  for (const path of saved.dirty) {
    if (path === 'profiles') continue;
    const parts = path.split('.');
    const root = parts.shift();
    const source = root === 'global' ? saved.global : root === 'project' ? saved.project : null;
    const target = root === 'global' ? merged.global : root === 'project' ? merged.project : null;
    if (!source || !target) continue;
    const value = readPath(source as unknown as Record<string, unknown>, parts);
    setPath(target as unknown as Record<string, unknown>, parts, value);
  }
  merged.profiles = structuredClone(latest.profiles);
  merged.baselineGlobal = structuredClone(latest.baselineGlobal);
  merged.baselineProfiles = structuredClone(latest.profiles);
  merged.baselineProject = latest.project ? structuredClone(latest.project) : null;
  merged.dirty = saved.dirty.filter((path) => path !== 'profiles');
  return merged;
}

function persistEditedFields(identity: string, draft: EditorDraft): void {
  const dirty = [
    ...changedPaths('global', draft.baselineGlobal, draft.global).filter((path) => path !== 'global.profiles' && !path.startsWith('global.profiles.')),
    ...(draft.project && draft.baselineProject ? changedPaths('project', draft.baselineProject, draft.project) : []),
  ];
  const values: Record<string, DraftValue> = {};
  for (const path of dirty) {
    const [root, ...parts] = path.split('.');
    const source = root === 'global' ? draft.global : root === 'project' ? draft.project : null;
    if (source) values[path] = readPath(source as unknown as Record<string, unknown>, parts) as DraftValue;
  }
  if (dirty.length === 0 && !draft.pendingCommand) {
    clearDraft(identity, editorKey);
    return;
  }
  const saved: PersistedEditorDraft = {
    dirty, values,
    ...(draft.pendingCommand ? { pendingCommand: draft.pendingCommand } : {}),
  };
  persistDraft(identity, editorKey, saved as unknown as DraftValue);
}

function restoreEditedFields(latest: EditorDraft, saved: PersistedEditorDraft): EditorDraft {
  const restored = structuredClone(latest) as EditorDraft;
  for (const [path, value] of Object.entries(saved.values)) {
    const [root, ...parts] = path.split('.');
    const target = root === 'global' ? restored.global : root === 'project' ? restored.project : null;
    if (target) setPath(target as unknown as Record<string, unknown>, parts, value);
  }
  restored.dirty = saved.dirty.filter((path) => path !== 'profiles');
  if (saved.pendingCommand) restored.pendingCommand = saved.pendingCommand;
  return restored;
}

function draftFromView(view: EditableView): EditorDraft {
  return {
    global: structuredClone({ ...view.settings, profiles: view.profiles }), profiles: view.profiles.map(editableProfile),
    project: isConfigurationView(view) ? structuredClone(view.configuration) : null, dirty: [],
    baselineGlobal: structuredClone({ ...view.settings, profiles: view.profiles }), baselineProfiles: view.profiles.map(editableProfile),
    baselineProject: isConfigurationView(view) ? structuredClone(view.configuration) : null,
  };
}

function conflictCurrentValues(draft: EditorDraft, view: EditableView): { label: string; value: string }[] {
  const current = draftFromView(view);
  const format = (value: unknown): string => value === null || value === undefined ? 'Não definido'
    : typeof value === 'string' ? value || 'Vazio'
    : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const values: { label: string; value: string }[] = [];
  for (const path of draft.dirty) {
    if (path === 'profiles') continue;
    const [root, ...parts] = path.split('.');
    const source = root === 'global' ? current.global : root === 'project' ? current.project : null;
    if (!source) continue;
    const label = parts.map((part) => part.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toLocaleUpperCase('pt-BR'))).join(' · ');
    values.push({ label: `${root === 'global' ? 'Configuração global' : 'Projeto'} · ${label}`, value: format(readPath(source as unknown as Record<string, unknown>, parts)) });
  }
  return values;
}

function TextField({ label, value, onChange, type = 'text', help, error, compactHelp = false, required = false }: {
  label: string; value: string; onChange: (value: string) => void; type?: string; help?: string; compactHelp?: boolean; error?: string | null; required?: boolean;
}) {
  const id = `field-${label.toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, '-')}`;
  const helpId = `${id}-help`;
  const description = compactHelp ? help : [help, fieldGuidanceFor(label)].filter(Boolean).join(' ');
  return <div className="form-field"><label htmlFor={id}>{label}</label><input id={id} value={value} type={type} required={required} onChange={(event) => onChange(event.currentTarget.value)} aria-invalid={Boolean(error)} aria-describedby={[error ? `${id}-error` : null, helpId].filter(Boolean).join(' ')} />{error && <span id={`${id}-error`} className="error">{error}</span>}<small id={helpId} className="field-guidance">{description}</small></div>;
}

function SelectField({ label, value, onChange, options, disabled = false, help, error, compactHelp = false }: {
  label: string; value: string; onChange: (value: string) => void; options: readonly { value: string; label: string }[]; disabled?: boolean; help?: string; compactHelp?: boolean; error?: string | null;
}) {
  const id = `field-${label.toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, '-')}`;
  const helpId = `${id}-help`;
  const description = compactHelp ? help : [help, fieldGuidanceFor(label)].filter(Boolean).join(' ');
  return <div className="form-field"><label htmlFor={id}>{label}</label><CustomSelect id={id} value={value} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={[error ? `${id}-error` : null, helpId].filter(Boolean).join(' ')} onChange={(event) => onChange(event.currentTarget.value)}><option value="">Selecione…</option>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</CustomSelect>{error && <span id={`${id}-error`} className="error">{error}</span>}<small id={helpId} className="field-guidance">{description}</small></div>;
}

function NumberField({ label, value, onChange, min, max, step = 1, unit }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; unit?: string;
}) {
  const id = `field-${label.toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, '-')}`;
  const helpId = `${id}-help`;
  return <div className="form-field"><label htmlFor={id}>{label}</label><span className="input-with-unit"><input id={id} type="number" min={min} max={max} step={step} value={value} aria-describedby={helpId} onChange={(event) => onChange(event.currentTarget.value === '' ? 0 : Number(event.currentTarget.value))} />{unit && <small>{unit}</small>}</span><FieldHelp id={helpId} label={label} /></div>;
}

type RegistrationDraft = { name: string; kind: 'local' | 'github'; location: string; baseBranch: string; commandId: string | null };
const registrationDraftKey = 'project-registration';
export function ProjectRegistrationForm({ identity, onRegistered }: { identity: string; onRegistered: (projectId: string) => void }) {
  const folderSelection = useNativeSelection();
  const [form, setForm] = useState<RegistrationDraft>(() => getDraft<RegistrationDraft>(identity, registrationDraftKey) ?? { name: '', kind: 'local', location: '', baseBranch: 'main', commandId: null });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(ProjectRegistered) | null>(null);
  const [failure, setFailure] = useState<{ message: string; requestId: string | null; fields: ReadonlyMap<string, string> } | null>(null);
  const locationLabel = form.kind === 'local' ? 'Pasta local existente' : 'URL do repositório GitHub';
  const fieldMessage = (field: string) => failure?.fields.get(field) ?? null;
  function updateForm(changes: Partial<RegistrationDraft>): void {
    setForm((current) => {
      const next = { ...current, ...changes };
      persistDraft(identity, registrationDraftKey, next as unknown as DraftValue);
      return next;
    });
  }
  useEffect(() => {
    if (folderSelection.state.status === 'selected' && folderSelection.state.kind === 'project_directory' && form.kind === 'local') {
      updateForm({ location: folderSelection.state.path, commandId: null });
    }
  }, [folderSelection.state]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true); setFailure(null); setResult(null);
    const body: ProjectRegistration = { name: form.name.trim(), source: { kind: form.kind, location: form.location.trim() }, base_branch: form.baseBranch.trim() };
    try {
      const stableId = form.commandId ?? crypto.randomUUID();
      updateForm({ commandId: stableId });
      const saved = await requestJsonWithMetadata<ProjectRegistered>('/api/v1/projects', {
        method: 'POST', headers: { 'Idempotency-Key': stableId }, body: JSON.stringify(body),
      });
      setResult(saved.data);
      clearDraft(identity, registrationDraftKey);
    } catch (error: unknown) {
      const http = error instanceof HttpError ? error : null;
      setFailure({ message: http?.message ?? 'O cadastro não foi confirmado pelo controlador.', requestId: http?.requestId ?? null, fields: new Map(http?.fieldErrors.map((item) => [item.field, item.message]) ?? []) });
    } finally { setBusy(false); }
  }

  if (result) return <section className="project-form-success" aria-live="polite"><span className="pill">Cadastro confirmado</span><h3>{result.project.name}</h3><p>{result.project.source.kind === 'local' ? 'Origem local registrada. Somente o histórico commitado entra em uma execução; alterações não commitadas ficam de fora.' : 'Origem GitHub registrada.'}</p>{result.prerequisites.length > 0 && <div className="notice"><b>Pré-requisitos de execução</b>{result.prerequisites.map((item) => <OperatorDiagnosticCard key={item.code} code={item.code} state="blocked" cause={item.message} recovery={item.recovery} />)}</div>}<button type="button" className="primary" onClick={() => onRegistered(result.project.id)}>Abrir configuração do projeto</button></section>;

  const missingFields = [!form.name.trim() && 'nome do projeto', !form.location.trim() && locationLabel.toLocaleLowerCase('pt-BR'), !form.baseBranch.trim() && 'branch-base'].filter(Boolean);
  return <form className="creation-flow feature-form registration-form" onSubmit={(event) => void submit(event)} noValidate>
    <p className="creation-intro">Conecte um projeto que você já tem para configurar e acompanhar pela fábrica.</p>
    {failure && <div className="read-state" role="alert"><b>Cadastro não confirmado</b><p>{failure.message}</p><p><strong>Próxima ação:</strong> revise os campos destacados e consulte o estado atual antes de repetir.</p></div>}
    <div className="form-grid creation-form-grid">
      <div className="creation-group-heading field-full"><h3>Dados do projeto</h3><span>* Obrigatório</span></div>
      <div className="field-full"><TextField compactHelp label="Nome do projeto" value={form.name} onChange={(value) => updateForm({ name: value, commandId: null })} required error={fieldMessage('name')} help="Nome usado para identificar o projeto na fábrica." /></div>
      <div className="creation-group-heading creation-repository-heading field-full"><h3>Origem do projeto</h3><span>Local ou GitHub</span></div>
      <SelectField compactHelp label="Tipo de origem" help="Escolha onde o projeto já está armazenado." value={form.kind} onChange={(value) => updateForm({ kind: value as 'local' | 'github', commandId: null })} options={[{ value: 'local', label: 'Pasta local existente' }, { value: 'github', label: 'Repositório GitHub' }]} error={fieldMessage('source.kind')} />
      <TextField compactHelp label="Branch-base" help="Branch usada como referência nas preparações." value={form.baseBranch} onChange={(value) => updateForm({ baseBranch: value, commandId: null })} required error={fieldMessage('base_branch')} />
      <div className="field-full">{form.kind === 'local' ? <div className="registration-folder-field"><label htmlFor="registration-folder">Pasta local existente *</label><div className="registration-folder-row"><input id="registration-folder" value={form.location} readOnly placeholder="Selecione a pasta do projeto" aria-describedby="registration-folder-help" /><button type="button" disabled={busy || folderSelection.state.status === 'selecting'} onClick={() => void folderSelection.select('project_directory')}>{folderSelection.state.status === 'selecting' ? 'Abrindo janela…' : form.location ? 'Trocar pasta' : 'Selecionar pasta'}</button></div><small id="registration-folder-help">Escolha uma pasta que já contenha um repositório Git.</small>{fieldMessage('source.location') && <p className="error" role="alert">{fieldMessage('source.location')}</p>}{folderSelection.state.status !== 'idle' && folderSelection.state.status !== 'selected' && <p role="status">{nativeSelectionMessage(folderSelection.state)}</p>}</div> : <TextField compactHelp label={locationLabel} value={form.location} onChange={(value) => updateForm({ location: value, commandId: null })} required error={fieldMessage('source.location')} help="Use uma URL HTTPS ou SSH sem credenciais embutidas." />}</div>
    </div>
    <div className="creation-destination-preview"><span>Sobre o cadastro</span><p className="registration-source-note">{form.kind === 'local' ? 'A pasta permanece intacta. As execuções usam apenas o conteúdo commitado no Git.' : 'O cadastro vincula o repositório GitHub; não clona arquivos nem inicia uma execução.'}</p></div>
    <div className="form-actions creation-form-footer"><p id="registration-guidance">{busy ? 'Aguarde a confirmação do cadastro.' : missingFields.length ? `Preencha: ${missingFields.join(', ')}.` : 'Depois de adicionar, configure os pré-requisitos do projeto.'}</p><button type="submit" className="primary" aria-describedby="registration-guidance" disabled={busy || folderSelection.state.status === 'selecting' || missingFields.length > 0}>{busy ? 'Cadastrando…' : 'Adicionar existente'}</button></div>
  </form>;
}

export function ProjectConfigurationForm({ projectId, onSaveIssue, onDraftStateChange }: { projectId: string | null; onDraftStateChange?: (dirty: boolean, saving: boolean) => void; onSaveIssue: (issue: { identity: string; message: string; requestId: string | null; kind: 'error' | 'conflict' } | null, identity: string) => void }) {
  const globalDiagnostic = useGlobalDiagnostics(projectId === null);
  const projectDiagnostic = useProjectDiagnostics(projectId);
  const identity = projectId ?? 'global-settings';
  const deletionRestricted = useProjectDeletionRestriction(projectId);
  const identityRef = useRef(identity);
  const saveLifecycleRef = useRef(createSaveLifecycle(identity));
  identityRef.current = identity;
  const { load, setLoad, retry: retryConfiguration, refreshError, clearRefreshError } = useConfiguration(projectId);
  const readyView = load.status === 'ready' && load.identity === identity ? load.view : null;
  const globalSettingsView: SettingsView | null = !projectId && readyView && !('configuration' in readyView) ? readyView : null;
  const globalSettingsEtag = globalSettingsView && load.status === 'ready' ? load.etag : null;
  const nativeSelection = useNativeSelection();
  const githubSetup = useGitHubSetup({
    enabled: projectId === null,
    settings: globalSettingsView,
    etag: globalSettingsEtag,
    onSettingsSaved: () => window.dispatchEvent(new Event('factory-controller-resync')),
  });
  const githubSettingsPending = [githubSetup.accountOperation, githubSetup.executableOperation]
    .some((operation) => operation.status === 'saving' || operation.status === 'uncertain');
  const [projectsRootSaveError, setProjectsRootSaveError] = useState<{ message: string; requestId: string | null } | null>(null);
  const [timeFieldErrors, setTimeFieldErrors] = useState<Record<string, string>>({});
  const timeFieldErrorsRef = useRef<Record<string, string>>({});
  const accountId = load.status === 'ready' && load.identity === identity ? load.view.settings.account_id : null;
  const draftScope = configurationDraftIdentity(accountId, identity);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [projectName, setProjectName] = useState('Configuração do projeto');
  const draftRef = useRef<EditorDraft | null>(null);
  const [options, setOptions] = useState<{ key: string; data: ConfigurationOptions } | null>(null);
  const [optionsError, setOptionsError] = useState<{ key: string; message: string } | null>(null);
  const optionsKeyRef = useRef('');
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [conflictView, setConflictView] = useState<EditableView | null>(null);
  const conflictETagRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  const [uncertainId, setUncertainId] = useState<string | null>(() => readUncertainOperations().find((item) => item.kind === 'settings-save')?.operationId ?? null);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [canResend, setCanResend] = useState(false);
  const initializedDraftRef = useRef<string | null>(null);

  useEffect(() => {
    const dirty = Boolean(draft && draft.project && !same(draft.project, draft.baselineProject));
    onDraftStateChange?.(dirty, saveState.status === 'saving');
  }, [draft, saveState.status, onDraftStateChange]);

  useEffect(() => {
    const lifecycle = saveLifecycleRef.current;
    lifecycle.activate();
    return () => lifecycle.dispose();
  }, []);

  useLayoutEffect(() => {
    saveLifecycleRef.current.dispose();
    saveLifecycleRef.current.updateIdentity(identity);
    saveLifecycleRef.current.activate();
  }, [identity, accountId]);

  useEffect(() => {
    setOptions(null); setOptionsError(null); setSaveState({ status: 'idle' }); setConflictView(null); setProjectsRootSaveError(null);
    timeFieldErrorsRef.current = {};
    setTimeFieldErrors({});
  }, [identity]);

  useEffect(() => {
    if (load.status !== 'ready' || load.identity !== identity) return;
    const accountIdentity = JSON.stringify([identity, load.view.settings.account_id]);
    if (initializedDraftRef.current === accountIdentity) {
      const current = draftRef.current;
      if (!current) return;
      const nextProfiles = load.view.profiles.map(editableProfile);
      if (same(current.profiles, nextProfiles)) return;
      const next = {
        ...current, profiles: nextProfiles, baselineProfiles: nextProfiles,
        global: { ...current.global, profiles: load.view.profiles },
        baselineGlobal: { ...current.baselineGlobal, profiles: load.view.profiles },
      };
      draftRef.current = next;
      setDraft(next);
      return;
    }
    initializedDraftRef.current = accountIdentity;
    const data = load.view;
    const defaults = draftFromView(data);
    const savedDraft = getDraft<PersistedEditorDraft>(draftScope, editorKey);
    const nextDraft = savedDraft ? restoreEditedFields(defaults, savedDraft) : defaults;
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    if (savedDraft) persistEditedFields(draftScope, nextDraft);
  }, [identity, load]);

  const selectedProjectId = draft?.project?.github_project?.id ?? '';
  const selectedStatusField = draft?.project?.github_project?.status_field_id ?? '';
  const selectedOwnerId = draft?.project?.github_project?.owner_id ?? '';
  const projectDraftReady = Boolean(draft?.project);
  const optionsKey = JSON.stringify([projectId, selectedProjectId, selectedOwnerId, selectedStatusField]);
  optionsKeyRef.current = optionsKey;
  const currentOptions = options?.key === optionsKey ? options.data : null;
  const currentOptionsError = optionsError?.key === optionsKey ? optionsError.message : null;
  useEffect(() => {
    if (!projectId || !projectDraftReady) return;
    let active = true;
    const controller = new AbortController();
    const params = configurationOptionsParams({ github_project_id: selectedProjectId, owner_id: selectedOwnerId, status_field_id: selectedStatusField });
    requestJsonWithMetadata<ConfigurationOptions>(`/api/v1/projects/${encodeURIComponent(projectId)}/configuration-options${params.size ? `?${params.toString()}` : ''}`, { signal: controller.signal }).then(({ data }) => {
      if (active) { setOptions({ key: optionsKey, data }); setOptionsError(null); }
    }).catch((error: unknown) => {
      if (active && !(error instanceof DOMException && error.name === 'AbortError')) setOptionsError({ key: optionsKey, message: error instanceof Error ? error.message : 'Opções de conta/Project indisponíveis.' });
    });
    return () => { active = false; controller.abort(); };
  }, [projectId, projectDraftReady, selectedOwnerId, selectedProjectId, selectedStatusField, optionsKey]);

  const settings = load.status === 'ready' && load.identity === identity ? load.view.settings : null;

  function updateDraft(update: (current: EditorDraft) => EditorDraft): void {
    setDraft((current) => {
      if (!current) return current;
      const changed = update(current);
      const dirty = [...current.dirty];
      for (const path of changedPaths('global', current.global, changed.global)) if (!dirty.includes(path)) dirty.push(path);
      if (current.project && changed.project) for (const path of changedPaths('project', current.project, changed.project)) if (!dirty.includes(path)) dirty.push(path);
      const next = { ...changed, dirty };
      draftRef.current = next;
      persistEditedFields(draftScope, next);
      setSaveState((state) => state.status === 'saved' ? { status: 'idle' } : state);
      return next;
    });
  }

  function updateGlobal<K extends keyof GlobalConfiguration>(key: K, value: GlobalConfiguration[K]): void {
    if (key === 'projects_root') setProjectsRootSaveError(null);
    updateDraft((current) => ({ ...current, global: { ...current.global, [key]: value } }));
  }

  function updateTimeFieldValidity(field: string, message: string | null): void {
    const next = { ...timeFieldErrorsRef.current };
    if (message) next[field] = message;
    else delete next[field];
    timeFieldErrorsRef.current = next;
    setTimeFieldErrors(next);
  }

  function updateProject(update: (current: ProjectConfiguration) => ProjectConfiguration): void {
    updateDraft((current) => current.project ? ({ ...current, project: update(current.project) }) : current);
  }

  async function refreshCurrent(operation: SaveOperation): Promise<{ view: EditableView; etag: string }> {
    const expectedIdentity = operation.identity;
    const expectedProjectId = expectedIdentity === 'global-settings' ? null : expectedIdentity;
    const path = expectedProjectId ? `/api/v1/projects/${encodeURIComponent(expectedProjectId)}/configuration` as const : '/api/v1/settings' as const;
    const latest = await requestJsonWithMetadata<EditableView>(path);
    if (!latest.etag) throw new Error('A revisão atual não veio na resposta.');
    if (!saveLifecycleRef.current.isCurrent(identityRef.current, operation)) return { view: latest.data, etag: latest.etag };
    setConflictView(latest.data);
    conflictETagRef.current = latest.etag;
    return { view: latest.data, etag: latest.etag };
  }

  async function retryConflictRead(): Promise<void> {
    const operation = saveLifecycleRef.current.begin(identity);
    try {
      await refreshCurrent(operation);
      if (!saveLifecycleRef.current.isCurrent(identityRef.current, operation)) return;
      setSaveState((current) => current.status === 'conflict' ? { ...current, message: 'Os dados atuais e a revisão nova foram carregados em separado. Seu rascunho foi preservado.' } : current);
    } catch (error: unknown) {
      if (!saveLifecycleRef.current.isCurrent(identityRef.current, operation)) return;
      const http = error instanceof HttpError ? error : null;
      setSaveState({ status: 'error', message: http?.message ?? 'Não foi possível consultar a revisão atual.', requestId: http?.requestId ?? null });
    }
  }

  async function loadMoreOptions(): Promise<void> {
    if (!projectId || !currentOptions?.projects.next_cursor) return;
    const operation = saveLifecycleRef.current.begin(identity);
    const expectedIdentity = identity;
    const expectedOptionsKey = optionsKey;
    const params = configurationOptionsParams({ github_project_id: selectedProjectId, owner_id: selectedOwnerId, status_field_id: selectedStatusField }, currentOptions.projects.next_cursor);
    try {
      const { data } = await requestJsonWithMetadata<ConfigurationOptions>(`/api/v1/projects/${encodeURIComponent(projectId)}/configuration-options?${params.toString()}`);
      if (!saveLifecycleRef.current.isCurrent(expectedIdentity, operation) || identityRef.current !== expectedIdentity || optionsKeyRef.current !== expectedOptionsKey) return;
      setOptions((current) => current?.key === expectedOptionsKey ? { key: expectedOptionsKey, data: { ...data, projects: { ...data.projects, items: [...current.data.projects.items, ...data.projects.items] } } } : current);
      setOptionsError(null);
    } catch (error: unknown) {
      if (!saveLifecycleRef.current.isCurrent(expectedIdentity, operation) || identityRef.current !== expectedIdentity || optionsKeyRef.current !== expectedOptionsKey) return;
      setOptionsError({ key: expectedOptionsKey, message: error instanceof HttpError ? error.message : 'Não foi possível carregar a próxima página de Projects.' });
    }
  }

  async function save(revalidateProjectsRoot = false): Promise<void> {
    if (uncertainId || saveInFlightRef.current || saveState.status === 'saving') return;
    if (Object.keys(timeFieldErrorsRef.current).length > 0) return;
    if (projectId && knownProjectDeletion(projectId)) return;
    if (load.status !== 'ready' || load.identity !== identity || !draft) return;
    if (isConfigurationView(load.view) && load.view.configuration_lock) return;
    const baseline = load.view;
    const baseGlobal: GlobalConfiguration = { ...baseline.settings, profiles: baseline.profiles };
    const globalChanges: Partial<GlobalConfiguration> = {};
    if (revalidateProjectsRoot) {
      if (projectId || draft.global.projects_root === null) return;
      globalChanges.projects_root = draft.global.projects_root;
    } else if (!projectId) {
      for (const key of ['projects_root', 'automation_enabled', 'time_defaults', 'artifact_policy'] as const) {
        if (!same(baseGlobal[key], draft.global[key])) Object.assign(globalChanges, { [key]: draft.global[key] });
      }
    }
    const projectChanges: Partial<ProjectConfiguration> = {};
    if (!revalidateProjectsRoot && projectId && isConfigurationView(baseline) && draft.project) {
      for (const key of ['source', 'base_branch', 'github_project', 'implementer_profile_id', 'reviewer_profile_id', 'checks', 'correction_limit', 'default_delivery_mode', 'automation_enabled', 'queue_order', 'guidance'] as const) {
        if (!same(baseline.configuration[key], draft.project[key])) Object.assign(projectChanges, { [key]: draft.project[key] });
      }
    }
    const hasGlobalChanges = Object.keys(globalChanges).length > 0;
    const hasProjectChanges = Object.keys(projectChanges).length > 0;
    if (!hasGlobalChanges && !hasProjectChanges) { setSaveState({ status: 'idle' }); return; }

    setSaveState({ status: 'saving' });
    const payload = configurationCommand(projectId ? projectChanges : null, globalChanges);
    const signature = JSON.stringify([load.etag, payload]);
    const pendingCommand = draft.pendingCommand?.signature === signature ? draft.pendingCommand : { signature, id: crypto.randomUUID() };
    const operationIdForRequest = pendingCommand.id;
    if (draft.pendingCommand !== pendingCommand) {
      const withPendingCommand = { ...draft, pendingCommand };
      setDraft(withPendingCommand); persistEditedFields(draftScope, withPendingCommand);
    }
    const operation = saveLifecycleRef.current.begin(identity);
    const expectedIdentity = operation.identity;
    const headers = { 'If-Match': load.etag, 'Idempotency-Key': operationIdForRequest };
    saveInFlightRef.current = true;
    try {
      const instanceId = getControllerInstanceId();
      if (!instanceId) throw new Error('Consulte a configuração antes de salvar.');
      retainConfigurationSave({ operationId: operationIdForRequest, path: projectId ? `/api/v1/projects/${encodeURIComponent(projectId)}/configuration` : '/api/v1/settings', method: 'PUT', body: JSON.stringify(payload), etag: load.etag, accountId: baseline.settings.account_id, installationId: baseline.settings.installation_id, instanceId });
    let saved: EditableView;
    let operationId = '';
    let receiptConfirmed = false;
      let etag: string | null;
      if (projectId) {
        const response = await requestJsonWithMetadata<SavedConfigurationView>(`/api/v1/projects/${encodeURIComponent(projectId)}/configuration`, {
          method: 'PUT', headers, body: JSON.stringify(payload),
        });
        saved = response.data; etag = response.etag; operationId = response.data.operation_id; receiptConfirmed = Boolean(response.data.receipt);
      } else {
        const response = await requestJsonWithMetadata<SavedSettingsView>('/api/v1/settings', {
          method: 'PUT', headers, body: JSON.stringify(payload),
        });
        saved = response.data; etag = response.etag; operationId = response.data.operation_id; receiptConfirmed = Boolean(response.data.receipt);
      }
      if (!etag || !receiptConfirmed) throw new Error('O commit não retornou ETag e recibo durável.');
      finishConfigurationSave(operationIdForRequest);
      if (!saveLifecycleRef.current.isCurrent(identityRef.current, operation)) return;
      const defaults = draftFromView(saved);
      if (!defaults.project && draft.project) defaults.project = draft.project;
      const currentDraft = draftRef.current ?? draft;
      const nextDraft = rebaseDraft(defaults, currentDraft);
      delete nextDraft.pendingCommand;
      draftRef.current = nextDraft;
      setDraft(nextDraft); persistEditedFields(draftScope, nextDraft);
      setLoad({ status: 'ready', identity, view: saved, etag }); setConflictView(null);
      setSaveState({ status: 'saved', operationId, message: 'Salvo após confirmação do recibo.' });
      if (Object.hasOwn(globalChanges, 'projects_root')) {
        setProjectsRootSaveError(null);
        if (nativeSelection.candidates.projects_root === saved.settings.projects_root) nativeSelection.clearCandidate('projects_root');
      }
      onSaveIssue(null, expectedIdentity);
    } catch (error: unknown) {
      const http = error instanceof HttpError ? error : null;
      const uncertain = !(error instanceof RangeError) && (!http || http.status === 401 || http.status >= 500);
      if (!uncertain) finishConfigurationSave(operationIdForRequest);
      if (!saveLifecycleRef.current.isCurrent(identityRef.current, operation)) return;
      if (http && (http.code === 'DIRECTORY_INVALID' || http.code === 'PROJECTS_ROOT_INVALID' || http.code === 'PROJECTS_ROOT_UNAVAILABLE' || http.fieldErrors.some((field) => field.field === 'projects_root' || field.field.endsWith('.projects_root')))) {
        setProjectsRootSaveError({ message: http.message, requestId: http.requestId });
      }
      if (uncertain) { setUncertainId(operationIdForRequest); setCanResend(false); setRecoveryMessage('Gravação ainda não confirmada. Consulte o resultado antes de qualquer novo comando.'); }
      if (http?.status === 412) {
        let currentLoaded = false;
        try { await refreshCurrent(operation); currentLoaded = saveLifecycleRef.current.isCurrent(identityRef.current, operation); } catch { /* Keep the existing draft and report the original conflict. */ }
        if (!saveLifecycleRef.current.isCurrent(identityRef.current, operation)) return;
        const message = currentLoaded ? 'A configuração mudou desde a leitura. Seu rascunho foi preservado; os dados atuais e a revisão nova estão carregados separadamente.' : 'A configuração mudou desde a leitura. Seu rascunho foi preservado, mas a consulta dos dados atuais falhou; tente consultar novamente antes de salvar.';
        setSaveState({ status: 'conflict', message, requestId: http.requestId, code: http.code, facts: http.facts, affectedRequirements: http.affectedRequirements });
        onSaveIssue({ identity: expectedIdentity, message, requestId: http.requestId, kind: 'conflict' }, expectedIdentity);
      } else {
        const message = http?.message ?? (error instanceof Error ? error.message : 'A gravação não foi confirmada.');
        setSaveState({ status: 'error', message, requestId: http?.requestId ?? null, ...(http ? { code: http.code, facts: http.facts, affectedRequirements: http.affectedRequirements } : {}) });
        onSaveIssue({ identity: expectedIdentity, message, requestId: http?.requestId ?? null, kind: 'error' }, expectedIdentity);
      }
    } finally { saveInFlightRef.current = false; }
  }

  async function recoverSave(resend = false): Promise<void> {
    if (!uncertainId) return;
    const operation = saveLifecycleRef.current.begin(identity);
    try {
      if (resend) {
        const original = await revalidateConfigurationSave(uncertainId);
        const expectedPath = projectId ? `/api/v1/projects/${encodeURIComponent(projectId)}/configuration` : '/api/v1/settings';
        if (!saveLifecycleRef.current.isCurrent(identityRef.current, operation) || original.path !== expectedPath || original.accountId !== accountId) throw new Error('Restabeleça o contexto original da edição para reapresentar a operação.');
        const response = await resendConfigurationSave<SavedSettingsView | SavedConfigurationView>(uncertainId);
        if (!response.etag || !response.data.receipt || response.data.operation_id !== uncertainId) throw new Error('A gravação permanece sem recibo confirmado.');
        finishConfigurationSave(uncertainId);
      } else {
        const result = await consultConfigurationSave(uncertainId);
        if (!saveLifecycleRef.current.isCurrent(identityRef.current, operation)) return;
        if (!result) {
          setRecoveryMessage(operationNotLocatedMessage);
          setCanResend(false);
          if (hasOriginalConfigurationSave(uncertainId)) {
            const original = await revalidateConfigurationSave(uncertainId);
            const expectedPath = projectId ? `/api/v1/projects/${encodeURIComponent(projectId)}/configuration` : '/api/v1/settings';
            if (saveLifecycleRef.current.isCurrent(identityRef.current, operation)) setCanResend(original.path === expectedPath && original.accountId === accountId);
          }
          return;
        }
        if (result.state !== 'succeeded' || !result.receipt) { setRecoveryMessage('A operação continua sem confirmação de sucesso. Mantenha a consulta aberta e atualize novamente mais tarde.'); return; }
        finishConfigurationSave(uncertainId);
      }
      if (!saveLifecycleRef.current.isCurrent(identityRef.current, operation)) return;
      setUncertainId(null); setCanResend(false);
      setRecoveryMessage('O recibo original foi recuperado. Consulte os valores atuais para comparar com seu rascunho.');
      await refreshCurrent(operation);
    } catch (error: unknown) {
      if (!saveLifecycleRef.current.isCurrent(identityRef.current, operation)) return;
      setRecoveryMessage(error instanceof Error ? error.message : 'Não foi possível consultar a operação.');
    }
  }

  if (load.status === 'loading' || load.identity !== identity) return <section className="card read-state" role="status"><p>Consultando configuração persistida…</p></section>;
  if (load.status === 'error') return <section className="card read-state" role="alert"><h2>Configuração indisponível</h2><p>{load.message}</p><button type="button" onClick={retryConfiguration}>Tentar novamente</button></section>;
  if (!draft) return <section className="card read-state" role="status"><p>Preparando edição…</p></section>;
  const implementerProfiles = profilesForRole(draft.profiles, 'implementer');
  const reviewerProfiles = profilesForRole(draft.profiles, 'reviewer');
  const configurationLock = isConfigurationView(load.view) ? load.view.configuration_lock : null;
  const implementerProfileAvailable = implementerProfiles.some((profile) => profile.id === draft.project?.implementer_profile_id);
  const reviewerProfileAvailable = reviewerProfiles.some((profile) => profile.id === draft.project?.reviewer_profile_id);
  const hasUnavailableProjectProfile = Boolean(draft.project && (
    draft.project.implementer_profile_id !== null && !implementerProfileAvailable ||
    draft.project.reviewer_profile_id !== null && !reviewerProfileAvailable
  ));

  return <div className={`configuration-editor${projectId ? '' : ' global-settings-editor'}`}>
    {!projectId && <section className="settings-overview" aria-labelledby="settings-overview-title"><div className="settings-overview-heading"><div><span className="eyebrow">Configuração salva</span><h2 id="settings-overview-title">Operação desta instalação</h2></div><a href="#principal/registros">Ver registros</a></div><dl className="settings-overview-facts">
      <div><dt>Automação global</dt><dd>{load.view.settings.automation_enabled ? 'Habilitada' : 'Pausada'}</dd></div>
      <div><dt>Perfis de execução</dt><dd>{load.view.profile_counts.implementer} Implementador · {load.view.profile_counts.reviewer} Revisor</dd></div>
      <div><dt>Pasta de projetos</dt><dd>{load.view.settings.projects_root ? 'Definida' : 'Não definida'}</dd></div>
    </dl><p>Resumo dos valores salvos. As verificações de cada seção confirmam as condições de uso.</p></section>}
    {refreshError && <div className="notice" role="alert"><b>Atualização da configuração não confirmada</b><p>{refreshError.message} Os valores e rascunhos permanecem visíveis como leitura anterior.</p><div className="row"><button type="button" onClick={retryConfiguration}>Tentar atualizar novamente</button><button type="button" onClick={clearRefreshError}>Dispensar aviso</button></div></div>}
    {conflictView && <section className="notice conflict-current" aria-live="polite"><b>Dados atuais consultados em separado</b><p>Seu rascunho continua aberto. Os valores abaixo vêm da configuração atual:</p><dl className="conflict-values">{conflictCurrentValues(draft, conflictView).map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl><button type="button" onClick={() => setConflictView(null)}>Fechar comparação</button></section>}
    {globalSettingsView && globalSettingsEtag && <GitHubSetupPanel
      settings={globalSettingsView}
      settingsEtag={globalSettingsEtag}
      setup={githubSetup}
      selection={nativeSelection}
      disabled={saveState.status === 'saving' || githubSettingsPending}
      conditions={<GlobalConditions diagnostic={globalDiagnostic} section="github" />}
    />}
    {!projectId && <section className="card form-section settings-operation"><div className="panel-title"><span className="eyebrow">Ambiente local</span><h2>Pasta e perfis</h2><p>Local dos projetos e papéis disponíveis para novas execuções.</p></div><div className="form-grid">
      <ProjectsFolderField
        persistedValue={settings?.projects_root ?? null}
        value={draft.global.projects_root}
        capability={load.view.selection_capabilities.projects_root}
        selection={nativeSelection}
        onChange={(value) => updateGlobal('projects_root', value)}
        onRevalidate={projectId === null ? () => void save(true) : null}
        saveError={projectsRootSaveError}
        disabled={saveState.status === 'saving' || githubSettingsPending}
      />
      <div className="field-full"><GlobalConditions diagnostic={globalDiagnostic} section="folder" /></div>
      <div className="field-full settings-profiles"><div className="settings-section-heading"><h3>Perfis de execução</h3><a href="#principal/perfis">Gerenciar Perfis</a></div><dl className="settings-profile-counts"><div><dt>Implementador</dt><dd>{load.view.profile_counts.implementer}</dd></div><div><dt>Revisor</dt><dd>{load.view.profile_counts.reviewer}</dd></div></dl><GlobalConditions diagnostic={globalDiagnostic} section="profiles" /></div>
      <div className="field-full"><GlobalConditions diagnostic={globalDiagnostic} section="configuration" /><GlobalVerification diagnostic={globalDiagnostic} check="configuration" /></div>
    </div></section>}
    {!projectId && <section className="card form-section settings-execution"><div className="panel-title"><span className="eyebrow">Execução</span><h2>Automação e acompanhamento</h2><p>Padrões compartilhados pelas próximas execuções.</p></div>
      <Checkbox label="Automação global habilitada" checked={draft.global.automation_enabled} onChange={(value) => updateGlobal('automation_enabled', value)} />
      <details className="settings-disclosure" open={Object.keys(timeFieldErrors).length > 0}><summary>Tempos e prazo das perguntas</summary><div className="form-grid">
      <MinutesField id="polling-interval-minutes" label="Intervalo de consulta" value={draft.global.time_defaults.polling_interval_ms} onChange={(value) => updateGlobal('time_defaults', { ...draft.global.time_defaults, polling_interval_ms: value })} onValidityChange={(message) => updateTimeFieldValidity('polling_interval_ms', message)} />
      <MinutesField id="passage-active-time-minutes" label="Tempo ativo por passagem" value={draft.global.time_defaults.passage_active_time_ms} onChange={(value) => updateGlobal('time_defaults', { ...draft.global.time_defaults, passage_active_time_ms: value })} onValidityChange={(message) => updateTimeFieldValidity('passage_active_time_ms', message)} />
      <ConfiguredLimitField label="Definir prazo para perguntas" value={draft.global.time_defaults.question_ttl} onValidityChange={(message) => updateTimeFieldValidity('question_ttl', message)} onChange={(value) => updateGlobal('time_defaults', { ...draft.global.time_defaults, question_ttl: value })} />
    </div></details></section>}

    {!projectId && <section className="card form-section settings-integration" aria-labelledby="global-integration-heading"><div className="panel-title"><span className="eyebrow">Executor</span><h2 id="global-integration-heading">Integração Maestri/OMP</h2></div><GlobalConditions diagnostic={globalDiagnostic} section="integration" /><GlobalVerification diagnostic={globalDiagnostic} check="maestri_context" /></section>}

    {conflictView && conflictETagRef.current && <button type="button" onClick={() => {
      const etag = conflictETagRef.current;
      if (!etag || !draftRef.current) return;
      const next = rebaseDraft(draftFromView(conflictView), draftRef.current);
      draftRef.current = next; setDraft(next); persistEditedFields(draftScope, next);
      setLoad({ status: 'ready', identity, view: conflictView, etag });
      setConflictView(null); setSaveState({ status: 'idle' });
    }}>Aplicar minha edição sobre a revisão consultada</button>}
    {recoveryMessage && <p role="status">{recoveryMessage}</p>}
    {uncertainId && <section className="notice"><b>Gravação ainda não confirmada</b><p>O rascunho permanece somente nesta sessão. Consulte a operação original; o comando não será repetido automaticamente.</p><button type="button" onClick={() => void recoverSave()}>Consultar resultado</button>{canResend && <button type="button" onClick={() => void recoverSave(true)}>Reapresentar a mesma operação</button>}</section>}
    {projectId && configurationLock && <div className="notice" role="status"><b>Configuração disponível somente para consulta</b><p>Este projeto tem uma tentativa ou publicação em andamento. Aguarde a conclusão ou cancele a tentativa e aguarde a confirmação da parada para alterar as configurações.</p><a className="button-link" href={`#principal/tentativas?projectId=${encodeURIComponent(projectId)}&attemptId=${encodeURIComponent(configurationLock.attempt_id)}&dialog=detail`}>Ver tentativa</a></div>}
    {projectId && draft.project && <section className="card form-section"><div className="panel-title"><span className="eyebrow">Projeto selecionado</span><h2>{projectName}</h2><p className="muted">As alterações serão usadas nas próximas preparações deste projeto.</p></div>
      <fieldset disabled={Boolean(configurationLock)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} aria-label="Configuração do projeto">
      <div className="configuration-guidance" role="note" aria-label="Dados necessários e controles opcionais">
        <div><h3>Para preparar uma issue</h3><p>Confirme o repositório GitHub, a branch-base, um perfil de cada papel e o quadro com seu mapeamento de Status. A issue precisa estar vinculada ao quadro para iniciar em qualquer modo, inclusive no início manual.</p></div>
        <div><h3>Controles opcionais</h3><p>Checks, orientações e limite de correções podem permanecer nos valores atuais. O modo de entrega parte do padrão configurado.</p></div>
      </div>
      <div className="form-grid">
        <SelectField label="Tipo da origem" value={draft.project.source.kind} onChange={(value) => updateProject((current) => ({ ...current, source: { kind: value as 'local' | 'github', location: current.source.location } }))} options={[{ value: 'local', label: 'Local' }, { value: 'github', label: 'GitHub' }]} />
        <TextField label="Localização da origem" value={draft.project.source.location} onChange={(value) => updateProject((current) => ({ ...current, source: { kind: current.source.kind, location: value } }))} />
        <TextField label="Branch-base" value={draft.project.base_branch} onChange={(value) => updateProject((current) => ({ ...current, base_branch: value }))} />
        <ProjectConditions diagnostic={projectDiagnostic} section="origin" projectId={projectId} />
        <SelectField label="Perfil implementador" value={implementerProfileAvailable ? draft.project.implementer_profile_id ?? '' : ''} onChange={(value) => updateProject((current) => ({ ...current, implementer_profile_id: value || null }))} options={implementerProfiles.map((profile) => ({ value: profile.id ?? '', label: profile.name || profile.id || 'Perfil sem nome' }))} />
        <SelectField label="Perfil revisor" value={reviewerProfileAvailable ? draft.project.reviewer_profile_id ?? '' : ''} onChange={(value) => updateProject((current) => ({ ...current, reviewer_profile_id: value || null }))} options={reviewerProfiles.map((profile) => ({ value: profile.id ?? '', label: profile.name || profile.id || 'Perfil sem nome' }))} />
        <ProjectConditions diagnostic={projectDiagnostic} section="profiles" projectId={projectId} />
        <NumberField label="Limite de correções" value={draft.project.correction_limit} min={0} max={5} onChange={(value) => updateProject((current) => ({ ...current, correction_limit: Math.max(0, Math.min(5, value)) }))} />
        <SelectField label="Modo de entrega padrão" value={draft.project.default_delivery_mode} onChange={(value) => updateProject((current) => ({ ...current, default_delivery_mode: value as ProjectConfiguration['default_delivery_mode'] }))} options={[{ value: 'icr', label: 'ICR' }, { value: 'commit', label: 'Commit' }, { value: 'pr', label: 'Pull request' }]} />
        <Checkbox label="Automação deste projeto habilitada" checked={draft.project.automation_enabled} onChange={(value) => updateProject((current) => ({ ...current, automation_enabled: value }))} />
        {draft.project.automation_enabled && !draft.global.automation_enabled && <p className="notice" role="status">Automação deste projeto habilitada. Fila global pausada. <a href="#principal/fila">Abrir fila global para habilitar novos inícios</a>.</p>}
        <SelectField label="Ordem de prioridade" value={draft.project.queue_order.priority_direction} onChange={(value) => updateProject((current) => ({ ...current, queue_order: { ...current.queue_order, priority_direction: value as 'asc' | 'desc' } }))} options={[{ value: 'asc', label: 'Crescente' }, { value: 'desc', label: 'Decrescente' }]} />
        <TextField label="Campo de prioridade (ID)" value={draft.project.queue_order.priority_field_id ?? ''} onChange={(value) => updateProject((current) => ({ ...current, queue_order: { ...current.queue_order, priority_field_id: value || null } }))} />
        <Checkbox label="Usar posição do quadro" checked={draft.project.queue_order.use_board_position} onChange={(value) => updateProject((current) => ({ ...current, queue_order: { ...current.queue_order, use_board_position: value } }))} />
        <div className="form-field field-full"><label htmlFor="project-guidance">Orientações do projeto</label><textarea id="project-guidance" value={draft.project.guidance} aria-describedby="project-guidance-help" onChange={(event) => { const guidance = event.currentTarget.value; updateProject((current) => ({ ...current, guidance })); }} /><FieldHelp id="project-guidance-help" label="Orientações do projeto" /></div>
      </div>
      {(hasUnavailableProjectProfile || implementerProfiles.length === 0 || reviewerProfiles.length === 0) && <div className="notice field-full" role={hasUnavailableProjectProfile ? 'alert' : 'status'}>
        <p>{hasUnavailableProjectProfile
          ? 'Um perfil salvo não está mais disponível para o papel deste projeto. Escolha um perfil vivo do papel correspondente ou limpe a seleção antes de salvar.'
          : `Perfis disponíveis: ${implementerProfiles.length === 0 ? 'nenhum Implementador' : ''}${implementerProfiles.length === 0 && reviewerProfiles.length === 0 ? ' e ' : ''}${reviewerProfiles.length === 0 ? 'nenhum Revisor' : ''}.`}</p>
        <a className="button-link" href="#principal/perfis">Abrir Perfis Globais</a>
      </div>}
      <ProjectMappingEditor configuration={draft.project} options={currentOptions} optionsError={currentOptionsError} onChange={updateProject} onLoadMore={() => void loadMoreOptions()} />
      <ProjectConditions diagnostic={projectDiagnostic} section="mapping" projectId={projectId} />
      <div className="checks-editor"><div className="line panel-title"><div><span className="eyebrow">Validação</span><h3>Checks</h3></div><button type="button" onClick={() => updateProject((current) => ({ ...current, checks: [...current.checks, { id: crypto.randomUUID(), command: '', cwd_relative: '.' }] }))} disabled={draft.project.checks.length >= 50}>Adicionar check</button></div>
        {draft.project.checks.map((check, index) => <fieldset className="check-card" key={check.id}><legend>Check {index + 1}</legend><div className="form-grid"><TextField label={`Comando do check ${index + 1}`} value={check.command} onChange={(value) => updateProject((current) => ({ ...current, checks: current.checks.map((item) => item.id === check.id ? { ...item, command: value } : item) }))} /><TextField label={`cwd relativo do check ${index + 1}`} value={check.cwd_relative} onChange={(value) => updateProject((current) => ({ ...current, checks: current.checks.map((item) => item.id === check.id ? { ...item, cwd_relative: value } : item) }))} help="Deve permanecer relativo ao ambiente da tentativa." /><NumberField label={`Timeout do check ${index + 1}`} value={check.timeout_ms ?? 60000} min={1} onChange={(value) => updateProject((current) => ({ ...current, checks: current.checks.map((item) => item.id === check.id ? { ...item, timeout_ms: value } : item) }))} unit="ms" /></div><button type="button" className="danger-button" onClick={() => updateProject((current) => ({ ...current, checks: current.checks.filter((item) => item.id !== check.id) }))}>Remover check</button></fieldset>)}
      </div>
      {draft.project.source.kind === 'local' && <div className="notice"><b>Origem local</b><p>Sem remoto, o projeto ainda pode ser consultado e configurado. Só o histórico commitado entra em uma execução; alterações não commitadas ficam de fora. Os pré-requisitos serão verificados pelo controlador.</p></div>}
      </fieldset>
      <ProjectConditions diagnostic={projectDiagnostic} section="global" projectId={projectId} />
      <ProjectConditions diagnostic={projectDiagnostic} section="configuration" projectId={projectId} />
      <ProjectConditions diagnostic={projectDiagnostic} section="issue" projectId={projectId} />
      <ProjectConditions diagnostic={projectDiagnostic} section="information" projectId={projectId} />
      <ProjectVerification diagnostic={projectDiagnostic} />
    </section>}
    {projectId && isConfigurationView(load.view) && <section className="card project-danger-zone"><div><h3>Exclusão do projeto</h3><p>Remova o cadastro e os dados locais após conferir o que será perdido. Os recursos do GitHub serão preservados.</p></div><ProjectDeletionAction key={`${projectId}:${accountId ?? ''}`} projectId={projectId} projectRevision={load.view.configuration.revision}
      installationId={load.view.settings.installation_id} accountId={accountId} hasUnsavedChanges={draft.dirty.length > 0}
      pollingIntervalMs={load.view.settings.time_defaults.polling_interval_ms} onProjectNameChange={setProjectName} /></section>}

    <section className="card form-actions-card dialog-actions"><div className="save-feedback" aria-live="polite">
      {!projectId && (saveState.status === 'idle' || saveState.status === 'saved') && <span className="muted">{same(draft.global, draft.baselineGlobal) ? 'Nenhuma alteração pendente.' : 'Há alterações não salvas.'}</span>}
      {saveState.status === 'saving' && <span role="status">Salvando alterações…</span>}{saveState.status === 'saved' && <><span className="pill">{saveState.message}</span></>}{saveState.status === 'error' && <><span className="error" role="alert">Erro: {saveState.message}</span></>}{saveState.status === 'conflict' && <><span className="conflict-message" role="alert">Conflito: {saveState.message}</span></>}{saveState.status === 'conflict' && !conflictView && <button type="button" onClick={() => void retryConflictRead()}>Consultar dados atuais</button>}{githubSettingsPending && <span role="status">Consulte ou recupere a operação GitHub original antes de salvar outras alterações.</span>}{Object.entries(timeFieldErrors).map(([field, message]) => <span className="error" role="alert" key={field}>{message}</span>)}</div><button type="button" className="primary" disabled={Boolean(configurationLock) || deletionRestricted || saveState.status === 'saving' || githubSettingsPending || Object.keys(timeFieldErrors).length > 0} onClick={() => void save()}>Salvar configuração</button></section>


  </div>;
}

type LimitValue = { state: 'not_configured' } | { state: 'configured'; value: number; unit: string };
function ConfiguredLimitField({ label, value, onChange, onValidityChange }: { label: string; value: LimitValue; onChange: (value: LimitValue) => void; onValidityChange: (message: string | null) => void }) {
  const configured = value.state === 'configured';
  return <div className="limit-field"><Checkbox label={label} checked={configured} onChange={(checked) => { onValidityChange(null); onChange(checked ? { state: 'configured', value: 0, unit: 'ms' } : { state: 'not_configured' }); }} />{configured && <div className="row"><MinutesField id="question-ttl-minutes" label="Duração" value={value.value} allowZero maximumMilliseconds={Number.MAX_SAFE_INTEGER} onValidityChange={onValidityChange} onChange={(next) => onChange({ ...value, value: next, unit: 'ms' })} /></div>}</div>;
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  const id = `field-${label.toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, '-')}`;
  const helpId = `${id}-help`;
  return <div className="form-check-field"><label className="check form-check" htmlFor={id}><input id={id} type="checkbox" checked={checked} aria-describedby={helpId} onChange={(event) => onChange(event.currentTarget.checked)} />{label}</label><FieldHelp id={helpId} label={label} /></div>;
}

function ProjectMappingEditor({ configuration, options, optionsError, onChange, onLoadMore }: {
  configuration: ProjectConfiguration; options: ConfigurationOptions | null; optionsError: string | null; onChange: (update: (current: ProjectConfiguration) => ProjectConfiguration) => void; onLoadMore: () => void;
}) {
  const mapping = configuration.github_project;
  const chosenProject = mapping?.id ?? '';
  const chosenField = mapping?.status_field_id ?? '';
  const selectedProject = options?.projects.items.find((project) => project.id === chosenProject);
  const staleProject = Boolean(chosenProject && !selectedProject);
  const selectedField = options?.status_fields.find((field) => field.id === chosenField);
  const staleField = Boolean(chosenField && !selectedField);
  const optionNames = useMemo(() => new Map((selectedField?.options ?? []).map((option) => [option.id, option.name])), [selectedField]);
  const statusRoles = ['ready', 'in_progress', 'in_review', 'delivered'] as const;

  function updateMapping(next: NonNullable<ProjectConfiguration['github_project']> | null): void { onChange((current) => ({ ...current, github_project: next })); }
  return <fieldset className="mapping-editor"><legend>Mapeamento GitHub Project e Status</legend>
    <p className="muted">Escolha o quadro pelo nome. Ao trocar o quadro, selecione novamente o campo e os quatro valores de Status.</p>
    <div className="form-grid">
      <SelectField label="GitHub Project" value={chosenProject} onChange={(id) => {
        if (!id) { updateMapping(null); return; }
        const project = options?.projects.items.find((item) => item.id === id);
        updateMapping({ id, owner_id: project?.owner.id ?? '', status_field_id: '', status_option_ids: { ready: '', in_progress: '', in_review: '', delivered: '' } });
      }} options={(options?.projects.items ?? []).map((project) => ({ value: project.id, label: `${project.title} · ${project.owner.login}${project.closed ? ' · encerrado' : ''}` }))} disabled={options?.completeness === 'unavailable'} />
      {staleProject && <div className="notice field-full"><b>Project salvo não aparece nas opções atuais</b><p>O quadro pode estar inacessível ou a consulta estar incompleta. Atualize as opções e escolha novamente se necessário.</p></div>}
      {mapping && <><div className="field-full"></div>
        <SelectField label="Campo Status" value={chosenField} onChange={(id) => updateMapping({ ...mapping, status_field_id: id, status_option_ids: { ready: '', in_progress: '', in_review: '', delivered: '' } })} options={(options?.status_fields ?? []).map((field) => ({ value: field.id, label: field.name }))} disabled={!chosenProject || !options?.status_fields.length} />
        {staleField && <div className="notice field-full"><b>Campo Status salvo não aparece nas opções atuais</b><p>Atualize as opções e selecione o campo consultado antes de salvar.</p></div>}
        {statusRoles.map((role) => {
          const id = mapping.status_option_ids[role];
          const roleLabel = ({ ready: 'Ready', in_progress: 'Em andamento', in_review: 'Em revisão', delivered: 'Entregue' } as const)[role];
          return <Fragment key={role}><SelectField label={`Status ${roleLabel}`} value={id && optionNames.has(id) ? id : ''} onChange={(optionId) => updateMapping({ ...mapping, status_option_ids: { ...mapping.status_option_ids, [role]: optionId } })} options={(selectedField?.options ?? []).map((option) => ({ value: option.id, label: option.name }))} disabled={!selectedField} {...(id && !optionNames.has(id) ? { help: 'O valor salvo não aparece nas opções atuais. Atualize o catálogo e escolha o valor correspondente.' } : {})} /></Fragment>;
        })}
      </>}
    </div>
    {optionsError && <div className="read-state" role="alert"><b>Não foi possível atualizar as opções do quadro</b><p>{optionsError}</p><p>Próxima ação: tente carregar as opções novamente antes de alterar o mapeamento.</p></div>}
    {options && options.completeness !== 'complete' && <div className="notice"><b>{options.completeness === 'partial' ? 'Opções incompletas' : 'Consulta do quadro indisponível'}</b>{options.diagnostics.length ? options.diagnostics.map((item, index) => <OperatorDiagnosticCard key={`${item.code}-${index}`} code={item.code} state="unavailable" cause={item.message} recovery={item.recovery} />) : <p>As opções atuais não foram confirmadas.</p>}{options.retry_at_ms !== null && <small>Nova consulta permitida após {new Date(options.retry_at_ms).toLocaleString('pt-BR')}</small>}</div>}
    {options?.projects.has_more && <button type="button" onClick={onLoadMore}>Carregar mais Projects</button>}
  </fieldset>;
}
