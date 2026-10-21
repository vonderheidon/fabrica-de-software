import { useCallback, useEffect, useState } from 'react';
import { getProjectDeletionPreview, isProjectDeletionCompleted, isProjectDeletionOperationCompleted, type DeletionOriginContext, type ProjectDeletionPreview, type ProjectDeletionStatus } from '../../api/project-deletion.js';
import { refreshProjectDeletion, subscribeProjectDeletion } from './project-deletion-observer.js';

type ReadState<T> = { identity: string; data: T | null; loading: boolean; error: string | null };
// Each effect owns its timer and abort controller; cleanup only stops observation.
export function observeDeletion<T>(read: (signal: AbortSignal) => Promise<T>, publish: (value: T) => void,
  fail: (error: unknown) => void, intervalMs: number | null, maxBackoffMs: number, terminal: (value: T) => boolean): () => void {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  const controller = new AbortController();
  const run = async () => {
    let stopped = false;
    try {
      const value = await read(controller.signal);
      if (!active) return;
      failures = 0;
      publish(value);
      stopped = terminal(value);
    } catch (error: unknown) { if (!active) return; failures += 1; fail(error); }
    if (active && intervalMs !== null && !stopped) timer = setTimeout(() => { void run(); }, failures ? Math.min(maxBackoffMs, intervalMs * 2 ** Math.min(failures, 20)) : intervalMs);
  };
  void run();
  return () => { active = false; controller.abort(); if (timer !== undefined) clearTimeout(timer); };
}

export function useProjectDeletionPreview(context: DeletionOriginContext | null) {
  const identity = JSON.stringify(context);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<ReadState<{ preview: ProjectDeletionPreview; etag: string | null; context: DeletionOriginContext }>>({ identity, data: null, loading: context !== null, error: null });
  useEffect(() => {
    const onCompleted = () => { if (context && isProjectDeletionCompleted(context.projectId)) setState({ identity, data: null, loading: false, error: null }); };
    window.addEventListener('factory-project-deleted', onCompleted);
    return () => window.removeEventListener('factory-project-deleted', onCompleted);
  }, [identity]);
  useEffect(() => {
    setState({ identity, data: null, loading: context !== null, error: null });
    if (!context) return;
    return observeDeletion((signal) => getProjectDeletionPreview(context, signal),
      (data) => setState({ identity, data, loading: false, error: null }),
      () => setState({ identity, data: null, loading: false, error: 'Não foi possível conferir a exclusão. Consulte novamente.' }), null, 0, () => true);
  // The serialized context includes every initiating field and its version.
  }, [identity, reload]);
  const current = state.identity === identity && !(context && isProjectDeletionCompleted(context.projectId)) ? state : { identity, data: null, loading: context !== null, error: null };
  return { preview: current.data?.preview ?? null, etag: current.data?.etag ?? null, context: current.data?.context ?? null,
    loading: current.loading, error: current.error, refetch: useCallback(() => setReload((value) => value + 1), []) };
}

export function useProjectDeletionStatus(operationId: string | null, pollingIntervalMs: number, maxBackoffMs = pollingIntervalMs) {
  const identity = operationId ?? '';
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<ReadState<ProjectDeletionStatus>>({ identity, data: null, loading: operationId !== null, error: null });
  useEffect(() => {
    const onCompleted = () => {
      if (operationId && isProjectDeletionOperationCompleted(operationId)) setState({ identity, data: { operationId, state: 'succeeded' }, loading: false, error: null });
    };
    window.addEventListener('factory-project-deleted', onCompleted);
    return () => window.removeEventListener('factory-project-deleted', onCompleted);
  }, [identity]);
  useEffect(() => {
    setState((prior) => ({ identity, data: prior.identity === identity ? prior.data : null, loading: operationId !== null, error: null }));
    if (!operationId) return;
    const stop = subscribeProjectDeletion(operationId,
      (data) => setState({ identity, data, loading: false, error: null }),
      () => setState((prior) => ({ ...prior, loading: false, error: 'Não foi possível atualizar o andamento. A exclusão continua sendo consultável.' })),
      pollingIntervalMs, maxBackoffMs);
    if (reload > 0) refreshProjectDeletion(operationId);
    return stop;
  }, [identity, pollingIntervalMs, maxBackoffMs, reload]);
  const current = state.identity === identity ? state : { identity, data: null, loading: operationId !== null, error: null };
  return { status: current.data, loading: current.loading, error: current.error, refetch: useCallback(() => setReload((value) => value + 1), []) };
}

export { confirmProjectDeletion, resumeProjectDeletion, recoverUncertainOperation, resendProjectDeletion } from '../../api/project-deletion.js';
