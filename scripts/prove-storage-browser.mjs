import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';

// Controlled Chrome proof of the production bundle. No operational backend is used.
const root = resolve('dist/web');
const evidence = resolve('tests/browser/evidence/storage-transition');
await mkdir(evidence, { recursive: true });
const server = createServer(async (request, response) => {
  const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
  if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    const file = path === root ? resolve(root, 'index.html') : path;
    response.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] ?? 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done, reject) => { server.once('error', reject); server.listen(4310, '127.0.0.1', done); });
const projectId = '00000000-0000-4000-8000-000000000091';
const locationId = '00000000-0000-4000-8000-000000000092';
const settings = {
  settings: { id: 'local', installation_id: 'browser-proof', account_id: null, designated_host: null,
    projects_root: 'C:\\projects', automation_enabled: false, revision: 1, created_at_ms: 1, updated_at_ms: 1,
    time_defaults: { format_version: 1, polling_interval_ms: 15000, passage_active_time_ms: 1800000, question_ttl: { state: 'not_configured' } }, artifact_policy: { format_version: 1, automatic_deletion: false } },
  profiles: [], profile_counts: { all: 0, implementer: 0, reviewer: 0 }, event_cursor: '1',
  onboarding: { suppressed: true, completed_at_ms: null, first_incomplete_step: null, prerequisites: [] },
  selection_capabilities: { projects_root: { available: false }, gh_executable: { available: false } },
  tool_preferences: { format_version: 1, ...Object.fromEntries(['git', 'maestri', 'omp', 'powershell'].map(key => [key, { preferred_path: null, last_validated_at_ms: null }])) },
};
const initialStorage = {
  managed_root: 'var/factory/projects/project/v1/managed', original_path: 'C:\\Projetos\\Pasta original com nome longo e espaços\\Aplicação preservada',
  state: 'current', cause: null, recovery: null, active_transition_operation_id: null,
  locations: [{ id: locationId, location_key: 'managed', layout_version: 1, current: true, path: 'var/factory/projects/project/v1/managed', verified_at_ms: 1 }],
  transition_plan: { location_key: 'managed', source_location_id: locationId, destination_relative: 'var/factory/projects/project/v2/managed', plan_hash: 'a'.repeat(64), capability: { available: true } },
};
const configuration = { ...settings, deletion: null, prerequisites: [], storage: initialStorage, configuration_lock: null,
  configuration: { id: 'revision', project_id: projectId, revision: 1, created_at_ms: 1, source: { kind: 'local', location: initialStorage.original_path }, base_branch: 'main', github_project: null,
    implementer_profile_id: null, reviewer_profile_id: null, correction_limit: 2, default_delivery_mode: 'icr', automation_enabled: false,
    queue_order: { use_board_position: true }, guidance: '' },
};
let browser;
const result = { surface: 'production bundle / isolated Chrome / controlled HTTP; not Playwright MCP or native movement', passed: [], screenshots: [], requests: [], errors: [] };
result.assets = await Promise.all((await readdir(resolve(root, 'assets'))).map(async name => ({ name, sha256: createHash('sha256').update(await readFile(resolve(root, 'assets', name))).digest('hex') })));
try {
  // Temporary profile allows Chrome's own settings UI; never touches the user's profile.
  browser = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 } });
  result.chrome = browser.browser().version();
  const context = browser;
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => result.errors.push(error.message));
  let mode = 'accepted'; let operationId; let operationState = 'running'; let progressState = 'running'; let operationError = null;
  let storage = structuredClone(initialStorage);
  let review = false;
  await page.route('**/api/v1/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const method = request.method();
    const json = (value, status = 200) => route.fulfill({ status, json: value, headers: { etag: review ? '"revision-two"' : '"revision-one"' } });
    if (path.endsWith('/session')) return json({ csrf_token: 'c'.repeat(43), instance_id: '00000000-0000-4000-8000-000000000093' });
    if (method !== 'GET') {
      assert.equal(path, `/api/v1/projects/${projectId}/storage-transition`, 'No writes outside controlled V08');
      result.requests.push({ method, path, body: request.postDataJSON(), revision: request.headers()['if-match'], identity: request.headers()['idempotency-key'] });
      operationId = request.headers()['idempotency-key'];
      if (mode === 'expired') return json({ code: 'STORAGE_TRANSITION_PLAN_CHANGED', message: 'O plano exibido não é mais atual.', recovery: 'Consulte novamente o plano.' }, 409);
      if (mode === 'lost') return route.abort('failed');
      return json({ operation_id: operationId, resource: { type: 'project', id: projectId }, status_url: `/api/v1/operations/${operationId}`, request_id: 'controlled-request' }, 202);
    }
    if (path.includes('/operations/')) {
      assert.equal(path.split('/').at(-1), operationId);
      return json({ operation_id: operationId, kind: 'project.storage.transition', resource: { type: 'project', id: projectId }, state: operationState, request_id: 'controlled-request',
        progress: { step: operationState === 'succeeded' ? 'publishing_location' : 'moving', state: progressState, generation: 1, revision: 2 }, ...(operationError ? { error: { ...operationError, request_id: 'controlled-request' } } : {}) });
    }
    if (path.endsWith('/configuration')) return json({ ...configuration, storage });
    if (path.endsWith('/configuration-options')) return json({ projects: { items: [], has_more: false, next_cursor: null, event_cursor: '1' }, status_fields: [], completeness: 'complete', diagnostics: [], retry_at_ms: null });
    if (path === '/api/v1/settings') return json(settings);
    if (path === `/api/v1/projects/${projectId}`) return json({ project: { id: projectId, name: 'Projeto da prova', revision: 1, current_revision_id: 'revision' }, deletion: null });
    if (path.endsWith('/diagnostics')) return json({ context: { scope: 'project', id: projectId }, supported_checks: ['configuration'], event_cursor: '1', reports: [], diagnostics: [] });
    if (path === '/api/v1/events') return json({ items: [], next_cursor: null, has_more: false, event_cursor: '1' });
    return json({ code: 'CONTROLLED_RESOURCE', message: 'Recurso fora do escopo desta prova.' }, 503);
  });
  const url = `http://127.0.0.1:4310/#principal/projetos?projectId=${projectId}&dialog=project-configuration`;
  const dialog = page.getByRole('dialog');
  const button = name => dialog.getByRole('button', { name, exact: true });
  const capture = async name => {
    const file = `${name}.png`;
    await page.screenshot({ path: resolve(evidence, file), fullPage: false });
    await writeFile(resolve(evidence, `${name}.aria.txt`), await dialog.ariaSnapshot());
    result.screenshots.push(file);
  };
  const open = async () => { await page.goto(url); await page.getByText('Localizações do projeto', { exact: true }).waitFor(); };
  const checkText = async text => assert.ok((await dialog.innerText()).includes(text), text);
  const authorize = async () => {
    await dialog.getByRole('checkbox', { name: /Autorizo a transição/ }).check();
    await button('Autorizar transição gerenciada').click();
  };
  await open();
  const checkboxBox = await dialog.getByRole('checkbox', { name: /Autorizo a transição/ }).boundingBox();
  assert.ok(checkboxBox && checkboxBox.width <= 24, 'Authorization checkbox must not inherit text-field width');
  await checkText(initialStorage.original_path); await checkText(initialStorage.managed_root);
  await page.locator('#project-guidance').fill('Rascunho preservado durante a transição');
  await capture('01-paths-and-draft');
  await authorize();
  await page.getByText('Movimento em andamento', { exact: true }).waitFor();
  await checkText('Transição aceita ou aguardando confirmação');
  assert.ok(!(await dialog.innerText()).includes('Transição concluída e verificada'));
  assert.equal(result.requests.length, 1);
  assert.deepEqual(result.requests[0].body, { location_key: 'managed', source_location_id: locationId, plan_hash: 'a'.repeat(64), authorized: true });
  assert.equal(result.requests[0].revision, '"revision-one"');
  await capture('02-accepted');
  result.passed.push('Separate complete paths; draft; exact V08 revision, plan and identity; 202 does not claim completion');
  operationState = 'unknown'; progressState = 'uncertain';
  operationError = { code: 'STORAGE_TRANSITION_MOVE_FAILED', message: 'Uma parte do movimento foi observada; o resultado restante é incerto.', recovery: 'Consulte a operação original antes de retomar.' };
  await button('Consultar transição original').click();
  await page.getByText('Resultado incerto; localizações preservadas', { exact: true }).waitFor();
  await checkText(operationError.message); await checkText(operationError.recovery);
  assert.equal(await page.locator('#project-guidance').inputValue(), 'Rascunho preservado durante a transição');
  await capture('03-partial-uncertain');
  progressState = 'blocked';
  operationError = { code: 'STORAGE_TRANSITION_ACTIVE', message: 'Há ambiente em uso.', recovery: 'Aguarde a parada confirmada antes de retomar.' };
  await button('Consultar transição original').click();
  await page.getByText('Transição bloqueada', { exact: true }).waitFor();
  await checkText(operationError.message); await checkText(operationError.recovery);
  await capture('04-blocked');
  operationState = 'succeeded'; progressState = 'verified'; operationError = null;
  await button('Consultar transição original').click();
  await page.getByText('Transição concluída e verificada', { exact: true }).waitFor();
  await capture('05-confirmed');
  assert.equal(result.requests.length, 1);
  await button('Conferir localização atual').click();
  result.passed.push('Backend partial/uncertain, blocked and confirmed states show corresponding cause and recovery; GET never repeats V08');
  mode = 'lost'; operationState = 'running'; progressState = 'running';
  await authorize();
  await page.getByText('Movimento em andamento', { exact: true }).waitFor();
  const lostIdentity = operationId;
  await button('Fechar diálogo').click();
  await button('Sair e manter rascunho').click();
  await open();
  await page.getByText('Movimento em andamento', { exact: true }).waitFor();
  assert.equal(operationId, lostIdentity); assert.equal(result.requests.length, 2);
  assert.equal(await page.locator('#project-guidance').inputValue(), 'Rascunho preservado durante a transição');
  await capture('06-lost-response-reopened');
  result.passed.push('Lost POST response then close/reopen retains operation identity and draft; GET only');
  operationState = 'succeeded'; progressState = 'verified';
  await button('Consultar transição original').click();
  await button('Conferir localização atual').click();
  mode = 'expired';
  await authorize();
  await page.getByText('O plano exibido não é mais atual.', { exact: true }).waitFor();
  await checkText('Consulte novamente o plano.');
  assert.ok(await button('Autorizar transição gerenciada').isDisabled());
  assert.equal(await page.locator('#project-guidance').inputValue(), 'Rascunho preservado durante a transição');
  await capture('07-expired-plan');
  review = true; storage.transition_plan.plan_hash = 'b'.repeat(64);
  await button('Atualizar e rever plano').click();
  assert.ok(await button('Autorizar transição gerenciada').isDisabled());
  result.passed.push('Expired plan refuses command, preserves draft and requires renewed review and authorization');
  storage = { ...storage, state: 'legacy', transition_plan: null, cause: null, recovery: 'Consulte os ambientes existentes antes de planejar a transição.' };
  await button('Atualizar e rever plano').click();
  await page.getByText('Consulte os ambientes existentes antes de planejar a transição.', { exact: false }).waitFor();
  assert.equal(await button('Autorizar transição gerenciada').count(), 0);
  await capture('08-legacy');
  storage = { ...structuredClone(initialStorage), state: 'blocked', cause: 'Há uma tentativa ativa.', recovery: 'Aguarde a parada confirmada.', transition_plan: { ...initialStorage.transition_plan, capability: { available: false, reason: 'Ambiente em uso.', recovery: 'Conclua a tentativa.' } } };
  await button('Atualizar e rever plano').click();
  await page.getByText('Ambiente em uso.', { exact: true }).waitFor();
  await checkText('Há uma tentativa ativa.'); await checkText('Conclua a tentativa.');
  assert.equal(await button('Autorizar transição gerenciada').count(), 0);
  await capture('09-unavailable');
  result.passed.push('Legacy and unavailable capability show backend cause/recovery without transition command');
  for (const [name, width, height, zoom] of [['10-low-window', 1280, 480, 1], ['11-narrow', 375, 667, 1], ['12-browser-zoom-200', 1440, 1000, 2]]) {
    await page.setViewportSize({ width, height });
    if (zoom === 2) {
      const metrics = () => page.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth, height: innerHeight, visualScale: visualViewport.scale }));
      const before = await metrics();
      const preferences = await context.newPage();
      await preferences.goto('chrome://settings/appearance');
      await preferences.locator('#zoomLevel').selectOption('2');
      assert.equal(await preferences.locator('#zoomLevel').inputValue(), '2');
      await page.waitForFunction(dpr => Math.abs(devicePixelRatio / dpr - 2) < 0.01, before.dpr);
      const after = await metrics();
      assert.ok(Math.abs(after.width * 2 - before.width) <= 2, 'Native zoom halves the CSS layout viewport');
      assert.equal(after.visualScale, 1, 'Browser zoom, not pinch zoom');
      result.zoom = { method: 'Chrome appearance settings #zoomLevel = 2', viewport: { width, height }, before, after, measuredFactor: after.dpr / before.dpr };
      await preferences.screenshot({ path: resolve(evidence, '12-browser-zoom-setting.png') });
      result.screenshots.push('12-browser-zoom-setting.png');
      await preferences.close();
    }
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    const footer = await dialog.locator('.dialog-actions').boundingBox();
    assert.ok(footer && footer.height < viewport.height / 3, 'Footer must leave room for the plan and draft');
    await button('Atualizar e rever plano').focus();
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.querySelector('[role=dialog]').contains(document.activeElement)));
    for (const name of ['Atualizar e rever plano', 'Salvar configuração', 'Fechar diálogo']) {
      const action = button(name); await action.focus(); await action.scrollIntoViewIfNeeded();
      const box = await action.boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${name} reachable at ${viewport.width}x${viewport.height}`);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal page overflow');
    await button('Atualizar e rever plano').focus();
    await page.keyboard.press('Enter');
    assert.equal(result.requests.length, 3, 'Keyboard refresh must not issue V08');
    await capture(name);
    await dialog.getByRole('heading', { name: 'Localizações do projeto', exact: true }).scrollIntoViewIfNeeded();
    await capture(`${name}-paths`);
    assert.equal(await page.locator('#project-guidance').inputValue(), 'Rascunho preservado durante a transição');
    result.passed.push(`${name}: keyboard focus and actions reachable without clipping; browser zoom ${zoom}x; draft preserved`);
  }
  assert.deepEqual(result.errors, []);
  result.ok = true;
} catch (error) {
  result.ok = false; result.failure = String(error); process.exitCode = 1;
  console.error(error);
} finally {
  await writeFile(resolve(evidence, 'result.json'), JSON.stringify(result, null, 2));
  await browser?.close();
  await new Promise(done => server.close(done));
  console.log(JSON.stringify({ ok: result.ok, passed: result.passed, failure: result.failure, evidence }, null, 2));
}
