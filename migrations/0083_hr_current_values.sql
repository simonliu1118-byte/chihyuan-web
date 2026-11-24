-- V0.29.0 人事目前值：hr_employees 的狀態、門市、職稱、僱用型態、排班方式永遠存「台北今日」的值。
-- 建檔值改為紀錄（reason「建檔」），歷史不再依賴主檔欄位；未來生效的異動由每日排程（hrCurrentValues）推進主檔。
-- 本檔只補紀錄與校正主檔欄位，不刪除、不修改任何既有異動紀錄；每個 INSERT 都有 NOT EXISTS 條件，重跑不會重複。

-- (a) 四個任用欄位：生效日（含）以前沒有任何紀錄者，補一筆建檔紀錄，值為目前主檔欄位（舊制下即建檔基準值）。
-- 生效日用到職日；到職日為空時用建檔時間（台北日期）。主檔欄位為 NULL 的門市／職稱無法成為紀錄，維持沒有紀錄。
INSERT INTO hr_assignment_changes(employee_id,field,effective_date,previous_value,next_value,reason,handled_by,created_at)
SELECT e.id,'store_id',COALESCE(e.hire_date,date(e.created_at,'+8 hours')),NULL,CAST(e.store_id AS TEXT),'建檔',e.created_by,e.created_at FROM hr_employees e
WHERE e.store_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='store_id' AND a.effective_date<=COALESCE(e.hire_date,date(e.created_at,'+8 hours')));
INSERT INTO hr_assignment_changes(employee_id,field,effective_date,previous_value,next_value,reason,handled_by,created_at)
SELECT e.id,'job_title_id',COALESCE(e.hire_date,date(e.created_at,'+8 hours')),NULL,CAST(e.job_title_id AS TEXT),'建檔',e.created_by,e.created_at FROM hr_employees e
WHERE e.job_title_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='job_title_id' AND a.effective_date<=COALESCE(e.hire_date,date(e.created_at,'+8 hours')));
INSERT INTO hr_assignment_changes(employee_id,field,effective_date,previous_value,next_value,reason,handled_by,created_at)
SELECT e.id,'employment_type',COALESCE(e.hire_date,date(e.created_at,'+8 hours')),NULL,CAST(e.employment_type AS TEXT),'建檔',e.created_by,e.created_at FROM hr_employees e
WHERE e.employment_type IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='employment_type' AND a.effective_date<=COALESCE(e.hire_date,date(e.created_at,'+8 hours')));
INSERT INTO hr_assignment_changes(employee_id,field,effective_date,previous_value,next_value,reason,handled_by,created_at)
SELECT e.id,'schedule_mode',COALESCE(e.hire_date,date(e.created_at,'+8 hours')),NULL,CAST(e.schedule_mode AS TEXT),'建檔',e.created_by,e.created_at FROM hr_employees e
WHERE e.schedule_mode IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='schedule_mode' AND a.effective_date<=COALESCE(e.hire_date,date(e.created_at,'+8 hours')));

-- (b) 完全沒有狀態紀錄的員工，補建檔狀態紀錄（沿用建檔慣例：前後狀態都是目前狀態、原因「建檔」、生效日到職日）。
INSERT INTO hr_status_changes(employee_id,effective_date,previous_status,next_status,reason,handled_by,created_at)
SELECT e.id,COALESCE(e.hire_date,date(e.created_at,'+8 hours')),e.status,e.status,'建檔',e.created_by,e.created_at FROM hr_employees e
WHERE NOT EXISTS(SELECT 1 FROM hr_status_changes c WHERE c.employee_id=e.id);

-- 投影檢視：沒有任何「今日以前」的紀錄時，改用該欄位最早一筆紀錄的起始值（舊值，沒有舊值就是新值），最後才退回主檔欄位。
DROP VIEW IF EXISTS hr_employee_current;
CREATE VIEW hr_employee_current AS SELECT
 e.id,
 e.employee_no,
 e.name,
 COALESCE((SELECT c.next_status FROM hr_status_changes c WHERE c.employee_id=e.id AND c.effective_date<=date('now','+8 hours') ORDER BY c.effective_date DESC,c.id DESC LIMIT 1),(SELECT c.previous_status FROM hr_status_changes c WHERE c.employee_id=e.id ORDER BY c.effective_date,c.id LIMIT 1),e.status) AS status,
 e.member_id,
 e.national_id,
 e.birth_date,
 e.gender,
 e.mobile,
 e.phone,
 e.mailing_address,
 e.registered_address,
 e.hire_date,
 e.seniority_start_date,
 e.termination_date,
 e.termination_reason,
 e.note,
 e.revision,
 e.created_at,
 e.updated_at,
 e.created_by,
 e.updated_by,
 COALESCE(CAST((SELECT a.next_value FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='store_id' AND a.effective_date<=date('now','+8 hours') ORDER BY a.effective_date DESC,a.id DESC LIMIT 1) AS INTEGER),CAST((SELECT COALESCE(a.previous_value,a.next_value) FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='store_id' ORDER BY a.effective_date,a.id LIMIT 1) AS INTEGER),e.store_id) AS store_id,
 COALESCE(CAST((SELECT a.next_value FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='job_title_id' AND a.effective_date<=date('now','+8 hours') ORDER BY a.effective_date DESC,a.id DESC LIMIT 1) AS INTEGER),CAST((SELECT COALESCE(a.previous_value,a.next_value) FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='job_title_id' ORDER BY a.effective_date,a.id LIMIT 1) AS INTEGER),e.job_title_id) AS job_title_id,
 e.roster_sort,
 COALESCE((SELECT a.next_value FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='employment_type' AND a.effective_date<=date('now','+8 hours') ORDER BY a.effective_date DESC,a.id DESC LIMIT 1),(SELECT COALESCE(a.previous_value,a.next_value) FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='employment_type' ORDER BY a.effective_date,a.id LIMIT 1),e.employment_type) AS employment_type,
 e.skip_roster_checks,
 COALESCE((SELECT a.next_value FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='schedule_mode' AND a.effective_date<=date('now','+8 hours') ORDER BY a.effective_date DESC,a.id DESC LIMIT 1),(SELECT COALESCE(a.previous_value,a.next_value) FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='schedule_mode' ORDER BY a.effective_date,a.id LIMIT 1),e.schedule_mode) AS schedule_mode
FROM hr_employees e;

-- (c) 主檔欄位校正為台北今日的投影（不動 revision 與 updated_*：這是資料校正，不是人為編輯）。
UPDATE hr_employees AS e SET
 status=COALESCE((SELECT c.next_status FROM hr_status_changes c WHERE c.employee_id=e.id AND c.effective_date<=date('now','+8 hours') ORDER BY c.effective_date DESC,c.id DESC LIMIT 1),(SELECT c.previous_status FROM hr_status_changes c WHERE c.employee_id=e.id ORDER BY c.effective_date,c.id LIMIT 1),e.status),
 store_id=COALESCE(CAST((SELECT a.next_value FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='store_id' AND a.effective_date<=date('now','+8 hours') ORDER BY a.effective_date DESC,a.id DESC LIMIT 1) AS INTEGER),CAST((SELECT COALESCE(a.previous_value,a.next_value) FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='store_id' ORDER BY a.effective_date,a.id LIMIT 1) AS INTEGER),e.store_id),
 job_title_id=COALESCE(CAST((SELECT a.next_value FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='job_title_id' AND a.effective_date<=date('now','+8 hours') ORDER BY a.effective_date DESC,a.id DESC LIMIT 1) AS INTEGER),CAST((SELECT COALESCE(a.previous_value,a.next_value) FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='job_title_id' ORDER BY a.effective_date,a.id LIMIT 1) AS INTEGER),e.job_title_id),
 employment_type=COALESCE((SELECT a.next_value FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='employment_type' AND a.effective_date<=date('now','+8 hours') ORDER BY a.effective_date DESC,a.id DESC LIMIT 1),(SELECT COALESCE(a.previous_value,a.next_value) FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='employment_type' ORDER BY a.effective_date,a.id LIMIT 1),e.employment_type),
 schedule_mode=COALESCE((SELECT a.next_value FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='schedule_mode' AND a.effective_date<=date('now','+8 hours') ORDER BY a.effective_date DESC,a.id DESC LIMIT 1),(SELECT COALESCE(a.previous_value,a.next_value) FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='schedule_mode' ORDER BY a.effective_date,a.id LIMIT 1),e.schedule_mode);

-- 離職日期與原因跟著決定今日狀態的紀錄：今日狀態不是離職、且沒有尚未生效的離職紀錄時清空（未來離職會先把日期與原因存在主檔等待生效）。
UPDATE hr_employees SET termination_date=NULL,termination_reason=NULL
WHERE status<>'terminated' AND (termination_date IS NOT NULL OR termination_reason IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM hr_status_changes c WHERE c.employee_id=hr_employees.id AND c.next_status='terminated' AND c.effective_date>date('now','+8 hours'));
