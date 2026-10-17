-- Preserve journal order and confirmed receipts; creation effects have a real FK.
CREATE TABLE effects_next (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  creation_id TEXT REFERENCES project_creations(id) ON DELETE RESTRICT,
  attempt_id TEXT REFERENCES attempts(id) ON DELETE RESTRICT,
  delivery_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('issue_comment','project_status','local_commit','push','pull_request','create_repository','associate_origin','baseline_push')),
  scope_key TEXT NOT NULL,
  authorization_json TEXT NOT NULL CHECK(json_valid(authorization_json)),
  expected_identity_json TEXT NOT NULL CHECK(json_valid(expected_identity_json)),
  state TEXT NOT NULL CHECK(state IN ('not_requested','not_started','running','confirmed','failed_known','unknown','not_applicable')),
  receipt_json TEXT CHECK(receipt_json IS NULL OR json_valid(receipt_json)),
  reason TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  sent_at_ms INTEGER,
  confirmed_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  CHECK((creation_id IS NULL) <> (attempt_id IS NULL)),
  CHECK(delivery_id IS NULL OR attempt_id IS NOT NULL),
  CHECK((creation_id IS NOT NULL AND delivery_id IS NULL AND kind IN ('create_repository','associate_origin','baseline_push')) OR
    (attempt_id IS NOT NULL AND kind IN ('issue_comment','project_status','local_commit','push','pull_request'))),
  CHECK(kind NOT IN ('local_commit','push','pull_request') OR delivery_id IS NOT NULL),
  CHECK((state='confirmed') = (receipt_json IS NOT NULL)),
  CHECK(state<>'confirmed' OR confirmed_at_ms IS NOT NULL),
  FOREIGN KEY(delivery_id,attempt_id) REFERENCES deliveries(id,attempt_id) ON DELETE RESTRICT
) STRICT;
INSERT INTO effects_next SELECT * FROM effects ORDER BY rowid;
DROP TABLE effects;
ALTER TABLE effects_next RENAME TO effects;
CREATE UNIQUE INDEX effects_attempt_scope ON effects(attempt_id,kind,scope_key) WHERE attempt_id IS NOT NULL;
CREATE UNIQUE INDEX effects_creation_scope ON effects(creation_id,kind,scope_key) WHERE creation_id IS NOT NULL;
CREATE INDEX effects_attempt_state ON effects(attempt_id,state,created_at_ms,operation_id);
CREATE INDEX effects_creation_state ON effects(creation_id,state,created_at_ms,operation_id);
CREATE INDEX effects_delivery ON effects(delivery_id,created_at_ms,operation_id);
CREATE TRIGGER effect_identity BEFORE UPDATE OF operation_id,creation_id,attempt_id,delivery_id,kind,scope_key,authorization_json,expected_identity_json,created_at_ms ON effects
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER effect_terminal BEFORE UPDATE ON effects WHEN OLD.state IN ('confirmed','not_applicable')
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER effect_transition BEFORE UPDATE OF state ON effects WHEN NOT (
  (OLD.state='not_started' AND NEW.state IN ('running','failed_known','not_applicable')) OR
  (OLD.state='running' AND NEW.state IN ('confirmed','failed_known','unknown','not_applicable')) OR
  (OLD.state='unknown' AND NEW.state IN ('confirmed','not_applicable')) OR
  (OLD.state='failed_known' AND NEW.state IN ('running','not_applicable'))
) BEGIN SELECT RAISE(ABORT,'EFFECT_TRANSITION_INVALID'); END;
CREATE TRIGGER effect_delete BEFORE DELETE ON effects BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

-- Reconciliation can update facts of a partial creation, without restoring execution authority.
DROP TRIGGER creation_identity;
CREATE TRIGGER creation_identity BEFORE UPDATE ON project_creations
WHEN NEW.id<>OLD.id OR NEW.operation_id<>OLD.operation_id OR NEW.installation_id<>OLD.installation_id
  OR NEW.account_id IS NOT OLD.account_id OR NEW.plan_hash<>OLD.plan_hash OR NEW.plan_json<>OLD.plan_json
  OR NEW.destination<>OLD.destination OR NEW.created_at_ms<>OLD.created_at_ms
  OR OLD.state='completed' OR NEW.revision<>OLD.revision+1
  OR (OLD.state IN ('partial','failed') AND NEW.state NOT IN ('partial','failed','completed'))
  OR (OLD.baseline_sha IS NOT NULL AND (NEW.baseline_sha IS NOT OLD.baseline_sha OR NEW.baseline_ref IS NOT OLD.baseline_ref))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CREATION'); END;

CREATE TABLE creation_reconciliations (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  creation_id TEXT NOT NULL REFERENCES project_creations(id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK(state IN ('accepted','succeeded','unknown')),
  diagnostic TEXT
) STRICT;
CREATE UNIQUE INDEX creation_reconciliation_active ON creation_reconciliations(creation_id) WHERE state='accepted';
CREATE TRIGGER creation_reconciliation_identity BEFORE UPDATE ON creation_reconciliations
WHEN NEW.operation_id<>OLD.operation_id OR NEW.creation_id<>OLD.creation_id OR OLD.state<>'accepted'
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER creation_reconciliation_delete BEFORE DELETE ON creation_reconciliations BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
