/**
 * The daily backup rides the every-minute ERP housekeeping trigger: the Cloudflare Free plan allows
 * only 5 cron triggers per account and they were all in use (2026-11-03). Taiwan 03:30 is UTC 19:30;
 * 03:45 is a second chance. The backup itself is keyed by Taiwan date, so a second run that day is a
 * no-op unless the first one failed.
 */
export function isScheduledBackupMinute(scheduledTime: number): boolean {
  const at = new Date(scheduledTime);
  return at.getUTCHours() === 19 && (at.getUTCMinutes() === 30 || at.getUTCMinutes() === 45);
}
