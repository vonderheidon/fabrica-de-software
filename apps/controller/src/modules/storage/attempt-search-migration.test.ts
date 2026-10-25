import { createHash, randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { applyMigrations, loadMigrations, type Migration } from './migrations.js';
import { serializeCapture } from './historical-configuration.js';
import { attemptFixture, type AttemptFixture } from '../../../../../tests/fixtures/attempt.js';

let fixture: AttemptFixture | null = null;
afterEach(async () => {
  if (fixture) await fixture.close();
  fixture = null;
});

describe('attempt search header migration', () => {
  it('backfills only typed captures and seals newly stored headers', async () => {
    fixture = await attemptFixture();
    const command = await fixture.prepare();
    const operation = await fixture.pipeline.startAttempt(command.body, command.context);
    await fixture.pipeline.drain();
    const capture = fixture.storage.getAttemptCapture(operation.resource.id);
    const captureJson = serializeCapture(capture);

    const db = new Database(':memory:');
    try {
      const latest = loadMigrations().find(migration => migration.name === '045_attempt_search_headers.sql')!;
      const baseSql = `CREATE TABLE attempts (
        id TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at_ms INTEGER NOT NULL, capture_json TEXT NOT NULL
      );`;
      const migrations: Migration[] = [
        { version: 1, name: 'test_attempts.sql', sql: baseSql, checksum: createHash('sha256').update(baseSql).digest('hex') },
        { ...latest, version: 2 },
      ];
      applyMigrations(db, migrations.slice(0, 1), () => {});
      const insertHistorical = db.prepare('INSERT INTO attempts(id,account_id,created_at_ms,capture_json) VALUES (?,?,?,?)');
      for (let index = 0; index < 105; index += 1) {
        insertHistorical.run(randomUUID(), 'ACCOUNT_test', index + 1, captureJson);
      }
      db.prepare('INSERT INTO attempts(id,account_id,created_at_ms,capture_json) VALUES (?,?,?,?)')
        .run(randomUUID(), 'ACCOUNT_test', 106, '{"formatVersion":1,"issue":{"number":7,"title":"partial"}}');

      applyMigrations(db, migrations, () => {});
      const rows = db.prepare<[], { issue_number: number | null; issue_title: string | null }>(
        'SELECT issue_number,issue_title FROM attempts ORDER BY created_at_ms',
      ).all();
      expect(rows).toHaveLength(106);
      expect(rows.slice(0, 105).every(row => row.issue_number === capture.issue.number && row.issue_title === capture.issue.title)).toBe(true);
      expect(rows[105]).toEqual({ issue_number: null, issue_title: null });

      const validId = randomUUID();
      db.prepare(`INSERT INTO attempts(id,account_id,created_at_ms,capture_json,issue_number,issue_title)
        VALUES (?,?,?,?,?,?)`).run(validId, capture.accountId, 3, captureJson, capture.issue.number, capture.issue.title);
      expect(() => db.prepare('UPDATE attempts SET issue_title=? WHERE id=?').run('Changed later', validId)).toThrow(/IMMUTABLE_RECORD/);
      expect(() => db.prepare(`INSERT INTO attempts(id,account_id,created_at_ms,capture_json,issue_number,issue_title)
        VALUES (?,?,?,?,?,?)`).run(randomUUID(), capture.accountId, 4, captureJson, capture.issue.number + 1, capture.issue.title)).toThrow();
    } finally {
      db.close();
    }
  });
});
