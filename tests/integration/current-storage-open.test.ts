import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { attemptFixture } from '../fixtures/attempt.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });

it.each(['current', 'capture', 'inactive-preparation', 'global-reference'] as const)(
  'recognizes %s configuration before operational writes and preserves refused bytes', async kind => {
    const f = await attemptFixture(); cleanup.push(f.close);
    const prepared = await f.prepare();
    const started = await f.pipeline.startAttempt(prepared.body, prepared.context);
    await f.pipeline.drain(); await f.pipeline.close();
    const captureBefore = f.storage.getAttemptCapture(started.resource.id);
    f.storage.close();
    if (kind === 'capture') {
      const triggers = f.db.prepare<[], { name: string; sql: string }>(
        "SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND tbl_name='attempts'",
      ).all();
      f.db.transaction(() => {
        for (const trigger of triggers) f.db.exec(`DROP TRIGGER "${trigger.name}"`);
        f.db.prepare(`UPDATE attempts SET capture_json=json_set(capture_json,
          '$.configuration.costDefaults',json(?),'$.configuration.origins.costDefaults','global') WHERE id=?`)
          .run(JSON.stringify({ formatVersion: 1, limit: { state: 'not_configured' } }), started.resource.id);
        for (const trigger of triggers) f.db.exec(trigger.sql);
      })();
    } else if (kind === 'global-reference') {
      const trigger = f.db.prepare<[], { sql: string }>(
        "SELECT sql FROM sqlite_schema WHERE name='resource_identity_immutable'",
      ).get()!;
      f.db.transaction(() => {
        f.db.exec('DROP TRIGGER resource_identity_immutable');
        f.db.prepare("UPDATE resources SET reference=? WHERE attempt_id=? AND kind='implementation'")
          .run(`work/${started.resource.id}/implementation`, started.resource.id);
        f.db.exec(trigger.sql);
      })();
    } else if (kind === 'inactive-preparation') {
      f.db.prepare(`INSERT INTO preparation_revisions(preparation_id,revision,project_id,project_revision_id,choices_json,created_at_ms)
        SELECT preparation_id,revision+1,project_id,project_revision_id,
          json_set(choices_json,'$.choices.overrides.costDefaults',json(?)),created_at_ms
        FROM preparation_revisions WHERE preparation_id=? AND revision=1`)
        .run(JSON.stringify({ formatVersion: 1, limit: { state: 'not_configured' } }), prepared.body.preparationId);
    }
    const filename = join(f.directory, 'factory.sqlite');
    const snapshot = () => ['', '-wal', '-shm'].map(suffix => existsSync(filename + suffix) ? readFileSync(filename + suffix) : null);
    const before = snapshot();
    if (kind === 'current') {
      const reopened = openStorage({ dataDirectory: f.directory });
      try { expect(reopened.getAttemptCapture(started.resource.id)).toEqual(captureBefore); }
      finally { reopened.close(); }
    } else {
      expect(() => openStorage({ dataDirectory: f.directory })).toThrowError(expect.objectContaining({
        code: kind === 'inactive-preparation' ? 'PREPARATION_DATA_INVALID' : 'OPERATION_DATA_INVALID',
      }));
      expect(snapshot()).toEqual(before);
    }
  },
);
