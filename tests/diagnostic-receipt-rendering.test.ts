import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { HttpDiagnosticsView } from '#contracts';
import { GlobalConditions, useGlobalDiagnostics } from '../apps/web/src/features/projects/GlobalReadiness.js';

vi.mock('../apps/web/src/features/records/useDiagnostics.js', () => ({
  useDiagnostics: () => ({
    supportedChecks: [],
    view: {
      context: { scope: 'host' }, supported_checks: [], diagnostics: [], event_cursor: '99',
      reports: [{
        operation_id: '00000000-0000-4000-8000-000000000001', state: 'succeeded',
        created_at_ms: 1, completed_at_ms: 2, checks: ['configuration'], diagnostics: [{ check: 'configuration', code: 'PROJECTS_ROOT_REQUIRED', state: 'blocked', cause: 'Pasta necessária.', recovery: 'Confirme a pasta.', facts: {}, affected_requirements: [], observed_at_ms: 1 }],
        receipt: { revision: 1, event_cursor: '37' },
      }],
    } satisfies HttpDiagnosticsView,
  }),
}));

describe('diagnostic receipt rendering', () => {
  it('keeps historical reports out of the configuration conditions', () => {
    function Owner() { return createElement(GlobalConditions, { diagnostic: useGlobalDiagnostics(true), section: 'folder' }); }
    const html = renderToStaticMarkup(createElement(Owner));
    expect(html).not.toContain('Concluída');
    expect(html).not.toContain('Observação anterior');
    expect(html).not.toContain('Pasta necessária.');
    expect(html).not.toContain('00000000-0000-4000-8000-000000000001');
    expect(html).not.toContain('Revisão do recibo');
    expect(html).not.toContain('Cursor do recibo');
  });
});
