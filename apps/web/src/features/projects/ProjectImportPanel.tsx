import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { OperationAccepted, ProjectImportRequest, ProjectImportView, SettingsView } from '#contracts';
import { HttpError, requestJson } from '../../api/http.js';
import { recordUncertainOperation, resolveUncertainOperation } from '../../api/uncertain-operations.js';
import { clearDraft, getDraft, setDraft as persistDraft, type DraftValue } from '../../app/drafts.js';
import { OperatorDiagnosticCard, OperatorState } from '../../app/OperatorSupport.js';
import { projectImportStepLabels } from '../../app/operator-language.js';
import { BranchSelector } from './BranchSelector.js';
import { FieldHelp } from './FieldHelp.js';
import {
  clearProjectImportSession, destinationPreview, readProjectImportSession, suggestedFolderName, writeProjectImportSession, type ProjectImportSession,
} from './project-import-model.js';

type ImportDraft = { name: string; url: string; folderName: string; folderEdited: boolean; baseBranch: string; commandId: string | null };
type Tracking =
  | { status: 'unconfirmed'; session: ProjectImportSession }
  | { status: 'tracking'; importId: string; commandId: string; body: ProjectImportRequest; view: ProjectImportView | null; error: string | null };
type Failure = { message: string; requestId: string | null; fields: ReadonlyMap<string, string> };

const importDraftKey = 'project-import';
const pollMs = 2500;
const emptyDraft: ImportDraft = { name: '', url: '', folderName: '', folderEdited: false, baseBranch: '', commandId: null };
const fieldByCode: Readonly<Record<string, string>> = {
  IMPORT_URL_INVALID: 'repository_url', IMPORT_FOLDER_INVALID: 'folder_name', IMPORT_DESTINATION_RESERVED: 'folder_name',
  IMPORT_DESTINATION_OCCUPIED: 'folder_name', IMPORT_BASE_BRANCH_NOT_FOUND: 'base_branch',
};

function initialTracking(): Tracking | null {
  const session = readProjectImportSession();
  if (!session) return null;
  return session.importId
    ? { status: 'tracking', importId: session.importId, commandId: session.commandId, body: session.body, view: null, error: null }
    : { status: 'unconfirmed', session };
}

export function ProjectImportPanel({ identity, onRegistered, kindField }: { identity: string; onRegistered: (projectId: string) => void; kindField: ReactNode }) {
  const [form, setForm] = useState<ImportDraft>(() => getDraft<ImportDraft>(identity, importDraftKey) ?? emptyDraft);
  const [tracking, setTracking] = useState<Tracking | null>(initialTracking);
  const [projectsRoot, setProjectsRoot] = useState<{ status: 'loading' } | { status: 'ready'; value: string | null } | { status: 'error' }>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    const controller = new AbortController();
    requestJson<SettingsView>('/api/v1/settings', { signal: controller.signal })
      .then((view) => setProjectsRoot({ status: 'ready', value: view.settings.projects_root }))
      .catch(() => { if (!controller.signal.aborted) setProjectsRoot({ status: 'error' }); });
    return () => controller.abort();
  }, []);

  const importId = tracking?.status === 'tracking' ? tracking.importId : null;
  useEffect(() => {
    if (!importId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (): Promise<void> => {
      try {
        const view = await requestJson<ProjectImportView>(`/api/v1/projects/imports/${encodeURIComponent(importId)}`);
        if (!active) return;
        setTracking((current) => current?.status === 'tracking' && current.importId === importId ? { ...current, view, error: null } : current);
        if (view.state === 'completed') { clearProjectImportSession(); clearDraft(identity, importDraftKey); }
        else if (view.state !== 'failed') timer = setTimeout(() => void load(), pollMs);
      } catch (error: unknown) {
        if (!active) return;
        if (error instanceof HttpError && error.status === 404) {
          clearProjectImportSession();
          setTracking(null);
          setFailure({ message: 'O cadastro consultado não está mais disponível. Revise os campos e envie novamente.', requestId: error.requestId, fields: new Map() });
          return;
        }
        const message = error instanceof HttpError ? error.message : 'Não foi possível consultar o andamento do cadastro. Uma nova consulta será feita automaticamente.';
        setTracking((current) => current?.status === 'tracking' && current.importId === importId ? { ...current, error: message } : current);
        timer = setTimeout(() => void load(), pollMs * 2);
      }
    };
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [importId, identity]);

  const root = projectsRoot.status === 'ready' ? projectsRoot.value : null;
  const folderValue = form.folderEdited ? form.folderName : suggestedFolderName(form.url);
  const fieldMessage = (field: string) => failure?.fields.get(field) ?? null;
  function updateForm(changes: Partial<ImportDraft>): void {
    setForm((current) => {
      const next = { ...current, ...changes };
      persistDraft(identity, importDraftKey, next as unknown as DraftValue);
      return next;
    });
  }

  async function send(body: ProjectImportRequest, commandId: string): Promise<void> {
    setBusy(true); setFailure(null);
    writeProjectImportSession({ commandId, importId: null, body });
    try { recordUncertainOperation({ operationId: commandId, kind: 'project-register', recordedAt: Date.now() }); } catch { /* The session record keeps the operation identity. */ }
    try {
      const accepted = await requestJson<OperationAccepted>('/api/v1/projects/imports', {
        method: 'POST', headers: { 'Idempotency-Key': commandId }, body: JSON.stringify(body),
      });
      if (accepted.resource.type !== 'project_import') throw new Error('O recibo aceito não corresponde ao cadastro solicitado.');
      writeProjectImportSession({ commandId, importId: accepted.resource.id, body });
      resolveUncertainOperation(commandId);
      if (mounted.current) setTracking({ status: 'tracking', importId: accepted.resource.id, commandId, body, view: null, error: null });
    } catch (error: unknown) {
      if (!mounted.current) return;
      if (error instanceof HttpError && error.status < 500) {
        resolveUncertainOperation(commandId);
        clearProjectImportSession();
        setTracking(null);
        updateForm({ commandId: null });
        const field = fieldByCode[error.code];
        const fields = new Map(error.fieldErrors.map((item) => [item.field, item.message]));
        if (field && !fields.has(field)) fields.set(field, error.message);
        setFailure({ message: error.message, requestId: error.requestId, fields });
      } else {
        setTracking({ status: 'unconfirmed', session: { commandId, importId: null, body } });
      }
    } finally { if (mounted.current) setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const baseBranch = form.baseBranch.trim();
    const body: ProjectImportRequest = {
      name: form.name.trim(), repository_url: form.url.trim(), folder_name: folderValue.trim(), ...(baseBranch ? { base_branch: baseBranch } : {}),
    };
    const commandId = form.commandId ?? crypto.randomUUID();
    updateForm({ commandId });
    void send(body, commandId);
  }

  function retry(): void {
    clearProjectImportSession();
    setTracking(null);
    setFailure(null);
    updateForm({ commandId: null });
  }

  if (tracking?.status === 'unconfirmed') {
    const { session } = tracking;
    return <section className="creation-flow feature-form registration-form" aria-live="polite">
      <div className="read-state" role="alert"><b>Cadastro ainda não confirmado</b><p>O controlador não confirmou o recebimento do cadastro de <code>{session.body.repository_url}</code>. Consulte novamente: o mesmo pedido será reapresentado sem duplicar o cadastro.</p></div>
      <div className="form-actions dialog-actions">
        <button type="button" className="primary" disabled={busy} onClick={() => void send(session.body, session.commandId)}>{busy ? 'Consultando…' : 'Consultar resultado'}</button>
        <button type="button" disabled={busy} onClick={retry}>Descartar e editar</button>
      </div>
    </section>;
  }

  if (tracking?.status === 'tracking') {
    return <ProjectImportProgress tracking={tracking} onRetry={retry} onOpenProject={onRegistered} />;
  }

  const missingFields = [!form.name.trim() && 'nome do projeto', !form.url.trim() && 'url do repositório github', !folderValue.trim() && 'nome da pasta'].filter(Boolean);
  const blocked = projectsRoot.status === 'ready' && root === null;
  const guidance = busy ? 'Aguarde a confirmação do cadastro.'
    : blocked ? 'Defina a raiz dos projetos em Configuração antes de cadastrar por URL.'
    : missingFields.length ? `Preencha: ${missingFields.join(', ')}.` : 'O repositório será clonado na pasta indicada e cadastrado em seguida.';
  return <form className="creation-flow feature-form registration-form" onSubmit={submit} noValidate>
    <p className="creation-intro">Conecte um repositório GitHub que você já tem. A fábrica clona o repositório para a Pasta do projeto, confere o resultado e só então cadastra o projeto. Se a pasta já for um clone do mesmo repositório, ela é reaproveitada sem clonar de novo.</p>
    {failure && <div className="read-state" role="alert"><b>Cadastro não confirmado</b><p>{failure.message}</p><p><strong>Próxima ação:</strong> revise os campos destacados e tente novamente.</p></div>}
    <div className="form-grid creation-form-grid">
      <div className="creation-group-heading field-full"><h3>Dados do projeto</h3><span>* Obrigatório</span></div>
      <div className="field-full"><ImportField label="Nome do projeto" value={form.name} onChange={(value) => updateForm({ name: value, commandId: null })} error={fieldMessage('name')} help="Nome usado para identificar o projeto na fábrica." required /></div>
      <div className="creation-group-heading creation-repository-heading field-full"><h3>Origem do projeto</h3><span>Local ou GitHub</span></div>
      {kindField}
      <div className="field-full"><ImportField label="URL do repositório GitHub" value={form.url} onChange={(value) => updateForm({ url: value, commandId: null })} error={fieldMessage('repository_url')} required /></div>
      <div className="field-full registration-folder-field">
        <label htmlFor="import-folder-name">Pasta do projeto *</label>
        <div className="registration-folder-row">
          <span className="storage-path" aria-label="Raiz dos projetos">{root ? destinationPreview(root, '') : projectsRoot.status === 'loading' ? 'Consultando…' : 'Raiz dos projetos não definida'}</span>
          <input id="import-folder-name" value={folderValue} aria-invalid={Boolean(fieldMessage('folder_name'))} aria-describedby="import-folder-help" onChange={(event) => { const value = event.currentTarget.value; updateForm({ folderName: value, folderEdited: value !== '', commandId: null }); }} />
        </div>
        {fieldMessage('folder_name') && <span className="error" role="alert">{fieldMessage('folder_name')}</span>}
        <FieldHelp id="import-folder-help" label="Nome da pasta" />
        {root && folderValue.trim() && <small>Destino: <code>{destinationPreview(root, folderValue.trim())}</code></small>}
        {projectsRoot.status === 'error' && <span className="error" role="alert">Não foi possível consultar a raiz dos projetos. Atualize a página e tente novamente.</span>}
      </div>
      <BranchSelector label="Branch base" source={{ kind: 'github', location: form.url.trim() }} value={form.baseBranch} onChange={(value) => updateForm({ baseBranch: value, commandId: null })} error={fieldMessage('base_branch')} />
      <div className="field-full">
        <small className="field-guidance muted">{form.baseBranch ? <>Branch base: <code>{form.baseBranch}</code>. </> : 'Vazio usa a branch padrão do repositório. '}{form.baseBranch && <button type="button" onClick={() => updateForm({ baseBranch: '', commandId: null })}>Usar a branch padrão</button>}</small>
      </div>
    </div>
    <div className="creation-destination-preview"><span>Sobre o cadastro</span><p className="registration-source-note">O repositório é clonado na pasta indicada, dentro da raiz dos projetos. O cadastro só termina depois de a pasta ser conferida; se algo falhar, a pasta criada por esta operação é removida.</p></div>
    <div className="form-actions creation-form-footer"><p id="registration-guidance">{guidance}</p><button type="submit" className="primary" aria-describedby="registration-guidance" disabled={busy || blocked || projectsRoot.status !== 'ready' || missingFields.length > 0}>{busy ? 'Cadastrando…' : 'Adicionar existente'}</button></div>
  </form>;
}

function ImportField({ label, value, onChange, error, help, required = false }: { label: string; value: string; onChange: (value: string) => void; error?: string | null; help?: string; required?: boolean }) {
  const id = `import-${label.toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, '-')}`;
  return <div className="form-field"><label htmlFor={id}>{label}{required ? ' *' : ''}</label><input id={id} value={value} onChange={(event) => onChange(event.currentTarget.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : `${id}-help`} />{error && <span id={`${id}-error`} className="error" role="alert">{error}</span>}<small id={`${id}-help`} className="field-guidance">{help ?? (label === 'URL do repositório GitHub' ? 'URL HTTPS ou SSH do repositório, sem credenciais embutidas.' : '')}</small></div>;
}

const cleanupNotice = {
  removed: 'A pasta criada por esta operação foi removida. Nenhum arquivo anterior foi apagado.',
  failed: 'A pasta criada por esta operação não pôde ser removida. Confira e remova-a manualmente antes de tentar novamente.',
} as const;

function ProjectImportProgress({ tracking, onRetry, onOpenProject }: { tracking: Extract<Tracking, { status: 'tracking' }>; onRetry: () => void; onOpenProject: (projectId: string) => void }) {
  const { view, body, error } = tracking;
  if (!view) return <section className="creation-flow" aria-busy="true"><p role="status">Consultando o cadastro de <code>{body.repository_url}</code>…</p>{error && <div role="alert">{error}</div>}</section>;
  const done = view.steps.filter((step) => step.state === 'confirmed' || step.state === 'skipped').length;
  const heading = view.state === 'completed' ? 'Cadastro concluído' : view.state === 'failed' ? 'Cadastro não concluído' : 'Cadastro em andamento';
  return <section className="creation-flow" aria-labelledby="project-import-title">
    {error && <div role="alert">{error}<p>Resultado anterior; a consulta será repetida automaticamente.</p></div>}
    <div className={`creation-result-banner ${view.state === 'completed' ? 'is-complete' : view.state === 'failed' ? 'is-problem' : ''}`}>
      <span className="eyebrow">{view.name}</span><h3 id="project-import-title">{heading}</h3>
      <p>{view.state === 'completed' ? 'O repositório está na Pasta do projeto e o projeto foi cadastrado. Abra a configuração para conferir os pré-requisitos.' : view.state === 'failed' ? 'O cadastro parou antes de terminar. Veja a causa abaixo e tente novamente.' : 'Acompanhe as etapas abaixo. O andamento é atualizado automaticamente e continua se você recarregar a página.'}</p>
    </div>
    <div className="creation-progress" aria-label="Progresso do cadastro"><div><b>{done} de {view.steps.length} etapas confirmadas</b></div><progress max={view.steps.length} value={done} aria-label="Etapas confirmadas" /></div>
    <dl className="creation-result-grid"><div><dt>Repositório</dt><dd><code>{view.repository_url}</code></dd></div><div><dt>Pasta do projeto</dt><dd><code>{view.destination}</code></dd></div><div><dt>Branch base</dt><dd>{view.base_branch ?? 'Padrão do repositório'}</dd></div></dl>
    <div className="creation-effect-list"><h4>Etapas</h4>{view.steps.map((step) => <div key={step.step} className="creation-effect-row"><b>{projectImportStepLabels[step.step]}</b><span className={`pill ${step.state === 'confirmed' || step.state === 'skipped' ? '' : 'warn'}`}><OperatorState value={step.state} /></span></div>)}</div>
    {view.adopted && <div className="notice" role="status"><b>Pasta reaproveitada</b><p>Esta pasta já era um clone do mesmo repositório. Ela foi cadastrada sem clonar de novo e seus arquivos foram preservados.</p></div>}
    {view.state === 'failed' && <div className="read-state" role="alert"><b>O cadastro precisa de atenção</b>{view.diagnostic && <OperatorDiagnosticCard code={view.diagnostic} state="blocked" />}{view.cleanup !== 'not_needed' && <p>{cleanupNotice[view.cleanup]}</p>}</div>}
    <div className="form-actions dialog-actions">
      {view.state === 'failed' && <button type="button" className="primary" onClick={onRetry}>Tentar novamente</button>}
      {view.state === 'completed' && view.project_id && <button type="button" className="primary" onClick={() => onOpenProject(view.project_id!)}>Abrir configuração do projeto</button>}
    </div>
  </section>;
}
