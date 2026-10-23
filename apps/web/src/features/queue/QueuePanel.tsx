import type { HttpQueueItem as QueueItem, HttpQueueObservation as QueueObservation } from '#contracts';
import type { QueueLoad } from './useQueue.js';
import { OperatorDiagnosticCard } from '../../app/OperatorSupport.js';

const reasonLabels: Record<QueueItem['reasons'][number], string> = {
  READ_INCOMPLETE: 'Observação incompleta', ACCOUNT_CHANGED: 'Conta observada diferente', NOT_AN_ISSUE: 'O item não é uma issue',
  ISSUE_CLOSED: 'Issue fechada', REPOSITORY_MISMATCH: 'Repositório divergente', ASSIGNEE_MISMATCH: 'Responsável não é exclusivo da conta',
  PROJECT_MEMBERSHIP_MISSING: 'Vínculo ao Project ausente ou arquivado', STATUS_MISMATCH: 'Status não é Ready', OPEN_BLOCKERS: 'Há bloqueadores abertos',
  DRAFT_ITEM: 'Rascunho de issue', PULL_REQUEST: 'Card de pull request', ARCHIVED_ITEM: 'Item arquivado', ALREADY_CONSUMED: 'Ciclo Ready já consumido',
  ATTEMPT_ACTIVE: 'Já existe tentativa ativa', PROJECT_UNAVAILABLE: 'Projeto indisponível', AUTOMATION_DISABLED: 'Automação desabilitada para o projeto',
  ASSIGNEE_MISSING: 'Sem responsável', ASSIGNEE_OTHER: 'Responsável de outra conta', MULTIPLE_ASSIGNEES: 'Múltiplos responsáveis',
  REMOTE_UNCONFIRMED: 'Remoto GitHub não confirmado', CODE_NOT_PUBLISHED: 'Commit da branch-base não publicado',
  PROJECT_REQUIRED: 'Quadro GitHub não vinculado', STATUS_MAPPING_LEGACY: 'Mapeamento de Status legado', STATUS_MAPPING_INVALID: 'Mapeamento de Status inválido',
};

export function QueuePanel({ load, pageNotice, pauseNotice, pauseUncertain, onConsultPause, onRefresh, onNextPage, onPreviousPage, canGoBack, pausing, onEnable, onPause, onAuthority }: {
  load: QueueLoad;
  pageNotice: string;
  pauseNotice: string;
  pauseUncertain: boolean;
  onConsultPause: () => void;
  onRefresh: () => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
  canGoBack: boolean;
  pausing: boolean;
  onEnable: (trigger: HTMLElement) => void;
  onPause: () => void;
  onAuthority: (attemptId: string, trigger: HTMLElement) => void;
}) {
  const observation = load.observation;
  const queueState = observation?.enabled ? 'Ligada' : 'Pausada';
  const canPause = load.etag !== null && observation?.enabled === true;
  const queryError = load.status === 'error' ? load.message : load.status === 'loading' ? load.previousError?.message : null;

  return <section className="queue-panel" aria-labelledby="queue-title" aria-busy={load.status === 'loading'}>
    <div className="card queue-summary-card">
      <div className="line queue-heading">
        <div><span className="eyebrow">Seleção automática</span><h2 id="queue-title">Fila Ready</h2></div>
        <span className={`pill ${pauseUncertain ? 'warn' : observation?.enabled ? '' : 'neutral'}`} aria-live="polite">{pauseUncertain ? 'Alteração sem confirmação' : observation ? queueState : load.status === 'error' ? 'Consulta indisponível' : 'Consultando fila'}</span>
      </div>
      <p className="muted queue-description">Inicia issues Ready dos projetos habilitados. Pausar impede novos inícios e mantém o acompanhamento das tentativas ativas.</p>
      <dl className="queue-facts">
        <div><dt>Elegíveis</dt><dd>{observation?.complete && observation.eligible_total !== null ? observation.eligible_total : 'Não confirmado'}</dd></div>
        <div><dt>Nesta página</dt><dd>{observation?.page.items.length ?? '—'}</dd></div>
        <div><dt>Conta GitHub</dt><dd>{observation?.account.login ? `@${observation.account.login}` : 'Não confirmada'}</dd></div>
        <div><dt>Entrega autorizada</dt><dd>{observation?.modes_by_project.length ? [...new Set(observation.modes_by_project.map((item) => modeLabel(item.mode)))].join(', ') : 'Nenhum modo disponível'}</dd></div>
      </dl>
      <p className="muted queue-order-note">Ordem por prioridade, posição no quadro e número da issue.{observation?.scope.kind === 'account' && ' Um projeto bloqueado não impede os demais.'}</p>
      {observation && !observation.account.login && <p className="muted">A consulta não confirmou a conta GitHub. Revalide a fila para conferir a identidade.</p>}
      {observation && !observation.complete && <div className="notice queue-degraded" role="status"><b>Consulta incompleta</b><p>{observation.valid ? 'Há projetos bloqueados. Os candidatos confirmados dos demais continuam disponíveis; o total global não foi confirmado.' : 'Confira as orientações por projeto abaixo e revalide a fila.'}</p></div>}

      <div className="row queue-actions">
        <button type="button" onClick={onRefresh} disabled={load.status === 'loading'}>Revalidar fila</button>
        {observation?.enabled
          ? <button type="button" className="danger-button" onClick={onPause} disabled={!canPause || pausing || pauseUncertain}>{pausing ? 'Aguardando recibo de pausa…' : 'Pausar novos inícios'}</button>
          : <button type="button" className="primary" onClick={(event) => onEnable(event.currentTarget)} disabled={!observation?.valid || load.etag === null}>Habilitar fila</button>}
        {pauseUncertain && <button type="button" onClick={onConsultPause} disabled={pausing}>Consultar operação</button>}
      </div>
      {pauseNotice && <div className="queue-error" role={pauseUncertain ? 'alert' : 'status'}><p>{pauseNotice}</p></div>}
      {queryError && <div className="queue-error" role="alert"><b>Não foi possível atualizar a fila</b><p>{queryError}</p><p>{observation ? 'Os dados da última consulta foram mantidos. Revalide a fila para conferir a situação atual.' : 'Revalide a fila para consultar os candidatos.'}</p></div>}
    </div>

    <div className="card queue-list-card">
      <div className="line panel-title"><div><h2>Issues e elegibilidade</h2></div><span className="muted queue-updated-at">{observation?.observed_at_ms ? `Atualizado ${new Date(observation.observed_at_ms).toLocaleTimeString('pt-BR')}` : 'Consultando issues'}</span></div>
      {pageNotice && <p className="queue-page-notice" role="status">{pageNotice}</p>}
      {observation?.page.items.length ? <div className="table-wrap"><table className="queue-table"><thead><tr><th scope="col">Issue</th><th scope="col">Responsável</th><th scope="col">Status</th><th scope="col">Situação</th><th scope="col">Ações</th></tr></thead><tbody>
        {observation.page.items.map((item) => <tr key={`${item.project_id}:${item.item_id}`}>
          <td data-label="Issue"><div className="queue-issue-meta"><span>{String(item.order.position).padStart(2, '0')}</span><small>{item.project_name}</small></div><b className="queue-issue-title">{item.number === null ? item.kind === 'draft' ? 'Rascunho' : item.kind === 'pull_request' ? 'Pull request' : 'Item inacessível' : `#${item.number}`} · {item.title ?? 'Título indisponível'}</b>{item.url && <a className="queue-issue-link" href={item.url} target="_blank" rel="noreferrer">Abrir no GitHub</a>}</td>
          <td data-label="Responsável"><span className="queue-assignees">{item.assignees.length ? item.assignees.map((assignee) => `@${assignee.login}`).join(', ') : 'Sem responsável'}</span></td>
          <td data-label="Status"><span className="queue-status-label">{item.status ?? 'Não observado'}</span></td>
          <td data-label="Situação"><div className="queue-item-state"><span className={`pill ${item.eligible ? '' : 'neutral'}`}>{item.eligible ? 'Elegível' : item.consumption === 'available' ? 'Não elegível' : consumptionLabel(item.consumption)}</span>{!item.eligible && item.reasons.length > 0 && <ul className="queue-item-reasons">{item.reasons.map((reason) => <li key={reason}>{reasonLabels[reason]}</li>)}</ul>}</div></td>
          <td data-label="Ações"><div className="queue-item-actions">{item.attempt_id ? <button type="button" onClick={(event) => onAuthority(item.attempt_id!, event.currentTarget)}>Ver autoridade</button> : item.eligible ? <span className="muted">{observation.enabled ? 'Aguardando início automático' : 'Aguardando habilitação'}</span> : <span className="muted">Sem ação disponível</span>}</div></td>
        </tr>)}
      </tbody></table></div> : <div className="queue-empty" role="status"><h3>{observation?.complete ? 'Nenhum item nesta página' : 'Aguardando leitura válida'}</h3><p>{observation?.complete ? 'A consulta completa não retornou candidatos visíveis.' : 'Itens não são considerados ausentes enquanto a consulta estiver parcial ou indisponível.'}</p></div>}
      <div className="queue-pagination"><button type="button" onClick={onPreviousPage} disabled={!canGoBack || load.status === 'loading'}>Página anterior</button><span>{observation?.page.has_more ? 'Há mais itens nesta observação.' : 'Fim dos itens observados.'}</span><button type="button" onClick={onNextPage} disabled={!observation?.page.has_more || load.status === 'loading'}>Próxima página</button></div>
      {observation?.diagnostics.map((item) => <OperatorDiagnosticCard key={`${item.code}:${item.message}`} code={item.code} state="unavailable" cause={item.message} recovery={item.recovery} />)}
    </div>
  </section>;
}

export function QueueEnableSummary({ observation }: { observation: QueueObservation }) {
  return <dl className="queue-enable-summary">
    <div><dt>Quantidade elegível observada</dt><dd>{observation.eligible_total ?? 'Não confirmada'}</dd></div>
    <div><dt>Escopo</dt><dd>{observation.scope.kind === 'account' ? 'Conta' : `${observation.scope.project_ids.length} projeto(s)`}</dd></div>
    <div><dt>Modos por projeto</dt><dd>{observation.modes_by_project.map((item) => modeLabel(item.mode)).join(', ') || 'Nenhum modo configurado'}</dd></div>
    <div><dt>Conta</dt><dd>{observation.account.login ? `@${observation.account.login}` : 'Conta indisponível'}</dd></div>
    <div><dt>Validade</dt><dd>{observation.valid && observation.complete ? 'Observação completa e válida' : 'Precisa revalidar antes de habilitar'}</dd></div>
    <div><dt>Ordem</dt><dd>Prioridade configurada, posição disponível no quadro e número da issue.</dd></div>
  </dl>;
}

function modeLabel(mode: QueueObservation['modes_by_project'][number]['mode']): string {
  return mode === 'icr' ? 'ICR' : mode === 'commit' ? 'ICR + commit' : 'ICR + commit + PR';
}

function consumptionLabel(state: QueueItem['consumption']): string {
  if (state === 'active') return 'Tentativa ativa';
  if (state === 'consumed') return 'Já consumida';
  if (state === 'unknown') return 'Consumo não confirmado';
  return 'Disponível';
}
