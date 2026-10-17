import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DiagnosticCheck, DiagnosticContext, DiagnosticsView, OperationAccepted, OperationView } from '#contracts';
import { HttpError, requestJson } from '../../api/http.js';

type DiagnosticLoad = { identity: string; view: DiagnosticsView | null; loading: boolean; refreshing: boolean; stale: boolean; error: string | null; requestId: string | null };
type VerificationState = { identity: string; operationId: string; state: OperationView['state'] | 'submitting' | 'unavailable'; error: string | null } | null;

function contextIdentity(context: DiagnosticContext | null): string {
  return context ? `${context.scope}:${context.scope === 'host' ? '' : context.id}` : 'none';
}

function diagnosticsPath(context: DiagnosticContext): `/api/v1/${string}` {
  const query = new URLSearchParams({ scope: context.scope });
  if (context.scope !== 'host') query.set('id', context.id);
  return `/api/v1/diagnostics?${query.toString()}`;
}

export function useDiagnostics(context: DiagnosticContext | null) {
  const identity = contextIdentity(context);
  const [reload, setReload] = useState(0);
  const [load, setLoad] = useState<DiagnosticLoad>({ identity: 'none', view: null, loading: false, refreshing: false, stale: false, error: null, requestId: null });
  const [verification, setVerification] = useState<VerificationState>(null);
  const [actionError, setActionError] = useState<{ identity: string; message: string; requestId: string | null } | null>(null);
  const shouldPollReceipt = Boolean(verification?.identity === identity && ['accepted', 'running'].includes(verification.state));
  const refresh = useCallback(() => setReload((value) => value + 1), []);
  const supportedChecks = useMemo(() => load.identity === identity ? load.view?.supportedChecks ?? [] : [], [identity, load.identity, load.view]);

  useEffect(() => {
    if (!context) { setLoad({ identity, view: null, loading: false, refreshing: false, stale: false, error: null, requestId: null }); return; }
    let active = true;
    const controller = new AbortController();
    const prior = load.identity === identity ? load.view : null;
    setLoad({ identity, view: prior, loading: prior === null, refreshing: prior !== null, stale: prior !== null, error: load.identity === identity ? load.error : null, requestId: load.identity === identity ? load.requestId : null });
    void requestJson<DiagnosticsView>(diagnosticsPath(context), { signal: controller.signal }).then((view) => {
      if (active) setLoad({ identity, view, loading: false, refreshing: false, stale: false, error: null, requestId: null });
    }).catch((error: unknown) => {
      if (!active || (error instanceof DOMException && error.name === 'AbortError')) return;
      setLoad((current) => ({ ...current, identity, loading: false, refreshing: false, stale: current.view !== null,
        error: error instanceof HttpError ? error.message : 'Não foi possível consultar o diagnóstico.',
        requestId: error instanceof HttpError ? error.requestId : null }));
    });
    return () => { active = false; controller.abort(); };
  }, [identity, reload]);

  useEffect(() => {
    const onChange = (): void => refresh();
    window.addEventListener('factory-controller-event', onChange);
    window.addEventListener('factory-controller-resync', onChange);
    return () => {
      window.removeEventListener('factory-controller-event', onChange);
      window.removeEventListener('factory-controller-resync', onChange);
    };
  }, [refresh]);

  useEffect(() => {
    const operationId = verification?.operationId;
    if (!operationId || !shouldPollReceipt) return;
    let active = true;
    let timer = 0;
    const poll = async (): Promise<void> => {
      try {
        const operation = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(operationId)}`);
        if (!active) return;
        setVerification((current) => current?.operationId === operationId ? { ...current, state: operation.state, error: operation.error?.message ?? null } : current);
        if (operation.state === 'succeeded' || operation.state === 'failed' || operation.state === 'unknown') refresh();
        else timer = window.setTimeout(() => void poll(), 1500);
      } catch {
        if (!active) return;
        setVerification((current) => current?.operationId === operationId ? { ...current, state: 'unavailable', error: 'A consulta do recibo falhou. A verificação não será reenviada automaticamente.' } : current);
      }
    };
    timer = window.setTimeout(() => void poll(), 500);
    return () => { active = false; window.clearTimeout(timer); };
  }, [verification?.operationId, shouldPollReceipt, refresh]);

  async function verify(checks: readonly DiagnosticCheck[]): Promise<void> {
    if (!context || checks.length === 0 || verification?.identity === identity && !['failed', 'succeeded', 'unknown'].includes(verification.state)) return;
    setActionError(null);
    const operationId = crypto.randomUUID();
    setVerification({ identity, operationId, state: 'submitting', error: null });
    const query = new URLSearchParams({ scope: context.scope });
    if (context.scope !== 'host') query.set('id', context.id);
    try {
      const accepted = await requestJson<OperationAccepted>(`/api/v1/diagnostics?${query}`, {
        method: 'POST', headers: { 'Idempotency-Key': operationId }, body: JSON.stringify({ checks }),
      });
      if (accepted.operationId !== operationId || !accepted.receipt) throw new Error('O recibo não corresponde à verificação solicitada.');
      setVerification({ identity, operationId, state: 'accepted', error: null });
    } catch (error: unknown) {
      if (error instanceof HttpError && error.status < 500) {
        setVerification(null);
        setActionError({ identity, message: error.message, requestId: error.requestId });
      } else {
        setVerification({ identity, operationId, state: 'unavailable', error: 'Resposta incerta. Consulte o recibo; a verificação não será reenviada.' });
      }
    }
  }

  function retryReceipt(): void {
    setVerification((current) => current?.identity === identity ? { ...current, state: 'accepted', error: null } : current);
  }

  const current = load.identity === identity ? load : { identity, view: null, loading: Boolean(context), refreshing: false, stale: false, error: null, requestId: null };
  const scopedVerification = verification?.identity === identity ? verification : null;
  const scopedActionError = actionError?.identity === identity ? actionError : null;
  const verifiedReport = scopedVerification && current.view?.reports.find((report) => report.operationId === scopedVerification.operationId);
  const previous = Boolean(scopedVerification && !verifiedReport);
  return { ...current, supportedChecks, verification: scopedVerification, previous, verifiedReport: verifiedReport ?? null, actionError: scopedActionError, refresh, verify, retryReceipt };
}
