-- V0.16.0: item-specific wholesale and online pricing; platform names are editable settings.
-- Every price uses the existing scaled4 integer representation of items.cost and items.store_price.
CREATE TABLE item_web_platforms (
 id INTEGER PRIMARY KEY,
 name TEXT NOT NULL UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 80),
 sort_order INTEGER NOT NULL DEFAULT 0,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 updated_at TEXT NOT NULL,
 updated_by INTEGER REFERENCES app_members(id)
);
INSERT INTO item_web_platforms(id,name,sort_order,is_active,updated_at)
VALUES (1,'蝦',0,1,'2026-11-09T00:00:00.000Z'),
       (2,'MO',1,1,'2026-11-09T00:00:00.000Z'),
       (3,'酷',2,1,'2026-11-09T00:00:00.000Z'),
       (4,'露',3,1,'2026-11-09T00:00:00.000Z'),
       (5,'好賣',4,1,'2026-11-09T00:00:00.000Z'),
       (6,'iOPEN',5,1,'2026-11-09T00:00:00.000Z');
CREATE INDEX idx_item_web_platform_order ON item_web_platforms(sort_order,id);

CREATE TABLE item_online_prices (
 item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
 platform_id INTEGER NOT NULL REFERENCES item_web_platforms(id) ON DELETE RESTRICT,
 price INTEGER NOT NULL CHECK(price>=0),
 PRIMARY KEY(item_id,platform_id)
);
CREATE INDEX idx_item_online_prices_platform ON item_online_prices(platform_id,item_id);

CREATE TABLE item_wholesale_prices (
 id INTEGER PRIMARY KEY,
 item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
 unit TEXT NOT NULL CHECK(length(trim(unit)) BETWEEN 1 AND 40),
 price INTEGER NOT NULL CHECK(price>=0),
 sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order>=0),
 UNIQUE(item_id,unit)
);
CREATE INDEX idx_item_wholesale_prices_item ON item_wholesale_prices(item_id,sort_order,id);
