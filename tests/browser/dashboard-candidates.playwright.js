// Playwright function for a built UI origin. All API responses are controlled.
async (page) => {
  const origin = new URL(page.url()).origin;
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const projectId = 'abcdef12-1234-4123-8123-123456789012';
  const candidate = { project_id: projectId, project_name: 'teste667', item_id: 'item', kind: 'issue', issue_id: 'issue', number: 1, title: 'Criar landing page estática básica para Aula IA', url: null, assignees: [{ id: 'account', login: 'vonderheidon' }], status: 'Ready', ready: true, ready_eligible: true, eligible: false, reasons: ['AUTOMATION_DISABLED'], consumption: 'available', attempt_id: null, order: { position: 1, criterion: 'number', value: null } };
  let items = [candidate];
  const writes = [];
  const handler = async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const reply = json => route.fulfill({ json });
    if (path === '/api/v1/session') return reply({ csrf_token: 'c'.repeat(43), instance_id: projectId });
    if (request.method() !== 'GET') { writes.push(`${request.method()} ${path}`); return route.abort(); }
    if (path === '/api/v1/events') return reply({ items: [], has_more: false, next_cursor: null, event_cursor: '1' });
    if (path === '/api/v1/projects') return reply({ items: [], has_more: false, next_cursor: null, event_cursor: '1' });
    if (path === '/api/v1/queue') return route.fulfill({ headers: { etag: '"test"' }, json: { scope: { kind: 'account', project_ids: [projectId] }, enabled: false, valid: true, complete: true, observation_id: projectId, summary_hash: 'a'.repeat(64), observed_at_ms: 1792432190073, eligible_total: items.filter(item => item.eligible).length, modes_by_project: [{ project_id: projectId, mode: 'icr' }], account: { id: 'account', login: 'vonderheidon' }, host: { expected: 'local', observed: 'local', matches: true }, order: { criterion: 'number', description: 'Número da issue' }, page: { items, has_more: false, next_cursor: null, event_cursor: '1' }, diagnostics: [], event_cursor: '1' } });
    return route.fulfill({ status: 503, json: { code: 'CONTROLLED_TEST_RESOURCE', message: 'Fora deste cenário de teste.' } });
  };
  await page.route('**/api/v1/**', handler);
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Próximos candidatos', exact: true }) });
  try {
    await page.goto(`${origin}/#principal/dashboard`);
    await section.getByText(candidate.title, { exact: true }).waitFor();
    let text = await section.innerText();
    assert(text.includes('Issue pronta · automação do projeto desabilitada'), 'Ready issue must explain disabled automation');
    assert(!text.includes('Nenhuma issue pronta') && text.includes('Elegíveis na fila: 0'), 'Visible ready issue must not be described as absent or automatically eligible');
    await page.screenshot({ path: '.playwright-mcp/dashboard-candidates-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile dashboard must fit viewport');
    await section.getByRole('button', { name: 'Preparar', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.playwright-mcp/dashboard-candidates-mobile.png', fullPage: true });
    for (const reason of ['ALREADY_CONSUMED', 'ASSIGNEE_MISMATCH', 'READ_INCOMPLETE']) {
      items = [{ ...candidate, reasons: ['AUTOMATION_DISABLED', reason] }];
      await page.reload();
      await section.getByText('Nenhuma issue pronta nesta página da fila.', { exact: true }).waitFor();
      assert(await section.locator('.dashboard-candidates li').count() === 0, `${reason} must not be presented as ready for manual preparation`);
    }
    items = [{ ...candidate, eligible: true, reasons: [] }];
    await page.reload();
    await section.getByText(candidate.title, { exact: true }).waitFor();
    text = await section.innerText();
    assert(text.includes('elegível nesta consulta') && !text.includes('automação do projeto desabilitada'), 'Eligible issues must retain their own state');
    assert(writes.length === 0, 'The dashboard must not enable automation or dispatch attempts');
    return { passed: true, desktop: true, mobile: true, additional_blockers_hidden: true, automatic_eligibility_preserved: true, writes };
  } finally { await page.unroute('**/api/v1/**', handler); }
};
