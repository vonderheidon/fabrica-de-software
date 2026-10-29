import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';

const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true }); });

describe('direct managed terminal schema', () => {
  it('creates durable identity tables without seeding sessions or terminals', () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'factory-managed-terminals-'));
    directories.push(dataDirectory);
    const db = new Database(join(dataDirectory, 'factory.sqlite'));
    db.pragma('foreign_keys = ON');
    const storage = openStorage({ dataDirectory });
    try {
      expect(db.prepare('SELECT * FROM managed_terminals').all()).toEqual([]);
      expect(db.prepare('SELECT * FROM attempt_sessions').all()).toEqual([]);
      expect(db.prepare('SELECT * FROM terminal_occupancies').all()).toEqual([]);
      expect(db.pragma('foreign_key_check')).toEqual([]);
      expect(storage.getSettings().installation_id).toBeTruthy();
    } finally { storage.close(); db.close(); }
  });
});
