-- Actual publications/replies are independent of where approval happened.
ALTER TABLE bot_drafts ADD COLUMN externally_completed_at TEXT;
ALTER TABLE bot_draft_items ADD COLUMN externally_completed_at TEXT;
CREATE TABLE bot_patrol_sessions (
 id INTEGER PRIMARY KEY, bot_id INTEGER NOT NULL REFERENCES bot_profiles(id),
 session_ref TEXT NOT NULL, day TEXT NOT NULL, label TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL, UNIQUE(bot_id,session_ref)
);
CREATE INDEX idx_bot_patrol_sessions_day ON bot_patrol_sessions(day,bot_id);
CREATE TABLE bot_deliveries (
 id INTEGER PRIMARY KEY, bot_id INTEGER NOT NULL REFERENCES bot_profiles(id),
 event_ref TEXT NOT NULL, write_key TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL CHECK(kind IN ('post','patrol')),
 title TEXT NOT NULL, body TEXT NOT NULL, sent_at TEXT NOT NULL,
 platform TEXT NOT NULL DEFAULT '', publication_url TEXT NOT NULL DEFAULT '',
 approval_source TEXT NOT NULL CHECK(approval_source IN ('cyweb','chat','line','other')),
 approval_note TEXT NOT NULL DEFAULT '',
 draft_id INTEGER REFERENCES bot_drafts(id), item_id INTEGER REFERENCES bot_draft_items(id),
 session_id INTEGER REFERENCES bot_patrol_sessions(id),
 UNIQUE(bot_id,event_ref), CHECK(item_id IS NULL OR draft_id IS NOT NULL)
);
CREATE UNIQUE INDEX idx_bot_deliveries_item ON bot_deliveries(item_id) WHERE item_id IS NOT NULL;
CREATE UNIQUE INDEX idx_bot_deliveries_draft ON bot_deliveries(draft_id) WHERE draft_id IS NOT NULL AND item_id IS NULL;
CREATE UNIQUE INDEX idx_bot_deliveries_url ON bot_deliveries(bot_id,kind,publication_url) WHERE publication_url<>'';
CREATE INDEX idx_bot_deliveries_sent ON bot_deliveries(kind,sent_at DESC,id DESC);
CREATE INDEX idx_bot_deliveries_bot_sent ON bot_deliveries(bot_id,kind,sent_at DESC,id DESC);
CREATE INDEX idx_bot_deliveries_session ON bot_deliveries(session_id,sent_at);
INSERT INTO bot_deliveries(bot_id,event_ref,kind,title,body,sent_at,approval_source,draft_id,item_id)
 SELECT d.bot_id,'legacy-item-'||i.id,d.kind,i.title,i.body,i.sent_at,'cyweb',d.id,i.id
 FROM bot_draft_items i JOIN bot_drafts d ON d.id=i.draft_id
 WHERE i.sent_at IS NOT NULL AND d.kind IN ('post','patrol');
-- Media remains ephemeral, matching the existing next-day review-image policy.
CREATE TABLE bot_delivery_images (
 id INTEGER PRIMARY KEY, delivery_id INTEGER NOT NULL REFERENCES bot_deliveries(id),
 upload_ref TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, content_type TEXT NOT NULL,
 bytes INTEGER NOT NULL, created_at TEXT NOT NULL, UNIQUE(delivery_id,upload_ref)
);
CREATE INDEX idx_bot_delivery_images_created ON bot_delivery_images(created_at);
