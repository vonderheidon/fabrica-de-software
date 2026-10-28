import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, '.playwright-mcp/attempt-history-without-comparison');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, 'dist/web', req.url === '/' ? 'index.html' : `.${req.url}`);
    if (!path.startsWith(resolve(root, 'dist/web') + '/'.replace('/', process.platform === 'win32' ? '\\' : '/'))) throw new Error('path');
    res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[extname(path)] ?? 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(done => server.listen(4310, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const time = { format_version: 1, polling_interval_ms: 15000, passage_active_time_ms: 1800000, question_ttl: { state: 'not_configured' } };
  const settings = { settings: { id: 'local', installation_id: 'sprint035', account_id: 'account', projects_root: 'projects', automation_enabled: false, revision: 1, time_defaults: time, artifact_policy: { format_version: 1, automatic_deletion: false } }, profiles: [], profile_counts: { all: 0, implementer: 0, reviewer: 0 }, event_cursor: '1', onboarding: { suppressed: true, completed_at_ms: null, first_incomplete_step: null, prerequisites: [] }, selection_capabilities: {}, tool_preferences: { format_version: 1 } };
  const rows = Array.from({ length: 26 }, (_, index) => ({ id: id(index + 1), project_id: id(50), issue_id: 'issue', issue_number: 42, issue_title: index === 25 ? 'Fora da primeira página' : 'Título histórico', phase: 'finished', result: index === 25 ? 'delivered' : 'failed', suspension: null, revision: 1, created_at_ms: 1, updated_at_ms: 1 }));
  let fail = false; let hold = false; let release;
  const requests = [];
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url()); requests.push(url.pathname + url.search);
    const reply = data => route.fulfill({ json: data });
    if (route.request().resourceType() === 'eventsource') return route.fulfill({ contentType: 'text/event-stream', body: ': controlled\n\n' });
    if (url.pathname.endsWith('/session')) return reply({ csrf_token: 'c'.repeat(43), instance_id: id(99) });
    if (url.pathname.endsWith('/settings')) return reply(settings);
    if (url.pathname.endsWith('/projects')) return reply({ items: [], has_more: false, next_cursor: null, event_cursor: '1' });
    if (url.pathname.endsWith('/attempts')) {
      if (hold) { hold = false; await new Promise(done => { release = done; }); }
      if (fail) return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: 'Consulta indisponível', request_id: 'controlled' } });
      const title = url.searchParams.get('issue_title');
      const items = title ? rows.filter(row => row.issue_title.includes(title)) : url.searchParams.has('cursor') ? rows.slice(25) : rows.slice(0, 25);
      return reply({ items, has_more: !title && !url.searchParams.has('cursor'), next_cursor: !title && !url.searchParams.has('cursor') ? 'page2' : null, event_cursor: '1' });
    }
    return reply({ items: [], has_more: false, next_cursor: null, event_cursor: '1' });
  });
  await page.goto('http://127.0.0.1:4310/#principal/tentativas'); await page.waitForLoadState('networkidle');
  assert.equal(await page.getByRole('button', { name: 'Selecionar para comparar', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Comparar tentativas', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await page.getByText('Issue #42 - Fora da primeira página', { exact: true }).waitFor();
  assert(page.url().includes('attemptCursors'));
  assert.equal(await page.getByRole('button', { name: 'Consultar', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Nova tentativa', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Anterior', exact: true }).click();
  await page.getByText('Issue #42 - Título histórico', { exact: true }).first().waitFor();
  assert(!page.url().includes('attemptCursors'));
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await page.getByText('Issue #42 - Fora da primeira página', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'history-wide.png') });
  await page.setViewportSize({ width: 390, height: 640 });
  assert(await page.locator('.attempt-history-card').evaluate(node => node.scrollWidth <= node.clientWidth));
  await page.screenshot({ path: resolve(output, 'history-narrow.png') });
  await page.locator('#attempt-issue-title-filter').fill('Fora da primeira página'); await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await page.waitForURL('**issueTitle=**'); await page.getByText('Issue #42 - Fora da primeira página', { exact: true }).waitFor();
  assert(requests.some(url => url.includes('issue_title=Fora')));
  await page.locator('#attempt-issue-title-filter').fill('sem correspondência'); await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await page.getByText('Nenhuma tentativa corresponde aos filtros', { exact: true }).waitFor();
  fail = true; await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByText('Dados da consulta anterior. Atualize para conferir a situação atual.', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'read-error.png') });
  fail = false; hold = true;
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.attempt-list-panel')?.textContent.includes('Atualizando') || document.querySelector('button[type="submit"]')?.disabled);
  await page.evaluate(() => { location.hash = '#principal/tentativas?issueTitle=Fora'; });
  await page.getByText('Issue #42 - Fora da primeira página', { exact: true }).waitFor(); release?.();
  await page.waitForTimeout(100); assert(await page.getByText('Issue #42 - Fora da primeira página', { exact: true }).isVisible());
  assert(!requests.some(url => url.includes('attempt-comparisons')));
  assert.deepEqual(errors, []);
  await page.evaluate(() => { location.hash = '#principal/tentativas?leftAttemptId=invalid&rightAttemptId=invalid'; });
  await page.getByRole('heading', { name: 'Contexto inválido' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Comparação de tentativas' }).count(), 0);
  const result = { passed: true, proof: 'Chrome headless com HTTP simulado e UI compilada', checks: ['fora da primeira página', 'paginação na URL', 'controles individuais de detalhe e nova tentativa', 'controles comparativos ausentes', 'URL comparativa inválida recusada', 'busca global', 'vazio', 'falha com dado anterior', 'resposta tardia'], requests };
  await writeFile(resolve(output, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await browser.close(); await new Promise(done => server.close(done)); }
