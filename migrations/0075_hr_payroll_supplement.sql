CREATE TABLE hr_payroll_supplement_versions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,effective_date TEXT NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),source_url TEXT NOT NULL,source_hash TEXT NOT NULL,
 content_hash TEXT NOT NULL,source_text TEXT NOT NULL,created_at TEXT NOT NULL,
 UNIQUE(effective_date,content_hash)
);
CREATE INDEX idx_hr_payroll_supplement_date ON hr_payroll_supplement_versions(effective_date,id);
CREATE INDEX idx_hr_payroll_runs_paid_date ON hr_payroll_runs(pay_date,status,employee_id);
