-- Operational integration settings and delivery queue. Excluded from portable backups.
CREATE TABLE bot_review_push_settings (
 bot_id INTEGER PRIMARY KEY REFERENCES bot_profiles(id),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 encrypted_target TEXT,
 updated_at TEXT NOT NULL,
 updated_by INTEGER REFERENCES app_members(id),
 CHECK(enabled=0 OR encrypted_target IS NOT NULL)
);
CREATE TABLE bot_review_push_outbox (
 draft_id INTEGER PRIMARY KEY REFERENCES bot_drafts(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','accepted','failed')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 6),
 next_attempt_at TEXT NOT NULL,
 lease_token TEXT,
 lease_until TEXT,
 last_error_code TEXT,
 accepted_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX idx_bot_review_push_due ON bot_review_push_outbox(status,next_attempt_at,lease_until);
CREATE INDEX idx_bot_review_push_retention ON bot_review_push_outbox(updated_at,draft_id);
