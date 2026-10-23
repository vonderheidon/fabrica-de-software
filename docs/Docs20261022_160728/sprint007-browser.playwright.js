async (page) => {
  const base = 'docs/Docs20261022_160728/';
  const id = '11111111-1111-4111-8111-111111111111';
  const attempt = '22222222-2222-4222-8222-222222222222';
  const empty = { items: [], has_more: false, next_cursor: null, event_cursor: '1' };
  const project = { id, name: 'Projeto controlado', account_id: 'account', source: { kind: 'local', location: 'C:\\controlled' }, base_branch: 'main', revision: 1, current_revision_id: id, prerequisites: [], deletion: null };
  const settings = {
    settings: { id: 'local', installation_id: 'browser-proof', account_id: null, designated_host: null, projects_root: 'C:\\saved', automation_enabled: false, revision: 1, created_at_ms: 1, updated_at_ms: 1,
      time_defaults: { format_version: 1, polling_interval_ms: 15000, passage_active_time_ms: 1800000, question_ttl: { state: 'not_configured' } }, artifact_policy: { format_version: 1, automatic_deletion: false } },
    profiles: [], profile_counts: { all: 0, implementer: 0, reviewer: 0 }, event_cursor: '1',
    onboarding: { suppressed: true, completed_at_ms: 1, first_incomplete_step: null, prerequisites: [{ code: 'ONBOARDING_ACCOUNT_RELINK_REQUIRED', message: 'Conta não vinculada.', recovery: 'Abra Configuração.' }] },
    selection_capabilities: { projects_root: { available: false }, gh_executable: { available: false } },
  };
  const diagnostic = (code, cause, facts = {}) => ({ check: 'configuration', code, cause, recovery: 'Consulte a configuração.', state: 'blocked', facts, observed_at_ms: 1, affected_requirements: [] });
  const operation = { account: { id: null, login: null, observed_id: null, observed_at_ms: null }, host: { designated: 'host', current: 'host', matches: true }, automation: { enabled: false, dispatch_paused: true, project_enabled: null }, active_attempt: null, active_attempt_count: 0, recent_results: [], next_candidates: [], candidate_observation: { state: 'not_observed', requires_revalidation: true, order: 'observed_queue_order', has_more: false },
    impediments: [diagnostic('ACCOUNT_UNOBSERVED', 'Conta não vinculada.'), diagnostic('IMPLEMENTER_PROFILE_REQUIRED', 'Perfil necessário.'), diagnostic('PROJECT_NOT_READY', 'O projeto precisa de configuração.', { project_id: id }), diagnostic('ATTEMPT_SUSPENDED', 'A tentativa está suspensa.', { attempt_id: attempt, project_id: id })],
    integration_status: { kind: 'maestri_native', state: 'observed', observation: diagnostic('MAESTRI_CONTEXT_UNAVAILABLE', 'Contexto indisponível.'), proves_provider_execution: false }, event_cursor: '1' };
  const queue = { scope: { kind: 'account', project_ids: [id] }, enabled: false, valid: true, complete: true, observation_id: id, summary_hash: 'a'.repeat(64), observed_at_ms: 1, eligible_total: 0, modes_by_project: [], account: { id: null, login: null }, host: { expected: 'host', observed: 'host', matches: true }, order: { criterion: 'issue-number', description: 'Ordem controlada' }, diagnostics: [{ code: 'ACCOUNT_UNOBSERVED', message: 'Conta não vinculada.', recovery: 'Abra Configuração.' }], event_cursor: '1', polling: { interval_ms: 15000, backoff_max_ms: 60000, retry_at_ms: null, next_poll_at_ms: Date.now() + 60000 }, page: empty };
  const requests = [], errors = [], results = [];
  const assert = (value, message) => { if (!value) throw new Error(message); };
  page.on('pageerror', error => errors.push(error.message));
  await page.unroute('**/api/**');
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    requests.push({ method: request.method(), path, query: url.search });
    let body = empty;
    if (path.endsWith('/session')) body = { csrf_token: 'controlled', instance_id: 'browser-proof' };
    else if (path.endsWith('/settings')) body = settings;
    else if (path === '/api/v1/operation') body = operation;
    else if (path === '/api/v1/queue') body = queue;
    else if (path === '/api/v1/projects') body = { ...empty, items: [project] };
    else if (path === '/api/v1/events/stream') { await route.fulfill({ contentType: 'text/event-stream', body: ': controlled\n\n' }); return; }
    else if (path === '/api/v1/events') body = { ...empty, items: [{ seq: url.searchParams.has('cursor') ? '2' : '1', entity_type: 'project', entity_id: id, entity_revision: 1, project_id: id, attempt_id: attempt, occurred_at_ms: 1, operation_id: id, event_type: url.searchParams.has('cursor') ? 'diagnostic.completed' : 'project.registered', facts: {}, context: { project_name: 'Projeto controlado' } }], has_more: !url.searchParams.has('cursor'), next_cursor: url.searchParams.has('cursor') ? null : 'controlled-next' };
    else if (path.endsWith('/github-options')) body = { executable: { state: 'not_found', path: null, version: null, diagnostics: [] }, linked_account: null, observed_account: null, accounts: [], diagnostics: [], retry_at_ms: null };
    else if (path === '/api/v1/diagnostics') body = { context: { scope: 'host' }, supported_checks: [], diagnostics: [], reports: [], event_cursor: '1' };
    await route.fulfill({ contentType: 'application/json', headers: { ETag: '"controlled"' }, body: JSON.stringify(body) });
  });
  const activate = async locator => { await locator.focus(); await page.keyboard.press('Enter'); };
  const keyboard = async () => {
    const reached = [];
    for (let n = 0; n < 65; n++) {
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => { const el = document.activeElement, css = getComputedStyle(el); return { tag: el.tagName, text: el.textContent?.trim().slice(0, 70), outline: css.outlineStyle, shadow: css.boxShadow }; });
      if (['A', 'BUTTON', 'INPUT', 'SUMMARY'].includes(focus.tag)) { assert(focus.outline !== 'none' || focus.shadow !== 'none', 'Focus invisible'); reached.push(focus); }
    }
    return reached;
  };
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4310/#principal/dashboard'); await page.reload();
    await page.getByRole('heading', { name: 'Impedimentos atuais' }).waitFor();
    await page.getByText('A tentativa está suspensa.', { exact: true }).waitFor();
    const blockers = page.locator('.dashboard-blockers');
    assert(await blockers.locator('.dashboard-record').count() === 4, 'Equivalent conditions repeated');
    assert(await blockers.locator('a[href*="projectId="]').count() === 1, 'Missing project destination');
    assert(await blockers.locator('a[href*="attemptId="]').count() === 1, 'Missing attempt destination');
    assert(await blockers.getByRole('link', { name: 'Abrir Perfis', exact: true }).count() === 1, 'Missing profile destination');
    assert(await page.getByText(/não confirma disponibilidade atual/).count() === 1, 'Old integration presented as current');
    const before = requests.filter(r => r.path === '/api/v1/operation').length;
    const refresh = page.getByRole('button', { name: 'Atualizar painel', exact: true }); await activate(refresh);
    await page.waitForTimeout(350); assert(requests.filter(r => r.path === '/api/v1/operation').length > before, 'No refresh');
    assert(await refresh.evaluate(el => el === document.activeElement), 'Refresh lost focus');
    const dashboardControls = await keyboard();
    await page.screenshot({ path: base + `sprint007-${name}-dashboard.png` });
    await activate(blockers.getByRole('link', { name: 'Abrir Perfis', exact: true }));
    await page.getByRole('button', { name: 'Novo perfil', exact: true }).waitFor();
    const trigger = page.getByRole('button', { name: 'Novo perfil', exact: true }); await page.waitForFunction(() => [...document.querySelectorAll('button')].some(el => el.textContent === 'Novo perfil' && !el.disabled)); await activate(trigger);
    await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    assert(await trigger.evaluate(el => el === document.activeElement), 'Dialog return focus lost');
    await page.goto('http://127.0.0.1:4310/#principal/registros');
    await page.getByRole('heading', { name: 'Histórico de atividades' }).waitFor();
    assert(await page.getByRole('button', { name: /Verificar selecionados|Atualizar diagnóstico/ }).count() === 0, 'Operational controls remain');
    await activate(page.getByRole('button', { name: 'Próxima página', exact: true })); await page.getByText('Página 2', { exact: false }).waitFor();
    await activate(page.getByRole('button', { name: 'Página anterior', exact: true })); await page.getByText('Página 1', { exact: false }).waitFor();
    await page.getByLabel('Incluir eventos técnicos').focus(); await page.keyboard.press('Space'); await page.waitForTimeout(200);
    assert(await page.getByLabel('Incluir eventos técnicos').isChecked(), 'Technical filter not checked');
    assert(requests.some(r => r.path === '/api/v1/events' && r.query.includes('include_technical=true')), 'Technical events not requested');
    await activate(page.getByRole('combobox', { name: 'Projeto', exact: true }));
    await activate(page.getByRole('button', { name: 'Projeto controlado', exact: true }));
    await page.waitForTimeout(150);
    const mark = requests.length;
    await activate(page.getByRole('button', { name: 'Filtrar tentativa', exact: true })); await page.waitForTimeout(200);
    assert(requests.slice(mark).filter(r => r.path === '/api/v1/events').every(r => !r.query.includes('cursor=')), 'Filter reused cursor');
    await activate(page.locator('summary').filter({ hasText: 'Filtros de tentativa e operação' }));
    await page.getByLabel('Referência da operação').focus(); await page.keyboard.type(id);
    const referenceControls = await keyboard();
    await activate(page.getByRole('button', { name: 'Aplicar referências', exact: true })); await page.waitForTimeout(200);
    assert(requests.some(r => r.path === '/api/v1/events' && r.query.includes('operation_id=')), 'Operation filter missing');
    const recordsControls = await keyboard();
    await page.screenshot({ path: base + `sprint007-${name}-records.png` });
    const assets = await page.evaluate(async () => Promise.all([...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(async el => { const url = el.src || el.href, bytes = await (await fetch(url)).arrayBuffer(); return { url, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('') }; })));
    results.push({ viewport, assets, dashboardControls, referenceControls, recordsControls, horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
  }
  assert(requests.filter(r => r.method !== 'GET' && !r.path.endsWith('/session')).length === 0, 'Business effect or verification triggered');
  assert(errors.length === 0, errors.join(';'));
  await page.goto('about:blank'); await page.unroute('**/api/**');
  return { results, requests, errors, browser: page.context().browser().version(), at: new Date().toISOString() };
}
