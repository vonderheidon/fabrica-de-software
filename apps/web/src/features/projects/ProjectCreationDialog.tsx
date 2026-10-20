import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { HttpCreationMode as CreationMode, HttpCreationView as CreationView, OperationAccepted, OperationView, HttpScaffoldInput as ScaffoldInput, HttpScaffoldOptions as ScaffoldOptions, HttpScaffoldPlanned as ScaffoldPlanned } from '#contracts';
import { createScaffoldRequest } from '../../api/observation-requests.js';
import { HttpError, requestJson, requestJsonWithMetadata } from '../../api/http.js';
import { readUncertainOperations, recordUncertainOperation, resolveUncertainOperation } from '../../api/uncertain-operations.js';
import { OperatorDiagnosticCard, OperatorState } from '../../app/OperatorSupport.js';
import { operatorState } from '../../app/operator-language.js';
import './ProjectCreationDialog.css';

type FormState = {
  name: string;
  templateId: string;
  destinationRelative: string;
  baseBranch: string;
  creationMode: CreationMode;
  triageEnabled: boolean;
  ownerId: string;
  remoteName: string;
  visibility: 'private' | 'public';
};
type CreationLoad = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; view: CreationView; etag: string | null };

const initialForm: FormState = {
  name: '', templateId: '', destinationRelative: '', baseBranch: 'main', creationMode: 'local', triageEnabled: false,
  ownerId: '', remoteName: '', visibility: 'private',
};
const modeLabels: Record<CreationMode, string> = {
  local: 'Somente local', remote_no_push: 'Remoto sem push', remote_push: 'Remoto com push',
};
const stepLabels: Record<string, string> = {
  directory: 'Pasta', files: 'Arquivos do template', git: 'Repositório Git local', baseline: 'Commit inicial', registration: 'Cadastro do projeto',
  create_repository: 'Criar repositório remoto', associate_origin: 'Vincular repositório remoto', baseline_push: 'Publicar commit inicial',
  create_directory: 'Criar destino', write_template_and_engineering: 'Gravar template e engenharia', initialize_git: 'Inicializar Git', create_conventional_baseline: 'Criar commit inicial', register_local_project: 'Cadastrar projeto',
};

function suggestedPath(name: string): string {
  return name.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toLocaleLowerCase('en');
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof HttpError ? error.message : fallback;
}

export function ProjectCreationDialog({ creationId, onCreationId, onPlanReview, onPlanEdit, onOpenProject }: {
  creationId: string | null;
  onCreationId: (creationId: string) => void;
  onPlanReview: () => void;
  onPlanEdit: () => void;
  onOpenProject: (projectId: string) => void;
}) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [options, setOptions] = useState<ScaffoldOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsReload, setOptionsReload] = useState(0);
  const [plan, setPlan] = useState<ScaffoldPlanned | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeOperationId, setActiveOperationId] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [operationNotice, setOperationNotice] = useState('');
  const [creation, setCreation] = useState<CreationLoad>({ status: 'loading' });
  const [creationReload, setCreationReload] = useState(0);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileUncertain, setReconcileUncertain] = useState(false);
  const [reconcileAccepted, setReconcileAccepted] = useState(false);
  const [reconcileNotice, setReconcileNotice] = useState('');
  const [destinationEdited, setDestinationEdited] = useState(false);
  const [remoteNameEdited, setRemoteNameEdited] = useState(false);
  const ownerEditedRef = useRef(false);
  const planVersion = useRef(0);
  const formRef = useRef(form);
  const reconcileOperationId = useRef<string | null>(null);
  formRef.current = form;

  useEffect(() => {
    const controller = new AbortController();
    requestJson<ScaffoldOptions>('/api/v1/scaffold/options', { signal: controller.signal }).then((value) => {
      if (controller.signal.aborted) return;
      setOptions(value);
      setOptionsError(null);
      setForm((current) => ({
        ...current,
        templateId: current.templateId || value.templates[0]?.id || '',
        ownerId: ownerEditedRef.current ? current.ownerId : value.account.id ?? '',
      }));
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setOptionsError(errorMessage(error, 'Não foi possível consultar templates e capacidades de criação.'));
    });
    return () => controller.abort();
  }, [optionsReload]);

  useEffect(() => {
    const pendingOperations = readUncertainOperations().filter((item) => item.kind === 'scaffold-create' || (creationId && item.kind === 'scaffold-reconcile')).sort((left, right) => left.recordedAt - right.recordedAt);
    const pending = pendingOperations[pendingOperations.length - 1];
    if (!pending) return;
    setActiveOperationId(pending.operationId);
    setUncertain(pending.kind === 'scaffold-create');
    setReconcileUncertain(pending.kind === 'scaffold-reconcile');
    setOperationNotice('Uma criação anterior está sem confirmação. Consulte seu resultado antes de continuar. O envio não será repetido automaticamente.');
  }, [creationId]);

  useEffect(() => {
    if (!creationId) {
      setCreation({ status: 'loading' });
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async (): Promise<void> => {
      try {
        const response = await requestJsonWithMetadata<CreationView>(`/api/v1/scaffold/creations/${encodeURIComponent(creationId)}`);
        if (!active) return;
        setCreation({ status: 'ready', view: response.data, etag: response.etag });
        if (['pending', 'running'].includes(response.data.creation.state)) timer = setTimeout(() => void load(), 2500);
      } catch (error: unknown) {
        if (active) setCreation({ status: 'error', message: errorMessage(error, 'Não foi possível consultar esta criação. A identidade foi preservada.') });
      }
    };
    void load();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [creationId, activeOperationId, creationReload]);

  useEffect(() => {
    const operationId = reconcileOperationId.current;
    if (!creationId || !reconcileAccepted || !operationId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observe = async (): Promise<void> => {
      try {
        const operation = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(operationId)}`);
        if (!active) return;
        if (operation.state === 'succeeded' && operation.resource.type === 'creation' && operation.resource.id === creationId) {
          resolveUncertainOperation(operationId);
          reconcileOperationId.current = null;
          setReconcileAccepted(false);
          setReconcileNotice('Reconciliação confirmada. Os efeitos atualizados foram carregados.');
          setCreationReload((value) => value + 1);
          return;
        }
        if (operation.state === 'failed') {
          resolveUncertainOperation(operationId);
          reconcileOperationId.current = null;
          setReconcileAccepted(false);
          setReconcileNotice(operation.error?.message ?? 'A reconciliação falhou; a criação parcial e seus efeitos foram preservados.');
          setCreationReload((value) => value + 1);
          return;
        }
        timer = setTimeout(() => void observe(), 2500);
      } catch (error: unknown) {
        if (!active) return;
        setReconcileNotice(errorMessage(error, 'A reconciliação foi aceita; o estado da operação ainda não pôde ser consultado.'));
        timer = setTimeout(() => void observe(), 5000);
      }
    };
    void observe();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [creationId, reconcileAccepted]);

  const modeCapability = options?.creation_modes.find((item) => item.mode === form.creationMode)?.capability;
  const remoteMode = form.creationMode !== 'local';
  const currentView = creation.status === 'ready' ? creation.view : null;
  const canReconcile = Boolean(currentView && currentView.creation.state === 'partial' && creation.status === 'ready' && creation.etag &&
    currentView.remote_effects.some((effect) => ['unknown', 'running', 'failed_known'].includes(effect.state)));

  function invalidatePlan(update: (current: FormState) => FormState): void {
    planVersion.current += 1;
    setPlanning(false);
    setPlan(null);
    setAuthorized(false);
    setPlanError(null);
    setForm((current) => update(current));
  }

  function inputFor(current: FormState): ScaffoldInput {
    const template = options?.templates.find((item) => item.id === current.templateId);
    if (!template) throw new Error('Selecione um template disponível.');
    const base: ScaffoldInput = {
      name: current.name.trim(), template_id: template.id, template_digest: template.digest,
      destination_relative: current.destinationRelative.trim(), creation_mode: current.creationMode,
      base_branch: current.baseBranch.trim(), triage_enabled: current.triageEnabled,
    };
    return current.creationMode === 'local' ? base : {
      ...base,
      remote: { owner_id: current.ownerId.trim(), name: current.remoteName.trim(), visibility: current.visibility },
    };
  }

  async function reviewPlan(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (planning || uncertain || !options || modeCapability?.available !== true) return;
    const version = ++planVersion.current;
    setPlanning(true); setPlanError(null); setPlan(null); setAuthorized(false);
    try {
      const input = inputFor(formRef.current);
      const response = await requestJson<ScaffoldPlanned>('/api/v1/scaffold/plans', { method: 'POST', body: JSON.stringify(input) });
      if (planVersion.current !== version) return;
      setPlan(response);
      onPlanReview();
    } catch (error: unknown) {
      if (planVersion.current === version) setPlanError(errorMessage(error, 'O controlador não conseguiu gerar o plano. Revise os campos e consulte novamente.'));
    } finally {
      if (planVersion.current === version) setPlanning(false);
    }
  }

  async function submitCreation(): Promise<void> {
    if (!plan || !authorized || submitting || uncertain || modeCapability?.available !== true) return;
    const stablePlan = plan;
    const operationId = activeOperationId ?? crypto.randomUUID();
    setSubmitting(true); setOperationNotice(''); setUncertain(false); setActiveOperationId(operationId);
    try {
      const accepted = await requestJson<OperationAccepted>('/api/v1/scaffold/creations', {
        method: 'POST', headers: { 'Idempotency-Key': operationId },
        body: JSON.stringify(createScaffoldRequest(stablePlan)),
      });
      if (accepted.operation_id !== operationId || accepted.resource.type !== 'creation') throw new Error('O recibo aceito não corresponde à criação solicitada.');
      resolveUncertainOperation(operationId);
      setUncertain(false);
      onCreationId(accepted.resource.id);
    } catch (error: unknown) {
      if (error instanceof HttpError && error.status < 500) {
        setActiveOperationId(null);
        setPlanError(error.message);
      } else {
        try { recordUncertainOperation({ operationId, kind: 'scaffold-create', recordedAt: Date.now() }); } catch { /* Keep the operation identity in component state. */ }
        setUncertain(true);
        setOperationNotice('A resposta da criação não foi confirmada. Consulte o estado atual antes de iniciar outra criação.');
      }
    } finally { setSubmitting(false); }
  }

  async function consultOperation(): Promise<void> {
    if (!activeOperationId || submitting) return;
    setSubmitting(true);
    try {
      const operation = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(activeOperationId)}`);
      if (operation.state === 'succeeded' && operation.resource.type === 'creation') {
        resolveUncertainOperation(activeOperationId);
        setUncertain(false);
        setOperationNotice('A operação foi aceita. Consultando os efeitos persistidos da criação.');
        onCreationId(operation.resource.id);
      } else if (operation.state === 'failed') {
        resolveUncertainOperation(activeOperationId);
        setUncertain(false);
        setActiveOperationId(null);
        setOperationNotice(operation.error?.message ?? 'O controlador confirmou a falha da operação. O plano e os campos continuam disponíveis.');
      } else {
        setOperationNotice(`Situação: ${operatorState(operation.state).label}. Consulte novamente; a criação não será reenviada.`);
      }
    } catch (error: unknown) {
      if (error instanceof HttpError && error.status === 404 && error.code === 'OPERATION_NOT_FOUND') {
        resolveUncertainOperation(activeOperationId);
        setUncertain(false);
        setActiveOperationId(null);
        setOperationNotice('O controlador não encontrou essa operação na conta atual. Revise o plano antes de solicitar uma nova criação. Nenhuma criação foi reenviada.');
        return;
      }
      setOperationNotice(errorMessage(error, 'Não foi possível consultar a operação. A identidade foi preservada; não repita a criação.'));
    } finally { setSubmitting(false); }
  }

  async function reconcile(): Promise<void> {
    if (!creationId || creation.status !== 'ready' || !creation.etag || !canReconcile || reconciling) return;
    const operationId = reconcileOperationId.current ?? crypto.randomUUID();
    reconcileOperationId.current = operationId;
    setReconciling(true); setReconcileNotice('');
    try {
      const accepted = await requestJson<OperationAccepted>(`/api/v1/scaffold/creations/${encodeURIComponent(creationId)}/reconcile`, {
        method: 'POST', headers: { 'If-Match': creation.etag, 'Idempotency-Key': operationId }, body: '{}',
      });
      if (accepted.operation_id !== operationId || accepted.resource.id !== creationId) throw new Error('A reconciliação retornou outra criação.');
      recordUncertainOperation({ operationId, kind: 'scaffold-reconcile', recordedAt: Date.now() });
      setReconcileAccepted(true);
      setReconcileNotice('Reconciliação aceita. A mesma criação será consultada novamente.');
      setCreationReload((value) => value + 1);
    } catch (error: unknown) {
      if (error instanceof HttpError && error.status < 500) {
        reconcileOperationId.current = null;
        setReconcileNotice(error.message);
      } else {
        try { recordUncertainOperation({ operationId, kind: 'scaffold-reconcile', recordedAt: Date.now() }); } catch { /* Keep the operation identity in the ref. */ }
        setReconcileUncertain(true);
        setReconcileNotice('A conferência dos efeitos ficou sem confirmação. Consulte o resultado antes de continuar.');
      }
    } finally { setReconciling(false); }
  }

  async function consultReconcile(): Promise<void> {
    const operationId = reconcileOperationId.current ?? activeOperationId;
    if (!operationId || reconciling) return;
    setReconciling(true);
    try {
      const operation = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(operationId)}`);
      if (operation.state === 'succeeded' && operation.resource.type === 'creation' && operation.resource.id === creationId) {
        resolveUncertainOperation(operationId);
        reconcileOperationId.current = null;
        setReconcileUncertain(false);
        setActiveOperationId(null);
        setReconcileNotice('A reconciliação foi confirmada. Atualizando os efeitos desta criação.');
        setCreationReload((value) => value + 1);
      } else if (operation.state === 'failed') {
        resolveUncertainOperation(operationId);
        reconcileOperationId.current = null;
        setReconcileUncertain(false);
        setActiveOperationId(null);
        setReconcileNotice(operation.error?.message ?? 'A operação de reconciliação falhou. O histórico da criação permanece disponível.');
      } else {
        setReconcileNotice(`Situação da conferência: ${operatorState(operation.state).label}. Consulte novamente; não será reenviada.`);
      }
    } catch (error: unknown) {
      setReconcileNotice(errorMessage(error, 'Não foi possível consultar a operação de reconciliação. A identidade foi preservada.'));
    } finally { setReconciling(false); }
  }

  if (creationId) return <CreationResult load={creation} onRefresh={() => setCreationReload((value) => value + 1)}
    onOpenProject={onOpenProject} canReconcile={canReconcile} reconciling={reconciling} reconcileUncertain={reconcileUncertain} reconcileNotice={reconcileNotice} onReconcile={() => void reconcile()} onConsultReconcile={() => void consultReconcile()} />;

  if (plan) return <section className="creation-flow" aria-labelledby="creation-plan-title">
    <div className="creation-section-heading"><span className="eyebrow">Revisão sem efeitos</span><h3 id="creation-plan-title">Plano de criação</h3><p>Confira o destino, os arquivos, a configuração de engenharia e os efeitos antes da única confirmação.</p></div>
    {planError && <div className="read-state" role="alert">{planError}</div>}
    <div className="creation-plan-grid">
      <div><small>Destino</small><code>{plan.plan.destination}</code></div>
      <div><small>Template</small><b>{options?.templates.find((item) => item.id === plan.plan.input.template_id)?.label}</b></div>
      <div><small>Branch-base</small><code>{plan.plan.input.base_branch}</code></div>
      <div><small>Conta observada</small><b>{plan.plan.account.login ?? 'Não confirmada'}</b></div>
      {plan.plan.input.remote && <div><small>Repositório remoto</small><b>{plan.plan.owner_login ?? 'Proprietário selecionado'}/{plan.plan.input.remote.name}</b><span>{plan.plan.input.remote.visibility === 'private' ? 'Privado' : 'Público'}</span></div>}
    </div>
    <div className="creation-resource-list"><h4>Arquivos planejados</h4>{plan.plan.files.map((file) => <div className="creation-resource-row" key={file.path}><code>{file.path}</code><span>{file.bytes} bytes</span></div>)}</div>

    <div className="notice creation-engineering"><b>Engenharia incluída</b><p>Tracker {plan.plan.engineering.tracker} · domínio {plan.plan.engineering.domain} · instruções em {plan.plan.engineering.instruction_file} · triagem {plan.plan.engineering.triage_enabled ? 'incluída' : 'desativada'}. Nenhuma skill será instalada nem label criada.</p></div>
    <div className="creation-effect-list"><h4>Efeitos previstos</h4><ul>{plan.plan.effects.map((effect) => <li key={effect}>{stepLabels[effect] ?? effect}</li>)}</ul></div>
    {plan.prerequisites.length > 0 && <div className="notice"><b>Pré-requisitos ainda pendentes</b>{plan.prerequisites.map((item) => <OperatorDiagnosticCard key={item.code} code={item.code} state="blocked" cause={item.message} recovery={item.recovery} />)}</div>}
    <label className="creation-authorization"><input type="checkbox" checked={authorized} onChange={(event) => setAuthorized(event.currentTarget.checked)} />Confirmo uma vez este plano e seus efeitos.</label>
    {operationNotice && <div className="read-state" role="status">{operationNotice}</div>}
    <div className="form-actions"><button type="button" onClick={() => { setPlan(null); setAuthorized(false); setPlanError(null); setActiveOperationId(null); onPlanEdit(); }}>Voltar e editar</button>
      {uncertain && <button type="button" onClick={() => void consultOperation()} disabled={submitting}>{submitting ? 'Consultando…' : 'Consultar operação'}</button>}
      <button type="button" className="primary" disabled={!authorized || submitting || uncertain || modeCapability?.available !== true} onClick={() => void submitCreation()}>{submitting ? 'Enviando uma vez…' : 'Criar projeto'}</button></div>
  </section>;

  return <form className="creation-flow feature-form" onSubmit={(event) => void reviewPlan(event)} noValidate>
    <p className="muted">Crie um projeto em um destino novo, com template versionado, instruções de engenharia e baseline local revisável. A criação não inicia issue, agente ou sessão.</p>
    {!options && !optionsError && <p role="status" aria-live="polite">Consultando templates e capacidades do host…</p>}
    {optionsError && <div className="read-state" role="alert">{optionsError}<button type="button" onClick={() => { setOptionsError(null); setOptionsReload((value) => value + 1); }}>Consultar novamente</button></div>}
    {operationNotice && <div className="read-state" role="status">{operationNotice}{uncertain && <button type="button" onClick={() => void consultOperation()} disabled={submitting}>{submitting ? 'Consultando…' : 'Consultar operação'}</button>}</div>}
    <div className="form-grid">
      <label className="form-field" htmlFor="creation-name">Nome do projeto<input id="creation-name" value={form.name} required onChange={(event) => { const name = event.currentTarget.value; invalidatePlan((current) => ({ ...current, name, ...(!destinationEdited ? { destinationRelative: suggestedPath(name) } : {}), ...(!remoteNameEdited ? { remoteName: suggestedPath(name) } : {}) })); }} /></label>
      <label className="form-field" htmlFor="creation-template">Template<select id="creation-template" value={form.templateId} required disabled={!options?.templates.length} onChange={(event) => { const templateId = event.currentTarget.value; invalidatePlan((current) => ({ ...current, templateId })); }}><option value="">Selecione…</option>{options?.templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select>{options?.templates.find((template) => template.id === form.templateId) && <small>{options.templates.find((template) => template.id === form.templateId)?.engineering_summary}</small>}</label>
      <label className="form-field" htmlFor="creation-destination">Diretório relativo ao destino configurado<input id="creation-destination" value={form.destinationRelative} required onChange={(event) => { const destinationRelative = event.currentTarget.value; setDestinationEdited(true); invalidatePlan((current) => ({ ...current, destinationRelative })); }} />{options?.projects_root && <small>Raiz configurada: <code>{options.projects_root}</code></small>}</label>
      <label className="form-field" htmlFor="creation-branch">Branch-base<input id="creation-branch" value={form.baseBranch} required onChange={(event) => { const baseBranch = event.currentTarget.value; invalidatePlan((current) => ({ ...current, baseBranch })); }} /></label>
      <label className="form-field field-full" htmlFor="creation-mode">Modalidade de criação<select id="creation-mode" value={form.creationMode} onChange={(event) => { const creationMode = event.currentTarget.value as CreationMode; invalidatePlan((current) => ({ ...current, creationMode })); }}>{(['local', 'remote_no_push', 'remote_push'] as const).map((mode) => {
        const capability = options?.creation_modes.find((item) => item.mode === mode)?.capability;
        return <option key={mode} value={mode}>{modeLabels[mode]}{capability && !capability.available ? ' · indisponível neste host' : ''}</option>;
      })}</select>{modeCapability && !modeCapability.available && <small className="error">{modeCapability.reason} {modeCapability.recovery}</small>}</label>
      {remoteMode && <>
        <div className="form-field"><label htmlFor="creation-owner-account">Proprietário do repositório<select id="creation-owner-account" value={form.ownerId === options?.account.id ? form.ownerId : ''} onChange={(event) => { const ownerId = event.currentTarget.value; ownerEditedRef.current = true; invalidatePlan((current) => ({ ...current, ownerId })); }}><option value="">Selecione…</option>{options?.account.id && options.account.login && <option value={options.account.id}>{options.account.login}</option>}</select></label></div>
        <label className="form-field" htmlFor="creation-remote-name">Nome do repositório remoto<input id="creation-remote-name" value={form.remoteName} onChange={(event) => { const remoteName = event.currentTarget.value; setRemoteNameEdited(true); invalidatePlan((current) => ({ ...current, remoteName })); }} /></label>
        <label className="form-field" htmlFor="creation-visibility">Visibilidade<select id="creation-visibility" value={form.visibility} onChange={(event) => { const visibility = event.currentTarget.value as FormState['visibility']; invalidatePlan((current) => ({ ...current, visibility })); }}><option value="private">Privado</option><option value="public">Público</option></select></label>
      </>}
      <label className="check form-check field-full"><input type="checkbox" checked={form.triageEnabled} onChange={(event) => { const triageEnabled = event.currentTarget.checked; invalidatePlan((current) => ({ ...current, triageEnabled })); }} />Incluir vocabulário de triagem nas instruções de engenharia</label>
    </div>
    {options && <div className="creation-account-note"><small>Conta observada: <b>{options.account.login ?? 'Não confirmada'}</b></small></div>}
    {options?.prerequisites.map((item) => <OperatorDiagnosticCard key={item.code} code={item.code} state="blocked" cause={item.message} recovery={item.recovery} />)}
    {planError && <div className="read-state" role="alert">{planError}</div>}
    <div className="form-actions"><button type="submit" className="primary" disabled={!options || planning || uncertain || !form.name.trim() || !form.templateId || !form.destinationRelative.trim() || !form.baseBranch.trim() || (remoteMode && (!form.ownerId.trim() || !form.remoteName.trim())) || modeCapability?.available !== true}>{planning ? 'Preparando plano…' : 'Revisar plano'}</button></div>
  </form>;
}

function CreationResult({ load, onRefresh, onOpenProject, canReconcile, reconciling, reconcileUncertain, reconcileNotice, onReconcile, onConsultReconcile }: {
  load: CreationLoad; onRefresh: () => void; onOpenProject: (projectId: string) => void; canReconcile: boolean; reconciling: boolean; reconcileUncertain: boolean; reconcileNotice: string; onReconcile: () => void; onConsultReconcile: () => void;
}) {
  if (load.status === 'loading') return <section className="creation-flow" aria-busy="true"><p role="status">Consultando a criação pelo identificador persistido…</p></section>;
  if (load.status === 'error') return <section className="creation-flow"><div className="read-state" role="alert">{load.message}</div><p>A identidade da criação permanece na URL. Consulte novamente quando o controlador estiver acessível.</p><button type="button" onClick={onRefresh}>Tentar consulta</button></section>;
  const { creation, effects, remote_effects: remoteEffects, confirmed_effects: confirmedEffects, pending_effects: pendingEffects, prerequisites, diagnostics } = load.view;
  const complete = creation.state === 'completed';
  const heading = complete ? 'Criação concluída' : creation.state === 'partial' ? 'Criação parcial' : creation.state === 'failed' ? 'Criação falhou' : 'Criação em andamento';
  // Both collections describe the same remote operations. Prefer their durable records.
  const visibleEffects = [
    ...effects.map((effect) => ({ kind: effect.kind, state: effect.state, reason: effect.reason })),
    ...remoteEffects.filter((remote) => !effects.some((effect) => effect.kind === remote.kind)),
  ];
  return <section className="creation-flow" aria-labelledby="creation-result-title">
    <div className={`creation-result-banner ${complete ? 'is-complete' : creation.state === 'partial' || creation.state === 'failed' ? 'is-problem' : ''}`}><span className="eyebrow">{creation.plan.input.name}</span><h3 id="creation-result-title">{heading}</h3><p>{complete ? 'O projeto foi criado e cadastrado. Abra sua configuração para conferir os pré-requisitos e preparar uma issue.' : 'O trabalho confirmado foi preservado. Confira as etapas pendentes e consulte novamente antes de continuar.'}</p></div>
    <dl className="creation-result-grid"><div><dt>Pasta</dt><dd><code>{creation.plan.destination}</code></dd></div><div><dt>Modalidade</dt><dd>{modeLabels[creation.plan.input.creation_mode]}</dd></div><div><dt>Branch-base</dt><dd>{creation.plan.input.base_branch}</dd></div><div><dt>Conta</dt><dd>{creation.plan.account.login ?? 'Não confirmada'}</dd></div></dl>
    {creation.plan.input.creation_mode === 'local' && <p>O projeto está somente nesta máquina. Confirme um remoto GitHub antes de iniciar uma issue.</p>}
    {creation.plan.input.creation_mode === 'remote_no_push' && <p>O repositório remoto foi solicitado sem envio do commit inicial. Confira os efeitos abaixo; a publicação do conteúdo local ainda precisa ser feita.</p>}
    <div className="creation-effect-list"><h4>Efeitos da criação</h4>{visibleEffects.length === 0 && <p>Nenhum efeito remoto solicitado.</p>}{visibleEffects.map((effect) => <div className="creation-effect-row" key={effect.kind}><b>{stepLabels[effect.kind] ?? 'Etapa da criação'}</b><span className={`pill ${effect.state === 'confirmed' ? '' : 'warn'}`}><OperatorState value={effect.state} /></span></div>)}</div>
    <div className="creation-progress-grid"><div><b>Etapas locais confirmadas</b><ul>{confirmedEffects.map((item) => <li key={item.step}>{stepLabels[item.step]}: <OperatorState value={item.state} /></li>)}</ul></div><div><b>Etapas pendentes ou incertas</b><ul>{pendingEffects.map((item) => <li key={item.step}>{stepLabels[item.step]}: <OperatorState value={item.state} /></li>)}{remoteEffects.filter((item) => ['unknown', 'running', 'failed_known'].includes(item.state)).map((item) => <li key={item.kind}>{stepLabels[item.kind]}: <OperatorState value={item.state} /></li>)}</ul>{pendingEffects.length === 0 && !remoteEffects.some((item) => ['unknown', 'running', 'failed_known'].includes(item.state)) && <p>Nenhuma etapa pendente registrada.</p>}</div></div>
    {(creation.diagnostic || diagnostics.length > 0) && <div className="read-state" role="alert"><b>A criação precisa de atenção</b>{creation.diagnostic && ['SCAFFOLD_GIT_IDENTITY_REQUIRED', 'CREATION_REMOTE_DESCRIPTION_UNCONFIRMED', 'CREATION_REMOTE_DESCRIPTION_CHANGED'].includes(creation.diagnostic)
      ? <OperatorDiagnosticCard code={creation.diagnostic} state="blocked" />
      : <p>Confira as etapas pendentes e consulte os efeitos preservados. A conferência não executa etapas restantes nem repete publicações.</p>}</div>}
    {prerequisites.length > 0 && <div className="notice"><b>Antes de iniciar uma issue</b>{prerequisites.map((item) => <OperatorDiagnosticCard key={item.code} code={item.code} state="blocked" cause={item.message} recovery={item.recovery} projectId={creation.project_id} />)}</div>}

    {reconcileNotice && <div className="read-state" role="status">{reconcileNotice}</div>}
    <div className="form-actions"><button type="button" onClick={onRefresh}>Consultar criação novamente</button>{canReconcile && !reconcileUncertain && <button type="button" onClick={onReconcile} disabled={reconciling}>{reconciling ? 'Conferindo…' : 'Conferir efeitos preservados'}</button>}{reconcileUncertain && <button type="button" onClick={onConsultReconcile} disabled={reconciling}>{reconciling ? 'Consultando…' : 'Consultar conferência'}</button>}{creation.project_id && <button type="button" className="primary" onClick={() => onOpenProject(creation.project_id!)}>Abrir configuração do projeto</button>}</div>
  </section>;
}
