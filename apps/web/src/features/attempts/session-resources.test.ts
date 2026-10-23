// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HttpAttemptDetail } from '#contracts';
import { PassageFacts } from './PassageFacts.js';
import { useAttempt } from './useAttempt.js';
import { useAttemptActions } from './useAttemptActions.js';

const { request, metadata } = vi.hoisted(() => ({ request: vi.fn(), metadata: vi.fn() }));
vi.mock('../../api/http.js', async original => ({ ...await original<typeof import('../../api/http.js')>(), requestJson: request, requestJsonWithMetadata: metadata }));
let root: ReturnType<typeof createRoot>; let container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); request.mockReset(); metadata.mockReset(); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const passage = { id: 'passage', attempt_id: 'attempt', delivery_id: 'version', round: 2, role: 'reviewer' as const, state: 'ready', tracking: 'tracked', diagnostic: null, result_receipt_id: null, created_at_ms: 1, attempt_session_id: 'session', session_state: 'completed', session_source_id: 'previous', terminal_name: 'private-reference', terminal_state: 'available', occupancy_state: 'released' };

it('distinguishes continuous session, historical occupancy, current idle terminal and lost coordination', async () => {
  await act(async () => root.render(createElement(PassageFacts, { passage })));
  expect(container.textContent).toContain('Mesma sessão do papel');
  expect(container.textContent).toContain('Revisor · rodada 2');
  expect(container.textContent).toContain('Ocioso e disponível');
  expect(container.textContent).toContain('Ocupação desta passagem liberada');
  expect(container.textContent).not.toContain('private-reference');
  await act(async () => root.render(createElement(PassageFacts, { passage: { ...passage, tracking: 'lost', session_state: 'interrupted', terminal_state: 'uncertain' } })));
  expect(container.textContent).toContain('Coordenação automática interrompida');
  expect(container.textContent).toContain('não comprova parada física nem recuperação de autoridade');
  await act(async () => root.render(createElement(PassageFacts, { passage: { ...passage, attempt_session_id: null, terminal_name: null } })));
  expect(container.textContent).toContain('Indisponível no histórico legado');
});

it('hides the previous version immediately and discards its late attempt response', async () => {
  let finish: (value: unknown) => void = () => undefined;
  metadata.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  metadata.mockResolvedValue({ data: { id: 'new-version' }, etag: 'new' });
  let current: ReturnType<typeof useAttempt>;
  function Probe({ query }: { query: string }) { current = useAttempt('attempt', query, 0); return null; }
  await act(async () => root.render(createElement(Probe, { query: '?round_id=1' })));
  await act(async () => root.render(createElement(Probe, { query: '?round_id=2' })));
  await act(async () => finish({ data: { id: 'old-version' }, etag: 'old' }));
  expect(current!.attempt?.id).toBe('new-version');
});

it('discards late resources and command receipts across selections without replaying commands', async () => {
  let finishResources: (value: unknown) => void = () => undefined;
  let finishCommand: (value: unknown) => void = () => undefined;
  request.mockImplementation((path: string) => {
    if (path === '/api/v1/attempts/A/resources') return new Promise(resolve => { finishResources = resolve; });
    if (path.endsWith('/resources')) return Promise.resolve({ entries: [], cleanup: 'pending', event_cursor: '1' });
    if (path.includes('section=passages')) return Promise.resolve({ details: { items: [] } });
    return Promise.resolve(null);
  });
  metadata.mockImplementation(() => new Promise(resolve => { finishCommand = resolve; }));
  let current: ReturnType<typeof useAttemptActions>;
  function Probe({ id, round }: { id: string; round: string }) {
    current = useAttemptActions(id, { capabilities: { cancel: { available: true } } } as HttpAttemptDetail, null, null, false, round);
    return null;
  }
  await act(async () => root.render(createElement(Probe, { id: 'A', round: '1' })));
  await act(async () => current!.cancel());
  const commandId = metadata.mock.calls[0]![1].headers['Idempotency-Key'];
  await act(async () => root.render(createElement(Probe, { id: 'B', round: '2' })));
  await act(async () => { finishResources({ entries: [{ id: 'stale-resource' }], cleanup: 'uncertain' }); finishCommand({ data: { operation_id: commandId } }); });
  expect(current!.resources?.entries).toEqual([]);
  expect(current!.operation).toBeNull(); expect(current!.busy).toBe(false);
  expect(metadata).toHaveBeenCalledOnce();
  await act(async () => root.render(createElement(Probe, { id: 'B', round: '1' })));
  expect(current!.operation).toBeNull();
});
