-- 銷貨資料保存 (進貨輔助, user 2026-10-21): what each 品號 sold and had returned per day, kept from
-- every finished RESTOCK query for later sales analysis. Rows are written only when they change
-- (user: do not rewrite what did not change); these tables are not cleared with erp_item_queries.

-- One 品號 on one 單據日期, summed over every customer's 銷貨單／銷退單. sold／returned include
-- 贈／備品量; sold_gift／returned_gift are that part. updated_at／query_id: the query that last
-- changed the row.
CREATE TABLE erp_sales_daily (
    item_code TEXT NOT NULL CHECK (length(item_code) BETWEEN 1 AND 40),
    sale_date TEXT NOT NULL CHECK (sale_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    sold REAL NOT NULL DEFAULT 0,
    returned REAL NOT NULL DEFAULT 0,
    sold_gift REAL NOT NULL DEFAULT 0,
    returned_gift REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    query_id TEXT NOT NULL,
    PRIMARY KEY (item_code, sale_date)
);
CREATE INDEX idx_erp_sales_daily_date ON erp_sales_daily(sale_date, item_code);

-- The 品號 seen in those queries: 品名／單位 as last listed, and the last 庫存數量 read (stock_at:
-- when a different 庫存 was last read; a query that could not read it keeps the old one).
CREATE TABLE erp_sales_items (
    item_code TEXT PRIMARY KEY CHECK (length(item_code) BETWEEN 1 AND 40),
    item_name TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL DEFAULT '',
    stock REAL,
    stock_at TEXT,
    updated_at TEXT NOT NULL
);

-- The days a complete (not truncated) query covered. A day is rewritten only while its last sync
-- happened on or before that day (Taipei time), so a day synced after it ended stays as it is.
CREATE TABLE erp_sales_days (
    sale_date TEXT PRIMARY KEY CHECK (sale_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    synced_at TEXT NOT NULL,
    query_id TEXT NOT NULL
);
