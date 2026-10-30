-- Preserve legacy orders and line IDs. Copy children before replacing parent; no FK disabling.
CREATE TABLE store_customer_orders_new (
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
    arrived_date TEXT,
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
    updated_by INTEGER,
    CHECK(length(trim(phone))+length(trim(mobile))+length(trim(line_name))>0),
    CHECK (status <> 'CANCELLED' OR length(trim(cancel_reason)) > 0),
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX idx_store_customer_orders_new_status ON store_customer_orders_new(status, order_date);
CREATE INDEX idx_store_customer_orders_new_phone ON store_customer_orders_new(phone);


INSERT INTO store_customer_orders_new(id,order_date,customer_name,phone,line_name,deposit,note,status,notified_at,cancel_reason,version,created_at,created_by,updated_at,updated_by,has_ever_ordered,notified_date,legacy)
SELECT id,order_date,customer_name,phone,line_name,deposit,note,status,notified_at,cancel_reason,version,created_at,created_by,updated_at,updated_by,CASE WHEN status<>'CANCELLED' THEN 1 ELSE 0 END,
 CASE WHEN notified_at IS NOT NULL THEN date(notified_at,'+8 hours') END,1 FROM store_customer_orders;
CREATE TABLE store_customer_order_lines_new (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL,
    item_code TEXT NOT NULL DEFAULT '' CHECK (length(item_code) <= 40),
    item_name TEXT NOT NULL CHECK (length(trim(item_name)) BETWEEN 1 AND 200),
    quantity REAL NOT NULL CHECK (quantity > 0),
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    FOREIGN KEY (order_id) REFERENCES store_customer_orders_new(id) ON UPDATE RESTRICT ON DELETE CASCADE
);
CREATE INDEX idx_store_customer_order_lines_new_order ON store_customer_order_lines_new(order_id, sort_order);


INSERT INTO store_customer_order_lines_new SELECT * FROM store_customer_order_lines;
DROP TABLE store_customer_order_lines;
DROP TABLE store_customer_orders;
ALTER TABLE store_customer_orders_new RENAME TO store_customer_orders;
ALTER TABLE store_customer_order_lines_new RENAME TO store_customer_order_lines;
CREATE TABLE store_blacklist_new (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
    phone TEXT NOT NULL CHECK (length(phone) BETWEEN 0 AND 20 AND phone NOT GLOB '*[^0-9]*'),
    mobile TEXT NOT NULL DEFAULT '' CHECK(length(mobile)<=20 AND mobile NOT GLOB '*[^0-9]*'),
    line_name TEXT NOT NULL DEFAULT '' CHECK(length(line_name)<=60),
    version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 300),
    action TEXT NOT NULL CHECK (action IN ('REFUSE','FULL_PAYMENT','OTHER')),
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    CHECK(length(trim(phone))+length(trim(mobile))+length(trim(line_name))>0),
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

INSERT INTO store_blacklist_new(id,name,phone,reason,action,created_at,created_by,updated_at,updated_by)
SELECT id,name,phone,reason,action,created_at,created_by,updated_at,updated_by FROM store_blacklist;
DROP TABLE store_blacklist;
ALTER TABLE store_blacklist_new RENAME TO store_blacklist;
CREATE INDEX idx_store_blacklist_contacts ON store_blacklist(active,phone,mobile);
CREATE TABLE store_order_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL REFERENCES store_customer_orders(id),
 actor INTEGER NOT NULL REFERENCES app_members(id),at TEXT NOT NULL,kind TEXT NOT NULL,
 before_json TEXT NOT NULL,after_json TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',
 request_key TEXT NOT NULL,UNIQUE(order_id,request_key)
);
CREATE UNIQUE INDEX idx_store_order_events_request ON store_order_events(actor,request_key);
CREATE INDEX idx_store_order_events_order ON store_order_events(order_id,id);
CREATE TABLE store_blacklist_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,blacklist_id INTEGER NOT NULL REFERENCES store_blacklist(id),
 order_id INTEGER NOT NULL UNIQUE REFERENCES store_customer_orders(id),actor INTEGER NOT NULL REFERENCES app_members(id),
 at TEXT NOT NULL,reason TEXT NOT NULL,summary_json TEXT NOT NULL
);
CREATE INDEX idx_store_blacklist_events_parent ON store_blacklist_events(blacklist_id,id);
