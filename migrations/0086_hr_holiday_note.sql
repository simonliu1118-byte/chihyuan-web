-- Preserve existing holidays; notes are optional and included in portable backups.
ALTER TABLE hr_holidays ADD COLUMN note TEXT NOT NULL DEFAULT '';
