-- V0.9.97 customer settings (user 2026-11-03).
-- 1. Regions are fixed in code (shared/taiwan-regions.ts): Taiwan's 22 counties and cities, grouped
--    北部／中部／南部／東部／離島 as on the legacy sheet. A test keeps this list and the constant in step.
-- 2. Customer statuses carry a light and no longer need a code from the user; the legacy list is
--    seeded (an existing status keeps its row, code and name).
-- 3. A contact's name and an address line become optional (the rebuild drops the non-empty checks).
--    Visits point at contacts and are rebuilt with them; their index and id-retirement trigger return.
-- 4. 重要註記 becomes 備註 with an important flag; every existing note was an important one.
-- 5. Customers gain 付款條件 and 發票開立 (月結／收現 and 外加／內含, or the user's own text).
PRAGMA defer_foreign_keys = on;

INSERT OR IGNORE INTO regions (id, code, name, group_code, sort_order, is_active) VALUES
  (1, 'KEE', '基隆市', 'NORTH', 1, 1),
  (2, 'TPE', '臺北市', 'NORTH', 2, 1),
  (3, 'NWT', '新北市', 'NORTH', 3, 1),
  (4, 'TAO', '桃園市', 'NORTH', 4, 1),
  (5, 'HSZ', '新竹市', 'NORTH', 5, 1),
  (6, 'HSQ', '新竹縣', 'NORTH', 6, 1),
  (7, 'ILA', '宜蘭縣', 'NORTH', 7, 1),
  (8, 'MIA', '苗栗縣', 'CENTRAL', 8, 1),
  (9, 'TXG', '臺中市', 'CENTRAL', 9, 1),
  (10, 'CHA', '彰化縣', 'CENTRAL', 10, 1),
  (11, 'NAN', '南投縣', 'CENTRAL', 11, 1),
  (12, 'YUN', '雲林縣', 'CENTRAL', 12, 1),
  (13, 'CYI', '嘉義市', 'SOUTH', 13, 1),
  (14, 'CYQ', '嘉義縣', 'SOUTH', 14, 1),
  (15, 'TNN', '臺南市', 'SOUTH', 15, 1),
  (16, 'KHH', '高雄市', 'SOUTH', 16, 1),
  (17, 'PIF', '屏東縣', 'SOUTH', 17, 1),
  (18, 'HUA', '花蓮縣', 'EAST', 18, 1),
  (19, 'TTT', '臺東縣', 'EAST', 19, 1),
  (20, 'PEN', '澎湖縣', 'ISLANDS', 20, 1),
  (21, 'KIN', '金門縣', 'ISLANDS', 21, 1),
  (22, 'LIE', '連江縣', 'ISLANDS', 22, 1);

ALTER TABLE customer_statuses ADD COLUMN light TEXT NOT NULL DEFAULT 'GREEN' CHECK (light IN ('GREEN', 'BLUE', 'YELLOW', 'ORANGE', 'RED', 'PURPLE', 'BLACK', 'CLOSED'));
INSERT OR IGNORE INTO customer_statuses (id, code, name, sort_order, is_active, updated_at, updated_by, light) VALUES
  (1, 'S01', '正常', 1, 1, '2026-11-03T00:00:00.000Z', NULL, 'GREEN'),
  (2, 'S02', '已拜訪', 2, 1, '2026-11-03T00:00:00.000Z', NULL, 'BLUE'),
  (3, 'S03', '已報價待回應', 3, 1, '2026-11-03T00:00:00.000Z', NULL, 'BLUE'),
  (4, 'S04', '少量叫貨', 4, 1, '2026-11-03T00:00:00.000Z', NULL, 'YELLOW'),
  (5, 'S05', '針灸針以外往來', 5, 1, '2026-11-03T00:00:00.000Z', NULL, 'YELLOW'),
  (6, 'S06', '三個月無叫貨', 6, 1, '2026-11-03T00:00:00.000Z', NULL, 'ORANGE'),
  (7, 'S07', '一年無往來', 7, 1, '2026-11-03T00:00:00.000Z', NULL, 'RED'),
  (8, 'S08', '不滿不再往來', 8, 1, '2026-11-03T00:00:00.000Z', NULL, 'RED'),
  (9, 'S09', '不受歡迎客戶', 9, 1, '2026-11-03T00:00:00.000Z', NULL, 'BLACK'),
  (10, 'S10', '已歇業', 10, 1, '2026-11-03T00:00:00.000Z', NULL, 'CLOSED');

CREATE TABLE customer_contacts_new (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    name TEXT,
    department_name TEXT,
    title TEXT,
    phone TEXT,
    mobile TEXT,
    note TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE RESTRICT ON DELETE CASCADE
);
INSERT INTO customer_contacts_new (id, customer_id, name, department_name, title, phone, mobile, note, sort_order, is_active, created_at, updated_at)
SELECT id, customer_id, name, department_name, title, phone, mobile, note, sort_order, is_active, created_at, updated_at FROM customer_contacts;
-- customer_visits points at customer_contacts, so it is rebuilt with it (children first, as in 0033).
CREATE TABLE customer_visits_new (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    visit_date TEXT NOT NULL,
    contact_id INTEGER,
    person_snapshot TEXT,
    employee_id INTEGER NOT NULL,
    content TEXT,
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    subject TEXT NOT NULL DEFAULT '' CHECK (length(subject) <= 16),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (contact_id) REFERENCES customer_contacts_new(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (employee_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
INSERT INTO customer_visits_new (id, customer_id, visit_date, contact_id, person_snapshot, employee_id, content, created_at, created_by, updated_at, updated_by, revision, subject)
SELECT id, customer_id, visit_date, contact_id, person_snapshot, employee_id, content, created_at, created_by, updated_at, updated_by, revision, subject FROM customer_visits;
DROP TABLE customer_visits;
DROP TABLE customer_contacts;
ALTER TABLE customer_contacts_new RENAME TO customer_contacts;
ALTER TABLE customer_visits_new RENAME TO customer_visits;
CREATE INDEX idx_customer_contacts_customer ON customer_contacts(customer_id, sort_order);
CREATE INDEX idx_customer_visits_customer_date ON customer_visits(customer_id, visit_date DESC);
CREATE TRIGGER retire_customer_visits_identity AFTER DELETE ON customer_visits BEGIN INSERT INTO entity_id_high_watermarks(table_name,last_id) VALUES('customer_visits',OLD.id) ON CONFLICT(table_name) DO UPDATE SET last_id=MAX(last_id,excluded.last_id); END;

CREATE TABLE customer_addresses_new (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    postal_code TEXT,
    address TEXT,
    note TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE RESTRICT ON DELETE CASCADE
);
INSERT INTO customer_addresses_new (id, customer_id, postal_code, address, note, sort_order, created_at, updated_at)
SELECT id, customer_id, postal_code, address, note, sort_order, created_at, updated_at FROM customer_addresses;
DROP TABLE customer_addresses;
ALTER TABLE customer_addresses_new RENAME TO customer_addresses;
CREATE INDEX idx_customer_addresses_customer ON customer_addresses(customer_id, sort_order);

ALTER TABLE customer_notes ADD COLUMN is_important INTEGER NOT NULL DEFAULT 0 CHECK (is_important IN (0, 1));
UPDATE customer_notes SET is_important = 1;
ALTER TABLE customers ADD COLUMN payment_terms TEXT CHECK (payment_terms IS NULL OR length(payment_terms) BETWEEN 1 AND 20);
ALTER TABLE customers ADD COLUMN invoice_type TEXT CHECK (invoice_type IS NULL OR length(invoice_type) BETWEEN 1 AND 20);
