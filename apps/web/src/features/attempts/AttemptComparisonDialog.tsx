import { useEffect, useRef, useState } from 'react';
import type { HttpAttemptComparison } from '#contracts';
import { requestJsonWithMetadata, HttpError } from '../../api/http.js';
import { operatorState } from '../../app/operator-language.js';
import { useAppliedObservation } from '../../app/applied-observations.js';

const labels: Record<string, string> = {
  project_revision: 'Revisão do projeto', preparation_revision: 'Revisão da preparação',
  base_branch: 'Branch base', implementer_profile: 'Perfil do Implementador', reviewer_profile: 'Perfil do Revisor',
  checks: 'Checks', correction_limit: 'Limite de correções', default_delivery_mode: 'Entrega padrão',
  automation_enabled: 'Automação', delivery_mode: 'Modo de entrega', time_defaults: 'Limites de tempo',
  artifact_policy: 'Política de artefatos', configuration_origins: 'Origem da configuração',
  implementer_guidance: 'Orientações do Implementador', reviewer_guidance: 'Orientações do Revisor',
  project_guidance: 'Orientações do projeto', effective_guidance: 'Orientações efetivas', preparation_guidance: 'Orientações da preparação',
  publication_target: 'Destino da publicação', content_identity: 'Versão do conteúdo',
  'implementer_profile.revision': 'Revisão do perfil do Implementador', 'reviewer_profile.revision': 'Revisão do perfil do Revisor',
  'implementer_profile.composition_version': 'Composição do Implementador', 'reviewer_profile.composition_version': 'Composição do Revisor',
};

export function AttemptComparisonDialog({ leftId, rightId, onClose }: { leftId: string; rightId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<HttpAttemptComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useAppliedObservation(true, !data && !error, Boolean(error), data ?? error);
  useEffect(() => {
    const refresh = () => setReload(value => value + 1);
    window.addEventListener('factory-controller-resync', refresh);
    return () => window.removeEventListener('factory-controller-resync', refresh);
  }, []);
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); trigger?.focus(); };
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setData(null); setError(null);
    const query = new URLSearchParams({ left_attempt_id: leftId, right_attempt_id: rightId });
    void requestJsonWithMetadata<HttpAttemptComparison>(`/api/v1/attempt-comparisons?${query}`, { signal: controller.signal }).then(({ data }) => {
      if (active) setData(data);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof HttpError && reason.status === 409 ? 'As tentativas devem pertencer à mesma conta, projeto, repositório e issue. Selecione outro par.' : 'Não foi possível consultar a comparação. Tente novamente.');
    });
    return () => { active = false; controller.abort(); };
  }, [leftId, rightId, reload]);
  const sides = data ? [data.left, data.right] : [];
  type Side = HttpAttemptComparison['left'];
  const facts: Array<[string, (side: Side) => string | number | null]> = [
    ['Início', side => new Date(side.started_at_ms).toLocaleString('pt-BR')],
    ['Resultado', side => operatorState(side.result ?? 'running').label],
    ['Motivo da falha', side => side.failure_reason], ['Rodada', side => side.round],
    ['Entrega', side => side.delivery_id], ['Versão do conteúdo', side => side.content_identity],
    ['Revisão do projeto', side => side.project_revision_id], ['Revisão da preparação', side => side.preparation_revision],
    ['Configuração histórica', side => side.configuration_state === 'available' ? 'Capturada' : 'Indisponível'],
  ];
  return <dialog ref={dialog} className="attempt-comparison-dialog" aria-labelledby="comparison-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2 id="comparison-title">Comparação de tentativas</h2><p>Capturas históricas de cada tentativa. Diferenças não demonstram a causa do resultado.</p></header>
    <div className="attempt-comparison-body">
      {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setReload(value => value + 1)}>Tentar novamente</button></div>}
      {!error && !data && <p role="status">Consultando comparação…</p>}
      {data && <>
        <p>Issue {data.issue_number === null ? 'sem número histórico' : `#${data.issue_number}`}</p>
        <div className="attempt-comparison-pair">{sides.map((side, index) => <section key={side.attempt_id} aria-label={`Tentativa ${index + 1}`}>
          <h3>Tentativa {index + 1}</h3><p>{side.attempt_id}</p>
        </section>)}</div>
        {facts.map(([label, value]) => <section key={label}><h4>{label}</h4><div className="attempt-comparison-pair">{sides.map((side, index) => <div key={side.attempt_id}><span className="comparison-side-label">Tentativa {index + 1}: </span>{value(side) ?? 'Indisponível'}</div>)}</div></section>)}
        <h3>Diferenças históricas</h3>
        {data.differences.length === 0 && <p>Nenhuma diferença nos dados históricos comparáveis.</p>}
        {data.differences.map(item => <section key={item.field}><h4>{labels[item.field] ?? item.field}</h4><div className="attempt-comparison-pair">{(['left', 'right'] as const).map((key, index) => <div key={key}><b>Tentativa {index + 1}</b><p>{item[key].state === 'available' ? item[key].value === null ? 'Não configurado' : typeof item[key].value === 'boolean' ? item[key].value ? 'Sim' : 'Não' : String(item[key].value) : `Indisponível. ${item[key].reason ?? 'Sem dado histórico comparável.'}`}</p></div>)}</div></section>)}
        {data.limitations.map((limitation, index) => <p key={index}>{limitation}</p>)}
      </>}
    </div>
    <footer><button type="button" autoFocus onClick={onClose}>Fechar comparação</button></footer>
  </dialog>;
}
