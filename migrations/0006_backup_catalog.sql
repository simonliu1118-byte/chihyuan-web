-- App-owned catalog scope; old unknown-scope rows are not reassigned.
ALTER TABLE backup_sets ADD COLUMN workspace_scope TEXT NOT NULL DEFAULT '';
ALTER TABLE backup_sets ADD COLUMN app_version TEXT NOT NULL DEFAULT '';
ALTER TABLE backup_sets ADD COLUMN trigger_kind TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE backup_sets ADD COLUMN trigger_key TEXT;
CREATE UNIQUE INDEX idx_backup_sets_trigger ON backup_sets(workspace_scope, trigger_key)
    WHERE trigger_key IS NOT NULL;
ALTER TABLE backup_copies ADD COLUMN lease_until TEXT;
