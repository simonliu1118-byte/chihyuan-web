/** Cloudflare D1 Free-plan daily quotas, per UTC day.
 * Source: https://developers.cloudflare.com/d1/platform/pricing/ (2026-10).
 * Update these constants when switching to a paid Cloudflare plan.
 */
export const D1_DAILY_LIMITS = { rowsReadPerDay: 5_000_000, rowsWrittenPerDay: 100_000 } as const;
export type UsageLevel = "ok" | "warning" | "danger";
export interface D1DatabaseUsage { id: string; name: string; rowsRead: number; rowsWritten: number }
export interface D1UsageDay { date: string; rowsRead: number; rowsWritten: number }
export interface D1UsageReport {
  fetchedAt: string;
  limits: { rowsReadPerDay: number; rowsWrittenPerDay: number };
  today: D1UsageDay & { level: UsageLevel; databases: D1DatabaseUsage[] };
  days: D1UsageDay[];
}
export interface D1AnalyticsGroup {
  dimensions?: { date?: string | null; databaseId?: string | null } | null;
  sum?: { rowsRead?: number | null; rowsWritten?: number | null; readQueries?: number | null; writeQueries?: number | null } | null;
}
function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}
export function usageRatio(used: unknown, limit: unknown): number {
  return typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? safeCount(used) / limit : 0;
}
export function usageLevel(rowsRead: unknown, rowsWritten: unknown, limits: {rowsReadPerDay:number;rowsWrittenPerDay:number}=D1_DAILY_LIMITS): UsageLevel {
  const ratio = Math.max(usageRatio(rowsRead, limits.rowsReadPerDay),usageRatio(rowsWritten,limits.rowsWrittenPerDay));
  return ratio >= .9 ? "danger" : ratio >= .7 ? "warning" : "ok";
}
export function aggregateD1Usage(groups: readonly D1AnalyticsGroup[], names: Readonly<Record<string,string>>, dayCount: number, now: Date = new Date()): D1UsageReport {
  if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 31 || !Number.isFinite(now.getTime())) throw new Error("INVALID_USAGE_RANGE");
  const dayMs = 86_400_000;
  const currentDay = now.toISOString().slice(0,10);
  const from = new Date(currentDay+"T00:00:00.000Z").getTime()-(dayCount-1)*dayMs;
  const byDay = new Map<string,D1UsageDay>();
  const byDatabase = new Map<string,D1DatabaseUsage>();
  for(let i=0;i<dayCount;i++){
    const date=new Date(from+i*dayMs).toISOString().slice(0,10);
    byDay.set(date,{date,rowsRead:0,rowsWritten:0});
  }
  for(const group of groups){
    const date=group.dimensions?.date, id=group.dimensions?.databaseId;
    if(!date || !id || !byDay.has(date)) continue;
    const read=safeCount(group.sum?.rowsRead),written=safeCount(group.sum?.rowsWritten);
    const daily=byDay.get(date)!;
    daily.rowsRead+=read;daily.rowsWritten+=written;
    if(date===currentDay){
      const database=byDatabase.get(id)??{id,name:names[id]||id.slice(0,8),rowsRead:0,rowsWritten:0};
      database.rowsRead+=read;database.rowsWritten+=written;
      byDatabase.set(id,database);
    }
  }
  for(const [id,name] of Object.entries(names)) if(!byDatabase.has(id)) byDatabase.set(id,{id,name,rowsRead:0,rowsWritten:0});
  const days=[...byDay.values()];
  const today=days[days.length-1];
  const databases=[...byDatabase.values()].sort((a,b)=>b.rowsRead-a.rowsRead || a.name.localeCompare(b.name));
  return {fetchedAt:now.toISOString(),limits:{...D1_DAILY_LIMITS},
    today:{...today,level:usageLevel(today.rowsRead,today.rowsWritten),databases},days};
}
