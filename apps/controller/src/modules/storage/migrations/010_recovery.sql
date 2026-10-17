ALTER TABLE resources ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1);
ALTER TABLE resources ADD COLUMN removed INTEGER NOT NULL DEFAULT 0 CHECK(removed IN (0,1));
CREATE TRIGGER resource_revision AFTER UPDATE OF owned,launch_state,stop_state,diagnostic,removed ON resources
BEGIN UPDATE resources SET revision=revision+1 WHERE id=NEW.id; END;
CREATE TRIGGER resource_removal_terminal BEFORE UPDATE OF removed ON resources WHEN OLD.removed=1 AND NEW.removed<>1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TABLE cancellation_requests (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  created_at_ms INTEGER NOT NULL
) STRICT;
CREATE INDEX cancellation_attempt ON cancellation_requests(attempt_id);
CREATE TABLE resource_removals (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
  plan_hash TEXT NOT NULL CHECK(length(plan_hash)=64),
  state TEXT NOT NULL CHECK(state IN ('accepted','removed','failed','unknown')),
  diagnostic TEXT,
  created_at_ms INTEGER NOT NULL
) STRICT;
CREATE UNIQUE INDEX removal_active ON resource_removals(resource_id) WHERE state IN ('accepted','unknown');
CREATE TABLE native_open_requests (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK(kind IN ('folder.open','interaction.open')),
  state TEXT NOT NULL CHECK(state IN ('accepted','requested','unknown')),
  created_at_ms INTEGER NOT NULL
) STRICT;
CREATE TRIGGER cancellation_immutable BEFORE UPDATE ON cancellation_requests BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER cancellation_delete BEFORE DELETE ON cancellation_requests BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER removal_identity BEFORE UPDATE OF operation_id,resource_id,plan_hash,created_at_ms ON resource_removals BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER removal_terminal BEFORE UPDATE ON resource_removals WHEN OLD.state<>'accepted' BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER removal_delete BEFORE DELETE ON resource_removals BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER native_identity BEFORE UPDATE OF operation_id,resource_id,kind,created_at_ms ON native_open_requests BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER native_terminal BEFORE UPDATE ON native_open_requests WHEN OLD.state<>'accepted' BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER native_delete BEFORE DELETE ON native_open_requests BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
