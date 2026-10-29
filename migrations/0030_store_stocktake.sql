-- V0.9.52: independent inventory sheets, read-only blind counts until first confirmation.
-- Forward migration preserves all existing grants/queued jobs and their owner index.
ALTER TABLE app_member_module_access RENAME TO app_member_module_access_previous;
CREATE TABLE app_member_module_access (
  member_id INTEGER NOT NULL,
  module_code TEXT NOT NULL CHECK (module_code IN
    ('CUSTOMERS','ITEMS','DEFECTS','ORDERS','OUTSOURCING','WORKLOGS',
     'ERP_ITEM_QUERY','ERP_CUSTOMER_QUERY','ERP_RECEIVABLE_QUERY','ERP_ITEM_COST',
     'ERP_SUPPLIER_QUERY','ERP_RESTOCK_ASSIST','ORDERING','STORE_CUSTOMER_ORDERS','STORE_STOCKTAKE')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  updated_at TEXT NOT NULL, updated_by INTEGER,
  PRIMARY KEY(member_id,module_code),
  FOREIGN KEY(member_id) REFERENCES app_members(id) ON DELETE CASCADE,
  FOREIGN KEY(updated_by) REFERENCES app_members(id) ON DELETE RESTRICT
);
INSERT INTO app_member_module_access SELECT * FROM app_member_module_access_previous;
DROP TABLE app_member_module_access_previous;
CREATE INDEX idx_app_member_module_access_enabled ON app_member_module_access(member_id,enabled,module_code);

CREATE TABLE erp_item_queries_next (
  id TEXT PRIMARY KEY,
  owner_member_id INTEGER NOT NULL,
  item_no TEXT NOT NULL CHECK(length(item_no) BETWEEN 1 AND 40),
  status TEXT NOT NULL CHECK(status IN ('QUEUED','RUNNING','DONE','NOT_FOUND','FAILED','EXPIRED')),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  started_at TEXT, completed_at TEXT, elapsed_ms INTEGER, claim_hash TEXT,
  fields_json TEXT CHECK(fields_json IS NULL OR json_valid(fields_json)),
  warehouses_json TEXT CHECK(warehouses_json IS NULL OR json_valid(warehouses_json)),
  error_code TEXT,error_message TEXT,
  include_history INTEGER NOT NULL DEFAULT 0 CHECK(include_history IN (0,1)),
  history_from TEXT, history_to TEXT,
  batch_managed INTEGER CHECK(batch_managed IN (0,1)),
  batches_json TEXT CHECK(batches_json IS NULL OR json_valid(batches_json)),
  history_json TEXT CHECK(history_json IS NULL OR json_valid(history_json)),
  query_type TEXT NOT NULL DEFAULT 'ITEM_NO'
    CHECK(query_type IN ('ITEM_NO','ITEM_NAME','CUSTOMER_NO','CUSTOMER_NAME','SUPPLIER_NO','SUPPLIER_NAME',
      'PURCHASES','SALES','RECEIVABLE','ORDER','RESTOCK','STOCKTAKE_SYNC','STOCKTAKE_WRITE')),
  keyword TEXT,
  items_json TEXT CHECK(items_json IS NULL OR json_valid(items_json)),
  target_code TEXT CHECK(target_code IS NULL OR length(target_code) BETWEEN 1 AND 40),
  receivable_scope TEXT CHECK(receivable_scope IS NULL OR receivable_scope IN ('CUSTOMER','SALESPERSON','ALL')),
  include_cost INTEGER NOT NULL DEFAULT 0 CHECK(include_cost IN (0,1)),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  progress_stage TEXT CHECK(progress_stage IS NULL OR progress_stage IN ('REPORT','STOCK')),
  progress_done INTEGER CHECK(progress_done IS NULL OR progress_done>=0),
  progress_total INTEGER CHECK(progress_total IS NULL OR progress_total>=0),
  not_before TEXT,
  FOREIGN KEY(owner_member_id) REFERENCES app_members(id) ON DELETE RESTRICT
);
INSERT INTO erp_item_queries_next(
  id,owner_member_id,item_no,status,created_at,expires_at,started_at,completed_at,elapsed_ms,claim_hash,
  fields_json,warehouses_json,error_code,error_message,include_history,history_from,history_to,
  batch_managed,batches_json,history_json,query_type,keyword,items_json,target_code,receivable_scope,
  include_cost,result_json,progress_stage,progress_done,progress_total,not_before)
SELECT id,owner_member_id,item_no,status,created_at,expires_at,started_at,completed_at,elapsed_ms,claim_hash,
  fields_json,warehouses_json,error_code,error_message,include_history,history_from,history_to,
  batch_managed,batches_json,history_json,query_type,keyword,items_json,target_code,receivable_scope,
  include_cost,result_json,progress_stage,progress_done,progress_total,not_before
FROM erp_item_queries;
DROP TABLE erp_item_queries;
ALTER TABLE erp_item_queries_next RENAME TO erp_item_queries;
CREATE INDEX idx_erp_query_queue ON erp_item_queries(status,created_at);
CREATE INDEX idx_erp_query_retention ON erp_item_queries(completed_at);
CREATE INDEX idx_erp_item_query_type ON erp_item_queries(query_type,created_at);
CREATE INDEX idx_erp_query_owner ON erp_item_queries(owner_member_id,created_at);

-- No permanent erp_item_queries result_json for stocktake; the target is the stocktake tables.
CREATE TABLE stocktake_sheets (
  sheet_no TEXT PRIMARY KEY CHECK(length(sheet_no) BETWEEN 1 AND 20 AND sheet_no NOT GLOB '*[^A-Za-z0-9]*'),
  sheet_date TEXT,
  status TEXT NOT NULL DEFAULT 'COUNTING'
    CHECK(status IN ('IGNORED','COUNTING','RECOUNTING','WRITING','WRITE_FAILED','ERP_CONFIRMED')),
  detail_read_at TEXT,
  first_confirmed_by INTEGER,first_confirmed_at TEXT,
  second_confirmed_by INTEGER,second_confirmed_at TEXT,
  write_query_id TEXT,write_result_json TEXT CHECK(write_result_json IS NULL OR json_valid(write_result_json)),
  erp_confirmed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  total_lines INTEGER NOT NULL DEFAULT 0,
  counted_lines INTEGER NOT NULL DEFAULT 0,
  recount_needed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
  FOREIGN KEY(first_confirmed_by) REFERENCES app_members(id),
  FOREIGN KEY(second_confirmed_by) REFERENCES app_members(id)
);
CREATE INDEX idx_stocktake_sheets_status ON stocktake_sheets(status,sheet_date);

CREATE TABLE stocktake_lines (
  sheet_no TEXT NOT NULL,line_key TEXT NOT NULL,
  seq TEXT CHECK(seq IS NULL OR (length(seq)=5 AND seq NOT GLOB '*[^0-9]*')),
  item_code TEXT NOT NULL,item_name TEXT NOT NULL,spec TEXT NOT NULL DEFAULT '',
  warehouse_name TEXT NOT NULL DEFAULT '',location TEXT NOT NULL DEFAULT '',unit TEXT NOT NULL DEFAULT '',
  batch TEXT NOT NULL DEFAULT '',book_qty TEXT NOT NULL,
  is_added INTEGER NOT NULL DEFAULT 0 CHECK(is_added IN (0,1)),
  erp_seq TEXT,
  first_qty TEXT,first_by INTEGER,first_at TEXT,
  recount_qty TEXT,recount_by INTEGER,recount_at TEXT,
  locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  rev INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(sheet_no,line_key),
  FOREIGN KEY(sheet_no) REFERENCES stocktake_sheets(sheet_no) ON DELETE CASCADE,
  FOREIGN KEY(first_by) REFERENCES app_members(id),
  FOREIGN KEY(recount_by) REFERENCES app_members(id)
);
CREATE UNIQUE INDEX idx_stocktake_seq ON stocktake_lines(sheet_no,seq) WHERE seq IS NOT NULL;
-- Not unique: an ERP sheet may list one 品號＋批號 in two places; only added batches are checked
-- for duplicates (in the route).
CREATE INDEX idx_stocktake_batch ON stocktake_lines(sheet_no,item_code,batch);
CREATE INDEX idx_stocktake_rev ON stocktake_lines(sheet_no,rev);
CREATE INDEX idx_stocktake_location ON stocktake_lines(sheet_no,location,item_code);
CREATE TABLE stocktake_line_history (
  id INTEGER PRIMARY KEY,
  sheet_no TEXT NOT NULL,line_key TEXT NOT NULL,
  field TEXT NOT NULL CHECK(field IN ('first_qty','recount_qty','added','deleted')),
  before_value TEXT,after_value TEXT,removed_rev INTEGER,actor_member_id INTEGER NOT NULL,changed_at TEXT NOT NULL,
  FOREIGN KEY(sheet_no) REFERENCES stocktake_sheets(sheet_no) ON DELETE CASCADE,
  FOREIGN KEY(actor_member_id) REFERENCES app_members(id)
);
CREATE INDEX idx_stocktake_removed_rev ON stocktake_line_history(sheet_no,removed_rev) WHERE removed_rev IS NOT NULL;
CREATE INDEX idx_stocktake_line_history_line ON stocktake_line_history(sheet_no,line_key,id);
CREATE TABLE stocktake_participants (
  sheet_no TEXT NOT NULL,member_id INTEGER NOT NULL,first_at TEXT NOT NULL,last_at TEXT NOT NULL,
  PRIMARY KEY(sheet_no,member_id),
  FOREIGN KEY(sheet_no) REFERENCES stocktake_sheets(sheet_no) ON DELETE CASCADE,
  FOREIGN KEY(member_id) REFERENCES app_members(id)
);
