// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { HttpQuestion } from '#contracts';
import { DecisionNotification } from './DecisionNotification.js';

const { metadata, request } = vi.hoisted(() => ({ metadata: vi.fn(), request: vi.fn() }));
vi.mock('../../api/http.js', async original => ({ ...await original<typeof import('../../api/http.js')>(), requestJsonWithMetadata: metadata, requestJson: request }));
let root: ReturnType<typeof createRoot> | null = null;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const id = '00000000-0000-4000-8000-000000000001';
async function show(hasQuestion = true) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  request.mockImplementation(async (path: string) => path.includes('?result=active')
    ? { items: [{ id, suspension: 'HUMAN_DECISION', issue_number: 24 }] }
    : { id, result: null, pending_question_id: hasQuestion ? id : null });
  const question: HttpQuestion = { id, attempt_id: id, passage_id: id, delivery_id: id,
    question: { format_version: 1, decision: 'Definir o limite da independência', context: 'Escolha como executar os papéis.', alternatives: ['Manter executor', 'Substituir executor'] },
    scope_change: null, state: 'pending', revision: 1, raised_at_ms: 1, answered_at_ms: null,
    ttl: { state: 'not_configured' }, expired_at_ms: null, answer: null, answer_operation_id: null, delivery_receipt: null };
  metadata.mockImplementation(async () => ({ data: structuredClone(question), etag: '"question:1"' }));
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(createElement(DecisionNotification)));
  return question;
}

it('opens globally, minimizes without submitting, and preserves the draft when reopened after navigation', async () => {
  await show();
  const dialog = document.querySelector('dialog')!;
  expect(dialog.open).toBe(true);
  expect(dialog.textContent).toContain('Issue #24');
  const input = dialog.querySelector('textarea')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(input, 'Migrar o executor'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => (dialog.querySelector('[aria-label="Minimizar decisão"]') as HTMLButtonElement).click());
  expect(dialog.open).toBe(false);
  const fab = document.querySelector<HTMLButtonElement>('.decision-fab')!;
  expect(fab.textContent).toContain('Decisão pendente');
  await act(async () => { window.dispatchEvent(new CustomEvent('factory-controller-resync')); });
  expect(dialog.open).toBe(false);
  window.location.hash = '#principal/projetos';
  await act(async () => fab.click());
  expect(dialog.open).toBe(true);
  expect(dialog.querySelector('textarea')!.value).toBe('Migrar o executor');
  expect(metadata.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  expect(request.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  await act(async () => { dialog.dispatchEvent(new Event('cancel', { cancelable: true })); });
  expect(dialog.open).toBe(false);
});

it('removes the floating notification after a delivered response without hiding its receipt while open', async () => {
  const question = await show();
  question.state = 'delivered';
  question.answer = 'Manter executor';
  question.delivery_receipt = { operation_id: id, question_id: id, passage_id: id, received_at_ms: 2 };
  await act(async () => (document.querySelector('.decision-refresh') as HTMLButtonElement).click());
  expect(document.querySelector('dialog')!.open).toBe(true);
  expect(document.body.textContent).toContain('A resposta foi entregue à passagem original');
  await act(async () => (document.querySelector('[aria-label="Minimizar decisão"]') as HTMLButtonElement).click());
  expect(document.querySelector('.decision-fab')).toBeNull();
});

it('does not turn a technical suspension without a pending question into a decision', async () => {
  await show(false);
  expect(document.querySelector('dialog')).toBeNull();
  expect(document.querySelector('.decision-fab')).toBeNull();
  expect(metadata).not.toHaveBeenCalled();
});
