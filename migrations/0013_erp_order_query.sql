-- ORDER: one 銷貨單／銷退單 by number, opened from a 未收款 憑證 (user 2026-10-17). target_code holds
-- the number. SQLite cannot widen a CHECK in place, so the ephemeral queue is rebuilt with every row.
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
      CHECK(query_type IN ('ITEM_NO','ITEM_NAME','CUSTOMER_NO','CUSTOMER_NAME','SALES','RECEIVABLE','ORDER')),
    keyword TEXT,
    items_json TEXT CHECK(items_json IS NULL OR json_valid(items_json)),
    target_code TEXT CHECK(target_code IS NULL OR length(target_code) BETWEEN 1 AND 40),
    receivable_scope TEXT CHECK(receivable_scope IS NULL OR receivable_scope IN ('CUSTOMER','SALESPERSON','ALL')),
    include_cost INTEGER NOT NULL DEFAULT 0 CHECK(include_cost IN (0,1)),
    result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
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
