import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {apiRequest} from "../../api/client";
import {Loading} from "../../ui/feedback/Loading";
import {FeedbackBanner,useFeedbackMessage} from "../../ui/feedback/FeedbackProvider";
import {DataViewToolbar} from "../../ui/data/DataViewToolbar";
import {StatusFilter} from "../../ui/data/StatusFilter";
import {StatusChip} from "../../ui/primitives/StatusChip";
import {SegmentedControl} from "../../ui/primitives/SegmentedControl";
import {IconButton} from "../../ui/actions/IconButton";
import {Icons} from "../../ui/actions/icons";
import {Dialog} from "../../ui/overlays/Dialog";
import {Field,CheckField,FormSection} from "../../ui/forms/Field";
import {DateInput} from "../../ui/forms/DateInput";
import {EntryTable,EntryHeading} from "../../ui/forms/EntryTable";
import {PhoneText} from "../../ui/forms/PhoneInput";
import {enterAdvancesFields,enterAdvancesThenSubmits} from "../../ui/foundation/enter-advance";
import {StoreOperationHistory} from "./StoreOperationHistory";
import {ContactCells,HonorificCell,Reason} from "./store-workflow/StoreFields";
import {StoreShippingFields} from "./store-workflow/StoreShippingFields";
import {StoreMilestoneDateFields,StoreMilestoneStamp} from "./store-workflow/StoreMilestoneFields";
import {STORE_EDIT_REASONS,displayCustomerName,type Honorific} from "../../../shared/store";
import {STORE_REPAIR_STATUSES,STORE_REPAIR_STATUS_LABELS,STORE_REPAIR_STEPS,STORE_REPAIR_STEP_LABELS,STORE_REPAIR_PRODUCTS,STORE_REPAIR_CANCEL_REASONS,displayRepairProduct,repairOverdue,nextRepairStep,repairStepApplicable,canUndoRepairClosure,type StoreRepair,type StoreRepairStep,type StoreRepairCarrier,type StoreRepairProductKind} from "../../../shared/store-repairs";
import "./store.css";
const ROOT="/api/business/store/repairs";
const request=<T,>(path:string,method="GET",json?:unknown)=>apiRequest<T>(ROOT+path,{method,json});
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
type Draft={original?:StoreRepair;receivedDate:string;customerCode:string;customerName:string;honorific:Honorific;mobile:string;phone:string;lineName:string;productKind:StoreRepairProductKind;productText:string;serialNo:string;fault:string;purchaseDate:string;withoutPurchase:boolean;accessories:string;reasonKind:string;reason:string;requestKey:string};
type Work={repair:StoreRepair;step:StoreRepairStep;mode:"advance"|"date";value:string;withoutDate:boolean;inspectResult:"GOOD"|"BAD";inspectProblem:string;carrier:StoreRepairCarrier|"";tracking:string;returnMethod:"PICKUP"|"SHIPPING";requestKey:string};
type Action={repair:StoreRepair;kind:"cancel"|"undoCancel"|"undoClose"|"rollback";reasonKind:string;reason:string;requestKey:string};
const draft=(r?:StoreRepair):Draft=>({original:r,receivedDate:r?.receivedDate??today(),customerCode:r?.customerCode??"",customerName:r?.customerName??"",honorific:r?.honorific??"",mobile:r?.mobile??"",phone:r?.phone??"",lineName:r?.lineName??"",productKind:r?.productKind??"LOW_FREQUENCY",productText:r?.productText??"",serialNo:r?.serialNo??"",fault:r?.fault??"",purchaseDate:r?.purchaseDate??"",withoutPurchase:!r?.purchaseDate,accessories:r?.accessories??"",reasonKind:"",reason:"",requestKey:crypto.randomUUID()});
const tone={RECEIVED:"info",INSPECTED:"info",SENT:"warning",REPAIRED:"info",NOTIFIED:"warning",RETURNED:"success"} as const;
const status=(r:StoreRepair)=>r.cancelled?{code:"CANCELLED",label:"取消維修",tone:"neutral" as const}:
 repairOverdue(r)==="FACTORY"?{code:"OVERDUE",label:"逾期未修回",tone:"danger" as const}:
 repairOverdue(r)==="PICKUP"?{code:"OVERDUE",label:"逾期未取",tone:"danger" as const}:
 {code:r.status,label:STORE_REPAIR_STATUS_LABELS[r.status],tone:tone[r.status]};
function WorkDateButton({repair,step,value,disabled,onClick}:{repair:StoreRepair;step:StoreRepairStep;value:string|null;disabled:boolean;onClick:()=>void}){
 return <button type="button" className={"cy-store-date-link "+(value===undefined?"cy-store-register":!value?"cy-store-check":"")} disabled={disabled} aria-label={STORE_REPAIR_STEP_LABELS[step]+"日期 "+(value??"無日期")} onClick={onClick}>{value===undefined?"登記":<StoreMilestoneStamp day={value} baseYear={repair.receivedDate}/>}</button>;
}
export function StoreRepairs(){
 const [rows,setRows]=useState<StoreRepair[]>([]),[loaded,setLoaded]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const [search,setSearch]=useState(""),[filter,setFilter]=useState(""),[openOnly,setOpenOnly]=useState(false);
 const [form,setForm]=useState<Draft|null>(null),[work,setWork]=useState<Work|null>(null),[action,setAction]=useState<Action|null>(null),[history,setHistory]=useState<number|null>(null);
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
 async function saveForm(e:FormEvent){e.preventDefault();if(!form)return;const f=form;
  await run(async()=>{const json={...f,purchaseDate:f.withoutPurchase?null:f.purchaseDate,...(f.original&&f.original.status!=="RECEIVED"?{reasonKind:f.reasonKind,reason:f.reason}:{}),requestKey:f.requestKey,expectedVersion:f.original?.version};
   const result=await request<StoreRepair>(f.original?"/"+f.original.id:"",f.original?"PATCH":"POST",json);
   apply(result);setForm(null);setMessage(f.original?"維修單已修改":"維修單已新增")});
 }
 async function saveWork(e:FormEvent){e.preventDefault();if(!work)return;const w=work;
  await run(async()=>{const json=w.mode==="date"?{step:w.step,milestoneDate:w.withoutDate?null:w.value,requestKey:w.requestKey,expectedVersion:w.repair.version}:
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
   beforeSearch={<button className="cy-op-button primary" type="button" aria-pressed={openOnly} onClick={()=>setOpenOnly(v=>!v)}>{openOnly?"顯示全部":"顯示未結案"}</button>}
   actions={<button type="button" className="cy-op-button primary" onClick={()=>setForm(draft())}>＋ 新增維修</button>}/>
  <div className="cy-store-filters"><StatusFilter label="維修處理狀態" counts={counts} value={filter} onChange={setFilter} options={[...STORE_REPAIR_STATUSES.map(code=>({code,label:STORE_REPAIR_STATUS_LABELS[code],tone:tone[code]})),{code:"CANCELLED",label:"取消維修",tone:"neutral"},{code:"OVERDUE",label:"逾期",tone:"danger"}]}/></div>
  {loading?<Loading inline/>:null}
  <div className="cy-ordering-grid-scroll"><table className="cy-ordering-grid cy-store-workflow-table cy-repair-list">
   <thead><tr>{["項次","處理狀態","送修日期","客戶姓名","連絡電話／LINE","送修產品","產品機號","故障狀況",...STORE_REPAIR_STEPS.map(s=>STORE_REPAIR_STEP_LABELS[s]),"操作"].map((h,i)=><th key={h} className={[2,8,13].includes(i)?"cy-grid-divider-before":undefined}>{h}</th>)}</tr></thead>
   {visible.map(r=>{const state=status(r),next=nextRepairStep(r),closed=r.status==="RETURNED",undoClose=canUndoRepairClosure(r),overdue=!!repairOverdue(r);return <tbody key={r.id}><tr data-overdue={overdue||undefined}>
    <td className="cy-store-sequence">{r.sequence}</td>
    <td className="cy-store-status-cell"><StatusChip tone={state.tone} className={state.code==="OVERDUE"?"cy-store-overdue-pill":undefined}>{state.label}</StatusChip></td>
    <td className="cy-grid-divider-before">{r.receivedDate.replaceAll("-","/")}</td>
    <td>{displayCustomerName(r.customerName,r.honorific)}</td>
    <td className="cy-store-contact-cell">{r.mobile?<PhoneText value={r.mobile} kind="auto"/>:null}{r.phone?<PhoneText value={r.phone} kind="auto"/>:null}{r.lineName?<span>{r.lineName}</span>:null}</td>
    <td>{displayRepairProduct(r)}</td><td>{r.serialNo}</td><td className="cy-repair-fault" title={r.fault}>{r.fault}</td>
    {STORE_REPAIR_STEPS.map((step,i)=>{const applicable=repairStepApplicable(r,step),reached=STORE_REPAIR_STEPS.indexOf(r.status as StoreRepairStep)>=i,canEdit=reached&&r.status!=="RETURNED",isNext=step===next&&!closed;
     const dateValue=r.dates[step];return <td key={step} className={"cy-store-milestone "+(i===0?"cy-grid-divider-before ":"")+(!applicable?"cy-store-not-applicable":"")} aria-label={!applicable?STORE_REPAIR_STEP_LABELS[step]+"不適用":undefined}>
      {applicable&&(reached||isNext)?<WorkDateButton repair={r} step={step} value={isNext?undefined as unknown as string|null:dateValue} disabled={busy||!isNext&&!canEdit} onClick={()=>showWork(r,step,isNext?"advance":"date")}/>:null}
     </td>})}
    <td className="cy-grid-divider-before"><div className="cy-store-row-actions">
     <IconButton variant="table" icon={Icons.edit} label="修改維修" disabled={busy||closed} onClick={()=>setForm(draft(r))}/>
     <IconButton variant="table" icon={Icons.cancel} tone="danger" label="取消維修" disabled={busy||closed||r.cancelled} onClick={()=>setAction({repair:r,kind:"cancel",reasonKind:"",reason:"",requestKey:crypto.randomUUID()})}/>
     <IconButton variant="table" icon={Icons.back} label={closed?"撤回結案":r.cancelled&&r.status!=="NOTIFIED"?"撤回取消":"退回上一步"} disabled={busy||(closed?!undoClose:r.cancelled&&r.status==="NOTIFIED"||r.status==="RECEIVED"&&!r.cancelled)} onClick={()=>setAction({repair:r,kind:closed?"undoClose":r.cancelled&&r.status!=="NOTIFIED"?"undoCancel":"rollback",reasonKind:"",reason:"",requestKey:crypto.randomUUID()})}/>
     <IconButton variant="table" icon={Icons.history} label="維修操作紀錄" expanded={history===r.id} controls={"repair-history-"+r.id} onClick={()=>setHistory(h=>h===r.id?null:r.id)}/>
    </div></td>
   </tr>{history===r.id?<tr id={"repair-history-"+r.id}><td colSpan={14}><StoreOperationHistory key={revision} path={"/repairs/"+r.id+"/history"} layout="chain" onError={reportError}/></td></tr>:null}</tbody>})}
   </table>{!visible.length?<p className="cy-op-empty">沒有符合條件的維修單。</p>:null}</div>
  {form?<Dialog open dismissible={false} title={form.original?"修改維修單":"新增維修單"} className="cy-repair-form-dialog" onClose={()=>!busy&&setForm(null)} size="large"><form onKeyDown={enterAdvancesFields} onSubmit={e=>void saveForm(e)}>
   <EntryTable label="維修單基本資料" className="cy-repair-entry-table">
    <tbody><tr><td><Field label="送修日期" required presentation="cell"><DateInput className="cy-ordering-cell" min="0001-01-01" max={today()} value={form.receivedDate} onChange={value=>setForm(f=>f?{...f,receivedDate:value}:f)}/></Field></td>
     <td><Field label="客戶編號" presentation="cell"><input className="cy-ordering-cell" maxLength={40} value={form.customerCode} onChange={e=>setForm(f=>f?{...f,customerCode:e.target.value}:f)}/></Field></td>
     <td><Field label="客戶姓名" required presentation="cell"><input className="cy-ordering-cell" maxLength={40} value={form.customerName} onChange={e=>setForm(f=>f?{...f,customerName:e.target.value}:f)}/></Field></td>
     <HonorificCell value={form.honorific} onChange={honorific=>setForm(f=>f?{...f,honorific}:f)}/></tr>
     <tr><ContactCells value={form} onChange={patch=>setForm(f=>f?{...f,...patch}:f)}/><td><Field label="產品機號" presentation="cell"><input className="cy-ordering-cell" maxLength={60} value={form.serialNo} onChange={e=>setForm(f=>f?{...f,serialNo:e.target.value}:f)}/></Field></td></tr>
    </tbody>
   </EntryTable>
   <FormSection title="送修產品（五選一，一張維修單限一個品項）"><div className="cy-repair-products">{Object.entries(STORE_REPAIR_PRODUCTS).map(([kind,label])=><div key={kind} className="cy-repair-product-option">
    <Field label={label} size="s"><input type="radio" name="repair-product" required checked={form.productKind===kind} onChange={()=>setForm(f=>f?{...f,productKind:kind as StoreRepairProductKind,productText:""}:f)}/></Field>
    <Field label={kind==="OTHER"?"產品名稱":"型號"} required={form.productKind===kind} size="m"><input className="cy-op-input" maxLength={120} disabled={form.productKind!==kind} value={form.productKind===kind?form.productText:""} onChange={e=>setForm(f=>f?{...f,productText:e.target.value}:f)}/></Field>
   </div>)}</div></FormSection>
   <FormSection title="故障與配件"><Field label="故障狀況" required size="l"><textarea className="cy-op-input" maxLength={300} value={form.fault} onChange={e=>setForm(f=>f?{...f,fault:e.target.value}:f)}/></Field>
    <Field label="購買日期" size="s"><DateInput className="cy-op-input" disabled={form.withoutPurchase} value={form.withoutPurchase?"":form.purchaseDate} min="0001-01-01" max={today()} onChange={value=>setForm(f=>f?{...f,purchaseDate:value}:f)}/></Field>
    <CheckField label="無日期" data-enter-skip="true" checked={form.withoutPurchase} onChange={e=>setForm(f=>f?{...f,withoutPurchase:e.target.checked}:f)}/>
    <Field label="配件備註" size="l"><textarea className="cy-op-input" maxLength={300} value={form.accessories} onChange={e=>setForm(f=>f?{...f,accessories:e.target.value}:f)}/></Field></FormSection>
   {form.original&&form.original.status!=="RECEIVED"?<Reason inline kind={form.reasonKind} detail={form.reason} options={STORE_EDIT_REASONS} onChange={(reasonKind,reason)=>setForm(f=>f?{...f,reasonKind,reason}:f)}/>:null}
   <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>setForm(null)}>取消</button><button type="submit" className="cy-op-button primary" disabled={busy}>儲存</button></div>
  </form></Dialog>:null}
  {work?<Dialog open dismissible={false} title={STORE_REPAIR_STEP_LABELS[work.step]+"日期"} onClose={()=>!busy&&setWork(null)}><form onKeyDown={enterAdvancesThenSubmits} onSubmit={e=>void saveWork(e)}>
   <StoreMilestoneDateFields label={STORE_REPAIR_STEP_LABELS[work.step]} value={work.value} withoutDate={work.withoutDate} min={work.repair.receivedDate} max={today()} onChange={patch=>setWork(w=>w?{...w,...patch}:w)}/>
   {work.mode==="advance"&&work.step==="INSPECTED"?<><SegmentedControl label="檢測結果" options={[{value:"GOOD",label:"無異常"},{value:"BAD",label:"異常"}]} value={work.inspectResult} onChange={inspectResult=>setWork(w=>w?{...w,inspectResult}:w)}/>{work.inspectResult==="BAD"?<Field label="問題說明" required size="l"><input className="cy-op-input" maxLength={200} value={work.inspectProblem} onChange={e=>setWork(w=>w?{...w,inspectProblem:e.target.value}:w)}/></Field>:null}</>:null}
   {work.mode==="advance"&&work.step==="SENT"?<StoreShippingFields carrier={work.carrier} tracking={work.tracking} onChange={patch=>setWork(w=>w?{...w,...patch}:w)}/>:null}
   {work.mode==="advance"&&work.step==="RETURNED"?<><SegmentedControl label="歸還方式" options={[{value:"PICKUP",label:"自取"},{value:"SHIPPING",label:"寄送"}]} value={work.returnMethod} onChange={returnMethod=>setWork(w=>w?{...w,returnMethod}:w)}/>{work.returnMethod==="SHIPPING"?<StoreShippingFields carrier={work.carrier} tracking={work.tracking} onChange={patch=>setWork(w=>w?{...w,...patch}:w)}/>:null}</>:null}
   <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>setWork(null)}>取消</button><button type="submit" className="cy-op-button primary" disabled={busy}>{work.step==="RETURNED"&&work.mode==="advance"?"儲存並結案":"儲存"}</button></div>
  </form></Dialog>:null}
  {action?<Dialog open dismissible={false} title={{cancel:"取消維修",undoCancel:"撤回取消維修",undoClose:"撤回結案",rollback:"退回上一步"}[action.kind]} onClose={()=>!busy&&setAction(null)}><form onKeyDown={enterAdvancesThenSubmits} onSubmit={e=>void saveAction(e)}>
   {action.kind==="cancel"?<><p>取消維修後仍必須通知顧客，並完成機器歸還才會結案。</p><Reason kind={action.reasonKind} detail={action.reason} options={STORE_REPAIR_CANCEL_REASONS} onChange={(reasonKind,reason)=>setAction(a=>a?{...a,reasonKind,reason}:a)}/></>:action.kind==="rollback"?<Field label="退回理由" required size="l"><input className="cy-op-input" maxLength={300} value={action.reason} onChange={e=>setAction(a=>a?{...a,reason:e.target.value}:a)}/></Field>:<p>確定撤回此操作嗎？</p>}
   <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>setAction(null)}>取消</button><button type="submit" className="cy-op-button primary" disabled={busy}>確認</button></div>
  </form></Dialog>:null}
 </div>;
}
