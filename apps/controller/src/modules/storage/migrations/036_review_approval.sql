ALTER TABLE checks ADD COLUMN repeat_reason TEXT CHECK(repeat_reason IS NULL OR (length(trim(repeat_reason))>0 AND length(repeat_reason)<=8192));
CREATE TRIGGER check_repeat_reason_immutable BEFORE UPDATE OF repeat_reason ON checks
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER check_repeat_reason_required BEFORE INSERT ON checks WHEN NEW.repeat_reason IS NULL AND EXISTS (
  SELECT 1 FROM checks c JOIN artifacts a ON a.check_id=c.id
  WHERE c.delivery_id=NEW.delivery_id AND c.content_identity=NEW.content_identity
    AND c.command=NEW.command AND c.cwd_relative=NEW.cwd_relative AND c.state='passed'
) BEGIN SELECT RAISE(ABORT,'CHECK_REPEAT_REASON_REQUIRED'); END;
CREATE TRIGGER review_complete_approval_guard BEFORE UPDATE OF state ON reviews WHEN NEW.state='approved' AND (
  NOT EXISTS (SELECT 1 FROM passage_results p WHERE p.passage_id=NEW.passage_id AND json_extract(p.summary_json,'$.verdict')='approved')
  OR EXISTS (SELECT 1 FROM attempt_criteria a WHERE a.attempt_id=NEW.attempt_id AND NOT EXISTS (
    SELECT 1 FROM criterion_results c WHERE c.passage_id=NEW.passage_id AND c.criterion_id=a.criterion_id AND c.verdict='passed'
      AND json_array_length(c.evidence_json)>0
  ))
  OR EXISTS (SELECT 1 FROM findings f JOIN reviews r ON r.id=f.review_id JOIN deliveries d ON d.id=r.delivery_id
    JOIN deliveries current ON current.id=NEW.delivery_id
    WHERE f.attempt_id=NEW.attempt_id AND f.blocking=1 AND d.round_number<current.round_number AND NOT EXISTS (
      SELECT 1 FROM finding_resolutions x JOIN reviews xr ON xr.id=x.review_id JOIN deliveries xd ON xd.id=xr.delivery_id
      WHERE x.finding_id=f.id AND x.verdict='resolved' AND xr.independence_state='valid' AND xd.round_number<=current.round_number
    ))
) BEGIN SELECT RAISE(ABORT,'REVIEW_APPROVAL_INVALID'); END;
