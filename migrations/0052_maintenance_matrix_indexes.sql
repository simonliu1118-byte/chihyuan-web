-- Matrix pages select customers, then only planned/actual months in the three-year window.
CREATE INDEX idx_equipment_maintenance_customer ON store_equipment_records(maintenance,customer_code);
CREATE INDEX idx_maintenance_actual_month ON store_maintenance_visits(completion_date,customer_code) WHERE completed=1;
