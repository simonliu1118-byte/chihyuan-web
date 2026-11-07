import {useCallback,useEffect,useRef,useState} from "react";
import {apiRequest} from "../../api/client";
import {STORE_ORDER_STATUS_LABELS,type StoreOrder,type StoreHistoryPage,type StoreHistory} from "../../../shared/store";
import {formatDateTime} from "../../ui/foundation/format";
import {cacheHistory,cachedHistory,type StoreHistoryCache} from "../../../shared/store-history";
const labels:Record<string,string>={brand:"品牌",model:"機型",saleDate:"銷售日期",warrantyStart:"保固起日",warrantyEnd:"保固迄日",maintenance:"需要維護",months:"預計維護年月",machines:"機身資料",joinedDate:"加入日期",name:"客戶姓名",reason:"理由",action:"處置",actionDetail:"處置方式",orderDate:"訂購日期",customerName:"客戶姓名",customerCode:"客戶編號",honorific:"稱謂",callResult:"叫貨結果",ORDERED:"叫貨日期",ARRIVED:"到貨（歷史）",NOTIFIED:"通知日期",PICKED_UP:"取貨日期",phone:"連絡電話2",mobile:"連絡電話1",lineName:"LINE 名稱",deposit:"訂金",note:"備註",lines:"品項",total:"金額合計",status:"處理狀態",dates:"進度日期",date:"作業日期",blacklistId:"黑名單編號",blacklistEvent:"黑名單事件",orderId:"來源訂購",itemName:"項目",completed:"辦理狀態",completionDate:"辦理日期",receivedDate:"送修日期",productKind:"類別",productText:"產品",serialNo:"產品機號",fault:"故障狀況",purchaseDate:"購買日期",accessories:"配件備註",inspectResult:"檢測結果",inspectProblem:"補充說明",carrier:"貨運",tracking:"寄送編號",returnMethod:"歸還方式",step:"步驟",unitPrice:"單價",quantity:"數量",itemCode:"品號",specification:"規格",publisher:"出版社",author:"作者",cancelReason:"取消原因",version:"版本"};
function display(v:unknown,key=""):string{
 if(v===null||v===undefined||v==="")return ["date","completionDate","ORDERED","NOTIFIED","PICKED_UP"].includes(key)?"無日期":"";
 if(typeof v==="boolean")return key==="completed"?v?"已完成":"未完成":v?"是":"否";
 if(Array.isArray(v))return v.map(x=>{const l=x as {itemCode?:string;itemName?:string;metadataMode?:string;publisher?:string;author?:string;specification?:string;quantity?:number;unitPrice?:number|null};return `${l.itemCode??""} ${l.itemName??""} ×${l.quantity??""} @${l.unitPrice??""}`}).join("；");
 if(typeof v==="object")return Object.entries(v).map(([k,x])=>`${STORE_ORDER_STATUS_LABELS[k as StoreOrder["status"]]??labels[k]??k}：${display(x,k)}`).join("；");
 return ({REFUSE:"拒絕訂購",FULL_PAYMENT:"須全額預付",NO_HOLD:"不保留商品",OTHER:"其他",MR:"先生",MS:"小姐",OUT_OF_STOCK:"缺貨",DISCONTINUED:"絕版/停產",UNORDERABLE:"無法訂購"} as Record<string,string>)[String(v)]??STORE_ORDER_STATUS_LABELS[String(v) as StoreOrder["status"]]??String(v);
}
type HistoryLine={itemCode?:string;itemName?:string;metadataMode?:string;publisher?:string;author?:string;specification?:string;quantity?:number;unitPrice?:number|null};
function lineChanges(before:HistoryLine[],after:HistoryLine[]):string[]{
 const used=new Set<number>(),money=(v:unknown)=>typeof v==="number"?v.toLocaleString("zh-TW"):String(v??"");
 const summary=(line:HistoryLine)=>(line.itemName||line.itemCode||"品項")+" ×"+line.quantity+" @"+money(line.unitPrice);
 const result=after.flatMap((line,i)=>{let index=before.findIndex((old,j)=>!used.has(j)&&old.itemCode===line.itemCode&&old.itemName===line.itemName);
  if(index<0&&before.length===after.length&&!used.has(i))index=i;
  if(index<0)return ["新增品項："+summary(line)];used.add(index);const old=before[index];
  const changes=([['itemCode','品號'],['itemName','品名'],['quantity','數量'],['unitPrice','單價'],['metadataMode','品項格式'],['publisher','出版社'],['author','作者'],['specification','規格']] as const).flatMap(([key,label])=>(old[key]??"")===(line[key]??"")?[]:[label+" "+money(old[key])+" → "+money(line[key])]);
  return changes.length?[(line.itemName||line.itemCode||"品項")+"："+changes.join("、")]:[];
 });
 return [...result,...before.flatMap((line,i)=>used.has(i)?[]:["刪除品項："+summary(line)])];
}
export function historySummary(e:StoreHistory):string{
 if(['登記維護','修改維護','取消維護登記'].includes(e.kind)){const day=(value:unknown)=>display(value,'completionDate').replaceAll('-','/');return [typeof e.after.plannedMonth==='string'?'預計：'+e.after.plannedMonth.replaceAll('-','/'):'',e.kind!=='取消維護登記'&&Object.hasOwn(e.after,'completionDate')?'日期：'+(e.kind==='修改維護'&&Object.hasOwn(e.before,'completionDate')?day(e.before.completionDate)+' → ':'')+day(e.after.completionDate):'',typeof e.after.note==='string'&&e.after.note?'備註：'+e.after.note:''].filter(Boolean).join('；')}
 if(["建立","加入黑名單","加回黑名單"].includes(e.kind))return "";
 if(e.kind==="訂購取消"||e.kind==="移出黑名單")return e.reason;
 if(e.kind==="確認辦理"||e.kind==="取消完成")return String(e.after.itemName??"");
 if(e.kind==="修改辦理日期")return String(e.after.itemName??"")+"："+display(e.before.completionDate,"completionDate")+" → "+display(e.after.completionDate,"completionDate");
 if(e.kind.startsWith("登記"))return typeof e.after.customerNote==="string"&&e.after.customerNote?"客戶告知："+e.after.customerNote:"";
 if(e.kind==="撤回取消")return [e.reason,e.after.blacklistReverted?"撤回列入黑名單":""].filter(Boolean).join("；");
 if(e.kind==="撤回列入黑名單")return "";
 if(e.kind==="取消")return [e.reason,e.after.listedInBlacklist?"列入黑名單":""].filter(Boolean).join("；");
 if(e.kind==="通知未接通")return "日期："+String(e.after.date??"").replaceAll("-","/");
 const changes=(a:Record<string,unknown>,b:Record<string,unknown>):string[]=>Object.keys({...a,...b}).flatMap(k=>{
  if(k==="dates"&&!("dates" in b)&&"date" in b)return [];
  if(k==="total"&&e.kind==="修改訂購")return [];
  if(JSON.stringify(a[k])===JSON.stringify(b[k])||!(a[k]??"")&&!(b[k]??"")&&typeof b[k]!=="boolean")return [];
  if(k==="dates"&&b[k]&&typeof b[k]==="object")return changes((a[k]??{}) as Record<string,unknown>,b[k] as Record<string,unknown>);
  if(k==="lines"&&e.kind==="修改訂購"&&Array.isArray(a[k])&&Array.isArray(b[k]))return lineChanges(a[k] as HistoryLine[],b[k] as HistoryLine[]);
  const hasOld=Object.hasOwn(a,k)&&a[k]!==undefined&&a[k]!==""&&(a[k]!==null||["date","completionDate","ORDERED","NOTIFIED","PICKED_UP"].includes(k));
  return [`${labels[k]??k}：${hasOld?display(a[k],k)+" → ":""}${display(b[k],k)}`];
 });
 return [typeof e.after.itemName==="string"?e.after.itemName:"",...changes(e.before,e.after),e.reason?"理由："+e.reason:""].filter(Boolean).join("；");
}
export type StoreHistoryChainEntry={key:string|number;at:string;actorName?:string|null;kind:string;summary?:string};
/** Shared compact event chain; wrapping keeps the arrow with the following event. */
export function StoreHistoryChain({entries}:{entries:readonly StoreHistoryChainEntry[]}){
 return <ol className="cy-store-history-chain">{entries.map(e=><li key={e.key}>
  <time dateTime={e.at}>{formatDateTime(e.at)}</time>{e.actorName?<span title={e.actorName}>{e.actorName}</span>:null}
  <strong title={e.kind}>{e.kind}</strong>{e.summary?<span className="cy-store-history-summary" title={e.summary}>({e.summary})</span>:null}
 </li>)}</ol>;
}
/** Shared per-record timeline for orders, blacklist and monthly todos. Paths are store-relative. */
export function StoreOperationHistory({path,onError,cache,layout="rows"}:{path:string;onError:(s:string)=>void;cache?:StoreHistoryCache;layout?:"rows"|"chain"}){
 const [events,setEvents]=useState<StoreHistory[]>([]),[cursor,setCursor]=useState<number|null>(null),[loading,setLoading]=useState(true),sequence=useRef(0);
 const load=useCallback(async(next?:number)=>{const serial=++sequence.current;setLoading(true);try{const p=await apiRequest<StoreHistoryPage>("/api/business/store"+path+(next?"?cursor="+next:""));if(serial===sequence.current){setEvents(old=>{const rows=next?[...old,...p.rows]:p.rows;if(cache)cacheHistory(cache,path,{rows,nextCursor:p.nextCursor});return rows});setCursor(p.nextCursor)}}catch(e){if(serial===sequence.current)onError(e instanceof Error?e.message:"紀錄載入失敗")}finally{if(serial===sequence.current)setLoading(false)}},[path,onError,cache]);
 useEffect(()=>{const saved=cache?cachedHistory(cache,path):null;if(saved){setEvents(saved.rows);setCursor(saved.nextCursor);setLoading(false)}else{setEvents([]);setCursor(null);void load()}return()=>{sequence.current++}},[load,path,cache]);
 return <div className="cy-store-history">
  {!events.length?<p>{loading?"載入紀錄…":"尚無操作紀錄"}</p>:layout==="chain"?<StoreHistoryChain entries={[...events].sort((a,b)=>a.id-b.id).map(e=>({key:e.id,at:e.at,actorName:e.actorName,kind:e.kind,summary:historySummary(e)}))}/>:<ol>{events.map(e=><li key={e.id}>
   <time dateTime={e.at}>{formatDateTime(e.at)}</time><span title={e.actorName}>{e.actorName}</span><strong title={e.kind}>{e.kind}</strong>{historySummary(e)?<span className="cy-store-history-summary" title={historySummary(e)}>{historySummary(e)}</span>:null}
  </li>)}</ol>}{cursor?<button type="button" className="cy-op-button compact" disabled={loading} onClick={()=>void load(cursor)}>載入更多</button>:null}
 </div>;
}
