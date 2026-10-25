import { expect, it } from 'vitest';
import {
  observeControllerEvents,
  type ControllerEventObserverDependencies,
  type ControllerEventSource,
  type ControllerEventSignal,
  type ControllerStreamMessage,
  type EventConnectionState,
} from './controller-events.js';

class FakeEventSource implements ControllerEventSource {
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closeCount = 0;
  private readonly listeners = new Map<'resync' | 'controller-event', Array<(event: ControllerStreamMessage) => void>>();

  setOnOpen(handler: (() => void) | null): void {
    this.onopen = handler;
  }

  setOnError(handler: (() => void) | null): void {
    this.onerror = handler;
  }

  addEventListener(type: 'resync' | 'controller-event', listener: (event: ControllerStreamMessage) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  close(): void {
    this.closeCount += 1;
    this.readyState = 2;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  fail(readyState: number): void {
    this.readyState = readyState;
    this.onerror?.();
  }

  emit(type: 'resync' | 'controller-event', event: ControllerStreamMessage = { data: '', lastEventId: '' }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function createHarness(cursors = ['4', '8']) {
  const states: EventConnectionState[] = [];
  const signals: Array<{ name: ControllerEventSignal; detail?: unknown }> = [];
  const sources: Array<{ url: string; source: FakeEventSource }> = [];
  const requests: Array<{ method: 'GET' | 'POST' | 'PUT'; url: string }> = [];
  const mutationCalls = { save: 0, start: 0, answer: 0, publication: 0 };
  const recordRequest = (method: 'GET' | 'POST' | 'PUT', url: string): void => {
    requests.push({ method, url });
    if (method === 'PUT' && /\/api\/v1\/(settings|projects\/[^/?]+\/configuration)(?:\?|$)/.test(url)) mutationCalls.save += 1;
    if (method === 'POST' && /\/api\/v1\/attempts\/[^/?]+\/start(?:\?|$)/.test(url)) mutationCalls.start += 1;
    if (method === 'POST' && /\/api\/v1\/questions\/[^/?]+\/answer(?:\?|$)/.test(url)) mutationCalls.answer += 1;
    if (method === 'POST' && /\/api\/v1\/(attempts\/[^/?]+\/(publication|complete)|publication\/[^/?]+\/complete)(?:\?|$)/.test(url)) mutationCalls.publication += 1;
  };
  const timers = new Map<number, { delayMs: number; callback: () => void }>();
  let timerId = 0;
  let cursorIndex = 0;
  const dependencies: ControllerEventObserverDependencies = {
    readCursor: async () => {
      const url = '/api/v1/events?limit=1';
      recordRequest('GET', url);
      const eventCursor = cursors[Math.min(cursorIndex, cursors.length - 1)] ?? '0';
      cursorIndex += 1;
      return { event_cursor: eventCursor };
    },
    openSource: url => {
      recordRequest('GET', url);
      const source = new FakeEventSource();
      sources.push({ url, source });
      return source;
    },
    dispatch: (name, detail) => signals.push({ name, ...(detail ? { detail } : {}) }),
    setTimer: (callback, delayMs) => {
      timerId += 1;
      timers.set(timerId, { delayMs, callback });
      return timerId;
    },
    clearTimer: id => { timers.delete(id); },
    setState: state => states.push(state),
    closedReadyState: 2,
  };
  return {
    dependencies,
    states,
    signals,
    sources,
    requests,
    mutationCalls,
    timers,
    runTimer(delayMs: number) {
      const entry = [...timers.entries()].find(([, timer]) => timer.delayMs === delayMs);
      expect(entry).toBeDefined();
      if (!entry) return;
      timers.delete(entry[0]);
      entry[1].callback();
    },
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function decodeFragmentedUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const emojiStart = bytes.indexOf(0xf0);
  expect(emojiStart).toBeGreaterThanOrEqual(0);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  return decoder.decode(bytes.subarray(0, emojiStart + 1), { stream: true })
    + decoder.decode(bytes.subarray(emojiStart + 1));
}

it('reconnects through EventSource, preserves fragmented UTF-8 and issues only reads', async () => {
  const harness = createHarness();
  const stop = observeControllerEvents(harness.dependencies);
  await settle();
  expect(harness.sources).toHaveLength(1);
  expect(harness.sources[0]?.url).toContain('cursor=4');

  const source = harness.sources[0]!.source;
  source.open();
  source.fail(0);
  expect(harness.states.at(-1)).toBe('unavailable');
  expect(harness.timers.size).toBe(0);
  expect(harness.requests).toHaveLength(2);

  source.open();
  const frame = JSON.stringify({
    entity: { type: 'attempt', id: 'tentativa-ç-🤝' },
    revision: 1,
    operation_id: '00000000-0000-4000-8000-000000000001',
    event_type: 'diagnóstico.concluído',
    facts: {},
  });
  source.emit('controller-event', { data: decodeFragmentedUtf8(frame), lastEventId: '5' });
  source.emit('controller-event', { data: frame, lastEventId: '5' });
  expect(harness.signals.filter(signal => signal.name === 'factory-controller-event')).toHaveLength(1);
  expect(harness.signals.find(signal => signal.name === 'factory-controller-event')?.detail).toMatchObject({ seq: '5', entity: { id: 'tentativa-ç-🤝' }, event_type: 'diagnóstico.concluído' });
  expect(harness.requests.every(request => request.method === 'GET')).toBe(true);
  stop();
});

it('recovers through reconnect and resync without repeating save, start, answer or publication', async () => {
  const harness = createHarness(['4', '8']);
  expect(Object.keys(harness.dependencies).sort()).toEqual([
    'clearTimer', 'closedReadyState', 'dispatch', 'openSource', 'readCursor', 'setState', 'setTimer',
  ]);
  const stop = observeControllerEvents(harness.dependencies);
  await settle();
  harness.sources[0]!.source.fail(0);
  expect(harness.states.at(-1)).toBe('unavailable');
  const callsBeforeResync = { ...harness.mutationCalls };
  harness.sources[0]!.source.emit('resync');

  expect(harness.signals.map(signal => signal.name)).toContain('factory-controller-resync');
  expect(harness.states.at(-1)).toBe('reconnecting');
  expect(harness.sources[0]!.source.closeCount).toBe(1);
  harness.runTimer(250);
  await settle();

  expect(harness.requests).toHaveLength(4);
  expect(harness.sources[1]?.url).toContain('cursor=8');
  expect(harness.requests.every(request => request.method === 'GET')).toBe(true);
  expect(harness.mutationCalls).toEqual(callsBeforeResync);
  expect(harness.mutationCalls).toEqual({ save: 0, start: 0, answer: 0, publication: 0 });
  expect(harness.signals.every(signal => signal.name === 'factory-controller-resync'
    || signal.name === 'factory-controller-event')).toBe(true);
  stop();
});

it('bounds retry after a terminal stream close and refreshes observations', async () => {
  const harness = createHarness(['4', '9']);
  const stop = observeControllerEvents(harness.dependencies);
  await settle();
  harness.sources[0]!.source.fail(2);

  expect(harness.states.at(-1)).toBe('unavailable');
  expect(harness.signals.map(signal => signal.name)).toContain('factory-controller-resync');
  expect([...harness.timers.values()].map(timer => timer.delayMs)).toEqual([15_000]);
  harness.runTimer(15_000);
  await settle();
  expect(harness.sources[1]?.url).toContain('cursor=9');
  expect(harness.requests.every(request => request.method === 'GET')).toBe(true);
  stop();
});

it('discards a cursor response that arrives after the component stops', async () => {
  let resolveCursor: ((value: { event_cursor: string }) => void) | undefined;
  const harness = createHarness();
  const dependencies = {
    ...harness.dependencies,
    readCursor: () => new Promise<{ event_cursor: string }>(resolve => { resolveCursor = resolve; }),
  };
  const stop = observeControllerEvents(dependencies);
  stop();
  resolveCursor?.({ event_cursor: '12' });
  await settle();
  expect(harness.sources).toHaveLength(0);
  expect(harness.states).toEqual([]);
});

it('does not accept an HTTP response with an invalid cursor as healthy observation', async () => {
  const harness = createHarness(['invalid']);
  const stop = observeControllerEvents(harness.dependencies);
  await settle();
  expect(harness.sources).toHaveLength(0);
  expect(harness.states.at(-1)).toBe('unavailable');
  stop();
});
