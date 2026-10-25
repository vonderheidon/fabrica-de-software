// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AttemptListPanel } from './AttemptListPanel.js';
import { AttemptComparisonDialog } from './AttemptComparisonDialog.js';
import type { HttpAttemptPage, HttpAttemptComparison } from '#contracts';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../api/http.js', async original => ({ ...await original<typeof import('../../api/http.js')>(), requestJsonWithMetadata: request }));
vi.mock('../projects/ProjectPicker.js', () => ({ ProjectPicker: () => null }));
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
const row = (id: string) => ({ id, project_id: 'project', issue_id: 'issue', issue_number: 42, issue_title: 'Histórica', phase: 'finished', result: 'failed', suspension: null, revision: 1, created_at_ms: 1, updated_at_ms: 1 });
const page = (id = 'left', more = false) => ({ items: [row(id)], has_more: more, next_cursor: more ? 'next' : null, event_cursor: '1' }) as HttpAttemptPage;
const props = { projectId: '', result: '', issueNumber: '', issueTitle: '', dateFrom: '', dateTo: '', timeZone: 'America/Sao_Paulo', onFilterChange: vi.fn(), onSearchChange: vi.fn(), onPrepareRetry: vi.fn(), onDetail: vi.fn(), onPageChange: vi.fn() };
async function render(extra = {}) { await act(async () => root.render(createElement(AttemptListPanel, { ...props, ...extra }))); }
function button(text: string) { const found = [...host.querySelectorAll('button')].find(node => node.textContent === text); if (!found) throw new Error(text); return found; }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it('queries the server with independent fields and restores a page from navigation', async () => {
  request.mockResolvedValue({ data: page() });
  await render({ issueNumber: '42', issueTitle: '123', dateFrom: '2026-10-01', cursors: '["next"]' });
  const query = new URL(request.mock.calls[0]![0] as string, 'http://local').searchParams;
  expect(query.get('issue_number')).toBe('42'); expect(query.get('issue_title')).toBe('123');
  expect(query.get('cursor')).toBe('next'); expect(query.get('time_zone')).toBe('America/Sao_Paulo');
});
it('keeps prior data explicitly identified after a failed refresh and resets pagination', async () => {
  request.mockResolvedValueOnce({ data: page() }).mockRejectedValueOnce(new Error('offline'));
  await render({ cursors: '["next"]' });
  await act(async () => button('Atualizar').click());
  expect(props.onPageChange).toHaveBeenCalledWith('');
  expect(host.textContent).toContain('Dados da consulta anterior'); expect(host.textContent).toContain('Histórica');
});
it('discards a late response from another search', async () => {
  let resolve!: (value: unknown) => void;
  request.mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValueOnce({ data: page('current') });
  await render({ issueNumber: '1' }); await render({ issueNumber: '2' });
  await act(async () => resolve({ data: page('late') }));
  expect(host.querySelector('[data-attempt-trigger="current"]')).not.toBeNull();
  expect(host.querySelector('[data-attempt-trigger="late"]')).toBeNull();
});
it('associates inverted dates with fields and preserves the input', async () => {
  request.mockResolvedValue({ data: page() });
  await render({ dateFrom: '2026-10-24', dateTo: '2026-10-01' });
  expect(host.querySelector('#attempt-date-from-filter')?.getAttribute('aria-describedby')).toBe('attempt-range-error');
  expect((button('Buscar') as HTMLButtonElement).disabled).toBe(true);
  expect((host.querySelector('#attempt-date-from-filter') as HTMLInputElement).value).toBe('2026-10-24');
});
it('keeps a selection across pages and only loads comparison on open', async () => {
  request.mockImplementation((path: string) => path.includes('attempt-comparisons') ? new Promise(() => {}) : Promise.resolve({ data: path.includes('cursor=') ? page('right') : page('left', true) }));
  await render(); await act(async () => button('Selecionar para comparar').click());
  await act(async () => button('Próxima').click());
  await act(async () => button('Selecionar para comparar').click());
  expect(request.mock.calls.some(([path]) => String(path).includes('attempt-comparisons'))).toBe(false);
  await act(async () => button('Comparar tentativas').click());
  expect(request.mock.calls.some(([path]) => String(path).includes('left_attempt_id=left&right_attempt_id=right'))).toBe(true);
});
it('shows historical identities, explicit absences and safe text', async () => {
  const side = { attempt_id: 'left', started_at_ms: 1, result: 'failed', failure_reason: null, round: 2, delivery_id: 'delivery', content_identity: 'a'.repeat(40), project_revision_id: 'historical-project', preparation_revision: 3, configuration_state: 'available', details_url: '/api/v1/attempts/left' };
  const data = { project_id: 'project', repository_id: 'repo', issue_id: 'issue', issue_number: 42, left: side, right: { ...side, attempt_id: 'right' }, differences: [{ field: 'project_guidance', left: { state: 'available', value: '<script>old</script>', reason: null }, right: { state: 'unavailable', value: null, reason: 'Sem captura.' } }], limitations: [] } as HttpAttemptComparison;
  request.mockResolvedValue({ data });
  await act(async () => root.render(createElement(AttemptComparisonDialog, { leftId: 'left', rightId: 'right', onClose: vi.fn() })));
  expect(host.textContent).toContain('historical-project'); expect(host.textContent).toContain('Sem captura.');
  expect(host.textContent).toContain('Diferenças não demonstram a causa'); expect(host.querySelector('script')).toBeNull();
});

it('discards a comparison response after changing the pair', async () => {
  let resolve!: (value: unknown) => void;
  request.mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockRejectedValueOnce(new Error('offline'));
  await act(async () => root.render(createElement(AttemptComparisonDialog, { leftId: 'left', rightId: 'right', onClose: vi.fn() })));
  await act(async () => root.render(createElement(AttemptComparisonDialog, { leftId: 'other', rightId: 'right', onClose: vi.fn() })));
  await act(async () => resolve({ data: { left: {}, right: {}, differences: [], limitations: [] } }));
  expect(host.textContent).toContain('Não foi possível consultar a comparação');
  expect(host.textContent).not.toContain('Diferenças históricas');
});
