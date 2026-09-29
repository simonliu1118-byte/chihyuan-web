-- CY Web direct Identity Employee -> Module Access
--
-- CY Web itself is the mandatory account shell and is not revocable for a valid
-- CYCloud Identity Employee. Business-module entry is a separate CY Web-local
-- authority. The legacy app-tag tables are retained for history/transition, but
-- new authorization reads this direct table.

CREATE TABLE identity_module_access (
    identity_employee_id TEXT NOT NULL CHECK (length(trim(identity_employee_id)) > 0),
    module_code TEXT NOT NULL CHECK (length(trim(module_code)) > 0 AND length(module_code) <= 64),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (identity_employee_id, module_code)
);

CREATE INDEX idx_identity_module_access_module
    ON identity_module_access(module_code, enabled, identity_employee_id);

-- Preserve any existing tag-derived module entry when moving to the simpler
-- direct model. This is a one-time compatibility projection; later tag changes
-- do not authorize modules.
INSERT INTO identity_module_access(
    identity_employee_id,
    module_code,
    enabled,
    created_at,
    updated_at
)
SELECT DISTINCT
       m.identity_employee_id,
       tm.module_code,
       1,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM app_members m
  JOIN app_member_tags mt ON mt.member_id = m.id
  JOIN app_tags t ON t.id = mt.tag_id AND t.is_active = 1
  JOIN app_tag_modules tm ON tm.tag_id = t.id
ON CONFLICT(identity_employee_id, module_code) DO UPDATE SET
  enabled = 1,
  updated_at = excluded.updated_at;
