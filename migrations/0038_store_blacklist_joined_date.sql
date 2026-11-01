-- Bounded additive upgrade; preserve immutable event snapshots.
SELECT CASE WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM store_blacklist LIMIT 5001))<=5000
 THEN 1 ELSE json('STORE_BLACKLIST_UPGRADE_EXCEEDS_5000_ROWS') END;
ALTER TABLE store_blacklist ADD COLUMN joined_date TEXT NOT NULL DEFAULT ''
 CHECK(joined_date='' OR joined_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]');
ALTER TABLE store_blacklist ADD COLUMN action_detail TEXT NOT NULL DEFAULT '' CHECK(length(action_detail)<=120);
UPDATE store_blacklist SET joined_date=COALESCE(date(created_at,'+8 hours'),''),reason=replace(reason,',','，');
CREATE INDEX idx_store_blacklist_joined ON store_blacklist(active,joined_date DESC,created_at DESC,id DESC);
