-- WO-0.9.69: Widen the module CHECK while preserving all existing grants.
-- Widen the module catalog while preserving every existing member grant.
ALTER TABLE app_member_module_access RENAME TO app_member_module_access_before_repairs;
CREATE TABLE app_member_module_access (
 member_id INTEGER NOT NULL,
 module_code TEXT NOT NULL CHECK(module_code IN
 ('CUSTOMERS','ITEMS','DEFECTS','ORDERS','OUTSOURCING','WORKLOGS',
 'ERP_ITEM_QUERY','ERP_CUSTOMER_QUERY','ERP_RECEIVABLE_QUERY','ERP_ITEM_COST',
 'ERP_SUPPLIER_QUERY','ERP_RESTOCK_ASSIST','ORDERING','STORE_CUSTOMER_ORDERS','STORE_STOCKTAKE','STORE_MONTHLY_TODOS','STORE_REPAIRS')),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),updated_at TEXT NOT NULL,updated_by INTEGER,
 PRIMARY KEY(member_id,module_code),
 FOREIGN KEY(member_id) REFERENCES app_members(id) ON DELETE CASCADE,
 FOREIGN KEY(updated_by) REFERENCES app_members(id) ON DELETE RESTRICT
);
INSERT INTO app_member_module_access SELECT * FROM app_member_module_access_before_repairs;
DROP TABLE app_member_module_access_before_repairs;
CREATE INDEX idx_app_member_module_access_enabled ON app_member_module_access(member_id,enabled,module_code);


CREATE TABLE store_repairs (
 id INTEGER PRIMARY KEY,
 list_sequence INTEGER NOT NULL UNIQUE,
 received_date TEXT NOT NULL,
 customer_code TEXT NOT NULL DEFAULT '',
 customer_name TEXT NOT NULL,
 honorific TEXT NOT NULL DEFAULT '' CHECK(honorific IN ('','MR','MS')),
 mobile TEXT NOT NULL DEFAULT '',
 phone TEXT NOT NULL DEFAULT '',
 line_name TEXT NOT NULL DEFAULT '',
 product_kind TEXT NOT NULL CHECK(product_kind IN ('LOW_FREQUENCY','STEAM','INFRARED','BLANKET','OTHER')),
 product_text TEXT NOT NULL,
 serial_no TEXT NOT NULL DEFAULT '',
 fault TEXT NOT NULL,
 purchase_date TEXT,
 accessories TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED','INSPECTED','SENT','REPAIRED','NOTIFIED','RETURNED')),
 inspect_result TEXT NOT NULL DEFAULT '' CHECK(inspect_result IN ('','GOOD','BAD')),
 inspect_problem TEXT NOT NULL DEFAULT '',
 cancelled INTEGER NOT NULL DEFAULT 0 CHECK(cancelled IN (0,1)),
 cancelled_at TEXT,
 cancel_reason TEXT NOT NULL DEFAULT '',
 send_carrier TEXT NOT NULL DEFAULT '',
 send_tracking TEXT NOT NULL DEFAULT '',
 sent_at TEXT,
 return_method TEXT NOT NULL DEFAULT '',
 return_carrier TEXT NOT NULL DEFAULT '',
 return_tracking TEXT NOT NULL DEFAULT '',
 inspected_date TEXT,
 sent_date TEXT,
 repaired_date TEXT,
 notified_date TEXT,
 returned_date TEXT,
 notified_at TEXT,
 closed_at TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_at TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES app_members(id),
 updated_at TEXT NOT NULL,
 updated_by INTEGER NOT NULL REFERENCES app_members(id),
 CHECK(length(trim(customer_name)) BETWEEN 1 AND 40),
 CHECK(length(trim(product_text))>0 AND length(trim(fault))>0),
 CHECK(length(mobile)+length(phone)+length(line_name)>0),
 CHECK(cancelled=0 OR length(trim(cancel_reason))>0)
);
CREATE INDEX idx_store_repairs_status_date ON store_repairs(status,received_date);
CREATE INDEX idx_store_repairs_sequence ON store_repairs(list_sequence DESC);
CREATE TABLE store_repair_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 repair_id INTEGER NOT NULL REFERENCES store_repairs(id),
 actor INTEGER NOT NULL REFERENCES app_members(id),
 at TEXT NOT NULL,
 kind TEXT NOT NULL,
 before_json TEXT NOT NULL CHECK(json_valid(before_json)),
 after_json TEXT NOT NULL CHECK(json_valid(after_json)),
 reason TEXT NOT NULL DEFAULT '',
 request_key TEXT NOT NULL,
 UNIQUE(actor,request_key)
);
CREATE INDEX idx_store_repair_events_parent ON store_repair_events(repair_id,id DESC);
