// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AttemptListPanel } from './AttemptListPanel.js';
import type { HttpAttemptPage } from '#contracts';

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
async function setInputValue(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Input value setter unavailable.');
  setter.call(input, value);
  await act(async () => { input.dispatchEvent(new Event('input', { bubbles: true })); });
}
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
it('keeps applied filters while moving back and separates them from the search draft', async () => {
  request.mockResolvedValueOnce({ data: page('first', true) })
    .mockResolvedValueOnce({ data: page('second') })
    .mockResolvedValueOnce({ data: page('first', true) })
    .mockResolvedValue({ data: page('first', true) });
  await render({ issueTitle: 'Aplicado' });
  const title = host.querySelector<HTMLInputElement>('#attempt-issue-title-filter')!;
  await setInputValue(title, 'Rascunho');
  await act(async () => button('Próxima').click());
  const next = new URL(request.mock.calls[1]![0] as string, 'http://local').searchParams;
  expect(next.get('issue_title')).toBe('Aplicado');
  expect(next.get('cursor')).toBe('next');
  expect(props.onPageChange).toHaveBeenLastCalledWith('["next"]');

  await act(async () => button('Anterior').click());
  const previous = new URL(request.mock.calls[2]![0] as string, 'http://local').searchParams;
  expect(previous.get('issue_title')).toBe('Aplicado');
  expect(previous.has('cursor')).toBe(false);
  expect(title.value).toBe('Rascunho');
  expect(props.onPageChange).toHaveBeenLastCalledWith('');

  await act(async () => button('Buscar').click());
  expect(props.onSearchChange).toHaveBeenLastCalledWith(expect.objectContaining({ issueTitle: 'Rascunho' }));
  expect(props.onPageChange).toHaveBeenLastCalledWith('');
  await act(async () => button('Limpar busca').click());
  expect(props.onSearchChange).toHaveBeenLastCalledWith({ issueNumber: '', issueTitle: '', dateFrom: '', dateTo: '', timeZone: 'America/Sao_Paulo' });
  expect(props.onPageChange).toHaveBeenLastCalledWith('');
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
it('keeps individual detail and retry actions without pair selection controls', async () => {
  request.mockResolvedValue({ data: page('retry') });
  await render();
  const buttonNames = [...host.querySelectorAll('button')].map(node => node.textContent?.trim());
  expect(buttonNames).not.toContain('Selecionar para comparar');
  expect(buttonNames).not.toContain('Comparar tentativas');
  await act(async () => button('Consultar').click());
  expect(props.onDetail).toHaveBeenCalledWith('retry', 'project');
  await act(async () => button('Nova tentativa').click());
  expect(props.onPrepareRetry).toHaveBeenCalledWith('retry', 'project');
});
