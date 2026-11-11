-- 中國貨採購（使用者 2026-11-11）：
-- 訂購時每一列（拆段）可填備註；每筆刷卡可加一筆該刷卡專屬的運費（台幣），只攤給同一筆刷卡的品項。
ALTER TABLE ordering_cn_pieces ADD COLUMN note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 200);
ALTER TABLE ordering_cn_charges ADD COLUMN shipping INTEGER CHECK (shipping IS NULL OR shipping >= 0);
