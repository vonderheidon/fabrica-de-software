import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { GitHubSetupOptions } from '#contracts';
import { GitHubDiagnostics } from '../apps/web/src/features/projects/GitHubSetupPanel.js';

const candidate = { code: 'GH_CANDIDATE_NOT_FOUND', message: 'Caminho alternativo ausente.', recovery: 'Continuar busca.' };
const blocked = { code: 'GITHUB_CLI_NOT_FOUND', message: 'GitHub CLI não localizado.', recovery: 'Localize gh.exe.' };

function options(observed: boolean): GitHubSetupOptions {
  return {
    executable: observed
      ? { state: 'observed', path: 'C:\\tools\\gh.exe', version: '2.0.0', diagnostics: Array.from({ length: 6 }, () => candidate) }
      : { state: 'not_found', path: null, version: null, diagnostics: [candidate, blocked] },
    linked_account: null, observed_account: null, accounts: [], diagnostics: observed ? [] : [blocked],
    retry_at_ms: null,
  };
}

it('keeps discarded candidates in collapsed support instead of attention cards when discovery succeeds', () => {
  const html = renderToStaticMarkup(createElement(GitHubDiagnostics, { options: options(true) }));
  expect(html).not.toContain('diagnostic-record');
  expect(html).toContain('<details class="technical-support">');
  expect(html).not.toContain('<details open');
  expect(html.match(/Caminho alternativo ausente\./g)).toHaveLength(1);
});

it('shows the final blocking diagnostic once while retaining search details', () => {
  const html = renderToStaticMarkup(createElement(GitHubDiagnostics, { options: options(false) }));
  expect(html.match(/class="diagnostic-record"/g)).toHaveLength(1);
  expect(html).toContain('GITHUB_CLI_NOT_FOUND');
  expect(html).toContain('GH_CANDIDATE_NOT_FOUND');
});

it('keeps authentication failures prominent even when executable discovery succeeds', () => {
  const data = options(true);
  data.diagnostics = [{ code: 'GITHUB_AUTH_REQUIRED', message: 'Autenticação necessária.', recovery: 'Confira a conta no host.' }];
  const html = renderToStaticMarkup(createElement(GitHubDiagnostics, { options: data }));
  expect(html.match(/class="diagnostic-record"/g)).toHaveLength(1);
  expect(html).toContain('GITHUB_AUTH_REQUIRED');
});

it('renders nothing when no diagnostics were reported', () => {
  const data = options(true);
  data.executable.diagnostics = [];
  expect(renderToStaticMarkup(createElement(GitHubDiagnostics, { options: data }))).toBe('');
});
