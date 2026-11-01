// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProjectPage } from '#contracts';
import { useProjects } from './useProjects.js';
import { RecordsPanel } from '../records/RecordsPanel.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../api/http.js', async original => ({ ...await original<typeof import('../../api/http.js')>(), requestJson: request }));
vi.mock('./ProjectPicker.js', () => ({ ProjectPicker: () => null }));
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
const projects = { items: [{ id: 'project', name: 'Portal', deletion: null }], next_cursor: null, has_more: false, event_cursor: '1' } as ProjectPage;
function Catalog({ search = '' }: { search?: string }) {
  const load = useProjects(search);
  return createElement('div', null, load.page?.items.map(project => createElement('p', { key: project.id }, project.name)), load.error?.message);
}
beforeEach(() => {
  request.mockReset(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it('keeps the project catalog mounted during refresh and after a failed refresh', async () => {
  let reject!: (error: Error) => void;
  request.mockResolvedValueOnce(projects).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  await act(async () => root.render(createElement(Catalog)));
  const row = host.querySelector('p');
  await act(async () => window.dispatchEvent(new CustomEvent('factory-controller-event', { detail: { event_type: 'project.updated' } })));
  expect(host.querySelector('p')).toBe(row);
  await act(async () => reject(new Error('offline')));
  expect(host.querySelector('p')).toBe(row);
  expect(host.textContent).toContain('Não foi possível consultar');
});

it('clears another search and discards its late response', async () => {
  let resolve!: (value: ProjectPage) => void;
  request.mockResolvedValueOnce(projects).mockImplementationOnce(() => new Promise(done => { resolve = done; }))
    .mockResolvedValueOnce({ ...projects, items: [{ ...projects.items[0]!, name: 'Atual' }] });
  await act(async () => root.render(createElement(Catalog)));
  await act(async () => root.render(createElement(Catalog, { search: 'pendente' })));
  expect(host.textContent).not.toContain('Portal');
  await act(async () => root.render(createElement(Catalog, { search: 'atual' })));
  await act(async () => resolve(projects));
  expect(host.textContent).toContain('Atual');
  expect(host.textContent).not.toContain('Portal');
});

it('keeps records mounted without a transient stale message during event refresh', async () => {
  let resolve!: (value: unknown) => void;
  const page = { items: [{ seq: '1', entity_type: 'settings', entity_id: 'local', entity_revision: 1,
    occurred_at_ms: 1, operation_id: null, event_type: 'settings.saved', facts: {} }], next_cursor: null, has_more: false, event_cursor: '1' };
  request.mockResolvedValueOnce(page).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await act(async () => root.render(createElement(RecordsPanel, { filters: { projectId: '', attemptId: '', operationId: '' }, onFilterChange: vi.fn() })));
  const list = host.querySelector('.records-event-list');
  await act(async () => window.dispatchEvent(new CustomEvent('factory-controller-event')));
  expect(host.querySelector('.records-event-list')).toBe(list);
  expect(host.querySelector('.stale-note')).toBeNull();
  await act(async () => resolve(page));
});
