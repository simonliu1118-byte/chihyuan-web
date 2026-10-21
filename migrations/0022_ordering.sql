-- 叫貨 (user 2026-10-21): Module Access code ORDERING and the 叫貨單 the 高雄門市 sends to 台北／台中／洲美
-- (transfers, the same as 進貨), each 廠商, 定期中國貨, 自訂中國貨 and tabs added later. Every table holds
-- what people typed, so all of them are in the portable backup. The default 來源 are inserted by the
-- Worker the first time the module is opened (not here), so a fresh database stays empty.
-- SQLite cannot widen a CHECK in place, so the grant table is rebuilt with every row (as 0019).
ALTER TABLE app_member_module_access RENAME TO app_member_module_access_previous;
CREATE TABLE app_member_module_access (
    member_id INTEGER NOT NULL,
    module_code TEXT NOT NULL CHECK (
        module_code IN ('CUSTOMERS','ITEMS','DEFECTS','ORDERS','OUTSOURCING','WORKLOGS','ERP_ITEM_QUERY',
                        'ERP_CUSTOMER_QUERY','ERP_RECEIVABLE_QUERY','ERP_ITEM_COST','ERP_SUPPLIER_QUERY',
                        'ERP_RESTOCK_ASSIST','ORDERING')
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

-- A tab (GENERAL, CN_REGULAR, CN_CUSTOM) or one 廠商 under the 廠商 tab (VENDOR). conditions is the 廠商's
-- free text (免運門檻、最低訂量、提醒). Never deleted once used: is_active=0 hides it.
CREATE TABLE ordering_sources (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 40),
    kind TEXT NOT NULL CHECK (kind IN ('GENERAL','VENDOR','CN_REGULAR','CN_CUSTOM')),
    conditions TEXT NOT NULL DEFAULT '' CHECK (length(conditions) <= 500),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- status is stored as DRAFT／SENT／VOID; 部分到貨 and 已結案 follow from the lines. version is the
-- optimistic lock raised by every content write; revision is the 版本 shown after 送出 (1 at 送出).
CREATE TABLE ordering_orders (
    id INTEGER PRIMARY KEY,
    source_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','VOID')),
    planned_send_date TEXT CHECK (planned_send_date IS NULL OR planned_send_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    sent_at TEXT,
    sent_by INTEGER,
    note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 300),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    CHECK ((status = 'DRAFT') = (sent_at IS NULL) OR status = 'VOID'),
    FOREIGN KEY (source_id) REFERENCES ordering_sources(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (sent_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX idx_ordering_orders_source ON ordering_orders(source_id, status, planned_send_date);
CREATE INDEX idx_ordering_orders_recent ON ordering_orders(status, created_at);

-- One line. quantity is the number in quantity_text, NULL when there is none (「各1」: counted by hand).
-- section is one of the three 定期中國貨 blocks, '' elsewhere. vendor_name_follows: 廠商品名 still
-- copies 品名 (never typed). closed_as settles what has not come (缺貨／取消／其他).
CREATE TABLE ordering_lines (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL,
    section TEXT NOT NULL DEFAULT '' CHECK (section IN ('','SINGLE','BAG','OTHER')),
    sort_order INTEGER NOT NULL,
    item_code TEXT NOT NULL DEFAULT '' CHECK (length(item_code) <= 40),
    item_name TEXT NOT NULL DEFAULT '' CHECK (length(item_name) <= 200),
    vendor_item_code TEXT NOT NULL DEFAULT '' CHECK (length(vendor_item_code) <= 200),
    vendor_item_name TEXT NOT NULL DEFAULT '' CHECK (length(vendor_item_name) <= 200),
    vendor_name_follows INTEGER NOT NULL DEFAULT 1 CHECK (vendor_name_follows IN (0,1)),
    spec TEXT NOT NULL DEFAULT '' CHECK (length(spec) <= 200),
    quantity_text TEXT NOT NULL DEFAULT '' CHECK (length(quantity_text) <= 40),
    quantity REAL CHECK (quantity IS NULL OR quantity >= 0),
    unit TEXT NOT NULL DEFAULT '' CHECK (length(unit) <= 10),
    note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 300),
    closed_as TEXT CHECK (closed_as IS NULL OR closed_as IN ('SHORTAGE','CANCELLED','OTHER')),
    closed_note TEXT NOT NULL DEFAULT '' CHECK (length(closed_note) <= 200),
    closed_at TEXT,
    closed_by INTEGER,
    FOREIGN KEY (order_id) REFERENCES ordering_orders(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (closed_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX idx_ordering_lines_order ON ordering_lines(order_id, section, sort_order);

-- 到貨登記: one ERP 進貨單 (341A-yyyyMMddnnn) and its date, with how much of each line it brought.
CREATE TABLE ordering_receipts (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL,
    erp_purchase_no TEXT NOT NULL CHECK (erp_purchase_no GLOB '341A-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
    received_date TEXT NOT NULL CHECK (received_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    created_at TEXT NOT NULL,
    created_by INTEGER,
    FOREIGN KEY (order_id) REFERENCES ordering_orders(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX idx_ordering_receipts_order ON ordering_receipts(order_id);
CREATE INDEX idx_ordering_receipts_no ON ordering_receipts(erp_purchase_no);
CREATE TABLE ordering_receipt_lines (
    receipt_id INTEGER NOT NULL,
    line_id INTEGER NOT NULL,
    quantity REAL NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (receipt_id, line_id),
    FOREIGN KEY (receipt_id) REFERENCES ordering_receipts(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (line_id) REFERENCES ordering_lines(id) ON UPDATE RESTRICT ON DELETE CASCADE
);
CREATE INDEX idx_ordering_receipt_lines_line ON ordering_receipt_lines(line_id);

-- 廠商品號／廠商品名 typed for a 來源, by our 品號 (key_type CODE) or, without one, by 品名 (NAME):
-- filled in the next time the same 品號／品名 is entered for that 來源.
CREATE TABLE ordering_vendor_items (
    source_id INTEGER NOT NULL,
    key_type TEXT NOT NULL CHECK (key_type IN ('CODE','NAME')),
    item_key TEXT NOT NULL CHECK (length(item_key) BETWEEN 1 AND 200),
    vendor_item_code TEXT NOT NULL DEFAULT '' CHECK (length(vendor_item_code) <= 200),
    vendor_item_name TEXT NOT NULL DEFAULT '' CHECK (length(vendor_item_name) <= 200),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (source_id, key_type, item_key),
    FOREIGN KEY (source_id) REFERENCES ordering_sources(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

-- 進貨輔助 「加入叫貨單」 defaults to the 來源 a 品號 was last added to.
CREATE TABLE ordering_item_last_source (
    item_code TEXT PRIMARY KEY CHECK (length(item_code) BETWEEN 1 AND 40),
    source_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (source_id) REFERENCES ordering_sources(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

-- 修改紀錄 after 送出: one row per 版本 (「版本 3｜黃花油 數量 5 → 8」).
CREATE TABLE ordering_revisions (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    changed_at TEXT NOT NULL,
    changed_by INTEGER,
    summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 500),
    UNIQUE (order_id, revision),
    FOREIGN KEY (order_id) REFERENCES ordering_orders(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
