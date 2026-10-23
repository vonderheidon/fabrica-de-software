async (page) => {
  await page.unroute('**/api/**');
  const id = 'ed0ae84a-3f5b-47c3-bfc5-d6e135880356';
  const settings = {
    settings: { id: 'local', installation_id: 'sprint004-browser', account_id: null, designated_host: null, projects_root: 'C:\\saved', automation_enabled: false, revision: 1, created_at_ms: 1, updated_at_ms: 1,
      time_defaults: { format_version: 1, polling_interval_ms: 15000, passage_active_time_ms: 1800000, question_ttl: { state: 'not_configured' } }, artifact_policy: { format_version: 1, automatic_deletion: false } },
    profiles: [], profile_counts: { all: 0, implementer: 0, reviewer: 0 }, event_cursor: '1',
    onboarding: { suppressed: true, completed_at_ms: null, first_incomplete_step: null, prerequisites: [] }, selection_capabilities: { projects_root: { available: false }, gh_executable: { available: false } },
  };
  const source = { kind: 'local', location: 'C:\\source' };
  const project = { id, name: 'Projeto de prova', account_id: null, source, base_branch: 'main', revision: 1, current_revision_id: id, deletion: null, prerequisites: [] };
  const config = { ...settings, deletion: null, prerequisites: [], configuration_lock: null, configuration: {
    id, project_id: id, revision: 1, created_at_ms: 1, source, base_branch: 'main', github_project: null, implementer_profile_id: null, reviewer_profile_id: null,
    checks: [{ id: 'check', command: 'npm test', cwd_relative: '.', timeout_ms: 1000 }], correction_limit: 2, default_delivery_mode: 'icr', automation_enabled: false,
    queue_order: { priority_field_id: null, priority_direction: 'asc', use_board_position: true }, guidance: '',
  } };
  const codes = ['REMOTE_UNCONFIRMED', 'PROJECT_REQUIRED', 'PROFILES_REQUIRED', 'EXECUTION_REVALIDATION_REQUIRED'];
  const diagnostics = { context: { scope: 'project', id }, supported_checks: ['configuration'], reports: [], event_cursor: '1', diagnostics: codes.map(code => ({ code, cause: code, recovery: 'Revise os campos correspondentes.', check: 'configuration', state: 'blocked', facts: {}, affected_requirements: [], observed_at_ms: 1 })) };
  const preparation = { id, project_id: id, project_revision_id: id, revision: 1, issue_id: 'ISSUE_test', delivery_mode: 'icr', guidance: '', overrides: {},
    prerequisites: ['ISSUE_CLOSED', 'REMOTE_MISMATCH', 'REPOSITORY_ARCHIVED', 'PROFILE_REFERENCE_CHANGED', 'ACCOUNT_CHANGED', 'EXECUTOR_REVALIDATION_REQUIRED', 'CRITERIA_LIST_INVALID'].map(code => ({ code, message: code, recovery: 'Revise os dados atuais.' })),
    effective_configuration: { configuration: config.configuration, project_revision_id: id, settings_revision: 1, implementer_profile: null, reviewer_profile: null,
      time_defaults: settings.settings.time_defaults, artifact_policy: settings.settings.artifact_policy, guidance: '', origins: { base_branch: 'project', implementer_profile: 'project', reviewer_profile: 'project', checks: 'project', correction_limit: 'project', time_defaults: 'global', artifact_policy: 'global', guidance: 'project', delivery_mode: 'preparation' } },
    criteria_preview: { executable: false, objective: '', criteria: [], digest: 'a'.repeat(64), reasons: ['CRITERIA_LIST_INVALID'] }, effects_preview: [], issue: null, base_sha: null, summary_hash: 'b'.repeat(64), diagnostics: [], retry_at_ms: null, can_start: false,
  };
  const requests = [], errors = [], results = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  let partial = true;
  await page.route('**/api/**', async route => {
    const r = route.request(), path = new URL(r.url()).pathname;
    requests.push({ path, method: r.method(), body: r.postData(), operation: r.headers()['idempotency-key'] });
    let data = { items: [], event_cursor: '1', next_cursor: null, has_more: false }, status = 200;
    if (path.endsWith('/session')) data = { csrf_token: 'synthetic', instance_id: 'sprint004-browser' };
    else if (path.endsWith('/settings')) data = settings;
    else if (path.endsWith('/configuration-options')) data = { projects: data, status_fields: [], completeness: 'complete', diagnostics: [], retry_at_ms: null };
    else if (path.endsWith('/configuration')) { data = config; if (r.method() === 'PUT') { status = 412; data = { code: 'REVISION_CONFLICT', message: 'Configuração alterada em outra aba.' }; } }
    else if (path.endsWith('/diagnostics')) data = r.method() === 'POST' ? { operation_id: r.headers()['idempotency-key'], receipt: { revision: 1 } } : diagnostics;
    else if (path.includes('/operations/')) data = { state: 'succeeded', receipt: { revision: 1 } };
    else if (path.endsWith('/issues')) data = { ...data, completeness: partial ? 'partial' : 'complete', retry_at_ms: null, diagnostics: [], prerequisites: [] };
    else if (path.endsWith('/preparations') || path.includes('/preparations/')) data = { preparation, event_cursor: '1' };
    else if (path.endsWith('/projects')) data = { ...data, items: [project] };
    else if (path.includes('/projects/')) data = { project, deletion: null, prerequisites: [], event_cursor: '1' };
    else if (path.includes('/events/stream')) { await route.fulfill({ contentType: 'text/event-stream', body: ': controlled\n\n' }); return; }
    await route.fulfill({ status, contentType: 'application/json', headers: { ETag: '"original"' }, body: JSON.stringify(data) });
  });
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const activate = async locator => { await locator.focus(); await page.keyboard.press('Enter'); };
  const tabProof = async () => {
    const dialog = page.getByRole('dialog');
    const controls = await dialog.evaluate(node => [...node.querySelectorAll('button,a,input,textarea,summary,[role="combobox"]')].filter(el => el.getClientRects().length && !el.disabled && !el.closest('[inert]')).map(el => ({ id: el.id, label: el.getAttribute('aria-label') || el.textContent || el.id, tag: el.tagName })));
    const seen = new Set(), focus = [];
    for (let i = 0; i < 100; i++) {
      await page.keyboard.press('Tab');
      const item = await dialog.evaluate(node => { const el = document.activeElement; if (!node.contains(el)) return null; const s = getComputedStyle(el); return { id: el.id, label: el.getAttribute('aria-label') || el.textContent || el.id, tag: el.tagName, visible: el.matches(':focus-visible'), outline: s.outline, shadow: s.boxShadow }; });
      assert(item, 'Focus escaped dialog'); seen.add(JSON.stringify({ id: item.id, label: item.label, tag: item.tag })); focus.push(item);
    }
    assert(controls.every(item => seen.has(JSON.stringify(item))), 'Unreachable control');
    assert(focus.every(item => item.visible && (!item.outline.includes('none') || item.shadow !== 'none')), 'Missing visible focus');
    return { controls, focus: [...new Map(focus.map(item => [JSON.stringify(item), item])).values()] };
  };
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const name = viewport.width === 1440 ? 'desktop' : 'mobile';
    await page.goto('http://127.0.0.1:4310/#principal/projetos');
    await page.reload({ waitUntil: 'networkidle' });
    const trigger = page.getByRole('button', { name: 'Selecionar projeto', exact: true });
    await trigger.waitFor(); const baseline = requests.length;
    await activate(trigger);
    const verify = page.getByRole('button', { name: 'Verificar condições do projeto', exact: true }); await verify.waitFor();
    assert(requests.slice(baseline).every(r => r.method === 'GET'), 'Opening project caused effect');
    const projectKeyboard = await tabProof();
    await page.getByRole('textbox', { name: 'Localização da origem', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `docs/Docs20261022_160728/sprint004-${name}-project.png`, fullPage: true });
    await page.keyboard.press('Escape');
    assert(await trigger.evaluate(el => el === document.activeElement), 'Project close lost trigger');
    await activate(trigger); await verify.waitFor();
    const command = page.getByRole('textbox', { name: 'Comando do check 1', exact: true });
    await command.fill('npm run controlled');
    await page.getByRole('textbox', { name: 'cwd relativo do check 1', exact: true }).fill('apps/web');
    await page.getByRole('spinbutton', { name: 'Timeout do check 1', exact: true }).fill('4321');
    await activate(page.getByRole('button', { name: 'Salvar configuração', exact: true }));
    await page.getByText(/Conflito:/).first().waitFor();
    const refresh = page.getByRole('button', { name: 'Atualizar leitura do projeto', exact: true });
    await activate(refresh); await page.waitForTimeout(100);
    assert(await refresh.evaluate(el => el === document.activeElement), 'Refresh lost focus');
    assert(await command.inputValue() === 'npm run controlled', 'Lost check draft');
    assert((await page.locator('body').innerText()).includes('Conflito:'), 'Lost conflict');
    await activate(verify);
    const receipt = page.getByRole('button', { name: 'Consultar resultado original', exact: true }); await receipt.waitFor(); await activate(receipt); await page.waitForTimeout(650);
    const posts = requests.slice(baseline).filter(r => r.path.endsWith('/diagnostics') && r.method === 'POST');
    assert(posts.length === 1 && JSON.stringify(JSON.parse(posts[0].body).checks) === '["configuration"]', 'Wrong verification or replay');
    assert(requests.some(r => r.path === `/api/v1/operations/${posts[0].operation}`), 'Wrong original operation');
    await page.screenshot({ path: `docs/Docs20261022_160728/sprint004-${name}-checks-conflict.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await activate(page.getByRole('button', { name: 'Sair e manter rascunho', exact: true }));
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.goto(`http://127.0.0.1:4310/#principal/projetos?dialog=preparation&projectId=${id}&issueId=ISSUE_test`);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Configuração efetiva', { exact: true }).waitFor();
    assert(await page.getByRole('button', { name: 'Revisar e autorizar', exact: true }).isDisabled(), 'Invalid start enabled');
    assert(await page.getByText('A consulta das issues está incompleta', { exact: true }).count() === 1, 'Partial notice missing');
    const preparationKeyboard = await tabProof();
    assert(!(await page.getByRole('dialog').innerText()).includes('Atenção necessária'), 'Generic condition obscures cause');
    partial = false;
    await activate(page.getByRole('button', { name: 'Consultar issues novamente', exact: true }));
    await page.getByText('A consulta das issues está incompleta', { exact: true }).waitFor({ state: 'hidden' });
    await page.getByText('Configuração efetiva', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `docs/Docs20261022_160728/sprint004-${name}-preparation.png`, fullPage: true });
    await page.getByRole('heading', { name: 'Critérios de aceite', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `docs/Docs20261022_160728/sprint004-${name}-criteria.png`, fullPage: true });
    const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert(layout.scrollWidth <= layout.width, 'Horizontal overflow');
    await activate(page.getByRole('link', { name: 'Abrir Perfis Globais', exact: true }).last());
    await page.getByRole('heading', { name: 'Perfis Globais', exact: true }).waitFor();
    await page.waitForTimeout(150);
    await page.getByRole('link', { name: 'Projetos', exact: true }).press('Enter');
    await page.waitForURL('**/#principal/projetos');
    const prepareTrigger = page.getByRole('button', { name: 'Preparar', exact: true });
    await activate(prepareTrigger); await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert(await prepareTrigger.evaluate(el => el === document.activeElement), 'Preparation close lost trigger');
    results.push({ viewport, projectKeyboard, preparationKeyboard, projectTriggerRestored: true, preparationTriggerRestored: true, profilesAccessOperated: true, checkDraftConflictFocusPreserved: true, originalOperationConsulted: true, diagnosticPosts: posts.length, preparationBlocked: true, layout });
    partial = true;
  }
  const assets = await page.evaluate(async () => { const urls = [...document.scripts].map(s => s.src).filter(Boolean).concat([...document.querySelectorAll('link[rel="stylesheet"]')].map(l => l.href)); return Promise.all(urls.map(async url => { const bytes = await (await fetch(url, { cache: 'reload' })).arrayBuffer(); const hash = await crypto.subtle.digest('SHA-256', bytes); return { url, sha256: [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('') }; })); });
  assert(errors.length === 0, 'Browser page errors: ' + errors.join(';'));
  page.off('pageerror', onError);
  await page.goto('about:blank'); await page.unroute('**/api/**');
  return { recordedAt: new Date().toISOString(), browser: await page.context().browser().version(), assets, results, requests, errors };
}
