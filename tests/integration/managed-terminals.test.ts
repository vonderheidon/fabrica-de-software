import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { applyMigrations, loadMigrations } from '../../apps/controller/src/modules/storage/migrations.js';
import { removeManagedTerminalSchema } from '../fixtures/managed-terminal-schema.js';

const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true }); });

describe('managed terminal schema migration', () => {
  it('adds durable identity tables from schema 32 without seeding sessions or terminals', () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'factory-managed-terminals-'));
    directories.push(dataDirectory);
    const storage = openStorage({ dataDirectory });
    const installationId = storage.getSettings().installation_id;
    storage.close();

    const db = new Database(join(dataDirectory, 'factory.sqlite'));
    db.pragma('foreign_keys = ON');
    try {
      removeManagedTerminalSchema(db);
      expect(db.pragma('user_version', { simple: true })).toBe(32);
      applyMigrations(db, loadMigrations(), () => { throw new Error('MIGRATION_MUST_NOT_RESEED'); });
      ;
      expect(db.prepare('SELECT * FROM managed_terminals').all()).toEqual([]);
      expect(db.prepare('SELECT * FROM attempt_sessions').all()).toEqual([]);
      expect(db.prepare('SELECT * FROM terminal_occupancies').all()).toEqual([]);
      expect(db.pragma('foreign_key_check')).toEqual([]);
      expect(db.prepare('SELECT installation_id FROM factory_settings').get()).toEqual({ installation_id: installationId });
    } finally { db.close(); }

    const reopened = openStorage({ dataDirectory });
    try {
      ;
      expect(reopened.getSettings().installation_id).toBe(installationId);
    } finally { reopened.close(); }
  });
});
