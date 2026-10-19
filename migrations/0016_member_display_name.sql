-- CYID-owned employee name cached locally for human-readable audit and member displays.
ALTER TABLE app_members ADD COLUMN display_name TEXT CHECK (display_name IS NULL OR length(display_name) BETWEEN 1 AND 120);
