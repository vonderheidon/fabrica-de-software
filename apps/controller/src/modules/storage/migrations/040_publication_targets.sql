CREATE TABLE publication_target_selections (
 operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id),
 attempt_id TEXT NOT NULL REFERENCES attempts(id),
 delivery_id TEXT NOT NULL,
 repository_id TEXT NOT NULL,
 selection_kind TEXT NOT NULL CHECK(selection_kind IN ('existing_clone','clone')),
 local_path TEXT NOT NULL CHECK(length(local_path) BETWEEN 1 AND 32768),
 expected_identity_json TEXT NOT NULL CHECK(json_valid(expected_identity_json)),
 confirmed_identity_json TEXT CHECK(confirmed_identity_json IS NULL OR json_valid(confirmed_identity_json)),
 authorization_json TEXT NOT NULL CHECK(json_valid(authorization_json)),
 request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
 state TEXT NOT NULL CHECK(state IN ('accepted','running','confirmed','failed_known','unknown')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 reason TEXT CHECK(length(reason) BETWEEN 1 AND 2048),
 created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
 updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms>=created_at_ms),
 FOREIGN KEY(delivery_id,attempt_id) REFERENCES deliveries(id,attempt_id),
 CHECK(state<>'confirmed' OR confirmed_identity_json IS NOT NULL)
) STRICT;
CREATE INDEX publication_target_history ON publication_target_selections(attempt_id,delivery_id,created_at_ms);
CREATE UNIQUE INDEX publication_target_pending ON publication_target_selections(attempt_id) WHERE state IN ('accepted','running','unknown');
CREATE UNIQUE INDEX publication_target_path_pending ON publication_target_selections(lower(local_path)) WHERE state IN ('accepted','running','unknown');
CREATE TRIGGER publication_target_binding BEFORE INSERT ON publication_target_selections
WHEN NOT EXISTS (SELECT 1 FROM attempts a JOIN operation_requests o ON o.operation_id=NEW.operation_id
 WHERE a.id=NEW.attempt_id AND a.repository_id=NEW.repository_id AND o.resource_id=a.id AND o.operation_kind='publication.target'
 AND json_extract(NEW.authorization_json,'$.authorized')=1 AND json_extract(NEW.authorization_json,'$.formatVersion')=1
 AND json_extract(NEW.expected_identity_json,'$.repositoryId')=NEW.repository_id)
BEGIN SELECT RAISE(ABORT,'TARGET_BINDING_INVALID'); END;
CREATE TRIGGER publication_target_update BEFORE UPDATE ON publication_target_selections
WHEN NEW.operation_id<>OLD.operation_id OR NEW.attempt_id<>OLD.attempt_id OR NEW.delivery_id<>OLD.delivery_id
 OR NEW.repository_id<>OLD.repository_id OR NEW.selection_kind<>OLD.selection_kind OR NEW.local_path<>OLD.local_path
 OR NEW.authorization_json<>OLD.authorization_json OR NEW.request_hash<>OLD.request_hash OR NEW.created_at_ms<>OLD.created_at_ms
 OR NEW.revision<>OLD.revision+1 OR OLD.state IN ('confirmed','failed_known')
 OR (NEW.expected_identity_json<>OLD.expected_identity_json AND NOT (OLD.state IN ('accepted','running') AND NEW.state='running'
   AND json_extract(OLD.expected_identity_json,'$.directoryIdentity') IS NULL
   AND json_extract(NEW.expected_identity_json,'$.directoryIdentity') IS NOT NULL
   AND json_remove(OLD.expected_identity_json,'$.directoryIdentity')=json_remove(NEW.expected_identity_json,'$.directoryIdentity')))
 OR (NEW.state='confirmed' AND (json_extract(NEW.confirmed_identity_json,'$.repositoryId') IS NOT NEW.repository_id
 OR json_extract(NEW.confirmed_identity_json,'$.root') IS NOT json_extract(NEW.expected_identity_json,'$.root')
 OR json_extract(NEW.confirmed_identity_json,'$.directoryIdentity') IS NOT json_extract(NEW.expected_identity_json,'$.directoryIdentity')
 OR json_extract(NEW.expected_identity_json,'$.directoryIdentity') IS NULL))
BEGIN SELECT RAISE(ABORT,'TARGET_UPDATE_INVALID'); END;
CREATE TRIGGER publication_target_delete BEFORE DELETE ON publication_target_selections
WHEN factory_project_deletion_row_allowed('publication_target_selections',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
