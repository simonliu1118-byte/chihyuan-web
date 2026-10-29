/** Single Cron drives one-minute timeouts, five-minute result purges and daily retention. */
export const ERP_HOUSEKEEPING_CRON = "* * * * *";
export const ERP_RESULT_PURGE_INTERVAL_MINUTES = 5;
/** Taiwan 03:15 = UTC 19:15. Kept separate from 03:00 catalog and 03:30 backup. */
export const ERP_RETENTION_HOUR_UTC = 19;
export const ERP_RETENTION_MINUTE_UTC = 15;
export function erpHousekeepingPhases(scheduledTime: number) {
  if (!Number.isFinite(scheduledTime)) throw new Error("ERP_HOUSEKEEPING_INVALID_TIME");
  const at = new Date(scheduledTime);
  const minute = at.getUTCMinutes();
  return { expire: true, purge: minute % ERP_RESULT_PURGE_INTERVAL_MINUTES === 0,
    retention: at.getUTCHours() === ERP_RETENTION_HOUR_UTC && minute === ERP_RETENTION_MINUTE_UTC } as const;
}
