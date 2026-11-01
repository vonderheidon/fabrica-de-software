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
  PROJECT_REQUIRED: 'Quadro GitHub não vinculado', STATUS_MAPPING_INVALID: 'Mapeamento de Status inválido',
  ISSUE_TITLE_REQUIRED: 'Informe o título da issue',
  ISSUE_OBJECTIVE_REQUIRED: 'Descreva o objetivo sob Objetivo, Descrição ou What to build',
  CRITERIA_LIST_INVALID: 'Inclua uma lista Markdown de critérios sob Critérios de aceite ou Acceptance criteria',
  CRITERION_ID_INVALID: 'Use identificadores AC com número positivo ou omita os IDs',
  CRITERION_ID_DUPLICATED: 'Use um identificador diferente para cada critério',
  CRITERION_TEXT_INVALID: 'Preencha cada critério e respeite o limite de 65.536 caracteres',
};

export function QueuePanel({ load, linkedAccountId, pageNotice, pauseNotice, pauseUncertain, retryAtMs, canRefresh, onConsultPause, onRefresh, onNextPage, onPreviousPage, canGoBack, pausing, onEnable, onPause, onAuthority }: {
  load: QueueLoad;
  linkedAccountId?: string | null | undefined;
  pageNotice: string;
  pauseNotice: string;
  pauseUncertain: boolean;
  retryAtMs: number | null;
  canRefresh: boolean;
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
  const current = load.status === 'ready';
  const observedAt = observation?.observed_at_ms === null || observation?.observed_at_ms === undefined
    ? null : new Date(observation.observed_at_ms).toLocaleTimeString('pt-BR');
  const readLabel = load.status === 'loading'
    ? observedAt ? `Última leitura ${observedAt}` : 'Consultando a fila pela primeira vez'
    : load.status === 'error'
      ? observedAt ? `Última leitura ${observedAt}` : 'Consulta indisponível'
      : observedAt ? observation?.complete ? `Atualizado ${observedAt}` : `Leitura parcial ${observedAt}` : 'Leitura não realizada';
  const account = observation?.account;
  const accountLabel = linkedAccountId === undefined
    ? 'Vínculo não consultado'
    : linkedAccountId === null
      ? account?.login ? `@${account.login} observada · sem vínculo salvo` : 'Nenhuma conta vinculada'
      : current && account?.id
        ? account.id === linkedAccountId ? account.login ? `@${account.login} confirmada` : 'Vínculo salvo · conta confirmada' : account.login ? `Divergente · @${account.login} observada` : 'Divergente · conta observada'
        : account?.id === linkedAccountId && account.login
          ? `Vínculo salvo · última @${account.login}` : 'Vínculo salvo · confirmação indisponível';
  const retryAt = current ? observation?.polling.retry_at_ms ?? null : null;
  const rateLimited = current && observation?.diagnostics.some((item) => item.code === 'RATE_LIMITED') === true;
  const canPause = current && load.etag !== null && observation?.enabled === true;
  const queryError = load.status === 'error' ? load.message : load.status === 'loading' ? load.previousError?.message : null;
  const stateLabel = pauseUncertain ? 'Alteração sem confirmação'
    : load.status === 'loading' ? observation ? 'Atualizando' : 'Consultando fila'
      : load.status === 'error' ? observation ? 'Dados desatualizados' : 'Consulta indisponível'
        : observation ? queueState : 'Consultando fila';
  const stateClass = pauseUncertain ? 'warn' : current && observation?.enabled ? '' : 'neutral';

  return <section className="queue-panel" aria-labelledby="queue-title" aria-busy={load.status === 'loading'}>
    <div className="card queue-summary-card">
      <div className="line queue-heading">
        <div><span className="eyebrow">Seleção automática</span><h2 id="queue-title">Fila Ready</h2></div>
        <span className={`pill ${stateClass}`} aria-live="polite">{stateLabel}</span>
      </div>
      <p className="muted queue-description">Inicia issues Ready dos projetos habilitados. Pausar impede novos inícios e mantém o acompanhamento das tentativas ativas.</p>
      <dl className="queue-facts">
        <div><dt>{observation && !current ? 'Elegíveis na última leitura' : 'Elegíveis'}</dt><dd>{observation?.complete && observation.eligible_total !== null ? observation.eligible_total : 'Não confirmado'}</dd></div>
        <div><dt>Nesta página</dt><dd>{observation?.page.items.length ?? '—'}</dd></div>
        <div><dt>Conta GitHub</dt><dd>{accountLabel}</dd></div>
        <div><dt>Entrega autorizada</dt><dd>{observation?.modes_by_project.length ? [...new Set(observation.modes_by_project.map((item) => modeLabel(item.mode)))].join(', ') : 'Nenhum modo disponível'}</dd></div>
      </dl>
      {current && observation && !observation.account.login && <p className="muted">A consulta não confirmou a conta GitHub. Revalide a fila para conferir a identidade.</p>}
      {observation && !observation.complete && <div className="notice queue-degraded" role="status"><b>Consulta incompleta</b><p>{observation.valid ? 'Há projetos bloqueados. Os candidatos confirmados dos demais continuam disponíveis; o total global não foi confirmado.' : 'Confira as orientações por projeto abaixo e revalide a fila.'}</p></div>}
      {rateLimited && <div className="notice queue-degraded queue-rate-limit" role="status"><b>Consulta ao GitHub pausada pelo limite de uso</b><p>{retryAt === null ? 'O horário da próxima consulta ainda não foi confirmado.' : `Nova consulta prevista a partir de ${new Date(retryAt).toLocaleString('pt-BR')}.`} Esse horário não garante que o GitHub responderá com sucesso.</p></div>}

      <div className="row queue-actions">
        <button type="button" onClick={onRefresh} disabled={!canRefresh}>Revalidar fila</button>
        {observation?.enabled
          ? <button type="button" className="danger-button" onClick={onPause} disabled={!canPause || pausing || pauseUncertain}>{pausing ? 'Aguardando recibo de pausa…' : 'Pausar novos inícios'}</button>
          : <button type="button" className="primary" onClick={(event) => onEnable(event.currentTarget)} disabled={!current || !observation?.valid || load.etag === null}>Habilitar fila</button>}
        {pauseUncertain && <button type="button" onClick={onConsultPause} disabled={pausing}>Consultar operação</button>}
      </div>
      {pauseNotice && <div className="queue-error" role={pauseUncertain ? 'alert' : 'status'}><p>{pauseNotice}</p></div>}
      {queryError && <div className="queue-error" role="alert"><b>Não foi possível atualizar a fila</b><p>{queryError}</p><p>{retryAtMs !== null && retryAtMs > Date.now() ? `Nova tentativa automática prevista a partir de ${new Date(retryAtMs).toLocaleString('pt-BR')}.` : observation ? 'Os dados da última consulta foram mantidos. Revalide a fila para conferir a situação atual.' : 'Revalide a fila para consultar os candidatos.'}</p></div>}
    </div>

    <div className="card queue-list-card">
      <div className="line panel-title"><div><h2>Issues e elegibilidade</h2></div><span className={`muted queue-updated-at${current ? '' : ' queue-updated-at-stale'}`} role="status" aria-live="polite">{readLabel}</span></div>
      {pageNotice && <p className="queue-page-notice" role="status">{pageNotice}</p>}
      {observation?.page.items.length ? <div className="table-wrap"><table className="queue-table"><thead><tr><th scope="col">Issue</th><th scope="col">Responsável</th><th scope="col">Status</th><th scope="col">Situação</th><th scope="col">Ações</th></tr></thead><tbody>
        {observation.page.items.map((item) => <tr key={`${item.project_id}:${item.item_id}`}>
          <td data-label="Issue"><div className="queue-issue-meta"><span>{String(item.order.position).padStart(2, '0')}</span><small>{item.project_name}</small></div><b className="queue-issue-title">{item.number === null ? item.kind === 'draft' ? 'Rascunho' : item.kind === 'pull_request' ? 'Pull request' : 'Item inacessível' : `#${item.number}`} · {item.title ?? 'Título indisponível'}</b>{item.url && <a className="queue-issue-link" href={item.url} target="_blank" rel="noreferrer">Abrir no GitHub</a>}</td>
          <td data-label="Responsável"><span className="queue-assignees">{item.assignees.length ? item.assignees.map((assignee) => `@${assignee.login}`).join(', ') : 'Sem responsável'}</span></td>
          <td data-label="Status"><span className="queue-status-label">{item.status ?? 'Não observado'}</span></td>
          <td data-label="Situação"><div className="queue-item-state"><span className={`pill ${item.eligible ? '' : 'neutral'}`}>{item.eligible ? current ? 'Elegível' : 'Elegível na última leitura' : `${item.consumption === 'available' ? 'Não elegível' : consumptionLabel(item.consumption)}${current ? '' : ' na última leitura'}`}</span>{!item.eligible && item.reasons.length > 0 && <ul className="queue-item-reasons">{item.reasons.map((reason) => <li key={reason}>{reasonLabels[reason]}</li>)}</ul>}</div></td>
          <td data-label="Ações"><div className="queue-item-actions">{item.attempt_id ? <button type="button" onClick={(event) => onAuthority(item.attempt_id!, event.currentTarget)}>Ver autoridade</button> : item.eligible ? <span className="muted">{current ? observation.enabled ? 'Aguardando início automático' : 'Aguardando habilitação' : 'Dados da última leitura'}</span> : <span className="muted">{current ? 'Sem ação disponível' : 'Dados da última leitura'}</span>}</div></td>
        </tr>)}
      </tbody></table></div> : <div className="queue-empty" role="status"><h3>{load.status !== 'ready' && observation?.complete ? 'Nenhum item na última leitura' : observation?.complete ? 'Nenhum item nesta página' : 'Aguardando leitura válida'}</h3><p>{observation?.complete ? 'A consulta completa não retornou candidatos visíveis.' : 'Itens não são considerados ausentes enquanto a consulta estiver parcial ou indisponível.'}</p></div>}
      <div className="queue-pagination"><button type="button" onClick={onPreviousPage} disabled={!canGoBack || !current || !canRefresh}>Página anterior</button><span>{observation?.page.has_more ? 'Há mais itens nesta observação.' : 'Fim dos itens observados.'}</span><button type="button" onClick={onNextPage} disabled={!observation?.page.has_more || !current || !canRefresh}>Próxima página</button></div>
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
    <div><dt>Ordem</dt><dd>{observation.order.description}</dd></div>
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
