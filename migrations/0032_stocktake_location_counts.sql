-- Stocktake location-count cells: one ERP source sequence can contain several shelf locations.
-- Explicit user approval in docs/handoff/CYWEB-STOCKTAKE-LOCATION-BATCH-DESIGN-20261030.md §14.1:
-- reset draft WEB stocktake sheets, while retaining sync-ignore preferences and Audit.
-- This migration MUST NOT be deployed before Claude reviews and the user approves release.
DELETE FROM stocktake_sheets;

CREATE TABLE stocktake_location_counts (
  id INTEGER PRIMARY KEY,
  sheet_no TEXT NOT NULL,
  source_line_key TEXT NOT NULL,
  warehouse_name TEXT NOT NULL DEFAULT '',
  erp_location_code TEXT NOT NULL DEFAULT '',
  location_code TEXT NOT NULL
    CHECK(location_code='' OR (length(location_code)=4 AND location_code NOT GLOB '*[^0-9]*')),
  first_qty TEXT,
  recount_qty TEXT,
  first_by INTEGER,
  first_at TEXT,
  recount_by INTEGER,
  recount_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  rev INTEGER NOT NULL DEFAULT 0,
  manual_verified_at TEXT,
  manual_verified_by INTEGER,
  UNIQUE(sheet_no,source_line_key,warehouse_name,location_code),
  FOREIGN KEY(sheet_no,source_line_key) REFERENCES stocktake_lines(sheet_no,line_key) ON DELETE CASCADE,
  FOREIGN KEY(first_by) REFERENCES app_members(id),
  FOREIGN KEY(recount_by) REFERENCES app_members(id),
  FOREIGN KEY(manual_verified_by) REFERENCES app_members(id)
);
CREATE INDEX idx_stocktake_location_counts_rev ON stocktake_location_counts(sheet_no,rev);
CREATE INDEX idx_stocktake_location_counts_location ON stocktake_location_counts(sheet_no,warehouse_name,location_code);

-- The approved draft reset leaves no history records; recreate the existing history table
-- to extend its constrained field enum without an unsupported SQLite ALTER CHECK.
-- This intentionally preserves the history model (not a second history table).
DROP TABLE stocktake_line_history;
CREATE TABLE stocktake_line_history (
  id INTEGER PRIMARY KEY,
  sheet_no TEXT NOT NULL,
  line_key TEXT NOT NULL,
  field TEXT NOT NULL CHECK(field IN ('first_qty','recount_qty','added','deleted','location_cell_added','location_code')),
  before_value TEXT,
  after_value TEXT,
  removed_rev INTEGER,
  actor_member_id INTEGER NOT NULL,
  changed_at TEXT NOT NULL,
  location_count_id INTEGER,
  FOREIGN KEY(sheet_no) REFERENCES stocktake_sheets(sheet_no) ON DELETE CASCADE,
  FOREIGN KEY(actor_member_id) REFERENCES app_members(id)
);
CREATE INDEX idx_stocktake_removed_rev ON stocktake_line_history(sheet_no,removed_rev) WHERE removed_rev IS NOT NULL;
CREATE INDEX idx_stocktake_line_history_line ON stocktake_line_history(sheet_no,line_key,id);
CREATE INDEX idx_stocktake_history_location_count ON stocktake_line_history(sheet_no,location_count_id);
