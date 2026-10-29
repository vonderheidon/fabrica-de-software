import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { applicationId, loadSchemaRecognitionResources } from '../../apps/controller/src/modules/storage/migrations.js';

export { applicationId };

export interface HistoricalSchemaFixture {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
  readonly requiresForeignKeysOff?: boolean;
}

export type Migration = HistoricalSchemaFixture;

const migrationsDirectory = new URL('../../apps/controller/src/modules/storage/migrations/', import.meta.url);
const foreignKeysOff = new Set([
  '022_nullable_profile_effort.sql',
  '023_execution_profile_lifecycle.sql',
  '051_creation_destination_recovery.sql',
  '052_review_producer.sql',
  '053_retire_manual_verification.sql',
]);

function recreateEmptyProfileLifecycleTable(db: Database.Database, sql: string): void {
  const constraintStart = sql.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS execution_profiles_live_name');
  if (constraintStart < 0) throw new Error('HISTORICAL_SCHEMA_FIXTURE_INVALID');
  db.exec(`DROP TABLE execution_profiles;
    CREATE TABLE execution_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL CHECK(length(trim(name)) > 0),
      profile_type TEXT NOT NULL CHECK(profile_type IN ('implementer', 'reviewer')),
      name_key TEXT NOT NULL CHECK(length(trim(name_key)) > 0),
      executor TEXT NOT NULL CHECK(executor = 'maestri-omp'),
      provider TEXT NOT NULL CHECK(length(trim(provider)) > 0),
      model TEXT NOT NULL CHECK(length(trim(model)) > 0),
      effort TEXT CHECK(effort IS NULL OR length(trim(effort)) > 0),
      guidance TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
      created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
      updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
      deleted_at_ms INTEGER CHECK(deleted_at_ms IS NULL OR deleted_at_ms >= created_at_ms)
    ) STRICT;
    ${sql.slice(constraintStart)}`);
}

export function loadHistoricalSchemaFixtures(): readonly HistoricalSchemaFixture[] {
  const recognition = loadSchemaRecognitionResources();
  const actual = readdirSync(migrationsDirectory).filter(name => name.endsWith('.sql')).sort();
  const expected = recognition.historicalLedger.map(entry => entry.name).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('HISTORICAL_SCHEMA_FIXTURE_INVALID');
  return recognition.historicalLedger.map(entry => {
    const sql = readFileSync(new URL(entry.name, migrationsDirectory), 'utf8');
    if (createHash('sha256').update(sql).digest('hex') !== entry.checksum) {
      throw new Error('HISTORICAL_SCHEMA_FIXTURE_INVALID');
    }
    return {
      ...entry,
      sql,
      ...(foreignKeysOff.has(entry.name) ? { requiresForeignKeysOff: true } : {}),
    };
  });
}

export const loadMigrations = loadHistoricalSchemaFixtures;

/** Builds disposable historical inputs for rejection tests; production never imports this fixture. */
export function applyHistoricalSchemaFixture(
  db: Database.Database,
  fixtures: readonly HistoricalSchemaFixture[],
  initializeSettings: () => void,
): void {
  const applied = db.pragma('user_version', { simple: true });
  const recognition = loadSchemaRecognitionResources();
  if (applied === recognition.directInstallUserVersion &&
      db.pragma('application_id', { simple: true }) === recognition.applicationId &&
      db.prepare<[], { count: number }>('SELECT count(*) AS count FROM schema_migrations').get()?.count === 0) return;
  if (typeof applied !== 'number' || !Number.isSafeInteger(applied) || applied < 0 || applied > fixtures.length) {
    throw new Error('HISTORICAL_SCHEMA_FIXTURE_INVALID');
  }
  const additional = fixtures.slice(applied);
  const firstForeignKeysOff = additional.findIndex(fixture => fixture.requiresForeignKeysOff === true);
  const applyRange = (range: readonly HistoricalSchemaFixture[], createLedger: boolean): void => {
    db.transaction(() => {
      if (createLedger) {
        db.exec(`CREATE TABLE schema_migrations (
            version INTEGER PRIMARY KEY CHECK(version >= 1),
            name TEXT NOT NULL UNIQUE,
            checksum TEXT NOT NULL CHECK(length(checksum) = 64),
            applied_at_ms INTEGER NOT NULL CHECK(applied_at_ms >= 0)
          ) STRICT`);
      }
      const insert = db.prepare<[number, string, string, number]>(
        'INSERT INTO schema_migrations(version,name,checksum,applied_at_ms) VALUES (?,?,?,?)',
      );
      for (const fixture of range) {
        if (fixture.name === '023_execution_profile_lifecycle.sql' &&
            db.prepare("SELECT 1 AS present FROM sqlite_schema WHERE type='table' AND name='execution_profiles'").get() &&
            !db.prepare('SELECT 1 FROM execution_profiles LIMIT 1').get()) {
          recreateEmptyProfileLifecycleTable(db, fixture.sql);
        } else db.exec(fixture.sql);
        insert.run(fixture.version, fixture.name, fixture.checksum, fixture.version);
        db.pragma(`user_version = ${fixture.version}`);
      }
      if (createLedger && range.length > 0) initializeSettings();
      db.pragma(`application_id = ${applicationId}`);
    }).immediate();
  };
  if (applied === 0 || firstForeignKeysOff < 0) {
    applyRange(additional, applied === 0);
    return;
  }
  const special = additional.slice(firstForeignKeysOff);
  const beforeSpecial = additional.slice(0, firstForeignKeysOff);
  if (beforeSpecial.length > 0) applyRange(beforeSpecial, false);
  const restoreForeignKeys = db.pragma('foreign_keys', { simple: true }) === 1;
  db.pragma('foreign_keys = OFF');
  try {
    applyRange(special, false);
  } finally {
    if (restoreForeignKeys) db.pragma('foreign_keys = ON');
  }
}

export const applyMigrations = applyHistoricalSchemaFixture;
