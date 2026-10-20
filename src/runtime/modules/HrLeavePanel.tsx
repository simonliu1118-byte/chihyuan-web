import {useCallback,useEffect,useState} from "react";
import {apiRequest} from "../../api/client";
import {taipeiToday} from "../../../shared/erp-query-history";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {HrLeaveDialog,type LeaveTypeOption,type LeavePerson} from "./HrLeaveDialog";
import {Dialog} from "../../ui/overlays/Dialog";
import {enterAdvancesFields} from "../../ui/foundation/enter-advance";
import "./hr-phase2b.css";
type Sum={employeeNo:string;name:string;id:number;storeId:number;employmentType:"full"|"half"|"casual";used:Record<string,number>;pending:number;comp:{overtimeMinutes:number;holidayMinutes:number}};
type Summary={year:number;types:LeaveTypeOption[];employees:Sum[]};
type Entry={id:number;batch_id:string;work_date:string;minutes:number;whole_day:number;reason:string;cancelled_at:string|null;cancel_reason:string|null;leave_type_id:number;attachmentCount:number};
type Credit={id:number;kind:string;remainingMinutes:number;expiresOn:string;expired:boolean;expiringSoon:boolean};
type Detail={records:Entry[];pending:{work_date:string;leave_type_id:number}[];types:LeaveTypeOption[];metrics:{code:string;usedMinutes:number;limitMinutes:number|null}[];annual:{id:number;periodStart:string;periodEnd:string;entitledDays:number;carriedInDays:number;remainingDays:number;expiredUnpaidDays:number;notifiedOn:string|null}[];comp:{overtimeMinutes:number;holidayMinutes:number;holidayAdvanceMinutes:number;credits:Credit[]}};
const hrs=(minutes:number)=>(minutes/60).toFixed(1);
export function HrLeavePanel(){
 const [year,setYear]=useState(Number(taipeiToday().slice(0,4))),[store,setStore]=useState(""),[summary,setSummary]=useState<Summary|null>(null);
 const [person,setPerson]=useState<LeavePerson|null>(null),[detail,setDetail]=useState<Detail|null>(null);
 const [request,setRequest]=useState<LeavePerson|null>(null),[initialDate,setInitialDate]=useState<string|undefined>(undefined);
 const [error,setError]=useState(""),[loading,setLoading]=useState(false),[noteDate,setNoteDate]=useState(taipeiToday());
 const [cancelTarget,setCancelTarget]=useState<{batchId:string;dates?:string[]}|null>(null),[cancelReason,setCancelReason]=useState("");
 const [grantOpen,setGrantOpen]=useState(false),[grantKind,setGrantKind]=useState<"holiday"|"grant">("grant"),[grantHours,setGrantHours]=useState("8"),[holidayDate,setHolidayDate]=useState(""),[holidayName,setHolidayName]=useState("");
 const [printYear,setPrintYear]=useState<{id:number;periodStart:string;periodEnd:string;entitledDays:number;carriedInDays:number;notifiedOn:string|null}|null>(null);
 const {confirm,confirmationDialog}=useConfirmation();
 const refresh=useCallback(async()=>{setLoading(true);try{const x=await apiRequest<Summary>("/api/business/hr/leave/summary?year="+year+(store?"&storeId="+store:""));setSummary(x);setError("")}
  catch(e){setError(e instanceof Error?e.message:"無法讀取請假總表")}finally{setLoading(false)}},[year,store]);
 const detailRefresh=useCallback(async()=>{if(!person)return;try{setDetail(await apiRequest<Detail>("/api/business/hr/employees/"+person.id+"/leave?year="+year));setError("")}catch(e){setError(String(e))}},[person,year]);
 useEffect(()=>{void refresh()},[refresh]);useEffect(()=>{void detailRefresh()},[detailRefresh]);
 const present=summary?.employees.find(e=>e.id===person?.id);
 function openPerson(x:Sum){setPerson({id:x.id,name:x.name,employee_no:x.employeeNo,employment_type:x.employmentType});setDetail(null)}
 async function submitCancel(){
  if(!cancelTarget||!cancelReason.trim())return;
  try{await apiRequest("/api/business/hr/leave-requests/"+cancelTarget.batchId+"/cancel",{method:"POST",json:{reason:cancelReason,dates:cancelTarget.dates}});
    setCancelTarget(null);setCancelReason("");await Promise.all([refresh(),detailRefresh()])}
  catch(e){setError(e instanceof Error?e.message:"銷假失敗")}
 }
 async function submitGrant(){
  if(!person)return;
  try{await apiRequest("/api/business/hr/employees/"+person.id+"/comp-time",{method:"POST",json:{kind:grantKind,minutes:Math.round(Number(grantHours)*60),holidayDate:grantKind==="holiday"?holidayDate:undefined,holidayName:grantKind==="holiday"?holidayName:undefined}});
   setGrantOpen(false);await detailRefresh()}
  catch(e){setError(e instanceof Error?e.message:"給予失敗")}
 }
 function add(){const first=summary?.employees[0];if(!first)return;const x=person??{id:first.id,employee_no:first.employeeNo,name:first.name,employment_type:first.employmentType};setRequest(x);setInitialDate(undefined)}
 return <section className="cy-op-module cy-hr-leave">
  {confirmationDialog}
  <div className="cy-op-panel hr-leave-toolbar"><label>年度<input type="number" min="2000" max="2200" className="cy-op-input" value={year} onChange={e=>setYear(Number(e.target.value))}/></label>
   <label>門市 ID<input type="number" min="1" className="cy-op-input" placeholder="全部" value={store} onChange={e=>setStore(e.target.value)}/></label>
   <button className="cy-op-button primary" onClick={add}>＋請假</button></div>
  {error?<p role="alert" className="cy-notice cy-notice-danger">{error}</p>:null}
  <div className="cy-md cy-hr-leave-md" data-pane={person?"detail":"list"}>
   <div className="cy-op-panel cy-md-list"><h3>請假總表　{year}</h3>
    <div className="cy-op-table-wrap"><table className="cy-op-table"><thead><tr><th>員工</th><th>特</th><th>事</th><th>病</th><th>補</th><th>換</th><th>其他</th><th>待補</th><th>補休餘額</th></tr></thead><tbody>
     {summary?.employees.map(e=><tr key={e.id} onClick={()=>openPerson(e)} className="hr-leave-row">
      <th scope="row"><button className="cy-op-button" onClick={()=>openPerson(e)}>{e.employeeNo} {e.name}</button></th>
      {["特","事","病","補","換"].map(c=><td key={c}>{hrs(e.used[c]??0)}h</td>)}
      <td>{hrs(Object.entries(e.used).filter(([k])=>!["特","事","病","補","換"].includes(k)).reduce((n,[,v])=>n+v,0))}h</td>
      <td>{e.pending?<strong className="hr-leave-pending">{e.pending}</strong>:"—"}</td>
      <td>{hrs(e.comp.overtimeMinutes+e.comp.holidayMinutes)}h{e.comp.holidayMinutes<0?<small>預支</small>:null}</td>
     </tr>)}</tbody></table></div>
    {loading?<p>資料讀取中…</p>:null}
   </div>
   <div className="cy-op-panel cy-md-detail">
    {person?<><button className="cy-op-button" onClick={()=>setPerson(null)}>← 請假總表</button>
      <div className="cy-record-header"><h3>{person.employee_no} {person.name}</h3><button className="cy-op-button primary" onClick={()=>{setRequest(person);setInitialDate(undefined)}}>新增假單</button></div>
      <h4>假單紀錄</h4>
      {detail?.records.map(x=><div key={x.id} className="hr-leave-item">
       <span>{x.work_date.replaceAll("-","/")}　{detail.types.find(t=>t.id===x.leave_type_id)?.name}　{hrs(x.minutes)}h
        {x.cancelled_at?<small>（已銷假）</small>:null}{x.attachmentCount?<small>（附件 {x.attachmentCount} 張）</small>:null}</span>
       {!x.cancelled_at?<button className="cy-op-button" onClick={()=>setCancelTarget({batchId:x.batch_id,dates:[x.work_date]})}>銷假</button>:null}
      </div>)}
      <h4>待補假單</h4>{detail?.pending.map(x=><div key={x.work_date}><button className="cy-op-button" onClick={()=>{setRequest(person);setInitialDate(x.work_date)}}>{x.work_date}　補填假單</button></div>)}
      <h4>特休年度表</h4>
      <div className="cy-op-table-wrap"><table className="cy-op-table"><thead><tr><th>年度</th><th>應給</th><th>遞延</th><th>剩餘</th><th>到期未休</th><th>通知</th></tr></thead><tbody>
      {detail?.annual.map(x=><tr key={x.periodStart}><td>{x.periodStart}～{x.periodEnd}</td><td>{x.entitledDays}</td><td>{x.carriedInDays}</td><td>{x.remainingDays}</td><td>{x.expiredUnpaidDays}</td><td><button className="cy-op-button" onClick={()=>setPrintYear(x)}>列印通知</button><small>{x.notifiedOn??"未通知"}</small></td></tr>)}</tbody></table></div>
      <h4>補休帳戶</h4><p>加班／給予補休 {hrs(detail?.comp.overtimeMinutes??0)}h、換休 {hrs(detail?.comp.holidayMinutes??0)}h
       {(detail?.comp.holidayAdvanceMinutes??0)>0?"（已預支）":""}</p>
      {detail?.comp.credits.map(x=><p key={x.kind+x.id} className={x.expired?"hr-expired":x.expiringSoon?"hr-expiring":""}>
       {x.kind}　剩餘 {hrs(x.remainingMinutes)}h，至 {x.expiresOn}{x.expired?"（已到期）":""}
       <button className="cy-op-button" onClick={async()=>{try{await apiRequest("/api/business/hr/comp-time/"+(x.kind==="overtime"?"overtime":"grant")+"/"+(x.kind==="overtime"?x.id:x.id-100000000)+"/extend",{method:"POST"});await detailRefresh()}catch(e){setError(String(e))}}}>再延一個月</button>
       {x.kind==="overtime"&&x.expired&&x.remainingMinutes>0?<button className="cy-op-button" onClick={async()=>{try{await apiRequest("/api/business/hr/comp-time/overtime/"+x.id+"/settle",{method:"POST"});await detailRefresh()}catch(e){setError(String(e))}}}>轉加班費</button>:null}
      </p>)}
      <button className="cy-op-button" onClick={()=>setGrantOpen(true)}>＋給予補休／換休</button>
    </>:<p>選擇員工查看假單、特休及補休。</p>}
   </div>
  </div>
  <Dialog open={cancelTarget!==null} title="銷假確認" onClose={()=>setCancelTarget(null)} size="small">
   <form onSubmit={e=>{e.preventDefault();void submitCancel()}} onKeyDown={enterAdvancesFields} className="cy-op-form">
    <label>銷假原因（必填）<textarea className="cy-op-input" required value={cancelReason} onChange={e=>setCancelReason(e.target.value)}/></label>
    <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={()=>setCancelTarget(null)}>返回</button><button className="cy-op-button primary">確認銷假</button></div>
   </form>
  </Dialog>
  <Dialog open={grantOpen} title="給予補休／國定假日換休" onClose={()=>setGrantOpen(false)} size="small">
   <form onSubmit={e=>{e.preventDefault();void submitGrant()}} onKeyDown={enterAdvancesFields} className="cy-op-form">
    <label>種類<select className="cy-op-input" value={grantKind} onChange={e=>setGrantKind(e.target.value as "holiday"|"grant")}><option value="grant">管理員給予補休</option><option value="holiday">國定假日換休</option></select></label>
    <label>時數（0.5 小時）<input className="cy-op-input" type="number" min=".5" step=".5" value={grantHours} onChange={e=>setGrantHours(e.target.value)}/></label>
    {grantKind==="holiday"?<><label>國定假日日期<input className="cy-op-input" type="date" max="9999-12-31" required value={holidayDate} onChange={e=>setHolidayDate(e.target.value)}/></label><label>國定假日名稱<input className="cy-op-input" required value={holidayName} onChange={e=>setHolidayName(e.target.value)}/></label></>:null}
    <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={()=>setGrantOpen(false)}>取消</button><button className="cy-op-button primary">儲存</button></div>
   </form>
  </Dialog>
  <Dialog open={printYear!==null} title="特休書面通知" onClose={()=>setPrintYear(null)} size="large">
   {printYear&&person?<div className="hr-leave-notice"><h1>特別休假書面通知</h1>
     <p>公司名稱：志遠企業</p><p>員工編號／姓名：{person.employee_no}　{person.name}</p>
     <p>特休年度：{printYear.periodStart.replaceAll("-","/")} 至 {printYear.periodEnd.replaceAll("-","/")}</p>
     <p>本年度特休：{printYear.entitledDays} 天　上年度遞延：{printYear.carriedInDays} 天</p><p>合計可休：{printYear.entitledDays+printYear.carriedInDays} 天</p>
     <p>通知日期：{noteDate.replaceAll("-","/")}</p><p className="hr-leave-signature">員工簽收：___________________　日期：___________________</p>
   </div>:null}
   <div className="cy-op-form-footer no-print"><label>通知日期<input type="date" max="9999-12-31" className="cy-op-input" value={noteDate} onChange={e=>setNoteDate(e.target.value)}/></label>
     <button className="cy-op-button" onClick={()=>window.print()}>列印 A4</button>
     <button className="cy-op-button primary" onClick={async()=>{try{await apiRequest("/api/business/hr/annual-leave-years/"+printYear?.id+"/notice",{method:"PATCH",json:{notifiedOn:noteDate}});setPrintYear(null);await detailRefresh()}catch(e){setError(String(e))}}}>記錄已通知</button>
   </div>
  </Dialog>
  <HrLeaveDialog person={request} types={summary?.types??[]} initialDate={initialDate} onClose={()=>setRequest(null)} onSaved={()=>{void refresh();void detailRefresh()}}/>
 </section>;
}
