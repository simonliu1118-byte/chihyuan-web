import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {apiRequest} from "../../api/client";
import {Field,CheckField,FormSection} from "../../ui/forms/Field";
import {DataViewToolbar} from "../../ui/data/DataViewToolbar";
import {StatusFilter} from "../../ui/data/StatusFilter";
import {StatusChip} from "../../ui/primitives/StatusChip";
import {Dialog} from "../../ui/overlays/Dialog";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {FeedbackBanner,useFeedbackMessage} from "../../ui/feedback/FeedbackProvider";
import {enterAdvancesFields,enterAdvancesThenSubmits} from "../../ui/foundation/enter-advance";
import {STORE_ORDER_STATUSES,STORE_ORDER_STATUS_LABELS,STORE_BLACKLIST_ACTIONS,STORE_BLACKLIST_ACTION_LABELS,STORE_STEPS,STORE_MILESTONES,STORE_CANCEL_REASONS,STORE_EDIT_REASONS,daysSinceNotified,lineAmount,normalizePhone,orderTotal,type StoreOrder,type StoreBlacklistEntry,type StoreBlacklistAction,type StoreMilestone,type StoreContactMatch,type StoreHistoryPage,type StoreHistory} from "../../../shared/store";
import type {StatusTone} from "./status-flow";
const ROOT="/api/business/store";
const call=<T,>(path:string,method="GET",json?:unknown)=>apiRequest<T>(ROOT+path,{method,json});
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const money=(n:number)=>n.toLocaleString("zh-TW");
const errorOf=(e:unknown)=>e instanceof Error?e.message:"操作失敗";
const tone:Record<StoreOrder["status"],StatusTone>={REGISTERED:"neutral",ORDERED:"info",ARRIVED:"info",NOTIFIED:"warning",PICKED_UP:"success",CANCELLED:"danger"};
type Contact={phone:string;mobile:string;lineName:string};
type Decision={id:number;version:number;same:boolean};
type Line={key:number;itemCode:string;itemName:string;quantity:string;unitPrice:string};
type Form={order?:StoreOrder;orderDate:string;customerName:string;deposit:string;note:string;lines:Line[];reasonKind:string;reason:string;key:string}&Contact;
type Cancel={order:StoreOrder;reasonKind:string;reason:string;key:string;lineDecisions?:Decision[];blacklistId?:number};
type BlackForm={entry?:StoreBlacklistEntry;name:string;reason:string;action:StoreBlacklistAction;changeReason:string;origin?:Cancel}&Contact;
const emptyLine=():Line=>({key:Math.random(),itemCode:"",itemName:"",quantity:"1",unitPrice:""});
const nextIcon=<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m10 8 4 4-4 4"/></svg>;
const checkIcon=<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>;
function Icon({label,onClick,kind,disabled=false,expanded,controls}:{label:string;onClick:()=>void;kind:"edit"|"cancel"|"back"|"history"|"next";disabled?:boolean;expanded?:boolean;controls?:string}){
 return <button type="button" className={"cy-op-button compact cy-store-icon "+(kind==="cancel"?"danger":"")} aria-label={label} title={label} aria-expanded={expanded} aria-controls={controls} disabled={disabled} onClick={onClick}>
  {kind==="next"?nextIcon:<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind==="edit"?<><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></>:kind==="cancel"?<><circle cx="12" cy="12" r="9"/><path d="m8 8 8 8m-8 0 8-8"/></>:kind==="back"?<><path d="m9 4-6 6 6 6"/><path d="M3 10h11a6 6 0 0 1 6 6v4"/></>:<><path d="M3 11a9 9 0 1 1 2.5 7M3 4v7h7"/><path d="M12 7v5l3 2"/></>}</svg>}
 </button>;
}
function ContactFields({value,onChange}:{value:Contact;onChange:(patch:Partial<Contact>)=>void}){
 const missing=!value.phone.trim()&&!value.mobile.trim()&&!value.lineName.trim();return <>
  <Field label="電話" size="s" oneOf="電話／手機／LINE 至少一項" reportAs="聯絡方式"><input className="cy-op-input" type="tel" required={missing} maxLength={30} value={value.phone} onChange={e=>onChange({phone:e.target.value})}/></Field>
  <Field label="手機" size="s"><input className="cy-op-input" type="tel" maxLength={30} value={value.mobile} onChange={e=>onChange({mobile:e.target.value})}/></Field>
  <Field label="LINE 名稱" size="s"><input className="cy-op-input" maxLength={60} value={value.lineName} onChange={e=>onChange({lineName:e.target.value})}/></Field>
 </>;
}
const fieldLabels:Record<string,string>={orderDate:"訂購日期",customerName:"顧客姓名",phone:"電話",mobile:"手機",lineName:"LINE 名稱",deposit:"訂金",note:"備註",lines:"品項",total:"金額合計",status:"處理狀態",dates:"進度日期",date:"作業日期",blacklistId:"黑名單編號",blacklistEvent:"黑名單事件",orderId:"來源訂購"};
function display(v:unknown):string{if(v===null||v===undefined||v==="")return "";if(Array.isArray(v))return v.map(x=>{const l=x as {itemCode?:string;itemName?:string;quantity?:number;unitPrice?:number};return `${l.itemCode??""} ${l.itemName??""} ×${l.quantity??""} @${l.unitPrice??""}`}).join("；");if(typeof v==="object")return Object.entries(v).map(([k,x])=>`${STORE_ORDER_STATUS_LABELS[k as StoreOrder["status"]]??fieldLabels[k]??k}：${display(x)}`).join("；");return STORE_ORDER_STATUS_LABELS[String(v) as StoreOrder["status"]]??String(v)}
function History({path,onError,legacy=false}:{path:string;onError:(s:string)=>void;legacy?:boolean}){
 const [events,setEvents]=useState<StoreHistory[]>([]),[cursor,setCursor]=useState<number|null>(null),[loading,setLoading]=useState(true);
 const load=useCallback(async(next?:number)=>{setLoading(true);try{const p=await call<StoreHistoryPage>(path+(next?"?cursor="+next:""));setEvents(old=>next?[...old,...p.rows]:p.rows);setCursor(p.nextCursor)}catch(e){onError(errorOf(e))}finally{setLoading(false)}},[path,onError]);
 useEffect(()=>{void load()},[load]);return <div className="cy-store-history">
  {legacy?<p>舊版紀錄不完整；此處顯示改版後的操作。</p>:null}
  {!events.length?<p>{loading?"載入紀錄…":"無訂購事件紀錄"}</p>:<ol>{events.map(e=><li key={e.id}>
   <strong>{new Date(e.at).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})}　{e.actorName}　{e.kind}</strong>{e.reason?<p>理由：{e.reason}</p>:null}
   <ul>{Object.keys({...e.before,...e.after}).filter(k=>JSON.stringify(e.before[k])!==JSON.stringify(e.after[k])).map(k=><li key={k}>{fieldLabels[k]??k}：{display(e.before[k])} → {display(e.after[k])}</li>)}</ul>
  </li>)}</ol>}{cursor?<button type="button" className="cy-op-button compact" disabled={loading} onClick={()=>void load(cursor)}>載入更多</button>:null}
 </div>;
}
export function CustomerOrders(){
 const [orders,setOrders]=useState<StoreOrder[]>([]),[blacks,setBlacks]=useState<StoreBlacklistEntry[]>([]),[loading,setLoading]=useState(true);
 const [view,setView]=useState<"orders"|"blacklist">("orders"),[search,setSearch]=useState(""),[filter,setFilter]=useState(""),[overdue,setOverdue]=useState(false);
 const [form,setForm]=useState<Form|null>(null),[cancel,setCancel]=useState<Cancel|null>(null),[black,setBlack]=useState<BlackForm|null>(null),[ask,setAsk]=useState(false);
 const [date,setDate]=useState<{order:StoreOrder;step:StoreMilestone;value:string;mode:"advance"|"date";withoutDate:boolean;key:string}|null>(null);
 const [rollback,setRollback]=useState<{order:StoreOrder;reason:string;key:string}|null>(null);
 const [history,setHistory]=useState<string|null>(null),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[warning,setWarning]=useState<StoreBlacklistEntry[]>([]);
 const [review,setReview]=useState<{entry:StoreBlacklistEntry;done:(result:boolean|null)=>void}|null>(null);
 const [choose,setChoose]=useState<{entries:StoreBlacklistEntry[];done:(id:number|null)=>void}|null>(null);
 const [message,setMessage,reportError,feedbackTone]=useFeedbackMessage<string|null>(null);
 const {confirm,confirmationDialog}=useConfirmation();const sequence=useRef(0),mutation=useRef(false);
 const load=useCallback(async()=>{const serial=++sequence.current;try{const [o,b]=await Promise.all([call<StoreOrder[]>("/orders?q="+encodeURIComponent(search)),call<StoreBlacklistEntry[]>("/blacklist")]);if(serial===sequence.current){setOrders(o);setBlacks(b)}}catch(e){if(serial===sequence.current)reportError(errorOf(e))}finally{if(serial===sequence.current)setLoading(false)}},[search,reportError]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),200);return()=>{clearTimeout(timer);sequence.current++}},[load]);
 const match=async(f:Contact)=>call<StoreContactMatch>("/blacklist/check?"+new URLSearchParams(f).toString());
 async function resolve(f:Contact,exclude?:number){const state=await match(f),decisions:Decision[]=[];for(const entry of state.lineCandidates.filter(e=>e.id!==exclude)){
   const same=await new Promise<boolean|null>(done=>setReview({entry,done}));setReview(null);if(same===null)return null;decisions.push({id:entry.id,version:entry.version,same});if(same)state.matches.push(entry);
  }return {lineDecisions:decisions,matches:state.matches.filter(e=>e.id!==exclude)};
 }
 // Preview exact number matches only. LINE display-name candidates require explicit review at save.
 useEffect(()=>{if(!form){setWarning([]);return}let active=true;const timer=setTimeout(()=>void match(form).then(s=>{if(active)setWarning(s.matches)}).catch(()=>{}),250);return()=>{active=false;clearTimeout(timer)}},[form?.phone,form?.mobile,form?.lineName,!!form]);
 async function run(task:()=>Promise<void>){if(mutation.current)return;mutation.current=true;setBusy(true);try{await task();setRevision(n=>n+1);await load()}catch(e){reportError(errorOf(e))}finally{mutation.current=false;setBusy(false)}}
 function openForm(o?:StoreOrder){setWarning([]);setForm({order:o,orderDate:o?.orderDate??today(),customerName:o?.customerName??"",phone:o?.phone??"",mobile:o?.mobile??"",lineName:o?.lineName??"",deposit:String(o?.deposit??0),note:o?.note??"",lines:o?o.lines.map(l=>({...l,key:Math.random(),quantity:String(l.quantity),unitPrice:String(l.unitPrice)})):[emptyLine()],reasonKind:"",reason:"",key:crypto.randomUUID()})}
 const total=form?orderTotal(form.lines.map(l=>({quantity:Number(l.quantity)||0,unitPrice:Number(l.unitPrice)||0}))):0;
 const full=warning.some(b=>b.action==="FULL_PAYMENT"),refused=warning.some(b=>b.action==="REFUSE");
 useEffect(()=>{if(form&&full)setForm(f=>f&&f.deposit!==String(total)?{...f,deposit:String(total)}:f)},[full,total]);
 const patchForm=(p:Partial<Form>)=>{if("phone" in p||"mobile" in p||"lineName" in p)setWarning([]);setForm(f=>f?{...f,...p}:f)};
 async function saveForm(e:FormEvent){e.preventDefault();if(!form)return;await run(async()=>{const r=await resolve(form);if(!r)return;
  await call(form.order?"/orders/"+form.order.id:"/orders",form.order?"PATCH":"POST",{...form,requestKey:form.key,expectedVersion:form.order?.version,deposit:Number(form.deposit),lines:form.lines.map(l=>({itemCode:l.itemCode,itemName:l.itemName,quantity:Number(l.quantity),unitPrice:Number(l.unitPrice)})),lineDecisions:r.lineDecisions});setForm(null);setMessage("訂購已儲存");
 })}
 async function commitCancel(c:Cancel,b?:BlackForm){await call("/orders/"+c.order.id+"/status","POST",{action:"cancel",expectedVersion:c.order.version,requestKey:c.key,reasonKind:c.reasonKind,reason:c.reason,lineDecisions:c.lineDecisions,blacklistId:c.blacklistId,...(b?{blacklist:b}:{})});setCancel(null);setBlack(null);setAsk(false);setMessage("訂購已取消，相關紀錄已儲存")}
 async function prepareCancel(e:FormEvent){e.preventDefault();if(!cancel)return;await run(async()=>{
  if(cancel.reasonKind!=="顧客取消"&&cancel.reasonKind!=="其他"){await commitCancel(cancel);return}
  const r=await resolve(cancel.order);if(!r)return;let id:number|undefined=r.matches[0]?.id;
  if(r.matches.length>1){id=await new Promise<number|null>(done=>setChoose({entries:r.matches,done})).then(x=>x??undefined);setChoose(null);if(!id)return}
  const next={...cancel,lineDecisions:r.lineDecisions,blacklistId:id};setCancel(next);
  if(id){if(await confirm({title:"已在黑名單",description:"取消訂購時將追加本次事件紀錄，原處置不變。",confirmLabel:"儲存",cancelLabel:"返回"}))await commitCancel(next)}else setAsk(true);
 })}
 async function saveBlack(e:FormEvent){e.preventDefault();if(!black)return;await run(async()=>{if(black.origin){await commitCancel(black.origin,black);return}
  const r=await resolve(black,black.entry?.id);if(!r)return;
  await call(black.entry?"/blacklist/"+black.entry.id:"/blacklist",black.entry?"PATCH":"POST",{...black,expectedVersion:black.entry?.version,lineDecisions:r.lineDecisions});setBlack(null);setMessage("黑名單已儲存");
 })}
 const contactsBlack=(o:StoreOrder,c:Cancel):BlackForm=>({name:o.customerName,phone:o.phone,mobile:o.mobile,lineName:o.lineName,reason:c.reasonKind+(c.reason?"："+c.reason:""),action:"REFUSE",changeReason:"",origin:c});
 const counts=orders.reduce<Record<string,number>>((a,o)=>({...a,[o.status]:(a[o.status]??0)+1}),{});
 const shown=orders.filter(o=>(!filter||filter===o.status)&&(!overdue||o.status==="NOTIFIED"&&(daysSinceNotified(o.notifiedAt)??0)>7));
 const toggle=(id:string)=>setHistory(h=>h===id?null:id);
 const showDate=(o:StoreOrder,step:StoreMilestone,mode:"date"|"advance")=>setDate({order:o,step,mode,value:o.dates[step]??today(),withoutDate:step==="ORDERED"&&!o.dates[step],key:crypto.randomUUID()});
 async function lookup(l:Line){if(!l.itemCode.trim()||l.itemName.trim())return;try{const item=await call<{item_name:string}|null>("/item?itemCode="+encodeURIComponent(l.itemCode));if(item)setForm(f=>f?{...f,lines:f.lines.map(x=>x.key===l.key&&!x.itemName?{...x,itemName:item.item_name}:x)}:f)}catch{/* manual input remains available */}}
 return <div className="cy-store-orders"><FeedbackBanner message={message} tone={feedbackTone}/>
  <div className="cy-store-views" role="group" aria-label="顧客訂購"><button type="button" aria-pressed={view==="orders"} onClick={()=>setView("orders")}>訂購清單</button><button type="button" aria-pressed={view==="blacklist"} onClick={()=>setView("blacklist")}>黑名單 {blacks.length}</button></div>
  <DataViewToolbar searchValue={search} onSearchChange={setSearch} searchLabel="搜尋顧客訂購" searchPlaceholder="搜尋姓名、電話、手機、LINE、品號、品名、備註" actions={<button type="button" className="cy-op-button primary" onClick={()=>view==="orders"?openForm():setBlack({name:"",phone:"",mobile:"",lineName:"",reason:"",action:"REFUSE",changeReason:""})}>＋ {view==="orders"?"新增訂購":"新增黑名單"}</button>}/>
  {view==="orders"?<><div className="cy-store-filters"><StatusFilter label="處理狀態" options={STORE_ORDER_STATUSES.map(code=>({code,label:STORE_ORDER_STATUS_LABELS[code],tone:tone[code]}))} counts={counts} value={filter} onChange={v=>{setFilter(v);setOverdue(false)}}/><button type="button" className="cy-op-button compact" aria-pressed={overdue} onClick={()=>{setOverdue(v=>!v);setFilter("")}}>通知逾 7 天未取</button></div>
  {loading?<p>載入訂購…</p>:<div className="cy-ordering-grid-scroll"><table className="cy-ordering-grid cy-store-workflow-table"><colgroup>
   <col className="cy-store-col-status"/><col className="cy-store-col-date"/><col className="cy-store-col-name"/><col className="cy-store-col-contact"/><col className="cy-store-col-line"/><col className="cy-store-col-items"/>
   <col className="cy-store-col-money"/><col className="cy-store-col-money"/><col className="cy-store-col-note"/>{STORE_MILESTONES.map(step=><col key={step} className="cy-store-col-milestone"/>)}<col className="cy-store-col-actions"/></colgroup><thead><tr>{["處理狀態","訂購日期","姓名","電話／手機","LINE","訂購品項","金額","訂金","備註","叫貨","到貨","通知","取貨","操作"].map((h,i)=><th key={h} className={[[1,9,13].includes(i)?"cy-grid-divider-before":"",[0,9,10,11,12,13].includes(i)?"cy-store-head-center":"",[6,7].includes(i)?"cy-store-head-money":""].filter(Boolean).join(" ")}>{h}</th>)}</tr></thead>
   {shown.map(o=>{const current=STORE_STEPS.indexOf(o.status as typeof STORE_STEPS[number]),late=o.status==="NOTIFIED"&&(daysSinceNotified(o.notifiedAt)??0)>7;return <tbody key={o.id}>
    <tr data-overdue={late||undefined}><td data-label="處理狀態"><StatusChip tone={tone[o.status]}>{STORE_ORDER_STATUS_LABELS[o.status]}</StatusChip>{late?<small className="cy-store-late">已通知 {daysSinceNotified(o.notifiedAt)} 天仍未取</small>:null}</td>
     <td data-label="訂購日期" className="cy-grid-divider-before">{o.orderDate.replaceAll("-","/")}</td><td data-label="姓名">{o.customerName}</td><td data-label="電話／手機" className="cy-store-contact-cell">{o.phone?<span>{o.phone}</span>:null}{o.mobile?<span>{o.mobile}</span>:null}</td><td data-label="LINE">{o.lineName||""}</td><td data-label="訂購品項"><ul className="cy-store-items">{o.lines.map(l=><li key={l.id}>{l.itemCode} {l.itemName} ×{l.quantity} @{money(l.unitPrice)}</li>)}</ul></td>
     <td data-label="金額" className="cy-num">{money(o.total)}</td><td data-label="訂金" className="cy-num">{money(o.deposit)}</td><td data-label="備註" className="cy-store-list-note"><details><summary>{o.note||""}</summary>{o.note}</details></td>
     {STORE_MILESTONES.map((step,i)=>{const reached=current>=i+1,withdrawn=!reached&&!!o.dates[step]&&o.status!=="CANCELLED",next=o.status!=="CANCELLED"&&current===i;const editing=date?.order.id===o.id&&date.step===step;return <td data-label={STORE_ORDER_STATUS_LABELS[step]} key={step} className={i===0?"cy-grid-divider-before cy-store-milestone":"cy-store-milestone"}>
      {next?<Icon kind="next" label={"登記"+STORE_ORDER_STATUS_LABELS[step]+"日期"+(withdrawn?"（重新登記）":"")} disabled={busy} onClick={()=>showDate(o,step,"advance")}/>:
       o.dates[step]?<button type="button" className="cy-store-date-link" disabled={busy||o.status==="CANCELLED"} title={(withdrawn?"已退回，修改上次登記日期：":"修改日期：")+o.dates[step]?.replaceAll("-","/")} aria-label={STORE_ORDER_STATUS_LABELS[step]+"日期 "+o.dates[step]?.replaceAll("-","/")} onClick={()=>showDate(o,step,"date")}>{o.dates[step]?.slice(5).replace("-","/")}</button>:
       step==="ORDERED"&&o.hasEverOrdered?<button type="button" className="cy-op-button compact cy-store-icon cy-store-ordered-check" aria-label="已叫貨（未填日期），修改叫貨日期" title="已叫貨（未填日期），可補日期" disabled={busy||o.status==="CANCELLED"} onClick={()=>showDate(o,step,"date")}>{checkIcon}</button>:
       reached?<Icon kind="edit" label={"補登"+STORE_ORDER_STATUS_LABELS[step]+"日期"} disabled={busy} onClick={()=>showDate(o,step,"date")}/>:null}
      {editing?<div className="cy-store-date-popover" role="dialog" aria-label={STORE_ORDER_STATUS_LABELS[step]+"日期"}><form onKeyDown={enterAdvancesThenSubmits} onSubmit={e=>{e.preventDefault();if(!date)return;const d=date;void run(async()=>{await call("/orders/"+o.id+(d.mode==="date"?"/date":"/status"),d.mode==="date"?"PATCH":"POST",{action:"advance",step:d.step,milestoneDate:d.withoutDate?"":d.value,expectedVersion:d.order.version,requestKey:d.key});setDate(null);setMessage("日期已儲存")})}}>
       {step==="ORDERED"?<CheckField label="無日期" size="s" checked={date.withoutDate} onChange={e=>setDate(d=>d?{...d,withoutDate:e.target.checked}:d)}/>:null}
       <Field label={STORE_ORDER_STATUS_LABELS[step]+"日期"+(step==="ORDERED"?"（選填）":"")} required={!date.withoutDate} size="s"><input type="date" disabled={date.withoutDate} value={date.withoutDate?"":date.value} max={today()} min={o.orderDate} onChange={e=>setDate(d=>d?{...d,value:e.target.value}:d)}/></Field>
       <button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>setDate(null)}>取消</button><button type="submit" className="cy-op-button compact primary" disabled={busy}>{step==="PICKED_UP"&&date.mode==="advance"?"儲存並結案":"儲存"}</button>
      </form></div>:null}
     </td>})}
     <td data-label="操作" className="cy-grid-divider-before"><div className="cy-store-row-actions">{o.status!=="PICKED_UP"&&o.status!=="CANCELLED"?<><Icon kind="edit" label="修改訂購" disabled={busy} onClick={()=>openForm(o)}/><Icon kind="cancel" label="取消訂購" disabled={busy} onClick={()=>setCancel({order:o,reasonKind:"",reason:"",key:crypto.randomUUID()})}/></>:null}{current>0?<Icon kind="back" label="退回上一步" disabled={busy} onClick={()=>setRollback({order:o,reason:"",key:crypto.randomUUID()})}/>:null}<Icon kind="history" label="展開操作紀錄" controls={"store-history-"+o.id} expanded={history==="o"+o.id} onClick={()=>toggle("o"+o.id)}/></div></td>
    </tr>{history==="o"+o.id?<tr id={"store-history-"+o.id}><td colSpan={14}><History key={revision} path={"/orders/"+o.id+"/history"} onError={reportError} legacy={o.legacy}/></td></tr>:null}
   </tbody>})}</table>{!shown.length?<p className="cy-op-empty">沒有符合條件的訂購。</p>:null}</div>}</>:
   <div className="cy-ordering-grid-scroll"><table className="cy-ordering-grid cy-store-blacklist-table"><thead><tr>{["顧客姓名","電話","手機","LINE 名稱","處置","理由","訂購事件","操作"].map(h=><th key={h}>{h}</th>)}</tr></thead>{blacks.filter(b=>[b.name,b.phone,b.mobile,b.lineName,b.reason].some(s=>s.includes(search))).map(b=><tbody key={b.id}><tr><td>{b.name}</td><td>{b.phone||""}</td><td>{b.mobile||""}</td><td>{b.lineName||""}</td><td>{STORE_BLACKLIST_ACTION_LABELS[b.action]}</td><td>{b.reason}</td><td><button type="button" className="cy-op-button compact" onClick={()=>toggle("b"+b.id)} aria-expanded={history==="b"+b.id} aria-controls={"blacklist-history-"+b.id}>{b.eventCount} 筆</button></td><td><div className="cy-store-row-actions"><Icon kind="edit" label="修改黑名單" disabled={busy} onClick={()=>setBlack({entry:b,...b,changeReason:""})}/><Icon kind="cancel" label="移出黑名單" disabled={busy} onClick={()=>void run(async()=>{if(await confirm({title:"移出黑名單",description:"移出後保留既有事件與訂購紀錄。",confirmLabel:"移出"}))await call("/blacklist/"+b.id,"DELETE",{expectedVersion:b.version})})}/></div></td></tr>{history==="b"+b.id?<tr id={"blacklist-history-"+b.id}><td colSpan={8}><History key={revision} path={"/blacklist/"+b.id+"/history"} onError={reportError}/></td></tr>:null}</tbody>)}</table></div>}
  {form?<Dialog open title={form.order?"修改訂購":"新增訂購"} className="cy-store-order-dialog" onClose={()=>!busy&&setForm(null)}><form onKeyDown={enterAdvancesFields} onSubmit={e=>void saveForm(e)}>
   <div className="cy-ordering-grid-scroll"><table className="cy-ordering-grid cy-store-entry-table"><tbody><tr><th colSpan={6}>基本資料</th></tr><tr><td colSpan={6}><div className="cy-store-contact-grid">
    <Field label="訂購日期" required size="s"><input className="cy-op-input" type="date" max={today()} min="0001-01-01" value={form.orderDate} onChange={e=>patchForm({orderDate:e.target.value})}/></Field>
    <Field label="顧客姓名" required size="s"><input className="cy-op-input" maxLength={40} value={form.customerName} onChange={e=>patchForm({customerName:e.target.value})}/></Field><ContactFields value={form} onChange={patchForm}/>
   </div></td></tr>{warning.length?<tr><td colSpan={6}>{warning.map(b=><p key={b.id} className="cy-notice cy-notice-warning">黑名單：{STORE_BLACKLIST_ACTION_LABELS[b.action]} — {b.reason}</p>)}</td></tr>:null}
   <tr>{["品號","品名","數量","單價","金額","操作"].map(h=><th key={h}>{h}</th>)}</tr>
   {form.lines.map((l,i)=><tr key={l.key}>{(["itemCode","itemName","quantity","unitPrice"] as const).map((k,j)=><td key={k}><Field label={["品號","品名","數量","單價"][j]+" "+(i+1)} required={k!=="itemCode"} size="s"><input className="cy-ordering-cell" type={j<2?"text":"number"} maxLength={j===0?40:j===1?200:undefined} min={k==="quantity"?"0.0001":"0"} step={k==="quantity"?"any":"1"} value={l[k]} onBlur={()=>k==="itemCode"?void lookup(l):undefined} onChange={e=>patchForm({lines:form.lines.map(x=>x.key===l.key?{...x,[k]:e.target.value}:x)})}/></Field></td>)}<td className="cy-num">{money(lineAmount({quantity:Number(l.quantity)||0,unitPrice:Number(l.unitPrice)||0}))}</td><td><button type="button" className="cy-op-button compact" disabled={form.lines.length===1} onClick={()=>patchForm({lines:form.lines.filter(x=>x.key!==l.key)})}>刪除</button></td></tr>)}
   <tr><td colSpan={6}><button type="button" className="cy-op-button compact" onClick={()=>patchForm({lines:[...form.lines,emptyLine()]})}>＋ 加一個品項</button></td></tr>
   <tr><td colSpan={2}>金額合計 <strong>{money(total)}</strong></td><td colSpan={2}><Field label="訂金" required size="s"><input className="cy-op-input" type="number" min="0" max={total} step="1" readOnly={full} value={form.deposit} onChange={e=>patchForm({deposit:e.target.value})}/></Field></td><td colSpan={2}>尾款 <strong>{money(total-(Number(form.deposit)||0))}</strong></td></tr>
   <tr><td colSpan={6}><Field label="備註" size="l"><textarea className="cy-op-input" rows={2} maxLength={300} value={form.note} onChange={e=>patchForm({note:e.target.value})}/></Field></td></tr>
   {form.order?.hasEverOrdered?<tr><td colSpan={6}><Reason kind={form.reasonKind} detail={form.reason} options={STORE_EDIT_REASONS} onChange={(reasonKind,reason)=>patchForm({reasonKind,reason})}/></td></tr>:null}
   </tbody></table></div><div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>setForm(null)}>取消</button><button type="submit" className="cy-op-button primary" disabled={busy||refused}>儲存</button></div>
  </form></Dialog>:null}
  {cancel&&!black&&!ask?<Dialog open title="取消訂購" onClose={()=>!busy&&setCancel(null)}><form onKeyDown={enterAdvancesFields} onSubmit={e=>void prepareCancel(e)}><p>{cancel.order.customerName} — {cancel.order.orderDate}</p><FormSection><Reason kind={cancel.reasonKind} detail={cancel.reason} options={STORE_CANCEL_REASONS} onChange={(reasonKind,reason)=>setCancel(c=>c?{...c,reasonKind,reason}:c)}/></FormSection><div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>setCancel(null)}>返回</button><button type="submit" className="cy-op-button danger" disabled={busy}>儲存</button></div></form></Dialog>:null}
  {ask&&cancel?<Dialog open title="是否加入黑名單？" onClose={()=>!busy&&setAsk(false)}><div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>void run(async()=>{await commitCancel(cancel)})}>否</button><button type="button" className="cy-op-button primary" disabled={busy} onClick={()=>{setAsk(false);setBlack(contactsBlack(cancel.order,cancel))}}>是</button></div></Dialog>:null}
  {black?<Dialog open title={black.entry?"修改黑名單":"新增黑名單"} className="cy-store-blacklist-dialog" onClose={()=>!busy&&setBlack(null)}><form onKeyDown={enterAdvancesFields} onSubmit={e=>void saveBlack(e)}>
   {black.origin?<p>訂購取消尚未儲存；儲存後將同時取消並加入黑名單。</p>:null}<div className="cy-store-black-contact-grid"><Field label="顧客姓名" required size="s"><input className="cy-op-input" maxLength={40} value={black.name} onChange={e=>setBlack(b=>b?{...b,name:e.target.value}:b)}/></Field><ContactFields value={black} onChange={p=>setBlack(b=>b?{...b,...p}:b)}/></div>
   <FormSection><Field label="處置" required size="s"><select className="cy-op-input" value={black.action} onChange={e=>setBlack(b=>b?{...b,action:e.target.value as StoreBlacklistAction}:b)}>{STORE_BLACKLIST_ACTIONS.map(a=><option key={a} value={a}>{STORE_BLACKLIST_ACTION_LABELS[a]}</option>)}</select></Field><Field label="理由" required size="l"><input className="cy-op-input" maxLength={300} value={black.reason} onChange={e=>setBlack(b=>b?{...b,reason:e.target.value}:b)}/></Field>{black.entry&&black.entry.action!==black.action?<Field label="修改處置理由" required size="l"><input className="cy-op-input" maxLength={300} value={black.changeReason} onChange={e=>setBlack(b=>b?{...b,changeReason:e.target.value}:b)}/></Field>:null}</FormSection>
   <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>setBlack(null)}>取消</button><button type="submit" className="cy-op-button primary" disabled={busy}>儲存</button></div>
  </form></Dialog>:null}
  {rollback?<Dialog open title={"退回「"+STORE_ORDER_STATUS_LABELS[STORE_STEPS[STORE_STEPS.indexOf(rollback.order.status as typeof STORE_STEPS[number])-1]]+"」"} onClose={()=>!busy&&setRollback(null)}><form onKeyDown={enterAdvancesThenSubmits} onSubmit={e=>{e.preventDefault();const r=rollback;void run(async()=>{await call("/orders/"+r.order.id+"/status","POST",{action:"rollback",reason:r.reason,expectedVersion:r.order.version,requestKey:r.key});setRollback(null)})}}><Field label="退回理由" required size="l"><input className="cy-op-input" maxLength={300} value={rollback.reason} onChange={e=>setRollback(r=>r?{...r,reason:e.target.value}:r)}/></Field><div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>setRollback(null)}>取消</button><button type="submit" className="cy-op-button primary" disabled={busy}>退回</button></div></form></Dialog>:null}
  {review?<Dialog open title="LINE 名稱可能同名，請核對" onClose={()=>review.done(null)}><p>{review.entry.name}／{review.entry.phone||review.entry.mobile||review.entry.lineName} — {review.entry.reason}</p><p>是否為同一位顧客？不同人不會自動合併或套用處置。</p><div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={()=>review.done(false)}>不同人</button><button type="button" className="cy-op-button primary" onClick={()=>review.done(true)}>同一人</button></div></Dialog>:null}
  {choose?<Dialog open title="請選擇本次事件的黑名單對象" onClose={()=>choose.done(null)}>{choose.entries.map(b=><button type="button" key={b.id} className="cy-op-button" onClick={()=>choose.done(b.id)}>{b.name} — {b.phone||b.mobile||b.lineName}</button>)}</Dialog>:null}
  {confirmationDialog}
 </div>;
}
function Reason({kind,detail,options,onChange}:{kind:string;detail:string;options:readonly string[];onChange:(kind:string,detail:string)=>void}){return <FormSection><Field label="理由類別" required size="m"><select className="cy-op-input" value={kind} onChange={e=>onChange(e.target.value,detail)}><option value="">請選擇</option>{options.map(o=><option key={o}>{o}</option>)}</select></Field><Field label="補充說明" required={kind==="其他"} size="l"><input className="cy-op-input" maxLength={240} value={detail} onChange={e=>onChange(kind,e.target.value)}/></Field></FormSection>}
