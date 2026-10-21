// Run against the built local application with Playwright MCP:
// browser_run_code_unsafe({ filename: 'tests/browser/project-deletion-regressions.playwright.js' })
// Creates and deletes only this run's local projects. Requires a configured
// projects root and local scaffold/deletion capabilities; no GitHub repository.
// Failures preserve screenshots and list any fixture requiring operator recovery.
async (sourcePage, options = {}) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const origin = new URL(sourcePage.url()).origin;
  assert(new URL(origin).hostname === '127.0.0.1', 'Open the local application at 127.0.0.1 before running');
  const run = `deletion-ui-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const artifacts = options.artifacts ?? `.playwright-mcp/${run}`;
  const steps = [];
  const log = action => {
    const entry = { step: steps.length + 1, time: new Date().toISOString(), action };
    steps.push(entry);
    options.onStep?.(entry);
  };
  const page = await sourcePage.context().newPage();
  const fixtures = [];
  const passed = [];
  const screenshots = [];
  const blockedWrites = [];
  const errors = [];
  let settings;
  let failure = null;
  const screenshot = async name => {
    const file = `${artifacts}/${name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    screenshots.push(file);
    log(`Screenshot: ${name}`);
  };
  const routeHandler = async route => {
    const request = route.request();
    if (['GET', 'HEAD'].includes(request.method())) return route.continue();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/v1/session' && request.method() === 'POST') return route.continue();
    const body = request.postDataJSON();
    if (pathname === '/api/v1/scaffold/plans' || pathname === '/api/v1/scaffold/creations') {
      const input = pathname.endsWith('/plans') ? body : body.plan?.input;
      if (request.method() === 'POST' && input?.creation_mode === 'local' && fixtures.some(fixture => fixture.relative === input.destination_relative)) return route.continue();
    }
    if (request.method() === 'POST' && fixtures.some(fixture => fixture.projectId && pathname === `/api/v1/projects/${fixture.projectId}/deletion`)) return route.continue();
    blockedWrites.push(`${request.method()} ${pathname}`);
    return route.abort();
  };
  const cleanAlerts = async () => assert(await page.getByRole('alert').count() === 0, 'The current screen must not retain conflicting error alerts');
  const create = async label => {
    log(`Create local fixture: ${label}`);
    const fixture = { name: `${run} ${label}`, relative: `${run}-${label}`, projectId: null, directory: null, operationId: null };
    fixtures.push(fixture);
    await page.goto(`${origin}/#principal/projetos`);
    if (await page.getByText('Projeto excluído.', { exact: true }).count()) await page.getByRole('button', { name: 'Dispensar aviso', exact: true }).click();
    await page.getByRole('button', { name: 'Criar projeto', exact: true }).click();
    await page.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill(fixture.name);
    await page.getByRole('textbox', { name: /Diretório relativo/ }).fill(fixture.relative);
    await page.getByRole('combobox', { name: 'Modalidade de criação', exact: true }).selectOption('local');
    const planResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/scaffold/plans');
    await page.getByRole('button', { name: 'Revisar plano', exact: true }).click();
    const response = await planResponse;
    assert(response.ok(), 'Local scaffold planning must succeed');
    const { plan } = await response.json();
    const root = settings.settings.projects_root.replace(/[\\/]$/u, '');
    const separator = root.includes('\\') ? '\\' : '/';
    const expected = `${root}${separator}${fixture.relative}`;
    assert(plan.input.creation_mode === 'local' && plan.destination === expected, 'Creation must target only this run beneath the configured projects root');
    fixture.directory = plan.destination;
    await page.getByRole('dialog').getByText(fixture.directory, { exact: true }).waitFor();
    await page.getByRole('checkbox', { name: 'Confirmo uma vez este plano e seus efeitos.' }).check();
    await page.getByRole('dialog').getByRole('button', { name: 'Criar projeto', exact: true }).click();
    await page.getByRole('heading', { name: 'Criação concluída', exact: true }).waitFor({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Abrir configuração do projeto', exact: true }).click();
    fixture.projectId = new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('projectId');
    assert(fixture.projectId, 'The local fixture must have a registered identity');
    log(`Local fixture registered: ${label}`);
    return fixture;
  };
  const beginDeletion = async fixture => {
    log(`Request deletion: ${fixture.relative}`);
    await page.goto(`${origin}/#principal/projetos?projectId=${fixture.projectId}&dialog=project-configuration`);
    if (await page.getByText('Projeto excluído.', { exact: true }).count()) await page.getByRole('button', { name: 'Dispensar aviso', exact: true }).click();
    await page.getByRole('button', { name: 'Excluir definitivamente', exact: true }).click();
    const confirm = page.locator('dialog[open]').getByRole('button', { name: 'Excluir definitivamente', exact: true });
    await confirm.click({ trial: true, timeout: 60_000 });
    await page.locator('dialog[open]').getByText(fixture.directory, { exact: true }).waitFor();
    const acceptance = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/projects/${fixture.projectId}/deletion`);
    await confirm.click();
    const response = await acceptance;
    assert(response.ok(), 'Deletion must be accepted by the real controller');
    const status = await response.json();
    fixture.operationId = status.operation_id;
    assert(status.state !== 'succeeded', 'This scenario must close the dialog before completion, not after a synchronous success');
    await page.getByRole('button', { name: 'Fechar acompanhamento', exact: true }).click();
    await page.getByRole('button', { name: 'Fechar diálogo', exact: true }).click();
    log('Close tracking before confirmed completion');
  };
  const waitForCompletion = async fixture => {
    await page.getByText('Projeto excluído.', { exact: true }).waitFor({ timeout: 120_000 });
    const receiptResponse = await page.request.get(`${origin}/api/v1/project-deletions/${fixture.operationId}`);
    assert(receiptResponse.ok() && (await receiptResponse.json()).state === 'succeeded', 'Completion must be backed by the controller receipt');
    assert(await page.getByText('Projeto excluído.', { exact: true }).count() === 1, 'Exactly one completion notice must remain');
    await cleanAlerts();
    assert(await page.evaluate(id => !(sessionStorage.getItem('factory.uncertain-operations.v1') ?? '').includes(id), fixture.projectId), 'Completion must remove the temporary recovery reference');
    log(`Completion receipt and recovery cleanup verified: ${fixture.relative}`);
  };
  await page.route('**/api/v1/**', routeHandler);
  const onPageError = error => errors.push(error.message);
  page.on('pageerror', onPageError);
  try {
    await page.goto(`${origin}/#principal/projetos`);
    await page.getByRole('button', { name: 'Criar projeto', exact: true }).waitFor();
    const response = await page.request.get(`${origin}/api/v1/settings`);
    assert(response.ok(), 'The controller must be running with a browser session');
    settings = await response.json();
    assert(settings.settings.projects_root, 'Configure the projects root before running this native regression');

    const navigation = await create('navigation');
    await beginDeletion(navigation);
    for (const name of ['Projetos', 'Configuração', 'Registros']) {
      await page.getByRole('link', { name, exact: true }).click();
      log(`Navigate: ${name}`);
    }
    await waitForCompletion(navigation);
    assert(!new URL(page.url()).hash.includes('projectId='), 'Records must discard the deleted project filter');
    assert(await page.getByRole('combobox', { name: 'Projeto', exact: true }).inputValue() === '', 'Records must show all projects after completion');
    await screenshot('navigation-records');
    await page.getByRole('link', { name: 'Projetos', exact: true }).click();
    await page.getByRole('table').waitFor();
    assert(await page.getByRole('table').getByText(navigation.name, { exact: true }).count() === 0, 'The deleted registration must leave the catalogue');
    await page.getByRole('link', { name: 'Configuração', exact: true }).click();
    await page.getByRole('heading', { name: 'Configuração global', exact: true }).waitFor();
    assert(await page.locator('#configuration-project').count() === 0, 'Global settings must have no project selector');
    await cleanAlerts();
    await page.goBack();
    await page.goBack();
    await page.goBack();
    await page.waitForURL(url => !url.hash.includes('projectId='), { timeout: 10_000 });
    assert(!new URL(page.url()).hash.includes('projectId='), 'Back navigation must not resurrect a deleted selection');
    await cleanAlerts();
    passed.push('Close before completion, navigate across three panels, catalogue removal and Back recovery');
    log('PASS: navigation, catalogue removal and Back recovery');

    const survivor = await create('survivor');
    const reload = await create('reload');
    await beginDeletion(reload);
    await page.goto(`${origin}/#principal/projetos?projectId=${survivor.projectId}&dialog=project-configuration`);
    await page.getByRole('button', { name: 'Salvar configuração', exact: true }).waitFor();
    await page.reload();
    log('Reload with another project selected');
    await waitForCompletion(reload);
    assert(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('projectId') === survivor.projectId, 'Recovery after reload must preserve another selected project');
    assert(await page.getByRole('button', { name: 'Salvar configuração', exact: true }).isVisible(), 'The other project configuration must remain open');
    assert((await page.request.get(`${origin}/api/v1/projects/${survivor.projectId}`)).ok(), 'The other project must remain registered');
    await screenshot('reload-preserves-selection');
    passed.push('Reload pending deletion, recover its receipt and preserve another selected project');
    log('PASS: reload recovery preserves another selected project');

    await beginDeletion(survivor);
    await waitForCompletion(survivor);
    assert(blockedWrites.length === 0, 'No write outside local fixture creation/deletion is allowed');
    assert(errors.length === 0, 'Browser JavaScript must not throw during these journeys');
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Browser regression failed';
    log(`FAIL: ${failure}`);
    await screenshot('failure').catch(() => {});
  } finally {
    page.off('pageerror', onPageError);
    await page.unroute('**/api/v1/**', routeHandler);
    // Never blindly resend or recursively delete after an uncertain outcome.
    // The result identifies this run's own remaining fixtures for reconciliation.
  }
  const remaining = [];
  for (const fixture of fixtures) {
    const response = fixture.projectId ? await page.request.get(`${origin}/api/v1/projects/${fixture.projectId}`) : null;
    if (response?.status() !== 404) remaining.push({ name: fixture.name, projectId: fixture.projectId, directory: fixture.directory, operationId: fixture.operationId });
  }
  const result = { passed: failure === null && remaining.length === 0, run, projectsRoot: settings?.settings.projects_root ?? null, fixtures, scenarios: passed, screenshots, remainingFixtures: remaining, failure, blockedWrites, steps };
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(json => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'result.json';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, JSON.stringify(result, null, 2));
  const download = await downloadPromise;
  await download.saveAs(`${artifacts}/result.json`);
  if (!result.passed) throw new Error(`Project deletion regression failed; inspect ${artifacts}/result.json`);
  await page.close();
  return result;
}
