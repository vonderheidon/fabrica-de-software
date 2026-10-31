import { AttemptConditions } from './AttemptConditions.js';
import { formatDuration } from './duration.js';
import { AttemptBlockDecision } from './AttemptBlockDecision.js';
import { CorrectionHistory, EvidenceList } from './CorrectionHistory.js';
import { HistoricalProfile } from './HistoricalProfile.js';
import { PassageFacts } from './PassageFacts.js';
import { CustomSelect } from '../../app/CustomSelect.js';
import type { ControllerEventNotice } from '../../app/useControllerEvents.js';
import { setAttemptSelection } from './execution-requests.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HttpAttemptDetail as AttemptDetail, HttpAttemptResource as AttemptResource, HttpDeliveryDiff as DeliveryDiff, HttpDetailItem as DetailItem, HttpDetailPage as DetailPage, HttpDetailSection as DetailSection, HttpProducerResult as ProducerResult, HttpQuestion as Question } from '#contracts';
import { HttpError, requestJsonWithMetadata } from '../../api/http.js';
import { QuestionDecisionCard } from './QuestionDecisionCard.js';
import { openPendingDecision } from './DecisionNotification.js';
import { useAttempt } from './useAttempt.js';
import { AttemptStageSummary } from './AttemptStageSummary.js';
import { useAttemptActions } from './useAttemptActions.js';
import { useDelivery } from './useDelivery.js';
import { PublicationDialog } from './PublicationDialog.js';
import { PublicationTargetFacts } from './PublicationTargetFacts.js';
import { formatMinuteValue } from '../projects/time-minutes.js';
import { OperatorState, UnknownState } from '../../app/OperatorSupport.js';
import { operatorCodeLabel, operatorErrorMessage, operatorFactLabel, operatorState, operatorVisibleFactValue } from '../../app/operator-language.js';

const sections: readonly DetailSection[] = ['rounds', 'passages', 'criteria', 'reviews', 'findings', 'questions', 'effects', 'resources'];
const labels: Record<DetailSection, string> = {
  rounds: 'Rodadas e versões', passages: 'Passagens', criteria: 'Critérios e evidências',
  reviews: 'Pareceres', findings: 'Achados e resoluções', questions: 'Perguntas', effects: 'Efeitos remotos', resources: 'Recursos e limpeza', profiles: 'Perfis capturados',
  finding_assessments: 'Progresso', finding_disputes: 'Contestações', decisions: 'Decisões',
};
type SectionErrorDetails = { code: string; requestId: string | null; facts: Readonly<Record<string, string | number | boolean | null>> | null; affectedRequirements: readonly string[] } | null;
type SectionState = { page: DetailPage | null; error: string | null; errorDetails: SectionErrorDetails; loading: boolean };
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
  return value.state === 'measured' ? value.unit === 'ms' ? formatDuration(value.value) : `${value.value} ${value.unit}` : `${operatorState(value.state).label} · ${operatorCodeLabel(value.reason)}`;
}
function formatLimit(value: AttemptDetail["measurements"]["active_limit"]): string {
  return value.state === 'configured' ? value.unit === 'ms' ? formatDuration(value.value) : `${value.value} ${value.unit}` : 'Não configurado';
}
function formatActiveLimit(value: AttemptDetail["measurements"]["active_limit"]): string {
  if (value.state !== 'configured') return formatLimit(value);
  return value.unit === 'ms' ? formatMinuteValue(value.value) : formatLimit(value);
}

export function AttemptDetailDialog({ attemptId, selectedRound, selectedDeliveryId, onSelectionChange, onRetry }: DetailProps) {
  const [storedSectionStates, setSectionStates] = useState<Record<DetailSection, SectionState>>(emptySections);
  const [reload, setReload] = useState(0);
  const [storedDiff, setDiff] = useState<DiffState>({ loading: false, value: null, error: null, errorDetails: null });

  const selectedQuery = useMemo(() => {
    const query = new URLSearchParams();
    setAttemptSelection(query, selectedRound, selectedDeliveryId);
    const value = query.toString();
    return value ? `?${value}` : '';
  }, [selectedRound, selectedDeliveryId]);
  const { attempt, selectionCurrent, etag: attemptEtag, error: attemptError, refreshing: attemptRefreshing } = useAttempt(attemptId, selectedQuery, reload);
  const attemptMatchesRound = !selectedRound || String(attempt?.selected_round) === selectedRound;
  const effectiveDeliveryId = selectedDeliveryId ?? (selectionCurrent && attemptMatchesRound ? attempt?.selected_delivery_id : null) ?? null;
  const { delivery, status: deliveryState, error: deliveryError } = useDelivery(effectiveDeliveryId, reload + (attempt?.revision ?? 0));
  const actions = useAttemptActions(attemptId, attempt, attemptEtag, effectiveDeliveryId, delivery?.delivery.capture_state === 'failed', selectedRound);
  const [confirmedResources, setConfirmedResources] = useState<Record<string, string>>({});
  const refreshDetail = useCallback(() => setReload((value) => value + 1), []);
  const sectionIdentity = `${attemptId}:${selectedRound ?? ''}:${effectiveDeliveryId ?? ''}`;
  const sectionIdentityRef = useRef('');
  const selection = useMemo(() => ({ identity: sectionIdentity }), [sectionIdentity]);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const isCurrentSelection = () => selectionRef.current === selection;
  const visible = sectionIdentityRef.current === sectionIdentity;
  const sectionStates = visible ? storedSectionStates : emptySections();
  const diff = visible ? storedDiff : { loading: false, value: null, error: null, errorDetails: null };
  useEffect(() => { selectionRef.current = selection; return () => { if (selectionRef.current === selection) selectionRef.current = { identity: '' }; }; }, [selection]);
  useEffect(() => { setDiff({ loading: false, value: null, error: null, errorDetails: null }); }, [effectiveDeliveryId]);

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
        if (active && isCurrentSelection()) setSectionStates((current) => ({ ...current, [section]: { page: data.details, error: null, errorDetails: null, loading: false } }));
      } catch (reason: unknown) {
        if (!active || !isCurrentSelection() || (reason instanceof DOMException && reason.name === 'AbortError')) return;
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
      if (!isCurrentSelection()) return;
      const nextPage = data.details;
      if (!nextPage) return;
      setSectionStates((state) => {
        const page = sectionStateFor(state, section).page;
        if (!page) return state;
        return { ...state, [section]: { page: { ...nextPage, items: [...page.items, ...nextPage.items] }, error: null, errorDetails: null, loading: false } };
      });
    }).catch((reason: unknown) => { if (!isCurrentSelection()) return; setSectionStates((state) => ({ ...state, [section]: { ...sectionStateFor(state, section), error: reason instanceof HttpError ? reason.message : 'Não foi possível continuar esta seção.', errorDetails: sectionErrorDetails(reason), loading: false } })); });
  }

  function retrySection(section: DetailSection): void {
    const current = sectionStateFor(sectionStates, section);
    if (current.page?.next_cursor) { loadMore(section); return; }
    setSectionStates((state) => ({ ...state, [section]: { ...sectionStateFor(state, section), loading: true, error: null, errorDetails: null } }));
    const query = new URLSearchParams({ section, limit: '25' });
    setAttemptSelection(query, selectedRound, effectiveDeliveryId);
    void requestJsonWithMetadata<AttemptDetail>(`/api/v1/attempts/${encodeURIComponent(attemptId)}?${query}`).then(({ data }) => {
      if (!isCurrentSelection()) return;
      setSectionStates((state) => ({ ...state, [section]: { page: data.details, loading: false, error: null, errorDetails: null } }));
    }).catch((reason: unknown) => { if (!isCurrentSelection()) return; setSectionStates((state) => ({ ...state, [section]: { ...sectionStateFor(state, section), error: reason instanceof HttpError ? reason.message : 'Não foi possível carregar esta seção.', errorDetails: sectionErrorDetails(reason), loading: false } })); });
  }

  function loadDiff(cursor?: string): void {
    if (!effectiveDeliveryId || diff.loading) return;
    setDiff((current) => ({ ...current, loading: true, error: null, errorDetails: null }));
    const query = new URLSearchParams({ limit: '25' });
    if (cursor) query.set('cursor', cursor);
    void requestJsonWithMetadata<DeliveryDiff>(`/api/v1/deliveries/${encodeURIComponent(effectiveDeliveryId)}/diff?${query}`).then(({ data }) => {
      if (!isCurrentSelection()) return;
      setDiff((current) => ({ loading: false, error: null, errorDetails: null, value: current.value && cursor ? { ...data, entries: [...current.value.entries, ...data.entries] } : data }));
    }).catch((reason: unknown) => { if (!isCurrentSelection()) return; setDiff((current) => ({ ...current, loading: false, error: reason instanceof HttpError && reason.code === 'DELIVERY_INTEGRITY_FAILED'
      ? 'A integridade da versão capturada falhou; o diff foi recusado.'
      : reason instanceof HttpError ? reason.message : 'Não foi possível carregar o diff da versão.', errorDetails: sectionErrorDetails(reason) })); });
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
      <AttemptStageSummary activity={attempt.stage_activity} stale={Boolean(attemptError) || attemptRefreshing} blocked={!attempt.result && attempt.diagnostic === 'IMPLEMENTATION_BLOCKED'} />
      <div className="attempt-detail-heading"><h3>#{attempt.issue.number} · {attempt.issue.title}</h3><div className="row"><a href={attempt.issue.url} target="_blank" rel="noreferrer">Abrir issue no GitHub</a><a href={`#principal/registros?attemptId=${encodeURIComponent(attempt.id)}`}>Abrir Registros</a></div></div>
      <div className="notice" role="status" aria-label="Origem do ambiente da issue">
        <b>{attempt.workspace_lineage.predecessor_attempt_id ? 'Workspace compartilhado' : 'Ambiente da issue'}</b>
        {attempt.workspace_lineage.initial_state.kind === 'inherited_attempt'
          ? <p>Esta tentativa herdou o conteúdo da tentativa {attempt.workspace_lineage.initial_state.source_attempt_id.slice(0, 8)} · {attempt.workspace_lineage.initial_state.content_identity.slice(0, 8)}.</p>
          : attempt.workspace_lineage.initial_state.kind === 'pending_inherited_attempt'
            ? <p>A origem herdada da tentativa {attempt.workspace_lineage.initial_state.source_attempt_id.slice(0, 8)} ainda não foi confirmada. Consulte o estado antes de agir sobre versões anteriores.</p>
            : <p>Conteúdo inicial registrado · {attempt.workspace_lineage.initial_state.content_identity.slice(0, 8)}.</p>}
      </div>
      {delivery && <PublicationDialog key={delivery.delivery.id}
        projectId={attempt.project_id}
        attemptId={attemptId}
        attemptEtag={attemptEtag}
        delivery={delivery}
        current={selectionCurrent && !attemptError && deliveryState === 'ready'}
        onRefresh={refreshDetail}
      />}

      {attempt.result && actions.resources && actions.resources.entries.some(resource => resource.kind === 'terminal' && !resource.removed && resource.stop_state !== 'confirmed') && <aside className="attempt-terminal-notice" role="status"><div><h3>Encerramento dos terminais pendente</h3><p>Parada de {actions.resources.entries.filter(resource => resource.kind === 'terminal' && !resource.removed && resource.stop_state !== 'confirmed').length} terminais sem confirmação.</p></div><button type="button" onClick={() => { const summary = document.getElementById("attempt-environment"); const details = summary?.closest("details"); if (details) details.open = true; summary?.scrollIntoView({ block: "nearest" }); summary?.focus(); }}>Consultar ambiente e terminais</button></aside>}
      <div className="attempt-version-controls"><div className="form-field"><label htmlFor="attempt-round">Rodada
        </label><CustomSelect id="attempt-round" value={selectedRoundValue} onChange={(event) => {
          const value = event.currentTarget.value;
          const selected = roundItems.map(asRecord).find((item) => String(item.round) === value);
          onSelectionChange(value, typeof selected?.delivery_id === 'string' ? selected.delivery_id : null);
        }}>
          {Array.from({ length: attempt.round }, (_, index) => String(index + 1)).map((round) => <option key={round} value={round}>Rodada {round}</option>)}
        </CustomSelect>
      </div><div className="form-field"><label htmlFor="attempt-version">Versão
        </label><CustomSelect id="attempt-version" value={effectiveDeliveryId ?? ''} onChange={(event) => onSelectionChange(selectedRoundValue, event.currentTarget.value || null)}>
          {!effectiveDeliveryId && <option value="">Versão planejada ou não capturada</option>}
          {roundItems.map(asRecord).filter((item) => String(item.round) === selectedRoundValue && typeof item.delivery_id === 'string').map((item) => <option key={String(item.delivery_id)} value={String(item.delivery_id)}>Versão {item.content_identity ? 'capturada' : 'pendente'}</option>)}
        </CustomSelect>
      </div></div>

      <details className="attempt-axis-card card attempt-disclosure" open={!attempt.result || Boolean(attempt.suspension || attempt.diagnostic || attempt.authority?.reason)}><summary>Estado da tentativa</summary><dl className="preparation-facts"><div><dt>{attempt.result ? 'Resultado final' : 'Etapa atual'}</dt><dd><OperatorState value={attempt.result ?? (attempt.diagnostic === 'IMPLEMENTATION_BLOCKED' ? 'blocked' : attempt.phase)} /></dd></div>{attempt.suspension && <div><dt>Suspensão</dt><dd>{operatorCodeLabel(attempt.diagnostic === 'IMPLEMENTATION_BLOCKED' ? attempt.diagnostic : attempt.suspension)}</dd></div>}</dl>
        <AttemptConditions attempt={attempt} />

        {!attempt.result && <div className="attempt-recovery-actions">
          <button type="button" className="danger" onClick={actions.cancel} disabled={!attempt.capabilities.cancel.available || actions.busy || actions.cancelStatus !== null} title={attempt.capabilities.cancel.available ? undefined : attempt.capabilities.cancel.reason ?? 'Cancelamento indisponível'}>Solicitar cancelamento</button>
          <span className="muted">Fechar este diálogo não cancela a tentativa.</span>
        </div>}
      </details>

      {Object.entries(actions.actionErrors).map(([key, message]) => <div className="queue-error" role="alert" key={key}><p>{message}</p><p>{key.startsWith('copy:') ? 'A falha permanece visível até uma nova tentativa de cópia.' : 'A falha permanece visível até uma nova tentativa desta ação ser aceita.'}</p></div>)}
      {actions.error && <div className="queue-error" role="alert"><p>{actions.error}</p><button type="button" onClick={() => void actions.refresh()}>Consultar ambiente novamente</button></div>}
      {actions.error === null && actions.resources === null && <p className="muted" role="status">Consultando recursos e capacidades…</p>}
      <HistoricalProfile key={attemptId} attemptId={attemptId} />
      {(attempt.publication_target || delivery?.publication.commit?.branch_ref || attempt.history_sections?.includes('target_selections')) && <PublicationTargetFacts key={`${attemptId}:${effectiveDeliveryId}`} attemptId={attemptId} deliveryId={effectiveDeliveryId} target={attempt.publication_target} publication={delivery?.publication} />}
      {attempt.block && <AttemptBlockDecision key={`${attempt.expected_account_id}:${attemptId}:${attempt.block.id}`} attempt={attempt} etag={attemptEtag} current={selectionCurrent && !attemptError} onRefresh={refreshDetail} />}
      <CorrectionHistory key={sectionIdentity} attemptId={attemptId} round={selectedRound} deliveryId={effectiveDeliveryId} sections={attempt.history_sections ?? []} />
      <details className="attempt-axis-card card attempt-disclosure"><summary>Ver alterações da entrega</summary>
        {deliveryState === 'loading' && <p role="status">Consultando a versão selecionada…</p>}
        {deliveryState === 'not-captured' && <p className="muted">Esta rodada ainda não tem uma versão capturada.</p>}
        {deliveryState === 'error' && <div className="queue-error" role="alert"><p>{deliveryError}</p><p><strong>Próxima ação:</strong> atualize a tentativa e consulte novamente a versão selecionada.</p><button type="button" onClick={() => setReload((value) => value + 1)}>Consultar versão novamente</button></div>}
        {delivery && <><dl className="preparation-facts"><div><dt>Captura</dt><dd><OperatorState value={delivery.delivery.capture_state} /></dd></div></dl>
          {delivery.delivery.diagnostic && <div className="queue-error" role="alert"><b>{operatorCodeLabel(delivery.delivery.diagnostic)}</b><p>Confira o estado desta versão antes de repetir uma ação.</p></div>}
          {delivery.delivery.capture_state === 'failed' && captureRetryEligible && <div className="attempt-recovery-actions"><p>Falha técnica elegível. O retry reutiliza somente o resultado e a passagem já registrados.</p><button type="button" onClick={() => actions.retryCaptureFor(delivery.delivery.producer_passage_id)} disabled={!attemptEtag || actions.busy}>Repetir captura</button></div>}
          {delivery.delivery.capture_state === 'failed' && !captureRetryEligible && <p className="muted" role="status">A captura falhou, mas não há confirmação atual de todos os requisitos para repetir. Atualize a tentativa e a versão.</p>}
          {delivery.delivery.warnings.map((warning) => <div className="notice attempt-capture-warning" key={`${warning.passage_id}:${warning.path}:${warning.reason}`}><b>Arquivo declarado excluído da captura</b><p className="mono">{warning.path}</p><p>{warning.reason === 'DECLARED_NEW_FILE_IGNORED' ? 'O Implementador declarou este arquivo novo, mas ele está ignorado e não entrou na versão capturada.' : 'O caminho foi excluído pela regra de nomes de arquivos conhecidos como segredo.'}</p></div>)}
          {currentCaptured && <div className="attempt-diff"><div className="line"><h4>Diff</h4><button type="button" onClick={() => loadDiff()} disabled={diff.loading || diff.value !== null}>{diff.loading ? 'Carregando diff…' : diff.value ? 'Diff carregado' : 'Carregar diff'}</button></div>
            {diff.error && <div className="queue-error" role="alert"><p>{diff.error}</p><p><strong>Próxima ação:</strong> atualize a versão e consulte o diff novamente.</p><button type="button" onClick={() => loadDiff(diff.value?.next_cursor ?? undefined)}>Tentar novamente</button></div>}
            {diff.value && <>{diff.value.entries.map((entry) => <article className="attempt-diff-entry" key={`${entry.path}:${entry.status}`}><b>{diffStatusLabel(entry.status)} · {entry.path}</b>{entry.old_path && <p>Origem do renome: {entry.old_path}</p>}{entry.binary ? <p className="muted">Arquivo binário; conteúdo não exibido.</p> : entry.unsupported ? <p className="muted">Patch indisponível para esta codificação.</p> : entry.patch && <pre>{entry.patch}</pre>}</article>)}{diff.value.entries.length === 0 && <p className="muted">A versão não contém diferenças listáveis.</p>}{diff.value.has_more && <button type="button" onClick={() => loadDiff(diff.value?.next_cursor ?? undefined)} disabled={diff.loading}>Carregar próxima parte do diff</button>}</>}
          </div>}</>}
      </details>

      <details className="attempt-axis-card card attempt-disclosure" open={Boolean(attempt.pending_question_id) || sections.some(section => Boolean(sectionStateFor(sectionStates, section).error))}><summary>Validação e histórico da versão</summary><section className="attempt-detail-sections" aria-label="Inspeção por rodada e versão">{sections.map((section) => {
        const sectionState = sectionStateFor(sectionStates, section);
        return <details className="card attempt-section attempt-disclosure" key={section} open={section === 'questions' && Boolean(attempt.pending_question_id) || Boolean(sectionState.error)}><summary>{labels[section]} <span className="muted">{sectionState.page?.items.length ?? '…'}{sectionState.page?.has_more ? '+' : ''}</span></summary>
          <div className="line">{section === 'criteria' && deliveryState === 'not-captured' && <span className="pill neutral">Sem versão</span>}</div>
          {sectionState.loading && !sectionState.page && <p className="muted" role="status">Consultando {(labels[section] ?? section).toLocaleLowerCase('pt-BR')}…</p>}
          {sectionState.loading && sectionState.page && <p className="stale-note" role="status">Atualizando; os registros da mesma versão continuam visíveis.</p>}
          {sectionState.error && <div className="queue-error" role="alert"><b>Não foi possível carregar esta seção</b><p>{sectionState.error}</p><p><strong>Próxima ação:</strong> consulte novamente esta rodada e versão.</p><button type="button" onClick={() => retrySection(section)} disabled={sectionState.loading}>Tentar carregar novamente</button></div>}
          {section === 'reviews' && !sectionState.loading && !sectionState.error && sectionState.page?.items.length === 0 && <p className="muted">{deliveryState === 'not-captured' ? 'A revisão não foi realizada porque esta rodada ainda não tem uma versão capturada.' : 'Esta versão ainda não tem parecer de revisão.'}</p>}
          {section === 'findings' && !sectionState.loading && !sectionState.error && sectionState.page?.items.length === 0 && <p className="muted">A revisão desta versão não registrou achados.</p>}
          {section === 'criteria' && !sectionState.loading && !sectionState.error && sectionState.page?.items.length === 0 && <p className="muted">{deliveryState === 'not-captured' ? 'Critérios indisponíveis: esta versão ainda não foi capturada.' : 'Nenhum critério foi retornado para esta versão.'}</p>}
          {sectionState.page && sectionState.page.items.length > 0 && <div className="attempt-record-list">{sectionState.page.items.map((item, index) => section === 'questions'
            ? asRecord(item).state === 'pending'
              ? <button key={String(asRecord(item).id ?? index)} type="button" onClick={() => openPendingDecision(attemptId, String(asRecord(item).id))}>Responder decisão pendente</button>
              : <QuestionDecisionCard key={String(asRecord(item).id ?? index)} attemptId={attemptId} summary={item as { id: string; state: Question["state"] }} />
            : renderRecord(section, item, index, actions.producerResult))}</div>}
          {sectionState.page?.has_more && <div className="attempt-section-pagination"><span>Mais registros nesta seção</span><button type="button" onClick={() => loadMore(section)} disabled={sectionState.loading}>{sectionState.loading ? 'Carregando…' : 'Carregar continuação'}</button></div>}
        </details>;
      })}</section></details>
      {actions.resources && <details className="attempt-axis-card card attempt-disclosure"><summary id="attempt-environment">Ambiente e terminais <span className="muted">{actions.resources.entries.length} recursos · limpeza {cleanupLabel(attempt.cleanup).toLocaleLowerCase('pt-BR')}</span></summary>
        <div className="line"><h3 id="attempt-resources-title">Recursos da tentativa</h3><button type="button" onClick={() => void actions.refresh()}>Atualizar recursos</button></div>
        <p className="muted">Recursos atuais de toda a tentativa. Cada terminal indica a passagem vinculada; o histórico da versão permanece na seção Passagens. Disponibilidade para reutilização não comprova parada para limpeza.</p>
        <AttemptConditions attempt={attempt} resources />
        {actions.cancelStatus && <div className={actions.cancelStatus === 'cleanup-uncertain' ? 'queue-error' : 'notice'} role="status">
          <b>{actions.cancelStatus === 'accepted' ? 'Pedido de cancelamento aceito' : actions.cancelStatus === 'stopped' ? 'Parada dos terminais comprovada' : actions.cancelStatus === 'cleanup-uncertain' ? 'Limpeza incerta' : 'Estado do pedido de parada incerto'}</b>
          <p>{actions.cancelStatus === 'accepted' ? 'A aceitação registra o pedido. A parada física ainda está sendo observada.' : actions.cancelStatus === 'stopped' ? 'Todos os terminais registrados estão confirmados como parados.' : actions.cancelStatus === 'failed' ? 'A operação de cancelamento falhou; consulte o diagnóstico e o estado atual antes de qualquer novo comando.' : actions.cancelStatus === 'cleanup-uncertain' ? 'O controlador não confirmou a limpeza física. O trabalho e os recursos permanecem registrados.' : 'Consulte a operação e os recursos; o pedido não será reenviado automaticamente.'}</p>
        </div>}
        {actions.resources.entries.map((resource: AttemptResource) => {
          const plan = actions.plans[resource.id];
          const folder = actions.folders[resource.id];
          const interaction = actions.interactions[resource.passage_id];
          const passage = actions.passages.find(item => item.id === resource.passage_id);
          const terminalLabel = resource.stop_state === 'confirmed' ? 'Parada comprovada' : resource.stop_state === 'uncertain' ? 'Parada sem confirmação' : resource.stop_state === 'requested' ? 'Parada solicitada' : resource.launch_state === 'ready' ? resource.kind === 'terminal' ? 'Parada não solicitada' : 'Disponível' : `Inicialização: ${operatorState(resource.launch_state).label}`;
          return <article className="attempt-resource" key={resource.id}>
            <div className="line"><div><h4>{resource.kind === 'terminal' ? 'Terminal Maestri' : 'Ambiente de implementação'}</h4><span className="muted">{resource.removed ? 'Removido' : resource.owned ? terminalLabel : 'Vínculo do recurso sem confirmação'}</span></div></div>
            {passage ? <PassageFacts passage={passage} /> : <p className="muted">Passagem e sessão indisponíveis no histórico deste recurso.</p>}
            {resource.diagnostic && <div className="notice"><b>{operatorCodeLabel(resource.diagnostic)}</b><p>Consulte o estado dos recursos antes de repetir qualquer ação.</p></div>}

            {resource.stop_state && !operatorState(resource.stop_state).known && <UnknownState value={resource.stop_state} />}
            {!operatorState(resource.launch_state).known && <UnknownState value={resource.launch_state} />}
            {actions.surfaceErrors[resource.id] && <p className="muted" role="status">{actions.surfaceErrors[resource.id]}</p>}
            {resource.kind === 'terminal' && <div className="attempt-recovery-actions">
              {interaction && <>
                <button type="button" onClick={() => actions.openTerminal(resource.passage_id)} disabled={!interaction.open_capability.available || actions.busy} aria-describedby={`terminal-capability-${resource.id}`}>Abrir terminal</button><p id={`terminal-capability-${resource.id}`} className="muted">{interaction.open_capability.available ? 'Abre a superfície existente desta passagem. Não inicia uma conversa nem recupera autoridade.' : interaction.open_capability.reason ? operatorCodeLabel(interaction.open_capability.reason) : 'Abertura indisponível. Atualize os recursos para consultar a capacidade atual.'}</p></>}
              {!interaction && <span className="muted">Capacidade do terminal indisponível; atualize para consultar o motivo.</span>}
            </div>}
            {resource.kind === 'implementation' && <div className="attempt-recovery-actions">
              {folder && <><button type="button" aria-label="Copiar local da pasta" onClick={() => void actions.copyReference(`folder:${resource.id}`, folder.location_display)}>Copiar local</button>{actions.copied === `folder:${resource.id}` && <span className="success" role="status">Local copiado.</span>}
                <button type="button" onClick={() => actions.openFolder(resource.id)} disabled={!folder.open_capability.available || actions.busy} title={folder.open_capability.available ? undefined : 'Abertura da pasta indisponível'}>Abrir pasta</button></>}
              {folder && !folder.open_capability.available && <><p className="muted">Não foi possível abrir a pasta nesta sessão do host.</p></>}
              {plan && <div className="attempt-removal-plan">
                <h4>Plano de remoção</h4>
                <div className="attempt-evidence-columns"><div><b>Será perdido</b><ul>{plan.value.losses.map((item) => <li key={item}>{item}</li>)}</ul></div><div><b>Será preservado</b><ul>{plan.value.preserved_references.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
                {!plan.value.capability.available && <><p className="muted">A remoção não está disponível: {plan.value.capability.reason ? operatorCodeLabel(plan.value.capability.reason) : 'pré-requisitos não confirmados'}.</p></>}
                {plan.value.capability.available && !resource.removed && <><label className="form-check attempt-removal-confirmation"><input type="checkbox" checked={confirmedResources[resource.id] === plan.value.plan_hash} onChange={(event) => { const checked = event.currentTarget.checked; setConfirmedResources((current) => { const next = { ...current }; if (checked) next[resource.id] = plan.value.plan_hash; else delete next[resource.id]; return next; }); }} /><span>Confirmo a remoção deste ambiente e as perdas listadas acima.</span></label><button type="button" className="danger" onClick={() => void actions.requestRemoval(resource.id)} disabled={confirmedResources[resource.id] !== plan.value.plan_hash || actions.busy}>Remover ambiente</button></>}
              </div>}
            </div>}
          </article>;
        })}
        {actions.resources.entries.length === 0 && <p className="muted">Nenhum recurso próprio foi registrado para esta tentativa.</p>}
      </details>}
      {actions.operation && <div className={actions.operation.uncertain || actions.operation.view?.state === 'failed' ? 'queue-error' : 'notice'} role="status">
        <b>{actions.operation.kind === 'cancel' ? actions.cancelStatus === 'stopped' ? 'Parada comprovada' : actions.cancelStatus === 'cleanup-uncertain' ? 'Limpeza incerta' : actions.cancelStatus === 'accepted' ? 'Pedido de cancelamento aceito' : 'Pedido de cancelamento em consulta'
          : actions.operation.kind === 'revalidate' ? 'Revalidação da tentativa' : actions.operation.kind === 'capture' ? 'Repetição da captura' : actions.operation.kind === 'remove' ? 'Remoção do ambiente' : actions.operation.kind === 'open-terminal' ? 'Abertura do terminal' : 'Abertura da pasta'} · {operationStateLabel(actions.operation.view?.state ?? (actions.operation.accepted ? 'accepted' : 'unknown'))}</b>
        <p>{actions.operation.accepted ? 'Recibo de aceitação recebido.' : 'Resposta sem confirmação; consulte o estado antes de qualquer nova ação.'}</p>
        {actions.operation.view?.error && <p>{operatorErrorMessage(actions.operation.view.error.code, actions.operation.view.error.message)}</p>}

        {actions.operation.kind === 'cancel' && <p>A aceitação da operação não confirma parada física.</p>}
      </div>}

      <details className="attempt-axis-card card attempt-disclosure"><summary>Tempos e limites</summary><dl className="preparation-facts"><div><dt>Tempo ativo</dt><dd>{formatMeasured(attempt.measurements.active_time)}</dd></div><div><dt>Espera por resposta humana</dt><dd>{formatMeasured(attempt.measurements.human_wait)}</dd></div><div><dt>Custo observado</dt><dd>{formatMeasured(attempt.measurements.cost)}</dd></div><div><dt>Limite de tempo ativo</dt><dd>{formatActiveLimit(attempt.measurements.active_limit)}</dd></div><div><dt>Prazo da pergunta (TTL)</dt><dd>{formatLimit(attempt.measurements.question_ttl)}</dd></div><div><dt>Estado do limite de tempo</dt><dd><OperatorState value={attempt.measurements.active_limit_state} /></dd></div>{attempt.measurements.active_expired_at_ms !== null && <div><dt>Expirou em</dt><dd>{new Date(attempt.measurements.active_expired_at_ms).toLocaleString('pt-BR')}</dd></div>}</dl>
        <p className="muted">O TTL define por quanto tempo uma pergunta do agente aguarda resposta antes de expirar. É separado do intervalo de consulta e do tempo ativo da passagem.</p>

        {attempt.measurements.passages.map((passage) => <div className="attempt-subline" key={passage.passage_id}><p>{passage.role === 'implementer' ? 'Implementador' : 'Revisor'} · rodada {passage.round} · atividade {formatMeasured(passage.active_time)} · espera humana {formatMeasured(passage.human_wait)} · limite <OperatorState value={passage.active_limit_state} /></p></div>)}
      </details>

    </>}
    <div className="dialog-actions">
      <p>Fechar este detalhe não altera o estado da tentativa.</p>
      <button type="button" onClick={() => setReload((value) => value + 1)}>Atualizar tentativa</button>
      {attempt?.capabilities.revalidate.available && Boolean(attempt.suspension || attempt.diagnostic || attempt.authority?.reason || attempt.tracking === 'lost') && <button type="button" onClick={actions.revalidate} disabled={actions.busy || attemptRefreshing || !attemptEtag}>Revalidar tentativa</button>}
      <span id="attempt-decision-actions" />
      {attempt?.result && <button type="button" className="primary" onClick={() => onRetry(attempt)}>Nova tentativa</button>}
    </div>
  </section>;
}

function renderRecord(section: DetailSection, item: DetailItem, index: number, producerResult: ProducerResult) {
  const record = asRecord(item);
  if (section === 'findings' && 'problem' in item && 'resolutions' in item) return <article className="attempt-record" key={item.id}>
    <h4>{item.problem}</h4><dl className="preparation-facts"><div><dt>Prioridade</dt><dd>{item.priority ? ({ critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' })[item.priority] : 'Não registrada no legado'}</dd></div><div><dt>Bloqueante</dt><dd>{item.blocking ? 'Sim' : 'Não'}</dd></div><div><dt>Critérios</dt><dd>{item.criterion_ids.join(', ')}</dd></div></dl>
    <h5>Resultado esperado</h5><p>{item.expected_result}</p><h5>Evidências</h5><EvidenceList values={item.evidence} />
    <h5>Resoluções registradas</h5>{item.resolutions.length ? item.resolutions.map((resolution, index) => <div key={index}><p>{resolution.verdict === 'resolved' ? 'Resolvido' : 'Permanece pendente'}</p><EvidenceList values={resolution.evidence} /><details><summary>Versão da resolução</summary><p>{resolution.delivery_id}</p></details></div>) : <p>Sem resolução registrada. Ausência de histórico não comprova resolução.</p>}
    <details><summary>Identidade e versão revisada</summary><dl><div><dt>Achado</dt><dd>{item.id}</dd></div><div><dt>Versão</dt><dd>{item.delivery_id ?? 'Não registrada no legado'}</dd></div><div><dt>Problema de origem</dt><dd>{item.origin_finding_id ?? 'Achado inicial ou origem não registrada'}</dd></div></dl></details>
  </article>;
  const recordId = typeof record.id === 'string' ? record.id : typeof record.delivery_id === 'string' ? record.delivery_id : null;
  const round = typeof record.round === 'number' ? record.round : index + 1;
  const role = record.role === 'implementer' ? 'Implementador' : record.role === 'reviewer' ? 'Revisor' : null;
  if (section === 'passages') {
    const checks = producerResult && role === 'Implementador' && producerResult.binding.passage_id === record.id && producerResult.binding.delivery_version === record.delivery_id
      ? producerResult.result.checks : [];
    return <article className="attempt-record" key={recordId ?? index}><h4>Passagem · {role ?? 'papel registrado'}</h4><PassageFacts passage={item as import('./PassageFacts.js').PassageFactsProps['passage']} />
      {checks.map((check) => <div key={check.id}><code>{check.id}</code><p>{check.outcome}</p><p>{check.evidence}</p></div>)}
    </article>;
  }
  const heading = section === 'rounds' ? `Rodada ${round}`
    : section === 'criteria' ? 'Critério de aceite'
        : section === 'findings' ? 'Achado da revisão'
          : section === 'passages' ? `Passagem · ${role ?? 'papel registrado'}`
            : section === 'reviews' ? 'Parecer do Revisor'
              : labels[section];
  const visibleKeys = ['round', 'role', 'state', 'result', 'status', 'verdict', 'declared_verdict', 'blocking', 'category', 'kind'];
  const textFields = ['text', 'problem', 'evidence', 'expected', 'resolution', 'description', 'comment'];
  return <article className="attempt-record" key={`${section}:${recordId ?? 'record'}:${index}`}><h4>{heading}</h4><dl>{visibleKeys.filter((key) => record[key] !== null && record[key] !== undefined).map((key) => <div key={key}><dt>{operatorFactLabel(key)}</dt><dd>{operatorVisibleFactValue(key, record[key])}</dd></div>)}</dl>
    {visibleKeys.filter((key) => ['state', 'status', 'phase', 'result', 'tracking', 'verdict', 'declared_verdict', 'capture_state', 'active_limit_state'].includes(key) && typeof record[key] === 'string' && !operatorState(record[key] as string).known).map((key) => <UnknownState key={key} value={String(record[key])} />)}

    {typeof record.text === 'string' && <p>{record.text}</p>}
    {textFields.filter((key) => key !== 'text' && typeof record[key] === 'string').map((key) => <div key={key}><b>{operatorFactLabel(key)}</b><p>{String(record[key])}</p></div>)}
    {section === 'criteria' && <div className="attempt-evidence-columns">{(['producer', 'reviewer'] as const).map((evidenceRole) => { const text = evidenceText(record[evidenceRole]); return text ? <div key={evidenceRole}><b>{evidenceRole === 'producer' ? 'Evidência do Implementador' : 'Evidência do Revisor'}</b><p>{text}</p></div> : null; })}</div>}
  </article>;
}


function cleanupLabel(state: AttemptDetail["cleanup"]): string {
  return state === 'complete' ? 'Concluída' : state === 'uncertain' ? 'Incerta' : 'Pendente';
}

function operationStateLabel(state: string | undefined): string {
  return operatorState(state).label.toLocaleLowerCase('pt-BR');
}

function diffStatusLabel(status: string): string {
  return ({ added: 'Adicionado', modified: 'Alterado', deleted: 'Removido', renamed: 'Renomeado', copied: 'Copiado', typechange: 'Tipo alterado' } as Record<string, string>)[status] ?? 'Alteração registrada';
}
