import {useCallback,useEffect,useMemo,useState,type KeyboardEvent} from "react";
import {apiRequest} from "../../api/client";
import {taipeiToday} from "../../../shared/erp-query-history";
import {useUnsavedChangesGuard} from "../../ui/foundation/useUnsavedChangesGuard";
import {Dialog} from "../../ui/overlays/Dialog";
import type {RosterResult,RosterViolation} from "../../../shared/hr-roster";
import "./hr-phase2a.css";
type Store={id:number;name:string;cycle_anchor_date:string;rules_template:string};
type Staff={id:number;employee_no:string;name:string;job_title_id:number|null;job_title_name:string|null;roster_sort:number;employment_type:"full"|"half"|"casual";schedule_mode:"shift"|"hours"|"none";skip_roster_checks:number};
type Shift={id:number;code:string;name:string;is_active:number;normal_minutes:number};
type Leave={id:number;code:string;name:string;is_active:number};
type Cell={employee_id:number;work_date:string;kind:string;shift_type_id:number|null;leave_type_id:number|null;off_mark:string|null;hours:number|null;marker:string|null;note:string};
type Change={employeeId:number;date:string;kind:"shift"|"hours"|"off"|"leave"|null;offMark?:string;shiftTypeId?:number;leaveTypeId?:number;hours?:number;startTime?:string;endTime?:string;marker?:string;note?:string};
type Approval={employeeId:number;kind:"consecutive"|"over_eight";startDate:string;endDate:string;suggestion:string};
type Ro={store:Store;month:string;bounds:{start:string;finish:string;first:string;end:string};employees:Staff[];shifts:Shift[];leaveTypes:Leave[];
 holidays:{date:string;name:string}[];days:Cell[];classification:Record<string,RosterResult>;staffing:Record<string,Record<string,number>>;actualHours:Record<string,Record<string,number>>;notes:string;rules:string;approvals:unknown[]};
const ROOT="/api/business/hr",dayMs=86400000,weekdays=["日","一","二","三","四","五","六"];
const monthDates=(m:string)=>{const [y,n]=m.split("-").map(Number);return Array.from({length:new Date(Date.UTC(y,n,0)).getUTCDate()},(_,i)=>m+"-"+String(i+1).padStart(2,"0"))};
const monthOffset=(m:string,by:number)=>{const d=new Date(m+"-01T00:00:00Z");d.setUTCMonth(d.getUTCMonth()+by);return d.toISOString().slice(0,7)};
export function HrRosterPanel() {
 const [stores,setStores]=useState<Store[]>([]),[storeId,setStoreId]=useState(0),[month,setMonth]=useState(taipeiToday().slice(0,7));
 const [data,setData]=useState<Ro|null>(null),[changes,setChanges]=useState<Record<string,Change>>({});
 const [notes,setNotes]=useState(""),[rules,setRules]=useState(""),[loading,setLoading]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[violations,setViolations]=useState<(RosterViolation&{employeeId:number})[]>([]);
 const [pending,setPending]=useState<Approval[]>([]);
 const [cell,setCell]=useState<{employeeId:number;date:string}|null>(null),[hours,setHours]=useState(""),[marker,setMarker]=useState(""),[note,setNote]=useState(""),[showAllLeave,setShowAllLeave]=useState(false);
 const [staffOpen,setStaffOpen]=useState(false);
 const dirty=Object.keys(changes).length>0||!!data&&(notes!==data.notes||rules!==data.rules);
 useUnsavedChangesGuard({active:dirty,blocked:loading,message:"排班尚未儲存，確定離開？"});
 useEffect(()=>{void apiRequest<Store[]>(ROOT+"/settings/stores").then(x=>{setStores(x);setStoreId(x[0]?.id??0)}).catch(e=>setError(String(e)))},[]);
 const reload=useCallback(async()=>{
  if(!storeId)return;setLoading(true);
  try{const d=await apiRequest<Ro>(ROOT+"/rosters/"+storeId+"/"+month);setData(d);setNotes(d.notes);setRules(d.rules);setChanges({});setViolations([]);setPending([]);setError("")}
  catch(e){setError(e instanceof Error?e.message:"排班查詢失敗")}finally{setLoading(false)}
 },[storeId,month]);
 useEffect(()=>{void reload()},[reload]);
 const dates=useMemo(()=>monthDates(month),[month]);
 const originals=useMemo(()=>new Map((data?.days??[]).map(x=>[x.employee_id+"|"+x.work_date,x])),[data]);
 const staged=useMemo(()=>{const result=new Map(originals);for(const [key,change] of Object.entries(changes)){
  if(change.kind===null)result.delete(key);
  else result.set(key,{employee_id:change.employeeId,work_date:change.date,kind:change.kind,shift_type_id:change.shiftTypeId??null,leave_type_id:change.leaveTypeId??null,off_mark:change.offMark??null,hours:change.hours??null,marker:change.marker??null,note:change.note??""});
 }return result},[originals,changes]);
 const emp=data?.employees.find(x=>x.id===cell?.employeeId);
 function edit(x:Change){setChanges(old=>({...old,[x.employeeId+"|"+x.date]:x}));setCell(null);setPending([]);setViolations([]);}
 function setChoice(kind:Change["kind"],more:Partial<Change>={}){if(cell)edit({employeeId:cell.employeeId,date:cell.date,kind,note,marker:marker||undefined,...more})}
 function open(id:number,d:string){const x=staged.get(id+"|"+d);setCell({employeeId:id,date:d});setHours(String(x?.hours??""));setMarker(x?.marker??"");setNote(x?.note??"");setShowAllLeave(false)}
 function keyDown(e:KeyboardEvent<HTMLButtonElement>,staff:Staff,date:string){
  if(!data)return;
  const pos=dates.indexOf(date),row=data.employees.findIndex(x=>x.id===staff.id);
  if(["ArrowRight","ArrowLeft","ArrowUp","ArrowDown"].includes(e.key)){
   e.preventDefault();const offset=e.key==="ArrowRight"?1:e.key==="ArrowLeft"?-1:0,vertical=e.key==="ArrowDown"?1:e.key==="ArrowUp"?-1:0;
   const d=dates[Math.max(0,Math.min(dates.length-1,pos+offset))],person=data.employees[Math.max(0,Math.min(data.employees.length-1,row+vertical))];
   document.getElementById("hr-roster-"+person.id+"-"+d)?.focus();return;
  }
  if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();edit({employeeId:staff.id,date,kind:null});return}
  if(e.key==="/"||e.key.toLowerCase()==="x"&&staff.employment_type==="casual"){
   e.preventDefault();edit({employeeId:staff.id,date,kind:"off",offMark:e.key==="/"?"slash":"x"});return;
  }
  const shift=data.shifts.find(x=>x.code===e.key&&x.is_active===1),leave=data.leaveTypes.find(x=>x.code===e.key&&x.is_active===1);
  if(shift&&staff.schedule_mode==="shift"){e.preventDefault();edit({employeeId:staff.id,date,kind:"shift",shiftTypeId:shift.id})}
  else if(leave){e.preventDefault();edit({employeeId:staff.id,date,kind:"leave",leaveTypeId:leave.id})}
 }
 function label(cellData:Cell|undefined,staff:Staff,date:string){
  if(!cellData)return "";
  if(cellData.kind==="off")return data?.classification[String(staff.id)]?.labels[date]==="regular_off"?"例":cellData.off_mark==="x"?"X":"/";
  if(cellData.kind==="shift")return data?.shifts.find(x=>x.id===cellData.shift_type_id)?.code??"";
  if(cellData.kind==="leave")return data?.leaveTypes.find(x=>x.id===cellData.leave_type_id)?.code??"";
  return typeof cellData.hours==="number"?String(cellData.hours):"";
 }
 async function submit(approve:Approval[]=[]){
  if(!data)return;setLoading(true);setError("");
  try{
   const response=await fetch(ROOT+"/rosters/"+storeId+"/"+month,{method:"PUT",credentials:"same-origin",headers:{"content-type":"application/json","accept":"application/json"},body:JSON.stringify({changes:Object.values(changes),notes,rules,approve})});
   const json=await response.json() as {ok:boolean;data?:{changedDays:number};error?:{code:string;message:string;items?:unknown[]}};
   if(!response.ok||!json.ok){
    if(json.error?.code==="HR_ROSTER_CONSECUTIVE"){setPending(json.error.items as Approval[]??[]);setNotice("需要主管核准")}
    else if(json.error?.code==="HR_ROSTER_VIOLATION"){setViolations(json.error.items as (RosterViolation&{employeeId:number})[]??[]);setError("未來日期有不可核准的違規，請手動調整")}
    else setError(json.error?.message??"儲存失敗");return;
   }
   setNotice("已儲存 "+(json.data?.changedDays??0)+" 個排班格");await reload();
  }catch(e){setError(e instanceof Error?e.message:"儲存失敗")}finally{setLoading(false)}
 }
 function navigate(offset:number){if(dirty&&!window.confirm("排班未儲存，放棄變更？"))return;setMonth(m=>monthOffset(m,offset))}
 const holidays=new Map(data?.holidays.map(x=>[x.date,x.name])??[]);
 return <section className="cy-op-module cy-hr-phase2a" aria-label="月排班表">
  <div className="cy-op-panel hr-roster-toolbar no-print">
   <label>門市<select className="cy-op-input" value={storeId} onChange={e=>{if(dirty&&!window.confirm("放棄未儲存變更？"))return;setStoreId(Number(e.target.value))}}>{stores.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   <button type="button" className="cy-op-button" onClick={()=>navigate(-1)}>上個月</button><strong>{month.replace("-"," 年 ")} 月</strong><button type="button" className="cy-op-button" onClick={()=>navigate(1)}>下個月</button>
   <button type="button" className="cy-op-button" onClick={()=>setStaffOpen(true)}>人員設定</button>
   <button type="button" className="cy-op-button" onClick={()=>window.print()}>列印</button>
   {dirty?<><button type="button" className="cy-op-button primary" disabled={loading} onClick={()=>void submit()}>儲存</button><button type="button" className="cy-op-button" disabled={loading} onClick={()=>void reload()}>取消</button></>:null}
  </div>
  {error?<p role="alert" className="cy-notice cy-notice-danger no-print">{error}</p>:null}
  {notice?<p role="status" className="cy-notice no-print">{notice}</p>:null}
  {data?<><h2 className="hr-roster-print-title">{data.store.name}　{month.replace("-","年")}月班表</h2>
   <div className="hr-roster-scroll"><table className="hr-roster-table"><thead><tr><th rowSpan={2}>職稱</th><th rowSpan={2}>日期／姓名</th>
    {dates.map(d=><th key={d} title={holidays.get(d)??""} className={(holidays.has(d)||[0,6].includes(new Date(d+"T00:00:00Z").getUTCDay())?"hr-holiday ":"")+(new Date(d+"T00:00:00Z").getUTCDay()===1&&(Date.parse(d+"T00:00:00Z")-Date.parse(data.store.cycle_anchor_date+"T00:00:00Z"))%(14*dayMs)===0?"hr-cycle ":"")}>{Number(d.slice(-2))}{holidays.has(d)?<small>{holidays.get(d)}</small>:null}</th>)}
    <th rowSpan={2}>備註</th></tr><tr>{dates.map(d=><th key={d}>{weekdays[new Date(d+"T00:00:00Z").getUTCDay()]}</th>)}</tr></thead>
    <tbody>{data.employees.map((staff,i)=><tr key={staff.id} className={i>0&&data.employees[i-1].job_title_id!==staff.job_title_id?"hr-group-start":""}>
     <td>{staff.job_title_name??"未設定"}</td><th scope="row">{staff.name}</th>
     {dates.map(d=>{const value=staged.get(staff.id+"|"+d),bad=violations.some(x=>x.employeeId===staff.id&&x.dates.includes(d)),sixth=data.classification[String(staff.id)]?.sixthDays.includes(d);
      return <td key={d} className={(holidays.has(d)||[0,6].includes(new Date(d+"T00:00:00Z").getUTCDay())?"hr-holiday ":"")+(bad?"hr-invalid ":"")+(sixth?"hr-sixth ":"")}>
       <button type="button" id={"hr-roster-"+staff.id+"-"+d} className="hr-roster-cell no-print" onClick={()=>open(staff.id,d)} onKeyDown={e=>keyDown(e,staff,d)} aria-label={staff.name+" "+d}>{staff.schedule_mode==="none"&&value?.kind!=="off"?(data.actualHours[String(staff.id)]?.[d]?.toFixed(1)??""):label(value,staff,d)}{value?.marker?<small>{value.marker==="home"?"居":"擺攤"}</small>:null}</button>
       <span className="print-only">{staff.schedule_mode==="none"&&value?.kind!=="off"?(data.actualHours[String(staff.id)]?.[d]?.toFixed(1)??""):label(value,staff,d)}</span></td>})}
     <td>{staff.schedule_mode==="hours"||staff.schedule_mode==="none"?"合計 "+dates.reduce((sum,d)=>sum+(staff.schedule_mode==="none"?(data.actualHours[String(staff.id)]?.[d]??0):(staged.get(staff.id+"|"+d)?.hours??0)),0).toFixed(1)+"h":""}</td>
    </tr>)}
    <tr className="hr-staffing"><th colSpan={2}>每日人力</th>{dates.map(d=><td key={d}>{Object.entries(data.staffing[d]??{}).map(([k,v])=>k+v).join(" ")}</td>)}<td/></tr>
    <tr><th colSpan={2}>備註</th><td colSpan={dates.length+1}><textarea className="cy-op-input no-print" value={notes} onChange={e=>setNotes(e.target.value)}/><span className="print-only">{notes}</span></td></tr>
    <tr><th colSpan={2}>注意事項</th><td colSpan={dates.length+1}><textarea className="cy-op-input no-print" value={rules} onChange={e=>setRules(e.target.value)}/><span className="print-only">{rules}</span></td></tr></tbody></table></div>
   {violations.length?<div className="cy-op-panel no-print"><h3>違規清單</h3>{violations.map((x,i)=><p key={i}>{x.from}～{x.to}：{x.message}</p>)}</div>:null}
   {pending.length?<div className="cy-op-panel no-print"><h3>主管核准</h3>{pending.map((x,i)=><p key={i}>{data.employees.find(e=>e.id===x.employeeId)?.name??x.employeeId}　{x.startDate}～{x.endDate}　{x.kind==="over_eight"?"兼職超過八小時":"連六"}。{x.suggestion}</p>)}
    <button type="button" className="cy-op-button primary" onClick={()=>void submit(pending)}>核准並儲存</button></div>:null}
  </>:<p>正在讀取排班…</p>}
  <Dialog open={cell!==null} title={emp?emp.name+"　"+cell?.date:"排班格"} size="medium" onClose={()=>setCell(null)}>
   {cell&&emp&&data?<div className="cy-op-form">
    {emp.schedule_mode==="shift"?<div className="hr-cell-choices">{data.shifts.filter(x=>x.is_active).map(x=><button type="button" key={x.id} className="cy-op-button" onClick={()=>setChoice("shift",{shiftTypeId:x.id})}>{x.code} {x.name}</button>)}</div>:null}
    {emp.schedule_mode==="hours"?<><label>排定時數<input className="cy-op-input" type="number" step=".25" min=".25" max="24" value={hours} onChange={e=>setHours(e.target.value)}/></label><button type="button" className="cy-op-button" onClick={()=>setChoice("hours",{hours:Number(hours)})}>套用時數</button></>:null}
    <div className="hr-cell-choices">{emp.schedule_mode!=="none"?<button type="button" className="cy-op-button" onClick={()=>setChoice("off",{offMark:"slash"})}>/　例休日</button>:null}
     {emp.employment_type==="casual"?<button type="button" className="cy-op-button" onClick={()=>setChoice("off",{offMark:"x"})}>X　不用來</button>:null}
     <button type="button" className="cy-op-button" onClick={()=>setChoice(null)}>清除</button></div>
    {emp.schedule_mode!=="none"?<><div className="hr-cell-choices">{data.leaveTypes.filter(x=>x.is_active&&(showAllLeave||["特","事","病","補","換"].includes(x.code))).map(x=><button type="button" key={x.id} className="cy-op-button" onClick={()=>setChoice("leave",{leaveTypeId:x.id})}>{x.code} {x.name}</button>)}</div>
     <button type="button" className="cy-op-button" onClick={()=>setShowAllLeave(x=>!x)}>更多假別</button>
     <label>註記<select className="cy-op-input" value={marker} onChange={e=>setMarker(e.target.value)}><option value="">無</option><option value="home">居家工作</option><option value="booth">擺攤</option></select></label>
     <label>備註<input className="cy-op-input" value={note} onChange={e=>setNote(e.target.value)}/></label></>:null}
   </div>:null}
  </Dialog>
  <Dialog open={staffOpen} title="門市人員設定" size="medium" onClose={()=>setStaffOpen(false)}>
   {data?.employees.map(x=><div key={x.id} className="hr-staff-setting"><strong>{x.name}</strong>
    <label>排序<input type="number" className="cy-op-input" defaultValue={x.roster_sort} aria-label={x.name+" 排序"} id={"hr-sort-"+x.id}/></label>
    <label><input type="checkbox" defaultChecked={x.skip_roster_checks===1} id={"hr-skip-"+x.id}/>不須檢核</label>
    <button type="button" className="cy-op-button" onClick={async()=>{try{
     const sort=document.getElementById("hr-sort-"+x.id) as HTMLInputElement|null,skip=document.getElementById("hr-skip-"+x.id) as HTMLInputElement|null;
     await apiRequest(ROOT+"/rosters/"+storeId+"/"+month+"/staff",{method:"PATCH",json:{employeeId:x.id,rosterSort:Number(sort?.value??0),skipRosterChecks:!!skip?.checked}});await reload();
    }catch(e){setError(String(e))}}}>儲存</button></div>)}
  </Dialog>
 </section>;
}
