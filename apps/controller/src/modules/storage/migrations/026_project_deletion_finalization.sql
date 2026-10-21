-- Only DELETE guards change. UPDATE, identity and state protections remain intact.
-- The connection capability contains the exact transaction-owned primary keys.
DROP TRIGGER operation_delete_immutable;
CREATE TRIGGER operation_delete_immutable BEFORE DELETE ON operation_requests
WHEN factory_project_deletion_row_allowed('operation_requests',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;

DROP TRIGGER event_delete_immutable;
CREATE TRIGGER event_delete_immutable BEFORE DELETE ON events
WHEN factory_project_deletion_row_allowed('events',json_array(OLD.seq),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;

DROP TRIGGER project_revision_delete_immutable;
CREATE TRIGGER project_revision_delete_immutable BEFORE DELETE ON project_revisions
WHEN factory_project_deletion_row_allowed('project_revisions',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;

DROP TRIGGER preparation_revision_delete_immutable;
CREATE TRIGGER preparation_revision_delete_immutable BEFORE DELETE ON preparation_revisions
WHEN factory_project_deletion_row_allowed('preparation_revisions',json_array(OLD.preparation_id,OLD.revision),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;

DROP TRIGGER attempt_criteria_delete_immutable;
CREATE TRIGGER attempt_criteria_delete_immutable BEFORE DELETE ON attempt_criteria
WHEN factory_project_deletion_row_allowed('attempt_criteria',json_array(OLD.attempt_id,OLD.criterion_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER rounds_delete_immutable;
CREATE TRIGGER rounds_delete_immutable BEFORE DELETE ON rounds
WHEN factory_project_deletion_row_allowed('rounds',json_array(OLD.attempt_id,OLD.round_number),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER passage_results_delete_immutable;
CREATE TRIGGER passage_results_delete_immutable BEFORE DELETE ON passage_results
WHEN factory_project_deletion_row_allowed('passage_results',json_array(OLD.passage_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER criterion_results_delete_immutable;
CREATE TRIGGER criterion_results_delete_immutable BEFORE DELETE ON criterion_results
WHEN factory_project_deletion_row_allowed('criterion_results',json_array(OLD.passage_id,OLD.criterion_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER passage_events_delete_immutable;
CREATE TRIGGER passage_events_delete_immutable BEFORE DELETE ON passage_events
WHEN factory_project_deletion_row_allowed('passage_events',json_array(OLD.seq),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER attempts_delete_immutable;
CREATE TRIGGER attempts_delete_immutable BEFORE DELETE ON attempts
WHEN factory_project_deletion_row_allowed('attempts',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER passages_delete_immutable;
CREATE TRIGGER passages_delete_immutable BEFORE DELETE ON passages
WHEN factory_project_deletion_row_allowed('passages',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER resources_delete_immutable;
CREATE TRIGGER resources_delete_immutable BEFORE DELETE ON resources
WHEN factory_project_deletion_row_allowed('resources',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER execution_questions_delete_immutable;
CREATE TRIGGER execution_questions_delete_immutable BEFORE DELETE ON execution_questions
WHEN factory_project_deletion_row_allowed('execution_questions',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER capture_run_delete;
CREATE TRIGGER capture_run_delete BEFORE DELETE ON capture_runs
WHEN factory_project_deletion_row_allowed('capture_runs',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER delivery_delete_immutable;
CREATE TRIGGER delivery_delete_immutable BEFORE DELETE ON deliveries
WHEN factory_project_deletion_row_allowed('deliveries',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER capture_warning_delete_immutable;
CREATE TRIGGER capture_warning_delete_immutable BEFORE DELETE ON capture_warnings
WHEN factory_project_deletion_row_allowed('capture_warnings',json_array(OLD.delivery_id,OLD.path),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER verification_history;
CREATE TRIGGER verification_history BEFORE DELETE ON verification_runs
WHEN factory_project_deletion_row_allowed('verification_runs',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'immutable verification'); END;

DROP TRIGGER checks_history_guard;
CREATE TRIGGER checks_history_guard BEFORE DELETE ON checks
WHEN factory_project_deletion_row_allowed('checks',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'immutable check'); END;

DROP TRIGGER artifacts_delete;
CREATE TRIGGER artifacts_delete BEFORE DELETE ON artifacts
WHEN factory_project_deletion_row_allowed('artifacts',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'immutable artifact'); END;

DROP TRIGGER review_delete;
CREATE TRIGGER review_delete BEFORE DELETE ON reviews
WHEN factory_project_deletion_row_allowed('reviews',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER finding_delete;
CREATE TRIGGER finding_delete BEFORE DELETE ON findings
WHEN factory_project_deletion_row_allowed('findings',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER resolution_delete;
CREATE TRIGGER resolution_delete BEFORE DELETE ON finding_resolutions
WHEN factory_project_deletion_row_allowed('finding_resolutions',json_array(OLD.finding_id,OLD.review_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER measurement_delete_immutable;
CREATE TRIGGER measurement_delete_immutable BEFORE DELETE ON passage_measurements
WHEN factory_project_deletion_row_allowed('passage_measurements',json_array(OLD.passage_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER cancellation_delete;
CREATE TRIGGER cancellation_delete BEFORE DELETE ON cancellation_requests
WHEN factory_project_deletion_row_allowed('cancellation_requests',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER removal_delete;
CREATE TRIGGER removal_delete BEFORE DELETE ON resource_removals
WHEN factory_project_deletion_row_allowed('resource_removals',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER native_delete;
CREATE TRIGGER native_delete BEFORE DELETE ON native_open_requests
WHEN factory_project_deletion_row_allowed('native_open_requests',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER effect_delete;
CREATE TRIGGER effect_delete BEFORE DELETE ON effects
WHEN factory_project_deletion_row_allowed('effects',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER publication_delete;
CREATE TRIGGER publication_delete BEFORE DELETE ON publication_requests
WHEN factory_project_deletion_row_allowed('publication_requests',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER queue_cycles_no_delete;
CREATE TRIGGER queue_cycles_no_delete BEFORE DELETE ON queue_cycles
WHEN factory_project_deletion_row_allowed('queue_cycles',json_array(OLD.account_id,OLD.project_id,OLD.issue_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'queue cycle history is immutable'); END;

DROP TRIGGER creation_delete;
CREATE TRIGGER creation_delete BEFORE DELETE ON project_creations
WHEN factory_project_deletion_row_allowed('project_creations',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CREATION'); END;

DROP TRIGGER creation_step_delete;
CREATE TRIGGER creation_step_delete BEFORE DELETE ON creation_steps
WHEN factory_project_deletion_row_allowed('creation_steps',json_array(OLD.creation_id,OLD.step),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CREATION_STEP'); END;

DROP TRIGGER upgrade_delete;
CREATE TRIGGER upgrade_delete BEFORE DELETE ON publication_upgrades
WHEN factory_project_deletion_row_allowed('publication_upgrades',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER queue_consumptions_no_delete;
CREATE TRIGGER queue_consumptions_no_delete BEFORE DELETE ON queue_consumptions
WHEN factory_project_deletion_row_allowed('queue_consumptions',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'queue consumption is immutable'); END;

DROP TRIGGER creation_reconciliation_delete;
CREATE TRIGGER creation_reconciliation_delete BEFORE DELETE ON creation_reconciliations
WHEN factory_project_deletion_row_allowed('creation_reconciliations',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

DROP TRIGGER diagnostic_run_delete;
CREATE TRIGGER diagnostic_run_delete BEFORE DELETE ON diagnostic_runs
WHEN factory_project_deletion_row_allowed('diagnostic_runs',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER projects_project_deletion_guard BEFORE DELETE ON projects
WHEN factory_project_deletion_row_allowed('projects',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_FINALIZATION_REQUIRED'); END;

CREATE TRIGGER preparations_project_deletion_guard BEFORE DELETE ON preparations
WHEN factory_project_deletion_row_allowed('preparations',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_FINALIZATION_REQUIRED'); END;

CREATE TRIGGER attempt_authority_project_deletion_guard BEFORE DELETE ON attempt_authority
WHEN factory_project_deletion_row_allowed('attempt_authority',json_array(OLD.attempt_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_FINALIZATION_REQUIRED'); END;

CREATE TRIGGER project_deletions_project_deletion_guard BEFORE DELETE ON project_deletions
WHEN factory_project_deletion_row_allowed('project_deletions',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_FINALIZATION_REQUIRED'); END;

CREATE TRIGGER project_deletion_targets_project_deletion_guard BEFORE DELETE ON project_deletion_targets
WHEN factory_project_deletion_row_allowed('project_deletion_targets',json_array(OLD.operation_id,OLD.target_key),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_FINALIZATION_REQUIRED'); END;

