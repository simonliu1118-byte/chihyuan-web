-- V0.21.6: per-contractor stock revision. Return, count and every other write that changes a
-- contractor's held stock bump it, so a stale count or a resubmitted return is refused (409).
ALTER TABLE contractors ADD COLUMN stock_revision INTEGER NOT NULL DEFAULT 1 CHECK (stock_revision > 0);
