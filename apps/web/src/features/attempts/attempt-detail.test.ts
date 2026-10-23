// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { HttpAttemptDetail, HttpDeliveryDetail } from '#contracts';
import { AttemptDetailDialog } from './AttemptDetailDialog.js';
import { diagnosticCopyFor } from '../../app/operator-language.js';

const { request, metadata, text } = vi.hoisted(() => ({ request: vi.fn(), metadata: vi.fn(), text: vi.fn() }));
vi.mock('../../api/http.js', async (original) => ({ ...await original<typeof import('../../api/http.js')>(), requestJson: request, requestJsonWithMetadata: metadata, requestText: text }));
const id = '00000000-0000-4000-8000-000000000001';
const a = '00000000-0000-4000-8000-000000000002';
const b = '00000000-0000-4000-8000-000000000003';
const unavailable = { available: false, reason: 'Autoridade revogada' };
const publication: HttpAttemptDetail['publication'] = { mode: 'icr', review_state: null, local_state: 'pending', confirmed_effects: 0, pending_effects: 0, unknown_effects: 0, complete_capability: unavailable, reconcile_capability: unavailable };
const measurements: HttpAttemptDetail['measurements'] = { active_time: { state: 'measured', value: 0, unit: 'ms' }, human_wait: { state: 'measured', value: 0, unit: 'ms' }, cost: { state: 'measured', value: 0, unit: 'USD' }, active_limit: { state: 'not_configured' }, question_ttl: { state: 'not_configured' }, active_limit_state: 'unavailable', active_expired_at_ms: null, passages: [], pending_requirements: [] };
const attempt = (deliveryId: string): HttpAttemptDetail => ({ id, project_id: id, operation_id: id, passage_id: id, result_receipt_id: null, event_cursor: '1', phase: 'verifying', result: null, suspension: 'HUMAN_DECISION', tracking: 'tracked', round: 2, revision: 1, delivery_id: deliveryId, pending_question_id: null, expected_account_id: 'account', issue: { id: 'issue', number: 1, title: 'Teste de versões', url: 'https://github.com/test/test/issues/1' }, selected_delivery_id: deliveryId, selected_round: deliveryId === a ? 1 : 2, publication, measurements, cleanup: 'uncertain', authority: { reason: 'ACCOUNT_CHANGED', recovery: 'Corrija a conta na Configuração.', observed_at_ms: 1, expected_status_id: null, observed_status_id: null }, diagnostic: 'ACCOUNT_CHANGED', capabilities: { cancel: unavailable, complete_publication: unavailable, reconcile_publication: unavailable, revalidate: unavailable }, details: null });
const delivery = (deliveryId: string): HttpDeliveryDetail => ({ delivery: { id: deliveryId, attempt_id: id, producer_passage_id: id, round: deliveryId === a ? 1 : 2, base_sha: 'a'.repeat(40), capture_state: 'captured', git_ref: `refs/factory/deliveries/${deliveryId}`, repository_relative: `git/${id}.git`, content_identity: (deliveryId === a ? 'a' : 'b').repeat(40), commit_sha: 'c'.repeat(40), has_delta: true, diagnostic: null, captured_at_ms: 1, revision: 1, warnings: [] }, verification: null, event_cursor: '1', issue: attempt(deliveryId).issue, attempt: attempt(deliveryId), measurements, cleanup: 'uncertain', authorizations: { captured_mode: 'icr', authorized_mode: 'icr', requires_current_gate: true }, review: null, publication, capabilities: { diff: { available: true }, complete_publication: unavailable, reconcile_publication: unavailable }, details: null });
let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement;
let selected = a;
const calls: { path: string; method: string }[] = [];
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
async function show(deliveryId = a) {
  selected = deliveryId;
  await act(async () => root!.render(createElement(AttemptDetailDialog, { attemptId: id, selectedRound: deliveryId === a ? '1' : '2', selectedDeliveryId: deliveryId, onSelectionChange: () => {}, onRetry: () => {} })));
}
async function mount() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  request.mockImplementation(async (path: string, init?: RequestInit) => {
    calls.push({ path, method: init?.method ?? 'GET' });
    if (path.endsWith('/settings')) return { settings: { installation_id: 'attempt-test', account_id: 'account', revision: 1 }, profiles: [] };
    if (path.includes('/diagnostics')) return { context: { scope: 'attempt', id }, supported_checks: ['resources'], diagnostics: [{ check: 'resources', code: 'RESOURCES_RECORDED', state: 'passed', cause: 'Recursos registrados.', recovery: 'Consulte as capacidades atuais.', facts: {}, affected_requirements: [], observed_at_ms: 1 }], reports: [], event_cursor: '1' };
    if (path.endsWith('/resources')) return { entries: [], cleanup: 'uncertain' };
    if (path.endsWith('/producer-result')) return null;
    if (path.includes('/projects/')) return { deletion: null };
    return attempt(selected);
  });
  metadata.mockImplementation(async (path: string) => {
    calls.push({ path, method: 'GET' });
    const url = new URL(path, 'http://local');
    if (path.includes('/deliveries/')) return { data: delivery(path.includes(b) ? b : a), etag: '"1"' };
    const deliveryId = url.searchParams.get('delivery_id') ?? selected;
    const data = attempt(deliveryId);
    const section = url.searchParams.get('section');
    if (section) data.details = { section: section as NonNullable<HttpAttemptDetail['details']>['section'], items: [], has_more: false, next_cursor: null, event_cursor: '1' };
    if (section === 'checks') data.details!.items = [{ id: deliveryId, text: `Check da versão ${deliveryId === a ? 'A' : 'B'}`, artifacts: [{ id: deliveryId }] }] as unknown as NonNullable<HttpAttemptDetail['details']>['items'];
    return { data, etag: '"1"' };
  });
  await show();
}
function button(label: string) { const node = [...container.querySelectorAll('button')].find((node) => node.textContent === label); if (!node) throw new Error(`Missing ${label}`); return node; }
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; document.body.replaceChildren(); vi.clearAllMocks(); calls.length = 0; vi.unstubAllGlobals(); });

it('opens with no effects, consolidates authority and preserves separate suspension/resources', async () => {
  await mount();
  expect(calls.every((call) => call.method === 'GET')).toBe(true);
  expect(container.textContent).toContain('Suspensão');
  expect(container.textContent).toContain('não comprova parada física');
  const authorityTitle = diagnosticCopyFor('ACCOUNT_CHANGED', 'blocked', 'ACCOUNT_CHANGED', '').title;
  expect(container.textContent!.split(authorityTitle)).toHaveLength(2);
  expect([...container.querySelectorAll('button')].filter((node) => node.textContent === 'Verificar recursos')).toHaveLength(1);
  expect(button('Solicitar cancelamento').disabled).toBe(true);
  expect([...container.querySelectorAll('button')].some((node) => node.textContent === 'Concluir modo autorizado')).toBe(false);
  await act(async () => button('Verificar recursos').click());
  const post = request.mock.calls.find(([, init]) => init?.method === 'POST');
  expect(post?.[0]).toBe(`/api/v1/diagnostics?scope=attempt&id=${id}`);
  expect(JSON.parse(post?.[1].body)).toEqual({ checks: ['resources'] });
});

it('discards late diff and artifact success after selecting another round and delivery', async () => {
  await mount();
  const diff = deferred<{ data: { delivery_id: string; entries: { path: string; patch: string }[]; has_more: boolean; next_cursor: null } }>();
  const previous = metadata.getMockImplementation()!;
  metadata.mockImplementation((path: string) => path.includes('/diff') ? diff.promise : previous(path));
  const artifact = deferred<string>(); text.mockReturnValue(artifact.promise);
  await act(async () => { button('Carregar diff').click(); button('Abrir evidência').click(); });
  await show(b);
  expect(container.textContent).not.toContain('Check da versão A');
  expect(container.textContent).toContain('Check da versão B');
  await act(async () => { artifact.resolve('LOG ANTIGO A'); diff.resolve({ data: { delivery_id: a, entries: [{ path: 'antigo.txt', patch: 'DIFF ANTIGO A' }], has_more: false, next_cursor: null } }); });
  expect(container.textContent).not.toContain('LOG ANTIGO A');
  expect(container.textContent).not.toContain('DIFF ANTIGO A');
  expect(text).toHaveBeenCalledWith(`/api/v1/artifacts/${a}`);
});

it('keeps selected checks after an inverted section response and preserves focus on refresh', async () => {
  await mount();
  const late = deferred<{ data: HttpAttemptDetail; etag: string }>();
  const previous = metadata.getMockImplementation()!;
  metadata.mockImplementation((path: string) => path.includes(`delivery_id=${a}`) && path.includes('section=checks') ? late.promise : previous(path));
  const refresh = button('Atualizar tentativa'); refresh.focus();
  await act(async () => refresh.click());
  expect(document.activeElement).toBe(refresh);
  await show(b);
  const old = attempt(a); old.details = { section: 'checks', items: [{ text: 'CHECK ATRASADO A' }] as unknown as NonNullable<HttpAttemptDetail['details']>['items'], next_cursor: null, has_more: false, event_cursor: '1' };
  await act(async () => late.resolve({ data: old, etag: '"old"' }));
  expect(container.textContent).not.toContain('CHECK ATRASADO A');
  expect(container.textContent).toContain('Check da versão B');
});
