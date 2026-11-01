-- Preserve removed entries and immutable source events; stop before unbounded copying.
SELECT CASE WHEN
 (SELECT COUNT(*) FROM (SELECT 1 FROM store_blacklist LIMIT 5001))+
 (SELECT COUNT(*) FROM (SELECT 1 FROM store_blacklist_events LIMIT 5001))<=5000
 THEN 1 ELSE json('STORE_BLACKLIST_LIFECYCLE_EXCEEDS_5000_ROWS') END;
ALTER TABLE store_blacklist ADD COLUMN activation_at TEXT;
UPDATE store_blacklist SET activation_at=created_at;
CREATE TABLE store_blacklist_operations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 blacklist_id INTEGER NOT NULL REFERENCES store_blacklist(id),
 source_order_id INTEGER REFERENCES store_customer_orders(id),
 actor INTEGER NOT NULL REFERENCES app_members(id),
 at TEXT NOT NULL,
 kind TEXT NOT NULL,
 before_json TEXT NOT NULL DEFAULT '{}',
 after_json TEXT NOT NULL DEFAULT '{}',
 reason TEXT NOT NULL DEFAULT '',
 legacy_event_id INTEGER UNIQUE REFERENCES store_blacklist_events(id)
);
INSERT INTO store_blacklist_operations(id,blacklist_id,source_order_id,actor,at,kind,before_json,after_json,reason,legacy_event_id)
 SELECT id,blacklist_id,order_id,actor,at,'訂購取消','{}',summary_json,reason,id FROM store_blacklist_events;
CREATE INDEX idx_store_blacklist_operations ON store_blacklist_operations(blacklist_id,id DESC);
CREATE INDEX idx_store_blacklist_activation ON store_blacklist(joined_date DESC,activation_at DESC,id DESC);
