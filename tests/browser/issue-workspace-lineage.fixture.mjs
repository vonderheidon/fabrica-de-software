// Browser-only HTTP fixture for the compiled UI; no operational API request is forwarded.
export const ids = {
  attempt: '22222222-2222-4222-8222-222222222222',
  predecessor: '11111111-1111-4111-8111-111111111111',
  project: '55555555-5555-4555-8555-555555555555',
  deliveries: ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'],
};
export const proof = { requests: [], unexpected: [], writes: [], errors: [], consoleErrors: [], lineage: 'inherited' };
const unavailable = { available: false, reason: 'CONTROLLED_READ_ONLY' };
const issue = { id: 'I_lineage_fixture', number: 42, title: 'Histórico preservado no ambiente reutilizado', url: 'https://github.com/example/fixture/issues/42' };
const stage = { stage: 'finished', started_at_ms: null, elapsed_ms: null, last_activity_at_ms: null,
  observed_at_ms: 1, deadline_at_ms: null, remaining_ms: null, tracking_state: 'tracked', availability: 'unavailable', reason: 'Fixture visual controlada.' };
const measurements = { stage_activity: stage, active_time: { state: 'measured', value: 1000, unit: 'ms' },
  human_wait: { state: 'measured', value: 0, unit: 'ms' }, cost: { state: 'unavailable', reason: 'CONTROLLED', unit: 'USD' },
  active_limit: { state: 'not_configured' }, question_ttl: { state: 'not_configured' }, active_limit_state: 'unavailable',
  active_expired_at_ms: null, passages: [], pending_requirements: [] };
const publication = { mode: 'icr', review_state: 'approved', local_state: 'completed', confirmed_effects: 0,
  pending_effects: 0, unknown_effects: 0, complete_capability: unavailable, reconcile_capability: unavailable };
const rounds = ids.deliveries.map((id, index) => ({ round: index + 1, delivery_id: id, producer_passage_id: id,
  producer_receipt_id: id, review_id: id, review_state: 'approved', content_identity: (index ? 'c' : 'b').repeat(40) }));
function summary(id) {
  const index = ids.deliveries.indexOf(id);
  return { attempt_id: ids.attempt, delivery_id: id, original_mode: 'icr', authorized_mode: 'icr', review_state: 'approved',
    outcome: 'complete', content_identity: (index ? 'c' : 'b').repeat(40), approved_ref: `refs/factory/deliveries/${id}`,
    code_location: null, local_repository: null, branch_ref: null, commit_sha: null, pull_request_url: null, checkout_updated: false,
    pending_effects: [], limitations: [], criteria_satisfied: 1, criteria_total: 1, resolved_findings: 0,
    details_url: `/api/v1/deliveries/${id}` };
}
function attempt(id = ids.deliveries[1], section = null) {
  const round = ids.deliveries.indexOf(id) + 1;
  const initial = proof.lineage === 'base'
    ? { kind: 'base_checkout', content_identity: 'a'.repeat(40) }
    : proof.lineage === 'pending'
      ? { kind: 'pending_inherited_attempt', source_attempt_id: ids.predecessor }
      : { kind: 'inherited_attempt', source_attempt_id: ids.predecessor, content_identity: 'a'.repeat(40) };
  const passages = ids.deliveries.map((delivery, i) => ({ id: delivery, attempt_id: ids.attempt, delivery_id: delivery,
    round: i + 1, role: 'implementer', state: 'ready', tracking: 'tracked', diagnostic: null, result_receipt_id: delivery, created_at_ms: 1 }));
  return { id: ids.attempt, project_id: ids.project, operation_id: ids.attempt, passage_id: ids.deliveries[1],
    round: 2, phase: 'finished', result: 'delivered', suspension: null, tracking: 'tracked', diagnostic: null,
    result_receipt_id: ids.deliveries[1], delivery_id: ids.deliveries[1], pending_question_id: null, revision: 1, event_cursor: '1',
    block: null, v3_details: null, history_sections: [], expected_account_id: 'account', issue, stage_activity: stage,
    workspace_lineage: { identity: { project_id: ids.project, repository_id: 'R_fixture', issue_id: issue.id },
      predecessor_attempt_id: proof.lineage === 'base' ? null : ids.predecessor, initial_state: initial,
      inherited_base_sha: proof.lineage === 'base' ? null : 'a'.repeat(40), comparison_base_sha: proof.lineage === 'pending' ? null : 'a'.repeat(40) },
    selected_delivery_id: id, selected_round: round, delivery_summary: summary(id),
    publication, measurements, cleanup: 'complete', authority: null,
    capabilities: { cancel: unavailable, complete_publication: unavailable, reconcile_publication: unavailable, revalidate: unavailable },
    details: section ? { section, items: section === 'rounds' ? rounds : section === 'passages' ? passages.filter(p => p.round === round) : [],
      has_more: false, next_cursor: null, event_cursor: '1' } : null };
}
function delivery(id) {
  const round = ids.deliveries.indexOf(id) + 1;
  return { delivery_summary: summary(id), delivery: { id, attempt_id: ids.attempt, producer_passage_id: id, round,
    base_sha: 'a'.repeat(40), capture_state: 'captured', git_ref: `refs/factory/deliveries/${id}`,
    repository_relative: 'issues/42/history.git', content_identity: (round === 1 ? 'b' : 'c').repeat(40), commit_sha: (round === 1 ? 'd' : 'e').repeat(40),
    has_delta: true, diagnostic: null, captured_at_ms: 1, revision: 1, warnings: [] }, event_cursor: '1', issue,
    attempt: attempt(id), measurements, cleanup: 'complete', authorizations: { captured_mode: 'icr', authorized_mode: 'icr', requires_current_gate: true },
    review: null, publication, capabilities: { diff: { available: true }, complete_publication: unavailable, reconcile_publication: unavailable }, details: null };
}
export async function install(page) {
  await page.goto('about:blank');
  proof.requests.length = proof.unexpected.length = proof.writes.length = proof.errors.length = 0;
  await page.unroute('**/api/v1/**');
  page.lineageProof = proof;
  page.lineageIds = ids;
  await page.addInitScript(() => {
    window.EventSource = class extends EventTarget {
      static CLOSED = 2;
      readyState = 1;
      constructor(url) { super(); this.url = url; setTimeout(() => this.onopen?.(new Event('open')), 0); }
      close() { this.readyState = 2; }
    };
  });
  page.on('pageerror', error => proof.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') proof.consoleErrors.push(message.text()); });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    proof.requests.push({ method: request.method(), path: path + url.search });
    const reply = (data, status = 200) => route.fulfill({ status, json: data, headers: { etag: '"controlled:1"' } });
    if (path.endsWith('/session')) return reply({ csrf_token: 'c'.repeat(43), instance_id: ids.project });
    if (request.method() !== 'GET') { proof.writes.push(path); return reply({ code: 'CONTROLLED_READ_ONLY', message: 'Escrita bloqueada na prova visual.' }, 409); }
    if (request.resourceType() === 'eventsource') return route.fulfill({ contentType: 'text/event-stream', body: ': controlled\n\n' });
    if (path.endsWith('/diagnostics')) return reply({ context: { scope: url.searchParams.get('scope') ?? 'attempt', id: ids.attempt },
      supported_checks: ['resources'], diagnostics: [], reports: [], event_cursor: '1' });
    if (path.endsWith('/settings')) return reply({ settings: { id: 'local', installation_id: 'lineage-visual-fixture', account_id: 'account', projects_root: 'projects', automation_enabled: false, revision: 1,
      time_defaults: { format_version: 1, polling_interval_ms: 15000, passage_active_time_ms: 1800000, question_ttl: { state: 'not_configured' } },
      artifact_policy: { format_version: 1, automatic_deletion: false } }, profiles: [], profile_counts: { all: 0, implementer: 0, reviewer: 0 }, event_cursor: '1',
      onboarding: { suppressed: true, completed_at_ms: 1, first_incomplete_step: null, prerequisites: [] }, selection_capabilities: {}, tool_preferences: { format_version: 1 } });
    if (path.endsWith('/attempts')) return reply({ items: [{ id: ids.attempt, project_id: ids.project, issue_id: issue.id, issue_number: issue.number, issue_title: issue.title,
      phase: 'finished', result: 'delivered', suspension: null, revision: 1, created_at_ms: 1, updated_at_ms: 1 }], has_more: false, next_cursor: null, event_cursor: '1' });
    if (path === `/api/v1/attempts/${ids.attempt}/resources`) return reply({ entries: [], cleanup: 'complete' });
    if (path === `/api/v1/attempts/${ids.attempt}`) {
      const id = url.searchParams.get('delivery_id') ?? ids.deliveries[Number(url.searchParams.get('round_id') ?? 2) - 1];
      return reply(attempt(id, url.searchParams.get('section')));
    }
    if (path.startsWith('/api/v1/deliveries/')) {
      const id = path.split('/')[4]; const round = ids.deliveries.indexOf(id) + 1;
      if (path.endsWith('/producer-result')) return reply({ binding: { attempt_id: ids.attempt, passage_id: id, role: 'implementer', round, delivery_version: id },
        result: { format_version: 1, summary: `Resultado controlado da rodada ${round}`, writes_stopped: true, criteria: [], checks: [{ id: `check-rodada-${round}`, outcome: 'passed', evidence: `Evidência exclusiva da rodada ${round}` }], additional_changes_justification: null }, sha256: 'a'.repeat(64), receipt_id: id });
      if (path.endsWith('/diff')) return reply({ delivery_id: id, base_sha: 'a'.repeat(40), content_identity: (round === 1 ? 'b' : 'c').repeat(40),
        entries: [{ path: `rodada-${round}.txt`, old_path: null, status: 'M', old_mode: '100644', new_mode: '100644', binary: false, unsupported: null,
          patch: `@@ -1 +1 @@\n-base\n+conteúdo exclusivo da rodada ${round}\n` }], has_more: false, next_cursor: null });
      return reply(delivery(id));
    }
    if (path === `/api/v1/projects/${ids.project}`) return reply({ project: { id: ids.project, name: 'Projeto da prova visual', revision: 1 }, deletion: null });
    if (path.endsWith('/projects') || path.endsWith('/events')) return reply({ items: [], has_more: false, next_cursor: null, event_cursor: '1' });
    proof.unexpected.push(path);
    return reply({ code: 'CONTROLLED_UNEXPECTED', message: 'Recurso fora da fixture visual.' }, 503);
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:4310/#principal/tentativas?attemptId=${ids.attempt}&dialog=detail`);
  await page.waitForLoadState('networkidle');
}

export async function verify(page, outputDirectory) {
  await install(page);
  const origin = page.getByRole('status', { name: 'Origem do ambiente da issue' });
  await origin.getByText('Esta tentativa herdou o conteúdo da tentativa 11111111 · aaaaaaaa.', { exact: true }).waitFor();
  await page.screenshot({ path: `${outputDirectory}/final-01-desktop.png` });
  await page.getByText('Ver alterações da entrega', { exact: true }).click();
  await page.getByRole('button', { name: 'Carregar diff', exact: true }).click();
  await page.getByText('conteúdo exclusivo da rodada 2', { exact: false }).waitFor();

  const combo = page.getByRole('combobox', { name: 'Rodada', exact: true });
  await combo.click();
  await page.keyboard.press('Escape');
  if (!await combo.evaluate(node => node === document.activeElement)) throw new Error('SELECT_FOCUS_NOT_RESTORED');
  await combo.click();
  await page.getByRole('button', { name: 'Rodada 1', exact: true }).focus();
  await page.keyboard.press('Enter');
  await combo.filter({ hasText: 'Rodada 1' }).waitFor();
  await page.getByText('Ver alterações da entrega', { exact: true }).click();
  await page.getByRole('button', { name: 'Carregar diff', exact: true }).click();
  await page.getByText('conteúdo exclusivo da rodada 1', { exact: false }).waitFor();
  await page.getByText('Validação e histórico da versão', { exact: true }).click();
  await page.locator('summary').filter({ hasText: /^Passagens/ }).click();
  await page.getByText('Evidência exclusiva da rodada 1', { exact: true }).waitFor();
  const oldText = await page.locator('.attempt-detail').innerText();
  if (oldText.includes('conteúdo exclusivo da rodada 2') || oldText.includes('Evidência exclusiva da rodada 2')) throw new Error('OLD_VERSION_CONTAMINATED');
  if (!page.url().includes(ids.deliveries[0])) throw new Error('OLD_VERSION_URL_MISMATCH');
  if (!(await page.getByRole('region', { name: 'Entrega da versão selecionada' }).innerText()).includes(`refs/factory/deliveries/${ids.deliveries[0]}`)) throw new Error('APPROVED_REF_MISMATCH');
  await page.locator('.attempt-diff').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${outputDirectory}/final-02-old-version.png` });

  await combo.click();
  await page.getByRole('button', { name: 'Rodada 2', exact: true }).click();
  await combo.filter({ hasText: 'Rodada 2' }).waitFor();
  await page.getByText('Ver alterações da entrega', { exact: true }).click();
  await page.getByRole('button', { name: 'Carregar diff', exact: true }).click();
  await page.getByText('conteúdo exclusivo da rodada 2', { exact: false }).waitFor();
  if ((await page.locator('.attempt-detail').innerText()).includes('conteúdo exclusivo da rodada 1')) throw new Error('CURRENT_VERSION_CONTAMINATED');
  await page.setViewportSize({ width: 390, height: 844 });
  await origin.scrollIntoViewIfNeeded();
  const geometry = await page.evaluate(() => {
    const node = document.querySelector('[aria-label="Origem do ambiente da issue"]'); const rect = node.getBoundingClientRect();
    return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, originLeft: rect.left, originRight: rect.right };
  });
  if (geometry.documentWidth > geometry.viewport || geometry.originLeft < 0 || geometry.originRight > geometry.viewport) throw new Error('MOBILE_OVERFLOW');
  await page.screenshot({ path: `${outputDirectory}/final-03-mobile.png` });
  proof.lineage = 'base';
  await page.getByRole('button', { name: 'Atualizar tentativa', exact: true }).click();
  await origin.getByText('Conteúdo inicial registrado · aaaaaaaa.', { exact: true }).waitFor();
  if ((await origin.innerText()).includes('herdou')) throw new Error('BASE_CHECKOUT_MARKED_INHERITED');
  await origin.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${outputDirectory}/final-04-base.png` });
  if (proof.errors.length || proof.consoleErrors.length || proof.unexpected.length || proof.writes.length) throw new Error('UNEXPECTED_BROWSER_ACTIVITY');
  return { passed: true, browser: await page.evaluate(() => navigator.userAgent),
    scope: 'Compiled production UI with synthetic HTTP and EventSource via Playwright MCP; no backend integration.',
    checks: ['inherited workspace provenance', 'predecessor and content identity', 'older diff and producer evidence isolated',
      'approved ref follows selected delivery', 'current diff restored', 'keyboard selection and Escape focus', 'mobile 390x844 without horizontal overflow', 'base checkout has no inherited claim'],
    geometry, errors: proof.errors, consoleErrors: proof.consoleErrors, unexpected: proof.unexpected, writes: proof.writes,
    requests: proof.requests };
}
