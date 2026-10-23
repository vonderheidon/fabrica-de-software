import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { HttpContextDiagnostic, HttpDiagnosticReport } from '#contracts';
import { CurrentDiagnosticNotices, DiagnosticHistory } from '../apps/web/src/features/records/DiagnosticNotices.js';

const item: HttpContextDiagnostic = { code: 'PROJECTS_ROOT_REQUIRED', check: 'configuration', state: 'blocked', cause: 'Pasta ausente.', recovery: 'Escolha a pasta.', affected_requirements: ['RF-88'], facts: { project_id: 'project-a' }, observed_at_ms: 1 };
const report = (operationId: string, at: number): HttpDiagnosticReport => ({ operation_id: operationId, state: 'succeeded', created_at_ms: at, completed_at_ms: at + 1, checks: ['configuration'], diagnostics: [item, item], receipt: { revision: 1, event_cursor: '1' } });
it('renders one current detailed notice for equivalent conditions', () => {
  const html = renderToStaticMarkup(createElement(CurrentDiagnosticNotices, { items: [item, { ...item, observed_at_ms: 2 }], previous: false, projectId: null }));
  expect(html.match(/class="diagnostic-record"/g)).toHaveLength(1);
  expect(html).not.toContain(item.code);
  expect(html).not.toContain('project-a');
});
it('keeps different resources and independent causes with similar wording separate', () => {
  const html = renderToStaticMarkup(createElement(CurrentDiagnosticNotices, { items: [item, { ...item, facts: { project_id: 'project-b' } }, { ...item, code: 'PROFILES_REQUIRED' }], previous: false, projectId: null }));
  expect(html.match(/class="diagnostic-record"/g)).toHaveLength(3);
});
it('summarizes equivalent historical occurrences with previous labels, dates and states', () => {
  const html = renderToStaticMarkup(createElement(DiagnosticHistory, { reports: [report('operation-a', 1), report('operation-b', 100000)] }));
  expect(html.match(/<details/g)).toHaveLength(1);
  expect(html).toContain('2 ocorrências');
  expect(html).toContain('Observação anterior');
  expect(html).toContain('Impedida');
  expect(html).toContain('Concluída');
  expect(html.match(/<time/g)).toHaveLength(5);
  expect(html).not.toContain('diagnostic-record');
  expect(html).not.toContain('operation-a');
});
it('removes a corrected blocker from the current notices while retaining its previous report', () => {
  const current = renderToStaticMarkup(createElement(CurrentDiagnosticNotices, { items: [], previous: false, projectId: null }));
  const history = renderToStaticMarkup(createElement(DiagnosticHistory, { reports: [report('operation-a', 1)] }));
  expect(current).toBe('');
  expect(history).toContain('Observação anterior');
  expect(history).toContain('Impedida');
});

it('consolidates equivalent current conditions without hiding a reported restriction', () => {
  const html = renderToStaticMarkup(createElement(CurrentDiagnosticNotices, {
    items: [item, { ...item, state: 'passed' }, { ...item, state: 'unavailable' }], previous: false, projectId: null,
  }));
  expect(html.match(/class="diagnostic-record"/g)).toHaveLength(1);
  expect(html).toContain('Impedida');
  expect(html).not.toContain('Confirmada');
});

it('keeps different checks, accounts and next actions distinguishable', () => {
  const html = renderToStaticMarkup(createElement(CurrentDiagnosticNotices, {
    items: [item, { ...item, check: 'resources' }, { ...item, facts: { ...item.facts, expected_account_id: 'other-account' } },
      { ...item, recovery: 'Confirme novamente a pasta.' }], previous: false, projectId: null,
  }));
  expect(html.match(/class="diagnostic-record"/g)).toHaveLength(4);
  expect(html).not.toContain('other-account');
});

it('does not turn an incomplete observation into readiness or expose its technical facts', () => {
  const html = renderToStaticMarkup(createElement(CurrentDiagnosticNotices, {
    items: [{ ...item, state: 'unavailable', code: 'CONTEXT_UNAVAILABLE', facts: { resource_count: 7 } }], previous: true, projectId: null,
  }));
  expect(html).toContain('anterior');
  expect(html).toContain('Indisponível');
  expect(html).not.toContain('CONTEXT_UNAVAILABLE');
  expect(html).not.toContain('resource_count');
  expect(html).not.toContain('Pronto');
});
