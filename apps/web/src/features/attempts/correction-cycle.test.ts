// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HttpAttemptDetail } from '#contracts';
import { AttemptBlockDecision } from './AttemptBlockDecision.js';
import { CorrectionHistory } from './CorrectionHistory.js';
import { HttpError } from '../../api/http.js';

const { request, metadata } = vi.hoisted(() => ({ request: vi.fn(), metadata: vi.fn() }));
vi.mock('../../api/http.js', async original => ({ ...await original<typeof import('../../api/http.js')>(), requestJson: request, requestJsonWithMetadata: metadata }));
let root: ReturnType<typeof createRoot>; let container: HTMLDivElement; let attempt: HttpAttemptDetail;
const refresh = vi.fn();
const available = { available: true };
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  attempt = { id: crypto.randomUUID(), round: 3, expected_account_id: 'account', delivery_id: 'version', selected_delivery_id: 'version', result: null, suspension: 'CORRECTION_BLOCKED', block: { id: crypto.randomUUID(), revision: 1, reason: 'no_progress', delivery_id: 'version', cause: 'Duas correções sem progresso', recovery: 'Escolha uma ação', corrections_used: 2, correction_limit: 5, consecutive_no_progress: 2, evidence: ['Check da versão atual'], guidance_capability: available, change_profile_capability: available, end_capability: available } } as HttpAttemptDetail;
  request.mockReset(); metadata.mockReset(); refresh.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const show = (etag = '"1"', current = true) => act(async () => root.render(createElement(AttemptBlockDecision, { key: attempt.id, attempt, etag, current, onRefresh: refresh })));
const button = (text: string) => { const found = [...container.querySelectorAll('button')].find(item => item.textContent === text); if (!found) throw new Error(text); return found; };
async function chooseGuidance() {
  await act(async () => (container.querySelector('input[type=radio]') as HTMLInputElement).click());
  const area = container.querySelector('textarea')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, 'Conferir o critério pendente'); area.dispatchEvent(new Event('input', { bubbles: true })); });
}
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }

it('has no automatic choice and preserves draft across revision changes and reopening', async () => {
  await show();
  expect(container.querySelector('input:checked')).toBeNull();
  expect(button('Confirmar decisão').disabled).toBe(true);
  await chooseGuidance();
  expect(button('Confirmar decisão').disabled).toBe(false);
  await show('"2"');
  expect(button('Confirmar decisão').disabled).toBe(true);
  await act(async () => root.render(null)); await show('"2"');
  expect(container.querySelector('textarea')?.value).toBe('Conferir o critério pendente');
  expect(button('Confirmar decisão').disabled).toBe(true);
  await act(async () => button('Revisei o estado e a ação').click());
  expect(button('Confirmar decisão').disabled).toBe(false);
  expect(metadata).not.toHaveBeenCalled();
});

it('locks double submit and queries the same operation after a lost response and reopening', async () => {
  metadata.mockRejectedValue(new Error('connection lost'));
  request.mockImplementation(async path => ({ operation_id: path.split('/').at(-1), kind: 'attempt.decision', resource: { id: attempt.id }, state: 'succeeded' }));
  await show(); await chooseGuidance();
  await act(async () => { button('Confirmar decisão').click(); button('Confirmar decisão').click(); });
  expect(metadata).toHaveBeenCalledTimes(1);
  const [path, init] = metadata.mock.calls[0]!;
  expect(path).toBe(`/api/v1/attempts/${attempt.id}/decisions`);
  expect(JSON.parse(init.body)).toMatchObject({ action: 'guidance', authorized: true, block_id: attempt.block!.id, delivery_id: 'version' });
  const operationId = init.headers['Idempotency-Key'];
  await act(async () => root.render(null)); await show();
  expect(request).toHaveBeenCalledWith(`/api/v1/operations/${operationId}`);
  expect(container.textContent).toContain('Decisão registrada');
  expect(metadata).toHaveBeenCalledTimes(1);
});

it('keeps draft after 412 and requires an explicit review before any new command', async () => {
  metadata.mockRejectedValue(new HttpError(412, 'REVISION_CONFLICT', 'stale', null, [], null, null, null));
  await show(); await chooseGuidance();
  await act(async () => button('Confirmar decisão').click());
  expect(container.querySelector('textarea')?.value).toBe('Conferir o critério pendente');
  expect(button('Confirmar decisão').disabled).toBe(true);
  expect(container.textContent).toContain('A revisão venceu');
  await show('"2"');
  expect(button('Confirmar decisão').disabled).toBe(true);
  await act(async () => button('Revisei o estado e a ação').click());
  expect(button('Confirmar decisão').disabled).toBe(false);
});

it('shows total limit and unavailability without enabling guidance or acting on historical selection', async () => {
  attempt.block = { ...attempt.block!, reason: 'correction_limit', correction_limit: 0, corrections_used: 0, guidance_capability: { available: false, reason: 'Limite total atingido' } };
  attempt.round = 1;
  await show();
  expect((container.querySelector('input') as HTMLInputElement).disabled).toBe(true);
  expect(container.textContent).toContain('Limite total atingido');
  expect(container.textContent).toContain('0 de 0');
  await show('"1"', false);
  expect(container.querySelector('fieldset')?.disabled).toBe(true);
});

it('carries a pending command through unmount without creating another one', async () => {
  const pending = deferred<{ data: { operation_id: string } }>(); metadata.mockReturnValue(pending.promise);
  await show(); await chooseGuidance();
  await act(async () => { button('Confirmar decisão').click(); });
  const operationId = metadata.mock.calls[0]![1].headers['Idempotency-Key'];
  await act(async () => root.render(null)); await show();
  await act(async () => pending.resolve({ data: { operation_id: operationId } }));
  expect(button('Consultar decisão enviada').disabled).toBe(false);
  expect(container.textContent).toContain('Orientação registrada');
  expect(metadata).toHaveBeenCalledTimes(1);
});

it('allows a separate explicit decision after confirmed success on a newer blocked revision', async () => {
  metadata.mockImplementation(async (_path, init) => ({ data: { operation_id: init.headers['Idempotency-Key'] } }));
  request.mockImplementation(async path => ({ operation_id: path.split('/').at(-1), kind: 'attempt.decision', resource: { id: attempt.id }, state: 'succeeded' }));
  await show(); await chooseGuidance();
  await act(async () => button('Confirmar decisão').click());
  await act(async () => button('Consultar decisão enviada').click());
  expect([...container.querySelectorAll('button')].some(item => item.textContent === 'Escolher nova decisão para o estado atual')).toBe(false);
  attempt.delivery_id = 'next-version'; attempt.selected_delivery_id = 'next-version'; attempt.round = 4;
  await show('"2"');
  await act(async () => button('Escolher nova decisão para o estado atual').click());
  expect(container.querySelector('input:checked')).toBeNull();
  expect(button('Confirmar decisão').disabled).toBe(true);
  await act(async () => (container.querySelectorAll('input')[2] as HTMLInputElement).click());
  await act(async () => button('Confirmar decisão').click());
  expect(metadata).toHaveBeenCalledTimes(2);
  expect(metadata.mock.calls[1]![1].headers['Idempotency-Key']).not.toBe(metadata.mock.calls[0]![1].headers['Idempotency-Key']);
  expect(JSON.parse(metadata.mock.calls[1]![1].body).action).toBe('end');
  expect(JSON.parse(metadata.mock.calls[1]![1].body).delivery_id).toBe('next-version');
  expect(container.textContent).toContain('3 de 5');
});

it('omits correction history without records and makes no detail requests', async () => {
  await act(async () => root.render(createElement(CorrectionHistory, { attemptId: attempt.id, round: '1', deliveryId: null, sections: [] })));
  expect(container.textContent).toBe('');
  expect(request).not.toHaveBeenCalled();
});

it('loads history only on demand, paginates and excludes late data after a selection change', async () => {
  const pending = deferred<HttpAttemptDetail>();
  request.mockReturnValue(pending.promise);
  const history = (version: string) => act(async () => root.render(createElement(CorrectionHistory, { key: version, attemptId: attempt.id, round: '2', deliveryId: version, sections: ['finding_assessments'] })));
  await history('a'); expect(request).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain('Contestações e respostas');
  expect(container.textContent).not.toContain('Decisões registradas');
  await act(async () => button('Consultar histórico').click());
  expect(request.mock.calls[0]![0]).toContain('delivery_id=a');
  await history('b');
  await act(async () => pending.resolve({ id: attempt.id, v3_details: { section: 'finding_assessments', items: [{ id: 'assessment', progress: 'partial', justification: 'OLD RESULT', evidence: [], created_at_ms: 1 }], has_more: false, next_cursor: null } } as unknown as HttpAttemptDetail));
  expect(container.textContent).not.toContain('OLD RESULT');
  request.mockResolvedValue({ id: attempt.id, v3_details: { section: 'finding_assessments', items: [{ id: 'new', progress: 'partial', round: 2, justification: 'Prova parcial atual', evidence: ['artifact:current'], created_at_ms: 1 }], has_more: true, next_cursor: 'next' } });
  await act(async () => button('Consultar histórico').click());
  expect(container.textContent).toContain('Parcial comprovado');
  request.mockResolvedValue({ id: attempt.id, v3_details: { section: 'finding_assessments', items: [], has_more: false, next_cursor: null } });
  await act(async () => button('Carregar continuação do histórico').click());
  expect(request.mock.calls.at(-1)![0]).toContain('cursor=next');
  expect(container.textContent).toContain('Prova parcial atual');
});
