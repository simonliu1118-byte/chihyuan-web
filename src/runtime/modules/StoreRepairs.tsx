import {OpenOnlyToggle} from "../../ui/data/OpenOnlyToggle";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {apiRequest} from "../../api/client";
import {Loading} from "../../ui/feedback/Loading";
import {FeedbackBanner,useFeedbackMessage} from "../../ui/feedback/FeedbackProvider";
import {DataViewToolbar} from "../../ui/data/DataViewToolbar";
import {StatusFilter} from "../../ui/data/StatusFilter";
import {StatusChip} from "../../ui/primitives/StatusChip";
import {StoreRepairPhotos} from "./StoreRepairPhotos";
import {Icons} from "../../ui/actions/icons";
import {SegmentedControl} from "../../ui/primitives/SegmentedControl";
import {Dialog} from "../../ui/overlays/Dialog";
import {Field,CheckField} from "../../ui/forms/Field";
import {DateInput} from "../../ui/forms/DateInput";
import {EntryTable,EntryHeading} from "../../ui/forms/EntryTable";
import {PhoneText} from "../../ui/forms/PhoneInput";
import {enterAdvancesFields,enterAdvancesThenSubmits} from "../../ui/foundation/enter-advance";
import {StoreOperationHistory} from "./StoreOperationHistory";
import {ContactCells,HonorificCell,Reason} from "./store-workflow/StoreFields";
import {StoreShippingFields} from "./store-workflow/StoreShippingFields";
import {StoreMilestoneButton,StoreMilestoneDateFields} from "./store-workflow/StoreMilestoneFields";
import {storeWorkflowActions} from "./store-workflow/StoreWorkflowActions";
import {STORE_EDIT_REASONS,displayCustomerName,type Honorific} from "../../../shared/store";
import {STORE_REPAIR_STATUSES,STORE_REPAIR_STATUS_LABELS,STORE_REPAIR_STEPS,STORE_REPAIR_STEP_LABELS,STORE_REPAIR_PRODUCTS,STORE_REPAIR_CANCEL_REASONS,repairOverdue,nextRepairStep,repairStepLocked,repairStepApplicable,canUndoRepairClosure,type StoreRepair,type StoreRepairStep,type StoreRepairCarrier,type StoreRepairProductKind,type StoreRepairPrintSettings} from "../../../shared/store-repairs";
import {IconButton} from "../../ui/actions/IconButton";
import {printHtml,repairCardHtml,repairSlipHtml} from "./store-repair-print";
import {StoreRepairPrintSettingsDialog} from "./StoreRepairPrintSettings";
import "./store.css";
const ROOT="/api/business/store/repairs";
const request=<T,>(path:string,method="GET",json?:unknown)=>apiRequest<T>(ROOT+path,{method,json});
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
type Draft={original?:StoreRepair;receivedDate:string;customerCode:string;customerName:string;honorific:Honorific;mobile:string;phone:string;lineName:string;productKind:StoreRepairProductKind;productText:string;serialNo:string;fault:string;purchaseDate:string;withoutPurchase:boolean;accessories:string;note:string;reasonKind:string;reason:string;requestKey:string};
type Work={repair:StoreRepair;step:StoreRepairStep;mode:"advance"|"date";value:string;withoutDate:boolean;inspectResult:"GOOD"|"BAD";inspectProblem:string;carrier:StoreRepairCarrier|"";tracking:string;returnMethod:"PICKUP"|"SHIPPING";requestKey:string};
type Action={repair:StoreRepair;kind:"cancel"|"undoCancel"|"undoClose"|"rollback";reasonKind:string;reason:string;requestKey:string};
const draft=(r?:StoreRepair):Draft=>({original:r,receivedDate:r?.receivedDate??today(),customerCode:r?.customerCode??"",customerName:r?.customerName??"",honorific:r?.honorific??"",mobile:r?.mobile??"",phone:r?.phone??"",lineName:r?.lineName??"",productKind:r?.productKind??"LOW_FREQUENCY",productText:r?.productText??"",serialNo:r?.serialNo??"",fault:r?.fault??"",purchaseDate:r?.purchaseDate??"",withoutPurchase:!!r&&!r.purchaseDate,accessories:r?.accessories??"",note:r?.note??"",reasonKind:"",reason:"",requestKey:crypto.randomUUID()});
const tone={RECEIVED:"info",INSPECTED:"info",SENT:"warning",REPAIRED:"warning",NOTIFIED:"warning",RETURNED:"success"} as const;
const status=(r:StoreRepair)=>r.cancelled?{code:"CANCELLED",label:"取消維修",tone:"neutral" as const}:
 repairOverdue(r)==="FACTORY"?{code:"OVERDUE",label:"逾期未修回",tone:"danger" as const}:
 repairOverdue(r)==="PICKUP"?{code:"OVERDUE",label:"逾期未取",tone:"danger" as const}:
 {code:r.status,label:STORE_REPAIR_STATUS_LABELS[r.status],tone:tone[r.status]};
const LIST_HEADINGS=["項次","處理狀態","送修日期","客戶編號/姓名","連絡電話／LINE","類別","產品","產品機號","故障狀況",...STORE_REPAIR_STEPS.map(s=>STORE_REPAIR_STEP_LABELS[s]),"照片","操作"];
/** Headings over centred values (user 2026-11-04): 項次, 處理狀態 and the milestone, photo and action columns. */
const CENTERED_HEADINGS=new Set(["項次","處理狀態",...STORE_REPAIR_STEPS.map(s=>STORE_REPAIR_STEP_LABELS[s]),"照片","操作"]);
const inspection=(r:StoreRepair)=>r.inspectResult==="GOOD"?"無異常":r.inspectResult==="BAD"?r.inspectProblem||"異常":"";
export function StoreRepairs(){
 const [rows,setRows]=useState<StoreRepair[]>([]),[loaded,setLoaded]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const [search,setSearch]=useState(""),[filter,setFilter]=useState(""),[openOnly,setOpenOnly]=useState(false);
 const [form,setForm]=useState<Draft|null>(null),[work,setWork]=useState<Work|null>(null),[action,setAction]=useState<Action|null>(null),[history,setHistory]=useState<number|null>(null);
 const [printMenu,setPrintMenu]=useState<number|null>(null);
 // The print menu closes on any click outside it or on Escape (user 2026-11-04).
 useEffect(()=>{if(printMenu===null)return;
  const outside=(e:PointerEvent)=>{if(!(e.target instanceof Element&&e.target.closest(".cy-repair-ops")))setPrintMenu(null)};
  const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")setPrintMenu(null)};
  document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
  return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape)}},[printMenu]);
 const [printSettings,setPrintSettings]=useState<StoreRepairPrintSettings|null>(null);
 const [photosFor,setPhotosFor]=useState<number|null>(null),[photoCounts,setPhotoCounts]=useState<Record<number,number>>({});
 const [revision,setRevision]=useState(0),[message,setMessage,reportError,feedbackTone]=useFeedbackMessage<string|null>(null);
 const serial=useRef(0),mutating=useRef(false);
 const load=useCallback(async(q:string,initial=false)=>{const current=++serial.current;if(!initial)setLoading(true);try{
  const data=await request<StoreRepair[]>("?q="+encodeURIComponent(q));
  if(serial.current===current)setRows(data);
 }catch(e){if(serial.current===current)reportError(e instanceof Error?e.message:"售後維修載入失敗")}finally{if(serial.current===current){setLoaded(true);setLoading(false)}}},[reportError]);
 useEffect(()=>{const timer=setTimeout(()=>{void load(search,!loaded)},search?250:0);return()=>{clearTimeout(timer);serial.current++}},[load,search]);
 function apply(r:StoreRepair){setRows(old=>{const found=old.some(x=>x.id===r.id);return found?old.map(x=>x.id===r.id&&x.version<=r.version?r:x):[r,...old]});setRevision(v=>v+1)}
 async function run(task:()=>Promise<void>){if(mutating.current)return;mutating.current=true;setBusy(true);try{await task()}catch(e){reportError(e instanceof Error?e.message:"維修操作失敗")}finally{mutating.current=false;setBusy(false)}}
 function showWork(r:StoreRepair,step:StoreRepairStep,mode:"advance"|"date"){
  setWork({repair:r,step,mode,value:r.dates[step]??today(),withoutDate:mode==="date"&&!r.dates[step],inspectResult:r.inspectResult==="BAD"?"BAD":"GOOD",inspectProblem:r.inspectProblem,carrier:step==="RETURNED"?r.returnCarrier:r.sendCarrier,tracking:step==="RETURNED"?r.returnTracking:r.sendTracking,returnMethod:r.returnMethod==="SHIPPING"?"SHIPPING":"PICKUP",requestKey:crypto.randomUUID()});
 }
 const printAfter=useRef(false);
 /** 維修單 on the dot-matrix printer, 維修資訊卡 on the thermal printer; the browser dialog picks the printer. */
 async function print(r:StoreRepair,kind:"slip"|"card"="slip"){
  try{const settings=await request<StoreRepairPrintSettings>("/print-settings");printHtml(kind==="slip"?repairSlipHtml(r,settings):repairCardHtml(r,settings))}catch(e){reportError(e instanceof Error?e.message:"列印設定載入失敗")}
 }
 async function saveForm(e:FormEvent){e.preventDefault();if(!form)return;const f=form;
  await run(async()=>{const json={...f,purchaseDate:f.withoutPurchase?null:f.purchaseDate,...(f.original&&f.original.status!=="RECEIVED"?{reasonKind:f.reasonKind,reason:f.reason}:{}),requestKey:f.requestKey,expectedVersion:f.original?.version};
   const result=await request<StoreRepair>(f.original?"/"+f.original.id:"",f.original?"PATCH":"POST",json);
   apply(result);setForm(null);setMessage(f.original?"維修單已修改":"維修單已新增");
   if(printAfter.current)await print(result)});
  printAfter.current=false;
 }
 const workReadOnly=!!work&&work.mode==="date"&&(repairStepLocked(work.repair,work.step)||work.repair.status==="RETURNED"&&!canUndoRepairClosure(work.repair));
 async function saveWork(){if(!work||workReadOnly)return;const w=work;
  await run(async()=>{const json=w.mode==="date"?{step:w.step,milestoneDate:w.withoutDate?null:w.value,...(w.step==="INSPECTED"?{inspectResult:w.inspectResult,inspectProblem:w.inspectProblem}:{}),...(w.step==="SENT"||w.step==="RETURNED"?{shipping:{carrier:w.carrier,tracking:w.tracking}}:{}),...(w.step==="RETURNED"?{returnMethod:w.returnMethod}:{}),requestKey:w.requestKey,expectedVersion:w.repair.version}:
   {action:"advance",step:w.step,milestoneDate:w.withoutDate?null:w.value,inspectResult:w.inspectResult,inspectProblem:w.inspectProblem,shipping:{carrier:w.carrier,tracking:w.tracking},returnMethod:w.returnMethod,requestKey:w.requestKey,expectedVersion:w.repair.version};
   const result=await request<StoreRepair>("/"+w.repair.id+(w.mode==="date"?"/date":"/status"),w.mode==="date"?"PATCH":"POST",json);
   apply(result);setWork(null);setMessage(w.mode==="date"?"日期已修改":"維修進度已儲存")});
 }
 async function saveAction(e:FormEvent){e.preventDefault();if(!action)return;const a=action;
  await run(async()=>{const result=await request<StoreRepair>("/"+a.repair.id+"/status","POST",{action:a.kind,reasonKind:a.reasonKind,reason:a.reason,requestKey:a.requestKey,expectedVersion:a.repair.version});
   apply(result);setAction(null);setMessage(a.kind==="cancel"?"維修已標記取消；仍需通知並歸還機器":a.kind==="undoClose"?"結案已撤回":a.kind==="undoCancel"?"取消已撤回":"已退回上一階段")});
 }
 const matching=rows.filter(r=>!openOnly||r.status!=="RETURNED"),visible=matching.filter(r=>!filter||status(r).code===filter);
 const counts:Record<string,number>={};matching.forEach(r=>{const code=status(r).code;counts[code]=(counts[code]??0)+1});
 if(!loaded)return <Loading/>;
 return <div className="cy-store-orders cy-store-repairs"><FeedbackBanner message={message} tone={feedbackTone}/>
  <DataViewToolbar searchValue={search} onSearchChange={setSearch} searchLabel="搜尋售後維修" searchPlaceholder="搜尋客戶編號、姓名、電話、LINE、型號、機號、故障、寄送編號"
   beforeSearch={<OpenOnlyToggle value={openOnly} onChange={setOpenOnly}/>}
   actions={<><button type="button" className="cy-op-button" disabled={busy} onClick={()=>void run(async()=>setPrintSettings(await request<StoreRepairPrintSettings>("/print-settings")))}>{Icons.settings} 列印設定</button>
    <button type="button" className="cy-op-button primary" onClick={()=>setForm(draft())}>＋ 新增維修</button></>}/>
  <div className="cy-store-filters"><StatusFilter label="維修處理狀態" counts={counts} value={filter} onChange={setFilter} options={[...STORE_REPAIR_STATUSES.map(code=>({code,label:STORE_REPAIR_STATUS_LABELS[code],tone:tone[code]})),{code:"CANCELLED",label:"取消維修",tone:"neutral"},{code:"OVERDUE",label:"逾期",tone:"danger"}]}/></div>
  {loading?<Loading inline/>:null}
  <div className="cy-ordering-grid-scroll"><table className="cy-ordering-grid cy-store-workflow-table cy-repair-list">
   {/* Designed widths (user 2026-11-04): fixed for short values, 故障狀況 takes the rest; 檢測狀況 follows 檢測; 照片 and the two print buttons (維修單, 維修資訊卡) sit before 操作. */}
   <colgroup><col style={{width:"3.4em"}}/><col style={{width:"6.6em"}}/><col style={{width:"6.8em"}}/><col style={{width:"12em"}}/><col style={{width:"9.4em"}}/>
    <col style={{width:"4.6em"}}/><col style={{width:"13.5em"}}/><col style={{width:"7.6em"}}/><col/>
    {STORE_REPAIR_STEPS.map(s=><col key={s} style={{width:"4.6em"}}/>)}<col style={{width:"4.6em"}}/><col style={{width:"10.4em"}}/></colgroup>
   <thead><tr>{LIST_HEADINGS.map((h,i)=><th key={h} className={[i===2||i===9||i===LIST_HEADINGS.length-2?"cy-grid-divider-before":"",CENTERED_HEADINGS.has(h)?"cy-repair-center":""].join(" ").trim()||undefined}>{h}</th>)}</tr></thead>
   {visible.map(r=>{const state=status(r),next=nextRepairStep(r),closed=r.status==="RETURNED",undoClose=canUndoRepairClosure(r),overdue=!!repairOverdue(r);return <tbody key={r.id}><tr data-overdue={overdue||undefined}>
    <td data-label="項次" className="cy-store-sequence">{r.sequence}</td>
    <td data-label="處理狀態" className="cy-store-status-cell"><StatusChip tone={state.tone} className={state.code==="OVERDUE"?"cy-store-overdue-pill":undefined}>{state.label}</StatusChip></td>
    <td data-label="送修日期" className="cy-grid-divider-before">{r.receivedDate.replaceAll("-","/")}</td>
    <td data-label="客戶編號/姓名">{r.customerCode?<span className="cy-repair-customer-code">{r.customerCode}</span>:null}{displayCustomerName(r.customerName,r.honorific)}</td>
    <td data-label="連絡電話／LINE" className="cy-store-contact-cell">{r.mobile?<PhoneText value={r.mobile} kind="auto"/>:null}{r.phone?<PhoneText value={r.phone} kind="auto"/>:null}{r.lineName?<span>{r.lineName}</span>:null}</td>
    <td data-label="類別">{STORE_REPAIR_PRODUCTS[r.productKind]}</td><td data-label="產品">{r.productText}</td><td data-label="產品機號">{r.serialNo}</td><td data-label="故障狀況" className="cy-repair-fault" title={r.fault}>{r.fault}</td>
    {STORE_REPAIR_STEPS.map((step,i)=>{const applicable=repairStepApplicable(r,step),reached=STORE_REPAIR_STEPS.indexOf(r.status as StoreRepairStep)>=i,isNext=step===next&&!closed;
     const dateValue=r.dates[step];const cell=<td key={step} data-label={STORE_REPAIR_STEP_LABELS[step]} className={"cy-store-milestone "+(i===0?"cy-grid-divider-before ":"")+(!applicable?"cy-store-not-applicable":"")+(step==="INSPECTED"&&r.inspectResult?(r.inspectResult==="BAD"?" cy-repair-inspect-bad":" cy-repair-inspect-good"):"")} aria-label={!applicable?STORE_REPAIR_STEP_LABELS[step]+"不適用":undefined}>
      {applicable&&(reached||isNext)?<StoreMilestoneButton day={dateValue} baseYear={r.receivedDate} pending={isNext} disabled={busy} label={STORE_REPAIR_STEP_LABELS[step]+"日期 "+(dateValue??"無日期")+(step==="INSPECTED"&&r.inspectResult?"，"+inspection(r):"")} title={step==="INSPECTED"&&r.inspectResult?inspection(r):undefined} onClick={()=>showWork(r,step,isNext?"advance":"date")}/>:null}
      {/* Same in-cell date popover as 顧客訂購 (user 2026-11-04), never a full dialog. */}
      {work&&work.repair.id===r.id&&work.step===step?<div className="cy-store-date-popover" role="dialog" aria-label={step==="INSPECTED"?"檢測":STORE_REPAIR_STEP_LABELS[step]+"日期"}><form onKeyDown={enterAdvancesThenSubmits} onSubmit={e=>{e.preventDefault();void saveWork()}}>
   <StoreMilestoneDateFields disabled={busy||workReadOnly} label={STORE_REPAIR_STEP_LABELS[work.step]} value={work.value} withoutDate={work.withoutDate} min={work.repair.receivedDate} max={today()} onChange={patch=>setWork(w=>w?{...w,...patch}:w)}/>
   {work.step==="INSPECTED"?<><SegmentedControl label="檢測結果" disabled={busy||workReadOnly||work.mode==="date"&&work.repair.cancelled} options={[{value:"GOOD",label:"無異常"},{value:"BAD",label:"異常"}]} value={work.inspectResult} onChange={inspectResult=>setWork(w=>w?{...w,inspectResult}:w)}/>{work.inspectResult==="BAD"?<Field label="補充說明" size="l"><input className="cy-op-input" disabled={busy||workReadOnly} maxLength={200} value={work.inspectProblem} onChange={e=>setWork(w=>w?{...w,inspectProblem:e.target.value}:w)}/></Field>:null}</>:null}
   {work.step==="SENT"?<StoreShippingFields disabled={busy||workReadOnly} carrier={work.carrier} tracking={work.tracking} onChange={patch=>setWork(w=>w?{...w,...patch}:w)}/>:null}
   {work.step==="RETURNED"?<><SegmentedControl label="歸還方式" disabled={busy||workReadOnly} options={[{value:"PICKUP",label:"自取"},{value:"SHIPPING",label:"寄送"}]} value={work.returnMethod} onChange={returnMethod=>setWork(w=>w?{...w,returnMethod}:w)}/>{work.returnMethod==="SHIPPING"?<StoreShippingFields disabled={busy||workReadOnly} carrier={work.carrier} tracking={work.tracking} onChange={patch=>setWork(w=>w?{...w,...patch}:w)}/>:null}</>:null}
       <div className="cy-store-date-actions">{workReadOnly?<button type="button" className="cy-op-button compact" onClick={()=>setWork(null)}>關閉</button>:<><button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>setWork(null)}>取消</button><button type="submit" className="cy-op-button compact primary" disabled={busy}>{step==="RETURNED"&&work.mode==="advance"?"儲存並結案":"儲存"}</button></>}</div>
      </form></div>:null}
      {/* 檢測 date green for 無異常, red for 異常 (user 2026-11-04); the cell opens date and result together. */}
     </td>;
     return cell})}
    <td data-label="照片" className="cy-grid-divider-before"><button type="button" className="cy-repair-photo-entry" aria-label={"維修單照片 "+r.sequence} onClick={()=>setPhotosFor(r.id)}><span className="cy-repair-camera-icon">{Icons.camera}</span>{photoCounts[r.id]??r.photoCount??0}</button></td>
    <td data-label="操作" className="cy-repair-ops"><div className="cy-repair-ops-row">{storeWorkflowActions({edit:{label:"修改維修",disabled:busy||closed,onClick:()=>setForm(draft(r))},cancel:{label:"取消維修",disabled:busy||closed||r.cancelled,onClick:()=>setAction({repair:r,kind:"cancel",reasonKind:"",reason:"",requestKey:crypto.randomUUID()})},back:{label:closed?"撤回結案":r.cancelled&&r.status!=="NOTIFIED"?"撤回取消":"退回上一步",disabled:busy||(closed?!undoClose:r.cancelled&&r.status==="NOTIFIED"||r.status==="RECEIVED"&&!r.cancelled),onClick:()=>setAction({repair:r,kind:closed?"undoClose":r.cancelled&&r.status!=="NOTIFIED"?"undoCancel":"rollback",reasonKind:"",reason:"",requestKey:crypto.randomUUID()})},history:{label:"維修操作紀錄",controls:"repair-history-"+r.id,expanded:history===r.id,onClick:()=>setHistory(h=>h===r.id?null:r.id)},beforeHistory:<IconButton variant="table" icon={Icons.print} label="列印" disabled={busy} expanded={printMenu===r.id} onClick={()=>setPrintMenu(m=>m===r.id?null:r.id)}/>})}</div>
     {printMenu===r.id?<div className="cy-store-date-popover cy-repair-print-menu" role="menu" aria-label="列印">
      <button type="button" role="menuitem" className="cy-op-button compact" onClick={()=>{setPrintMenu(null);void print(r,"slip")}}>維修單</button>
      <button type="button" role="menuitem" className="cy-op-button compact" onClick={()=>{setPrintMenu(null);void print(r,"card")}}>資訊卡</button></div>:null}</td>
   </tr>{history===r.id?<tr id={"repair-history-"+r.id}><td colSpan={LIST_HEADINGS.length}><StoreOperationHistory key={revision} path={"/repairs/"+r.id+"/history"} layout="chain" onError={reportError}/></td></tr>:null}</tbody>})}
   </table>{!visible.length?<p className="cy-op-empty">沒有符合條件的維修單。</p>:null}</div>
  {photosFor!==null?<StoreRepairPhotos repairId={photosFor} onClose={()=>setPhotosFor(null)} onCountChanged={count=>setPhotoCounts(old=>({...old,[photosFor]:count}))}/>:null}
  {form?<Dialog open dismissible={false} title={form.original?"修改維修單":"新增維修單"} className="cy-repair-form-dialog" onClose={()=>!busy&&setForm(null)} size="large"><form onKeyDown={enterAdvancesFields} onSubmit={e=>void saveForm(e)}>
   {/* One entry table (user 2026-11-04): customer and contact on row 1, product, purchase date and accessories on row 2, fault and 備註 below. */}
   <EntryTable label="維修單資料" className="cy-repair-entry-table">
    {/* Nine grid columns (user 2026-11-04) so each row sizes to its content: row 2 gives 配件備註 the most
        room, 購買日期 just a date and 無日期, 產品機號 a full serial, 產品型號 a model name. */}
    <colgroup><col style={{width:"9.6em"}}/><col style={{width:"7em"}}/><col style={{width:"7.4em"}}/><col style={{width:"5.6em"}}/><col style={{width:"5.5em"}}/>
     <col style={{width:"10em"}}/><col style={{width:"5.6em"}}/><col style={{width:"4.4em"}}/><col/></colgroup>
    <tbody>
     <tr><th scope="col"><EntryHeading required>送修日期</EntryHeading></th><th scope="col"><EntryHeading>客戶編號</EntryHeading></th><th scope="col" colSpan={2}><EntryHeading required>客戶姓名</EntryHeading></th><th scope="col"><EntryHeading>稱謂</EntryHeading></th><th scope="col"><EntryHeading>連絡電話1</EntryHeading></th><th scope="col" colSpan={2}><EntryHeading>連絡電話2</EntryHeading></th><th scope="col"><EntryHeading>LINE 名稱</EntryHeading></th></tr>
     <tr><td><Field label="送修日期" required presentation="cell"><DateInput className="cy-ordering-cell" min="0001-01-01" max={today()} value={form.receivedDate} onChange={value=>setForm(f=>f?{...f,receivedDate:value}:f)}/></Field></td>
      <td><Field label="客戶編號" presentation="cell"><input className="cy-ordering-cell" maxLength={40} value={form.customerCode} onChange={e=>setForm(f=>f?{...f,customerCode:e.target.value}:f)}/></Field></td>
      <td colSpan={2}><Field label="客戶姓名" required presentation="cell"><input className="cy-ordering-cell" maxLength={40} value={form.customerName} onChange={e=>setForm(f=>f?{...f,customerName:e.target.value}:f)}/></Field></td>
      <HonorificCell value={form.honorific} onChange={honorific=>setForm(f=>f?{...f,honorific}:f)}/>
      <ContactCells spans={[1,2,1]} value={form} onChange={patch=>setForm(f=>f?{...f,...patch}:f)}/></tr>
     <tr><th scope="col"><EntryHeading required>類別</EntryHeading></th><th scope="col" colSpan={2}><EntryHeading required>{form.productKind==="OTHER"?"產品名稱":"產品型號"}</EntryHeading></th><th scope="col" colSpan={2}><EntryHeading>產品機號</EntryHeading></th><th scope="col" colSpan={2}><EntryHeading required={!form.withoutPurchase}>購買日期</EntryHeading></th><th scope="col" colSpan={2}><EntryHeading>配件備註</EntryHeading></th></tr>
     <tr><td><Field label="類別" required presentation="cell"><select className="cy-ordering-cell" required value={form.productKind} onChange={e=>setForm(f=>f?{...f,productKind:e.target.value as StoreRepairProductKind}:f)}>
      {Object.entries(STORE_REPAIR_PRODUCTS).map(([kind,label])=><option key={kind} value={kind}>{label}</option>)}</select></Field></td>
      <td colSpan={2}><Field label={form.productKind==="OTHER"?"產品名稱":"產品型號"} required presentation="cell"><input className="cy-ordering-cell" maxLength={120} value={form.productText} onChange={e=>setForm(f=>f?{...f,productText:e.target.value}:f)}/></Field></td>
      <td colSpan={2}><Field label="產品機號" presentation="cell"><input className="cy-ordering-cell" maxLength={60} value={form.serialNo} onChange={e=>setForm(f=>f?{...f,serialNo:e.target.value}:f)}/></Field></td>
      <td colSpan={2}><div className="cy-repair-date-cell"><Field label="購買日期" required={!form.withoutPurchase} presentation="cell"><DateInput className="cy-ordering-cell" disabled={form.withoutPurchase} value={form.withoutPurchase?"":form.purchaseDate} min="0001-01-01" max={today()} onChange={value=>setForm(f=>f?{...f,purchaseDate:value}:f)}/></Field>
       <CheckField label="無日期" size="s" data-enter-skip="true" checked={form.withoutPurchase} onChange={e=>setForm(f=>f?{...f,withoutPurchase:e.target.checked}:f)}/></div></td>
      <td colSpan={2}><Field label="配件備註" presentation="cell"><input className="cy-ordering-cell" maxLength={300} value={form.accessories} onChange={e=>setForm(f=>f?{...f,accessories:e.target.value}:f)}/></Field></td></tr>
     <tr><th scope="col" colSpan={5}><EntryHeading required>故障狀況</EntryHeading></th><th scope="col" colSpan={4}><EntryHeading>備註</EntryHeading></th></tr>
     <tr><td colSpan={5}><Field label="故障狀況" required presentation="cell"><textarea className="cy-ordering-cell" rows={2} maxLength={300} value={form.fault} onChange={e=>setForm(f=>f?{...f,fault:e.target.value}:f)}/></Field></td>
      <td colSpan={4}><Field label="備註" presentation="cell"><textarea className="cy-ordering-cell" rows={2} maxLength={300} value={form.note} onChange={e=>setForm(f=>f?{...f,note:e.target.value}:f)}/></Field></td></tr>
    </tbody>
   </EntryTable>
   {form.original&&form.original.status!=="RECEIVED"?<Reason inline kind={form.reasonKind} detail={form.reason} options={STORE_EDIT_REASONS} onChange={(reasonKind,reason)=>setForm(f=>f?{...f,reasonKind,reason}:f)}/>:null}
   <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>setForm(null)}>取消</button>{form.original?null:<button type="submit" className="cy-op-button" disabled={busy} onClick={()=>{printAfter.current=true}}>{Icons.print} 儲存並列印</button>}<button type="submit" className="cy-op-button primary" disabled={busy} onClick={()=>{printAfter.current=false}}>儲存</button></div>
  </form></Dialog>:null}
  {printSettings?<StoreRepairPrintSettingsDialog value={printSettings} busy={busy} onClose={()=>setPrintSettings(null)} onSave={next=>run(async()=>{
   await request<StoreRepairPrintSettings>("/print-settings","PUT",next);setPrintSettings(null);setMessage("列印設定已儲存")})}/>:null}
  {action?<Dialog open dismissible={false} size="small" title={{cancel:"取消維修",undoCancel:"撤回取消維修",undoClose:"撤回結案",rollback:"退回上一步"}[action.kind]} onClose={()=>!busy&&setAction(null)}><form onKeyDown={enterAdvancesThenSubmits} onSubmit={e=>void saveAction(e)}>
   {action.kind==="cancel"?<><p>取消維修後仍必須通知顧客，並完成機器歸還才會結案。</p><Reason kind={action.reasonKind} detail={action.reason} options={STORE_REPAIR_CANCEL_REASONS} onChange={(reasonKind,reason)=>setAction(a=>a?{...a,reasonKind,reason}:a)}/></>:action.kind==="rollback"?<Field label="退回理由" required size="l"><input className="cy-op-input" maxLength={300} value={action.reason} onChange={e=>setAction(a=>a?{...a,reason:e.target.value}:a)}/></Field>:<p>確定撤回此操作嗎？</p>}
   <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>setAction(null)}>取消</button><button type="submit" className="cy-op-button primary" disabled={busy}>確認</button></div>
  </form></Dialog>:null}
 </div>;
}
