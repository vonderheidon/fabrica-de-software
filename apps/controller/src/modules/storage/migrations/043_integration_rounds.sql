ALTER TABLE rounds ADD COLUMN integration_json TEXT CHECK(integration_json IS NULL OR (json_valid(integration_json) AND json_type(integration_json)='object'));
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
