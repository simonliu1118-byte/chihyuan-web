-- WO-0.9.25 forward-only HR 2b leave, overtime and compensatory time.
ALTER TABLE hr_leave_types ADD COLUMN quota_days REAL;
ALTER TABLE hr_leave_types ADD COLUMN quota_period TEXT CHECK(quota_period IN ('calendar_year','month','event','two_years') OR quota_period IS NULL);
ALTER TABLE hr_leave_types ADD COLUMN merge_into_type_id INTEGER REFERENCES hr_leave_types(id);
ALTER TABLE hr_leave_types ADD COLUMN merge_after_days REAL NOT NULL DEFAULT 0;
ALTER TABLE hr_leave_types ADD COLUMN counts_calendar_days INTEGER NOT NULL DEFAULT 0 CHECK(counts_calendar_days IN(0,1));
ALTER TABLE hr_leave_types ADD COLUMN event_quota_options TEXT;
ALTER TABLE hr_leave_types ADD COLUMN requires_reason INTEGER NOT NULL DEFAULT 0 CHECK(requires_reason IN(0,1));
ALTER TABLE hr_leave_types ADD COLUMN accepts_proof INTEGER NOT NULL DEFAULT 0 CHECK(accepts_proof IN(0,1));
ALTER TABLE hr_leave_types ADD COLUMN needs_form INTEGER NOT NULL DEFAULT 1 CHECK(needs_form IN(0,1));
ALTER TABLE hr_leave_types ADD COLUMN comp_kind TEXT CHECK(comp_kind IN('overtime','holiday') OR comp_kind IS NULL);
ALTER TABLE hr_leave_types ADD COLUMN pay_ratio REAL;
ALTER TABLE hr_leave_types ADD COLUMN legal_basis TEXT;
INSERT INTO hr_leave_types(code,name,sort_order,is_statutory,updated_at) VALUES('院','住院病假',18,1,CURRENT_TIMESTAMP);
UPDATE hr_leave_types SET quota_days=14,quota_period='calendar_year',requires_reason=1 WHERE code='事';
UPDATE hr_leave_types SET quota_days=7,quota_period='calendar_year',merge_into_type_id=(SELECT id FROM hr_leave_types WHERE code='事') WHERE code='家';
UPDATE hr_leave_types SET quota_days=30,quota_period='calendar_year',merge_into_type_id=(SELECT id FROM hr_leave_types WHERE code='院') WHERE code='病';
UPDATE hr_leave_types SET quota_days=365,quota_period='two_years',accepts_proof=1 WHERE code='院';
UPDATE hr_leave_types SET quota_days=1,quota_period='month',merge_into_type_id=(SELECT id FROM hr_leave_types WHERE code='病'),merge_after_days=3 WHERE code='生';
UPDATE hr_leave_types SET quota_days=8,quota_period='event',accepts_proof=1 WHERE code='婚';
UPDATE hr_leave_types SET quota_days=8,quota_period='event',event_quota_options='3,6,8',accepts_proof=1 WHERE code='喪';
UPDATE hr_leave_types SET quota_days=56,quota_period='event',counts_calendar_days=1 WHERE code='產';
UPDATE hr_leave_types SET quota_days=7,quota_period='event' WHERE code IN('檢','陪');
UPDATE hr_leave_types SET accepts_proof=1 WHERE code IN('病','公');
UPDATE hr_leave_types SET needs_form=0 WHERE code='國';
UPDATE hr_leave_types SET comp_kind='overtime' WHERE code='補';
-- BD-060 #27: one kind of comp time. 換 is retired; roster cells already using it become 補.
UPDATE hr_leave_types SET comp_kind='overtime',is_active=0 WHERE code='換';
UPDATE hr_schedule_days SET leave_type_id=(SELECT id FROM hr_leave_types WHERE code='補') WHERE leave_type_id=(SELECT id FROM hr_leave_types WHERE code='換');

CREATE TABLE hr_leave_records(
 id INTEGER PRIMARY KEY AUTOINCREMENT,batch_id TEXT NOT NULL,
 employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 leave_type_id INTEGER NOT NULL REFERENCES hr_leave_types(id),
 work_date TEXT NOT NULL,start_time TEXT,end_time TEXT,minutes INTEGER NOT NULL CHECK(minutes>0 AND minutes%30=0),
 whole_day INTEGER NOT NULL DEFAULT 0 CHECK(whole_day IN(0,1)),
 reason TEXT NOT NULL DEFAULT '',event_date TEXT,event_quota_days REAL,
 advance_holiday_date TEXT,advance_holiday_name TEXT,
 created_at TEXT NOT NULL,created_by INTEGER NOT NULL,
 cancelled_at TEXT,cancelled_by INTEGER,cancel_reason TEXT,
 CHECK((whole_day=1 AND start_time IS NULL AND end_time IS NULL) OR (whole_day=0))
);
CREATE INDEX idx_hr_leave_employee_date ON hr_leave_records(employee_id,work_date);
CREATE INDEX idx_hr_leave_type_date ON hr_leave_records(employee_id,leave_type_id,work_date);
CREATE INDEX idx_hr_leave_batch ON hr_leave_records(batch_id);
CREATE UNIQUE INDEX idx_hr_leave_whole_active ON hr_leave_records(employee_id,work_date) WHERE cancelled_at IS NULL AND whole_day=1;
CREATE TABLE hr_leave_attachments(
 id INTEGER PRIMARY KEY AUTOINCREMENT,batch_id TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE,content_type TEXT NOT NULL CHECK(content_type='image/jpeg'),
 bytes INTEGER NOT NULL CHECK(bytes>0 AND bytes<=1572864),width INTEGER NOT NULL,height INTEGER NOT NULL,
 grayscale INTEGER NOT NULL DEFAULT 0 CHECK(grayscale IN(0,1)),
 created_at TEXT NOT NULL,created_by INTEGER NOT NULL
);
CREATE INDEX idx_hr_leave_attachments_batch ON hr_leave_attachments(batch_id);
CREATE TABLE hr_annual_leave_years(
 id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 period_start TEXT NOT NULL,period_end TEXT NOT NULL,entitled_days REAL NOT NULL,
 entitled_minutes INTEGER,entitled_minutes_override INTEGER,basis TEXT,
 notified_on TEXT,notified_by INTEGER,UNIQUE(employee_id,period_start)
);
CREATE TABLE hr_overtime_days(
 id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 work_date TEXT NOT NULL,minutes INTEGER NOT NULL CHECK(minutes>=0 AND minutes%30=0),
 settlement TEXT NOT NULL CHECK(settlement IN('pay','comp')),
 comp_expires_on TEXT,comp_extended_count INTEGER NOT NULL DEFAULT 0,
 note TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,updated_by INTEGER NOT NULL,UNIQUE(employee_id,work_date)
);
CREATE INDEX idx_hr_overtime_employee_date ON hr_overtime_days(employee_id,work_date);
CREATE TABLE hr_comp_time_grants(
 id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 kind TEXT NOT NULL CHECK(kind IN('holiday','grant')),minutes INTEGER NOT NULL CHECK(minutes>0 AND minutes%30=0),
 holiday_date TEXT,holiday_name TEXT,expires_on TEXT NOT NULL,extended_count INTEGER NOT NULL DEFAULT 0,
 note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,created_by INTEGER NOT NULL,
 CHECK(kind!='holiday' OR (holiday_date IS NOT NULL AND holiday_name IS NOT NULL))
);
CREATE INDEX idx_hr_comp_grant_employee ON hr_comp_time_grants(employee_id,expires_on);
CREATE TABLE hr_comp_time_settlements(
 id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 overtime_day_id INTEGER NOT NULL REFERENCES hr_overtime_days(id),minutes INTEGER NOT NULL CHECK(minutes>0 AND minutes%30=0),
 created_at TEXT NOT NULL,created_by INTEGER NOT NULL
);
CREATE INDEX idx_hr_comp_settle_employee ON hr_comp_time_settlements(employee_id,overtime_day_id);
