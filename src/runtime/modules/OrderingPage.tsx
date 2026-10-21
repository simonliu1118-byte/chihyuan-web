import {useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import {apiRequest,ApiClientError} from "../../api/client";
import {MasterDetailBack,MasterDetailEmpty,useMasterDetailPane} from "../../ui/layout/MasterDetail";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {Dialog} from "../../ui/overlays/Dialog";
import {FeedbackBanner,useFeedbackMessage} from "../../ui/feedback/FeedbackProvider";
import {enterAdvancesFields} from "../../ui/foundation/enter-advance";
import {OrderingGrid,type GridLine} from "../../ui/OrderingGrid";
import {orderSheet} from "../../../shared/ordering-export";
import "./erp-item-query.css";
import {buildXlsx} from "../../../shared/xlsx-writer";
import {createOrderingWriteQueue,orderingTaipeiDateTime,exportFileName,pickDraft,lineState,LINE_STATE_LABELS,CLOSED_AS_LABELS,ORDERING_STATUS_LABELS,CN_REGULAR_SECTIONS,type OrderingOrder,type OrderingSource,type OrderingPendingLine,type OrderingListRow,type OrderingSection} from "../../../shared/ordering";
const ROOT="/api/business/ordering";
const nowDate=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const displayDate=(value:string|null|undefined)=>orderingTaipeiDateTime(value)?.date??"";
const displayTime=(value:string|null|undefined)=>{const p=orderingTaipeiDateTime(value);return p?p.date+" "+p.time:""};
const errorOf=(e:unknown)=>e instanceof ApiClientError&&e.code==="ORDERING_VERSION_CONFLICT"?"已被其他人修改，請重新載入":e instanceof Error?e.message:"叫貨操作失敗";
type DisplayOrder=OrderingOrder&{storedStatus:"DRAFT"|"SENT"|"VOID"};
type DisplayLine=GridLine&{quantity:number|null;received:number;state:string;closedAs:string|null};
type VendorGroup={sourceId:number;sourceName:string;conditions:string;orderId:number|null;orderVersion:number|null;lines:(GridLine&{quantity:number|null})[]};
const call=<T,>(path:string,method="GET",json?:unknown)=>apiRequest<T>(ROOT+path,{method,json});
export function OrderingPage(){
 const [sources,setSources]=useState<OrderingSource[]>([]),[list,setList]=useState<OrderingListRow[]>([]),[pending,setPending]=useState<OrderingPendingLine[]>([]);
 const [tab,setTab]=useState<number|null>(null),[vendorAll,setVendorAll]=useState(false),[selected,setSelected]=useState<DisplayOrder|null>(null);
 const [search,setSearch]=useState(""),[status,setStatus]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage,reportError,messageTone]=useFeedbackMessage<string|null>(null);
 const setError=(value:string)=>{if(value)reportError(value);else setMessage(null)};
 const setNotice=(value:string)=>setMessage(value);
 const queueRef=useRef(createOrderingWriteQueue());
 const cached=useRef(new Map<number,DisplayOrder>());
 const savedHeader=useRef(new Map<number,{date:string|null;note:string}>());
 const [headerDirty,setHeaderDirty]=useState({date:false,note:false});
 const headerDirtyRef=useRef({date:false,note:false});
 const [sourceForm,setSourceForm]=useState<{id?:number;kind:"GENERAL"|"VENDOR";name:string;conditions:string;sortOrder?:number;isActive?:boolean}|null>(null);
 const [sourceFilter,setSourceFilter]=useState("");
 const [manageSources,setManageSources]=useState(false);
 const [receipt,setReceipt]=useState<{id:number;no:string;date:string;quantities:Record<number,string>;selectedLineIds:number[]}|null>(null);
 const [closing,setClosing]=useState<{id:number;kind:"SHORTAGE"|"CANCELLED"|"OTHER";reason:string}|null>(null);
 const [viewPending,setViewPending]=useState(false),[showHistory,setShowHistory]=useState(false),[drafts,setDrafts]=useState<OrderingListRow[]>([]);
 const [vendorOverview,setVendorOverview]=useState<VendorGroup[]>([]);
 const vendorOrderIds=useRef(new Map<number,number>());
 const pane=useMasterDetailPane(),{confirm,confirmationDialog}=useConfirmation();
 const source=sources.find(x=>x.id===tab);
 const active=sources.filter(x=>x.isActive),vendors=active.filter(x=>x.kind==="VENDOR");
 async function refresh(){const [a,b,c]=await Promise.all([call<OrderingSource[]>("/sources"),call<OrderingListRow[]>("/orders"),call<OrderingPendingLine[]>("/pending")]);setSources(a);setList(b);setPending(c);setTab(t=>t??a.find(x=>x.isActive&&x.kind==="GENERAL")?.id??null)}
 useEffect(()=>{void refresh().catch(e=>setError(errorOf(e)))},[]);
 const remember=(x:DisplayOrder)=>{
   cached.current.set(x.id,x);savedHeader.current.set(x.id,{date:x.plannedSendDate,note:x.note});return x;
 };
 const enqueue=<T,>(key:string,job:()=>Promise<T>):Promise<T>=>queueRef.current.enqueue(key,job);
 async function reloadOrder(id:number){const x=remember(await call<DisplayOrder>("/orders/"+id));setSelected(x);setHeaderDirty({date:false,note:false});headerDirtyRef.current={date:false,note:false};return x}
 async function openDraft(sourceId:number){
  setBusy(true);setError("");try{
   const all=await call<OrderingListRow[]>("/orders?sourceId="+sourceId+"&status=DRAFT");setDrafts(all);
   const chosen=pickDraft(all.map(x=>({id:x.id,plannedSendDate:x.plannedSendDate,createdAt:x.createdAt})),nowDate());
   const x=chosen?await reloadOrder(chosen.id):await call<DisplayOrder>("/orders","POST",{sourceId});
   if(!chosen){setSelected(remember(x));setHeaderDirty({date:false,note:false});headerDirtyRef.current={date:false,note:false};setDrafts(all)}setViewPending(false);pane.open();await refresh();
  }catch(e){setError(errorOf(e))}finally{setBusy(false)}
 }
 async function selectSource(s:OrderingSource){setTab(s.id);setVendorAll(false);setSelected(null);await openDraft(s.id)}
 async function createDraft(sourceId:number){
  try{const x=remember(await call<DisplayOrder>("/orders","POST",{sourceId}));
   setDrafts(await call<OrderingListRow[]>("/orders?sourceId="+sourceId+"&status=DRAFT"));
   setSelected(x);setHeaderDirty({date:false,note:false});headerDirtyRef.current={date:false,note:false};setViewPending(false);pane.open();void refresh().catch(e=>setError(errorOf(e)));
  }catch(e){setError(errorOf(e))}
 }
 async function showVendorOverview(){setVendorAll(true);setSelected(null);setViewPending(false);
  try{const groups=await call<VendorGroup[]>("/vendors/overview");
    groups.forEach(x=>{if(x.orderId)vendorOrderIds.current.set(x.sourceId,x.orderId)});
    setVendorOverview(groups);
   }catch(e){setError(errorOf(e))}
 }
 async function write(path:string,method:string,input:Record<string,unknown>,refreshId=selected?.id){
  const id=Number(/^\/orders\/(\d+)/.exec(path)?.[1]??refreshId);
  if(!Number.isSafeInteger(id))throw new Error("請先選擇單據");
  return enqueue("order:"+id,async()=>{
   const version=cached.current.get(id)?.version??selected?.version;
   try{
    const data=remember(await call<DisplayOrder>(path,method,{...input,expectedVersion:version}));
    setSelected(previous=>previous?.id===id?
     {...data,plannedSendDate:headerDirtyRef.current.date?previous.plannedSendDate:data.plannedSendDate,note:headerDirtyRef.current.note?previous.note:data.note}:previous);
    // A row commit never disables any editor or steals focus while the network is pending.
    setNotice("已儲存");
    if(path.endsWith("/send")||path.endsWith("/void")){
     void call<OrderingListRow[]>("/orders?sourceId="+data.sourceId+"&status=DRAFT").then(setDrafts).catch(e=>setError(errorOf(e)));
    }
    void refresh().catch(e=>setError(errorOf(e)));
    return data;
   }catch(e){setError(errorOf(e));throw e}
  });
 }
 async function saveHeader(field:"date"|"note"){
  const current=selected;if(!current)return;
  const value=field==="date"?current.plannedSendDate:current.note;
  const saved=savedHeader.current.get(current.id);
  if(value===(field==="date"?saved?.date:saved?.note)){setHeaderDirty(prev=>({...prev,[field]:false}));headerDirtyRef.current={...headerDirtyRef.current,[field]:false};return}
  try{
   await write("/orders/"+current.id,"PATCH",field==="date"?{plannedSendDate:value}:{note:value});
   setHeaderDirty(prev=>({...prev,[field]:false}));headerDirtyRef.current={...headerDirtyRef.current,[field]:false};
  }catch{/* Banner and modal explain the error; leave the typed value intact. */}
 }
 async function lineCommit(row:GridLine,patch:Partial<GridLine>){
  if(!selected)return;
  const line={...patch,...(!row.id?{...row,...patch}:{}),...(!row.id?{sortOrder:Date.now()}:{} )};
  await write("/orders/"+selected.id+"/lines","POST",{operation:"save",lineId:row.id||undefined,line});
 }
 async function removeLine(row:GridLine){if(!selected||!await confirm({title:"刪除叫貨品項",description:"確定刪除「"+row.itemName+"」？"}))return;
  await write("/orders/"+selected.id+"/lines","POST",{operation:"delete",lineId:row.id})}
 async function sent(){if(!selected)return;const okay=await confirm({title:"送出叫貨單",description:"來源："+selected.sourceName+"；品項："+selected.lines.length+" 列。確認送出後將記錄實際送出時間與版本 1。",confirmLabel:"確認送出"});if(okay)await write("/orders/"+selected.id+"/send","POST",{})}
 async function voidOrder(){if(!selected)return;if(await confirm({title:"作廢叫貨單",description:"確定作廢？歷史紀錄會保留。",confirmTone:"danger",confirmLabel:"作廢"}))await write("/orders/"+selected.id+"/void","POST",{})}
 async function saveSource(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!sourceForm)return;setBusy(true);try{
   if(sourceForm.id){const original=sources.find(x=>x.id===sourceForm.id);
    await call("/sources/"+sourceForm.id,"PATCH",{name:sourceForm.name,conditions:sourceForm.conditions,sortOrder:sourceForm.sortOrder??original?.sortOrder??0,isActive:sourceForm.isActive??original?.isActive??true});
   }
   else await call("/sources","POST",{name:sourceForm.name,kind:sourceForm.kind,conditions:sourceForm.conditions});
   setSourceForm(null);await refresh();if(vendorAll)void showVendorOverview();
  }catch(err){setError(errorOf(err))}finally{setBusy(false)}}
 async function receive(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!receipt||!selected)return;
  const lines=Object.entries(receipt.quantities).filter(([lineId,q])=>receipt.selectedLineIds.includes(Number(lineId))&&Number(q)>0).map(([lineId,q])=>({lineId:Number(lineId),quantity:Number(q)}));
  if(!lines.length){setError("請至少勾選一列並填到貨數量");return}
  const fullNo="341A-"+receipt.no;
  if(selected.receipts.some(x=>x.erpPurchaseNo===fullNo)&&
    !await confirm({title:"進貨單號重複",description:"本張叫貨單已有「"+fullNo+"」的到貨紀錄。可以繼續登記，但請先確認沒有重複計算。",confirmLabel:"繼續登記"}))return;
  const value=await write("/orders/"+receipt.id+"/receipts","POST",{erpPurchaseNo:receipt.no,receivedDate:receipt.date,lines});if(value)setReceipt(null);
 }
 async function closeRemaining(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!selected||!closing)return;
  const value=await write("/orders/"+selected.id+"/close","POST",{lineId:closing.id,closedAs:closing.kind,reason:closing.reason});if(value)setClosing(null)}
 async function exportOrder(order:DisplayOrder){
  const fallback=order.plannedSendDate??order.sentAt?.slice(0,10)??nowDate();
  const bytes=buildXlsx([orderSheet({sourceName:order.sourceName,sourceKind:order.sourceKind,date:fallback,note:order.note,lines:order.lines})]);
  const blob=new Blob([new Uint8Array(bytes) as BlobPart],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=exportFileName(order.sourceName,fallback);a.click();URL.revokeObjectURL(url);
 }
 async function commitVendorRow(group:VendorGroup,row:GridLine,patch:Partial<GridLine>){
  return enqueue("vendor:"+group.sourceId,async()=>{
   try{
    const chosen=vendorOrderIds.current.get(group.sourceId)??group.orderId;
    const current=chosen?await call<DisplayOrder>("/orders/"+chosen):await call<DisplayOrder>("/orders","POST",{sourceId:group.sourceId});
    vendorOrderIds.current.set(group.sourceId,current.id);
    const data=await call<DisplayOrder>("/orders/"+current.id+"/lines","POST",{operation:"save",expectedVersion:current.version,lineId:row.id>0?row.id:undefined,
      line:{...(!row.id?row:{}),...patch,...(row.id<=0?{sortOrder:Date.now()}:{})}});
    const groups=await call<VendorGroup[]>("/vendors/overview");
    setVendorOverview(groups);void refresh().catch(e=>setError(errorOf(e)));
    setNotice("已儲存 "+group.sourceName+" 草稿");
    return data;
   }catch(e){setError(errorOf(e));throw e}
  });
 }
 async function deleteVendorRow(group:VendorGroup,row:GridLine){
  if(!group.orderId||!await confirm({title:"刪除廠商草稿品項",description:"確定刪除「"+row.itemName+"」？"}))return;
  return enqueue("vendor:"+group.sourceId,async()=>{
   try{
    const current=await call<DisplayOrder>("/orders/"+(vendorOrderIds.current.get(group.sourceId)??group.orderId));
    await call("/orders/"+current.id+"/lines","POST",{expectedVersion:current.version,operation:"delete",lineId:row.id});
    setVendorOverview(await call<VendorGroup[]>("/vendors/overview"));
    void refresh().catch(e=>setError(errorOf(e)));
   }catch(e){setError(errorOf(e));throw e}
  });
 }
 async function exportVendors(){
  const view=await call<VendorGroup[]>("/vendors/overview");
  const sheets=view.filter(v=>v.lines.length).map(v=>orderSheet({sourceName:v.sourceName,sourceKind:"VENDOR",date:nowDate(),note:"",lines:v.lines}));
  if(!sheets.length){setError("目前沒有廠商品項");return}
  const bytes=buildXlsx(sheets),blob=new Blob([new Uint8Array(bytes) as BlobPart],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const href=URL.createObjectURL(blob),a=document.createElement("a");a.href=href;a.download=exportFileName("廠商",nowDate());a.click();URL.revokeObjectURL(href);
 }
 const current=selected,editable=current?.storedStatus!=="VOID";
 const [expandedVendors,setExpandedVendors]=useState<number[]>([]);
 const expanded=(v:VendorGroup)=>v.lines.length>0||expandedVendors.includes(v.sourceId);
 const visibleSources=active.filter(x=>x.kind!=="VENDOR");
 return <section className="cy-ordering-page">
  <FeedbackBanner message={message} tone={messageTone}/>
  {messageTone==="danger"&&message?<button type="button" className="cy-op-button" onClick={()=>{setMessage(null);if(selected)void reloadOrder(selected.id);void refresh()}}>重新載入</button>:null}
  <div className="cy-md" data-pane={pane.pane}>
   <section className="cy-op-panel cy-md-list" aria-label="叫貨紀錄">
    <h3>叫貨紀錄</h3>
    <button type="button" className="cy-op-button primary" onClick={()=>{setViewPending(true);pane.open()}}>未到貨（{pending.length}）</button>
    <form role="search" onSubmit={e=>{e.preventDefault();void call<OrderingListRow[]>("/orders?"+new URLSearchParams({...(search?{q:search}:{}),...(status?{status}:{}),...(sourceFilter?{sourceId:sourceFilter}:{}),...(from?{from}:{}),...(to?{to}:{})})).then(setList).catch(e=>setError(errorOf(e)))}}>
     <input className="cy-op-input" type="search" aria-label="搜尋品號品名或進貨單號" placeholder="搜尋品號、品名、進貨單號" value={search} onChange={e=>setSearch(e.target.value)}/>
     <select className="cy-op-input" aria-label="狀態" value={status} onChange={e=>setStatus(e.target.value)}><option value="">全部狀態</option>{["DRAFT","SENT","PARTIAL","CLOSED","VOID"].map(x=><option key={x} value={x}>{ORDERING_STATUS_LABELS[x as keyof typeof ORDERING_STATUS_LABELS]}</option>)}</select>
     <select className="cy-op-input" aria-label="來源篩選" value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}><option value="">全部來源</option>{sources.map(s=><option key={s.id} value={s.id}>{s.name}{s.isActive?"":"（停用）"}</option>)}</select>
     <label>起日<input type="date" className="cy-op-input" max="9999-12-31" value={from} onChange={e=>setFrom(e.target.value)}/></label>
     <label>迄日<input type="date" className="cy-op-input" max="9999-12-31" value={to} onChange={e=>setTo(e.target.value)}/></label>
     <button type="submit" className="cy-op-button">搜尋</button>
    </form>
    <div className="cy-md-count">共 {list.length} 筆</div>
     <div className="cy-op-list cy-ordering-result-list">
      {list.map(o=><button type="button" key={o.id} className={"cy-op-list-row cy-ordering-result-row "+(current?.id===o.id?"active":"")}
       aria-current={current?.id===o.id?"true":undefined}
       onClick={()=>{setViewPending(false);pane.open();void reloadOrder(o.id).catch(e=>setError(errorOf(e)))}}>
       <span className="cy-ordering-list-primary"><strong>{o.sourceName}</strong><small>{displayDate(o.plannedSendDate??o.sentAt??o.createdAt)}</small></span>
       <span className={"cy-status-chip cy-status-chip-"+({DRAFT:"neutral",SENT:"info",PARTIAL:"warning",CLOSED:"success",VOID:"danger"}[o.status]??"neutral")}>{ORDERING_STATUS_LABELS[o.status]??o.status}</span>
      </button>)}
      {!list.length?<div className="cy-op-empty">沒有符合條件的叫貨單。</div>:null}
     </div>
   </section>
   <section className="cy-op-panel cy-md-detail">
    <MasterDetailBack label="叫貨紀錄" onBack={pane.close} disabled={busy}/>
    <div className="cy-ordering-tabbar">
      <div className="cy-op-tabs" role="tablist" aria-label="叫貨來源">
       {visibleSources.map(s=><button key={s.id} type="button" role="tab"
         className={tab===s.id&&!vendorAll?"active":""} aria-selected={tab===s.id&&!vendorAll}
         onClick={()=>void selectSource(s)}>{s.name}</button>)}
       <button type="button" role="tab" className={vendorAll?"active":""} aria-selected={vendorAll} onClick={()=>void showVendorOverview()}>廠商</button>
      </div>
      <button type="button" className="cy-op-button quiet" onClick={()=>setManageSources(true)}>管理來源</button>
      <button type="button" className="cy-op-button" onClick={()=>setSourceForm({kind:"GENERAL",name:"",conditions:""})}>＋</button>
    </div>
    {viewPending?<><h3>未到貨明細（{pending.length}）</h3>{pending.map(l=><p key={l.lineId}>{l.sourceName}　{displayDate(l.orderDate)}　{l.itemName}　叫貨 {l.quantity}{l.unit}　已到 {l.received}　剩餘 {l.remaining} <button className="cy-op-button" type="button" onClick={()=>void reloadOrder(l.orderId).then(()=>setReceipt({id:l.orderId,no:"",date:nowDate(),quantities:{[l.lineId]:String(l.remaining)},selectedLineIds:[l.lineId]}))}>登記到貨</button><button type="button" className="cy-op-button" onClick={()=>void reloadOrder(l.orderId).then(()=>setClosing({id:l.lineId,kind:"SHORTAGE",reason:""}))}>結掉</button></p>)}</>
    :vendorAll?<><h3>廠商草稿</h3><p>預設依廠商分段；進入個別廠商頁面後才能送出。</p>
      <button type="button" className="cy-op-button" onClick={()=>setSourceForm({kind:"VENDOR",name:"",conditions:""})}>＋ 新增廠商</button>
      <button type="button" className="cy-op-button" onClick={()=>void exportVendors().catch(e=>setError(errorOf(e)))}>匯出廠商合併 Excel</button>
      {vendorOverview.slice().sort((a,b)=>Number(b.lines.length>0)-Number(a.lines.length>0)).map(v=>
        <div key={v.sourceId} className={"cy-ordering-vendor-group "+(v.lines.length?"has-lines":"is-empty")}>
         <div className="cy-ordering-vendor-heading">
          <button type="button" className="cy-op-button quiet" aria-expanded={expanded(v)}
           onClick={()=>setExpandedVendors(ids=>ids.includes(v.sourceId)?ids.filter(id=>id!==v.sourceId):[...ids,v.sourceId])}>
           {expanded(v)?"▾":"▸"} {v.sourceName}（{v.lines.length} 項）
          </button>
          {v.conditions?<strong className="cy-ordering-vendor-condition">{v.conditions}</strong>:null}
          <button type="button" className="cy-op-button quiet compact" onClick={()=>{const s=vendors.find(x=>x.id===v.sourceId);if(s)void selectSource(s)}}>進入廠商</button>
         </div>
         {expanded(v)?<OrderingGrid kind="VENDOR" section="" lines={v.lines} busy={false}
          onCommit={async(row,patch)=>{await commitVendorRow(v,row,patch)}} onDelete={async row=>{await deleteVendorRow(v,row)}}/>:null}
        </div>)}
    </>
    :current?<><div className="cy-page-toolbar"><h3>{current.sourceName}　{ORDERING_STATUS_LABELS[current.status]}</h3>
      <button type="button" className="cy-op-button" onClick={()=>void openDraft(current.sourceId)}>回到草稿</button>
      <select className="cy-op-input" value={current.storedStatus==="DRAFT"?String(current.id):""} aria-label="切換草稿" onChange={e=>{if(e.target.value)void reloadOrder(Number(e.target.value))}}><option value="">選擇草稿</option>{drafts.map(d=><option key={d.id} value={d.id}>{d.plannedSendDate?displayDate(d.plannedSendDate).slice(5):"無預計日"}{current.storedStatus==="DRAFT"&&d.id===current.id?"（目前）":""}</option>)}</select>
      <button type="button" className="cy-op-button" onClick={()=>void createDraft(current.sourceId)}>＋ 新草稿</button>
      <button type="button" className="cy-op-button" onClick={()=>void exportOrder(current)}>匯出 Excel</button></div>
      {sources.find(x=>x.id===current.sourceId)?.kind==="VENDOR"?<p>廠商條件：{sources.find(x=>x.id===current.sourceId)?.conditions} <button type="button" className="cy-op-button" onClick={()=>{const s=sources.find(x=>x.id===current.sourceId);if(s)setSourceForm({id:s.id,kind:"VENDOR",name:s.name,conditions:s.conditions,sortOrder:s.sortOrder,isActive:s.isActive})}}>修改</button></p>:null}
      <form onKeyDown={enterAdvancesFields} onSubmit={e=>e.preventDefault()}>
       <label>預計送出日期<input type="date" className="cy-op-input" max="9999-12-31" disabled={!editable} value={current.plannedSendDate??""} onChange={e=>{headerDirtyRef.current={...headerDirtyRef.current,date:true};setHeaderDirty(v=>({...v,date:true}));setSelected(v=>v?{...v,plannedSendDate:e.target.value||null}:v)}} onBlur={()=>void saveHeader("date")}/></label>
       <label>單據備註<input className="cy-op-input" disabled={!editable} value={current.note} onChange={e=>{headerDirtyRef.current={...headerDirtyRef.current,note:true};setHeaderDirty(v=>({...v,note:true}));setSelected(v=>v?{...v,note:e.target.value}:v)}} onBlur={()=>void saveHeader("note")}/></label>
       <button type="submit" className="cy-op-button" onClick={()=>{if(headerDirty.date)void saveHeader("date");if(headerDirty.note)void saveHeader("note")}}>儲存</button>
      </form>
      {(current.sourceKind==="CN_REGULAR"?CN_REGULAR_SECTIONS:[{key:"" as const,label:"叫貨明細"}]).map(group=><div key={group.key}><h4>{group.label}</h4><OrderingGrid kind={current.sourceKind} section={group.key as OrderingSection} key={current.id+"-"+group.key} lines={current.lines} busy={!editable} onCommit={lineCommit} onDelete={removeLine}/></div>)}
      <div className="cy-page-toolbar">{current.storedStatus==="DRAFT"?<button type="button" className="cy-op-button primary" onClick={()=>void sent()}>送出</button>:null}
      {current.storedStatus==="SENT"?<button type="button" className="cy-op-button" onClick={()=>setReceipt({id:current.id,no:"",date:nowDate(),quantities:Object.fromEntries(current.lines.filter(l=>l.quantity!==null&&l.received<l.quantity&&!l.closedAs).map(l=>[l.id,String((l.quantity??0)-l.received)])),selectedLineIds:[]})}>登記到貨</button>:null}
      {editable?<button type="button" className="cy-op-button" onClick={()=>void voidOrder()}>作廢</button>:null}
      <button type="button" className="cy-op-button" onClick={()=>setShowHistory(v=>!v)}>修改紀錄</button></div>
      {current.storedStatus!=="DRAFT"&&current.lines.map(l=><p key={l.id}>{l.itemName}　叫貨 {l.quantityText}　已到 {l.received}　{l.closedAs?CLOSED_AS_LABELS[l.closedAs as keyof typeof CLOSED_AS_LABELS]:LINE_STATE_LABELS[lineState(l)]}{l.closedAs&&l.closedNote?"（"+l.closedNote+"）":""}
       {current.storedStatus==="SENT"&&l.quantity!==null&&l.received<l.quantity&&!l.closedAs?<button type="button" className="cy-op-button" onClick={()=>setClosing({id:l.id,kind:"SHORTAGE",reason:""})}>結掉剩餘</button>:null}</p>)}
      {showHistory&&current.revisions.map(x=><p key={x.revision}>版本 {x.revision}　{displayTime(x.at)}　{x.by}　{x.summary}</p>)}
      {current.receipts.map(x=><p key={x.id}>到貨：{x.erpPurchaseNo}　{displayDate(x.receivedDate)}</p>)}
    </>:<MasterDetailEmpty title="選擇叫貨來源" hint="從上方頁籤選擇來源，或從左側開啟歷史單。"/>}
   </section>
  </div>
  {manageSources?<Dialog open title="管理叫貨來源" onClose={()=>setManageSources(false)} size="large">
    <div className="cy-ordering-source-management">
    {sources.map(s=><div className="cy-ordering-source-row" key={s.id}>
     <span><strong>{s.name}</strong> <small>{s.kind==="VENDOR"?"廠商":s.kind==="CN_REGULAR"?"定期中國貨":s.kind==="CN_CUSTOM"?"自訂中國貨":"一般"}　{!s.isActive?"已停用":""}</small></span>
     <span className="cy-ordering-vendor-condition">{s.conditions}</span>
     <button type="button" className="cy-op-button quiet" onClick={()=>setSourceForm({id:s.id,kind:s.kind==="VENDOR"?"VENDOR":"GENERAL",name:s.name,conditions:s.conditions,sortOrder:s.sortOrder,isActive:s.isActive})}>修改／排序／停用</button>
    </div>)}
    <button type="button" className="cy-op-button primary" onClick={()=>setSourceForm({kind:"GENERAL",name:"",conditions:""})}>＋ 新增來源</button>
    <button type="button" className="cy-op-button" onClick={()=>setManageSources(false)}>關閉</button>
   </div>
  </Dialog>:null}
  {sourceForm?<Dialog open title={sourceForm.id?"修改叫貨來源":"新增叫貨來源"} onClose={()=>setSourceForm(null)}><form onKeyDown={enterAdvancesFields} onSubmit={e=>void saveSource(e)}><label>名稱<input className="cy-op-input" required maxLength={40} value={sourceForm.name} onChange={e=>setSourceForm(s=>s?{...s,name:e.target.value}:s)}/></label>
   <label>條件<input className="cy-op-input" maxLength={500} value={sourceForm.conditions} onChange={e=>setSourceForm(s=>s?{...s,conditions:e.target.value}:s)}/></label>
   {sourceForm.id?<><label>排序<input type="number" className="cy-op-input" value={sourceForm.sortOrder??0} onChange={e=>setSourceForm(s=>s?{...s,sortOrder:Number(e.target.value)}:s)}/></label>
   <label><input type="checkbox" checked={sourceForm.isActive??true} onChange={e=>setSourceForm(s=>s?{...s,isActive:e.target.checked}:s)}/>啟用（停用保留歷史單）</label></>:null}
   <button type="submit" className="cy-op-button primary">儲存</button><button type="button" className="cy-op-button" onClick={()=>setSourceForm(null)}>取消</button></form></Dialog>:null}
  {receipt&&selected?<Dialog open title="登記到貨" onClose={()=>setReceipt(null)} size="large"><form onKeyDown={enterAdvancesFields} onSubmit={e=>void receive(e)}>
   <label>ERP 進貨單號 341A-<input className="cy-op-input" required inputMode="numeric" pattern="[0-9]{11}" maxLength={11} value={receipt.no} onChange={e=>setReceipt(v=>v?{...v,no:e.target.value}:v)}/></label>
   <label>到貨日期<input className="cy-op-input" type="date" max="9999-12-31" required value={receipt.date} onChange={e=>setReceipt(v=>v?{...v,date:e.target.value}:v)}/></label>
   {selected.lines.filter(l=>l.quantity!==null&&l.received<l.quantity&&!l.closedAs).map(l=><label key={l.id}><input type="checkbox" checked={receipt.selectedLineIds.includes(l.id)} onChange={e=>setReceipt(v=>v?{...v,selectedLineIds:e.target.checked?[...v.selectedLineIds,l.id]:v.selectedLineIds.filter(id=>id!==l.id)}:v)}/>{l.itemName} 剩餘 {(l.quantity??0)-l.received}<input className="cy-op-input" type="number" min="0" max={(l.quantity??0)-l.received} step="any" disabled={!receipt.selectedLineIds.includes(l.id)} value={receipt.quantities[l.id]??String((l.quantity??0)-l.received)} onChange={e=>setReceipt(v=>v?{...v,quantities:{...v.quantities,[l.id]:e.target.value}}:v)}/></label>)}
   <button type="submit" className="cy-op-button primary">儲存到貨</button><button type="button" className="cy-op-button" onClick={()=>setReceipt(null)}>取消</button></form></Dialog>:null}
  {closing?<Dialog open title="結掉剩餘量" onClose={()=>setClosing(null)}><form onKeyDown={enterAdvancesFields} onSubmit={e=>void closeRemaining(e)}><label>處理方式<select className="cy-op-input" value={closing.kind} onChange={e=>setClosing(v=>v?{...v,kind:e.target.value as typeof v.kind}:v)}><option value="SHORTAGE">缺貨</option><option value="CANCELLED">取消</option><option value="OTHER">其他</option></select></label>
   <label>原因<input className="cy-op-input" required={closing.kind==="OTHER"} value={closing.reason} onChange={e=>setClosing(v=>v?{...v,reason:e.target.value}:v)}/></label><button type="submit" className="cy-op-button primary">確認</button><button type="button" className="cy-op-button" onClick={()=>setClosing(null)}>取消</button></form></Dialog>:null}
  {confirmationDialog}
 </section>;
}
