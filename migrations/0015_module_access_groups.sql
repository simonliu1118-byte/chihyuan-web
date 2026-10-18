-- CY Web 權限群組 (BD-057, user 2026-10-18): a group holds a set of CY Web modules; a person
-- belongs to at most one group and then uses exactly that set, without individual edits.
-- Runtime authority stays app_member_module_access: group writes materialize every member's
-- grants in the same batch, so checkModuleAccess and requireModuleAccess are unchanged.
-- Leaving a group keeps the current grants as the person's own settings.
-- module_code has no CHECK list here: the catalog grows with new modules (ERP queries), and the
-- service accepts only isCyWebModuleCode values, so this table never needs a rebuild.

CREATE TABLE module_access_groups (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 60),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE module_access_group_modules (
    group_id INTEGER NOT NULL,
    module_code TEXT NOT NULL CHECK (length(module_code) BETWEEN 1 AND 64),
    PRIMARY KEY (group_id, module_code),
    FOREIGN KEY (group_id) REFERENCES module_access_groups(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE app_member_module_groups (
    member_id INTEGER PRIMARY KEY,
    group_id INTEGER NOT NULL,
    assigned_at TEXT NOT NULL,
    assigned_by INTEGER,
    FOREIGN KEY (member_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES module_access_groups(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (assigned_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_app_member_module_groups_group ON app_member_module_groups(group_id);
