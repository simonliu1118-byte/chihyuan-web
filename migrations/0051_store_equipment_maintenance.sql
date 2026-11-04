-- Dispatch records and a single visit per normalized customer/month; no cron materialization.
CREATE TABLE store_equipment_state(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL CHECK(version>0));
CREATE TABLE store_equipment_records(
 id INTEGER PRIMARY KEY,list_sequence INTEGER NOT NULL UNIQUE,
 customer_code TEXT NOT NULL DEFAULT '',customer_name TEXT NOT NULL,
 brand TEXT NOT NULL DEFAULT '',model TEXT NOT NULL DEFAULT '',sale_date TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 1000),
 warranty_start TEXT NOT NULL DEFAULT '',warranty_end TEXT NOT NULL DEFAULT '',
 machines_json TEXT NOT NULL CHECK(json_valid(machines_json)),
 maintenance INTEGER NOT NULL CHECK(maintenance IN(0,1)),version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_at TEXT NOT NULL,created_by INTEGER NOT NULL REFERENCES app_members(id),
 updated_at TEXT NOT NULL,updated_by INTEGER NOT NULL REFERENCES app_members(id),
 CHECK(length(trim(customer_name))>0),CHECK(maintenance=0 OR length(trim(customer_code))>0)
);
CREATE INDEX idx_equipment_records_sequence ON store_equipment_records(list_sequence DESC);
CREATE INDEX idx_equipment_records_customer ON store_equipment_records(customer_code);
CREATE TABLE store_maintenance_visits(
 id INTEGER PRIMARY KEY,customer_code TEXT NOT NULL CHECK(length(trim(customer_code))>0),customer_name TEXT NOT NULL,
 planned_month TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN(0,1)),
 completion_date TEXT,note TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_at TEXT NOT NULL,created_by INTEGER NOT NULL REFERENCES app_members(id),
 updated_at TEXT NOT NULL,updated_by INTEGER NOT NULL REFERENCES app_members(id),
 UNIQUE(customer_code,planned_month),CHECK(completed=1 OR completion_date IS NULL)
);
CREATE INDEX idx_maintenance_visits_month ON store_maintenance_visits(planned_month DESC,id DESC);
CREATE TABLE store_equipment_plans(
 equipment_id INTEGER NOT NULL REFERENCES store_equipment_records(id),
 visit_id INTEGER NOT NULL REFERENCES store_maintenance_visits(id),
 active INTEGER NOT NULL CHECK(active IN(0,1)),retained INTEGER NOT NULL DEFAULT 0 CHECK(retained IN(0,1)),snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 PRIMARY KEY(equipment_id,visit_id)
);
CREATE INDEX idx_equipment_plans_visit ON store_equipment_plans(visit_id,active,equipment_id);
CREATE TABLE store_equipment_events(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 equipment_id INTEGER REFERENCES store_equipment_records(id),visit_id INTEGER REFERENCES store_maintenance_visits(id),
 actor INTEGER NOT NULL REFERENCES app_members(id),at TEXT NOT NULL,kind TEXT NOT NULL,
 before_json TEXT NOT NULL CHECK(json_valid(before_json)),after_json TEXT NOT NULL CHECK(json_valid(after_json)),
 reason TEXT NOT NULL DEFAULT '',request_key TEXT NOT NULL,request_hash TEXT NOT NULL,
 UNIQUE(actor,request_key),CHECK((equipment_id IS NULL)!=(visit_id IS NULL))
);
CREATE INDEX idx_equipment_events_record ON store_equipment_events(equipment_id,id DESC);
CREATE INDEX idx_equipment_events_visit ON store_equipment_events(visit_id,id DESC);
