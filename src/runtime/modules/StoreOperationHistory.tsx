import {useCallback,useEffect,useRef,useState} from "react";
import {apiRequest} from "../../api/client";
import {STORE_ORDER_STATUS_LABELS,type StoreOrder,type StoreHistoryPage,type StoreHistory} from "../../../shared/store";
import {formatDateTime} from "../../ui/foundation/format";
const labels:Record<string,string>={orderDate:"訂購日期",customerName:"顧客姓名",honorific:"稱謂",callResult:"叫貨結果",ORDERED:"叫貨日期",ARRIVED:"到貨（歷史）",NOTIFIED:"通知日期",PICKED_UP:"取貨日期",phone:"電話",mobile:"手機",lineName:"LINE 名稱",deposit:"訂金",note:"備註",lines:"品項",total:"金額合計",status:"處理狀態",dates:"進度日期",date:"作業日期",blacklistId:"黑名單編號",blacklistEvent:"黑名單事件",orderId:"來源訂購",itemName:"項目",completed:"辦理狀態",completionDate:"辦理日期"};
function display(v:unknown,key=""):string{
 if(v===null||v===undefined||v==="")return key==="completionDate"?"無日期":"";
 if(typeof v==="boolean")return key==="completed"?v?"已完成":"未完成":v?"是":"否";
 if(Array.isArray(v))return v.map(x=>{const l=x as {itemCode?:string;itemName?:string;quantity?:number;unitPrice?:number};return `${l.itemCode??""} ${l.itemName??""} ×${l.quantity??""} @${l.unitPrice??""}`}).join("；");
 if(typeof v==="object")return Object.entries(v).map(([k,x])=>`${STORE_ORDER_STATUS_LABELS[k as StoreOrder["status"]]??labels[k]??k}：${display(x,k)}`).join("；");
 return ({MR:"先生",MS:"小姐",OUT_OF_STOCK:"缺貨",DISCONTINUED:"絕版／停產"} as Record<string,string>)[String(v)]??STORE_ORDER_STATUS_LABELS[String(v) as StoreOrder["status"]]??String(v);
}
export function historySummary(e:StoreHistory):string{
 const changes=(a:Record<string,unknown>,b:Record<string,unknown>):string[]=>Object.keys({...a,...b}).flatMap(k=>{
  if(k==="dates"&&!("dates" in b)&&"date" in b)return [];
  if(JSON.stringify(a[k])===JSON.stringify(b[k])||!(a[k]??"")&&!(b[k]??"")&&typeof b[k]!=="boolean")return [];
  if(k==="dates"&&b[k]&&typeof b[k]==="object")return changes((a[k]??{}) as Record<string,unknown>,b[k] as Record<string,unknown>);
  return [`${labels[k]??k}：${display(a[k],k)} → ${display(b[k],k)}`];
 });
 return [typeof e.after.itemName==="string"?e.after.itemName:"",...changes(e.before,e.after),e.reason?"理由："+e.reason:""].filter(Boolean).join("；");
}
/** Shared per-record timeline for orders, blacklist and monthly todos. Paths are store-relative. */
export function StoreOperationHistory({path,onError}:{path:string;onError:(s:string)=>void}){
 const [events,setEvents]=useState<StoreHistory[]>([]),[cursor,setCursor]=useState<number|null>(null),[loading,setLoading]=useState(true),sequence=useRef(0);
 const load=useCallback(async(next?:number)=>{const serial=++sequence.current;setLoading(true);try{const p=await apiRequest<StoreHistoryPage>("/api/business/store"+path+(next?"?cursor="+next:""));if(serial===sequence.current){setEvents(old=>next?[...old,...p.rows]:p.rows);setCursor(p.nextCursor)}}catch(e){if(serial===sequence.current)onError(e instanceof Error?e.message:"紀錄載入失敗")}finally{if(serial===sequence.current)setLoading(false)}},[path,onError]);
 useEffect(()=>{setEvents([]);setCursor(null);void load();return()=>{sequence.current++}},[load]);
 return <div className="cy-store-history">
  {!events.length?<p>{loading?"載入紀錄…":"尚無操作紀錄"}</p>:<ol>{events.map(e=><li key={e.id}>
   <time dateTime={e.at}>{formatDateTime(e.at)}</time><span title={e.actorName}>{e.actorName}</span><strong>{e.kind}</strong><span className="cy-store-history-summary" title={historySummary(e)}>{historySummary(e)}</span>
  </li>)}</ol>}{cursor?<button type="button" className="cy-op-button compact" disabled={loading} onClick={()=>void load(cursor)}>載入更多</button>:null}
 </div>;
}
