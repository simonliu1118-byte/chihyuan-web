-- 進貨輔助 (user 2026-10-20): Module Access code ERP_RESTOCK_ASSIST and the query type RESTOCK
-- (every customer's 銷貨單 COPR15 and 銷退單 COPR16 in a 單據日期 range, summed per 品號 and day,
-- with each 品號's 庫存數量; history_from／history_to hold the range, result_json the summary).
-- SQLite cannot widen a CHECK in place, so both tables are rebuilt with every row (as 0014).
ALTER TABLE app_member_module_access RENAME TO app_member_module_access_previous;
CREATE TABLE app_member_module_access (
    member_id INTEGER NOT NULL,
    module_code TEXT NOT NULL CHECK (
        module_code IN ('CUSTOMERS','ITEMS','DEFECTS','ORDERS','OUTSOURCING','WORKLOGS','ERP_ITEM_QUERY',
                        'ERP_CUSTOMER_QUERY','ERP_RECEIVABLE_QUERY','ERP_ITEM_COST','ERP_SUPPLIER_QUERY',
                        'ERP_RESTOCK_ASSIST')
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
      CHECK(query_type IN ('ITEM_NO','ITEM_NAME','CUSTOMER_NO','CUSTOMER_NAME','SUPPLIER_NO','SUPPLIER_NAME','PURCHASES',
                         'SALES','RECEIVABLE','ORDER','RESTOCK')),
    keyword TEXT,
    items_json TEXT CHECK(items_json IS NULL OR json_valid(items_json)),
    target_code TEXT CHECK(target_code IS NULL OR length(target_code) BETWEEN 1 AND 40),
    receivable_scope TEXT CHECK(receivable_scope IS NULL OR receivable_scope IN ('CUSTOMER','SALESPERSON','ALL')),
    include_cost INTEGER NOT NULL DEFAULT 0 CHECK(include_cost IN (0,1)),
    result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
    -- A running job's progress the Agent reports (進貨輔助, user 2026-10-20: show 已查／總數).
    progress_stage TEXT CHECK(progress_stage IS NULL OR progress_stage IN ('REPORT','STOCK')),
    progress_done INTEGER CHECK(progress_done IS NULL OR progress_done >= 0),
    progress_total INTEGER CHECK(progress_total IS NULL OR progress_total >= 0),
    FOREIGN KEY (owner_member_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
INSERT INTO erp_item_queries_next(id,owner_member_id,item_no,status,created_at,expires_at,started_at,completed_at,elapsed_ms,claim_hash,fields_json,warehouses_json,error_code,error_message,include_history,history_from,history_to,batch_managed,batches_json,history_json,query_type,keyword,items_json,target_code,receivable_scope,include_cost,result_json)
SELECT id,owner_member_id,item_no,status,created_at,expires_at,started_at,completed_at,elapsed_ms,claim_hash,fields_json,warehouses_json,error_code,error_message,include_history,history_from,history_to,batch_managed,batches_json,history_json,query_type,keyword,items_json,target_code,receivable_scope,include_cost,result_json
FROM erp_item_queries;
DROP TABLE erp_item_queries;
ALTER TABLE erp_item_queries_next RENAME TO erp_item_queries;
CREATE UNIQUE INDEX idx_erp_query_one_active_per_member
    ON erp_item_queries(owner_member_id)
    WHERE status IN ('QUEUED','RUNNING');
CREATE INDEX idx_erp_query_queue ON erp_item_queries(status,created_at);
CREATE INDEX idx_erp_query_retention ON erp_item_queries(completed_at);
CREATE INDEX idx_erp_item_query_type ON erp_item_queries(query_type,created_at);
