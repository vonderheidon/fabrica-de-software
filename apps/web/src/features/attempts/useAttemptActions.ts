import { captureRetryBody, removeResourceBody } from './execution-requests.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Static } from '@sinclair/typebox';
import { HttpAttemptResources as AttemptResourcesSchema, HttpFolderSurface as FolderSurfaceSchema, HttpPassageInteraction as PassageInteractionSchema, HttpPassageSummary } from '#contracts';
import type { HttpAttemptDetail as AttemptDetail, HttpAttemptResource as AttemptResource, OperationAccepted, OperationView, HttpProducerResult as ProducerResult, HttpRemovalPlan as RemovalPlan } from '#contracts';
import { HttpError, requestJson, requestJsonWithMetadata } from '../../api/http.js';

type AttemptResources = Static<typeof AttemptResourcesSchema>;
type FolderSurface = Static<typeof FolderSurfaceSchema>;
type PassageInteraction = Static<typeof PassageInteractionSchema>;
type OperationKind = 'cancel' | 'capture' | 'remove' | 'open-terminal' | 'open-folder';
type ActionOperation = { kind: OperationKind; id: string; accepted: OperationAccepted | null; view: OperationView | null; uncertain: boolean };
type Snapshot = { passages: Static<typeof HttpPassageSummary>[]; resources: AttemptResources | null; producerResult: ProducerResult; plans: Record<string, { value: RemovalPlan; etag: string | null }>; folders: Record<string, FolderSurface>; interactions: Record<string, PassageInteraction>; surfaceErrors: Record<string, string>; error: string | null };
type ActionState = Snapshot & { identity: string; operation: ActionOperation | null; busy: boolean; actionErrors: Record<string, string>; copied: string | null };

const emptySnapshot = (): Snapshot => ({ passages: [], resources: null, producerResult: null, plans: {}, folders: {}, interactions: {}, surfaceErrors: {}, error: null });

function messageFor(error: unknown): string {
  return error instanceof HttpError ? error.message : 'Não foi possível concluir a ação. Consulte a operação antes de tentar novamente.';
}

export function useAttemptActions(attemptId: string, attempt: AttemptDetail | null, attemptEtag: string | null, deliveryId: string | null, captureEligible: boolean, selectedRound: string | null = null) {
  const snapshotIdentity = `${attemptId}:${selectedRound ?? ''}:${deliveryId ?? ''}`;
  const selection = useMemo(() => ({}), [snapshotIdentity]);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [state, setState] = useState<ActionState>({ ...emptySnapshot(), identity: snapshotIdentity, operation: null, busy: false, actionErrors: {}, copied: null });
  const commandIds = useRef(new Map<string, string>());
  const active = useRef(true);
  const refreshSequence = useRef(0);
  const [loadedIdentity, setLoadedIdentity] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    const sequence = ++refreshSequence.current;
    const isCurrent = (): boolean => active.current && selectionRef.current === selection && sequence === refreshSequence.current;
    const base = `/api/v1/attempts/${encodeURIComponent(attemptId)}` as const;
    try {
      const [resources, producerResult, passageDetail] = await Promise.all([
        requestJson<AttemptResources>(`${base}/resources`),
        deliveryId ? requestJson<ProducerResult>(`/api/v1/deliveries/${encodeURIComponent(deliveryId)}/producer-result`).catch(() => null) : Promise.resolve(null),
        requestJson<AttemptDetail>(`${base}?section=passages&limit=100`),
      ]);
      if (!isCurrent()) return;
      setLoadedIdentity(snapshotIdentity);
      const passages = (passageDetail.details?.items ?? []).filter((item): item is Static<typeof HttpPassageSummary> => 'tracking' in item && 'role' in item && 'id' in item);
      setState(current => ({ ...current, passages, resources, producerResult, error: null }));
      const plans: Snapshot['plans'] = {};
      const folders: Snapshot['folders'] = {};
      const interactions: Snapshot['interactions'] = {};
      const surfaceErrors: Snapshot['surfaceErrors'] = {};
      await Promise.all(resources.entries.map(async (resource: AttemptResource) => {
        try {
          if (resource.kind === 'implementation' && !resource.removed) {
            const [plan, folder] = await Promise.all([
              requestJsonWithMetadata<RemovalPlan>(`${base}/resources/${encodeURIComponent(resource.id)}/removal-plan`),
              requestJson<FolderSurface>(`${base}/resources/${encodeURIComponent(resource.id)}/folder`),
            ]);
            plans[resource.id] = { value: plan.data, etag: plan.etag };
            folders[resource.id] = folder;
          } else if (resource.kind === 'terminal') {
            interactions[resource.passage_id] = await requestJson<PassageInteraction>(`${base}/passages/${encodeURIComponent(resource.passage_id)}/interaction`);
          }
        } catch (reason: unknown) {
          surfaceErrors[resource.id] = messageFor(reason);
        }
      }));
      if (isCurrent()) setState(current => ({ ...current, resources, producerResult, plans, folders, interactions, surfaceErrors, error: null }));
    } catch (reason: unknown) {
      if (isCurrent()) setState(current => ({ ...current, error: messageFor(reason) }));
    }
  }, [attemptId, deliveryId, selection, snapshotIdentity]);

  useEffect(() => {
    active.current = true;
    setState(current => current.identity === snapshotIdentity ? current : { ...emptySnapshot(), identity: snapshotIdentity, operation: null, busy: false, actionErrors: {}, copied: null });
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 10_000);
    return () => { active.current = false; refreshSequence.current += 1; window.clearInterval(timer); };
  }, [refresh]);

  const operationId = state.operation?.id ?? null;
  useEffect(() => {
    if (!operationId) return;
    let mounted = true;
    let timer = 0;
    let polls = 0;
    const poll = async (): Promise<void> => {
      try {
        const view = await requestJson<OperationView>(`/api/v1/operations/${encodeURIComponent(operationId)}`);
        if (!mounted || selectionRef.current !== selection) return;
        setState(current => current.operation?.id === operationId ? { ...current, operation: { ...current.operation, view, uncertain: view.state === 'unknown' } } : current);
        await refresh();
        if (view.state === 'accepted' || view.state === 'running' || view.state === 'unknown') schedule();
      } catch {
        if (mounted && selectionRef.current === selection) setState(current => current.operation?.id === operationId ? { ...current, operation: { ...current.operation, uncertain: true } } : current);
        schedule();
      }
    };
    const schedule = (): void => { if (++polls < 31 && mounted) timer = window.setTimeout(() => { void poll(); }, 2_000); };
    void poll();
    return () => { mounted = false; window.clearTimeout(timer); };
  }, [operationId, refresh]);

  const send = useCallback(async (key: string, kind: OperationKind, path: `/api/v1/${string}`, body: unknown, headers: Record<string, string> = {}): Promise<void> => {
    const id = commandIds.current.get(key) ?? crypto.randomUUID();
    commandIds.current.set(key, id);
    setState(current => ({ ...current, busy: true, operation: null }));
    try {
      const { data } = await requestJsonWithMetadata<OperationAccepted>(path, { method: 'POST', headers: { ...headers, 'Idempotency-Key': id }, body: JSON.stringify(body) });
      if (!active.current || selectionRef.current !== selection) return;
      if (data.operation_id !== id) throw new Error('O recibo não corresponde à operação solicitada.');
      setState(current => {
        const actionErrors = { ...current.actionErrors };
        delete actionErrors[key];
        return { ...current, busy: false, actionErrors, operation: { kind, id, accepted: data, view: null, uncertain: false } };
      });
      void refresh();
    } catch (reason: unknown) {
      if (!active.current || selectionRef.current !== selection) return;
      const error = reason instanceof HttpError && reason.status < 500 ? messageFor(reason) : null;
      if (error) commandIds.current.delete(key);
      setState(current => ({ ...current, busy: false, actionErrors: { ...current.actionErrors, [key]: messageFor(reason) }, operation: error ? current.operation : { kind, id, accepted: null, view: null, uncertain: true } }));
    }
  }, [refresh]);

  const cancel = useCallback(() => {
    if (!attempt?.capabilities.cancel.available) return;
    void send(`cancel:${attemptId}`, 'cancel', `/api/v1/attempts/${encodeURIComponent(attemptId)}/cancel`, {});
  }, [attempt, attemptId, send]);

  const retryCaptureFor = useCallback((producerPassageId: string) => {
    if (!attemptEtag || !deliveryId || !captureEligible) return;
    void send(`capture:${deliveryId}`, 'capture', `/api/v1/attempts/${encodeURIComponent(attemptId)}/deliveries/${encodeURIComponent(deliveryId)}/capture/retry`, captureRetryBody(producerPassageId), { 'If-Match': attemptEtag });
  }, [attemptEtag, attemptId, captureEligible, deliveryId, send]);

  const requestRemoval = useCallback(async (resourceId: string): Promise<void> => {
    const plan = state.plans[resourceId];
    if (!plan?.value.capability.available || !plan.etag) return;
    await send(`remove:${resourceId}`, 'remove', `/api/v1/attempts/${encodeURIComponent(attemptId)}/resources/${encodeURIComponent(resourceId)}/remove`, removeResourceBody(plan.value.plan_hash), { 'If-Match': plan.etag });
  }, [attemptId, send, state.plans]);

  const openFolder = useCallback((resourceId: string) => {
    if (!state.folders[resourceId]?.open_capability.available) return;
    void send(`folder:${resourceId}`, 'open-folder', `/api/v1/attempts/${encodeURIComponent(attemptId)}/resources/${encodeURIComponent(resourceId)}/folder/open`, {});
  }, [attemptId, send, state.folders]);

  const openTerminal = useCallback((passageId: string) => {
    if (!state.interactions[passageId]?.open_capability.available) return;
    void send(`terminal:${passageId}`, 'open-terminal', `/api/v1/attempts/${encodeURIComponent(attemptId)}/passages/${encodeURIComponent(passageId)}/interaction/open`, {});
  }, [attemptId, send, state.interactions]);

  const copyReference = useCallback(async (key: string, reference: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(reference);
      if (!active.current || selectionRef.current !== selection) return;
      setState(current => {
        const actionErrors = { ...current.actionErrors };
        delete actionErrors[`copy:${key}`];
        return { ...current, copied: key, actionErrors };
      });
    } catch {
      if (!active.current || selectionRef.current !== selection) return;
      setState(current => ({ ...current, copied: null, actionErrors: { ...current.actionErrors, [`copy:${key}`]: 'A cópia foi recusada pelo navegador. Selecione a referência exibida e copie manualmente.' } }));
    }
  }, [selection]);

  const cancelStatus = state.operation?.kind === 'cancel'
    ? state.operation.view?.state === 'failed' ? 'failed'
      : state.resources?.cleanup === 'uncertain' ? 'cleanup-uncertain'
      : state.resources?.entries.filter(resource => resource.kind === 'terminal').every(resource => resource.stop_state === 'confirmed') && state.resources.entries.some(resource => resource.kind === 'terminal') ? 'stopped'
        : state.operation.accepted ? 'accepted' : 'uncertain'
    : null;

  return { ...state, ...(state.identity === snapshotIdentity ? {} : { operation: null, busy: false, actionErrors: {}, copied: null }), ...(loadedIdentity === snapshotIdentity ? {} : emptySnapshot()), refresh, cancel, retryCaptureFor, requestRemoval, openFolder, openTerminal, copyReference, cancelStatus: state.identity === snapshotIdentity ? cancelStatus : null };
}
