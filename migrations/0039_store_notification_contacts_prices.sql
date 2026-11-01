-- Bound parent/line transformations, preserve immutable business event snapshots.
SELECT CASE WHEN
 (SELECT COUNT(*) FROM (SELECT 1 FROM store_customer_orders LIMIT 5001))+
 (SELECT COUNT(*) FROM (SELECT 1 FROM store_customer_order_lines LIMIT 5001))+
 (SELECT COUNT(*) FROM (SELECT 1 FROM store_blacklist LIMIT 5001))<=5000
 THEN 1 ELSE json('STORE_CONTACT_UPGRADE_EXCEEDS_5000_ROWS') END;
ALTER TABLE store_customer_orders ADD COLUMN customer_code TEXT NOT NULL DEFAULT '' CHECK(length(customer_code)<=40);
ALTER TABLE store_customer_orders ADD COLUMN closed_at TEXT;
ALTER TABLE store_customer_orders ADD COLUMN notification_attempts INTEGER NOT NULL DEFAULT 0 CHECK(notification_attempts>=0);
ALTER TABLE store_customer_orders ADD COLUMN last_unreached_date TEXT;
ALTER TABLE store_customer_order_lines ADD COLUMN price_pending INTEGER NOT NULL DEFAULT 0 CHECK(price_pending IN(0,1));
ALTER TABLE store_customer_order_lines ADD COLUMN metadata_mode TEXT NOT NULL DEFAULT '' CHECK(metadata_mode IN('','BOOK','SPEC'));
ALTER TABLE store_customer_order_lines ADD COLUMN publisher TEXT NOT NULL DEFAULT '' CHECK(length(publisher)<=120);
ALTER TABLE store_customer_order_lines ADD COLUMN author TEXT NOT NULL DEFAULT '' CHECK(length(author)<=120);
ALTER TABLE store_customer_order_lines ADD COLUMN specification TEXT NOT NULL DEFAULT '' CHECK(length(specification)<=200);
-- mobile is contact 1, phone is contact 2. SQLite assignments read the old row values.
UPDATE store_customer_orders SET
 mobile=CASE WHEN mobile='' THEN phone WHEN length(phone)=10 AND phone GLOB '09*' AND NOT(length(mobile)=10 AND mobile GLOB '09*') THEN phone ELSE mobile END,
 phone=CASE WHEN mobile='' THEN '' WHEN length(phone)=10 AND phone GLOB '09*' AND NOT(length(mobile)=10 AND mobile GLOB '09*') THEN mobile ELSE phone END;
UPDATE store_blacklist SET
 mobile=CASE WHEN mobile='' THEN phone WHEN length(phone)=10 AND phone GLOB '09*' AND NOT(length(mobile)=10 AND mobile GLOB '09*') THEN phone ELSE mobile END,
 phone=CASE WHEN mobile='' THEN '' WHEN length(phone)=10 AND phone GLOB '09*' AND NOT(length(mobile)=10 AND mobile GLOB '09*') THEN mobile ELSE phone END;
