-- Historical execution source was not recorded; NULL preserves that uncertainty.
ALTER TABLE attempts ADD COLUMN source TEXT CHECK(source IN ('manual','automatic','retry'));
CREATE UNIQUE INDEX attempts_active_automatic_account ON attempts(account_id) WHERE source='automatic' AND result IS NULL;
CREATE INDEX attempts_issue_history ON attempts(account_id,repository_id,issue_id,created_at_ms DESC,id DESC);
CREATE TRIGGER attempts_source_immutable BEFORE UPDATE OF source ON attempts
WHEN NEW.source IS NOT OLD.source BEGIN SELECT RAISE(ABORT,'attempt source is immutable'); END;
CREATE TRIGGER attempts_source_required BEFORE INSERT ON attempts
WHEN NEW.source IS NULL BEGIN SELECT RAISE(ABORT,'new attempts require execution source'); END;

ALTER TABLE queue_cycles ADD COLUMN ready_exit_observed_at_ms INTEGER CHECK(ready_exit_observed_at_ms IS NULL OR ready_exit_observed_at_ms>=0);
ALTER TABLE queue_cycles ADD COLUMN ready_return_observed_at_ms INTEGER CHECK(ready_return_observed_at_ms IS NULL OR ready_return_observed_at_ms>=0);

CREATE TABLE queue_consumptions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  repository_id TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  observed_cycle INTEGER NOT NULL CHECK(observed_cycle>=1),
  ready_exit_observed_at_ms INTEGER CHECK(ready_exit_observed_at_ms IS NULL OR ready_exit_observed_at_ms>=0),
  ready_return_observed_at_ms INTEGER CHECK(ready_return_observed_at_ms IS NULL OR ready_return_observed_at_ms>=0),
  consumed_at_ms INTEGER NOT NULL CHECK(consumed_at_ms>=0),
  attempt_id TEXT NOT NULL UNIQUE REFERENCES attempts(id) ON DELETE RESTRICT,
  UNIQUE(account_id,project_id,issue_id,observed_cycle)
) STRICT;
CREATE INDEX queue_consumptions_issue ON queue_consumptions(account_id,repository_id,issue_id);

-- Preserve only consumption links actually present in the old snapshot. Do not infer
-- older cycles, execution source or Ready transitions that were never recorded.
INSERT INTO queue_consumptions(id,account_id,project_id,repository_id,issue_id,observed_cycle,consumed_at_ms,attempt_id)
SELECT a.id,c.account_id,c.project_id,a.repository_id,c.issue_id,c.cycle_number,c.updated_at_ms,a.id
FROM queue_cycles c JOIN attempts a ON a.id=c.consumed_attempt_id;

CREATE TRIGGER queue_consumptions_scope BEFORE INSERT ON queue_consumptions
WHEN NOT EXISTS (SELECT 1 FROM attempts a WHERE a.id=NEW.attempt_id AND a.account_id=NEW.account_id
  AND a.project_id=NEW.project_id AND a.repository_id=NEW.repository_id AND a.issue_id=NEW.issue_id)
BEGIN SELECT RAISE(ABORT,'queue consumption scope mismatch'); END;
CREATE TRIGGER queue_consumptions_no_update BEFORE UPDATE ON queue_consumptions
BEGIN SELECT RAISE(ABORT,'queue consumption is immutable'); END;
CREATE TRIGGER queue_consumptions_no_delete BEFORE DELETE ON queue_consumptions
BEGIN SELECT RAISE(ABORT,'queue consumption is immutable'); END;

-- Duplicate registrations still refer to the same account/repository/issue.
DROP TRIGGER queue_cycles_attempt_scope_insert;
DROP TRIGGER queue_cycles_attempt_scope_update;
CREATE TRIGGER queue_cycles_attempt_scope_insert BEFORE INSERT ON queue_cycles
WHEN NEW.consumed_attempt_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM attempts a JOIN projects p ON p.id=NEW.project_id JOIN project_revisions r ON r.id=p.current_revision_id
  WHERE a.id=NEW.consumed_attempt_id AND a.account_id=NEW.account_id AND a.issue_id=NEW.issue_id AND a.repository_id=r.repository_id)
BEGIN SELECT RAISE(ABORT,'queue cycle attempt scope mismatch'); END;
CREATE TRIGGER queue_cycles_attempt_scope_update BEFORE UPDATE OF consumed_attempt_id ON queue_cycles
WHEN NEW.consumed_attempt_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM attempts a JOIN projects p ON p.id=NEW.project_id JOIN project_revisions r ON r.id=p.current_revision_id
  WHERE a.id=NEW.consumed_attempt_id AND a.account_id=NEW.account_id AND a.issue_id=NEW.issue_id AND a.repository_id=r.repository_id)
BEGIN SELECT RAISE(ABORT,'queue cycle attempt scope mismatch'); END;
