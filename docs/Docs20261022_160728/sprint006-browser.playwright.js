async (page) => {
  const f = {
  "creation": {
    "id": "00000000-0000-4000-8000-000000000061",
    "operation_id": "00000000-0000-4000-8000-000000000061",
    "project_id": "00000000-0000-4000-8000-000000000061",
    "plan_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "revision": 1,
    "state": "completed",
    "baseline_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "baseline_ref": "refs/heads/main",
    "diagnostic": null,
    "created_at_ms": 1,
    "plan": {
      "format_version": 1,
      "installation_id": "00000000-0000-4000-8000-000000000061",
      "settings_e_tag": "\"one\"",
      "projects_root": "C:\\controlled",
      "destination": "C:\\controlled\\project",
      "parent_identity": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "template_digest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "files": [
        {
          "path": "AGENTS.md",
          "bytes": 1,
          "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        }
      ],
      "input": {
        "name": "Projeto controlado",
        "template_id": "engineering",
        "template_digest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "destination_relative": "project",
        "creation_mode": "remote_push",
        "base_branch": "main",
        "triage_enabled": true
      },
      "engineering": {
        "tracker": "github",
        "domain": "single-context",
        "instruction_file": "AGENTS.md",
        "triage_enabled": true,
        "installs_skills": false,
        "creates_labels": false
      },
      "account": {
        "state": "observed",
        "id": "account",
        "login": "operator"
      },
      "owner_id": "account",
      "effects": []
    }
  },
  "confirmed_effects": [
    {
      "step": "directory",
      "state": "confirmed"
    }
  ],
  "pending_effects": [],
  "effects": [],
  "remote_effects": [
    {
      "kind": "baseline_push",
      "operation_id": "00000000-0000-4000-8000-000000000061",
      "state": "unknown",
      "identity": {},
      "reason": null
    }
  ],
  "prerequisites": [
    {
      "code": "PROFILES_REQUIRED",
      "message": "Cadastre os perfis para iniciar.",
      "recovery": "Abra Perfis."
    }
  ],
  "diagnostics": [],
  "event_cursor": "1"
};
  const requests = [], results = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const assert = (value, message) => { if (!value) throw new Error(message); };
  let state = 'completed', failRead = false, op = null;
  const settings = { settings: { id: 'local', installation_id: f.creation.id, account_id: 'account', designated_host: null, projects_root: 'C:\\controlled', automation_enabled: false, revision: 1, created_at_ms: 1, updated_at_ms: 1, time_defaults: { format_version: 1, polling_interval_ms: 15000, passage_active_time_ms: 1800000, question_ttl: { state: 'not_configured' } }, artifact_policy: { format_version: 1, automatic_deletion: false } }, profiles: [], profile_counts: { all: 0, implementer: 0, reviewer: 0 }, onboarding: { suppressed: true, completed_at_ms: null, first_incomplete_step: null, prerequisites: [] }, selection_capabilities: { projects_root: { available: false }, gh_executable: { available: false } }, event_cursor: '1' };
  const options = { catalog: { id: 'engineering', version: 1, digest: 'a'.repeat(64) }, templates: [{ id: 'engineering', digest: 'a'.repeat(64), label: 'Engenharia', engineering_summary: 'Engenharia incluída' }], projects_root: 'C:\\controlled', account: f.creation.plan.account, prerequisites: [{ code: 'SCAFFOLD_GIT_IDENTITY_REQUIRED', message: 'Configure a identidade Git.', recovery: 'Abra Configuração.' }], creation_modes: ['local', 'remote_no_push', 'remote_push'].map(mode => ({ mode, capability: { available: true } })), event_cursor: '1' };
  const reply = async (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { ETag: '"one"' }, body: JSON.stringify(data) });
  await page.route('**/api/**', async route => {
    const r = route.request(), u = new URL(r.url()), p = u.pathname;
    requests.push({ path: p, query: u.search, method: r.method(), body: r.postData() });
    if (p.endsWith('/session')) return reply(route, { csrf_token: 'controlled', instance_id: f.creation.id });
    if (p.endsWith('/settings')) return reply(route, settings);
    if (p.endsWith('/scaffold/options')) return reply(route, options);
    if (p.endsWith('/scaffold/plans')) return reply(route, { plan: { ...f.creation.plan, input: JSON.parse(r.postData()), effects: ['create_directory', 'initialize_git'] }, plan_hash: f.creation.plan_hash, prerequisites: options.prerequisites });
    if (p.includes('/scaffold/creations/')) {
      if (failRead) return reply(route, { code: 'UNAVAILABLE', message: 'Consulta da criação indisponível.', request_id: 'controlled' }, 503);
      return reply(route, { ...f, creation: { ...f.creation, state } });
    }
    if (p.endsWith('/diagnostics')) {
      if (r.method() === 'POST') { op = r.headers()['idempotency-key']; return reply(route, { code: 'DIAGNOSTIC_CONTEXT_CHANGED', message: 'Falha original da verificação.', request_id: 'controlled' }, 409); }
      return reply(route, { context: { scope: 'creation', id: f.creation.id }, supported_checks: ['resources', 'configuration', 'github_identity'], diagnostics: [], reports: [], event_cursor: '1' });
    }
    if (p.includes('/operations/')) return reply(route, { code: 'UNAVAILABLE', message: 'Consulta original indisponível.', request_id: 'controlled' }, 503);
    if (p.includes('/events/stream')) return route.fulfill({ contentType: 'text/event-stream', body: ': controlled\n\n' });
    return reply(route, { items: [], next_cursor: null, has_more: false, event_cursor: '1' });
  });
  const activate = async node => { await node.focus(); await page.keyboard.press('Enter'); };
  const keyboardProof = async () => {
    const seen = new Map();
    for (let i = 0; i < 100; i++) {
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => { const el = document.activeElement, style = getComputedStyle(el); return { text: el.getAttribute('aria-label') || el.id || el.textContent, contained: !!el.closest('[role="dialog"]'), visible: el.matches(':focus-visible'), outline: style.outlineStyle, shadow: style.boxShadow }; });
      assert(focus.contained, 'Focus escaped dialog');
      assert(focus.visible && (focus.outline !== 'none' || focus.shadow !== 'none'), 'Focus is not visibly marked');
      seen.set(focus.text, focus);
    }
    await page.keyboard.press('Shift+Tab');
    assert(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), 'Reverse focus escaped');
    return [...seen.values()];
  };
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const name = viewport.width === 1440 ? 'desktop' : 'mobile';
    failRead = false; state = 'completed';
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4310/#principal/projetos');
    await page.reload();
    const trigger = page.getByRole('button', { name: 'Criar projeto', exact: true });
    await trigger.waitFor(); await activate(trigger);
    await page.locator('#creation-name').fill('Projeto controlado');
    await activate(page.locator('#creation-mode'));
    await activate(page.getByRole('button', { name: 'Remoto com push', exact: true }));
    await page.locator('#creation-remote-name').waitFor();
    await page.getByRole('button', { name: 'Revisar plano', exact: true }).waitFor();
    const formControls = await keyboardProof();
    await page.screenshot({ path: `docs/Docs20261022_160728/sprint006-${name}-form.png` });
    await activate(page.getByRole('button', { name: 'Revisar plano', exact: true }));
    await page.locator('#creation-plan-title').waitFor();
    assert(await page.getByRole('link', { name: 'Corrigir condições globais na Configuração' }).count() === 1, 'Plan correction missing');
    const planControls = await keyboardProof();
    const authorization = page.getByRole('checkbox');
    await authorization.focus(); await page.keyboard.press('Space');
    assert(await page.getByRole('dialog').getByRole('button', { name: 'Criar projeto', exact: true }).isEnabled(), 'Authorization control not operable');
    await authorization.focus(); await page.keyboard.press('Space');
    assert(await page.getByRole('dialog').getByRole('button', { name: 'Criar projeto', exact: true }).isDisabled(), 'Authorization did not clear');
    await page.screenshot({ path: `docs/Docs20261022_160728/sprint006-${name}-plan.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    assert(await trigger.evaluate(el => el === document.activeElement), 'Close did not restore the creation trigger');
    // Open a persisted result through its supported hash; no creation is sent.
    await activate(trigger);
    await page.goto(`http://127.0.0.1:4310/#principal/projetos?dialog=partial&creationId=${f.creation.id}`);
    await page.getByRole('heading', { name: 'Criação concluída', exact: true }).waitFor();
    assert(await page.getByText('Publicar commit inicial', { exact: true }).count() === 1, 'Duplicate effect');
    const refresh = page.getByRole('button', { name: 'Atualizar leitura das condições', exact: true });
    await activate(refresh); await page.waitForTimeout(200);
    assert(await refresh.evaluate(el => el === document.activeElement), 'Refresh focus lost');
    const before = requests.filter(r => r.method === 'POST' && r.path.endsWith('/diagnostics')).length;
    await activate(page.getByRole('button', { name: 'Verificar recursos', exact: true }));
    await page.getByText('Falha original da verificação.', { exact: true }).waitFor();
    const consult = page.getByRole('button', { name: 'Consultar resultado original', exact: true }); await consult.waitFor();
    await activate(consult); await page.waitForTimeout(650);
    await page.getByText('Não foi possível consultar o resultado. Tente consultar novamente; a verificação não será reenviada.', { exact: true }).waitFor();
    assert(await page.getByText('Falha original da verificação.', { exact: true }).count() > 0, 'Original error lost');
    assert(requests.filter(r => r.method === 'POST' && r.path.endsWith('/diagnostics')).length === before + 1, 'Repeated verification');
    await page.screenshot({ path: `docs/Docs20261022_160728/sprint006-${name}-completed.png` });
    failRead = true;
    await activate(page.getByRole('button', { name: 'Consultar criação novamente', exact: true }));
    await page.getByText('Resultado anterior. Atualize a leitura antes de uma nova ação.', { exact: true }).waitFor();
    assert(await page.getByRole('heading', { name: 'Criação concluída', exact: true }).count() === 1, 'Previous creation erased');
    failRead = false; state = 'partial';
    await activate(page.getByRole('button', { name: 'Consultar criação novamente', exact: true }));
    await page.getByRole('heading', { name: 'Criação parcial', exact: true }).waitFor();
    const dialog = page.getByRole('dialog');
    const resultControls = await keyboardProof();
    await page.screenshot({ path: `docs/Docs20261022_160728/sprint006-${name}-partial.png` });
    const assets = await page.evaluate(async () => Promise.all([...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(async el => { const url = el.src || el.href, bytes = await (await fetch(url)).arrayBuffer(); return { url, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('') }; })));
    results.push({ viewport, assets, formControls, planControls, resultControls, diagnosticOperation: op, horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
    await page.keyboard.press('Escape');
    assert(await dialog.count() === 0, 'Dialog stayed open');
    await page.waitForTimeout(150);
    assert(await trigger.evaluate(el => el === document.activeElement), 'Result close did not restore the trigger');
  }
  assert(requests.every(r => !(r.method === 'POST' && (/\/scaffold\/creations/.test(r.path) || /reconcile/.test(r.path)))), 'Business effect sent');
  assert(requests.filter(r => r.path.endsWith('/diagnostics') && r.method === 'POST').every(r => r.query.includes('scope=creation') && JSON.parse(r.body).checks[0] === 'resources'), 'Wrong diagnostic context');
  await page.goto('about:blank'); await page.unroute('**/api/**');
  return { results, errors, requests, browser: page.context().browser().version(), at: new Date().toISOString() };
}
