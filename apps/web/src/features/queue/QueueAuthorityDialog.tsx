import { useEffect, useState } from 'react';
import type { AttemptDetail, OperationAccepted, OperationView, QueueItem, QueueObservation } from '#contracts';
import { HttpError, requestJson, requestJsonWithMetadata } from '../../api/http.js';

type DetailState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; detail: AttemptDetail; etag: string };

export function QueueAuthorityDialog({ attemptId, onClose, onChanged }: { attemptId: string; onClose: () => void; onChanged: () => void }) {
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [currentIssue, setCurrentIssue] = useState<QueueItem | null>(null);
  const [action, setAction] = useState<'idle' | 'submitting' | 'accepted' | 'failed'>('idle');
  const [message, setMessage] = useState('');

  async function reload(): Promise<void> {
    setState({ status: 'loading' });
    try {
      const { data, etag } = await requestJsonWithMetadata<AttemptDetail>(`/api/v1/attempts/${encodeURIComponent(attemptId)}`);
      if (!etag) throw new Error('O controlador não retornou a revisão da tentativa.');
      setState({ status: 'ready', detail: data, etag });
      const params = new URLSearchParams({ projectId: data.projectId, limit: '100' });
      void findCurrentIssue(params, data.issue.id).then(setCurrentIssue).catch(() => setCurrentIssue(null));
    } catch (error: unknown) {
      setState({ status: 'error', message: error instanceof HttpError ? error.message : 'Não foi possível carregar a autoridade atual da tentativa.' });
    }
  }

  useEffect(() => { void reload(); }, [attemptId]);

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
      if (data.operationId !== operationId) throw new Error('A operação retornada não corresponde à solicitação.');
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
        setMessage(`A operação ${operationId} foi aceita; o recibo ainda não está disponível. Não envie outra ação até consultar a operação.`);
        return;
      }
    }
    setMessage(`A operação ${operationId} continua em acompanhamento. Consulte a operação antes de repetir.`);
  }

  const authority = state.status === 'ready' ? state.detail.authority : null;
  const divergence = authority?.reason === 'KANBAN_DIVERGENCE';

  return <div className="authority-dialog">
    {state.status === 'loading' && <p role="status">Consultando autoridade e estado atuais…</p>}
    {state.status === 'error' && <div className="queue-error" role="alert"><p>{state.message}</p><button type="button" onClick={() => void reload()}>Tentar novamente</button></div>}
    {state.status === 'ready' && <>
      <p className="muted">Issue #{state.detail.issue.number} · {state.detail.issue.title}</p>
      <dl className="queue-authority-values">
        <div><dt>Motivo observado</dt><dd>{authority?.reason ?? 'Nenhuma divergência registrada'}</dd></div>
        <div><dt>Responsável esperado</dt><dd className="mono">{state.detail.expectedAccountId}</dd></div>
        <div><dt>Responsáveis observados</dt><dd>{currentIssue?.assignees.length ? currentIssue.assignees.map((assignee) => `@${assignee.login} · ${assignee.id}`).join(', ') : 'Consulta atual indisponível ou sem assignee'}</dd></div>
        <div><dt>Status esperado</dt><dd className="mono">{authority?.expectedStatusId ?? 'Não aplicável'}</dd></div>
        <div><dt>Status observado</dt><dd>{currentIssue?.status ?? authority?.observedStatusId ?? 'Não confirmado'}{authority?.observedStatusId ? ` · ${authority.observedStatusId}` : ''}</dd></div>
        <div><dt>Observado em</dt><dd>{authority ? new Date(authority.observedAtMs).toLocaleString('pt-BR') : 'Ainda não observado'}</dd></div>
      </dl>
      {authority?.reason && <div className="notice"><b>{divergence ? 'Corrija o Status no GitHub' : 'A autoridade precisa ser reconciliada'}</b><p>{authority.recovery}</p><p>A fábrica não altera a responsabilidade nem move o card para resolver divergências.</p></div>}
      {!authority?.reason && <p className="notice">A tentativa preserva a captura e o histórico. A observação não concede autoridade futura; cada despacho e efeito ainda será revalidado.</p>}
      <div className="row queue-dialog-actions">
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
    const item = queue.page.items.find((candidate) => candidate.issueId === issueId);
    if (item) return item;
    cursor = queue.page.hasMore ? queue.page.nextCursor : null;
  } while (cursor);
  return null;
}
