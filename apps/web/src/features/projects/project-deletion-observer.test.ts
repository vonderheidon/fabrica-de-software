// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ read: vi.fn(), known: [] as string[] }));
vi.mock('../../api/project-deletion.js', () => ({
  getProjectDeletionStatus: api.read, knownProjectDeletionOperations: () => api.known,
  isProjectDeletionOperationCompleted: () => false,
}));
import { subscribeProjectDeletion, trackProjectDeletions } from './project-deletion-observer.js';
const cleanup: (() => void)[] = [];
const pending = { operationId: 'operation', state: 'running' };
beforeEach(() => { vi.useFakeTimers(); api.known = []; api.read.mockReset().mockResolvedValue(pending); window.sessionStorage.clear(); });
afterEach(() => { for (const stop of cleanup.splice(0).reverse()) stop(); vi.useRealTimers(); });

it('shares a single reader with the dialog and continues to completion after it closes', async () => {
  api.known = ['operation'];
  cleanup.push(trackProjectDeletions(1000));
  const publish = vi.fn();
  const closeDialog = subscribeProjectDeletion('operation', publish, vi.fn(), 1000, 4000);
  await vi.advanceTimersByTimeAsync(0);
  expect(api.read).toHaveBeenCalledTimes(1);
  expect(publish).toHaveBeenCalledWith(pending);
  closeDialog();
  api.read.mockResolvedValue({ operationId: 'operation', state: 'succeeded' });
  await vi.advanceTimersByTimeAsync(1000);
  expect(api.read).toHaveBeenCalledTimes(2);
  expect(publish).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(api.read).toHaveBeenCalledTimes(2);
});

it('recovers session operation references without an open dialog and never writes', async () => {
  window.sessionStorage.setItem('factory.uncertain-operations.v1', JSON.stringify([
    { kind: 'project.delete', operationId: '00000000-0000-4000-8000-000000000001', recordedAt: 1 },
  ]));
  cleanup.push(trackProjectDeletions(1000));
  await vi.advanceTimersByTimeAsync(0);
  expect(api.read).toHaveBeenCalledExactlyOnceWith('00000000-0000-4000-8000-000000000001', expect.any(AbortSignal));
});

it('backs off failed reads and keeps only one in-flight read across subscribers', async () => {
  api.known = ['operation'];
  let release: ((value: typeof pending) => void) | undefined;
  api.read.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  cleanup.push(trackProjectDeletions(1000));
  cleanup.push(subscribeProjectDeletion('operation', vi.fn(), vi.fn(), 1000, 4000));
  await vi.advanceTimersByTimeAsync(5000);
  expect(api.read).toHaveBeenCalledTimes(1);
  release?.(pending);
  await vi.advanceTimersByTimeAsync(0);
  api.read.mockRejectedValue(new Error('offline'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(api.read).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1999);
  expect(api.read).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(api.read).toHaveBeenCalledTimes(3);
});
