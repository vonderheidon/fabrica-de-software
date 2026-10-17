CREATE TABLE queue_cycles (
  account_id TEXT NOT NULL REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  issue_id TEXT NOT NULL CHECK(length(issue_id) > 0),
  cycle_number INTEGER NOT NULL DEFAULT 1 CHECK(cycle_number >= 1),
  last_ready INTEGER NOT NULL CHECK(last_ready IN (0,1)),
  consumed_attempt_id TEXT REFERENCES attempts(id) ON DELETE RESTRICT,
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= 0),
  PRIMARY KEY(account_id, project_id, issue_id)
) STRICT;

CREATE INDEX queue_cycles_consumed ON queue_cycles(consumed_attempt_id) WHERE consumed_attempt_id IS NOT NULL;

CREATE TRIGGER queue_cycles_attempt_scope_insert
BEFORE INSERT ON queue_cycles
WHEN NEW.consumed_attempt_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM attempts WHERE id=NEW.consumed_attempt_id AND account_id=NEW.account_id AND project_id=NEW.project_id AND issue_id=NEW.issue_id
)
BEGIN SELECT RAISE(ABORT, 'queue cycle attempt scope mismatch'); END;

CREATE TRIGGER queue_cycles_attempt_scope_update
BEFORE UPDATE OF account_id,consumed_attempt_id,project_id,issue_id ON queue_cycles
WHEN NEW.consumed_attempt_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM attempts WHERE id=NEW.consumed_attempt_id AND account_id=NEW.account_id AND project_id=NEW.project_id AND issue_id=NEW.issue_id
)
BEGIN SELECT RAISE(ABORT, 'queue cycle attempt scope mismatch'); END;

CREATE TRIGGER queue_cycles_monotonic
BEFORE UPDATE ON queue_cycles
WHEN NEW.account_id<>OLD.account_id OR NEW.project_id<>OLD.project_id OR NEW.issue_id<>OLD.issue_id OR NEW.cycle_number<OLD.cycle_number
BEGIN SELECT RAISE(ABORT, 'queue cycle identity and sequence are immutable'); END;

CREATE TRIGGER queue_cycles_no_delete
BEFORE DELETE ON queue_cycles
BEGIN SELECT RAISE(ABORT, 'queue cycle history is immutable'); END;
