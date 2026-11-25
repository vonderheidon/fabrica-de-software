CREATE TABLE schema_migrations (
            version INTEGER PRIMARY KEY CHECK(version >= 1),
            name TEXT NOT NULL UNIQUE,
            checksum TEXT NOT NULL CHECK(length(checksum) = 64),
            applied_at_ms INTEGER NOT NULL CHECK(applied_at_ms >= 0)
          ) STRICT;

CREATE TABLE accounts (
  github_account_id TEXT PRIMARY KEY,
  login TEXT NOT NULL CHECK(length(login) > 0),
  observed_at_ms INTEGER NOT NULL CHECK(observed_at_ms >= 0),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1)
) STRICT;

CREATE TABLE factory_settings (
  id TEXT PRIMARY KEY CHECK(id = 'local'),
  installation_id TEXT NOT NULL UNIQUE CHECK(length(installation_id) > 0),
  account_id TEXT REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  designated_host TEXT CHECK(designated_host IS NULL OR length(designated_host) > 0),
  projects_root TEXT CHECK(projects_root IS NULL OR length(projects_root) > 0),
  automation_enabled INTEGER NOT NULL DEFAULT 0 CHECK(automation_enabled IN (0, 1)),
  time_defaults_json TEXT NOT NULL CHECK(json_valid(time_defaults_json)),
  artifact_policy_json TEXT NOT NULL CHECK(json_valid(artifact_policy_json)),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1), onboarding_suppressed INTEGER NOT NULL DEFAULT 0
  CHECK(onboarding_suppressed IN (0,1)), onboarding_completed_at_ms INTEGER
  CHECK(onboarding_completed_at_ms IS NULL OR onboarding_completed_at_ms >= 0), projects_root_confirmed_at_ms INTEGER
  CHECK(projects_root_confirmed_at_ms IS NULL OR (projects_root IS NOT NULL AND projects_root_confirmed_at_ms >= 0)), gh_executable_path TEXT
  CHECK(gh_executable_path IS NULL OR length(trim(gh_executable_path)) > 0), tool_preferences_json TEXT NOT NULL DEFAULT '{"format_version":1,"git":{"preferred_path":null,"last_validated_at_ms":null},"maestri":{"preferred_path":null,"last_validated_at_ms":null},"omp":{"preferred_path":null,"last_validated_at_ms":null},"powershell":{"preferred_path":null,"last_validated_at_ms":null}}'
  CHECK(json_valid(tool_preferences_json)),
  CHECK(automation_enabled = 0 OR (account_id IS NOT NULL AND designated_host IS NOT NULL))
) STRICT;

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
, result_account_id TEXT
  REFERENCES accounts(github_account_id) ON DELETE RESTRICT
  CHECK(
    (operation_kind = 'settings.account.bind' AND resource_type = 'settings' AND resource_id = 'local'
      AND account_id IS NULL AND result_account_id IS NOT NULL)
    OR (operation_kind = 'settings.account.switch' AND resource_type = 'settings' AND resource_id = 'local'
      AND account_id IS NOT NULL AND result_account_id IS NOT NULL AND account_id <> result_account_id)
    OR (operation_kind NOT IN ('settings.account.bind','settings.account.switch') AND result_account_id IS NULL)
  )) STRICT;

CREATE TABLE events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation_id TEXT NOT NULL REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  entity_revision INTEGER NOT NULL CHECK(entity_revision >= 1),
  facts_json TEXT NOT NULL CHECK(json_valid(facts_json) AND facts_json = '{}'),
  occurred_at_ms INTEGER NOT NULL CHECK(occurred_at_ms >= 0)
, project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT, attempt_id TEXT REFERENCES attempts(id) ON DELETE RESTRICT, context_round INTEGER CHECK (context_round IS NULL OR context_round BETWEEN 1 AND 6), context_role TEXT CHECK (context_role IS NULL OR context_role IN ('implementer','reviewer'))) STRICT;

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  current_revision_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
  FOREIGN KEY(current_revision_id, id, revision) REFERENCES project_revisions(id, project_id, revision_number)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE project_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL CHECK(revision_number >= 1),
  source_kind TEXT NOT NULL CHECK(source_kind IN ('local', 'github')),
  source_location TEXT NOT NULL,
  repository_id TEXT,
  repository_url TEXT,
  base_branch TEXT NOT NULL,
  github_project_id TEXT,
  github_project_owner_id TEXT,
  status_field_id TEXT,
  status_options_json TEXT NOT NULL CHECK(json_valid(status_options_json)),
  implementer_profile_id TEXT REFERENCES execution_profiles(id) ON DELETE RESTRICT,
  reviewer_profile_id TEXT REFERENCES execution_profiles(id) ON DELETE RESTRICT,
  correction_limit INTEGER NOT NULL DEFAULT 2 CHECK(correction_limit BETWEEN 0 AND 5),
  default_delivery_mode TEXT NOT NULL DEFAULT 'icr' CHECK(default_delivery_mode IN ('icr', 'commit', 'pr')),
  automation_enabled INTEGER NOT NULL DEFAULT 0 CHECK(automation_enabled IN (0, 1)),
  queue_order_json TEXT NOT NULL CHECK(json_valid(queue_order_json)),
  guidance TEXT NOT NULL,
  origin_notes_json TEXT NOT NULL CHECK(json_valid(origin_notes_json) AND json_type(origin_notes_json) = 'array'),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0), delivery_branch_json TEXT CHECK(delivery_branch_json IS NULL OR json_valid(delivery_branch_json)),
  UNIQUE(project_id, revision_number),
  UNIQUE(id, project_id),
  UNIQUE(id, project_id, revision_number),
  CHECK((repository_id IS NULL) = (repository_url IS NULL)),
  CHECK(coalesce((github_project_id IS NULL AND github_project_owner_id IS NULL AND status_field_id IS NULL AND status_options_json = '{}') OR
    (github_project_id IS NOT NULL AND github_project_owner_id IS NOT NULL AND status_field_id IS NOT NULL AND
     json_type(status_options_json, '$.ready') = 'text' AND json_type(status_options_json, '$.inProgress') = 'text' AND
     json_type(status_options_json, '$.inReview') = 'text' AND json_type(status_options_json, '$.delivered') = 'text'), 0))
) STRICT;

CREATE TABLE preparations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  account_id TEXT REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
  UNIQUE(id, project_id),
  FOREIGN KEY(id, revision) REFERENCES preparation_revisions(preparation_id, revision)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE preparation_revisions (
  preparation_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  project_id TEXT NOT NULL,
  project_revision_id TEXT NOT NULL,
  choices_json TEXT NOT NULL CHECK(json_valid(choices_json) AND json_type(choices_json) = 'object' AND
    coalesce(json_extract(choices_json, '$.formatVersion') = 1 AND json_type(choices_json, '$.choices') = 'object', 0)),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  PRIMARY KEY(preparation_id, revision),
  FOREIGN KEY(preparation_id, project_id) REFERENCES preparations(id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY(project_revision_id, project_id) REFERENCES project_revisions(id, project_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  project_revision_id TEXT NOT NULL,
  preparation_id TEXT NOT NULL,
  preparation_revision INTEGER NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  repository_id TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  capture_json TEXT NOT NULL CHECK(json_valid(capture_json) AND json_extract(capture_json,'$.formatVersion') = 1),
  phase TEXT NOT NULL CHECK(phase IN ('preparing','implementing','verifying','reviewing','publishing','finished')),
  result TEXT CHECK(result IS NULL OR result IN ('delivered','rejected','failed','cancelled','interrupted')),
  suspension TEXT,
  diagnostic TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL, source TEXT CHECK(source IN ('manual','automatic','retry')), issue_number INTEGER
  CHECK(issue_number IS NULL OR issue_number > 0), issue_title TEXT
  CHECK(issue_title IS NULL OR length(issue_title) <= 65536),
  CHECK((phase = 'finished') = (result IS NOT NULL)),
  UNIQUE(id, project_id),
  FOREIGN KEY(project_revision_id,project_id) REFERENCES project_revisions(id,project_id) ON DELETE RESTRICT,
  FOREIGN KEY(preparation_id,preparation_revision) REFERENCES preparation_revisions(preparation_id,revision) ON DELETE RESTRICT
) STRICT;

CREATE TABLE attempt_criteria (
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  criterion_id TEXT NOT NULL,
  occurrence_index INTEGER NOT NULL CHECK(occurrence_index >= 1),
  text TEXT NOT NULL,
  PRIMARY KEY(attempt_id,criterion_id), UNIQUE(attempt_id,occurrence_index)
) STRICT;

CREATE TABLE rounds (
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  round_number INTEGER NOT NULL CHECK(round_number BETWEEN 1 AND 6),
  delivery_version TEXT NOT NULL UNIQUE,
  created_at_ms INTEGER NOT NULL, integration_json TEXT CHECK(integration_json IS NULL OR (json_valid(integration_json) AND json_type(integration_json)='object')),
  PRIMARY KEY(attempt_id,round_number), UNIQUE(attempt_id,round_number,delivery_version)
) STRICT;

CREATE TABLE passages (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  delivery_version TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('implementer','reviewer')),
  role_resource_json TEXT NOT NULL CHECK(json_valid(role_resource_json)),
  request_hash TEXT CHECK(request_hash IS NULL OR length(request_hash) = 64),
  terminal_name TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('starting','ready','partial','interrupted','cancelled')),
  tracking_state TEXT NOT NULL CHECK(tracking_state IN ('pending','tracked','lost')),
  diagnostic TEXT,
  effective_profile_json TEXT CHECK(effective_profile_json IS NULL OR json_valid(effective_profile_json)),
  executor_version TEXT,
  created_at_ms INTEGER NOT NULL, session_source_id TEXT REFERENCES passages(id) ON DELETE RESTRICT, attempt_session_id TEXT REFERENCES attempt_sessions(id) ON DELETE RESTRICT,
  UNIQUE(id,attempt_id), UNIQUE(attempt_id,round_number,role),
  FOREIGN KEY(attempt_id,round_number,delivery_version) REFERENCES rounds(attempt_id,round_number,delivery_version) ON DELETE RESTRICT
) STRICT;

CREATE TABLE resources (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  passage_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('implementation','terminal')),
  reference TEXT NOT NULL,
  owned INTEGER NOT NULL CHECK(owned IN (0,1)),
  launch_state TEXT NOT NULL CHECK(launch_state IN ('planned','starting','ready','partial','failed')),
  stop_state TEXT NOT NULL DEFAULT 'not_requested' CHECK(stop_state IN ('not_requested','requested','confirmed','uncertain')),
  diagnostic TEXT,
  created_at_ms INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1), removed INTEGER NOT NULL DEFAULT 0 CHECK(removed IN (0,1)),
  UNIQUE(attempt_id,kind,reference),
  FOREIGN KEY(passage_id,attempt_id) REFERENCES passages(id,attempt_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE passage_results (
  passage_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  result_hash TEXT NOT NULL CHECK(length(result_hash) = 64),
  receipt_id TEXT NOT NULL UNIQUE,
  summary_json TEXT NOT NULL CHECK(json_valid(summary_json)),
  accepted_at_ms INTEGER NOT NULL,
  FOREIGN KEY(passage_id,attempt_id) REFERENCES passages(id,attempt_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE criterion_results (
  passage_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  criterion_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK(verdict IN ('passed','failed','not_verified')),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json) AND json_array_length(evidence_json) >= 1),
  PRIMARY KEY(passage_id,criterion_id),
  FOREIGN KEY(passage_id,attempt_id) REFERENCES passages(id,attempt_id) ON DELETE RESTRICT,
  FOREIGN KEY(passage_id) REFERENCES passage_results(passage_id) ON DELETE RESTRICT,
  FOREIGN KEY(attempt_id,criterion_id) REFERENCES attempt_criteria(attempt_id,criterion_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE passage_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  passage_id TEXT NOT NULL REFERENCES passages(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  code TEXT,
  created_at_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  producer_passage_id TEXT NOT NULL UNIQUE,
  base_sha TEXT NOT NULL CHECK(length(base_sha) IN (40,64)),
  repository_relative TEXT NOT NULL,
  capture_state TEXT NOT NULL CHECK(capture_state IN ('pending','running','captured','failed')),
  git_ref TEXT UNIQUE,
  content_identity TEXT CHECK(content_identity IS NULL OR length(content_identity) IN (40,64)),
  commit_sha TEXT CHECK(commit_sha IS NULL OR length(commit_sha) IN (40,64)),
  has_delta INTEGER CHECK(has_delta IS NULL OR has_delta IN (0,1)),
  diagnostic TEXT,
  captured_at_ms INTEGER,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  claim_id TEXT,
  claim_attempt_revision INTEGER,
  CHECK((capture_state='captured') = (git_ref IS NOT NULL AND content_identity IS NOT NULL AND commit_sha IS NOT NULL AND has_delta IS NOT NULL AND captured_at_ms IS NOT NULL)),
  CHECK(repository_relative = 'git/' || attempt_id || '.git'),
  CHECK(git_ref IS NULL OR git_ref = 'refs/factory/deliveries/' || id),
  UNIQUE(id,attempt_id,producer_passage_id),
  FOREIGN KEY(producer_passage_id,attempt_id) REFERENCES passages(id,attempt_id) ON DELETE RESTRICT,
  FOREIGN KEY(attempt_id,round_number,id) REFERENCES rounds(attempt_id,round_number,delivery_version) ON DELETE RESTRICT
) STRICT;

CREATE TABLE capture_runs (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE RESTRICT,
  operation_id TEXT UNIQUE REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK(state IN ('running','captured','failed')),
  diagnostic TEXT,
  started_at_ms INTEGER NOT NULL,
  ended_at_ms INTEGER
) STRICT;

CREATE TABLE capture_warnings (
  delivery_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  passage_id TEXT NOT NULL,
  path TEXT NOT NULL CHECK(length(path) BETWEEN 1 AND 4096),
  reason TEXT NOT NULL CHECK(reason IN ('DECLARED_NEW_FILE_IGNORED','KNOWN_SECRET_EXCLUDED')),
  PRIMARY KEY(delivery_id,path),
  FOREIGN KEY(delivery_id,attempt_id,passage_id) REFERENCES deliveries(id,attempt_id,producer_passage_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE findings (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  finding_key TEXT NOT NULL,
  criterion_ids_json TEXT NOT NULL CHECK(json_valid(criterion_ids_json) AND json_type(criterion_ids_json)='array'),
  category TEXT NOT NULL CHECK(length(trim(category))>0),
  problem TEXT NOT NULL CHECK(length(trim(problem))>0),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json) AND json_array_length(evidence_json)>0),
  expected_result TEXT NOT NULL CHECK(length(trim(expected_result))>0),
  blocking INTEGER NOT NULL CHECK(blocking IN (0,1)), priority TEXT CHECK(priority IN ('critical','high','medium','low')), origin_finding_id TEXT,
  UNIQUE(review_id,finding_key), UNIQUE(id,attempt_id),
  FOREIGN KEY(review_id,attempt_id) REFERENCES reviews(id,attempt_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE finding_resolutions (
  finding_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK(verdict IN ('resolved','unresolved')),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json) AND json_array_length(evidence_json)>0),
  PRIMARY KEY(finding_id,review_id),
  FOREIGN KEY(finding_id,attempt_id) REFERENCES findings(id,attempt_id) ON DELETE RESTRICT,
  FOREIGN KEY(review_id,attempt_id) REFERENCES reviews(id,attempt_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE "execution_questions" (
  id TEXT PRIMARY KEY,
  passage_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  question_hash TEXT NOT NULL CHECK(length(question_hash)=64),
  question_json TEXT NOT NULL CHECK(json_valid(question_json)),
  answer_operation_id TEXT UNIQUE,
  answer TEXT,
  state TEXT NOT NULL CHECK(state IN ('pending','recorded','sending','delivered','delivery_unknown','expired','cancelled')),
  created_at_ms INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  answer_hash TEXT CHECK(answer_hash IS NULL OR length(answer_hash)=64),
  answered_at_ms INTEGER,
  ttl_ms INTEGER CHECK(ttl_ms IS NULL OR ttl_ms>=0),
  expired_at_ms INTEGER,
  receipt_json TEXT CHECK(receipt_json IS NULL OR json_valid(receipt_json)),
  scope_json TEXT CHECK(scope_json IS NULL OR json_valid(scope_json)),
  FOREIGN KEY(passage_id,attempt_id) REFERENCES passages(id,attempt_id) ON DELETE RESTRICT,
  UNIQUE(passage_id,question_hash)
) STRICT;

CREATE TABLE passage_measurements (
  passage_id TEXT PRIMARY KEY REFERENCES passages(id) ON DELETE RESTRICT,
  active_ms INTEGER NOT NULL DEFAULT 0 CHECK(active_ms>=0),
  wait_ms INTEGER NOT NULL DEFAULT 0 CHECK(wait_ms>=0),
  checkpoint_ms INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('active','human','stopped')),
  expired_at_ms INTEGER,
  observed INTEGER NOT NULL CHECK(observed IN (0,1))
) STRICT;

CREATE TABLE cancellation_requests (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  created_at_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE resource_removals (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
  plan_hash TEXT NOT NULL CHECK(length(plan_hash)=64),
  state TEXT NOT NULL CHECK(state IN ('accepted','removed','failed','unknown')),
  diagnostic TEXT,
  created_at_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE native_open_requests (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK(kind IN ('folder.open','interaction.open')),
  state TEXT NOT NULL CHECK(state IN ('accepted','requested','unknown')),
  created_at_ms INTEGER NOT NULL
) STRICT;

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

CREATE TABLE queue_cycles (
  account_id TEXT NOT NULL REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  issue_id TEXT NOT NULL CHECK(length(issue_id) > 0),
  cycle_number INTEGER NOT NULL DEFAULT 1 CHECK(cycle_number >= 1),
  last_ready INTEGER NOT NULL CHECK(last_ready IN (0,1)),
  consumed_attempt_id TEXT REFERENCES attempts(id) ON DELETE RESTRICT,
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= 0), ready_exit_observed_at_ms INTEGER CHECK(ready_exit_observed_at_ms IS NULL OR ready_exit_observed_at_ms>=0), ready_return_observed_at_ms INTEGER CHECK(ready_return_observed_at_ms IS NULL OR ready_return_observed_at_ms>=0), last_eligible INTEGER CHECK(last_eligible IS NULL OR last_eligible IN (0,1)), observed_ordinal INTEGER CHECK(observed_ordinal IS NULL OR observed_ordinal>=0),
  PRIMARY KEY(account_id, project_id, issue_id)
) STRICT;

CREATE TABLE creation_steps (
  creation_id TEXT NOT NULL REFERENCES project_creations(id) ON DELETE RESTRICT,
  step TEXT NOT NULL CHECK(step IN ('directory','files','git','baseline','registration')),
  state TEXT NOT NULL CHECK(state IN ('running','confirmed','unknown')),
  PRIMARY KEY(creation_id,step)
) STRICT;

CREATE TABLE "publication_requests" (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  delivery_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('publication.complete','publication.reconcile','publication.authorize-upgrade','attempt.revalidate')),
  authorized_mode TEXT CHECK(authorized_mode IS NULL OR authorized_mode IN ('icr','commit','pr')),
  state TEXT NOT NULL CHECK(state IN ('accepted','running','succeeded','failed','unknown')),
  diagnostic TEXT,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(delivery_id,attempt_id) REFERENCES deliveries(id,attempt_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE publication_upgrades (
  operation_id TEXT PRIMARY KEY REFERENCES publication_requests(operation_id) ON DELETE RESTRICT,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  delivery_id TEXT NOT NULL,
  current_mode TEXT NOT NULL CHECK(current_mode IN ('icr','commit')),
  target_mode TEXT NOT NULL CHECK(target_mode IN ('commit','pr')),
  summary_hash TEXT NOT NULL CHECK(length(summary_hash)=64),
  created_at_ms INTEGER NOT NULL,
  CHECK((current_mode='icr' AND target_mode IN ('commit','pr')) OR (current_mode='commit' AND target_mode='pr')),
  UNIQUE(attempt_id,target_mode),
  FOREIGN KEY(delivery_id,attempt_id) REFERENCES deliveries(id,attempt_id) ON DELETE RESTRICT,
  FOREIGN KEY(operation_id,attempt_id,delivery_id,target_mode) REFERENCES publication_requests(operation_id,attempt_id,delivery_id,authorized_mode) ON DELETE RESTRICT
) STRICT;

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

CREATE TABLE "effects" (
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

CREATE TABLE creation_reconciliations (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  creation_id TEXT NOT NULL REFERENCES project_creations(id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK(state IN ('accepted','succeeded','unknown')),
  diagnostic TEXT
) STRICT;

CREATE TABLE execution_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL CHECK(length(trim(name)) > 0),
      profile_type TEXT NOT NULL CHECK(profile_type IN ('implementer', 'reviewer')),
      name_key TEXT NOT NULL CHECK(length(trim(name_key)) > 0),
      executor TEXT NOT NULL CHECK(executor = 'maestri-omp'),
      provider TEXT NOT NULL CHECK(length(trim(provider)) > 0),
      model TEXT NOT NULL CHECK(length(trim(model)) > 0),
      effort TEXT CHECK(effort IS NULL OR length(trim(effort)) > 0),
      guidance TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
      created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
      updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
      deleted_at_ms INTEGER CHECK(deleted_at_ms IS NULL OR deleted_at_ms >= created_at_ms)
    , composition_version INTEGER CHECK(composition_version IS NULL OR composition_version = 1)) STRICT;

CREATE TABLE "diagnostic_runs" (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  installation_id TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  scope TEXT NOT NULL CHECK(scope IN ('host','project','creation','attempt')),
  context_id TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
  creation_id TEXT REFERENCES project_creations(id) ON DELETE RESTRICT,
  attempt_id TEXT REFERENCES attempts(id) ON DELETE RESTRICT,
  context_stamp TEXT NOT NULL CHECK(length(context_stamp)=64),
  checks_json TEXT NOT NULL CHECK(json_valid(checks_json) AND json_type(checks_json)='array' AND json_array_length(checks_json) BETWEEN 1 AND 4),
  state TEXT NOT NULL CHECK(state IN ('accepted','succeeded','failed','unknown')),
  diagnostics_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(diagnostics_json) AND json_type(diagnostics_json)='array' AND json_array_length(diagnostics_json)<=104),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  completed_at_ms INTEGER CHECK(completed_at_ms IS NULL OR completed_at_ms>=created_at_ms),
  CHECK((state='accepted')=(completed_at_ms IS NULL)),
  CHECK((scope='host' AND context_id='local' AND project_id IS NULL AND creation_id IS NULL AND attempt_id IS NULL)
    OR (scope='project' AND context_id=project_id AND creation_id IS NULL AND attempt_id IS NULL)
    OR (scope='creation' AND context_id=creation_id AND attempt_id IS NULL)
    OR (scope='attempt' AND context_id=attempt_id AND project_id IS NOT NULL AND creation_id IS NULL))
) STRICT;

CREATE TABLE project_deletions (
  operation_id TEXT NOT NULL PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE RESTRICT,
  expected_revision INTEGER NOT NULL CHECK(expected_revision >= 1),
  authorization_digest TEXT NOT NULL CHECK(length(authorization_digest) = 64),
  state TEXT NOT NULL CHECK(state IN ('accepted','running','pending','reconfirmation_required','finalizing')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
  reason_code TEXT,
  reason TEXT,
  recovery TEXT,
  worker_token TEXT,
  worker_generation INTEGER NOT NULL DEFAULT 0 CHECK(worker_generation >= 0),
  CHECK(state NOT IN ('pending','reconfirmation_required') OR (reason IS NOT NULL AND recovery IS NOT NULL))
) STRICT;

CREATE TABLE project_deletion_receipts (
  operation_id TEXT NOT NULL PRIMARY KEY,
  request_fingerprint TEXT NOT NULL CHECK(length(request_fingerprint) = 64),
  result TEXT NOT NULL CHECK(result = 'succeeded')
) STRICT;

CREATE TABLE project_storage_locations (
  id TEXT PRIMARY KEY CHECK(length(id)=36),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  location_key TEXT NOT NULL CHECK(length(location_key) BETWEEN 1 AND 256 AND length(trim(location_key))>0 AND
    location_key GLOB '[a-z]*' AND location_key NOT GLOB '*[^a-z0-9._-]*'),
  layout_version INTEGER NOT NULL CHECK(layout_version>=1),
  root_relative TEXT NOT NULL CHECK(length(root_relative) BETWEEN 1 AND 32768 AND
    substr(root_relative,1,1)<>'/' AND instr(root_relative,char(92))=0 AND instr(root_relative,':')=0 AND
    instr(root_relative,char(0))=0 AND root_relative NOT GLOB '*[' || char(1) || '-' || char(31) || char(127) || ']*' AND
    root_relative NOT LIKE '../%' AND root_relative NOT LIKE '%/../%' AND root_relative NOT LIKE '%/..' AND
    root_relative<>'..' AND root_relative NOT LIKE './%' AND root_relative NOT LIKE '%/./%' AND root_relative NOT LIKE '%/.' AND
    root_relative NOT LIKE '%//%'),
  object_identity_json TEXT NOT NULL CHECK(json_valid(object_identity_json) AND json_type(object_identity_json)='object' AND
    json_extract(object_identity_json,'$.format_version')=1 AND
    json_type(object_identity_json,'$.volume_id')='text' AND length(json_extract(object_identity_json,'$.volume_id')) BETWEEN 1 AND 128 AND
    json_type(object_identity_json,'$.object_id')='text' AND length(json_extract(object_identity_json,'$.object_id')) BETWEEN 1 AND 128 AND
    json_type(object_identity_json,'$.ancestors')='array' AND json_array_length(object_identity_json,'$.ancestors') BETWEEN 1 AND 64),
  is_current INTEGER NOT NULL CHECK(is_current IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  verified_at_ms INTEGER NOT NULL CHECK(verified_at_ms>=created_at_ms),
  CHECK(root_relative='var/factory/projects/'||project_id||'/v'||layout_version||'/'||location_key),
  UNIQUE(id,project_id)
) STRICT;

CREATE TABLE project_storage_transitions (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  location_key TEXT NOT NULL CHECK(length(location_key) BETWEEN 1 AND 256),
  source_location_id TEXT NOT NULL,
  source_relative TEXT NOT NULL CHECK(length(source_relative) BETWEEN 1 AND 32768),
  destination_relative TEXT NOT NULL CHECK(length(destination_relative) BETWEEN 1 AND 32768 AND destination_relative<>source_relative),
  source_identity_json TEXT NOT NULL CHECK(json_valid(source_identity_json) AND json_type(source_identity_json)='object'),
  destination_identity_json TEXT CHECK(destination_identity_json IS NULL OR (json_valid(destination_identity_json) AND json_type(destination_identity_json)='object')),
  plan_hash TEXT NOT NULL CHECK(length(plan_hash)=64 AND plan_hash NOT GLOB '*[^a-f0-9]*'),
  step TEXT NOT NULL CHECK(step IN ('planned','quiescence_checked','moving','verifying','publishing_location')),
  state TEXT NOT NULL CHECK(state IN ('planned','running','verified','uncertain','blocked')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  generation INTEGER NOT NULL CHECK(generation>=1),
  reason TEXT CHECK(reason IS NULL OR length(reason)<=2048),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms>=created_at_ms),
  FOREIGN KEY(source_location_id,project_id) REFERENCES project_storage_locations(id,project_id) ON DELETE RESTRICT,
  CHECK(state<>'verified' OR (destination_identity_json IS NOT NULL AND step='publishing_location'))
) STRICT;

CREATE TABLE creation_board_operations (
  operation_id TEXT PRIMARY KEY REFERENCES operation_requests(operation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  creation_id TEXT NOT NULL REFERENCES project_creations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  kind TEXT NOT NULL CHECK(kind IN ('create_board','configure_status','link_repository','configure_view','verify_board')),
  scope_key TEXT NOT NULL CHECK(length(scope_key) BETWEEN 1 AND 512),
  state TEXT NOT NULL CHECK(state IN ('not_started','running','confirmed','failed_known','unknown')),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64 AND request_hash NOT GLOB '*[^0-9a-f]*'),
  authorization_json TEXT NOT NULL CHECK(json_valid(authorization_json) AND json_type(authorization_json)='object' AND json_extract(authorization_json,'$.formatVersion')=1),
  expected_identity_json TEXT NOT NULL CHECK(json_valid(expected_identity_json) AND json_type(expected_identity_json)='object' AND json_extract(expected_identity_json,'$.formatVersion')=1),
  receipt_json TEXT CHECK(receipt_json IS NULL OR (json_valid(receipt_json) AND json_type(receipt_json)='object' AND json_extract(receipt_json,'$.formatVersion')=1)),
  reason TEXT CHECK(reason IS NULL OR length(reason)<=2048),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  sent_at_ms INTEGER CHECK(sent_at_ms IS NULL OR sent_at_ms>=created_at_ms),
  confirmed_at_ms INTEGER CHECK(confirmed_at_ms IS NULL OR confirmed_at_ms>=created_at_ms),
  CHECK((state='confirmed')=(receipt_json IS NOT NULL)),
  CHECK((state='confirmed')=(confirmed_at_ms IS NOT NULL)),
  UNIQUE(creation_id,kind,scope_key)
) STRICT;

CREATE TABLE managed_terminals (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  host_name TEXT NOT NULL CHECK(length(trim(host_name)) > 0),
  role TEXT NOT NULL CHECK(role IN ('implementer','reviewer')),
  owner TEXT NOT NULL CHECK(owner = 'factory'),
  generation INTEGER NOT NULL CHECK(generation >= 1),
  terminal_name TEXT NOT NULL UNIQUE CHECK(terminal_name GLOB 'factory-*'),
  workspace_id TEXT,
  terminal_id TEXT,
  state TEXT NOT NULL CHECK(state IN ('planned','occupied','available','uncertain','retired')),
  observed_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
  CHECK((workspace_id IS NULL) = (terminal_id IS NULL)),
  CHECK(state NOT IN ('occupied','available') OR terminal_id IS NOT NULL),
  UNIQUE(id,generation),
  UNIQUE(id,installation_id,host_name,role,generation)
) STRICT;

CREATE TABLE attempt_sessions (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK(role IN ('implementer','reviewer')),
  managed_terminal_id TEXT NOT NULL REFERENCES managed_terminals(id) ON DELETE RESTRICT,
  session_directory_relative TEXT NOT NULL CHECK(length(trim(session_directory_relative)) > 0),
  omp_session_id TEXT,
  terminal_generation INTEGER NOT NULL CHECK(terminal_generation >= 1),
  state TEXT NOT NULL CHECK(state IN ('reserved','active','completed','uncertain','interrupted')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
  UNIQUE(attempt_id,role),
  UNIQUE(id,attempt_id),
  UNIQUE(id,attempt_id,role)
) STRICT;

CREATE TABLE terminal_occupancies (
  id TEXT PRIMARY KEY,
  managed_terminal_id TEXT NOT NULL REFERENCES managed_terminals(id) ON DELETE RESTRICT,
  attempt_session_id TEXT NOT NULL REFERENCES attempt_sessions(id) ON DELETE RESTRICT,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  passage_id TEXT NOT NULL REFERENCES passages(id) ON DELETE RESTRICT,
  generation INTEGER NOT NULL CHECK(generation >= 1),
  state TEXT NOT NULL CHECK(state IN ('occupied','released','uncertain')),
  claimed_at_ms INTEGER NOT NULL,
  released_at_ms INTEGER,
  reason TEXT,
  CHECK((state='released') = (released_at_ms IS NOT NULL)),
  UNIQUE(passage_id,generation),
  FOREIGN KEY(attempt_session_id,attempt_id) REFERENCES attempt_sessions(id,attempt_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE finding_assessments (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  progress TEXT NOT NULL CHECK(progress IN ('proven','partial','none','not_assessable')),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json) AND json_type(evidence_json)='array' AND json_array_length(evidence_json)<=20),
  justification TEXT NOT NULL CHECK(length(trim(justification)) BETWEEN 1 AND 8192),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  UNIQUE(finding_id,review_id),
  FOREIGN KEY(finding_id,attempt_id) REFERENCES findings(id,attempt_id) ON DELETE RESTRICT,
  FOREIGN KEY(review_id,attempt_id) REFERENCES reviews(id,attempt_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE attempt_blocks (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE RESTRICT,
  block_json TEXT NOT NULL CHECK(json_valid(block_json) AND json_type(block_json)='object'),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0)
) STRICT;

CREATE TABLE finding_disputes (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  finding_id TEXT NOT NULL,
  passage_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  content_identity TEXT NOT NULL,
  justification TEXT NOT NULL CHECK(length(trim(justification)) BETWEEN 1 AND 8192),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json) AND json_type(evidence_json)='array' AND json_array_length(evidence_json) BETWEEN 1 AND 20),
  response_review_id TEXT,
  response_verdict TEXT CHECK(response_verdict IN ('maintained','resolved')),
  response_justification TEXT,
  response_evidence_json TEXT,
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  responded_at_ms INTEGER,
  UNIQUE(finding_id,passage_id,delivery_id),
  FOREIGN KEY(finding_id,attempt_id) REFERENCES findings(id,attempt_id) ON DELETE RESTRICT,
  FOREIGN KEY(passage_id,attempt_id) REFERENCES passages(id,attempt_id) ON DELETE RESTRICT,
  FOREIGN KEY(delivery_id,attempt_id,content_identity) REFERENCES deliveries(id,attempt_id,content_identity) ON DELETE RESTRICT,
  FOREIGN KEY(response_review_id,attempt_id) REFERENCES reviews(id,attempt_id) ON DELETE RESTRICT,
  CHECK ((response_review_id IS NULL AND response_verdict IS NULL AND response_justification IS NULL AND response_evidence_json IS NULL AND responded_at_ms IS NULL)
    OR (response_review_id IS NOT NULL AND response_verdict IS NOT NULL AND response_justification IS NOT NULL
      AND length(trim(response_justification)) BETWEEN 1 AND 8192 AND response_evidence_json IS NOT NULL
      AND json_valid(response_evidence_json) AND json_type(response_evidence_json)='array' AND json_array_length(response_evidence_json) BETWEEN 1 AND 20
      AND responded_at_ms IS NOT NULL AND responded_at_ms>=created_at_ms))
) STRICT;

CREATE TABLE attempt_decisions (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE RESTRICT,
  block_id TEXT NOT NULL,
  block_revision INTEGER NOT NULL CHECK(block_revision>=1),
  block_reason TEXT NOT NULL CHECK(block_reason IN ('no_progress','dispute_maintained','correction_limit')),
  action TEXT NOT NULL CHECK(action IN ('guidance','change_profile','end')),
  authorization_json TEXT NOT NULL CHECK(json_valid(authorization_json) AND json_type(authorization_json)='object'),
  guidance_json TEXT CHECK(guidance_json IS NULL OR (json_valid(guidance_json) AND json_type(guidance_json)='object'
    AND json_extract(guidance_json,'$.formatVersion')=1 AND length(trim(json_extract(guidance_json,'$.text'))) BETWEEN 1 AND 8192)),
  successor_preparation_id TEXT,
  successor_preparation_revision INTEGER,
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  FOREIGN KEY(successor_preparation_id,successor_preparation_revision)
    REFERENCES preparation_revisions(preparation_id,revision) ON DELETE RESTRICT,
  CHECK ((action='guidance' AND guidance_json IS NOT NULL AND successor_preparation_id IS NULL AND successor_preparation_revision IS NULL)
    OR (action='change_profile' AND guidance_json IS NULL AND successor_preparation_id IS NOT NULL AND successor_preparation_revision IS NOT NULL)
    OR (action='end' AND guidance_json IS NULL AND successor_preparation_id IS NULL AND successor_preparation_revision IS NULL))
) STRICT;

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

CREATE TABLE attempt_stage_intervals (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  round_number INTEGER,
  delivery_version TEXT,
  stage TEXT NOT NULL CHECK(stage IN ('preparing','implementing','verifying','reviewing','publishing','waiting_decision','tracking_lost')),
  source_event_seq INTEGER NOT NULL UNIQUE REFERENCES events(seq) ON DELETE RESTRICT,
  started_at_ms INTEGER NOT NULL CHECK(started_at_ms>=0),
  ended_at_ms INTEGER CHECK(ended_at_ms>=started_at_ms),
  last_activity_at_ms INTEGER CHECK(last_activity_at_ms>=started_at_ms AND (ended_at_ms IS NULL OR last_activity_at_ms<=ended_at_ms)),
  deadline_at_ms INTEGER CHECK(deadline_at_ms>=started_at_ms),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  CHECK((round_number IS NULL)=(delivery_version IS NULL)),
  FOREIGN KEY(attempt_id,round_number,delivery_version) REFERENCES rounds(attempt_id,round_number,delivery_version) ON DELETE RESTRICT
) STRICT;

CREATE TABLE notification_dispatches (
  installation_id TEXT NOT NULL,
  consumer_id TEXT NOT NULL CHECK(length(consumer_id)=36 AND substr(consumer_id,9,1)='-' AND substr(consumer_id,14,1)='-'
    AND substr(consumer_id,19,1)='-' AND substr(consumer_id,24,1)='-' AND substr(consumer_id,15,1) IN ('1','2','3','4','5','6','7','8')
    AND substr(consumer_id,20,1) IN ('8','9','a','b') AND length(replace(consumer_id,'-',''))=32 AND replace(consumer_id,'-','') NOT GLOB '*[^0-9a-f]*'),
  surface TEXT NOT NULL CHECK(surface='browser_host'),
  event_seq INTEGER NOT NULL REFERENCES events(seq) ON DELETE RESTRICT,
  dispatch_id TEXT NOT NULL UNIQUE CHECK(length(dispatch_id)=36 AND substr(dispatch_id,9,1)='-' AND substr(dispatch_id,14,1)='-'
    AND substr(dispatch_id,19,1)='-' AND substr(dispatch_id,24,1)='-' AND substr(dispatch_id,15,1) IN ('1','2','3','4','5','6','7','8')
    AND substr(dispatch_id,20,1) IN ('8','9','a','b') AND length(replace(dispatch_id,'-',''))=32 AND replace(dispatch_id,'-','') NOT GLOB '*[^0-9a-f]*'),
  state TEXT NOT NULL CHECK(state IN ('reserved','confirmed','uncertain','unavailable')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms>=created_at_ms),
  dispatched_at_ms INTEGER CHECK(dispatched_at_ms>=created_at_ms),
  reason TEXT CHECK(reason IN ('SURFACE_CONFIRMED','SURFACE_UNCERTAIN','SURFACE_UNAVAILABLE','DISPATCH_INTERRUPTED')),
  CHECK((state='confirmed')=(dispatched_at_ms IS NOT NULL)),
  CHECK((state='reserved' AND reason IS NULL) OR (state='confirmed' AND reason='SURFACE_CONFIRMED')
    OR (state='uncertain' AND reason IN ('SURFACE_UNCERTAIN','DISPATCH_INTERRUPTED')) OR (state='unavailable' AND reason='SURFACE_UNAVAILABLE')),
  PRIMARY KEY(installation_id,consumer_id,surface,event_seq)
) STRICT;

CREATE TABLE "project_creations" (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE REFERENCES operation_requests(operation_id) ON DELETE RESTRICT,
  installation_id TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(github_account_id) ON DELETE RESTRICT,
  project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
  plan_hash TEXT NOT NULL CHECK(length(plan_hash)=64),
  plan_json TEXT NOT NULL CHECK(json_valid(plan_json)),
  destination TEXT NOT NULL COLLATE NOCASE,
  state TEXT NOT NULL CHECK(state IN ('pending','running','completed','partial','failed')),
  baseline_sha TEXT,
  baseline_ref TEXT,
  diagnostic TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  CHECK((baseline_sha IS NULL)=(baseline_ref IS NULL)),
  CHECK(state<>'completed' OR (project_id IS NOT NULL AND baseline_sha IS NOT NULL AND diagnostic IS NULL))
) STRICT;

CREATE TABLE "reviews" (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL UNIQUE,
  attempt_id TEXT NOT NULL,
  passage_id TEXT NOT NULL UNIQUE,
  implementer_passage_id TEXT NOT NULL REFERENCES passage_results(passage_id) ON DELETE RESTRICT,
  content_identity TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','approved','rejected')),
  reason TEXT,
  independence_state TEXT NOT NULL CHECK(independence_state IN ('pending','valid','invalid')),
  diagnostic TEXT,
  workspace_state TEXT NOT NULL CHECK(workspace_state IN ('planned','ready','partial')),
  created_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER,
  UNIQUE(id,attempt_id),
  FOREIGN KEY(passage_id,attempt_id,delivery_id) REFERENCES passages(id,attempt_id,delivery_version) ON DELETE RESTRICT,
  FOREIGN KEY(delivery_id,attempt_id,implementer_passage_id) REFERENCES deliveries(id,attempt_id,producer_passage_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE "project_deletion_targets" (
  operation_id TEXT NOT NULL REFERENCES project_deletions(operation_id) ON DELETE RESTRICT,
  target_key TEXT NOT NULL,
  target_kind TEXT NOT NULL CHECK(target_kind IN ('original_directory','exclusive_workspace')),
  authorized_path TEXT NOT NULL,
  normalized_path TEXT NOT NULL,
  resolved_path TEXT,
  object_kind TEXT NOT NULL CHECK(object_kind IN ('directory','file','symlink','junction','absent')),
  identity_json TEXT NOT NULL CHECK(json_valid(identity_json)),
  owner_kind TEXT NOT NULL CHECK(owner_kind IN ('project','attempt','delivery','creation')),
  owner_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','removing','removed','blocked')),
  verified_at_ms INTEGER CHECK(verified_at_ms IS NULL OR verified_at_ms >= 0),
  reason_code TEXT,
  PRIMARY KEY(operation_id,target_key),
  UNIQUE(operation_id,normalized_path),
  CHECK(resolved_path IS NOT NULL OR object_kind = 'absent')
) STRICT;

CREATE INDEX operation_requests_scope ON operation_requests(installation_id, account_id, resource_type, resource_id);

CREATE INDEX events_entity_seq ON events(entity_type, entity_id, seq);

CREATE UNIQUE INDEX events_operation_revision ON events(operation_id, entity_revision);

CREATE TRIGGER event_update_immutable BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;

CREATE INDEX projects_catalog ON projects(account_id, name COLLATE NOCASE, id);

CREATE INDEX project_revisions_project ON project_revisions(project_id, revision_number);

CREATE TRIGGER project_revision_update_immutable BEFORE UPDATE ON project_revisions
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;

CREATE TRIGGER project_pointer_revision BEFORE UPDATE OF current_revision_id, revision ON projects
WHEN NOT EXISTS (SELECT 1 FROM project_revisions r WHERE r.id = NEW.current_revision_id AND r.project_id = NEW.id AND r.revision_number = NEW.revision)
BEGIN SELECT RAISE(ABORT, 'PROJECT_REVISION_MISMATCH'); END;

CREATE INDEX events_project_seq ON events(project_id, seq);

CREATE INDEX preparations_project ON preparations(project_id, updated_at_ms, id);

CREATE TRIGGER preparation_identity_immutable BEFORE UPDATE OF id, project_id, account_id, created_at_ms ON preparations
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;

CREATE TRIGGER preparation_revision_update_immutable BEFORE UPDATE ON preparation_revisions
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;

CREATE TRIGGER preparation_pointer_revision BEFORE UPDATE OF revision ON preparations
WHEN NEW.revision <> OLD.revision + 1 OR NOT EXISTS (
  SELECT 1 FROM preparation_revisions r WHERE r.preparation_id = NEW.id AND r.revision = NEW.revision AND r.project_id = NEW.project_id
)
BEGIN SELECT RAISE(ABORT, 'PREPARATION_REVISION_MISMATCH'); END;

CREATE UNIQUE INDEX attempts_active_issue ON attempts(account_id,repository_id,issue_id) WHERE result IS NULL;

CREATE INDEX attempts_project_created ON attempts(project_id,created_at_ms,id);

CREATE INDEX passage_events_page ON passage_events(passage_id,seq);

CREATE INDEX events_attempt_seq ON events(attempt_id,seq);

CREATE TRIGGER attempt_capture_immutable BEFORE UPDATE OF id,operation_id,project_id,project_revision_id,preparation_id,preparation_revision,account_id,repository_id,issue_id,capture_json,created_at_ms ON attempts
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER attempt_preparation_binding BEFORE INSERT ON attempts WHEN NOT EXISTS (
  SELECT 1 FROM preparation_revisions r WHERE r.preparation_id=NEW.preparation_id AND r.revision=NEW.preparation_revision AND r.project_id=NEW.project_id AND r.project_revision_id=NEW.project_revision_id
) BEGIN SELECT RAISE(ABORT,'ATTEMPT_PREPARATION_MISMATCH'); END;

CREATE TRIGGER passage_identity_immutable BEFORE UPDATE OF id,attempt_id,round_number,delivery_version,role,role_resource_json,terminal_name,created_at_ms ON passages
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER passage_request_immutable BEFORE UPDATE OF request_hash ON passages WHEN OLD.request_hash IS NOT NULL
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER passage_observation_immutable BEFORE UPDATE OF effective_profile_json,executor_version ON passages WHEN OLD.effective_profile_json IS NOT NULL
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER resource_identity_immutable BEFORE UPDATE OF id,attempt_id,passage_id,kind,reference,created_at_ms ON resources
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER attempt_criteria_update_immutable BEFORE UPDATE ON attempt_criteria
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER attempt_criteria_insert_sealed BEFORE INSERT ON attempt_criteria WHEN EXISTS (
  SELECT 1 FROM rounds WHERE attempt_id=NEW.attempt_id
) BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER rounds_update_immutable BEFORE UPDATE ON rounds
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER passage_results_update_immutable BEFORE UPDATE ON passage_results
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER criterion_results_update_immutable BEFORE UPDATE ON criterion_results
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER passage_events_update_immutable BEFORE UPDATE ON passage_events
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE INDEX deliveries_attempt_round ON deliveries(attempt_id,round_number);

CREATE TRIGGER capture_run_history BEFORE UPDATE ON capture_runs WHEN OLD.state<>'running'
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER capture_run_identity BEFORE UPDATE OF id,delivery_id,operation_id,started_at_ms ON capture_runs
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER delivery_identity_immutable BEFORE UPDATE OF id,attempt_id,round_number,producer_passage_id,base_sha,repository_relative ON deliveries
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER delivery_content_immutable BEFORE UPDATE OF capture_state,git_ref,content_identity,commit_sha,has_delta,captured_at_ms ON deliveries WHEN OLD.capture_state='captured'
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER delivery_producer_binding BEFORE INSERT ON deliveries WHEN NOT EXISTS (
  SELECT 1 FROM passages p JOIN passage_results r ON r.passage_id=p.id
  WHERE p.id=NEW.producer_passage_id AND p.attempt_id=NEW.attempt_id AND p.round_number=NEW.round_number AND p.delivery_version=NEW.id AND p.role='implementer'
) BEGIN SELECT RAISE(ABORT,'DELIVERY_PRODUCER_INVALID'); END;

CREATE TRIGGER capture_warning_update_immutable BEFORE UPDATE ON capture_warnings
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER captured_warning_sealed BEFORE INSERT ON capture_warnings WHEN EXISTS (
  SELECT 1 FROM deliveries d WHERE d.id=NEW.delivery_id AND d.capture_state='captured'
) BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE UNIQUE INDEX delivery_attempt_version ON deliveries(id,attempt_id,content_identity);

CREATE TRIGGER passage_source_immutable BEFORE UPDATE OF session_source_id ON passages
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE UNIQUE INDEX passages_review_binding ON passages(id,attempt_id,delivery_version);

CREATE INDEX findings_attempt ON findings(attempt_id,review_id);

CREATE TRIGGER resolution_prior BEFORE INSERT ON finding_resolutions WHEN NOT EXISTS (
  SELECT 1 FROM findings f JOIN reviews old ON old.id=f.review_id JOIN reviews new ON new.id=NEW.review_id
  JOIN deliveries od ON od.id=old.delivery_id JOIN deliveries nd ON nd.id=new.delivery_id
  WHERE f.id=NEW.finding_id AND od.round_number<nd.round_number AND old.state<>'pending'
) BEGIN SELECT RAISE(ABORT,'RESOLUTION_BINDING_INVALID'); END;

CREATE TRIGGER findings_criteria BEFORE INSERT ON findings WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.criterion_ids_json) j WHERE NOT EXISTS (
    SELECT 1 FROM attempt_criteria c WHERE c.attempt_id=NEW.attempt_id AND c.criterion_id=j.value
  )
) BEGIN SELECT RAISE(ABORT,'FINDING_CRITERION_INVALID'); END;

CREATE TRIGGER finding_update BEFORE UPDATE ON findings BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER resolution_update BEFORE UPDATE ON finding_resolutions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER finding_sealed BEFORE INSERT ON findings WHEN (SELECT state FROM reviews WHERE id=NEW.review_id)<>'pending'
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER resolution_sealed BEFORE INSERT ON finding_resolutions WHEN (SELECT state FROM reviews WHERE id=NEW.review_id)<>'pending'
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE UNIQUE INDEX execution_question_pending ON execution_questions(passage_id) WHERE state IN ('pending','recorded','sending','delivery_unknown','expired');

CREATE INDEX questions_attempt ON execution_questions(attempt_id,created_at_ms,id);

CREATE TRIGGER question_identity_immutable BEFORE UPDATE OF id,passage_id,attempt_id,question_hash,question_json,created_at_ms,ttl_ms,scope_json ON execution_questions
  BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER question_answer_binding BEFORE UPDATE OF answer_operation_id ON execution_questions WHEN NEW.answer_operation_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM operation_requests WHERE operation_id=NEW.answer_operation_id AND resource_type='question' AND resource_id=NEW.id AND operation_kind='question.answer'
) BEGIN SELECT RAISE(ABORT,'QUESTION_OPERATION_MISMATCH'); END;

CREATE TRIGGER question_answer_immutable BEFORE UPDATE OF answer_operation_id,answer,answer_hash,answered_at_ms ON execution_questions WHEN OLD.answer_operation_id IS NOT NULL
  BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER question_terminal_immutable BEFORE UPDATE ON execution_questions WHEN OLD.state IN ('delivered','expired','cancelled')
  BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER measurement_identity_immutable BEFORE UPDATE OF passage_id,observed ON passage_measurements BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER resource_revision AFTER UPDATE OF owned,launch_state,stop_state,diagnostic,removed ON resources
BEGIN UPDATE resources SET revision=revision+1 WHERE id=NEW.id; END;

CREATE TRIGGER resource_removal_terminal BEFORE UPDATE OF removed ON resources WHEN OLD.removed=1 AND NEW.removed<>1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE INDEX cancellation_attempt ON cancellation_requests(attempt_id);

CREATE UNIQUE INDEX removal_active ON resource_removals(resource_id) WHERE state IN ('accepted','unknown');

CREATE TRIGGER cancellation_immutable BEFORE UPDATE ON cancellation_requests BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER removal_identity BEFORE UPDATE OF operation_id,resource_id,plan_hash,created_at_ms ON resource_removals BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER removal_terminal BEFORE UPDATE ON resource_removals WHEN OLD.state<>'accepted' BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER native_identity BEFORE UPDATE OF operation_id,resource_id,kind,created_at_ms ON native_open_requests BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER native_terminal BEFORE UPDATE ON native_open_requests WHEN OLD.state<>'accepted' BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE UNIQUE INDEX deliveries_effect_binding ON deliveries(id,attempt_id);

CREATE INDEX attempts_account_created ON attempts(account_id,created_at_ms,id);

CREATE INDEX questions_attempt_created ON execution_questions(attempt_id,created_at_ms,id);

CREATE INDEX queue_cycles_consumed ON queue_cycles(consumed_attempt_id) WHERE consumed_attempt_id IS NOT NULL;

CREATE TRIGGER queue_cycles_monotonic
BEFORE UPDATE ON queue_cycles
WHEN NEW.account_id<>OLD.account_id OR NEW.project_id<>OLD.project_id OR NEW.issue_id<>OLD.issue_id OR NEW.cycle_number<OLD.cycle_number
BEGIN SELECT RAISE(ABORT, 'queue cycle identity and sequence are immutable'); END;

CREATE TRIGGER creation_step_identity BEFORE UPDATE ON creation_steps
WHEN NEW.creation_id<>OLD.creation_id OR NEW.step<>OLD.step OR OLD.state<>'running'
  OR NEW.state NOT IN ('confirmed','unknown')
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CREATION_STEP'); END;

CREATE UNIQUE INDEX publication_request_active ON publication_requests(attempt_id) WHERE state IN ('accepted','running');

CREATE TRIGGER publication_identity BEFORE UPDATE OF operation_id,attempt_id,delivery_id,kind,authorized_mode,created_at_ms ON publication_requests
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER publication_terminal BEFORE UPDATE ON publication_requests WHEN OLD.state IN ('succeeded','failed','unknown')
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE UNIQUE INDEX publication_request_upgrade_binding ON publication_requests(operation_id,attempt_id,delivery_id,authorized_mode);

CREATE INDEX publication_upgrades_attempt ON publication_upgrades(attempt_id,created_at_ms);

CREATE TRIGGER upgrade_identity BEFORE UPDATE ON publication_upgrades BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE UNIQUE INDEX attempts_active_automatic_account ON attempts(account_id) WHERE source='automatic' AND result IS NULL;

CREATE INDEX attempts_issue_history ON attempts(account_id,repository_id,issue_id,created_at_ms DESC,id DESC);

CREATE TRIGGER attempts_source_immutable BEFORE UPDATE OF source ON attempts
WHEN NEW.source IS NOT OLD.source BEGIN SELECT RAISE(ABORT,'attempt source is immutable'); END;

CREATE TRIGGER attempts_source_required BEFORE INSERT ON attempts
WHEN NEW.source IS NULL BEGIN SELECT RAISE(ABORT,'new attempts require execution source'); END;

CREATE INDEX queue_consumptions_issue ON queue_consumptions(account_id,repository_id,issue_id);

CREATE TRIGGER queue_consumptions_scope BEFORE INSERT ON queue_consumptions
WHEN NOT EXISTS (SELECT 1 FROM attempts a WHERE a.id=NEW.attempt_id AND a.account_id=NEW.account_id
  AND a.project_id=NEW.project_id AND a.repository_id=NEW.repository_id AND a.issue_id=NEW.issue_id)
BEGIN SELECT RAISE(ABORT,'queue consumption scope mismatch'); END;

CREATE TRIGGER queue_consumptions_no_update BEFORE UPDATE ON queue_consumptions
BEGIN SELECT RAISE(ABORT,'queue consumption is immutable'); END;

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

CREATE UNIQUE INDEX effects_attempt_scope ON effects(attempt_id,kind,scope_key) WHERE attempt_id IS NOT NULL;

CREATE UNIQUE INDEX effects_creation_scope ON effects(creation_id,kind,scope_key) WHERE creation_id IS NOT NULL;

CREATE INDEX effects_attempt_state ON effects(attempt_id,state,created_at_ms,operation_id);

CREATE INDEX effects_creation_state ON effects(creation_id,state,created_at_ms,operation_id);

CREATE INDEX effects_delivery ON effects(delivery_id,created_at_ms,operation_id);

CREATE TRIGGER effect_identity BEFORE UPDATE OF operation_id,creation_id,attempt_id,delivery_id,kind,scope_key,authorization_json,expected_identity_json,created_at_ms ON effects
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER effect_terminal BEFORE UPDATE ON effects WHEN OLD.state IN ('confirmed','not_applicable')
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE UNIQUE INDEX creation_reconciliation_active ON creation_reconciliations(creation_id) WHERE state='accepted';

CREATE TRIGGER creation_reconciliation_identity BEFORE UPDATE ON creation_reconciliations
WHEN NEW.operation_id<>OLD.operation_id OR NEW.creation_id<>OLD.creation_id OR OLD.state<>'accepted'
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE INDEX queue_cycles_summary ON queue_cycles(account_id,last_eligible,last_ready,updated_at_ms DESC,observed_ordinal) WHERE consumed_attempt_id IS NULL;

CREATE INDEX attempts_recent_results ON attempts(account_id,updated_at_ms DESC,id DESC) WHERE result IS NOT NULL;

CREATE TRIGGER onboarding_completion_immutable
BEFORE UPDATE OF onboarding_completed_at_ms ON factory_settings
WHEN OLD.onboarding_completed_at_ms IS NOT NULL AND NEW.onboarding_completed_at_ms IS NOT OLD.onboarding_completed_at_ms
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;

CREATE TRIGGER onboarding_completion_delete_immutable
BEFORE DELETE ON factory_settings WHEN OLD.onboarding_completed_at_ms IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;

CREATE TRIGGER operation_identity_immutable
BEFORE UPDATE OF operation_id, installation_id, account_id, operation_kind, resource_type, resource_id, request_hash, expected_revision_json, result_account_id
ON operation_requests
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;

CREATE UNIQUE INDEX execution_profiles_live_name
  ON execution_profiles(name_key)
  WHERE deleted_at_ms IS NULL;

CREATE TRIGGER execution_profiles_lifecycle_insert_valid
BEFORE INSERT ON execution_profiles
WHEN NEW.profile_type IS NULL OR NEW.name_key IS NULL OR length(trim(NEW.name_key)) = 0
  OR NEW.deleted_at_ms IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'PROFILE_DATA_INVALID');
END;

CREATE TRIGGER execution_profiles_lifecycle_update_valid
BEFORE UPDATE ON execution_profiles
WHEN NEW.id <> OLD.id OR NEW.created_at_ms <> OLD.created_at_ms
  OR NEW.profile_type IS NULL OR NEW.profile_type NOT IN ('implementer', 'reviewer')
  OR NEW.name_key IS NULL OR length(trim(NEW.name_key)) = 0
  OR NEW.updated_at_ms < OLD.updated_at_ms OR NEW.revision <> OLD.revision + 1
  OR (OLD.deleted_at_ms IS NOT NULL AND NEW.deleted_at_ms IS NOT OLD.deleted_at_ms)
  OR (OLD.deleted_at_ms IS NULL AND NEW.deleted_at_ms IS NOT NULL AND NEW.deleted_at_ms < OLD.created_at_ms)
BEGIN
  SELECT RAISE(ABORT, 'PROFILE_DATA_INVALID');
END;

CREATE TRIGGER execution_profiles_physical_delete_forbidden
BEFORE DELETE ON execution_profiles
BEGIN
  SELECT RAISE(ABORT, 'IMMUTABLE_RECORD');
END;

CREATE INDEX attempts_active_implementer_profile
  ON attempts(json_extract(capture_json, '$.configuration.implementerProfile.id'))
  WHERE result IS NULL AND json_extract(capture_json, '$.formatVersion') = 1;

CREATE INDEX attempts_active_reviewer_profile
  ON attempts(json_extract(capture_json, '$.configuration.reviewerProfile.id'))
  WHERE result IS NULL AND json_extract(capture_json, '$.formatVersion') = 1;

CREATE INDEX diagnostic_runs_context ON diagnostic_runs(installation_id,account_id,scope,context_id,created_at_ms DESC,operation_id DESC);

CREATE INDEX diagnostic_runs_project ON diagnostic_runs(project_id,created_at_ms DESC);

CREATE INDEX diagnostic_runs_host_identity ON diagnostic_runs(installation_id,account_id,completed_at_ms DESC,operation_id DESC)
  WHERE scope='host' AND state='succeeded' AND instr(checks_json,'"github_identity"')>0;

CREATE INDEX diagnostic_runs_host_maestri ON diagnostic_runs(installation_id,account_id,completed_at_ms DESC,operation_id DESC)
  WHERE scope='host' AND state='succeeded' AND instr(checks_json,'"maestri_context"')>0;

CREATE TRIGGER diagnostic_run_scope BEFORE INSERT ON diagnostic_runs
WHEN NOT EXISTS (SELECT 1 FROM operation_requests o WHERE o.operation_id=NEW.operation_id AND o.operation_kind='diagnostics.check'
  AND o.resource_type='diagnostic' AND o.resource_id=NEW.operation_id AND o.installation_id=NEW.installation_id AND o.account_id IS NEW.account_id)
  OR (NEW.scope='attempt' AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.id=NEW.attempt_id AND a.account_id IS NEW.account_id AND a.project_id=NEW.project_id))
  OR (NEW.scope='creation' AND NOT EXISTS (SELECT 1 FROM project_creations c WHERE c.id=NEW.creation_id AND c.installation_id=NEW.installation_id AND c.account_id IS NEW.account_id AND c.project_id IS NEW.project_id))
  OR (NEW.scope='project' AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id=NEW.project_id AND (p.account_id IS NULL OR p.account_id IS NEW.account_id)))
BEGIN SELECT RAISE(ABORT,'diagnostic context mismatch'); END;

CREATE TRIGGER diagnostic_run_identity BEFORE UPDATE OF operation_id,installation_id,account_id,scope,context_id,project_id,creation_id,attempt_id,context_stamp,checks_json,created_at_ms ON diagnostic_runs
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER diagnostic_run_terminal BEFORE UPDATE ON diagnostic_runs WHEN OLD.state<>'accepted'
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE INDEX project_deletions_recovery ON project_deletions(state, updated_at_ms);

CREATE TRIGGER project_deletions_identity
BEFORE UPDATE OF operation_id,project_id,expected_revision,authorization_digest,created_at_ms ON project_deletions
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER project_deletion_receipts_insert
BEFORE INSERT ON project_deletion_receipts
WHEN factory_project_deletion_finalization_allowed(NEW.operation_id) IS NOT 1
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_FINALIZATION_REQUIRED'); END;

CREATE TRIGGER project_deletion_receipts_immutable
BEFORE UPDATE ON project_deletion_receipts
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER project_deletion_receipts_delete_immutable
BEFORE DELETE ON project_deletion_receipts
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER operation_delete_immutable BEFORE DELETE ON operation_requests
WHEN factory_project_deletion_row_allowed('operation_requests',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;

CREATE TRIGGER event_delete_immutable BEFORE DELETE ON events
WHEN factory_project_deletion_row_allowed('events',json_array(OLD.seq),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;

CREATE TRIGGER project_revision_delete_immutable BEFORE DELETE ON project_revisions
WHEN factory_project_deletion_row_allowed('project_revisions',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;

CREATE TRIGGER preparation_revision_delete_immutable BEFORE DELETE ON preparation_revisions
WHEN factory_project_deletion_row_allowed('preparation_revisions',json_array(OLD.preparation_id,OLD.revision),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_RECORD'); END;

CREATE TRIGGER attempt_criteria_delete_immutable BEFORE DELETE ON attempt_criteria
WHEN factory_project_deletion_row_allowed('attempt_criteria',json_array(OLD.attempt_id,OLD.criterion_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER rounds_delete_immutable BEFORE DELETE ON rounds
WHEN factory_project_deletion_row_allowed('rounds',json_array(OLD.attempt_id,OLD.round_number),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER passage_results_delete_immutable BEFORE DELETE ON passage_results
WHEN factory_project_deletion_row_allowed('passage_results',json_array(OLD.passage_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER criterion_results_delete_immutable BEFORE DELETE ON criterion_results
WHEN factory_project_deletion_row_allowed('criterion_results',json_array(OLD.passage_id,OLD.criterion_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER passage_events_delete_immutable BEFORE DELETE ON passage_events
WHEN factory_project_deletion_row_allowed('passage_events',json_array(OLD.seq),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER attempts_delete_immutable BEFORE DELETE ON attempts
WHEN factory_project_deletion_row_allowed('attempts',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER passages_delete_immutable BEFORE DELETE ON passages
WHEN factory_project_deletion_row_allowed('passages',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER resources_delete_immutable BEFORE DELETE ON resources
WHEN factory_project_deletion_row_allowed('resources',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER execution_questions_delete_immutable BEFORE DELETE ON execution_questions
WHEN factory_project_deletion_row_allowed('execution_questions',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER capture_run_delete BEFORE DELETE ON capture_runs
WHEN factory_project_deletion_row_allowed('capture_runs',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER delivery_delete_immutable BEFORE DELETE ON deliveries
WHEN factory_project_deletion_row_allowed('deliveries',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER capture_warning_delete_immutable BEFORE DELETE ON capture_warnings
WHEN factory_project_deletion_row_allowed('capture_warnings',json_array(OLD.delivery_id,OLD.path),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER finding_delete BEFORE DELETE ON findings
WHEN factory_project_deletion_row_allowed('findings',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER resolution_delete BEFORE DELETE ON finding_resolutions
WHEN factory_project_deletion_row_allowed('finding_resolutions',json_array(OLD.finding_id,OLD.review_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER measurement_delete_immutable BEFORE DELETE ON passage_measurements
WHEN factory_project_deletion_row_allowed('passage_measurements',json_array(OLD.passage_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER cancellation_delete BEFORE DELETE ON cancellation_requests
WHEN factory_project_deletion_row_allowed('cancellation_requests',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER removal_delete BEFORE DELETE ON resource_removals
WHEN factory_project_deletion_row_allowed('resource_removals',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER native_delete BEFORE DELETE ON native_open_requests
WHEN factory_project_deletion_row_allowed('native_open_requests',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER effect_delete BEFORE DELETE ON effects
WHEN factory_project_deletion_row_allowed('effects',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER publication_delete BEFORE DELETE ON publication_requests
WHEN factory_project_deletion_row_allowed('publication_requests',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER queue_cycles_no_delete BEFORE DELETE ON queue_cycles
WHEN factory_project_deletion_row_allowed('queue_cycles',json_array(OLD.account_id,OLD.project_id,OLD.issue_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'queue cycle history is immutable'); END;

CREATE TRIGGER creation_step_delete BEFORE DELETE ON creation_steps
WHEN factory_project_deletion_row_allowed('creation_steps',json_array(OLD.creation_id,OLD.step),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CREATION_STEP'); END;

CREATE TRIGGER upgrade_delete BEFORE DELETE ON publication_upgrades
WHEN factory_project_deletion_row_allowed('publication_upgrades',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER queue_consumptions_no_delete BEFORE DELETE ON queue_consumptions
WHEN factory_project_deletion_row_allowed('queue_consumptions',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'queue consumption is immutable'); END;

CREATE TRIGGER creation_reconciliation_delete BEFORE DELETE ON creation_reconciliations
WHEN factory_project_deletion_row_allowed('creation_reconciliations',json_array(OLD.operation_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

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

CREATE UNIQUE INDEX project_storage_location_current_key
  ON project_storage_locations(project_id,location_key) WHERE is_current=1;

CREATE UNIQUE INDEX project_storage_location_current_path
  ON project_storage_locations(root_relative COLLATE NOCASE) WHERE is_current=1;

CREATE UNIQUE INDEX project_storage_location_current_identity
  ON project_storage_locations(json_extract(object_identity_json,'$.volume_id'),json_extract(object_identity_json,'$.object_id')) WHERE is_current=1;

CREATE INDEX project_storage_location_project_layout
  ON project_storage_locations(project_id,layout_version);

CREATE TRIGGER project_storage_location_identity_immutable
BEFORE UPDATE OF id,project_id,location_key,layout_version,root_relative,object_identity_json,created_at_ms ON project_storage_locations
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER project_storage_location_revision_monotonic
BEFORE UPDATE ON project_storage_locations
WHEN NEW.revision < OLD.revision OR NEW.verified_at_ms < OLD.verified_at_ms OR
  (NEW.is_current<>OLD.is_current AND NEW.revision<=OLD.revision)
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE INDEX project_storage_transitions_project_state ON project_storage_transitions(project_id,state);

CREATE UNIQUE INDEX project_storage_transitions_active_project ON project_storage_transitions(project_id)
  WHERE state IN ('planned','running','uncertain','blocked');

CREATE TRIGGER project_storage_transition_insert_valid
BEFORE INSERT ON project_storage_transitions
WHEN NEW.source_relative NOT LIKE 'var/factory/projects/'||NEW.project_id||'/v%' OR
  NEW.source_relative NOT LIKE '%/managed' OR NEW.destination_relative<>'var/factory/projects/'||NEW.project_id||'/v'||(
    SELECT layout_version+1 FROM project_storage_locations WHERE id=NEW.source_location_id AND project_id=NEW.project_id
  )||'/'||NEW.location_key OR
  instr(NEW.source_relative,char(92))>0 OR instr(NEW.destination_relative,char(92))>0 OR
  instr(NEW.source_relative,':')>0 OR instr(NEW.destination_relative,':')>0 OR
  NEW.source_relative GLOB '*..*' OR NEW.destination_relative GLOB '*..*' OR
  NOT EXISTS(SELECT 1 FROM project_storage_locations l WHERE l.id=NEW.source_location_id AND l.project_id=NEW.project_id
    AND l.is_current=1 AND l.location_key=NEW.location_key AND l.root_relative=NEW.source_relative
    AND l.object_identity_json=NEW.source_identity_json) OR
  NOT EXISTS(SELECT 1 FROM operation_requests o WHERE o.operation_id=NEW.operation_id AND o.operation_kind='project.storage.transition'
    AND o.resource_type='project' AND o.resource_id=NEW.project_id)
BEGIN SELECT RAISE(ABORT,'PROJECT_STORAGE_TRANSITION_INVALID'); END;

CREATE TRIGGER project_storage_transition_identity_immutable
BEFORE UPDATE OF operation_id,project_id,location_key,source_location_id,source_relative,destination_relative,
  source_identity_json,plan_hash,created_at_ms ON project_storage_transitions
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER project_storage_transition_revision_monotonic
BEFORE UPDATE ON project_storage_transitions
WHEN OLD.state='verified' OR NEW.revision<>OLD.revision+1 OR NEW.generation NOT IN (OLD.generation,OLD.generation+1) OR
  NEW.updated_at_ms<OLD.updated_at_ms OR
  (OLD.destination_identity_json IS NOT NULL AND NEW.destination_identity_json IS NOT OLD.destination_identity_json) OR
  (CASE OLD.step WHEN 'planned' THEN 1 WHEN 'quiescence_checked' THEN 2 WHEN 'moving' THEN 3 WHEN 'verifying' THEN 4 ELSE 5 END) >
  (CASE NEW.step WHEN 'planned' THEN 1 WHEN 'quiescence_checked' THEN 2 WHEN 'moving' THEN 3 WHEN 'verifying' THEN 4 ELSE 5 END) OR
  NOT ((OLD.state='planned' AND NEW.state IN ('planned','running','uncertain','blocked')) OR
       (OLD.state='running' AND NEW.state IN ('running','uncertain','blocked','verified')) OR
       (OLD.state='uncertain' AND NEW.state IN ('running','uncertain','blocked','verified')) OR
       (OLD.state='blocked' AND NEW.state IN ('running','uncertain','blocked','verified')))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER project_storage_attempt_insert_barrier
BEFORE INSERT ON attempts
WHEN EXISTS(SELECT 1 FROM project_storage_transitions WHERE project_id=NEW.project_id AND state IN ('planned','running','uncertain','blocked'))
BEGIN SELECT RAISE(ABORT,'PROJECT_STORAGE_TRANSITION_ACTIVE'); END;

CREATE TRIGGER project_storage_deletion_insert_barrier
BEFORE INSERT ON project_deletions
WHEN EXISTS(SELECT 1 FROM project_storage_transitions WHERE project_id=NEW.project_id AND state IN ('planned','running','uncertain','blocked'))
BEGIN SELECT RAISE(ABORT,'PROJECT_STORAGE_TRANSITION_ACTIVE'); END;

CREATE TRIGGER project_storage_configuration_revision_barrier
BEFORE INSERT ON project_revisions
WHEN EXISTS(SELECT 1 FROM project_storage_transitions WHERE project_id=NEW.project_id AND state IN ('planned','running','uncertain','blocked'))
BEGIN SELECT RAISE(ABORT,'PROJECT_STORAGE_TRANSITION_ACTIVE'); END;

CREATE TRIGGER project_storage_location_retire_requires_transition
BEFORE UPDATE OF is_current ON project_storage_locations
WHEN OLD.is_current=1 AND NEW.is_current=0 AND NOT EXISTS(
  SELECT 1 FROM project_storage_transitions t WHERE t.project_id=OLD.project_id AND t.location_key=OLD.location_key
    AND t.source_location_id=OLD.id AND t.source_relative=OLD.root_relative AND t.state='verified'
)
BEGIN SELECT RAISE(ABORT,'PROJECT_STORAGE_TRANSITION_REQUIRED'); END;

CREATE TRIGGER project_storage_location_publish_requires_transition
BEFORE INSERT ON project_storage_locations
WHEN NEW.is_current=1 AND EXISTS(SELECT 1 FROM project_storage_locations WHERE project_id=NEW.project_id AND location_key=NEW.location_key AND is_current=1)
  AND NOT EXISTS(
    SELECT 1 FROM project_storage_transitions t WHERE t.project_id=NEW.project_id AND t.location_key=NEW.location_key
      AND t.destination_relative=NEW.root_relative AND t.destination_identity_json=NEW.object_identity_json
      AND t.state='verified' AND t.step='publishing_location'
  )
BEGIN SELECT RAISE(ABORT,'PROJECT_STORAGE_TRANSITION_REQUIRED'); END;

CREATE INDEX creation_board_operations_state ON creation_board_operations(creation_id,state);

CREATE TRIGGER creation_board_operation_identity BEFORE UPDATE ON creation_board_operations
WHEN NEW.operation_id<>OLD.operation_id OR NEW.creation_id<>OLD.creation_id OR NEW.kind<>OLD.kind OR NEW.scope_key<>OLD.scope_key
  OR NEW.request_hash<>OLD.request_hash OR NEW.authorization_json<>OLD.authorization_json
  OR NEW.expected_identity_json<>OLD.expected_identity_json OR NEW.created_at_ms<>OLD.created_at_ms
  OR NEW.revision<>OLD.revision+1 OR OLD.state IN ('confirmed','failed_known')
  OR (OLD.sent_at_ms IS NOT NULL AND NEW.sent_at_ms IS NOT OLD.sent_at_ms)
  OR (OLD.confirmed_at_ms IS NOT NULL AND NEW.confirmed_at_ms IS NOT OLD.confirmed_at_ms)
  OR NEW.state NOT IN ('running','confirmed','failed_known','unknown')
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CREATION_BOARD_OPERATION'); END;

CREATE TRIGGER creation_board_operation_delete BEFORE DELETE ON creation_board_operations
WHEN factory_project_deletion_row_allowed('creation_board_operations',json_array(OLD.operation_id),
  (SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state)
   FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CREATION_BOARD_OPERATION'); END;

CREATE INDEX managed_terminals_role_state ON managed_terminals(installation_id,host_name,role,state,updated_at_ms DESC);

CREATE UNIQUE INDEX managed_terminals_physical_identity ON managed_terminals(workspace_id,terminal_id) WHERE terminal_id IS NOT NULL AND state <> 'retired';

CREATE INDEX attempt_sessions_terminal ON attempt_sessions(managed_terminal_id,state,updated_at_ms);

CREATE UNIQUE INDEX attempt_sessions_omp_identity ON attempt_sessions(omp_session_id) WHERE omp_session_id IS NOT NULL;

CREATE TRIGGER passage_attempt_session_binding BEFORE INSERT ON passages
WHEN NOT EXISTS (SELECT 1 FROM attempt_sessions s WHERE s.id=NEW.attempt_session_id AND s.attempt_id=NEW.attempt_id AND s.role=NEW.role)
BEGIN SELECT RAISE(ABORT,'PASSAGE_SESSION_BINDING_INVALID'); END;

CREATE TRIGGER passage_attempt_session_immutable BEFORE UPDATE OF attempt_session_id ON passages
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE INDEX passages_attempt_session ON passages(attempt_session_id,round_number);

CREATE UNIQUE INDEX terminal_occupancies_terminal_active ON terminal_occupancies(managed_terminal_id) WHERE state IN ('occupied','uncertain');

CREATE UNIQUE INDEX terminal_occupancies_session_active ON terminal_occupancies(attempt_session_id) WHERE state IN ('occupied','uncertain');

CREATE INDEX terminal_occupancies_attempt ON terminal_occupancies(attempt_id,state,claimed_at_ms);

CREATE TRIGGER managed_terminal_identity_immutable BEFORE UPDATE OF id,installation_id,host_name,role,owner,terminal_name,created_at_ms ON managed_terminals
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER managed_terminal_generation_monotonic BEFORE UPDATE OF generation ON managed_terminals WHEN NEW.generation < OLD.generation
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER managed_terminal_physical_identity_immutable BEFORE UPDATE OF workspace_id,terminal_id ON managed_terminals
WHEN OLD.terminal_id IS NOT NULL AND (NEW.workspace_id IS NOT OLD.workspace_id OR NEW.terminal_id IS NOT OLD.terminal_id)
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER attempt_session_identity_immutable BEFORE UPDATE OF id,attempt_id,role,session_directory_relative,created_at_ms ON attempt_sessions
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER attempt_session_terminal_reassignment BEFORE UPDATE OF managed_terminal_id,terminal_generation ON attempt_sessions
WHEN OLD.state<>'reserved' OR OLD.omp_session_id IS NOT NULL OR EXISTS (SELECT 1 FROM terminal_occupancies o WHERE o.attempt_session_id=OLD.id)
  OR NOT EXISTS (
    SELECT 1 FROM managed_terminals old_terminal JOIN managed_terminals new_terminal
      ON new_terminal.id=NEW.managed_terminal_id
    WHERE old_terminal.id=OLD.managed_terminal_id AND old_terminal.installation_id=new_terminal.installation_id
      AND old_terminal.host_name=new_terminal.host_name AND old_terminal.role=new_terminal.role
      AND old_terminal.state='uncertain' AND new_terminal.state='planned' AND NEW.terminal_generation=new_terminal.generation
  )
BEGIN SELECT RAISE(ABORT,'TERMINAL_SESSION_REASSIGNMENT_INVALID'); END;

CREATE TRIGGER attempt_session_terminal_generation BEFORE INSERT ON attempt_sessions WHEN NOT EXISTS (
  SELECT 1 FROM managed_terminals t WHERE t.id=NEW.managed_terminal_id AND
    ((t.state='available' AND NEW.terminal_generation=t.generation+1) OR (t.state='planned' AND NEW.terminal_generation=t.generation))
) BEGIN SELECT RAISE(ABORT,'TERMINAL_GENERATION_INVALID'); END;

CREATE TRIGGER attempt_session_omp_identity_immutable BEFORE UPDATE OF omp_session_id ON attempt_sessions
WHEN OLD.omp_session_id IS NOT NULL AND NEW.omp_session_id IS NOT OLD.omp_session_id
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER terminal_occupancy_identity_immutable BEFORE UPDATE OF id,managed_terminal_id,attempt_session_id,attempt_id,passage_id,generation,claimed_at_ms ON terminal_occupancies
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER terminal_occupancy_state_monotonic BEFORE UPDATE OF state ON terminal_occupancies
WHEN (OLD.state='released' AND NEW.state<>'released') OR (OLD.state='uncertain' AND NEW.state='occupied')
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER terminal_occupancy_terminal_binding BEFORE INSERT ON terminal_occupancies WHEN NOT EXISTS (
  SELECT 1 FROM attempt_sessions s JOIN passages p ON p.id=NEW.passage_id
  JOIN managed_terminals t ON t.id=NEW.managed_terminal_id
  WHERE s.id=NEW.attempt_session_id AND s.attempt_id=NEW.attempt_id AND s.managed_terminal_id=NEW.managed_terminal_id
    AND s.terminal_generation=NEW.generation AND t.generation=NEW.generation
    AND p.attempt_id=NEW.attempt_id AND p.attempt_session_id=s.id AND p.id=NEW.passage_id
) BEGIN SELECT RAISE(ABORT,'TERMINAL_OCCUPANCY_BINDING_INVALID'); END;

CREATE TRIGGER managed_terminals_delete_immutable BEFORE DELETE ON managed_terminals
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER attempt_sessions_delete_guard BEFORE DELETE ON attempt_sessions
WHEN factory_project_deletion_row_allowed('attempt_sessions',json_array(OLD.id),
  (SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state)
   FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER terminal_occupancies_delete_guard BEFORE DELETE ON terminal_occupancies
WHEN factory_project_deletion_row_allowed('terminal_occupancies',json_array(OLD.id),
  (SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state)
   FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER passage_source_binding BEFORE INSERT ON passages
WHEN NEW.session_source_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM passages p JOIN attempt_sessions s ON s.id=p.attempt_session_id
  WHERE p.id=NEW.session_source_id AND p.attempt_id=NEW.attempt_id AND p.role=NEW.role
    AND p.round_number=NEW.round_number-1 AND p.attempt_session_id=NEW.attempt_session_id
    AND s.attempt_id=NEW.attempt_id AND s.role=NEW.role AND s.state='completed'
    AND p.state='ready' AND p.tracking_state='tracked'
    AND EXISTS (SELECT 1 FROM passage_results r WHERE r.passage_id=p.id)
) BEGIN SELECT RAISE(ABORT,'CONTINUATION_BINDING_INVALID'); END;

CREATE TRIGGER attempt_session_continuity_lost BEFORE UPDATE OF state ON attempt_sessions
WHEN OLD.state IN ('uncertain','interrupted') AND NEW.state NOT IN ('uncertain','interrupted')
BEGIN SELECT RAISE(ABORT,'SESSION_CONTINUITY_LOST'); END;

CREATE TRIGGER managed_terminal_live_conversation BEFORE UPDATE OF generation ON managed_terminals
WHEN NEW.generation<>OLD.generation AND EXISTS (
  SELECT 1 FROM attempt_sessions s JOIN attempts a ON a.id=s.attempt_id
  WHERE s.managed_terminal_id=OLD.id AND a.result IS NULL AND s.terminal_generation=OLD.generation
) BEGIN SELECT RAISE(ABORT,'TERMINAL_CONVERSATION_IN_USE'); END;

CREATE TRIGGER finding_origin_binding BEFORE INSERT ON findings
WHEN NEW.origin_finding_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM findings f JOIN reviews r ON r.id=f.review_id
  JOIN deliveries d ON d.id=r.delivery_id JOIN reviews nr ON nr.id=NEW.review_id
  JOIN deliveries nd ON nd.id=nr.delivery_id
  WHERE f.id=NEW.origin_finding_id AND f.attempt_id=NEW.attempt_id
    AND f.origin_finding_id IS NULL AND d.round_number<nd.round_number
)
BEGIN SELECT RAISE(ABORT,'FINDING_ORIGIN_INVALID'); END;

CREATE INDEX finding_assessments_attempt ON finding_assessments(attempt_id,created_at_ms,id);

CREATE TRIGGER assessment_binding BEFORE INSERT ON finding_assessments WHEN NOT EXISTS (
  SELECT 1 FROM findings f JOIN reviews old ON old.id=f.review_id JOIN deliveries od ON od.id=old.delivery_id
  JOIN reviews r ON r.id=NEW.review_id JOIN deliveries d ON d.id=r.delivery_id JOIN attempts a ON a.id=r.attempt_id
  JOIN passage_results p ON p.passage_id=r.passage_id
  WHERE f.id=NEW.finding_id AND f.attempt_id=NEW.attempt_id AND f.origin_finding_id IS NULL
    AND od.round_number<d.round_number AND old.state<>'pending' AND r.state='pending'
    AND r.independence_state='valid' AND d.round_number=(SELECT max(round_number) FROM rounds WHERE attempt_id=a.id) AND a.result IS NULL
) BEGIN SELECT RAISE(ABORT,'ASSESSMENT_BINDING_INVALID'); END;

CREATE TRIGGER assessment_update BEFORE UPDATE ON finding_assessments BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER assessment_delete BEFORE DELETE ON finding_assessments
WHEN factory_project_deletion_row_allowed('finding_assessments',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER attempt_block_update BEFORE UPDATE ON attempt_blocks BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER attempt_block_delete BEFORE DELETE ON attempt_blocks
WHEN factory_project_deletion_row_allowed('attempt_blocks',json_array(OLD.attempt_id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE UNIQUE INDEX deliveries_dispute_binding ON deliveries(id,attempt_id,content_identity);

CREATE INDEX finding_disputes_attempt ON finding_disputes(attempt_id,created_at_ms,id);

CREATE INDEX finding_disputes_pending ON finding_disputes(attempt_id,passage_id) WHERE response_review_id IS NULL;

CREATE TRIGGER dispute_binding BEFORE INSERT ON finding_disputes WHEN NEW.response_review_id IS NOT NULL OR NOT EXISTS (
  SELECT 1 FROM findings f JOIN reviews r ON r.id=f.review_id JOIN deliveries d ON d.id=r.delivery_id
  JOIN passages p ON p.id=NEW.passage_id JOIN attempts a ON a.id=p.attempt_id
  JOIN passage_results result ON result.passage_id=p.id JOIN json_each(result.summary_json,'$.findingResponses') response
  WHERE f.id=NEW.finding_id AND f.attempt_id=NEW.attempt_id AND p.attempt_id=NEW.attempt_id AND p.role='implementer'
    AND r.state<>'pending' AND r.independence_state='valid' AND d.id=NEW.delivery_id AND d.content_identity=NEW.content_identity
    AND d.round_number<p.round_number AND a.result IS NULL AND a.suspension IS NULL AND a.phase='implementing'
    AND p.round_number=(SELECT max(round_number) FROM rounds WHERE attempt_id=a.id)
    AND json_extract(response.value,'$.findingId')=f.id AND json_extract(response.value,'$.responseType')='disputed'
    AND json_extract(response.value,'$.response')=NEW.justification AND json_extract(response.value,'$.evidence')=json(NEW.evidence_json)
    AND NOT EXISTS (SELECT 1 FROM finding_resolutions x JOIN reviews xr ON xr.id=x.review_id JOIN deliveries xd ON xd.id=xr.delivery_id
      WHERE x.finding_id=f.id AND x.verdict='resolved' AND xr.independence_state='valid' AND xd.round_number<p.round_number)
) BEGIN SELECT RAISE(ABORT,'DISPUTE_BINDING_INVALID'); END;

CREATE TRIGGER dispute_evidence BEFORE INSERT ON finding_disputes WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.evidence_json) e WHERE e.type<>'text' OR length(trim(e.value)) NOT BETWEEN 1 AND 4096
) BEGIN SELECT RAISE(ABORT,'DISPUTE_EVIDENCE_INVALID'); END;

CREATE TRIGGER dispute_identity BEFORE UPDATE OF id,attempt_id,finding_id,passage_id,delivery_id,content_identity,justification,evidence_json,created_at_ms ON finding_disputes
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER dispute_response_sealed BEFORE UPDATE ON finding_disputes WHEN OLD.response_review_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER dispute_response_binding BEFORE UPDATE ON finding_disputes WHEN NEW.response_review_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM reviews r JOIN passages p ON p.id=r.passage_id JOIN deliveries d ON d.id=r.delivery_id
  JOIN passages source ON source.id=OLD.passage_id JOIN attempts a ON a.id=r.attempt_id
  JOIN finding_resolutions x ON x.review_id=r.id AND x.finding_id=OLD.finding_id
  JOIN passage_results result ON result.passage_id=p.id JOIN json_each(result.summary_json,'$.disputeResponses') response
  WHERE r.id=NEW.response_review_id AND r.attempt_id=OLD.attempt_id AND p.role='reviewer'
    AND r.state='pending' AND r.independence_state='valid' AND d.round_number>=source.round_number
    AND d.round_number=(SELECT max(round_number) FROM rounds WHERE attempt_id=a.id)
    AND a.result IS NULL AND a.suspension IS NULL AND a.phase='reviewing'
    AND x.verdict=CASE NEW.response_verdict WHEN 'maintained' THEN 'unresolved' WHEN 'resolved' THEN 'resolved' END
    AND json_extract(response.value,'$.disputeId')=OLD.id AND json_extract(response.value,'$.verdict')=NEW.response_verdict
    AND json_extract(response.value,'$.justification')=NEW.response_justification
    AND json_extract(response.value,'$.evidence')=json(NEW.response_evidence_json)
) BEGIN SELECT RAISE(ABORT,'DISPUTE_RESPONSE_INVALID'); END;

CREATE TRIGGER dispute_response_evidence BEFORE UPDATE ON finding_disputes WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.response_evidence_json) e WHERE e.type<>'text' OR length(trim(e.value)) NOT BETWEEN 1 AND 4096
) BEGIN SELECT RAISE(ABORT,'DISPUTE_EVIDENCE_INVALID'); END;

CREATE TRIGGER dispute_delete BEFORE DELETE ON finding_disputes
WHEN factory_project_deletion_row_allowed('finding_disputes',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER attempt_block_binding BEFORE INSERT ON attempt_blocks WHEN NOT EXISTS (
  SELECT 1 FROM attempts a JOIN deliveries d ON d.attempt_id=a.id JOIN reviews r ON r.delivery_id=d.id
  WHERE a.id=NEW.attempt_id AND a.result IS NULL AND r.state='rejected' AND r.independence_state='valid'
    AND d.round_number=(SELECT max(round_number) FROM rounds WHERE attempt_id=a.id)
    AND d.id=json_extract(NEW.block_json,'$.delivery_id') AND d.content_identity=json_extract(NEW.block_json,'$.content_identity')
    AND json_extract(NEW.block_json,'$.revision')=1 AND json_extract(NEW.block_json,'$.corrections_used')=d.round_number-1
    AND json_extract(NEW.block_json,'$.correction_limit')=json_extract(a.capture_json,'$.configuration.configuration.correctionLimit')
    AND (json_extract(NEW.block_json,'$.reason') IN ('no_progress','correction_limit') OR
      (json_extract(NEW.block_json,'$.reason')='dispute_maintained' AND EXISTS (
        SELECT 1 FROM finding_disputes t WHERE t.attempt_id=a.id AND t.response_review_id=r.id AND t.response_verdict='maintained'
      )))
) BEGIN SELECT RAISE(ABORT,'ATTEMPT_BLOCK_BINDING_INVALID'); END;

CREATE INDEX attempt_decisions_attempt ON attempt_decisions(attempt_id,created_at_ms,id);

CREATE INDEX attempt_decisions_delivery ON attempt_decisions(delivery_id,created_at_ms,id);

CREATE TRIGGER attempt_decision_binding BEFORE INSERT ON attempt_decisions WHEN NOT EXISTS (
  SELECT 1 FROM operation_requests o JOIN attempts a ON a.id=NEW.attempt_id
  JOIN attempt_blocks b ON b.attempt_id=a.id JOIN deliveries d ON d.id=NEW.delivery_id AND d.attempt_id=a.id
  JOIN reviews r ON r.delivery_id=d.id
  WHERE o.operation_id=NEW.operation_id AND o.operation_kind='attempt.decision' AND o.resource_type='attempt' AND o.resource_id=a.id
    AND o.installation_id=(SELECT installation_id FROM factory_settings WHERE id='local')
    AND o.account_id=a.account_id AND o.request_hash=json_extract(NEW.authorization_json,'$.requestHash')
    AND json_extract(NEW.authorization_json,'$.formatVersion')=1 AND json_extract(NEW.authorization_json,'$.authorized')=1
    AND json_extract(NEW.authorization_json,'$.action')=NEW.action
    AND json_extract(NEW.authorization_json,'$.attemptId')=a.id
    AND json_extract(NEW.authorization_json,'$.deliveryId')=d.id
    AND json_extract(NEW.authorization_json,'$.contentIdentity')=d.content_identity
    AND json_extract(NEW.authorization_json,'$.blockId')=NEW.block_id
    AND json_extract(NEW.authorization_json,'$.blockRevision')=NEW.block_revision
    AND json_extract(NEW.authorization_json,'$.blockReason')=NEW.block_reason
    AND (NEW.action<>'guidance' OR json_extract(NEW.authorization_json,'$.guidance')=json_extract(NEW.guidance_json,'$.text'))
    AND json_extract(o.expected_revision_json,'$.etag')=printf('"%s:%d"',a.id,a.revision)
    AND a.result IS NULL AND a.suspension='CORRECTION_BLOCKED' AND a.phase='reviewing'
    AND r.state='rejected' AND r.independence_state='valid'
    AND d.id=(SELECT delivery_id FROM deliveries WHERE attempt_id=a.id ORDER BY round_number DESC LIMIT 1)
    AND json_extract(b.block_json,'$.id')=NEW.block_id
    AND json_extract(b.block_json,'$.revision')=NEW.block_revision
    AND json_extract(b.block_json,'$.reason')=NEW.block_reason
    AND json_extract(b.block_json,'$.delivery_id')=(SELECT delivery_id FROM attempt_blocks WHERE attempt_id=a.id)
    AND (NEW.action<>'guidance' OR (NEW.block_reason<>'correction_limit' AND d.round_number-1<json_extract(a.capture_json,'$.configuration.configuration.correctionLimit')))
    AND (NEW.action<>'end' OR EXISTS (SELECT 1 FROM cancellation_requests c WHERE c.operation_id=NEW.operation_id AND c.attempt_id=a.id))
    AND (NEW.action<>'change_profile' OR EXISTS (
      SELECT 1 FROM preparations p JOIN preparation_revisions pr ON pr.preparation_id=p.id AND pr.revision=NEW.successor_preparation_revision
      WHERE p.id=NEW.successor_preparation_id AND p.revision=NEW.successor_preparation_revision AND p.project_id=a.project_id
        AND json_extract(pr.choices_json,'$.choices.issueId')=a.issue_id
        AND json_extract(pr.choices_json,'$.choices.previousAttemptId')=a.id
        AND json_extract(NEW.authorization_json,'$.profileId') IS NOT NULL
        AND json_extract(NEW.authorization_json,'$.profileRevision') IS NOT NULL
        AND ((json_extract(NEW.authorization_json,'$.role')='implementer'
          AND json_extract(pr.choices_json,'$.choices.overrides.implementerProfile.kind')='reference'
          AND json_extract(pr.choices_json,'$.choices.overrides.implementerProfile.id')=json_extract(NEW.authorization_json,'$.profileId')
          AND json_extract(pr.choices_json,'$.choices.overrides.implementerProfile.revision')=json_extract(NEW.authorization_json,'$.profileRevision'))
          OR (json_extract(NEW.authorization_json,'$.role')='reviewer'
          AND json_extract(pr.choices_json,'$.choices.overrides.reviewerProfile.kind')='reference'
          AND json_extract(pr.choices_json,'$.choices.overrides.reviewerProfile.id')=json_extract(NEW.authorization_json,'$.profileId')
          AND json_extract(pr.choices_json,'$.choices.overrides.reviewerProfile.revision')=json_extract(NEW.authorization_json,'$.profileRevision')))
    ))
) BEGIN SELECT RAISE(ABORT,'ATTEMPT_DECISION_BINDING_INVALID'); END;

CREATE TRIGGER attempt_decision_immutable BEFORE UPDATE ON attempt_decisions
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER attempt_decision_delete BEFORE DELETE ON attempt_decisions
WHEN factory_project_deletion_row_allowed('attempt_decisions',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

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

CREATE INDEX delivery_targets_attempt_delivery ON delivery_targets(attempt_id,delivery_id,created_at_ms);

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

CREATE TRIGGER effect_transition BEFORE UPDATE OF state ON effects WHEN NOT (
  (OLD.state='not_started' AND NEW.state IN ('running','failed_known','not_applicable')) OR
  (OLD.state='running' AND NEW.state IN ('confirmed','failed_known','unknown','not_applicable')) OR
  (OLD.state='unknown' AND NEW.state IN ('confirmed','failed_known','not_applicable') AND (NEW.state<>'failed_known' OR OLD.kind='local_commit')) OR
  (OLD.state='failed_known' AND NEW.state IN ('running','not_applicable'))
) BEGIN SELECT RAISE(ABORT,'EFFECT_TRANSITION_INVALID'); END;

CREATE UNIQUE INDEX rounds_integration_operation ON rounds(json_extract(integration_json,'$.operation_id')) WHERE integration_json IS NOT NULL;

CREATE TRIGGER round_integration_binding BEFORE INSERT ON rounds WHEN NEW.integration_json IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM deliveries d JOIN reviews r ON r.delivery_id=d.id JOIN publication_requests p ON p.delivery_id=d.id
  WHERE d.id=json_extract(NEW.integration_json,'$.source_delivery_id') AND d.attempt_id=NEW.attempt_id
    AND d.round_number=NEW.round_number-1 AND r.state='approved' AND r.independence_state='valid'
    AND d.content_identity=json_extract(NEW.integration_json,'$.source_content_identity') AND d.git_ref=json_extract(NEW.integration_json,'$.source_ref')
    AND p.operation_id=json_extract(NEW.integration_json,'$.operation_id') AND p.attempt_id=NEW.attempt_id
    AND p.state IN ('accepted','running') AND p.authorized_mode IN ('commit','pr')
    AND json_extract(NEW.integration_json,'$.format_version')=1
) BEGIN SELECT RAISE(ABORT,'INTEGRATION_BINDING_INVALID'); END;

CREATE TRIGGER project_storage_location_delete_authorized
BEFORE DELETE ON project_storage_locations
WHEN factory_project_deletion_row_allowed('project_storage_locations',json_array(OLD.id),
  (SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state)
   FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_AUTHORIZATION_REQUIRED'); END;

CREATE TRIGGER project_storage_transition_delete_authorized
BEFORE DELETE ON project_storage_transitions
WHEN factory_project_deletion_row_allowed('project_storage_transitions',json_array(OLD.operation_id),
  (SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state)
   FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_AUTHORIZATION_REQUIRED'); END;

CREATE INDEX attempts_account_issue_number_created
  ON attempts(account_id, issue_number, created_at_ms DESC, id DESC);

CREATE TRIGGER attempt_search_headers_insert_valid BEFORE INSERT ON attempts
WHEN NEW.issue_number IS NULL OR NEW.issue_title IS NULL
  OR NEW.issue_number IS NOT json_extract(NEW.capture_json,'$.issue.number')
  OR NEW.issue_title IS NOT json_extract(NEW.capture_json,'$.issue.title')
BEGIN SELECT RAISE(ABORT,'ATTEMPT_HEADER_INVALID'); END;

CREATE TRIGGER attempt_search_headers_immutable BEFORE UPDATE OF issue_number,issue_title ON attempts
WHEN NOT (
  OLD.issue_number IS NULL AND OLD.issue_title IS NULL
  AND NEW.issue_number IS NOT NULL AND NEW.issue_title IS NOT NULL
  AND NEW.issue_number IS json_extract(NEW.capture_json,'$.issue.number')
  AND NEW.issue_title IS json_extract(NEW.capture_json,'$.issue.title')
)
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE UNIQUE INDEX attempt_stage_open ON attempt_stage_intervals(attempt_id) WHERE ended_at_ms IS NULL;

CREATE INDEX attempt_stage_history ON attempt_stage_intervals(attempt_id,started_at_ms);

CREATE VIEW attempt_stage_state AS SELECT a.id AS attempt_id,
  CASE WHEN a.result IS NOT NULL THEN 'finished' WHEN a.suspension='TRACKING_LOST' THEN 'tracking_lost'
    WHEN a.suspension IS NOT NULL THEN 'waiting_decision' ELSE a.phase END AS stage,
  r.round_number,r.delivery_version
  FROM attempts a LEFT JOIN rounds r ON r.attempt_id=a.id
    AND r.round_number=(SELECT max(rr.round_number) FROM rounds rr WHERE rr.attempt_id=a.id);

CREATE TRIGGER attempt_stage_binding BEFORE INSERT ON attempt_stage_intervals
WHEN NOT EXISTS(SELECT 1 FROM events e WHERE e.seq=NEW.source_event_seq AND e.attempt_id=NEW.attempt_id
  AND e.occurred_at_ms=NEW.started_at_ms AND (e.context_round IS NULL OR e.context_round IS NEW.round_number))
  OR NOT EXISTS(SELECT 1 FROM attempt_stage_state s WHERE s.attempt_id=NEW.attempt_id AND s.stage=NEW.stage
    AND s.round_number IS NEW.round_number AND s.delivery_version IS NEW.delivery_version)
  OR EXISTS(SELECT 1 FROM attempt_stage_intervals i WHERE i.attempt_id=NEW.attempt_id
    AND (i.ended_at_ms IS NULL OR i.ended_at_ms>NEW.started_at_ms))
BEGIN SELECT RAISE(ABORT,'STAGE_EVENT_INVALID'); END;

CREATE TRIGGER attempt_stage_update BEFORE UPDATE ON attempt_stage_intervals
WHEN OLD.ended_at_ms IS NOT NULL OR NEW.id IS NOT OLD.id OR NEW.attempt_id IS NOT OLD.attempt_id
  OR NEW.round_number IS NOT OLD.round_number OR NEW.delivery_version IS NOT OLD.delivery_version
  OR NEW.stage IS NOT OLD.stage OR NEW.source_event_seq IS NOT OLD.source_event_seq
  OR NEW.started_at_ms IS NOT OLD.started_at_ms OR NEW.revision<>OLD.revision+1
  OR (OLD.last_activity_at_ms IS NOT NULL AND (NEW.last_activity_at_ms IS NULL OR NEW.last_activity_at_ms<OLD.last_activity_at_ms))
  OR (NEW.last_activity_at_ms IS NOT OLD.last_activity_at_ms AND NOT EXISTS(
    SELECT 1 FROM events e WHERE e.attempt_id=NEW.attempt_id AND e.occurred_at_ms=NEW.last_activity_at_ms
      AND e.seq>=NEW.source_event_seq AND e.event_type IN ('passage-ready','result-accepted','check.completed','capture.captured','question-raised','question-answer-receipt','publication.completed')))
  OR (NEW.ended_at_ms IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM events e WHERE e.attempt_id=NEW.attempt_id AND e.occurred_at_ms=NEW.ended_at_ms AND e.seq>NEW.source_event_seq))
BEGIN SELECT RAISE(ABORT,'STAGE_INTERVAL_INVALID'); END;

CREATE TRIGGER attempt_stage_delete BEFORE DELETE ON attempt_stage_intervals
WHEN factory_project_deletion_row_allowed('attempt_stage_intervals',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE INDEX notification_dispatches_event_consumer ON notification_dispatches(event_seq,consumer_id);

CREATE TRIGGER notification_dispatch_insert BEFORE INSERT ON notification_dispatches
WHEN NEW.state<>'reserved' OR NEW.revision<>1 OR NEW.updated_at_ms<>NEW.created_at_ms
  OR NEW.reason IS NOT NULL OR NEW.dispatched_at_ms IS NOT NULL
  OR NOT EXISTS(SELECT 1 FROM notification_events e JOIN factory_settings s ON s.id='local'
    WHERE e.seq=NEW.event_seq AND e.event_kind IS NOT NULL AND e.eligible=1
      AND e.installation_id=NEW.installation_id AND s.installation_id=NEW.installation_id AND e.account_id IS s.account_id)
BEGIN SELECT RAISE(ABORT,'NOTIFICATION_EVENT_INVALID'); END;

CREATE TRIGGER notification_dispatch_update BEFORE UPDATE ON notification_dispatches
WHEN NEW.installation_id IS NOT OLD.installation_id OR NEW.consumer_id IS NOT OLD.consumer_id
  OR NEW.surface IS NOT OLD.surface OR NEW.event_seq IS NOT OLD.event_seq OR NEW.dispatch_id IS NOT OLD.dispatch_id
  OR NEW.created_at_ms<>OLD.created_at_ms OR NEW.updated_at_ms<OLD.updated_at_ms OR NEW.revision<>OLD.revision+1
  OR NOT ((OLD.state='reserved' AND NEW.state IN ('confirmed','uncertain','unavailable'))
    OR (OLD.state='uncertain' AND NEW.state IN ('confirmed','unavailable')))
BEGIN SELECT RAISE(ABORT,'NOTIFICATION_TRANSITION_INVALID'); END;

CREATE TRIGGER notification_dispatch_delete BEFORE DELETE ON notification_dispatches
WHEN factory_project_deletion_row_allowed('notification_dispatches',json_array(OLD.installation_id,OLD.consumer_id,OLD.surface,OLD.event_seq),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE INDEX shutdown_control_order ON operation_requests(installation_id,
  json_extract(receipt_json,'$.shutdown.generation') DESC,json_extract(receipt_json,'$.shutdown.controlRevision') DESC)
  WHERE operation_kind IN ('shutdown.pause_starts','shutdown.close_when_idle','shutdown.resume_starts','shutdown.restore','shutdown.commit');

CREATE TRIGGER shutdown_receipt_immutable BEFORE UPDATE OF receipt_json ON operation_requests
WHEN OLD.operation_kind IN ('shutdown.pause_starts','shutdown.close_when_idle','shutdown.resume_starts','shutdown.restore','shutdown.commit')
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER shutdown_final_barrier BEFORE INSERT ON operation_requests
WHEN NEW.operation_kind<>'shutdown.restore' AND coalesce((SELECT json_extract(receipt_json,'$.shutdown.closingCommitted')
  FROM operation_requests WHERE installation_id=NEW.installation_id
    AND operation_kind IN ('shutdown.pause_starts','shutdown.close_when_idle','shutdown.resume_starts','shutdown.restore','shutdown.commit')
  ORDER BY json_extract(receipt_json,'$.shutdown.generation') DESC,json_extract(receipt_json,'$.shutdown.controlRevision') DESC LIMIT 1),0)=1
BEGIN SELECT RAISE(ABORT,'SHUTDOWN_CLOSING'); END;

CREATE TRIGGER shutdown_start_barrier BEFORE INSERT ON operation_requests
WHEN NEW.operation_kind='attempt.start' AND coalesce((SELECT json_extract(receipt_json,'$.shutdown.startsPaused')
  FROM operation_requests WHERE installation_id=NEW.installation_id
    AND operation_kind IN ('shutdown.pause_starts','shutdown.close_when_idle','shutdown.resume_starts','shutdown.restore','shutdown.commit')
  ORDER BY json_extract(receipt_json,'$.shutdown.generation') DESC,json_extract(receipt_json,'$.shutdown.controlRevision') DESC LIMIT 1),0)=1
BEGIN SELECT RAISE(ABORT,'SHUTDOWN_STARTS_PAUSED'); END;

CREATE UNIQUE INDEX delivery_targets_repository_branch ON delivery_targets(repository_id,branch_ref)
WHERE coalesce(json_extract(local_identity_json,'$.branch_kind'),'new') <> 'existing';

CREATE INDEX delivery_targets_existing_branch_base ON delivery_targets(repository_id,branch_ref,base_sha)
WHERE json_extract(local_identity_json,'$.branch_kind') = 'existing';

CREATE INDEX project_creations_scope ON project_creations(installation_id,account_id,created_at_ms,id);

CREATE INDEX project_creations_destination ON project_creations(destination);

CREATE UNIQUE INDEX project_creations_reserved_destination ON project_creations(destination) WHERE state<>'failed';

CREATE TRIGGER creation_identity BEFORE UPDATE ON project_creations
WHEN NEW.id<>OLD.id OR NEW.operation_id<>OLD.operation_id OR NEW.installation_id<>OLD.installation_id
  OR NEW.account_id IS NOT OLD.account_id OR NEW.plan_hash<>OLD.plan_hash OR NEW.plan_json<>OLD.plan_json
  OR NEW.destination<>OLD.destination OR NEW.created_at_ms<>OLD.created_at_ms
  OR OLD.state='completed' OR NEW.revision<>OLD.revision+1
  OR (OLD.state IN ('partial','failed') AND NEW.state NOT IN ('partial','failed','completed'))
  OR (OLD.baseline_sha IS NOT NULL AND (NEW.baseline_sha IS NOT OLD.baseline_sha OR NEW.baseline_ref IS NOT OLD.baseline_ref))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CREATION'); END;

CREATE TRIGGER creation_delete BEFORE DELETE ON project_creations
WHEN factory_project_deletion_row_allowed('project_creations',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CREATION'); END;

CREATE TRIGGER creation_board_completion_guard BEFORE UPDATE OF state ON project_creations
WHEN NEW.state='completed' AND OLD.state<>'completed' AND json_extract(OLD.plan_json,'$.input.creationMode')<>'local'
 AND ((SELECT count(*) FROM creation_board_operations b WHERE b.creation_id=OLD.id AND b.state='confirmed'
       AND b.kind IN ('create_board','configure_status','link_repository','configure_view','verify_board'))<>5
   OR (SELECT count(DISTINCT b.kind) FROM creation_board_operations b WHERE b.creation_id=OLD.id AND b.state='confirmed'
       AND b.kind IN ('create_board','configure_status','link_repository','configure_view','verify_board'))<>5)
BEGIN SELECT RAISE(ABORT,'CREATION_BOARD_INCOMPLETE'); END;

CREATE INDEX reviews_attempt ON reviews(attempt_id,created_at_ms,id);

CREATE TRIGGER review_role_binding BEFORE INSERT ON reviews WHEN NOT EXISTS (
  SELECT 1 FROM deliveries d JOIN passages p ON p.id=NEW.passage_id
  JOIN passages producer ON producer.id=NEW.implementer_passage_id
  JOIN passage_results result ON result.passage_id=producer.id AND result.attempt_id=d.attempt_id
  JOIN attempts a ON a.id=d.attempt_id
  WHERE d.id=NEW.delivery_id AND d.attempt_id=NEW.attempt_id AND d.capture_state='captured'
    AND d.content_identity=NEW.content_identity AND d.producer_passage_id=producer.id
    AND producer.role='implementer' AND producer.attempt_id=d.attempt_id
    AND producer.round_number=d.round_number AND producer.delivery_version=d.id
    AND producer.state='ready' AND producer.tracking_state='tracked'
    AND p.role='reviewer' AND p.attempt_id=d.attempt_id AND p.round_number=d.round_number AND p.delivery_version=d.id
    AND a.result IS NULL
    AND d.round_number=(SELECT max(round_number) FROM rounds WHERE attempt_id=a.id)
    AND NEW.state='pending' AND NEW.independence_state='pending'
    AND json_extract(result.summary_json,'$.writesStopped')=1
    AND json_extract(result.summary_json,'$.formatVersion')=1
    AND length(trim(json_extract(result.summary_json,'$.summary'))) BETWEEN 1 AND 8192
    AND json_type(result.summary_json,'$.checks')='array'
    AND json_array_length(result.summary_json,'$.checks')<=50
    AND EXISTS (SELECT 1 FROM attempt_criteria WHERE attempt_id=d.attempt_id)
    AND NOT EXISTS (SELECT 1 FROM attempt_criteria c WHERE c.attempt_id=d.attempt_id AND NOT EXISTS (
      SELECT 1 FROM criterion_results cr WHERE cr.passage_id=producer.id AND cr.attempt_id=d.attempt_id AND cr.criterion_id=c.criterion_id))
) BEGIN SELECT RAISE(ABORT,'REVIEW_BINDING_INVALID'); END;

CREATE TRIGGER review_identity BEFORE UPDATE OF id,delivery_id,attempt_id,passage_id,implementer_passage_id,content_identity,created_at_ms ON reviews
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER review_approval_guard BEFORE UPDATE OF state ON reviews WHEN NEW.state='approved' AND (
  NEW.independence_state<>'valid'
  OR NOT EXISTS (SELECT 1 FROM passage_results result JOIN passages p ON p.id=result.passage_id
    JOIN deliveries d ON d.id=NEW.delivery_id
    WHERE result.passage_id=NEW.passage_id AND result.attempt_id=NEW.attempt_id
      AND p.role='reviewer' AND p.attempt_id=d.attempt_id AND p.round_number=d.round_number AND p.delivery_version=d.id
      AND json_extract(result.summary_json,'$.verdict')='approved')
  OR NOT EXISTS (SELECT 1 FROM attempt_criteria WHERE attempt_id=NEW.attempt_id)
  OR (SELECT count(*) FROM criterion_results WHERE passage_id=NEW.passage_id)<>
     (SELECT count(*) FROM attempt_criteria WHERE attempt_id=NEW.attempt_id)
  OR EXISTS (SELECT 1 FROM attempt_criteria a WHERE a.attempt_id=NEW.attempt_id AND NOT EXISTS (
    SELECT 1 FROM criterion_results c WHERE c.passage_id=NEW.passage_id AND c.attempt_id=a.attempt_id
      AND c.criterion_id=a.criterion_id AND c.verdict='passed' AND json_array_length(c.evidence_json)>0))
  OR EXISTS (SELECT 1 FROM criterion_results c,json_each(c.evidence_json) e WHERE c.passage_id=NEW.passage_id
    AND (e.type<>'text' OR length(trim(e.value)) NOT BETWEEN 1 AND 4096
      OR e.value GLOB 'artifact:*' OR (length(trim(e.value)) IN (40,64) AND trim(e.value) NOT GLOB '*[^0-9a-fA-F]*')))
  OR EXISTS (SELECT 1 FROM findings WHERE review_id=NEW.id AND blocking=1)
  OR EXISTS (SELECT 1 FROM findings f JOIN reviews r ON r.id=f.review_id JOIN deliveries old ON old.id=r.delivery_id
    JOIN deliveries current ON current.id=NEW.delivery_id
    WHERE f.attempt_id=NEW.attempt_id AND f.blocking=1 AND old.round_number<current.round_number AND NOT EXISTS (
      SELECT 1 FROM finding_resolutions x JOIN reviews xr ON xr.id=x.review_id JOIN deliveries xd ON xd.id=xr.delivery_id
      WHERE x.finding_id=f.id AND x.verdict='resolved' AND xr.independence_state='valid'
        AND xd.round_number<=current.round_number))
) BEGIN SELECT RAISE(ABORT,'REVIEW_APPROVAL_INVALID'); END;

CREATE TRIGGER assessment_evidence BEFORE INSERT ON finding_assessments WHEN
  EXISTS (SELECT 1 FROM json_each(NEW.evidence_json) e WHERE e.type<>'text' OR length(trim(e.value)) NOT BETWEEN 1 AND 4096
    OR lower(trim(e.value)) GLOB 'artifact:*' OR (length(trim(e.value)) IN (40,64) AND trim(e.value) NOT GLOB '*[^0-9a-fA-F]*'))
  OR NOT EXISTS (
    SELECT 1 FROM reviews r JOIN deliveries d ON d.id=r.delivery_id
    JOIN passages producer ON producer.id=r.implementer_passage_id
    JOIN passages reviewer ON reviewer.id=r.passage_id
    JOIN passage_results rr ON rr.passage_id=reviewer.id AND rr.attempt_id=r.attempt_id
    JOIN json_each(rr.summary_json,'$.assessments') item
    WHERE r.id=NEW.review_id AND r.attempt_id=NEW.attempt_id AND r.independence_state='valid'
      AND d.capture_state='captured' AND d.content_identity=r.content_identity AND d.attempt_id=r.attempt_id
      AND producer.id=d.producer_passage_id AND producer.role='implementer' AND reviewer.role='reviewer'
      AND producer.attempt_id=d.attempt_id AND reviewer.attempt_id=d.attempt_id
      AND producer.round_number=d.round_number AND reviewer.round_number=d.round_number
      AND producer.delivery_version=d.id AND reviewer.delivery_version=d.id
      AND json_extract(item.value,'$.findingId')=NEW.finding_id
      AND json_extract(item.value,'$.progress')=NEW.progress
      AND json_extract(item.value,'$.justification')=NEW.justification
      AND json_extract(item.value,'$.evidence')=json(NEW.evidence_json)
  )
  OR (NEW.progress IN ('proven','partial') AND (
    json_array_length(NEW.evidence_json)=0
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.evidence_json) e WHERE e.value GLOB 'artifact:*'
        OR (length(trim(e.value)) IN (40,64) AND trim(e.value) NOT GLOB '*[^0-9a-fA-F]*')
        OR NOT EXISTS (SELECT 1 FROM reviews r JOIN criterion_results c ON c.passage_id=r.passage_id
          JOIN json_each(c.evidence_json) ce JOIN findings f ON f.id=NEW.finding_id
          WHERE r.id=NEW.review_id AND c.attempt_id=NEW.attempt_id AND ce.value=e.value
            AND (json_array_length(f.criterion_ids_json)=0 OR c.criterion_id IN (SELECT value FROM json_each(f.criterion_ids_json))))
    )
  )) BEGIN SELECT RAISE(ABORT,'ASSESSMENT_EVIDENCE_INVALID'); END;

CREATE TRIGGER review_assessments_complete BEFORE UPDATE OF state ON reviews
WHEN NEW.state<>'pending' AND NEW.independence_state='valid' AND EXISTS (
  SELECT 1 FROM findings f JOIN reviews origin ON origin.id=f.review_id
  JOIN deliveries source ON source.id=origin.delivery_id
  JOIN deliveries current ON current.id=NEW.delivery_id
  WHERE f.attempt_id=NEW.attempt_id AND f.origin_finding_id IS NULL
    AND source.round_number<current.round_number
    AND NOT EXISTS (
      SELECT 1 FROM finding_resolutions x JOIN reviews resolution ON resolution.id=x.review_id
      JOIN deliveries resolved ON resolved.id=resolution.delivery_id
      WHERE x.finding_id=f.id AND x.verdict='resolved' AND resolution.independence_state='valid'
        AND resolved.round_number<current.round_number
    )
    AND NOT EXISTS (SELECT 1 FROM finding_assessments a WHERE a.finding_id=f.id AND a.review_id=NEW.id AND a.attempt_id=NEW.attempt_id)
) BEGIN SELECT RAISE(ABORT,'ASSESSMENT_EVIDENCE_INVALID'); END;

CREATE TRIGGER review_history BEFORE UPDATE ON reviews WHEN OLD.state<>'pending'
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER review_delete BEFORE DELETE ON reviews
WHEN factory_project_deletion_row_allowed('reviews',json_array(OLD.id),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER review_disputes_complete BEFORE UPDATE OF state ON reviews WHEN NEW.state<>'pending' AND NEW.independence_state='valid' AND EXISTS (
  SELECT 1 FROM finding_disputes t JOIN passages p ON p.id=t.passage_id JOIN deliveries d ON d.id=NEW.delivery_id
  WHERE t.attempt_id=NEW.attempt_id AND t.response_review_id IS NULL AND p.round_number<=d.round_number
) BEGIN SELECT RAISE(ABORT,'DISPUTE_RESPONSE_REQUIRED'); END;

CREATE TRIGGER project_deletion_targets_identity
BEFORE UPDATE OF operation_id,target_key,target_kind,authorized_path,normalized_path,resolved_path,object_kind,identity_json,owner_kind,owner_id ON project_deletion_targets
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;

CREATE TRIGGER project_deletion_targets_project_deletion_guard BEFORE DELETE ON project_deletion_targets
WHEN factory_project_deletion_row_allowed('project_deletion_targets',json_array(OLD.operation_id,OLD.target_key),(SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state) FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'PROJECT_DELETION_FINALIZATION_REQUIRED'); END;

CREATE TRIGGER attempt_stage_event AFTER INSERT ON events
WHEN NEW.attempt_id IS NOT NULL
  AND NEW.event_type NOT IN ('attempt.authority-observed','cleanup-updated','heartbeat')
  AND (NEW.context_round IS NULL OR NEW.context_round=(SELECT round_number FROM attempt_stage_state WHERE attempt_id=NEW.attempt_id))
  AND NEW.occurred_at_ms>=coalesce((SELECT max(coalesce(ended_at_ms,last_activity_at_ms,started_at_ms)) FROM attempt_stage_intervals WHERE attempt_id=NEW.attempt_id),0)
BEGIN
  UPDATE attempt_stage_intervals SET ended_at_ms=NEW.occurred_at_ms,
    last_activity_at_ms=CASE WHEN NEW.event_type IN ('passage-ready','result-accepted','capture.captured','question-raised','question-answer-receipt','publication.completed') THEN NEW.occurred_at_ms ELSE last_activity_at_ms END,
    revision=revision+1
    WHERE attempt_id=NEW.attempt_id AND ended_at_ms IS NULL AND EXISTS (
      SELECT 1 FROM attempt_stage_state s WHERE s.attempt_id=NEW.attempt_id AND
        (s.stage<>attempt_stage_intervals.stage OR s.round_number IS NOT attempt_stage_intervals.round_number OR s.delivery_version IS NOT attempt_stage_intervals.delivery_version));
  INSERT INTO attempt_stage_intervals(id,attempt_id,round_number,delivery_version,stage,source_event_seq,started_at_ms)
    SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-8'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),
      s.attempt_id,s.round_number,s.delivery_version,s.stage,NEW.seq,NEW.occurred_at_ms FROM attempt_stage_state s
    WHERE s.attempt_id=NEW.attempt_id AND s.stage<>'finished'
      AND NOT EXISTS(SELECT 1 FROM attempt_stage_intervals i WHERE i.attempt_id=s.attempt_id AND i.ended_at_ms IS NULL)
      AND (EXISTS(SELECT 1 FROM attempt_stage_intervals i WHERE i.attempt_id=s.attempt_id)
        OR NEW.event_type IN ('attempt.accepted','passage-ready','review.planned','publication.running'));
  UPDATE attempt_stage_intervals SET last_activity_at_ms=NEW.occurred_at_ms,revision=revision+1
    WHERE attempt_id=NEW.attempt_id AND ended_at_ms IS NULL
      AND NEW.event_type IN ('passage-ready','result-accepted','capture.captured','question-raised','question-answer-receipt','publication.completed');
  UPDATE attempt_stage_intervals SET deadline_at_ms=(
    SELECT max(NEW.occurred_at_ms,min(q.created_at_ms+q.ttl_ms)) FROM execution_questions q WHERE q.attempt_id=NEW.attempt_id
      AND q.state NOT IN ('delivered','cancelled') AND q.ttl_ms IS NOT NULL),revision=revision+1
    WHERE attempt_id=NEW.attempt_id AND ended_at_ms IS NULL AND stage='waiting_decision' AND NEW.event_type='question-raised';
  UPDATE attempt_stage_intervals SET deadline_at_ms=(
    SELECT max(NEW.occurred_at_ms,m.checkpoint_ms+max(0,json_extract(a.capture_json,'$.configuration.timeDefaults.passageActiveTimeMs')-m.active_ms))
      FROM passages p JOIN passage_measurements m ON m.passage_id=p.id JOIN attempts a ON a.id=p.attempt_id
      WHERE p.attempt_id=NEW.attempt_id AND p.round_number=NEW.context_round AND p.role=NEW.context_role
        AND m.mode='active' AND m.observed=1),revision=revision+1
    WHERE attempt_id=NEW.attempt_id AND ended_at_ms IS NULL AND stage IN ('implementing','reviewing')
      AND NEW.event_type IN ('passage-ready','question-answer-receipt');
END;

CREATE VIEW notification_events AS SELECT e.seq,e.attempt_id,a.project_id,o.installation_id,o.account_id,
  CASE WHEN e.event_type='question-raised' THEN 'question_pending'
    WHEN e.event_type IN ('attempt.icr-completed','attempt.commit-completed','attempt.pr-completed') THEN 'completion'
    WHEN e.event_type IN ('dispatch.failed','workspace.failed','capture.failed','review.workspace.partial',
      'attempt.failed','attempt.blocked','active-time.expired','question.expired','tracking-lost','publication.failed','publication.partial') THEN 'failure'
    ELSE NULL END AS event_kind,
  CASE WHEN e.event_type='question-raised' THEN
    a.result IS NULL AND a.suspension='HUMAN_DECISION'
      AND e.context_round=(SELECT max(r.round_number) FROM rounds r WHERE r.attempt_id=a.id) AND EXISTS(
      SELECT 1 FROM execution_questions q JOIN passages p ON p.id=q.passage_id
      WHERE q.attempt_id=a.id AND q.state='pending' AND p.round_number=e.context_round AND p.role=e.context_role
        AND (q.ttl_ms IS NULL OR q.created_at_ms+q.ttl_ms>e.occurred_at_ms)
        AND e.seq=(SELECT max(qe.seq) FROM events qe WHERE qe.attempt_id=a.id AND qe.event_type='question-raised'
          AND qe.context_round=e.context_round AND qe.context_role=e.context_role))
    WHEN e.event_type IN ('attempt.icr-completed','attempt.commit-completed','attempt.pr-completed') THEN a.result='delivered'
    ELSE a.result IN ('failed','rejected') OR (a.result IS NULL AND a.suspension IS NOT NULL) END AS eligible
  FROM events e JOIN operation_requests o ON o.operation_id=e.operation_id JOIN attempts a ON a.id=e.attempt_id
  WHERE o.account_id=a.account_id AND (e.project_id IS NULL OR e.project_id=a.project_id);

CREATE TABLE attempt_workspace_snapshots (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE RESTRICT,
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0)
) STRICT;

CREATE TRIGGER attempt_workspace_snapshot_insert_guard BEFORE INSERT ON attempt_workspace_snapshots
WHEN NOT EXISTS (
  SELECT 1 FROM attempts a
  WHERE a.id=NEW.attempt_id AND a.phase='preparing' AND a.result IS NULL AND a.suspension IS NULL
    AND json_extract(a.capture_json,'$.workspace.initial_state.kind')='pending_inherited_attempt'
    AND json_extract(NEW.snapshot_json,'$.identity.project_id')=a.project_id
    AND json_extract(NEW.snapshot_json,'$.identity.repository_id')=a.repository_id
    AND json_extract(NEW.snapshot_json,'$.identity.issue_id')=a.issue_id
    AND json_extract(NEW.snapshot_json,'$.predecessor_attempt_id')=json_extract(a.capture_json,'$.workspace.predecessor_attempt_id')
    AND json_extract(NEW.snapshot_json,'$.initial_state.kind')='inherited_attempt'
    AND json_extract(NEW.snapshot_json,'$.initial_state.source_attempt_id')=json_extract(a.capture_json,'$.workspace.predecessor_attempt_id')
    AND json_extract(NEW.snapshot_json,'$.inherited_base_sha') IS json_extract(a.capture_json,'$.workspace.inherited_base_sha')
    AND json_extract(NEW.snapshot_json,'$.comparison_base_sha')=json_extract(NEW.snapshot_json,'$.initial_state.content_identity')
    AND EXISTS (SELECT 1 FROM resources r WHERE r.attempt_id=a.id AND r.kind='implementation' AND r.launch_state='starting')
)
BEGIN SELECT RAISE(ABORT,'WORKSPACE_SNAPSHOT_INVALID'); END;

CREATE TRIGGER attempt_workspace_snapshot_update_immutable BEFORE UPDATE ON attempt_workspace_snapshots
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER attempt_workspace_snapshots_delete_guard BEFORE DELETE ON attempt_workspace_snapshots
WHEN factory_project_deletion_row_allowed('attempt_workspace_snapshots',json_array(OLD.attempt_id),
  (SELECT json_object('operation_id',operation_id,'project_id',project_id,'worker_generation',worker_generation,'worker_token',worker_token,'state',state)
   FROM project_deletions WHERE operation_id=factory_project_deletion_operation())) IS NOT 1
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
