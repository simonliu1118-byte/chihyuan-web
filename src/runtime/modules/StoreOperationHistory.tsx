import {useCallback,useEffect,useRef,useState} from "react";
import {apiRequest} from "../../api/client";
import {STORE_ORDER_STATUS_LABELS,type StoreOrder,type StoreHistoryPage,type StoreHistory} from "../../../shared/store";
const labels:Record<string,string>={orderDate:"訂購日期",customerName:"顧客姓名",phone:"電話",mobile:"手機",lineName:"LINE 名稱",deposit:"訂金",note:"備註",lines:"品項",total:"金額合計",status:"處理狀態",dates:"進度日期",date:"作業日期",blacklistId:"黑名單編號",blacklistEvent:"黑名單事件",orderId:"來源訂購",itemName:"項目",completed:"辦理狀態",completionDate:"辦理日期"};
function display(v:unknown,key=""):string{
 if(v===null||v===undefined||v==="")return key==="completionDate"?"無日期":"";
 if(typeof v==="boolean")return key==="completed"?v?"已完成":"未完成":v?"是":"否";
 if(Array.isArray(v))return v.map(x=>{const l=x as {itemCode?:string;itemName?:string;quantity?:number;unitPrice?:number};return `${l.itemCode??""} ${l.itemName??""} ×${l.quantity??""} @${l.unitPrice??""}`}).join("；");
 if(typeof v==="object")return Object.entries(v).map(([k,x])=>`${STORE_ORDER_STATUS_LABELS[k as StoreOrder["status"]]??labels[k]??k}：${display(x,k)}`).join("；");
 return STORE_ORDER_STATUS_LABELS[String(v) as StoreOrder["status"]]??String(v);
}
/** Shared per-record timeline for orders, blacklist and monthly todos. Paths are store-relative. */
export function StoreOperationHistory({path,onError}:{path:string;onError:(s:string)=>void}){
 const [events,setEvents]=useState<StoreHistory[]>([]),[cursor,setCursor]=useState<number|null>(null),[loading,setLoading]=useState(true),sequence=useRef(0);
 const load=useCallback(async(next?:number)=>{const serial=++sequence.current;setLoading(true);try{const p=await apiRequest<StoreHistoryPage>("/api/business/store"+path+(next?"?cursor="+next:""));if(serial===sequence.current){setEvents(old=>next?[...old,...p.rows]:p.rows);setCursor(p.nextCursor)}}catch(e){if(serial===sequence.current)onError(e instanceof Error?e.message:"紀錄載入失敗")}finally{if(serial===sequence.current)setLoading(false)}},[path,onError]);
 useEffect(()=>{setEvents([]);setCursor(null);void load();return()=>{sequence.current++}},[load]);
 return <div className="cy-store-history">
  {!events.length?<p>{loading?"載入紀錄…":"尚無操作紀錄"}</p>:<ol>{events.map(e=><li key={e.id}>
   <strong>{new Date(e.at).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})}　{e.actorName}　{e.kind}{typeof e.after.itemName==="string"?"　"+e.after.itemName:""}</strong>{e.reason?<p>理由：{e.reason}</p>:null}
   <ul>{Object.keys({...e.before,...e.after}).filter(k=>JSON.stringify(e.before[k])!==JSON.stringify(e.after[k])).map(k=><li key={k}>{labels[k]??k}：{display(e.before[k],k)} → {display(e.after[k],k)}</li>)}</ul>
  </li>)}</ol>}{cursor?<button type="button" className="cy-op-button compact" disabled={loading} onClick={()=>void load(cursor)}>載入更多</button>:null}
 </div>;
}
