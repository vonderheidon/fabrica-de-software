// Execute this function with Playwright against the built application or Vite.
// Every API call is intercepted. No user configuration or external resource is changed.
async (page) => {
  const selectCustom = async (control, value) => {
    await control.click();
    await control.locator('..').locator(`.custom-select-options > button[data-value=${JSON.stringify(value)}]`).click();
  };
  const customOptionText = async (control, value) => {
    await control.click();
    const text = await control.locator('..').locator(`.custom-select-options > button[data-value=${JSON.stringify(value)}]`).textContent();
    await control.click();
    return text;
  };
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const origin = new URL(page.url()).origin;
  const id = number => `abcdef12-1234-4123-8123-${String(number).padStart(12, '0')}`;
  const projectId = id(1), creationId = id(2), attemptId = id(3);
  const hash = 'a'.repeat(64), now = 1792410000000;
  const prerequisites = [
    { code: 'PROJECT_REQUIRED', message: 'GitHub Project and Status mapping are missing.', recovery: 'Configure exact IDs.' },
    { code: 'PROFILES_REQUIRED', message: 'Both execution roles require profiles.', recovery: 'Configure profiles.' },
    { code: 'EXECUTION_REVALIDATION_REQUIRED', message: 'Registration and configuration do not authorize execution.', recovery: 'Revalidate preparation.' },
  ];
  const project = { id: projectId, name: 'teste667', account_id: 'ACCOUNT_fixture', source: { kind: 'local', location: 'C:\\Projetos\\uma-pasta-com-nome-longo\\teste667', repository_id: 'REPO_fixture', repository_url: 'https://github.com/fixture/teste667' }, base_branch: 'main', revision: 1, current_revision_id: id(4), prerequisites };
  const profiles = ['implementer', 'reviewer'].map((role, index) => ({ id: id(10 + index), name: role === 'implementer' ? 'Implementador principal' : 'Revisor principal', profile_type: role, executor: 'maestri-omp', provider: 'fixture', model: 'fixture', effort: null, guidance: '', revision: 1, created_at_ms: now, updated_at_ms: now }));
  const settings = { settings: { id: 'local', installation_id: id(5), account_id: 'ACCOUNT_fixture', designated_host: 'fixture', projects_root: 'C:\\Projetos', automation_enabled: false, time_defaults: { format_version: 1, polling_interval_ms: 15000, passage_active_time_ms: 60000, question_ttl: { state: 'not_configured' } }, artifact_policy: { format_version: 1, automatic_deletion: false }, revision: 1, created_at_ms: now, updated_at_ms: now }, profiles, profile_counts: { all: 2, implementer: 1, reviewer: 1 }, onboarding: { suppressed: true, completed_at_ms: now, first_incomplete_step: null, prerequisites: [] }, selection_capabilities: { projects_root: { available: false }, gh_executable: { available: false } }, event_cursor: '10' };
  const configuration = { ...settings, configuration: { id: id(4), project_id: projectId, revision: 1, created_at_ms: now, source: project.source, base_branch: 'main', github_project: null, implementer_profile_id: null, reviewer_profile_id: null, checks: [], correction_limit: 2, default_delivery_mode: 'icr', automation_enabled: false, queue_order: { priority_field_id: null, priority_direction: 'asc', use_board_position: false }, guidance: '' }, prerequisites };
  const boards = [1, 2, 3].map(number => ({ id: `BOARD_${number}`, title: `Quadro ${number}`, number, owner: { id: 'OWNER_fixture', login: 'fixture' }, url: `https://github.com/users/fixture/projects/${number}`, closed: false }));
  const scaffoldOptions = { catalog: { id: 'fixture', version: 1, digest: hash }, templates: [{ id: 'engineering.v1', digest: hash, label: 'Configuração de engenharia', engineering_summary: 'Tracker GitHub e instruções de engenharia em AGENTS.md.' }], projects_root: 'C:\\Projetos', creation_modes: ['local', 'remote_no_push', 'remote_push'].map(mode => ({ mode, capability: { available: true } })), account: { state: 'complete', id: 'ACCOUNT_fixture', login: 'fixture' }, prerequisites: [], event_cursor: '10' };
  const steps = ['directory', 'files', 'git', 'baseline', 'registration'];
  const effectKinds = ['create_repository', 'associate_origin', 'baseline_push'];
  let creationState = 'completed', creationMode = 'remote_push', currentPlan;
  let failCreationRead = false, unknownEffect = false, creationSends = 0, reconcileSends = 0, optionsReads = 0;
  const unexpected = [], errors = [], warnings = [], passed = [];
  let issueSelectionScenario = false;
  let recoverStartScenario = false;
  let hideSecondIssue = false;
  const preparedIssues = [];
  const prepared = new Map();
  const issueChoices = [1, 2].map(number => ({ id: `ITEM_${number}`, content_id: `ISSUE_${number}`, kind: 'issue', executable: true, title: `Trabalho ${number}`, archived: false, url: null, reasons: ['ISSUE_REVALIDATION_REQUIRED'] }));
  const pageError = error => errors.push(error.message);
  const consoleMessage = message => { if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text()); };
  page.on('pageerror', pageError); page.on('console', consoleMessage);
  const planFor = input => ({ format_version: 1, input, installation_id: id(5), settings_e_tag: 'fixture', projects_root: 'C:\\Projetos', destination: 'C:\\Projetos\\teste667', parent_identity: hash, template_digest: hash, files: [{ path: 'README.md', bytes: 100, sha256: hash }, { path: 'AGENTS.md', bytes: 200, sha256: hash }], engineering: { tracker: 'github', domain: 'single-context', instruction_file: 'AGENTS.md', triage_enabled: false, installs_skills: false, creates_labels: false }, account: scaffoldOptions.account, owner_id: 'ACCOUNT_fixture', owner_login: 'fixture', effects: ['create_directory', 'write_template_and_engineering', 'initialize_git', 'create_conventional_baseline', ...(input.creation_mode === 'local' ? [] : input.creation_mode === 'remote_no_push' ? effectKinds.slice(0, 2) : effectKinds), 'register_local_project'] });
  const creationView = () => {
    const plan = currentPlan ?? planFor({ name: 'teste667', template_id: 'engineering.v1', template_digest: hash, destination_relative: 'teste667', creation_mode: creationMode, base_branch: 'main', triage_enabled: false });
    const kinds = creationMode === 'local' ? [] : effectKinds;
    const effects = kinds.map((kind, index) => ({ operation_id: id(20 + index), attempt_id: null, creation_id: creationId, delivery_id: null, kind, scope_key: 'fixture', state: unknownEffect && index === 0 ? 'unknown' : creationMode === 'remote_no_push' && index === 2 ? 'not_requested' : 'confirmed', expected_identity: {}, confirmed_identity: null, receipt: { id: 'REMOTE_INTERNAL_ID', url: 'https://github.com/fixture/teste667', commit_sha: 'b'.repeat(40), branch_ref: 'refs/heads/main' }, reason: null, authorized: true, revision: 1, sent_at_ms: now, confirmed_at_ms: now }));
    return { creation: { id: creationId, operation_id: id(30), project_id: creationState === 'completed' ? projectId : null, plan_hash: hash, plan, state: creationState, revision: 1, baseline_sha: 'b'.repeat(40), baseline_ref: 'refs/heads/main', diagnostic: creationState === 'failed' ? 'SCAFFOLD_GIT_FAILED' : null, created_at_ms: now }, effects, remote_effects: effects.map(effect => ({ kind: effect.kind, state: effect.state, operation_id: effect.operation_id, identity: { repository_id: 'REMOTE_INTERNAL_ID', commit_sha: 'b'.repeat(40) }, reason: effect.reason })), confirmed_effects: steps.slice(0, creationState === 'completed' ? 5 : 2).map(step => ({ step, state: 'confirmed' })), pending_effects: creationState === 'completed' ? [] : steps.slice(2).map(step => ({ step, state: 'not_started' })), prerequisites, diagnostics: [], event_cursor: '10' };
  };
  const events = ['creation.accepted', 'creation.files.confirmed', 'creation.completed'].map((event_type, index) => ({ seq: String(index + 1), entity_type: 'creation', entity_id: creationId, operation_id: id(30), event_type, entity_revision: 1, occurred_at_ms: now, facts: {}, project_id: projectId }));
  const api = async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
    const reply = (json, status = 200) => route.fulfill({ status, json, headers: { etag: '"fixture"' } });
    if (path === '/api/v1/session') return reply({ csrf_token: 'c'.repeat(43), instance_id: id(40) });
    if (issueSelectionScenario && method === 'POST' && path.endsWith('/preparations')) {
      const choices = request.postDataJSON();
      preparedIssues.push(choices.issue_id);
      const preparation = { ...choices, id: id(50 + preparedIssues.length), project_id: projectId, project_revision_id: id(4), revision: 1, prerequisites: [],
        effective_configuration: { configuration: configuration.configuration, implementer_profile: profiles[0], reviewer_profile: profiles[1], time_defaults: settings.settings.time_defaults, artifact_policy: settings.settings.artifact_policy, origins: {} },
        issue: { id: choices.issue_id, number: choices.issue_id === 'ISSUE_1' ? 1 : 2, title: choices.issue_id === 'ISSUE_1' ? 'Trabalho 1' : 'Trabalho 2', state: 'OPEN', assignees: [] },
        criteria_preview: { executable: true, criteria: [], reasons: [] }, effects_preview: [], base_sha: 'b'.repeat(40), summary_hash: hash, can_start: false };
      prepared.set(preparation.id, preparation);
      return reply({ preparation, event_cursor: '10' }, 201);
    }
    if (issueSelectionScenario && method === 'PUT' && path.startsWith('/api/v1/preparations/')) {
      const preparationId = path.split('/').at(-1);
      const current = prepared.get(preparationId);
      const preparation = { ...current, ...request.postDataJSON().changes, revision: current.revision + 1, summary_hash: 'd'.repeat(64) };
      prepared.set(preparationId, preparation);
      return reply({ preparation, event_cursor: '10' });
    }
    if (method === 'POST' && path === '/api/v1/scaffold/plans') { const input = request.postDataJSON(); creationMode = input.creation_mode; currentPlan = planFor(input); return reply({ plan_hash: hash, plan: currentPlan, prerequisites: [] }); }
    if (method === 'POST' && path === '/api/v1/scaffold/creations') { creationSends++; return reply({ operation_id: request.headers()['idempotency-key'], resource: { type: 'creation', id: creationId }, status_url: '/fixture', request_id: 'fixture' }, 202); }
    if (method === 'POST' && path.endsWith('/reconcile')) { reconcileSends++; return reply({ operation_id: request.headers()['idempotency-key'], resource: { type: 'creation', id: creationId }, status_url: '/fixture', request_id: 'fixture' }, 202); }
    if (method !== 'GET') { unexpected.push(`${method} ${path}`); return route.abort(); }
    if (issueSelectionScenario && path.startsWith('/api/v1/preparations/')) return reply({ preparation: prepared.get(path.split('/').at(-1)), event_cursor: '10' });
    if (issueSelectionScenario && path.endsWith('/issues')) return reply({ items: hideSecondIssue ? issueChoices.slice(0, 1) : issueChoices, has_more: hideSecondIssue, next_cursor: hideSecondIssue ? 'more' : null, completeness: 'complete', diagnostics: [], prerequisites: [], retry_at_ms: null, event_cursor: '10' });
    if (issueSelectionScenario && path === '/api/v1/queue') return reply({ enabled: false, complete: true, valid: true, eligible_total: 0, observed_at_ms: now, event_cursor: '10', page: { items: issueChoices.map((issue, index) => ({ project_id: projectId, project_name: 'teste667', item_id: issue.id, issue_id: issue.content_id, number: index + 1, title: issue.title, status: 'Ready', ready: true, ready_eligible: true, eligible: false, reasons: ['AUTOMATION_DISABLED'] })), has_more: false, next_cursor: null } });
    if (path === '/api/v1/settings') return reply(settings);
    if (path === '/api/v1/projects') return reply({ items: [project], has_more: false, next_cursor: null, event_cursor: '10' });
    if (path === `/api/v1/projects/${projectId}`) return reply({ project, prerequisites, event_cursor: '10' });
    if (path.endsWith('/configuration')) return reply(configuration);
    if (path.endsWith('/configuration-options')) { optionsReads++; return reply({ account: { id: 'ACCOUNT_fixture', login: 'fixture' }, projects: { items: boards, has_more: false, next_cursor: null }, status_fields: url.searchParams.has('github_project_id') ? [{ id: 'STATUS_fixture', name: 'Status', options: ['Ready', 'In progress', 'In review', 'Done'].map((name, index) => ({ id: `OPTION_${index}`, name })) }] : [], completeness: 'complete', diagnostics: [], retry_at_ms: null, event_cursor: '10' }); }
    if (path.endsWith('/issues')) return reply({ items: [], has_more: false, next_cursor: null, event_cursor: '10', completeness: 'unavailable', diagnostics: [], retry_at_ms: null, prerequisites: [prerequisites[0]] });
    if (path === '/api/v1/scaffold/options') return reply(scaffoldOptions);
    if (path === `/api/v1/scaffold/creations/${creationId}`) return failCreationRead ? reply({ code: 'STORAGE_UNAVAILABLE', message: 'Storage unavailable' }, 503) : reply(creationView());
    if (path.startsWith('/api/v1/operations/')) return reply({ operation_id: path.split('/').at(-1), state: recoverStartScenario ? 'accepted' : 'succeeded', resource: recoverStartScenario ? { type: 'attempt', id: attemptId } : { type: 'creation', id: creationId }, error: null, receipt: { revision: 1, event_cursor: '10' } });
    if (path === '/api/v1/events') return reply({ items: events, has_more: false, next_cursor: null, event_cursor: '10' });
    if (path === '/api/v1/attempts') return reply({ items: [{ id: attemptId, project_id: projectId, issue_id: 'ISSUE_fixture', issue_number: 7, phase: 'finished', result: 'delivered', suspension: null, revision: 1, created_at_ms: now, updated_at_ms: now }], has_more: false, next_cursor: null, event_cursor: '10' });
    if (path === '/api/v1/diagnostics') return reply({ context: url.searchParams.get('scope') === 'project' ? { scope: 'project', id: projectId } : { scope: 'host' }, facts: {}, diagnostics: prerequisites.slice(0, 2).map(item => ({ check: 'configuration', code: item.code, state: 'blocked', cause: item.message, recovery: item.recovery, facts: {}, affected_requirements: [], observed_at_ms: now })), reports: [], supported_checks: ['configuration'], event_cursor: '10' });
    if (path === '/api/v1/queue') return reply({ scope: { kind: 'account' }, enabled: false, valid: false, complete: false, account: { id: null, login: null }, observed_at_ms: now, eligible_total: null, page: { items: [], has_more: false, next_cursor: null }, modes_by_project: [], order: { description: 'Sort by internal ID fallback', priority_available: false, board_position_available: false }, diagnostics: [{ code: 'PROJECT_NOT_READY', message: 'teste667: quadro ausente.', recovery: 'Configure os IDs do Project e do repositório.' }], event_cursor: '10' });
    return reply({ code: 'CONTROLLED_TEST_RESOURCE', message: 'Fora do cenário controlado.' }, 503);
  };
  await page.route('**/api/v1/**', api);
  const navigate = async hashRoute => { await page.goto(`${origin}/${hashRoute}`); await page.waitForLoadState('networkidle'); };
  const screenshot = name => page.screenshot({ path: `.playwright-mcp/feedback-v2-${name}.png`, fullPage: true });
  try {
    await navigate(`#principal/configuracao?projectId=${projectId}`);
    await customOptionText(page.locator('#field-github-project'), 'BOARD_1');
    assert(optionsReads > 0, 'V2-01: initial empty mapping must request options');
    await page.getByLabel('Branch-base', { exact: true }).fill('release/edicao-preservada');
    await selectCustom(page.getByLabel('GitHub Project', { exact: true }), 'BOARD_1');
    await customOptionText(page.locator('#field-campo-status'), 'STATUS_fixture');
    assert(await page.getByLabel('Branch-base', { exact: true }).inputValue() === 'release/edicao-preservada', 'V2-01: board fetch must preserve the draft');
    assert((await page.locator('.configuration-guidance').last().innerText()).includes('qualquer modo'), 'V2-09: guidance must require mapping for all modes');
    await screenshot('configuration'); passed.push('V2-01, V2-09: quadro vazio carrega, dependências atualizam e edição fica preservada');

    await navigate(`#principal/projetos?projectId=${projectId}&dialog=preparation`);
    const dialog = page.getByRole('dialog');
    await page.waitForFunction(() => document.querySelector('#preparation-project')?.value === 'teste667');
    await dialog.getByRole('link', { name: 'Configurar este projeto', exact: true }).waitFor();
    assert((await dialog.innerText()).includes('quadro GitHub'), 'V2-07: missing mapping must explain its cause');
    await dialog.getByRole('button', { name: 'Consultar issues novamente', exact: true }).click();
    await screenshot('preparation');
    await dialog.getByRole('link', { name: 'Configurar este projeto', exact: true }).click();
    await page.locator('#field-github-project').waitFor();
    passed.push('V2-07, V2-08: preparação mostra nome, causa, nova consulta e acesso ao mapeamento');

    await navigate('#principal/projetos');
    assert(!(await page.locator('.project-catalog').innerText()).includes('Both execution roles'), 'V2-05: legacy English prerequisites must be translated');
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot('mobile-projects');
    const layout = await page.locator('.project-catalog').evaluate(element => ({ width: element.getBoundingClientRect().width, overflow: document.documentElement.scrollWidth > innerWidth, actions: [...element.querySelectorAll('button,a')].map(action => { const rect = action.getBoundingClientRect(); return { left: rect.left, right: rect.right }; }) }));
    assert(!layout.overflow && layout.actions.every(action => action.left >= 0 && action.right <= 390), 'V2-13: mobile actions must fit the viewport');
    assert(await page.locator('.project-catalog tr').last().evaluate(element => getComputedStyle(element).display) === 'block', 'V2-13: mobile catalog must use stacked rows');
    passed.push('V2-05, V2-13: mensagens traduzidas e catálogo móvel sem ações cortadas');
    await page.setViewportSize({ width: 1440, height: 1000 });

    for (const mode of ['local', 'remote_no_push', 'remote_push']) {
      currentPlan = undefined; creationState = 'completed'; unknownEffect = false;
      await navigate('#principal/projetos?dialog=create');
      await dialog.locator('#creation-name').fill('teste667');
      await selectCustom(dialog.locator('#creation-mode'), mode);
      if (mode !== 'local') assert(await dialog.locator('#creation-owner-account').textContent() === 'fixture', 'V2-06: owner must be selected by login');
      await dialog.getByRole('button', { name: 'Revisar plano', exact: true }).click();
      await dialog.locator('#creation-plan-title').waitFor();
      assert(!(await dialog.innerText()).includes(hash), 'V2-06: plan hashes must be collapsed');
      await screenshot(`plan-${mode}`);
      const before = creationSends;
      assert(await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).isDisabled(), 'Creation requires explicit plan authorization');
      await dialog.getByRole('checkbox', { name: 'Confirmo uma vez este plano e seus efeitos.' }).check();
      await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click();
      await dialog.getByRole('heading', { name: 'Criação concluída', exact: true }).waitFor();
      assert(creationSends === before + 1, 'Creation must be sent exactly once');
      assert(await dialog.getByRole('heading', { name: 'Resultado da criação', exact: true }).count() === 1, 'V2-03: outer title must agree with result');
      assert(await dialog.locator('.creation-effect-row').count() === (mode === 'local' ? 0 : 3), 'V2-04: each remote effect must appear once');
      const visible = await dialog.innerText();
      assert(!visible.includes(creationId) && !visible.includes('REMOTE_INTERNAL_ID') && !visible.includes('refs/heads/main') && !visible.includes('confirmed') && !visible.includes('GitHub Project and'), 'V2-05, V2-06: result hides identifiers and translates states and prerequisites');
      await screenshot(`completed-${mode}`);
      await dialog.getByRole('button', { name: 'Fechar diálogo', exact: true }).click();
      assert(!page.url().includes('creationId'), 'V2-02: closing must clear stale creation identity');
      await page.getByRole('button', { name: 'Criar projeto', exact: true }).click();
      await dialog.locator('#creation-name').waitFor();
      assert(await dialog.locator('#creation-name').inputValue() === '', 'V2-02: create again must open a new form');
      passed.push(`V2-02 a V2-06: percurso completo controlado ${mode}`);
    }

    creationState = 'partial'; unknownEffect = true; currentPlan = undefined; creationMode = 'remote_push';
    await navigate(`#principal/projetos?dialog=partial&creationId=${creationId}`);
    await dialog.getByRole('heading', { name: 'Criação parcial', exact: true }).waitFor();
    assert((await dialog.innerText()).includes('Sem confirmação'), 'Partial result must describe uncertain effects');
    const beforeReconcile = creationSends;
    await dialog.getByRole('button', { name: 'Conferir efeitos preservados', exact: true }).click();
    await dialog.getByText('Reconciliação confirmada. Os efeitos atualizados foram carregados.', { exact: true }).waitFor();
    assert(reconcileSends === 1 && creationSends === beforeReconcile, 'Recovery must not recreate the project');
    await screenshot('partial');
    creationState = 'failed'; failCreationRead = true;
    await page.reload(); await page.waitForLoadState('networkidle');
    await dialog.getByRole('button', { name: 'Tentar consulta', exact: true }).waitFor();
    failCreationRead = false;
    await dialog.getByRole('button', { name: 'Tentar consulta', exact: true }).click();
    await dialog.getByRole('heading', { name: 'Criação falhou', exact: true }).waitFor();
    assert(creationSends === beforeReconcile, 'Read retry after reload must never resubmit creation');
    await screenshot('failed'); passed.push('Criação parcial, efeito incerto, conferência e falha de leitura após recarga sem repetir criação');

    await navigate('#principal/tentativas');
    await customOptionText(page.locator('#attempt-project-filter'), projectId);
    await selectCustom(page.locator('#attempt-project-filter'), projectId);
    assert(page.url().includes(`projectId=${projectId}`), 'V2-12: history project selection must update URL context');
    await screenshot('attempts');
    await navigate(`#principal/registros?projectId=${projectId}`);
    await page.getByText('Criação de projeto concluída', { exact: true }).waitFor();
    assert(!(await page.locator('.records-panel').innerText()).includes('Atualização técnica registrada'), 'V2-10: persisted events need readable labels');
    await selectCustom(page.locator('#diagnostic-scope'), 'project');
    await selectCustom(page.locator('#diagnostic-project'), projectId);
    await page.locator('.diagnostics-panel').getByRole('link', { name: 'Configurar este projeto', exact: true }).first().waitFor();
    await screenshot('records');
    await selectCustom(page.locator('#diagnostic-scope'), 'creation');
    await customOptionText(page.locator('#diagnostic-context-choice'), creationId);
    assert((await customOptionText(page.locator('#diagnostic-context-choice'), creationId)).includes('teste667'), 'V2-12: creations must be selectable by project name');
    await selectCustom(page.locator('#diagnostic-scope'), 'attempt');
    await customOptionText(page.locator('#diagnostic-context-choice'), attemptId);
    assert((await customOptionText(page.locator('#diagnostic-context-choice'), attemptId)).includes('Issue #7'), 'V2-12: attempts must be selectable by issue');
    passed.push('V2-10, V2-12: eventos conhecidos, diagnóstico acionável e seletores por nome/issue');

    await navigate('#principal/fila');
    await page.getByRole('heading', { name: 'Issues e elegibilidade', exact: true }).waitFor();
    const queueText = await page.locator('.queue-panel').innerText();
    assert(queueText.includes('não indica falha de autenticação') && !queueText.includes('Configure os IDs') && !queueText.includes('Sort by internal ID'), 'V2-11: queue must explain account observation and hide internal ordering');
    await screenshot('queue'); passed.push('V2-11: fila explica observação da conta e orienta configuração por nome');
    issueSelectionScenario = true;
    await navigate(`#principal/dashboard?projectId=${projectId}`);
    await page.getByRole('button', { name: 'Preparar issue', exact: true }).click();
    await customOptionText(dialog.locator('#preparation-issue'), 'ISSUE_1');
    await selectCustom(dialog.locator('#preparation-issue'), 'ISSUE_1');
    await dialog.getByRole('heading', { name: 'Escolhas efetivas', exact: true }).waitFor();
    assert(preparedIssues.at(-1) === 'ISSUE_1', 'Generic preparation must still allow manual selection');
    await dialog.getByRole('button', { name: 'Revisar e autorizar resumo atual', exact: true }).click();
    await dialog.getByRole('button', { name: 'Iniciar tentativa', exact: true }).waitFor({ timeout: 3000 });
    assert(!(await dialog.innerText()).includes('Impedimentos desta issue'), 'A prepared issue must not retain the catalog revalidation notice as a blocker');
    await dialog.locator('#preparation-guidance').fill('Orientação revisada');
    await page.waitForFunction(() => document.querySelector('.preparation-actions button')?.textContent === 'Revisar e autorizar resumo atual' && !document.querySelector('.preparation-actions button')?.disabled);
    await dialog.getByRole('button', { name: 'Revisar e autorizar resumo atual', exact: true }).click();
    await dialog.getByRole('button', { name: 'Iniciar tentativa', exact: true }).waitFor({ timeout: 3000 });
    assert([...prepared.values()].some(item => item.guidance === 'Orientação revisada' && item.revision === 2), 'Editing must save, invalidate authorization and allow the new summary to be authorized');
    passed.push('Resumo sem alterações pode ser autorizado e não exibe a revalidação inicial como impedimento');
    await dialog.getByRole('button', { name: 'Fechar diálogo', exact: true }).click();
    for (const number of [2, 1]) {
      const candidate = page.locator('.dashboard-candidates li').filter({ hasText: `Trabalho ${number}` });
      await candidate.getByRole('button', { name: 'Preparar', exact: true }).click();
      await dialog.getByRole('heading', { name: 'Escolhas efetivas', exact: true }).waitFor();
      assert(await dialog.locator('#preparation-issue').getAttribute('data-value') === `ISSUE_${number}`, 'Clicked issue must be selected without a second choice');
      assert(preparedIssues.at(-1) === `ISSUE_${number}`, 'Preparation command must use the clicked issue instead of a cached issue from the same project');
      assert(new URL(page.url()).hash.includes(`issueId=ISSUE_${number}`), 'Issue context must survive navigation');
      await dialog.getByRole('button', { name: 'Fechar diálogo', exact: true }).click();
      assert(!page.url().includes('issueId='), 'Closing must clear selected issue context');
    }
    await page.locator('.dashboard-candidates li').filter({ hasText: 'Trabalho 2' }).getByRole('button', { name: 'Preparar', exact: true }).click();
    await page.reload();
    await dialog.getByRole('heading', { name: 'Escolhas efetivas', exact: true }).waitFor();
    assert(await dialog.locator('#preparation-issue').getAttribute('data-value') === 'ISSUE_2', 'Reload must retain the issue selected through the dashboard');
    hideSecondIssue = true;
    await page.reload();
    await dialog.getByRole('heading', { name: 'Escolhas efetivas', exact: true }).waitFor();
    assert(await dialog.locator('#preparation-issue').getAttribute('data-value') === 'ISSUE_2', 'A clicked issue outside the first catalog page must remain selected');
    assert(await dialog.locator('#preparation-issue').textContent() === 'Trabalho 2', 'The preparation response must supply the selected issue title outside the first page');
    await screenshot('clicked-issue');
    passed.push('Preparar leva a issue clicada ao diálogo, isola rascunhos por issue e preserva seleção após recarga');
    recoverStartScenario = true;
    await page.evaluate(operationId => sessionStorage.setItem('factory.uncertain-operations.v1', JSON.stringify([{ operationId, kind: 'attempt-start', recordedAt: Date.now() }])), id(90));
    await page.reload();
    await page.waitForURL(url => url.hash.includes(attemptId));
    assert(await page.evaluate(() => sessionStorage.getItem('factory.uncertain-operations.v1')) === null, 'A confirmed start must clear the uncertain operation and open the existing attempt');
    passed.push('Início com resposta perdida abre a tentativa confirmada sem reenviar o comando');
    assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
    assert(!warnings.some(message => /same key|unique.*key/i.test(message)), 'V2-04: no duplicate React keys');
    assert(unexpected.length === 0, `Unexpected mutations: ${unexpected.join('; ')}`);
    return { passed, creation_sends: creationSends, reconcile_sends: reconcileSends, browser_errors: errors, duplicate_key_warnings: warnings.filter(message => /same key|unique.*key/i.test(message)), unexpected_writes: unexpected };
  } finally {
    await page.unroute('**/api/v1/**', api);
    page.off('pageerror', pageError); page.off('console', consoleMessage);
  }
};
