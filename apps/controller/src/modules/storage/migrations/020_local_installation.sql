-- Operational paths belong to the resolved installation, never editable settings.
ALTER TABLE factory_settings DROP COLUMN data_root;
ALTER TABLE factory_settings DROP COLUMN maestri_settings_json;
