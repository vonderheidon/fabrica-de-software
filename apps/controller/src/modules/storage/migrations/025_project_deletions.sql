CREATE TABLE project_deletions (
  operation_id TEXT NOT NULL PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE RESTRICT,
  expected_revision INTEGER NOT NULL CHECK(expected_revision >= 1),
  authorization_digest TEXT NOT NULL CHECK(length(authorization_digest) = 64),
  state TEXT NOT NULL CHECK(state IN ('accepted','running','pending','reconfirmation_required','finalizing')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
  reason_code TEXT,
  reason TEXT,
  recovery TEXT,
  worker_token TEXT,
  worker_generation INTEGER NOT NULL DEFAULT 0 CHECK(worker_generation >= 0),
  CHECK(state NOT IN ('pending','reconfirmation_required') OR (reason IS NOT NULL AND recovery IS NOT NULL))
) STRICT;
CREATE INDEX project_deletions_recovery ON project_deletions(state, updated_at_ms);

CREATE TABLE project_deletion_targets (
  operation_id TEXT NOT NULL REFERENCES project_deletions(operation_id) ON DELETE RESTRICT,
  target_key TEXT NOT NULL,
  target_kind TEXT NOT NULL CHECK(target_kind IN ('original_directory','exclusive_workspace','exclusive_artifact')),
  authorized_path TEXT NOT NULL,
  normalized_path TEXT NOT NULL,
  resolved_path TEXT,
  object_kind TEXT NOT NULL CHECK(object_kind IN ('directory','file','symlink','junction','absent')),
  identity_json TEXT NOT NULL CHECK(json_valid(identity_json)),
  owner_kind TEXT NOT NULL CHECK(owner_kind IN ('project','attempt','delivery','creation')),
  owner_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','removing','removed','blocked')),
  verified_at_ms INTEGER CHECK(verified_at_ms IS NULL OR verified_at_ms >= 0),
  reason_code TEXT,
  PRIMARY KEY(operation_id,target_key),
  UNIQUE(operation_id,normalized_path),
  CHECK(resolved_path IS NOT NULL OR object_kind = 'absent')
) STRICT;

CREATE TABLE project_deletion_receipts (
  operation_id TEXT NOT NULL PRIMARY KEY,
  request_fingerprint TEXT NOT NULL CHECK(length(request_fingerprint) = 64),
  result TEXT NOT NULL CHECK(result = 'succeeded')
) STRICT;

CREATE TRIGGER project_deletions_identity
BEFORE UPDATE OF operation_id,project_id,expected_revision,authorization_digest,created_at_ms ON project_deletions
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER project_deletion_targets_identity
BEFORE UPDATE OF operation_id,target_key,target_kind,authorized_path,normalized_path,resolved_path,object_kind,identity_json,owner_kind,owner_id ON project_deletion_targets
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER project_deletion_receipts_insert
BEFORE INSERT ON project_deletion_receipts
WHEN factory_project_deletion_finalization_allowed(NEW.operation_id) IS NOT 1
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_FINALIZATION_REQUIRED'); END;
CREATE TRIGGER project_deletion_receipts_immutable
BEFORE UPDATE ON project_deletion_receipts
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER project_deletion_receipts_delete_immutable
BEFORE DELETE ON project_deletion_receipts
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
