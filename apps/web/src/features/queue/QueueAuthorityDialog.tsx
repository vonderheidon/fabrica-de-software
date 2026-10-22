import { useEffect, useRef, useState } from 'react';
import type { HttpAttemptDetail as AttemptDetail, OperationAccepted, OperationView, HttpQueueItem as QueueItem, HttpQueueObservation as QueueObservation } from '#contracts';
import { HttpError, requestJson, requestJsonWithMetadata } from '../../api/http.js';
import { queueQuery } from '../../api/observation-requests.js';
import { operatorCodeLabel, operatorState } from '../../app/operator-language.js';

type DetailState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; detail: AttemptDetail; etag: string };
type CurrentIssueState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; item: QueueItem | null };

export function QueueAuthorityDialog({ attemptId, onClose, onChanged }: { attemptId: string; onClose: () => void; onChanged: () => void }) {
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [currentIssue, setCurrentIssue] = useState<CurrentIssueState>({ status: 'loading' });
  const [action, setAction] = useState<'idle' | 'submitting' | 'accepted' | 'failed'>('idle');
  const [message, setMessage] = useState('');
  const requestVersion = useRef(0);

  async function reload(): Promise<void> {
    const version = ++requestVersion.current;
    setState({ status: 'loading' });
    setCurrentIssue({ status: 'loading' });
    try {
      const { data, etag } = await requestJsonWithMetadata<AttemptDetail>(`/api/v1/attempts/${encodeURIComponent(attemptId)}`);
      if (!etag) throw new Error('O controlador não retornou a revisão da tentativa.');
      if (version !== requestVersion.current) return;
      setState({ status: 'ready', detail: data, etag });
      const params = new URLSearchParams(queueQuery(data.project_id, null));
      void findCurrentIssue(params, data.issue.id).then((item) => {
        if (version === requestVersion.current) setCurrentIssue({ status: 'ready', item });
      }).catch((error: unknown) => {
        if (version === requestVersion.current) setCurrentIssue({ status: 'error', message: error instanceof HttpError ? error.message : 'Não foi possível confirmar uma observação completa da issue.' });
      });
    } catch (error: unknown) {
      if (version === requestVersion.current) setState({ status: 'error', message: error instanceof HttpError ? error.message : 'Não foi possível carregar a autoridade atual da tentativa.' });
    }
  }

  useEffect(() => {
    void reload();
    return () => { requestVersion.current += 1; };
  }, [attemptId]);

  async function run(kind: 'revalidate' | 'cancel'): Promise<void> {
    if (state.status !== 'ready' || action === 'submitting') return;
    setAction('submitting');
    setMessage('');
    const operationId = crypto.randomUUID();
    try {
      const path = kind === 'revalidate' ? `/api/v1/attempts/${encodeURIComponent(attemptId)}/revalidate` as const : `/api/v1/attempts/${encodeURIComponent(attemptId)}/cancel` as const;
      const { data } = await requestJsonWithMetadata<OperationAccepted>(path, {
        method: 'POST', headers: { 'If-Match': state.etag, 'Idempotency-Key': operationId }, body: JSON.stringify(kind === 'cancel' ? { reason: 'Autoridade revisada pelo operador na Principal.' } : {}),
      });
      if (data.operation_id !== operationId) throw new Error('A operação retornada não corresponde à solicitação.');
      setAction('accepted');
      setMessage(kind === 'revalidate' ? 'Revalidação aceita. A tentativa preserva a versão e o histórico; a autoridade será atualizada pelo controlador.' : 'Cancelamento aceito. A tentativa ativa continua preservada até haver confirmação de parada.');
      onChanged();
      void followOperation(operationId, kind);
    } catch (error: unknown) {
      setAction('failed');
      setMessage(error instanceof HttpError ? error.message : 'A ação não foi confirmada. Consulte a tentativa antes de repetir.');
    }
  }

  async function followOperation(operationId: string, kind: 'revalidate' | 'cancel'): Promise<void> {
    for (let index = 0; index < 5; index += 1) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 1000));
      try {
        const operation = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(operationId)}`);
        if (operation.state === 'succeeded') {
          setMessage(kind === 'revalidate' ? 'Revalidação confirmada pelo recibo. Consulte os valores observados abaixo.' : 'A revogação foi confirmada. A parada física dos recursos continua sendo acompanhada separadamente.');
          await reload();
          onChanged();
          return;
        }
        if (operation.state === 'failed' || operation.state === 'unknown') {
          setMessage(operation.error?.message ?? 'O controlador não confirmou a conclusão da operação.');
          setAction('failed');
          await reload();
          return;
        }
      } catch {
        setMessage('A alteração foi aceita, mas ainda não foi confirmada. Consulte o estado atual antes de enviar outra ação.');
        return;
      }
    }
    setMessage('A alteração continua em acompanhamento. Consulte o estado atual antes de repetir.');
  }

  const authority = state.status === 'ready' ? state.detail.authority : null;
  const divergence = authority?.reason === 'KANBAN_DIVERGENCE';
  const expectedPerson = state.status === 'ready' && currentIssue.status === 'ready'
    ? currentIssue.item?.assignees.find(person => person.id === state.detail.expected_account_id) : null;

  return <div className="authority-dialog">
    {state.status === 'loading' && <p role="status">Consultando as condições da tentativa…</p>}
    {state.status === 'error' && <div className="queue-error" role="alert"><p>{state.message}</p><button type="button" onClick={() => void reload()}>Tentar novamente</button></div>}
    {state.status === 'ready' && <>
      <p className="muted">Issue #{state.detail.issue.number} · {state.detail.issue.title}</p>
      <dl className="queue-authority-values">
        <div><dt>Motivo observado</dt><dd>{authority?.reason ? operatorCodeLabel(authority.reason) : 'Nenhuma divergência registrada'}</dd></div>
        <div><dt>Responsável esperado</dt><dd>{expectedPerson ? `@${expectedPerson.login}` : 'Conta vinculada ao início da tentativa'}</dd></div>
        <div><dt>Responsáveis observados</dt><dd>{currentIssue.status === 'loading' ? 'Consultando leitura atual…' : currentIssue.status === 'error' ? `Não confirmado · ${currentIssue.message}` : currentIssue.item ? currentIssue.item.assignees.length ? currentIssue.item.assignees.map((assignee) => `@${assignee.login}`).join(', ') : 'Nenhum responsável observado' : 'Issue não localizada na consulta completa do Project'}</dd></div>
        <div><dt>Etapa da tentativa</dt><dd>{operatorState(state.detail.phase).label}</dd></div>
        <div><dt>Status observado</dt><dd>{currentIssue.status === 'ready' && currentIssue.item ? currentIssue.item.status ?? 'Sem valor de Status observado' : currentIssue.status === 'error' ? `Não confirmado · ${currentIssue.message}` : 'Não confirmado'}</dd></div>
        <div><dt>Observado em</dt><dd>{authority ? new Date(authority.observed_at_ms).toLocaleString('pt-BR') : 'Ainda não observado'}</dd></div>
      </dl>
      {authority?.reason && <div className="notice"><b>{divergence ? 'Corrija o Status no GitHub' : 'As condições da tentativa mudaram'}</b><p>{authority.recovery}</p><p>A fábrica não altera a responsabilidade nem move o card para resolver divergências.</p></div>}
      {!authority?.reason && <p className="notice">A versão e o histórico estão preservados. As condições serão conferidas novamente antes de executar ações.</p>}
      <div className="row queue-dialog-actions dialog-actions">
        <button type="button" onClick={onClose}>Fechar</button>
        {state.detail.capabilities.revalidate.available && <button type="button" onClick={() => void run('revalidate')} disabled={action === 'submitting'}>Revalidar</button>}
        {state.detail.capabilities.cancel.available && <button type="button" className="danger-button" onClick={() => void run('cancel')} disabled={action === 'submitting'}>Cancelar tentativa</button>}
      </div>
    </>}
    {message && <p className="queue-operation-message" role={action === 'failed' ? 'alert' : 'status'}>{message}</p>}
  </div>;
}

async function findCurrentIssue(params: URLSearchParams, issueId: string): Promise<QueueItem | null> {
  let cursor: string | null = null;
  do {
    if (cursor) params.set('cursor', cursor); else params.delete('cursor');
    const queue = await requestJson<QueueObservation>(`/api/v1/queue?${params.toString()}`);
    if (!queue.complete) throw new Error('A consulta da fila está parcial; responsáveis e Status atuais não foram confirmados.');
    const item = queue.page.items.find((candidate) => candidate.project_id === params.get('project_id') && candidate.issue_id === issueId);
    if (item) return item;
    cursor = queue.page.has_more ? queue.page.next_cursor : null;
  } while (cursor);
  return null;
}
