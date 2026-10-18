const taipeiDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
});
const taipeiDateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function parts(formatter: Intl.DateTimeFormat, date: Date): Record<string, string> {
  return Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
}
function printable(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
/** Canonical UI date; pure ISO date-only values never cross a timezone boundary. */
export function formatDate(value: string | number | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll("-", "/");
  const date = printable(value);
  if (!date) return String(value);
  const p = parts(taipeiDate, date);
  return `${p.year}/${p.month}/${p.day}`;
}
/** All timestamp display is in Taipei time, with zero-padded Gregorian fields. */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  const date = printable(value);
  if (!date) return String(value);
  const p = parts(taipeiDateTime, date);
  return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}`;
}
