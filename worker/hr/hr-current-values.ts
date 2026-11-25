import { AuditService } from "../audit/audit-service";

/**
 * hr_employees holds today's value of 人事狀態, 門市, 職稱, 僱用型態 and 排班方式 (Asia/Taipei). The dated records
 * (hr_status_changes, hr_assignment_changes) are the history. A record dated in the future reaches the master columns
 * here: the daily task `hrCurrentValues` (shared/cyweb-cron.ts) rolls them forward at Taiwan 00:00.
 */
export const ASSIGNMENT_COLUMNS = ["store_id", "job_title_id", "employment_type", "schedule_mode"] as const;
export const ROLL_BATCH = 100;
export const ROLL_MAX_BATCHES = 50;
const NUMERIC = new Set(["store_id", "job_title_id"]);
/** Taipei calendar date of an ISO instant. */
export function taipeiDate(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error("HR_CURRENT_VALUES_INVALID_TIME");
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
}
/**
 * The projection as of ?1: the latest record dated on or before it (ties by larger id), else the starting value of the
 * earliest record (its previous value, or its own value for a 建檔 record), else the master column. Same rule as
 * migration 0083's hr_employee_current view, with the date bound instead of "today". Exported so payroll reads the month-end
 * values through this one fragment: `bound` is the SQL expression of the as-of date (default placeholder ?1).
 * Yields columns p_status, p_store_id, p_job_title_id, p_employment_type, p_schedule_mode.
 */
export function asOfProjection(alias: string, bound = "?1"): string {
  const assignment = (field: string) => {
    const latest = `(SELECT a.next_value FROM hr_assignment_changes a WHERE a.employee_id=${alias}.id AND a.field='${field}' AND a.effective_date<=${bound} ORDER BY a.effective_date DESC,a.id DESC LIMIT 1)`;
    const first = `(SELECT COALESCE(a.previous_value,a.next_value) FROM hr_assignment_changes a WHERE a.employee_id=${alias}.id AND a.field='${field}' ORDER BY a.effective_date,a.id LIMIT 1)`;
    return NUMERIC.has(field) ? `COALESCE(CAST(${latest} AS INTEGER),CAST(${first} AS INTEGER),${alias}.${field})` : `COALESCE(${latest},${first},${alias}.${field})`;
  };
  const status = `COALESCE((SELECT c.next_status FROM hr_status_changes c WHERE c.employee_id=${alias}.id AND c.effective_date<=${bound} ORDER BY c.effective_date DESC,c.id DESC LIMIT 1),(SELECT c.previous_status FROM hr_status_changes c WHERE c.employee_id=${alias}.id ORDER BY c.effective_date,c.id LIMIT 1),${alias}.status)`;
  return `${status} AS p_status, ${ASSIGNMENT_COLUMNS.map(f => `${assignment(f)} AS p_${f}`).join(", ")}`;
}
const MISMATCHES = `SELECT * FROM (
  SELECT e.id,e.employee_no,e.revision,e.status,e.store_id,e.job_title_id,e.employment_type,e.schedule_mode,e.termination_date,e.termination_reason,
    ${asOfProjection("e")},
    EXISTS(SELECT 1 FROM hr_status_changes c WHERE c.employee_id=e.id AND c.next_status='terminated' AND c.effective_date>?1) AS pending_termination
  FROM hr_employees e WHERE e.id>?2)
WHERE status IS NOT p_status OR store_id IS NOT p_store_id OR job_title_id IS NOT p_job_title_id OR employment_type IS NOT p_employment_type OR schedule_mode IS NOT p_schedule_mode
  OR (p_status<>'terminated' AND pending_termination=0 AND (termination_date IS NOT NULL OR termination_reason IS NOT NULL))
ORDER BY id LIMIT ?3`;
type Row = Record<string, string | number | null>;
/**
 * Brings every employee's master columns to the projection as of the Taipei date of `nowIso`. Only employees that differ
 * are touched, each guarded by its revision (a concurrent edit is skipped and caught by the next run), in batches of
 * ROLL_BATCH. One audit row per changed employee. Safe to run any number of times.
 */
export async function rollHrCurrentValues(db: D1Database, nowIso: string): Promise<{ date: string; changed: number }> {
  const today = taipeiDate(nowIso), audit = new AuditService(db);
  let cursor = 0, changed = 0;
  for (let batch = 0; batch < ROLL_MAX_BATCHES; batch++) {
    const found = (await db.prepare(MISMATCHES).bind(today, cursor, ROLL_BATCH).all<Row>()).results ?? [];
    if (!found.length) break;
    const statements: D1PreparedStatement[] = [];
    for (const row of found) {
      const before: Record<string, unknown> = {}, after: Record<string, unknown> = {}, sets: string[] = [], values: (string | number | null)[] = [];
      const track = (column: string, key: string) => {
        if (row[column] !== row[key]) { before[column] = row[column]; after[column] = row[key]; sets.push(column + "=?"); values.push(row[key]); }
      };
      track("status", "p_status");
      for (const field of ASSIGNMENT_COLUMNS) track(field, "p_" + field);
      if (row.p_status !== "terminated" && !row.pending_termination && (row.termination_date !== null || row.termination_reason !== null)) {
        before.termination_date = row.termination_date; before.termination_reason = row.termination_reason;
        after.termination_date = null; after.termination_reason = null; sets.push("termination_date=NULL", "termination_reason=NULL");
      }
      const id = Number(row.id), revision = Number(row.revision);
      statements.push(db.prepare(`UPDATE hr_employees SET ${sets.join(",")},revision=revision+1,updated_at=?,updated_by=NULL WHERE id=? AND revision=?`).bind(...values, nowIso, id, revision));
      // Written only when this very update landed: its revision and timestamp are the guard.
      statements.push(audit.prepareRecord({ entityType: "hr_employee", entityKey: String(row.employee_no), action: "hr_employee.current_values_rolled", actorEmployeeId: null, requestId: "hr-current-values:" + today, before, after: { ...after, asOf: today } },
        { sql: "EXISTS(SELECT 1 FROM hr_employees WHERE id=? AND revision=? AND updated_at=? AND updated_by IS NULL)", values: [id, revision + 1, nowIso] }));
    }
    const results = await db.batch(statements);
    for (let i = 0; i < results.length; i += 2) changed += results[i]?.meta?.changes ? 1 : 0;
    cursor = Number(found[found.length - 1].id);
    if (found.length < ROLL_BATCH) break;
  }
  return { date: today, changed };
}
