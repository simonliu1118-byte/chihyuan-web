-- V0.9.43 (user 2026-10-28): a query sent while ERP is paused may join the queue and run once the
-- pause ends. not_before is that time; the Agent does not claim the query before it.
ALTER TABLE erp_item_queries ADD COLUMN not_before TEXT;
