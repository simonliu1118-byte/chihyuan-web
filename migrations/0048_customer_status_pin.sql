-- V0.9.99 customer settings (user 2026-11-03): 正常 always heads the status list and 已歇業 always
-- ends it; neither takes part in drag ordering. Other statuses, categories and departments are
-- ordered by dragging (sort_order 1, 2, 3 …).
ALTER TABLE customer_statuses ADD COLUMN pin TEXT CHECK (pin IS NULL OR pin IN ('TOP', 'BOTTOM'));
UPDATE customer_statuses SET pin = 'TOP' WHERE name = '正常';
UPDATE customer_statuses SET pin = 'BOTTOM' WHERE name = '已歇業';
