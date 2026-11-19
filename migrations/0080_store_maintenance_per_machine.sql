-- WO-0.23.0. One visit per customer/month, completion belongs to each machine.
-- Only these two business tables are changed. Existing completed visits are
-- migrated to all active/retained plan members without changing their history.
ALTER TABLE store_equipment_plans ADD COLUMN completed INTEGER NOT NULL DEFAULT 0
  CHECK (completed IN (0,1));
ALTER TABLE store_equipment_plans ADD COLUMN completion_date TEXT
  CHECK (completed=1 OR completion_date IS NULL);
ALTER TABLE store_equipment_plans ADD COLUMN note TEXT NOT NULL DEFAULT '';

-- Idempotent backfill body: repeated execution does not overwrite per-machine
-- edits because the migration is run once by the forward-migration system.
UPDATE store_equipment_plans
SET completed=1,
    completion_date=(SELECT v.completion_date FROM store_maintenance_visits v WHERE v.id=visit_id),
    note=(SELECT v.note FROM store_maintenance_visits v WHERE v.id=visit_id)
WHERE (active=1 OR retained=1) AND EXISTS (
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
          ORDER BY p.completion_date DESC,p.equipment_id DESC LIMIT 1),'');
-- Partial index bounds actual-month searches without scanning every plan.
CREATE INDEX idx_equipment_plan_completion_date ON store_equipment_plans(completion_date,visit_id)
  WHERE completed=1 AND completion_date IS NOT NULL;
CREATE INDEX idx_equipment_plan_visit_status ON store_equipment_plans(visit_id,completed,active);
