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

const sections: readonly DetailSection[] = ['rounds', 'passages', 'criteria', 'checks', 'reviews', 'findings', 'questions', 'effects', 'resources'];
const labels: Record<DetailSection, string> = {
  rounds: 'Rodadas e versões', passages: 'Passagens', criteria: 'Critérios e evidências', checks: 'Checks e logs',
  reviews: 'Pareceres', findings: 'Achados e resoluções', questions: 'Perguntas', effects: 'Efeitos remotos', resources: 'Recursos e limpeza',
};
type SectionState = { page: DetailPage | null; error: string | null; loading: boolean };
type EvidenceState = { loading: boolean; text: string | null; error: string | null };
type DiffState = { loading: boolean; value: DeliveryDiff | null; error: string | null };
type DetailProps = {
  attemptId: string;
  selectedRound: string | null;
  selectedDeliveryId: string | null;
  onSelectionChange: (roundId: string | null, deliveryId: string | null) => void;
  onRetry: (attempt: AttemptDetail) => void;
};

function emptySections(): Record<DetailSection, SectionState> {
  return Object.fromEntries(sections.map((section) => [section, { page: null, error: null, loading: true }])) as Record<DetailSection, SectionState>;
}
function sectionStateFor(states: Record<DetailSection, SectionState>, section: DetailSection): SectionState {
  return states[section] ?? { page: null, error: null, loading: false };
}

function asRecord(item: DetailItem): Record<string, unknown> { return item as unknown as Record<string, unknown>; }
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
}
function formatMeasured(value: AttemptDetail["measurements"]["active_time"]): string {
  return value.state === 'measured' ? `${value.value} ${value.unit}` : `${value.state === 'unavailable' ? 'Indisponível' : 'Não aplicável'} · ${value.reason}`;
}
function formatLimit(value: AttemptDetail["measurements"]["active_limit"]): string {
  return value.state === 'configured' ? `${value.value} ${value.unit}` : 'Não configurado';
}

export function AttemptDetailDialog({ attemptId, selectedRound, selectedDeliveryId, onSelectionChange, onRetry }: DetailProps) {
  const [sectionStates, setSectionStates] = useState<Record<DetailSection, SectionState>>(emptySections);
  const [reload, setReload] = useState(0);
  const [diff, setDiff] = useState<DiffState>({ loading: false, value: null, error: null });
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
  useEffect(() => { setDiff({ loading: false, value: null, error: null }); setEvidence({}); }, [effectiveDeliveryId]);

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
        if (active) setSectionStates((current) => ({ ...current, [section]: { page: data.details, error: null, loading: false } }));
      } catch (reason: unknown) {
        if (!active || (reason instanceof DOMException && reason.name === 'AbortError')) return;
        setSectionStates((current) => ({ ...current, [section]: { ...sectionStateFor(current, section), error: reason instanceof HttpError ? reason.message : 'Não foi possível carregar esta seção.', loading: false } }));
      }
    }));
    return () => { active = false; controllers.forEach((controller) => controller.abort()); };
  }, [attemptId, selectedRound, effectiveDeliveryId, reload, sectionIdentity]);

  function loadMore(section: DetailSection): void {
    const current = sectionStateFor(sectionStates, section);
    const cursor = current.page?.next_cursor;
    if (!cursor || current.loading) return;
    setSectionStates((state) => ({ ...state, [section]: { ...sectionStateFor(state, section), loading: true, error: null } }));
    const query = new URLSearchParams({ section, limit: '25', cursor });
    setAttemptSelection(query, selectedRound, effectiveDeliveryId);
    void requestJsonWithMetadata<AttemptDetail>(`/api/v1/attempts/${encodeURIComponent(attemptId)}?${query}`).then(({ data }) => {
      const nextPage = data.details;
      if (!nextPage) return;
      setSectionStates((state) => {
        const page = sectionStateFor(state, section).page;
        if (!page) return state;
        return { ...state, [section]: { page: { ...nextPage, items: [...page.items, ...nextPage.items] }, error: null, loading: false } };
      });
    }).catch((reason: unknown) => setSectionStates((state) => ({ ...state, [section]: { ...sectionStateFor(state, section), error: reason instanceof HttpError ? reason.message : 'Não foi possível continuar esta seção.', loading: false } })));
  }

  function retrySection(section: DetailSection): void {
    const current = sectionStateFor(sectionStates, section);
    if (current.page?.next_cursor) { loadMore(section); return; }
    setSectionStates((state) => ({ ...state, [section]: { ...sectionStateFor(state, section), loading: true, error: null } }));
    const query = new URLSearchParams({ section, limit: '25' });
    setAttemptSelection(query, selectedRound, effectiveDeliveryId);
    void requestJsonWithMetadata<AttemptDetail>(`/api/v1/attempts/${encodeURIComponent(attemptId)}?${query}`).then(({ data }) => {
      setSectionStates((state) => ({ ...state, [section]: { page: data.details, loading: false, error: null } }));
    }).catch((reason: unknown) => setSectionStates((state) => ({ ...state, [section]: { ...sectionStateFor(state, section), error: reason instanceof HttpError ? reason.message : 'Não foi possível carregar esta seção.', loading: false } })));
  }

  function loadDiff(cursor?: string): void {
    if (!effectiveDeliveryId || diff.loading) return;
    setDiff((current) => ({ ...current, loading: true, error: null }));
    const query = new URLSearchParams({ limit: '25' });
    if (cursor) query.set('cursor', cursor);
    void requestJsonWithMetadata<DeliveryDiff>(`/api/v1/deliveries/${encodeURIComponent(effectiveDeliveryId)}/diff?${query}`).then(({ data }) => {
      setDiff((current) => ({ loading: false, error: null, value: current.value && cursor ? { ...data, entries: [...current.value.entries, ...data.entries] } : data }));
    }).catch((reason: unknown) => setDiff((current) => ({ ...current, loading: false, error: reason instanceof HttpError && reason.code === 'DELIVERY_INTEGRITY_FAILED'
      ? 'A integridade da versão capturada falhou; o diff foi recusado.'
      : reason instanceof HttpError ? reason.message : 'Não foi possível carregar o diff da versão.' })));
  }

  async function loadEvidence(artifact: Artifact): Promise<void> {
    setEvidence((current) => ({ ...current, [artifact.id]: { loading: true, text: current[artifact.id]?.text ?? null, error: null } }));
    try {
      const text = await requestText(`/api/v1/artifacts/${encodeURIComponent(artifact.id)}`);
      setEvidence((current) => ({ ...current, [artifact.id]: { loading: false, text, error: null } }));
    } catch (reason: unknown) {
      const message = reason instanceof HttpError && reason.code === 'ARTIFACT_INTEGRITY_FAILED' ? 'A integridade desta evidência falhou; o conteúdo foi recusado.'
        : reason instanceof HttpError && reason.code === 'ARTIFACT_MISSING' ? 'A evidência não está disponível.'
          : reason instanceof HttpError ? reason.message : 'Não foi possível carregar a evidência.';
      setEvidence((current) => ({ ...current, [artifact.id]: { loading: false, text: null, error: message } }));
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
    {attemptError && <div className="queue-error" role="alert"><h3>Falha ao consultar esta tentativa</h3><p>{attemptError}</p><button type="button" onClick={() => setReload((value) => value + 1)}>Consultar novamente</button></div>}
    {!attempt && !attemptError && <p role="status">Carregando o detalhe da tentativa…</p>}
    {attempt && <>
      <div className="attempt-detail-heading"><div className="eyebrow">Tentativa · <span className="mono">{attempt.id}</span></div><h3>#{attempt.issue.number} · {attempt.issue.title}</h3><div className="row"><a href={attempt.issue.url} target="_blank" rel="noreferrer">Abrir issue no GitHub</a><a href={`#principal/registros?attemptId=${encodeURIComponent(attempt.id)}`}>Registros e diagnóstico</a></div></div>
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
          {roundItems.map(asRecord).filter((item) => String(item.round) === selectedRoundValue && typeof item.delivery_id === 'string').map((item) => <option key={String(item.delivery_id)} value={String(item.delivery_id)}>Versão {String(item.content_identity ?? 'pendente')}</option>)}
        </select>
      </label><button type="button" onClick={() => setReload((value) => value + 1)}>Atualizar tentativa</button>{attempt.result && <button type="button" className="primary" onClick={() => onRetry(attempt)}>Nova tentativa</button>}</div>

      <section className="attempt-axis-card card"><h3>Estado operacional</h3><dl className="preparation-facts"><div><dt>Etapa</dt><dd>{attempt.phase}</dd></div><div><dt>Resultado final</dt><dd>{attempt.result ?? 'Ainda não concluído'}</dd></div><div><dt>Suspensão</dt><dd>{attempt.suspension ?? 'Nenhuma'}</dd></div><div><dt>Acompanhamento</dt><dd>{attempt.tracking}</dd></div><div><dt>Revisão atual</dt><dd>{attempt.revision}</dd></div><div><dt>Limpeza</dt><dd>{cleanupLabel(attempt.cleanup)}</dd></div><div><dt>Publicação</dt><dd>{attempt.publication.local_state}</dd></div><div><dt>Modo capturado</dt><dd>{attempt.publication.mode}</dd></div><div><dt>Autoridade</dt><dd>{attempt.authority?.reason ?? 'Observação não disponível'}</dd></div></dl>
        {attempt.diagnostic && <div className="notice"><b>Diagnóstico da tentativa</b><p>{attempt.diagnostic}</p></div>}
        {attempt.authority?.reason && <div className="notice"><b>Divergência observada</b><p>{attempt.authority.reason}</p><p>{attempt.authority.recovery}</p></div>}
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
          const terminalLabel = resource.stop_state === 'confirmed' ? 'Parada comprovada' : resource.stop_state === 'uncertain' ? 'Parada incerta' : resource.stop_state === 'requested' ? 'Parada solicitada' : resource.launch_state === 'ready' ? 'Em execução' : `Inicialização: ${resource.launch_state}`;
          return <article className="attempt-resource" key={resource.id}>
            <div className="line"><div><h4>{resource.kind === 'terminal' ? 'Terminal Maestri' : 'Ambiente de implementação'}</h4><span className="muted">{resource.removed ? 'Removido' : resource.owned ? terminalLabel : 'Ownership não confirmado'}</span></div><span className="mono">{resource.id}</span></div>
            {resource.diagnostic && <p className="muted">{resource.diagnostic}</p>}
            {actions.surfaceErrors[resource.id] && <p className="muted" role="status">{actions.surfaceErrors[resource.id]}</p>}
            {resource.kind === 'terminal' && <div className="attempt-recovery-actions">
              {interaction && <><p className="mono attempt-resource-reference">{interaction.session_reference}</p><button type="button" onClick={() => void actions.copyReference(`terminal:${resource.id}`, interaction.session_reference)}>Copiar referência</button>{actions.copied === `terminal:${resource.id}` && <span className="success" role="status">Referência copiada.</span>}
                <button type="button" onClick={() => actions.openTerminal(resource.passage_id)} disabled={!interaction.open_capability.available || actions.busy} title={interaction.open_capability.reason ?? undefined}>Abrir terminal</button></>}
              {!interaction && <span className="muted">Capacidade do terminal indisponível; atualize para consultar o motivo.</span>}
              {interaction && !interaction.open_capability.available && <span className="muted">{interaction.open_capability.reason}</span>}
            </div>}
            {resource.kind === 'implementation' && <div className="attempt-recovery-actions">
              {folder && <><p className="mono attempt-resource-reference">{folder.location_display}</p><button type="button" onClick={() => void actions.copyReference(`folder:${resource.id}`, folder.location_display)}>Copiar local</button>{actions.copied === `folder:${resource.id}` && <span className="success" role="status">Local copiado.</span>}
                <button type="button" onClick={() => actions.openFolder(resource.id)} disabled={!folder.open_capability.available || actions.busy} title={folder.open_capability.reason ?? undefined}>Abrir pasta</button></>}
              {folder && !folder.open_capability.available && <span className="muted">{folder.open_capability.reason}</span>}
              {plan && <div className="attempt-removal-plan">
                <h4>Plano de remoção</h4><p className="mono">{plan.value.location_display}</p>
                <div className="attempt-evidence-columns"><div><b>Será perdido</b><ul>{plan.value.losses.map((item) => <li key={item}>{item}</li>)}</ul></div><div><b>Será preservado</b><ul>{plan.value.preserved_references.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
                {!plan.value.capability.available && <p className="muted">Remoção indisponível: {plan.value.capability.reason}</p>}
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
        <p>Operação <span className="mono">{actions.operation.id}</span>{actions.operation.accepted ? ' · recibo de aceitação recebido.' : ' · resposta não confirmada; consulte antes de qualquer nova ação.'}</p>
        {actions.operation.view?.error && <p>{actions.operation.view.error.message}</p>}
        {actions.operation.kind === 'cancel' && <p>A aceitação da operação não confirma parada física.</p>}
      </div>}

      <section className="attempt-axis-card card"><h3>Tempo e limites</h3><dl className="preparation-facts"><div><dt>Tempo ativo</dt><dd>{formatMeasured(attempt.measurements.active_time)}</dd></div><div><dt>Espera humana</dt><dd>{formatMeasured(attempt.measurements.human_wait)}</dd></div><div><dt>Custo observado</dt><dd>{formatMeasured(attempt.measurements.cost)}</dd></div><div><dt>Limite de tempo ativo</dt><dd>{formatLimit(attempt.measurements.active_limit)}</dd></div><div><dt>TTL da pergunta</dt><dd>{formatLimit(attempt.measurements.question_ttl)}</dd></div><div><dt>Estado do limite de tempo</dt><dd>{attempt.measurements.active_limit_state}</dd></div>{attempt.measurements.active_expired_at_ms !== null && <div><dt>Expirou em</dt><dd>{new Date(attempt.measurements.active_expired_at_ms).toLocaleString('pt-BR')}</dd></div>}</dl>
        {attempt.measurements.pending_requirements.map((item) => <p className="muted" key={`${item.cause}:${item.pending}`}>{item.pending} · {item.cause} · {item.affected_requirements.join(', ')}</p>)}
        {attempt.measurements.passages.map((passage) => <p className="attempt-subline" key={passage.passage_id}>{passage.role} · rodada {passage.round} · ativo {formatMeasured(passage.active_time)} · espera humana {formatMeasured(passage.human_wait)} · limite {passage.active_limit_state}</p>)}
      </section>

      <section className="attempt-axis-card card"><h3>Versão selecionada</h3>
        {deliveryState === 'loading' && <p role="status">Consultando a versão selecionada…</p>}
        {deliveryState === 'not-captured' && <p className="muted">Esta rodada ainda não tem uma versão capturada.</p>}
        {deliveryState === 'error' && <div className="queue-error" role="alert"><p>{deliveryError}</p><button type="button" onClick={() => setReload((value) => value + 1)}>Consultar versão novamente</button></div>}
        {delivery && <><dl className="preparation-facts"><div><dt>Captura</dt><dd>{delivery.delivery.capture_state}</dd></div><div><dt>Identidade do conteúdo</dt><dd className="mono">{delivery.delivery.content_identity ?? 'Ainda não disponível'}</dd></div><div><dt>Base</dt><dd className="mono">{delivery.delivery.base_sha}</dd></div><div><dt>Integridade da verificação</dt><dd>{delivery.verification?.state ?? 'Checks não executados'}</dd></div></dl>
          {delivery.delivery.diagnostic && <div className="queue-error" role="alert"><p>Diagnóstico da captura: {delivery.delivery.diagnostic}</p></div>}
          {delivery.delivery.capture_state === 'failed' && captureRetryEligible && <div className="attempt-recovery-actions"><p>Falha técnica elegível. O retry reutiliza somente o resultado e a passagem já registrados.</p><button type="button" onClick={() => actions.retryCaptureFor(delivery.delivery.producer_passage_id)} disabled={!attemptEtag || actions.busy}>Repetir captura</button></div>}
          {delivery.delivery.capture_state === 'failed' && !captureRetryEligible && <p className="muted" role="status">A captura falhou, mas não há confirmação atual de todos os requisitos para repetir. Atualize a tentativa e a versão.</p>}
          {delivery.delivery.warnings.map((warning) => <div className="notice attempt-capture-warning" key={`${warning.passage_id}:${warning.path}:${warning.reason}`}><b>Arquivo declarado excluído da captura</b><p className="mono">{warning.path}</p><p>{warning.reason === 'DECLARED_NEW_FILE_IGNORED' ? 'O Implementador declarou este arquivo novo, mas ele está ignorado e não entrou na versão capturada.' : 'O caminho foi excluído pela regra de nomes de arquivos conhecidos como segredo.'}</p></div>)}
          {currentCaptured && <div className="attempt-diff"><div className="line"><h4>Diff</h4><button type="button" onClick={() => loadDiff()} disabled={diff.loading || diff.value !== null}>{diff.loading ? 'Carregando diff…' : diff.value ? 'Diff carregado' : 'Carregar diff'}</button></div>
            {diff.error && <div className="queue-error" role="alert"><p>{diff.error}</p><button type="button" onClick={() => loadDiff(diff.value?.next_cursor ?? undefined)}>Tentar novamente</button></div>}
            {diff.value && <><p className="muted">Base {diff.value.base_sha} · conteúdo {diff.value.content_identity}</p>{diff.value.entries.map((entry) => <article className="attempt-diff-entry" key={`${entry.path}:${entry.status}`}><b>{entry.status} · {entry.path}</b>{entry.old_path && <p>Origem do renome: {entry.old_path}</p>}{entry.binary ? <p className="muted">Arquivo binário; conteúdo não exibido.</p> : entry.unsupported ? <p className="muted">Patch indisponível: {entry.unsupported}</p> : entry.patch && <pre>{entry.patch}</pre>}</article>)}{diff.value.entries.length === 0 && <p className="muted">A versão não contém diferenças listáveis.</p>}{diff.value.has_more && <button type="button" onClick={() => loadDiff(diff.value?.next_cursor ?? undefined)} disabled={diff.loading}>Carregar próxima parte do diff</button>}</>}
          </div>}</>}
      </section>

      {delivery && <PublicationDialog
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
          {sectionState.error && <div className="queue-error" role="alert"><p>{sectionState.error}</p><button type="button" onClick={() => retrySection(section)} disabled={sectionState.loading}>Tentar carregar novamente</button></div>}
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
  </section>;
}

function renderRecord(section: DetailSection, item: DetailItem, index: number, evidence: Record<string, EvidenceState>, loadEvidence: (artifact: Artifact) => Promise<void>) {
  const record = asRecord(item);
  const heading = section === 'rounds' ? `Rodada ${String(record.round ?? index + 1)}`
    : section === 'criteria' ? `${String(record.id ?? 'Critério')} · ${String(record.text ?? '')}`
      : section === 'checks' ? `${String(record.check_definition_id ?? 'Check')} · ${String(record.state ?? '')}`
        : section === 'findings' ? `${String(record.key ?? record.id ?? 'Achado')} · ${record.blocking ? 'impeditivo' : 'não impeditivo'}`
          : `${String(record.role ?? record.kind ?? record.state ?? record.id ?? labels[section])}`;
  const hidden = new Set(['text', 'artifacts']);
  const artifacts = Array.isArray(record.artifacts) ? record.artifacts as Artifact[] : [];
  return <article className="attempt-record" key={String(record.id ?? record.delivery_id ?? `${section}-${index}`)}><h4>{heading}</h4><dl>{Object.entries(record).filter(([key, value]) => !hidden.has(key) && value !== null && value !== undefined && typeof value !== 'object').map(([key, value]) => <div key={key}><dt>{key}</dt><dd className={typeof value === 'string' && value.length > 70 ? 'mono' : undefined}>{String(value)}</dd></div>)}</dl>
    {typeof record.text === 'string' && <p>{record.text}</p>}
    {section === 'criteria' && <div className="attempt-evidence-columns">{(['producer', 'reviewer'] as const).map((role) => <div key={role}><b>{role === 'producer' ? 'Evidência do Implementador' : 'Evidência do Revisor'}</b><pre>{formatValue(record[role])}</pre></div>)}</div>}
    {Object.entries(record).filter(([key, value]) => Array.isArray(value) && key !== 'artifacts').map(([key, value]) => <div key={key}><b>{key}</b><pre>{formatValue(value)}</pre></div>)}
    {artifacts.map((artifact) => { const value = evidence[artifact.id]; return <div className="attempt-artifact" key={artifact.id}><p><b>Evidência {artifact.kind}</b> · {artifact.size_bytes} bytes · SHA-256 <span className="mono">{artifact.sha256}</span></p><button type="button" onClick={() => void loadEvidence(artifact)} disabled={value?.loading}>{value?.loading ? 'Carregando evidência…' : value?.text !== null && value?.text !== undefined ? 'Recarregar evidência' : 'Abrir evidência'}</button>{value?.error && <p className="error" role="alert">{value.error}</p>}{value?.text !== null && value?.text !== undefined && <pre className="attempt-artifact-content">{value.text}</pre>}</div>; })}
  </article>;
}

function cleanupLabel(state: AttemptDetail["cleanup"]): string {
  return state === 'complete' ? 'Concluída' : state === 'uncertain' ? 'Incerta' : 'Pendente';
}

function operationStateLabel(state: string | undefined): string {
  if (state === 'succeeded') return 'concluída';
  if (state === 'failed') return 'falhou';
  if (state === 'running') return 'em andamento';
  if (state === 'accepted') return 'aceita';
  return 'incerta';
}

function isEffectView(item: DetailItem): item is EffectView {
  const record = asRecord(item);
  return typeof record.operation_id === 'string' && typeof record.kind === 'string' &&
    ['issue_comment', 'project_status', 'local_commit', 'push', 'pull_request'].includes(record.kind);
}
