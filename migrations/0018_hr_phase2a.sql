-- WO-0.9.24 HR 2a. Separate configuration entities first for FK-safe upgrades.
CREATE TABLE hr_stores (
 id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,sort_order INTEGER NOT NULL DEFAULT 0,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 cycle_anchor_date TEXT NOT NULL,rules_template TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE TABLE hr_job_titles (
 id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,sort_order INTEGER NOT NULL DEFAULT 0,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),updated_at TEXT NOT NULL
);
CREATE TABLE hr_shift_types (
 id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,
 start_time TEXT NOT NULL,end_time TEXT NOT NULL,break_start TEXT,break_end TEXT,
 normal_minutes INTEGER NOT NULL CHECK(normal_minutes BETWEEN 0 AND 600),
 sort_order INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),updated_at TEXT NOT NULL
);
CREATE TABLE hr_leave_types (
 id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,
 sort_order INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 is_statutory INTEGER NOT NULL DEFAULT 0 CHECK(is_statutory IN (0,1)),updated_at TEXT NOT NULL
);
CREATE TABLE hr_holidays (date TEXT PRIMARY KEY,name TEXT NOT NULL);
ALTER TABLE hr_employees ADD COLUMN store_id INTEGER REFERENCES hr_stores(id);
ALTER TABLE hr_employees ADD COLUMN job_title_id INTEGER REFERENCES hr_job_titles(id);
ALTER TABLE hr_employees ADD COLUMN roster_sort INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hr_employees ADD COLUMN employment_type TEXT NOT NULL DEFAULT 'full' CHECK(employment_type IN ('full','half','casual'));
ALTER TABLE hr_employees ADD COLUMN skip_roster_checks INTEGER NOT NULL DEFAULT 0 CHECK(skip_roster_checks IN (0,1));
ALTER TABLE hr_employees ADD COLUMN schedule_mode TEXT NOT NULL DEFAULT 'shift' CHECK(schedule_mode IN ('shift','hours','none'));
CREATE INDEX idx_hr_employee_roster ON hr_employees(store_id,job_title_id,roster_sort,id);
CREATE TABLE hr_schedule_days (
 id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 store_id INTEGER NOT NULL REFERENCES hr_stores(id),work_date TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('shift','hours','off','leave')),
 off_mark TEXT CHECK(off_mark IN ('slash','x')),leave_type_id INTEGER REFERENCES hr_leave_types(id),
 shift_type_id INTEGER REFERENCES hr_shift_types(id),hours REAL,
 start_time TEXT,end_time TEXT,marker TEXT CHECK(marker IN ('home','booth')),
 rest_label TEXT CHECK(rest_label IN ('regular','rest')),note TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL,updated_by INTEGER,UNIQUE(employee_id,work_date),
 CHECK((kind='off' AND off_mark IS NOT NULL AND shift_type_id IS NULL AND leave_type_id IS NULL AND hours IS NULL)
 OR (kind='shift' AND shift_type_id IS NOT NULL AND off_mark IS NULL AND leave_type_id IS NULL)
 OR (kind='hours' AND hours IS NOT NULL AND off_mark IS NULL AND leave_type_id IS NULL)
 OR (kind='leave' AND leave_type_id IS NOT NULL AND off_mark IS NULL AND shift_type_id IS NULL))
);
CREATE INDEX idx_hr_schedule_store_date ON hr_schedule_days(store_id,work_date,employee_id);
CREATE INDEX idx_hr_schedule_employee_date ON hr_schedule_days(employee_id,work_date);
CREATE TABLE hr_schedule_months (
 id INTEGER PRIMARY KEY AUTOINCREMENT,store_id INTEGER NOT NULL REFERENCES hr_stores(id),
 month TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',rules TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL,updated_by INTEGER,UNIQUE(store_id,month)
);
CREATE TABLE hr_roster_approvals (
 id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 kind TEXT NOT NULL CHECK(kind IN ('consecutive','over_eight')),
 start_date TEXT NOT NULL,end_date TEXT NOT NULL,
 approved_by INTEGER NOT NULL,approved_at TEXT NOT NULL,
 UNIQUE(employee_id,kind,start_date,end_date)
);
CREATE INDEX idx_hr_approval_employee ON hr_roster_approvals(employee_id,start_date,end_date);
CREATE TABLE hr_attendance_days (
 id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 work_date TEXT NOT NULL,in1 TEXT,out1 TEXT,in2 TEXT,out2 TEXT,
 source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','import')),
 note TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,updated_by INTEGER,UNIQUE(employee_id,work_date)
);
CREATE INDEX idx_hr_attendance_employee_date ON hr_attendance_days(employee_id,work_date);
INSERT INTO hr_stores(name,sort_order,cycle_anchor_date,created_at,updated_at)
 VALUES('志遠高雄門市',0,'2026-09-28',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO hr_job_titles(name,sort_order,updated_at) VALUES
 ('店長',1,CURRENT_TIMESTAMP),('門市',2,CURRENT_TIMESTAMP),('業務',3,CURRENT_TIMESTAMP),
 ('美編',4,CURRENT_TIMESTAMP),('兼職',5,CURRENT_TIMESTAMP);
INSERT INTO hr_shift_types(code,name,start_time,end_time,break_start,break_end,normal_minutes,sort_order,updated_at) VALUES
 ('早','早班','09:00','17:30','13:00','13:30',480,1,CURRENT_TIMESTAMP),
 ('晚','晚班','12:30','21:00','16:30','17:00',480,2,CURRENT_TIMESTAMP),
 ('日','日班','10:30','19:00','14:30','15:00',480,3,CURRENT_TIMESTAMP),
 ('A','A 班','09:00','13:00',NULL,NULL,240,4,CURRENT_TIMESTAMP),
 ('B','B 班','13:00','17:00',NULL,NULL,240,5,CURRENT_TIMESTAMP),
 ('C','C 班','17:00','21:00',NULL,NULL,240,6,CURRENT_TIMESTAMP);
INSERT INTO hr_leave_types(code,name,sort_order,is_statutory,updated_at) VALUES
 ('特','特休',1,1,CURRENT_TIMESTAMP),('事','事假',2,1,CURRENT_TIMESTAMP),
 ('病','普通傷病假',3,1,CURRENT_TIMESTAMP),('生','生理假',4,1,CURRENT_TIMESTAMP),
 ('婚','婚假',5,1,CURRENT_TIMESTAMP),('喪','喪假',6,1,CURRENT_TIMESTAMP),
 ('產','產假',7,1,CURRENT_TIMESTAMP),('檢','產檢假',8,1,CURRENT_TIMESTAMP),
 ('陪','陪產檢及陪產假',9,1,CURRENT_TIMESTAMP),('家','家庭照顧假',10,1,CURRENT_TIMESTAMP),
 ('公','公假',11,1,CURRENT_TIMESTAMP),('傷','公傷病假',12,1,CURRENT_TIMESTAMP),
 ('颱','颱風假',13,0,CURRENT_TIMESTAMP),('國','國定假日休',14,0,CURRENT_TIMESTAMP),
 ('補','補休',15,0,CURRENT_TIMESTAMP),('換','國定假日換休',16,0,CURRENT_TIMESTAMP),
 ('獎','獎勵假',17,0,CURRENT_TIMESTAMP);
