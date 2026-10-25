import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { StageActivity, HttpAttemptMeasurements } from '#contracts';
import { attemptFixture, type AttemptFixture } from '../fixtures/attempt.js';
import { attemptEvent } from '../../apps/controller/src/modules/storage/attempts.js';
import { readStageActivity } from '../../apps/controller/src/modules/storage/stage-activity.js';
import { readMeasurements } from '../../apps/controller/src/modules/storage/measurements.js';
import { readOperationSummary } from '../../apps/controller/src/modules/storage/operation-summary.js';
import { readAttemptDetail } from '../../apps/controller/src/modules/storage/queries.js';
import { toHttpAttemptMeasurements, toHttpAttemptDetail } from '../../apps/controller/src/http/execution-views.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { digest } from '../../apps/controller/src/modules/storage/configuration-reads.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';

let fixture: AttemptFixture | undefined;
afterEach(async () => { vi.useRealTimers(); await fixture?.close(); fixture = undefined; });
async function start(ttl?: number) {
  fixture = await attemptFixture();
  if (ttl !== undefined) {
    const settings = fixture.storage.getGlobalConfiguration();
    const changes = { time_defaults: { question_ttl: { state: 'configured' as const, value: ttl, unit: 'ms' } } };
    fixture.storage.saveSettings({ operationId: randomUUID(), expectedRevision: settings.etag, changes, body: { changes } });
  }
  const saved = await fixture.preparations.createPreparation(fixture.projectId, { issue_id: fixture.issue.id, delivery_mode: 'icr', guidance: '', overrides: {} }, { operationId: randomUUID(), expectedRevision: undefined });
  const p = saved.view.preparation;
  const result = await fixture.pipeline.startAttempt({ preparationId: p.id, preparationRevision: p.revision, authorizedSummaryHash: p.summary_hash, authorized: true }, { operationId: randomUUID(), expectedRevision: saved.etag });
  await fixture.pipeline.drain();
  return { ...fixture, id: result.resource.id };
}
it('records durable transitions with exact event, round and content identities and one open interval', async () => {
  const f = await start();
  const before = readStageActivity(f.db, f.id);
  expect(Value.Check(StageActivity, before)).toBe(true); expect(before.stage).toBe('implementing'); expect(before.availability).toBe('known');
  expect(before.last_activity_at_ms).not.toBeNull(); expect(before.deadline_at_ms).not.toBeNull();
  f.db.transaction(() => { f.db.prepare("UPDATE attempts SET phase='verifying',revision=revision+1 WHERE id=?").run(f.id); attemptEvent(f.db, f.id, 'verification.started'); })();
  const now = readStageActivity(f.db, f.id);
  expect(now.stage).toBe('verifying'); expect(now.deadline_at_ms).toBeNull();
  const intervals = f.db.prepare('SELECT i.*,e.attempt_id AS event_attempt,e.occurred_at_ms AS event_time,r.delivery_version AS round_delivery FROM attempt_stage_intervals i JOIN events e ON e.seq=i.source_event_seq JOIN rounds r ON r.attempt_id=i.attempt_id AND r.round_number=i.round_number WHERE i.attempt_id=? ORDER BY i.source_event_seq').all(f.id) as Array<Record<string, unknown>>;
  expect(intervals.length).toBeGreaterThanOrEqual(2);
  expect(intervals.filter(row => row.ended_at_ms === null)).toHaveLength(1);
  for (const row of intervals) { expect(row.event_attempt).toBe(f.id); expect(row.event_time).toBe(row.started_at_ms); expect(row.delivery_version).toBe(row.round_delivery); }
});
it('does not advance activity on reads, elapsed wall time, authority polling or heartbeat', async () => {
  const f = await start(); const first = readStageActivity(f.db, f.id);
  const counts = f.db.prepare('SELECT count(*) AS n FROM attempt_stage_intervals').get();
  const later = readStageActivity(f.db, f.id, Date.now() + 10_000);
  expect(later.last_activity_at_ms).toBe(first.last_activity_at_ms); expect(later.elapsed_ms).toBeGreaterThan(first.elapsed_ms!);
  for (const type of ['heartbeat', 'attempt.authority-observed', 'cleanup-updated']) {
    f.db.prepare('UPDATE attempts SET revision=revision+1 WHERE id=?').run(f.id); attemptEvent(f.db, f.id, type);
  }
  expect(readStageActivity(f.db, f.id).last_activity_at_ms).toBe(first.last_activity_at_ms);
  expect(f.db.prepare('SELECT count(*) AS n FROM attempt_stage_intervals').get()).toEqual(counts);
});
it('distinguishes human decision and tracking loss without inventing a deadline or physical stop', async () => {
  const f = await start();
  f.db.transaction(() => { f.db.prepare("UPDATE attempts SET suspension='HUMAN_DECISION',revision=revision+1 WHERE id=?").run(f.id); attemptEvent(f.db, f.id, 'attempt.blocked'); })();
  const wait = readStageActivity(f.db, f.id); expect(wait.stage).toBe('waiting_decision'); expect(wait.deadline_at_ms).toBeNull();
  f.db.transaction(() => { f.db.prepare("UPDATE attempts SET suspension='TRACKING_LOST',revision=revision+1 WHERE id=?").run(f.id); attemptEvent(f.db, f.id, 'tracking-lost'); })();
  const lost = readStageActivity(f.db, f.id); expect(lost.stage).toBe('tracking_lost'); expect(lost.tracking_state).toBe('lost');
  expect(lost.last_activity_at_ms).toBe(wait.last_activity_at_ms); expect(lost.reason).toContain('não comprova parada');
  expect(f.db.prepare('SELECT result FROM attempts WHERE id=?').get(f.id)).toEqual({ result: null });
});
it('exposes lightweight stage activity in operation, detail and measurements without changing counters', async () => {
  const f = await start();
  const measurements = f.db.prepare('SELECT * FROM passage_measurements').all();
  const count = f.db.prepare('SELECT count(*) AS n FROM events').get();
  expect(readOperationSummary(f.db, {}).stageActivity?.stage).toBe('implementing');
  expect(toHttpAttemptDetail(readAttemptDetail(f.db, f.id, {})).stage_activity.stage).toBe('implementing');
  const view = toHttpAttemptMeasurements(readMeasurements(f.db, f.id));
  expect(Value.Check(HttpAttemptMeasurements, view)).toBe(true); expect(view.stage_activity.stage).toBe('implementing');
  expect(f.db.prepare('SELECT * FROM passage_measurements').all()).toEqual(measurements);
  expect(f.db.prepare('SELECT count(*) AS n FROM events').get()).toEqual(count);
});
it('does not infer legacy duration from timestamps, polling or unknown events', async () => {
  const f = await start();
  // Build an old database in this disposable fixture, before applying migration 046.
  f.db.exec('DROP TRIGGER attempt_stage_event; DROP TABLE attempt_stage_intervals; DROP VIEW attempt_stage_state');
  const { readFileSync } = await import('node:fs');
  f.db.exec(readFileSync(new URL('../../apps/controller/src/modules/storage/migrations/046_attempt_stage_intervals.sql', import.meta.url), 'utf8'));
  f.db.prepare('UPDATE attempts SET revision=revision+1 WHERE id=?').run(f.id); attemptEvent(f.db, f.id, 'heartbeat');
  const stage = readStageActivity(f.db, f.id);
  expect(stage.availability).toBe('unavailable'); expect(stage.elapsed_ms).toBeNull(); expect(stage.last_activity_at_ms).toBeNull();
});

it('replays an accepted event without another interval and refuses invalid bindings and activity', async () => {
  const f = await start();
  const before = f.db.prepare('SELECT * FROM attempt_stage_intervals ORDER BY source_event_seq').all();
  f.db.exec(`INSERT OR IGNORE INTO events SELECT * FROM events WHERE event_type='passage-ready'`);
  expect(f.db.prepare('SELECT * FROM attempt_stage_intervals ORDER BY source_event_seq').all()).toEqual(before);
  const current = f.db.prepare('SELECT id,revision FROM attempt_stage_intervals WHERE ended_at_ms IS NULL').get() as { id: string; revision: number };
  expect(() => f.db.prepare('UPDATE attempt_stage_intervals SET last_activity_at_ms=?,revision=revision+1 WHERE id=?').run(Date.now()+1000, current.id)).toThrow('STAGE_INTERVAL_INVALID');
  expect(() => f.db.prepare("UPDATE attempt_stage_intervals SET delivery_version=?,revision=revision+1 WHERE id=?").run(randomUUID(), current.id)).toThrow('STAGE_INTERVAL_INVALID');
  expect(f.db.prepare('SELECT * FROM attempt_stage_intervals ORDER BY source_event_seq').all()).toEqual(before);
});

it('keeps an absent question deadline absent and preserves activity across a restart', async () => {
  const f = await start();
  const a = f.storage.getAttempt(f.id);
  const question = { formatVersion: 1 as const, decision: 'Escolha um comportamento', context: 'Decisão de produto', alternatives: ['Primeiro', 'Segundo'] };
  const binding = f.persistence.getPassage({ passageId: a.passageId }).binding;
  f.db.prepare("UPDATE attempts SET revision=revision+1 WHERE id=?").run(f.id);
  const q = f.persistence.raiseQuestion({ binding, question, sha256: digest(question) });
  expect(q.questionId).toBeTruthy();
  const wait = readStageActivity(f.db, f.id); expect(wait.stage).toBe('waiting_decision');
  expect(wait.deadline_at_ms).toBeNull();
  const beforeActivity = wait.last_activity_at_ms;
  await f.pipeline.close(); f.storage.close();
  const reopened = openStorage({ dataDirectory: f.directory });
  try {
    const after = reopened.getMeasurements(f.id).stageActivity;
    expect(after.last_activity_at_ms).toBe(beforeActivity);
    expect(reopened.getAttempt(f.id).result).toBe('interrupted');
    expect(after.deadline_at_ms).toBeNull();
  } finally { reopened.close(); }
});

it.each([0, 1000])('projects an explicitly configured question TTL of %s without creating another clock', async ttl => {
  const f = await start(ttl);
  const a = f.storage.getAttempt(f.id);
  const binding = f.persistence.getPassage({ passageId: a.passageId }).binding;
  const question = { formatVersion: 1 as const, decision: 'Escolha o comportamento', context: 'Decisão de produto', alternatives: ['Primeiro', 'Segundo'] };
  f.persistence.raiseQuestion({ binding, question, sha256: digest(question) });
  const stage = readStageActivity(f.db, f.id);
  expect(stage.stage).toBe('waiting_decision'); expect(stage.deadline_at_ms).not.toBeNull();
  expect(stage.deadline_at_ms!).toBeGreaterThanOrEqual(stage.started_at_ms!);
  expect(stage.remaining_ms!).toBeLessThanOrEqual(ttl);
  const measurements = f.db.prepare('SELECT * FROM passage_measurements').all();
  expect(readStageActivity(f.db, f.id, Date.now() + 10_000).remaining_ms).toBe(0);
  expect(f.db.prepare('SELECT * FROM passage_measurements').all()).toEqual(measurements);
});

it('serializes StageActivity through protected HTTP operation, detail and measurement routes', async () => {
  const f = await start();
  const app = createApp(loadConfiguration({ FACTORY_DATA_DIR: f.directory, FACTORY_LOG_LEVEL: 'silent' }, f.directory), f.storage,
    undefined, undefined, { github: f.github, workspaces: f.workspaces }, f.pipeline);
  try {
    const host = '127.0.0.1:4310';
    expect((await app.inject({ url: '/api/v1/operation', headers: { host } })).statusCode).toBe(401);
    const session = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin: `http://${host}`, 'x-factory-client': 'web' }, payload: {} });
    expect(session.statusCode).toBe(200);
    const headers = { host, cookie: String(session.headers['set-cookie']).split(';')[0]! };
    // App startup interrupts prior work. Start this controlled attempt after recovery.
    const saved = await f.preparations.createPreparation(f.projectId, { issue_id: f.issue.id, delivery_mode: 'icr', guidance: '', overrides: {}, previous_attempt_id: f.id }, { operationId: randomUUID(), expectedRevision: undefined });
    const preparation = saved.view.preparation;
    const operation = await f.pipeline.startAttempt({ preparationId: preparation.id, preparationRevision: preparation.revision, authorizedSummaryHash: preparation.summary_hash, authorized: true }, { operationId: randomUUID(), expectedRevision: saved.etag }); await f.pipeline.drain();
    const id = operation.resource.id;
    const eventCount = f.db.prepare('SELECT count(*) AS n FROM events').get();
    for (const url of ['/api/v1/operation', `/api/v1/attempts/${id}`, `/api/v1/attempts/${id}/measurements`]) {
      const response = await app.inject({ url, headers });
      expect(response.statusCode, response.body).toBe(200);
      const dto = response.json<{ stage_activity: unknown }>();
      expect(Value.Check(StageActivity, dto.stage_activity), `${url}: ${response.body}`).toBe(true);
      expect(dto.stage_activity).toMatchObject({ stage: 'implementing', availability: 'known' });
    }
    expect(f.db.prepare('SELECT count(*) AS n FROM events').get()).toEqual(eventCount);
  } finally { await app.close(); }
});
