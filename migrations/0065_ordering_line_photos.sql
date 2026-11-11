-- 自訂中國貨：每一列可附一張照片（客訂書比對用，使用者 2026-11-11）。只存中繼資料，JPEG 放在既有 HR_FILES R2。
-- 不設外鍵串聯刪除：品項或叫貨單刪掉時，Worker 先把 R2 檔案刪掉再刪這裡的列，不留孤兒檔。
-- 叫貨單結案（或作廢）時照片自動刪除。
CREATE TABLE ordering_line_photos (
 line_id INTEGER PRIMARY KEY,
 order_id INTEGER NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 1048576),
 width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 2000),
 height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 2000),
 created_at TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES app_members(id)
);
CREATE INDEX idx_ordering_line_photos_order ON ordering_line_photos(order_id);
