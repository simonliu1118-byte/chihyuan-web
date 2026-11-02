/** Finished-query purge every tick and daily retention at Taiwan 03:15 (UTC 19:15), run from the single
 * CY Web cron (shared/cyweb-cron.ts, which names the same 19:15 tick as erpRetention). */
export function erpHousekeepingPhases(scheduledTime: number) {
  if (!Number.isFinite(scheduledTime)) throw new Error("ERP_HOUSEKEEPING_INVALID_TIME");
  const at = new Date(scheduledTime);
  return { expire: true, purge: true, retention: at.getUTCHours() === 19 && at.getUTCMinutes() === 15 } as const;
}
