-- V0.10.4 customer business profile (user 2026-11-04), edited with the customer sheet:
-- 客戶描述: one line per point, each with a category (clinic situation, equipment, brands, cautions,
-- other); 潛在銷售品項: things the clinic uses or we could sell — one of our items or a typed name,
-- what stage it is at, the brand they use now, and a note.
CREATE TABLE customer_profile_notes (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('CONDITION', 'EQUIPMENT', 'BRAND', 'CAUTION', 'OTHER')),
    content TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 100),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    created_by INTEGER,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX idx_customer_profile_notes_customer ON customer_profile_notes(customer_id, sort_order);

CREATE TABLE customer_prospect_items (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    item_id INTEGER,
    item_name TEXT CHECK (item_name IS NULL OR length(trim(item_name)) BETWEEN 1 AND 60),
    stage TEXT CHECK (stage IS NULL OR stage IN ('USING_OTHER', 'RECOMMEND', 'QUOTED', 'OTHER')),
    brand TEXT CHECK (brand IS NULL OR length(brand) <= 40),
    note TEXT CHECK (note IS NULL OR length(note) <= 100),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    created_by INTEGER,
    CHECK (item_id IS NOT NULL OR item_name IS NOT NULL),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX idx_customer_prospect_items_customer ON customer_prospect_items(customer_id, sort_order);
CREATE INDEX idx_customer_prospect_items_item ON customer_prospect_items(item_id);
