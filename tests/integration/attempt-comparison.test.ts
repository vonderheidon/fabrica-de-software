import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { attemptFixture, type AttemptFixture } from '../fixtures/attempt.js';

const host = '127.0.0.1:4310';
const origin = `http://${host}`;
const fixtures: AttemptFixture[] = [];
const apps: ReturnType<typeof createApp>[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const fixture of fixtures.splice(0)) await fixture.close();
});

async function createComparisonApp(fixture: AttemptFixture) {
  const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: fixture.directory, FACTORY_LOG_LEVEL: 'silent' }, fixture.directory),
    fixture.storage, undefined, undefined, { github: fixture.github, workspaces: fixture.workspaces }, fixture.pipeline);
  apps.push(app);
  const bootstrap = await app.inject({
    method: 'POST', url: '/api/v1/session',
    headers: { host, origin, 'content-type': 'application/json', 'x-factory-client': 'web' }, payload: {},
  });
  expect(bootstrap.statusCode, bootstrap.body).toBe(200);
  return { app, headers: { host, cookie: String(bootstrap.headers['set-cookie']).split(';')[0]! } };
}

async function startAttempt(fixture: AttemptFixture, projectId = fixture.projectId, previousAttemptId?: string): Promise<string> {
  const saved = await fixture.preparations.createPreparation(projectId, {
    issue_id: fixture.issue.id, delivery_mode: 'icr', guidance: '', overrides: {},
    ...(previousAttemptId ? { previous_attempt_id: previousAttemptId } : {}),
  }, { operationId: randomUUID(), expectedRevision: undefined });
  const preparation = saved.view.preparation;
  const operation = await fixture.pipeline.startAttempt({
    preparationId: preparation.id, preparationRevision: preparation.revision,
    authorizedSummaryHash: preparation.summary_hash, authorized: true,
  }, { operationId: randomUUID(), expectedRevision: saved.etag });
  await fixture.pipeline.drain();
  return operation.resource.id;
}

function finishAttempt(fixture: AttemptFixture, id: string, result: 'delivered' | 'rejected'): void {
  fixture.db.prepare('UPDATE attempts SET phase=\'finished\',result=?,diagnostic=? WHERE id=?')
    .run(result, result === 'rejected' ? 'SYNTHETIC_REVIEW_FAILURE' : null, id);
}

function updateProfileGuidance(fixture: AttemptFixture, guidance: string): void {
  const current = fixture.storage.getGlobalConfiguration();
  fixture.storage.saveSettings({
    operationId: randomUUID(), expectedRevision: current.etag, changes: {},
    body: { changes: {}, profile_changes: [{ action: 'update', id: fixture.profile.id, changes: { guidance } }] },
  });
}

function tableCount(fixture: AttemptFixture, table: string): number {
  if (!['events', 'operation_requests', 'attempts'].includes(table)) throw new Error('Unexpected test table.');
  return fixture.db.prepare<[], { count: number }>(`SELECT count(*) AS count FROM ${table}`).get()!.count;
}

describe('same-issue attempt comparison', () => {
  it('compares immutable captures and revisions on demand without creating effects', async () => {
    const fixture = await attemptFixture(); fixtures.push(fixture);
    const { app, headers } = await createComparisonApp(fixture);
    const leftId = await startAttempt(fixture);
    finishAttempt(fixture, leftId, 'rejected');

    updateProfileGuidance(fixture, 'second historical guidance marker Authorization: Bearer synthetic-bearer-secret-123');
    const rightId = await startAttempt(fixture, fixture.projectId, leftId);
    finishAttempt(fixture, rightId, 'delivered');
    updateProfileGuidance(fixture, 'current guidance marker must not appear');

    const before = {
      events: tableCount(fixture, 'events'),
      operations: tableCount(fixture, 'operation_requests'),
      attempts: tableCount(fixture, 'attempts'),
    };
    const url = `/api/v1/attempt-comparisons?left_attempt_id=${leftId}&right_attempt_id=${rightId}`;
    const response = await app.inject({ url, headers });
    expect(response.statusCode, response.body).toBe(200);
    const comparison = response.json();
    expect(comparison).toMatchObject({
      project_id: fixture.projectId,
      repository_id: fixture.issue.repository.id,
      issue_id: fixture.issue.id,
      issue_number: fixture.issue.number,
      left: { attempt_id: leftId, result: 'rejected', failure_reason: 'SYNTHETIC_REVIEW_FAILURE', configuration_state: 'available' },
      right: { attempt_id: rightId, result: 'delivered', failure_reason: null, configuration_state: 'available' },
    });
    expect(comparison.differences.map((difference: { field: string }) => difference.field)).toEqual(expect.arrayContaining([
      'preparation_revision', 'implementer_profile', 'implementer_profile.revision', 'implementer_guidance',
    ]));
    expect(response.body).toContain('second historical guidance marker');
    expect(response.body).not.toContain('synthetic-bearer-secret-123');
    expect(response.body).not.toContain('current guidance marker must not appear');

    const repeated = await app.inject({ url, headers });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toEqual(comparison);
    expect({ events: tableCount(fixture, 'events'), operations: tableCount(fixture, 'operation_requests'), attempts: tableCount(fixture, 'attempts') }).toEqual(before);
  });

  it('rejects attempts from different projects and hides IDs outside the active account scope', async () => {
    const fixture = await attemptFixture(); fixtures.push(fixture);
    const { app, headers } = await createComparisonApp(fixture);
    const leftId = await startAttempt(fixture);
    finishAttempt(fixture, leftId, 'delivered');
    const otherProjectId = fixture.register();
    fixture.issue.id = 'I_cross_project';
    fixture.issue.number = 18;
    const rightId = await startAttempt(fixture, otherProjectId);

    const crossProject = await app.inject({ url: `/api/v1/attempt-comparisons?left_attempt_id=${leftId}&right_attempt_id=${rightId}`, headers });
    expect(crossProject.statusCode).toBe(409);
    expect(crossProject.json()).toMatchObject({ code: 'ATTEMPT_COMPARISON_NOT_ELIGIBLE' });

    const inaccessible = await app.inject({ url: `/api/v1/attempt-comparisons?left_attempt_id=${leftId}&right_attempt_id=${randomUUID()}`, headers });
    expect(inaccessible.statusCode).toBe(404);
    expect(inaccessible.json()).toMatchObject({ code: 'ATTEMPT_NOT_FOUND' });
  });

  it('rejects comparing an attempt with itself', async () => {
    const fixture = await attemptFixture(); fixtures.push(fixture);
    const { app, headers } = await createComparisonApp(fixture);
    const attemptId = await startAttempt(fixture);
    const response = await app.inject({ url: `/api/v1/attempt-comparisons?left_attempt_id=${attemptId}&right_attempt_id=${attemptId}`, headers });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'ATTEMPT_COMPARISON_INVALID' });
  });
});
