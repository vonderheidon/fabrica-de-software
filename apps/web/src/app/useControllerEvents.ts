import { useEffect, useState } from 'react';
import { Value } from '@sinclair/typebox/value';
import { HttpControllerEventFrame, type HttpEventPage as EventPage } from '#contracts';
import { requestJson } from '../api/http.js';

export type ControllerEventNotice = HttpControllerEventFrame & { seq: string };
export type EventConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'unavailable';

export function parsePayload(event: MessageEvent<string>): ControllerEventNotice | null {
  if (!/^[1-9][0-9]{0,19}$/.test(event.lastEventId)) return null;
  try {
    const payload: unknown = JSON.parse(event.data);
    if (!Value.Check(HttpControllerEventFrame, payload)) return null;
    return { ...payload, seq: event.lastEventId };
  } catch {
    return null;
  }
}

export function useControllerEvents(): EventConnectionState {
  const [state, setState] = useState<EventConnectionState>('connecting');

  useEffect(() => {
    let alive = true;
    let source: EventSource | null = null;
    let resyncing = false;
    let lastSeq = '0';
    let reconnectTimer = 0;
    const dispatch = (name: string, detail?: unknown): void => { window.dispatchEvent(new CustomEvent(name, { detail })); };

    async function openFromCurrentCursor(): Promise<void> {
      if (!alive || resyncing) return;
      try {
        const page = await requestJson<EventPage>('/api/v1/events?limit=1');
        if (!alive) return;
        lastSeq = page.event_cursor;
        const params = new URLSearchParams({ cursor: lastSeq });
        source?.close();
        source = new EventSource(`/api/v1/events/stream?${params.toString()}`, { withCredentials: true });
        setState('connecting');
        source.onopen = () => { if (alive) setState('connected'); };
        source.onerror = () => { if (alive) setState(source?.readyState === EventSource.CLOSED ? 'unavailable' : 'reconnecting'); };
        const onResync = (): void => {
          if (resyncing || !alive) return;
          resyncing = true;
          source?.close();
          setState('reconnecting');
          dispatch('factory-controller-resync');
          window.clearTimeout(reconnectTimer);
          reconnectTimer = window.setTimeout(() => {
            resyncing = false;
            void openFromCurrentCursor();
          }, 250);
        };
        source.addEventListener('resync', onResync);
        source.addEventListener('controller-event', (rawEvent) => {
          const notice = parsePayload(rawEvent as MessageEvent<string>);
          if (!notice || BigInt(notice.seq) <= BigInt(lastSeq)) return;
          lastSeq = notice.seq;
          dispatch('factory-controller-event', notice);
        });
      } catch {
        if (!alive) return;
        setState('unavailable');
        window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(() => void openFromCurrentCursor(), 15_000);
      }
    }

    void openFromCurrentCursor();
    return () => {
      alive = false;
      window.clearTimeout(reconnectTimer);
      source?.close();
    };
  }, []);

  return state;
}
