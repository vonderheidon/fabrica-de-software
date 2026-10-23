import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import { insertRevision, registerProject } from '../../apps/controller/src/modules/storage/configuration-writes.js';
import { readConfiguration } from '../../apps/controller/src/modules/storage/configuration-reads.js';

interface ProjectHistoryRecord {
  projectId: string;
  projectRevisionId: string;
  attemptId: string;
  deliveryId: string;
  passageId: string;
  reviewId: string;
  creationId: string;
  questionId: string;
  resourceId: string;
}
interface ProjectDeletionHistoryBase {
  selected: ProjectHistoryRecord;
  other: ProjectHistoryRecord;
  accountId: string;
  profileId: string;
  globalOperation: string;
  globalQueueOperation: string;
  insert: (table: string, row: Record<string, string | number | null>) => void;
  operation: (type: string, resourceId: string, kind?: string, id?: string) => string;
  event: (type: string, entityId: string, operationId: string) => number | bigint;
}
interface ProjectDeletionCommand {
  operationId: string;
  projectId: string;
  workerGeneration: number;
  workerToken: string;
}
interface ProjectDeletionHistoryWithCommand extends ProjectDeletionHistoryBase { command: ProjectDeletionCommand }

/** Complete relational history, with real constraints/triggers enabled throughout. */
export function projectDeletionHistory(db: Database.Database, beforeAuthorization?: () => void, automationEnabled?: boolean): ProjectDeletionHistoryWithCommand;
export function projectDeletionHistory(db: Database.Database, beforeAuthorization: () => void, automationEnabled: boolean,
  includePendingDeletion: false, fixtureDirectory?: string): ProjectDeletionHistoryBase;
export function projectDeletionHistory(db: Database.Database, beforeAuthorization: () => void = () => {}, automationEnabled = false,
  includePendingDeletion = true, fixtureDirectory = tmpdir()): ProjectDeletionHistoryBase & { command?: ProjectDeletionCommand } {
  const uuid = (): string => randomUUID();
  const hash = 'a'.repeat(64);
  const sha = 'b'.repeat(40);
  const installationId = db.prepare<[], { installation_id: string }>('SELECT installation_id FROM factory_settings').get()!.installation_id;
  const accountId = uuid();
  const profileId = uuid();
  function insert(table: string, row: Record<string, string | number | null>) {
    db.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(key => `@${key}`).join(',')})`).run(row);
  }
  insert('accounts', { github_account_id: accountId, login: 'fixture', observed_at_ms: 0, created_at_ms: 0, updated_at_ms: 0 });
  insert('execution_profiles', { id: profileId, name: 'Shared', name_key: 'shared', profile_type: 'implementer', executor: 'maestri-omp',
    provider: 'fixture', model: 'fixture', effort: null, guidance: '', created_at_ms: 0, updated_at_ms: 0 });
  const managedTerminalSchema = Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='managed_terminals'").get());
  const managedTerminals = new Map<'implementer' | 'reviewer', { id: string; terminalId: string }>();
  if (managedTerminalSchema) for (const role of ['implementer', 'reviewer'] as const) {
    let terminal = db.prepare<[string, string, string], { id: string; terminal_id: string; generation: number; state: 'planned' | 'available' }>(
      'SELECT id,terminal_id,generation,state FROM managed_terminals WHERE installation_id=? AND host_name=? AND role=? LIMIT 1',
    ).get(installationId, 'project-deletion-fixture', role);
    if (!terminal) {
      const id = uuid(); const terminalId = uuid();
      insert('managed_terminals', { id, installation_id: installationId, host_name: 'project-deletion-fixture', role, owner: 'factory',
        generation: 1, terminal_name: `factory-${id}`, workspace_id: uuid(), terminal_id: terminalId, state: 'planned', observed_at_ms: 0, created_at_ms: 0, updated_at_ms: 0 });
      terminal = { id, terminal_id: terminalId, generation: 1, state: 'planned' };
    }
    managedTerminals.set(role, { id: terminal.id, terminalId: terminal.terminal_id });
  }
  insert('controller_authority', { id: 'local', configured_account_id: accountId, observed_account_id: accountId, dispatch_paused: 1, observed_at_ms: 0 });
  function operation(type: string, resourceId: string, kind = 'fixture.history', id = uuid()) {
    insert('operation_requests', { operation_id: id, installation_id: installationId, account_id: accountId,
      operation_kind: kind, resource_type: type, resource_id: resourceId, request_hash: hash });
    return id;
  }
  function event(type: string, entityId: string, operationId: string) {
    return db.prepare(`INSERT INTO events(entity_type,entity_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms)
      SELECT ?,?,?,'fixture',coalesce(max(entity_revision),0)+1,'{}',0 FROM events WHERE operation_id=?`)
      .run(type, entityId, operationId, operationId).lastInsertRowid;
  }
  const globalOperation = operation('settings', 'local', 'settings.update');
  event('settings', 'local', globalOperation);
  const globalQueueOperation = operation('queue', 'local', 'queue.update');
  event('queue', 'local', globalQueueOperation);
  const hostDiagnostic = uuid();
  operation('diagnostic', hostDiagnostic, 'diagnostics.check', hostDiagnostic);
  insert('diagnostic_runs', { operation_id: hostDiagnostic, installation_id: installationId, account_id: accountId, scope: 'host',
    context_id: 'local', context_stamp: hash, checks_json: '["git"]', state: 'succeeded', created_at_ms: 0, completed_at_ms: 0 });
  event('diagnostic', hostDiagnostic, hostDiagnostic);
  function project() {
    const source = { kind: 'github' as const, location: 'https://github.com/fixture/shared',
      repository_id: 'shared-repository', repository_url: 'https://github.com/fixture/shared' };
    const registered = registerProject(db, { operationId: uuid(), expectedRevision: undefined,
      body: { name: 'Same name', source: { kind: 'github', location: source.location }, base_branch: 'main' }, source, originNotes: [] });
    const projectId = registered.resource.id;
    const projectRevisionId = db.prepare<[string], { current_revision_id: string }>('SELECT current_revision_id FROM projects WHERE id=?').get(projectId)!.current_revision_id;
    const { id: _id, project_id: _projectId, revision: _revision, created_at_ms: _createdAt, ...configuration } = readConfiguration(db, projectId).configuration;
    const currentRevisionId = uuid();
    db.transaction(() => {
      insertRevision(db, projectId, currentRevisionId, 2, { ...configuration, implementer_profile_id: profileId, automation_enabled: automationEnabled }, []);
      db.prepare('UPDATE projects SET current_revision_id=?,revision=2 WHERE id=?').run(currentRevisionId, projectId);
    })();
    return { projectId, projectRevisionId, currentRevisionId };
  }
  function history() {
    const { projectId, projectRevisionId, currentRevisionId } = project();
    const preparationId = uuid(); const attemptId = uuid();
    db.transaction(() => {
      insert('preparations', { id: preparationId, project_id: projectId, account_id: accountId, revision: 2, created_at_ms: 0, updated_at_ms: 0 });
      insert('preparation_revisions', { preparation_id: preparationId, revision: 1, project_id: projectId,
        project_revision_id: projectRevisionId, choices_json: '{"formatVersion":1,"choices":{}}', created_at_ms: 0 });
      insert('preparation_revisions', { preparation_id: preparationId, revision: 2, project_id: projectId,
        project_revision_id: currentRevisionId, choices_json: '{"formatVersion":1,"choices":{}}', created_at_ms: 0 });
    })();
    const attemptOperation = operation('attempt', attemptId, 'attempt.start');
    insert('attempts', { id: attemptId, operation_id: attemptOperation, project_id: projectId, project_revision_id: projectRevisionId,
      preparation_id: preparationId, preparation_revision: 1, account_id: accountId, repository_id: 'shared-repository', issue_id: 'shared-issue',
      capture_json: JSON.stringify({ formatVersion: 1, configuration: { implementerProfile: { id: profileId } } }),
      phase: 'finished', result: 'delivered', source: 'manual', created_at_ms: 0, updated_at_ms: 0 });
    const attemptSessions = new Map<'implementer' | 'reviewer', string>();
    const sessionGenerations = new Map<'implementer' | 'reviewer', number>();
    if (managedTerminalSchema) for (const role of ['implementer', 'reviewer'] as const) {
      const sessionId = uuid(); attemptSessions.set(role, sessionId);
      const terminal = db.prepare<[string], { generation: number; state: 'planned' | 'available' }>(
        'SELECT generation,state FROM managed_terminals WHERE id=?',
      ).get(managedTerminals.get(role)!.id)!;
      const sessionGeneration = terminal.state === 'available' ? terminal.generation + 1 : terminal.generation;
      sessionGenerations.set(role, sessionGeneration);
      insert('attempt_sessions', { id: sessionId, attempt_id: attemptId, role, managed_terminal_id: managedTerminals.get(role)!.id,
        session_directory_relative: `fixture/${attemptId}/sessions/${role}`, omp_session_id: uuid(), terminal_generation: sessionGeneration,
        state: 'completed', created_at_ms: 0, updated_at_ms: 0 });
      db.prepare("UPDATE managed_terminals SET generation=?,state='available' WHERE id=?")
        .run(sessionGeneration, managedTerminals.get(role)!.id);
    }
    insert('attempt_criteria', { attempt_id: attemptId, criterion_id: 'ac-1', occurrence_index: 1, text: 'Criterion' });
    const preparationOperation = operation('preparation', preparationId);
    event('preparation', preparationId, preparationOperation); // no project_id/FK to preparation
    let priorFinding: string | undefined;
    let priorProducer: string | null = null;
    let deliveryId = ''; let passageId = ''; let reviewId = '';
    for (const round of [1, 2]) {
      deliveryId = uuid(); passageId = uuid(); const reviewerId = uuid();
      insert('rounds', { attempt_id: attemptId, round_number: round, delivery_version: deliveryId, created_at_ms: 0 });
      for (const [id, role] of [[passageId, 'implementer'], [reviewerId, 'reviewer']] as const) {
        insert('passages', { id, attempt_id: attemptId, round_number: round, delivery_version: deliveryId, role,
          role_resource_json: '{}', terminal_name: uuid(), state: 'ready', tracking_state: 'tracked', created_at_ms: 0,
          session_source_id: role === 'implementer' ? priorProducer : null,
          ...(managedTerminalSchema ? { attempt_session_id: attemptSessions.get(role)! } : {}) });
        if (managedTerminalSchema) insert('terminal_occupancies', { id: uuid(), managed_terminal_id: managedTerminals.get(role)!.id,
          attempt_session_id: attemptSessions.get(role)!, attempt_id: attemptId, passage_id: id, generation: sessionGenerations.get(role)!,
          state: 'released', claimed_at_ms: 0, released_at_ms: 0, reason: 'fixture-history' });
        insert('passage_results', { passage_id: id, attempt_id: attemptId, result_hash: hash, receipt_id: uuid(), summary_json: '{}', accepted_at_ms: 0 });
        insert('criterion_results', { passage_id: id, attempt_id: attemptId, criterion_id: 'ac-1', verdict: 'passed', evidence_json: '["proof"]' });
        insert('passage_events', { passage_id: id, event_type: 'fixture', created_at_ms: 0 });
        insert('passage_measurements', { passage_id: id, checkpoint_ms: 0, mode: 'stopped', observed: 0 });
      }
      insert('deliveries', { id: deliveryId, attempt_id: attemptId, round_number: round, producer_passage_id: passageId,
        base_sha: sha, repository_relative: `git/${attemptId}.git`, capture_state: 'captured', git_ref: `refs/factory/deliveries/${deliveryId}`,
        content_identity: sha, commit_sha: sha, has_delta: 1, captured_at_ms: 0 });
      const captureOperation = operation('delivery', deliveryId, 'capture.retry');
      insert('capture_runs', { id: uuid(), delivery_id: deliveryId, operation_id: captureOperation, state: 'captured', started_at_ms: 0, ended_at_ms: 0 });
      // Warnings are sealed after capture, so use a second pending delivery below.
      const verificationId = uuid(); const checkId = uuid();
      insert('verification_runs', { id: verificationId, delivery_id: deliveryId, attempt_id: attemptId, content_identity: sha,
        run_number: 1, state: 'passed', started_at_ms: 0, ended_at_ms: 0 });
      insert('checks', { id: checkId, verification_id: verificationId, delivery_id: deliveryId, attempt_id: attemptId,
        content_identity: sha, check_definition_id: 'test', run_number: 1, command: 'fixture', cwd_relative: '.', timeout_ms: 1,
        state: 'passed', exit_code: 0, started_at_ms: 0, ended_at_ms: 0 });
       const artifactId = uuid();
       insert('artifacts', { id: artifactId, attempt_id: attemptId, delivery_id: deliveryId, check_id: checkId,
         kind: 'check_log', path_relative: `${attemptId}/${checkId}/${artifactId}.log`, sha256: hash, size_bytes: 1, created_at_ms: 0 });
      reviewId = uuid();
      insert('reviews', { id: reviewId, delivery_id: deliveryId, attempt_id: attemptId, passage_id: reviewerId, verification_id: verificationId,
        content_identity: sha, state: 'pending', independence_state: 'valid', workspace_state: 'ready', created_at_ms: 0 });
      if (priorFinding) insert('finding_resolutions', { finding_id: priorFinding, review_id: reviewId, attempt_id: attemptId, verdict: 'resolved', evidence_json: '["proof"]' });
      const findingId = uuid();
      insert('findings', { id: findingId, review_id: reviewId, attempt_id: attemptId, finding_key: 'finding', criterion_ids_json: '["ac-1"]',
        category: 'correctness', problem: 'Fixture', evidence_json: '["proof"]', expected_result: 'Correct', blocking: 1 });
      db.prepare("UPDATE reviews SET state='rejected',completed_at_ms=0 WHERE id=?").run(reviewId);
      priorFinding = findingId; priorProducer = passageId;
    }
    // Third delivery exercises warning ownership with no captured-content mutation.
    const warningDelivery = uuid(); const warningPassage = uuid();
    insert('rounds', { attempt_id: attemptId, round_number: 3, delivery_version: warningDelivery, created_at_ms: 0 });
    insert('passages', { id: warningPassage, attempt_id: attemptId, round_number: 3, delivery_version: warningDelivery, role: 'implementer',
      role_resource_json: '{}', terminal_name: uuid(), state: 'cancelled', tracking_state: 'tracked', created_at_ms: 0,
      ...(managedTerminalSchema ? { attempt_session_id: attemptSessions.get('implementer')! } : {}) });
    if (managedTerminalSchema) insert('terminal_occupancies', { id: uuid(), managed_terminal_id: managedTerminals.get('implementer')!.id,
      attempt_session_id: attemptSessions.get('implementer')!, attempt_id: attemptId, passage_id: warningPassage,
      generation: sessionGenerations.get('implementer')!, state: 'released', claimed_at_ms: 0, released_at_ms: 0, reason: 'fixture-history' });
    insert('passage_results', { passage_id: warningPassage, attempt_id: attemptId, result_hash: hash, receipt_id: uuid(), summary_json: '{}', accepted_at_ms: 0 });
    insert('deliveries', { id: warningDelivery, attempt_id: attemptId, round_number: 3, producer_passage_id: warningPassage,
      base_sha: sha, repository_relative: `git/${attemptId}.git`, capture_state: 'failed' });
    insert('capture_warnings', { delivery_id: warningDelivery, attempt_id: attemptId, passage_id: warningPassage, path: 'fixture', reason: 'KNOWN_SECRET_EXCLUDED' });
    const resourceId = uuid(); const questionId = uuid();
    insert('resources', { id: resourceId, attempt_id: attemptId, passage_id: passageId, kind: 'implementation', reference: `work/${attemptId}/implementation`,
      owned: 1, launch_state: 'ready', stop_state: 'confirmed', removed: 1, created_at_ms: 0 });
    const questionOperation = operation('question', questionId, 'question.answer');
    insert('execution_questions', { id: questionId, passage_id: passageId, attempt_id: attemptId, question_hash: hash, question_json: '{}',
      answer_operation_id: questionOperation, answer: 'Fixture', state: 'delivered', created_at_ms: 0 });
    event('question', questionId, questionOperation);
    insert('cancellation_requests', { operation_id: operation('attempt', attemptId, 'attempt.cancel'), attempt_id: attemptId, created_at_ms: 0 });
    insert('resource_removals', { operation_id: operation('resource', resourceId, 'resource.remove'), resource_id: resourceId,
      plan_hash: hash, state: 'removed', created_at_ms: 0 });
    insert('native_open_requests', { operation_id: operation('resource', resourceId, 'folder.open'), resource_id: resourceId,
      kind: 'folder.open', state: 'requested', created_at_ms: 0 });
    const publicationOperation = operation('attempt', attemptId, 'publication.authorize-upgrade');
    insert('publication_requests', { operation_id: publicationOperation, attempt_id: attemptId, delivery_id: deliveryId,
      kind: 'publication.authorize-upgrade', authorized_mode: 'commit', state: 'succeeded', created_at_ms: 0 });
    insert('publication_upgrades', { operation_id: publicationOperation, attempt_id: attemptId, delivery_id: deliveryId,
      current_mode: 'icr', target_mode: 'commit', summary_hash: hash, created_at_ms: 0 });
    insert('attempt_authority', { attempt_id: attemptId, observed_at_ms: 0 });
    insert('queue_cycles', { account_id: accountId, project_id: projectId, issue_id: 'shared-issue', last_ready: 1, consumed_attempt_id: attemptId, updated_at_ms: 0 });
    insert('queue_consumptions', { id: uuid(), account_id: accountId, project_id: projectId, repository_id: 'shared-repository',
      issue_id: 'shared-issue', observed_cycle: 1, consumed_at_ms: 0, attempt_id: attemptId });
    const creationId = uuid();
    insert('project_creations', { id: creationId, operation_id: operation('creation', creationId, 'scaffold.create'), installation_id: installationId,
      account_id: accountId, project_id: projectId, plan_hash: hash, plan_json: '{}', destination: resolve(fixtureDirectory, 'fixture', creationId), state: 'completed',
      baseline_sha: sha, baseline_ref: 'fixture', created_at_ms: 0 });
    insert('creation_steps', { creation_id: creationId, step: 'registration', state: 'confirmed' });
    insert('creation_reconciliations', { operation_id: operation('creation', creationId, 'scaffold.reconcile'), creation_id: creationId, state: 'succeeded' });
    const effectOperation = operation('attempt', attemptId, 'effect.issue_comment');
    insert('effects', { operation_id: effectOperation, attempt_id: attemptId, delivery_id: deliveryId, kind: 'issue_comment', scope_key: uuid(),
      authorization_json: '{}', expected_identity_json: '{}', state: 'not_applicable', created_at_ms: 0 });
    insert('effects', { operation_id: operation('creation', creationId, 'effect.create_repository'), creation_id: creationId,
      kind: 'create_repository', scope_key: uuid(), authorization_json: '{}', expected_identity_json: '{}', state: 'not_applicable', created_at_ms: 0 });
    // Event uses effect identity, no attempt_id/project_id. Its separate operation
    // resolves by the same domain, instead of relying on the effect's FKs.
    event('effect', effectOperation, operation('effect', effectOperation));
    const diagnosticId = uuid();
    operation('diagnostic', diagnosticId, 'diagnostics.check', diagnosticId);
    insert('diagnostic_runs', { operation_id: diagnosticId, installation_id: installationId, account_id: accountId, scope: 'creation',
      context_id: creationId, project_id: projectId, creation_id: creationId, context_stamp: hash, checks_json: '["git"]',
      state: 'succeeded', created_at_ms: 0, completed_at_ms: 0 });
    event('diagnostic', diagnosticId, diagnosticId);
    return { projectId, projectRevisionId, attemptId, deliveryId, passageId, reviewId, creationId, questionId, resourceId };
  }
  const selected = history(); const other = history();
  beforeAuthorization();
  const deletionOperation = uuid();
  if (includePendingDeletion) {
    operation('project', selected.projectId, 'project.delete', deletionOperation);
    insert('project_deletions', { operation_id: deletionOperation, project_id: selected.projectId, expected_revision: 2,
      authorization_digest: hash, state: 'running', worker_token: 'fixture-worker', worker_generation: 2, created_at_ms: 0, updated_at_ms: 0 });
    insert('project_deletion_targets', { operation_id: deletionOperation, target_key: 'workspace', target_kind: 'exclusive_workspace',
      authorized_path: 'fixture', normalized_path: 'fixture', object_kind: 'absent', identity_json: '{}', owner_kind: 'attempt',
      owner_id: selected.attemptId, state: 'removed', verified_at_ms: 0 });
  }
  return { selected, other, accountId, profileId, globalOperation, globalQueueOperation, insert, operation, event,
    ...(includePendingDeletion ? { command: { operationId: deletionOperation, projectId: selected.projectId, workerGeneration: 2, workerToken: 'fixture-worker' } } : {}) };
}
