import { useEffect, useState } from 'react';
import type { OperationView, HttpQueueSaved as QueueSaved } from '#contracts';
import { enableQueueRequest } from '../../api/observation-requests.js';
import { HttpError, requestJson, requestJsonWithMetadata } from '../../api/http.js';
import { recordUncertainOperation, resolveUncertainOperation } from '../../api/uncertain-operations.js';
import { QueueEnableSummary } from './QueuePanel.js';
import { useQueue } from './useQueue.js';

export function QueueEnableDialog({ projectId, onClose, onEnabled }: { projectId: string | null; onClose: () => void; onEnabled: () => void }) {
  const { load, refresh } = useQueue(projectId, true);
  const [authorizedSummaryHash, setAuthorizedSummaryHash] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [operationId, setOperationId] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const observation = load.observation;
  const authorized = observation?.summary_hash !== null && observation?.summary_hash !== undefined && authorizedSummaryHash === observation.summary_hash;
  const ready = load.status === 'ready' && observation?.valid === true && observation.observation_id !== null && observation.summary_hash !== null && load.etag !== null;

  useEffect(() => { setAuthorizedSummaryHash(null); }, [observation?.summary_hash]);

  async function enable(): Promise<void> {
    if (!observation || !load.etag || !ready || !authorized || submitting || uncertain) return;
    const id = operationId ?? crypto.randomUUID();
    setOperationId(id);
    setSubmitting(true);
    setMessage('');
    try {
      const { data, etag } = await requestJsonWithMetadata<QueueSaved>('/api/v1/queue', {
        method: 'PUT',
        headers: { 'If-Match': load.etag, 'Idempotency-Key': id },
        body: JSON.stringify(enableQueueRequest(observation)),
      });
      if (!etag || data.operation_id !== id || !data.receipt) throw new Error('O controlador não confirmou a gravação da fila.');
      resolveUncertainOperation(id);
      setUncertain(false);
      onEnabled();
    } catch (error: unknown) {
      if (error instanceof HttpError && error.code === 'QUEUE_SUMMARY_CHANGED') {
        setAuthorizedSummaryHash(null);
        setOperationId(null);
        setMessage('A observação da fila mudou. Revise o resumo atualizado neste diálogo antes de habilitar.');
        refresh();
      } else if (error instanceof HttpError && error.status < 500) {
        setAuthorizedSummaryHash(null);
        setOperationId(null);
        setMessage(error.message);
      } else {
        try { recordUncertainOperation({ operationId: id, kind: 'queue-enable', recordedAt: Date.now() }); } catch { /* The operation id remains visible in this dialog. */ }
        setUncertain(true);
        setMessage('A resposta não foi confirmada. Consulte o estado atual da fila antes de tentar outra alteração.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function consultOperation(): Promise<void> {
    if (!operationId || !uncertain || submitting) return;
    setSubmitting(true);
    try {
      const operation = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(operationId)}`);
      if (operation.state === 'succeeded') {
        resolveUncertainOperation(operationId);
        setUncertain(false);
        onEnabled();
      } else if (operation.state === 'failed') {
        resolveUncertainOperation(operationId);
        setUncertain(false);
        setOperationId(null);
        setMessage(operation.error?.message ?? 'O controlador confirmou que a habilitação falhou. Revise a observação antes de uma nova autorização.');
        refresh();
      } else {
        setMessage('A habilitação ainda não foi confirmada. Não envie outra alteração até consultar o estado atual da fila.');
      }
    } catch (error: unknown) {
      setMessage(error instanceof HttpError ? error.message : 'Não foi possível consultar o resultado. A habilitação não será enviada novamente até confirmar o estado da fila.');
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="queue-enable-dialog">
    <p className="muted">Revise os projetos, os modos de entrega e a ordem antes de habilitar novos inícios. A tentativa ativa continua acompanhada.</p>
    <p className="notice">Issues que continuam em Ready podem ser executadas novamente.</p>
    {load.status === 'loading' && !observation && <p role="status">Consultando a fila…</p>}
    {load.status === 'error' && !observation && <div className="queue-error" role="alert"><p>{load.message}</p><button type="button" onClick={refresh}>Revalidar resumo</button></div>}
    {observation && <QueueEnableSummary observation={observation} />}
    {observation && !observation.complete && <div className="notice" role="status">{observation.valid ? 'Projetos bloqueados permanecem sem execução. A autorização vale para os candidatos confirmados dos projetos disponíveis; o total global não está confirmado.' : 'A consulta está degradada. Habilitar fica indisponível até o controlador confirmar uma leitura válida.'}</div>}
    {message && <div className="notice queue-dialog-message" role={message.includes('incerta') ? 'alert' : 'status'}>{message}</div>}
    {ready && <label className="queue-authorization"><input type="checkbox" checked={authorized} onChange={(event) => setAuthorizedSummaryHash(event.currentTarget.checked && observation ? observation.summary_hash : null)} />Autorizo habilitar a fila neste escopo, com estes modos e esta ordenação.</label>}
    <div className="row queue-dialog-actions dialog-actions"><button type="button" onClick={onClose} disabled={submitting}>Cancelar</button>{uncertain && <button type="button" onClick={() => void consultOperation()} disabled={submitting}>Consultar operação</button>}<button type="button" className="primary" onClick={() => void enable()} disabled={!ready || !authorized || submitting || uncertain}>{submitting ? 'Confirmando…' : 'Habilitar fila'}</button></div>
  </div>;
}
