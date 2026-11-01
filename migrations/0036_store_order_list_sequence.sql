-- Persist display numbering once; ordinary reads never recompute ROW_NUMBER.
ALTER TABLE store_customer_orders ADD COLUMN list_sequence INTEGER NOT NULL DEFAULT 0 CHECK(list_sequence>=0);
WITH ranks AS MATERIALIZED (
 SELECT id,ROW_NUMBER() OVER(ORDER BY order_date,julianday(created_at),id) position FROM store_customer_orders
) UPDATE store_customer_orders SET list_sequence=(SELECT position FROM ranks WHERE ranks.id=store_customer_orders.id);
CREATE INDEX idx_store_customer_orders_list_sequence ON store_customer_orders(list_sequence DESC);
CREATE INDEX idx_store_customer_orders_list_sort ON store_customer_orders(order_date,julianday(created_at),id);
