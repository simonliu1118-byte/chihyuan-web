-- Personnel assignments share the existing dated status-change ledger. Base profile values remain the initial fallback.
ALTER TABLE hr_status_changes ADD COLUMN store_id INTEGER REFERENCES hr_stores(id);
ALTER TABLE hr_status_changes ADD COLUMN job_title_id INTEGER REFERENCES hr_job_titles(id);
ALTER TABLE hr_status_changes ADD COLUMN employment_type TEXT CHECK(employment_type IS NULL OR employment_type IN ('full','half','casual'));
ALTER TABLE hr_status_changes ADD COLUMN schedule_mode TEXT CHECK(schedule_mode IS NULL OR schedule_mode IN ('shift','hours','none'));
ALTER TABLE hr_status_changes ADD COLUMN previous_assignment TEXT CHECK(previous_assignment IS NULL OR json_valid(previous_assignment));
CREATE VIEW hr_employee_current AS SELECT
 e.id,
 e.employee_no,
 e.name,
 e.status,
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
 COALESCE((SELECT c.store_id FROM hr_status_changes c WHERE c.employee_id=e.id AND c.store_id IS NOT NULL AND c.effective_date<=date('now','+8 hours') ORDER BY c.effective_date DESC,c.id DESC LIMIT 1),e.store_id) AS store_id,
 COALESCE((SELECT c.job_title_id FROM hr_status_changes c WHERE c.employee_id=e.id AND c.job_title_id IS NOT NULL AND c.effective_date<=date('now','+8 hours') ORDER BY c.effective_date DESC,c.id DESC LIMIT 1),e.job_title_id) AS job_title_id,
 e.roster_sort,
 COALESCE((SELECT c.employment_type FROM hr_status_changes c WHERE c.employee_id=e.id AND c.employment_type IS NOT NULL AND c.effective_date<=date('now','+8 hours') ORDER BY c.effective_date DESC,c.id DESC LIMIT 1),e.employment_type) AS employment_type,
 e.skip_roster_checks,
 COALESCE((SELECT c.schedule_mode FROM hr_status_changes c WHERE c.employee_id=e.id AND c.schedule_mode IS NOT NULL AND c.effective_date<=date('now','+8 hours') ORDER BY c.effective_date DESC,c.id DESC LIMIT 1),e.schedule_mode) AS schedule_mode
FROM hr_employees e;
