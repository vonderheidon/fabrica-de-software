DROP TRIGGER passage_source_binding;
CREATE TRIGGER passage_source_binding BEFORE INSERT ON passages
WHEN NEW.session_source_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM passages p JOIN attempt_sessions s ON s.id=p.attempt_session_id
  WHERE p.id=NEW.session_source_id AND p.attempt_id=NEW.attempt_id AND p.role=NEW.role
    AND p.round_number=NEW.round_number-1 AND p.attempt_session_id=NEW.attempt_session_id
    AND s.attempt_id=NEW.attempt_id AND s.role=NEW.role AND s.state='completed'
    AND p.state='ready' AND p.tracking_state='tracked'
    AND EXISTS (SELECT 1 FROM passage_results r WHERE r.passage_id=p.id)
) BEGIN SELECT RAISE(ABORT,'CONTINUATION_BINDING_INVALID'); END;

-- Losing continuity is irreversible, even if the terminal is found or stopped later.
CREATE TRIGGER attempt_session_continuity_lost BEFORE UPDATE OF state ON attempt_sessions
WHEN OLD.state IN ('uncertain','interrupted') AND NEW.state NOT IN ('uncertain','interrupted')
BEGIN SELECT RAISE(ABORT,'SESSION_CONTINUITY_LOST'); END;

CREATE TRIGGER managed_terminal_live_conversation BEFORE UPDATE OF generation ON managed_terminals
WHEN NEW.generation<>OLD.generation AND EXISTS (
  SELECT 1 FROM attempt_sessions s JOIN attempts a ON a.id=s.attempt_id
  WHERE s.managed_terminal_id=OLD.id AND a.result IS NULL AND s.terminal_generation=OLD.generation
) BEGIN SELECT RAISE(ABORT,'TERMINAL_CONVERSATION_IN_USE'); END;
