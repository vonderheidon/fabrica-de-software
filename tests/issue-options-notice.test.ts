import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { IssueOptions } from '#contracts';
import { IssueOptionsNotice } from '../apps/web/src/features/preparations/IssueOptionsNotice.js';

const diagnostic = <T extends string>(code: T) => ({ code, message: 'Internal diagnostic.', recovery: 'Internal recovery.' });
const options = (): IssueOptions => ({
  items: [], next_cursor: null, has_more: false, event_cursor: '0',
  completeness: 'unavailable', retry_at_ms: null,
  prerequisites: [diagnostic('ISSUE_REVALIDATION_REQUIRED')],
  diagnostics: [diagnostic('REFERENCE_INACCESSIBLE'), diagnostic('NOT_FOUND_OR_INACCESSIBLE')],
});
const render = (issues: IssueOptions) => renderToStaticMarkup(createElement(IssueOptionsNotice, {
  issues, projectId: 'selected-project', onReload: () => {},
}));

it('groups inaccessible references and presents revalidation as information', () => {
  const html = render(options());
  expect(html.match(/O quadro configurado não foi encontrado/g)).toHaveLength(1);
  expect(html).toContain('a conta GitHub não tem acesso');
  expect(html).toContain('Ao selecionar uma issue');
  expect(html).not.toContain('Indisponível');
  expect(html).not.toContain('diagnostic-record');
  expect(html).not.toContain('Internal');
  expect(html).toContain('dialog=project-configuration&amp;projectId=selected-project');
  expect(html).toContain('Consultar issues novamente');
});

it('preserves distinct prerequisites and deduplicates repeated codes', () => {
  const issues = options();
  issues.prerequisites.push(diagnostic('PROJECT_REQUIRED'), diagnostic('PROJECT_REQUIRED'));
  const html = render(issues);
  expect(html.match(/class="diagnostic-record"/g)).toHaveLength(1);
  expect(html).toContain('Selecione o quadro do projeto');
  expect(html).toContain('Impedida');
});

it('identifies partial results without claiming the consultation is complete', () => {
  const issues = options();
  issues.completeness = 'partial';
  expect(render(issues)).toContain('A consulta das issues está incompleta');
});

it('does not show an issue consultation warning after a successful response', () => {
  const issues = options();
  issues.completeness = 'complete';
  issues.diagnostics = [];
  expect(render(issues)).toBe('');
});
