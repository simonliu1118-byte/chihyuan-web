-- 人事資料單（使用者 2026-11-24）：學歷新增單行「備註」，與工作經歷的「離職原因」欄對齊。
-- 可為空，既有學歷列為 NULL；長度上限 200 字由 API 驗證（本表其他欄位同樣不加 CHECK）。
ALTER TABLE hr_education ADD COLUMN note TEXT;
