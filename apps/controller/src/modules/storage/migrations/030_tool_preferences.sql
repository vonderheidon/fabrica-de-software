ALTER TABLE factory_settings ADD COLUMN tool_preferences_json TEXT NOT NULL DEFAULT '{"format_version":1,"git":{"preferred_path":null,"last_validated_at_ms":null},"maestri":{"preferred_path":null,"last_validated_at_ms":null},"omp":{"preferred_path":null,"last_validated_at_ms":null},"powershell":{"preferred_path":null,"last_validated_at_ms":null}}'
  CHECK(json_valid(tool_preferences_json));
