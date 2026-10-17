import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CreationMode, CreationView, OperationAccepted, OperationView, ScaffoldInput, ScaffoldOptions, ScaffoldPlanned } from '#contracts';
import { HttpError, requestJson, requestJsonWithMetadata } from '../../api/http.js';
import { readUncertainOperations, recordUncertainOperation, resolveUncertainOperation } from '../../api/uncertain-operations.js';
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
  directory: 'Pasta', files: 'Arquivos do template', git: 'Repositório Git local', baseline: 'Baseline', registration: 'Cadastro do projeto',
  create_repository: 'Criar repositório remoto', associate_origin: 'Associar origin', baseline_push: 'Publicar baseline',
  create_directory: 'Criar destino', write_template_and_engineering: 'Gravar template e engenharia', initialize_git: 'Inicializar Git', create_conventional_baseline: 'Criar baseline convencional', register_local_project: 'Cadastrar projeto',
};

function suggestedPath(name: string): string {
  return name.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toLocaleLowerCase('en');
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof HttpError ? `${error.message}${error.requestId ? ` Solicitação ${error.requestId}.` : ''}` : fallback;
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
    setOperationNotice(`Operação ${pending.operationId} continua sem recibo nesta aba. Consulte seu estado antes de continuar; nenhum POST será repetido.`);
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

  const modeCapability = options?.creationModes.find((item) => item.mode === form.creationMode)?.capability;
  const remoteMode = form.creationMode !== 'local';
  const currentView = creation.status === 'ready' ? creation.view : null;
  const canReconcile = Boolean(currentView && currentView.creation.state === 'partial' && creation.status === 'ready' && creation.etag &&
    currentView.remoteEffects.some((effect) => ['unknown', 'running', 'failed_known'].includes(effect.state)));

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
    const base = {
      name: current.name.trim(), templateId: template.id, templateDigest: template.digest,
      destinationRelative: current.destinationRelative.trim(), creationMode: current.creationMode,
      baseBranch: current.baseBranch.trim(), triageEnabled: current.triageEnabled,
    };
    return current.creationMode === 'local' ? base : {
      ...base,
      remote: { ownerId: current.ownerId.trim(), name: current.remoteName.trim(), visibility: current.visibility },
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
        body: JSON.stringify({ planHash: stablePlan.planHash, plan: stablePlan.plan, authorized: true }),
      });
      if (accepted.operationId !== operationId || accepted.resource.type !== 'creation') throw new Error('O recibo aceito não corresponde à criação solicitada.');
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
        setOperationNotice(`A resposta da criação está incerta. Consulte a operação ${operationId}; não envie outra criação.`);
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
        setOperationNotice(`A operação permanece ${operation.state}. Consulte novamente; a criação não será reenviada.`);
      }
    } catch (error: unknown) {
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
      if (accepted.operationId !== operationId || accepted.resource.id !== creationId) throw new Error('A reconciliação retornou outra criação.');
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
        setReconcileNotice(`Resposta incerta para a reconciliação ${operationId}. Consulte a operação; não repita o envio.`);
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
        setReconcileNotice(`A operação de reconciliação permanece ${operation.state}. Consulte novamente; não será reenviada.`);
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
      <div><small>Template e digest</small><b>{options?.templates.find((item) => item.id === plan.plan.input.templateId)?.label}</b><code>{plan.plan.templateDigest}</code></div>
      <div><small>Branch-base</small><code>{plan.plan.input.baseBranch}</code></div>
      <div><small>Conta observada</small><b>{plan.plan.account.login ?? plan.plan.account.state}</b><code>{plan.plan.account.id ?? 'ID indisponível'}</code></div>
      <div><small>Identidade do destino pai</small><code>{plan.plan.parentIdentity}</code></div>
      {plan.plan.input.remote && <div><small>Repositório remoto</small><b>{plan.plan.ownerLogin ?? plan.plan.input.remote.ownerId}/{plan.plan.input.remote.name}</b><code>{plan.plan.input.remote.visibility === 'private' ? 'Privado' : 'Público'} · owner ID {plan.plan.ownerId}</code></div>}
    </div>
    <div className="creation-resource-list"><h4>Arquivos planejados</h4>{plan.plan.files.map((file) => <div className="creation-resource-row" key={file.path}><code>{file.path}</code><span>{file.bytes} bytes</span><code>{file.sha256}</code></div>)}</div>
    <div className="notice creation-engineering"><b>Engenharia incluída</b><p>Tracker {plan.plan.engineering.tracker} · domínio {plan.plan.engineering.domain} · instruções em {plan.plan.engineering.instructionFile} · triagem {plan.plan.engineering.triageEnabled ? 'incluída' : 'desativada'}. Nenhuma skill será instalada nem label criada.</p></div>
    <div className="creation-effect-list"><h4>Efeitos previstos</h4><ul>{plan.plan.effects.map((effect) => <li key={effect}>{stepLabels[effect] ?? effect}</li>)}</ul></div>
    {plan.prerequisites.length > 0 && <div className="notice"><b>Pré-requisitos ainda pendentes</b><ul>{plan.prerequisites.map((item) => <li key={item.code}>{item.message} {item.recovery}</li>)}</ul></div>}
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
      <label className="form-field" htmlFor="creation-template">Template<select id="creation-template" value={form.templateId} required disabled={!options?.templates.length} onChange={(event) => invalidatePlan((current) => ({ ...current, templateId: event.currentTarget.value }))}><option value="">Selecione…</option>{options?.templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select>{options?.templates.find((template) => template.id === form.templateId) && <small>{options.templates.find((template) => template.id === form.templateId)?.engineeringSummary}</small>}</label>
      <label className="form-field" htmlFor="creation-destination">Diretório relativo ao destino configurado<input id="creation-destination" value={form.destinationRelative} required onChange={(event) => { setDestinationEdited(true); invalidatePlan((current) => ({ ...current, destinationRelative: event.currentTarget.value })); }} />{options?.projectsRoot && <small>Raiz configurada: <code>{options.projectsRoot}</code></small>}</label>
      <label className="form-field" htmlFor="creation-branch">Branch-base<input id="creation-branch" value={form.baseBranch} required onChange={(event) => invalidatePlan((current) => ({ ...current, baseBranch: event.currentTarget.value }))} /></label>
      <label className="form-field field-full" htmlFor="creation-mode">Modalidade de criação<select id="creation-mode" value={form.creationMode} onChange={(event) => invalidatePlan((current) => ({ ...current, creationMode: event.currentTarget.value as CreationMode }))}>{(['local', 'remote_no_push', 'remote_push'] as const).map((mode) => {
        const capability = options?.creationModes.find((item) => item.mode === mode)?.capability;
        return <option key={mode} value={mode}>{modeLabels[mode]}{capability && !capability.available ? ' · indisponível neste host' : ''}</option>;
      })}</select>{modeCapability && !modeCapability.available && <small className="error">{modeCapability.reason} {modeCapability.recovery}</small>}</label>
      {remoteMode && <>
        <label className="form-field" htmlFor="creation-owner">Owner remoto (ID)<input id="creation-owner" value={form.ownerId} onChange={(event) => { const ownerId = event.currentTarget.value; ownerEditedRef.current = true; invalidatePlan((current) => ({ ...current, ownerId })); }} /><small>Sugestão da conta observada: {options?.account.login ?? 'indisponível'} · {options?.account.id ?? 'sem ID'}. A edição manual é preservada.</small></label>
        <label className="form-field" htmlFor="creation-remote-name">Nome do repositório remoto<input id="creation-remote-name" value={form.remoteName} onChange={(event) => { setRemoteNameEdited(true); invalidatePlan((current) => ({ ...current, remoteName: event.currentTarget.value })); }} /></label>
        <label className="form-field" htmlFor="creation-visibility">Visibilidade<select id="creation-visibility" value={form.visibility} onChange={(event) => invalidatePlan((current) => ({ ...current, visibility: event.currentTarget.value as FormState['visibility'] }))}><option value="private">Privado</option><option value="public">Público</option></select></label>
      </>}
      <label className="check form-check field-full"><input type="checkbox" checked={form.triageEnabled} onChange={(event) => invalidatePlan((current) => ({ ...current, triageEnabled: event.currentTarget.checked }))} />Incluir vocabulário de triagem nas instruções de engenharia</label>
    </div>
    {options && <div className="creation-account-note"><small>Conta observada: <b>{options.account.login ?? options.account.state}</b> · ID <code>{options.account.id ?? 'indisponível'}</code></small></div>}
    {options?.prerequisites.map((item) => <div className="notice" key={item.code}><b>{item.message}</b><p>{item.recovery}</p></div>)}
    {planError && <div className="read-state" role="alert">{planError}</div>}
    <div className="form-actions"><button type="submit" className="primary" disabled={!options || planning || uncertain || !form.name.trim() || !form.templateId || !form.destinationRelative.trim() || !form.baseBranch.trim() || (remoteMode && (!form.ownerId.trim() || !form.remoteName.trim())) || modeCapability?.available !== true}>{planning ? 'Preparando plano…' : 'Revisar plano'}</button></div>
  </form>;
}

function CreationResult({ load, onRefresh, onOpenProject, canReconcile, reconciling, reconcileUncertain, reconcileNotice, onReconcile, onConsultReconcile }: {
  load: CreationLoad; onRefresh: () => void; onOpenProject: (projectId: string) => void; canReconcile: boolean; reconciling: boolean; reconcileUncertain: boolean; reconcileNotice: string; onReconcile: () => void; onConsultReconcile: () => void;
}) {
  if (load.status === 'loading') return <section className="creation-flow" aria-busy="true"><p role="status">Consultando a criação pelo identificador persistido…</p></section>;
  if (load.status === 'error') return <section className="creation-flow"><div className="read-state" role="alert">{load.message}</div><p>A identidade da criação permanece na URL. Consulte novamente quando o controlador estiver acessível.</p><button type="button" onClick={onRefresh}>Tentar consulta</button></section>;
  const { creation, effects, remoteEffects, confirmedEffects, pendingEffects, prerequisites, diagnostics } = load.view;
  const complete = creation.state === 'completed';
  const heading = complete ? 'Criação concluída' : creation.state === 'partial' ? 'Criação parcial' : creation.state === 'failed' ? 'Criação falhou' : 'Criação em andamento';
  return <section className="creation-flow" aria-labelledby="creation-result-title">
    <div className={`creation-result-banner ${complete ? 'is-complete' : creation.state === 'partial' || creation.state === 'failed' ? 'is-problem' : ''}`}><span className="eyebrow">{creation.state} · criação {creation.id}</span><h3 id="creation-result-title">{heading}</h3><p>{complete ? 'A operação terminou e seus efeitos estão consultáveis.' : 'As etapas confirmadas e pendentes permanecem separadas; nenhum agente ou issue foi iniciado.'}</p></div>
    <dl className="creation-result-grid"><div><dt>Pasta</dt><dd><code>{creation.plan.destination}</code></dd></div><div><dt>Template</dt><dd>{creation.plan.input.templateId} · <code>{creation.plan.templateDigest}</code></dd></div><div><dt>Branch-base</dt><dd><code>{creation.plan.input.baseBranch}</code></dd></div><div><dt>Baseline</dt><dd><code>{creation.baselineSha ?? 'não confirmado'}</code></dd></div><div><dt>Referência local</dt><dd><code>{creation.baselineRef ?? 'não confirmada'}</code></dd></div><div><dt>Conta</dt><dd>{creation.plan.account.login ?? creation.plan.account.state} · <code>{creation.plan.account.id ?? 'sem ID'}</code></dd></div></dl>
    <div className="creation-effect-list"><h4>Efeitos da criação</h4>{[...effects.map((effect) => ({ id: effect.operationId, kind: effect.kind, state: effect.state, reason: effect.reason, receipt: effect.receipt, identity: null })), ...remoteEffects.map((effect) => ({ id: effect.operationId ?? effect.kind, kind: effect.kind, state: effect.state, reason: effect.reason, receipt: null, identity: effect.identity }))].map((effect) => <div className="creation-effect-row" key={effect.id}><b>{stepLabels[effect.kind] ?? effect.kind}</b><span className={`pill ${effect.state === 'confirmed' ? '' : effect.state === 'failed_known' ? 'warn' : 'neutral'}`}>{effect.state}</span>{effect.reason && <small>{effect.reason}</small>}{effect.receipt?.url && <code>{effect.receipt.url}</code>}{effect.receipt?.id && <code>Identidade confirmada {effect.receipt.id}</code>}{effect.receipt?.branchRef && <code>{effect.receipt.branchRef}</code>}{effect.receipt?.commitSha && <code>{effect.receipt.commitSha}</code>}{effect.identity && <code>{[effect.identity.repositoryOwner, effect.identity.repositoryName, effect.identity.branchRef, effect.identity.commitSha].filter(Boolean).join(' · ')}</code>}</div>)}</div>
    <div className="creation-progress-grid"><div><b>Etapas locais confirmadas</b><ul>{confirmedEffects.map((item) => <li key={item.step}>{stepLabels[item.step] ?? item.step}: {item.state}</li>)}</ul></div><div><b>Etapas pendentes ou incertas</b><ul>{pendingEffects.map((item) => <li key={item.step}>{stepLabels[item.step] ?? item.step}: {item.state}</li>)}{pendingEffects.length === 0 && remoteEffects.filter((item) => ['unknown', 'running', 'failed_known'].includes(item.state)).map((item) => <li key={item.kind}>{stepLabels[item.kind] ?? item.kind}: {item.state} · {item.reason ?? 'sem confirmação'}</li>)}</ul></div></div>
    {creation.diagnostic && <div className="read-state" role="alert"><b>Diagnóstico</b><p>{creation.diagnostic}</p></div>}{diagnostics.length > 0 && <div className="notice"><b>Diagnósticos</b><ul>{diagnostics.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div>}
    {prerequisites.length > 0 && <div className="notice"><b>Pré-requisitos do projeto</b><ul>{prerequisites.map((item) => <li key={item.code}>{item.message} {item.recovery}</li>)}</ul></div>}
    {reconcileNotice && <div className="read-state" role="status">{reconcileNotice}</div>}
    <div className="form-actions">{canReconcile && !reconcileUncertain && <button type="button" onClick={onReconcile} disabled={reconciling}>{reconciling ? 'Reconciliando…' : 'Reconciliar esta criação'}</button>}{reconcileUncertain && <button type="button" onClick={onConsultReconcile} disabled={reconciling}>{reconciling ? 'Consultando…' : 'Consultar reconciliação'}</button>}{creation.projectId && <button type="button" className="primary" onClick={() => onOpenProject(creation.projectId!)}>Abrir configuração do projeto</button>}</div>
  </section>;
}
