// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HttpQueueObservation } from '#contracts';
import { requestJsonWithMetadata } from '../../api/http.js';
import { useQueue } from './useQueue.js';

vi.mock('../../api/http.js', () => ({
  requestJsonWithMetadata: vi.fn(),
  HttpError: class extends Error {},
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function observation(overrides: Partial<HttpQueueObservation['polling']> = {}): HttpQueueObservation {
  return {
    observed_at_ms: Date.now(), page: { items: [{ item_id: 'preserved-row' }] },
    polling: { interval_ms: 1_000, backoff_max_ms: 8_000, retry_at_ms: null, next_poll_at_ms: Date.now() + 10_000, ...overrides },
  } as unknown as HttpQueueObservation;
}

let root: ReturnType<typeof createRoot> | undefined;
let exposed: ReturnType<typeof useQueue> | undefined;
let host: HTMLDivElement | undefined;

function Harness() {
  exposed = useQueue(null, true);
  return null;
}

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root!.render(createElement(Harness)); });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  exposed = undefined;
  host?.remove(); host = undefined;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('retains the last observation and ETag while refreshing and after refresh failure', async () => {
  const initial = deferred<{ data: HttpQueueObservation; etag: string | null }>();
  const retry = deferred<{ data: HttpQueueObservation; etag: string | null }>();
  const request = vi.mocked(requestJsonWithMetadata);
  request.mockReturnValueOnce(initial.promise as never).mockReturnValueOnce(retry.promise as never);

  await mount();
  await act(async () => { initial.resolve({ data: observation(), etag: 'revision-1' }); await initial.promise; });
  expect(exposed?.load).toMatchObject({ status: 'ready', etag: 'revision-1' });

  await act(async () => { exposed!.refresh(); await vi.advanceTimersByTimeAsync(0); });
  expect(exposed?.load).toMatchObject({ status: 'loading', etag: 'revision-1' });
  expect(request).toHaveBeenCalledTimes(2);

  await act(async () => { retry.reject(new Error('offline')); await retry.promise.catch(() => {}); });
  expect(exposed?.load).toMatchObject({ status: 'error', etag: 'revision-1' });
  expect(exposed?.load.observation?.page.items).toEqual([{ item_id: 'preserved-row' }]);
  expect(exposed?.canRefresh).toBe(false);
});

it('coalesces event bursts and bounds in-flight follow-up reads to one', async () => {
  const initial = deferred<{ data: HttpQueueObservation; etag: string | null }>();
  const inFlight = deferred<{ data: HttpQueueObservation; etag: string | null }>();
  const followUp = deferred<{ data: HttpQueueObservation; etag: string | null }>();
  const request = vi.mocked(requestJsonWithMetadata);
  request.mockReturnValueOnce(initial.promise as never).mockReturnValueOnce(inFlight.promise as never).mockReturnValueOnce(followUp.promise as never);

  await mount();
  await act(async () => { initial.resolve({ data: observation(), etag: 'revision-1' }); await initial.promise; });
  await act(async () => { for (let index = 0; index < 20; index++) window.dispatchEvent(new Event('factory-controller-event')); });
  await act(async () => { await vi.advanceTimersByTimeAsync(249); });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(request).toHaveBeenCalledTimes(2);

  await act(async () => { for (let index = 0; index < 20; index++) window.dispatchEvent(new Event('factory-controller-event')); });
  expect(request).toHaveBeenCalledTimes(2);
  await act(async () => { inFlight.resolve({ data: observation(), etag: 'revision-2' }); await inFlight.promise; });
  await act(async () => { await vi.advanceTimersByTimeAsync(249); });
  expect(request).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(request).toHaveBeenCalledTimes(3);
  expect(exposed?.load).toMatchObject({ status: 'loading', etag: 'revision-2' });
  expect(followUp.promise).toBeInstanceOf(Promise);
});

it('spaces repeated failures and does not replay event bursts on recovery', async () => {
  const initial = deferred<{ data: HttpQueueObservation; etag: string | null }>();
  const failed = deferred<{ data: HttpQueueObservation; etag: string | null }>();
  const recovered = deferred<{ data: HttpQueueObservation; etag: string | null }>();
  const request = vi.mocked(requestJsonWithMetadata);
  request.mockReturnValueOnce(initial.promise as never).mockReturnValueOnce(failed.promise as never).mockReturnValueOnce(recovered.promise as never);

  await mount();
  await act(async () => { initial.resolve({ data: observation(), etag: 'revision-1' }); await initial.promise; });
  await act(async () => { window.dispatchEvent(new Event('factory-controller-event')); await vi.advanceTimersByTimeAsync(250); });
  expect(request).toHaveBeenCalledTimes(2);
  await act(async () => { failed.reject(new Error('offline')); await failed.promise.catch(() => {}); });
  expect(exposed?.canRefresh).toBe(false);

  await act(async () => {
    for (let index = 0; index < 20; index++) window.dispatchEvent(new Event('factory-controller-event'));
    exposed!.refresh();
    await vi.advanceTimersByTimeAsync(1_999);
  });
  expect(request).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(request).toHaveBeenCalledTimes(3);

  await act(async () => { recovered.resolve({ data: observation(), etag: 'revision-2' }); await recovered.promise; });
  expect(exposed?.load).toMatchObject({ status: 'ready', etag: 'revision-2' });
  expect(exposed?.canRefresh).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(request).toHaveBeenCalledTimes(3);
});

it('holds manual and event reads until a remote retry time', async () => {
  const initial = deferred<{ data: HttpQueueObservation; etag: string | null }>();
  const request = vi.mocked(requestJsonWithMetadata);
  request.mockReturnValueOnce(initial.promise as never).mockResolvedValueOnce({ data: observation(), etag: 'revision-2' } as never);

  await mount();
  const retryAt = Date.now() + 3_000;
  await act(async () => { initial.resolve({ data: observation({ retry_at_ms: retryAt, next_poll_at_ms: retryAt }), etag: 'revision-1' }); await initial.promise; });
  expect(exposed?.retryAtMs).toBe(retryAt);
  expect(exposed?.canRefresh).toBe(false);

  await act(async () => {
    for (let index = 0; index < 20; index++) window.dispatchEvent(new Event('factory-controller-event'));
    exposed!.refresh();
    await vi.advanceTimersByTimeAsync(2_999);
  });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(request).toHaveBeenCalledTimes(2);
});
