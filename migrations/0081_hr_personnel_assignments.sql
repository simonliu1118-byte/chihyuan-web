-- 任用異動：狀態仍只存 hr_status_changes；門市、職稱、僱用型態、排班方式各自一欄一筆存在 hr_assignment_changes。
-- 主檔欄位只是建檔當時的基準值；hr_employee_current 依各欄位自己的紀錄（台北今日以前、生效日與 id 最新）分別投影。
CREATE TABLE hr_assignment_changes (
 id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
 field TEXT NOT NULL CHECK(field IN ('store_id','job_title_id','employment_type','schedule_mode')),
 effective_date TEXT NOT NULL, previous_value TEXT, next_value TEXT NOT NULL,
 reason TEXT NOT NULL, handled_by INTEGER, created_at TEXT NOT NULL,
 CHECK(field NOT IN ('store_id','job_title_id') OR next_value GLOB '[0-9]*'),
 CHECK(field<>'employment_type' OR next_value IN ('full','half','casual')),
 CHECK(field<>'schedule_mode' OR next_value IN ('shift','hours','none'))
);
CREATE INDEX idx_hr_assignment_changes_employee ON hr_assignment_changes(employee_id,field,effective_date,id);
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
 COALESCE(CAST((SELECT a.next_value FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='store_id' AND a.effective_date<=date('now','+8 hours') ORDER BY a.effective_date DESC,a.id DESC LIMIT 1) AS INTEGER),e.store_id) AS store_id,
 COALESCE(CAST((SELECT a.next_value FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='job_title_id' AND a.effective_date<=date('now','+8 hours') ORDER BY a.effective_date DESC,a.id DESC LIMIT 1) AS INTEGER),e.job_title_id) AS job_title_id,
 e.roster_sort,
 COALESCE((SELECT a.next_value FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='employment_type' AND a.effective_date<=date('now','+8 hours') ORDER BY a.effective_date DESC,a.id DESC LIMIT 1),e.employment_type) AS employment_type,
 e.skip_roster_checks,
 COALESCE((SELECT a.next_value FROM hr_assignment_changes a WHERE a.employee_id=e.id AND a.field='schedule_mode' AND a.effective_date<=date('now','+8 hours') ORDER BY a.effective_date DESC,a.id DESC LIMIT 1),e.schedule_mode) AS schedule_mode
FROM hr_employees e;
