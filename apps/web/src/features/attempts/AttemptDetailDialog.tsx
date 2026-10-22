import type { ControllerEventNotice } from '../../app/useControllerEvents.js';
import { setAttemptSelection } from './execution-requests.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HttpArtifact as Artifact, HttpAttemptDetail as AttemptDetail, HttpAttemptResource as AttemptResource, HttpDeliveryDiff as DeliveryDiff, HttpDetailItem as DetailItem, HttpDetailPage as DetailPage, HttpDetailSection as DetailSection, HttpEffectView as EffectView, HttpQuestion as Question } from '#contracts';
import { HttpError, requestJsonWithMetadata, requestText } from '../../api/http.js';
import { QuestionDecisionCard } from './QuestionDecisionCard.js';
import { useAttempt } from './useAttempt.js';
import { useAttemptActions } from './useAttemptActions.js';
import { useDelivery } from './useDelivery.js';
import { PublicationDialog } from './PublicationDialog.js';
import { formatMinuteValue } from '../projects/time-minutes.js';
import { OperatorDiagnosticCard, OperatorState, UnknownState } from '../../app/OperatorSupport.js';
import { operatorCodeLabel, operatorErrorMessage, operatorFactLabel, operatorState, operatorVisibleFactValue } from '../../app/operator-language.js';

const sections: readonly DetailSection[] = ['rounds', 'passages', 'criteria', 'checks', 'reviews', 'findings', 'questions', 'effects', 'resources'];
const labels: Record<DetailSection, string> = {
  rounds: 'Rodadas e versões', passages: 'Passagens', criteria: 'Critérios e evidências', checks: 'Checks e logs',
  reviews: 'Pareceres', findings: 'Achados e resoluções', questions: 'Perguntas', effects: 'Efeitos remotos', resources: 'Recursos e limpeza',
};
type SectionErrorDetails = { code: string; requestId: string | null; facts: Readonly<Record<string, string | number | boolean | null>> | null; affectedRequirements: readonly string[] } | null;
type SectionState = { page: DetailPage | null; error: string | null; errorDetails: SectionErrorDetails; loading: boolean };
type EvidenceState = { loading: boolean; text: string | null; error: string | null; errorDetails: SectionErrorDetails };
type DiffState = { loading: boolean; value: DeliveryDiff | null; error: string | null; errorDetails: SectionErrorDetails };
type DetailProps = {
  attemptId: string;
  selectedRound: string | null;
  selectedDeliveryId: string | null;
  onSelectionChange: (roundId: string | null, deliveryId: string | null) => void;
  onRetry: (attempt: AttemptDetail) => void;
};

function emptySections(): Record<DetailSection, SectionState> {
  return Object.fromEntries(sections.map((section) => [section, { page: null, error: null, errorDetails: null, loading: true }])) as Record<DetailSection, SectionState>;
}
function sectionStateFor(states: Record<DetailSection, SectionState>, section: DetailSection): SectionState {
  return states[section] ?? { page: null, error: null, errorDetails: null, loading: false };
}
function sectionErrorDetails(error: unknown): SectionErrorDetails {
  return error instanceof HttpError
    ? { code: error.code, requestId: error.requestId, facts: error.facts, affectedRequirements: error.affectedRequirements }
    : null;
}

function asRecord(item: DetailItem): Record<string, unknown> { return item as unknown as Record<string, unknown>; }
function evidenceText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ['evidence', 'explanation', 'summary', 'text', 'comment']) {
    const candidate = record[key];
    if (typeof candidate === 'string') return candidate;
  }
  return null;
}
function formatMeasured(value: AttemptDetail["measurements"]["active_time"]): string {
  return value.state === 'measured' ? `${value.value} ${value.unit}` : `${operatorState(value.state).label} · ${operatorCodeLabel(value.reason)}`;
}
function formatLimit(value: AttemptDetail["measurements"]["active_limit"]): string {
  return value.state === 'configured' ? `${value.value} ${value.unit}` : 'Não configurado';
}
function formatActiveLimit(value: AttemptDetail["measurements"]["active_limit"]): string {
  if (value.state !== 'configured') return formatLimit(value);
  return value.unit === 'ms' ? formatMinuteValue(value.value) : formatLimit(value);
}

export function AttemptDetailDialog({ attemptId, selectedRound, selectedDeliveryId, onSelectionChange, onRetry }: DetailProps) {
  const [sectionStates, setSectionStates] = useState<Record<DetailSection, SectionState>>(emptySections);
  const [reload, setReload] = useState(0);
  const [diff, setDiff] = useState<DiffState>({ loading: false, value: null, error: null, errorDetails: null });
  const [evidence, setEvidence] = useState<Record<string, EvidenceState>>({});

  const selectedQuery = useMemo(() => {
    const query = new URLSearchParams();
    setAttemptSelection(query, selectedRound, selectedDeliveryId);
    const value = query.toString();
    return value ? `?${value}` : '';
  }, [selectedRound, selectedDeliveryId]);
  const { attempt, etag: attemptEtag, error: attemptError } = useAttempt(attemptId, selectedQuery, reload);
  const attemptMatchesRound = !selectedRound || String(attempt?.selected_round) === selectedRound;
  const effectiveDeliveryId = selectedDeliveryId ?? (attemptMatchesRound ? attempt?.selected_delivery_id : null) ?? null;
  const { delivery, status: deliveryState, error: deliveryError } = useDelivery(effectiveDeliveryId, reload + (attempt?.revision ?? 0));
  const actions = useAttemptActions(attemptId, attempt, attemptEtag, effectiveDeliveryId, delivery?.delivery.capture_state === 'failed');
  const [confirmedResources, setConfirmedResources] = useState<Record<string, string>>({});
  const refreshDetail = useCallback(() => setReload((value) => value + 1), []);
  const sectionIdentity = `${attemptId}:${selectedRound ?? ''}:${effectiveDeliveryId ?? ''}`;
  const sectionIdentityRef = useRef('');
  useEffect(() => { setDiff({ loading: false, value: null, error: null, errorDetails: null }); setEvidence({}); }, [effectiveDeliveryId]);

  useEffect(() => {
    const onEvent = (event: Event): void => {
      const detail = (event as CustomEvent<Partial<ControllerEventNotice>>).detail;
      if (detail?.attempt_id === attemptId || detail?.entity?.type === 'attempt' && detail.entity.id === attemptId) refreshDetail();
    };
    const onResync = (): void => refreshDetail();
    window.addEventListener('factory-controller-event', onEvent);
    window.addEventListener('factory-controller-resync', onResync);
    return () => {
      window.removeEventListener('factory-controller-event', onEvent);
      window.removeEventListener('factory-controller-resync', onResync);
    };
  }, [attemptId, refreshDetail]);

  useEffect(() => {
    let active = true;
    const controllers = sections.map(() => new AbortController());
    if (sectionIdentityRef.current !== sectionIdentity) {
      sectionIdentityRef.current = sectionIdentity;
      setSectionStates(emptySections());
    } else {
      setSectionStates((current) => Object.fromEntries(sections.map((section) => [section, { ...sectionStateFor(current, section), loading: true }])) as Record<DetailSection, SectionState>);
    }
    const sectionQuery = (section: DetailSection): string => {
      const query = new URLSearchParams({ section, limit: '25' });
      setAttemptSelection(query, selectedRound, effectiveDeliveryId);
      return query.toString();
    };
    void Promise.all(sections.map(async (section, index) => {
      try {
        const requestController = controllers[index];
        if (!requestController) return;
        const { data } = await requestJsonWithMetadata<AttemptDetail>(`/api/v1/attempts/${encodeURIComponent(attemptId)}?${sectionQuery(section)}`, { signal: requestController.signal });
        if (active) setSectionStates((current) => ({ ...current, [section]: { page: data.details, error: null, errorDetails: null, loading: false } }));
      } catch (reason: unknown) {
        if (!active || (reason instanceof DOMException && reason.name === 'AbortError')) return;
        setSectionStates((current) => ({ ...current, [section]: { ...sectionStateFor(current, section), error: reason instanceof HttpError ? reason.message : 'Não foi possível carregar esta seção.', errorDetails: sectionErrorDetails(reason), loading: false } }));
      }
    }));
    return () => { active = false; controllers.forEach((controller) => controller.abort()); };
  }, [attemptId, selectedRound, effectiveDeliveryId, reload, sectionIdentity]);

  function loadMore(section: DetailSection): void {
    const current = sectionStateFor(sectionStates, section);
    const cursor = current.page?.next_cursor;
    if (!cursor || current.loading) return;
    setSectionStates((state) => ({ ...state, [section]: { ...sectionStateFor(state, section), loading: true, error: null, errorDetails: null } }));
    const query = new URLSearchParams({ section, limit: '25', cursor });
    setAttemptSelection(query, selectedRound, effectiveDeliveryId);
    void requestJsonWithMetadata<AttemptDetail>(`/api/v1/attempts/${encodeURIComponent(attemptId)}?${query}`).then(({ data }) => {
      const nextPage = data.details;
      if (!nextPage) return;
      setSectionStates((state) => {
        const page = sectionStateFor(state, section).page;
        if (!page) return state;
        return { ...state, [section]: { page: { ...nextPage, items: [...page.items, ...nextPage.items] }, error: null, errorDetails: null, loading: false } };
      });
    }).catch((reason: unknown) => setSectionStates((state) => ({ ...state, [section]: { ...sectionStateFor(state, section), error: reason instanceof HttpError ? reason.message : 'Não foi possível continuar esta seção.', errorDetails: sectionErrorDetails(reason), loading: false } })));
  }

  function retrySection(section: DetailSection): void {
    const current = sectionStateFor(sectionStates, section);
    if (current.page?.next_cursor) { loadMore(section); return; }
    setSectionStates((state) => ({ ...state, [section]: { ...sectionStateFor(state, section), loading: true, error: null, errorDetails: null } }));
    const query = new URLSearchParams({ section, limit: '25' });
    setAttemptSelection(query, selectedRound, effectiveDeliveryId);
    void requestJsonWithMetadata<AttemptDetail>(`/api/v1/attempts/${encodeURIComponent(attemptId)}?${query}`).then(({ data }) => {
      setSectionStates((state) => ({ ...state, [section]: { page: data.details, loading: false, error: null, errorDetails: null } }));
    }).catch((reason: unknown) => setSectionStates((state) => ({ ...state, [section]: { ...sectionStateFor(state, section), error: reason instanceof HttpError ? reason.message : 'Não foi possível carregar esta seção.', errorDetails: sectionErrorDetails(reason), loading: false } })));
  }

  function loadDiff(cursor?: string): void {
    if (!effectiveDeliveryId || diff.loading) return;
    setDiff((current) => ({ ...current, loading: true, error: null, errorDetails: null }));
    const query = new URLSearchParams({ limit: '25' });
    if (cursor) query.set('cursor', cursor);
    void requestJsonWithMetadata<DeliveryDiff>(`/api/v1/deliveries/${encodeURIComponent(effectiveDeliveryId)}/diff?${query}`).then(({ data }) => {
      setDiff((current) => ({ loading: false, error: null, errorDetails: null, value: current.value && cursor ? { ...data, entries: [...current.value.entries, ...data.entries] } : data }));
    }).catch((reason: unknown) => setDiff((current) => ({ ...current, loading: false, error: reason instanceof HttpError && reason.code === 'DELIVERY_INTEGRITY_FAILED'
      ? 'A integridade da versão capturada falhou; o diff foi recusado.'
      : reason instanceof HttpError ? reason.message : 'Não foi possível carregar o diff da versão.', errorDetails: sectionErrorDetails(reason) })));
  }

  async function loadEvidence(artifact: Artifact): Promise<void> {
    setEvidence((current) => ({ ...current, [artifact.id]: { loading: true, text: current[artifact.id]?.text ?? null, error: null, errorDetails: null } }));
    try {
      const text = await requestText(`/api/v1/artifacts/${encodeURIComponent(artifact.id)}`);
      setEvidence((current) => ({ ...current, [artifact.id]: { loading: false, text, error: null, errorDetails: null } }));
    } catch (reason: unknown) {
      const message = reason instanceof HttpError && reason.code === 'ARTIFACT_INTEGRITY_FAILED' ? 'A integridade desta evidência falhou; o conteúdo foi recusado.'
        : reason instanceof HttpError && reason.code === 'ARTIFACT_MISSING' ? 'A evidência não está disponível.'
          : reason instanceof HttpError ? reason.message : 'Não foi possível carregar a evidência.';
      setEvidence((current) => ({ ...current, [artifact.id]: { loading: false, text: null, error: message, errorDetails: sectionErrorDetails(reason) } }));
    }
  }

  const roundItems = sectionStateFor(sectionStates, 'rounds').page?.items ?? [];
  const passageItems = sectionStateFor(sectionStates, 'passages').page?.items ?? [];
  const selectedRoundValue = selectedRound ?? String(attempt?.selected_round ?? 1);
  const currentCaptured = deliveryState === 'ready' && delivery?.delivery.capture_state === 'captured';
  const producerPassage = delivery ? passageItems.map(asRecord).find((item) => item.id === delivery.delivery.producer_passage_id) : undefined;
  const producerResult = actions.producerResult;
  const captureRetryEligible = Boolean(delivery && attempt && producerResult && producerResult.binding.attempt_id === attemptId && producerResult.binding.passage_id === delivery.delivery.producer_passage_id && producerResult.binding.delivery_version === delivery.delivery.id && producerResult.result.writes_stopped && producerPassage?.state === 'ready' && producerPassage.tracking === 'tracked' && delivery.delivery.capture_state === 'failed' && !['CAPTURE_CONTINUITY_REVOKED', 'CAPTURE_REF_CONFLICT', 'DELIVERY_INTEGRITY_FAILED'].includes(delivery.delivery.diagnostic ?? '') && attempt.phase === 'verifying' && attempt.result === null && attempt.tracking === 'tracked' && (attempt.suspension === null || attempt.suspension === 'CAPTURE_FAILED') && (attempt.pending_question_id === null || attempt.pending_question_id === undefined));

  return <section className="attempt-detail" aria-label="Detalhe histórico da tentativa">
    {attemptError && <div className="queue-error" role="alert"><h3>Falha ao consultar esta tentativa</h3><p>{attemptError}</p><p><strong>Próxima ação:</strong> consulte novamente antes de agir sobre os dados anteriores.</p><button type="button" onClick={() => setReload((value) => value + 1)}>Consultar novamente</button></div>}
    {!attempt && !attemptError && <p role="status">Carregando o detalhe da tentativa…</p>}
    {attempt && <>
      <div className="attempt-detail-heading"><div className="eyebrow">Detalhe da tentativa</div><h3>#{attempt.issue.number} · {attempt.issue.title}</h3><div className="row"><a href={attempt.issue.url} target="_blank" rel="noreferrer">Abrir issue no GitHub</a><a href={`#principal/registros?attemptId=${encodeURIComponent(attempt.id)}`}>Registros e diagnóstico</a></div></div>
      <div className="attempt-version-controls"><label htmlFor="attempt-round">Rodada
        <select id="attempt-round" value={selectedRoundValue} onChange={(event) => {
          const value = event.currentTarget.value;
          const selected = roundItems.map(asRecord).find((item) => String(item.round) === value);
          onSelectionChange(value, typeof selected?.delivery_id === 'string' ? selected.delivery_id : null);
        }}>
          {Array.from({ length: attempt.round }, (_, index) => String(index + 1)).map((round) => <option key={round} value={round}>Rodada {round}</option>)}
        </select>
      </label><label htmlFor="attempt-version">Versão
        <select id="attempt-version" value={effectiveDeliveryId ?? ''} onChange={(event) => onSelectionChange(selectedRoundValue, event.currentTarget.value || null)}>
          {!effectiveDeliveryId && <option value="">Versão planejada ou não capturada</option>}
          {roundItems.map(asRecord).filter((item) => String(item.round) === selectedRoundValue && typeof item.delivery_id === 'string').map((item) => <option key={String(item.delivery_id)} value={String(item.delivery_id)}>Versão {item.content_identity ? 'capturada' : 'pendente'}</option>)}
        </select>
      </label></div>

      <section className="attempt-axis-card card"><h3>Estado operacional</h3><dl className="preparation-facts"><div><dt>Etapa</dt><dd><OperatorState value={attempt.phase} /></dd></div><div><dt>Resultado final</dt><dd>{attempt.result ? <OperatorState value={attempt.result} /> : 'Ainda não concluído'}</dd></div><div><dt>Suspensão</dt><dd>{attempt.suspension ? operatorCodeLabel(attempt.suspension) : 'Nenhuma'}</dd></div><div><dt>Acompanhamento</dt><dd><OperatorState value={attempt.tracking} /></dd></div><div><dt>Limpeza</dt><dd>{cleanupLabel(attempt.cleanup)}</dd></div><div><dt>Publicação</dt><dd><OperatorState value={attempt.publication.local_state} /></dd></div><div><dt>Modo capturado</dt><dd>{deliveryModeLabel(attempt.publication.mode)}</dd></div></dl>
        {attempt.diagnostic && <OperatorDiagnosticCard code={attempt.diagnostic} state="blocked" cause={attempt.diagnostic} recovery="Atualize a tentativa e consulte Registros e diagnóstico antes de uma nova ação." />}
        {attempt.authority?.reason && <OperatorDiagnosticCard code={attempt.authority.reason} state="blocked" cause={attempt.authority.reason} recovery={attempt.authority.recovery} />}

        <div className="attempt-recovery-actions">
          <button type="button" className="danger" onClick={actions.cancel} disabled={!attempt.capabilities.cancel.available || actions.busy || actions.cancelStatus !== null} title={attempt.capabilities.cancel.available ? undefined : attempt.capabilities.cancel.reason ?? 'Cancelamento indisponível'}>Solicitar cancelamento</button>
          <span className="muted">Fechar este diálogo não cancela a tentativa.</span>
        </div>
      </section>

      {Object.entries(actions.actionErrors).map(([key, message]) => <div className="queue-error" role="alert" key={key}><p>{message}</p><p>{key.startsWith('copy:') ? 'A falha permanece visível até uma nova tentativa de cópia.' : 'A falha permanece visível até uma nova tentativa desta ação ser aceita.'}</p></div>)}
      {actions.error && <div className="queue-error" role="alert"><p>{actions.error}</p><button type="button" onClick={() => void actions.refresh()}>Atualizar capacidades</button></div>}
      {actions.error === null && actions.resources === null && <p className="muted" role="status">Consultando recursos e capacidades…</p>}
      {actions.resources && <section className="attempt-axis-card card" aria-labelledby="attempt-resources-title">
        <div className="line"><h3 id="attempt-resources-title">Parada, ambiente e ações nativas</h3><button type="button" onClick={() => void actions.refresh()}>Atualizar capacidades</button></div>
        {actions.cancelStatus && <div className={actions.cancelStatus === 'cleanup-uncertain' ? 'queue-error' : 'notice'} role="status">
          <b>{actions.cancelStatus === 'accepted' ? 'Pedido de cancelamento aceito' : actions.cancelStatus === 'stopped' ? 'Parada dos terminais comprovada' : actions.cancelStatus === 'cleanup-uncertain' ? 'Limpeza incerta' : 'Estado do pedido de parada incerto'}</b>
          <p>{actions.cancelStatus === 'accepted' ? 'A aceitação registra o pedido. A parada física ainda está sendo observada.' : actions.cancelStatus === 'stopped' ? 'Todos os terminais registrados estão confirmados como parados.' : actions.cancelStatus === 'failed' ? 'A operação de cancelamento falhou; consulte o diagnóstico e o estado atual antes de qualquer novo comando.' : actions.cancelStatus === 'cleanup-uncertain' ? 'O controlador não confirmou a limpeza física. O trabalho e os recursos permanecem registrados.' : 'Consulte a operação e os recursos; o pedido não será reenviado automaticamente.'}</p>
        </div>}
        {actions.resources.entries.map((resource: AttemptResource) => {
          const plan = actions.plans[resource.id];
          const folder = actions.folders[resource.id];
          const interaction = actions.interactions[resource.passage_id];
          const terminalLabel = resource.stop_state === 'confirmed' ? 'Parada comprovada' : resource.stop_state === 'uncertain' ? 'Parada sem confirmação' : resource.stop_state === 'requested' ? 'Parada solicitada' : resource.launch_state === 'ready' ? 'Em execução' : `Inicialização: ${operatorState(resource.launch_state).label}`;
          return <article className="attempt-resource" key={resource.id}>
            <div className="line"><div><h4>{resource.kind === 'terminal' ? 'Terminal Maestri' : 'Ambiente de implementação'}</h4><span className="muted">{resource.removed ? 'Removido' : resource.owned ? terminalLabel : 'Vínculo do recurso sem confirmação'}</span></div></div>
            {resource.diagnostic && <div className="notice"><b>{operatorCodeLabel(resource.diagnostic)}</b><p>Consulte o estado dos recursos antes de repetir qualquer ação.</p></div>}

            {resource.stop_state && !operatorState(resource.stop_state).known && <UnknownState value={resource.stop_state} />}
            {!operatorState(resource.launch_state).known && <UnknownState value={resource.launch_state} />}
            {actions.surfaceErrors[resource.id] && <p className="muted" role="status">{actions.surfaceErrors[resource.id]}</p>}
            {resource.kind === 'terminal' && <div className="attempt-recovery-actions">
              {interaction && <>
                <button type="button" onClick={() => actions.openTerminal(resource.passage_id)} disabled={!interaction.open_capability.available || actions.busy} title={interaction.open_capability.available ? undefined : 'Abertura do terminal indisponível'}>Abrir terminal</button>{!interaction.open_capability.available && <><p className="muted">Não foi possível abrir o terminal nesta sessão do host.</p></>}</>}
              {!interaction && <span className="muted">Capacidade do terminal indisponível; atualize para consultar o motivo.</span>}
              {interaction && !interaction.open_capability.available && <span className="muted">{interaction.open_capability.reason}</span>}
            </div>}
            {resource.kind === 'implementation' && <div className="attempt-recovery-actions">
              {folder && <><button type="button" aria-label="Copiar local da pasta" onClick={() => void actions.copyReference(`folder:${resource.id}`, folder.location_display)}>Copiar local</button>{actions.copied === `folder:${resource.id}` && <span className="success" role="status">Local copiado.</span>}
                <button type="button" onClick={() => actions.openFolder(resource.id)} disabled={!folder.open_capability.available || actions.busy} title={folder.open_capability.available ? undefined : 'Abertura da pasta indisponível'}>Abrir pasta</button></>}
              {folder && !folder.open_capability.available && <><p className="muted">Não foi possível abrir a pasta nesta sessão do host.</p></>}
              {plan && <div className="attempt-removal-plan">
                <h4>Plano de remoção</h4>
                <div className="attempt-evidence-columns"><div><b>Será perdido</b><ul>{plan.value.losses.map((item) => <li key={item}>{item}</li>)}</ul></div><div><b>Será preservado</b><ul>{plan.value.preserved_references.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
                {!plan.value.capability.available && <><p className="muted">A remoção não está disponível enquanto os pré-requisitos atuais não forem confirmados.</p></>}
                {plan.value.capability.available && !resource.removed && <><label className="check"><input type="checkbox" checked={confirmedResources[resource.id] === plan.value.plan_hash} onChange={(event) => { const checked = event.currentTarget.checked; setConfirmedResources((current) => { const next = { ...current }; if (checked) next[resource.id] = plan.value.plan_hash; else delete next[resource.id]; return next; }); }} />Confirmo a remoção deste ambiente e as perdas listadas acima.</label><button type="button" className="danger" onClick={() => void actions.requestRemoval(resource.id)} disabled={confirmedResources[resource.id] !== plan.value.plan_hash || actions.busy}>Remover ambiente</button></>}
              </div>}
            </div>}
          </article>;
        })}
        {actions.resources.entries.length === 0 && <p className="muted">Nenhum recurso próprio foi registrado para esta tentativa.</p>}
      </section>}
      {actions.operation && <div className={actions.operation.uncertain || actions.operation.view?.state === 'failed' ? 'queue-error' : 'notice'} role="status">
        <b>{actions.operation.kind === 'cancel' ? actions.cancelStatus === 'stopped' ? 'Parada comprovada' : actions.cancelStatus === 'cleanup-uncertain' ? 'Limpeza incerta' : actions.cancelStatus === 'accepted' ? 'Pedido de cancelamento aceito' : 'Pedido de cancelamento em consulta'
          : actions.operation.kind === 'capture' ? 'Repetição da captura' : actions.operation.kind === 'remove' ? 'Remoção do ambiente' : actions.operation.kind === 'open-terminal' ? 'Abertura do terminal' : 'Abertura da pasta'} · {operationStateLabel(actions.operation.view?.state ?? (actions.operation.accepted ? 'accepted' : 'unknown'))}</b>
        <p>{actions.operation.accepted ? 'Recibo de aceitação recebido.' : 'Resposta sem confirmação; consulte o estado antes de qualquer nova ação.'}</p>
        {actions.operation.view?.error && <p>{operatorErrorMessage(actions.operation.view.error.code, actions.operation.view.error.message)}</p>}

        {actions.operation.kind === 'cancel' && <p>A aceitação da operação não confirma parada física.</p>}
      </div>}

      <section className="attempt-axis-card card"><h3>Tempo e limites</h3><dl className="preparation-facts"><div><dt>Tempo ativo</dt><dd>{formatMeasured(attempt.measurements.active_time)}</dd></div><div><dt>Espera por resposta humana</dt><dd>{formatMeasured(attempt.measurements.human_wait)}</dd></div><div><dt>Custo observado</dt><dd>{formatMeasured(attempt.measurements.cost)}</dd></div><div><dt>Limite de tempo ativo</dt><dd>{formatActiveLimit(attempt.measurements.active_limit)}</dd></div><div><dt>Prazo da pergunta (TTL)</dt><dd>{formatLimit(attempt.measurements.question_ttl)}</dd></div><div><dt>Estado do limite de tempo</dt><dd><OperatorState value={attempt.measurements.active_limit_state} /></dd></div>{attempt.measurements.active_expired_at_ms !== null && <div><dt>Expirou em</dt><dd>{new Date(attempt.measurements.active_expired_at_ms).toLocaleString('pt-BR')}</dd></div>}</dl>
        <p className="muted">O TTL define por quanto tempo uma pergunta do agente aguarda resposta antes de expirar. É separado do intervalo de consulta e do tempo ativo da passagem.</p>

        {attempt.measurements.passages.map((passage) => <div className="attempt-subline" key={passage.passage_id}><p>{passage.role === 'implementer' ? 'Implementador' : 'Revisor'} · rodada {passage.round} · atividade {formatMeasured(passage.active_time)} · espera humana {formatMeasured(passage.human_wait)} · limite <OperatorState value={passage.active_limit_state} /></p></div>)}
      </section>

      <section className="attempt-axis-card card"><h3>Versão selecionada</h3>
        {deliveryState === 'loading' && <p role="status">Consultando a versão selecionada…</p>}
        {deliveryState === 'not-captured' && <p className="muted">Esta rodada ainda não tem uma versão capturada.</p>}
        {deliveryState === 'error' && <div className="queue-error" role="alert"><p>{deliveryError}</p><p><strong>Próxima ação:</strong> atualize a tentativa e consulte novamente a versão selecionada.</p><button type="button" onClick={() => setReload((value) => value + 1)}>Consultar versão novamente</button></div>}
        {delivery && <><dl className="preparation-facts"><div><dt>Captura</dt><dd><OperatorState value={delivery.delivery.capture_state} /></dd></div><div><dt>Integridade da verificação</dt><dd>{delivery.verification ? <OperatorState value={delivery.verification.state} /> : 'Checks não executados'}</dd></div></dl>
          {delivery.delivery.diagnostic && <div className="queue-error" role="alert"><b>{operatorCodeLabel(delivery.delivery.diagnostic)}</b><p>Confira o estado desta versão antes de repetir uma ação.</p></div>}
          {delivery.delivery.capture_state === 'failed' && captureRetryEligible && <div className="attempt-recovery-actions"><p>Falha técnica elegível. O retry reutiliza somente o resultado e a passagem já registrados.</p><button type="button" onClick={() => actions.retryCaptureFor(delivery.delivery.producer_passage_id)} disabled={!attemptEtag || actions.busy}>Repetir captura</button></div>}
          {delivery.delivery.capture_state === 'failed' && !captureRetryEligible && <p className="muted" role="status">A captura falhou, mas não há confirmação atual de todos os requisitos para repetir. Atualize a tentativa e a versão.</p>}
          {delivery.delivery.warnings.map((warning) => <div className="notice attempt-capture-warning" key={`${warning.passage_id}:${warning.path}:${warning.reason}`}><b>Arquivo declarado excluído da captura</b><p className="mono">{warning.path}</p><p>{warning.reason === 'DECLARED_NEW_FILE_IGNORED' ? 'O Implementador declarou este arquivo novo, mas ele está ignorado e não entrou na versão capturada.' : 'O caminho foi excluído pela regra de nomes de arquivos conhecidos como segredo.'}</p></div>)}
          {currentCaptured && <div className="attempt-diff"><div className="line"><h4>Diff</h4><button type="button" onClick={() => loadDiff()} disabled={diff.loading || diff.value !== null}>{diff.loading ? 'Carregando diff…' : diff.value ? 'Diff carregado' : 'Carregar diff'}</button></div>
            {diff.error && <div className="queue-error" role="alert"><p>{diff.error}</p><p><strong>Próxima ação:</strong> atualize a versão e consulte o diff novamente.</p><button type="button" onClick={() => loadDiff(diff.value?.next_cursor ?? undefined)}>Tentar novamente</button></div>}
            {diff.value && <>{diff.value.entries.map((entry) => <article className="attempt-diff-entry" key={`${entry.path}:${entry.status}`}><b>{diffStatusLabel(entry.status)} · {entry.path}</b>{entry.old_path && <p>Origem do renome: {entry.old_path}</p>}{entry.binary ? <p className="muted">Arquivo binário; conteúdo não exibido.</p> : entry.unsupported ? <p className="muted">Patch indisponível para esta codificação.</p> : entry.patch && <pre>{entry.patch}</pre>}</article>)}{diff.value.entries.length === 0 && <p className="muted">A versão não contém diferenças listáveis.</p>}{diff.value.has_more && <button type="button" onClick={() => loadDiff(diff.value?.next_cursor ?? undefined)} disabled={diff.loading}>Carregar próxima parte do diff</button>}</>}
          </div>}</>}
      </section>

      {delivery && <PublicationDialog
        projectId={attempt.project_id}
        attemptId={attemptId}
        attemptEtag={attemptEtag}
        delivery={delivery}
        effects={(sectionStateFor(sectionStates, 'effects').page?.items ?? []).filter(isEffectView)}
        onRefresh={refreshDetail}
      />}

      <section className="attempt-detail-sections" aria-label="Inspeção por rodada e versão">{sections.map((section) => {
        const sectionState = sectionStateFor(sectionStates, section);
        return <section className="card attempt-section" key={section} aria-labelledby={`attempt-section-${section}`}>
          <div className="line"><h3 id={`attempt-section-${section}`}>{labels[section]}</h3>{section === 'criteria' && deliveryState === 'not-captured' && <span className="pill neutral">Sem versão</span>}</div>
          {sectionState.loading && !sectionState.page && <p className="muted" role="status">Consultando {(labels[section] ?? section).toLocaleLowerCase('pt-BR')}…</p>}
          {sectionState.loading && sectionState.page && <p className="stale-note" role="status">Atualizando; os registros da mesma versão continuam visíveis.</p>}
          {sectionState.error && <div className="queue-error" role="alert"><b>Não foi possível carregar esta seção</b><p>{sectionState.error}</p><p><strong>Próxima ação:</strong> consulte novamente esta rodada e versão.</p><button type="button" onClick={() => retrySection(section)} disabled={sectionState.loading}>Tentar carregar novamente</button></div>}
          {section === 'reviews' && !sectionState.loading && !sectionState.error && sectionState.page?.items.length === 0 && <p className="muted">{deliveryState === 'not-captured' ? 'A revisão não foi realizada porque esta rodada ainda não tem uma versão capturada.' : 'Esta versão ainda não tem parecer de revisão.'}</p>}
          {section === 'findings' && !sectionState.loading && !sectionState.error && sectionState.page?.items.length === 0 && <p className="muted">A revisão desta versão não registrou achados.</p>}
          {section === 'criteria' && !sectionState.loading && !sectionState.error && sectionState.page?.items.length === 0 && <p className="muted">Critérios indisponíveis: esta versão ainda não foi capturada.</p>}
          {sectionState.page && sectionState.page.items.length > 0 && <div className="attempt-record-list">{sectionState.page.items.map((item, index) => section === 'questions'
            ? <QuestionDecisionCard key={String(asRecord(item).id ?? index)} attemptId={attemptId} summary={item as { id: string; state: Question["state"] }} />
            : renderRecord(section, item, index, evidence, loadEvidence))}</div>}
          {sectionState.page?.has_more && <div className="attempt-section-pagination"><span>Mais registros nesta seção</span><button type="button" onClick={() => loadMore(section)} disabled={sectionState.loading}>{sectionState.loading ? 'Carregando…' : 'Carregar continuação'}</button></div>}
        </section>;
      })}</section>
    </>}
    <div className="dialog-actions">
      <p>Fechar este detalhe não altera o estado da tentativa.</p>
      <button type="button" onClick={() => setReload((value) => value + 1)}>Atualizar tentativa</button>
      {attempt?.result && <button type="button" className="primary" onClick={() => onRetry(attempt)}>Nova tentativa</button>}
    </div>
  </section>;
}

function renderRecord(section: DetailSection, item: DetailItem, index: number, evidence: Record<string, EvidenceState>, loadEvidence: (artifact: Artifact) => Promise<void>) {
  const record = asRecord(item);
  const recordId = typeof record.id === 'string' ? record.id : typeof record.delivery_id === 'string' ? record.delivery_id : null;
  const round = typeof record.round === 'number' ? record.round : index + 1;
  const role = record.role === 'implementer' ? 'Implementador' : record.role === 'reviewer' ? 'Revisor' : null;
  const heading = section === 'rounds' ? `Rodada ${round}`
    : section === 'criteria' ? 'Critério de aceite'
      : section === 'checks' ? `Check ${index + 1}`
        : section === 'findings' ? 'Achado da revisão'
          : section === 'passages' ? `Passagem · ${role ?? 'papel registrado'}`
            : section === 'reviews' ? 'Parecer do Revisor'
              : labels[section];
  const visibleKeys = ['round', 'role', 'state', 'result', 'status', 'verdict', 'declared_verdict', 'blocking', 'category', 'exit_code', 'duration_ms', 'passed', 'kind'];
  const artifacts = Array.isArray(record.artifacts) ? record.artifacts as Artifact[] : [];
  const textFields = ['text', 'problem', 'evidence', 'expected', 'resolution', 'description', 'comment'];
  return <article className="attempt-record" key={`${section}:${recordId ?? 'record'}:${index}`}><h4>{heading}</h4><dl>{visibleKeys.filter((key) => record[key] !== null && record[key] !== undefined).map((key) => <div key={key}><dt>{operatorFactLabel(key)}</dt><dd>{operatorVisibleFactValue(key, record[key])}</dd></div>)}</dl>
    {visibleKeys.filter((key) => ['state', 'status', 'phase', 'result', 'tracking', 'verdict', 'declared_verdict', 'capture_state', 'active_limit_state'].includes(key) && typeof record[key] === 'string' && !operatorState(record[key] as string).known).map((key) => <UnknownState key={key} value={String(record[key])} />)}

    {typeof record.text === 'string' && <p>{record.text}</p>}
    {textFields.filter((key) => key !== 'text' && typeof record[key] === 'string').map((key) => <div key={key}><b>{operatorFactLabel(key)}</b><p>{String(record[key])}</p></div>)}
    {section === 'criteria' && <div className="attempt-evidence-columns">{(['producer', 'reviewer'] as const).map((evidenceRole) => { const text = evidenceText(record[evidenceRole]); return text ? <div key={evidenceRole}><b>{evidenceRole === 'producer' ? 'Evidência do Implementador' : 'Evidência do Revisor'}</b><p>{text}</p></div> : null; })}</div>}
    {artifacts.map((artifact) => { const value = evidence[artifact.id]; return <div className="attempt-artifact" key={artifact.id}><p><b>Evidência técnica disponível</b></p><button type="button" onClick={() => void loadEvidence(artifact)} disabled={value?.loading}>{value?.loading ? 'Carregando evidência…' : value?.text !== null && value?.text !== undefined ? 'Recarregar evidência' : 'Abrir evidência'}</button>{value?.error && <div className="error" role="alert"><p>{value.error}</p></div>}{value?.text !== null && value?.text !== undefined && <pre className="attempt-artifact-content">{value.text}</pre>}</div>; })}
  </article>;
}

function cleanupLabel(state: AttemptDetail["cleanup"]): string {
  return state === 'complete' ? 'Concluída' : state === 'uncertain' ? 'Incerta' : 'Pendente';
}

function operationStateLabel(state: string | undefined): string {
  return operatorState(state).label.toLocaleLowerCase('pt-BR');
}

function deliveryModeLabel(mode: string): string {
  return ({ icr: 'ICR', commit: 'ICR + Commit local', pr: 'ICR + Commit local + Pull request' } as const)[mode as 'icr' | 'commit' | 'pr'] ?? 'Modo desconhecido';
}

function diffStatusLabel(status: string): string {
  return ({ added: 'Adicionado', modified: 'Alterado', deleted: 'Removido', renamed: 'Renomeado', copied: 'Copiado', typechange: 'Tipo alterado' } as Record<string, string>)[status] ?? 'Alteração registrada';
}

function isEffectView(item: DetailItem): item is EffectView {
  const record = asRecord(item);
  return typeof record.operation_id === 'string' && typeof record.kind === 'string' &&
    ['issue_comment', 'project_status', 'local_commit', 'push', 'pull_request'].includes(record.kind);
}
