import { useCallback, useEffect, useRef, useState } from 'react';
import type { OperationAccepted, OperationView, ShutdownView, ShutdownWork } from '#contracts';
import { HttpError, requestJson, requestJsonWithMetadata } from '../../api/http.js';
import { readUncertainOperations, recordUncertainOperation, resolveUncertainOperation } from '../../api/uncertain-operations.js';
import { useAppliedObservation } from '../../app/applied-observations.js';

type Action = 'pause_starts' | 'close_when_idle' | 'resume_starts';
const labels: Record<Action, string> = { pause_starts: 'Pausar novos inícios', close_when_idle: 'Fechar quando ocioso', resume_starts: 'Retomar novos inícios' };
const states: Record<ShutdownView['state'], string> = { running: 'Novos inícios liberados', paused: 'Novos inícios pausados', draining: 'Aguardando trabalhos para fechar', ready_to_close: 'Pronto para conferir o fechamento', blocked: 'Encerramento bloqueado', closing: 'Fechamento comprometido' };
const workLabels: Record<ShutdownWork['type'], string> = { attempt: 'Tentativa', execution: 'Executor', publication: 'Publicação', creation: 'Criação', deletion: 'Exclusão', storage_transition: 'Transição de pasta', accepted_operation: 'Operação aceita' };

export function ShutdownDialog({ onClose, pollingIntervalMs = 15000 }: { onClose: () => void; pollingIntervalMs?: number }) {
  const [snapshot, setSnapshot] = useState<{ view: ShutdownView; etag: string | null } | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(() => readUncertainOperations().find(item => item.kind.startsWith('shutdown.')) ?? null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const sequence = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sequence.current++; }; }, []);
  const refresh = useCallback(async (next: string | null = null) => {
    const request = ++sequence.current;
    setLoading(true);
    try {
      const result = await requestJsonWithMetadata<ShutdownView>(`/api/v1/shutdown?limit=20${next ? `&cursor=${encodeURIComponent(next)}` : ''}`);
      if (!mounted.current || sequence.current !== request) return;
      setSnapshot({ view: result.data, etag: result.etag }); setCursor(next); setError('');
    } catch (failure: unknown) {
      if (mounted.current && sequence.current === request) setError(failure instanceof Error ? failure.message : 'Consulta indisponível. Atualize o estado.');
    } finally { if (mounted.current && sequence.current === request) setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const update = () => { void refresh(); };
    window.addEventListener('factory-controller-resync', update);
    window.addEventListener('factory-controller-event', update);
    const timer = window.setInterval(update, pollingIntervalMs);
    return () => { window.clearInterval(timer); window.removeEventListener('factory-controller-resync', update); window.removeEventListener('factory-controller-event', update); };
  }, [refresh, pollingIntervalMs]);
  useAppliedObservation(true, loading, Boolean(error), snapshot);

  async function consult(id = pending?.operationId, kind = pending?.kind): Promise<void> {
    if (!id) return;
    const operation = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(id)}`);
    if (!mounted.current) return;
    const progress = operation.progress && 'kind' in operation.progress && operation.progress.kind === 'shutdown' ? operation.progress : null;
    if (operation.state === 'succeeded' || operation.state === 'failed' || progress) {
      resolveUncertainOperation(id); setPending(null);
      setMessage(progress?.state === 'revoked' ? 'Pedido de fechamento revogado. Consulte o estado atual.' : operation.state === 'failed' ? operation.error?.message ?? 'Pedido recusado. Atualize o estado.' : kind === 'shutdown.resume_starts' ? 'Retomada aceita. Conferindo o estado atual.' : 'Pedido aceito. Conferindo o estado atual.');
      await refresh();
      window.dispatchEvent(new Event('factory-queue-updated'));
    } else setMessage('Resultado ainda incerto. Consulte a mesma operação antes de enviar outro comando.');
  }

  async function send(action: Action): Promise<void> {
    if (lock.current || pending || loading || error || !snapshot?.etag) return;
    const capability = action === 'pause_starts' ? snapshot.view.pause_capability : action === 'resume_starts' ? snapshot.view.resume_starts_capability : snapshot.view.close_when_idle_capability;
    if (!capability.available) return;
    lock.current = true; setBusy(true);
    const item = { operationId: crypto.randomUUID(), kind: `shutdown.${action}` as const, recordedAt: Date.now() };
    try {
      recordUncertainOperation(item); setPending(item);
      setMessage(`${labels[action]}: solicitação enviada, aguardando confirmação.`);
      await requestJson<OperationAccepted>('/api/v1/shutdown', { method: 'POST', headers: { 'If-Match': snapshot.etag, 'Idempotency-Key': item.operationId }, body: JSON.stringify({ action, authorized: true }) });
      await consult(item.operationId, item.kind);
    } catch (failure: unknown) {
      if (failure instanceof HttpError && [400, 403, 409, 412, 422].includes(failure.status)) {
        resolveUncertainOperation(item.operationId); setPending(null);
        setMessage(`${failure.message} ${failure.recovery ?? 'Atualize o estado e confira as ações disponíveis.'}`);
        await refresh();
      } else setMessage('Resposta não confirmada. Consulte a mesma operação; o comando não será reenviado.');
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }

  async function check(): Promise<void> {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await consult(); } catch { setMessage('Operação ainda não confirmada. Mantenha o acompanhamento e consulte novamente.'); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  const view = snapshot?.view;
  return <div className="shutdown-layout">
    <div className="shutdown-body">
    <p>Fechar esta interface não encerra o controlador ou os executores. Cancelamento e parada física são ações separadas no detalhe da tentativa; os ambientes são preservados.</p>
    {error && <p role="alert">{error} Atualize o estado antes de agir.</p>}
    {loading && <p role="status">Consultando estado atual…</p>}
    {view && <section aria-label="Estado do controlador">
      <h3>{states[view.state]}</h3>
      {view.starts_paused && <p>Pausa confirmada. Novos inícios permanecem bloqueados ao fechar o diálogo.</p>}
      {!loading && !error && !pending && !view.starts_paused && !view.automation_enabled && <p role="status">Novos inícios liberados. Automação permanece desligada.</p>}
      <p>{view.remaining_work_count} trabalho(s) dependente(s). {view.has_more ? 'Há mais trabalhos em outras páginas.' : ''}</p>
      {view.active_work.map(work => <article className="attempt-section" key={`${work.type}:${work.id}`}>
        <h3>{workLabels[work.type]}</h3><p style={{ overflowWrap: 'anywhere' }}>{work.id}</p>
        {work.project_id && <p style={{ overflowWrap: 'anywhere' }}>Projeto: {work.project_id}</p>}
        <p>{work.cause ?? 'Trabalho ainda depende do controlador.'}</p><p>{work.recovery ?? 'Mantenha o acompanhamento até confirmar sua conclusão.'}</p>
        {work.attempt_id && <a href={`#principal/tentativas?dialog=detail&attemptId=${encodeURIComponent(work.attempt_id)}`}>Abrir tentativa e ações de cancelamento/recursos</a>}
      </article>)}
      <div className="row"><button type="button" disabled={!cursor || loading || busy} onClick={() => void refresh()}>Primeira página</button><button type="button" disabled={!view.has_more || !view.next_cursor || loading || busy} onClick={() => void refresh(view.next_cursor)}>Próxima página</button></div>
      {(['pause_starts', 'close_when_idle', 'resume_starts'] as const).map(action => {
        const capability = action === 'pause_starts' ? view.pause_capability : action === 'resume_starts' ? view.resume_starts_capability : view.close_when_idle_capability;
        return !capability.available && capability.reason ? <p key={action}>{labels[action]}: {capability.reason} {capability.recovery}</p> : null;
      })}
    </section>}
    {message && <p role="status">{message}</p>}
    {pending && <p role="status">{labels[pending.kind.slice('shutdown.'.length) as Action]}: resultado ainda não confirmado. Consulte a operação.</p>}
    </div>
    <div className="dialog-actions">
      <button type="button" onClick={onClose}>Fechar diálogo</button>
      <button type="button" disabled={loading || busy} onClick={() => void refresh()}>Atualizar estado</button>
      {pending ? <button type="button" disabled={busy} onClick={() => void check()}>Consultar operação</button> : view && (['pause_starts', 'close_when_idle', 'resume_starts'] as const).map(action => <button type="button" key={action} disabled={busy || loading || Boolean(error) || !snapshot?.etag || !(action === 'pause_starts' ? view.pause_capability : action === 'resume_starts' ? view.resume_starts_capability : view.close_when_idle_capability).available} onClick={() => void send(action)}>{labels[action]}</button>)}
    </div>
  </div>;
}
