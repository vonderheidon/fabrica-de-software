async (page) => {
  const f = FIXTURES;
  const requests = [], errors = [], results = [];
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  await page.unroute('**/api/**');
  const settings = { settings: { id: 'local', installation_id: 'sprint005-browser', account_id: null, designated_host: null, projects_root: 'C:\\controlled', automation_enabled: false, revision: 1, created_at_ms: 1, updated_at_ms: 1, time_defaults: { format_version: 1, polling_interval_ms: 15000, passage_active_time_ms: 1800000, question_ttl: { state: 'not_configured' } }, artifact_policy: { format_version: 1, automatic_deletion: false } }, profiles: [], profile_counts: { all: 0, implementer: 0, reviewer: 0 }, onboarding: { suppressed: true, completed_at_ms: null, first_incomplete_step: null, prerequisites: [] }, selection_capabilities: { projects_root: { available: false }, gh_executable: { available: false } }, event_cursor: '1' };
  let latestOperation = null, lateDiff = null, lateLog = null;
  await page.route('**/api/**', async route => {
    const r = route.request(), url = new URL(r.url()), path = url.pathname;
    requests.push({ path, query: url.search, method: r.method(), operation: r.headers()['idempotency-key'], body: r.postData() });
    let data = { items: [], next_cursor: null, has_more: false, event_cursor: '1' };
    if (path.endsWith('/session')) data = { csrf_token: 'controlled', instance_id: 'sprint005-browser' };
    else if (path.endsWith('/settings')) data = settings;
    else if (path.endsWith('/resources')) data = { attempt_id: f.id, cleanup: 'uncertain', entries: [{ id: f.id, attempt_id: f.id, passage_id: f.id, kind: 'terminal', owned: false, removed: false, launch_state: 'ready', stop_state: 'uncertain', diagnostic: 'STOP_UNCONFIRMED', revision: 1 }] };
    else if (path.endsWith('/interaction')) data = { passage_id: f.id, session_reference: 'controlled-terminal', open_capability: { available: false, reason: 'Acompanhamento perdido. Abra a sessão registrada no Maestri.' } };
    else if (path.endsWith('/producer-result')) data = null;
    else if (path.endsWith('/diagnostics')) {
      if (r.method() === 'POST') { latestOperation = r.headers()['idempotency-key']; data = { operation_id: latestOperation, receipt: { revision: 1, event_cursor: '1' } }; }
      else data = { context: { scope: 'attempt', id: f.id }, supported_checks: ['resources'], diagnostics: [{ check: 'resources', code: 'RESOURCES_UNCERTAIN', state: 'unavailable', cause: 'A parada dos recursos registrados não foi confirmada.', recovery: 'Atualize as capacidades antes de agir.', affected_requirements: [], facts: {}, observed_at_ms: 1 }], reports: [], event_cursor: '1' };
    } else if (path.includes('/operations/')) data = { operation_id: latestOperation, state: 'succeeded', resource: { type: 'attempt', id: f.id }, receipt: { revision: 1, event_cursor: '1' } };
    else if (path.includes('/artifacts/')) {
      if (path.endsWith(f.b)) { await route.fulfill({ contentType: 'text/plain', body: 'LOG ATUAL B' }); return; }
      await new Promise(resolve => { lateLog = resolve; });
      await route.fulfill({ contentType: 'text/plain', headers: { 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': 'attachment', 'X-Content-Type-Options': 'nosniff' }, body: 'LOG ANTIGO A' }).catch(() => {}); return;
    } else if (path.endsWith('/diff')) {
      const isB = path.includes(f.b);
      if (!isB) await new Promise(resolve => { lateDiff = resolve; });
      data = { delivery_id: isB ? f.b : f.a, base_sha: 'a'.repeat(40), content_identity: (isB ? 'b' : 'a').repeat(40), entries: [{ path: isB ? 'atual.txt' : 'antigo.txt', status: 'M', old_path: null, old_mode: '100644', new_mode: '100644', patch: isB ? 'DIFF ATUAL B' : 'DIFF ANTIGO A', binary: false, unsupported: null }], next_cursor: null, has_more: false };
    } else if (path.includes('/deliveries/')) data = path.includes(f.b) ? f.deliveryB : f.deliveryA;
    else if (path === `/api/v1/attempts/${f.id}`) {
      const isB = url.searchParams.get('delivery_id') === f.b || url.searchParams.get('round_id') === '2';
      data = structuredClone(isB ? f.attemptB : f.attemptA);
      const section = url.searchParams.get('section');
      if (section) {
        data.details = { section, items: [], has_more: false, next_cursor: null, event_cursor: '1' };
        if (section === 'rounds') data.details.items = [{ round: 1, delivery_id: f.a, content_identity: 'a'.repeat(40) }, { round: 2, delivery_id: f.b, content_identity: 'b'.repeat(40) }];
        if (section === 'checks') { data.details.items = [{ id: isB ? f.b : f.a, text: `Check da versão ${isB ? 'B' : 'A'}`, state: 'passed', artifacts: [{ id: isB ? f.b : f.a }] }]; if (!url.searchParams.has('cursor')) { data.details.has_more = true; data.details.next_cursor = isB ? 'cursor-b' : 'cursor-a'; } }
        if (section === 'checks' && url.searchParams.has('cursor')) data.details.items = [{ id: f.id, text: 'Continuação dos checks da versão B', state: 'passed', artifacts: [] }];
      }
    } else if (path.endsWith('/attempts')) data.items = [{ id: f.id, project_id: f.id, issue_id: 'issue', issue_number: 1, issue_title: 'Teste de versões', phase: 'verifying', result: null, suspension: 'HUMAN_DECISION', revision: 1, created_at_ms: 1, updated_at_ms: 1 }];
    else if (path.includes('/projects/')) data = { project: { id: f.id, name: 'Projeto controlado', revision: 1, current_revision_id: f.id }, deletion: null };
    else if (path.includes('/events/stream')) { await route.fulfill({ contentType: 'text/event-stream', body: ': controlled\n\n' }); return; }
    await route.fulfill({ contentType: 'application/json', headers: { ETag: '"controlled"' }, body: JSON.stringify(data) }).catch(() => {});
  });
  const activate = async locator => { await locator.focus(); await page.keyboard.press('Enter'); };
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const name = viewport.width === 1440 ? 'desktop' : 'mobile';
    await page.goto('http://127.0.0.1:4310/#principal/tentativas');
    await page.reload({ waitUntil: 'domcontentloaded' });
    const trigger = page.getByRole('button', { name: 'Consultar', exact: true }); await trigger.waitFor();
    const baseline = requests.length;
    await activate(trigger);
    const verify = page.getByRole('button', { name: 'Verificar recursos', exact: true }); await verify.waitFor();
    await page.getByText('Check da versão A', { exact: true }).waitFor();
    assert(requests.slice(baseline).every(r => r.method === 'GET'), 'Navigation submitted effects');
    const refresh = page.getByRole('button', { name: 'Atualizar leitura dos recursos', exact: true });
    await activate(refresh); await page.waitForTimeout(150);
    assert(await refresh.evaluate(el => el === document.activeElement), 'Refresh lost focus');
    await activate(verify);
    const original = page.getByRole('button', { name: 'Consultar resultado original', exact: true }); await original.waitFor();
    await activate(original); await page.waitForTimeout(650);
    assert(requests.slice(baseline).filter(r => r.method === 'POST').every(r => r.path.endsWith('/diagnostics') && JSON.stringify(JSON.parse(r.body)) === '{"checks":["resources"]}'), 'Unexpected mutation');
    await activate(page.getByRole('button', { name: 'Carregar diff', exact: true }));
    await activate(page.getByRole('button', { name: 'Abrir evidência', exact: true }));
    await page.waitForTimeout(100);
    const round = page.getByRole('combobox', { name: 'Rodada', exact: true });
    await activate(round); await activate(page.getByRole('button', { name: 'Rodada 2', exact: true }));
    await page.getByText('Check da versão B', { exact: true }).waitFor();
    assert(await round.evaluate(el => el === document.activeElement), 'Round selection lost focus');
    if (lateDiff) lateDiff(); if (lateLog) lateLog(); await page.waitForTimeout(100);
    assert(!await page.getByText('LOG ANTIGO A', { exact: true }).count(), 'Old artifact visible');
    assert(!await page.getByText('DIFF ANTIGO A', { exact: true }).count(), 'Old diff visible');
    await activate(page.getByRole('button', { name: 'Carregar continuação', exact: true }));
    await page.waitForTimeout(100);
    assert(requests.some(r => r.query.includes('cursor=cursor-b') && r.query.includes(`delivery_id=${f.b}`)), 'Pagination lost delivery');
    await activate(page.getByRole('button', { name: 'Abrir evidência', exact: true }).first());
    await page.getByText('LOG ATUAL B', { exact: true }).waitFor();
    await activate(page.getByRole('button', { name: 'Carregar diff', exact: true }));
    await page.getByText('DIFF ATUAL B', { exact: true }).waitFor();
    const dialog = page.getByRole('dialog');
    const controls = await dialog.evaluate(node => [...node.querySelectorAll('button,a,input,summary,[role="combobox"]')].filter(el => el.getClientRects().length && !el.disabled && !el.closest('[inert]')).map(el => ({ id: el.id, text: el.getAttribute('aria-label') || el.textContent, tag: el.tagName })));
    const seen = new Set(), focus = [];
    for (let index = 0; index < 100; index++) {
      await page.keyboard.press('Tab');
      const item = await dialog.evaluate(node => { const el = document.activeElement, style = getComputedStyle(el); return { inside: node.contains(el), id: el.id, text: el.getAttribute('aria-label') || el.textContent, tag: el.tagName, visible: el.matches(':focus-visible'), outline: style.outlineStyle, shadow: style.boxShadow }; });
      assert(item.inside, 'Focus escaped dialog'); seen.add(JSON.stringify({ id: item.id, text: item.text, tag: item.tag })); focus.push(item);
    }
    assert(controls.every(item => seen.has(JSON.stringify(item))), 'Unreachable control');
    assert(focus.every(item => item.visible && (item.outline !== 'none' || item.shadow !== 'none')), 'Invisible focus');
    await page.keyboard.press('Shift+Tab');
    assert(await dialog.evaluate(node => node.contains(document.activeElement)), 'Backward focus escaped');
    await page.getByRole('heading', { name: 'Estado operacional', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `docs/Docs20261022_160728/sprint005-${name}-attempt.png`, fullPage: true });
    await page.getByRole('heading', { name: 'Parada, ambiente e ações nativas', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `docs/Docs20261022_160728/sprint005-${name}-resources.png`, fullPage: true });
    await page.getByRole('heading', { name: 'Checks e logs', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `docs/Docs20261022_160728/sprint005-${name}-version.png`, fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Global overflow');
    await page.keyboard.press('Escape');
    assert(await trigger.evaluate(el => el === document.activeElement), 'Closing lost trigger');
    assert(requests.slice(baseline).filter(r => r.method === 'POST').length === 1, 'Repeated verification');
    results.push({ viewport, navigationMutations: 0, keyboardControls: controls, focusSamples: focus.length, versionRace: 'passed', pagination: 'delivery-b', returnedToTrigger: true });
  }
  const assets = await page.evaluate(async () => { const paths = [...document.scripts].map(script => script.src).filter(Boolean); return Promise.all(paths.map(async url => { const bytes = await (await fetch(url)).arrayBuffer(); return { url, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('') }; })); });
  assert(errors.length === 0, `Page errors: ${errors.join(', ')}`);
  const browser = await page.evaluate(() => navigator.userAgent);
  await page.goto('about:blank'); await page.unroute('**/api/**'); page.off('pageerror', onError);
  return { browser, assets, results, requests, errors, mode: 'real UI; synthetic API; no providers or publication' };
}
