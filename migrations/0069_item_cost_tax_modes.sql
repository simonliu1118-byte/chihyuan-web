-- Replace the column CHECK without dropping the parent items table or its references.
-- Old 'none' meant unspecified, never infer the new explicit 'no_tax' choice.
ALTER TABLE items RENAME COLUMN cost_tax_mode TO legacy_cost_tax_mode;
ALTER TABLE items ADD COLUMN cost_tax_mode TEXT
  CHECK (cost_tax_mode IS NULL OR cost_tax_mode IN ('inclusive','exclusive','no_tax'));
UPDATE items SET cost_tax_mode = CASE
  WHEN legacy_cost_tax_mode IN ('inclusive','exclusive') THEN legacy_cost_tax_mode
  ELSE NULL END;
ALTER TABLE items DROP COLUMN legacy_cost_tax_mode;
