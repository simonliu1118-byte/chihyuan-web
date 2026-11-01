-- Widen the module catalog while preserving every existing member grant.
ALTER TABLE app_member_module_access RENAME TO app_member_module_access_previous;
CREATE TABLE app_member_module_access (
 member_id INTEGER NOT NULL,
 module_code TEXT NOT NULL CHECK(module_code IN
 ('CUSTOMERS','ITEMS','DEFECTS','ORDERS','OUTSOURCING','WORKLOGS',
 'ERP_ITEM_QUERY','ERP_CUSTOMER_QUERY','ERP_RECEIVABLE_QUERY','ERP_ITEM_COST',
 'ERP_SUPPLIER_QUERY','ERP_RESTOCK_ASSIST','ORDERING','STORE_CUSTOMER_ORDERS','STORE_STOCKTAKE','STORE_MONTHLY_TODOS')),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),updated_at TEXT NOT NULL,updated_by INTEGER,
 PRIMARY KEY(member_id,module_code),
 FOREIGN KEY(member_id) REFERENCES app_members(id) ON DELETE CASCADE,
 FOREIGN KEY(updated_by) REFERENCES app_members(id) ON DELETE RESTRICT
);
INSERT INTO app_member_module_access SELECT * FROM app_member_module_access_previous;
DROP TABLE app_member_module_access_previous;
CREATE INDEX idx_app_member_module_access_enabled ON app_member_module_access(member_id,enabled,module_code);

CREATE TABLE store_monthly_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL CHECK(version>0),
 first_month TEXT, generated_through TEXT,
 stores_json TEXT NOT NULL CHECK(json_valid(stores_json) AND json_type(stores_json)='array'),
 items_json TEXT NOT NULL CHECK(json_valid(items_json) AND json_type(items_json)='array'),
 updated_at TEXT NOT NULL, updated_by INTEGER NOT NULL REFERENCES app_members(id)
);
CREATE TABLE store_monthly_rows (
 id TEXT PRIMARY KEY, month TEXT NOT NULL CHECK(length(month)=7),
 store_id TEXT NOT NULL, store_name TEXT NOT NULL, store_order INTEGER NOT NULL,
 created_at TEXT NOT NULL, UNIQUE(month,store_id)
);
CREATE INDEX store_monthly_rows_month ON store_monthly_rows(month DESC,store_order,store_id);
CREATE TABLE store_monthly_cells (
 row_id TEXT NOT NULL REFERENCES store_monthly_rows(id), item_id TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN(0,1)), completion_date TEXT,
 updated_at TEXT NOT NULL, updated_by INTEGER REFERENCES app_members(id),
 PRIMARY KEY(row_id,item_id), CHECK(completed=1 OR completion_date IS NULL)
);
CREATE TABLE store_monthly_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, row_id TEXT REFERENCES store_monthly_rows(id),
 item_id TEXT, actor INTEGER NOT NULL REFERENCES app_members(id), at TEXT NOT NULL,
 kind TEXT NOT NULL, before_json TEXT NOT NULL CHECK(json_valid(before_json)),
 after_json TEXT NOT NULL CHECK(json_valid(after_json)),
 request_key TEXT NOT NULL, request_hash TEXT NOT NULL, UNIQUE(actor,request_key)
);
CREATE INDEX store_monthly_events_row ON store_monthly_events(row_id,id DESC);
