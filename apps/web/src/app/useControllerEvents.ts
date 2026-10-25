import { useEffect, useState } from 'react';
import { type HttpEventPage as EventPage } from '#contracts';
import { requestJson } from '../api/http.js';
import { invalidateAppliedObservations, useAppliedObservations } from './applied-observations.js';
import {
  observeControllerEvents,
  type ControllerEventSource,
  type ControllerStreamMessage,
  type EventConnectionState,
} from './controller-events.js';

export type { ControllerEventNotice, EventConnectionState } from './controller-events.js';
export { parseControllerEvent as parsePayload } from './controller-events.js';

function openEventSource(url: string): ControllerEventSource {
  const nativeSource = new EventSource(url, { withCredentials: true });
  return {
    get readyState() { return nativeSource.readyState; },
    setOnOpen(handler) { nativeSource.onopen = handler ? () => handler() : null; },
    setOnError(handler) { nativeSource.onerror = handler ? () => handler() : null; },
    addEventListener(type, listener) {
      nativeSource.addEventListener(type, (event) => listener(event as MessageEvent<string> as ControllerStreamMessage));
    },
    close() { nativeSource.close(); },
  };
}

export function useControllerEvents(): EventConnectionState {
  const [state, setState] = useState<EventConnectionState>('connecting');
  const applied = useAppliedObservations();

  useEffect(() => observeControllerEvents({
    readCursor: async () => {
      const page = await requestJson<EventPage>('/api/v1/events?limit=1');
      return { event_cursor: page.event_cursor };
    },
    openSource: openEventSource,
    dispatch: (name, detail) => {
      if (name === 'factory-controller-resync') invalidateAppliedObservations();
      window.dispatchEvent(new CustomEvent(name, { detail }));
    },
    setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimer: timer => window.clearTimeout(timer),
    setState,
    closedReadyState: EventSource.CLOSED,
  }), []);

  if (state === 'unavailable' || applied === 'failed') return 'unavailable';
  if (state === 'connected' && applied === 'pending') return 'reconnecting';
  return state;
}
