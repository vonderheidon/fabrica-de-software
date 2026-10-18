import { hostname } from 'node:os';
import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { ContextDiagnostic, OperationSummary, OperationSummaryQuery } from '#contracts';
import { readSettings } from './settings.js';
import { eventCursor, readProject } from './configuration-reads.js';
import { configurationDiagnostics, diagnostic } from './diagnostics.js';
import { readAttemptPage } from './queries.js';
import { OperationError } from './operations.js';
import { StorageError } from './errors.js';

/** Scalar/summary projections only. Caller owns the read snapshot, including eventCursor. */
export function readOperationSummary(db: Database.Database, query: OperationSummaryQuery): OperationSummary {
  if (!Value.Check(OperationSummaryQuery, query)) throw new OperationError(400, 'OPERATION_QUERY_INVALID', 'Select a valid project.');
  const s = readSettings(db); if (query.projectId) readProject(db, query.projectId);
  const currentHost = hostname();
  const account = s.account_id ? db.prepare<[string], { login: string }>('SELECT login FROM accounts WHERE github_account_id=?').get(s.account_id) : null;
  const authority = db.prepare<[], { observed_account_id: string | null; observed_at_ms: number; dispatch_paused: number; configured_account_id: string | null }>('SELECT observed_account_id,observed_at_ms,dispatch_paused,configured_account_id FROM controller_authority WHERE id=\'local\'').get();
  const currentAuthority = authority?.configured_account_id === s.account_id ? authority : null;
  const identityRow = db.prepare<[string, string | null], { value: string }>(`SELECT j.value FROM (
    SELECT diagnostics_json FROM diagnostic_runs WHERE installation_id=? AND account_id IS ? AND scope='host' AND state='succeeded'
      AND instr(checks_json,'"github_identity"')>0 ORDER BY completed_at_ms DESC,operation_id DESC LIMIT 1
    ) d,json_each(d.diagnostics_json) j WHERE json_extract(j.value,'$.check')='github_identity'`).get(s.installation_id, s.account_id);
  const identity: unknown = identityRow ? JSON.parse(identityRow.value) : null;
  if (identity !== null && !Value.Check(ContextDiagnostic, identity)) throw new StorageError('OPERATION_DATA_INVALID');
  const useIdentity = identity !== null && (!currentAuthority || identity.observedAtMs > currentAuthority.observed_at_ms);
  const active = readAttemptPage(db, { ...query, result: 'active', limit: '1' }).items[0] ?? null;
  const activeAttemptCount = db.prepare<[string | null, string | null, string | null], { n: number }>(
    'SELECT count(*) AS n FROM attempts WHERE account_id IS ? AND result IS NULL AND (? IS NULL OR project_id=?)').get(s.account_id, query.projectId ?? null, query.projectId ?? null)!.n;
  const recentResults = db.prepare<[string | null, string | null, string | null], OperationSummary['recentResults'][number]>(`SELECT id,project_id AS projectId,issue_id AS issueId,
    json_extract(capture_json,'$.issue.number') AS issueNumber,phase,result,suspension,revision,created_at_ms AS createdAtMs,updated_at_ms AS updatedAtMs
    FROM attempts WHERE account_id IS ? AND result IS NOT NULL AND (? IS NULL OR project_id=?) ORDER BY updated_at_ms DESC,id DESC LIMIT 5`)
    .all(s.account_id, query.projectId ?? null, query.projectId ?? null);
  const observed = db.prepare<[string | null, string | null, string | null], OperationSummary['nextCandidates'][number]>(`SELECT c.project_id AS projectId,c.issue_id AS issueId,c.updated_at_ms AS observedAtMs
    FROM queue_cycles c JOIN projects p ON p.id=c.project_id JOIN project_revisions r ON r.id=p.current_revision_id
    WHERE c.account_id IS ? AND c.last_ready=1 AND c.last_eligible=1 AND c.observed_ordinal IS NOT NULL AND c.consumed_attempt_id IS NULL AND r.automation_enabled=1
      AND (? IS NULL OR c.project_id=?) ORDER BY c.updated_at_ms DESC,c.observed_ordinal,c.project_id,c.issue_id LIMIT 6`).all(s.account_id, query.projectId ?? null, query.projectId ?? null);
  const impediments = configurationDiagnostics(db, query.projectId ? { scope: 'project', id: query.projectId } : { scope: 'host' });
  if (currentAuthority?.dispatch_paused) impediments.push(diagnostic('github_identity', 'ACCOUNT_CHANGED', 'A observação de conta impede novos despachos.', 'Confira a conta no host autorizado e revalide explicitamente.', { expectedAccountId: s.account_id, observedAccountId: currentAuthority.observed_account_id }));
  if (identity && identity.state !== 'passed') impediments.push(identity);
  if (active?.suspension) impediments.push(diagnostic('configuration', 'ATTEMPT_SUSPENDED', 'A tentativa ativa está suspensa.', 'Abra o detalhe da tentativa para resolver o impedimento pertinente.', { attemptId: active.id, projectId: active.projectId }));
  const integration = db.prepare<[string, string | null], { value: string }>(`SELECT j.value FROM (
    SELECT diagnostics_json FROM diagnostic_runs WHERE installation_id=? AND account_id IS ? AND scope='host' AND state='succeeded'
      AND instr(checks_json,'"maestri_context"')>0 ORDER BY completed_at_ms DESC,operation_id DESC LIMIT 1
    ) d,json_each(d.diagnostics_json) j WHERE json_extract(j.value,'$.check')='maestri_context'`).get(s.installation_id, s.account_id);
  const integrationObservation: unknown = integration ? JSON.parse(integration.value) : null;
  if (integrationObservation !== null && !Value.Check(ContextDiagnostic, integrationObservation)) throw new StorageError('OPERATION_DATA_INVALID');
  const projectEnabled = query.projectId ? db.prepare<[string], { enabled: number }>('SELECT r.automation_enabled AS enabled FROM projects p JOIN project_revisions r ON r.id=p.current_revision_id WHERE p.id=?').get(query.projectId)!.enabled === 1 : null;
  const value = { account: { id: s.account_id, login: account?.login ?? null,
      observedId: useIdentity ? identity.facts.observedAccountId ?? null : currentAuthority?.observed_account_id ?? null,
      observedAtMs: useIdentity ? identity.observedAtMs : currentAuthority?.observed_at_ms ?? null },
    host: { designated: s.designated_host, current: currentHost, matches: s.designated_host === currentHost },
    automation: { enabled: s.automation_enabled, dispatchPaused: Boolean(currentAuthority?.dispatch_paused) || !s.account_id, projectEnabled },
    activeAttempt: active, activeAttemptCount, nextCandidates: observed.slice(0, 5),
    candidateObservation: { state: observed.length ? 'recorded' : 'not_observed', requiresRevalidation: true, order: 'observed_queue_order', hasMore: observed.length > 5 },
    recentResults, impediments: impediments.slice(0, 100),
    integrationStatus: { kind: 'maestri_native', observation: integrationObservation, state: integration ? 'observed' : 'not_checked', provesProviderExecution: false },
    eventCursor: eventCursor(db) };
  if (!Value.Check(OperationSummary, value)) throw new StorageError('OPERATION_DATA_INVALID');
  return value;
}
