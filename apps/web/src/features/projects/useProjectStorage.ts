import { useEffect, useRef, useState } from 'react';
import { OperationView, type OperationAccepted, type ProjectStorageView, type StorageTransitionCommand } from '#contracts';
import { Value } from '@sinclair/typebox/value';
import { HttpError, requestJson } from '../../api/http.js';

type Original = { id: string; body: StorageTransitionCommand; etag: string };
const originals = new Map<string, Original>();
const keyFor = (scope: string) => `factory.storage-transition.v1.${encodeURIComponent(scope)}`;
function remembered(scope: string): string | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(keyFor(scope)) ?? 'null');
    if (!value || typeof value !== 'object' || !('operation_id' in value)) return null;
    return typeof value.operation_id === 'string' && /^[a-f0-9-]{36}$/i.test(value.operation_id) ? value.operation_id : null;
  } catch { return null; }
}

export function useProjectStorage({ projectId, installationId, accountId, storage, etag, onRefresh }: {
  projectId: string; installationId: string; accountId: string | null; storage: ProjectStorageView; etag: string; onRefresh: () => void;
}) {
  const scope = JSON.stringify([installationId, accountId, projectId]);
  const [record, setRecord] = useState<{ scope: string; id: string | null }>(() => ({ scope, id: remembered(scope) }));
  const operationId = record.scope === scope ? record.id : remembered(scope);
  const [operation, setOperation] = useState<{ scope: string; value: OperationView } | null>(null);
  const [failure, setFailure] = useState<{ scope: string; message: string; recovery: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const refusedObservation = useRef<ProjectStorageView | null>(null);
  const lifecycle = useRef(0);
  const refresh = useRef(onRefresh); refresh.current = onRefresh;
  useEffect(() => { lifecycle.current += 1; lock.current = false; setBusy(false); return () => { lifecycle.current += 1; }; }, [scope]);
  const visibleOperation = operation?.scope === scope ? operation.value : null;

  async function consult(id = operationId ?? storage.active_transition_operation_id): Promise<void> {
    if (!id || lock.current || id !== remembered(scope) && id !== storage.active_transition_operation_id) return;
    lock.current = true; setBusy(true);
    const generation = lifecycle.current;
    try {
      const value = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(id)}`);
      if (generation !== lifecycle.current) return;
      if (!Value.Check(OperationView, value) || value.operation_id !== id || value.kind !== 'project.storage.transition' || value.resource.type !== 'project' || value.resource.id !== projectId) throw new Error('INVALID_OPERATION');
      setOperation({ scope, value }); setFailure(null);
      refresh.current();
    } catch (error: unknown) {
      if (generation !== lifecycle.current) return;
      const http = error instanceof HttpError ? error : null;
      setFailure({ scope, message: http?.message ?? 'O resultado da transição não pôde ser consultado.', recovery: http?.recovery ?? 'Consulte novamente a operação original. Não envie uma nova transição.' });
    } finally { if (generation === lifecycle.current) { lock.current = false; setBusy(false); } }
  }

  useEffect(() => {
    const id = operationId ?? storage.active_transition_operation_id;
    if (!id || visibleOperation && ['succeeded', 'failed', 'unknown'].includes(visibleOperation.state)) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      await consult(id);
      if (!disposed) timer = setTimeout(() => void poll(), 5000);
    }
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [scope, operationId, storage.active_transition_operation_id, visibleOperation?.state]);

  async function send(resume = false): Promise<void> {
    if (lock.current) return;
    const plan = storage.transition_plan;
    const original = originals.get(scope);
    if (resume ? !original || original.id !== operationId || !visibleOperation || !['unknown', 'failed'].includes(visibleOperation.state)
      : operationId !== null || storage.active_transition_operation_id !== null || refusedObservation.current === storage || !plan?.capability.available) return;
    const command: Original = resume && original ? original : { id: crypto.randomUUID(), etag,
      body: { location_key: plan!.location_key, source_location_id: plan!.source_location_id, plan_hash: plan!.plan_hash, authorized: true } };
    lock.current = true; setBusy(true); setFailure(null);
    const generation = lifecycle.current;
    try {
      // Persist only correlation before sending. The original request stays in memory.
      sessionStorage.setItem(keyFor(scope), JSON.stringify({ operation_id: command.id, kind: 'project.storage.transition', recorded_at: Date.now() }));
      originals.set(scope, command); setRecord({ scope, id: command.id });
      const accepted = await requestJson<OperationAccepted>(`/api/v1/projects/${encodeURIComponent(projectId)}/storage-transition`, {
        method: 'POST', headers: { 'If-Match': command.etag, 'Idempotency-Key': command.id }, body: JSON.stringify(command.body),
      });
      if (generation !== lifecycle.current) return;
      if (accepted.operation_id !== command.id || accepted.resource.type !== 'project' || accepted.resource.id !== projectId) throw new Error('INVALID_ACCEPTANCE');
      // 202 confirms acceptance only. Completion is obtained from GET operations.
      setOperation(null);
      refresh.current();
    } catch (error: unknown) {
      if (generation !== lifecycle.current) return;
      const http = error instanceof HttpError ? error : null;
      const refused = !resume && http && [400, 403, 409, 412, 428].includes(http.status);
      if (refused) { refusedObservation.current = storage; sessionStorage.removeItem(keyFor(scope)); originals.delete(scope); setRecord({ scope, id: null }); }
      setFailure({ scope, message: http?.message ?? 'A aceitação da transição não foi confirmada.', recovery: http?.recovery ?? (refused ? 'Atualize e reveja o plano atual antes de autorizar novamente. Seu rascunho foi preservado.' : 'Consulte a operação original. O comando não será repetido automaticamente.') });
      refresh.current();
    } finally { if (generation === lifecycle.current) { lock.current = false; setBusy(false); } }
  }
  function acknowledge(): void {
    if (visibleOperation?.state !== 'succeeded') return;
    sessionStorage.removeItem(keyFor(scope)); originals.delete(scope); setRecord({ scope, id: null }); setOperation(null); refresh.current();
  }
  return { busy, operationId, requiresReview: refusedObservation.current === storage, operation: visibleOperation, failure: failure?.scope === scope ? failure : null,
    canResume: originals.get(scope)?.id === operationId && Boolean(visibleOperation && ['unknown', 'failed'].includes(visibleOperation.state)),
    consult, send, acknowledge };
}
