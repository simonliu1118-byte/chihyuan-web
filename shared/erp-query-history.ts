/** Date-only rules are evaluated at the CY Web boundary using Asia/Taipei 'today'. */
export type HistoryInput = { includeHistory?: unknown; historyFrom?: unknown; historyTo?: unknown };
export class HistoryRangeError extends Error {
  constructor(message: string) { super(message); this.name = "HistoryRangeError"; }
}
function isoDate(value: unknown, label: string): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HistoryRangeError(label+"日期格式必須為 YYYY-MM-DD");
  const [year,month,day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year,month-1,day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month-1 || date.getUTCDate() !== day)
    throw new HistoryRangeError(label+"日期無效");
  return value;
}
function shiftYear(date: string, years: number): string {
  const source = new Date(date + "T00:00:00Z");
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  source.setUTCDate(1);
  source.setUTCFullYear(source.getUTCFullYear()+years);
  // Clamp leap-day to the last available day in that month.
  const last = new Date(Date.UTC(source.getUTCFullYear(),month+1,0)).getUTCDate();
  source.setUTCMonth(month,Math.min(day,last));
  return source.toISOString().slice(0,10);
}
export function taipeiToday(now=new Date()):string {
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const get=(type:string)=>parts.find(part=>part.type===type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
/**
 * The one ERP date-range rule (歷史異動 and 銷貨銷退單據日期, user 2026-10-17): empty 迄 = today,
 * empty 起 = one year before 迄, 迄 not after today, at most three calendar years.
 */
export function resolveDateRange(fromInput:unknown,toInput:unknown,label:string,today=taipeiToday()):{from:string;to:string} {
  const to=isoDate(toInput,label)??today;
  const from=isoDate(fromInput,label)??shiftYear(to,-1);
  if(to>today) throw new HistoryRangeError(label+"迄日不可晚於今天");
  if(from>to) throw new HistoryRangeError(label+"起日不可晚於迄日");
  if(to>shiftYear(from,3)) throw new HistoryRangeError(label+"日期範圍不可超過三年。");
  return {from,to};
}
export function resolveHistoryRange(input:HistoryInput,today=taipeiToday()):{includeHistory:boolean;historyFrom:string|null;historyTo:string|null} {
  const enabled=input.includeHistory??false;
  if(typeof enabled!=="boolean") throw new HistoryRangeError("歷史異動選項格式不正確");
  if (!enabled) {
    if(input.historyFrom!=null || input.historyTo!=null) throw new HistoryRangeError("未勾選歷史異動時不可指定日期");
    return {includeHistory:false,historyFrom:null,historyTo:null};
  }
  const {from,to}=resolveDateRange(input.historyFrom,input.historyTo,"歷史異動",today);
  return {includeHistory:true,historyFrom:from,historyTo:to};
}
