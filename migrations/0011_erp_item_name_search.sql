-- Shared single-job queue for ITEM_NO and ITEM_NAME queries; ephemeral results only.
-- Existing jobs are item-number searches by definition.
ALTER TABLE erp_item_queries ADD COLUMN query_type TEXT NOT NULL DEFAULT 'ITEM_NO'
  CHECK(query_type IN ('ITEM_NO','ITEM_NAME'));
ALTER TABLE erp_item_queries ADD COLUMN keyword TEXT;
ALTER TABLE erp_item_queries ADD COLUMN items_json TEXT
  CHECK(items_json IS NULL OR json_valid(items_json));
CREATE INDEX idx_erp_item_query_type ON erp_item_queries(query_type,created_at);
