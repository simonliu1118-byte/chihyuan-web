/**
 * CY Web uses ONE cron trigger (2026-11-03): the Cloudflare Free plan allows 5 per account, shared
 * with the other CY services. Every 5 minutes it checks ERP query timeouts and purges finished
 * results; the daily jobs run on the tick at their UTC time. Taiwan = UTC+8. Adding a daily job adds a field here, never a trigger.
 */
export const CYWEB_CRON = "*/5 * * * *";
export interface CywebCronTasks {
  /** Every tick: ERP queries stuck in the queue or running too long, and finished results to purge. */
  erp: true;
  /** Taiwan 00:00: month rows for 月度待辦 (daily catch-up). */
  storeMonthly: boolean;
  /** Taiwan 00:00, and 00:30 as a second chance: future-dated personnel records reaching their date update hr_employees (人事目前值). */
  hrCurrentValues: boolean;
  /** Taiwan 03:00: the public CY 程式 catalog. */
  programCatalog: boolean;
  /** Taiwan 03:15: ERP queries older than 7 days. */
  erpRetention: boolean;
  /** Taiwan 03:30, and 03:45 as a second chance: the daily backup (when its schedule is on). */
  backup: boolean;
  /** Taiwan 04:00: discover effective official payroll tables (one bounded run/day). */
}
export function cywebCronTasks(scheduledTime: number): CywebCronTasks {
  if (!Number.isFinite(scheduledTime)) throw new Error("CYWEB_CRON_INVALID_TIME");
  const at = new Date(scheduledTime), h = at.getUTCHours(), m = at.getUTCMinutes();
  return { erp: true, storeMonthly: h === 16 && m === 0, hrCurrentValues: h === 16 && (m === 0 || m === 30), programCatalog: h === 19 && m === 0,
    erpRetention: h === 19 && m === 15, backup: h === 19 && (m === 30 || m === 45) };
}
