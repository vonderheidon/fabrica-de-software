import { CustomSelect } from '../../app/CustomSelect.js';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { HttpCreationMode as CreationMode, HttpCreationView as CreationView, OperationAccepted, OperationView, HttpScaffoldInput as ScaffoldInput, HttpScaffoldOptions as ScaffoldOptions, HttpScaffoldPlanned as ScaffoldPlanned } from '#contracts';
import { createScaffoldRequest } from '../../api/observation-requests.js';
import { HttpError, requestJson, requestJsonWithMetadata } from '../../api/http.js';
import { readUncertainOperations, recordUncertainOperation, resolveUncertainOperation } from '../../api/uncertain-operations.js';
import { OperatorDiagnosticCard, OperatorState } from '../../app/OperatorSupport.js';
import { operatorState } from '../../app/operator-language.js';
import './ProjectCreationDialog.css';
import { CreationConditions } from './CreationConditions.js';
import { visibleCreationEffects } from './creation-effects.js';

type FormState = {
  name: string;
  templateId: string;
  destinationRelative: string;
  baseBranch: string;
  creationMode: 'remote_push';
  ownerId: string;
  remoteName: string;
  boardName: string;
  visibility: 'private' | 'public';
};
type CreationLoad = { status: 'loading' } | { status: 'error'; creationId: string; message: string } | { status: 'ready'; view: CreationView; etag: string | null; error?: string };

const initialForm: FormState = {
  name: '', templateId: '', destinationRelative: '', baseBranch: 'main', creationMode: 'remote_push',
  ownerId: '', remoteName: '', boardName: '', visibility: 'private',
};
const modeLabels: Record<CreationMode, string> = {
  local: 'Somente local', remote_no_push: 'Remoto sem push', remote_push: 'Remoto com push',
};
const modeDescriptions: Record<CreationMode, string> = {
  local: 'Cria a pasta e um repositório Git com o commit inicial neste computador.',
  remote_no_push: 'Também cria e vincula um repositório vazio no GitHub. Os arquivos permanecem somente neste computador.',
  remote_push: 'Também cria um repositório no GitHub e publica os arquivos do commit inicial na branch escolhida.',
};
const stepLabels: Record<string, string> = {
  directory: 'Pasta', files: 'Arquivos do template', git: 'Repositório Git local', baseline: 'Commit inicial', registration: 'Cadastro do projeto',
  create_repository: 'Criar repositório remoto', associate_origin: 'Vincular repositório remoto', baseline_push: 'Publicar commit inicial',
  create_directory: 'Criar destino', write_template_and_engineering: 'Gravar template e engenharia', initialize_git: 'Inicializar Git', create_conventional_baseline: 'Criar commit inicial', register_local_project: 'Cadastrar projeto',
  create_board: 'Criar quadro Kanban', configure_status: 'Configurar as cinco colunas', link_repository: 'Vincular quadro ao repositório', configure_view: 'Configurar visualização Kanban', verify_board: 'Conferir quadro e colunas',
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
  const boardNameEditedRef = useRef(false);
  const ownerEditedRef = useRef(false);
  const planVersion = useRef(0);
  const formRef = useRef(form);
  const reconcileOperationId = useRef<string | null>(null);
  const lifecycle = useRef({ active: true, creationId });
  lifecycle.current.creationId = creationId;
  formRef.current = form;

  useEffect(() => {
    lifecycle.current.active = true;
    return () => { lifecycle.current.active = false; planVersion.current += 1; };
  }, []);

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
    const pendingOperations = readUncertainOperations().filter((item) => (!creationId && item.kind === 'scaffold-create') || (creationId && item.kind === 'scaffold-reconcile')).sort((left, right) => left.recordedAt - right.recordedAt);
    const pending = pendingOperations[pendingOperations.length - 1];
    if (!pending) return;
    setActiveOperationId(pending.operationId);
    setUncertain(pending.kind === 'scaffold-create');
    setReconcileUncertain(pending.kind === 'scaffold-reconcile');
    if (pending.kind === 'scaffold-reconcile') reconcileOperationId.current = pending.operationId;
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
        resolveUncertainOperation(response.data.creation.operation_id);
        if (['pending', 'running'].includes(response.data.creation.state)) timer = setTimeout(() => void load(), 2500);
      } catch (error: unknown) {
        if (active) setCreation((prior) => prior.status === 'ready' && prior.view.creation.id === creationId
          ? { ...prior, error: errorMessage(error, 'Não foi possível atualizar esta criação. O resultado anterior foi preservado.') }
          : { status: 'error', creationId, message: errorMessage(error, 'Não foi possível consultar esta criação. A identidade foi preservada.') });
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
  const remoteMode = true;
  const missingFields = [!form.name.trim() && 'nome do projeto', !form.destinationRelative.trim() && 'pasta do projeto',
    !form.baseBranch.trim() && 'branch-base', remoteMode && !form.ownerId.trim() && 'proprietário',
    remoteMode && !form.remoteName.trim() && 'nome do repositório', !form.boardName.trim() && 'nome do quadro'].filter(Boolean);
  const destinationPreview = options?.projects_root
    ? `${options.projects_root.replace(/[\\/]+$/, '')}${options.projects_root.includes('\\') ? '\\' : '/'}${form.destinationRelative.trim() || '(pasta do projeto)'}` : null;
  const currentView = creation.status === 'ready' && creation.view.creation.id === creationId && !creation.error ? creation.view : null;
  const canReconcile = Boolean(currentView && currentView.creation.state === 'partial' && creation.status === 'ready' && creation.etag &&
    (currentView.remote_effects.some((effect) => ['unknown', 'running', 'failed_known'].includes(effect.state)) ||
      currentView.board_operations.some((effect) => ['unknown', 'running', 'failed_known'].includes(effect.state))));

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
      name: current.name.trim(), template_id: template.id, template_digest: template.digest,
      destination_relative: current.destinationRelative.trim(), creation_mode: 'remote_push' as const, board_name: current.boardName.trim(),
      base_branch: current.baseBranch.trim(), triage_enabled: true,
    };
    return { ...base, remote: { owner_id: current.ownerId.trim(), name: current.remoteName.trim(), visibility: current.visibility } };
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
      recordUncertainOperation({ operationId, kind: 'scaffold-create', recordedAt: Date.now() });
      const accepted = await requestJson<OperationAccepted>('/api/v1/scaffold/creations', {
        method: 'POST', headers: { 'Idempotency-Key': operationId },
        body: JSON.stringify(createScaffoldRequest(stablePlan)),
      });
      if (!lifecycle.current.active || lifecycle.current.creationId !== null) return;
      if (accepted.operation_id !== operationId || accepted.resource.type !== 'creation') throw new Error('O recibo aceito não corresponde à criação solicitada.');
      setUncertain(false);
      onCreationId(accepted.resource.id);
    } catch (error: unknown) {
      if (!lifecycle.current.active || lifecycle.current.creationId !== null) return;
      if (error instanceof HttpError && error.status < 500) {
        resolveUncertainOperation(operationId);
        setActiveOperationId(null);
        setPlanError(error.message);
      } else {
        try { recordUncertainOperation({ operationId, kind: 'scaffold-create', recordedAt: Date.now() }); } catch { /* Keep the operation identity in component state. */ }
        setUncertain(true);
        setOperationNotice('A resposta da criação não foi confirmada. Consulte o estado atual antes de iniciar outra criação.');
      }
    } finally { if (lifecycle.current.active) setSubmitting(false); }
  }

  async function consultOperation(): Promise<void> {
    if (!activeOperationId || submitting) return;
    setSubmitting(true);
    try {
      const operation = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(activeOperationId)}`);
      if (!lifecycle.current.active || lifecycle.current.creationId !== null) return;
      if (operation.operation_id !== activeOperationId) throw new Error('A consulta retornou outra operação.');
      if (operation.resource.type === 'creation') {
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
      if (!lifecycle.current.active || lifecycle.current.creationId !== null) return;
      if (error instanceof HttpError && error.status === 404 && error.code === 'OPERATION_NOT_FOUND') {
        setOperationNotice('A operação ainda não foi localizada na conta atual. Confirme a conta e consulte novamente. A identidade foi preservada para evitar outra criação.');
        return;
      }
      setOperationNotice(errorMessage(error, 'Não foi possível consultar a operação. A identidade foi preservada; não repita a criação.'));
    } finally { if (lifecycle.current.active) setSubmitting(false); }
  }

  async function reconcile(): Promise<void> {
    if (!creationId || creation.status !== 'ready' || !creation.etag || !canReconcile || reconciling || reconcileAccepted || reconcileUncertain) return;
    const expectedCreationId = creationId;
    const operationId = reconcileOperationId.current ?? crypto.randomUUID();
    reconcileOperationId.current = operationId;
    setReconciling(true); setReconcileNotice('');
    try {
      recordUncertainOperation({ operationId, kind: 'scaffold-reconcile', recordedAt: Date.now() });
      const accepted = await requestJson<OperationAccepted>(`/api/v1/scaffold/creations/${encodeURIComponent(creationId)}/reconcile`, {
        method: 'POST', headers: { 'If-Match': creation.etag, 'Idempotency-Key': operationId }, body: '{}',
      });
      if (!lifecycle.current.active || lifecycle.current.creationId !== expectedCreationId) return;
      if (accepted.operation_id !== operationId || accepted.resource.type !== 'creation' || accepted.resource.id !== creationId) throw new Error('A reconciliação retornou outra criação.');
      recordUncertainOperation({ operationId, kind: 'scaffold-reconcile', recordedAt: Date.now() });
      setReconcileAccepted(true);
      setReconcileNotice('Reconciliação aceita. A mesma criação será consultada novamente.');
      setCreationReload((value) => value + 1);
    } catch (error: unknown) {
      if (!lifecycle.current.active || lifecycle.current.creationId !== expectedCreationId) return;
      if (error instanceof HttpError && error.status < 500) {
        resolveUncertainOperation(operationId);
        reconcileOperationId.current = null;
        setReconcileNotice(error.message);
      } else {
        try { recordUncertainOperation({ operationId, kind: 'scaffold-reconcile', recordedAt: Date.now() }); } catch { /* Keep the operation identity in the ref. */ }
        setReconcileUncertain(true);
        setReconcileNotice('A conferência dos efeitos ficou sem confirmação. Consulte o resultado antes de continuar.');
      }
    } finally { if (lifecycle.current.active && lifecycle.current.creationId === expectedCreationId) setReconciling(false); }
  }

  async function consultReconcile(): Promise<void> {
    const expectedCreationId = creationId;
    const operationId = reconcileOperationId.current ?? activeOperationId;
    if (!operationId || reconciling) return;
    setReconciling(true);
    try {
      const operation = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(operationId)}`);
      if (!lifecycle.current.active || lifecycle.current.creationId !== expectedCreationId) return;
      if (operation.operation_id !== operationId || operation.resource.type !== 'creation') throw new Error('A consulta retornou outra operação.');
      if (operation.resource.id !== creationId) {
        onCreationId(operation.resource.id);
        return;
      }
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
      if (!lifecycle.current.active || lifecycle.current.creationId !== expectedCreationId) return;
      setReconcileNotice(errorMessage(error, 'Não foi possível consultar a operação de reconciliação. A identidade foi preservada.'));
    } finally { if (lifecycle.current.active && lifecycle.current.creationId === expectedCreationId) setReconciling(false); }
  }

  function prepareNewPlan(): void {
    if (!currentView || currentView.next_action !== 'create_new_plan' || uncertain || reconcileUncertain || reconciling || reconcileAccepted) return;
    const input = currentView.creation.plan.input;
    invalidatePlan(() => ({
      name: input.name, templateId: input.template_id, destinationRelative: input.destination_relative,
      baseBranch: input.base_branch, creationMode: 'remote_push', ownerId: input.remote?.owner_id ?? options?.account.id ?? '',
      remoteName: input.remote?.name ?? suggestedPath(input.name), boardName: ('board_name' in input ? input.board_name : undefined) ?? input.name,
      visibility: input.remote?.visibility ?? 'private',
    }));
    setActiveOperationId(null);
    setOperationNotice(`A criação anterior ${currentView.creation.id} permanece no histórico. Revise um novo plano e confirme a autorização antes de criar novamente.`);
    setDestinationEdited(true);
    setRemoteNameEdited(true);
    boardNameEditedRef.current = true;
    ownerEditedRef.current = true;
    onPlanEdit();
  }

  if (creationId) return <CreationResult key={creationId} creationId={creationId} load={creation} onRefresh={() => setCreationReload((value) => value + 1)}
    onOpenProject={onOpenProject} onNewPlan={currentView?.next_action === 'create_new_plan' && !uncertain && !reconcileUncertain && !reconciling && !reconcileAccepted ? prepareNewPlan : undefined} canReconcile={canReconcile} reconciling={reconciling || reconcileAccepted} reconcileUncertain={reconcileUncertain} reconcileNotice={reconcileNotice} onReconcile={() => void reconcile()} onConsultReconcile={() => void consultReconcile()} />;

  if (plan) return <section className="creation-flow" aria-labelledby="creation-plan-title">
    <div className="creation-section-heading"><span className="eyebrow">Antes de criar</span><h3 id="creation-plan-title">Plano de criação</h3><p>Confira o destino, os arquivos e as ações que serão executadas ao criar.</p></div>
    {planError && <div className="read-state" role="alert">{planError}</div>}
    <div className="creation-plan-grid">
      <div><small>Destino</small><code>{plan.plan.destination}</code></div>
      <div><small>Template</small><b>{options?.templates.find((item) => item.id === plan.plan.input.template_id)?.label}</b></div>
      <div><small>Branch-base</small><code>{plan.plan.input.base_branch}</code></div>
      <div><small>Conta observada</small><b>{plan.plan.account.login ?? 'Não confirmada'}</b></div>
      {plan.plan.input.remote && <div><small>Repositório remoto</small><b>{plan.plan.owner_login ?? 'Proprietário selecionado'}/{plan.plan.input.remote.name}</b><span>{plan.plan.input.remote.visibility === 'private' ? 'Privado' : 'Público'}</span></div>}
      <div><small>Quadro Kanban</small><b>{plan.plan.input.board_name}</b></div>
    </div>
    <div className="creation-resource-list"><h4>Arquivos planejados</h4>{plan.plan.files.map((file) => <div className="creation-resource-row" key={file.path}><code>{file.path}</code><span>{file.bytes} bytes</span></div>)}</div>

    <div className="notice creation-engineering"><b>Engenharia incluída</b><p>Tracker {plan.plan.engineering.tracker} · domínio {plan.plan.engineering.domain} · instruções em {plan.plan.engineering.instruction_file} · triagem {plan.plan.engineering.triage_enabled ? 'incluída' : 'desativada'}. Nenhuma skill será instalada nem label criada.</p></div>
    <div className="creation-effect-list"><h4>Efeitos previstos</h4><ul>{plan.plan.effects.map((effect) => <li key={effect}>{stepLabels[effect] ?? effect}</li>)}</ul></div>
    {plan.prerequisites.length > 0 && <div className="notice"><b>Pré-requisitos ainda pendentes</b>{plan.prerequisites.map((item) => <OperatorDiagnosticCard key={item.code} code={item.code} state="blocked" cause={item.message} recovery={item.recovery} />)}<a href="#principal/configuracao">Corrigir condições globais na Configuração</a></div>}
    <label className="creation-authorization"><input type="checkbox" checked={authorized} onChange={(event) => setAuthorized(event.currentTarget.checked)} />Confirmo este plano e autorizo as ações listadas.</label>
    {operationNotice && <div className="read-state" role="status">{operationNotice}</div>}
    <div className="form-actions dialog-actions"><button type="button" disabled={submitting || uncertain} onClick={() => { setPlan(null); setAuthorized(false); setPlanError(null); setActiveOperationId(null); onPlanEdit(); }}>Voltar e editar</button>
      {uncertain && <button type="button" onClick={() => void consultOperation()} disabled={submitting}>{submitting ? 'Consultando…' : 'Consultar operação'}</button>}
      <button type="button" className="primary" disabled={!authorized || submitting || uncertain || modeCapability?.available !== true} onClick={() => void submitCreation()}>{submitting ? 'Enviando uma vez…' : 'Criar projeto'}</button></div>
  </section>;

  return <form className="creation-flow feature-form" onSubmit={(event) => void reviewPlan(event)} noValidate>
    <p className="creation-intro">Prepare o espaço do seu próximo projeto. Confira tudo antes de criar.</p>
    {!options && !optionsError && <p role="status" aria-live="polite">Consultando templates e capacidades do host…</p>}
    {optionsError && <div className="read-state" role="alert">{optionsError}<button type="button" onClick={() => { setOptionsError(null); setOptionsReload((value) => value + 1); }}>Consultar novamente</button></div>}
    {operationNotice && <div className="read-state" role="status">{operationNotice}{uncertain && <button type="button" onClick={() => void consultOperation()} disabled={submitting}>{submitting ? 'Consultando…' : 'Consultar operação'}</button>}</div>}
    <div className="form-grid creation-form-grid">
      <div className="creation-group-heading field-full"><h3>Dados do projeto</h3><span>* Obrigatório</span></div>
      <label className="form-field" htmlFor="creation-name">Nome do projeto *<input id="creation-name" value={form.name} required onChange={(event) => { const name = event.currentTarget.value; invalidatePlan((current) => ({ ...current, name, ...(!destinationEdited ? { destinationRelative: suggestedPath(name) } : {}), ...(!remoteNameEdited ? { remoteName: suggestedPath(name) } : {}), ...(!boardNameEditedRef.current ? { boardName: name } : {}) })); }} /></label>
      {options && options.templates.length > 1 && <div className="form-field"><label htmlFor="creation-template">Template *</label><CustomSelect id="creation-template" value={form.templateId} required onChange={(event) => { const templateId = event.currentTarget.value; invalidatePlan((current) => ({ ...current, templateId })); }}><option value="">Selecione…</option>{options.templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</CustomSelect></div>}
      <label className="form-field" htmlFor="creation-destination">Pasta do projeto *<input id="creation-destination" placeholder="nome-do-projeto" value={form.destinationRelative} required aria-describedby="creation-destination-preview" onChange={(event) => { const destinationRelative = event.currentTarget.value; setDestinationEdited(true); invalidatePlan((current) => ({ ...current, destinationRelative })); }} /></label>
      <label className="form-field" htmlFor="creation-branch">Branch-base *<input id="creation-branch" value={form.baseBranch} required onChange={(event) => { const baseBranch = event.currentTarget.value; invalidatePlan((current) => ({ ...current, baseBranch })); }} /></label>
      {destinationPreview && <div className="creation-destination-preview field-full" id="creation-destination-preview"><span>O projeto será criado em</span><code>{destinationPreview}</code></div>}
      <div className="creation-group-heading creation-repository-heading field-full"><h3>Repositório e quadro</h3><span>Criação completa obrigatória</span></div>
      <div className="notice field-full"><b>Repositório GitHub com push inicial</b><p>{modeDescriptions.remote_push}</p>{modeCapability && !modeCapability.available && <small className="error">{modeCapability.reason} {modeCapability.recovery}</small>}</div>
      {remoteMode && <>
        <div className="form-field"><div className="form-field"><label htmlFor="creation-owner-account">Proprietário do repositório *</label><CustomSelect id="creation-owner-account" required value={form.ownerId === options?.account.id ? form.ownerId : ''} onChange={(event) => { const ownerId = event.currentTarget.value; ownerEditedRef.current = true; invalidatePlan((current) => ({ ...current, ownerId })); }}><option value="">Selecione…</option>{options?.account.id && options.account.login && <option value={options.account.id}>{options.account.login}</option>}</CustomSelect></div></div>
        <label className="form-field" htmlFor="creation-remote-name">Nome do repositório remoto *<input id="creation-remote-name" required value={form.remoteName} onChange={(event) => { const remoteName = event.currentTarget.value; setRemoteNameEdited(true); invalidatePlan((current) => ({ ...current, remoteName })); }} /></label>
        <label className="form-field" htmlFor="creation-board-name">Nome do quadro Kanban *<input id="creation-board-name" required value={form.boardName} onChange={(event) => { const boardName = event.currentTarget.value; boardNameEditedRef.current = true; invalidatePlan((current) => ({ ...current, boardName })); }} /></label>
        <div className="form-field"><label htmlFor="creation-visibility">Visibilidade</label><CustomSelect id="creation-visibility" value={form.visibility} onChange={(event) => { const visibility = event.currentTarget.value as FormState['visibility']; invalidatePlan((current) => ({ ...current, visibility })); }}><option value="private">Privado</option><option value="public">Público</option></CustomSelect></div>
      </>}
    </div>
    {options && remoteMode && <div className="creation-account-note"><small>Conta GitHub conectada: <b>{options.account.login ?? 'Não confirmada'}</b>. O repositório será criado para o proprietário selecionado.</small></div>}
    {options?.prerequisites.map((item) => <OperatorDiagnosticCard key={item.code} code={item.code} state="blocked" cause={item.message} recovery={item.recovery} />)}
    {options && (options.prerequisites.length > 0 || modeCapability?.available === false) && <a href="#principal/configuracao">Corrigir condições globais na Configuração</a>}
    {planError && <div className="read-state" role="alert">{planError}</div>}
    <div className="form-actions creation-form-footer dialog-actions"><p id="creation-plan-guidance">{missingFields.length ? `Preencha: ${missingFields.join(', ')}.` : !options ? 'Aguarde a consulta das opções de criação.' : uncertain ? 'Consulte a criação sem confirmação antes de continuar.' : modeCapability?.available !== true ? 'Resolva a indisponibilidade desta modalidade para continuar.' : !form.templateId ? 'Selecione um template disponível.' : 'O próximo passo permite revisar o plano antes de criar.'}</p><button type="submit" className="primary" aria-describedby="creation-plan-guidance" disabled={!options || planning || uncertain || missingFields.length > 0 || !form.templateId || modeCapability?.available !== true}>{planning ? 'Preparando plano…' : 'Revisar plano'}</button></div>
  </form>;
}

export function CreationResult({ creationId, load, onRefresh, onOpenProject, onNewPlan, canReconcile, reconciling, reconcileUncertain, reconcileNotice, onReconcile, onConsultReconcile }: {
  creationId: string;
  onNewPlan?: (() => void) | undefined;
  load: CreationLoad; onRefresh: () => void; onOpenProject: (projectId: string) => void; canReconcile: boolean; reconciling: boolean; reconcileUncertain: boolean; reconcileNotice: string; onReconcile: () => void; onConsultReconcile: () => void;
}) {
  if (load.status === 'loading' || (load.status === 'ready' && load.view.creation.id !== creationId) || (load.status === 'error' && load.creationId !== creationId)) return <section className="creation-flow" aria-busy="true"><p role="status">Consultando a criação…</p></section>;
  if (load.status === 'error') return <section className="creation-flow"><div className="read-state" role="alert">{load.message}</div><p>A identidade da criação permanece na URL. Consulte novamente quando o controlador estiver acessível.</p><button type="button" onClick={onRefresh}>Tentar consulta</button></section>;
  const { creation, confirmed_effects: confirmedEffects, pending_effects: pendingEffects, prerequisites, diagnostics, board_name: boardName, board_url: boardUrl, next_action: nextAction } = load.view;
  const complete = creation.state === 'completed';
  const heading = complete ? 'Criação concluída' : creation.state === 'partial' ? 'Criação parcial' : creation.state === 'failed' ? 'Criação falhou' : 'Criação em andamento';
  const visibleEffects = visibleCreationEffects(load.view);
  return <section className="creation-flow" aria-labelledby="creation-result-title">
    {load.error && <div role="alert">{load.error}<p>Resultado anterior. Atualize a leitura antes de uma nova ação.</p></div>}
    <div className={`creation-result-banner ${complete ? 'is-complete' : creation.state === 'partial' || creation.state === 'failed' ? 'is-problem' : ''}`}><span className="eyebrow">{creation.plan.input.name}</span><h3 id="creation-result-title">{heading}</h3><p>{complete ? 'O projeto foi criado e cadastrado. Abra sua configuração para conferir os pré-requisitos e preparar uma issue.' : 'O trabalho confirmado foi preservado. Confira as etapas pendentes e consulte novamente antes de continuar.'}</p></div>
    <dl className="creation-result-grid"><div><dt>Pasta</dt><dd><code>{creation.plan.destination}</code></dd></div><div><dt>Modalidade</dt><dd>{modeLabels[creation.plan.input.creation_mode]}</dd></div><div><dt>Branch-base</dt><dd>{creation.plan.input.base_branch}</dd></div><div><dt>Conta</dt><dd>{creation.plan.account.login ?? 'Não confirmada'}</dd></div>
      <div><dt>Quadro Kanban</dt><dd>{boardName ?? 'Aguardando confirmação'}</dd>{boardUrl && <a href={boardUrl} target="_blank" rel="noreferrer">Abrir quadro</a>}</div>
      <div><dt>Próxima ação</dt><dd>{{ wait: 'Aguardar conclusão', reconcile: 'Reconciliar os efeitos incertos', create_new_plan: 'Revisar e autorizar um novo plano', review_effect: 'Revisar o efeito pendente', none: 'Nenhuma ação pendente' }[nextAction]}</dd></div></dl>
    {creation.plan.input.creation_mode === 'local' && <p>O projeto está somente nesta máquina. Confirme um remoto GitHub antes de iniciar uma issue.</p>}
    {creation.plan.input.creation_mode === 'remote_no_push' && <p>O repositório remoto foi solicitado sem envio do commit inicial. Confira os efeitos abaixo; a publicação do conteúdo local ainda precisa ser feita.</p>}
    <div className="creation-progress-grid"><div><h4>Etapas confirmadas</h4><ul>{confirmedEffects.map((item) => <li key={item.step}>{stepLabels[item.step]}: <OperatorState value={item.state} /></li>)}</ul></div><div><h4>Etapas locais pendentes ou incertas</h4><ul>{pendingEffects.map((item) => <li key={item.step}>{stepLabels[item.step]}: <OperatorState value={item.state} /></li>)}</ul>{pendingEffects.length === 0 && <p>Nenhuma etapa local pendente registrada.</p>}</div></div>
    <div className="creation-effect-list"><h4>Efeitos remotos e pendências</h4>{visibleEffects.length === 0 && <p>Nenhum efeito remoto solicitado.</p>}{visibleEffects.map((effect) => <div key={`${effect.kind}:${effect.operation_id}`}><div className="creation-effect-row"><b>{stepLabels[effect.kind] ?? 'Etapa da criação'}</b><span className={`pill ${effect.state === 'confirmed' ? '' : 'warn'}`}><OperatorState value={effect.state} /></span></div><small>{effect.source}</small>{effect.reason && <OperatorDiagnosticCard code={effect.reason} state={effect.state === 'confirmed' ? 'passed' : 'blocked'} />}</div>)}</div>
    {load.view.board_operations.length > 0 && <div className="creation-effect-list"><h4>Quadro Kanban e vínculo</h4>{load.view.board_operations.map((effect) => <div key={effect.operation_id}><div className="creation-effect-row"><b>{stepLabels[effect.kind]}</b><OperatorState value={effect.state} /></div>{effect.reason && <OperatorDiagnosticCard code={effect.reason} state="blocked" />}</div>)}</div>}
    <CreationConditions creationId={creationId} />
    {(creation.diagnostic || diagnostics.length > 0) && <div className="read-state" role="alert"><b>A criação precisa de atenção</b>{[...new Set([creation.diagnostic, ...diagnostics].filter((code): code is string => Boolean(code)))].map(code => <div key={code}><code>{code}</code><OperatorDiagnosticCard code={code} state="blocked" /></div>)}</div>}
    {prerequisites.length > 0 && <div className="notice"><b>Antes de iniciar uma issue</b>{prerequisites.map((item) => <OperatorDiagnosticCard key={item.code} code={item.code} state="blocked" cause={item.message} recovery={item.recovery} projectId={creation.project_id} />)}</div>}

    {reconcileNotice && <div className="read-state" role="status">{reconcileNotice}</div>}
    {onNewPlan && !load.error && <div className="notice"><p>O histórico desta criação será preservado. Uma nova tentativa exige consultar um novo plano e confirmar novamente as ações.</p><button type="button" onClick={onNewPlan}>Revisar novo plano</button></div>}
    <div className="form-actions dialog-actions"><button type="button" onClick={onRefresh}>Consultar criação novamente</button>{canReconcile && !reconcileUncertain && <button type="button" onClick={onReconcile} disabled={reconciling}>{reconciling ? 'Conferindo…' : 'Conferir efeitos preservados'}</button>}{reconcileUncertain && <button type="button" onClick={onConsultReconcile} disabled={reconciling}>{reconciling ? 'Consultando…' : 'Consultar conferência'}</button>}{creation.project_id && <button type="button" className="primary" onClick={() => onOpenProject(creation.project_id!)}>Abrir configuração do projeto</button>}</div>
  </section>;
}
