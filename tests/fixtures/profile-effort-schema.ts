import type Database from 'better-sqlite3';

/** Disposable historical fixtures only; production migrations remain forward-only. */
export function removeProfileEffortSchema(db: Database.Database): void {
  if (db.pragma('user_version', { simple: true }) !== 23) return;
  const nullEffort = db.prepare("SELECT 1 AS found FROM execution_profiles WHERE effort IS NULL LIMIT 1").get();
  if (nullEffort) throw new Error('FIXTURE_NULL_EFFORT');
  const restoreForeignKeys = db.pragma('foreign_keys', { simple: true }) === 1;
  if (restoreForeignKeys) db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`CREATE TABLE execution_profiles_previous (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL CHECK(length(trim(name)) > 0),
        executor TEXT NOT NULL CHECK(executor = 'maestri-omp'),
        provider TEXT NOT NULL CHECK(length(trim(provider)) > 0),
        model TEXT NOT NULL CHECK(length(trim(model)) > 0),
        effort TEXT NOT NULL CHECK(length(trim(effort)) > 0),
        guidance TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
        created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
        updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms)
      ) STRICT;
      INSERT INTO execution_profiles_previous SELECT id, name, executor, provider, model, effort, guidance, revision, created_at_ms, updated_at_ms FROM execution_profiles;
      DROP TABLE execution_profiles;
      ALTER TABLE execution_profiles_previous RENAME TO execution_profiles;
      DELETE FROM schema_migrations WHERE version>=22;
      PRAGMA user_version=21;`);
      const violations: unknown = db.pragma('foreign_key_check');
      if (!Array.isArray(violations) || violations.length !== 0) throw new Error('FIXTURE_FOREIGN_KEY_INVALID');
    }).immediate();
  } finally {
    if (restoreForeignKeys) db.pragma('foreign_keys = ON');
  }
}
