import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { AttemptCapture, OperationReceipt } from '#contracts';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { attemptFixture, type AttemptFixture } from '../fixtures/attempt.js';

const fixtures: AttemptFixture[] = [];
afterEach(async () => { for (const fixture of fixtures.splice(0)) await fixture.close(); });

it('projects private historical common fields without changing documents or operator content across reopen', async () => {
  const f = await attemptFixture(); fixtures.push(f);
  const settings = f.storage.getSettings();
  const current = f.storage.getConfiguration(f.projectId);
  const { id: _id, project_id: _project, revision: _revision, created_at_ms: _created, ...configuration } = current.view.configuration;
  const checks = [{ id: 'utf8-check', command: 'verify baseBranch', cwd_relative: 'pasta com acentos', timeout_ms: 3 }];
  f.storage.saveConfiguration({ projectId: f.projectId, operationId: randomUUID(), expectedRevision: current.etag,
    body: { project_changes: { checks } }, configuration: { ...configuration, checks }, globalChanges: {} });
  const guidance = '{"operationId":"operator content","pollingIntervalMs":7,"formatVersion":99}';
  const saved = await f.preparations.createPreparation(f.projectId, { issue_id: f.issue.id, delivery_mode: 'icr', guidance,
    overrides: { checks, implementer_profile: { kind: 'reference', id: f.profile.id, revision: f.profile.revision }, time_defaults: settings.time_defaults, artifact_policy: settings.artifact_policy } }, { operationId: randomUUID(), expectedRevision: undefined });
  const updated = await f.preparations.updatePreparation(saved.view.preparation.id, { changes: { guidance: guidance + ' atualizado' } }, { operationId: randomUUID(), expectedRevision: saved.etag });
  const preparation = updated.view.preparation;
  const operation = await f.pipeline.startAttempt({ preparationId: preparation.id, preparationRevision: preparation.revision,
    authorizedSummaryHash: preparation.summary_hash, authorized: true }, { operationId: randomUUID(), expectedRevision: updated.etag });
  await f.pipeline.drain();
  const history = () => ({ revisions: f.db.prepare('SELECT * FROM project_revisions ORDER BY id').all(), captures: f.db.prepare('SELECT capture_json FROM attempts').all(),
    preparations: f.db.prepare('SELECT choices_json FROM preparation_revisions').all(),
    receipts: f.db.prepare('SELECT receipt_json FROM operation_requests ORDER BY operation_id').all() });
  const before = history();
  const raw = f.db.prepare<[], { capture_json: string }>('SELECT capture_json FROM attempts').get()!.capture_json;
  const privateCapture = JSON.parse(raw) as { configuration: { timeDefaults: { pollingIntervalMs: number }; artifactPolicy: { automaticDeletion: boolean } } };
  expect(privateCapture.configuration.timeDefaults.pollingIntervalMs).toBe(15_000);
  expect(privateCapture.configuration.artifactPolicy.automaticDeletion).toBe(false);
  expect(raw).not.toContain('polling_interval_ms');
  expect(raw).not.toContain('cwd_relative');
  expect(JSON.parse(raw)).toMatchObject({ configuration: {
    projectRevisionId: preparation.project_revision_id, settingsRevision: settings.revision,
    configuration: { baseBranch: 'main', checks: [{ id: 'utf8-check', command: 'verify baseBranch', cwdRelative: 'pasta com acentos', timeoutMs: 3 }],
      githubProject: { ownerId: 'OWNER_test', statusFieldId: 'FIELD_test', statusOptionIds: { inProgress: 'PROGRESS', inReview: 'REVIEW' } } },
    implementerProfile: { createdAtMs: f.profile.created_at_ms, updatedAtMs: f.profile.updated_at_ms },
    origins: { implementerProfile: 'preparation', timeDefaults: 'preparation' },
  }, criteria: [{ occurrenceIndex: 1 }, { occurrenceIndex: 2 }] });
  const rawChoices = f.db.prepare<[string], { choices_json: string }>('SELECT choices_json FROM preparation_revisions WHERE preparation_id = ? ORDER BY revision').all(preparation.id);
  expect(rawChoices).toHaveLength(2);
  expect(JSON.parse(rawChoices[0]!.choices_json)).toEqual({ formatVersion: 1, choices: {
    issueId: f.issue.id, deliveryMode: 'icr', publication_target: null, guidance, overrides: {
      checks: [{ id: 'utf8-check', command: 'verify baseBranch', cwdRelative: 'pasta com acentos', timeoutMs: 3 }],
      implementerProfile: { kind: 'reference', id: f.profile.id, revision: f.profile.revision },
      timeDefaults: { formatVersion: 1, pollingIntervalMs: 15_000, passageActiveTimeMs: 1_800_000, questionTtl: { state: 'not_configured' } },
      artifactPolicy: { formatVersion: 1, automaticDeletion: false },
    },
  } });
  const changesBeforeRead = f.db.prepare<[], { n: number }>('SELECT total_changes() AS n').get();
  const capture = f.storage.getAttemptCapture(operation.resource.id);
  expect(Value.Check(AttemptCapture, capture)).toBe(true);
  expect(capture.configuration.time_defaults.polling_interval_ms).toBe(15_000);
  expect(capture.configuration.artifact_policy.automatic_deletion).toBe(false);
  expect(f.storage.getPreparation(preparation.id).view.guidance).toBe(guidance + ' atualizado');
  expect(Value.Check(OperationReceipt, f.storage.getOperation(operation.operation_id)?.receipt)).toBe(true);
  expect(history()).toEqual(before);
  expect(f.db.prepare('SELECT total_changes() AS n').get()).toEqual(changesBeforeRead);
  await f.pipeline.close(); f.storage.close();
  const reopened = openStorage({ dataDirectory: f.directory });
  try {
    expect(reopened.getAttemptCapture(operation.resource.id)).toEqual(capture);
    expect(reopened.getPreparation(preparation.id).view.overrides).toEqual(preparation.overrides);
    expect(reopened.getPreparation(preparation.id).view.guidance).toBe(guidance + ' atualizado');
    expect(reopened.getOperation(operation.operation_id)?.receipt).toEqual(operation.receipt);
    expect(reopened.getConfiguration(f.projectId).view.configuration.checks).toEqual(checks);
    expect(history()).toEqual(before);
  } finally { reopened.close(); }
});

it('keeps historical scope criteria readable without rewriting private question documents', async () => {
  const f = await attemptFixture(); fixtures.push(f);
  f.dependencies.github = f.github;
  const prepared = await f.prepare();
  const operation = await f.pipeline.startAttempt(prepared.body, prepared.context); await f.pipeline.drain();
  const passage = f.persistence.getPassage({ passageId: f.storage.getAttempt(operation.resource.id).passageId });
  f.issue.body += '\n- Novo critério';
  expect(await f.pipeline.revalidateScope(passage.binding)).toBe(false);
  const questionId = f.storage.getAttempt(operation.resource.id).pendingQuestionId!;
  const raw = f.db.prepare<[string], { scope_json: string }>('SELECT scope_json FROM execution_questions WHERE id=?').get(questionId)!.scope_json;
  expect(raw).toContain('occurrenceIndex'); expect(raw).not.toContain('occurrence_index');
  const question = f.storage.getQuestion(operation.resource.id, questionId);
  expect(question.view.scopeChange?.capturedCriteria[0]).toMatchObject({ occurrence_index: 1 });
  await f.pipeline.close(); f.storage.close();
  const reopened = openStorage({ dataDirectory: f.directory });
  try {
    expect(reopened.getQuestion(operation.resource.id, questionId).view.scopeChange).toEqual(question.view.scopeChange);
    expect(f.db.prepare('SELECT scope_json FROM execution_questions WHERE id=?').get(questionId)).toEqual({ scope_json: raw });
  } finally { reopened.close(); }
});
