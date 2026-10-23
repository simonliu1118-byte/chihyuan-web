-- V0.9.33 ordering-source UI: payment terms are descriptive; no ERP/vendor master binding.
-- Preserve all historical source IDs and linked orders; existing is_active=0 hides the source.
ALTER TABLE ordering_sources ADD COLUMN payment_terms TEXT NOT NULL DEFAULT '' CHECK (length(payment_terms) <= 200);

-- Vendor tab order is personal to the authenticated app member, not shared sort_order.
CREATE TABLE ordering_user_preferences (
  member_id INTEGER PRIMARY KEY,
  vendor_order_json TEXT NOT NULL DEFAULT '[]'
    CHECK (length(vendor_order_json) <= 3000 AND json_valid(vendor_order_json)),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE CASCADE
);
