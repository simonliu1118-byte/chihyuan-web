/** One five-minute closure undo window shared by store orders and repairs. */
export const STORE_CLOSURE_UNDO_MS=5*60*1000;
export const withinStoreClosureWindow=(closedAt:string|null|undefined,now=Date.now())=>!!closedAt&&Number.isFinite(Date.parse(closedAt))&&now<Date.parse(closedAt)+STORE_CLOSURE_UNDO_MS;
export function storeTaipeiDay(iso:string):number{
 const n=Date.parse(iso);return Number.isFinite(n)?Math.floor((n+8*3600000)/86400000):Number.NaN;
}
export function storeDaysElapsed(iso:string|null|undefined,now:Date=new Date()):number|null{
 if(!iso)return null;const start=storeTaipeiDay(iso);
 return Number.isFinite(start)?storeTaipeiDay(now.toISOString())-start:null;
}
