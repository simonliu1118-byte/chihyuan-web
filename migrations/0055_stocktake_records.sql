-- Completed ERP inventories leave the active relay, retaining summary and differences only.
CREATE TABLE stocktake_records (
 id INTEGER PRIMARY KEY,
 sheet_no TEXT NOT NULL,
 sheet_date TEXT,
 source_created_at TEXT NOT NULL,
 source_status TEXT NOT NULL,
 sync_job_id TEXT NOT NULL,
 archived_at TEXT NOT NULL,
 first_confirmed_by INTEGER REFERENCES app_members(id),
 first_confirmed_name TEXT,
 first_confirmed_at TEXT,
 second_confirmed_by INTEGER REFERENCES app_members(id),
 second_confirmed_name TEXT,
 second_confirmed_at TEXT,
 erp_confirmed_at TEXT,
 UNIQUE(sheet_no,source_created_at)
);
CREATE INDEX idx_stocktake_records_date ON stocktake_records(COALESCE(sheet_date,''),id);
CREATE INDEX idx_stocktake_records_job ON stocktake_records(sync_job_id,archived_at);
CREATE TABLE stocktake_record_items (
 record_id INTEGER NOT NULL REFERENCES stocktake_records(id) ON DELETE CASCADE,
 item_code TEXT NOT NULL,
 item_name TEXT NOT NULL,
 PRIMARY KEY(record_id,item_code)
);
CREATE TABLE stocktake_record_participants (
 record_id INTEGER NOT NULL REFERENCES stocktake_records(id) ON DELETE CASCADE,
 member_id INTEGER NOT NULL REFERENCES app_members(id),
 display_name TEXT NOT NULL,
 first_at TEXT,
 last_at TEXT,
 first_count_at TEXT,
 recount_at TEXT,
 PRIMARY KEY(record_id,member_id)
);
CREATE TABLE stocktake_record_differences (
 record_id INTEGER NOT NULL REFERENCES stocktake_records(id) ON DELETE CASCADE,
 line_key TEXT NOT NULL,
 item_code TEXT NOT NULL,item_name TEXT NOT NULL,batch TEXT NOT NULL,
 -- Exact integer ten-thousandths as TEXT, avoiding JSON/JS loss above 2^53.
 book_units TEXT NOT NULL,first_units TEXT,recount_units TEXT,actual_units TEXT,difference_units TEXT,
 first_people_json TEXT NOT NULL CHECK(json_valid(first_people_json)),
 recount_people_json TEXT NOT NULL CHECK(json_valid(recount_people_json)),
 PRIMARY KEY(record_id,line_key)
);
