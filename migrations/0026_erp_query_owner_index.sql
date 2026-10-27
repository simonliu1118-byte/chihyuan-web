-- V0.9.41 (user 2026-10-27): a member may have up to three ERP queries queued or running (the
-- limit is checked when a query is created), so the one-active-query index goes. A member's recent
-- queries (shown again when the ERP pages are opened anew, also on another device) are read by
-- owner and time; this keeps that read to the few rows it returns.
DROP INDEX IF EXISTS idx_erp_query_one_active_per_member;
CREATE INDEX idx_erp_query_owner ON erp_item_queries(owner_member_id, created_at);
