// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { HttpQuestion } from '#contracts';
import { QuestionDecisionCard } from './QuestionDecisionCard.js';

const { metadata, request } = vi.hoisted(() => ({ metadata: vi.fn(), request: vi.fn() }));
vi.mock('../../api/http.js', async original => ({ ...await original<typeof import('../../api/http.js')>(), requestJsonWithMetadata: metadata, requestJson: request }));
let root: ReturnType<typeof createRoot> | null = null;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; document.body.replaceChildren(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it('ends the attempt explicitly without requiring a text answer or continuing the passage', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const id = '00000000-0000-4000-8000-000000000001';
  const question: HttpQuestion = { id, attempt_id: id, passage_id: id, delivery_id: id,
    question: { format_version: 1, decision: 'Fonte ausente', context: 'Não há página para implementar.', alternatives: ['Fornecer a fonte', 'Encerrar'] },
    scope_change: null, state: 'pending', revision: 1, raised_at_ms: 1, answered_at_ms: null,
    ttl: { state: 'not_configured' }, expired_at_ms: null, answer: null, answer_operation_id: null, delivery_receipt: null };
  metadata.mockImplementation(async (_path: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const operationId = new Headers(init.headers).get('Idempotency-Key');
      question.state = 'cancelled'; question.answer_operation_id = operationId;
      return { data: { operation_id: operationId }, etag: null };
    }
    return { data: { ...question }, etag: '"question:1"' };
  });
  request.mockResolvedValue({ state: 'succeeded' });
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(createElement(QuestionDecisionCard, { attemptId: id, summary: { id, state: 'pending' } })));
  const end = [...container.querySelectorAll('button')].find(button => button.textContent === 'Encerrar tentativa')!;
  expect(end.disabled).toBe(false);
  await act(async () => end.click());
  const posts = metadata.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0]![1].body)).toEqual({ answer: 'Encerrar tentativa', action: 'end_attempt' });
  expect(new Headers(posts[0]![1].headers).get('If-Match')).toBe('"question:1"');
  expect(container.textContent).toContain('Novas etapas foram bloqueadas');
});
