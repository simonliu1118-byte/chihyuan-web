import {useEffect,useMemo,useState,type FormEvent} from "react";
import {apiRequest} from "../../api/client";
import {Field,CheckField,FormSection} from "../../ui/forms/Field";
import {StatusFilter} from "../../ui/data/StatusFilter";
import {StatusChip} from "../../ui/primitives/StatusChip";
import {Dialog} from "../../ui/overlays/Dialog";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {Loading} from "../../ui/feedback/Loading";
import {FeedbackBanner,useFeedbackMessage} from "../../ui/feedback/FeedbackProvider";
import {enterAdvancesFields,enterAdvancesThenSubmits} from "../../ui/foundation/enter-advance";
import {useCompactLayout} from "../../ui/foundation/useCompactLayout";
import type {StatusTone} from "./status-flow";
import {STORE_BLACKLIST_ACTION_LABELS,STORE_ORDER_STATUSES,STORE_ORDER_STATUS_LABELS,STORE_PICKUP_OVERDUE_DAYS,daysSinceNotified,lineAmount,normalizePhone,orderTotal,
 type StoreBlacklistAction,type StoreBlacklistEntry,type StoreOrder,type StoreOrderStatus} from "../../../shared/store";
import {StoreStocktake} from "./StoreStocktake";
import type {CyWebModuleCode} from "../../../shared/modules";
import "./store.css";

const ROOT="/api/business/store";
const call=<T,>(path:string,method="GET",json?:unknown)=>apiRequest<T>(ROOT+path,{method,json});
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const errorOf=(e:unknown)=>e instanceof Error?e.message:"門市操作失敗";
const TONE:Record<StoreOrderStatus,StatusTone>={ORDERED:"neutral",ARRIVED:"info",NOTIFIED:"warning",PICKED_UP:"success",CANCELLED:"danger"};
const money=(n:number)=>n.toLocaleString("zh-TW");
/** 0912345678 → 0912-345-678; other numbers stay as typed digits. */
const phoneText=(p:string)=>/^09\d{8}$/.test(p)?p.slice(0,4)+"-"+p.slice(4,7)+"-"+p.slice(7):p;
const overdueDays=(o:StoreOrder)=>{const d=o.status==="NOTIFIED"?daysSinceNotified(o.notifiedAt):null;return d!==null&&d>STORE_PICKUP_OVERDUE_DAYS?d:null};

type LineForm={key:number;itemCode:string;itemName:string;quantity:string;unitPrice:string};
type OrderForm={id?:number;version?:number;orderDate:string;customerName:string;phone:string;lineName:string;deposit:string;note:string;lines:LineForm[]};
type BlacklistForm={id?:number;name:string;phone:string;reason:string;action:StoreBlacklistAction};
let lineKey=0;
const emptyLine=():LineForm=>({key:++lineKey,itemCode:"",itemName:"",quantity:"1",unitPrice:""});
const formLines=(f:OrderForm)=>f.lines.filter(l=>l.itemCode.trim()||l.itemName.trim()||l.unitPrice.trim());
const formTotal=(f:OrderForm)=>orderTotal(formLines(f).map(l=>({quantity:Number(l.quantity)||0,unitPrice:Number(l.unitPrice)||0})));

/** 門市 (user 2026-10-28): tabs like ERP 查詢, no list on the left. 顧客訂購 is the first tab. */
export function StorePage({role,allowedModules}:{role:string;allowedModules:ReadonlySet<CyWebModuleCode>}){
 const canOrders=allowedModules.has("STORE_CUSTOMER_ORDERS");
 const canStocktake=allowedModules.has("STORE_STOCKTAKE");
 const [tab,setTab]=useState<"orders"|"stocktake">(canOrders?"orders":"stocktake");
 const active=tab==="orders"&&!canOrders?"stocktake":tab==="stocktake"&&!canStocktake?"orders":tab;
 return <section className="cy-store-page">
  <div className="cy-op-tabs" role="tablist" aria-label="門市">
   {canOrders?<button type="button" role="tab" aria-selected={active==="orders"} className={active==="orders"?"active":undefined}
      onClick={()=>setTab("orders")}>顧客訂購</button>:null}
   {canStocktake?<button type="button" role="tab" aria-selected={active==="stocktake"} className={active==="stocktake"?"active":undefined}
      onClick={()=>setTab("stocktake")}>庫存盤點</button>:null}
  </div>
  {active==="orders"&&canOrders?<CustomerOrders/>:canStocktake?<StoreStocktake role={role}/>:null}
 </section>;
}

function CustomerOrders(){
 const [orders,setOrders]=useState<StoreOrder[]|null>(null);
 const [blacklist,setBlacklist]=useState<StoreBlacklistEntry[]>([]);
 const [view,setView]=useState<"orders"|"blacklist">("orders");
 const [search,setSearch]=useState(""),[status,setStatus]=useState(""),[overdueOnly,setOverdueOnly]=useState(false);
 const [form,setForm]=useState<OrderForm|null>(null);
 const [warning,setWarning]=useState<StoreBlacklistEntry|null>(null);
 const [cancelling,setCancelling]=useState<{order:StoreOrder;reason:string;toBlacklist:boolean;action:StoreBlacklistAction}|null>(null);
 const [blacklistForm,setBlacklistForm]=useState<BlacklistForm|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage,reportError,tone]=useFeedbackMessage<string|null>(null);
 const {confirm,confirmationDialog}=useConfirmation();
 const compact=useCompactLayout();
 const setError=(text:string)=>reportError(text);

 async function load(){
  try{const [o,b]=await Promise.all([call<StoreOrder[]>("/orders"+(search.trim()?"?q="+encodeURIComponent(search.trim()):"")),call<StoreBlacklistEntry[]>("/blacklist")]);setOrders(o);setBlacklist(b)}
  catch(e){setError(errorOf(e));setOrders(prev=>prev??[])}
 }
 useEffect(()=>{const timer=setTimeout(()=>void load(),300);return()=>clearTimeout(timer)},[search]); // eslint-disable-line react-hooks/exhaustive-deps

 const counts=useMemo(()=>(orders??[]).reduce<Record<string,number>>((n,o)=>({...n,[o.status]:(n[o.status]??0)+1}),{}),[orders]);
 const overdueCount=(orders??[]).filter(o=>overdueDays(o)!==null).length;
 const shown=(orders??[]).filter(o=>(!status||o.status===status)&&(!overdueOnly||overdueDays(o)!==null));

 // 黑名單 is matched by phone as it is typed in; 收全款 keeps 訂金 equal to 金額.
 async function checkPhone(phone:string){
  const digits=normalizePhone(phone);
  if(digits.length<6){setWarning(null);return}
  try{setWarning(await call<StoreBlacklistEntry|null>("/blacklist/check?phone="+digits))}catch{setWarning(null)}
 }
 const fullPayment=warning?.action==="FULL_PAYMENT",refused=warning?.action==="REFUSE";
 const total=form?formTotal(form):0;
 useEffect(()=>{if(form&&fullPayment&&form.deposit!==String(total))setForm(f=>f?{...f,deposit:String(total)}:f)},[fullPayment,total]); // eslint-disable-line react-hooks/exhaustive-deps

 function openNew(){setWarning(null);setForm({orderDate:today(),customerName:"",phone:"",lineName:"",deposit:"0",note:"",lines:[emptyLine()]})}
 function openEdit(o:StoreOrder){
  setForm({id:o.id,version:o.version,orderDate:o.orderDate,customerName:o.customerName,phone:o.phone,lineName:o.lineName,deposit:String(o.deposit),note:o.note,
   lines:o.lines.map(l=>({key:++lineKey,itemCode:l.itemCode,itemName:l.itemName,quantity:String(l.quantity),unitPrice:String(l.unitPrice)}))});
  void checkPhone(o.phone);
 }
 const setLine=(key:number,patch:Partial<LineForm>)=>setForm(f=>f?{...f,lines:f.lines.map(l=>l.key===key?{...l,...patch}:l)}:f);
 async function lookupItem(line:LineForm){
  if(!line.itemCode.trim()||line.itemName.trim())return;
  try{const item=await call<{item_name:string}|null>("/item?itemCode="+encodeURIComponent(line.itemCode.trim()));if(item?.item_name)setLine(line.key,{itemName:item.item_name})}catch{/* the 品名 is typed by hand */}
 }
 async function saveOrder(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!form)return;
  if(refused){setError("此電話在黑名單：拒絕訂購");return}
  const lines=formLines(form);
  if(!lines.length){setError("至少需要一個訂購品項");return}
  const payload={orderDate:form.orderDate,customerName:form.customerName,phone:form.phone,lineName:form.lineName,deposit:Number(form.deposit)||0,note:form.note,
   lines:lines.map(l=>({itemCode:l.itemCode,itemName:l.itemName,quantity:Number(l.quantity),unitPrice:Number(l.unitPrice)||0})),
   ...(form.id?{expectedVersion:form.version}:{})};
  setBusy(true);
  try{await call<StoreOrder>(form.id?"/orders/"+form.id:"/orders",form.id?"PATCH":"POST",payload);setForm(null);setMessage(form.id?"訂購已更新":"已新增訂購");await load()}
  catch(err){setError(errorOf(err))}finally{setBusy(false)}
 }
 async function changeStatus(o:StoreOrder,next:StoreOrderStatus){
  if(next===o.status)return;
  if(next==="CANCELLED"){setCancelling({order:o,reason:"",toBlacklist:false,action:"REFUSE"});return}
  setBusy(true);
  try{await call<StoreOrder>("/orders/"+o.id+"/status","POST",{expectedVersion:o.version,status:next});await load()}
  catch(e){setError(errorOf(e));await load()}finally{setBusy(false)}
 }
 async function saveCancel(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!cancelling)return;
  setBusy(true);
  try{await call<StoreOrder>("/orders/"+cancelling.order.id+"/status","POST",{expectedVersion:cancelling.order.version,status:"CANCELLED",reason:cancelling.reason,
    ...(cancelling.toBlacklist?{blacklistAction:cancelling.action}:{})});
   setMessage(cancelling.toBlacklist?"已取消並加入黑名單":"已取消");setCancelling(null);await load()}
  catch(err){setError(errorOf(err))}finally{setBusy(false)}
 }
 async function saveBlacklist(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!blacklistForm)return;
  setBusy(true);
  try{await call(blacklistForm.id?"/blacklist/"+blacklistForm.id:"/blacklist",blacklistForm.id?"PATCH":"POST",blacklistForm);setBlacklistForm(null);setMessage("黑名單已儲存");await load()}
  catch(err){setError(errorOf(err))}finally{setBusy(false)}
 }
 async function removeBlacklist(b:StoreBlacklistEntry){
  if(!await confirm({title:"移出黑名單",description:"確定將「"+b.name+"（"+phoneText(b.phone)+"）」移出黑名單？",confirmLabel:"移出",confirmTone:"danger"}))return;
  try{await call("/blacklist/"+b.id,"DELETE");setMessage("已移出黑名單");await load()}catch(e){setError(errorOf(e))}
 }

 const statusOptions=STORE_ORDER_STATUSES.map(code=>({code,label:STORE_ORDER_STATUS_LABELS[code],tone:TONE[code]}));
 return <div className="cy-store-orders">
  <FeedbackBanner message={message} tone={tone}/>
  <div className="cy-store-toolbar">
   <div className="cy-store-views" role="group" aria-label="顧客訂購">
    <button type="button" aria-pressed={view==="orders"} onClick={()=>setView("orders")}>訂購清單</button>
    <button type="button" aria-pressed={view==="blacklist"} onClick={()=>setView("blacklist")}>黑名單 <span className="cy-store-count">{blacklist.length}</span></button>
   </div>
   {view==="orders"?<>
    <form role="search" className="cy-store-search" onSubmit={e=>e.preventDefault()}>
     <input className="cy-op-input" type="search" aria-label="搜尋訂購" placeholder="搜尋姓名、電話、LINE、品號、品名" value={search} onChange={e=>setSearch(e.target.value)}/>
    </form>
    <button type="button" className="cy-op-button primary" onClick={openNew}>＋ 新增訂購</button>
   </>:<button type="button" className="cy-op-button primary" onClick={()=>setBlacklistForm({name:"",phone:"",reason:"",action:"REFUSE"})}>＋ 新增黑名單</button>}
  </div>
  {view==="orders"?<>
   <div className="cy-store-filters">
    <StatusFilter label="處理狀態" options={statusOptions} counts={orders?counts:null} value={status} onChange={v=>{setStatus(v);setOverdueOnly(false)}}/>
    {overdueCount?<button type="button" className="cy-store-overdue-filter" aria-pressed={overdueOnly} onClick={()=>{setOverdueOnly(v=>!v);setStatus("")}}>
     通知逾 {STORE_PICKUP_OVERDUE_DAYS} 天未取 <strong>{overdueCount}</strong></button>:null}
   </div>
   {orders===null?<Loading/>:!shown.length?<p className="cy-op-empty">{orders.length?"沒有符合條件的訂購。":"還沒有顧客訂購，按「＋ 新增訂購」開始。"}</p>:
   <div className="cy-op-table-wrap"><table className="cy-op-table cy-store-table cy-store-cards">
    <thead><tr><th>訂購日期</th><th>姓名</th><th>電話</th><th>LINE</th><th>訂購品項</th><th className="cy-num">金額</th><th className="cy-num">訂金</th><th>處理狀態</th><th aria-label="操作"/></tr></thead>
    <tbody>{shown.map(o=>{const late=overdueDays(o);return <tr key={o.id} data-overdue={late!==null||undefined} data-status={o.status}>
     <td className="cy-nowrap" data-label="訂購日期">{o.orderDate.replaceAll("-","/")}</td>
     <td className="cy-store-name" data-label="姓名"><strong>{o.customerName}</strong></td>
     <td className="cy-nowrap" data-label="電話">{phoneText(o.phone)}</td>
     <td data-label="LINE">{o.lineName||"—"}</td>
     <td className="cy-store-items-cell" data-label="訂購品項"><ul className="cy-store-items">{o.lines.map(l=><li key={l.id}>{l.itemCode?<span className="cy-mono">{l.itemCode}</span>:null}{l.itemName}<span className="cy-store-qty">×{l.quantity}　@{money(l.unitPrice)}</span></li>)}</ul></td>
     <td className="cy-num" data-label="金額">{money(o.total)}</td>
     <td className="cy-num" data-label="訂金">{money(o.deposit)}{o.deposit>=o.total&&o.total>0?<small className="cy-store-paid">已付清</small>:null}</td>
     <td className="cy-store-status" data-label="處理狀態">
      <select className="cy-op-input" aria-label={"處理狀態 "+o.customerName} value={o.status} disabled={busy||o.status==="CANCELLED"} onChange={e=>void changeStatus(o,e.target.value as StoreOrderStatus)}>
       {STORE_ORDER_STATUSES.map(s=><option key={s} value={s}>{STORE_ORDER_STATUS_LABELS[s]}</option>)}
      </select>
      {late!==null?<span className="cy-store-late">已通知 {late} 天仍未取</span>:null}
      {o.status==="CANCELLED"&&o.cancelReason?<span className="cy-store-reason">理由：{o.cancelReason}</span>:null}
     </td>
     <td className="cy-store-actions">{o.status!=="PICKED_UP"&&o.status!=="CANCELLED"?<button type="button" className="cy-op-button compact" onClick={()=>openEdit(o)}>修改</button>:<StatusChip tone={TONE[o.status]}>{STORE_ORDER_STATUS_LABELS[o.status]}</StatusChip>}</td>
    </tr>})}</tbody></table></div>}
  </>:<>
   {!blacklist.length?<p className="cy-op-empty">黑名單是空的。</p>:
   <div className="cy-op-table-wrap"><table className="cy-op-table cy-store-table">
    <thead><tr><th>姓名</th><th>電話</th><th>理由</th><th>處置</th><th aria-label="操作"/></tr></thead>
    <tbody>{blacklist.map(b=><tr key={b.id}>
     <td><strong>{b.name}</strong></td><td className="cy-nowrap">{phoneText(b.phone)}</td><td className="cy-store-reason-cell">{b.reason}</td>
     <td><StatusChip tone={b.action==="REFUSE"?"danger":"warning"}>{STORE_BLACKLIST_ACTION_LABELS[b.action]}</StatusChip></td>
     <td className="cy-nowrap"><button type="button" className="cy-op-button compact" onClick={()=>setBlacklistForm({id:b.id,name:b.name,phone:b.phone,reason:b.reason,action:b.action})}>修改</button>
      <button type="button" className="cy-op-button compact danger" onClick={()=>void removeBlacklist(b)}>移出</button></td>
    </tr>)}</tbody></table></div>}
  </>}

  {form?<Dialog open title={form.id?"修改訂購":"新增訂購"} onClose={()=>setForm(null)} size="large" presentation={compact?"sheet":"modal"}>
   <form onKeyDown={enterAdvancesFields} onSubmit={e=>void saveOrder(e)}>
    {warning?<p className={"cy-notice "+(refused?"cy-notice-danger":"cy-notice-warning")} role="alert">
     黑名單：{warning.name}（{phoneText(warning.phone)}）— {STORE_BLACKLIST_ACTION_LABELS[warning.action]}。理由：{warning.reason}
     {fullPayment?"　訂金已設為全額。":refused?"　不能建立訂購。":""}</p>:null}
    <FormSection title="顧客">
     <Field label="訂購日期" size="s" required><input type="date" className="cy-op-input" max="9999-12-31" value={form.orderDate} onChange={e=>setForm(f=>f?{...f,orderDate:e.target.value}:f)}/></Field>
     <Field label="姓名" size="m" required><input className="cy-op-input" maxLength={40} value={form.customerName} onChange={e=>setForm(f=>f?{...f,customerName:e.target.value}:f)}/></Field>
     <Field label="電話" size="s" required><input className="cy-op-input" inputMode="tel" maxLength={30} value={form.phone} onChange={e=>setForm(f=>f?{...f,phone:e.target.value}:f)} onBlur={e=>void checkPhone(e.target.value)}/></Field>
     <Field label="LINE 名稱" size="m"><input className="cy-op-input" maxLength={60} value={form.lineName} onChange={e=>setForm(f=>f?{...f,lineName:e.target.value}:f)}/></Field>
    </FormSection>
    <FormSection title="訂購品項">
     <div className="cy-store-lines">
      <table className="cy-op-table">
       <thead><tr><th>品號</th><th>品名</th><th className="cy-num">數量</th><th className="cy-num">單價</th><th className="cy-num">金額</th><th aria-label="操作"/></tr></thead>
       <tbody>{form.lines.map((l,i)=><tr key={l.key}>
        <td><input className="cy-op-input" aria-label={"品號 第"+(i+1)+"列"} maxLength={40} value={l.itemCode} onChange={e=>setLine(l.key,{itemCode:e.target.value})} onBlur={()=>void lookupItem(l)}/></td>
        <td><input className="cy-op-input" aria-label={"品名 第"+(i+1)+"列"} maxLength={200} required={i===0||!!(l.itemCode||l.unitPrice)} value={l.itemName} onChange={e=>setLine(l.key,{itemName:e.target.value})}/></td>
        <td><input className="cy-op-input cy-num" aria-label={"數量 第"+(i+1)+"列"} type="number" min="0.01" step="any" required={!!l.itemName} value={l.quantity} onChange={e=>setLine(l.key,{quantity:e.target.value})}/></td>
        <td><input className="cy-op-input cy-num" aria-label={"單價 第"+(i+1)+"列"} type="number" min="0" step="1" required={!!l.itemName} value={l.unitPrice} onChange={e=>setLine(l.key,{unitPrice:e.target.value})}/></td>
        <td className="cy-num">{money(lineAmount({quantity:Number(l.quantity)||0,unitPrice:Number(l.unitPrice)||0}))}</td>
        <td>{form.lines.length>1?<button type="button" className="cy-op-button compact quiet" aria-label={"刪除第"+(i+1)+"列"} onClick={()=>setForm(f=>f?{...f,lines:f.lines.filter(x=>x.key!==l.key)}:f)}>刪除</button>:null}</td>
       </tr>)}</tbody>
      </table>
      <button type="button" className="cy-op-button compact cy-store-add-line" onClick={()=>setForm(f=>f?{...f,lines:[...f.lines,emptyLine()]}:f)}>＋ 加一個品項</button>
     </div>
    </FormSection>
    <FormSection title="金額">
     <Field label="金額合計" size="s"><input className="cy-op-input cy-num" readOnly tabIndex={-1} value={money(total)}/></Field>
     <Field label="訂金" size="s" required hint={fullPayment?"黑名單：需收全款":undefined}><input className="cy-op-input cy-num" type="number" min="0" step="1" readOnly={fullPayment} value={form.deposit} onChange={e=>setForm(f=>f?{...f,deposit:e.target.value}:f)}/></Field>
     <Field label="尚欠" size="s"><input className="cy-op-input cy-num" readOnly tabIndex={-1} value={money(Math.max(0,total-(Number(form.deposit)||0)))}/></Field>
     <Field label="備註" size="l"><textarea className="cy-op-input" rows={2} maxLength={300} value={form.note} onChange={e=>setForm(f=>f?{...f,note:e.target.value}:f)}/></Field>
    </FormSection>
    <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={()=>setForm(null)}>取消</button>
     <button type="submit" className="cy-op-button primary" disabled={busy||refused}>儲存</button></div>
   </form>
  </Dialog>:null}

  {cancelling?<Dialog open title="取消訂購" onClose={()=>setCancelling(null)}>
   <form onKeyDown={enterAdvancesThenSubmits} onSubmit={e=>void saveCancel(e)}>
    <p>{cancelling.order.customerName}（{phoneText(cancelling.order.phone)}）的訂購將標為取消。</p>
    <FormSection>
     <Field label="取消理由" size="l" required><textarea className="cy-op-input" rows={3} maxLength={300} value={cancelling.reason} onChange={e=>setCancelling(c=>c?{...c,reason:e.target.value}:c)}/></Field>
     <CheckField label="同時加入黑名單（理由同上）" size="m" checked={cancelling.toBlacklist} onChange={e=>setCancelling(c=>c?{...c,toBlacklist:e.target.checked}:c)}/>
     {cancelling.toBlacklist?<Field label="黑名單處置" size="s" required><select className="cy-op-input" value={cancelling.action} onChange={e=>setCancelling(c=>c?{...c,action:e.target.value as StoreBlacklistAction}:c)}>
      {(Object.keys(STORE_BLACKLIST_ACTION_LABELS) as StoreBlacklistAction[]).map(a=><option key={a} value={a}>{STORE_BLACKLIST_ACTION_LABELS[a]}</option>)}</select></Field>:null}
    </FormSection>
    <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={()=>setCancelling(null)}>返回</button>
     <button type="submit" className="cy-op-button danger" disabled={busy}>確認取消</button></div>
   </form>
  </Dialog>:null}

  {blacklistForm?<Dialog open title={blacklistForm.id?"修改黑名單":"新增黑名單"} onClose={()=>setBlacklistForm(null)}>
   <form onKeyDown={enterAdvancesFields} onSubmit={e=>void saveBlacklist(e)}>
    <FormSection>
     <Field label="姓名" size="m" required><input className="cy-op-input" maxLength={40} value={blacklistForm.name} onChange={e=>setBlacklistForm(b=>b?{...b,name:e.target.value}:b)}/></Field>
     <Field label="電話" size="s" required><input className="cy-op-input" inputMode="tel" maxLength={30} value={blacklistForm.phone} onChange={e=>setBlacklistForm(b=>b?{...b,phone:e.target.value}:b)}/></Field>
     <Field label="處置" size="s" required><select className="cy-op-input" value={blacklistForm.action} onChange={e=>setBlacklistForm(b=>b?{...b,action:e.target.value as StoreBlacklistAction}:b)}>
      {(Object.keys(STORE_BLACKLIST_ACTION_LABELS) as StoreBlacklistAction[]).map(a=><option key={a} value={a}>{STORE_BLACKLIST_ACTION_LABELS[a]}</option>)}</select></Field>
     <Field label="理由" size="l" required><textarea className="cy-op-input" rows={3} maxLength={300} value={blacklistForm.reason} onChange={e=>setBlacklistForm(b=>b?{...b,reason:e.target.value}:b)}/></Field>
    </FormSection>
    <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={()=>setBlacklistForm(null)}>取消</button>
     <button type="submit" className="cy-op-button primary" disabled={busy}>儲存</button></div>
   </form>
  </Dialog>:null}
  {confirmationDialog}
 </div>;
}
