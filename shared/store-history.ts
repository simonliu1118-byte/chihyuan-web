import {STORE_MILESTONE_LABELS,type StoreHistory,type StoreHistoryPage,type StoreMilestone} from "./store";

const record=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
// Read projection only: immutable source events remain available for audit/backup.
export function retiredArrivalEvent(e:StoreHistory){
 if(e.kind==="推進")return e.after.status==="ARRIVED";
 if(e.kind==="更正日期"){
  const a=record(e.before.dates??e.before),b=record(e.after.dates??e.after);
  const changed=Object.keys({...a,...b}).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k]));
  return changed.length>0&&changed.every(k=>k==="ARRIVED");
 }
 return false;
}
export function orderHistoryPresentation(e:StoreHistory):StoreHistory{
 const clean=(v:Record<string,unknown>):Record<string,unknown>=>Object.fromEntries(Object.entries(v).filter(([k])=>k!=="ARRIVED").map(([k,x])=>[k,k==="status"&&x==="ARRIVED"?"ORDERED":k==="dates"?clean(record(x)):x]));
 let before=clean(e.before),after=clean(e.after),kind=e.kind;
 if(kind==="建立")return {...e,before:{},after:{},reason:""};
 if(kind==="推進"||kind==="通知結案"||kind==="叫貨結果"){
  const step=e.after.status as StoreMilestone,label=STORE_MILESTONE_LABELS[step];
  if(label){kind="登記"+label;after={date:Object.hasOwn(e.after,"date")?e.after.date:record(e.after.dates)[step]??null,...(kind==="登記叫貨"&&e.after.callResult&&e.after.callResult!=="ORDERED"?{callResult:e.after.callResult}:{})};before={}}
 }
 return {...e,kind,before,after};
}

// Owned by a mounted module, never shared across login sessions. Bounded LRU.
export type StoreHistoryCache=Map<string,{page:StoreHistoryPage;expiresAt:number}>;
export function cachedHistory(cache:StoreHistoryCache,path:string,now=Date.now()){
 const value=cache.get(path);if(!value)return null;
 cache.delete(path);if(value.expiresAt<=now)return null;cache.set(path,value);return value.page;
}
export function cacheHistory(cache:StoreHistoryCache,path:string,page:StoreHistoryPage,now=Date.now()){
 cache.delete(path);const rows=page.rows.slice(0,100);
 cache.set(path,{page:{rows,nextCursor:page.rows.length>100?rows.at(-1)!.id:page.nextCursor},expiresAt:now+60_000});
 while(cache.size>20)cache.delete(cache.keys().next().value!);
}
