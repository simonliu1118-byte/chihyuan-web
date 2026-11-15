-- HR payroll: immutable effective configuration and calculation snapshots.
CREATE TABLE hr_payroll_profiles (
 id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 effective_date TEXT NOT NULL,settings_json TEXT NOT NULL CHECK(json_valid(settings_json)),
 reason TEXT NOT NULL,created_at TEXT NOT NULL,created_by INTEGER NOT NULL
);
CREATE INDEX idx_hr_payroll_profile_employee ON hr_payroll_profiles(employee_id,effective_date);
CREATE TABLE hr_payroll_rule_versions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL CHECK(kind IN('labor','pension','health','tax')),
 effective_date TEXT NOT NULL,valid_until TEXT NOT NULL,source_url TEXT NOT NULL,
 source_hash TEXT NOT NULL,content_hash TEXT NOT NULL DEFAULT '',payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 source_text TEXT NOT NULL,created_at TEXT NOT NULL,
 UNIQUE(kind,effective_date,content_hash)
);
CREATE INDEX idx_hr_payroll_rules_effective ON hr_payroll_rule_versions(kind,effective_date,id);
CREATE TABLE hr_payroll_sync_state (
 kind TEXT PRIMARY KEY CHECK(kind IN('labor','pension','health','tax')),
 checked_at TEXT NOT NULL,success_at TEXT,error TEXT NOT NULL DEFAULT '',blocking INTEGER NOT NULL DEFAULT 0 CHECK(blocking IN(0,1)),
 lease_until TEXT,revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE hr_payroll_runs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 month TEXT NOT NULL,pay_date TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('draft','confirmed','paid','void')),
 revision INTEGER NOT NULL DEFAULT 1,source_hash TEXT NOT NULL,
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 input_json TEXT NOT NULL CHECK(json_valid(input_json)),
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 created_at TEXT NOT NULL,created_by INTEGER NOT NULL,updated_at TEXT NOT NULL,updated_by INTEGER NOT NULL,
 confirmed_at TEXT,paid_at TEXT,reason TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX idx_hr_payroll_active ON hr_payroll_runs(employee_id,month) WHERE status!='void';
CREATE INDEX idx_hr_payroll_month ON hr_payroll_runs(month,id);
CREATE TABLE hr_attendance_correction_grants (
 id INTEGER PRIMARY KEY AUTOINCREMENT,member_id INTEGER NOT NULL REFERENCES app_members(id),
 store_id INTEGER NOT NULL REFERENCES hr_stores(id),is_active INTEGER NOT NULL CHECK(is_active IN(0,1)),
 revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,updated_by INTEGER NOT NULL,
 UNIQUE(member_id,store_id)
);
ALTER TABLE hr_leave_records ADD COLUMN payroll_protection TEXT
 CHECK(payroll_protection IN('family_care','pregnancy_loss','pregnancy_rest') OR payroll_protection IS NULL);
CREATE TABLE hr_payroll_day_reviews (
 employee_id INTEGER NOT NULL REFERENCES hr_employees(id),work_date TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('absence','holiday_shifted','regular_emergency')),
 reason TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,updated_by INTEGER NOT NULL,
 PRIMARY KEY(employee_id,work_date)
);
CREATE TABLE hr_payroll_consumptions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 run_id INTEGER NOT NULL REFERENCES hr_payroll_runs(id),source_key TEXT NOT NULL,
 minutes INTEGER NOT NULL CHECK(minutes>0),amount INTEGER NOT NULL CHECK(amount>=0),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_hr_payroll_consumed ON hr_payroll_consumptions(employee_id,source_key) WHERE active=1;
