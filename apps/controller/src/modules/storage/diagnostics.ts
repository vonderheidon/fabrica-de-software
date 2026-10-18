import { serializeOperationReceipt } from './common-json.js';
import type Database from 'better-sqlite3';
import { hostname } from 'node:os';
import { Value } from '@sinclair/typebox/value';
import { DiagnosticContext, DiagnosticRequest, DiagnosticReport, ContextDiagnostic, OperationId,
  type DiagnosticCheck, type DiagnosticsView } from '#contracts';
import { digest, eventCursor, guarded, readProject } from './configuration-reads.js';
import { readSettings } from './settings.js';
import { readAttempt } from './attempts.js';
import { readOperation, OperationError, type StoredOperation } from './operations.js';
import { StorageError } from './errors.js';

export interface DiagnosticCommand { operationId: string; body: DiagnosticRequest }
export const supportedChecks = (scope: DiagnosticContext['scope']): DiagnosticCheck[] =>
  scope === 'creation' ? ['configuration', 'github_identity', 'resources'] : ['configuration', 'github_identity', 'maestri_context', ...(scope === 'attempt' ? ['resources' as const] : [])];

export function diagnostic(check: DiagnosticCheck, code: string, cause: string, recovery: string,
  facts: ContextDiagnostic['facts'] = {}, state: ContextDiagnostic['state'] = 'blocked'): ContextDiagnostic {
  const requirements: Record<DiagnosticCheck, string[]> = {
    configuration: ['RF-81', 'RF-88'], github_identity: ['RF-38', 'RF-88'], maestri_context: ['INT-01', 'INT-02', 'RF-88'], resources: ['RF-65', 'RF-88'],
  };
  const configurationSetupIssue = check === 'configuration' && (code.startsWith('ONBOARDING_') || code.startsWith('PROJECTS_ROOT_') ||
    code === 'IMPLEMENTER_PROFILE_REQUIRED' || code === 'REVIEWER_PROFILE_REQUIRED' || code === 'PROFILES_REQUIRED');
  const value = { check, code, cause, recovery, facts, state,
    affectedRequirements: configurationSetupIssue ? ['RF-23', 'RF-24', 'RF-25'] : requirements[check], observedAtMs: Date.now() };
  if (!Value.Check(ContextDiagnostic, value)) throw new StorageError('OPERATION_DATA_INVALID');
  return value;
}

export function diagnosticContext(db: Database.Database, context: DiagnosticContext) {
  if (!Value.Check(DiagnosticContext, context)) throw new OperationError(400, 'DIAGNOSTIC_CONTEXT_INVALID', 'Select a supported context.');
  const settings = readSettings(db);
  let projectId: string | null = null;
  let creationId: string | null = null;
  let attemptId: string | null = null;
  let revision = settings.revision;
  let tracking: string | null = null;
  let reason: string | null = null;
  if (context.scope === 'project') { projectId = context.id; revision = readProject(db, context.id).project.revision; }
  if (context.scope === 'attempt') {
    const a = readAttempt(db, context.id);
    attemptId = context.id; projectId = a.projectId; revision = a.revision; tracking = a.tracking; reason = a.suspension;
  }
  if (context.scope === 'creation') {
    const c = db.prepare<[string, string, string | null], { project_id: string | null; revision: number; diagnostic: string | null }>(
      'SELECT project_id,revision,diagnostic FROM project_creations WHERE id=? AND installation_id=? AND account_id IS ?').get(context.id, settings.installation_id, settings.account_id);
    if (!c) throw new OperationError(404, 'CREATION_NOT_FOUND', 'Creation not found in this account.');
    creationId = context.id; projectId = c.project_id; revision = c.revision; reason = c.diagnostic;
  }
  const profileCounts = db.prepare<[], { total: number; implementer: number; reviewer: number }>(`SELECT count(*) AS total,
    coalesce(sum(CASE WHEN profile_type = 'implementer' THEN 1 ELSE 0 END), 0) AS implementer,
    coalesce(sum(CASE WHEN profile_type = 'reviewer' THEN 1 ELSE 0 END), 0) AS reviewer
    FROM execution_profiles WHERE deleted_at_ms IS NULL`).get();
  if (!profileCounts) throw new StorageError('PROFILE_DATA_INVALID');
  const profileCount = profileCounts.total;
  const profileRevisions = db.prepare<[], { id: string; revision: number }>(`SELECT id,revision FROM execution_profiles
    WHERE deleted_at_ms IS NULL ORDER BY id`).all();
  const onboardingFacts = db.prepare<[], { completed_at_ms: number | null; projects_root_confirmed_at_ms: number | null }>(
    "SELECT onboarding_completed_at_ms AS completed_at_ms, projects_root_confirmed_at_ms FROM factory_settings WHERE id='local'",
  ).get();
  if (!onboardingFacts) throw new StorageError('SETTINGS_INVALID');
  const projectRevision = projectId ? readProject(db, projectId).project.current_revision_id : null;
  const facts: ContextDiagnostic['facts'] = { expectedAccountId: settings.account_id, expectedHost: settings.designated_host, observedHost: hostname(),
    profileCount, implementerProfileCount: profileCounts.implementer ?? 0, reviewerProfileCount: profileCounts.reviewer ?? 0,
    onboardingCompletedAtMs: onboardingFacts.completed_at_ms, projectsRootConfigured: settings.projects_root !== null,
    projectsRootConfirmed: settings.projects_root !== null && onboardingFacts.projects_root_confirmed_at_ms !== null,
    ...(projectId ? { projectId } : {}), ...(attemptId ? { attemptId } : {}), ...(creationId ? { creationId } : {}) };
  return { context, projectId, attemptId, creationId, revision, tracking, reason, facts, settings,
    stamp: digest([settings.installation_id, settings.account_id, settings.revision, context, revision, projectRevision, profileRevisions]),
    supportedChecks: supportedChecks(context.scope) };
}

export function configurationDiagnostics(db: Database.Database, context: DiagnosticContext): ContextDiagnostic[] {
  const c = diagnosticContext(db, context); const items: ContextDiagnostic[] = [];
  const onboardingCompleted = typeof c.facts.onboardingCompletedAtMs === 'number';
  if (!c.settings.account_id) items.push(diagnostic('configuration', onboardingCompleted ? 'ONBOARDING_ACCOUNT_RELINK_REQUIRED' : 'ACCOUNT_UNOBSERVED',
    onboardingCompleted ? 'A configuração inicial foi concluída, mas não há uma conta GitHub vinculada no momento.' : 'Conta GitHub ainda não vinculada a uma observação.',
    'Abra Configuração > GitHub e vincule uma conta elegível observada no host autorizado.', c.facts));
  if (context.scope === 'host' && c.settings.projects_root === null) items.push(diagnostic('configuration',
    onboardingCompleted ? 'ONBOARDING_PROJECTS_ROOT_REQUIRED' : 'PROJECTS_ROOT_REQUIRED',
    onboardingCompleted ? 'A configuração inicial foi concluída, mas a pasta dos projetos não está configurada.' : 'A pasta dos projetos ainda não está configurada.',
    'Abra Configuração e escolha uma pasta dos projetos com acesso e gravação.', c.facts));
  else if (context.scope === 'host' && c.facts.projectsRootConfirmed !== true) items.push(diagnostic('configuration',
    onboardingCompleted ? 'ONBOARDING_PROJECTS_ROOT_CONFIRMATION_REQUIRED' : 'PROJECTS_ROOT_CONFIRMATION_REQUIRED',
    onboardingCompleted ? 'A pasta dos projetos precisa ser confirmada novamente.' : 'A pasta dos projetos ainda não foi confirmada para acesso e gravação.',
    'Abra Configuração e confirme novamente a pasta dos projetos.', c.facts));
  if (c.projectId) {
    for (const p of readProject(db, c.projectId).prerequisites.slice(0, 90)) items.push(diagnostic('configuration', p.code, p.message, p.recovery, c.facts,
      p.code === 'LOCAL_CHANGES_EXCLUDED' ? 'passed' : 'blocked'));
  } else if (context.scope === 'host') {
    const implementers = Number(c.facts.implementerProfileCount ?? 0);
    const reviewers = Number(c.facts.reviewerProfileCount ?? 0);
    if (c.facts.profileCount === 0) items.push(diagnostic('configuration', 'PROFILES_REQUIRED', 'Nenhum perfil de execução configurado.',
      'Abra Configuração > Perfis e crie um perfil Implementador e um perfil Revisor.', c.facts));
    if (implementers === 0) items.push(diagnostic('configuration', onboardingCompleted ? 'ONBOARDING_IMPLEMENTER_PROFILE_REQUIRED' : 'IMPLEMENTER_PROFILE_REQUIRED',
      onboardingCompleted ? 'A configuração inicial foi concluída, mas falta um perfil Implementador ativo.' : 'Falta um perfil Implementador ativo.',
      'Abra Configuração > Perfis e crie um perfil Implementador.', c.facts));
    if (reviewers === 0) items.push(diagnostic('configuration', onboardingCompleted ? 'ONBOARDING_REVIEWER_PROFILE_REQUIRED' : 'REVIEWER_PROFILE_REQUIRED',
      onboardingCompleted ? 'A configuração inicial foi concluída, mas falta um perfil Revisor ativo.' : 'Falta um perfil Revisor ativo.',
      'Abra Configuração > Perfis e crie um perfil Revisor.', c.facts));
  }
  if (c.tracking && c.tracking !== 'tracked') items.push(diagnostic('resources', 'TRACKING_LOST', 'Acompanhamento da tentativa indisponível.', 'Consulte os recursos preservados; use uma nova tentativa para executar novamente.', c.facts));
  if (c.reason) items.push(diagnostic('configuration', /^[A-Z][A-Z0-9_]{0,127}$/.test(c.reason) ? c.reason : 'CONTEXT_BLOCKED', 'O contexto tem um impedimento registrado.', 'Consulte a criação ou tentativa correspondente e sua recuperação.', c.facts));
  return items.slice(0, 100);
}

interface RunRow { operation_id: string; state: DiagnosticReport['state']; created_at_ms: number; completed_at_ms: number | null; checks_json: string; diagnostics_json: string }
function report(db: Database.Database, row: RunRow): DiagnosticReport {
  const value = { operationId: row.operation_id, receipt: readOperation(db, row.operation_id)?.receipt, state: row.state, createdAtMs: row.created_at_ms, completedAtMs: row.completed_at_ms,
    checks: JSON.parse(row.checks_json) as unknown, diagnostics: JSON.parse(row.diagnostics_json) as unknown };
  if (!Value.Check(DiagnosticReport, value)) throw new StorageError('OPERATION_DATA_INVALID');
  return value;
}
export function readContextDiagnostics(db: Database.Database, context: DiagnosticContext): DiagnosticsView {
  const c = diagnosticContext(db, context);
  const reports = db.prepare<[string, string | null, string, string], RunRow>(`SELECT operation_id,state,created_at_ms,completed_at_ms,checks_json,diagnostics_json FROM diagnostic_runs
    WHERE installation_id=? AND account_id IS ? AND scope=? AND context_id=? ORDER BY created_at_ms DESC,rowid DESC LIMIT 4`)
    .all(c.settings.installation_id, c.settings.account_id, context.scope, context.scope === 'host' ? 'local' : context.id).map(row => report(db, row));
  return { context, supportedChecks: c.supportedChecks, diagnostics: configurationDiagnostics(db, context), reports, eventCursor: eventCursor(db) };
}
function commandHash(command: DiagnosticCommand) {
  if (!Value.Check(OperationId, command.operationId) || !Value.Check(DiagnosticRequest, command.body)) throw new OperationError(400, 'DIAGNOSTIC_INPUT_INVALID', 'Diagnostic input is invalid.');
  const { checks: _checks, ...context } = command.body;
  if (command.body.checks.some(check => !supportedChecks(context.scope).includes(check))) throw new OperationError(400, 'DIAGNOSTIC_CHECK_UNSUPPORTED', 'This context does not support the selected check.');
  return digest({ method: 'POST', route: '/api/v1/diagnostics', body: { ...command.body, checks: [...command.body.checks].sort() } });
}
export function recoverDiagnostic(db: Database.Database, command: DiagnosticCommand): StoredOperation | null {
  const hash = commandHash(command); const s = readSettings(db);
  const row = db.prepare<[string], { installation_id: string; account_id: string | null; request_hash: string }>('SELECT installation_id,account_id,request_hash FROM operation_requests WHERE operation_id=?').get(command.operationId);
  if (!row) return null;
  if (row.installation_id !== s.installation_id || row.account_id !== s.account_id || row.request_hash !== hash) throw new OperationError(409, 'IDEMPOTENCY_CONFLICT', 'Operation conflicts with an accepted command.');
  return readOperation(db, command.operationId);
}
export function acceptDiagnostic(db: Database.Database, command: DiagnosticCommand) {
  return guarded(() => db.transaction(() => {
    const prior = recoverDiagnostic(db, command); if (prior) return { created: false, operation: prior };
    const { checks, ...context } = command.body; const c = diagnosticContext(db, context);
    if (db.prepare(`SELECT 1 FROM diagnostic_runs WHERE installation_id=? AND account_id IS ? AND scope=? AND context_id=? AND state='accepted'`)
      .get(c.settings.installation_id, c.settings.account_id, context.scope, context.scope === 'host' ? 'local' : context.id)) throw new OperationError(409, 'DIAGNOSTIC_ACTIVE', 'A check is already pending in this context.');
    const seq = db.prepare<[], { n: number }>('SELECT coalesce(max(seq),0)+1 AS n FROM events').get()!.n;
    const receipt = { revision: 1, event_cursor: String(seq) }; const now = Date.now();
    db.prepare(`INSERT INTO operation_requests(operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,request_hash,expected_revision_json,receipt_json)
      VALUES (?,?,?,'diagnostics.check','diagnostic',?,?,'{}',?)`).run(command.operationId, c.settings.installation_id, c.settings.account_id, command.operationId, commandHash(command), serializeOperationReceipt(receipt));
    db.prepare(`INSERT INTO diagnostic_runs(operation_id,installation_id,account_id,scope,context_id,project_id,creation_id,attempt_id,context_stamp,checks_json,state,created_at_ms)
      VALUES (?,?,?,?,?,?,?,?,?,?,'accepted',?)`).run(command.operationId, c.settings.installation_id, c.settings.account_id, context.scope,
        context.scope === 'host' ? 'local' : context.id, c.projectId, c.creationId, c.attemptId, c.stamp, JSON.stringify(checks), now);
    db.prepare(`INSERT INTO events(seq,entity_type,entity_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms,project_id,attempt_id)
      VALUES (?,'diagnostic',?,?,'diagnostic.accepted',1,'{}',?,?,?)`).run(seq, command.operationId, command.operationId, now, c.projectId, c.attemptId);
    return { created: true, operation: readOperation(db, command.operationId)! };
  }).immediate());
}
export function finishDiagnostic(db: Database.Database, command: DiagnosticCommand, results: ContextDiagnostic[]): void {
  guarded(() => db.transaction(() => {
    const { checks, ...context } = command.body;
    const row = db.prepare<[string], { state: string; context_stamp: string; installation_id: string; account_id: string | null; project_id: string | null; attempt_id: string | null; created_at_ms: number }>('SELECT state,context_stamp,installation_id,account_id,project_id,attempt_id,created_at_ms FROM diagnostic_runs WHERE operation_id=?').get(command.operationId);
    if (!row || row.state !== 'accepted') return;
    const s = readSettings(db);
    const sameScope = s.installation_id === row.installation_id && s.account_id === row.account_id;
    const unchanged = sameScope && diagnosticContext(db, context).stamp === row.context_stamp;
    if (results.length > 104 || checks.some(check => {
      const count = results.filter(result => result.check === check).length;
      return count < 1 || count > (check === 'configuration' ? 101 : 1);
    }) || results.some(r => !checks.includes(r.check) || !Value.Check(ContextDiagnostic, r))) throw new StorageError('OPERATION_DATA_INVALID');
    const completed = unchanged ? results : checks.map(check => diagnostic(check, 'DIAGNOSTIC_CONTEXT_CHANGED', 'O contexto mudou durante a verificação.', 'Releia o contexto e solicite nova verificação.', {}, 'unavailable'));
    const now = Math.max(Date.now(), row.created_at_ms);
    db.prepare("UPDATE diagnostic_runs SET state=?,diagnostics_json=?,completed_at_ms=? WHERE operation_id=? AND state='accepted'")
      .run(unchanged ? 'succeeded' : 'failed', JSON.stringify(completed), now, command.operationId);
    db.prepare(`INSERT INTO events(entity_type,entity_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms,project_id,attempt_id)
      VALUES ('diagnostic',?,?,'diagnostic.completed',2,'{}',?,?,?)`).run(command.operationId, command.operationId, now, row.project_id, row.attempt_id);
  }).immediate());
}
export function interruptDiagnostics(db: Database.Database): void {
  guarded(() => db.transaction(() => {
    const rows = db.prepare<[], { operation_id: string; checks_json: string; project_id: string | null; attempt_id: string | null; created_at_ms: number }>("SELECT operation_id,checks_json,project_id,attempt_id,created_at_ms FROM diagnostic_runs WHERE state='accepted'").all();
    for (const r of rows) {
      const checks: unknown = JSON.parse(r.checks_json);
      const parsed = { operationId: r.operation_id, receipt: readOperation(db, r.operation_id)?.receipt, state: 'accepted', createdAtMs: r.created_at_ms, completedAtMs: null, checks, diagnostics: [] };
      if (!Value.Check(DiagnosticReport, parsed)) throw new StorageError('OPERATION_DATA_INVALID');
      const items = parsed.checks.map(check => diagnostic(check, 'DIAGNOSTIC_INTERRUPTED', 'A verificação não terminou antes do encerramento.', 'Consulte o contexto e solicite outra verificação explicitamente.', {}, 'unavailable'));
      const now = Math.max(Date.now(), r.created_at_ms);
      db.prepare("UPDATE diagnostic_runs SET state='unknown',diagnostics_json=?,completed_at_ms=? WHERE operation_id=?").run(JSON.stringify(items), now, r.operation_id);
      db.prepare(`INSERT INTO events(entity_type,entity_id,operation_id,event_type,entity_revision,facts_json,occurred_at_ms,project_id,attempt_id)
        VALUES ('diagnostic',?,?,'diagnostic.interrupted',2,'{}',?,?,?)`).run(r.operation_id, r.operation_id, now, r.project_id, r.attempt_id);
    }
  }).immediate());
}
