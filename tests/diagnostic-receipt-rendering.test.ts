import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { HttpDiagnosticsView } from '#contracts';
import { RecordsPanel } from '../apps/web/src/features/records/RecordsPanel.js';

vi.mock('../apps/web/src/features/records/useRecords.js', () => ({
  useRecords: () => ({ page: null, loading: false, pageIndex: 0 }),
}));

vi.mock('../apps/web/src/features/records/useDiagnostics.js', () => ({
  useDiagnostics: () => ({
    supportedChecks: [],
    view: {
      context: { scope: 'host' }, supported_checks: [], diagnostics: [], event_cursor: '99',
      reports: [{
        operation_id: '00000000-0000-4000-8000-000000000001', state: 'succeeded',
        created_at_ms: 1, completed_at_ms: 2, checks: ['configuration'], diagnostics: [],
        receipt: { revision: 1, event_cursor: '37' },
      }],
    } satisfies HttpDiagnosticsView,
  }),
}));

describe('diagnostic receipt rendering', () => {
  it('shows completion while keeping receipt and operation diagnostics private', () => {
    const html = renderToStaticMarkup(createElement(RecordsPanel, {
      filters: { projectId: '', attemptId: '', operationId: '' }, onFilterChange: () => {},
    }));
    expect(html).toContain('Concluída');
    expect(html).not.toContain('00000000-0000-4000-8000-000000000001');
    expect(html).not.toContain('Revisão do recibo');
    expect(html).not.toContain('Cursor do recibo');
  });
});
