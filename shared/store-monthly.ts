export type MonthPeriod = {from:string; until?:string}; // exclusive end
export type MonthlyStore = {id:string; name:string; periods:MonthPeriod[]};
export type MonthlyScheduleKind = "ALL"|"ODD"|"EVEN"|"CUSTOM";
export type MonthlySchedule = {from:string;kind:MonthlyScheduleKind;months?:number[]};
export type MonthlyItem = MonthlyStore & {note?:string;stores:Record<string,MonthPeriod[]>;schedules?:MonthlySchedule[]};
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

/** Missing schedules, including time before a first entry, mean every month. */
export function scheduleInMonth(item:Pick<MonthlyItem,"schedules">,month:string):MonthlySchedule{
 return [...(item.schedules??[])].filter(s=>s.from<=month).sort((a,b)=>b.from.localeCompare(a.from))[0]??{from:month,kind:"ALL"};
}
export function scheduleAppliesInMonth(item:Pick<MonthlyItem,"schedules">,month:string):boolean{
 const s=scheduleInMonth(item,month),m=Number(month.slice(5));
 return s.kind==="ALL"||s.kind==="ODD"&&m%2===1||s.kind==="EVEN"&&m%2===0||s.kind==="CUSTOM"&&!!s.months?.includes(m);
}
export function setMonthlySchedule(history:readonly MonthlySchedule[]|undefined,kind:MonthlyScheduleKind,months:number[],month:string):MonthlySchedule[]{
 const entries=[...(history??[])].filter(s=>s.from!==month),next:MonthlySchedule={from:month,kind};
 if(kind==="CUSTOM")next.months=[...months].sort((a,b)=>a-b);
 return [...entries,next].sort((a,b)=>a.from.localeCompare(b.from));
}

/** The sixteenth Taipei calendar day pre-generates the next month. */
export const monthlyGenerationMonth=(at:string|number=Date.now())=>Number(taipeiDate(at).slice(8))>=16?shiftMonth(monthlyKey(at),1):monthlyKey(at);
export const monthlyApplicable=(c:MonthlySettings,month:string,storeId:string,itemId:string)=>{const store=c.stores.find(s=>s.id===storeId),item=c.items.find(i=>i.id===itemId);return !!store&&!!item&&activeInMonth(store.periods,month)&&activeInMonth(item.periods,month)&&activeInMonth(item.stores[storeId]??[],month)&&scheduleAppliesInMonth(item,month)};

/** The following month's sixteenth at 00:00 Asia/Taipei is the exclusive editing deadline. */
export const monthlyEditDeadline=(month:string)=>shiftMonth(month,1)+"-16";
export const monthlyEditLocked=(month:string,at:string|number=Date.now())=>taipeiDate(at)>=monthlyEditDeadline(month);
