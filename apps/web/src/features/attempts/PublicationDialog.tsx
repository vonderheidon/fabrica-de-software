import { completePublicationBody, reconcilePublicationBody, authorizeUpgradeBody } from './execution-requests.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { HttpDeliveryDetail as DeliveryDetail, DeliveryMode, HttpEffectView as EffectView, OperationAccepted, OperationView } from '#contracts';
import { HttpError, requestJson, requestJsonWithMetadata } from '../../api/http.js';
import { recordUncertainOperation, resolveUncertainOperation } from '../../api/uncertain-operations.js';
import { UnknownState } from '../../app/OperatorSupport.js';
import { operatorCodeLabel, operatorErrorMessage, operatorState } from '../../app/operator-language.js';

type Props = {
  attemptId: string;
  attemptEtag: string | null;
  delivery: DeliveryDetail;
  effects: readonly EffectView[];
  onRefresh: () => void;
};
type Action = 'complete' | 'reconcile' | 'upgrade';
type PublicationAction = { kind: Action; id: string; accepted: OperationAccepted | null; view: OperationView | null; uncertain: boolean; targetMode?: DeliveryMode };

const modeOrder: readonly DeliveryMode[] = ['icr', 'commit', 'pr'];
const modeLabel: Record<DeliveryMode, string> = { icr: 'ICR', commit: 'ICR + Commit local', pr: 'ICR + Commit local + Pull request' };
const effectLabel: Record<EffectView["kind"], string> = {
  issue_comment: 'Comentário de entrega', project_status: 'Projeção de Status', local_commit: 'Commit local', push: 'Push', pull_request: 'Pull request',
  create_repository: 'Criação do repositório', associate_origin: 'Associação do origin', baseline_push: 'Publicação do baseline',
};

function messageFor(error: unknown): string {
  return error instanceof HttpError ? error.message : 'Não foi possível confirmar a resposta. Consulte a operação original antes de qualquer nova ação.';
}

export function PublicationDialog({ attemptId, attemptEtag, delivery, effects, onRefresh }: Props) {
  const deliveryId = delivery.delivery.id;
  const summary = delivery.publication;
  const authorizedMode = delivery.authorizations.authorized_mode;
  const [action, setAction] = useState<PublicationAction | null>(null);
  const [armedCompletion, setArmedCompletion] = useState<string | null>(null);
  const [armedUpgrade, setArmedUpgrade] = useState<{ mode: DeliveryMode; hash: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectFingerprint = useMemo(() => JSON.stringify({
    deliveryId,
    mode: authorizedMode,
    reviewState: summary.review_state,
    confirmedEffects: summary.confirmed_effects,
    pendingEffects: summary.pending_effects,
    unknownEffects: summary.unknown_effects,
    commit: summary.commit,
    push: summary.push,
    pullRequest: summary.pull_request,
  }), [authorizedMode, deliveryId, summary]);
  const previousFingerprint = useRef(effectFingerprint);
  useEffect(() => {
    if (previousFingerprint.current === effectFingerprint) return;
    previousFingerprint.current = effectFingerprint;
    setArmedCompletion(null);
  }, [effectFingerprint]);

  const upgrades = (summary.upgrades ?? []).filter((upgrade) => modeOrder.indexOf(upgrade.target_mode) > modeOrder.indexOf(authorizedMode));
  const controls = delivery.capabilities;
  const summaryMatchesAuthorization = summary.mode === authorizedMode;
  const canComplete = summaryMatchesAuthorization && controls.complete_publication.available && armedCompletion === effectFingerprint;
  const canReconcile = controls.reconcile_publication.available;

  useEffect(() => {
    let mounted = true;
    const pending = readPendingOperation();
    if (!pending) return () => { mounted = false; };
    void requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(pending)}`).then((view) => {
      if (!mounted || view.resource.type !== 'attempt' || view.resource.id !== attemptId) return;
      setAction({ kind: 'complete', id: pending, accepted: null, view, uncertain: view.state === 'unknown' });
    }).catch(() => { if (mounted) setAction({ kind: 'complete', id: pending, accepted: null, view: null, uncertain: true }); });
    return () => { mounted = false; };
  }, [attemptId]);

  const operationId = action?.id ?? null;
  useEffect(() => {
    if (!operationId) return;
    let mounted = true;
    let timer = 0;
    let count = 0;
    const poll = async (): Promise<void> => {
      try {
        const view = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(operationId)}`);
        if (!mounted) return;
        setAction((current) => current?.id === operationId ? { ...current, view, uncertain: view.state === 'unknown' } : current);
        if (view.state === 'succeeded' || view.state === 'failed') {
          resolveSafely(operationId);
          onRefresh();
          return;
        }
      } catch {
        if (mounted) setAction((current) => current?.id === operationId ? { ...current, uncertain: true } : current);
      }
      if (++count < 31 && mounted) timer = window.setTimeout(() => { void poll(); }, 2_000);
    };
    void poll();
    return () => { mounted = false; window.clearTimeout(timer); };
  }, [operationId, onRefresh]);

  async function send(kind: Action, targetMode?: DeliveryMode): Promise<void> {
    if (action?.uncertain || action?.view?.state === 'accepted' || action?.view?.state === 'running' || action?.view?.state === 'unknown') return;
    const id = crypto.randomUUID();
    setError(null);
    setAction({ kind, id, accepted: null, view: null, uncertain: true, ...(targetMode ? { targetMode } : {}) });
    try { recordUncertainOperation({ operationId: id, kind: 'delivery-publish', recordedAt: Date.now() }); } catch { /* Operation remains in this dialog state. */ }
    const path: `/api/v1/${string}` = kind === 'upgrade'
      ? `/api/v1/attempts/${encodeURIComponent(attemptId)}/publication/authorize-upgrade`
      : `/api/v1/attempts/${encodeURIComponent(attemptId)}/publication/${kind}`;
    const upgrade = upgrades.find((item) => item.target_mode === targetMode);
    if (kind === 'upgrade' && (!targetMode || !upgrade)) { setAction(null); resolveSafely(id); return; }
    const body = kind === 'reconcile' ? reconcilePublicationBody(deliveryId)
      : kind === 'upgrade' && targetMode && upgrade ? authorizeUpgradeBody(deliveryId, authorizedMode, targetMode, upgrade.summary_hash)
        : completePublicationBody(deliveryId, authorizedMode);
    try {
      const headers: Record<string, string> = { 'Idempotency-Key': id };
      if (attemptEtag) headers['If-Match'] = attemptEtag;
      const { data } = await requestJsonWithMetadata<OperationAccepted>(path, { method: 'POST', headers, body: JSON.stringify(body) });
      if (data.operation_id !== id) throw new Error('O recibo não corresponde à operação solicitada.');
      setAction({ kind, id, accepted: data, view: null, uncertain: false, ...(targetMode ? { targetMode } : {}) });
    } catch (reason: unknown) {
      if (reason instanceof HttpError && reason.status < 500) {
        resolveSafely(id);
        setAction(null);
        setError(messageFor(reason));
      } else setAction({ kind, id, accepted: null, view: null, uncertain: true, ...(targetMode ? { targetMode } : {}) });
    }
  }

  const actionState = action?.view?.state ?? (action?.accepted ? 'accepted' : action?.uncertain ? 'unknown' : undefined);
  const actionLabel = action?.kind === 'complete' ? 'Conclusão do modo' : action?.kind === 'reconcile' ? 'Reconciliação' : `Autorização de ${action?.targetMode ? modeLabel[action.targetMode] : 'modo superior'}`;

  return <section className="card publication-panel" aria-labelledby="publication-panel-title">
    <div className="line"><div><span className="eyebrow">Entrega e publicação</span><h3 id="publication-panel-title">Versão e efeitos autorizados</h3></div><button type="button" onClick={onRefresh}>Atualizar estado</button></div>
    {[summary.commit, summary.push, summary.pull_request].some((effect) => effect?.state === 'failed_known') && <p role="alert">Publicação bloqueada. A versão aprovada foi preservada. Consulte o motivo abaixo e, após resolver o impedimento, use Concluir modo autorizado para continuar os efeitos pendentes.</p>}
    <dl className="preparation-facts">
      <div><dt>Versão selecionada</dt><dd>Versão da tentativa</dd></div>
      <div><dt>Conteúdo aprovado</dt><dd>{summary.review_state === 'approved' ? 'Aprovado para esta versão' : 'Ainda sem aprovação'}</dd></div>
      <div><dt>Modo capturado</dt><dd>{modeLabel[delivery.authorizations.captured_mode]}</dd></div>
      <div><dt>Modo autorizado</dt><dd>{modeLabel[delivery.authorizations.authorized_mode]}</dd></div>
      <div><dt>Parecer</dt><dd>{summary.review_state === 'approved' ? 'Aprovado para esta versão' : summary.review_state === 'rejected' ? 'Reprovado nesta versão' : 'Pendente'}</dd></div>
      <div><dt>Conclusão do modo</dt><dd>{summary.local_state === 'completed' ? 'Concluída' : 'Pendente'}</dd></div>
      <div><dt>Efeitos confirmados</dt><dd>{summary.confirmed_effects}</dd></div>
      <div><dt>Efeitos pendentes</dt><dd>{summary.pending_effects}</dd></div>
      <div><dt>Efeitos incertos</dt><dd>{summary.unknown_effects}</dd></div>
    </dl>


    <div className="publication-effects" aria-label="Resultados dos efeitos desta versão">
      {([['Commit local', summary.commit], ['Push', summary.push], ['Pull request', summary.pull_request]] as const).map(([label, value]) => value && <article className="attempt-record" key={label}>
        <h4>{label}</h4><p>Estado: <b>{effectStateLabel(value.state)}</b></p>{!operatorState(value.state).known && <UnknownState value={value.state} />}
        {value.reason && <p className="muted">{operatorCodeLabel(value.reason)}</p>}
        {'receipt' in value && value.receipt?.url && <p><a href={value.receipt.url} target="_blank" rel="noreferrer">Abrir recurso confirmado</a></p>}

      </article>)}
      {effects.map((effect) => <article className="attempt-record" key={effect.operation_id}>
        <h4>{effectLabel[effect.kind]}</h4><p>Estado: <b>{effectStateLabel(effect.state)}</b></p>{!operatorState(effect.state).known && <UnknownState value={effect.state} />}
        {effect.receipt?.url && <p><a href={effect.receipt.url} target="_blank" rel="noreferrer">Abrir recibo confirmado</a></p>}
        {effect.reason && <p>Motivo: {operatorCodeLabel(effect.reason)}</p>}

      </article>)}
      {effects.length === 0 && <p className="muted">Nenhum efeito foi consultado para esta versão.</p>}
    </div>

    {!summaryMatchesAuthorization && <div className="queue-error" role="alert"><p>O resumo da publicação e o modo autorizado diferem. Atualize a tentativa e a versão antes de iniciar qualquer efeito.</p><button type="button" onClick={onRefresh}>Atualizar dados selecionados</button></div>}
    {error && <div className="queue-error" role="alert"><p>{error}</p><button type="button" onClick={() => { setError(null); onRefresh(); }}>Atualizar antes de revisar</button></div>}
    {upgrades.map((upgrade) => {
      const isArmed = armedUpgrade?.mode === upgrade.target_mode && armedUpgrade.hash === upgrade.summary_hash;
      const stale = armedUpgrade?.mode === upgrade.target_mode && armedUpgrade.hash !== upgrade.summary_hash;
      return <div className="notice publication-upgrade" key={upgrade.target_mode}>
        <h4>Aumentar para {modeLabel[upgrade.target_mode]}</h4><p>Os efeitos abaixo ainda não estão autorizados:</p>
        <ul>{upgrade.additional_effects.map((kind) => <li key={kind}>{effectLabel[kind]}</li>)}</ul>
        {!upgrade.capability.available && <><p>Este aumento não está disponível enquanto os pré-requisitos atuais não forem confirmados.</p></>}
        {stale && <p role="alert">O resumo mudou desde sua revisão. Atualize a versão selecionada e revise novamente.</p>}
        {upgrade.capability.available && <><label className="check"><input type="checkbox" checked={isArmed} onChange={(event) => setArmedUpgrade(event.currentTarget.checked ? { mode: upgrade.target_mode, hash: upgrade.summary_hash } : null)} />Autorizo os efeitos adicionais deste resumo.</label>
          <button type="button" className="primary" disabled={!summaryMatchesAuthorization || !isArmed || !attemptEtag || actionState === 'accepted' || actionState === 'running' || actionState === 'unknown' || actionState === 'succeeded'} onClick={() => void send('upgrade', upgrade.target_mode)}>Autorizar aumento uma vez</button></>}
      </div>;
    })}

    {controls.complete_publication.available && <div className="notice publication-completion">
      <h4>Concluir {modeLabel[authorizedMode]}</h4>
      <ul>{completionEffects(authorizedMode).map((item) => <li key={item}>{item}</li>)}</ul>
      <label className="check"><input type="checkbox" checked={armedCompletion === effectFingerprint} onChange={(event) => setArmedCompletion(event.currentTarget.checked ? effectFingerprint : null)} />Confirmo o início somente dos efeitos pendentes deste modo e versão.</label>
      <button type="button" className="primary" disabled={!canComplete || !attemptEtag || actionState === 'accepted' || actionState === 'running' || actionState === 'unknown'} onClick={() => void send('complete')}>Concluir modo autorizado</button>
    </div>}
    {!controls.complete_publication.available && <div className="notice"><p>A conclusão ainda não está disponível porque há pré-requisitos pendentes.</p></div>}
    {canReconcile && <button type="button" onClick={() => void send('reconcile')} disabled={actionState === 'accepted' || actionState === 'running' || actionState === 'unknown'}>Reconciliar efeitos desta versão</button>}
    {!canReconcile && <div className="notice"><p>A reconciliação não está disponível neste momento.</p></div>}
    {action && <div className={actionState === 'unknown' || actionState === 'failed' ? 'queue-error' : 'notice'} role="status">
      <b>{actionLabel} · {effectStateLabel(actionState ?? 'unknown')}</b>
      <p>{action.accepted ? 'Aceitação recebida.' : 'Resposta sem confirmação; consulte o resultado original antes de qualquer nova ação.'}</p>
      {action.view?.error && <p>{operatorErrorMessage(action.view.error.code, action.view.error.message)}</p>}
      {actionState && !operatorState(actionState).known && <UnknownState value={actionState} />}

      {actionState === 'succeeded' && <p>O estado do modo é consultável. A aprovação da revisão, sozinha, não significa PR criada ou publicação concluída.</p>}
      {actionState === 'unknown' && <button type="button" onClick={() => void inspectOperation(action.id)}>Consultar operação original</button>}
    </div>}
  </section>;

  async function inspectOperation(id: string): Promise<void> {
    try {
      const view = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(id)}`);
      if (view.resource.type !== 'attempt' || view.resource.id !== attemptId) return;
      if (view.state === 'succeeded' || view.state === 'failed') resolveSafely(id);
      setAction((current) => current?.id === id ? { ...current, view, uncertain: view.state === 'unknown' } : current);
      onRefresh();
    } catch (reason: unknown) {
      setError(messageFor(reason));
    }
  }
}

function readPendingOperation(): string | null {
  try {
    const pending = window.sessionStorage.getItem('factory.uncertain-operations.v1');
    if (!pending) return null;
    const parsed: unknown = JSON.parse(pending);
    if (!Array.isArray(parsed)) return null;
    const record = parsed.find((item) => typeof item === 'object' && item !== null && 'kind' in item && item.kind === 'delivery-publish' && 'operationId' in item && typeof item.operationId === 'string');
    return record && typeof record === 'object' && 'operationId' in record && typeof record.operationId === 'string' ? record.operationId : null;
  } catch { return null; }
}

function resolveSafely(id: string): void { try { resolveUncertainOperation(id); } catch { /* Keep the operation visible in memory. */ } }
function effectStateLabel(state: string): string {
  if (state === 'failed_known') return 'Falha confirmada';
  if (state === 'not_requested') return 'Não solicitado';
  return operatorState(state).label;
}
function completionEffects(mode: DeliveryMode): string[] {
  if (mode === 'icr') return ['Registrar comentário identificado com a versão e as evidências', 'Projetar o Status autorizado quando aplicável'];
  if (mode === 'commit') return ['Criar ou reconciliar o commit local aprovado', 'Registrar o comentário da entrega', 'Projetar o Status autorizado quando aplicável'];
  return ['Confirmar commit e push da tree aprovada', 'Criar ou reconciliar a pull request', 'Projetar o Status autorizado quando aplicável'];
}
