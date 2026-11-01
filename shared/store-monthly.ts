export const STORE_MONTHLY_CRON = "0 16 * * *"; // Taiwan midnight, daily catch-up.
export type MonthPeriod = {from:string; until?:string}; // exclusive end
export type MonthlyStore = {id:string; name:string; periods:MonthPeriod[]};
export type MonthlyItem = MonthlyStore & {stores:Record<string,MonthPeriod[]>};
export type MonthlySettings = {version:number; firstMonth:string|null; generatedThrough:string|null; stores:MonthlyStore[]; items:MonthlyItem[]};
export type MonthlyCell = {itemId:string; completed:boolean; completionDate:string|null; version:number};
export type MonthlyRow = {id:string; month:string; storeId:string; storeName:string; cells:MonthlyCell[]};
export type MonthlyPage = {settings:MonthlySettings; rows:MonthlyRow[]; nextBefore:string|null; canManage:boolean; currentMonth:string};
export const taipeiDate=(at:string|number=Date.now())=>new Date(new Date(at).getTime()+8*3600000).toISOString().slice(0,10);
export const monthlyKey=(at:string|number=Date.now())=>taipeiDate(at).slice(0,7);
export function shiftMonth(month:string,delta:number){const [year,m]=month.split("-").map(Number),index=year*12+m-1+delta;return `${Math.floor(index/12).toString().padStart(4,"0")}-${(index%12+1).toString().padStart(2,"0")}`}
export const activeInMonth=(periods:readonly MonthPeriod[],month:string)=>periods.some(p=>p.from<=month&&(!p.until||month<p.until));
/** Additions apply now; stops apply next month. Earlier ranges are never erased. */
export function setMonthlyEnabled(periods:MonthPeriod[],enabled:boolean,month:string):MonthPeriod[]{
 const copy=periods.filter(p=>p.from<=month).map(p=>({...p})),current=copy.find(p=>p.from<=month&&(!p.until||month<p.until));
 if(enabled){if(current)delete current.until;else copy.push({from:month})}
 else if(current)current.until=shiftMonth(month,1);
 return copy;
}
