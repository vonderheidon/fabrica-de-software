import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openStorage } from './index.js';
import { readSettingsView } from './configuration-reads.js';

const directories: string[] = [];
const connections: Array<{ close(): void }> = [];

function track(connection: { close(): void }): () => void {
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    connection.close();
  };
  connections.push({ close });
  return close;
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'factory-profile-restart-'));
  directories.push(directory);
  const storage = openStorage({ dataDirectory: directory });
  const db = new Database(join(directory, 'factory.sqlite'));
  db.pragma('foreign_keys = ON');
  return { directory, storage, db, closeStorage: track(storage), closeDb: track(db) };
}

afterEach(() => {
  for (const connection of connections.splice(0).reverse()) connection.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

describe('current execution profile composition', () => {
  it('keeps nullable composition and authored profile values unchanged across reads and restart', () => {
    const { directory, db, closeStorage, closeDb } = fixture();
    const ids = [randomUUID(), randomUUID()];
    const insert = db.prepare(`INSERT INTO execution_profiles(
      id,name,profile_type,name_key,executor,provider,model,effort,guidance,composition_version,revision,
      created_at_ms,updated_at_ms,deleted_at_ms
    ) VALUES (?,?,?,?,?,?,?,?,?,NULL,7,10,25,NULL)`);
    insert.run(ids[0], 'Implementer Current', 'implementer', 'implementer current', 'maestri-omp', 'provider-a', 'model-a', null,
      'Authored guidance with historical notes.');
    insert.run(ids[1], 'Reviewer Current', 'reviewer', 'reviewer current', 'maestri-omp', 'provider-b', 'model-b', 'high',
      'Reviewer guidance remains exactly as stored.');
    const before = db.prepare(`SELECT id,provider,model,effort,guidance,composition_version,revision,created_at_ms,updated_at_ms
      FROM execution_profiles ORDER BY id`).all();
    expect(readSettingsView(db).profiles.map(profile => profile.composition_version)).toEqual([null, null]);

    closeStorage();
    closeDb();
    const reopened = openStorage({ dataDirectory: directory });
    const closeReopened = track(reopened);
    expect(reopened.getGlobalConfiguration().view.profiles.map(profile => profile.composition_version)).toContain(null);
    closeReopened();

    const afterDb = new Database(join(directory, 'factory.sqlite'));
    track(afterDb);
    expect(afterDb.prepare(`SELECT id,provider,model,effort,guidance,composition_version,revision,created_at_ms,updated_at_ms
      FROM execution_profiles ORDER BY id`).all()).toEqual(before);
  });
});
