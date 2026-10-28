/** Minimum read-only reminder refresh interval while the Super Admin stays signed in. */
export const QUARTERLY_REMINDER_RECHECK_MS = 24 * 60 * 60 * 1000;

/** Quarter is determined by Taiwan calendar time, never browser timezone. */
export function taiwanQuarter(iso: string): string {
  const date = new Date(Date.parse(iso) + 8 * 3600000);
  if (!Number.isFinite(date.getTime())) throw Error("BACKUP_TIME_INVALID");
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}
export interface QuarterlyRehearsalReminder {
  quarter: string;
  due: boolean;
  lastVerifiedAt: string | null;
  /** An empty target still requires a reviewed rotation and independent authorization. */
  frequency: "quarterly";
}
export function quarterlyRehearsalReminder(now: string, lastVerifiedAt: string | null): QuarterlyRehearsalReminder {
  const quarter = taiwanQuarter(now);
  return { quarter, lastVerifiedAt, due: !lastVerifiedAt || taiwanQuarter(lastVerifiedAt) !== quarter, frequency: "quarterly" };
}
