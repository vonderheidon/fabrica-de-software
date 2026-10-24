CREATE TABLE delivery_targets (
 operation_id TEXT PRIMARY KEY REFERENCES publication_requests(operation_id) ON DELETE RESTRICT,
 selection_operation_id TEXT REFERENCES publication_target_selections(operation_id) ON DELETE RESTRICT,
 delivery_id TEXT NOT NULL,
 attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
 repository_id TEXT NOT NULL,
 local_path TEXT NOT NULL CHECK(length(local_path) BETWEEN 1 AND 32768),
 local_identity_json TEXT NOT NULL CHECK(json_valid(local_identity_json)),
 branch_ref TEXT NOT NULL CHECK(length(branch_ref) BETWEEN 1 AND 1024),
 task_type TEXT NOT NULL CHECK(task_type IN ('feat','fix','docs','refactor','test','chore','perf','build','ci','revert')),
 task_description TEXT NOT NULL CHECK(length(task_description) BETWEEN 1 AND 256 AND instr(task_description,char(10))=0 AND instr(task_description,char(13))=0),
 issue_number INTEGER NOT NULL CHECK(issue_number>0),
 base_branch TEXT NOT NULL CHECK(length(base_branch) BETWEEN 1 AND 1024),
 base_sha TEXT NOT NULL CHECK(length(base_sha) IN (40,64) AND base_sha NOT GLOB '*[^0-9a-f]*'),
 approved_ref TEXT NOT NULL CHECK(length(approved_ref) BETWEEN 1 AND 1024),
 content_identity TEXT NOT NULL CHECK(length(content_identity) IN (40,64) AND content_identity NOT GLOB '*[^0-9a-f]*'),
 format_version INTEGER NOT NULL CHECK(format_version=1),
 created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
 FOREIGN KEY(delivery_id,attempt_id) REFERENCES deliveries(id,attempt_id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX delivery_targets_attempt_delivery ON delivery_targets(attempt_id,delivery_id,created_at_ms);
CREATE UNIQUE INDEX delivery_targets_repository_branch ON delivery_targets(repository_id,branch_ref);
CREATE TRIGGER delivery_target_binding BEFORE INSERT ON delivery_targets
WHEN NOT EXISTS (
 SELECT 1 FROM publication_requests p JOIN operation_requests o ON o.operation_id=p.operation_id
 JOIN attempts a ON a.id=p.attempt_id JOIN deliveries d ON d.id=p.delivery_id
 WHERE p.operation_id=NEW.operation_id AND p.attempt_id=NEW.attempt_id AND p.delivery_id=NEW.delivery_id
 AND p.kind IN ('publication.complete','publication.authorize-upgrade') AND p.authorized_mode IN ('commit','pr') AND p.state IN ('accepted','running')
 AND d.attempt_id=NEW.attempt_id AND d.base_sha=NEW.base_sha AND d.content_identity=NEW.content_identity
 AND json_extract(a.capture_json,'$.issue.number')=NEW.issue_number AND a.repository_id=NEW.repository_id
 AND (NEW.selection_operation_id IS NULL OR EXISTS (SELECT 1 FROM publication_target_selections s WHERE s.operation_id=NEW.selection_operation_id
   AND s.attempt_id=NEW.attempt_id AND s.delivery_id=NEW.delivery_id AND s.repository_id=NEW.repository_id AND s.state='confirmed' AND s.local_path=NEW.local_path))
)
BEGIN SELECT RAISE(ABORT,'DELIVERY_TARGET_BINDING_INVALID'); END;
CREATE TRIGGER delivery_target_immutable_update BEFORE UPDATE ON delivery_targets
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER delivery_target_delete BEFORE DELETE ON delivery_targets
WHEN factory_project_deletion_row_allowed('delivery_targets',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
