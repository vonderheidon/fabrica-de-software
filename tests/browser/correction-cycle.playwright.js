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
  const attempt = {
    id: attemptId, project_id: projectId, operation_id: id(3), passage_id: id(10), round: 3, phase: 'reviewing', result: null, suspension: 'CORRECTION_BLOCKED', tracking: 'tracked', diagnostic: null, result_receipt_id: null, delivery_id: id(30), revision: 1, event_cursor: '1', created_at_ms: 1, updated_at_ms: 1,
    issue: { id: 'issue', number: 22, title: 'Correção com decisão humana', url: origin }, selected_delivery_id: id(30), selected_round: 3, expected_account_id: 'controlled',
    publication: {}, measurements: { active_time: measured, human_wait: measured, cost: measured, active_limit: { state: 'not_configured' }, question_ttl: { state: 'not_configured' }, active_limit_state: 'unavailable', active_expired_at_ms: null, passages: [] },
    cleanup: 'uncertain', authority: null, capabilities: { cancel: unavailable, complete_publication: unavailable, reconcile_publication: unavailable, revalidate: unavailable }, details: null,
  };
  const version = id(30), findingId = id(100);
  const available = { available: true };
  attempt.block = { id: id(101), revision: 1, reason: 'no_progress', delivery_id: version, content_identity: 'a'.repeat(40), finding_ids: [findingId], cause: 'Duas correções sem progresso verificável no mesmo problema bloqueante.', recovery: 'Confira as evidências e escolha como continuar.', consecutive_no_progress: 2, corrections_used: 2, correction_limit: 5, guidance_capability: available, change_profile_capability: available, end_capability: available, evidence: ['A validação continua reprovada após duas correções.'] };
  attempt.v3_details = null;
  const publication = { mode: 'icr', review_state: 'rejected', local_state: 'pending', confirmed_effects: 0, pending_effects: 0, unknown_effects: 0, complete_capability: unavailable, reconcile_capability: unavailable };
  attempt.publication = publication;
  settings.profiles = [{ id: id(105), revision: 3, name: 'Revisor alternativo', profile_type: 'reviewer', executor: 'maestri-omp', provider: 'controlled', model: 'controlled', effort: null, guidance: '', created_at_ms: 1, updated_at_ms: 1 }];
  const findings = [{ id: findingId, key: 'validation', review_id: id(106), attempt_id: attemptId, delivery_id: version, content_identity: 'a'.repeat(40), priority: 'high', origin_finding_id: null, blocking: true, criterion_ids: ['ac-1'], category: 'behavior', problem: 'Validação aceita entrada vazia', expected_result: 'Recusar entrada vazia', evidence: ['Teste funcional da versão selecionada'], resolutions: [{ review_id: id(106), delivery_id: version, verdict: 'unresolved', evidence: ['Reprodução mantém a falha'] }] }];
  const assessments = [{ id: id(107), finding_id: findingId, attempt_id: attemptId, delivery_id: version, review_id: id(106), content_identity: 'a'.repeat(40), round: 3, created_at_ms: 1, progress: 'partial', justification: 'Uma entrada foi corrigida e comprovada; outra permanece pendente.', evidence: ['artifact:check-atual'] }];
  const disputes = [{ id: id(108), finding_id: findingId, attempt_id: attemptId, passage_id: id(10), delivery_id: version, content_identity: 'a'.repeat(40), justification: 'Implementador contesta o caso por documentação.', evidence: ['Documento usado na contestação'], response_review_id: id(106), response_verdict: 'maintained', response_justification: 'Revisor mantém o achado: o critério exige a recusa.', response_evidence: ['Reprodução vinculada ao critério'], response_delivery_id: version, response_content_identity: 'a'.repeat(40), created_at_ms: 1, responded_at_ms: 2 }];
  const mutations = [], errors = [], historyReads = [], operations = new Map();
  let failRevision = true, lostResponse = false;
  await page.goto('about:blank'); await page.unroute('**/api/v1/**');
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const reply = json => route.fulfill({ json, headers: { etag: `"${attemptId}:${attempt.revision}"` } });
    if (request.resourceType() === 'eventsource') return route.fulfill({ contentType: 'text/event-stream', body: ': controlled\n\n' });
    if (path === '/api/v1/session') return reply({ csrf_token: 'c'.repeat(43), instance_id: id(90) });
    if (request.method() !== 'GET') {
      mutations.push({ path, body: request.postDataJSON(), operation: request.headers()['idempotency-key'] });
      if (path.endsWith('/decisions')) {
        if (failRevision) { failRevision = false; attempt.revision++; return route.fulfill({ status: 412, json: { error: { code: 'REVISION_CONFLICT', message: 'A tentativa mudou.', request_id: 'controlled' } } }); }
        const operationId = request.headers()['idempotency-key'];
        operations.set(operationId, { operation_id: operationId, kind: 'attempt.decision', resource: { type: 'attempt', id: attemptId }, state: 'succeeded', request_id: 'controlled' });
        if (lostResponse) return route.abort('failed');
        return reply({ operation_id: operationId, resource: { type: 'attempt', id: attemptId }, status_url: `/api/v1/operations/${operationId}`, request_id: 'controlled' });
      }
      throw new Error(`Unexpected mutation: ${path}`);
    }
    if (path.startsWith('/api/v1/operations/')) return reply(operations.get(path.split('/').at(-1)));
    if (path === '/api/v1/settings') return reply(settings);
    if (path === '/api/v1/events') return reply({ items: [], next_cursor: null, has_more: false, event_cursor: '1' });
    if (path.endsWith('/diagnostics')) return reply({ context: { scope: 'attempt', id: attemptId }, supported_checks: [], reports: [], diagnostics: [], event_cursor: '1' });
    if (path.endsWith('/resources')) return reply({ entries: [], cleanup: 'pending', event_cursor: '1' });
    if (path.endsWith('/producer-result')) return reply({ binding: { delivery_version: version }, result: { additional_changes_justification: 'Ajuste adicional necessário na validação compartilhada.' } });
    if (path.endsWith('/review')) return reply({ delivery_id: version, command_repetitions: [{ command: 'npm test', reason: 'Reproduzir falha com entrada vazia.', prior_evidence: ['Log da versão atual'] }] });
    if (path === `/api/v1/deliveries/${version}`) return reply({ delivery: { id: version, attempt_id: attemptId, producer_passage_id: id(10), round: 3, capture_state: 'captured', warnings: [], revision: 1 }, verification: { state: 'failed' }, attempt, measurements: attempt.measurements, cleanup: 'pending', authorizations: { captured_mode: 'icr', authorized_mode: 'icr', requires_current_gate: true }, event_cursor: '1', publication, capabilities: { diff: available, complete_publication: unavailable, reconcile_publication: unavailable } });
    if (path === `/api/v1/attempts/${attemptId}`) {
      const section = url.searchParams.get('section');
      if (['finding_assessments', 'finding_disputes', 'decisions'].includes(section)) {
        historyReads.push(section);
        return reply({ ...attempt, details: null, v3_details: { section, items: section === 'finding_assessments' ? assessments : section === 'finding_disputes' ? disputes : [], has_more: false, next_cursor: null } });
      }
      const items = section === 'findings' ? findings : section === 'checks' ? ['failed', 'error', 'pending'].map((state, i) => ({ id: id(120 + i), state, repeat_reason: i === 0 ? 'Reproduzir o caso da versão atual.' : null, artifacts: [] })) : [];
      return reply({ ...attempt, details: section ? { section, items, has_more: false, next_cursor: null } : null });
    }
    if (path === '/api/v1/attempts') return reply({ items: [attempt], next_cursor: null, has_more: false, event_cursor: '1' });
    return reply({ items: [], next_cursor: null, has_more: false, event_cursor: '1', prerequisites: [], diagnostics: [] });
  });
  const url = `${origin}/#principal/tentativas?dialog=detail&attemptId=${attemptId}`;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url); await page.waitForLoadState('networkidle');
  const panel = page.getByRole('region', { name: 'Decisão sobre o bloqueio' });
  await panel.getByText(attempt.block.cause).waitFor();
  assert(await panel.getByRole('radio', { checked: true }).count() === 0, 'automatic choice');
  assert(historyReads.length === 0, 'history polled before demand');
  await panel.getByRole('radio', { name: 'Orientar a mesma tentativa' }).check();
  await panel.getByRole('textbox', { name: 'Orientação contextual' }).fill('Reproduza o caso vazio e mantenha o critério.');
  await page.getByRole('button', { name: 'Fechar diálogo', exact: true }).click();
  await page.goto(url); await page.waitForLoadState('networkidle');
  assert(await panel.getByRole('textbox').inputValue() === 'Reproduza o caso vazio e mantenha o critério.', 'draft lost after reopen');
  await page.getByRole('button', { name: 'Confirmar decisão' }).click();
  await panel.getByText('A revisão venceu.', { exact: false }).waitFor();
  assert(await page.getByRole('button', { name: 'Confirmar decisão' }).isDisabled(), 'stale action still enabled');
  await panel.getByRole('button', { name: 'Revisei o estado e a ação' }).click();
  lostResponse = true;
  await page.getByRole('button', { name: 'Confirmar decisão' }).dblclick();
  await panel.getByText('Envio sem confirmação.', { exact: false }).waitFor();
  assert(mutations.length === 2, 'duplicate command');
  await page.getByRole('button', { name: 'Fechar diálogo', exact: true }).click();
  await page.goto(url); await page.waitForLoadState('networkidle');
  await panel.getByText('Decisão registrada.', { exact: false }).waitFor();
  assert(mutations.length === 2, 'reopening resent command');
  await page.getByText('Ciclo de correção e decisões', { exact: true }).click();
  for (const title of ['Progresso dos problemas', 'Contestações e respostas', 'Decisões registradas']) {
    const section = page.locator('details').filter({ has: page.locator('summary', { hasText: title }) }).last();
    await section.locator('summary').first().click();
    await section.getByRole('button', { name: 'Consultar histórico', exact: true }).click();
  }
  await page.getByText('Parcial comprovado · rodada 3', { exact: true }).waitFor();
  await page.getByText('Revisor mantém o achado:', { exact: false }).waitFor();
  await page.getByText('Justificativas da correção e comandos repetidos', { exact: true }).click();
  await page.getByRole('button', { name: 'Consultar justificativas', exact: true }).click();
  await page.getByText('Reproduzir falha com entrada vazia.', { exact: true }).waitFor();
  await page.getByText('Validação e histórico da versão', { exact: true }).click();
  await page.locator('summary').filter({ hasText: /^Achados e resoluções/ }).click();
  await page.getByText('Recusar entrada vazia', { exact: true }).waitFor();
  assert(await page.getByText('Alta', { exact: true }).count() === 1, 'priority missing');
  await page.getByText('Permanece pendente', { exact: true }).waitFor();
  await page.locator('summary').filter({ hasText: /^Checks e logs/ }).click();
  await page.getByText('Erro técnico de execução. Não comprova defeito no produto.', { exact: true }).waitFor();
  await page.getByText('Não verificado nesta versão.', { exact: true }).waitFor();
  await page.getByText('Motivo da repetição', { exact: true }).click();
  await page.getByText('Reproduzir o caso da versão atual.', { exact: true }).waitFor();
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tests/browser/evidence/sprint022-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tests/browser/evidence/sprint022-mobile.png', fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile overflow');
  await page.getByText('Parcial comprovado · rodada 3', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tests/browser/evidence/sprint022-history-mobile.png', fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'history mobile overflow');
  findings[0].priority = null;
  await page.getByRole('button', { name: 'Atualizar tentativa', exact: true }).click();
  await page.getByText('Não registrada no legado', { exact: true }).waitFor();
  // Fresh block identities represent distinct current scenarios and must not borrow a previous decision.
  for (const reason of ['dispute_maintained', 'correction_limit']) {
    attempt.block = { ...attempt.block, id: id(reason === 'correction_limit' ? 202 : 201), reason, cause: reason === 'correction_limit' ? 'Limite total atingido.' : 'Contestação mantida após revisão independente.', guidance_capability: reason === 'correction_limit' ? { available: false, reason: 'O limite total não permite orientação adicional.' } : available };
    await page.getByRole('button', { name: 'Atualizar tentativa', exact: true }).click();
    await panel.getByText(attempt.block.cause, { exact: true }).waitFor();
    assert(await panel.getByRole('radio', { checked: true }).count() === 0, 'choice leaked across block');
    if (reason === 'correction_limit') assert(await panel.getByRole('radio', { name: 'Orientar a mesma tentativa' }).isDisabled(), 'limit bypass');
  }
  attempt.block = { ...attempt.block, id: id(203), reason: 'dispute_maintained', cause: 'Escolha de novo perfil após desacordo.', guidance_capability: available };
  await page.getByRole('button', { name: 'Atualizar tentativa', exact: true }).click();
  await panel.getByText(attempt.block.cause, { exact: true }).waitFor();
  lostResponse = false;
  await panel.getByRole('radio', { name: 'Preparar sucessora com outro perfil' }).check();
  await panel.getByRole('button', { name: 'Consultar perfis disponíveis' }).click();
  await panel.getByRole('combobox', { name: 'Perfil e papel da sucessora' }).click();
  await page.getByRole('button', { name: 'Revisor alternativo · Revisor · revisão 3', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar decisão' }).click();
  await panel.getByText('Sucessora preparada, sem iniciar.', { exact: false }).waitFor();
  assert(mutations.at(-1).body.action === 'change_profile' && mutations.at(-1).body.profile_revision === 3 && mutations.at(-1).body.role === 'reviewer', 'profile payload incorrect');
  attempt.block = { ...attempt.block, id: id(204), cause: 'Encerramento explícito da tentativa anterior.' };
  await page.getByRole('button', { name: 'Atualizar tentativa', exact: true }).click();
  await panel.getByText(attempt.block.cause, { exact: true }).waitFor();
  await panel.getByRole('radio', { name: 'Encerrar tentativa' }).check();
  await page.getByRole('button', { name: 'Confirmar decisão' }).click();
  await panel.getByText('Encerramento solicitado.', { exact: false }).waitFor();
  assert(mutations.at(-1).body.action === 'end', 'end payload incorrect');
  assert(mutations.every(item => item.path.endsWith('/decisions')), 'unexpected operational effect');
  assert(errors.length === 0, errors.join('\n'));
  return { passed: true, states: ['recurrence', 'proven_partial', 'disagreement', 'total_limit', 'unavailable_action'], draft_preserved: true, stale_requires_review: true, lost_response_same_operation: true, command_count: mutations.length, history_reads: historyReads, errors };
}
