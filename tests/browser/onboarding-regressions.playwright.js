// Run with Playwright MCP browser_run_code_unsafe({ filename: 'tests/browser/onboarding-regressions.playwright.js' }).
// Requires the built application at the current page origin; no configuration is saved.
async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const origin = new URL(page.url()).origin;
  const session = await page.request.post(`${origin}/api/v1/session`, { headers: { 'X-Factory-Client': 'web', origin }, data: {} });
  assert(session.ok(), 'The local controller must provide a browser session');
  const response = await page.request.get(`${origin}/api/v1/settings`);
  assert(response.ok(), 'The local controller must provide the settings fixture');
  const settings = await response.json();
  settings.settings.projects_root = 'C:\\Projects';
  settings.profiles = [];
  settings.profile_counts = { all: 0, implementer: 0, reviewer: 0 };
  settings.onboarding = { suppressed: false, completed_at_ms: null, first_incomplete_step: 'profiles', prerequisites: [] };
  settings.selection_capabilities = { projects_root: { available: true }, gh_executable: { available: true } };
  const catalog = {
    state: 'loaded', executor: 'maestri-omp', executor_version: 'regression-fixture', observed_at_ms: 1,
    models: [
      { provider: 'test-a', provider_name: 'Test A', model: 'model-a', model_name: 'Model A', efforts: ['low', 'high'] },
      { provider: 'test-b', provider_name: 'Test B', model: 'model-b', model_name: 'Model B', efforts: [] },
    ],
  };
  const errors = [];
  const onPageError = error => errors.push(error.message);
  page.on('pageerror', onPageError);
  const unexpectedWrites = [];
  let selectionCount = 0;
  let finishSelection;
  const selectionFinished = new Promise(resolve => { finishSelection = resolve; });
  let selectionRequest;
  let selectionFailed = false;
  const onRequestFailed = request => { if (request === selectionRequest) selectionFailed = true; };
  page.on('requestfailed', onRequestFailed);
  const apiHandler = async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/session') { await route.continue(); return; }
    if (path === '/api/v1/settings/selections') {
      selectionCount += 1;
      selectionRequest = request;
      assert(request.postDataJSON().kind === 'projects_root', 'The folder button must request the folder picker');
      await selectionFinished;
      await route.fulfill({ json: { state: 'cancelled', kind: 'projects_root', path: null } });
      return;
    }
    if (request.method() !== 'GET') {
      unexpectedWrites.push(`${request.method()} ${path}`);
      await route.abort();
      return;
    }
    if (path === '/api/v1/settings') {
      await route.fulfill({ json: settings, headers: { etag: response.headers().etag ?? '"regression"' } });
      return;
    }
    if (path === '/api/v1/settings/execution-options') { await route.fulfill({ json: catalog }); return; }
    // Other panels must not invoke real integrations while this UI regression runs.
    await route.fulfill({ status: 503, json: { code: 'CONTROLLED_TEST_RESOURCE', message: 'Outside this UI fixture' } });
  };
  await page.route('**/api/v1/**', apiHandler);
  const passed = [];
  try {
    await page.goto(`${origin}/#principal/dashboard?dialog=initial-setup`);
    await page.reload();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Conectar GitHub Confirmada', exact: true }).click();
    const advanceRoot = dialog.getByRole('button', { name: 'Continuar para a pasta', exact: true });
    assert(await advanceRoot.isEnabled(), 'Persisted GitHub confirmation must allow advancing without verifying again');
    await advanceRoot.click();
    await dialog.locator('#projects-root-path').waitFor();
    passed.push('Persisted GitHub confirmation allows advancing without another GitHub query');

    await page.clock.install();
    await dialog.getByRole('button', { name: 'Selecionar pasta', exact: true }).click();
    await dialog.getByRole('button', { name: 'Aguardando a janela…', exact: true }).waitFor();
    await page.clock.fastForward(600_000);
    assert(selectionCount === 1, 'A pending selection must neither repeat nor disappear after ten minutes');
    assert(!selectionFailed, 'The browser must not abort the native selection because of elapsed time');
    assert(await dialog.getByRole('button', { name: 'Aguardando a janela…', exact: true }).isDisabled(), 'A pending picker must prevent duplicate openings');
    finishSelection();
    await dialog.getByText('Seleção cancelada.', { exact: false }).waitFor();
    assert(await dialog.locator('#projects-root-path').inputValue() === 'C:\\Projects', 'Cancellation must preserve the existing folder');
    await page.clock.resume();
    passed.push('Folder selection survives ten minutes, stays exclusive and preserves the folder on cancellation');

    await dialog.getByRole('button', { name: 'Continuar para os perfis', exact: true }).click();
    await dialog.getByRole('button', { name: 'Criar perfil de Implementador', exact: true }).click();
    const name = dialog.locator('#profile-name');
    await name.fill('Implementador');
    await name.press('End');
    await name.pressSequentially(' principal');
    assert(await name.inputValue() === 'Implementador principal', 'Repeated name changes must keep the form mounted and preserve text');
    await dialog.locator('#profile-provider').selectOption('test-a');
    await dialog.locator('#profile-model').selectOption('model-a');
    await dialog.locator('#profile-effort').selectOption('high');
    await dialog.locator('#profile-guidance').fill('Mudanças pequenas');
    await dialog.locator('#profile-guidance').press('End');
    await dialog.locator('#profile-guidance').pressSequentially(' e verificáveis');
    assert(await dialog.locator('#profile-guidance').inputValue() === 'Mudanças pequenas e verificáveis', 'Guidance must survive repeated input events');
    assert(await dialog.locator('#profile-effort').inputValue() === 'high', 'Effort must survive subsequent input events');
    passed.push('Confirmed folder allows advancing and name, model, effort and guidance survive repeated edits');

    await dialog.locator('#profile-provider').selectOption('test-b');
    assert(await dialog.locator('#profile-model').inputValue() === '', 'Changing provider must clear an incompatible model');
    await dialog.locator('#profile-model').selectOption('model-b');
    assert(await dialog.locator('#profile-effort').inputValue() === '', 'Models without effort choices must retain the empty effort selection');
    assert(await name.inputValue() === 'Implementador principal', 'Changing provider must preserve the name');
    assert(await dialog.locator('#profile-guidance').inputValue() === 'Mudanças pequenas e verificáveis', 'Changing provider must preserve guidance');
    assert(await dialog.isVisible(), 'The wizard must remain visible after all edits');
    assert(errors.length === 0, `Unexpected page errors: ${errors.join('; ')}`);
    assert(unexpectedWrites.length === 0, `Unexpected mutations: ${unexpectedWrites.join('; ')}`);
    passed.push('Changing provider clears incompatible choices without crashing or losing unrelated fields');
    return { passed, pageErrors: errors, unexpectedWrites };
  } finally {
    finishSelection();
    page.off('pageerror', onPageError);
    page.off('requestfailed', onRequestFailed);
    await page.clock.resume();
    await page.unroute('**/api/v1/**', apiHandler);
  }
}
