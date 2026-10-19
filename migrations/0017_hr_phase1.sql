-- WO-0.9.20 HR phase 1. All HR rows are super-admin only; no hard deletion of staff or immutable histories.
CREATE TABLE hr_employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'probation' CHECK (status IN ('probation','active','leave','terminated')),
  member_id INTEGER UNIQUE REFERENCES app_members(id),
  national_id TEXT,
  birth_date TEXT,
  gender TEXT,
  mobile TEXT,
  phone TEXT,
  mailing_address TEXT,
  registered_address TEXT,
  hire_date TEXT NOT NULL,
  seniority_start_date TEXT NOT NULL,
  termination_date TEXT,
  termination_reason TEXT,
  note TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by INTEGER,
  updated_by INTEGER
);
CREATE INDEX idx_hr_employees_status ON hr_employees(status, id);
CREATE INDEX idx_hr_employees_name ON hr_employees(name, id);
CREATE TABLE hr_emergency_contacts (
 id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 name TEXT NOT NULL, relationship TEXT, phone TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_hr_emergency_employee ON hr_emergency_contacts(employee_id, sort_order);
CREATE TABLE hr_education (
 id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 school TEXT NOT NULL, department TEXT, degree TEXT, graduation_month TEXT,
 sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_hr_education_employee ON hr_education(employee_id, sort_order);
CREATE TABLE hr_work_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 company TEXT NOT NULL, job_title TEXT, start_month TEXT, end_month TEXT, note TEXT,
 sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_hr_work_history_employee ON hr_work_history(employee_id, sort_order);
CREATE TABLE hr_status_changes (
 id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 effective_date TEXT NOT NULL, previous_status TEXT NOT NULL, next_status TEXT NOT NULL
 CHECK(next_status IN ('probation','active','leave','terminated')),
 reason TEXT NOT NULL, handled_by INTEGER, created_at TEXT NOT NULL
);
CREATE INDEX idx_hr_status_changes_employee ON hr_status_changes(employee_id,effective_date,id);
CREATE TABLE hr_seniority_exclusions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 start_date TEXT NOT NULL, end_date TEXT NOT NULL, reason TEXT NOT NULL,
 created_at TEXT NOT NULL, created_by INTEGER, CHECK(start_date<=end_date)
);
CREATE INDEX idx_hr_seniority_exclusions_employee ON hr_seniority_exclusions(employee_id,start_date);
CREATE TABLE hr_salary_item_types (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN(0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE hr_minimum_wages (
 id INTEGER PRIMARY KEY AUTOINCREMENT, effective_date TEXT NOT NULL UNIQUE,
 monthly_amount INTEGER NOT NULL CHECK(monthly_amount>=0),
 hourly_amount INTEGER NOT NULL CHECK(hourly_amount>=0),
 created_at TEXT NOT NULL, created_by INTEGER
);
CREATE TABLE hr_salary_records (
 id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 effective_date TEXT NOT NULL, payment_type TEXT NOT NULL CHECK(payment_type IN('monthly','hourly')),
 base_amount INTEGER NOT NULL CHECK(base_amount>=0),
 reason TEXT NOT NULL, created_at TEXT NOT NULL, created_by INTEGER
);
CREATE INDEX idx_hr_salary_records_employee ON hr_salary_records(employee_id,effective_date,id);
CREATE TABLE hr_salary_allowances (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 salary_record_id INTEGER NOT NULL REFERENCES hr_salary_records(id),
 item_type_id INTEGER NOT NULL REFERENCES hr_salary_item_types(id),
 amount INTEGER NOT NULL CHECK(amount>=0),
 is_regular INTEGER NOT NULL CHECK(is_regular IN(0,1))
);
CREATE INDEX idx_hr_salary_allowances_record ON hr_salary_allowances(salary_record_id);
