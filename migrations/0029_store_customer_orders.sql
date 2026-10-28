-- 門市 (user 2026-10-28): a module of tabs like ERP 查詢; its first tab is 顧客訂購 with Module Access
-- code STORE_CUSTOMER_ORDERS. A 顧客訂購 holds one customer's order of one or more items, a 訂金 and a
-- 處理狀態 (叫貨 → 到貨 → 通知 → 取貨, or 取消 with a reason). 黑名單 is matched by 電話: 拒絕訂購
-- refuses a new order, 收全款 requires the 訂金 to be the whole amount. Every table is typed by people,
-- so all of them are in the portable backup.
-- SQLite cannot widen a CHECK in place, so the grant table is rebuilt with every row (as 0022).
ALTER TABLE app_member_module_access RENAME TO app_member_module_access_previous;
CREATE TABLE app_member_module_access (
    member_id INTEGER NOT NULL,
    module_code TEXT NOT NULL CHECK (
        module_code IN ('CUSTOMERS','ITEMS','DEFECTS','ORDERS','OUTSOURCING','WORKLOGS','ERP_ITEM_QUERY',
                        'ERP_CUSTOMER_QUERY','ERP_RECEIVABLE_QUERY','ERP_ITEM_COST','ERP_SUPPLIER_QUERY',
                        'ERP_RESTOCK_ASSIST','ORDERING','STORE_CUSTOMER_ORDERS')
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

-- phone is stored as digits only, so 0912-345-678 and 0912345678 match the 黑名單 the same way.
-- notified_at is when the status last became NOTIFIED (通知): over 7 days without 取貨 is flagged.
CREATE TABLE store_customer_orders (
    id INTEGER PRIMARY KEY,
    order_date TEXT NOT NULL CHECK (order_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    customer_name TEXT NOT NULL CHECK (length(trim(customer_name)) BETWEEN 1 AND 40),
    phone TEXT NOT NULL CHECK (length(phone) BETWEEN 6 AND 20 AND phone NOT GLOB '*[^0-9]*'),
    line_name TEXT NOT NULL DEFAULT '' CHECK (length(line_name) <= 60),
    deposit INTEGER NOT NULL DEFAULT 0 CHECK (deposit >= 0),
    note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 300),
    status TEXT NOT NULL DEFAULT 'ORDERED' CHECK (status IN ('ORDERED','ARRIVED','NOTIFIED','PICKED_UP','CANCELLED')),
    notified_at TEXT,
    cancel_reason TEXT NOT NULL DEFAULT '' CHECK (length(cancel_reason) <= 300),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    CHECK (status <> 'CANCELLED' OR length(trim(cancel_reason)) > 0),
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX idx_store_customer_orders_status ON store_customer_orders(status, order_date);
CREATE INDEX idx_store_customer_orders_phone ON store_customer_orders(phone);

-- One item of an order. amount is quantity × unit_price, computed (never typed); prices are whole NT$.
CREATE TABLE store_customer_order_lines (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL,
    item_code TEXT NOT NULL DEFAULT '' CHECK (length(item_code) <= 40),
    item_name TEXT NOT NULL CHECK (length(trim(item_name)) BETWEEN 1 AND 200),
    quantity REAL NOT NULL CHECK (quantity > 0),
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    FOREIGN KEY (order_id) REFERENCES store_customer_orders(id) ON UPDATE RESTRICT ON DELETE CASCADE
);
CREATE INDEX idx_store_customer_order_lines_order ON store_customer_order_lines(order_id, sort_order);

-- 黑名單: one row per phone. action REFUSE = 拒絕訂購, FULL_PAYMENT = 收全款.
CREATE TABLE store_blacklist (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
    phone TEXT NOT NULL UNIQUE CHECK (length(phone) BETWEEN 6 AND 20 AND phone NOT GLOB '*[^0-9]*'),
    reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 300),
    action TEXT NOT NULL CHECK (action IN ('REFUSE','FULL_PAYMENT')),
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
