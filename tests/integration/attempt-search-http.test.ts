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

describe('attempt search HTTP contract', () => {
  it('maps snake-case filters to the historical search and gives guidance for invalid periods', async () => {
    const fixture = await attemptFixture();
    fixtures.push(fixture);
    const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: fixture.directory, FACTORY_LOG_LEVEL: 'silent' }, fixture.directory),
      fixture.storage, undefined, undefined, { github: fixture.github, workspaces: fixture.workspaces }, fixture.pipeline);
    apps.push(app);
    const command = await fixture.prepare();
    await fixture.pipeline.startAttempt(command.body, command.context);
    await fixture.pipeline.drain();

    const bootstrap = await app.inject({
      method: 'POST', url: '/api/v1/session',
      headers: { host, origin, 'content-type': 'application/json', 'x-factory-client': 'web' }, payload: {},
    });
    expect(bootstrap.statusCode, bootstrap.body).toBe(200);
    const headers = { host, cookie: String(bootstrap.headers['set-cookie']).split(';')[0]! };

    const found = await app.inject({ url: '/api/v1/attempts?issue_number=17&issue_title=EXECUTABLE', headers });
    expect(found.statusCode, found.body).toBe(200);
    expect(found.json().items).toHaveLength(1);
    expect(found.json().items[0]).toMatchObject({ issue_number: 17, issue_title: 'Executable issue' });
    const attemptId = String(found.json().items[0].id);

    const retired = await app.inject({ url: `/api/v1/attempt-comparisons?left_attempt_id=${attemptId}&right_attempt_id=${attemptId}`, headers });
    expect(retired.statusCode).toBe(404);
    expect(retired.headers.location).toBeUndefined();
    expect(retired.json()).toMatchObject({ code: 'NOT_FOUND', request_id: expect.any(String) });

    const alias = await app.inject({ url: '/api/v1/attempts?issueNumber=17', headers });
    expect(alias.statusCode).toBe(400);
    expect(alias.json()).toMatchObject({ code: 'VALIDATION_FAILED' });

    const detail = await app.inject({ url: `/api/v1/attempts/${attemptId}`, headers });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json()).toMatchObject({ id: attemptId, issue: { number: 17 } });
    const rounds = await app.inject({ url: `/api/v1/attempts/${attemptId}/rounds`, headers });
    expect(rounds.statusCode, rounds.body).toBe(200);
    expect(rounds.json().entries.length).toBeGreaterThan(0);

    const impossible = await app.inject({ url: '/api/v1/attempts?date_from=2024-02-30&time_zone=UTC', headers });
    expect(impossible.statusCode).toBe(400);
    expect(impossible.json()).toMatchObject({ code: 'ATTEMPT_SEARCH_INVALID', message: expect.stringContaining('calendário') });

    const inverted = await app.inject({ url: '/api/v1/attempts?date_from=2025-02-02&date_to=2025-02-01&time_zone=UTC', headers });
    expect(inverted.statusCode).toBe(400);
    expect(inverted.json()).toMatchObject({ code: 'ATTEMPT_SEARCH_INVALID', message: expect.stringContaining('anterior') });

    const invalidZone = await app.inject({ url: '/api/v1/attempts?date_from=2025-02-01&time_zone=Not%2FA_Timezone', headers });
    expect(invalidZone.statusCode).toBe(400);
    expect(invalidZone.json()).toMatchObject({ code: 'ATTEMPT_SEARCH_INVALID', message: expect.stringContaining('fuso horário IANA') });
  });
});
