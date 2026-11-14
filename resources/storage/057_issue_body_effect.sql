-- Approved criteria can be checked in the issue body; preserve journal order, receipts and every dependent object.
CREATE TABLE effects_next (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  creation_id TEXT REFERENCES project_creations(id) ON DELETE RESTRICT,
  attempt_id TEXT REFERENCES attempts(id) ON DELETE RESTRICT,
  delivery_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('issue_comment','issue_body','project_status','local_commit','push','pull_request','create_repository','associate_origin','baseline_push')),
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
    (attempt_id IS NOT NULL AND kind IN ('issue_comment','issue_body','project_status','local_commit','push','pull_request'))),
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
CREATE TRIGGER effect_delete BEFORE DELETE ON effects
WHEN factory_project_deletion_row_allowed('effects',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER effect_transition BEFORE UPDATE OF state ON effects WHEN NOT (
  (OLD.state='not_started' AND NEW.state IN ('running','failed_known','not_applicable')) OR
  (OLD.state='running' AND NEW.state IN ('confirmed','failed_known','unknown','not_applicable')) OR
  (OLD.state='unknown' AND NEW.state IN ('confirmed','failed_known','not_applicable') AND (NEW.state<>'failed_known' OR OLD.kind='local_commit')) OR
  (OLD.state='failed_known' AND NEW.state IN ('running','not_applicable'))
) BEGIN SELECT RAISE(ABORT,'EFFECT_TRANSITION_INVALID'); END;
