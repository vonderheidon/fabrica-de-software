import type Database from 'better-sqlite3';
import { Value } from '@sinclair/typebox/value';
import { AttemptComparison, AttemptComparisonQuery, type AttemptCapture, type AttemptComparison as AttemptComparisonView,
  type AttemptComparisonSide, type HistoricalComparisonValue, type PreparationChoices } from '#contracts';
import { OperationError } from './operations.js';
import { StorageError } from './errors.js';
import { readSettings } from './settings.js';
import { digest } from './configuration-reads.js';
import { readCapturedConfiguration, readPreparationChoices } from './historical-configuration.js';

interface AttemptRow {
  id: string; accountId: string; projectId: string; repositoryId: string; issueId: string; issueNumber: number | null;
  projectRevisionId: string; preparationId: string; preparationRevision: number; captureJson: string;
  result: AttemptComparisonSide['result']; diagnostic: string | null; startedAtMs: number;
}

interface RevisionRow { revisionNumber: number }
interface PreparationRevisionRow { projectId: string; projectRevisionId: string; choicesJson: string }
interface LatestRoundRow { round: number; deliveryId: string; contentIdentity: string | null; reviewReason: string | null }

interface HistoricalSide {
  readonly capture: AttemptCapture | null;
  readonly choices: PreparationChoices | null;
  readonly projectRevision: RevisionRow | null;
  readonly preparationRevision: PreparationRevisionRow | null;
}

const notFound = () => new OperationError(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found in the current scope.');
const invalid = () => new OperationError(400, 'ATTEMPT_COMPARISON_INVALID', 'Two different attempt IDs are required.');
const unavailable = (reason: string): HistoricalComparisonValue => ({ state: 'unavailable', value: null, reason });
const available = (value: string | number | boolean | null): HistoricalComparisonValue => ({ state: 'available', value, reason: null });

function readCapture(value: string): AttemptCapture | null {
  try { return readCapturedConfiguration(JSON.parse(value) as unknown); }
  catch { return null; }
}

function readChoices(value: string): PreparationChoices | null {
  try { return readPreparationChoices(JSON.parse(value) as unknown); }
  catch { return null; }
}

function redactSensitiveText(value: string, maxLength: number): string {
  return value
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]')
    .replace(/(https?:\/\/)[^/\s:@]+(?::[^/\s@]*)?@/gi, '$1[REDACTED]@')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b/g, '[REDACTED CREDENTIAL]')
    .replace(/\b(authorization|cookie|set-cookie|x-csrf-token|password|secret|token|api[_-]?key)\b\s*[:=]\s*(?:bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[REDACTED]')
    .trim().slice(0, maxLength);
}

function safeFailureReason(value: string | null): string | null {
  if (!value) return null;
  const safe = redactSensitiveText(value, 2048);
  return safe || null;
}

function profileSummary(value: NonNullable<AttemptCapture['configuration']['implementer_profile']>): string {
  return JSON.stringify({
    id: value.id ?? null,
    ...('revision' in value ? { revision: value.revision } : {}),
    name: value.name,
    executor: value.executor,
    provider: value.provider,
    model: value.model,
    effort: value.effort,
    ...('composition_version' in value ? { composition_version: value.composition_version ?? null } : {}),
  });
}

function profileCompositionVersion(value: AttemptCapture['configuration']['implementer_profile']): HistoricalComparisonValue {
  if (value === null) return available(null);
  if (!('composition_version' in value)) return { state: 'not_comparable', value: null, reason: 'A versão da composição não foi capturada.' };
  return available(value.composition_version ?? null);
}

function profileRevision(value: AttemptCapture['configuration']['implementer_profile']): HistoricalComparisonValue {
  if (value === null) return available(null);
  if (!('revision' in value)) return { state: 'not_comparable', value: null, reason: 'A revisão do perfil não foi capturada.' };
  return available(value.revision);
}

function profileGuidance(value: AttemptCapture['configuration']['implementer_profile']): HistoricalComparisonValue {
  return available(value === null ? null : redactSensitiveText(value.guidance, 8192));
}

function publicationTarget(capture: AttemptCapture): HistoricalComparisonValue {
  const target = capture.v3Delivery;
  if (!target) return { state: 'not_comparable', value: null, reason: 'A intenção de entrega não foi capturada nesta tentativa.' };
  if (target.publication_target === null) return available(null);
  return available(JSON.stringify({ repository_id: target.publication_target.repository_id,
    selection_kind: target.publication_target.selection.kind, target_hash: target.publication_target_hash }));
}

function checkSummary(capture: AttemptCapture): string {
  return JSON.stringify({
    count: capture.configuration.configuration.checks.length,
    sha256: digest(capture.configuration.configuration.checks.map(check => ({
      id: check.id, command: check.command, cwd_relative: check.cwd_relative, timeout_ms: check.timeout_ms ?? null,
    }))),
  });
}

function historicalSide(db: Database.Database, row: AttemptRow): HistoricalSide {
  const capture = readCapture(row.captureJson);
  const projectRevision = db.prepare<[string, string], RevisionRow>(`SELECT revision_number AS revisionNumber FROM project_revisions
    WHERE id=? AND project_id=?`).get(row.projectRevisionId, row.projectId) ?? null;
  const preparationRevision = db.prepare<[string, number], PreparationRevisionRow>(`SELECT project_id AS projectId,
    project_revision_id AS projectRevisionId, choices_json AS choicesJson FROM preparation_revisions
    WHERE preparation_id=? AND revision=?`).get(row.preparationId, row.preparationRevision) ?? null;
  const choices = preparationRevision ? readChoices(preparationRevision.choicesJson) : null;
  const captureMatches = capture !== null && capture.accountId === row.accountId && capture.issue.id === row.issueId &&
    capture.issue.repository.id === row.repositoryId && capture.preparationId === row.preparationId &&
    capture.preparationRevision === row.preparationRevision && capture.configuration.project_revision_id === row.projectRevisionId;
  const choicesMatch = choices !== null && choices.issue_id === row.issueId && preparationRevision?.projectId === row.projectId &&
    preparationRevision.projectRevisionId === row.projectRevisionId;
  return {
    capture: captureMatches && choicesMatch && projectRevision ? capture : null,
    choices: captureMatches && choicesMatch && projectRevision ? choices : null,
    projectRevision,
    preparationRevision,
  };
}

function latestRound(db: Database.Database, attemptId: string): LatestRoundRow | null {
  return db.prepare<[string], LatestRoundRow>(`SELECT r.round_number AS round,r.delivery_version AS deliveryId,
    d.content_identity AS contentIdentity,v.reason AS reviewReason FROM rounds r
    LEFT JOIN deliveries d ON d.id=r.delivery_version AND d.attempt_id=r.attempt_id
    LEFT JOIN reviews v ON v.delivery_id=d.id AND v.attempt_id=r.attempt_id
    WHERE r.attempt_id=? ORDER BY r.round_number DESC LIMIT 1`).get(attemptId) ?? null;
}

function sideView(db: Database.Database, row: AttemptRow, historical: HistoricalSide): AttemptComparisonSide {
  const round = latestRound(db, row.id);
  const projectRevision = historical.projectRevision?.revisionNumber ?? null;
  const failureReason = row.result === 'rejected' ? safeFailureReason(round?.reviewReason ?? row.diagnostic) : safeFailureReason(row.diagnostic);
  const contentIdentity = round?.contentIdentity && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(round.contentIdentity) ? round.contentIdentity : null;
  return {
    attemptId: row.id, startedAtMs: row.startedAtMs, result: row.result, failureReason,
    round: round?.round ?? null, deliveryId: round?.deliveryId ?? null, contentIdentity,
    projectRevisionId: projectRevision === null ? null : row.projectRevisionId,
    preparationRevision: row.preparationRevision,
    configurationState: historical.capture ? 'available' : 'unavailable',
    detailsUrl: `/api/v1/attempts/${row.id}`,
  };
}

function comparisonValues(row: AttemptRow, side: HistoricalSide): Record<string, HistoricalComparisonValue> {
  const versionUnavailable = unavailable('A referência histórica não está disponível ou não pertence à tentativa.');
  const values: Record<string, HistoricalComparisonValue> = {
    project_revision: side.projectRevision
      ? available(`${row.projectRevisionId}@${side.projectRevision.revisionNumber}`)
      : versionUnavailable,
    preparation_revision: side.preparationRevision && side.choices
      ? available(`${row.preparationId}@${row.preparationRevision}`)
      : versionUnavailable,
  };
  if (!side.capture || !side.choices) {
    const reason = 'A captura ou a preparação histórica não pôde ser validada.';
    for (const field of ['base_branch', 'implementer_profile', 'reviewer_profile', 'checks', 'correction_limit',
      'default_delivery_mode', 'automation_enabled', 'delivery_mode', 'time_defaults', 'artifact_policy',
      'configuration_origins', 'implementer_profile.revision', 'reviewer_profile.revision',
      'implementer_profile.composition_version', 'reviewer_profile.composition_version',
      'implementer_guidance', 'reviewer_guidance', 'publication_target', 'project_guidance',
      'effective_guidance', 'preparation_guidance']) values[field] = unavailable(reason);
    return values;
  }
  const capture = side.capture;
  const config = capture.configuration;
  values.base_branch = available(config.configuration.base_branch);
  values.implementer_profile = available(config.implementer_profile ? profileSummary(config.implementer_profile) : null);
  values.reviewer_profile = available(config.reviewer_profile ? profileSummary(config.reviewer_profile) : null);
  values.checks = available(checkSummary(capture));
  values.correction_limit = available(config.configuration.correction_limit);
  values.default_delivery_mode = available(config.configuration.default_delivery_mode);
  values.automation_enabled = available(config.configuration.automation_enabled);
  values.delivery_mode = available(side.choices.delivery_mode);
  values.time_defaults = available(JSON.stringify(config.time_defaults));
  values.artifact_policy = available(JSON.stringify(config.artifact_policy));
  values.configuration_origins = available(JSON.stringify(config.origins));
  values['implementer_profile.revision'] = profileRevision(config.implementer_profile);
  values['reviewer_profile.revision'] = profileRevision(config.reviewer_profile);
  values['implementer_profile.composition_version'] = profileCompositionVersion(config.implementer_profile);
  values['reviewer_profile.composition_version'] = profileCompositionVersion(config.reviewer_profile);
  values.implementer_guidance = profileGuidance(config.implementer_profile);
  values.reviewer_guidance = profileGuidance(config.reviewer_profile);
  values.publication_target = publicationTarget(capture);
  values.project_guidance = available(redactSensitiveText(config.configuration.guidance, 8192));
  values.effective_guidance = available(redactSensitiveText(config.guidance, 8192));
  values.preparation_guidance = available(redactSensitiveText(side.choices.guidance, 8192));
  return values;
}

function compareValues(left: Record<string, HistoricalComparisonValue>, right: Record<string, HistoricalComparisonValue>) {
  return Object.keys(left).filter(field => {
    const leftValue = left[field]!; const rightValue = right[field]!;
    return leftValue.state !== 'available' || rightValue.state !== 'available' || leftValue.value !== rightValue.value;
  }).map(field => ({ field, left: left[field]!, right: right[field]! }));
}

export function readAttemptComparison(db: Database.Database, query: AttemptComparisonQuery): AttemptComparisonView {
  if (!Value.Check(AttemptComparisonQuery, query)) throw invalid();
  if (query.leftAttemptId === query.rightAttemptId) throw invalid();
  const settings = readSettings(db);
  const rows = db.prepare<[string, string, string | null], AttemptRow>(`SELECT id,account_id AS accountId,project_id AS projectId,
    repository_id AS repositoryId,issue_id AS issueId,issue_number AS issueNumber,project_revision_id AS projectRevisionId,
    preparation_id AS preparationId,preparation_revision AS preparationRevision,capture_json AS captureJson,result,diagnostic,
    created_at_ms AS startedAtMs FROM attempts WHERE id IN (?,?) AND account_id IS ?`).all(
      query.leftAttemptId, query.rightAttemptId, settings.account_id,
    );
  if (rows.length !== 2) throw notFound();
  const byId = new Map(rows.map(row => [row.id, row]));
  const left = byId.get(query.leftAttemptId); const right = byId.get(query.rightAttemptId);
  if (!left || !right) throw notFound();
  if (left.projectId !== right.projectId || left.repositoryId !== right.repositoryId || left.issueId !== right.issueId) {
    throw new OperationError(409, 'ATTEMPT_COMPARISON_NOT_ELIGIBLE', 'Only attempts for the same project, repository and issue can be compared.');
  }
  const leftHistorical = historicalSide(db, left); const rightHistorical = historicalSide(db, right);
  const leftValues = comparisonValues(left, leftHistorical); const rightValues = comparisonValues(right, rightHistorical);
  const leftView = sideView(db, left, leftHistorical); const rightView = sideView(db, right, rightHistorical);
  const limitations = new Set<string>();
  if (!leftHistorical.capture || !rightHistorical.capture) limitations.add('Uma ou mais configurações históricas estão indisponíveis.');
  if (left.issueNumber === null || right.issueNumber === null || left.issueNumber !== right.issueNumber) {
    limitations.add('O número da issue não está disponível de forma consistente nas tentativas.');
  }
  if (!leftView.contentIdentity || !rightView.contentIdentity) {
    limitations.add('Uma ou mais tentativas não têm identidade de conteúdo capturada para a última rodada.');
  }
  const result: AttemptComparisonView = {
    projectId: left.projectId, repositoryId: left.repositoryId, issueId: left.issueId,
    issueNumber: left.issueNumber === right.issueNumber ? left.issueNumber : null,
    left: leftView, right: rightView,
    differences: compareValues(leftValues, rightValues), limitations: [...limitations],
  };
  if (!Value.Check(AttemptComparison, result)) throw new StorageError('OPERATION_DATA_INVALID');
  return result;
}
