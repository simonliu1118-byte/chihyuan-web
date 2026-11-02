-- WO-0.9.71: targeted lookup of ERP restock results in current ordering drafts.
CREATE INDEX idx_ordering_lines_item_code ON ordering_lines(item_code,order_id);
