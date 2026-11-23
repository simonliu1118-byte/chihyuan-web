-- Independent bonus batches; monthly payroll snapshots stay untouched.
CREATE TABLE hr_bonus_batches (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 request_key TEXT NOT NULL UNIQUE,
 pay_date TEXT NOT NULL,
 category TEXT NOT NULL,
 attribution_year INTEGER,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','paid','void')),
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,created_by INTEGER NOT NULL,
 updated_at TEXT NOT NULL,updated_by INTEGER NOT NULL,
 paid_at TEXT,void_reason TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_hr_bonus_date ON hr_bonus_batches(pay_date,id);
CREATE TABLE hr_bonus_payments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 batch_id INTEGER NOT NULL REFERENCES hr_bonus_batches(id),
 employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 amount INTEGER NOT NULL CHECK(amount>0),note TEXT NOT NULL DEFAULT '',
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 UNIQUE(batch_id,employee_id)
);
CREATE INDEX idx_hr_bonus_employee ON hr_bonus_payments(employee_id,batch_id);
CREATE INDEX idx_hr_payroll_paid_date ON hr_payroll_runs(pay_date,employee_id) WHERE status='paid';
-- Single payment ledger consumed by payroll, bonuses and employer supplement.
-- A historical monthly bonus is counted in its original salary snapshot only.
CREATE VIEW hr_paid_income AS
 SELECT 'salary' AS source,id,employee_id,pay_date,result_json,source_json FROM hr_payroll_runs WHERE status='paid'
 UNION ALL
 SELECT 'bonus',p.id,p.employee_id,b.pay_date,p.result_json,p.source_json
 FROM hr_bonus_payments p JOIN hr_bonus_batches b ON b.id=p.batch_id WHERE b.status='paid';
