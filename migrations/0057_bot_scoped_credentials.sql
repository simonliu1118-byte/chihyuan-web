-- Preserve the existing credential exactly, but restrict it to SOCIAL_EDITOR.
-- No plaintext token is needed or regenerated during this migration.
INSERT OR IGNORE INTO bot_profiles(code,label,status,summary,updated_at)
SELECT 'SOCIAL_EDITOR','社群小編','idle','',strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS(SELECT 1 FROM bot_ingest_credentials WHERE id=1);

CREATE TABLE bot_credentials_next (
 bot_id INTEGER PRIMARY KEY REFERENCES bot_profiles(id),
 token_hash TEXT UNIQUE CHECK(token_hash IS NULL OR (length(token_hash)=64 AND token_hash NOT GLOB '*[^0-9a-f]*')),
 created_at TEXT,
 revoked_at TEXT,
 updated_by INTEGER REFERENCES app_members(id)
);
INSERT INTO bot_credentials_next(bot_id,token_hash,created_at,revoked_at,updated_by)
SELECT b.id,c.token_hash,c.created_at,c.revoked_at,c.updated_by
FROM bot_ingest_credentials c JOIN bot_profiles b ON b.code='SOCIAL_EDITOR' WHERE c.id=1;
DROP TABLE bot_ingest_credentials;
ALTER TABLE bot_credentials_next RENAME TO bot_ingest_credentials;

-- Existing completions stay general. Never infer publications from old titles.
ALTER TABLE bot_completions ADD COLUMN work_type TEXT NOT NULL DEFAULT 'general'
 CHECK(work_type IN ('general','article_published','threads_patrol'));
ALTER TABLE bot_completions ADD COLUMN event_ref TEXT
 CHECK(event_ref IS NULL OR length(trim(event_ref)) BETWEEN 1 AND 480);
CREATE UNIQUE INDEX idx_bot_completions_event ON bot_completions(bot_id,event_ref) WHERE event_ref IS NOT NULL;
CREATE INDEX idx_bot_completions_work_day ON bot_completions(work_type,completed_at DESC,id DESC);
CREATE INDEX idx_bot_completions_bot_work_day ON bot_completions(bot_id,work_type,completed_at DESC,id DESC);
