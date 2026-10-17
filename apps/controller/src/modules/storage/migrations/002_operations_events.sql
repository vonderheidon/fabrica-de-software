CREATE TABLE operation_requests (
  operation_id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  operation_kind TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK(length(request_hash) = 64),
  expected_revision_json TEXT CHECK(expected_revision_json IS NULL OR json_valid(expected_revision_json)),
  receipt_json TEXT CHECK(receipt_json IS NULL OR json_valid(receipt_json))
) STRICT;
CREATE INDEX operation_requests_scope ON operation_requests(installation_id, account_id, resource_type, resource_id);
CREATE TABLE events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation_id TEXT NOT NULL REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  entity_revision INTEGER NOT NULL CHECK(entity_revision >= 1),
  facts_json TEXT NOT NULL CHECK(json_valid(facts_json) AND facts_json = '{}'),
  occurred_at_ms INTEGER NOT NULL CHECK(occurred_at_ms >= 0)
) STRICT;
CREATE INDEX events_entity_seq ON events(entity_type, entity_id, seq);
CREATE UNIQUE INDEX events_operation_revision ON events(operation_id, entity_revision);
CREATE TRIGGER operation_identity_immutable BEFORE UPDATE OF operation_id, installation_id, account_id, operation_kind, resource_type, resource_id, request_hash, expected_revision_json ON operation_requests
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;
CREATE TRIGGER operation_delete_immutable BEFORE DELETE ON operation_requests
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;
CREATE TRIGGER event_update_immutable BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;
CREATE TRIGGER event_delete_immutable BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;
