import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { HttpDiagnosticCheck as DiagnosticCheck, HttpDiagnosticContext as DiagnosticContext, HttpDiagnosticsView as DiagnosticsView, OperationAccepted, OperationView, SettingsView, ProjectDetail, HttpAttemptDetail, HttpCreationView } from '#contracts';
import { HttpError, requestJson } from '../../api/http.js';

type Verification = { identity: string; operationId: string; checks?: readonly DiagnosticCheck[]; state: OperationView['state'] | 'submitting' | 'unavailable'; error: string | null; queryError: string | null; errorCode?: string; querying?: boolean; operationError?: { code: string; message: string } };
// Correlation lives only for this page session; navigation never submits an action.
const operations = new Map<string, Verification>();
const listeners = new Set<() => void>();
function remember(key: string, value: Verification): void { operations.set(key, value); listeners.forEach((listener) => listener()); }
function subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
type Snapshot = { objectKey: string; identity: string };
type Load = { contextKey: string; snapshot: Snapshot | null; view: DiagnosticsView | null; loading: boolean; refreshing: boolean; stale: boolean; error: string | null };
const initial: Load = { contextKey: '', snapshot: null, view: null, loading: false, refreshing: false, stale: false, error: null };
function contextIdentity(context: DiagnosticContext | null): string { return JSON.stringify(context ? [context.scope, context.scope === 'host' ? '' : context.id] : null); }
function diagnosticsPath(context: DiagnosticContext): `/api/v1/${string}` {
  const query = new URLSearchParams({ scope: context.scope });
  if (context.scope !== 'host') query.set('id', context.id);
  return `/api/v1/diagnostics?${query}`;
}
async function readSnapshot(context: DiagnosticContext, signal: AbortSignal): Promise<Snapshot> {
  const settings = await requestJson<SettingsView>('/api/v1/settings', { signal });
  let revision: string | number = settings.settings.revision;
  if (context.scope === 'project') {
    const detail = await requestJson<ProjectDetail>(`/api/v1/projects/${encodeURIComponent(context.id)}`, { signal });
    revision = JSON.stringify([detail.project.revision, detail.project.current_revision_id]);
  } else if (context.scope === 'attempt') {
    const detail = await requestJson<HttpAttemptDetail>(`/api/v1/attempts/${encodeURIComponent(context.id)}`, { signal });
    revision = detail.revision;
  } else if (context.scope === 'creation') {
    const detail = await requestJson<HttpCreationView>(`/api/v1/scaffold/creations/${encodeURIComponent(context.id)}`, { signal });
    revision = detail.creation.revision;
  }
  const objectKey = JSON.stringify([settings.settings.installation_id, settings.settings.account_id, contextIdentity(context)]);
  return { objectKey, identity: JSON.stringify([objectKey, revision, settings.settings.revision, settings.profiles.map((profile) => [profile.id, profile.revision])]) };
}
export function useDiagnostics(context: DiagnosticContext | null) {
  const contextKey = contextIdentity(context);
  const [reload, setReload] = useState(0);
  const [load, setLoad] = useState<Load>(initial);
  const [actionError, setActionError] = useState<{ identity: string; message: string } | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(() => {
    generation.current += 1;
    setLoad((current) => ({ ...current, stale: current.view !== null, refreshing: true }));
    setReload((value) => value + 1);
  }, []);
  const current = load.contextKey === contextKey ? load : { ...initial, loading: Boolean(context) };
  const key = current.snapshot?.objectKey ?? '';
  const verification = useSyncExternalStore(subscribe, () => operations.get(key) ?? null, () => null);
  const identity = current.snapshot?.identity;
  const [receiptRequest, setReceiptRequest] = useState(0);
  const shouldPollReceipt = Boolean(verification && (verification.querying || (!verification.queryError && ['accepted', 'running'].includes(verification.state))));
  useEffect(() => {
    const version = ++generation.current;
    const controller = new AbortController();
    let active = true;
    const valid = () => active && version === generation.current;
    if (!context) { setLoad(initial); return () => { active = false; controller.abort(); }; }
    setLoad((prior) => prior.contextKey === contextKey
      ? { ...prior, loading: !prior.view, refreshing: Boolean(prior.view), stale: Boolean(prior.view) }
      : { ...initial, contextKey, loading: true });
    void (async () => {
      const before = await readSnapshot(context, controller.signal);
      if (!valid()) return;
      // A previous revision of this object can remain visible, explicitly stale.
      // Another account or object must never inherit that view.
      setLoad((prior) => ({ ...prior, snapshot: before, view: prior.snapshot?.objectKey === before.objectKey ? prior.view : null }));
      const view = await requestJson<DiagnosticsView>(diagnosticsPath(context), { signal: controller.signal });
      const after = await readSnapshot(context, controller.signal);
      if (!valid()) return;
      if (before.identity !== after.identity) { refresh(); return; }
      const report = view.reports[0];
      if (!operations.has(before.objectKey) && report) remember(before.objectKey, {
        identity: 'historical', operationId: report.operation_id, checks: report.checks, state: report.state, error: null, queryError: null,
      });
      setLoad({ contextKey, snapshot: before, view, loading: false, refreshing: false, stale: false, error: null });
    })().catch((error: unknown) => {
      if (!valid() || controller.signal.aborted) return;
      setLoad((prior) => ({ ...prior, loading: false, refreshing: false, stale: Boolean(prior.view), error: error instanceof HttpError ? error.message : 'Não foi possível consultar o diagnóstico. Atualize a leitura.' }));
    });
    return () => { active = false; controller.abort(); };
  }, [contextKey, reload, refresh]);
  useEffect(() => {
    if (!context) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      generation.current += 1;
      setLoad((current) => ({ ...current, stale: current.view !== null, refreshing: true }));
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; refresh(); }, 100);
    };
    const onEvent = (event: Event) => {
      const notice = (event as CustomEvent<{ event_type?: string; project_id?: string | null; attempt_id?: string | null }>).detail;
      if (context.scope === 'host' && notice?.event_type &&
        !notice.event_type.startsWith('settings.') && !notice.event_type.startsWith('profile.') &&
        !(notice.event_type.startsWith('diagnostic.') && !notice.project_id && !notice.attempt_id)) return;
      schedule();
    };
    window.addEventListener('factory-controller-event', onEvent);
    window.addEventListener('factory-controller-resync', schedule);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener('factory-controller-event', onEvent);
      window.removeEventListener('factory-controller-resync', schedule);
    };
  }, [contextKey, refresh]);
  useEffect(() => {
    if (!verification || !shouldPollReceipt) return;
    const original = verification;
    let active = true;
    let timer = 0;
    const poll = async (): Promise<void> => {
      try {
        const operation = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(original.operationId)}`);
        const stored = operations.get(key);
        if (!active || stored?.operationId !== original.operationId) return;
        remember(key, { ...stored, state: operation.state, queryError: null, querying: false,
          ...(operation.error ? { operationError: { code: operation.error.code, message: operation.error.message } } : {}) });
        if (['succeeded', 'failed', 'unknown'].includes(operation.state)) refresh();
        else timer = window.setTimeout(() => void poll(), 1500);
      } catch {
        const stored = operations.get(key);
        if (active && stored?.operationId === original.operationId) remember(key, { ...stored, querying: false, queryError: 'Não foi possível consultar o resultado. Tente consultar novamente; a verificação não será reenviada.' });
      }
    };
    timer = window.setTimeout(() => void poll(), 500);
    return () => { active = false; window.clearTimeout(timer); };
  }, [key, verification?.operationId, shouldPollReceipt, receiptRequest, refresh]);
  async function verify(checks: readonly DiagnosticCheck[]): Promise<void> {
    if (!context || !identity || current.loading || current.refreshing || current.stale || !checks.length) return;
    const existing = operations.get(key);
    if (existing && !['failed', 'succeeded', 'unknown'].includes(existing.state)) return;
    setActionError(null);
    const operationId = crypto.randomUUID();
    const original: Verification = { identity, operationId, checks: [...checks], state: 'submitting', error: null, queryError: null };
    remember(key, original);
    try {
      const accepted = await requestJson<OperationAccepted>(diagnosticsPath(context), {
        method: 'POST', headers: { 'Idempotency-Key': operationId }, body: JSON.stringify({ checks }),
      });
      if (accepted.operation_id !== operationId || !accepted.receipt) throw new Error('Unconfirmed acceptance');
      remember(key, { ...original, state: 'accepted' });
    } catch (error: unknown) {
      if (error instanceof HttpError && error.status < 500 && error.status !== 401) {
        remember(key, { ...original, state: 'failed', error: error.message, errorCode: error.code });
        setActionError({ identity, message: error.message });
      } else remember(key, { ...original, state: 'unavailable', error: 'Não foi possível confirmar o envio. Consulte o resultado antes de iniciar outra verificação.' });
    }
  }
  function retryReceipt(): void {
    if (!verification) return;
    remember(key, { ...verification, querying: true });
    setReceiptRequest((value) => value + 1);
  }
  const previous = Boolean(verification && (verification.identity !== identity || current.stale || current.loading || current.refreshing));
  const verifiedReport = current.view?.reports.find((report) => report.operation_id === verification?.operationId) ?? null;
  return { ...current, supportedChecks: current.view?.supported_checks ?? [], verification, previous, verifiedReport,
    recoveryUnavailable: Boolean(current.view && !verification),
    actionError: actionError?.identity === identity ? actionError : null, refresh, verify, retryReceipt };
}
