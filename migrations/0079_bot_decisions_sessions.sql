-- V0.22.0: 拍板事項、巡視場次與稿件的連結、場次明確結束。
-- 拍板事項共用 bot_drafts 的審核／版本鏈／推播／稽核，附加欄位放在側表，不重建 bot_drafts。
CREATE TABLE bot_draft_decisions (
 draft_id INTEGER PRIMARY KEY REFERENCES bot_drafts(id),
 category TEXT NOT NULL CHECK(length(category) BETWEEN 1 AND 20),
 amount INTEGER CHECK(amount IS NULL OR amount >= 0),
 deadline_at TEXT,
 options_json TEXT CHECK(options_json IS NULL OR json_valid(options_json)),
 chosen_option INTEGER CHECK(chosen_option IS NULL OR chosen_option >= 0)
);
-- 待審拍板清單依期限排序、卡片取最近期限。
CREATE INDEX idx_bot_draft_decisions_deadline ON bot_draft_decisions(deadline_at, draft_id);
-- 海巡稿可連結到同日、同 BOT 的巡視場次；場次狀態由連結的稿件／則推算。
ALTER TABLE bot_drafts ADD COLUMN session_id INTEGER REFERENCES bot_patrol_sessions(id);
CREATE INDEX idx_bot_drafts_session ON bot_drafts(session_id) WHERE session_id IS NOT NULL;
-- BOT 明確結束一個場次（全部通過的則都已送出之前也可結束）。
ALTER TABLE bot_patrol_sessions ADD COLUMN completed_at TEXT;
