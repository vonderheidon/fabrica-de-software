import { useState } from 'react';
import type { DeliverySummaryView } from '#contracts';
import { deliveryModeLabel } from '../../app/delivery-modes.js';

const outcomeLabel: Record<DeliverySummaryView['outcome'], string> = {
  pending:'Entrega pendente',blocked:'Entrega impedida',icr_approved:'ICR aprovado',partial:'Entrega parcial',complete:'Entrega concluída',unavailable:'Versão indisponível',
};
const effectLabel: Record<string, string> = { local_commit:'commit local',push:'publicação da branch',pull_request:'abertura do PR',issue_comment:'registro do resultado',project_status:'atualização do quadro' };

export function DeliverySummary({ value, stale = false }: { value: DeliverySummaryView; stale?: boolean }) {
  const [copyState, setCopyState] = useState<string | null>(null);
  const complete = !stale && ['icr_approved','complete'].includes(value.outcome);
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopyState('Referência copiada.'); }
    catch { setCopyState('Não foi possível copiar; selecione o texto da referência.'); }
  }
  return <section className={`delivery-result ${complete ? 'delivery-result-complete' : ''}`} aria-labelledby="publication-panel-title">
    <div className="delivery-result-heading"><div><span className="eyebrow">Resultado da versão selecionada</span>
      <h3 id="publication-panel-title">{outcomeLabel[value.outcome]}</h3></div>
      {value.pull_request_url && <a className="delivery-result-link" href={value.pull_request_url} target="_blank" rel="noreferrer">Ver PR</a>}
    </div>
    {stale && <p className="stale-note" role="status">Última consulta desta versão. Atualize os dados antes de continuar a entrega.</p>}
    <dl className="delivery-result-facts">
      <div><dt>Modo autorizado</dt><dd>{deliveryModeLabel[value.authorized_mode]}</dd></div>
      <div><dt>Critérios comprovados</dt><dd>{value.criteria_satisfied} de {value.criteria_total}</dd></div>
      <div><dt>Checks aprovados</dt><dd>{value.checks_succeeded} de {value.checks_total}</dd></div>
      <div><dt>Revisão independente</dt><dd>{value.review_state === 'approved' ? 'Aprovada nesta versão' : value.review_state === 'rejected' ? 'Reprovada nesta versão' : 'Não comprovada'}</dd></div>
      <div><dt>Achados resolvidos</dt><dd>{value.resolved_findings}</dd></div>
      <div><dt>Modo original</dt><dd>{deliveryModeLabel[value.original_mode]}</dd></div>
      {value.code_location && <div className="delivery-fact-wide"><dt>Código no ambiente da tentativa</dt><dd>{value.code_location}</dd></div>}
      {value.local_repository && <div className="delivery-fact-wide"><dt>Repositório local da entrega</dt><dd>{value.local_repository}</dd></div>}
      {value.branch_ref && <div className="delivery-fact-wide"><dt>Branch da entrega</dt><dd>{value.branch_ref.replace(/^refs\/heads\//,'')}</dd></div>}
      {value.commit_sha && <div><dt>Commit confirmado</dt><dd><code title={value.commit_sha}>{value.commit_sha.slice(0,12)}</code></dd></div>}
      {value.approved_ref && <div className="delivery-fact-wide"><dt>Referência fixa aprovada</dt><dd className="delivery-reference"><code>{value.approved_ref}</code><button type="button" onClick={() => void copy(value.approved_ref!)}>Copiar referência</button></dd></div>}
    </dl>
    {copyState && <p role="status">{copyState}</p>}
    {value.pending_effects.length > 0 && <p className="delivery-pending"><b>Pendente:</b> {value.pending_effects.map(effect => effectLabel[effect] ?? 'efeito da entrega').join(', ')}.</p>}
    {value.limitations.length > 0 && <ul className="delivery-limitations" aria-label="Limitações e próxima ação">{value.limitations.map(text => <li key={text}>{text}</li>)}</ul>}
  </section>;
}
