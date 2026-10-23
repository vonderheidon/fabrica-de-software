// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { RecordsPanel } from './RecordsPanel.js';

it('reads history only and discards pagination on filter changes', async () => {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push(url);
    expect(init?.method ?? 'GET').toBe(url.endsWith('/session') ? 'POST' : 'GET');
    const body = url.endsWith('/session') ? { csrf_token: 'controlled', instance_id: 'history' } : url.includes('/projects')
      ? { items: [], next_cursor: null, has_more: false, event_cursor: '1' }
      : { items: [{ seq: '1', entity_type: 'settings', entity_id: 'local', entity_revision: 1, occurred_at_ms: 1,
        operation_id: null, event_type: 'diagnostic.completed', facts: {} }], next_cursor: 'next-history', has_more: true, event_cursor: '1' };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  const filters = { projectId: '', attemptId: '', operationId: '' };
  try {
    await act(async () => { root.render(createElement(RecordsPanel, { filters, onFilterChange: vi.fn() })); });
    expect(node.textContent).not.toMatch(/Verificar selecionados|Atualizar diagnóstico|O que verificar/);
    expect(node.querySelector('#diagnostic-scope')).toBeNull();
    const next = [...node.querySelectorAll('button')].find(button => button.textContent === 'Próxima página')!;
    await act(async () => { next.click(); });
    expect(calls.some(url => url.includes('cursor=next-history'))).toBe(true);
    const before = calls.length;
    await act(async () => root.render(createElement(RecordsPanel, { filters: { ...filters, operationId: 'original-operation' }, onFilterChange: vi.fn() })));
    const changed = calls.slice(before).filter(url => url.includes('/events?'));
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every(url => !url.includes('cursor='))).toBe(true);
    expect(calls.some(url => /diagnostics|operations\//.test(url))).toBe(false);
    expect(node.textContent).toContain('Página 1');
  } finally { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); }
});
