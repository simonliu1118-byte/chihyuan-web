-- Public release metadata and daily-job coordination, never business/Identity authority.
CREATE TABLE program_catalog_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  attempted_day TEXT NOT NULL CHECK (attempted_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  attempted_at TEXT NOT NULL,
  attempt_token TEXT NOT NULL,
  completed_at TEXT,
  catalog_json TEXT CHECK (catalog_json IS NULL OR json_valid(catalog_json)),
  failure_json TEXT CHECK (failure_json IS NULL OR json_valid(failure_json))
);
