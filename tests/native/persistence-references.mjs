// @ts-check
import { createHash } from 'node:crypto';

/** @param {import('better-sqlite3').Database} db @param {string} sql @param {...unknown} parameters @returns {Record<string, unknown>[]} */
function readRows(db, sql, ...parameters) {
  return /** @type {Record<string, unknown>[]} */ (db.prepare(sql).all(...parameters));
}

/** @param {import('better-sqlite3').Database} db @param {string} attemptId
 * @returns {{attemptId:string,projectId:string,preparationId:string,roundNumbers:number[],deliveryIds:string[],reviewIds:string[],producerPassageIds:string[],passageResultReceiptIds:string[],operationReceiptIds:string[],operationReceipts:Record<string,unknown>[],counts:Record<string,number>,sha256:string}}
 */
export function persistenceReferenceSnapshot(db, attemptId) {
  const attempt = /** @type {Record<string, unknown> | undefined} */ (db.prepare(`SELECT id,operation_id,project_id,project_revision_id,preparation_id,preparation_revision,
    account_id,repository_id,issue_id,capture_json,created_at_ms FROM attempts WHERE id=?`).get(attemptId));
  if (!attempt) throw new Error('PERSISTENCE_ATTEMPT_MISSING');
  const projectId = String(attempt.project_id);
  const preparationId = String(attempt.preparation_id);
  const rounds = readRows(db, 'SELECT attempt_id,round_number,delivery_version,created_at_ms FROM rounds WHERE attempt_id=? ORDER BY round_number', attemptId);
  const deliveryIds = rounds.map(row => String(row.delivery_version));
  const roundNumbers = rounds.map(row => Number(row.round_number));
  const reviewIds = readRows(db, 'SELECT id FROM reviews WHERE attempt_id=? ORDER BY id', attemptId).map(row => String(row.id));
  const passageIds = readRows(db, 'SELECT id FROM passages WHERE attempt_id=? ORDER BY id', attemptId).map(row => String(row.id));
  const operationResources = [...new Set([projectId, preparationId, attemptId, ...deliveryIds, ...reviewIds, ...passageIds])];
  const placeholders = operationResources.map(() => '?').join(',');
  const operationReceipts = readRows(db, `SELECT operation_id,installation_id,account_id,operation_kind,resource_type,resource_id,
    request_hash,expected_revision_json,receipt_json FROM operation_requests
    WHERE (resource_type='settings' AND resource_id='local') OR resource_id IN (${placeholders}) ORDER BY operation_id`, ...operationResources);

  const snapshotRows = {
    accounts: readRows(db, 'SELECT * FROM accounts ORDER BY github_account_id'),
    settings: readRows(db, 'SELECT * FROM factory_settings ORDER BY id'),
    profiles: readRows(db, 'SELECT * FROM execution_profiles ORDER BY id'),
    projects: readRows(db, 'SELECT * FROM projects WHERE id=? ORDER BY id', projectId),
    projectRevisions: readRows(db, 'SELECT * FROM project_revisions WHERE project_id=? ORDER BY revision_number,id', projectId),
    preparations: readRows(db, 'SELECT * FROM preparations WHERE id=? ORDER BY id', preparationId),
    preparationRevisions: readRows(db, 'SELECT * FROM preparation_revisions WHERE preparation_id=? ORDER BY revision', preparationId),
    attempts: [attempt],
    criteria: readRows(db, 'SELECT * FROM attempt_criteria WHERE attempt_id=? ORDER BY occurrence_index,criterion_id', attemptId),
    rounds,
    passages: readRows(db, `SELECT id,attempt_id,round_number,delivery_version,role,role_resource_json,request_hash,
      effective_profile_json,executor_version,created_at_ms,session_source_id FROM passages WHERE attempt_id=? ORDER BY round_number,role`, attemptId),
    passageResults: readRows(db, 'SELECT * FROM passage_results WHERE attempt_id=? ORDER BY passage_id', attemptId),
    criterionResults: readRows(db, 'SELECT * FROM criterion_results WHERE attempt_id=? ORDER BY passage_id,criterion_id', attemptId),
    deliveries: readRows(db, 'SELECT * FROM deliveries WHERE attempt_id=? ORDER BY round_number,id', attemptId),
    captureRuns: readRows(db, 'SELECT * FROM capture_runs WHERE delivery_id IN (SELECT id FROM deliveries WHERE attempt_id=?) ORDER BY delivery_id,id', attemptId),
    captureWarnings: readRows(db, 'SELECT * FROM capture_warnings WHERE attempt_id=? ORDER BY delivery_id,path', attemptId),
    reviews: readRows(db, 'SELECT * FROM reviews WHERE attempt_id=? ORDER BY delivery_id,id', attemptId),
    findings: readRows(db, 'SELECT * FROM findings WHERE attempt_id=? ORDER BY review_id,id', attemptId),
    findingResolutions: readRows(db, 'SELECT * FROM finding_resolutions WHERE attempt_id=? ORDER BY review_id,finding_id', attemptId),
    findingAssessments: readRows(db, 'SELECT * FROM finding_assessments WHERE attempt_id=? ORDER BY review_id,finding_id', attemptId),
    findingDisputes: readRows(db, 'SELECT * FROM finding_disputes WHERE attempt_id=? ORDER BY created_at_ms,id', attemptId),
  };
  const referenceHash = createHash('sha256').update(JSON.stringify(snapshotRows)).digest('hex');
  return {
    attemptId, projectId, preparationId, roundNumbers, deliveryIds,
    reviewIds, producerPassageIds: snapshotRows.deliveries.map(row => String(row.producer_passage_id)),
    passageResultReceiptIds: snapshotRows.passageResults.map(row => String(row.receipt_id)),
    operationReceiptIds: operationReceipts.map(row => String(row.operation_id)), operationReceipts,
    counts: {
      accounts: snapshotRows.accounts.length, profiles: snapshotRows.profiles.length, projects: snapshotRows.projects.length,
      projectRevisions: snapshotRows.projectRevisions.length, preparations: snapshotRows.preparations.length,
      preparationRevisions: snapshotRows.preparationRevisions.length, attempts: snapshotRows.attempts.length,
      rounds: snapshotRows.rounds.length, passages: snapshotRows.passages.length, deliveries: snapshotRows.deliveries.length,
      passageResults: snapshotRows.passageResults.length, criterionEvidence: snapshotRows.criterionResults.length,
      captureRuns: snapshotRows.captureRuns.length, reviews: snapshotRows.reviews.length, findings: snapshotRows.findings.length,
      findingResolutions: snapshotRows.findingResolutions.length, findingAssessments: snapshotRows.findingAssessments.length,
      findingDisputes: snapshotRows.findingDisputes.length, operationReceipts: operationReceipts.length,
    },
    sha256: referenceHash,
  };
}
