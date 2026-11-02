-- Widen disposition with IDs, source snapshots and timeline preserved. No FK disabling.
SELECT CASE WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM store_blacklist LIMIT 5001))+(SELECT COUNT(*) FROM (SELECT 1 FROM store_blacklist_events LIMIT 5001))+(SELECT COUNT(*) FROM (SELECT 1 FROM store_blacklist_operations LIMIT 5001))<=5000 THEN 1 ELSE json('STORE_BLACKLIST_ACTION_EXCEEDS_5000_ROWS') END;
CREATE TABLE "store_blacklist_action_upgrade" (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
    phone TEXT NOT NULL CHECK (length(phone) BETWEEN 0 AND 20 AND phone NOT GLOB '*[^0-9]*'),
    mobile TEXT NOT NULL DEFAULT '' CHECK(length(mobile)<=20 AND mobile NOT GLOB '*[^0-9]*'),
    line_name TEXT NOT NULL DEFAULT '' CHECK(length(line_name)<=60),
    version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 300),
    action TEXT NOT NULL CHECK (action IN ('FULL_PAYMENT','REFUSE','NO_HOLD','OTHER')),
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER, honorific TEXT NOT NULL DEFAULT '' CHECK(honorific IN('','MR','MS')), joined_date TEXT NOT NULL DEFAULT ''
 CHECK(joined_date='' OR joined_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'), action_detail TEXT NOT NULL DEFAULT '' CHECK(length(action_detail)<=120), activation_at TEXT,
    CHECK(length(trim(phone))+length(trim(mobile))+length(trim(line_name))>0),
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
INSERT INTO store_blacklist_action_upgrade SELECT * FROM store_blacklist;
CREATE TABLE "store_blacklist_events_action_upgrade" (
 id INTEGER PRIMARY KEY AUTOINCREMENT,blacklist_id INTEGER NOT NULL REFERENCES store_blacklist_action_upgrade(id),
 order_id INTEGER NOT NULL UNIQUE REFERENCES "store_customer_orders"(id),actor INTEGER NOT NULL REFERENCES app_members(id),
 at TEXT NOT NULL,reason TEXT NOT NULL,summary_json TEXT NOT NULL
);
INSERT INTO store_blacklist_events_action_upgrade SELECT * FROM store_blacklist_events;
CREATE TABLE store_blacklist_operations_action_upgrade (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 blacklist_id INTEGER NOT NULL REFERENCES store_blacklist_action_upgrade(id),
 source_order_id INTEGER REFERENCES store_customer_orders(id),
 actor INTEGER NOT NULL REFERENCES app_members(id),
 at TEXT NOT NULL,
 kind TEXT NOT NULL,
 before_json TEXT NOT NULL DEFAULT '{}',
 after_json TEXT NOT NULL DEFAULT '{}',
 reason TEXT NOT NULL DEFAULT '',
 legacy_event_id INTEGER UNIQUE REFERENCES store_blacklist_events_action_upgrade(id)
);
INSERT INTO store_blacklist_operations_action_upgrade SELECT * FROM store_blacklist_operations;
DROP TABLE store_blacklist_operations;
DROP TABLE store_blacklist_events;
DROP TABLE store_blacklist;
ALTER TABLE store_blacklist_action_upgrade RENAME TO store_blacklist;
ALTER TABLE store_blacklist_events_action_upgrade RENAME TO store_blacklist_events;
ALTER TABLE store_blacklist_operations_action_upgrade RENAME TO store_blacklist_operations;
CREATE INDEX idx_store_blacklist_activation ON store_blacklist(joined_date DESC,activation_at DESC,id DESC);
CREATE INDEX idx_store_blacklist_contacts ON store_blacklist(active,phone,mobile);
CREATE INDEX idx_store_blacklist_joined ON store_blacklist(active,joined_date DESC,created_at DESC,id DESC);
CREATE INDEX idx_store_blacklist_events_parent ON store_blacklist_events(blacklist_id,id);
CREATE INDEX idx_store_blacklist_operations ON store_blacklist_operations(blacklist_id,id DESC);
