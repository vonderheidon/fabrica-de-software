ALTER TABLE findings ADD COLUMN priority TEXT CHECK(priority IN ('critical','high','medium','low'));
ALTER TABLE findings ADD COLUMN origin_finding_id TEXT;

CREATE TRIGGER finding_origin_binding BEFORE INSERT ON findings
WHEN NEW.origin_finding_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM findings f JOIN reviews r ON r.id=f.review_id
  JOIN deliveries d ON d.id=r.delivery_id JOIN reviews nr ON nr.id=NEW.review_id
  JOIN deliveries nd ON nd.id=nr.delivery_id
  WHERE f.id=NEW.origin_finding_id AND f.attempt_id=NEW.attempt_id
    AND f.origin_finding_id IS NULL AND d.round_number<nd.round_number
)
BEGIN SELECT RAISE(ABORT,'FINDING_ORIGIN_INVALID'); END;
