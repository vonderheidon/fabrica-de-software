import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HttpDiagnosticCheck as DiagnosticCheck, HttpDiagnosticContext as DiagnosticContext, HttpDiagnosticsView as DiagnosticsView, OperationAccepted, OperationView } from '#contracts';
import { HttpError, requestJson } from '../../api/http.js';

type DiagnosticLoad = { identity: string; view: DiagnosticsView | null; loading: boolean; refreshing: boolean; stale: boolean; error: string | null; requestId: string | null; errorCode: string | null; facts: Readonly<Record<string, string | number | boolean | null>> | null; affectedRequirements: readonly string[] };
type VerificationState = { identity: string; operationId: string; state: OperationView['state'] | 'submitting' | 'unavailable'; error: string | null; errorCode?: string | undefined; requestId?: string | null | undefined; facts?: Readonly<Record<string, string | number | boolean | null>> | null | undefined; affectedRequirements?: readonly string[] | undefined } | null;

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
  const [load, setLoad] = useState<DiagnosticLoad>({ identity: 'none', view: null, loading: false, refreshing: false, stale: false, error: null, requestId: null, errorCode: null, facts: null, affectedRequirements: [] });
  const [verification, setVerification] = useState<VerificationState>(null);
  const [actionError, setActionError] = useState<{ identity: string; message: string; requestId: string | null; code: string | null; facts: Readonly<Record<string, string | number | boolean | null>> | null; affectedRequirements: readonly string[] } | null>(null);
  const shouldPollReceipt = Boolean(verification?.identity === identity && ['accepted', 'running'].includes(verification.state));
  const refresh = useCallback(() => setReload((value) => value + 1), []);
  const supportedChecks = useMemo(() => load.identity === identity ? load.view?.supported_checks ?? [] : [], [identity, load.identity, load.view]);

  useEffect(() => {
    if (!context) { setLoad({ identity, view: null, loading: false, refreshing: false, stale: false, error: null, requestId: null, errorCode: null, facts: null, affectedRequirements: [] }); return; }
    let active = true;
    const controller = new AbortController();
    const prior = load.identity === identity ? load.view : null;
    setLoad({ identity, view: prior, loading: prior === null, refreshing: prior !== null, stale: prior !== null, error: load.identity === identity ? load.error : null, requestId: load.identity === identity ? load.requestId : null, errorCode: load.identity === identity ? load.errorCode : null, facts: load.identity === identity ? load.facts : null, affectedRequirements: load.identity === identity ? load.affectedRequirements : [] });
    void requestJson<DiagnosticsView>(diagnosticsPath(context), { signal: controller.signal }).then((view) => {
      if (active) setLoad({ identity, view, loading: false, refreshing: false, stale: false, error: null, requestId: null, errorCode: null, facts: null, affectedRequirements: [] });
    }).catch((error: unknown) => {
      if (!active || (error instanceof DOMException && error.name === 'AbortError')) return;
      setLoad((current) => ({ ...current, identity, loading: false, refreshing: false, stale: current.view !== null,
        error: error instanceof HttpError ? error.message : 'Não foi possível consultar o diagnóstico.',
        requestId: error instanceof HttpError ? error.requestId : null,
        errorCode: error instanceof HttpError ? error.code : null,
        facts: error instanceof HttpError ? error.facts : null,
        affectedRequirements: error instanceof HttpError ? error.affectedRequirements : [] }));
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
        setVerification((current): VerificationState => current?.operationId === operationId ? {
          ...current,
          state: operation.state,
          error: operation.error?.message ?? null,
          errorCode: operation.error?.code,
          requestId: operation.error?.request_id ?? null,
          facts: operation.error?.facts ?? null,
          affectedRequirements: operation.error?.affected_requirements ?? [],
        } : current);
        if (operation.state === 'succeeded' || operation.state === 'failed' || operation.state === 'unknown') refresh();
        else timer = window.setTimeout(() => void poll(), 1500);
      } catch (error: unknown) {
        if (!active) return;
        setVerification((current) => current?.operationId === operationId ? {
          ...current,
          state: 'unavailable',
          error: 'A consulta do recibo falhou. A verificação não será reenviada automaticamente.',
          errorCode: error instanceof HttpError ? error.code : 'DIAGNOSTIC_CHECK_UNAVAILABLE',
          requestId: error instanceof HttpError ? error.requestId : null,
          facts: error instanceof HttpError ? error.facts : null,
          affectedRequirements: error instanceof HttpError ? error.affectedRequirements : [],
        } : current);
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
      if (accepted.operation_id !== operationId || !accepted.receipt) throw new Error('O recibo não corresponde à verificação solicitada.');
      setVerification({ identity, operationId, state: 'accepted', error: null });
    } catch (error: unknown) {
      if (error instanceof HttpError && error.status < 500) {
        setVerification(null);
        setActionError({ identity, message: error.message, requestId: error.requestId, code: error.code, facts: error.facts, affectedRequirements: error.affectedRequirements });
      } else {
        setVerification({ identity, operationId, state: 'unavailable', error: 'Resposta incerta. Consulte o recibo; a verificação não será reenviada.' });
      }
    }
  }

  function retryReceipt(): void {
    setVerification((current) => current?.identity === identity ? { ...current, state: 'accepted', error: null } : current);
  }

  const current = load.identity === identity ? load : { identity, view: null, loading: Boolean(context), refreshing: false, stale: false, error: null, requestId: null, errorCode: null, facts: null, affectedRequirements: [] };
  const scopedVerification = verification?.identity === identity ? verification : null;
  const scopedActionError = actionError?.identity === identity ? actionError : null;
  const verifiedReport = scopedVerification && current.view?.reports.find((report) => report.operation_id === scopedVerification.operationId);
  const previous = Boolean(scopedVerification && !verifiedReport);
  return { ...current, supportedChecks, verification: scopedVerification, previous, verifiedReport: verifiedReport ?? null, actionError: scopedActionError, refresh, verify, retryReceipt };
}
