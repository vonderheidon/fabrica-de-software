CREATE UNIQUE INDEX deliveries_effect_binding ON deliveries(id,attempt_id);
CREATE TABLE effects (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  creation_id TEXT,
  attempt_id TEXT REFERENCES attempts(id) ON DELETE RESTRICT,
  delivery_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('issue_comment','project_status')),
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
  CHECK((state='confirmed') = (receipt_json IS NOT NULL)),
  CHECK(state<>'confirmed' OR confirmed_at_ms IS NOT NULL),
  FOREIGN KEY(delivery_id,attempt_id) REFERENCES deliveries(id,attempt_id) ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX effects_attempt_scope ON effects(attempt_id,kind,scope_key) WHERE attempt_id IS NOT NULL;
CREATE UNIQUE INDEX effects_creation_scope ON effects(creation_id,kind,scope_key) WHERE creation_id IS NOT NULL;
CREATE INDEX effects_attempt_state ON effects(attempt_id,state,created_at_ms,operation_id);
CREATE INDEX effects_delivery ON effects(delivery_id,created_at_ms,operation_id);
CREATE TABLE publication_requests (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  delivery_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('publication.complete','publication.reconcile','attempt.revalidate')),
  authorized_mode TEXT CHECK(authorized_mode IS NULL OR authorized_mode='icr'),
  state TEXT NOT NULL CHECK(state IN ('accepted','running','succeeded','failed','unknown')),
  diagnostic TEXT,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(delivery_id,attempt_id) REFERENCES deliveries(id,attempt_id) ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX publication_request_active ON publication_requests(attempt_id) WHERE state IN ('accepted','running');
CREATE TABLE attempt_authority (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE RESTRICT,
  reason TEXT,
  expected_status_id TEXT,
  observed_status_id TEXT,
  observed_at_ms INTEGER NOT NULL
) STRICT;
CREATE TABLE controller_authority (
  id TEXT PRIMARY KEY CHECK(id='local'),
  configured_account_id TEXT REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  observed_account_id TEXT,
  dispatch_paused INTEGER NOT NULL CHECK(dispatch_paused IN (0,1)),
  observed_at_ms INTEGER NOT NULL
) STRICT;
CREATE TRIGGER effect_identity BEFORE UPDATE OF operation_id,creation_id,attempt_id,delivery_id,kind,scope_key,authorization_json,expected_identity_json,created_at_ms ON effects
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER effect_terminal BEFORE UPDATE ON effects WHEN OLD.state IN ('confirmed','not_applicable')
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER effect_transition BEFORE UPDATE OF state ON effects WHEN NOT (
  (OLD.state='not_started' AND NEW.state IN ('running','failed_known','not_applicable')) OR
  (OLD.state='running' AND NEW.state IN ('confirmed','failed_known','unknown')) OR
  (OLD.state='unknown' AND NEW.state='confirmed') OR
  (OLD.state='failed_known' AND NEW.state IN ('running','not_applicable'))
) BEGIN SELECT RAISE(ABORT,'EFFECT_TRANSITION_INVALID'); END;
CREATE TRIGGER effect_delete BEFORE DELETE ON effects BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER publication_identity BEFORE UPDATE OF operation_id,attempt_id,delivery_id,kind,authorized_mode,created_at_ms ON publication_requests
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER publication_terminal BEFORE UPDATE ON publication_requests WHEN OLD.state IN ('succeeded','failed','unknown')
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER publication_delete BEFORE DELETE ON publication_requests BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE INDEX attempts_account_created ON attempts(account_id,created_at_ms,id);
CREATE INDEX questions_attempt_created ON execution_questions(attempt_id,created_at_ms,id);
