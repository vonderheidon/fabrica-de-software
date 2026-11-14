import { knownProjectDeletion, rememberProjectDeletion, useProjectDeletionRestriction } from '../projects/ProjectDeletionPendingNotice.js';
import type { ProjectDetail } from '#contracts';
import { completePublicationBody, reconcilePublicationBody, authorizeUpgradeBody } from './execution-requests.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { HttpDeliveryDetail as DeliveryDetail, DeliveryMode, HttpEffectView as EffectView, OperationAccepted, OperationView } from '#contracts';
import { HttpError, requestJson, requestJsonWithMetadata } from '../../api/http.js';
import { readUncertainOperations, recordUncertainOperation, resolveUncertainOperation } from '../../api/uncertain-operations.js';
import { DeliverySummary } from './DeliverySummary.js';
import { deliveryModeLabel as modeLabel } from '../../app/delivery-modes.js';
import { operatorErrorMessage, operatorState } from '../../app/operator-language.js';

type Props = {
  projectId: string;
  attemptId: string;
  attemptEtag: string | null;
  delivery: DeliveryDetail;
  current: boolean;
  onRefresh: () => void;
};
type Action = 'complete' | 'reconcile' | 'upgrade';
type PublicationAction = { kind: Action; id: string; accepted: OperationAccepted | null; view: OperationView | null; uncertain: boolean; submitting?: boolean; targetMode?: DeliveryMode };

const modeOrder: readonly DeliveryMode[] = ['icr', 'commit', 'pr'];
const effectLabel: Record<EffectView["kind"], string> = {
  issue_comment: 'Comentário de entrega', issue_body: 'Critérios marcados na issue', project_status: 'Projeção de Status', local_commit: 'Commit local', push: 'Push', pull_request: 'Pull request',
  create_repository: 'Criação do repositório', associate_origin: 'Associação do origin', baseline_push: 'Publicação do baseline',
};

function messageFor(error: unknown): string {
  return error instanceof HttpError ? error.message : 'Não foi possível confirmar a resposta. Consulte a operação original antes de qualquer nova ação.';
}

export function PublicationDialog({ projectId, attemptId, attemptEtag, delivery, current, onRefresh }: Props) {
  const deletionRestricted = useProjectDeletionRestriction(projectId);
  const [projectChecked, setProjectChecked] = useState(false);
  useEffect(() => {
    let active = true;
    setProjectChecked(false);
    void requestJson<ProjectDetail>(`/api/v1/projects/${encodeURIComponent(projectId)}`).then((data) => {
      if (!active) return;
      rememberProjectDeletion(projectId, data.deletion); setProjectChecked(true);
      window.dispatchEvent(new Event('factory-project-deletion-pending'));
    }).catch(() => { /* A failed lookup cannot authorize publication. */ });
    return () => { active = false; };
  }, [projectId]);
  const deliveryId = delivery.delivery.id;
  const summary = delivery.publication;
  const authorizedMode = delivery.authorizations.authorized_mode;
  const [action, setAction] = useState<PublicationAction | null>(null);
  const sending = useRef(false);
  const sentFingerprint = useRef<string | null>(null);
  const [restoring, setRestoring] = useState(true);
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
  useEffect(() => {
    if (action?.view?.state === 'succeeded' && sentFingerprint.current !== effectFingerprint) {
      sending.current = false; setAction(null);
    }
  }, [effectFingerprint, action?.view?.state]);

  const upgrades = (summary.upgrades ?? []).filter((upgrade) => modeOrder.indexOf(upgrade.target_mode) > modeOrder.indexOf(authorizedMode));
  const controls = delivery.capabilities;
  const summaryMatchesAuthorization = summary.mode === authorizedMode;
  const canComplete = summaryMatchesAuthorization && controls.complete_publication.available;
  const canReconcile = controls.reconcile_publication.available;

  useEffect(() => {
    let mounted = true;
    setRestoring(true);
    const pending = readUncertainOperations().filter(item => item.kind === 'delivery-publish' &&
      (!item.attemptId || item.attemptId === attemptId) && (!item.deliveryId || item.deliveryId === deliveryId));
    void (async () => {
      for (const item of pending) {
        try {
          const view = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(item.operationId)}`);
          if (!mounted) return;
          if (view.resource.type !== 'attempt' || view.resource.id !== attemptId) continue;
          sending.current = !['succeeded','failed'].includes(view.state);
          if (!sending.current) resolveSafely(item.operationId);
          setAction({ kind:'complete',id:item.operationId,accepted:null,view,uncertain:view.state === 'unknown' });
          break;
        } catch {
          if (!mounted) return;
          sending.current = true;
          setAction({ kind:'complete',id:item.operationId,accepted:null,view:null,uncertain:true }); break;
        }
      }
      if (mounted) setRestoring(false);
    })();
    return () => { mounted = false; };
  }, [attemptId, deliveryId]);

  const operationId = action?.submitting ? null : action?.id ?? null;
  useEffect(() => {
    if (!operationId) return;
    let mounted = true;
    let timer = 0;
    let count = 0;
    const poll = async (): Promise<void> => {
      try {
        const view = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(operationId)}`);
        if (!mounted || view.resource.type !== 'attempt' || view.resource.id !== attemptId) return;
        setAction((current) => current?.id === operationId ? { ...current, view, uncertain: view.state === 'unknown' } : current);
        if (view.state === 'succeeded' || view.state === 'failed') {
          sending.current = false;
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
  }, [operationId, attemptId, onRefresh]);

  async function send(kind: Action, targetMode?: DeliveryMode): Promise<void> {
    if (!current || error || restoring || sending.current || !projectChecked || !summaryMatchesAuthorization || !attemptEtag || knownProjectDeletion(projectId)) return;
    const selectedUpgrade = upgrades.find(item => item.target_mode === targetMode);
    if (kind === 'upgrade' && !selectedUpgrade?.capability.available || kind === 'complete' && !canComplete || kind === 'reconcile' && !canReconcile) return;
    if (action?.uncertain || action?.view?.state === 'accepted' || action?.view?.state === 'running' || action?.view?.state === 'unknown') return;
    sending.current = true;
    sentFingerprint.current = effectFingerprint;
    const id = crypto.randomUUID();
    setError(null);
    setAction({ kind, id, accepted: null, view: null, uncertain: false, submitting: true, ...(targetMode ? { targetMode } : {}) });
    try { recordUncertainOperation({ operationId: id, kind: 'delivery-publish', recordedAt: Date.now(),attemptId,deliveryId }); } catch { /* Operation remains in this dialog state. */ }
    const path: `/api/v1/${string}` = kind === 'upgrade'
      ? `/api/v1/attempts/${encodeURIComponent(attemptId)}/publication/authorize-upgrade`
      : `/api/v1/attempts/${encodeURIComponent(attemptId)}/publication/${kind}`;
    const upgrade = upgrades.find((item) => item.target_mode === targetMode);
    if (kind === 'upgrade' && (!targetMode || !upgrade)) { sending.current = false; setAction(null); resolveSafely(id); return; }
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
        sending.current = false;
        resolveSafely(id);
        setAction(null);
        setError(messageFor(reason));
      } else setAction({ kind, id, accepted: null, view: null, uncertain: true, ...(targetMode ? { targetMode } : {}) });
    }
  }

  const actionState = action?.submitting ? 'submitting' : action?.uncertain ? 'unknown' : action?.view?.state ?? (action?.accepted ? 'accepted' : undefined);
  const busy = Boolean(error) || restoring || !current || !attemptEtag || ['submitting','accepted','running','unknown','succeeded'].includes(actionState ?? '');
  const actionLabel = action?.kind === 'complete' ? 'Conclusão do modo' : action?.kind === 'reconcile' ? 'Reconciliação' : `Autorização de ${action?.targetMode ? modeLabel[action.targetMode] : 'modo superior'}`;

  return <section className="card publication-panel" aria-label="Entrega da versão selecionada">
    <DeliverySummary value={delivery.delivery_summary} stale={!current} />
    {(deletionRestricted || !projectChecked) && <p role="status">Publicação indisponível até confirmar o cadastro. Consulte a configuração do projeto.</p>}
    <h4>Continuar entrega</h4>
    {!summaryMatchesAuthorization && <div className="queue-error" role="alert"><p>O resumo da publicação e o modo autorizado diferem. Atualize a tentativa e a versão antes de iniciar qualquer efeito.</p><button type="button" onClick={onRefresh}>Atualizar dados selecionados</button></div>}
    {error && <div className="queue-error" role="alert"><p>{error}</p><button type="button" onClick={() => { setError(null); onRefresh(); }}>Atualizar antes de revisar</button></div>}
    <div className="delivery-continuation">
      {upgrades.map(upgrade => <div className="publication-upgrade" key={upgrade.target_mode}>
        <p>Branch de destino: {upgrade.delivery_branch ? `${upgrade.delivery_branch.name} (${upgrade.delivery_branch.kind === 'existing' ? 'existente' : 'nova'})` : 'nova branch com nome automático'}.</p>
        <p>{upgrade.additional_effects.map(kind => effectLabel[kind]).join(' · ')}.</p>
        {upgrade.publication_target && <p className="muted">Intenção capturada: {upgrade.publication_target.selection.kind === 'clone'
          ? 'clonar em ' + upgrade.publication_target.selection.destination : 'usar clone em ' + upgrade.publication_target.selection.path}.</p>}
        {!upgrade.capability.available && <p>{upgrade.capability.reason_code === 'PUBLICATION_TARGET_REQUIRED'
          ? 'Destino não capturado. Prepare outra tentativa com um destino local para entregar por commit ou PR.'
          : 'Há pré-requisitos pendentes. Atualize a tentativa antes de continuar.'}</p>}
        <button type="button" className="primary" disabled={busy || deletionRestricted || !projectChecked || !summaryMatchesAuthorization || !upgrade.capability.available}
          onClick={() => void send('upgrade',upgrade.target_mode)}>{upgrade.target_mode === 'pr' ? authorizedMode === 'commit' ? 'Publicar branch e abrir PR' : 'Integrar, criar commit e abrir PR' : 'Integrar e criar commit'}</button>
      </div>)}
      {controls.complete_publication.available && <div className="publication-completion">
        <p>Executar somente o que falta: {delivery.delivery_summary.pending_effects.map(kind => effectLabel[kind as EffectView['kind']] ?? 'efeito da entrega').join(' · ') || 'conferir os recibos e concluir o registro'}.</p>
        <button type="button" className="primary" disabled={busy || deletionRestricted || !projectChecked || !canComplete} onClick={() => void send('complete')}>Concluir modo autorizado</button>
      </div>}
      {canReconcile && <button type="button" onClick={() => void send('reconcile')} disabled={busy || deletionRestricted || !projectChecked}>Reconciliar efeitos desta versão</button>}
    </div>
    {action && <div className={actionState === 'unknown' || actionState === 'failed' ? 'queue-error' : 'notice'} role="status" aria-busy={['submitting','accepted','running'].includes(actionState ?? '')}>
      <b>{actionLabel} · {actionState === 'submitting' ? 'Enviando solicitação' : ['accepted','running'].includes(actionState ?? '') ? 'Em andamento' : effectStateLabel(actionState ?? 'unknown')}</b>
      {actionState === 'submitting' && <p>Enviando autorização. Aguarde a confirmação do controlador.</p>}
      {['accepted','running'].includes(actionState ?? '') && <p>Aceitação recebida. Acompanhando a operação automaticamente.</p>}
      {actionState === 'unknown' && <p>Resposta sem confirmação; consulte o resultado original antes de qualquer nova ação.</p>}
      {action.view?.error && <p>{operatorErrorMessage(action.view.error.code, action.view.error.message)}</p>}

      {actionState === 'succeeded' && <p>Operação concluída; consultando o resultado atualizado desta versão.</p>}
      {actionState === 'unknown' && <button type="button" onClick={() => void inspectOperation(action.id)}>Consultar operação original</button>}
    </div>}
  </section>;

  async function inspectOperation(id: string): Promise<void> {
    try {
      const view = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(id)}`);
      if (view.resource.type !== 'attempt' || view.resource.id !== attemptId) { sending.current = false; setAction(null); return; }
      if (view.state === 'succeeded' || view.state === 'failed') { sending.current = false; resolveSafely(id); }
      setAction((current) => current?.id === id ? { ...current, view, uncertain: view.state === 'unknown' } : current);
      onRefresh();
    } catch (reason: unknown) {
      setError(messageFor(reason));
    }
  }
}

function resolveSafely(id: string): void { try { resolveUncertainOperation(id); } catch { /* Keep the operation visible in memory. */ } }
function effectStateLabel(state: string): string {
  if (state === 'failed_known') return 'Falha confirmada';
  if (state === 'not_requested') return 'Não solicitado';
  return operatorState(state).label;
}
