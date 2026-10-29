-- Ignore is a SYNC exclusion list, never a WEB stocktake sheet.
CREATE TABLE stocktake_sync_ignored (
  sheet_no TEXT PRIMARY KEY CHECK(length(sheet_no) BETWEEN 1 AND 20 AND sheet_no NOT GLOB '*[^A-Za-z0-9]*'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- Upgrade legacy IGNORED sheets without losing their exclusion decisions.
INSERT INTO stocktake_sync_ignored(sheet_no,created_at,updated_at)
SELECT sheet_no,created_at,updated_at FROM stocktake_sheets WHERE status='IGNORED';
-- Never delete already-synced rows: preserve their details and history.
UPDATE stocktake_sheets SET status='COUNTING',version=version+1
 WHERE status='IGNORED' AND detail_read_at IS NOT NULL;
-- Legacy exclusion-only placeholders were not imported by ERP and must not be WEB sheets.
DELETE FROM stocktake_sheets WHERE status='IGNORED' AND detail_read_at IS NULL;
