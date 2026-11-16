CREATE TABLE hr_payroll_corrections (
 id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 source_run_id INTEGER NOT NULL REFERENCES hr_payroll_runs(id),target_month TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('salary_topup','salary_recovery','insurance_charge','insurance_refund','tax_charge','tax_refund')),
 amount INTEGER NOT NULL CHECK(amount>0),reference TEXT NOT NULL,consent_reference TEXT NOT NULL DEFAULT '',reason TEXT NOT NULL,
 request_key TEXT NOT NULL UNIQUE,is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN(0,1)),revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,created_by INTEGER NOT NULL,voided_at TEXT,voided_by INTEGER
);
CREATE INDEX idx_hr_payroll_corrections_target ON hr_payroll_corrections(employee_id,target_month,id);
CREATE TABLE hr_payroll_correction_uses (
 id INTEGER PRIMARY KEY AUTOINCREMENT,correction_id INTEGER NOT NULL REFERENCES hr_payroll_corrections(id),
 run_id INTEGER NOT NULL REFERENCES hr_payroll_runs(id),is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN(0,1)),created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_hr_payroll_correction_use ON hr_payroll_correction_uses(correction_id) WHERE is_active=1;
CREATE INDEX idx_hr_payroll_employee_paid ON hr_payroll_runs(employee_id,status,month,id);
