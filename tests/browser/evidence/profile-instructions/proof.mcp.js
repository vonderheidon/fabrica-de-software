async (page) => {
  const result = { surface: 'Independent reviewer / Playwright MCP / Chrome / compiled production UI / controlled HTTP', passed: [], captures: [], mutations: [], profileReads: 0, errors: [] };
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const evidence = 'C:/Users/jeffe/Documents/Apps/nova-fabrica-software/tests/browser/evidence/profile-instructions/';
  const pid = '00000000-0000-4000-8000-000000000001';
  const rid = '00000000-0000-4000-8000-000000000002';
  const aid = '00000000-0000-4000-8000-000000000003';
  const long = 'Instrução efetiva com português e revisão independente. Preserve critérios e evidências.\n'.repeat(70);
  const profiles = [
    { id: pid, name: 'Implementador da revisão', profile_type: 'implementer', executor: 'maestri-omp', provider: 'provider', model: 'model', effort: null, guidance: long, revision: 3, composition_version: 1, created_at_ms: 1, updated_at_ms: 1 },
    { id: rid, name: 'Revisor da revisão', profile_type: 'reviewer', executor: 'maestri-omp', provider: 'provider', model: 'model', effort: null, guidance: 'Instruções efetivas do Revisor', revision: 2, composition_version: 1, created_at_ms: 1, updated_at_ms: 1 },
  ];
  let version = 1; let saveMode = 'conflict'; let releaseSave; let historyMode = 'current';
  const capturedGuidance = long;
  const historical = [
    { role: 'implementer', profile_id: pid, profile_revision: 3, executor: 'maestri-omp', provider: 'provider', model: 'model', effort: null, guidance: capturedGuidance, composition_version: 1, context_summary: 'Critério capturado: preservar a versão histórica.', technical_contract_summary: 'Papel, critérios, permissões e schemas permanecem técnicos.', credentials_redacted: true },
    { role: 'reviewer', profile_id: rid, profile_revision: null, executor: 'maestri-omp', provider: 'provider', model: 'model', effort: null, guidance: 'Instruções históricas do Revisor', composition_version: null, context_summary: 'Revisão independente da versão capturada.', technical_contract_summary: 'Schemas técnicos preservados.', credentials_redacted: true },
  ];
  const settings = () => ({ settings: { id: 'local', installation_id: 'profile-review', account_id: null, designated_host: null, projects_root: 'C:\\projects', automation_enabled: false, revision: version, created_at_ms: 1, updated_at_ms: 1, time_defaults: { format_version: 1, polling_interval_ms: 15000, passage_active_time_ms: 1800000, question_ttl: { state: 'not_configured' } }, artifact_policy: { format_version: 1, automatic_deletion: false } }, profiles, profile_counts: { all: 2, implementer: 1, reviewer: 1 }, event_cursor: String(version), onboarding: { suppressed: true, completed_at_ms: null, first_incomplete_step: null, prerequisites: [] }, selection_capabilities: { projects_root: { available: false }, gh_executable: { available: false } }, tool_preferences: { format_version: 1, ...Object.fromEntries(['git', 'maestri', 'omp', 'powershell'].map(key => [key, { preferred_path: null, last_validated_at_ms: null }])) } });
  const unavailable = { state: 'unavailable', reason: 'NOT_OBSERVED', affected_requirements: [] };
  const attempt = { id: aid, project_id: pid, issue_id: 'issue', phase: 'finished', result: 'delivered', suspension: null, tracking: 'tracked', revision: 1, round: 1, created_at_ms: 1, updated_at_ms: 1, delivery_id: null, pending_question_id: null, expected_account_id: 'account', issue: { id: 'issue', number: 1, title: 'Tentativa histórica da revisão', url: 'https://github.com/example/example/issues/1' }, selected_delivery_id: null, selected_round: 1, publication: {}, cleanup: 'complete', authority: null, diagnostic: null, capabilities: Object.fromEntries(['cancel', 'complete_publication', 'reconcile_publication', 'revalidate'].map(key => [key, { available: false }])), measurements: { active_time: unavailable, human_wait: unavailable, cost: unavailable, active_limit: { state: 'not_configured' }, question_ttl: { state: 'not_configured' }, active_limit_state: 'not_configured', active_expired_at_ms: null, passages: [] } };
  await page.unrouteAll({ behavior: 'wait' });
  page.on('pageerror', error => result.errors.push(error.message));
  await page.route('**/api/v1/**', async route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname; const method = request.method();
    const json = (value, status = 200) => route.fulfill({ status, json: value, headers: { etag: `"review-${version}"` } });
    if (path.endsWith('/session')) return json({ csrf_token: 'c'.repeat(43), instance_id: '00000000-0000-4000-8000-000000000099' });
    if (path.endsWith('/settings') && method === 'PUT') {
      const body = request.postDataJSON(); result.mutations.push({ path, body, revision: request.headers()['if-match'] });
      if (saveMode === 'conflict') { version++; return json({ code: 'CONFIGURATION_CONFLICT', message: 'Outra sessão alterou a revisão.', request_id: 'review' }, 412); }
      if (saveMode === 'field') return json({ code: 'FIELD_INVALID', message: 'Revise as instruções.', field_errors: [{ field: 'profile_changes/0/changes/guidance', message: 'Instruções recusadas pelo controlador.' }], request_id: 'review' }, 422);
      if (saveMode === 'body') return json({ code: 'BODY_TOO_LARGE', message: 'O corpo excede 16.384 bytes.', request_id: 'review' }, 413);
      if (saveMode === 'pending') await new Promise(done => { releaseSave = done; });
      for (const change of body.profile_changes) Object.assign(profiles.find(profile => profile.id === change.id), change.changes);
      version++;
      return json({ ...settings(), operation_id: request.headers()['idempotency-key'], event_cursor: String(version), receipt: { event_cursor: String(version) } });
    }
    if (method !== 'GET') return json({ code: 'UNEXPECTED_MUTATION', message: 'Mutação fora da prova.' }, 409);
    if (path === '/api/v1/settings') return json(settings());
    if (path.endsWith('/execution-options')) return json({ state: 'loaded', executor: 'maestri-omp', executor_version: 'review', observed_at_ms: 1, models: [{ provider: 'provider', provider_name: 'Provider', model: 'model', model_name: 'Modelo', efforts: [] }] });
    if (path === '/api/v1/attempts/' + aid) {
      const section = url.searchParams.get('section');
      if (section === 'profiles') result.profileReads++;
      return json({ ...attempt, details: section ? { section, items: section !== 'profiles' ? [] : historyMode === 'legacy' ? [] : historyMode === 'unsafe' ? [{ ...historical[0], credentials_redacted: false, guidance: 'PRIVATE_SYNTHETIC_MARKER' }] : historical, next_cursor: null, has_more: false, event_cursor: '1' } : null });
    }
    if (path.endsWith('/resources')) return json({ entries: [], attempt_id: aid });
    if (path.endsWith('/diagnostics')) return json({ context: { scope: 'attempt', id: aid }, supported_checks: [], event_cursor: '1', reports: [], diagnostics: [] });
    if (path === '/api/v1/events/stream') return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': controlled stream\n\n' });
    if (['/api/v1/projects', '/api/v1/events', '/api/v1/attempts'].includes(path)) return json({ items: [], next_cursor: null, has_more: false, event_cursor: '1' });
    return json({ code: 'CONTROLLED_RESOURCE', message: 'Recurso fora do escopo da revisão.' }, 503);
  });
  page.setDefaultTimeout(12000);
  const capture = async name => { await page.screenshot({ path: evidence + name + '.png', fullPage: false }); result.captures.push(name + '.png'); };
  const openProfile = async id => { await page.goto(`http://127.0.0.1:4310/#principal/perfis?dialog=profile&profileId=${id}`); await page.locator('#profile-guidance').waitFor(); };
  const save = () => page.getByRole('dialog').getByRole('button', { name: 'Salvar alterações', exact: true });
  const edit = text => page.locator('#profile-guidance').fill(text);
  const unchanged = async text => check(await page.locator('#profile-guidance').inputValue() === text, 'Draft must remain literal');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openProfile(pid);
  await unchanged(long);
  check((await page.getByRole('dialog').innerText()).includes('novas tentativas'), 'New-attempt semantics');
  await page.locator('#profile-guidance').focus(); await page.keyboard.press('End');
  await capture('01-editor-long-desktop');
  const draft = 'Instruções editadas pelo teclado. Preservar evidências e critérios.';
  await edit(draft); await save().click();
  await page.getByText('Conflito ao salvar', { exact: true }).waitFor(); await unchanged(draft);
  await page.evaluate(() => window.dispatchEvent(new Event('factory-controller-resync')));
  await unchanged(draft); await capture('02-conflict-preserved');
  await page.getByRole('button', { name: 'Aplicar minha edição sobre a revisão atual', exact: true }).click();
  saveMode = 'field'; await save().click(); await page.getByText('Instruções recusadas pelo controlador.', { exact: true }).waitFor(); await unchanged(draft);
  check(await page.locator('#profile-guidance').getAttribute('aria-invalid') === 'true', 'Field-error association'); await capture('03-field-error');
  saveMode = 'body'; await save().click(); await page.getByText(/16.384 bytes/).first().waitFor(); await unchanged(draft); await capture('04-server-body-error');
  const mutationsBeforeLimit = result.mutations.length;
  await edit('a'.repeat(8193)); await page.getByRole('alert').filter({ hasText: /excedem 8.192/ }).waitFor(); check(await save().isDisabled(), 'Character limit blocks save'); await unchanged('a'.repeat(8193)); await capture('05-character-limit');
  await edit('界'.repeat(6000)); await page.getByRole('alert').filter({ hasText: /16.384 bytes/ }).first().waitFor(); check(await save().isDisabled(), 'UTF-8 body limit blocks save'); await unchanged('界'.repeat(6000)); check(result.mutations.length === mutationsBeforeLimit, 'Oversized drafts never sent'); await capture('06-utf8-limit');
  result.passed.push('Implementer effective long text; conflict/rebase; field and server 413; local character and UTF-8 limits; refresh preserves draft');
  await edit(draft); saveMode = 'pending'; await save().click();
  await page.getByRole('button', { name: 'Salvando…', exact: true }).waitFor(); check(await page.getByRole('dialog').count() === 1, 'No early success/close'); await unchanged(draft);
  releaseSave(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  check(profiles[0].guidance === draft, 'Matching receipt accepts guidance');
  saveMode = 'success'; await openProfile(rid); await edit('Revisor editado: conferir a composição capturada.'); await save().click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  result.passed.push('Both roles save only guidance patch; no early success while PUT pending; matching receipt closes');
  await openProfile(pid); await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#profile-guidance').focus(); await page.keyboard.press('Control+End'); await capture('07-editor-mobile');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page no horizontal overflow');
  await save().focus(); await capture('08-editor-mobile-actions');
  const saveBox = await save().boundingBox(); check(saveBox && saveBox.y >= 0 && saveBox.y + saveBox.height <= 844, 'Mobile save reached by focus');
  await page.keyboard.press('Tab'); check(await page.getByRole('dialog').evaluate(dialog => dialog.contains(document.activeElement)), 'Tab trapped in modal');
  await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  result.passed.push('Mobile 390x844 no page overflow; long field, save action and Tab/Escape keyboard usable');
  await page.setViewportSize({ width: 1280, height: 720 });
  const openHistory = async () => { await page.goto(`http://127.0.0.1:4310/#principal/tentativas?dialog=detail&attemptId=${aid}`); await page.reload(); await page.getByRole('button', { name: 'Consultar perfis capturados', exact: true }).waitFor(); };
  await openHistory(); check(result.profileReads === 0, 'Historical instructions not loaded by detail polling');
  await page.getByRole('button', { name: 'Consultar perfis capturados', exact: true }).focus(); await page.keyboard.press('Enter');
  const historic = page.getByLabel('Instruções históricas do Implementador', { exact: true }); await historic.waitFor(); result.historyFocus = await page.evaluate(() => ({ tag: document.activeElement.tagName, withinDialog: Boolean(document.activeElement.closest('[role=dialog]')) }));
  check(result.historyFocus.withinDialog, 'Historical consultation must preserve keyboard focus within dialog');
  check(await historic.textContent() === capturedGuidance, 'Captured text not replaced by edited current profile');
  check((await page.getByLabel('Perfis capturados da tentativa').innerText()).includes('Indisponível no histórico'), 'Missing legacy revision/composition explicit');
  check(!(await page.locator('body').innerText()).includes('PRIVATE_SYNTHETIC_MARKER'), 'No synthetic credential marker');
  await page.getByRole('heading', { name: 'Instruções usadas nesta tentativa', exact: true }).scrollIntoViewIfNeeded(); await capture('14-historical-metadata');
  await historic.focus(); await page.keyboard.press('Control+End'); await capture('09-historical-desktop');
  await page.evaluate(() => window.dispatchEvent(new Event('factory-controller-resync')));
  check(await historic.textContent() === capturedGuidance, 'Refresh retains captured value'); check(result.profileReads === 1, 'Resync does not reread profile');
  await page.setViewportSize({ width: 390, height: 844 }); await historic.focus(); await capture('10-historical-mobile');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Historical mobile no page overflow');
  await page.getByRole('button', { name: 'Atualizar tentativa', exact: true }).focus(); await capture('11-historical-mobile-actions');
  const updateBox = await page.getByRole('button', { name: 'Atualizar tentativa', exact: true }).boundingBox(); check(updateBox && updateBox.y >= 0 && updateBox.y + updateBox.height <= 844, 'History footer reachable');
  result.passed.push('On-demand captured roles/revision/composition; missing legacy values explicit; current edit/resync never changes captured long text; historical keyboard/mobile usable');
  historyMode = 'unsafe'; await openHistory(); await page.getByRole('button', { name: 'Consultar perfis capturados', exact: true }).click(); await page.getByRole('button', { name: 'Consultar histórico novamente', exact: true }).waitFor();
  check(!(await page.locator('body').innerText()).includes('PRIVATE_SYNTHETIC_MARKER'), 'Unredacted response must not render'); await capture('12-unvalidated-history-rejected');
  historyMode = 'legacy'; await page.getByRole('button', { name: 'Consultar histórico novamente', exact: true }).click(); await page.getByText('Composição histórica indisponível para esta tentativa legada.', { exact: true }).waitFor(); await capture('13-legacy-history');
  result.passed.push('Unvalidated credentials_redacted=false rejected before rendering; empty legacy capture explicitly unavailable');
  check(result.errors.length === 0, 'No React pageerrors: ' + result.errors.join('; '));
  check(result.mutations.every(item => Object.keys(item.body).join(',') === 'changes,profile_changes' && item.body.profile_changes.length === 1 && Object.keys(item.body.profile_changes[0].changes).join(',') === 'guidance'), 'Only isolated guidance patch is sent');
  result.chrome = page.context().browser().version();
  result.assetUrls = await page.evaluate(() => [...document.scripts].map(script => script.src).filter(Boolean));
  await page.goto('about:blank'); await page.unrouteAll({ behavior: 'wait' });
  return result;
}
