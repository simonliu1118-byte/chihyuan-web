-- Versioned legal facts support statutory continuous leave without changing salary master data.
CREATE TABLE hr_payroll_legal_cases (
 id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 kind TEXT NOT NULL CHECK(kind IN('maternity','occupational')),event_date TEXT NOT NULL,
 from_date TEXT NOT NULL,to_date TEXT NOT NULL,monthly_basis INTEGER NOT NULL CHECK(monthly_basis>=0),
 average_daily REAL NOT NULL CHECK(average_daily>=0),offsets_json TEXT NOT NULL CHECK(json_valid(offsets_json)),
 reference TEXT NOT NULL,reason TEXT NOT NULL,is_active INTEGER NOT NULL CHECK(is_active IN(0,1)),
 created_at TEXT NOT NULL,created_by INTEGER NOT NULL,
 CHECK(from_date<=to_date)
);
CREATE INDEX idx_hr_payroll_legal_cases ON hr_payroll_legal_cases(employee_id,kind,event_date,id);
