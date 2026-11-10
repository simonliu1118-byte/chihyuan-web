-- 自訂中國貨採購（使用者 2026-11-10）：採購同仁在已送出的自訂中國貨叫貨單上填實際採購數量、
-- 人民幣單價、拆分刷卡、運費、營業稅與退貨，整張表重算含稅含運單價。叫貨的子權限。

ALTER TABLE app_member_module_access RENAME TO app_member_module_access_before_cn;
CREATE TABLE app_member_module_access (
 member_id INTEGER NOT NULL,
 module_code TEXT NOT NULL CHECK(module_code IN (
 'CUSTOMERS','ITEMS','DEFECTS','ORDERS','OUTSOURCING','WORKLOGS',
 'ERP_ITEM_QUERY','ERP_CUSTOMER_QUERY','ERP_RECEIVABLE_QUERY','ERP_ITEM_COST',
 'ERP_SUPPLIER_QUERY','ERP_RESTOCK_ASSIST','ORDERING','ORDERING_CN_PURCHASE','STORE_CUSTOMER_ORDERS',
 'STORE_STOCKTAKE','STORE_MONTHLY_TODOS','STORE_REPAIRS','BOT_CENTER',
 'ANNOUNCEMENT_PUBLISH','PERSONAL_NOTICE_SEND')),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
 updated_at TEXT NOT NULL,
 updated_by INTEGER,
 PRIMARY KEY(member_id,module_code),
 FOREIGN KEY(member_id) REFERENCES app_members(id) ON DELETE CASCADE,
 FOREIGN KEY(updated_by) REFERENCES app_members(id) ON DELETE RESTRICT
);
INSERT INTO app_member_module_access SELECT * FROM app_member_module_access_before_cn;
DROP TABLE app_member_module_access_before_cn;
CREATE INDEX idx_app_member_module_access_enabled ON app_member_module_access(member_id,enabled,module_code);

-- 原定數量：採購改了數量後 quantity 是實際採購數量（到貨以它為準），原本叫的數量留在這裡。
ALTER TABLE ordering_lines ADD COLUMN original_quantity REAL CHECK (original_quantity IS NULL OR original_quantity >= 0);
-- 採購同仁自己新增的項目（沒有原定數量）。
ALTER TABLE ordering_lines ADD COLUMN purchase_added INTEGER NOT NULL DEFAULT 0 CHECK (purchase_added IN (0,1));
-- 絕版／停產：指定結案（closed_as='OTHER'）並可恢復。
ALTER TABLE ordering_lines ADD COLUMN cn_discontinued INTEGER NOT NULL DEFAULT 0 CHECK (cn_discontinued IN (0,1));

CREATE TABLE ordering_cn_purchases (
 order_id INTEGER PRIMARY KEY REFERENCES ordering_orders(id) ON DELETE CASCADE,
 ordered_at TEXT,
 ordered_by INTEGER REFERENCES app_members(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);

-- 刷卡（CARD）、運費（SHIPPING）、營業稅（TAX）；金額、手續費為台幣整數，空白＝待補。
CREATE TABLE ordering_cn_charges (
 id INTEGER PRIMARY KEY,
 order_id INTEGER NOT NULL REFERENCES ordering_orders(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK (kind IN ('CARD','SHIPPING','TAX')),
 sort_order INTEGER NOT NULL,
 charged_on TEXT CHECK (charged_on IS NULL OR length(charged_on) = 10),
 amount INTEGER CHECK (amount IS NULL OR amount >= 0),
 fee INTEGER CHECK (fee IS NULL OR fee >= 0),
 note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 200)
);
CREATE INDEX idx_ordering_cn_charges_order ON ordering_cn_charges(order_id,kind,sort_order);

-- 一個品項可拆成幾段分別刷卡；人民幣單價以「分」存（0.01 元）。
CREATE TABLE ordering_cn_pieces (
 id INTEGER PRIMARY KEY,
 order_id INTEGER NOT NULL REFERENCES ordering_orders(id) ON DELETE CASCADE,
 line_id INTEGER NOT NULL REFERENCES ordering_lines(id) ON DELETE CASCADE,
 sort_order INTEGER NOT NULL,
 quantity REAL NOT NULL CHECK (quantity > 0),
 rmb_price INTEGER CHECK (rmb_price IS NULL OR rmb_price >= 0),
 charge_id INTEGER REFERENCES ordering_cn_charges(id) ON DELETE SET NULL
);
CREATE INDEX idx_ordering_cn_pieces_order ON ordering_cn_pieces(order_id,sort_order);
CREATE INDEX idx_ordering_cn_pieces_line ON ordering_cn_pieces(line_id);
CREATE INDEX idx_ordering_cn_pieces_charge ON ordering_cn_pieces(charge_id);

-- 退貨：每個品項一筆；人民幣金額以「分」存，台幣刷退與刷退手續費為整數。
CREATE TABLE ordering_cn_returns (
 line_id INTEGER PRIMARY KEY REFERENCES ordering_lines(id) ON DELETE CASCADE,
 order_id INTEGER NOT NULL REFERENCES ordering_orders(id) ON DELETE CASCADE,
 quantity REAL NOT NULL CHECK (quantity > 0),
 rmb_amount INTEGER CHECK (rmb_amount IS NULL OR rmb_amount >= 0),
 ntd_amount INTEGER CHECK (ntd_amount IS NULL OR ntd_amount >= 0),
 fee INTEGER CHECK (fee IS NULL OR fee >= 0),
 reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 200)
);
CREATE INDEX idx_ordering_cn_returns_order ON ordering_cn_returns(order_id);
