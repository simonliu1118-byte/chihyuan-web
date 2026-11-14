-- Category fee amounts/names have one authority: current rules_json and versioned snapshots.
-- This key-only projection provides referential integrity for product selections.
CREATE TABLE item_platform_fee_categories (
 platform_id INTEGER NOT NULL REFERENCES item_web_platforms(id) ON DELETE RESTRICT,
 category_id TEXT NOT NULL CHECK(length(category_id) BETWEEN 1 AND 80),
 PRIMARY KEY(platform_id,category_id)
);
CREATE TABLE item_platform_fee_selections (
 item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
 platform_id INTEGER NOT NULL,
 category_id TEXT NOT NULL,
 PRIMARY KEY(item_id,platform_id),
 FOREIGN KEY(platform_id,category_id) REFERENCES item_platform_fee_categories(platform_id,category_id) ON DELETE RESTRICT
);
CREATE INDEX idx_item_fee_selection_category ON item_platform_fee_selections(platform_id,category_id,item_id);
