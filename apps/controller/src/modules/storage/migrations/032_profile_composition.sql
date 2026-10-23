ALTER TABLE execution_profiles
ADD COLUMN composition_version INTEGER CHECK(composition_version IS NULL OR composition_version = 1);
