import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type {
  ConfigurationOptions, ConfigurationView, ExecutionProfile, GlobalConfiguration, ProjectConfiguration,
  ProjectDetail, ProjectRegistration, SettingsView, StoredExecutionProfile,
} from '#contracts';
import { HttpError, requestJsonWithMetadata } from '../../api/http.js';
import { clearDraft, getDraft, setDraft as persistDraft, type DraftValue } from '../../app/drafts.js';
import { useConfiguration, type EditableConfigurationView } from './useConfiguration.js';
import { createSaveLifecycle, type SaveOperation } from './save-lifecycle.js';

type EditableView = EditableConfigurationView;
type EditorDraft = {
  global: GlobalConfiguration; profiles: ExecutionProfile[]; project: ProjectConfiguration | null; dirty: string[];
  baselineGlobal: GlobalConfiguration; baselineProfiles: ExecutionProfile[]; baselineProject: ProjectConfiguration | null;
  pendingCommand?: { signature: string; id: string };
};
type PersistedEditorDraft = {
  dirty: string[];
  values: Record<string, DraftValue>;
  profileEdits?: {
    added: ExecutionProfile[];
    removedIds: string[];
    changed: { id: string; fields: Partial<ExecutionProfile> }[];
  };
  pendingCommand?: { signature: string; id: string };
};
type Receipt = { revision?: number; eventCursor?: string };
type SavedSettingsView = SettingsView & { operationId: string; receipt: Receipt };
type SavedConfigurationView = ConfigurationView & { operationId: string; receipt: Receipt };
type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'saved'; operationId: string; message: string } | { status: 'error'; message: string; requestId: string | null } | { status: 'conflict'; message: string; requestId: string | null };

const editorKey = 'project-configuration';
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const isConfigurationView = (view: EditableView): view is ConfigurationView => 'configuration' in view;
const editableProfile = (profile: StoredExecutionProfile): ExecutionProfile => ({
  id: profile.id, name: profile.name, executor: profile.executor, provider: profile.provider, model: profile.model, effort: profile.effort, guidance: profile.guidance,
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
const profileKey = (profile: ExecutionProfile): string => JSON.stringify([
  profile.name, profile.executor, profile.provider, profile.model, profile.effort, profile.guidance,
]);

function rebaseDraft(latest: EditorDraft, saved: EditorDraft, submitted?: EditorDraft): EditorDraft {
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
  if (saved.dirty.includes('profiles')) {
    const profileMap = new Map(merged.profiles.flatMap((profile) => profile.id ? [[profile.id, profile] as const] : []));
    for (const previous of saved.baselineProfiles) {
      const edited = saved.profiles.find((profile) => profile.id === previous.id);
      if (!edited) { profileMap.delete(previous.id ?? ''); continue; }
      const current = profileMap.get(previous.id ?? '');
      if (!current) continue;
      const next = { ...current };
      for (const key of ['name', 'executor', 'provider', 'model', 'effort', 'guidance'] as const) {
        if (!same(previous[key], edited[key])) Object.assign(next, { [key]: edited[key] });
      }
      profileMap.set(previous.id ?? '', next);
    }
    const confirmedAdds = latest.profiles.filter((profile) => profile.id && !saved.baselineProfiles.some((previous) => previous.id === profile.id));
    const submittedAdds = submitted?.profiles.filter((profile) => !profile.id || !submitted.baselineProfiles.some((previous) => previous.id === profile.id)) ?? [];
    const confirmedBySubmittedIndex = new Map<number, ExecutionProfile>();
    const unusedConfirmed = new Set(confirmedAdds);
    for (let index = 0; index < submittedAdds.length; index += 1) {
      const submittedProfile = submittedAdds[index];
      if (!submittedProfile) continue;
      const confirmed = [...unusedConfirmed].find((profile) => profileKey(profile) === profileKey(submittedProfile));
      if (confirmed) {
        confirmedBySubmittedIndex.set(index, confirmed);
        unusedConfirmed.delete(confirmed);
      }
    }
    const usedSubmitted = new Set<number>();
    const added = saved.profiles.flatMap((profile) => {
      if (profile.id) return [profile];
      let submittedIndex = submittedAdds.findIndex((candidate, index) => !usedSubmitted.has(index) && profileKey(candidate) === profileKey(profile));
      if (submittedIndex < 0) submittedIndex = submittedAdds.findIndex((_, index) => !usedSubmitted.has(index));
      if (submittedIndex < 0) return [profile];
      usedSubmitted.add(submittedIndex);
      const confirmed = confirmedBySubmittedIndex.get(submittedIndex);
      if (!confirmed?.id) return [profile];
      profileMap.set(confirmed.id, { ...confirmed, ...profile, id: confirmed.id });
      return [];
    });
    merged.profiles = [...profileMap.values(), ...added];
  }
  merged.baselineGlobal = structuredClone(latest.baselineGlobal);
  merged.baselineProfiles = structuredClone(latest.profiles);
  merged.baselineProject = latest.project ? structuredClone(latest.project) : null;
  merged.dirty = [...saved.dirty];
  return merged;
}

function persistEditedFields(identity: string, draft: EditorDraft): void {
  const dirty = [
    ...changedPaths('global', draft.baselineGlobal, draft.global).filter((path) => path !== 'global.profiles' && !path.startsWith('global.profiles.')),
    ...(draft.project && draft.baselineProject ? changedPaths('project', draft.baselineProject, draft.project) : []),
    ...(!same(draft.baselineProfiles, draft.profiles) ? ['profiles'] : []),
  ];
  const values: Record<string, DraftValue> = {};
  for (const path of dirty) {
    if (path === 'profiles') continue;
    const [root, ...parts] = path.split('.');
    const source = root === 'global' ? draft.global : root === 'project' ? draft.project : null;
    if (source) values[path] = readPath(source as unknown as Record<string, unknown>, parts) as DraftValue;
  }
  const before = new Map(draft.baselineProfiles.flatMap((profile) => profile.id ? [[profile.id, profile] as const] : []));
  const after = new Map(draft.profiles.flatMap((profile) => profile.id ? [[profile.id, profile] as const] : []));
  const profileEdits = dirty.includes('profiles') ? {
    added: draft.profiles.filter((profile) => !profile.id || !before.has(profile.id)),
    removedIds: [...before.keys()].filter((id) => !after.has(id)),
    changed: draft.profiles.flatMap((profile) => {
      if (!profile.id) return [];
      const previous = before.get(profile.id);
      if (!previous) return [];
      const fields: Partial<ExecutionProfile> = {};
      for (const key of ['name', 'executor', 'provider', 'model', 'effort', 'guidance'] as const) {
        if (!same(previous[key], profile[key])) Object.assign(fields, { [key]: profile[key] });
      }
      return Object.keys(fields).length ? [{ id: profile.id, fields }] : [];
    }),
  } : undefined;
  if (dirty.length === 0 && !draft.pendingCommand) {
    clearDraft(identity, editorKey);
    return;
  }
  const saved: PersistedEditorDraft = {
    dirty, values,
    ...(profileEdits ? { profileEdits } : {}),
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
  const edits = saved.profileEdits;
  if (edits) {
    const profiles = new Map(restored.profiles.flatMap((profile) => profile.id ? [[profile.id, profile] as const] : []));
    for (const id of edits.removedIds) profiles.delete(id);
    for (const edit of edits.changed) {
      const current = profiles.get(edit.id);
      if (current) profiles.set(edit.id, { ...current, ...edit.fields });
    }
    restored.profiles = [...profiles.values(), ...edits.added];
  }
  restored.dirty = [...saved.dirty];
  if (saved.pendingCommand) restored.pendingCommand = saved.pendingCommand;
  return restored;
}

function draftFromView(view: EditableView): EditorDraft {
  return {
    global: { ...view.settings, profiles: view.profiles }, profiles: view.profiles.map(editableProfile),
    project: isConfigurationView(view) ? view.configuration : null, dirty: [],
    baselineGlobal: { ...view.settings, profiles: view.profiles }, baselineProfiles: view.profiles.map(editableProfile),
    baselineProject: isConfigurationView(view) ? view.configuration : null,
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
  if (draft.dirty.includes('profiles')) {
    const saved = new Map(draft.baselineProfiles.flatMap((profile) => profile.id ? [[profile.id, profile] as const] : []));
    const currentById = new Map(current.profiles.flatMap((profile) => profile.id ? [[profile.id, profile] as const] : []));
    for (const profile of draft.profiles) {
      if (!profile.id) {
        values.push({ label: `Perfil novo · ${profile.name || 'sem nome'}`, value: 'Ainda não existe na configuração atual' });
        continue;
      }
      const previous = saved.get(profile.id);
      const latest = currentById.get(profile.id);
      if (!latest) {
        values.push({ label: `Perfil ${previous?.name ?? profile.name}`, value: 'Removido na configuração atual' });
        continue;
      }
      for (const key of ['name', 'executor', 'provider', 'model', 'effort', 'guidance'] as const) {
        if (previous && !same(previous[key], profile[key])) values.push({ label: `Perfil ${latest.name} · ${key}`, value: format(latest[key]) });
      }
    }
    for (const previous of draft.baselineProfiles) {
      if (previous.id && !draft.profiles.some((profile) => profile.id === previous.id)) {
        values.push({ label: `Perfil ${previous.name}`, value: currentById.has(previous.id) ? 'Ainda existe na configuração atual' : 'Removido na configuração atual' });
      }
    }
  }
  return values;
}

function TextField({ label, value, onChange, type = 'text', help, error, required = false }: {
  label: string; value: string; onChange: (value: string) => void; type?: string; help?: string; error?: string | null; required?: boolean;
}) {
  const id = `field-${label.toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, '-')}`;
  return <label className="form-field" htmlFor={id}>{label}<input id={id} value={value} type={type} required={required} onChange={(event) => onChange(event.currentTarget.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined} />{error && <span id={`${id}-error`} className="error">{error}</span>}{help && !error && <small id={`${id}-help`} className="muted">{help}</small>}</label>;
}

function SelectField({ label, value, onChange, options, disabled = false, help, error }: {
  label: string; value: string; onChange: (value: string) => void; options: readonly { value: string; label: string }[]; disabled?: boolean; help?: string; error?: string | null;
}) {
  const id = `field-${label.toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, '-')}`;
  return <label className="form-field" htmlFor={id}>{label}<select id={id} value={value} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined} onChange={(event) => onChange(event.currentTarget.value)}><option value="">Selecione…</option>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>{error && <span id={`${id}-error`} className="error">{error}</span>}{help && !error && <small id={`${id}-help`} className="muted">{help}</small>}</label>;
}

function NumberField({ label, value, onChange, min, max, step = 1, unit }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; unit?: string;
}) {
  const id = `field-${label.toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, '-')}`;
  return <label className="form-field" htmlFor={id}>{label}<span className="input-with-unit"><input id={id} type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.currentTarget.value === '' ? 0 : Number(event.currentTarget.value))} />{unit && <small>{unit}</small>}</span></label>;
}

type RegistrationDraft = { name: string; kind: 'local' | 'github'; location: string; baseBranch: string; commandId: string | null };
const registrationDraftKey = 'project-registration';
export function ProjectRegistrationForm({ identity, onRegistered }: { identity: string; onRegistered: (projectId: string) => void }) {
  const [form, setForm] = useState<RegistrationDraft>(() => getDraft<RegistrationDraft>(identity, registrationDraftKey) ?? { name: '', kind: 'local', location: '', baseBranch: 'main', commandId: null });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(ProjectDetail & { operationId: string }) | null>(null);
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

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true); setFailure(null); setResult(null);
    const body: ProjectRegistration = { name: form.name.trim(), source: { kind: form.kind, location: form.location.trim() }, baseBranch: form.baseBranch.trim() };
    try {
      const stableId = form.commandId ?? crypto.randomUUID();
      updateForm({ commandId: stableId });
      const saved = await requestJsonWithMetadata<ProjectDetail & { operationId: string }>('/api/v1/projects', {
        method: 'POST', headers: { 'Idempotency-Key': stableId }, body: JSON.stringify(body),
      });
      setResult(saved.data);
      clearDraft(identity, registrationDraftKey);
    } catch (error: unknown) {
      const http = error instanceof HttpError ? error : null;
      setFailure({ message: http?.message ?? 'O cadastro não foi confirmado pelo controlador.', requestId: http?.requestId ?? null, fields: new Map(http?.fieldErrors.map((item) => [item.field, item.message]) ?? []) });
    } finally { setBusy(false); }
  }

  if (result) return <section className="project-form-success" aria-live="polite"><span className="pill">Cadastro confirmado</span><h3>{result.project.name}</h3><p>{result.project.source.kind === 'local' ? 'Origem local registrada. Somente o histórico commitado entra em uma execução; alterações não commitadas ficam de fora.' : 'Origem GitHub registrada.'}</p>{result.prerequisites.length > 0 && <div className="notice"><b>Pré-requisitos de execução</b><ul>{result.prerequisites.map((item) => <li key={item.code}>{item.message}</li>)}</ul></div>}<p className="mono muted">Operação {result.operationId}</p><button type="button" className="primary" onClick={() => onRegistered(result.project.id)}>Abrir configuração do projeto</button></section>;

  return <form className="feature-form" onSubmit={(event) => void submit(event)} noValidate>
    <p className="muted">Cadastre uma origem existente para consultar e configurar. O cadastro não clona nem inicia trabalho.</p>
    {failure && <div className="read-state" role="alert"><b>Cadastro não confirmado</b><p>{failure.message}</p>{failure.requestId && <small className="mono">Solicitação {failure.requestId}</small>}</div>}
    <div className="form-grid">
      <TextField label="Nome do projeto" value={form.name} onChange={(value) => updateForm({ name: value, commandId: null })} required error={fieldMessage('name')} />
      <SelectField label="Tipo de origem" value={form.kind} onChange={(value) => updateForm({ kind: value as 'local' | 'github', commandId: null })} options={[{ value: 'local', label: 'Pasta local existente' }, { value: 'github', label: 'Repositório GitHub' }]} error={fieldMessage('source.kind')} />
      <TextField label={locationLabel} value={form.location} onChange={(value) => updateForm({ location: value, commandId: null })} required error={fieldMessage('source.location')} help={form.kind === 'local' ? 'A pasta permanece intacta; não é necessário ter remoto configurado.' : 'Use uma URL HTTPS ou SSH sem credenciais embutidas.'} />
      <TextField label="Branch-base" value={form.baseBranch} onChange={(value) => updateForm({ baseBranch: value, commandId: null })} required error={fieldMessage('baseBranch')} />
    </div>
    {form.kind === 'local' && <div className="notice"><b>Origem local</b><p>O projeto continua consultável mesmo sem remoto. Só o histórico commitado entra em uma execução; alterações não commitadas ficam de fora. Os pré-requisitos serão identificados antes de qualquer execução.</p></div>}
    <div className="form-actions"><button type="submit" className="primary" disabled={busy || !form.name.trim() || !form.location.trim() || !form.baseBranch.trim()}>{busy ? 'Cadastrando…' : 'Cadastrar origem'}</button></div>
  </form>;
}

export function ProjectConfigurationForm({ projectId, onSaveIssue }: { projectId: string | null; onSaveIssue: (issue: { identity: string; message: string; requestId: string | null; kind: 'error' | 'conflict' } | null, identity: string) => void }) {
  const identity = projectId ?? 'global-settings';
  const identityRef = useRef(identity);
  const saveLifecycleRef = useRef(createSaveLifecycle(identity));
  identityRef.current = identity;
  const { load, setLoad, retry: retryConfiguration, refreshError, clearRefreshError } = useConfiguration(projectId);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const draftRef = useRef<EditorDraft | null>(null);
  const [options, setOptions] = useState<{ key: string; data: ConfigurationOptions } | null>(null);
  const [optionsError, setOptionsError] = useState<{ key: string; message: string } | null>(null);
  const optionsKeyRef = useRef('');
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [conflictView, setConflictView] = useState<EditableView | null>(null);

  useEffect(() => {
    const lifecycle = saveLifecycleRef.current;
    lifecycle.activate();
    return () => lifecycle.dispose();
  }, []);

  useLayoutEffect(() => {
    saveLifecycleRef.current.updateIdentity(identity);
  }, [identity]);

  useEffect(() => {
    setOptions(null); setOptionsError(null); setSaveState({ status: 'idle' }); setConflictView(null);
  }, [identity]);

  useEffect(() => {
    if (load.status !== 'ready' || load.identity !== identity) return;
    const data = load.view;
    const defaults = draftFromView(data);
    const savedDraft = getDraft<PersistedEditorDraft>(identity, editorKey);
    const nextDraft = savedDraft ? restoreEditedFields(defaults, savedDraft) : defaults;
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    if (savedDraft) persistEditedFields(identity, nextDraft);
  }, [identity, load]);

  const selectedProjectId = draft?.project?.githubProject?.id ?? '';
  const selectedStatusField = draft?.project?.githubProject?.statusFieldId ?? '';
  const selectedOwnerId = draft?.project?.githubProject?.ownerId ?? '';
  const optionsKey = JSON.stringify([projectId, selectedProjectId, selectedOwnerId, selectedStatusField]);
  optionsKeyRef.current = optionsKey;
  const currentOptions = options?.key === optionsKey ? options.data : null;
  const currentOptionsError = optionsError?.key === optionsKey ? optionsError.message : null;
  useEffect(() => {
    if (!projectId || !draft?.project) return;
    let active = true;
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (selectedProjectId) params.set('githubProjectId', selectedProjectId);
    if (selectedOwnerId) params.set('ownerId', selectedOwnerId);
    if (selectedStatusField) params.set('statusFieldId', selectedStatusField);
    requestJsonWithMetadata<ConfigurationOptions>(`/api/v1/projects/${encodeURIComponent(projectId)}/configuration-options${params.size ? `?${params.toString()}` : ''}`, { signal: controller.signal }).then(({ data }) => {
      if (active) { setOptions({ key: optionsKey, data }); setOptionsError(null); }
    }).catch((error: unknown) => {
      if (active && !(error instanceof DOMException && error.name === 'AbortError')) setOptionsError({ key: optionsKey, message: error instanceof Error ? error.message : 'Opções de conta/Project indisponíveis.' });
    });
    return () => { active = false; controller.abort(); };
  }, [projectId, selectedOwnerId, selectedProjectId, selectedStatusField, optionsKey]);

  const profiles = draft?.profiles ?? [];
  const settings = load.status === 'ready' && load.identity === identity ? load.view.settings : null;
  const accountLabel = settings?.accountId ?? 'Conta indisponível';
  const hostLabel = settings?.designatedHost ?? 'Host não designado';

  function updateDraft(update: (current: EditorDraft) => EditorDraft): void {
    setDraft((current) => {
      if (!current) return current;
      const changed = update(current);
      const dirty = [...current.dirty];
      for (const path of changedPaths('global', current.global, changed.global)) if (!dirty.includes(path)) dirty.push(path);
      if (!same(current.profiles, changed.profiles) && !dirty.includes('profiles')) dirty.push('profiles');
      if (current.project && changed.project) for (const path of changedPaths('project', current.project, changed.project)) if (!dirty.includes(path)) dirty.push(path);
      const next = { ...changed, dirty };
      draftRef.current = next;
      persistEditedFields(identity, next);
      setSaveState((state) => state.status === 'saved' ? { status: 'idle' } : state);
      return next;
    });
  }

  function updateGlobal<K extends keyof GlobalConfiguration>(key: K, value: GlobalConfiguration[K]): void {
    updateDraft((current) => ({ ...current, global: { ...current.global, [key]: value } }));
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
    setLoad({ status: 'ready', identity: expectedIdentity, view: latest.data, etag: latest.etag });
    setConflictView(latest.data);
    const currentDraft = draftRef.current;
    if (currentDraft) {
      const defaults = draftFromView(latest.data);
      const nextDraft = rebaseDraft(defaults, currentDraft);
      draftRef.current = nextDraft;
      setDraft(nextDraft); persistEditedFields(expectedIdentity, nextDraft);
    }
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
    if (!projectId || !currentOptions?.projects.nextCursor) return;
    const expectedIdentity = identity;
    const expectedOptionsKey = optionsKey;
    const params = new URLSearchParams({ cursor: currentOptions.projects.nextCursor });
    if (selectedProjectId) params.set('githubProjectId', selectedProjectId);
    if (selectedOwnerId) params.set('ownerId', selectedOwnerId);
    if (selectedStatusField) params.set('statusFieldId', selectedStatusField);
    try {
      const { data } = await requestJsonWithMetadata<ConfigurationOptions>(`/api/v1/projects/${encodeURIComponent(projectId)}/configuration-options?${params.toString()}`);
      if (identityRef.current !== expectedIdentity || optionsKeyRef.current !== expectedOptionsKey) return;
      setOptions((current) => current?.key === expectedOptionsKey ? { key: expectedOptionsKey, data: { ...data, projects: { ...data.projects, items: [...current.data.projects.items, ...data.projects.items] } } } : current);
      setOptionsError(null);
    } catch (error: unknown) {
      if (identityRef.current !== expectedIdentity || optionsKeyRef.current !== expectedOptionsKey) return;
      setOptionsError({ key: expectedOptionsKey, message: error instanceof HttpError ? error.message : 'Não foi possível carregar a próxima página de Projects.' });
    }
  }

  async function save(): Promise<void> {
    if (load.status !== 'ready' || load.identity !== identity || !draft) return;
    const baseline = load.view;
    const baseGlobal: GlobalConfiguration = { ...baseline.settings, profiles: baseline.profiles };
    const globalChanges: Partial<GlobalConfiguration> = {};
    for (const key of ['designatedHost', 'projectsRoot', 'dataRoot', 'maestriSettings', 'automationEnabled', 'timeDefaults', 'costDefaults', 'artifactPolicy'] as const) {
      if (!same(baseGlobal[key], draft.global[key])) Object.assign(globalChanges, { [key]: draft.global[key] });
    }
    const profilesChanged = !same(baseline.profiles.map(editableProfile), draft.profiles);
    const projectChanges: Partial<ProjectConfiguration> = {};
    if (projectId && isConfigurationView(baseline) && draft.project) {
      for (const key of ['source', 'baseBranch', 'githubProject', 'implementerProfileId', 'reviewerProfileId', 'checks', 'correctionLimit', 'defaultDeliveryMode', 'automationEnabled', 'queueOrder', 'guidance'] as const) {
        if (!same(baseline.configuration[key], draft.project[key])) Object.assign(projectChanges, { [key]: draft.project[key] });
      }
    }
    const hasGlobalChanges = Object.keys(globalChanges).length > 0;
    const hasProjectChanges = Object.keys(projectChanges).length > 0;
    if (!hasGlobalChanges && !profilesChanged && !hasProjectChanges) { setSaveState({ status: 'idle' }); return; }

    setSaveState({ status: 'saving' });
    const payload = projectId
      ? { projectChanges, ...(hasGlobalChanges ? { globalChanges } : {}), ...(profilesChanged ? { profileChanges: draft.profiles } : {}) }
      : { changes: globalChanges, ...(profilesChanged ? { profileChanges: draft.profiles } : {}) };
    const submittedDraft = structuredClone(draft) as EditorDraft;
    const signature = JSON.stringify([load.etag, payload]);
    const pendingCommand = draft.pendingCommand?.signature === signature ? draft.pendingCommand : { signature, id: crypto.randomUUID() };
    const operationIdForRequest = pendingCommand.id;
    if (draft.pendingCommand !== pendingCommand) {
      const withPendingCommand = { ...draft, pendingCommand };
      setDraft(withPendingCommand); persistEditedFields(identity, withPendingCommand);
    }
    const operation = saveLifecycleRef.current.begin(identity);
    const expectedIdentity = operation.identity;
    const headers = { 'If-Match': load.etag, 'Idempotency-Key': operationIdForRequest };
    try {
    let saved: EditableView;
    let operationId = '';
    let receiptConfirmed = false;
      let etag: string | null;
      if (projectId) {
        const response = await requestJsonWithMetadata<SavedConfigurationView>(`/api/v1/projects/${encodeURIComponent(projectId)}/configuration`, {
          method: 'PUT', headers, body: JSON.stringify(payload),
        });
        saved = response.data; etag = response.etag; operationId = response.data.operationId; receiptConfirmed = Boolean(response.data.receipt);
      } else {
        const response = await requestJsonWithMetadata<SavedSettingsView>('/api/v1/settings', {
          method: 'PUT', headers, body: JSON.stringify(payload),
        });
        saved = response.data; etag = response.etag; operationId = response.data.operationId; receiptConfirmed = Boolean(response.data.receipt);
      }
      if (!etag || !receiptConfirmed) throw new Error('O commit não retornou ETag e recibo durável.');
      if (!saveLifecycleRef.current.isCurrent(identityRef.current, operation)) return;
      const defaults = draftFromView(saved);
      if (!defaults.project && draft.project) defaults.project = draft.project;
      const currentDraft = draftRef.current ?? draft;
      const nextDraft = rebaseDraft(defaults, currentDraft, submittedDraft);
      delete nextDraft.pendingCommand;
      draftRef.current = nextDraft;
      setDraft(nextDraft); persistEditedFields(expectedIdentity, nextDraft);
      setLoad({ status: 'ready', identity, view: saved, etag }); setConflictView(null);
      setSaveState({ status: 'saved', operationId, message: 'Salvo após confirmação do recibo de commit.' });
      onSaveIssue(null, expectedIdentity);
    } catch (error: unknown) {
      const http = error instanceof HttpError ? error : null;
      if (!saveLifecycleRef.current.isCurrent(identityRef.current, operation)) return;
      if (http?.status === 412) {
        let currentLoaded = false;
        try { await refreshCurrent(operation); currentLoaded = saveLifecycleRef.current.isCurrent(identityRef.current, operation); } catch { /* Keep the existing draft and report the original conflict. */ }
        if (!saveLifecycleRef.current.isCurrent(identityRef.current, operation)) return;
        const message = currentLoaded ? 'A configuração mudou desde a leitura. Seu rascunho foi preservado; os dados atuais e a revisão nova estão carregados separadamente.' : 'A configuração mudou desde a leitura. Seu rascunho foi preservado, mas a consulta dos dados atuais falhou; tente consultar novamente antes de salvar.';
        setSaveState({ status: 'conflict', message, requestId: http.requestId });
        onSaveIssue({ identity: expectedIdentity, message, requestId: http.requestId, kind: 'conflict' }, expectedIdentity);
      } else {
        const message = http?.message ?? (error instanceof Error ? error.message : 'A gravação não foi confirmada.');
        setSaveState({ status: 'error', message, requestId: http?.requestId ?? null });
        onSaveIssue({ identity: expectedIdentity, message, requestId: http?.requestId ?? null, kind: 'error' }, expectedIdentity);
      }
    }
  }

  if (load.status === 'loading' || load.identity !== identity) return <section className="card read-state" role="status"><p>Consultando configuração persistida…</p></section>;
  if (load.status === 'error') return <section className="card read-state" role="alert"><h2>Configuração indisponível</h2><p>{load.message}</p>{load.requestId && <p className="mono muted">Solicitação {load.requestId}</p>}<button type="button" onClick={retryConfiguration}>Tentar novamente</button></section>;
  if (!draft) return <section className="card read-state" role="status"><p>Preparando edição…</p></section>;

  return <div className="configuration-editor">
    {refreshError && <div className="notice" role="alert"><b>Atualização da configuração não confirmada</b><p>{refreshError.message} Os valores e rascunhos permanecem visíveis como leitura anterior.</p>{refreshError.requestId && <small className="mono">Solicitação {refreshError.requestId}</small>}<div className="row"><button type="button" onClick={retryConfiguration}>Tentar atualizar novamente</button><button type="button" onClick={clearRefreshError}>Dispensar aviso</button></div></div>}
    <div className="card editor-context"><div><span className="eyebrow">Contexto observado</span><p><b>Conta vinculada</b> · {accountLabel}</p><p><b>Host observado</b> · Indisponível nesta superfície</p><p><b>Host executor designado</b> · {hostLabel}</p><a href={projectId ? `#principal/registros?projectId=${encodeURIComponent(projectId)}` : '#principal/registros'}>Abrir registros e diagnóstico deste contexto</a></div><p className="muted">A conta vinculada é um ID persistido do controlador; conectividade do host não é fornecida por esta API. Nenhum campo de credencial ou Wire é solicitado.</p></div>
    {conflictView && <section className="notice conflict-current" aria-live="polite"><b>Dados atuais consultados em separado</b><p>Revisão global {conflictView.settings.revision}{'configuration' in conflictView ? ` · revisão do projeto ${conflictView.configuration.revision}` : ''}. Seu rascunho continua aberto. Os valores abaixo vêm da revisão atual:</p><dl className="conflict-values">{conflictCurrentValues(draft, conflictView).map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl><button type="button" onClick={() => setConflictView(null)}>Fechar comparação</button></section>}
    <section className="card form-section"><div className="panel-title"><span className="eyebrow">Host e operação</span><h2>Configuração global</h2></div><div className="form-grid">
      <TextField label="Host executor designado" value={draft.global.designatedHost ?? ''} onChange={(value) => updateGlobal('designatedHost', value || null)} help="Identificador persistido; a presença do valor não prova conectividade." />
      <TextField label="Raiz dos projetos" value={draft.global.projectsRoot ?? ''} onChange={(value) => updateGlobal('projectsRoot', value || null)} help="Diretório local validado pelo controlador ao salvar." />
      <TextField label="Diretório de dados da instalação" value={draft.global.dataRoot} onChange={(value) => updateGlobal('dataRoot', value)} help="Alterar este valor não move o banco que já está aberto." />
      <TextField label="Workspace Maestri ID" value={draft.global.maestriSettings.workspaceId ?? ''} onChange={(value) => updateGlobal('maestriSettings', { ...draft.global.maestriSettings, workspaceId: value || null })} help="Referência não sensível. Pareamento e credenciais ficam fora desta configuração." />
      <NumberField label="Intervalo de consulta" value={draft.global.timeDefaults.pollingIntervalMs} min={1} onChange={(value) => updateGlobal('timeDefaults', { ...draft.global.timeDefaults, pollingIntervalMs: value })} unit="ms" />
      <NumberField label="Tempo ativo por passagem" value={draft.global.timeDefaults.passageActiveTimeMs} min={1} onChange={(value) => updateGlobal('timeDefaults', { ...draft.global.timeDefaults, passageActiveTimeMs: value })} unit="ms" />
      <ConfiguredLimitField label="TTL de pergunta" value={draft.global.timeDefaults.questionTtl} defaultUnit="ms" onChange={(value) => updateGlobal('timeDefaults', { ...draft.global.timeDefaults, questionTtl: value })} />
      <ConfiguredLimitField label="Limite de custo" value={draft.global.costDefaults.limit} defaultUnit="USD" onChange={(value) => updateGlobal('costDefaults', { ...draft.global.costDefaults, limit: value })} />
      <Checkbox label="Automação global habilitada" checked={draft.global.automationEnabled} onChange={(value) => updateGlobal('automationEnabled', value)} />
      <p className="muted field-full">Política de artefatos: exclusão automática desativada pelo contrato. Os dados atuais permanecem nesta revisão até serem salvos.</p>
    </div></section>

    <section className="card form-section"><div className="panel-title line"><div><span className="eyebrow">Execução configurável</span><h2>Perfis</h2></div><button type="button" onClick={() => updateDraft((current) => ({ ...current, profiles: [...current.profiles, { name: '', executor: 'maestri-omp', provider: '', model: '', effort: '', guidance: '' }] }))} disabled={profiles.length >= 100}>Adicionar perfil</button></div>
      {profiles.length === 0 && <p className="empty">Nenhum perfil configurado.</p>}
      {profiles.map((profile, index) => <fieldset className="profile-card" key={profile.id ?? `new-${index}`}><legend>{profile.name || `Novo perfil ${index + 1}`}</legend>{profile.id && <small className="mono muted">ID {profile.id}</small>}<div className="form-grid">
        <TextField label={`Nome do perfil ${index + 1}`} value={profile.name} onChange={(value) => updateDraft((current) => ({ ...current, profiles: current.profiles.map((item, itemIndex) => itemIndex === index ? { ...item, name: value } : item) }))} />
        <SelectField label={`Executor do perfil ${index + 1}`} value={profile.executor} onChange={() => undefined} disabled help="Maestri / OMP é o executor da primeira entrega." options={[{ value: 'maestri-omp', label: 'Maestri / OMP' }]} />
        <TextField label={`Provider do perfil ${index + 1}`} value={profile.provider} onChange={(value) => updateDraft((current) => ({ ...current, profiles: current.profiles.map((item, itemIndex) => itemIndex === index ? { ...item, provider: value } : item) }))} />
        <TextField label={`Modelo do perfil ${index + 1}`} value={profile.model} onChange={(value) => updateDraft((current) => ({ ...current, profiles: current.profiles.map((item, itemIndex) => itemIndex === index ? { ...item, model: value } : item) }))} />
        <TextField label={`Esforço do perfil ${index + 1}`} value={profile.effort} onChange={(value) => updateDraft((current) => ({ ...current, profiles: current.profiles.map((item, itemIndex) => itemIndex === index ? { ...item, effort: value } : item) }))} />
        <label className="form-field field-full" htmlFor={`profile-guidance-${index}`}>Orientações do perfil<textarea id={`profile-guidance-${index}`} value={profile.guidance} onChange={(event) => updateDraft((current) => ({ ...current, profiles: current.profiles.map((item, itemIndex) => itemIndex === index ? { ...item, guidance: event.currentTarget.value } : item) }))} /></label>
      </div><button type="button" className="danger-button" onClick={() => updateDraft((current) => ({ ...current, profiles: current.profiles.filter((_, itemIndex) => itemIndex !== index) }))}>Remover perfil do conjunto</button></fieldset>)}
    </section>

    {projectId && draft.project && <section className="card form-section"><div className="panel-title"><span className="eyebrow">Projeto selecionado</span><h2>Configuração do projeto</h2></div>
      <div className="form-grid">
        <SelectField label="Tipo da origem" value={draft.project.source.kind} onChange={(value) => updateProject((current) => ({ ...current, source: { kind: value as 'local' | 'github', location: current.source.location } }))} options={[{ value: 'local', label: 'Local' }, { value: 'github', label: 'GitHub' }]} />
        <TextField label="Localização da origem" value={draft.project.source.location} onChange={(value) => updateProject((current) => ({ ...current, source: { kind: current.source.kind, location: value } }))} />
        <TextField label="Branch-base" value={draft.project.baseBranch} onChange={(value) => updateProject((current) => ({ ...current, baseBranch: value }))} />
        <SelectField label="Perfil implementador" value={draft.project.implementerProfileId ?? ''} onChange={(value) => updateProject((current) => ({ ...current, implementerProfileId: value || null }))} options={profiles.map((profile) => ({ value: profile.id ?? '', label: profile.name || profile.id || 'Perfil sem nome' }))} />
        <SelectField label="Perfil revisor" value={draft.project.reviewerProfileId ?? ''} onChange={(value) => updateProject((current) => ({ ...current, reviewerProfileId: value || null }))} options={profiles.map((profile) => ({ value: profile.id ?? '', label: profile.name || profile.id || 'Perfil sem nome' }))} />
        <NumberField label="Limite de correções" value={draft.project.correctionLimit} min={0} max={5} onChange={(value) => updateProject((current) => ({ ...current, correctionLimit: Math.max(0, Math.min(5, value)) }))} />
        <SelectField label="Modo de entrega padrão" value={draft.project.defaultDeliveryMode} onChange={(value) => updateProject((current) => ({ ...current, defaultDeliveryMode: value as ProjectConfiguration['defaultDeliveryMode'] }))} options={[{ value: 'icr', label: 'ICR' }, { value: 'commit', label: 'Commit' }, { value: 'pr', label: 'Pull request' }]} />
        <Checkbox label="Automação deste projeto habilitada" checked={draft.project.automationEnabled} onChange={(value) => updateProject((current) => ({ ...current, automationEnabled: value }))} />
        <SelectField label="Ordem de prioridade" value={draft.project.queueOrder.priorityDirection} onChange={(value) => updateProject((current) => ({ ...current, queueOrder: { ...current.queueOrder, priorityDirection: value as 'asc' | 'desc' } }))} options={[{ value: 'asc', label: 'Crescente' }, { value: 'desc', label: 'Decrescente' }]} />
        <TextField label="Campo de prioridade (ID)" value={draft.project.queueOrder.priorityFieldId ?? ''} onChange={(value) => updateProject((current) => ({ ...current, queueOrder: { ...current.queueOrder, priorityFieldId: value || null } }))} />
        <Checkbox label="Usar posição do quadro" checked={draft.project.queueOrder.useBoardPosition} onChange={(value) => updateProject((current) => ({ ...current, queueOrder: { ...current.queueOrder, useBoardPosition: value } }))} />
        <label className="form-field field-full" htmlFor="project-guidance">Orientações do projeto<textarea id="project-guidance" value={draft.project.guidance} onChange={(event) => updateProject((current) => ({ ...current, guidance: event.currentTarget.value }))} /></label>
      </div>
      <ProjectMappingEditor configuration={draft.project} options={currentOptions} optionsError={currentOptionsError} onChange={updateProject} onLoadMore={() => void loadMoreOptions()} />
      <div className="checks-editor"><div className="line panel-title"><div><span className="eyebrow">Validação</span><h3>Checks</h3></div><button type="button" onClick={() => updateProject((current) => ({ ...current, checks: [...current.checks, { id: crypto.randomUUID(), command: '', cwdRelative: '.' }] }))} disabled={draft.project.checks.length >= 50}>Adicionar check</button></div>
        {draft.project.checks.map((check, index) => <fieldset className="check-card" key={check.id}><legend>Check {index + 1}</legend><div className="form-grid"><TextField label={`Comando do check ${index + 1}`} value={check.command} onChange={(value) => updateProject((current) => ({ ...current, checks: current.checks.map((item) => item.id === check.id ? { ...item, command: value } : item) }))} /><TextField label={`cwd relativo do check ${index + 1}`} value={check.cwdRelative} onChange={(value) => updateProject((current) => ({ ...current, checks: current.checks.map((item) => item.id === check.id ? { ...item, cwdRelative: value } : item) }))} help="Deve permanecer relativo ao ambiente da tentativa." /><NumberField label={`Timeout do check ${index + 1}`} value={check.timeoutMs ?? 60000} min={1} onChange={(value) => updateProject((current) => ({ ...current, checks: current.checks.map((item) => item.id === check.id ? { ...item, timeoutMs: value } : item) }))} unit="ms" /></div><button type="button" className="danger-button" onClick={() => updateProject((current) => ({ ...current, checks: current.checks.filter((item) => item.id !== check.id) }))}>Remover check</button></fieldset>)}
      </div>
      {draft.project.source.kind === 'local' && <div className="notice"><b>Origem local</b><p>Sem remoto, o projeto ainda pode ser consultado e configurado. Só o histórico commitado entra em uma execução; alterações não commitadas ficam de fora. Os pré-requisitos serão verificados pelo controlador.</p></div>}
    </section>}

    <section className="card form-actions-card"><div className="save-feedback" aria-live="polite">{saveState.status === 'saving' && <span role="status">Salvando alterações…</span>}{saveState.status === 'saved' && <span className="pill">{saveState.message}{saveState.operationId && ` · Operação ${saveState.operationId}`}</span>}{saveState.status === 'error' && <span className="error" role="alert">Erro: {saveState.message}{saveState.requestId && ` · Solicitação ${saveState.requestId}`}</span>}{saveState.status === 'conflict' && <span className="conflict-message" role="alert">Conflito 412: {saveState.message}{saveState.requestId && ` · Solicitação ${saveState.requestId}`}</span>}{saveState.status === 'conflict' && !conflictView && <button type="button" onClick={() => void retryConflictRead()}>Consultar dados atuais</button>}</div><button type="button" className="primary" disabled={saveState.status === 'saving'} onClick={() => void save()}>Salvar configuração</button></section>
    <div className="current-data-note"><small>ETag atual: <span className="mono">{load.etag}</span>. A conta vinculada é {accountLabel}; o host designado é {hostLabel}.</small></div>
  </div>;
}

type LimitValue = { state: 'not_configured' } | { state: 'configured'; value: number; unit: string };
function ConfiguredLimitField({ label, value, onChange, defaultUnit }: { label: string; value: LimitValue; onChange: (value: LimitValue) => void; defaultUnit: string }) {
  const configured = value.state === 'configured';
  return <div className="limit-field"><Checkbox label={`${label} configurado`} checked={configured} onChange={(checked) => onChange(checked ? { state: 'configured', value: 0, unit: defaultUnit } : { state: 'not_configured' })} />{configured && <div className="row"><NumberField label={`${label} valor`} value={value.value} min={0} step={0.01} onChange={(next) => onChange({ ...value, value: next })} /><TextField label={`${label} unidade`} value={value.unit} onChange={(unit) => onChange({ ...value, unit })} /></div>}</div>;
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="check form-check"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />{label}</label>;
}

function ProjectMappingEditor({ configuration, options, optionsError, onChange, onLoadMore }: {
  configuration: ProjectConfiguration; options: ConfigurationOptions | null; optionsError: string | null; onChange: (update: (current: ProjectConfiguration) => ProjectConfiguration) => void; onLoadMore: () => void;
}) {
  const mapping = configuration.githubProject;
  const chosenProject = mapping?.id ?? '';
  const chosenField = mapping?.statusFieldId ?? '';
  const selectedProject = options?.projects.items.find((project) => project.id === chosenProject);
  const staleProject = Boolean(chosenProject && !selectedProject);
  const selectedField = options?.statusFields.find((field) => field.id === chosenField);
  const staleField = Boolean(chosenField && !selectedField);
  const optionNames = useMemo(() => new Map((selectedField?.options ?? []).map((option) => [option.id, option.name])), [selectedField]);
  const statusRoles = ['ready', 'inProgress', 'inReview', 'delivered'] as const;

  function updateMapping(next: NonNullable<ProjectConfiguration['githubProject']> | null): void { onChange((current) => ({ ...current, githubProject: next })); }
  return <fieldset className="mapping-editor"><legend>Mapeamento GitHub Project e Status</legend>
    <p className="muted">Seleções persistidas usam IDs. Ao trocar Project, os campos e opções dependentes são invalidados; ao trocar Status, as quatro opções são limpas.</p>
    <div className="form-grid">
      <SelectField label="GitHub Project" value={chosenProject} onChange={(id) => {
        if (!id) { updateMapping(null); return; }
        const project = options?.projects.items.find((item) => item.id === id);
        updateMapping({ id, ownerId: project?.owner.id ?? '', statusFieldId: '', statusOptionIds: { ready: '', inProgress: '', inReview: '', delivered: '' } });
      }} options={(options?.projects.items ?? []).map((project) => ({ value: project.id, label: `${project.title} · ${project.owner.login}${project.closed ? ' · encerrado' : ''}` }))} disabled={options?.completeness === 'unavailable'} />
      {staleProject && <div className="notice field-full"><b>Project salvo inacessível</b><p>ID {chosenProject} não aparece nas opções atuais. {options?.diagnostics.map((item) => `${item.code}: ${item.message} ${item.recovery}`).join(' · ') || 'O catálogo pode estar parcial ou indisponível.'}</p></div>}
      {mapping && <><div className="field-full"><small className="muted">Owner ID observado: <span className="mono">{mapping.ownerId || 'não confirmado'}</span></small></div>
        <SelectField label="Campo Status" value={chosenField} onChange={(id) => updateMapping({ ...mapping, statusFieldId: id, statusOptionIds: { ready: '', inProgress: '', inReview: '', delivered: '' } })} options={(options?.statusFields ?? []).map((field) => ({ value: field.id, label: field.name }))} disabled={!chosenProject || !options?.statusFields.length} />
        {staleField && <div className="notice field-full"><b>Campo Status salvo inacessível</b><p>ID {chosenField} não aparece entre os campos consultáveis. {options?.diagnostics.map((item) => `${item.code}: ${item.message} ${item.recovery}`).join(' · ') || 'O mapeamento permanece visível para correção.'}</p></div>}
        {statusRoles.map((role) => {
          const id = mapping.statusOptionIds[role];
          const roleLabel = ({ ready: 'Ready', inProgress: 'Em andamento', inReview: 'Em revisão', delivered: 'Entregue' } as const)[role];
          return <SelectField key={role} label={`Status ${roleLabel}`} value={id} onChange={(optionId) => updateMapping({ ...mapping, statusOptionIds: { ...mapping.statusOptionIds, [role]: optionId } })} options={(selectedField?.options ?? []).map((option) => ({ value: option.id, label: option.name }))} disabled={!selectedField} {...(id && !optionNames.has(id) ? { help: `ID salvo ${id} inacessível; consulte o diagnóstico e selecione outro valor se necessário.` } : {})} />;
        })}
      </>}
    </div>
    {optionsError && <div className="read-state" role="alert"><p>{optionsError}</p></div>}
    {options && options.completeness !== 'complete' && <div className="notice"><b>{options.completeness === 'partial' ? 'Opções incompletas' : 'Conta/host indisponível'}</b>{options.diagnostics.length ? <ul>{options.diagnostics.map((item, index) => <li key={`${item.code}-${index}`}><b>{item.code}</b> · {item.message} {item.recovery}</li>)}</ul> : <p>As opções atuais não foram confirmadas.</p>}{options.retryAtMs !== null && <small>Nova consulta permitida após {new Date(options.retryAtMs).toLocaleString('pt-BR')}</small>}</div>}
    {options?.projects.hasMore && <button type="button" onClick={onLoadMore}>Carregar mais Projects</button>}
  </fieldset>;
}
