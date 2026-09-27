-- BD-033: once a Defect has entered actual handling, an invalid/wrongly-created
-- record is retained rather than hard-deleted. Keep workflow status codes
-- created/processing/resolved and layer explicit invalidation metadata on top.

ALTER TABLE defect_reports
  ADD COLUMN invalidated_at TEXT;

ALTER TABLE defect_reports
  ADD COLUMN invalidated_by INTEGER REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE INDEX idx_defect_reports_invalidated_at
  ON defect_reports(invalidated_at);
