-- Repair-slip photos: metadata only; the actual JPEG bytes live in existing HR_FILES R2.
CREATE TABLE store_repair_photos (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 repair_id INTEGER NOT NULL REFERENCES store_repairs(id),
 object_key TEXT NOT NULL UNIQUE,
 bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 1048576),
 width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 2000),
 height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 2000),
 created_at TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES app_members(id)
);
CREATE INDEX idx_store_repair_photos_repair ON store_repair_photos(repair_id,id);
