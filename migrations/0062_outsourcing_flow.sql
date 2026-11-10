-- WO-0.18.0: Outsourcing production, material ledger and vendor settlement.
-- Existing outsourcing orders, BOM and contractor prices are confirmed empty.
-- Retain contractors, contacts, pricing and BOM records; replace unused old order tables.
ALTER TABLE contractors ADD COLUMN billing_method TEXT NOT NULL DEFAULT 'single'
  CHECK (billing_method IN ('single','monthly'));

DROP TABLE IF EXISTS contractor_stock_movements;
DROP TABLE IF EXISTS outsourcing_pricing_items;
DROP TABLE IF EXISTS outsourcing_pricings;
DROP TABLE IF EXISTS outsourcing_receipt_items;
DROP TABLE IF EXISTS outsourcing_receipts;
DROP TABLE IF EXISTS outsourcing_order_parts;
DROP TABLE IF EXISTS outsourcing_orders;

CREATE TABLE outsourcing_orders (
 id INTEGER PRIMARY KEY,
 outsourcing_ref TEXT NOT NULL UNIQUE,
 contractor_id INTEGER NOT NULL REFERENCES contractors(id),
 contractor_name_snapshot TEXT NOT NULL,
 order_date TEXT NOT NULL,
 note TEXT,
 closed_at TEXT,
 closed_reason TEXT,
 created_at TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES app_members(id),
 updated_at TEXT NOT NULL,
 updated_by INTEGER NOT NULL REFERENCES app_members(id),
 revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_outsourcing_orders_contractor ON outsourcing_orders(contractor_id,order_date DESC);

CREATE TABLE outsourcing_order_products (
 id INTEGER PRIMARY KEY,
 outsourcing_order_id INTEGER NOT NULL REFERENCES outsourcing_orders(id) ON DELETE CASCADE,
 item_id INTEGER NOT NULL REFERENCES items(id),
 bom_recipe_id INTEGER REFERENCES bom_recipes(id),
 planned_quantity INTEGER NOT NULL CHECK(planned_quantity>0),
 unit TEXT NOT NULL,
 sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_outsourcing_products_order ON outsourcing_order_products(outsourcing_order_id,sort_order);

CREATE TABLE outsourcing_issues (
 id INTEGER PRIMARY KEY,
 outsourcing_order_id INTEGER NOT NULL REFERENCES outsourcing_orders(id),
 issued_date TEXT NOT NULL,
 note TEXT,
 cancelled_at TEXT,
 created_at TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES app_members(id)
);
CREATE INDEX idx_outsourcing_issues_order ON outsourcing_issues(outsourcing_order_id,issued_date);
CREATE TABLE outsourcing_issue_items (
 id INTEGER PRIMARY KEY,
 issue_id INTEGER NOT NULL REFERENCES outsourcing_issues(id),
 item_id INTEGER NOT NULL REFERENCES items(id),
 quantity INTEGER NOT NULL CHECK(quantity>0),
 unit TEXT NOT NULL,
 sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE outsourcing_receipts (
 id INTEGER PRIMARY KEY,
 outsourcing_order_id INTEGER NOT NULL REFERENCES outsourcing_orders(id),
 received_date TEXT NOT NULL,
 erp_no TEXT,
 note TEXT,
 cancelled_at TEXT,
 created_at TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES app_members(id)
);
CREATE INDEX idx_outsourcing_receipts_order ON outsourcing_receipts(outsourcing_order_id,received_date);
CREATE TABLE outsourcing_receipt_items (
 id INTEGER PRIMARY KEY,
 receipt_id INTEGER NOT NULL REFERENCES outsourcing_receipts(id),
 order_product_id INTEGER NOT NULL REFERENCES outsourcing_order_products(id),
 item_id INTEGER NOT NULL REFERENCES items(id),
 bom_recipe_id INTEGER REFERENCES bom_recipes(id),
 quantity INTEGER NOT NULL CHECK(quantity>0),
 unit TEXT NOT NULL,
 pricing_unit TEXT,
 unit_price INTEGER,
 sort_order INTEGER NOT NULL DEFAULT 0,
 CHECK(unit_price IS NULL OR unit_price>=0)
);
CREATE INDEX idx_outsourcing_receipt_items_receipt ON outsourcing_receipt_items(receipt_id);

CREATE TABLE contractor_stock_events (
 id INTEGER PRIMARY KEY,
 contractor_id INTEGER NOT NULL REFERENCES contractors(id),
 event_type TEXT NOT NULL CHECK(event_type IN ('return','adjust')),
 event_date TEXT NOT NULL,
 reason TEXT,
 note TEXT,
 created_at TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES app_members(id)
);
CREATE TABLE contractor_stock_event_items (
 id INTEGER PRIMARY KEY,
 event_id INTEGER NOT NULL REFERENCES contractor_stock_events(id),
 item_id INTEGER NOT NULL REFERENCES items(id),
 quantity_delta INTEGER NOT NULL CHECK(quantity_delta<>0),
 unit TEXT NOT NULL
);
CREATE TABLE contractor_stock_movements (
 id INTEGER PRIMARY KEY,
 contractor_id INTEGER NOT NULL REFERENCES contractors(id),
 item_id INTEGER NOT NULL REFERENCES items(id),
 related_finished_item_id INTEGER REFERENCES items(id),
 movement_type TEXT NOT NULL CHECK(movement_type IN ('issue','consumption','return','adjust','reversal')),
 quantity_delta INTEGER NOT NULL CHECK(quantity_delta<>0),
 occurred_at TEXT NOT NULL,
 issue_id INTEGER REFERENCES outsourcing_issues(id),
 receipt_id INTEGER REFERENCES outsourcing_receipts(id),
 stock_event_id INTEGER REFERENCES contractor_stock_events(id),
 reversal_of_movement_id INTEGER REFERENCES contractor_stock_movements(id),
 reason TEXT,
 created_at TEXT NOT NULL,
 operator_employee_id INTEGER NOT NULL REFERENCES app_members(id)
);
CREATE INDEX idx_contractor_stock_balance ON contractor_stock_movements(contractor_id,item_id,id);
CREATE INDEX idx_contractor_stock_issue ON contractor_stock_movements(issue_id);
CREATE INDEX idx_contractor_stock_receipt ON contractor_stock_movements(receipt_id);
CREATE INDEX idx_contractor_stock_reversal ON contractor_stock_movements(reversal_of_movement_id);

CREATE TABLE outsourcing_statements (
 id INTEGER PRIMARY KEY,
 contractor_id INTEGER NOT NULL REFERENCES contractors(id),
 statement_date TEXT NOT NULL,
 period_month TEXT,
 status_code TEXT NOT NULL DEFAULT 'draft' CHECK(status_code IN ('draft','confirmed')),
 confirmed_at TEXT,
 created_at TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES app_members(id),
 updated_at TEXT NOT NULL,
 updated_by INTEGER NOT NULL REFERENCES app_members(id),
 revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_outsourcing_statements_contractor ON outsourcing_statements(contractor_id,statement_date DESC);
CREATE TABLE outsourcing_statement_lines (
 id INTEGER PRIMARY KEY,
 statement_id INTEGER NOT NULL REFERENCES outsourcing_statements(id) ON DELETE CASCADE,
 receipt_item_id INTEGER NOT NULL UNIQUE REFERENCES outsourcing_receipt_items(id),
 pricing_unit TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity>0),
 unit_price INTEGER,
 amount INTEGER,
 CHECK(unit_price IS NULL OR unit_price>=0)
);
CREATE TABLE outsourcing_statement_adjustments (
 id INTEGER PRIMARY KEY,
 statement_id INTEGER NOT NULL REFERENCES outsourcing_statements(id) ON DELETE CASCADE,
 description TEXT NOT NULL,
 amount INTEGER NOT NULL,
 sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE outsourcing_statement_payments (
 id INTEGER PRIMARY KEY,
 statement_id INTEGER NOT NULL REFERENCES outsourcing_statements(id),
 payment_date TEXT NOT NULL,
 method TEXT NOT NULL CHECK(method IN ('cash','transfer','cheque','other')),
 amount INTEGER NOT NULL CHECK(amount>0),
 note TEXT,
 created_at TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES app_members(id)
);
CREATE INDEX idx_outsourcing_payments_statement ON outsourcing_statement_payments(statement_id,payment_date);
