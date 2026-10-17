CREATE TABLE execution_profiles (
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
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  current_revision_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
  FOREIGN KEY(current_revision_id, id, revision) REFERENCES project_revisions(id, project_id, revision_number)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE project_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL CHECK(revision_number >= 1),
  source_kind TEXT NOT NULL CHECK(source_kind IN ('local', 'github')),
  source_location TEXT NOT NULL,
  repository_id TEXT,
  repository_url TEXT,
  base_branch TEXT NOT NULL,
  github_project_id TEXT,
  github_project_owner_id TEXT,
  status_field_id TEXT,
  status_options_json TEXT NOT NULL CHECK(json_valid(status_options_json)),
  implementer_profile_id TEXT REFERENCES execution_profiles(id) ON DELETE RESTRICT,
  reviewer_profile_id TEXT REFERENCES execution_profiles(id) ON DELETE RESTRICT,
  checks_json TEXT NOT NULL CHECK(json_valid(checks_json) AND json_type(checks_json) = 'array'),
  correction_limit INTEGER NOT NULL DEFAULT 2 CHECK(correction_limit BETWEEN 0 AND 5),
  default_delivery_mode TEXT NOT NULL DEFAULT 'icr' CHECK(default_delivery_mode IN ('icr', 'commit', 'pr')),
  automation_enabled INTEGER NOT NULL DEFAULT 0 CHECK(automation_enabled IN (0, 1)),
  queue_order_json TEXT NOT NULL CHECK(json_valid(queue_order_json)),
  guidance TEXT NOT NULL,
  origin_notes_json TEXT NOT NULL CHECK(json_valid(origin_notes_json) AND json_type(origin_notes_json) = 'array'),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  UNIQUE(project_id, revision_number),
  UNIQUE(id, project_id),
  UNIQUE(id, project_id, revision_number),
  CHECK((repository_id IS NULL) = (repository_url IS NULL)),
  CHECK(coalesce((github_project_id IS NULL AND github_project_owner_id IS NULL AND status_field_id IS NULL AND status_options_json = '{}') OR
    (github_project_id IS NOT NULL AND github_project_owner_id IS NOT NULL AND status_field_id IS NOT NULL AND
     json_type(status_options_json, '$.ready') = 'text' AND json_type(status_options_json, '$.inProgress') = 'text' AND
     json_type(status_options_json, '$.inReview') = 'text' AND json_type(status_options_json, '$.delivered') = 'text'), 0))
) STRICT;
CREATE INDEX projects_catalog ON projects(account_id, name COLLATE NOCASE, id);
CREATE INDEX project_revisions_project ON project_revisions(project_id, revision_number);
CREATE TRIGGER project_revision_update_immutable BEFORE UPDATE ON project_revisions
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;
CREATE TRIGGER project_revision_delete_immutable BEFORE DELETE ON project_revisions
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;
CREATE TRIGGER project_pointer_revision BEFORE UPDATE OF current_revision_id, revision ON projects
WHEN NOT EXISTS (SELECT 1 FROM project_revisions r WHERE r.id = NEW.current_revision_id AND r.project_id = NEW.id AND r.revision_number = NEW.revision)
BEGIN SELECT RAISE(ABORT, 'PROJECT_REVISION_MISMATCH'); END;
ALTER TABLE events ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT;
CREATE INDEX events_project_seq ON events(project_id, seq);
