-- V0.9.95 customer sheet (user 2026-11-03): a customer keeps up to three fax numbers, stored as
-- customer_phones rows of kind FAX beside its phones; the single customers.fax column is retired.
-- Visits gain a short subject (the full content stays in content).
ALTER TABLE customer_phones ADD COLUMN kind TEXT NOT NULL DEFAULT 'PHONE' CHECK (kind IN ('PHONE', 'FAX'));
INSERT INTO customer_phones (customer_id, phone_number, extension, note, sort_order, kind, created_at, updated_at)
SELECT id, trim(fax), NULL, NULL, 0, 'FAX', updated_at, updated_at FROM customers WHERE fax IS NOT NULL AND trim(fax) <> '';
ALTER TABLE customers DROP COLUMN fax;
ALTER TABLE customer_visits ADD COLUMN subject TEXT NOT NULL DEFAULT '' CHECK (length(subject) <= 16);
