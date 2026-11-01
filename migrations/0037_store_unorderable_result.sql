-- Widen the supply result while preserving every order, line and immutable event ID.
-- Copy all FK children before replacing the parent; never disable foreign keys.
-- This one-time batch is bounded; larger installations require a reviewed staged migration.
SELECT CASE WHEN
 (SELECT COUNT(*) FROM (SELECT 1 FROM store_customer_orders LIMIT 5001))+
 (SELECT COUNT(*) FROM (SELECT 1 FROM store_customer_order_lines LIMIT 5001))+
 (SELECT COUNT(*) FROM (SELECT 1 FROM store_order_events LIMIT 5001))+
 (SELECT COUNT(*) FROM (SELECT 1 FROM store_blacklist_events LIMIT 5001))<=5000
 THEN 1 ELSE json('STORE_RESULT_MIGRATION_EXCEEDS_5000_ROWS') END;
CREATE TABLE "store_customer_orders_v60" (
    id INTEGER PRIMARY KEY,
    order_date TEXT NOT NULL CHECK (order_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    customer_name TEXT NOT NULL CHECK (length(trim(customer_name)) BETWEEN 1 AND 40),
    phone TEXT NOT NULL CHECK (length(phone) BETWEEN 0 AND 20 AND phone NOT GLOB '*[^0-9]*'),
    line_name TEXT NOT NULL DEFAULT '' CHECK (length(line_name) <= 60),
    deposit INTEGER NOT NULL DEFAULT 0 CHECK (deposit >= 0),
    note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 300),
    status TEXT NOT NULL DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED','ORDERED','ARRIVED','NOTIFIED','PICKED_UP','CANCELLED')),
    mobile TEXT NOT NULL DEFAULT '' CHECK(length(mobile)<=20 AND mobile NOT GLOB '*[^0-9]*'),
    ordered_date TEXT,
    notified_date TEXT,
    picked_up_date TEXT,
    has_ever_ordered INTEGER NOT NULL DEFAULT 0 CHECK(has_ever_ordered IN (0,1)),
    cancel_kind TEXT NOT NULL DEFAULT '',
    legacy INTEGER NOT NULL DEFAULT 0 CHECK(legacy IN (0,1)),
    notified_at TEXT,
    cancel_reason TEXT NOT NULL DEFAULT '' CHECK (length(cancel_reason) <= 300),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER, honorific TEXT NOT NULL DEFAULT '' CHECK(honorific IN('','MR','MS')), call_result TEXT NOT NULL DEFAULT '' CHECK(call_result IN('','ORDERED','OUT_OF_STOCK','DISCONTINUED','UNORDERABLE')), list_sequence INTEGER NOT NULL DEFAULT 0 CHECK(list_sequence>=0),
    CHECK(length(trim(phone))+length(trim(mobile))+length(trim(line_name))>0),
    CHECK (status <> 'CANCELLED' OR length(trim(cancel_reason)) > 0),
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
INSERT INTO store_customer_orders_v60 SELECT * FROM store_customer_orders;
CREATE TABLE "store_customer_order_lines_v60" (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL,
    item_code TEXT NOT NULL DEFAULT '' CHECK (length(item_code) <= 40),
    item_name TEXT NOT NULL CHECK (length(trim(item_name)) BETWEEN 1 AND 200),
    quantity REAL NOT NULL CHECK (quantity > 0),
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    FOREIGN KEY (order_id) REFERENCES "store_customer_orders_v60"(id) ON UPDATE RESTRICT ON DELETE CASCADE
);
INSERT INTO store_customer_order_lines_v60 SELECT * FROM store_customer_order_lines;
CREATE TABLE store_order_events_v60 (
 id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL REFERENCES store_customer_orders_v60(id),
 actor INTEGER NOT NULL REFERENCES app_members(id),at TEXT NOT NULL,kind TEXT NOT NULL,
 before_json TEXT NOT NULL,after_json TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',
 request_key TEXT NOT NULL,UNIQUE(order_id,request_key)
);
INSERT INTO store_order_events_v60 SELECT * FROM store_order_events;
CREATE TABLE store_blacklist_events_v60 (
 id INTEGER PRIMARY KEY AUTOINCREMENT,blacklist_id INTEGER NOT NULL REFERENCES store_blacklist(id),
 order_id INTEGER NOT NULL UNIQUE REFERENCES store_customer_orders_v60(id),actor INTEGER NOT NULL REFERENCES app_members(id),
 at TEXT NOT NULL,reason TEXT NOT NULL,summary_json TEXT NOT NULL
);
INSERT INTO store_blacklist_events_v60 SELECT * FROM store_blacklist_events;
DROP TABLE store_customer_order_lines;
DROP TABLE store_order_events;
DROP TABLE store_blacklist_events;
DROP TABLE store_customer_orders;
ALTER TABLE store_customer_orders_v60 RENAME TO store_customer_orders;
ALTER TABLE store_customer_order_lines_v60 RENAME TO store_customer_order_lines;
ALTER TABLE store_order_events_v60 RENAME TO store_order_events;
ALTER TABLE store_blacklist_events_v60 RENAME TO store_blacklist_events;
CREATE INDEX idx_store_customer_orders_list_sequence ON store_customer_orders(list_sequence DESC);
CREATE INDEX idx_store_customer_orders_list_sort ON store_customer_orders(order_date,julianday(created_at),id);
CREATE INDEX idx_store_customer_orders_new_phone ON "store_customer_orders"(phone);
CREATE INDEX idx_store_customer_orders_new_status ON "store_customer_orders"(status, order_date);
CREATE INDEX idx_store_customer_order_lines_new_order ON "store_customer_order_lines"(order_id, sort_order);
CREATE INDEX idx_store_order_events_order ON store_order_events(order_id,id);
CREATE UNIQUE INDEX idx_store_order_events_request ON store_order_events(actor,request_key);
CREATE INDEX idx_store_blacklist_events_parent ON store_blacklist_events(blacklist_id,id);
