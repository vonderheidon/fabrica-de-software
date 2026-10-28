// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { HttpAttemptDetail, HttpDeliveryDetail } from '#contracts';
import { AttemptDetailDialog } from './AttemptDetailDialog.js';
import { diagnosticCopyFor } from '../../app/operator-language.js';

const { request, metadata } = vi.hoisted(() => ({ request: vi.fn(), metadata: vi.fn() }));
vi.mock('../../api/http.js', async (original) => ({ ...await original<typeof import('../../api/http.js')>(), requestJson: request, requestJsonWithMetadata: metadata }));
const id = '00000000-0000-4000-8000-000000000001';
const a = '00000000-0000-4000-8000-000000000002';
const b = '00000000-0000-4000-8000-000000000003';
const stage: HttpAttemptDetail['stage_activity'] = { stage: 'verifying', started_at_ms: null, elapsed_ms: null, last_activity_at_ms: null, observed_at_ms: 1, deadline_at_ms: null, remaining_ms: null, tracking_state: 'tracked', availability: 'unavailable', reason: 'Sem eventos suficientes.' };
const unavailable = { available: false, reason: 'Autoridade revogada' };
const publication: HttpAttemptDetail['publication'] = { mode: 'icr', review_state: null, local_state: 'pending', confirmed_effects: 0, pending_effects: 0, unknown_effects: 0, complete_capability: unavailable, reconcile_capability: unavailable };
const measurements: HttpAttemptDetail['measurements'] = { stage_activity: stage, active_time: { state: 'measured', value: 0, unit: 'ms' }, human_wait: { state: 'measured', value: 0, unit: 'ms' }, cost: { state: 'measured', value: 0, unit: 'USD' }, active_limit: { state: 'not_configured' }, question_ttl: { state: 'not_configured' }, active_limit_state: 'unavailable', active_expired_at_ms: null, passages: [], pending_requirements: [] };
const attempt = (deliveryId: string): HttpAttemptDetail => ({ stage_activity: stage, delivery_summary: null, block: null, v3_details: null, publication_target: null, publication_target_hash: null, id, project_id: id, operation_id: id, passage_id: id, result_receipt_id: null, event_cursor: '1', phase: 'verifying', result: null, suspension: 'HUMAN_DECISION', tracking: 'tracked', round: 2, revision: 1, delivery_id: deliveryId, pending_question_id: null, expected_account_id: 'account', issue: { id: 'issue', number: 1, title: 'Teste de versões', url: 'https://github.com/test/test/issues/1' }, selected_delivery_id: deliveryId, selected_round: deliveryId === a ? 1 : 2, publication, measurements, cleanup: 'uncertain', authority: { reason: 'ACCOUNT_CHANGED', recovery: 'Corrija a conta na Configuração.', observed_at_ms: 1, expected_status_id: null, observed_status_id: null }, diagnostic: 'ACCOUNT_CHANGED', capabilities: { cancel: unavailable, complete_publication: unavailable, reconcile_publication: unavailable, revalidate: unavailable }, details: null });
const delivery = (deliveryId: string): HttpDeliveryDetail => ({ delivery_summary: { attempt_id: id, delivery_id: deliveryId, original_mode: 'icr', authorized_mode: 'icr', review_state: null, outcome: 'pending', content_identity: null, approved_ref: null, code_location: null, local_repository: null, branch_ref: null, commit_sha: null, pull_request_url: null, checkout_updated: false, pending_effects: [], limitations: [], criteria_satisfied: 0, criteria_total: 0, resolved_findings: 0, details_url: `/api/v1/deliveries/${deliveryId}` }, delivery: { id: deliveryId, attempt_id: id, producer_passage_id: id, round: deliveryId === a ? 1 : 2, base_sha: 'a'.repeat(40), capture_state: 'captured', git_ref: `refs/factory/deliveries/${deliveryId}`, repository_relative: `git/${id}.git`, content_identity: (deliveryId === a ? 'a' : 'b').repeat(40), commit_sha: 'c'.repeat(40), has_delta: true, diagnostic: null, captured_at_ms: 1, revision: 1, warnings: [] }, event_cursor: '1', issue: attempt(deliveryId).issue, attempt: attempt(deliveryId), measurements, cleanup: 'uncertain', authorizations: { captured_mode: 'icr', authorized_mode: 'icr', requires_current_gate: true }, review: null, publication, capabilities: { diff: { available: true }, complete_publication: unavailable, reconcile_publication: unavailable }, details: null });
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
    if (path.endsWith('/producer-result')) {
      const deliveryId = selected;
      return { binding: { attempt_id: id, passage_id: deliveryId, role: 'implementer', round: deliveryId === a ? 1 : 2, delivery_version: deliveryId },
        result: { format_version: 1, summary: 'Result', writes_stopped: true, criteria: [], checks: [{ id: `npm.cmd run typecheck ${deliveryId === a ? 'A' : 'B'}`, outcome: 'passed', evidence: `TypeScript evidence ${deliveryId === a ? 'A' : 'B'}` }], additional_changes_justification: null }, sha256: 'a'.repeat(64), receipt_id: id };
    }
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
    if (section === 'passages') data.details!.items = [{ id: deliveryId, attempt_id: id, delivery_id: deliveryId, round: deliveryId === a ? 1 : 2, role: 'implementer', state: 'ready', tracking: 'tracked', diagnostic: null, result_receipt_id: id, created_at_ms: 1 }] as NonNullable<HttpAttemptDetail['details']>['items'];
    return { data, etag: '"1"' };
  });
  await show();
}
function button(label: string) { const node = [...container.querySelectorAll('button')].find((node) => node.textContent === label); if (!node) throw new Error(`Missing ${label}`); return node; }
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; document.body.replaceChildren(); vi.clearAllMocks(); calls.length = 0; vi.unstubAllGlobals(); });

it('keeps publication completion separate from uncertain effects', async () => {
  await mount();
  const previous = metadata.getMockImplementation()!;
  let unknown = 0;
  metadata.mockImplementation((path: string) => {
    if (path.includes('/deliveries/')) {
      const data = delivery(path.includes(b) ? b : a);
      data.publication = { ...data.publication, local_state: 'completed', review_state: 'approved', unknown_effects: unknown };
      data.delivery_summary = { ...data.delivery_summary,outcome:unknown ? 'partial' : 'complete',limitations:unknown ? ['Há efeitos sem confirmação; consulte a publicação.'] : [] };
      return Promise.resolve({ data, etag: '"1"' });
    }
    return previous(path);
  });
  await show(b);
  expect(container.querySelector('#publication-panel-title')?.textContent).toBe('Entrega concluída');
  expect(container.textContent).not.toContain('A reconciliação não está disponível');
  const receipts = [...container.querySelectorAll('details')].find(node => node.querySelector('summary')?.textContent === 'Detalhes da publicação e recibos');
  expect(receipts).toBeUndefined();
  unknown = 1;
  await show(a);
  expect(container.querySelector('#publication-panel-title')?.textContent).toBe('Entrega parcial');
  expect(container.querySelector('.delivery-limitations')).toBeNull();
  expect(container.querySelector('.delivery-pending')).toBeNull();
  expect(container.textContent).not.toContain('Código no ambiente da tentativa');
});

it('omits empty destination and correction panels and hides revalidation during normal execution', async () => {
  await mount();
  const previous = metadata.getMockImplementation()!;
  metadata.mockImplementation(async (path: string, init?: RequestInit) => {
    const value = await previous(path, init);
    if (path.startsWith(`/api/v1/attempts/${id}`) && !path.includes('section=')) {
      value.data.suspension = null;
      value.data.diagnostic = null;
      value.data.authority = null;
      value.data.tracking = 'tracked';
      value.data.capabilities.revalidate = { available: true };
      value.data.history_sections = [];
    }
    return value;
  });
  await act(async () => button('Atualizar tentativa').click());
  expect(container.textContent).not.toContain('Destino da versão aprovada');
  expect(container.textContent).not.toContain('Ciclo de correção e decisões');
  expect(container.textContent).not.toContain('Revalidar tentativa');
});

it('revalidates authority and resources explicitly with the current revision', async () => {
  await mount();
  const previous = metadata.getMockImplementation()!;
  metadata.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === 'POST') return { data: { operation_id: new Headers(init.headers).get('Idempotency-Key') }, etag: null };
    const value = await previous(path);
    if (path.startsWith(`/api/v1/attempts/${id}`) && !path.includes('section=')) value.data.capabilities.revalidate = { available: true };
    return value;
  });
  await act(async () => button('Atualizar tentativa').click());
  expect(metadata.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  await act(async () => button('Revalidar tentativa').click());
  const post = metadata.mock.calls.find(([, init]) => init?.method === 'POST');
  expect(post?.[0]).toBe(`/api/v1/attempts/${id}/revalidate`);
  expect(new Headers(post?.[1].headers).get('If-Match')).toBe('"1"');
  expect(JSON.parse(post?.[1].body)).toEqual({});
});

it('opens with no effects, consolidates authority and preserves separate suspension/resources', async () => {
  await mount();
  expect(calls.every((call) => call.method === 'GET')).toBe(true);
  expect(container.textContent).toContain('Suspensão');
  expect(container.textContent).toContain('não comprova parada física');
  const authorityTitle = diagnosticCopyFor('ACCOUNT_CHANGED', 'blocked', 'ACCOUNT_CHANGED', '').title;
  expect(container.textContent!.split(authorityTitle)).toHaveLength(2);
  expect([...container.querySelectorAll('button')].filter((node) => node.textContent === 'Verificar situação')).toHaveLength(1);
  expect(button('Solicitar cancelamento').disabled).toBe(true);
  expect([...container.querySelectorAll('button')].some((node) => node.textContent === 'Concluir modo autorizado')).toBe(false);
  await act(async () => button('Verificar situação').click());
  const post = request.mock.calls.find(([, init]) => init?.method === 'POST');
  expect(post?.[0]).toBe(`/api/v1/diagnostics?scope=attempt&id=${id}`);
  expect(JSON.parse(post?.[1].body)).toEqual({ checks: ['resources'] });
});

it('discards a late diff and displays producer validation only for the selected version', async () => {
  await mount();
  const diff = deferred<{ data: { delivery_id: string; entries: { path: string; patch: string }[]; has_more: boolean; next_cursor: null } }>();
  const previous = metadata.getMockImplementation()!;
  metadata.mockImplementation((path: string) => path.includes('/diff') ? diff.promise : previous(path));
  await act(async () => { button('Carregar diff').click(); });
  await show(b);
  expect(container.textContent).not.toContain('TypeScript evidence A');
  expect(container.textContent).toContain('TypeScript evidence B');
  await act(async () => { diff.resolve({ data: { delivery_id: a, entries: [{ path: 'antigo.txt', patch: 'DIFF ANTIGO A' }], has_more: false, next_cursor: null } }); });
  expect(container.textContent).not.toContain('DIFF ANTIGO A');
  expect(calls.some(({ path }) => path.includes('/artifacts/'))).toBe(false);
});

it('keeps the selected passage and producer result after an inverted section response', async () => {
  await mount();
  const late = deferred<{ data: HttpAttemptDetail; etag: string }>();
  const previous = metadata.getMockImplementation()!;
  metadata.mockImplementation((path: string) => path.includes(`delivery_id=${a}`) && path.includes('section=passages') ? late.promise : previous(path));
  const refresh = button('Atualizar tentativa'); refresh.focus();
  await act(async () => refresh.click());
  expect(document.activeElement).toBe(refresh);
  await show(b);
  const old = attempt(a); old.details = { section: 'passages', items: [{ id: a, attempt_id: id, delivery_id: a, round: 1, role: 'implementer', state: 'ready', tracking: 'tracked', diagnostic: null, result_receipt_id: id, created_at_ms: 1 }] as NonNullable<HttpAttemptDetail['details']>['items'], next_cursor: null, has_more: false, event_cursor: '1' };
  await act(async () => late.resolve({ data: old, etag: '"old"' }));
  expect(container.textContent).not.toContain('TypeScript evidence A');
  expect(container.textContent).toContain('TypeScript evidence B');
});
