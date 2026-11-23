-- WO-0.23.0. One visit per customer/month, completion belongs to each machine.
-- Only these two business tables are changed. Existing completed visits are
-- migrated to all active/retained plan members without changing their history.
-- D1 applies this forward migration in one transaction. Defer NO ACTION child
-- references while replacing the parent; do not disable FK enforcement or edit
-- sqlite_schema. IDs, metadata and both referencing tables remain unchanged.
PRAGMA defer_foreign_keys=ON;
CREATE TABLE store_maintenance_visits_copy AS SELECT * FROM store_maintenance_visits;
DROP TABLE store_maintenance_visits;
CREATE TABLE store_maintenance_visits(
 id INTEGER PRIMARY KEY,customer_code TEXT NOT NULL CHECK(length(trim(customer_code))>0),customer_name TEXT NOT NULL,
 planned_month TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN(0,1)),
 completion_date TEXT,note TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_at TEXT NOT NULL,created_by INTEGER NOT NULL REFERENCES app_members(id),
 updated_at TEXT NOT NULL,updated_by INTEGER NOT NULL REFERENCES app_members(id),
 UNIQUE(customer_code,planned_month)
);
-- Insert into the original parent name after recreation, so SQLite resolves
-- deferred child references without discarding its FK violation counter.
INSERT INTO store_maintenance_visits
 (id,customer_code,customer_name,planned_month,completed,completion_date,note,version,created_at,created_by,updated_at,updated_by)
 SELECT id,customer_code,customer_name,planned_month,completed,completion_date,note,version,created_at,created_by,updated_at,updated_by
 FROM store_maintenance_visits_copy;
DROP TABLE store_maintenance_visits_copy;
CREATE INDEX idx_maintenance_visits_month ON store_maintenance_visits(planned_month DESC,id DESC);
-- Partial visits also have a latest actual date now.
CREATE INDEX idx_maintenance_actual_month ON store_maintenance_visits(completion_date,customer_code)
 WHERE completion_date IS NOT NULL;

ALTER TABLE store_equipment_plans ADD COLUMN completed INTEGER NOT NULL DEFAULT 0
  CHECK (completed IN (0,1));
ALTER TABLE store_equipment_plans ADD COLUMN completion_date TEXT
  CHECK (completed=1 OR completion_date IS NULL);
ALTER TABLE store_equipment_plans ADD COLUMN note TEXT NOT NULL DEFAULT '';

-- Idempotent backfill body: never replace a machine's own completion history.
-- The schema DDL itself is applied once by the forward-migration ledger.
UPDATE store_equipment_plans
SET completed=1,
    completion_date=(SELECT v.completion_date FROM store_maintenance_visits v WHERE v.id=visit_id),
    note=(SELECT v.note FROM store_maintenance_visits v WHERE v.id=visit_id)
WHERE completed=0 AND (active=1 OR retained=1) AND EXISTS (
  SELECT 1 FROM store_maintenance_visits v
  WHERE v.id=store_equipment_plans.visit_id AND v.completed=1
);

UPDATE store_maintenance_visits
SET completed=CASE WHEN
      EXISTS (SELECT 1 FROM store_equipment_plans p
              WHERE p.visit_id=store_maintenance_visits.id AND p.completed=1)
      AND NOT EXISTS (SELECT 1 FROM store_equipment_plans p
              WHERE p.visit_id=store_maintenance_visits.id
                AND p.active=1 AND p.completed=0)
    THEN 1 ELSE 0 END,
    completion_date=(SELECT MAX(p.completion_date) FROM store_equipment_plans p
                     WHERE p.visit_id=store_maintenance_visits.id AND p.completed=1),
    note=COALESCE((SELECT p.note FROM store_equipment_plans p
          WHERE p.visit_id=store_maintenance_visits.id AND p.completed=1
          ORDER BY p.completion_date DESC,p.equipment_id DESC LIMIT 1),note);
-- Partial index bounds actual-month searches without scanning every plan.
CREATE INDEX idx_equipment_plan_completion_date ON store_equipment_plans(completion_date,visit_id)
  WHERE completed=1 AND completion_date IS NOT NULL;
CREATE INDEX idx_equipment_plan_visit_status ON store_equipment_plans(visit_id,completed,active);
