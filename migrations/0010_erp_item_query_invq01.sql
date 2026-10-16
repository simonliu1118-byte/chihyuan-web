-- Extend the existing one-job-per-member ERP Bridge without rewriting applied migrations.
-- NULL new fields mean legacy Agent / pre-migration jobs.
ALTER TABLE erp_item_queries ADD COLUMN include_history INTEGER NOT NULL DEFAULT 0 CHECK(include_history IN (0,1));
ALTER TABLE erp_item_queries ADD COLUMN history_from TEXT;
ALTER TABLE erp_item_queries ADD COLUMN history_to TEXT;
ALTER TABLE erp_item_queries ADD COLUMN batch_managed INTEGER CHECK(batch_managed IN (0,1));
ALTER TABLE erp_item_queries ADD COLUMN batches_json TEXT CHECK(batches_json IS NULL OR json_valid(batches_json));
ALTER TABLE erp_item_queries ADD COLUMN history_json TEXT CHECK(history_json IS NULL OR json_valid(history_json));
