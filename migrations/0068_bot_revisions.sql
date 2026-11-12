-- Preserve draft history while replacing the current version; revisions never inherit approval.
ALTER TABLE bot_drafts ADD COLUMN previous_draft_id INTEGER REFERENCES bot_drafts(id);
ALTER TABLE bot_drafts ADD COLUMN revision_number INTEGER NOT NULL DEFAULT 1 CHECK(revision_number>=1);
CREATE UNIQUE INDEX idx_bot_drafts_previous ON bot_drafts(previous_draft_id) WHERE previous_draft_id IS NOT NULL;
-- User 2026-11-12: remove the retired IT identity and its business/integration data.
-- Keep R2 keys in a retryable technical queue until object deletion succeeds.
CREATE TABLE bot_review_image_deletions(object_key TEXT PRIMARY KEY);
INSERT OR IGNORE INTO bot_review_image_deletions SELECT g.object_key FROM bot_review_images g JOIN bot_drafts d ON d.id=g.draft_id JOIN bot_profiles b ON b.id=d.bot_id WHERE b.code='IT';
DELETE FROM bot_review_images WHERE draft_id IN(SELECT d.id FROM bot_drafts d JOIN bot_profiles b ON b.id=d.bot_id WHERE b.code='IT');
DELETE FROM bot_draft_items WHERE draft_id IN(SELECT d.id FROM bot_drafts d JOIN bot_profiles b ON b.id=d.bot_id WHERE b.code='IT');
DELETE FROM bot_review_push_outbox WHERE draft_id IN(SELECT d.id FROM bot_drafts d JOIN bot_profiles b ON b.id=d.bot_id WHERE b.code='IT');
DELETE FROM bot_drafts WHERE bot_id IN(SELECT id FROM bot_profiles WHERE code='IT');
DELETE FROM bot_reports WHERE bot_id IN(SELECT id FROM bot_profiles WHERE code='IT');
DELETE FROM bot_completions WHERE bot_id IN(SELECT id FROM bot_profiles WHERE code='IT');
DELETE FROM bot_review_push_settings WHERE bot_id IN(SELECT id FROM bot_profiles WHERE code='IT');
DELETE FROM bot_ingest_credentials WHERE bot_id IN(SELECT id FROM bot_profiles WHERE code='IT');
DELETE FROM bot_profiles WHERE code='IT';
