-- Manual shared platform fees/discounts. No AI interface or default production rates.
CREATE TABLE item_platform_margin_rules (
 platform_id INTEGER PRIMARY KEY REFERENCES item_web_platforms(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL CHECK(revision>0),
 rules_json TEXT NOT NULL CHECK(json_valid(rules_json)),
 updated_at TEXT NOT NULL,
 updated_by INTEGER NOT NULL REFERENCES app_members(id) ON DELETE RESTRICT
);
CREATE TABLE item_platform_margin_rule_versions (
 platform_id INTEGER NOT NULL REFERENCES item_web_platforms(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL CHECK(revision>0),
 rules_json TEXT NOT NULL CHECK(json_valid(rules_json)),
 updated_at TEXT NOT NULL,
 updated_by INTEGER NOT NULL REFERENCES app_members(id) ON DELETE RESTRICT,
 PRIMARY KEY(platform_id,revision)
);
