async (page) => {
  await page.unroute('**/api/**');
  const settings = {
    settings: { id: 'local', installation_id: 'browser-proof', account_id: null, designated_host: null, projects_root: 'C:\\saved', automation_enabled: false, revision: 1, created_at_ms: 1, updated_at_ms: 1,
      time_defaults: { format_version: 1, polling_interval_ms: 15000, passage_active_time_ms: 1800000, question_ttl: { state: 'not_configured' } }, artifact_policy: { format_version: 1, automatic_deletion: false } },
    profiles: [], profile_counts: { all: 0, implementer: 0, reviewer: 0 }, event_cursor: '1',
    onboarding: { suppressed: true, completed_at_ms: null, first_incomplete_step: null, prerequisites: [] },
    selection_capabilities: { projects_root: { available: false }, gh_executable: { available: false } },
  };
  const diagnostics = { context: { scope: 'host' }, supported_checks: ['configuration', 'maestri_context', 'github_identity'], event_cursor: '1', reports: [],
    diagnostics: [['ACCOUNT_UNOBSERVED', 'Conta não vinculada.', 'configuration'], ['PROJECTS_ROOT_CONFIRMATION_REQUIRED', 'Pasta ainda não confirmada.', 'configuration'], ['PROFILES_REQUIRED', 'Nenhum perfil cadastrado.', 'configuration'], ['MAESTRI_CONTEXT_UNAVAILABLE', 'Contexto nativo indisponível.', 'maestri_context']]
      .map(([code, cause, check]) => ({ code, cause, check, state: 'blocked', recovery: 'Revise a configuração.', affected_requirements: ['RF-01'], facts: {}, observed_at_ms: 1 })) };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let data = { items: [], event_cursor: '1', next_cursor: null };
    let status = 200;
    if (path.endsWith('/session')) data = { csrf_token: 'synthetic', instance_id: 'proof-instance' };
    else if (path.endsWith('/settings')) {
      data = settings;
      if (request.method() === 'PUT') { status = 412; data = { code: 'REVISION_CONFLICT', message: 'Configuração alterada em outra aba.' }; }
    } else if (path.includes('github-options')) data = { executable: { state: 'observed', path: 'C:\\tools\\gh.exe', version: '2', diagnostics: [] }, linked_account: null, observed_account: { id: 'synthetic', login: 'test-user' }, accounts: [], diagnostics: [], retry_at_ms: null };
    else if (path.includes('/diagnostics')) data = request.method() === 'POST' ? { operation_id: request.headers()['idempotency-key'], receipt: { revision: 1 } } : diagnostics;
    else if (path.includes('/operations/')) data = { state: 'succeeded', receipt: { revision: 1 } };
    else if (path.includes('/events/stream')) { await route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': controlled\n\n' }); return; }
    await route.fulfill({ status, contentType: 'application/json', headers: { ETag: '"original"' }, body: JSON.stringify(data) });
  });
  const results = [];
  const requests = [];
  const assert = (value, message) => { if (!value) throw new Error(message); };
  page.on('request', request => {
    if (request.url().includes('/api/')) requests.push({ path: new URL(request.url()).pathname, method: request.method(), body: request.postData(), id: request.headers()['idempotency-key'] });
  });
  const keyboardActivate = async (locator) => { await locator.focus(); await page.keyboard.press('Enter'); };
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('http://localhost:4310/#principal/configuracao');
    await page.getByRole('button', { name: 'Verificar pasta e perfis', exact: true }).waitFor();
    const start = requests.length;
    const name = viewport.width === 1440 ? 'desktop' : 'mobile';
    const assets = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/assets/')).map(entry => entry.name));
    assert(assets.some(asset => asset.endsWith('index-xhqW-JG1.js')), 'Current JavaScript not loaded');
    assert(assets.some(asset => asset.endsWith('index-Dm67tbx6.css')), 'Current CSS not loaded');
    assert(await page.getByRole('button', { name: 'Verificar status', exact: true }).count() === 1, 'Duplicated GitHub verification');
    assert((await page.locator('body').innerText()).includes('Não comprova execução de provider nem disponibilidade de MCP'), 'Missing observation limit');
    const controls = await page.locator('main').evaluate(main => [...main.querySelectorAll('a,button,input,select,textarea,summary,[role=combobox]')].filter(element => element.getClientRects().length && !element.disabled).map(element => ({ tag: element.tagName, name: element.getAttribute('aria-label') || element.textContent || element.getAttribute('id'), id: element.id })));
    const visited = new Set();
    const focusStyles = [];
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    for (let index = 0; index < 80; index++) {
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const element = document.activeElement;
        if (!element || !element.closest('main')) return null;
        const style = getComputedStyle(element);
        return { tag: element.tagName, name: element.getAttribute('aria-label') || element.textContent || element.getAttribute('id'), id: element.id, outline: style.outline, shadow: style.boxShadow, focusVisible: element.matches(':focus-visible') };
      });
      if (focus) { visited.add(JSON.stringify({ tag: focus.tag, name: focus.name, id: focus.id })); focusStyles.push(focus); }
    }
    assert(controls.every(control => visited.has(JSON.stringify(control))), 'Some visible controls are unreachable by Tab');
    assert(focusStyles.every(focus => focus.focusVisible && (!/\bnone\b/.test(focus.outline) || focus.shadow !== 'none')), 'Missing visible keyboard focus');
    await keyboardActivate(page.getByRole('link', { name: 'Gerenciar Perfis', exact: true }));
    await page.getByRole('heading', { name: 'Perfis Globais', exact: true }).waitFor();
    await page.screenshot({ path: `docs/Docs20261022_160728/sprint003-${name}-profiles.png`, fullPage: true });
    const trigger = page.getByRole('button', { name: 'Novo perfil', exact: true });
    await keyboardActivate(trigger);
    await page.getByRole('dialog').waitFor();
    assert(await page.getByRole('dialog').evaluate(dialog => dialog.contains(document.activeElement)), 'Dialog has no focus');
    for (let index = 0; index < 24; index++) {
      await page.keyboard.press('Tab');
      assert(await page.getByRole('dialog').evaluate(dialog => dialog.contains(document.activeElement)), 'Focus escaped dialog');
    }
    await page.screenshot({ path: `docs/Docs20261022_160728/sprint003-${name}-dialog.png`, fullPage: true });
    await page.keyboard.press('Escape');
    assert(await trigger.evaluate(element => element === document.activeElement), 'Dialog did not restore trigger');
    await keyboardActivate(page.getByRole('link', { name: 'Configuração', exact: true }));
    await page.getByRole('button', { name: 'Verificar pasta e perfis', exact: true }).waitFor();
    assert(requests.slice(start).filter(request => request.method !== 'GET').length === 0, 'Navigation caused mutation');
    await keyboardActivate(page.getByRole('button', { name: 'Verificar status', exact: true }));
    await keyboardActivate(page.locator('summary').filter({ hasText: 'Detalhes da conexão' }));
    await page.getByText('Conta ativa neste computador:').waitFor();
    assert((await page.locator('.github-connection-details').innerText()).includes('@test-user'), 'Identity not observed');
    const field = page.getByRole('textbox', { name: 'Raiz dos projetos', exact: true });
    await field.fill('C:\\draft-browser');
    await keyboardActivate(page.getByRole('button', { name: 'Salvar configuração', exact: true }));
    await page.getByText(/Conflito:/).first().waitFor();
    const refresh = page.getByRole('button', { name: 'Atualizar leitura de pasta e perfis', exact: true });
    await keyboardActivate(refresh);
    await page.waitForTimeout(100);
    assert(await refresh.evaluate(element => element === document.activeElement), 'Refresh lost focus');
    assert(await field.inputValue() === 'C:\\draft-browser', 'Refresh lost draft');
    assert((await page.locator('body').innerText()).includes('Conflito:'), 'Refresh lost conflict');
    for (const label of ['Verificar pasta e perfis', 'Verificar integração']) {
      const before = requests.filter(request => request.method === 'POST' && request.path.includes('diagnostics')).length;
      await keyboardActivate(page.getByRole('button', { name: label, exact: true }));
      const original = page.getByRole('button', { name: 'Consultar resultado original', exact: true });
      await original.waitFor();
      await keyboardActivate(original);
      await page.waitForTimeout(600);
      const posts = requests.filter(request => request.method === 'POST' && request.path.includes('diagnostics'));
      assert(posts.length === before + 1, 'Receipt consultation repeated POST');
      const sent = posts.at(-1);
      assert(JSON.stringify(JSON.parse(sent.body).checks) === JSON.stringify([label === 'Verificar integração' ? 'maestri_context' : 'configuration']), 'Wrong diagnostic check');
      assert(requests.some(request => request.path === `/api/v1/operations/${sent.id}`), 'Original operation not consulted');
    }
    await keyboardActivate(page.getByRole('button', { name: 'Atualizar leitura da integração', exact: true }));
    await page.waitForTimeout(100);
    const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert(layout.scrollWidth <= layout.width, 'Horizontal overflow');
    await refresh.focus();
    await page.keyboard.press('Tab');
    await page.screenshot({ path: `docs/Docs20261022_160728/sprint003-${name}-configuration.png`, fullPage: true });
    results.push({ viewport, assets, keyboardControls: controls, focusStyles: [...new Map(focusStyles.map(focus => [JSON.stringify(focus), focus])).values()], navigationDiagnosticPosts: 0, navigationMutations: 0, dialogFocusTrapped: true, dialogTriggerRestored: true, draftConflictAndFocusPreserved: true, originalOperationsConsultedWithoutReplay: true, layout });
  }
  return { recordedAt: new Date().toISOString(), browser: await page.context().browser().version(), results, requests };
}
