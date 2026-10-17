CREATE TABLE accounts (
  github_account_id TEXT PRIMARY KEY,
  login TEXT NOT NULL CHECK(length(login) > 0),
  observed_at_ms INTEGER NOT NULL CHECK(observed_at_ms >= 0),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1)
) STRICT;

CREATE TABLE factory_settings (
  id TEXT PRIMARY KEY CHECK(id = 'local'),
  installation_id TEXT NOT NULL UNIQUE CHECK(length(installation_id) > 0),
  account_id TEXT REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  designated_host TEXT CHECK(designated_host IS NULL OR length(designated_host) > 0),
  projects_root TEXT CHECK(projects_root IS NULL OR length(projects_root) > 0),
  data_root TEXT NOT NULL CHECK(length(data_root) > 0),
  maestri_settings_json TEXT NOT NULL CHECK(json_valid(maestri_settings_json)),
  automation_enabled INTEGER NOT NULL DEFAULT 0 CHECK(automation_enabled IN (0, 1)),
  time_defaults_json TEXT NOT NULL CHECK(json_valid(time_defaults_json)),
  cost_defaults_json TEXT NOT NULL CHECK(json_valid(cost_defaults_json)),
  artifact_policy_json TEXT NOT NULL CHECK(json_valid(artifact_policy_json)),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  CHECK(automation_enabled = 0 OR (account_id IS NOT NULL AND designated_host IS NOT NULL))
) STRICT;
