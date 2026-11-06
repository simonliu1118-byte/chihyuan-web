-- Reuse the existing repair category choices; older dispatches have no category yet.
ALTER TABLE store_equipment_records ADD COLUMN category TEXT NOT NULL DEFAULT '';
ALTER TABLE store_equipment_records ADD COLUMN category_other TEXT NOT NULL DEFAULT '';
