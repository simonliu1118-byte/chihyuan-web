-- V0.9.31 Build 1: fix production D1 receipt insert failure.
-- D1 permits at most 50 BYTES for LIKE/GLOB patterns. The original 0022
-- ERP number CHECK used 60 bytes (341A- + 11 '[0-9]' classes).
-- Do not edit already-applied 0022. Preserve receipt headers, detail rows,
-- stable IDs, FKs, and indexes using replacement tables.
-- Build the replacement child against the replacement parent BEFORE dropping
-- the original child/parent; deferring FKs alone does not stop ON DELETE CASCADE.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE ordering_receipts_new (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL,
    erp_purchase_no TEXT NOT NULL CHECK (
        length(erp_purchase_no) = 16
        AND substr(erp_purchase_no,1,5) = '341A-'
        AND substr(erp_purchase_no,6) NOT GLOB '*[^0-9]*'
    ),
    received_date TEXT NOT NULL CHECK (
        received_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'
    ),
    created_at TEXT NOT NULL,
    created_by INTEGER,
    FOREIGN KEY (order_id) REFERENCES ordering_orders(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
INSERT INTO ordering_receipts_new (id,order_id,erp_purchase_no,received_date,created_at,created_by)
SELECT id,order_id,erp_purchase_no,received_date,created_at,created_by FROM ordering_receipts;

CREATE TABLE ordering_receipt_lines_new (
    receipt_id INTEGER NOT NULL,
    line_id INTEGER NOT NULL,
    quantity REAL NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (receipt_id, line_id),
    FOREIGN KEY (receipt_id) REFERENCES ordering_receipts_new(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (line_id) REFERENCES ordering_lines(id) ON UPDATE RESTRICT ON DELETE CASCADE
);
INSERT INTO ordering_receipt_lines_new (receipt_id,line_id,quantity)
SELECT receipt_id,line_id,quantity FROM ordering_receipt_lines;

-- The original detail table must go first: otherwise dropping its parent
-- triggers ON DELETE CASCADE and deletes historical receipt-line records.
DROP TABLE ordering_receipt_lines;
DROP TABLE ordering_receipts;
ALTER TABLE ordering_receipts_new RENAME TO ordering_receipts;
ALTER TABLE ordering_receipt_lines_new RENAME TO ordering_receipt_lines;

CREATE INDEX idx_ordering_receipts_order ON ordering_receipts(order_id);
CREATE INDEX idx_ordering_receipts_no ON ordering_receipts(erp_purchase_no);
CREATE INDEX idx_ordering_receipt_lines_line ON ordering_receipt_lines(line_id);

-- D1 checks deferred foreign keys when the migration transaction commits.
PRAGMA foreign_key_check;
