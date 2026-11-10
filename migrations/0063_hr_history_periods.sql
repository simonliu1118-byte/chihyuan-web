-- 人事資料單（使用者 2026-11-10）：學歷改「就讀年月（起～迄）」、拿掉學位；
-- 工作經歷加「薪資待遇」「離職原因」。正式站學歷／經歷皆 0 筆。
ALTER TABLE hr_education ADD COLUMN start_month TEXT;
ALTER TABLE hr_education ADD COLUMN end_month TEXT;
UPDATE hr_education SET end_month = graduation_month WHERE graduation_month IS NOT NULL;
ALTER TABLE hr_education DROP COLUMN degree;
ALTER TABLE hr_education DROP COLUMN graduation_month;
ALTER TABLE hr_work_history ADD COLUMN salary TEXT;
ALTER TABLE hr_work_history ADD COLUMN leave_reason TEXT;
