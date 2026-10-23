async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const origin = 'http://127.0.0.1:4310';
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const attemptId = id(1), projectId = id(2);
  const unavailable = { available: false, reason: 'NATIVE_OPEN_UNAVAILABLE' };
  const measured = { state: 'unavailable', reason: 'NOT_OBSERVED' };
  const settings = {
    settings: { id: 'local', installation_id: 'controlled-proof', account_id: null, designated_host: null, projects_root: 'projects', automation_enabled: false, revision: 1, created_at_ms: 1, updated_at_ms: 1,
      time_defaults: { format_version: 1, polling_interval_ms: 15000, passage_active_time_ms: 1800000, question_ttl: { state: 'not_configured' } }, artifact_policy: { format_version: 1, automatic_deletion: false } },
    profiles: [], profile_counts: { all: 0, implementer: 0, reviewer: 0 }, event_cursor: '1',
    onboarding: { suppressed: true, completed_at_ms: null, first_incomplete_step: null, prerequisites: [] },
    selection_capabilities: { projects_root: { available: false }, gh_executable: { available: false } },
    tool_preferences: { format_version: 1, ...Object.fromEntries(['git', 'maestri', 'omp', 'powershell'].map(key => [key, { preferred_path: null, last_validated_at_ms: null }])) },
  };
  const passages = ['occupied', 'available', 'uncertain', null].map((state, index) => ({
    id: id(10 + index), attempt_id: attemptId, delivery_id: id(30 + index), round: index + 1,
    role: index % 2 ? 'reviewer' : 'implementer', state: 'ready', tracking: index === 2 ? 'lost' : 'tracked', diagnostic: null, result_receipt_id: null, created_at_ms: 1,
    attempt_session_id: state ? id(40 + index) : null, session_state: index === 2 ? 'interrupted' : state ? 'completed' : null,
    session_source_id: index === 1 ? id(50) : null, terminal_name: state ? `factory-controlled-${index}` : null, terminal_state: state,
    occupancy_state: index === 0 ? 'occupied' : index === 1 ? 'released' : index === 2 ? 'uncertain' : null,
  }));
  const resources = passages.map((p, i) => ({ id: id(60 + i), attempt_id: attemptId, passage_id: p.id, kind: 'terminal', reference: `controlled-${i}`, owned: true, launch_state: 'ready', stop_state: i === 2 ? 'uncertain' : 'not_requested', diagnostic: null, revision: 1, removed: false }));
  const attempt = {
    id: attemptId, project_id: projectId, operation_id: id(3), passage_id: id(10), round: 4, phase: 'finished', result: 'interrupted', suspension: null, tracking: 'lost', diagnostic: null, result_receipt_id: null, delivery_id: null, revision: 1, event_cursor: '1', created_at_ms: 1, updated_at_ms: 1,
    issue: { id: 'issue', number: 16, title: 'Sessões e recursos preservados', url: origin }, selected_delivery_id: null, selected_round: 4, expected_account_id: 'controlled',
    publication: {}, measurements: { active_time: measured, human_wait: measured, cost: measured, active_limit: { state: 'not_configured' }, question_ttl: { state: 'not_configured' }, active_limit_state: 'unavailable', active_expired_at_ms: null, passages: [] },
    cleanup: 'uncertain', authority: null, capabilities: { cancel: unavailable, complete_publication: unavailable, reconcile_publication: unavailable, revalidate: unavailable }, details: null,
  };
  const mutations = [], errors = [];
  await page.goto('about:blank');
  await page.unroute('**/api/v1/**');
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const reply = json => route.fulfill({ json, headers: { etag: '"controlled:1"' } });
    if (request.resourceType() === 'eventsource') return route.fulfill({ contentType: 'text/event-stream', body: ': controlled proof\n\n' });
    if (path === '/api/v1/session') return reply({ csrf_token: 'c'.repeat(43), instance_id: id(90) });
    if (request.method() !== 'GET') { mutations.push(path); return reply({}); }
    if (path === '/api/v1/settings') return reply(settings);
    if (path === '/api/v1/events') return reply({ items: [], next_cursor: null, has_more: false, event_cursor: '1' });
    if (path.endsWith('/diagnostics')) return reply({ context: { scope: 'attempt', id: attemptId }, supported_checks: [], reports: [], diagnostics: [], event_cursor: '1' });
    if (path.endsWith('/interaction')) return reply({ session_reference: 'controlled-existing-surface', open_capability: unavailable, event_cursor: '1' });
    if (path.endsWith('/resources')) return reply({ entries: resources, cleanup: 'uncertain', event_cursor: '1' });
    if (path === `/api/v1/attempts/${attemptId}`) {
      const section = url.searchParams.get('section');
      const items = section === 'passages' ? passages : section === 'resources' ? resources : [];
      return reply({ ...attempt, details: section ? { section, items, has_more: false, next_cursor: null, event_cursor: '1' } : null });
    }
    if (path === '/api/v1/attempts') return reply({ items: [attempt], next_cursor: null, has_more: false, event_cursor: '1' });
    return reply({ items: [], next_cursor: null, has_more: false, event_cursor: '1', prerequisites: [], diagnostics: [] });
  });
  const url = `${origin}/#principal/tentativas?dialog=detail&attemptId=${attemptId}`;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url); await page.waitForLoadState('networkidle');
  const environment = page.locator('details').filter({ has: page.locator('summary#attempt-environment') });
  await environment.locator('summary').first().click();
  await environment.getByText('Ocioso e disponível para reutilização', { exact: true }).waitFor();
  assert(await environment.getByText('Ativo', { exact: true }).count() === 1, 'active terminal missing');
  assert(await environment.getByText('Incerta, exige nova conferência', { exact: true }).count() === 1, 'uncertain terminal missing');
  assert(await environment.getByText('Coordenação automática interrompida.', { exact: false }).count() === 1, 'lost coordination missing');
  assert(await environment.getByText('Indisponível no histórico legado', { exact: true }).count() === 2, 'legacy absence missing');
  const buttons = environment.getByRole('button', { name: 'Abrir terminal', exact: true });
  assert(await buttons.count() === 4, 'terminal controls missing');
  for (const button of await buttons.all()) {
    assert(await button.isDisabled(), 'unavailable action enabled');
    const description = await button.getAttribute('aria-describedby');
    assert(description && await page.locator(`[id="${description}"]`).textContent(), 'action description missing');
  }
  await environment.getByText('Ocioso e disponível para reutilização', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tests/browser/evidence/sprint016-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await environment.getByText('Ocioso e disponível para reutilização', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tests/browser/evidence/sprint016-mobile.png', fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile overflow');
  const close = page.getByRole('button', { name: 'Fechar diálogo', exact: true });
  await close.click();
  await page.goto(url); await page.waitForLoadState('networkidle');
  await page.locator('summary#attempt-environment').click();
  await environment.getByText('Ocioso e disponível para reutilização', { exact: true }).waitFor();
  assert(mutations.length === 0, `read, close or reopen triggered a mutation: ${mutations.join(', ')}`);
  assert(errors.length === 0, errors.join('\n'));
  return { passed: true, states: ['active', 'idle', 'uncertain', 'lost', 'legacy'], disabled_actions_described: true, preserved_after_reopen: true, mutations, errors };
}
