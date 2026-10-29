import { afterEach, describe, expect, it } from 'vitest';
import { attemptFixture, type AttemptFixture } from '../../../../../tests/fixtures/attempt.js';

let fixture: AttemptFixture | null = null;
afterEach(async () => {
  if (fixture) await fixture.close();
  fixture = null;
});

describe('current attempt search headers', () => {
  it('keeps captured search headers unchanged during history and capture reads', async () => {
    fixture = await attemptFixture();
    const command = await fixture.prepare();
    const operation = await fixture.pipeline.startAttempt(command.body, command.context);
    await fixture.pipeline.drain();
    const attemptId = operation.resource.id;
    const before = fixture.db.prepare<[string], { issue_number: number | null; issue_title: string | null; capture_json: string }>(
      'SELECT issue_number,issue_title,capture_json FROM attempts WHERE id=?',
    ).get(attemptId);

    expect(before?.issue_number).toBe(fixture.issue.number);
    expect(before?.issue_title).toBe(fixture.issue.title);
    fixture.storage.listAttempts({});
    fixture.storage.getAttemptCapture(attemptId);

    expect(fixture.db.prepare<[string], { issue_number: number | null; issue_title: string | null; capture_json: string }>(
      'SELECT issue_number,issue_title,capture_json FROM attempts WHERE id=?',
    ).get(attemptId)).toEqual(before);
  });
});
