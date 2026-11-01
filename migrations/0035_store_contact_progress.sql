-- Remove the independent arrival date (user decision 2026-11-01).
-- Historical immutable event snapshots remain audit history, not active arrival fields.
UPDATE store_customer_orders SET status='ORDERED' WHERE status='ARRIVED';
ALTER TABLE store_customer_orders DROP COLUMN arrived_date;
ALTER TABLE store_customer_orders ADD COLUMN honorific TEXT NOT NULL DEFAULT '' CHECK(honorific IN('','MR','MS'));
ALTER TABLE store_blacklist ADD COLUMN honorific TEXT NOT NULL DEFAULT '' CHECK(honorific IN('','MR','MS'));
ALTER TABLE store_customer_orders ADD COLUMN call_result TEXT NOT NULL DEFAULT '' CHECK(call_result IN('','ORDERED','OUT_OF_STOCK','DISCONTINUED'));
UPDATE store_customer_orders SET call_result='ORDERED' WHERE has_ever_ordered=1 OR status IN('ORDERED','NOTIFIED','PICKED_UP');
-- Keep the first actual notification confirmation separately from its optional work date.
UPDATE store_customer_orders SET notified_at=COALESCE(notified_at,updated_at) WHERE status IN('NOTIFIED','PICKED_UP');
