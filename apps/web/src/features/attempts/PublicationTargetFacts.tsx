import { useRef, useState, useEffect } from 'react';
import type { HttpAttemptDetail, HttpDeliveryDetail, PublicationTargetSelection } from '#contracts';
import { requestJson } from '../../api/http.js';

export function PublicationTargetFacts({ attemptId, deliveryId, target, publication }: {
  attemptId: string; deliveryId: string | null; target: HttpAttemptDetail['publication_target']; publication: HttpDeliveryDetail['publication'] | undefined;
}) {
  const [selections, setSelections] = useState<PublicationTargetSelection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function load(next?: string) {
    if (!deliveryId || busy.current) return;
    busy.current = true; setError(false);
    try {
      const query = new URLSearchParams({ section:'target_selections',delivery_id:deliveryId,limit:'25',...(next ? { cursor:next } : {}) });
      const data = await requestJson<HttpAttemptDetail>(`/api/v1/attempts/${encodeURIComponent(attemptId)}?${query}`);
      if (!alive.current) return;
      const page = data.v3_details?.section === 'target_selections' ? data.v3_details : null;
      setSelections(current => next ? [...current,...page?.items ?? []] : page?.items ?? []);
      setCursor(page?.next_cursor ?? null); setLoaded(true);
    } catch { if (alive.current) setError(true); }
    finally { busy.current = false; }
  }
  const confirmed = selections.filter(item => item.state === 'confirmed').at(-1);
  return <details className="attempt-axis-card card attempt-disclosure" onToggle={event => { if (event.currentTarget.open && !loaded) void load(); }}>
    <summary>Destino da versão aprovada</summary>
    <dl className="preparation-facts">
      {target && <div><dt>Intenção capturada</dt><dd>{`${target.selection.kind === 'clone' ? 'Clonagem futura em' : 'Usar clone em'} ${target.selection.kind === 'clone' ? target.selection.destination : target.selection.path}`}</dd></div>}
      {confirmed && <div><dt>Clone confirmado</dt><dd>{confirmed.local_path}</dd></div>}
      {publication?.commit?.branch_ref && <div><dt>Destino selado</dt><dd>Branch {publication.commit.branch_ref.replace(/^refs\/heads\//,'')}</dd></div>}
    </dl>
    {selections.some(item => ['accepted','running','unknown'].includes(item.state)) && <p role="status">A seleção do destino está pendente de confirmação. Consulte ou reconcilie a publicação antes de continuar.</p>}
    {error && <p role="alert">Não foi possível consultar o destino. <button type="button" onClick={() => void load()}>Consultar destino novamente</button></p>}
    <button type="button" onClick={() => void load()}>Atualizar destino</button>
    {cursor && <button type="button" onClick={() => void load(cursor)}>Consultar mais registros de destino</button>}
  </details>;
}
