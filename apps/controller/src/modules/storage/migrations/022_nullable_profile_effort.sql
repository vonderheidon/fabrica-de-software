CREATE TABLE execution_profiles_nullable (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  executor TEXT NOT NULL CHECK(executor = 'maestri-omp'),
  provider TEXT NOT NULL CHECK(length(trim(provider)) > 0),
  model TEXT NOT NULL CHECK(length(trim(model)) > 0),
  effort TEXT CHECK(effort IS NULL OR length(trim(effort)) > 0),
  guidance TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms)
) STRICT;

INSERT INTO execution_profiles_nullable(
  id, name, executor, provider, model, effort, guidance, revision, created_at_ms, updated_at_ms
)
SELECT id, name, executor, provider, model, effort, guidance, revision, created_at_ms, updated_at_ms
FROM execution_profiles;

DROP TABLE execution_profiles;
ALTER TABLE execution_profiles_nullable RENAME TO execution_profiles;
