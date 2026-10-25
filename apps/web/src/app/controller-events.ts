import { Value } from '@sinclair/typebox/value';
import { HttpControllerEventFrame, type HttpEventPage as EventPage } from '#contracts';

export type EventConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'unavailable';
export type ControllerEventNotice = HttpControllerEventFrame & { seq: string };
export type ControllerEventSignal = 'factory-controller-event' | 'factory-controller-resync';

export interface ControllerStreamMessage {
  data: string;
  lastEventId: string;
}

export interface ControllerEventSource {
  readonly readyState: number;
  setOnOpen(handler: (() => void) | null): void;
  setOnError(handler: (() => void) | null): void;
  addEventListener(type: 'resync' | 'controller-event', listener: (event: ControllerStreamMessage) => void): void;
  close(): void;
}

export interface ControllerEventObserverDependencies {
  readCursor(): Promise<Pick<EventPage, 'event_cursor'>>;
  openSource(url: string): ControllerEventSource;
  dispatch(name: ControllerEventSignal, detail?: ControllerEventNotice): void;
  setTimer(callback: () => void, delayMs: number): number;
  clearTimer(timer: number): void;
  setState(state: EventConnectionState): void;
  closedReadyState: number;
}

export function parseControllerEvent(event: ControllerStreamMessage): ControllerEventNotice | null {
  if (!/^[1-9][0-9]{0,19}$/.test(event.lastEventId)) return null;
  try {
    const payload: unknown = JSON.parse(event.data);
    if (!Value.Check(HttpControllerEventFrame, payload)) return null;
    return { ...payload, seq: event.lastEventId };
  } catch {
    return null;
  }
}

export function observeControllerEvents(dependencies: ControllerEventObserverDependencies): () => void {
  let active = true;
  let opening = false;
  let resyncing = false;
  let lastSeq = '0';
  let requestRevision = 0;
  let reconnectTimer: number | null = null;
  let source: ControllerEventSource | null = null;

  function cancelReconnect(): void {
    if (reconnectTimer === null) return;
    dependencies.clearTimer(reconnectTimer);
    reconnectTimer = null;
  }

  function scheduleReconnect(delayMs: number, callback: () => void): void {
    cancelReconnect();
    reconnectTimer = dependencies.setTimer(() => {
      reconnectTimer = null;
      callback();
    }, delayMs);
  }

  function onResync(currentSource: ControllerEventSource): void {
    if (!active || resyncing || source !== currentSource) return;
    resyncing = true;
    source = null;
    currentSource.close();
    dependencies.setState('reconnecting');
    dependencies.dispatch('factory-controller-resync');
    scheduleReconnect(250, () => {
      resyncing = false;
      void openFromCurrentCursor();
    });
  }

  async function openFromCurrentCursor(): Promise<void> {
    if (!active || resyncing || opening) return;
    opening = true;
    const revision = ++requestRevision;
    try {
      const page = await dependencies.readCursor();
      if (!active || revision !== requestRevision) return;
      if (!/^(0|[1-9][0-9]{0,19})$/.test(page.event_cursor)) throw new Error('Invalid event cursor');
      lastSeq = page.event_cursor;
      const previousSource = source;
      source = null;
      previousSource?.close();
      const params = new URLSearchParams({ cursor: lastSeq });
      const currentSource = dependencies.openSource(`/api/v1/events/stream?${params.toString()}`);
      source = currentSource;
      dependencies.setState('connecting');
      currentSource.setOnOpen(() => {
        if (active && source === currentSource) {
          dependencies.dispatch('factory-controller-resync');
          dependencies.setState('connected');
        }
      });
      currentSource.setOnError(() => {
        if (!active || source !== currentSource) return;
        if (currentSource.readyState !== dependencies.closedReadyState) {
          dependencies.setState('unavailable');
          return;
        }
        source = null;
        currentSource.close();
        dependencies.setState('unavailable');
        dependencies.dispatch('factory-controller-resync');
        scheduleReconnect(15_000, () => void openFromCurrentCursor());
      });
      currentSource.addEventListener('resync', () => onResync(currentSource));
      currentSource.addEventListener('controller-event', (event) => {
        const notice = parseControllerEvent(event);
        if (!notice || BigInt(notice.seq) <= BigInt(lastSeq) || source !== currentSource || !active) return;
        lastSeq = notice.seq;
        dependencies.dispatch('factory-controller-event', notice);
      });
    } catch {
      if (!active || revision !== requestRevision) return;
      dependencies.setState('unavailable');
      scheduleReconnect(15_000, () => void openFromCurrentCursor());
    } finally {
      if (revision === requestRevision) opening = false;
    }
  }

  void openFromCurrentCursor();
  return () => {
    active = false;
    requestRevision += 1;
    cancelReconnect();
    const currentSource = source;
    source = null;
    currentSource?.close();
  };
}
