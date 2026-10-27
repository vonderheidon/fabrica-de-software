import { useEffect, useRef, useState } from 'react';
import type { HttpAttemptDetail, HttpReview, HttpProducerResult } from '#contracts';
import { requestJson } from '../../api/http.js';
import { setAttemptSelection } from './execution-requests.js';

type Page = Exclude<NonNullable<HttpAttemptDetail['v3_details']>, { section: 'target_selections' }>;
const titles = { finding_assessments: 'Progresso dos problemas', finding_disputes: 'Contestações e respostas', decisions: 'Decisões registradas' };
export const progressLabel = (value: string) => ({ proven: 'Progresso comprovado', partial: 'Parcial comprovado', none: 'Sem progresso', not_assessable: 'Não foi possível avaliar' })[value] ?? 'Avaliação indisponível';
export const decisionLabel = (value: string) => ({ guidance: 'Orientar a mesma tentativa', change_profile: 'Preparar sucessora com outro perfil', end: 'Encerrar tentativa' })[value] ?? 'Decisão indisponível';
export function EvidenceList({ values }: { values: readonly string[] }) {
  return values.length ? <ul>{values.map((value, index) => <li key={index}>{value}</li>)}</ul> : <p className="muted">Evidência não registrada no histórico.</p>;
}

export function CorrectionHistory({ attemptId, round, deliveryId, sections = [] }: { attemptId: string; round: string | null; deliveryId: string | null; sections?: readonly string[] }) {
  const available = (Object.keys(titles) as Array<Page['section']>).filter(section => sections.includes(section));
  if (!available.length) return null;
  return <details className="attempt-axis-card card attempt-disclosure"><summary>Ciclo de correção e decisões</summary>
    {available.map(section => <HistorySection key={section} {...{ attemptId, round, deliveryId, section }} />)}
    {deliveryId && <CorrectionPackage deliveryId={deliveryId} />}
  </details>;
}

function HistorySection({ attemptId, round, deliveryId, section }: { attemptId: string; round: string | null; deliveryId: string | null; section: Page['section'] }) {
  const [page, setPage] = useState<Page | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function load(more = false) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    const query = new URLSearchParams({ section, limit: '25' });
    setAttemptSelection(query, round, deliveryId);
    if (more && page?.next_cursor) query.set('cursor', page.next_cursor);
    try {
      const data = await requestJson<HttpAttemptDetail>(`/api/v1/attempts/${encodeURIComponent(attemptId)}?${query}`);
      if (data.id !== attemptId || data.v3_details?.section !== section) throw new Error('Histórico incompatível com esta seleção.');
      if (active.current) setPage(current => ({ ...data.v3_details!, items: more && current ? [...current.items, ...data.v3_details!.items] : data.v3_details!.items }) as Page);
    } catch { if (active.current) setError('Não foi possível consultar este histórico. Tente novamente.'); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  return <details className="card attempt-disclosure"><summary>{titles[section]}</summary>
    <button type="button" disabled={busy} onClick={() => void load()}>{busy ? 'Consultando…' : page ? 'Atualizar histórico' : 'Consultar histórico'}</button>
    {error && <p role="alert">{error}</p>}
    {page?.items.map(item => <article className="attempt-record" key={item.id}>
      {'progress' in item && <><h4>{progressLabel(item.progress)} · rodada {item.round}</h4><p>{item.justification}</p><EvidenceList values={item.evidence} /></>}
      {'response_verdict' in item && <><h4>Contestação do Implementador</h4><p>{item.justification}</p><EvidenceList values={item.evidence} /><h4>Resposta do Revisor</h4><p>{item.response_verdict === 'maintained' ? 'Achado mantido' : item.response_verdict === 'resolved' ? 'Achado resolvido' : 'Aguardando resposta'}</p><p>{item.response_justification}</p><EvidenceList values={item.response_evidence ?? []} /><p>{item.response_delivery_id === item.delivery_id ? 'Resposta na mesma versão contestada.' : item.response_delivery_id ? 'Resposta registrada em uma versão posterior, preservando a contestação original.' : 'Versão de resposta ainda não registrada.'}</p></>}
      {'action' in item && <><h4>{decisionLabel(item.action)}</h4>{item.guidance && <p>{item.guidance}</p>}{item.successor_preparation_id && <p>Sucessora preparada, sem início automático. A tentativa anterior precisa ser encerrada explicitamente antes do início.</p>}</>}
      <p className="muted">{new Date(item.created_at_ms).toLocaleString('pt-BR')}</p>
      <details><summary>Vínculo do registro</summary><dl><div><dt>Versão</dt><dd>{item.delivery_id}</dd></div>{'finding_id' in item && <div><dt>Achado de origem</dt><dd>{item.finding_id}</dd></div>}</dl></details>
    </article>)}
    {page?.has_more && <button type="button" disabled={busy} onClick={() => void load(true)}>Carregar continuação do histórico</button>}
  </details>;
}

function CorrectionPackage({ deliveryId }: { deliveryId: string }) {
  const [value, setValue] = useState<{ review: HttpReview | null; producer: HttpProducerResult } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function load() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const base = `/api/v1/deliveries/${encodeURIComponent(deliveryId)}` as const;
      const [review, producer] = await Promise.all([requestJson<HttpReview | null>(`${base}/review`), requestJson<HttpProducerResult>(`${base}/producer-result`)]);
      if (review && review.delivery_id !== deliveryId || producer && producer.binding.delivery_version !== deliveryId) throw new Error('Versão divergente.');
      if (active.current) setValue({ review, producer });
    } catch { if (active.current) setError('Parecer completo indisponível nesta versão. Consulte novamente quando a revisão estiver registrada.'); }
    finally { if (active.current) setBusy(false); }
  }
  return <details className="card attempt-disclosure"><summary>Justificativas da correção e comandos repetidos</summary><button type="button" disabled={busy} onClick={() => void load()}>{busy ? 'Consultando…' : 'Consultar justificativas'}</button>
    {error && <p role="alert">{error}</p>}{value && <><h4>Alterações adicionais</h4><p>{value.producer?.result.additional_changes_justification ?? 'Justificativa adicional não registrada. A ausência não comprova alterações extras.'}</p><h4>Comandos repetidos pelo Revisor</h4>{value.review?.command_repetitions.length ? value.review.command_repetitions.map((item, index) => <article key={index}><code>{item.command}</code><p>{item.reason}</p><EvidenceList values={item.prior_evidence} /></article>) : <p>Repetições não registradas nesta revisão.</p>}</>}
  </details>;
}
