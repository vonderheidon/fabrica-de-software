-- Supply live authority in the same format as the transaction-owned delete guards.
DROP TRIGGER project_storage_location_delete_authorized;
CREATE TRIGGER project_storage_location_delete_authorized
BEFORE DELETE ON project_storage_locations
WHEN factory_project_deletion_row_allowed('project_storage_locations',json_array(OLD.id),
  (SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state)
   FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_AUTHORIZATION_REQUIRED'); END;

DROP TRIGGER project_storage_transition_delete_authorized;
CREATE TRIGGER project_storage_transition_delete_authorized
BEFORE DELETE ON project_storage_transitions
WHEN factory_project_deletion_row_allowed('project_storage_transitions',json_array(OLD.operation_id),
  (SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state)
   FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_AUTHORIZATION_REQUIRED'); END;
