import { useEffect, useState } from 'react';
import type { OperationView, QueueSaved } from '#contracts';
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
  const authorized = observation?.summaryHash !== null && observation?.summaryHash !== undefined && authorizedSummaryHash === observation.summaryHash;
  const ready = load.status === 'ready' && observation?.complete === true && observation.valid && observation.eligibleTotal !== null && observation.observationId !== null && observation.summaryHash !== null && load.etag !== null;

  useEffect(() => { setAuthorizedSummaryHash(null); }, [observation?.summaryHash]);

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
        body: JSON.stringify({ enabled: true, scope: observation.scope, observationId: observation.observationId, authorizedSummaryHash: observation.summaryHash }),
      });
      if (!etag || data.operationId !== id || !data.receipt) throw new Error('O controlador não confirmou a gravação da fila.');
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
        setMessage(`Resposta incerta para a operação ${id}. Consulte a operação antes de tentar outra alteração.`);
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
        setMessage(`A operação ${operationId} permanece ${operation.state}. Não envie outra habilitação enquanto o resultado estiver indefinido.`);
      }
    } catch (error: unknown) {
      setMessage(error instanceof HttpError ? error.message : `Não foi possível consultar a operação ${operationId}. A identidade foi preservada; não reenvie a habilitação.`);
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="queue-enable-dialog">
    <p className="muted">Habilitar autoriza novos inícios somente para o escopo e as condições resumidas abaixo. A tentativa ativa permanece acompanhada.</p>
    {load.status === 'loading' && !observation && <p role="status">Consultando uma observação completa da fila…</p>}
    {load.status === 'error' && !observation && <div className="queue-error" role="alert"><p>{load.message}</p>{load.requestId && <small className="mono">Solicitação {load.requestId}</small>}<button type="button" onClick={refresh}>Revalidar resumo</button></div>}
    {observation && <QueueEnableSummary observation={observation} />}
    {observation && !observation.complete && <div className="notice" role="status">A consulta está degradada. Habilitar fica indisponível até o controlador confirmar uma leitura completa.</div>}
    {message && <div className="notice queue-dialog-message" role={message.includes('incerta') ? 'alert' : 'status'}>{message}</div>}
    {ready && <label className="queue-authorization"><input type="checkbox" checked={authorized} onChange={(event) => setAuthorizedSummaryHash(event.currentTarget.checked && observation ? observation.summaryHash : null)} />Autorizo habilitar a fila neste escopo, com estes modos e esta ordenação.</label>}
    <div className="row queue-dialog-actions"><button type="button" onClick={onClose} disabled={submitting}>Cancelar</button>{uncertain && <button type="button" onClick={() => void consultOperation()} disabled={submitting}>Consultar operação</button>}<button type="button" className="primary" onClick={() => void enable()} disabled={!ready || !authorized || submitting || uncertain}>{submitting ? 'Aguardando recibo…' : 'Habilitar fila'}</button></div>
  </div>;
}
