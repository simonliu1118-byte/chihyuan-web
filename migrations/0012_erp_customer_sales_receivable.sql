-- ERP 客戶／銷貨銷退／未收款 queries and the 標準進價 permission (user 2026-10-17).
-- New Module Access codes: ERP_CUSTOMER_QUERY, ERP_RECEIVABLE_QUERY and ERP_ITEM_COST (no page).
ALTER TABLE app_member_module_access RENAME TO app_member_module_access_previous;
CREATE TABLE app_member_module_access (
    member_id INTEGER NOT NULL,
    module_code TEXT NOT NULL CHECK (
        module_code IN ('CUSTOMERS','ITEMS','DEFECTS','ORDERS','OUTSOURCING','WORKLOGS','ERP_ITEM_QUERY',
                        'ERP_CUSTOMER_QUERY','ERP_RECEIVABLE_QUERY','ERP_ITEM_COST')
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

-- The single ephemeral ERP job queue gets the new query types. SQLite cannot widen a CHECK in
-- place, so the table is rebuilt with every existing row. New columns:
--   target_code      CUSTOMER_NO／SALES customer, RECEIVABLE customer or 業務員 (NULL for ALL)
--   receivable_scope RECEIVABLE only
--   include_cost     ITEM_NO: the creator may see 標準進價 (ERP_ITEM_COST) at creation time
--   result_json      SALES orders／RECEIVABLE bills, cleared with the other result JSON
-- SALES reuses history_from／history_to for its 單據日期 range.
CREATE TABLE erp_item_queries_next (
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
    include_history INTEGER NOT NULL DEFAULT 0 CHECK(include_history IN (0,1)),
    history_from TEXT,
    history_to TEXT,
    batch_managed INTEGER CHECK(batch_managed IN (0,1)),
    batches_json TEXT CHECK(batches_json IS NULL OR json_valid(batches_json)),
    history_json TEXT CHECK(history_json IS NULL OR json_valid(history_json)),
    query_type TEXT NOT NULL DEFAULT 'ITEM_NO'
      CHECK(query_type IN ('ITEM_NO','ITEM_NAME','CUSTOMER_NO','CUSTOMER_NAME','SALES','RECEIVABLE')),
    keyword TEXT,
    items_json TEXT CHECK(items_json IS NULL OR json_valid(items_json)),
    target_code TEXT CHECK(target_code IS NULL OR length(target_code) BETWEEN 1 AND 40),
    receivable_scope TEXT CHECK(receivable_scope IS NULL OR receivable_scope IN ('CUSTOMER','SALESPERSON','ALL')),
    include_cost INTEGER NOT NULL DEFAULT 0 CHECK(include_cost IN (0,1)),
    result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
    FOREIGN KEY (owner_member_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
-- Existing jobs keep include_cost=0 (ephemeral; their results are cleared after 5 minutes).
INSERT INTO erp_item_queries_next(
    id,owner_member_id,item_no,status,created_at,expires_at,started_at,completed_at,elapsed_ms,claim_hash,
    fields_json,warehouses_json,error_code,error_message,include_history,history_from,history_to,
    batch_managed,batches_json,history_json,query_type,keyword,items_json)
SELECT id,owner_member_id,item_no,status,created_at,expires_at,started_at,completed_at,elapsed_ms,claim_hash,
    fields_json,warehouses_json,error_code,error_message,include_history,history_from,history_to,
    batch_managed,batches_json,history_json,query_type,keyword,items_json
FROM erp_item_queries;
DROP TABLE erp_item_queries;
ALTER TABLE erp_item_queries_next RENAME TO erp_item_queries;
CREATE UNIQUE INDEX idx_erp_query_one_active_per_member
    ON erp_item_queries(owner_member_id)
    WHERE status IN ('QUEUED','RUNNING');
CREATE INDEX idx_erp_query_queue ON erp_item_queries(status,created_at);
CREATE INDEX idx_erp_query_retention ON erp_item_queries(completed_at);
CREATE INDEX idx_erp_item_query_type ON erp_item_queries(query_type,created_at);
