// Playwright MCP proof for the existing UI after the retired mechanisms were removed.
// Run against the compiled bundle at http://127.0.0.1:4310; every API response is controlled.
async (page) => {
  const origin = 'http://127.0.0.1:4310';
  const output = '.cache/ui-removal-gate-20261028';
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
  const now = Date.UTC(2026, 9, 28, 12, 0, 0);
  const projectId = id(101);
  const issueId = 'ISSUE_fixture_42';
  const attemptFailedId = id(201);
  const attemptDeliveredId = id(202);
  const deliveryFailedId = id(301);
  const deliveryDeliveredId = id(302);
  const producerFailedId = id(401);
  const producerDeliveredId = id(402);
  const preparationIds = [id(501), id(502), id(503)];
  const screenshots = [];
  const requests = [];
  const mutations = [];
  const pageErrors = [];
  const unexpected = [];
  const focusEvidence = [];
  const dimensionSamples = [];
  const actionGeometry = [];
  const assetResponses = [];
  const views = { narrow: null, low: null };
  let configReads = 0;
  let configWrites = 0;
  let configRevision = 1;
  let savedGuidance = '';
  let savedBoardPosition = true;
  let preparationWrites = 0;
  let queueReads = 0;
  let queueMode = 'position';
  let queueWrites = 0;

  const timeDefaults = {
    format_version: 1,
    polling_interval_ms: 15000,
    passage_active_time_ms: 1800000,
    question_ttl: { state: 'not_configured' },
  };
  const artifactPolicy = { format_version: 1, automatic_deletion: false };
  const profiles = [
    { id: id(601), revision: 1, name: 'Implementador', profile_type: 'implementer', executor: 'maestri-omp', provider: 'controlled', model: 'controlled', effort: null, guidance: '', created_at_ms: now, updated_at_ms: now, composition_version: 1 },
    { id: id(602), revision: 1, name: 'Revisor', profile_type: 'reviewer', executor: 'maestri-omp', provider: 'controlled', model: 'controlled', effort: null, guidance: '', created_at_ms: now, updated_at_ms: now, composition_version: 1 },
  ];
  const settings = {
    settings: {
      id: 'local', installation_id: 'ui-removal-gate-20261028', account_id: 'account-fixture', designated_host: null,
      projects_root: 'C:/controlled/projects', automation_enabled: false, revision: 1,
      time_defaults: timeDefaults, artifact_policy: artifactPolicy, created_at_ms: now, updated_at_ms: now,
    },
    profiles,
    profile_counts: { all: 2, implementer: 1, reviewer: 1 },
    onboarding: { suppressed: true, completed_at_ms: now, first_incomplete_step: null, prerequisites: [] },
    selection_capabilities: {
      projects_root: { available: false, reason_code: 'CONTROLLED_TEST' },
      gh_executable: { available: false, reason_code: 'CONTROLLED_TEST' },
    },
    event_cursor: '1',
    tool_preferences: {
      format_version: 1,
      git: { preferred_path: null, last_validated_at_ms: null },
      maestri: { preferred_path: null, last_validated_at_ms: null },
      omp: { preferred_path: null, last_validated_at_ms: null },
      powershell: { preferred_path: null, last_validated_at_ms: null },
    },
  };
  const mapping = {
    id: 'PVT_controlled', owner_id: 'OWNER_controlled', status_field_id: 'FIELD_status',
    status_option_ids: { backlog: 'OPT_backlog', ready: 'OPT_ready', in_progress: 'OPT_progress', in_review: 'OPT_review', delivered: 'OPT_done' },
  };
  const projectSummary = {
    deletion: null, id: projectId, name: 'Projeto controlado', account_id: 'account-fixture',
    source: { kind: 'github', location: 'https://github.com/example/project', repository_id: 'REPO_controlled', repository_url: 'https://github.com/example/project' },
    base_branch: 'main', revision: 1, current_revision_id: id(701), prerequisites: [],
  };
  const projectConfiguration = {
    source: { ...projectSummary.source }, base_branch: 'main', delivery_branch: null, github_project: mapping,
    implementer_profile_id: profiles[0].id, reviewer_profile_id: profiles[1].id, correction_limit: 2,
    default_delivery_mode: 'icr', automation_enabled: false, queue_order: { use_board_position: true }, guidance: '',
  };
  const projectStorage = {
    managed_root: null, original_path: 'C:/controlled/operator-project', locations: [], transition_plan: null,
    active_transition_operation_id: null, state: 'legacy', cause: null, recovery: null,
  };
  const prerequisites = [];
  const statusOptions = [
    ['OPT_backlog', 'Backlog'], ['OPT_ready', 'Ready'], ['OPT_progress', 'In progress'],
    ['OPT_review', 'In review'], ['OPT_done', 'Done'],
  ].map(([optionId, name]) => ({ id: optionId, name }));
  const board = { id: mapping.id, owner: { id: mapping.owner_id, login: 'example', kind: 'organization' }, number: 1, title: 'Projeto', url: 'https://github.com/orgs/example/projects/1', closed: false };
  const statusFields = [{ id: mapping.status_field_id, name: 'Status', options: statusOptions }];

  const projectRevision = () => ({ ...projectConfiguration, guidance: savedGuidance, queue_order: { use_board_position: savedBoardPosition }, id: id(700 + configRevision), project_id: projectId, revision: configRevision, created_at_ms: now + configRevision });
  const settingsView = () => ({ ...settings, settings: { ...settings.settings, revision: configRevision } });
  const configurationView = () => ({
    deletion: null, configuration_lock: null, configuration: projectRevision(), storage: projectStorage,
    ...settingsView(), prerequisites,
  });
  const reply = (route, data, status = 200, etag = '"controlled"') => route.fulfill({ status, headers: etag ? { etag } : {}, json: data });
  const pageResult = items => ({ items, has_more: false, next_cursor: null, event_cursor: '1' });
  const issueOption = {
    id: 'ITEM_issue_42', content_id: issueId, kind: 'issue', number: 42, title: 'Issue controlada da tentativa',
    url: 'https://github.com/example/project/issues/42', assignees: [{ id: 'account-fixture', login: 'fixture' }],
    status: 'Ready', archived: false, executable: true, reasons: [], memberships: [],
  };
  const criteria = [{ id: 'ac-1', text: 'Evidência atual permanece vinculada à versão.', occurrence_index: 1, explicit: true }];
  const effectiveConfiguration = () => ({
    configuration: projectConfiguration, project_revision_id: projectSummary.current_revision_id, settings_revision: 1,
    implementer_profile: profiles[0], reviewer_profile: profiles[1], time_defaults: timeDefaults, artifact_policy: artifactPolicy,
    origins: { base_branch: 'project', implementer_profile: 'project', reviewer_profile: 'project', correction_limit: 'project', time_defaults: 'global', artifact_policy: 'global', guidance: 'project', delivery_mode: 'project' },
  });
  const preparationView = (preparationId, choice, previousAttemptId = null) => ({
    preparation: {
      id: preparationId, project_id: projectId, project_revision_id: projectSummary.current_revision_id, revision: 1,
      issue_id: choice.issue_id, delivery_mode: choice.delivery_mode ?? 'icr', guidance: choice.guidance ?? '', overrides: {},
      ...(previousAttemptId ? { previous_attempt_id: previousAttemptId } : {}),
      effective_configuration: effectiveConfiguration(),
      criteria_preview: { executable: true, objective: 'Objetivo controlado', criteria, digest: 'a'.repeat(64), reasons: [] },
      prerequisites: [], effects_preview: [],
      issue: { id: issueId, number: 42, title: 'Issue controlada da tentativa', state: 'OPEN', assignees: [{ login: 'fixture' }] },
      base_sha: 'a'.repeat(40), summary_hash: 'b'.repeat(64), can_start: false,
    },
    event_cursor: '1',
  });
  const attemptRows = [
    { id: attemptFailedId, project_id: projectId, issue_id: 'ISSUE_failed', issue_number: 41, issue_title: 'Falha registrada', phase: 'finished', result: 'failed', suspension: null, revision: 1, created_at_ms: now - 2000, updated_at_ms: now - 1000 },
    { id: attemptDeliveredId, project_id: projectId, issue_id: issueId, issue_number: 42, issue_title: 'Entrega aprovada', phase: 'finished', result: 'delivered', suspension: null, revision: 1, created_at_ms: now - 1000, updated_at_ms: now },
  ];
  const activeTime = { state: 'unavailable', reason: 'NOT_OBSERVED' };
  const stageActivity = { stage: 'finished', started_at_ms: now - 20000, elapsed_ms: 20000, last_activity_at_ms: now - 1000, observed_at_ms: now, deadline_at_ms: null, remaining_ms: null, tracking_state: 'tracked', availability: 'known', reason: null };
  const measurements = {
    stage_activity: stageActivity, active_time: activeTime, human_wait: activeTime, cost: activeTime,
    active_limit: { state: 'not_configured' }, question_ttl: { state: 'not_configured' }, active_limit_state: 'not_applicable',
    active_expired_at_ms: null, passages: [{ passage_id: producerDeliveredId, role: 'implementer', round: 1, active_time: activeTime, human_wait: activeTime, active_limit_state: 'not_applicable', active_expired_at_ms: null }], pending_requirements: [],
  };
  const publicationSummary = mode => ({
    mode, review_state: mode === 'pr' ? 'rejected' : 'approved', local_state: mode === 'pr' ? 'not_requested' : 'completed',
    confirmed_effects: 1, pending_effects: 0, unknown_effects: 0,
    commit: { state: 'not_requested', sha: null, reason: null, operation_id: null, branch_ref: null, task_type: null, task_description: null },
    upgrades: [], push: { state: 'not_requested', receipt: null, reason: null },
    pull_request: { state: 'not_requested', receipt: null, reason: null },
    complete_capability: { available: false, reason_code: 'CONTROLLED_TEST' },
    reconcile_capability: { available: false, reason_code: 'CONTROLLED_TEST' },
  });
  const deliverySummary = attemptId => {
    const isDelivered = attemptId === attemptDeliveredId;
    const deliveryId = isDelivered ? deliveryDeliveredId : deliveryFailedId;
    return {
      attempt_id: attemptId, delivery_id: deliveryId, original_mode: 'icr', authorized_mode: 'icr',
      review_state: isDelivered ? 'approved' : 'rejected', outcome: isDelivered ? 'icr_approved' : 'blocked',
      content_identity: isDelivered ? 'b'.repeat(40) : 'c'.repeat(40), approved_ref: isDelivered ? `refs/factory/deliveries/${deliveryId}` : null,
      code_location: 'C:/controlled/work', local_repository: null, branch_ref: null, commit_sha: null, pull_request_url: null,
      checkout_updated: false, pending_effects: [], limitations: [], criteria_satisfied: isDelivered ? 1 : 0, criteria_total: 1,
      resolved_findings: 0, details_url: `/api/v1/deliveries/${deliveryId}`,
    };
  };
  const attemptDetail = attemptId => {
    const isDelivered = attemptId === attemptDeliveredId;
    const deliveryId = isDelivered ? deliveryDeliveredId : deliveryFailedId;
    const producerPassageId = isDelivered ? producerDeliveredId : producerFailedId;
    return {
      id: attemptId, project_id: projectId, operation_id: id(isDelivered ? 801 : 802), passage_id: producerPassageId, round: 1,
      phase: 'finished', result: isDelivered ? 'delivered' : 'failed', suspension: null, tracking: 'tracked', diagnostic: isDelivered ? null : 'RESULT_REJECTED',
      result_receipt_id: id(isDelivered ? 811 : 812), delivery_id: deliveryId, revision: 1, event_cursor: '1', pending_question_id: null,
      stage_activity: stageActivity, expected_account_id: 'account-fixture', issue: { id: isDelivered ? issueId : 'ISSUE_failed', number: isDelivered ? 42 : 41, title: isDelivered ? 'Entrega aprovada' : 'Falha registrada', url: `https://github.com/example/project/issues/${isDelivered ? 42 : 41}` },
      selected_delivery_id: deliveryId, selected_round: 1, delivery_summary: deliverySummary(attemptId),
      publication: publicationSummary('icr'), measurements, cleanup: 'complete', authority: null,
      capabilities: { cancel: { available: false, reason_code: 'CONTROLLED_TEST' }, complete_publication: { available: false, reason_code: 'CONTROLLED_TEST' }, reconcile_publication: { available: false, reason_code: 'CONTROLLED_TEST' }, revalidate: { available: false, reason_code: 'CONTROLLED_TEST' } },
      block: null, v3_details: null, history_sections: [], details: null,
    };
  };
  const passageSummary = attemptId => ({
    id: attemptId === attemptDeliveredId ? producerDeliveredId : producerFailedId, attempt_id: attemptId,
    delivery_id: attemptId === attemptDeliveredId ? deliveryDeliveredId : deliveryFailedId, round: 1, role: 'implementer',
    state: 'ready', tracking: 'tracked', diagnostic: null, result_receipt_id: id(attemptId === attemptDeliveredId ? 811 : 812), created_at_ms: now - 20000,
    attempt_session_id: id(821), session_state: 'tracked', session_source_id: null, terminal_name: null, occupancy_state: 'released', terminal_state: 'available',
  });
  const producerResult = attemptId => ({
    binding: { attempt_id: attemptId, passage_id: passageSummary(attemptId).id, role: 'implementer', round: 1, delivery_version: attemptId === attemptDeliveredId ? deliveryDeliveredId : deliveryFailedId },
    result: { format_version: 1, summary: attemptId === attemptDeliveredId ? 'Resultado do Implementador para a versão aprovada.' : 'Resultado do Implementador reprovado.', writes_stopped: true,
      declared_files: [], finding_responses: [], criteria: [{ criterion_id: 'ac-1', verdict: attemptId === attemptDeliveredId ? 'passed' : 'failed', evidence: ['Evidência atual do produtor.'] }],
      checks: [{ id: 'typecheck', outcome: 'Exit 0', evidence: 'Typecheck declarado pelo Implementador para esta versão.' }], additional_changes_justification: null },
    sha256: 'd'.repeat(64), receipt_id: id(attemptId === attemptDeliveredId ? 831 : 832),
  });
  const deliveryDetail = attemptId => {
    const isDelivered = attemptId === attemptDeliveredId;
    const deliveryId = isDelivered ? deliveryDeliveredId : deliveryFailedId;
    return {
      delivery: { id: deliveryId, attempt_id: attemptId, producer_passage_id: isDelivered ? producerDeliveredId : producerFailedId, round: 1,
        base_sha: 'a'.repeat(40), capture_state: 'captured', git_ref: `refs/factory/deliveries/${deliveryId}`, repository_relative: `git/${attemptId}.git`,
        content_identity: isDelivered ? 'b'.repeat(40) : 'c'.repeat(40), commit_sha: null, has_delta: true, diagnostic: null,
        captured_at_ms: now - 5000, revision: 1, warnings: [] },
      event_cursor: '1', delivery_summary: deliverySummary(attemptId),
      issue: { id: isDelivered ? issueId : 'ISSUE_failed', number: isDelivered ? 42 : 41, title: isDelivered ? 'Entrega aprovada' : 'Falha registrada', url: `https://github.com/example/project/issues/${isDelivered ? 42 : 41}` },
      attempt: attemptDetail(attemptId), measurements, cleanup: 'complete', authorizations: { captured_mode: 'icr', authorized_mode: 'icr', requires_current_gate: true },
      review: null, publication: publicationSummary('icr'), capabilities: { diff: { available: false, reason_code: 'CONTROLLED_TEST' }, complete_publication: { available: false, reason_code: 'CONTROLLED_TEST' }, reconcile_publication: { available: false, reason_code: 'CONTROLLED_TEST' } }, details: null,
    };
  };
  const queueItem = (number, position, title) => ({
    project_id: projectId, project_name: 'Projeto controlado', item_id: `ITEM_${number}`, kind: 'issue', issue_id: `ISSUE_${number}`,
    number, title, url: `https://github.com/example/project/issues/${number}`, assignees: [{ id: 'account-fixture', login: 'fixture' }],
    status: 'Ready', ready: true, ready_eligible: true, eligible: true, reasons: [], consumption: 'available', attempt_id: null,
    order: { position, criterion: queueMode === 'position' ? 'board-position' : 'issue-number' },
  });
  const queueObservation = (mode, summaryHash) => {
    const ordered = mode === 'position'
      ? [queueItem(30, 1, 'Posição 1'), queueItem(10, 2, 'Posição 2')]
      : [queueItem(5, 1, 'Fallback 5'), queueItem(20, 2, 'Fallback 20')];
    return {
      scope: { kind: 'account', project_ids: [projectId] }, enabled: false, valid: true, complete: true,
      observation_id: id(mode === 'position' ? 901 : 902), summary_hash: summaryHash, observed_at_ms: now,
      eligible_total: 2, modes_by_project: [{ project_id: projectId, mode: 'icr' }],
      account: { id: 'account-fixture', login: 'fixture' }, host: { expected: null, observed: 'localhost', matches: true },
      order: { criterion: mode === 'position' ? 'project-position' : 'issue-number', description: mode === 'position' ? 'Posição do quadro observada' : 'Número da issue crescente' },
      page: { items: ordered, has_more: false, next_cursor: null, event_cursor: '1' }, diagnostics: [], event_cursor: '1',
      polling: { interval_ms: 60000, backoff_max_ms: 60000, retry_at_ms: null, next_poll_at_ms: now + 60000 },
    };
  };
  const queuePage = () => {
    if (queueMode === 'position') return queueObservation('position', '1'.repeat(64));
    if (queueMode === 'fallback') return queueObservation('fallback', '2'.repeat(64));
    return queueObservation('fallback', '3'.repeat(64));
  };
  const issueDetail = { id: issueId, number: 42, title: 'Issue controlada da tentativa', state: 'OPEN', assignees: [{ login: 'fixture' }] };

  const recordRequest = async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    requests.push({ method, path, search: url.search });
    if (request.resourceType() === 'eventsource') return route.fulfill({ contentType: 'text/event-stream', body: ': controlled\n\n' });
    const body = (() => { try { return request.postDataJSON(); } catch { return null; } })();
    if (method !== 'GET' && path !== '/api/v1/session' && path !== '/api/v1/branches') mutations.push({ method, path, body });
    if (method === 'POST' && path === '/api/v1/session') return reply(route, { csrf_token: 'c'.repeat(43), instance_id: id(999) });
    if (path === '/api/v1/health') return reply(route, { status: 'ok' });
    if (path === '/api/v1/settings') return reply(route, settingsView());
    if (path === '/api/v1/projects' && method === 'GET') return reply(route, pageResult([projectSummary]));
    if (path === '/api/v1/branches' && (method === 'GET' || method === 'POST')) return reply(route, { branches: ['main'], state: 'complete', message: null });
    if (path === '/api/v1/diagnostics' && method === 'GET') return reply(route, { context: { scope: 'project', id: projectId }, facts: {}, diagnostics: [], reports: [], supported_checks: [], event_cursor: '1' });
    if (path === `/api/v1/projects/${projectId}` && method === 'GET') return reply(route, { deletion: null, project: projectSummary, prerequisites, event_cursor: '1' });
    if (path === `/api/v1/projects/${projectId}/configuration` && method === 'GET') {
      configReads++;
      if (configReads === 2 && configRevision === 1) { configRevision = 2; savedGuidance = 'Revisão externa controlada'; }
      return reply(route, configurationView(), 200, `"configuration-${configRevision}"`);
    }
    if (path === `/api/v1/projects/${projectId}/configuration` && method === 'PUT') {
      configWrites++;
      if (configWrites === 1) return reply(route, { code: 'REVISION_CONFLICT', message: 'A configuração mudou. Consulte a revisão atual.', request_id: 'controlled-conflict' }, 412, null);
      if (configWrites === 3) return reply(route, { code: 'CONFIGURATION_SAVE_FAILED', message: 'Falha controlada ao salvar.', request_id: 'controlled-failure' }, 400, null);
      const changes = body?.project_changes ?? {};
      if (typeof changes.guidance === 'string') savedGuidance = changes.guidance;
      if (typeof changes.queue_order?.use_board_position === 'boolean') savedBoardPosition = changes.queue_order.use_board_position;
      configRevision++;
      const operationId = request.headers()['idempotency-key'] ?? id(950 + configWrites);
      return reply(route, { ...configurationView(), operation_id: operationId, receipt: { revision: configRevision, event_cursor: String(configRevision) } }, 200, `"configuration-${configRevision}"`);
    }
    if (path === `/api/v1/projects/${projectId}/configuration-options` && method === 'GET') return reply(route, {
      projects: pageResult([board]), status_fields: statusFields, status_options: statusOptions, profiles,
      completeness: 'complete', diagnostics: [], retry_at_ms: null,
    });
    if (path === `/api/v1/projects/${projectId}/issues` && method === 'GET') return reply(route, {
      ...pageResult([issueOption]), completeness: 'complete', diagnostics: [], retry_at_ms: null, prerequisites,
    });
    if (path === `/api/v1/projects/${projectId}/preparations` && method === 'POST') {
      preparationWrites++;
      const preparationId = preparationIds[Math.min(preparationWrites - 1, preparationIds.length - 1)];
      const previousAttemptId = typeof body?.previous_attempt_id === 'string' ? body.previous_attempt_id : null;
      const result = preparationView(preparationId, body ?? {}, previousAttemptId);
      const operationId = request.headers()['idempotency-key'] ?? id(960 + preparationWrites);
      return reply(route, { ...result, operation_id: operationId, receipt: { revision: 1, event_cursor: '1' } }, 201, `"preparation-${preparationWrites}"`);
    }
    if (path.startsWith('/api/v1/preparations/') && method === 'GET') {
      const preparationId = path.split('/').at(-1);
      return reply(route, preparationView(preparationId, { issue_id: issueId, delivery_mode: 'icr', guidance: '' }));
    }
    if (path === '/api/v1/attempts' && method === 'GET') {
      const title = url.searchParams.get('issue_title');
      const cursor = url.searchParams.get('cursor');
      if (title) return reply(route, pageResult(attemptRows.filter(row => row.issue_title.includes(title))));
      if (cursor === 'controlled-page-2') return reply(route, { items: [attemptRows[1]], has_more: false, next_cursor: null, event_cursor: '1' });
      return reply(route, { items: [attemptRows[0]], has_more: true, next_cursor: 'controlled-page-2', event_cursor: '1' });
    }
    if (path.startsWith('/api/v1/attempts/') && path.endsWith('/resources') && method === 'GET') {
      const attemptId = path.split('/')[4];
      return reply(route, { entries: [], cleanup: 'complete', event_cursor: '1' });
    }
    if (path.startsWith('/api/v1/attempts/') && method === 'GET') {
      const attemptId = path.split('/')[4];
      const base = attemptDetail(attemptId);
      const section = url.searchParams.get('section');
      if (section) {
        let items = [];
        if (section === 'passages') items = [passageSummary(attemptId)];
        if (section === 'criteria') items = [{ ...criteria[0], producer: { verdict: attemptId === attemptDeliveredId ? 'passed' : 'failed', evidence: ['Evidência atual do produtor.'] }, reviewer: { verdict: attemptId === attemptDeliveredId ? 'passed' : 'failed', evidence: ['Evidência independente da versão.'] } }];
        if (section === 'rounds') items = [{ round: 1, delivery_id: base.delivery_id, producer_passage_id: base.passage_id, producer_receipt_id: base.result_receipt_id, review_id: id(880), review_state: attemptId === attemptDeliveredId ? 'approved' : 'rejected', content_identity: attemptId === attemptDeliveredId ? 'b'.repeat(40) : 'c'.repeat(40) }];
        return reply(route, { ...base, details: { section, items, has_more: false, next_cursor: null, event_cursor: '1' } }, 200, `"attempt-${attemptId}-1"`);
      }
      return reply(route, base, 200, `"attempt-${attemptId}-1"`);
    }
    if (path.endsWith('/producer-result') && method === 'GET') {
      const attemptId = path.includes(deliveryDeliveredId) ? attemptDeliveredId : attemptFailedId;
      return reply(route, producerResult(attemptId));
    }
    if (path.startsWith('/api/v1/deliveries/') && method === 'GET') {
      const deliveryId = path.split('/')[4];
      const attemptId = deliveryId === deliveryDeliveredId ? attemptDeliveredId : attemptFailedId;
      if (url.searchParams.has('section')) {
        const section = url.searchParams.get('section');
        const items = section === 'criteria' ? [{ ...criteria[0], producer: { verdict: attemptId === attemptDeliveredId ? 'passed' : 'failed', evidence: ['Evidência atual do produtor.'] }, reviewer: { verdict: attemptId === attemptDeliveredId ? 'passed' : 'failed', evidence: ['Evidência independente da versão.'] } }] : [];
        return reply(route, { ...deliveryDetail(attemptId), details: { section, items, has_more: false, next_cursor: null, event_cursor: '1' } }, 200, `"delivery-${deliveryId}-1"`);
      }
      return reply(route, deliveryDetail(attemptId), 200, `"delivery-${deliveryId}-1"`);
    }
    if (path === '/api/v1/events' && method === 'GET') return reply(route, pageResult([]));
    if (path === '/api/v1/queue' && method === 'GET') {
      const data = queuePage();
      queueReads++;
      return reply(route, data, 200, `"queue-${queueReads}"`);
    }
    if (path === '/api/v1/queue' && method === 'PUT') {
      queueWrites++;
      queueMode = 'conflict';
      return reply(route, { code: 'QUEUE_SUMMARY_CHANGED', message: 'A observação da fila mudou.', request_id: 'controlled-queue-conflict', queue: queuePage() }, 409, null);
    }
    if (path.startsWith('/api/v1/operations/') && method === 'GET') return reply(route, { operation_id: path.split('/').at(-1), state: 'succeeded', error: null, resource: { type: 'attempt', id: attemptDeliveredId }, receipt: { revision: 1, event_cursor: '1' } });
    unexpected.push(`${method} ${path}${url.search}`);
    return reply(route, { code: 'CONTROLLED_TEST_UNHANDLED', message: 'Fora do cenário controlado.', request_id: 'controlled-unhandled' }, 503, null);
  };

  const active = async () => page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return null;
    const label = element.labels ? [...element.labels].map(item => item.textContent?.trim() ?? '').join(' ') : '';
    return { tag: element.tagName, id: element.id, attemptTrigger: element.getAttribute('data-attempt-trigger'), aria: element.getAttribute('aria-label') ?? '', text: (element.innerText || element.textContent || '').trim().slice(0, 90), label };
  });
  const tabTo = async predicate => {
    for (let index = 0; index < 140; index++) {
      const current = await active();
      if (current && predicate(current)) return current;
      await page.keyboard.press('Tab');
    }
    throw new Error('O foco não alcançou o controle esperado por teclado.');
  };
  const capture = async name => {
    const path = `${output}/${name}.png`;
    await page.screenshot({ path, animations: 'disabled' });
    screenshots.push(path);
  };
  const captureFullPage = async name => {
    const path = `${output}/${name}.png`;
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    screenshots.push(path);
  };
  const dimensions = async () => page.evaluate(() => ({
    width: innerWidth, height: innerHeight, devicePixelRatio, visualViewportScale: visualViewport?.scale ?? 1,
    documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight,
  }));
  const recordDimensions = async (surface, variant) => {
    const result = await dimensions();
    dimensionSamples.push({ surface, variant, ...result });
    return result;
  };
  const checkActionGeometry = async (locator, surface, action) => {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await locator.waitFor({ state: 'visible', timeout: 2000 });
        await locator.scrollIntoViewIfNeeded({ timeout: 2000 });
        const box = await locator.boundingBox();
        const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
        assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, `${action} ficou cortada fora da viewport.`);
        actionGeometry.push({ surface, action, box, viewport });
        return;
      } catch (error) {
        lastError = error;
        await page.waitForTimeout(100);
      }
    }
    throw new Error(`${action} não pôde ser inspecionada: ${lastError instanceof Error ? lastError.message : 'alvo indisponível'}`);
  };
  const hasRetiredCopy = value => {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some(hasRetiredCopy);
    return Object.entries(value).some(([key, child]) => ['checks', 'checks_json', 'priority_field_id', 'priority_direction', 'left_attempt_id', 'right_attempt_id'].includes(key) || hasRetiredCopy(child));
  };
  const assertNoRetiredControls = async scope => {
    const text = await scope.innerText();
    assert(!/Adicionar check|Comando do check|Timeout do check|Checks aprovados|Selecionar para comparar|Comparar tentativas/i.test(text), 'A superfície apresentou controle ou mensagem de mecanismo retirado.');
    assert(await scope.locator('.checks-editor, .check-card, [data-comparison-control]').count() === 0, 'A superfície contém marcação exclusiva de mecanismo retirado.');
    const labels = await scope.locator('label').allTextContents();
    assert(!labels.some(label => /prioridade numérica|campo de prioridade|direção de prioridade/i.test(label)), 'A superfície contém um campo de prioridade numérica.');
  };
  const handler = async route => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({ method: request.method(), path: url.pathname, search: url.search });
    await recordRequest(route);
  };
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/assets/')) assetResponses.push({ path: url.pathname, status: response.status() });
  });
  await page.addInitScript(() => {
    if (location.origin !== 'http://127.0.0.1:4310') return;
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* The test profile remains isolated. */ }
    class ControlledEventSource extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      constructor(url) {
        super();
        this.url = String(url);
        this.readyState = ControlledEventSource.CONNECTING;
        this.onopen = null;
        this.onerror = null;
        this.onmessage = null;
        setTimeout(() => {
          if (this.readyState !== ControlledEventSource.CONNECTING) return;
          this.readyState = ControlledEventSource.OPEN;
          const event = new Event('open');
          this.dispatchEvent(event);
          this.onopen?.(event);
        }, 0);
      }
      close() { this.readyState = ControlledEventSource.CLOSED; }
    }
    Object.defineProperty(window, 'EventSource', { configurable: true, value: ControlledEventSource });
  });
  await page.route('**/api/v1/**', handler);

  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${origin}/#principal/projetos`);
    await page.getByRole('heading', { name: 'Projetos', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Configurar projeto', exact: true }).click();
    const configDialog = page.locator('[data-dialog="project-configuration"]');
    await configDialog.waitFor();
    await page.getByLabel('Orientações do projeto').waitFor();
    await assertNoRetiredControls(configDialog);
    await recordDimensions('project-configuration', 'desktop');
    const initialConfigFocus = await active();
    focusEvidence.push({ surface: 'project-configuration', initial: initialConfigFocus });
    await capture('configuration-desktop');

    const focusTrace = [];
    for (let index = 0; index < 18; index++) { await page.keyboard.press('Tab'); focusTrace.push(await active()); }
    assert(focusTrace.some(item => item?.id === 'project-guidance'), 'A navegação por Tab não alcançou as orientações do projeto.');
    assert(!focusTrace.some(item => /comparar|prioridade numérica|comando do check|timeout do check/i.test(`${item?.aria} ${item?.label} ${item?.text}`)), 'A sequência de foco expôs controle retirado.');
    focusEvidence.push({ surface: 'project-configuration', tab_sequence: focusTrace });
    const guidanceFocus = await tabTo(item => item.id === 'project-guidance');
    assert(guidanceFocus, 'O campo de orientação não recebeu foco pelo teclado.');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Rascunho preservado após conflito');
    const positionFocus = await tabTo(item => item.label.includes('Usar posição do quadro'));
    assert(positionFocus, 'O controle binário da fila não recebeu foco pelo teclado.');
    await page.keyboard.press('Space');
    const saveFocus = await tabTo(item => item.tag === 'BUTTON' && item.text === 'Salvar configuração');
    assert(saveFocus, 'Salvar configuração não foi alcançável por teclado.');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Aplicar minha edição sobre a revisão consultada', exact: true }).waitFor();
    assert(await page.getByLabel('Orientações do projeto').inputValue() === 'Rascunho preservado após conflito', 'O conflito descartou o rascunho atual.');
    await page.getByRole('button', { name: 'Aplicar minha edição sobre a revisão consultada', exact: true }).click();
    await page.getByRole('button', { name: 'Salvar configuração', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-dialog="project-configuration"]')?.textContent?.includes('Salvo'));
    assert(await page.getByLabel('Orientações do projeto').inputValue() === 'Rascunho preservado após conflito', 'O save confirmado não manteve a edição reaplicada.');

    await page.getByLabel('Orientações do projeto').fill('Rascunho preservado após falha');
    await page.getByRole('button', { name: 'Salvar configuração', exact: true }).click();
    await page.locator('.form-actions-card [role="alert"]').waitFor();
    assert(await page.getByLabel('Orientações do projeto').inputValue() === 'Rascunho preservado após falha', 'A falha descartou o rascunho atual.');
    await page.getByRole('button', { name: 'Salvar configuração', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-dialog="project-configuration"]')?.textContent?.includes('Salvo'));
    assert(await page.getByLabel('Orientações do projeto').inputValue() === 'Rascunho preservado após falha', 'O save posterior à falha não preservou o rascunho.');

    await page.setViewportSize({ width: 1100, height: 480 });
    views.low = await dimensions();
    await recordDimensions('project-configuration', 'low');
    assert(views.low.documentWidth <= views.low.width, 'A configuração tem overflow horizontal na janela baixa.');
    await capture('configuration-low');
    await page.setViewportSize({ width: 390, height: 640 });
    views.narrow = await dimensions();
    await recordDimensions('project-configuration', 'narrow');
    assert(views.narrow.documentWidth <= views.narrow.width, 'A configuração tem overflow horizontal na largura estreita.');
    const configFooter = await configDialog.locator('.form-actions-card').boundingBox();
    assert(configFooter && configFooter.width > 0 && configFooter.height > 0, 'A ação de salvar não está presente no diálogo estreito.');
    await checkActionGeometry(page.getByRole('button', { name: 'Salvar configuração', exact: true }), 'project-configuration', 'Salvar configuração');
    await capture('configuration-narrow');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Configurar projeto', exact: true }).waitFor();
    const configReturnFocus = await active();
    assert(configReturnFocus?.tag === 'BUTTON' && configReturnFocus.text.includes('Configurar projeto'), 'Fechar configuração não devolveu o foco ao acionador.');
    focusEvidence.push({ surface: 'project-configuration', returned: configReturnFocus });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Configurar projeto', exact: true }).click();
    await page.locator('[data-dialog="project-configuration"]').waitFor();
    assert(await page.getByLabel('Orientações do projeto').inputValue() === savedGuidance, 'Reabrir a configuração não consultou o último valor confirmado.');
    await assertNoRetiredControls(page.locator('[data-dialog="project-configuration"]'));
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Preparar', exact: true }).click();
    const preparationDialog = page.locator('[data-dialog="preparation"]');
    await preparationDialog.waitFor();
    await page.locator('#preparation-issue').waitFor();
    await page.locator('#preparation-issue').click();
    const issuePopup = page.locator('#preparation-issue-popup');
    const issueChoice = issuePopup.getByRole('button', { name: 'Issue controlada da tentativa', exact: true });
    await issueChoice.waitFor();
    await issueChoice.click();
    await page.getByText('Issue controlada da tentativa', { exact: true }).waitFor();
    assert(!(await preparationDialog.innerText()).includes('Checks'), 'A preparação mostrou a seção manual retirada.');
    await assertNoRetiredControls(preparationDialog);
    views.narrow = null;
    await page.setViewportSize({ width: 390, height: 640 });
    views.narrow = await dimensions();
    await recordDimensions('preparation', 'narrow');
    assert(views.narrow.documentWidth <= views.narrow.width, 'A preparação tem overflow horizontal em tela estreita.');
    await checkActionGeometry(preparationDialog.getByRole('button', { name: 'Revisar e autorizar', exact: true }), 'preparation', 'Revisar e autorizar');
    await capture('preparation-narrow');
    await page.keyboard.press('Escape');
    const preparationReturnFocus = await active();
    assert(preparationReturnFocus?.tag === 'BUTTON' && preparationReturnFocus.text.includes('Preparar'), 'Fechar preparação não devolveu o foco ao acionador.');
    focusEvidence.push({ surface: 'preparation', returned: preparationReturnFocus });

    await page.getByRole('link', { name: 'Tentativas', exact: true }).click();
    await page.getByRole('heading', { name: 'Tentativas', exact: true }).waitFor();
    await page.getByText('Issue #41 - Falha registrada', { exact: true }).waitFor();
    await page.locator('#attempt-issue-title-filter').fill('Entrega aprovada');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.getByText('Issue #42 - Entrega aprovada', { exact: true }).waitFor();
    await page.locator('#attempt-issue-title-filter').fill('');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.getByText('Issue #41 - Falha registrada', { exact: true }).waitFor();
    await page.setViewportSize({ width: 1100, height: 480 });
    views.low = await dimensions();
    await recordDimensions('attempt-history', 'low');
    assert(views.low.documentWidth <= views.low.width, 'O histórico tem overflow horizontal na janela baixa.');
    await capture('attempt-history-low');
    await page.getByRole('button', { name: 'Consultar', exact: true }).click();
    const detailDialog = page.locator('[data-dialog="detail"]');
    await detailDialog.waitFor();
    focusEvidence.push({ surface: 'failed-attempt-detail', initial: await active() });
    await page.getByText('Entrega impedida', { exact: true }).waitFor();
    assert((await detailDialog.innerText()).includes('Reprovada nesta versão'), 'O detalhe alterou o resultado rejeitado para aprovado.');
    assert(!(await detailDialog.innerText()).includes('Checks aprovados'), 'O resumo de entrega contém contadores de checks manuais.');
    await capture('attempt-failed-detail');
    await page.keyboard.press('Escape');
    const failedDetailReturn = await active();
    assert(failedDetailReturn?.tag === 'BUTTON' && failedDetailReturn.attemptTrigger === attemptFailedId, 'Fechar detalhe não devolveu foco à tentativa consultada.');
    focusEvidence.push({ surface: 'failed-attempt-detail', returned: failedDetailReturn });
    await page.getByRole('button', { name: 'Próxima', exact: true }).click();
    await page.getByText('Issue #42 - Entrega aprovada', { exact: true }).waitFor();
    assert(await page.url().includes('attemptCursors'), 'A paginação não foi refletida na rota.');
    await page.setViewportSize({ width: 390, height: 640 });
    views.narrow = await dimensions();
    await recordDimensions('attempt-history', 'narrow');
    assert(views.narrow.documentWidth <= views.narrow.width, 'O histórico tem overflow horizontal em tela estreita.');
    await checkActionGeometry(page.getByRole('button', { name: 'Consultar', exact: true }), 'attempt-history', 'Consultar');
    await capture('attempt-history-narrow');
    await page.getByRole('button', { name: 'Consultar', exact: true }).click();
    await detailDialog.waitFor();
    focusEvidence.push({ surface: 'delivered-attempt-detail', initial: await active() });
    await recordDimensions('delivered-attempt-detail', 'narrow');
    await page.getByText('ICR aprovado', { exact: true }).waitFor();
    assert((await detailDialog.innerText()).includes('Aprovada nesta versão'), 'O parecer atual da versão não foi preservado.');
    assert(!(await detailDialog.innerText()).includes('Checks aprovados'), 'O resumo de entrega contém contadores de checks manuais.');
    await page.getByText('Validação e histórico da versão', { exact: true }).click();
    const passageDisclosure = page.getByText(/^Passagens/);
    if (await passageDisclosure.count()) await passageDisclosure.click();
    await page.getByText('Typecheck declarado pelo Implementador para esta versão.', { exact: true }).waitFor();
    assert((await detailDialog.innerText()).includes('Typecheck declarado pelo Implementador para esta versão.'), 'A evidência do resultado do Implementador da versão selecionada não foi apresentada.');
    await assertNoRetiredControls(detailDialog);
    await page.getByText('Typecheck declarado pelo Implementador para esta versão.', { exact: true }).scrollIntoViewIfNeeded();
    await capture('attempt-producer-evidence-narrow');
    await checkActionGeometry(detailDialog.getByRole('button', { name: 'Nova tentativa', exact: true }), 'delivered-attempt-detail', 'Nova tentativa');
    await capture('attempt-delivered-detail');
    await detailDialog.getByRole('button', { name: 'Nova tentativa', exact: true }).click();
    const retryDialog = page.locator('[data-dialog="preparation"]');
    await retryDialog.waitFor();
    await page.locator('#preparation-issue').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-dialog="preparation"]')?.textContent?.includes('Issue atual'));
    await capture('attempt-new-retry');
    const retryMutation = mutations.filter(item => item.method === 'POST' && item.path.endsWith('/preparations')).at(-1);
    assert(retryMutation?.body?.previous_attempt_id === attemptDeliveredId, 'Nova tentativa não preservou o vínculo com a tentativa anterior.');
    assert(!hasRetiredCopy(retryMutation.body), 'Nova tentativa enviou uma propriedade retirada.');
    await page.keyboard.press('Escape');
    const retryReturnFocus = await active();
    assert(retryReturnFocus?.tag === 'BUTTON' && retryReturnFocus.attemptTrigger === attemptDeliveredId, 'Fechar a preparação da nova tentativa não devolveu o foco à consulta da tentativa selecionada.');
    focusEvidence.push({ surface: 'new-attempt', returned: retryReturnFocus });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('link', { name: 'Fila Ready', exact: true }).click();
    await page.getByRole('heading', { name: 'Fila Ready', exact: true, level: 1 }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.queue-table tbody tr').length === 2);
    await recordDimensions('queue', 'desktop');
    const boardOrder = await page.locator('.queue-table tbody tr .queue-issue-title').allTextContents();
    assert(boardOrder[0]?.includes('#30') && boardOrder[1]?.includes('#10'), 'A observação completa da posição do quadro não foi renderizada na ordem recebida.');
    const queuePanel = page.locator('.queue-panel');
    const boardOrderText = await page.locator('.queue-order-note').innerText();
    assert(boardOrderText.includes('Posição do quadro observada · Um projeto bloqueado não impede os demais.'), 'As frases existentes da ordem e do escopo estão incorretamente concatenadas.');
    await assertNoRetiredControls(queuePanel);
    await capture('queue-board-position');
    queueMode = 'fallback';
    await page.getByRole('button', { name: 'Revalidar fila', exact: true }).click();
    await page.locator('.queue-order-note').filter({ hasText: 'Número da issue crescente' }).waitFor();
    assert((await page.locator('.queue-order-note').innerText()).includes('Número da issue crescente · Um projeto bloqueado não impede os demais.'), 'O separador do texto existente não foi preservado no fallback.');
    const fallbackOrder = await page.locator('.queue-table tbody tr .queue-issue-title').allTextContents();
    assert(fallbackOrder[0]?.includes('#5') && fallbackOrder[1]?.includes('#20'), 'O fallback por número da issue não foi renderizado na ordem recebida.');
    await captureFullPage('queue-fallback-full');
    await page.setViewportSize({ width: 390, height: 640 });
    views.narrow = await dimensions();
    await recordDimensions('queue', 'narrow');
    assert(views.narrow.documentWidth <= views.narrow.width, 'A fila tem overflow horizontal em tela estreita.');
    await checkActionGeometry(page.getByRole('button', { name: 'Revalidar fila', exact: true }), 'queue', 'Revalidar fila');
    await checkActionGeometry(page.getByRole('button', { name: 'Habilitar fila', exact: true }), 'queue', 'Habilitar fila');
    await capture('queue-fallback-narrow');
    await page.getByRole('button', { name: 'Habilitar fila', exact: true }).click();
    const enableDialog = page.locator('[data-dialog="enable-queue"]');
    await enableDialog.waitFor();
    focusEvidence.push({ surface: 'queue-enable', initial: await active() });
    await page.getByLabel(/Autorizo habilitar a fila/).check();
    await enableDialog.getByRole('button', { name: 'Habilitar fila', exact: true }).click();
    await page.getByText(/A observação da fila mudou/).waitFor();
    const authorization = page.getByLabel(/Autorizo habilitar a fila/);
    assert(!(await authorization.isChecked()), 'A autorização antiga permaneceu marcada após conflito de resumo.');
    assert(await enableDialog.getByRole('button', { name: 'Habilitar fila', exact: true }).isDisabled(), 'O resumo alterado não bloqueou a autorização antiga.');
    assert(queueWrites === 1, 'A interface repetiu o comando após o conflito.');
    await assertNoRetiredControls(enableDialog);
    await page.setViewportSize({ width: 1100, height: 480 });
    views.low = await dimensions();
    await recordDimensions('queue-enable', 'low');
    assert(views.low.documentWidth <= views.low.width, 'A fila tem overflow horizontal na janela baixa.');
    await checkActionGeometry(enableDialog.getByRole('button', { name: 'Cancelar', exact: true }), 'queue-enable', 'Cancelar');
    await checkActionGeometry(enableDialog.getByRole('button', { name: 'Habilitar fila', exact: true }), 'queue-enable', 'Habilitar fila');
    await capture('queue-summary-conflict-low');
    await page.keyboard.press('Escape');
    const queueReturnFocus = await active();
    assert(queueReturnFocus?.tag === 'BUTTON' && queueReturnFocus.text.includes('Habilitar fila'), 'Fechar a autorização da fila não devolveu o foco ao acionador.');
    focusEvidence.push({ surface: 'queue-enable', returned: queueReturnFocus });

    const retiredRequests = requests.filter(item => /attempt-comparisons|\/checks(?:\/|\?|$)|\/artifacts(?:\/|\?|$)/i.test(item.path));
    assert(retiredRequests.length === 0, 'A interface solicitou rota comparativa ou de checks/artifacts manuais.');
    assert(!mutations.some(item => hasRetiredCopy(item.body)), 'A rede enviou propriedades de mecanismos retirados.');
    assert(pageErrors.length === 0, `A página registrou exceções JavaScript: ${pageErrors.join(' | ')}`);
    const compiledAssets = await page.evaluate(async () => {
      const paths = [...document.querySelectorAll('script[src], link[rel="stylesheet"]')]
        .map(element => element.getAttribute('src') ?? element.getAttribute('href'))
        .filter(path => Boolean(path && path.startsWith('/assets/')));
      return Promise.all(paths.map(async path => {
        const response = await fetch(path, { cache: 'no-store' });
        const bytes = await response.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return { path, status: response.status, byte_length: bytes.byteLength, sha256: Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('') };
      }));
    });
    assert(compiledAssets.length >= 2 && compiledAssets.every(asset => asset.status === 200), 'O Chrome não recebeu os assets compilados esperados.');
    const result = {
      passed: true,
      proof: 'Playwright MCP/Chrome; build dist servido em 127.0.0.1:4310; APIs totalmente controladas',
      viewport: { desktop: { width: 1440, height: 1000 }, narrow: { width: 390, height: 640 }, low: { width: 1100, height: 480 }, browserZoom: '100% observado via visualViewport.scale/devicePixelRatio' },
      dimensions: dimensionSamples,
      actionGeometry,
      checks: [
        'configuração sem controles de checks manuais/prioridade numérica', 'salvar, conflito, rebase e reabrir configuração',
        'rascunho preservado após falha conhecida', 'preparar issue e nova tentativa com vínculo anterior',
        'busca global e paginação da lista', 'detalhe com resultados distintos e evidência atual do resultado do Implementador',
        'resumo sem Checks aprovados', 'nenhuma rota comparativa/check/artifact manual solicitada',
        'ordem observada por posição e fallback por número renderizadas pelo cliente', 'conflito de resumo desmarca autorização e bloqueia novo envio',
        'foco inicial, navegação Tab, Escape e retorno ao acionador', 'janelas normal, estreita e baixa sem overflow horizontal',
      ],
      focus: focusEvidence,
      mutationCount: mutations.length,
      configurationWrites: configWrites,
      preparationWrites,
      queueWrites,
      retiredRequests,
      unexpected,
      pageErrors,
      assets: { observed_responses: assetResponses, fetched_integrity: compiledAssets },
      screenshots,
      limits: [
        'Respostas HTTP, identidades de projeto/tentativas, posição e fallback da fila são sintéticos; isso comprova projeção e barreiras de UI, não o cálculo backend nem GitHub real.',
        'Sem controller, banco, Git, provider, OMP, publicação ou alteração de configuração operacional.',
        'Zoom observado em 100%; a matriz mede dimensões normais/estreitas/baixas, não alteração nativa de zoom.',
      ],
    };
    assert(unexpected.length === 0, `Endpoints não previstos na fixture controlada: ${unexpected.join(', ')}`);
    return result;
  } finally {
    await page.unroute('**/api/v1/**', handler);
  }
}
