ALTER TABLE events ADD COLUMN context_round INTEGER CHECK (context_round IS NULL OR context_round BETWEEN 1 AND 6);
ALTER TABLE events ADD COLUMN context_role TEXT CHECK (context_role IS NULL OR context_role IN ('implementer','reviewer'));
