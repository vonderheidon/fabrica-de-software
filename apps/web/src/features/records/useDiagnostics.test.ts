// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HttpDiagnosticContext, HttpDiagnosticsView } from '#contracts';
import { useDiagnostics } from './useDiagnostics.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../api/http.js', async (original) => ({ ...await original<typeof import('../../api/http.js')>(), requestJson: request }));
let result: ReturnType<typeof useDiagnostics>;
let account = 'account-a';
let revision = 1;
let sequence = 0;
beforeEach(() => { account = `account-${++sequence}`; });
const report = { operation_id: 'original-operation', state: 'succeeded' as const, created_at_ms: 1, completed_at_ms: 2, checks: ['configuration' as const], diagnostics: [], receipt: { revision: 1, event_cursor: '1' } };
const view = (reports: HttpDiagnosticsView['reports'] = []): HttpDiagnosticsView => ({ context: { scope: 'host' }, supported_checks: ['configuration'], diagnostics: [], reports, event_cursor: '1' });
function Surface({ context }: { context: HttpDiagnosticContext | null }) { result = useDiagnostics(context); return null; }
const roots: ReturnType<typeof createRoot>[] = [];
async function mount(context: HttpDiagnosticContext | null = { scope: 'host' }) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div')); roots.push(root);
  await act(async () => root.render(createElement(Surface, { context })));
  return root;
}
function reads(reports: HttpDiagnosticsView['reports'] = []) {
  request.mockImplementation(async (path: string) => path === '/api/v1/settings'
    ? { settings: { account_id: account, installation_id: 'installation', revision }, profiles: [] }
    : path.startsWith('/api/v1/operations/') ? { state: 'succeeded' } : view(reports));
}
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); request.mockReset(); account = 'account-a'; revision = 1; });

it('identifies persisted reports as previous and recovers their original operation', async () => {
  reads([report]); await mount();
  expect(result.previous).toBe(true);
  expect(result.verification?.operationId).toBe('original-operation');
});

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

it('ignores unrelated host events and coalesces relevant bursts while blocking actions immediately', async () => {
  reads(); await mount(); vi.useFakeTimers();
  request.mockClear();
  await act(async () => window.dispatchEvent(new CustomEvent('factory-controller-event', { detail: { event_type: 'attempt.updated', project_id: 'other' } })));
  await act(async () => { await vi.advanceTimersByTimeAsync(150); });
  expect(request).not.toHaveBeenCalled();
  await act(async () => {
    for (let i = 0; i < 3; i++) window.dispatchEvent(new CustomEvent('factory-controller-event', { detail: { event_type: 'settings.updated' } }));
  });
  expect(result.stale).toBe(true);
  await act(async () => result.verify(['configuration']));
  expect(request).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(150); });
  expect(request.mock.calls.filter(([path]) => path.startsWith('/api/v1/diagnostics'))).toHaveLength(1);
  expect(result.stale).toBe(false);
});

it.each(['object', 'account', 'revision'] as const)('discards inverted reads after a change of %s', async (change) => {
  const oldRead = deferred<HttpDiagnosticsView>();
  let count = 0;
  reads();
  const normal = request.getMockImplementation()!;
  request.mockImplementation((path: string, init?: RequestInit) => {
    if (path.startsWith('/api/v1/projects/')) return Promise.resolve({ project: { revision, current_revision_id: `revision-${revision}` } });
    if (path.startsWith('/api/v1/diagnostics')) return ++count === 1 ? oldRead.promise : Promise.resolve({ ...view(), event_cursor: 'new' });
    return normal(path, init);
  });
  const root = await mount({ scope: 'project', id: 'a' });
  await act(async () => {
    if (change === 'account') account = 'other-account';
    if (change === 'revision') revision++;
    if (change === 'object') root.render(createElement(Surface, { context: { scope: 'project', id: 'b' } }));
    else result.refresh();
  });
  expect(result.view?.event_cursor).toBe('new');
  await act(async () => oldRead.resolve({ ...view(), event_cursor: 'old' }));
  expect(result.view?.event_cursor).toBe('new');
});

it.each(['accepted', 'uncertain'] as const)('keeps the original %s submission across closing and reopening', async (outcome) => {
  reads();
  const normal = request.getMockImplementation()!;
  const pending = deferred<unknown>();
  request.mockImplementation((path: string, init?: RequestInit) => init?.method === 'POST' ? pending.promise : normal(path, init));
  const root = await mount();
  let action!: Promise<void>;
  await act(async () => { action = result.verify(['configuration']); });
  const operationId = result.verification!.operationId;
  await act(async () => root.render(null));
  await act(async () => {
    if (outcome === 'accepted') pending.resolve({ operation_id: operationId, receipt: { revision: 1, event_cursor: '1' } });
    else pending.reject(new Error('lost response'));
    await action;
  });
  await act(async () => root.render(createElement(Surface, { context: { scope: 'host' } })));
  expect(result.verification?.operationId).toBe(operationId);
  expect(result.verification?.state).toBe(outcome === 'accepted' ? 'accepted' : 'unavailable');
  await act(async () => result.verify(['configuration']));
  vi.useFakeTimers();
  await act(async () => { result.retryReceipt(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(request.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toHaveLength(1);
  expect(request.mock.calls.some(([path]) => path === `/api/v1/operations/${operationId}`)).toBe(true);
});

it('keeps a result previous after close, revision change and reopen', async () => {
  reads([report]); const root = await mount();
  await act(async () => root.render(null)); revision++;
  await act(async () => root.render(createElement(Surface, { context: { scope: 'host' } })));
  expect(result.previous).toBe(true);
  expect(result.view?.reports).toEqual([report]);
});

it('retains action uncertainty independently of query failures and retries', async () => {
  reads(); const normal = request.getMockImplementation()!;
  request.mockImplementation((path: string, init?: RequestInit) => init?.method === 'POST' || path.startsWith('/api/v1/operations/') ? Promise.reject(new Error('offline')) : normal(path, init));
  await mount();
  await act(async () => result.verify(['configuration']));
  const error = result.verification?.error;
  vi.useFakeTimers();
  await act(async () => result.retryReceipt());
  expect(result.verification?.error).toBe(error);
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(result.verification?.error).toBe(error);
  expect(result.verification?.queryError).toContain('Não foi possível consultar');
  await act(async () => result.retryReceipt());
  expect(result.verification?.queryError).toContain('Não foi possível consultar');
});

it('explains missing correlation and does not send anything on mount', async () => {
  reads(); await mount();
  expect(result.recoveryUnavailable).toBe(true);
  expect(result.verification).toBeNull();
  expect(request.mock.calls.every(([, init]) => (init as RequestInit | undefined)?.method !== 'POST')).toBe(true);
});

it('queries a recovered operation after a page reload without posting', async () => {
  reads([report]); await mount(); vi.useFakeTimers();
  await act(async () => result.retryReceipt());
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(request.mock.calls.some(([path]) => path === '/api/v1/operations/original-operation')).toBe(true);
  expect(request.mock.calls.every(([, init]) => (init as RequestInit | undefined)?.method !== 'POST')).toBe(true);
});

it('preserves an earlier observation as stale when a refresh fails', async () => {
  reads([report]); await mount();
  const earlier = result.view;
  request.mockRejectedValue(new Error('offline'));
  await act(async () => result.refresh());
  expect(result.view).toBe(earlier);
  expect(result.stale).toBe(true);
  expect(result.error).not.toBeNull();
});

it.each(['account', 'revision', 'object'] as const)('does not present a late action as current after closing and changing %s', async (change) => {
  reads(); const normal = request.getMockImplementation()!;
  const pending = deferred<unknown>();
  request.mockImplementation((path: string, init?: RequestInit) => {
    if (init?.method === 'POST') return pending.promise;
    if (path.startsWith('/api/v1/projects/')) return Promise.resolve({ project: { revision, current_revision_id: `revision-${revision}` } });
    return normal(path, init);
  });
  const root = await mount({ scope: 'project', id: 'a' });
  let action!: Promise<void>;
  await act(async () => { action = result.verify(['configuration']); });
  const original = result.verification!.operationId;
  await act(async () => root.render(null));
  if (change === 'account') account = 'another-account';
  if (change === 'revision') revision++;
  await act(async () => root.render(createElement(Surface, { context: { scope: 'project', id: change === 'object' ? 'b' : 'a' } })));
  await act(async () => { pending.resolve({ operation_id: original, receipt: { revision: 1, event_cursor: '1' } }); await action; });
  if (change === 'revision') { expect(result.verification?.operationId).toBe(original); expect(result.previous).toBe(true); }
  else expect(result.verification).toBeNull();
  expect(request.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toHaveLength(1);
});

it('ignores a read from a closed lifecycle after reopening the same object', async () => {
  reads(); const normal = request.getMockImplementation()!;
  const pending = deferred<HttpDiagnosticsView>(); let count = 0;
  request.mockImplementation((path: string, init?: RequestInit) => path.startsWith('/api/v1/diagnostics') ? ++count === 1 ? pending.promise : Promise.resolve({ ...view(), event_cursor: 'reopened' }) : normal(path, init));
  const root = await mount();
  await act(async () => root.render(null));
  await act(async () => root.render(createElement(Surface, { context: { scope: 'host' } })));
  await act(async () => pending.resolve({ ...view(), event_cursor: 'closed' }));
  expect(result.view?.event_cursor).toBe('reopened');
});

it.each(['account', 'revision'] as const)('rejects a response spanning a %s change even before an event arrives', async (change) => {
  reads(); const normal = request.getMockImplementation()!;
  const pending = deferred<HttpDiagnosticsView>(); let count = 0;
  request.mockImplementation((path: string, init?: RequestInit) => path.startsWith('/api/v1/diagnostics') ? ++count === 1 ? pending.promise : Promise.resolve({ ...view(), event_cursor: 'fresh' }) : normal(path, init));
  await mount();
  if (change === 'account') account = 'changed-before-event'; else revision++;
  await act(async () => pending.resolve({ ...view(), event_cursor: 'obsolete' }));
  expect(result.view?.event_cursor).toBe('fresh');
});

it('preserves a completed verification as previous when reopening after a revision change', async () => {
  let reports: HttpDiagnosticsView['reports'] = [];
  request.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/api/v1/settings') return { settings: { account_id: account, installation_id: 'installation', revision }, profiles: [] };
    if (init?.method === 'POST') {
      const id = new Headers(init.headers).get('Idempotency-Key')!;
      reports = [{ ...report, operation_id: id }];
      return { operation_id: id, receipt: report.receipt };
    }
    if (path.startsWith('/api/v1/operations/')) return { state: 'succeeded' };
    return view(reports);
  });
  const root = await mount();
  vi.useFakeTimers();
  await act(async () => result.verify(['configuration']));
  const id = result.verification!.operationId;
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(result.verification?.state).toBe('succeeded');
  await act(async () => root.render(null)); revision++;
  await act(async () => root.render(createElement(Surface, { context: { scope: 'host' } })));
  expect(result.view?.reports[0]?.operation_id).toBe(id);
  expect(result.previous).toBe(true);
});

it('keeps the earlier view identified as stale if the new revision cannot be read', async () => {
  reads([report]); await mount();
  const earlier = result.view;
  const normal = request.getMockImplementation()!;
  revision++;
  request.mockImplementation((path: string, init?: RequestInit) => path.startsWith('/api/v1/diagnostics')
    ? Promise.reject(new Error('offline')) : normal(path, init));
  await act(async () => result.refresh());
  expect(result.view).toBe(earlier);
  expect(result.stale).toBe(true);
  expect(result.previous).toBe(true);
  expect(result.error).not.toBeNull();
});

it('preserves accepted state when its receipt is unavailable and only retries consultation explicitly', async () => {
  reads(); const normal = request.getMockImplementation()!;
  request.mockImplementation((path: string, init?: RequestInit) => {
    if (init?.method === 'POST') return Promise.resolve({ operation_id: new Headers(init.headers).get('Idempotency-Key'), receipt: report.receipt });
    if (path.startsWith('/api/v1/operations/')) return Promise.reject(new Error('receipt unavailable'));
    return normal(path, init);
  });
  await mount(); vi.useFakeTimers();
  await act(async () => result.verify(['configuration']));
  const id = result.verification!.operationId;
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(result.verification?.state).toBe('accepted');
  expect(result.verification?.queryError).not.toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(request.mock.calls.filter(([path]) => path === `/api/v1/operations/${id}`)).toHaveLength(1);
  await act(async () => result.retryReceipt());
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(request.mock.calls.filter(([path]) => path === `/api/v1/operations/${id}`)).toHaveLength(2);
  expect(request.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toHaveLength(1);
});
