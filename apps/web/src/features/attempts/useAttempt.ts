import { useEffect, useState } from 'react';
import type { HttpAttemptDetail as AttemptDetail } from '#contracts';
import { HttpError, requestJsonWithMetadata } from '../../api/http.js';
import { useAppliedObservation } from '../../app/applied-observations.js';

type AttemptState = { id: string; value: AttemptDetail | null; etag: string | null; error: string | null; errorDetails: { code: string; requestId: string | null; facts: Readonly<Record<string, string | number | boolean | null>> | null; affectedRequirements: readonly string[] } | null };

export function useAttempt(attemptId: string, query: string, reload: number): { refreshing: boolean; selectionCurrent: boolean; attempt: AttemptDetail | null; etag: string | null; error: string | null; errorDetails: AttemptState['errorDetails'] } {
  const identity = `${attemptId}:${query}`;
  const [state, setState] = useState<AttemptState>({ id: '', value: null, etag: null, error: null, errorDetails: null });
  const [pending, setPending] = useState(true);
  useAppliedObservation(true, pending || state.id !== identity, Boolean(state.error), state);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const controller = new AbortController();
    const read = async (): Promise<void> => {
      if (inFlight) return;
      inFlight = true;
      setPending(true);
      try {
        const { data, etag } = await requestJsonWithMetadata<AttemptDetail>(`/api/v1/attempts/${encodeURIComponent(attemptId)}${query}`, { signal: controller.signal });
        if (active) setState({ id: identity, value: data, etag, error: null, errorDetails: null });
      } catch (reason: unknown) {
        if (active && !(reason instanceof DOMException && reason.name === 'AbortError')) {
          setState((current) => ({
            id: identity,
            value: current.id === identity ? current.value : null,
            etag: current.id === identity ? current.etag : null,
            error: reason instanceof HttpError ? reason.message : 'Não foi possível consultar esta tentativa.',
            errorDetails: reason instanceof HttpError ? { code: reason.code, requestId: reason.requestId, facts: reason.facts, affectedRequirements: reason.affectedRequirements } : null,
          }));
        }
      } finally { inFlight = false; if (active) setPending(false); }
    };
    void read();
    const timer = window.setInterval(() => { void read(); }, 15_000);
    return () => { active = false; window.clearInterval(timer); controller.abort(); };
  }, [attemptId, query, reload]);
  return { refreshing: pending, selectionCurrent: state.id === identity, attempt: state.id === identity ? state.value : null, etag: state.id === identity ? state.etag : null, error: state.id === identity ? state.error : null, errorDetails: state.id === identity ? state.errorDetails : null };
}
