-- V0.15.0 BOT 審核：多則稿逐則審、稿件分類、審核用圖片、BOT 回報已送出 (user 2026-11-09).
-- A draft without items is reviewed as a whole, exactly as before.

ALTER TABLE bot_drafts ADD COLUMN kind TEXT NOT NULL DEFAULT 'general' CHECK(kind IN ('general','post','patrol'));
-- Single draft: the BOT reports when it carried the approved work out.
ALTER TABLE bot_drafts ADD COLUMN sent_at TEXT;
CREATE INDEX idx_bot_drafts_reviewed ON bot_drafts(reviewed_at);

CREATE TABLE bot_draft_items (
 id INTEGER PRIMARY KEY,
 draft_id INTEGER NOT NULL REFERENCES bot_drafts(id) ON DELETE CASCADE,
 seq INTEGER NOT NULL CHECK(seq BETWEEN 1 AND 50),
 ref TEXT CHECK(ref IS NULL OR length(trim(ref)) BETWEEN 1 AND 80),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 480),
 body TEXT NOT NULL CHECK(length(body) <= 16000),
 review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected')),
 review_reason TEXT CHECK(review_reason IS NULL OR length(review_reason) <= 2000),
 reviewed_by INTEGER REFERENCES app_members(id),
 reviewed_at TEXT,
 sent_at TEXT,
 UNIQUE(draft_id, seq),
 CHECK((review_status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (review_status IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
 CHECK(sent_at IS NULL OR review_status = 'approved')
);
CREATE INDEX idx_bot_draft_items_pending ON bot_draft_items(review_status, draft_id);
CREATE INDEX idx_bot_draft_items_sent ON bot_draft_items(sent_at);

-- Review-only images. Technical data: not in the portable backup; removed the day after review.
CREATE TABLE bot_review_images (
 id INTEGER PRIMARY KEY,
 draft_id INTEGER NOT NULL REFERENCES bot_drafts(id) ON DELETE CASCADE,
 item_id INTEGER REFERENCES bot_draft_items(id) ON DELETE CASCADE,
 object_key TEXT NOT NULL UNIQUE,
 content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
 bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 2097152),
 created_at TEXT NOT NULL
);
CREATE INDEX idx_bot_review_images_draft ON bot_review_images(draft_id, item_id);
