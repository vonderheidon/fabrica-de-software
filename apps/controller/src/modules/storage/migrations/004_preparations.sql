CREATE TABLE preparations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  account_id TEXT REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
  UNIQUE(id, project_id),
  FOREIGN KEY(id, revision) REFERENCES preparation_revisions(preparation_id, revision)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE preparation_revisions (
  preparation_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  project_id TEXT NOT NULL,
  project_revision_id TEXT NOT NULL,
  choices_json TEXT NOT NULL CHECK(json_valid(choices_json) AND json_type(choices_json) = 'object' AND
    coalesce(json_extract(choices_json, '$.formatVersion') = 1 AND json_type(choices_json, '$.choices') = 'object', 0)),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  PRIMARY KEY(preparation_id, revision),
  FOREIGN KEY(preparation_id, project_id) REFERENCES preparations(id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY(project_revision_id, project_id) REFERENCES project_revisions(id, project_id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX preparations_project ON preparations(project_id, updated_at_ms, id);
CREATE TRIGGER preparation_identity_immutable BEFORE UPDATE OF id, project_id, account_id, created_at_ms ON preparations
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;
CREATE TRIGGER preparation_revision_update_immutable BEFORE UPDATE ON preparation_revisions
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;
CREATE TRIGGER preparation_revision_delete_immutable BEFORE DELETE ON preparation_revisions
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;
CREATE TRIGGER preparation_pointer_revision BEFORE UPDATE OF revision ON preparations
WHEN NEW.revision <> OLD.revision + 1 OR NOT EXISTS (
  SELECT 1 FROM preparation_revisions r WHERE r.preparation_id = NEW.id AND r.revision = NEW.revision AND r.project_id = NEW.project_id
)
BEGIN SELECT RAISE(ABORT, 'PREPARATION_REVISION_MISMATCH'); END;
