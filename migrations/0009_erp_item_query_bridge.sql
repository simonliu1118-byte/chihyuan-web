-- Add an independent CY Web Module Access code without discarding existing grants.
ALTER TABLE app_member_module_access RENAME TO app_member_module_access_previous;
CREATE TABLE app_member_module_access (
    member_id INTEGER NOT NULL,
    module_code TEXT NOT NULL CHECK (
        module_code IN ('CUSTOMERS','ITEMS','DEFECTS','ORDERS','OUTSOURCING','WORKLOGS','ERP_ITEM_QUERY')
    ),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    PRIMARY KEY (member_id, module_code),
    FOREIGN KEY (member_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
INSERT INTO app_member_module_access(member_id,module_code,enabled,updated_at,updated_by)
SELECT member_id,module_code,enabled,updated_at,updated_by FROM app_member_module_access_previous;
DROP TABLE app_member_module_access_previous;
CREATE INDEX idx_app_member_module_access_enabled
    ON app_member_module_access(member_id,enabled,module_code);

-- Only brief, explicitly requested ERP lookups. No ERP master data synchronisation.
CREATE TABLE erp_item_queries (
    id TEXT PRIMARY KEY,
    owner_member_id INTEGER NOT NULL,
    item_no TEXT NOT NULL CHECK(length(item_no) BETWEEN 1 AND 40),
    status TEXT NOT NULL CHECK(status IN ('QUEUED','RUNNING','DONE','NOT_FOUND','FAILED','EXPIRED')),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    elapsed_ms INTEGER,
    claim_hash TEXT,
    fields_json TEXT CHECK(fields_json IS NULL OR json_valid(fields_json)),
    warehouses_json TEXT CHECK(warehouses_json IS NULL OR json_valid(warehouses_json)),
    error_code TEXT,
    error_message TEXT,
    FOREIGN KEY (owner_member_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE UNIQUE INDEX idx_erp_query_one_active_per_member
    ON erp_item_queries(owner_member_id)
    WHERE status IN ('QUEUED','RUNNING');
CREATE INDEX idx_erp_query_queue ON erp_item_queries(status,created_at);
CREATE INDEX idx_erp_query_retention ON erp_item_queries(completed_at);

CREATE TABLE erp_item_agent_status (
    id INTEGER PRIMARY KEY CHECK(id=1),
    last_seen_at TEXT NOT NULL,
    agent_version TEXT NOT NULL,
    erp_state TEXT NOT NULL
);

-- Single Agent credential managed by the Super Admin UI. Only SHA-256 is persisted.
CREATE TABLE erp_item_agent_credentials (
    id INTEGER PRIMARY KEY CHECK(id=1),
    token_hash TEXT CHECK(token_hash IS NULL OR (length(token_hash)=64 AND token_hash NOT GLOB '*[^0-9a-f]*')),
    created_at TEXT NOT NULL,
    revoked_at TEXT,
    updated_by INTEGER,
    FOREIGN KEY(updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
