CREATE UNIQUE INDEX delivery_attempt_version ON deliveries(id,attempt_id,content_identity);
CREATE TABLE verification_runs (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  content_identity TEXT NOT NULL,
  run_number INTEGER NOT NULL CHECK(run_number>=1),
  state TEXT NOT NULL CHECK(state IN ('running','passed','failed','error','not_applicable')),
  diagnostic TEXT,
  started_at_ms INTEGER NOT NULL CHECK(started_at_ms>=0),
  ended_at_ms INTEGER CHECK(ended_at_ms>=started_at_ms),
  UNIQUE(delivery_id,run_number),
  UNIQUE(id,delivery_id,attempt_id,content_identity,run_number),
  FOREIGN KEY(delivery_id,attempt_id,content_identity) REFERENCES deliveries(id,attempt_id,content_identity) ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX verification_one_running ON verification_runs(delivery_id) WHERE state='running';
CREATE TABLE checks (
  id TEXT PRIMARY KEY,
  verification_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  content_identity TEXT NOT NULL,
  check_definition_id TEXT NOT NULL,
  run_number INTEGER NOT NULL CHECK(run_number>=1),
  command TEXT NOT NULL,
  cwd_relative TEXT NOT NULL,
  timeout_ms INTEGER NOT NULL CHECK(timeout_ms>=1),
  state TEXT NOT NULL CHECK(state IN ('pending','running','passed','failed','error','not_applicable')),
  exit_code INTEGER,
  started_at_ms INTEGER,
  ended_at_ms INTEGER,
  duration_ms INTEGER CHECK(duration_ms>=0),
  diagnostic TEXT,
  execution_diagnostic TEXT,
  UNIQUE(delivery_id,check_definition_id,run_number),
  UNIQUE(id,attempt_id,delivery_id),
  FOREIGN KEY(verification_id,delivery_id,attempt_id,content_identity,run_number) REFERENCES verification_runs(id,delivery_id,attempt_id,content_identity,run_number) ON DELETE RESTRICT,
  CHECK(state<>'passed' OR (exit_code=0 AND started_at_ms IS NOT NULL AND ended_at_ms IS NOT NULL AND diagnostic IS NULL)),
  CHECK(state<>'failed' OR (exit_code IS NOT NULL AND exit_code<>0)),
  CHECK(state NOT IN ('error','not_applicable') OR diagnostic IS NOT NULL)
) STRICT;
CREATE INDEX checks_history ON checks(delivery_id,run_number,id);
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  check_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind='check_log'),
  path_relative TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL CHECK(length(sha256)=64 AND sha256 NOT GLOB '*[^a-f0-9]*'),
  size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 0 AND 1048576),
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(check_id,attempt_id,delivery_id) REFERENCES checks(id,attempt_id,delivery_id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX artifacts_attempt ON artifacts(attempt_id,check_id);
CREATE TRIGGER verification_identity BEFORE UPDATE ON verification_runs
WHEN OLD.id<>NEW.id OR OLD.delivery_id<>NEW.delivery_id OR OLD.attempt_id<>NEW.attempt_id OR OLD.content_identity<>NEW.content_identity OR OLD.run_number<>NEW.run_number OR OLD.started_at_ms<>NEW.started_at_ms OR OLD.state<>'running'
BEGIN SELECT RAISE(ABORT,'immutable verification'); END;
CREATE TRIGGER verification_history BEFORE DELETE ON verification_runs BEGIN SELECT RAISE(ABORT,'immutable verification'); END;
CREATE TRIGGER checks_identity BEFORE UPDATE ON checks
WHEN OLD.id<>NEW.id OR OLD.verification_id<>NEW.verification_id OR OLD.delivery_id<>NEW.delivery_id OR OLD.attempt_id<>NEW.attempt_id OR OLD.content_identity<>NEW.content_identity OR OLD.check_definition_id<>NEW.check_definition_id OR OLD.run_number<>NEW.run_number OR OLD.command<>NEW.command OR OLD.cwd_relative<>NEW.cwd_relative OR OLD.timeout_ms<>NEW.timeout_ms OR OLD.state NOT IN ('pending','running')
BEGIN SELECT RAISE(ABORT,'immutable check'); END;
CREATE TRIGGER checks_history_guard BEFORE DELETE ON checks BEGIN SELECT RAISE(ABORT,'immutable check'); END;
CREATE TRIGGER artifacts_update BEFORE UPDATE ON artifacts BEGIN SELECT RAISE(ABORT,'immutable artifact'); END;
CREATE TRIGGER artifacts_delete BEFORE DELETE ON artifacts BEGIN SELECT RAISE(ABORT,'immutable artifact'); END;
