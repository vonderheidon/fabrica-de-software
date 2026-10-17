import { useEffect, useState } from 'react';
import type { AttemptDetail } from '#contracts';
import { HttpError, requestJsonWithMetadata } from '../../api/http.js';

type AttemptState = { id: string; value: AttemptDetail | null; etag: string | null; error: string | null };

export function useAttempt(attemptId: string, query: string, reload: number): { attempt: AttemptDetail | null; etag: string | null; error: string | null } {
  const [state, setState] = useState<AttemptState>({ id: '', value: null, etag: null, error: null });
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const controller = new AbortController();
    const read = async (): Promise<void> => {
      if (inFlight) return;
      inFlight = true;
      try {
        const { data, etag } = await requestJsonWithMetadata<AttemptDetail>(`/api/v1/attempts/${encodeURIComponent(attemptId)}${query}`, { signal: controller.signal });
        if (active) setState({ id: attemptId, value: data, etag, error: null });
      } catch (reason: unknown) {
        if (active && !(reason instanceof DOMException && reason.name === 'AbortError')) {
          setState((current) => ({ id: attemptId, value: current.id === attemptId ? current.value : null, etag: current.id === attemptId ? current.etag : null, error: reason instanceof HttpError ? reason.message : 'Não foi possível consultar esta tentativa.' }));
        }
      } finally { inFlight = false; }
    };
    void read();
    const timer = window.setInterval(() => { void read(); }, 15_000);
    return () => { active = false; window.clearInterval(timer); controller.abort(); };
  }, [attemptId, query, reload]);
  return { attempt: state.id === attemptId ? state.value : null, etag: state.id === attemptId ? state.etag : null, error: state.id === attemptId ? state.error : null };
}
