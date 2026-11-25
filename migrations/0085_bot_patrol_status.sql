-- V0.30.0: 巡視場次狀態改由 BOT 回報的結構化則數推算；成果可附原文（供送出內容視窗並排顯示）。
-- 場次則數皆可為 NULL：從未回報則數的場次沿用連結稿件／completed 的舊推算。
ALTER TABLE bot_patrol_sessions ADD COLUMN pending_review INTEGER CHECK(pending_review IS NULL OR pending_review >= 0);
ALTER TABLE bot_patrol_sessions ADD COLUMN to_send INTEGER CHECK(to_send IS NULL OR to_send >= 0);
ALTER TABLE bot_patrol_sessions ADD COLUMN waiting_images INTEGER CHECK(waiting_images IS NULL OR waiting_images >= 0);
ALTER TABLE bot_patrol_sessions ADD COLUMN skipped INTEGER CHECK(skipped IS NULL OR skipped >= 0);
ALTER TABLE bot_patrol_sessions ADD COLUMN abandoned INTEGER CHECK(abandoned IS NULL OR abandoned >= 0);
-- 成果的原文（BOT 巡到的貼文）；舊成果為空字串，不回溯處理。
ALTER TABLE bot_deliveries ADD COLUMN source_text TEXT NOT NULL DEFAULT '';
ALTER TABLE bot_deliveries ADD COLUMN source_author TEXT NOT NULL DEFAULT '';
ALTER TABLE bot_deliveries ADD COLUMN source_url TEXT NOT NULL DEFAULT '';
