ALTER TABLE attempts ADD COLUMN issue_number INTEGER
  CHECK(issue_number IS NULL OR issue_number > 0);
ALTER TABLE attempts ADD COLUMN issue_title TEXT
  CHECK(issue_title IS NULL OR length(issue_title) <= 65536);

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
