import { afterEach, describe, expect, it, vi } from 'vitest';
import { collect, GraphQLReader, type CommandResponse, type GhRunner } from './transport.js';

function response(data: unknown): CommandResponse {
  return { exitCode: 0, stdout: `HTTP/2.0 200 Response\r\ncontent-type: application/json\r\n\r\n${JSON.stringify({ data })}` };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function readerWithClock(run: GhRunner, monotonicNow: () => number, wallNow: () => number = Date.now,
  throttle = { retryAtMs: 0 }): GraphQLReader {
  return new GraphQLReader(run, wallNow, throttle, undefined, new Set(), monotonicNow);
}

describe('GitHub revocable authorization deadline', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('skips authorization for expired deadlines and already-aborted signals', async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => response({ viewer: { id: 'U_test' } }));
    const beforeSend = vi.fn(async () => {});
    const reader = readerWithClock(run, () => 10);
    const expired = await reader.query('query Expired', {}, undefined, 1, { beforeSend, deadlineMonotonicMs: 10 });
    const controller = new AbortController(); controller.abort();
    const cancelled = await reader.query('query Cancelled', {}, undefined, 1, { beforeSend, signal: controller.signal });
    const noContext = await new GraphQLReader(undefined, () => 0, { retryAtMs: 0 }, undefined, new Set(), () => 10)
      .query('query NoContext', {}, undefined, 1, { beforeSend });
    const rateLimited = await readerWithClock(run, () => 10, () => 0, { retryAtMs: 11 })
      .query('query Cooldown', {}, undefined, 1, { beforeSend });

    expect(expired).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_LIMIT' }] });
    expect(cancelled).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_FAILED' }] });
    expect(noContext).toMatchObject({ state: 'context_unavailable', diagnostics: [{ code: 'CONTEXT_UNAVAILABLE' }] });
    expect(rateLimited).toMatchObject({ state: 'rate_limited', diagnostics: [{ code: 'RATE_LIMITED' }] });
    expect(beforeSend).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'external seven-second deadline', externalDeadlineMonotonicMs: 7_000, elapsed: 7_000 },
    { name: 'internal sixty-second deadline despite a later external deadline', externalDeadlineMonotonicMs: 100_000, elapsed: 60_000 },
  ])('returns once the $name expires and ignores late authorization completion', async ({ externalDeadlineMonotonicMs, elapsed }) => {
    vi.useFakeTimers();
    let monotonicNow = 0;
    const run = vi.fn(async () => response({ viewer: { id: 'U_test' } }));
    const authorization = deferred<void>();
    const beforeSend = vi.fn(() => authorization.promise);
    const reader = readerWithClock(run, () => monotonicNow);
    const pending = reader.query('mutation Effect', {}, undefined, 1, { beforeSend, deadlineMonotonicMs: externalDeadlineMonotonicMs });

    monotonicNow = elapsed;
    await vi.advanceTimersByTimeAsync(elapsed);
    await expect(pending).resolves.toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_LIMIT' }] });
    if (externalDeadlineMonotonicMs === 7_000) authorization.resolve();
    else authorization.reject(new Error('LATE_AUTHORIZATION_REJECTION'));
    await Promise.resolve();
    expect(beforeSend).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
  });

  it('uses now >= deadline as the final guard even while the deadline timer is pending', async () => {
    vi.useFakeTimers();
    let monotonicNow = 0;
    const run = vi.fn(async (_input: string, onSend?: () => void) => { onSend?.(); return response({ viewer: { id: 'U_test' } }); });
    const reader = readerWithClock(run, () => monotonicNow);
    const beforeSend = vi.fn(() => { monotonicNow = 7_000; });

    const outcome = await reader.query('mutation Effect', {}, undefined, 1, { beforeSend, deadlineMonotonicMs: 7_000 });

    expect(outcome).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_LIMIT' }] });
    expect(beforeSend).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
  });

  it('shares one deadline across three slow reads, pagination, and the second stamp observation', async () => {
    vi.useFakeTimers();
    let monotonicNow = 0;
    let calls = 0;
    const run: GhRunner = async (input, onSend) => {
      onSend?.();
      calls++;
      const request = JSON.parse(input) as { query: string; variables: Record<string, unknown> };
      monotonicNow += calls <= 3 ? 14_000 : calls <= 5 ? 1_000 : 14_000;
      if (request.query === 'query Pages') {
        return response({ items: { nodes: [{ id: `N${calls}` }], pageInfo: { hasNextPage: calls === 4, endCursor: 'cursor-2' } } });
      }
      return response({ viewer: { id: 'U_test' } });
    };
    const reader = readerWithClock(run, () => monotonicNow);
    const beforeSend = async (context: { signal: AbortSignal; deadlineMonotonicMs: number }) => {
      for (const name of ['Identity', 'Issue', 'Repository']) {
        const read = await reader.query(`query ${name}`, {}, undefined, 1, { signal: context.signal, deadlineMonotonicMs: context.deadlineMonotonicMs });
        expect(read.state).toBe('complete');
      }
      const pages = await collect(reader.scope(), 'query Pages', {}, data => data.items, node => node,
        undefined, undefined, { signal: context.signal, deadlineMonotonicMs: context.deadlineMonotonicMs });
      expect(pages.state).toBe('complete');
      const stamp = await reader.query('query StampSecondObservation', {}, undefined, 1,
        { signal: context.signal, deadlineMonotonicMs: context.deadlineMonotonicMs });
      expect(stamp.state).toBe('complete');
      monotonicNow += 2_000;
    };

    const outcome = await reader.query('mutation Effect', {}, undefined, 1, { beforeSend, deadlineMonotonicMs: 60_000 });

    expect(outcome).toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_LIMIT' }] });
    expect(monotonicNow).toBe(60_000);
    expect(calls).toBe(6);
  });

  it('treats cancellation during authorization as QUERY_FAILED and never resumes dispatch', async () => {
    vi.useFakeTimers();
    let monotonicNow = 0;
    const run = vi.fn(async (_input: string, onSend?: () => void) => { onSend?.(); return response({ viewer: { id: 'U_test' } }); });
    const authorization = deferred<void>();
    const controller = new AbortController();
    const beforeSend = vi.fn(() => authorization.promise);
    const reader = readerWithClock(run, () => monotonicNow);
    const pending = reader.query('mutation Effect', {}, undefined, 1, { beforeSend, signal: controller.signal });

    controller.abort();
    await expect(pending).resolves.toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_FAILED' }] });
    authorization.resolve();
    monotonicNow = 1;
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();
    expect(monotonicNow).toBe(1);
  });

  it('keeps a sent query failed when cancellation races with its response', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const run: GhRunner = (_input, onSend, _responseBytes, control) => {
      onSend?.();
      return new Promise(resolve => control?.signal.addEventListener('abort', () => resolve(response({ viewer: { id: 'U_test' } })), { once: true }));
    };
    const reader = readerWithClock(run, () => 0);
    let sendCount = 0;
    const pending = reader.query('mutation Effect', {}, () => { sendCount++; }, 1, { signal: controller.signal });

    controller.abort();
    await expect(pending).resolves.toMatchObject({ state: 'unavailable', diagnostics: [{ code: 'QUERY_FAILED' }] });
    expect(sendCount).toBe(1);
  });
});
