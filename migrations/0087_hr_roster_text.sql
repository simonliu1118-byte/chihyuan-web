CREATE TABLE hr_roster_text_defaults (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 kind TEXT NOT NULL CHECK(kind IN ('note','rule')),
 text TEXT NOT NULL,
 store_ids_json TEXT NOT NULL CHECK(json_valid(store_ids_json) AND json_type(store_ids_json)='array'),
 updated_at TEXT NOT NULL
);
INSERT INTO hr_roster_text_defaults(kind,text,store_ids_json,updated_at)
 SELECT 'rule',rules_template,json_array(id),updated_at FROM hr_stores WHERE trim(rules_template)<>'';
ALTER TABLE hr_schedule_months ADD COLUMN note_items_json TEXT CHECK(note_items_json IS NULL OR (json_valid(note_items_json) AND json_type(note_items_json)='array'));
ALTER TABLE hr_schedule_months ADD COLUMN employee_notes_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(employee_notes_json) AND json_type(employee_notes_json)='object');
