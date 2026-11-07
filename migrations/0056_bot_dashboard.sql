-- Cover complete counters and filtered keyset pages; no new business tables.
CREATE INDEX idx_bot_drafts_bot_status ON bot_drafts(bot_id, review_status, id DESC);
CREATE INDEX idx_bot_reports_bot_recent ON bot_reports(bot_id, id DESC);
CREATE INDEX idx_bot_completions_bot_time ON bot_completions(bot_id, completed_at DESC, id DESC);
