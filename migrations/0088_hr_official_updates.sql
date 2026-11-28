-- Existing holiday rows are intentional manual decisions; preserve them.
ALTER TABLE hr_holidays ADD COLUMN source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','official'));
CREATE TABLE hr_holiday_exclusions (
 date TEXT PRIMARY KEY,
 updated_at TEXT NOT NULL
);
CREATE TABLE hr_official_update_state (
 key TEXT PRIMARY KEY,
 checked_at TEXT,
 success_at TEXT,
 error TEXT NOT NULL DEFAULT '',
 revision TEXT NOT NULL DEFAULT '',
 review_required INTEGER NOT NULL DEFAULT 0 CHECK(review_required IN (0,1)),
 source_url TEXT NOT NULL DEFAULT '',
 lease_until TEXT,
 scheduled_period TEXT
);
