import type { HttpQueueItem as QueueItem, HttpQueueObservation as QueueObservation } from '#contracts';
import type { QueueLoad } from './useQueue.js';

const reasonLabels: Record<QueueItem['reasons'][number], string> = {
  READ_INCOMPLETE: 'Observação incompleta', ACCOUNT_CHANGED: 'Conta observada diferente', NOT_AN_ISSUE: 'O item não é uma issue',
  ISSUE_CLOSED: 'Issue fechada', REPOSITORY_MISMATCH: 'Repositório divergente', ASSIGNEE_MISMATCH: 'Responsável não é exclusivo da conta',
  PROJECT_MEMBERSHIP_MISSING: 'Vínculo ao Project ausente ou arquivado', STATUS_MISMATCH: 'Status não é Ready', OPEN_BLOCKERS: 'Há bloqueadores abertos',
  DRAFT_ITEM: 'Rascunho de issue', PULL_REQUEST: 'Card de pull request', ARCHIVED_ITEM: 'Item arquivado', ALREADY_CONSUMED: 'Ciclo Ready já consumido',
  ATTEMPT_ACTIVE: 'Já existe tentativa ativa', PROJECT_UNAVAILABLE: 'Projeto indisponível', AUTOMATION_DISABLED: 'Automação desabilitada para o projeto',
  ASSIGNEE_MISSING: 'Sem responsável', ASSIGNEE_OTHER: 'Responsável de outra conta', MULTIPLE_ASSIGNEES: 'Múltiplos responsáveis',
};

export function QueuePanel({ load, pageNotice, pauseNotice, pauseOperationId, pauseUncertain, onConsultPause, onRefresh, onNextPage, onPreviousPage, canGoBack, pausing, onEnable, onPause, onAuthority }: {
  load: QueueLoad;
  pageNotice: string;
  pauseNotice: string;
  pauseOperationId: string | null;
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

  return <section className="queue-panel" aria-labelledby="queue-title" aria-busy={load.status === 'loading'}>
    <div className="card queue-summary-card">
      <div className="line queue-heading">
        <div><span className="eyebrow">Seleção automática</span><h2 id="queue-title">Fila Ready</h2></div>
        <span className={`pill ${pauseUncertain ? 'warn' : observation?.enabled ? '' : 'neutral'}`} aria-live="polite">{pauseUncertain ? 'Alteração de fila sem recibo' : load.status === 'ready' ? queueState : observation ? `${queueState} · dado desatualizado` : 'Estado não observado'}</span>
      </div>
      <p className="muted">A fila projeta o GitHub. Pausá-la impede novos inícios automáticos; uma tentativa ativa continua acompanhada.</p>
      <dl className="queue-facts">
        <div><dt>Total elegível</dt><dd>{observation?.complete && observation.eligible_total !== null ? observation.eligible_total : 'Não confirmado'}</dd></div>
        <div><dt>Visíveis nesta página</dt><dd>{observation?.page.items.length ?? '—'}</dd></div>
        <div><dt>Ordem</dt><dd>{observation?.order.description ?? 'Aguardando observação completa'}</dd></div>
        <div><dt>Conta</dt><dd>{observation?.account.login ? `@${observation.account.login}` : 'Indisponível'}</dd></div>
        <div><dt>Modos autorizados</dt><dd>{observation?.modes_by_project.length ? observation.modes_by_project.map((item) => modeLabel(item.mode)).join(', ') : 'Nenhum modo disponível'}</dd></div>
      </dl>
      {!observation?.complete && <div className="notice queue-degraded" role="status"><b>Consulta degradada</b><p>{observation?.diagnostics.map((item) => item.message).join(' ') || 'O controlador ainda não confirmou uma leitura completa. A quantidade não representa ausência de candidatos.'}</p></div>}
      <div className="row queue-actions">
        <button type="button" onClick={onRefresh}>Revalidar fila</button>
        {observation?.enabled
          ? <button type="button" className="danger-button" onClick={onPause} disabled={!canPause || pausing || pauseUncertain}>{pausing ? 'Aguardando recibo de pausa…' : 'Pausar novos inícios'}</button>
          : <button type="button" className="primary" onClick={(event) => onEnable(event.currentTarget)} disabled={!observation?.complete || !observation.valid || load.etag === null}>Habilitar fila</button>}
        {pauseUncertain && <button type="button" onClick={onConsultPause} disabled={pausing}>Consultar operação</button>}
      </div>
      {pauseNotice && <div className="queue-error" role={pauseUncertain ? 'alert' : 'status'}><p>{pauseNotice}</p>{pauseOperationId && <small className="mono">Operação {pauseOperationId}</small>}</div>}
      {load.status === 'loading' && <p className="queue-inline-status" role="status">Atualizando a observação da fila…</p>}
      {load.status === 'loading' && load.previousError && <div className="queue-error" role="alert"><b>Última consulta falhou</b><p>{load.previousError.message}</p>{load.previousError.requestId && <small className="mono">Solicitação {load.previousError.requestId}</small>}<p>A observação abaixo é anterior e continua identificada como desatualizada.</p></div>}
      {load.status === 'error' && <div className="queue-error" role="alert"><b>Falha ao consultar a fila</b><p>{load.message}</p>{load.requestId && <small className="mono">Solicitação {load.requestId}</small>}<p>O erro não significa que não existam candidatos. A pausa continua disponível somente com estado e revisão confirmados.</p></div>}
    </div>

    <div className="card queue-list-card">
      <div className="line panel-title"><div><span className="eyebrow">Project observado</span><h2>Issues e elegibilidade</h2></div><span className="muted">{observation?.observed_at_ms ? `Atualizado ${new Date(observation.observed_at_ms).toLocaleTimeString('pt-BR')}` : 'Sem horário observado'}</span></div>
      {pageNotice && <p className="queue-page-notice" role="status">{pageNotice}</p>}
      {observation?.page.items.length ? <div className="table-wrap"><table className="queue-table"><thead><tr><th>Ordem / issue</th><th>Responsável</th><th>Status</th><th>Elegibilidade</th><th>Consumo</th><th>Ação</th></tr></thead><tbody>
        {observation.page.items.map((item) => <tr key={`${item.project_id}:${item.item_id}`}>
          <td><b>{String(item.order.position).padStart(2, '0')} · {item.number === null ? item.kind === 'draft' ? 'Rascunho' : item.kind === 'pull_request' ? 'Pull request' : 'Item inacessível' : `#${item.number}`} {item.title ?? 'Título indisponível'}</b><br /><small>{item.project_name} · {item.order.criterion}{item.order.value !== null ? ` ${item.order.value}` : ''}</small>{item.url && <><br /><a href={item.url} target="_blank" rel="noreferrer">Abrir issue no GitHub</a></>}</td>
          <td>{item.assignees.length ? item.assignees.map((assignee) => `@${assignee.login}`).join(', ') : 'Sem responsável'}</td>
          <td>{item.status ?? 'Não observado'}</td>
          <td><span className={`pill ${item.eligible ? '' : 'warn'}`}>{item.eligible ? 'Elegível' : item.reasons.map((reason) => reasonLabels[reason]).join('; ') || 'Inelegível'}</span></td>
          <td>{consumptionLabel(item.consumption, item.attempt_id)}</td>
          <td>{item.attempt_id ? <button type="button" onClick={(event) => onAuthority(item.attempt_id!, event.currentTarget)}>Ver autoridade</button> : item.eligible ? <span className="muted">Aguardando consumo automático</span> : '—'}</td>
        </tr>)}
      </tbody></table></div> : <div className="queue-empty" role="status"><h3>{observation?.complete ? 'Nenhum item nesta página' : 'Aguardando leitura válida'}</h3><p>{observation?.complete ? 'A consulta completa não retornou candidatos visíveis.' : 'Itens não são considerados ausentes enquanto a consulta estiver parcial ou indisponível.'}</p></div>}
      <div className="queue-pagination"><button type="button" onClick={onPreviousPage} disabled={!canGoBack || load.status === 'loading'}>Página anterior</button><span>{observation?.page.has_more ? 'Há mais itens nesta observação.' : 'Fim dos itens observados.'}</span><button type="button" onClick={onNextPage} disabled={!observation?.page.has_more || load.status === 'loading'}>Próxima página</button></div>
      {observation?.diagnostics.map((item) => <p className="queue-diagnostic" key={`${item.code}:${item.message}`}>{item.message} <span>{item.recovery}</span></p>)}
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
    <div><dt>Ordem</dt><dd>{observation.order.description}</dd></div>
  </dl>;
}

function modeLabel(mode: QueueObservation['modes_by_project'][number]['mode']): string {
  return mode === 'icr' ? 'ICR' : mode === 'commit' ? 'ICR + commit' : 'ICR + commit + PR';
}

function consumptionLabel(state: QueueItem['consumption'], attemptId: string | null): string {
  if (state === 'active') return attemptId ? `Tentativa ativa · ${attemptId}` : 'Tentativa ativa';
  if (state === 'consumed') return attemptId ? `Já consumida · ${attemptId}` : 'Já consumida';
  if (state === 'unknown') return 'Consumo não confirmado';
  return 'Disponível';
}
