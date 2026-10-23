import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { loadRoleResources } from '../execution/roles.js';
import { applyMigrations, loadMigrations } from './migrations.js';
import { readSettingsView } from './configuration-reads.js';
import { seedSettings } from './settings.js';

const databases: Database.Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

function beforeCompositionMigration(): Database.Database {
  const db = new Database(':memory:'); databases.push(db);
  db.pragma('foreign_keys = ON');
  applyMigrations(db, loadMigrations().slice(0, 31), () => seedSettings(db));
  return db;
}

function insertLegacyProfile(db: Database.Database, input: { id: string; role: 'implementer' | 'reviewer'; guidance: string; revision?: number }): void {
  const now = 1_800_000_000_000;
  db.prepare(`INSERT INTO execution_profiles(id,name,profile_type,name_key,executor,provider,model,effort,guidance,revision,created_at_ms,updated_at_ms,deleted_at_ms)
    VALUES (?, ?, ?, ?, 'maestri-omp', 'provider', 'model', NULL, ?, ?, ?, ?, NULL)`)
    .run(input.id, input.id, input.role, input.id, input.guidance, input.revision ?? 1, now, now);
}

describe('effective profile composition migration', () => {
  it('moves legacy behavior into guidance once, preserves authored guidance, and remains idempotent', () => {
    const db = beforeCompositionMigration();
    const role = loadRoleResources().get('implementer')!;
    const reviewerRole = loadRoleResources().get('reviewer')!;
    insertLegacyProfile(db, { id: '00000000-0000-4000-8000-000000000001', role: 'implementer', guidance: 'Keep our naming convention.' });
    insertLegacyProfile(db, { id: '00000000-0000-4000-8000-000000000002', role: 'implementer', guidance: `Existing copy:\n${role.instructions}` });
    insertLegacyProfile(db, { id: '00000000-0000-4000-8000-000000000004', role: 'reviewer', guidance: 'Reviewer priorities.' });

    const migrations = loadMigrations();
    applyMigrations(db, migrations, () => { throw new Error('existing storage must not be seeded'); });
    const migrated = db.prepare<[], { id: string; guidance: string; composition_version: number | null; revision: number }>(
      'SELECT id,guidance,composition_version,revision FROM execution_profiles ORDER BY id',
    ).all();
    expect(migrated).toEqual([
      { id: '00000000-0000-4000-8000-000000000001', guidance: `Keep our naming convention.\n\n${role.instructions}`, composition_version: 1, revision: 2 },
      { id: '00000000-0000-4000-8000-000000000002', guidance: `Existing copy:\n${role.instructions}`, composition_version: 1, revision: 2 },
      { id: '00000000-0000-4000-8000-000000000004', guidance: `Reviewer priorities.\n\n${reviewerRole.instructions}`, composition_version: 1, revision: 2 },
    ]);
    applyMigrations(db, migrations, () => { throw new Error('migration replay must not reseed'); });
    expect(db.prepare('SELECT id,guidance,composition_version,revision FROM execution_profiles ORDER BY id').all()).toEqual(migrated);
    expect(readSettingsView(db).profiles.map(profile => profile.composition_version)).toEqual([1, 1, 1]);
  });

  it('preserves an over-limit legacy profile unchanged and keeps its composition explicitly unavailable', () => {
    const db = beforeCompositionMigration();
    const original = 'x'.repeat(8192);
    insertLegacyProfile(db, { id: '00000000-0000-4000-8000-000000000003', role: 'reviewer', guidance: original });
    applyMigrations(db, loadMigrations(), () => { throw new Error('existing storage must not be seeded'); });
    expect(db.prepare<[string], { guidance: string; composition_version: number | null; revision: number }>(
      'SELECT guidance,composition_version,revision FROM execution_profiles WHERE id=?',
    ).get('00000000-0000-4000-8000-000000000003')).toEqual({ guidance: original, composition_version: null, revision: 2 });
    expect(readSettingsView(db).profiles[0]?.composition_version).toBeNull();
  });
});
