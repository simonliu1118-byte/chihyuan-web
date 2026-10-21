import {Field,CheckField,FormSection} from "../../ui/forms/Field";
import {useCallback,useEffect,useState} from "react";
import {apiRequest} from "../../api/client";
import {taipeiToday} from "../../../shared/erp-query-history";
import {HrLeaveDialog,type LeaveTypeOption,type LeavePerson,type CompletedLeaveInfo} from "./HrLeaveDialog";
import {Dialog} from "../../ui/overlays/Dialog";
import {enterAdvancesFields} from "../../ui/foundation/enter-advance";
import "./hr-phase2b.css";
type Advance={holidayDate:string;holidayName:string;outstandingMinutes:number};
type Credit={id:number;kind:"overtime"|"holiday"|"grant";minutes:number;remainingMinutes:number;issuedOn:string;expiresOn:string;expired:boolean;expiringSoon:boolean;holidayName?:string|null};
type Comp={balanceMinutes:number;advanceMinutes:number;advances:Advance[];credits:Credit[]};
type Sum={employeeNo:string;name:string;id:number;storeId:number;employmentType:"full"|"half"|"casual";annualRemainingMinutes:number;used:Record<string,number>;pending:number;comp:Comp};
type Summary={year:number;types:LeaveTypeOption[];employees:Sum[]};
type Entry={id:number;batch_id:string;work_date:string;start_time:string|null;end_time:string|null;minutes:number;whole_day:number;reason:string;cancelled_at:string|null;cancel_reason:string|null;leave_type_id:number;advance_holiday_name:string|null;attachmentCount:number;attachmentIds:number[]};
type Annual={id:number;periodStart:string;periodEnd:string;entitledMinutes:number;carriedInDays:number;remainingMinutes:number;expiredUnpaidMinutes:number;notifiedOn:string|null;partTime:boolean;overridden:boolean;basis:string|null};
type Detail={records:Entry[];pending:{work_date:string;leave_type_id:number}[];types:LeaveTypeOption[];annual:Annual[];comp:Comp};
const MAIN=["特","事","病","補"];
const hrs=(minutes:number)=>(Math.round(minutes/30)/2).toFixed(1);
const ymd=(x:string)=>x.replaceAll("-","/");
/** Full-time leave reads in days (8 hours); part-time in hours. */
const amount=(minutes:number,partTime:boolean)=>partTime?hrs(minutes)+" 小時":(minutes/480).toFixed(minutes%240?2:1).replace(/\.0+$/,"")+" 天";
const source=(c:Credit)=>c.kind==="overtime"?"加班 "+ymd(c.issuedOn):c.kind==="holiday"?"國定假日 "+(c.holidayName??"")+" "+ymd(c.issuedOn):"管理員給予 "+ymd(c.issuedOn);
const quota=(minutes:number,code:string,types:LeaveTypeOption[])=>{
 const type=types.find(x=>x.code===code),limit=type?.quota_days;
 const period={calendar_year:"年",month:"月",event:"次",two_years:"兩年"}[type?.quota_period??""]??"";
 return hrs(minutes)+(limit!=null?" / "+(limit*8)+(period?"／"+period:""):"");
};
export function HrLeavePanel({initialEmployeeId}:{initialEmployeeId?:number|null}={}){
 const [year,setYear]=useState(Number(taipeiToday().slice(0,4))),[store,setStore]=useState(""),[stores,setStores]=useState<{id:number;name:string}[]>([]);
 const [summary,setSummary]=useState<Summary|null>(null),[person,setPerson]=useState<LeavePerson|null>(null),[detail,setDetail]=useState<Detail|null>(null);
 const [request,setRequest]=useState<{person:LeavePerson|null;choose?:boolean;date?:string;typeId?:number;completed?:CompletedLeaveInfo|null}|null>(null);
 const [viewAttachmentIds,setViewAttachmentIds]=useState<number[]|null>(null);
 const [error,setError]=useState(""),[loading,setLoading]=useState(false),[noteDate,setNoteDate]=useState(taipeiToday());
 const [grantOpen,setGrantOpen]=useState(false),[grantKind,setGrantKind]=useState<"holiday"|"grant">("holiday"),[grantHours,setGrantHours]=useState("8"),[holidayDate,setHolidayDate]=useState("");
 const [holidays,setHolidays]=useState<{date:string;name:string}[]>([]);
 const [adjust,setAdjust]=useState<Annual|null>(null),[adjustHours,setAdjustHours]=useState("");
 const [printYear,setPrintYear]=useState<Annual|null>(null);
 useEffect(()=>{void apiRequest<{id:number;name:string}[]>("/api/business/hr/settings/stores").then(setStores).catch(()=>{})},[]);
 useEffect(()=>{void Promise.all([year-1,year,year+1].map(y=>apiRequest<{date:string;name:string}[]>("/api/business/hr/settings/holidays?year="+y)))
  .then(x=>setHolidays(x.flat().sort((a,b)=>a.date.localeCompare(b.date)))).catch(()=>setHolidays([]))},[year]);
 const refresh=useCallback(async()=>{setLoading(true);try{setSummary(await apiRequest<Summary>("/api/business/hr/leave/summary?year="+year+(store?"&storeId="+store:"")));setError("")}
  catch(e){setError(e instanceof Error?e.message:"無法讀取請假總表")}finally{setLoading(false)}},[year,store]);
 const detailRefresh=useCallback(async()=>{if(!person)return;try{setDetail(await apiRequest<Detail>("/api/business/hr/employees/"+person.id+"/leave?year="+year));setError("")}
  catch(e){setError(e instanceof Error?e.message:"無法讀取假單")}},[person,year]);
 useEffect(()=>{void refresh()},[refresh]);useEffect(()=>{void detailRefresh()},[detailRefresh]);
 useEffect(()=>{if(initialEmployeeId==null||!summary)return;const match=summary.employees.find(x=>x.id===initialEmployeeId);
  if(match)setPerson({id:match.id,employee_no:match.employeeNo,name:match.name,employment_type:match.employmentType})},[initialEmployeeId,summary]);
 const people:LeavePerson[]=(summary?.employees??[]).map(x=>({id:x.id,name:x.name,employee_no:x.employeeNo,employment_type:x.employmentType}));
 const partTime=person?.employment_type!=="full";
 const act=async(work:()=>Promise<unknown>,fallback:string)=>{try{await work();await Promise.all([refresh(),detailRefresh()])}catch(e){setError(e instanceof Error?e.message:fallback)}};
 async function submitGrant(){
  if(!person)return;
  await act(()=>apiRequest("/api/business/hr/employees/"+person.id+"/comp-time",{method:"POST",json:{kind:grantKind,minutes:Math.round(Number(grantHours)*60),holidayDate:grantKind==="holiday"?holidayDate:undefined}}),"給予補休失敗");
  setGrantOpen(false);
 }
 async function submitAdjust(){
  if(!adjust)return;
  await act(()=>apiRequest("/api/business/hr/annual-leave-years/"+adjust.id+"/entitlement",{method:"PATCH",json:{minutes:adjustHours.trim()===""?null:Math.round(Number(adjustHours)*60)}}),"調整失敗");
  setAdjust(null);
 }
 function printNotice(){document.body.classList.add("hr-printing-notice");window.addEventListener("afterprint",()=>document.body.classList.remove("hr-printing-notice"),{once:true});window.print()}
 const owed=detail?.comp.advances.filter(a=>a.outstandingMinutes>0)??[];
 return <section className="cy-op-module cy-hr-leave">
  <div className="cy-op-panel hr-leave-toolbar">
   <button type="button" className="cy-op-button" onClick={()=>setYear(y=>y-1)}>上一年</button><strong>{year} 年</strong><button type="button" className="cy-op-button" onClick={()=>setYear(y=>y+1)}>下一年</button>
   <label>門市<select className="cy-op-input" value={store} onChange={e=>setStore(e.target.value)}><option value="">全部</option>{stores.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   <button type="button" className="cy-op-button primary" disabled={!people.length} onClick={()=>setRequest({person:person??people[0],choose:true})}>＋ 請假</button>
  </div>
  {error?<p role="alert" className="cy-notice cy-notice-danger">{error}</p>:null}
  <div className="cy-md cy-hr-leave-md" data-pane={person?"detail":"list"}>
   <div className="cy-op-panel cy-md-list"><h3>{year} 年請假總表</h3>
    <div className="cy-op-table-wrap"><table className="cy-op-table hr-leave-summary"><thead><tr><th>員工</th>{MAIN.map(c=><th key={c}>{c}（時）</th>)}<th>其他</th><th>待補假單</th><th>特休剩餘</th><th>補休餘額</th></tr></thead><tbody>
     {summary?.employees.map(e=><tr key={e.id} className={"hr-leave-row"+(person?.id===e.id?" active":"")} onClick={()=>{setPerson(people.find(x=>x.id===e.id)!);setDetail(null)}}>
      <th scope="row">{e.employeeNo} {e.name}</th>
      {MAIN.map(c=><td key={c}>{quota(e.used[c]??0,c,summary.types)}</td>)}
      <td title={summary.types.filter(t=>!MAIN.includes(t.code)&&(e.used[t.code]??0)>0).map(t=>t.name+" "+hrs(e.used[t.code])+" 小時").join("、")}>{hrs(Object.entries(e.used).filter(([k])=>!MAIN.includes(k)).reduce((n,[,v])=>n+v,0))}</td>
      <td>{e.pending?<strong className="hr-leave-pending">{e.pending}</strong>:"—"}</td>
      <td>{amount(e.annualRemainingMinutes,e.employmentType!=="full")}</td>
      <td>{hrs(e.comp.balanceMinutes)} 小時{e.comp.advanceMinutes?<small className="hr-leave-advance">預支 {hrs(e.comp.advanceMinutes)}</small>:null}</td>
     </tr>)}</tbody></table></div>
    {loading?<p>資料讀取中…</p>:summary&&!summary.employees.length?<p>沒有員工。</p>:null}
   </div>
   <div className="cy-op-panel cy-md-detail">
    {person?<>
     <button type="button" className="cy-op-button quiet cy-md-back" onClick={()=>setPerson(null)}>← 請假總表</button>
     <div className="cy-record-header"><h3>{person.employee_no} {person.name}　{year} 年</h3>
      <button type="button" className="cy-op-button primary" onClick={()=>setRequest({person})}>＋ 請假</button></div>
     {detail?.pending.length?<><h4>待補假單</h4><div className="hr-cell-choices">{detail.pending.map(x=><button type="button" key={x.work_date} className="cy-op-button hr-leave-pending-title"
      onClick={()=>setRequest({person,date:x.work_date,typeId:x.leave_type_id})}>{ymd(x.work_date)} {detail.types.find(t=>t.id===x.leave_type_id)?.code} 補假單</button>)}</div></>:null}
     <h4>假單</h4>
     {detail&&!detail.records.length?<p>今年還沒有假單。</p>:null}
     {detail?.records.map(x=><div key={x.id} className={"hr-leave-item"+(x.cancelled_at?" cancelled":"")}>
      <span>{ymd(x.work_date)}{x.whole_day?"":"　"+x.start_time+"–"+x.end_time}　{detail.types.find(t=>t.id===x.leave_type_id)?.name}　{hrs(x.minutes)} 小時
       {x.advance_holiday_name?<small className="hr-leave-advance">預支 {x.advance_holiday_name}</small>:null}
       {x.reason?<small>　{x.reason}</small>:null}{x.cancelled_at?<small>（已銷假：{x.cancel_reason}）</small>:null}</span>
      <span>{x.attachmentCount?<button type="button" className="cy-op-button compact quiet" onClick={()=>setViewAttachmentIds(x.attachmentIds)}>證明 {x.attachmentCount} 張</button>:null}
       {!x.cancelled_at?<button type="button" className="cy-op-button compact" onClick={()=>setRequest({person,completed:{batchId:x.batch_id,date:x.work_date,code:detail.types.find(t=>t.id===x.leave_type_id)?.code??"",minutes:x.minutes}})}>銷假</button>:null}</span>
     </div>)}
     <h4>特休年度</h4>
     <div className="cy-op-table-wrap"><table className="cy-op-table"><thead><tr><th>特休年度</th><th>應給</th><th>遞延進來</th><th>剩餘</th><th>到期未休</th><th>書面通知</th></tr></thead><tbody>
      {detail?.annual.map(x=><tr key={x.periodStart}><td>{ymd(x.periodStart)}～{ymd(x.periodEnd)}</td>
       <td>{amount(x.entitledMinutes,partTime)}{x.partTime?<button type="button" className="cy-op-button compact quiet" title={basisText(x)} onClick={()=>{setAdjust(x);setAdjustHours(x.overridden?hrs(x.entitledMinutes):"")}}>{x.overridden?"已調整":"依工時比例"}</button>:null}</td>
       <td>{amount(x.carriedInDays*480,partTime)}</td><td>{amount(x.remainingMinutes,partTime)}</td><td>{x.expiredUnpaidMinutes?amount(x.expiredUnpaidMinutes,partTime):"—"}</td>
       <td><button type="button" className="cy-op-button compact" onClick={()=>setPrintYear(x)}>列印通知</button> <small>{x.notifiedOn?ymd(x.notifiedOn):"未通知"}</small></td></tr>)}</tbody></table></div>
     <h4>補休帳戶</h4>
     <p>餘額 <strong>{hrs(detail?.comp.balanceMinutes??0)} 小時</strong></p>
     {owed.map(a=><p key={a.holidayDate} className="hr-leave-owed">預支 −{hrs(a.outstandingMinutes)} 小時（{ymd(a.holidayDate)} {a.holidayName}）：這個國定假日的補休給予後才會抵銷</p>)}
     {detail?.comp.credits.filter(x=>x.remainingMinutes>0||!x.expired).map(x=><div key={x.kind+x.id} className={"hr-leave-item "+(x.expired?"hr-expired":x.expiringSoon?"hr-expiring":"")}>
      <span>{source(x)}　剩 {hrs(x.remainingMinutes)}／{hrs(x.minutes)} 小時，{ymd(x.expiresOn)} 到期{x.expired?"（已到期）":x.expiringSoon?"（快到期）":""}</span>
      <span>{x.remainingMinutes>0?<button type="button" className="cy-op-button compact" onClick={()=>void act(()=>apiRequest("/api/business/hr/comp-time/"+(x.kind==="overtime"?"overtime/"+x.id:"grant/"+(x.id-100000000))+"/extend",{method:"POST"}),"延期失敗")}>再延一個月</button>:null}
       {x.kind==="overtime"&&x.expired&&x.remainingMinutes>0?<button type="button" className="cy-op-button compact" onClick={()=>void act(()=>apiRequest("/api/business/hr/comp-time/overtime/"+x.id+"/settle",{method:"POST"}),"結清失敗")}>轉加班費</button>:null}</span>
     </div>)}
     <button type="button" className="cy-op-button" onClick={()=>{setGrantKind("holiday");setHolidayDate(owed[0]?.holidayDate??"");setGrantHours(partTime?"4":"8");setGrantOpen(true)}}>＋ 給予補休</button>
    </>:<p className="cy-md-empty">選擇員工查看假單、特休與補休。</p>}
   </div>
  </div>
  <Dialog open={grantOpen} title="給予補休" onClose={()=>setGrantOpen(false)} size="small">
   <form onKeyDown={enterAdvancesFields} className="cy-op-form" onSubmit={e=>{e.preventDefault();void submitGrant()}}>
    <FormSection>
    <Field label="來源" size="s"><select className="cy-op-input" value={grantKind} onChange={e=>setGrantKind(e.target.value as "holiday"|"grant")}><option value="holiday">國定假日</option><option value="grant">管理員給予</option></select></Field>
    {grantKind==="holiday"?<Field label="國定假日" size="m" required><select className="cy-op-input" value={holidayDate} onChange={e=>setHolidayDate(e.target.value)}><option value="">請選擇</option>
     {holidays.map(h=><option key={h.date} value={h.date}>{ymd(h.date)} {h.name}{owed.some(a=>a.holidayDate===h.date)?"（有預支）":""}</option>)}</select></Field>:null}
    <Field label="時數（0.5 小時為單位）" size="s" required><input className="cy-op-input" type="number" min=".5" step=".5" value={grantHours} onChange={e=>setGrantHours(e.target.value)}/></Field>
    <p>補休在{grantKind==="holiday"?"國定假日當月":"給予當月"}的下個月底到期。</p>
    <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={()=>setGrantOpen(false)}>取消</button><button className="cy-op-button primary">給予</button></div>
   
    </FormSection>
  </form>
  </Dialog>
  <Dialog open={adjust!==null} title="調整特休應給時數" onClose={()=>setAdjust(null)} size="small">
   <form onKeyDown={enterAdvancesFields} className="cy-op-form" onSubmit={e=>{e.preventDefault();void submitAdjust()}}>
    <FormSection>
    {adjust?<p>{ymd(adjust.periodStart)}～{ymd(adjust.periodEnd)}。{basisText(adjust)}</p>:null}
    <Field label="應給時數（空白＝依出勤工時比例計算）" size="s"><input className="cy-op-input" type="number" min="0" step=".5" value={adjustHours} onChange={e=>setAdjustHours(e.target.value)}/></Field>
    <p>用於 CY Web 上線前的工時（沒有出勤紀錄）等情況。</p>
    <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={()=>setAdjust(null)}>取消</button><button className="cy-op-button primary">儲存</button></div>
   
    </FormSection>
  </form>
  </Dialog>
  <Dialog open={printYear!==null} title="特休書面通知" onClose={()=>setPrintYear(null)} size="large">
   {printYear&&person?<div className="hr-leave-notice"><h1>特別休假書面通知</h1>
     <p>員工：{person.employee_no}　{person.name}</p>
     <p>特休年度：{ymd(printYear.periodStart)} 至 {ymd(printYear.periodEnd)}</p>
     <p>本年度特休：{amount(printYear.entitledMinutes,partTime)}　上年度遞延：{amount(printYear.carriedInDays*480,partTime)}</p>
     <p>合計可休：{amount(printYear.entitledMinutes+printYear.carriedInDays*480,partTime)}</p>
     <p>請於特休年度內排定休假；年度終結未休完的天數依勞動基準法第 38 條遞延或發給工資。</p>
     <p>通知日期：{ymd(noteDate)}</p><p className="hr-leave-signature">雇主（蓋章）：___________________</p><p>員工簽收：___________________　日期：___________________</p>
   </div>:null}
   <div className="cy-op-form-footer no-print"><label>通知日期<input type="date" max="9999-12-31" className="cy-op-input" value={noteDate} onChange={e=>setNoteDate(e.target.value)}/></label>
    <button type="button" className="cy-op-button" onClick={printNotice}>列印</button>
    <button type="button" className="cy-op-button primary" onClick={()=>{const id=printYear?.id;setPrintYear(null);void act(()=>apiRequest("/api/business/hr/annual-leave-years/"+id+"/notice",{method:"PATCH",json:{notifiedOn:noteDate}}),"記錄失敗")}}>記錄已通知</button>
   </div>
  </Dialog>
  <Dialog open={viewAttachmentIds!==null} title="請假證明" size="large" onClose={()=>setViewAttachmentIds(null)}>
   <div className="hr-leave-attachments">{viewAttachmentIds?.map((id,index)=><img src={"/api/business/hr/leave-attachments/"+id} alt={"請假證明 "+(index+1)} key={id} loading="lazy"/>)}</div>
  </Dialog>
  <HrLeaveDialog person={request?.person??null} people={request?.choose?people:undefined} types={summary?.types??[]} initialDate={request?.date} initialTypeId={request?.typeId} completed={request?.completed}
   onClose={()=>setRequest(null)} onSaved={()=>{void refresh();void detailRefresh()}}/>
 </section>;
}
function basisText(x:Annual){
 if(x.overridden)return "已由超級管理員調整。";
 if(!x.basis)return "";
 const b=JSON.parse(x.basis) as {from:string;to:string;workedMinutes:number;fullMinutes:number};
 return "依 "+ymd(b.from)+"～"+ymd(b.to)+" 出勤 "+hrs(b.workedMinutes)+" 小時，占全時 "+hrs(b.fullMinutes)+" 小時的 "+Math.round(b.workedMinutes/b.fullMinutes*100)+"%。";
}
