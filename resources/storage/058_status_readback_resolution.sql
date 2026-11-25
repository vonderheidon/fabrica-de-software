-- A complete readback that still shows the previous Status option proves that an
-- unconfirmed project_status write was not applied, so it may become failed_known.
DROP TRIGGER effect_transition;
CREATE TRIGGER effect_transition BEFORE UPDATE OF state ON effects WHEN NOT (
  (OLD.state='not_started' AND NEW.state IN ('running','failed_known','not_applicable')) OR
  (OLD.state='running' AND NEW.state IN ('confirmed','failed_known','unknown','not_applicable')) OR
  (OLD.state='unknown' AND NEW.state IN ('confirmed','failed_known','not_applicable') AND (NEW.state<>'failed_known' OR OLD.kind='local_commit' OR
    (OLD.kind='project_status' AND NEW.reason='STATUS_NOT_OBSERVED'))) OR
  (OLD.state='failed_known' AND NEW.state IN ('running','not_applicable'))
) BEGIN SELECT RAISE(ABORT,'EFFECT_TRANSITION_INVALID'); END;
