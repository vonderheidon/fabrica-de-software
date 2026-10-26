ALTER TABLE project_revisions ADD COLUMN delivery_branch_json TEXT CHECK(delivery_branch_json IS NULL OR json_valid(delivery_branch_json));
DROP INDEX delivery_targets_repository_branch;
CREATE UNIQUE INDEX delivery_targets_repository_branch ON delivery_targets(repository_id,branch_ref)
WHERE coalesce(json_extract(local_identity_json,'$.branch_kind'),'new') <> 'existing';
CREATE INDEX delivery_targets_existing_branch_base ON delivery_targets(repository_id,branch_ref,base_sha)
WHERE json_extract(local_identity_json,'$.branch_kind') = 'existing';
