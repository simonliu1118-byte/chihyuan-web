import {MonthPicker} from "../../ui/forms/MonthPicker";
import {DataViewToolbar} from '../../ui/data/DataViewToolbar';
import {EntryTable} from '../../ui/forms/EntryTable';
import {Field} from '../../ui/forms/Field';
import {useLatestRequest} from '../../ui/foundation/useLatestRequest';
import {useCallback,useEffect,useMemo,useRef,useState,type KeyboardEvent} from "react";
import {apiRequest} from "../../api/client";
import {taipeiToday} from "../../../shared/erp-query-history";
import {useUnsavedChangesGuard} from "../../ui/foundation/useUnsavedChangesGuard";
import {Dialog} from "../../ui/overlays/Dialog";
import {ExpandToggle} from "../../ui/data/ExpandToggle";
import {ReorderHandle} from "../../ui/actions/ReorderHandle";
import {enterAdvancesFields} from "../../ui/foundation/enter-advance";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {HrLeaveDialog,type LeavePerson,type LeaveTypeOption,type CompletedLeaveInfo} from "./HrLeaveDialog";
import {classifyRoster,type RosterDay,type RosterResult,type RosterViolation} from "../../../shared/hr-roster";
import "./hr-phase2a.css";
type Store={id:number;name:string;cycle_anchor_date:string;rules_template:string};
type Staff={id:number;employee_no:string;name:string;job_title_id:number|null;job_title_name:string|null;roster_sort:number;employment_type:"full"|"half"|"casual";schedule_mode:"shift"|"hours"|"none";skip_roster_checks:number;hire_date?:string|null;termination_date?:string|null};
type Shift={id:number;code:string;name:string;is_active:number;normal_minutes:number};
type Leave={id:number;code:string;name:string;is_active:number};
type Cell={employee_id:number;work_date:string;kind:"shift"|"hours"|"off"|"leave";rest_label?:string|null;shift_type_id:number|null;leave_type_id:number|null;off_mark:string|null;hours:number|null;marker:string|null;note:string};
type Change={employeeId:number;date:string;kind:"shift"|"hours"|"off"|"leave"|null;offMark?:string;shiftTypeId?:number;leaveTypeId?:number;hours?:number;startTime?:string;endTime?:string;marker?:string;note?:string};
type Approval={employeeId:number;kind:"consecutive"|"over_eight";startDate:string;endDate:string;suggestion:string};
type Ro={classificationContext:{start:string;end:string;asOf:string;previousRegular:Record<string,string>};leaveForms:{employee_id:number;work_date:string;whole_day:number;minutes:number;code:string;batch_id:string}[];store:Store;month:string;bounds:{start:string;finish:string;first:string;end:string};employees:Staff[];shifts:Shift[];leaveTypes:Leave[];
 holidays:{date:string;name:string}[];days:Cell[];classification:Record<string,RosterResult>;staffing:Record<string,Record<string,number>>;actualHours:Record<string,Record<string,number>>;notes:string;rules:string;approvals:unknown[]};
const ROOT="/api/business/hr",dayMs=86400000,weekdays=["日","一","二","三","四","五","六"];
const isWeekend=(d:string)=>[0,6].includes(new Date(d+"T00:00:00Z").getUTCDay());
const monthDates=(m:string)=>{const [y,n]=m.split("-").map(Number);return Array.from({length:new Date(Date.UTC(y,n,0)).getUTCDate()},(_,i)=>m+"-"+String(i+1).padStart(2,"0"))};
export function HrRosterPanel() {
 const [stores,setStores]=useState<Store[]>([]),[storeId,setStoreId]=useState(0),[month,setMonth]=useState(taipeiToday().slice(0,7));
 const [data,setData]=useState<Ro|null>(null),[changes,setChanges]=useState<Record<string,Change>>({});
 const [notes,setNotes]=useState(""),[rules,setRules]=useState(""),[loading,setLoading]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[violations,setViolations]=useState<(RosterViolation&{employeeId:number})[]>([]);
 const [pending,setPending]=useState<Approval[]>([]);
 const [cell,setCell]=useState<{employeeId:number;date:string}|null>(null),[hours,setHours]=useState(""),[note,setNote]=useState(""),[showAllLeave,setShowAllLeave]=useState(false);
 const [staff,setStaff]=useState<Staff[]|null>(null);
 const [staffError,setStaffError]=useState("");
 const [choice,setChoice]=useState<(Pick<Change,"kind"> & Partial<Change>)|null>(null);
 const draggingStaff=useRef<number|null>(null);
 const [leaveDialogPerson,setLeaveDialogPerson]=useState<LeavePerson|null>(null);
 const [formalLeaveTypes,setFormalLeaveTypes]=useState<LeaveTypeOption[]>([]);
 const [leaveInitialDate,setLeaveInitialDate]=useState<string|undefined>(undefined);
 const [completedLeave,setCompletedLeave]=useState<CompletedLeaveInfo|null>(null);
 const {confirm,confirmationDialog}=useConfirmation();
 const [search,setSearch]=useState("");
 const shownEmployees=(data?.employees??[]).filter(e=>!search.trim()||(e.employee_no+" "+e.name+" "+e.job_title_name).includes(search.trim()));
 const rosterRequest=useLatestRequest(storeId+"|"+month),alertRequest=useLatestRequest(storeId+"|"+month);
 const saving=useRef(false);
 const dirty=Object.keys(changes).length>0||!!data&&(notes!==data.notes||rules!==data.rules);
 useUnsavedChangesGuard({active:dirty||staff!==null||cell!==null,blocked:loading,message:"排班尚未儲存，確定離開？"});
 const discard=async()=>!dirty||await confirm({title:"放棄未儲存的排班",description:"切換後，尚未儲存的排班會遺失。",confirmLabel:"放棄",cancelLabel:"繼續編輯",confirmTone:"danger"});
 // Saved-roster violations show on load; a rejected save replaces them with what the server found in the edit.
 const saved=useMemo(()=>Object.entries(data?.classification??{}).flatMap(([id,r])=>r.violations.map(v=>({...v,employeeId:Number(id)}))),[data]);
 const shown=violations.length?violations:dirty?[]:saved;
 useEffect(()=>{void apiRequest<LeaveTypeOption[]>(ROOT+"/settings/leave-types").then(setFormalLeaveTypes).catch(()=>{});},[]);
 // Comp time reminders (BD-060 #27): credits about to expire or expired with hours left, and advances still owed.
 const [compAlerts,setCompAlerts]=useState<string[]>([]);
 useEffect(()=>{if(!storeId)return;const ticket=alertRequest.begin();void apiRequest<{employees:{name:string;comp:{advances:{holidayName:string;outstandingMinutes:number}[];credits:{remainingMinutes:number;expiresOn:string;expired:boolean;expiringSoon:boolean}[]}}[]}>(ROOT+"/leave/summary?year="+month.slice(0,4)+"&storeId="+storeId)
  .then(x=>{if(ticket.current())setCompAlerts(x.employees.flatMap(e=>[
   ...e.comp.credits.filter(c=>c.remainingMinutes>0&&(c.expired||c.expiringSoon)).map(c=>e.name+"：補休 "+(c.remainingMinutes/60).toFixed(1)+" 小時"+(c.expired?"已於 ":"將於 ")+c.expiresOn.replaceAll("-","/")+" 到期"),
   ...e.comp.advances.filter(a=>a.outstandingMinutes>0).map(a=>e.name+"：預支 "+a.holidayName+" 補休 "+(a.outstandingMinutes/60).toFixed(1)+" 小時，尚未抵銷")
  ]))}).catch(()=>{if(ticket.current())setCompAlerts([])})},[storeId,month,alertRequest]);
 useEffect(()=>{void apiRequest<Store[]>(ROOT+"/settings/stores").then(x=>{setStores(x);setStoreId(x[0]?.id??0)}).catch(e=>setError(String(e)))},[]);
 const reload=useCallback(async()=>{
  const ticket=rosterRequest.begin();if(!storeId)return;setLoading(true);setData(null);
  try{const d=await apiRequest<Ro>(ROOT+"/rosters/"+storeId+"/"+month);if(!ticket.current())return;setData(d);setNotes(d.notes);setRules(d.rules);setChanges({});setViolations([]);setPending([]);setError("")}
  catch(e){if(ticket.current())setError(e instanceof Error?e.message:"排班查詢失敗")}finally{if(ticket.current())setLoading(false)}
 },[storeId,month,rosterRequest]);
 useEffect(()=>{void reload()},[reload]);
 const dates=useMemo(()=>monthDates(month),[month]);
 const originals=useMemo(()=>new Map((data?.days??[]).map(x=>[x.employee_id+"|"+x.work_date,x])),[data]);
 const staged=useMemo(()=>{const result=new Map(originals);for(const [key,change] of Object.entries(changes)){
  if(change.kind===null)result.delete(key);
  else result.set(key,{employee_id:change.employeeId,work_date:change.date,kind:change.kind,rest_label:change.kind==="off"&&originals.get(key)?.off_mark===change.offMark?originals.get(key)?.rest_label:null,shift_type_id:change.shiftTypeId??null,leave_type_id:change.leaveTypeId??null,off_mark:change.offMark??null,hours:change.hours??null,marker:change.marker??null,note:change.note??""});
 }return result},[originals,changes]);
 // Use the same classification core and look-around inputs as the Worker, only for changed employees.
 const draftClassification=useMemo(()=>{
  if(!data)return {};
  const context=data.classificationContext;
  const result={...data.classification};
  if(!context)return result;
  const ids=new Set(Object.values(changes).map(x=>x.employeeId));
  const allDates=Array.from({length:Math.round((Date.parse(context.end)-Date.parse(context.start))/dayMs)+1},(_,i)=>new Date(Date.parse(context.start)+i*dayMs).toISOString().slice(0,10));
  for(const e of data.employees){
   if(!ids.has(e.id))continue;
   const fixedRegularOff=new Set<string>();
   const input:RosterDay[]=allDates.map(date=>{
    const row=staged.get(e.id+"|"+date);
    if(!row)return {date,kind:"unscheduled"};
    if(row.rest_label==="regular"&&date<context.asOf)fixedRegularOff.add(date);
    if(row.kind==="off")return {date,kind:"off",offMark:row.off_mark==="x"?"x":"slash",restLabel:row.rest_label==="regular"||row.rest_label==="rest"?row.rest_label:null,minutes:0};
    if(row.kind==="shift")return {date,kind:"shift",minutes:data.shifts.find(s=>s.id===row.shift_type_id)?.normal_minutes??0};
    if(row.kind==="hours")return {date,kind:"hours",minutes:Math.round((row.hours??0)*60)};
    return {date,kind:"leave",minutes:0};
   });
   result[String(e.id)]=classifyRoster(input,context.previousRegular[String(e.id)]??null,{anchorMonday:data.store.cycle_anchor_date,employmentType:e.employment_type,skipChecks:e.skip_roster_checks===1,scheduleMode:e.schedule_mode,fixedRegularOff,classificationMonth:data.month,employedFrom:e.hire_date??null,employedTo:e.termination_date??null});
  }
  return result;
 },[data,changes,staged]);
 const emp=data?.employees.find(x=>x.id===cell?.employeeId);
 function edit(x:Change){setChanges(old=>({...old,[x.employeeId+"|"+x.date]:x}));setCell(null);setPending([]);setViolations([]);}
 function open(id:number,d:string){const x=staged.get(id+"|"+d);setCell({employeeId:id,date:d});setHours(String(x?.hours??""));setNote(x?.note??"");setShowAllLeave(false);
  setChoice(x?{kind:x.kind as Change["kind"],shiftTypeId:x.shift_type_id??undefined,leaveTypeId:x.leave_type_id??undefined,offMark:x.off_mark??undefined}:null);
 }
 const validChoice=!!choice&&(choice.kind!=="hours"||(Number(hours)>0&&Number(hours)<=24&&Number(hours)*4===Math.trunc(Number(hours)*4)));
 const cellIndex=cell?dates.indexOf(cell.date):-1;
 function navigateCell(target:string){if(cell&&dates.includes(target))open(cell.employeeId,target)}
 function applyCell(next=false){
  if(!cell||!choice||!validChoice)return;
  const current=staged.get(cell.employeeId+"|"+cell.date);
  edit({employeeId:cell.employeeId,date:cell.date,...choice,kind:choice.kind,note:choice.kind===null?"":note,marker:choice.kind==="off"||choice.kind===null?undefined:current?.marker??undefined,...(choice.kind==="hours"?{hours:Number(hours)}:{})});
  if(next&&dates[cellIndex+1]){
   const target=dates[cellIndex+1],existing=staged.get(cell.employeeId+"|"+target);
   open(cell.employeeId,target);
   if(!existing){setChoice(choice);if(choice.kind==="hours")setHours(hours);}
  }
 }
 function clearCell(){if(cell)edit({employeeId:cell.employeeId,date:cell.date,kind:null})}
 const commonLeaveLabels:Record<string,string>={"特":"特休","事":"事假","病":"病假","補":"補休"};
 const commonLeaves=["特","事","病","補"].flatMap(code=>{const item=data?.leaveTypes.find(x=>x.is_active&&x.code===code);return item?[item]:[]});
 const otherLeaves=(data?.leaveTypes??[]).filter(x=>x.is_active&&!commonLeaveLabels[x.code]);
 function leaveButton(x:Leave,short=false){const selected=choice?.kind==="leave"&&choice.leaveTypeId===x.id;
  return <button type="button" key={x.id} aria-pressed={selected} className={"cy-op-button compact"+(selected?" primary":"")} onClick={()=>setChoice({kind:"leave",leaveTypeId:x.id})}>{short?commonLeaveLabels[x.code]:x.name}</button>
 }
 function moveStaff(id:number,target:number){
  setStaff(old=>{if(!old||id===target)return old;const from=old.findIndex(x=>x.id===id),to=old.findIndex(x=>x.id===target);
   if(from<0||to<0)return old;
   const next=[...old];const [person]=next.splice(from,1);next.splice(to,0,person);return next;
  });
 }
 function closeStaff(){if(!loading){setStaff(null);setStaffError("");draggingStaff.current=null}}
 async function saveStaff(){
  if(!staff||!data||loading||saving.current)return;
  const reordered=staff.some((x,i)=>x.id!==data.employees[i]?.id);
  const updates=staff.flatMap((x,i)=>{const before=data.employees.find(e=>e.id===x.id);const rosterSort=reordered?i:x.roster_sort;
   return before&&(before.roster_sort!==rosterSort||before.skip_roster_checks!==x.skip_roster_checks)?[{employeeId:x.id,rosterSort,skipRosterChecks:x.skip_roster_checks===1}]:[];
  });
  if(!updates.length){closeStaff();return}
  saving.current=true;setLoading(true);setStaffError("");
  try{await apiRequest(ROOT+"/rosters/"+storeId+"/"+month+"/staff",{method:"PATCH",json:{staff:updates}});
   const next=await apiRequest<Ro>(ROOT+"/rosters/"+storeId+"/"+month);
   setData(next);setViolations([]);setPending([]);setStaff(null);setNotice("已儲存門市人員設定");
  }catch(e){setStaffError(e instanceof Error?e.message:"儲存失敗")}finally{saving.current=false;setLoading(false)}
 }
 function keyDown(e:KeyboardEvent<HTMLButtonElement>,staff:Staff,date:string){
  if(!data)return;
  const pos=dates.indexOf(date),row=shownEmployees.findIndex(x=>x.id===staff.id);
  if(["ArrowRight","ArrowLeft","ArrowUp","ArrowDown"].includes(e.key)){
   e.preventDefault();const offset=e.key==="ArrowRight"?1:e.key==="ArrowLeft"?-1:0,vertical=e.key==="ArrowDown"?1:e.key==="ArrowUp"?-1:0;
   const d=dates[Math.max(0,Math.min(dates.length-1,pos+offset))],person=shownEmployees[Math.max(0,Math.min(shownEmployees.length-1,row+vertical))];
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
  if(cellData.kind==="off"){if(cellData.off_mark==="x")return "X";if(staff.skip_roster_checks===1)return "";const classified=draftClassification[String(staff.id)]?.labels[date];return classified==="regular_off"?"例":classified==="rest_day"?"休":"";}
  if(cellData.kind==="shift")return data?.shifts.find(x=>x.id===cellData.shift_type_id)?.code??"";
  if(cellData.kind==="leave")return data?.leaveTypes.find(x=>x.id===cellData.leave_type_id)?.code??"";
  return typeof cellData.hours==="number"?String(cellData.hours):"";
 }
 async function submit(approve:Approval[]=[]){
  if(!data||loading||saving.current)return;saving.current=true;setLoading(true);setError("");
  try{
   const response=await fetch(ROOT+"/rosters/"+storeId+"/"+month,{method:"PUT",credentials:"same-origin",headers:{"content-type":"application/json","accept":"application/json"},body:JSON.stringify({changes:Object.values(changes),notes,rules,approve})});
   const json=await response.json() as {ok:boolean;data?:{changedDays:number};error?:{code:string;message:string;items?:unknown[]}};
   if(!response.ok||!json.ok){
    if(json.error?.code==="HR_ROSTER_CONSECUTIVE"){setPending(json.error.items as Approval[]??[]);setNotice("需要主管核准")}
    else if(json.error?.code==="HR_ROSTER_VIOLATION"){setViolations(json.error.items as (RosterViolation&{employeeId:number})[]??[]);setError("未來日期有不可核准的違規，請手動調整")}
    else setError(json.error?.message??"儲存失敗");return;
   }
   setChanges({});setNotice("已儲存 "+(json.data?.changedDays??0)+" 個排班格");await reload();
  }catch(e){setError(e instanceof Error?e.message:"儲存失敗")}finally{saving.current=false;setLoading(false)}
 }
 async function chooseMonth(target:string){if(!loading&&target!==month&&await discard()){setData(null);setMonth(target)}}
 const holidays=new Map(data?.holidays.map(x=>[x.date,x.name])??[]);
 // One class set per date, used by the header, every employee row and 每日人力, so shading and the 雙週 line run through the whole column.
 const dayClass=(d:string)=>(holidays.has(d)||isWeekend(d)?"hr-holiday ":"")+(data&&new Date(d+"T00:00:00Z").getUTCDay()===1&&(Date.parse(d+"T00:00:00Z")-Date.parse(data.store.cycle_anchor_date+"T00:00:00Z"))%(14*dayMs)===0?"hr-cycle ":"");
 return <section className="cy-op-module cy-hr-phase2a" aria-label="月排班表">
  <div className="no-print"><DataViewToolbar searchValue={search} onSearchChange={setSearch} searchLabel="搜尋排班員工" searchPlaceholder="員工編號、姓名或職稱"
   beforeSearch={<MonthPicker value={month} disabled={loading} onChange={target=>void chooseMonth(target)}/>}
   filters={<select aria-label="排班門市" disabled={loading} className="cy-op-input" value={storeId} onChange={e=>{const next=Number(e.target.value);if(!loading)void discard().then(ok=>{if(ok){setData(null);setStoreId(next)}})}}>{stores.length?stores.map(x=><option key={x.id} value={x.id}>{x.name}</option>):<option value="">無門市</option>}</select>}
   resultSummary={`顯示 ${shownEmployees.length}／${data?.employees.length??0} 人；每日人力為全門市`}
   actions={<>
    <button type="button" disabled={loading||!data} className="cy-op-button" onClick={()=>{setStaff((data?.employees??[]).map(x=>({...x})));setStaffError("")}}>人員設定</button>
    <button type="button" disabled={loading||!data} className="cy-op-button" onClick={()=>window.print()}>列印目前顯示</button>
    {dirty?<><button type="button" className="cy-op-button primary" disabled={loading} onClick={()=>void submit()}>儲存本月</button><button type="button" className="cy-op-button" disabled={loading} onClick={()=>void reload()}>取消修改</button></>:null}
   </>}/></div>

  {error?<p role="alert" className="cy-notice cy-notice-danger no-print">{error}</p>:null}
  {notice?<p role="status" className="cy-notice no-print">{notice}</p>:null}
  {data?<><h2 className="hr-roster-print-title">{data.store.name}　{month.replace("-","年")}月班表</h2>
   <div className="hr-roster-scroll cy-mobile-matrix" role="region" aria-label="月排班表，可左右捲動" tabIndex={0}><table className="hr-roster-table"><colgroup><col className="hr-col-title"/><col className="hr-col-name"/>{dates.map(d=><col key={d}/>)}<col className="hr-col-note"/></colgroup><thead><tr><th rowSpan={2}>職稱</th><th rowSpan={2}>日期／姓名</th>
    {dates.map(d=><th key={d} title={holidays.get(d)??""} className={dayClass(d)}>{Number(d.slice(-2))}{holidays.has(d)?<small>{holidays.get(d)}</small>:null}</th>)}
    <th rowSpan={2}>備註</th></tr><tr>{dates.map(d=><th key={d} className={dayClass(d)}>{weekdays[new Date(d+"T00:00:00Z").getUTCDay()]}</th>)}</tr></thead>
    <tbody>{shownEmployees.map((staff,i)=><tr key={staff.id}>
     <td>{staff.job_title_name??"未設定"}</td><th scope="row">{staff.name}</th>
     {dates.map(d=>{const value=staged.get(staff.id+"|"+d),form=data.leaveForms.find(x=>x.employee_id===staff.id&&x.work_date===d&&x.whole_day===1),partial=data.leaveForms.filter(x=>x.employee_id===staff.id&&x.work_date===d&&x.whole_day===0),bad=shown.some(x=>x.employeeId===staff.id&&x.dates.includes(d)),sixth=data.classification[String(staff.id)]?.sixthDays.includes(d);
      return <td key={d} className={dayClass(d)+(bad?"hr-invalid ":"")+(sixth?"hr-sixth ":"")+(value?.kind==="off"&&value.off_mark!=="x"?"hr-roster-off":"")}>
       <button type="button" title={value?.kind==="leave"&&!form&&data.leaveTypes.find(x=>x.id===value.leave_type_id)?.code!=="國"?"尚未補假單":form?"已完成假單":""} id={"hr-roster-"+staff.id+"-"+d} disabled={loading} className={"hr-roster-cell no-print "+(value?.kind==="leave"&&!form&&data.leaveTypes.find(x=>x.id===value.leave_type_id)?.code!=="國"?"hr-leave-pending":"")} onClick={()=>open(staff.id,d)} onKeyDown={e=>keyDown(e,staff,d)} aria-label={staff.name+" "+d}>{staff.schedule_mode==="none"&&value?.kind!=="off"?(data.actualHours[String(staff.id)]?.[d]?.toFixed(1)??""):label(value,staff,d)}{value?.marker?<small>{value.marker==="home"?"居":"擺攤"}</small>:null}{partial.map(x=><small key={x.batch_id}>{x.code+(x.minutes/60)}</small>)}</button>
       <span className="print-only">{partial.map(x=>x.code+(x.minutes/60)).join(" ")}{staff.schedule_mode==="none"&&value?.kind!=="off"?(data.actualHours[String(staff.id)]?.[d]?.toFixed(1)??""):label(value,staff,d)}</span></td>})}
     <td>{staff.schedule_mode==="hours"||staff.schedule_mode==="none"?"合計 "+dates.reduce((sum,d)=>sum+(staff.schedule_mode==="none"?(data.actualHours[String(staff.id)]?.[d]??0):(staged.get(staff.id+"|"+d)?.hours??0)),0).toFixed(1)+"h":""}</td>
    </tr>)}
    <tr className="hr-staffing"><th colSpan={2}>每日人力</th>{dates.map(d=><td key={d} className={dayClass(d)}>{Object.entries(data.staffing[d]??{}).map(([k,v])=>k+v).join(" ")}</td>)}<td/></tr>
    <tr><th colSpan={2}>備註</th><td colSpan={dates.length+1} className="hr-sheet-cell"><textarea disabled={loading} className="cy-sheet-input no-print" value={notes} onChange={e=>setNotes(e.target.value)}/><span className="print-only">{notes}</span></td></tr>
    <tr><th colSpan={2}>注意事項</th><td colSpan={dates.length+1} className="hr-sheet-cell"><textarea disabled={loading} className="cy-sheet-input no-print" value={rules} onChange={e=>setRules(e.target.value)}/><span className="print-only">{rules}</span></td></tr></tbody></table></div>
   {compAlerts.length?<div className="cy-op-panel no-print hr-comp-alerts"><h3>補休提醒</h3>{compAlerts.map(x=><p key={x}>{x}</p>)}</div>:null}
   {shown.length?<div className="cy-op-panel no-print"><h3>違規清單</h3>{shown.map((x,i)=><p key={i}>{data.employees.find(e=>e.id===x.employeeId)?.name??""}　{x.from}～{x.to}：{x.message}</p>)}</div>:null}
   {pending.length?<div className="cy-op-panel no-print"><h3>主管核准</h3>{pending.map((x,i)=><p key={i}>{data.employees.find(e=>e.id===x.employeeId)?.name??x.employeeId}　{x.startDate}～{x.endDate}　{x.kind==="over_eight"?"兼職超過八小時":"連六"}。{x.suggestion}</p>)}
    <button type="button" className="cy-op-button primary" disabled={loading} onClick={()=>void submit(pending)}>核准並儲存</button></div>:null}
  </>:<p>正在讀取排班…</p>}
  <Dialog open={cell!==null} title={emp&&cell?<span className="hr-cell-title"><span>{emp.name}</span><MonthPicker precision="day" value={cell.date} min={dates[0]} max={dates[dates.length-1]} onChange={navigateCell}/></span>:"排班格"} size="small" className="hr-cell-dialog" onClose={()=>setCell(null)}
   footer={<div className="hr-cell-actions"><button type="button" className="cy-op-button" onClick={clearCell}>清除</button><button type="submit" form="hr-roster-cell-form" className="cy-op-button" disabled={!validChoice}>套用</button><button type="button" className="cy-op-button primary" disabled={!validChoice||cellIndex>=dates.length-1} onClick={()=>applyCell(true)}>套用並下一格</button></div>}>
   {cell&&emp&&data?<form id="hr-roster-cell-form" onKeyDown={enterAdvancesFields} className="cy-op-form hr-cell-form" onSubmit={e=>{e.preventDefault();applyCell()}}>
    {emp.schedule_mode==="shift"?<section aria-label="班別"><h3>班別</h3><div className="hr-cell-choices">
     {data.shifts.filter(x=>x.is_active).map(x=>{const selected=choice?.kind==="shift"&&choice.shiftTypeId===x.id;return <button type="button" key={x.id} aria-pressed={selected} className={"cy-op-button compact"+(selected?" primary":"")} onClick={()=>setChoice({kind:"shift",shiftTypeId:x.id})}>{x.name}</button>})}
    </div></section>:null}
    {emp.schedule_mode==="hours"?<Field label="排定時數" size="l"><input className="cy-op-input" type="number" step=".25" min=".25" max="24" value={hours} onChange={e=>{setHours(e.target.value);setChoice({kind:"hours"})}}/></Field>:null}
    <section aria-label="休假／請假"><h3>休假／請假</h3>
     <div className="hr-cell-leave-row">
      {emp.schedule_mode!=="none"?<>
       <div className="hr-cell-choices hr-cell-leave-common">
        <button type="button" aria-pressed={choice?.kind==="off"&&choice.offMark==="slash"} className={"cy-op-button compact"+(choice?.kind==="off"&&choice.offMark==="slash"?" primary":"")} onClick={()=>setChoice({kind:"off",offMark:"slash"})}>例休日</button>
        {commonLeaves.map(x=>leaveButton(x,true))}
       </div>
       {otherLeaves.length>0?<ExpandToggle variant="down" expanded={showAllLeave} label="其他假別" onToggle={()=>setShowAllLeave(v=>!v)}/>:null}
      </>:null}
      {emp.employment_type==="casual"?<button type="button" aria-pressed={choice?.kind==="off"&&choice.offMark==="x"} className={"cy-op-button compact"+(choice?.kind==="off"&&choice.offMark==="x"?" primary":"")} onClick={()=>setChoice({kind:"off",offMark:"x"})}>不用來</button>:null}
     </div>
     {emp.schedule_mode!=="none"&&showAllLeave?<div id="hr-roster-other-leaves" className="hr-cell-choices">{otherLeaves.map(x=>leaveButton(x))}</div>:null}
     {emp.schedule_mode!=="none"&&choice?.kind==="leave"&&!showAllLeave?otherLeaves.filter(x=>x.id===choice.leaveTypeId).map(x=>leaveButton(x)):null}
    </section>
    {emp.schedule_mode!=="none"?<div className="hr-cell-note"><Field label="備註" size="l"><input className="cy-op-input" value={note} maxLength={500} onChange={e=>setNote(e.target.value)}/></Field></div>:null}
    {staged.get(cell.employeeId+"|"+cell.date)?.kind==="leave"?<button type="button" className="cy-op-button soft compact" onClick={()=>{
     setLeaveInitialDate(cell.date);
     const existing=data.leaveForms.find(x=>x.employee_id===cell.employeeId&&x.work_date===cell.date&&x.whole_day===1);
     setCompletedLeave(existing?{batchId:existing.batch_id,date:existing.work_date,code:existing.code,minutes:existing.minutes}:null);
     setLeaveDialogPerson({id:emp.id,name:emp.name,employee_no:emp.employee_no,employment_type:emp.employment_type});setCell(null);
    }}>{data.leaveForms.some(x=>x.employee_id===cell.employeeId&&x.work_date===cell.date)?"查看／補填假單":"補假單"}</button>:null}
   </form>:null}
  </Dialog>
  <Dialog dismissible={!loading} open={staff!==null} title="門市人員設定" size="medium" onClose={closeStaff}
   footer={<><button type="button" className="cy-op-button" disabled={loading} onClick={closeStaff}>取消</button><button type="submit" form="hr-roster-staff-form" className="cy-op-button primary" disabled={loading}>儲存</button></>}>
   {staff?<form id="hr-roster-staff-form" className="cy-op-form cy-hr-staff-form" onKeyDown={enterAdvancesFields} onSubmit={e=>{e.preventDefault();void saveStaff()}}>
    {staffError?<p role="alert" className="cy-notice cy-notice-danger">{staffError}</p>:null}
    <EntryTable label="門市人員設定"><colgroup><col className="hr-staff-grip"/><col className="hr-staff-sequence"/><col className="hr-staff-number"/><col/><col className="hr-staff-role"/><col className="hr-staff-rule"/></colgroup>
     <thead><tr><th aria-label="拖拉排序"></th><th className="hr-staff-center">項次</th><th className="hr-staff-center">員工編號</th><th>姓名</th><th>職稱</th><th>排班規則</th></tr></thead><tbody>{staff.map((x,i)=>{
      const movable=staff.length>1;
      return <tr key={x.id} data-roster-staff-id={x.id} onDragOver={e=>{if(!loading&&draggingStaff.current!==null){e.preventDefault();e.dataTransfer.dropEffect="move"}}}
       onDrop={e=>{e.preventDefault();if(!loading&&draggingStaff.current!==null)moveStaff(draggingStaff.current,x.id);draggingStaff.current=null}}>
       <td className="hr-staff-center hr-staff-handle"><ReorderHandle label={x.name+"，拖拉排序（上下方向鍵亦可）"} disabled={loading||!movable} draggable={!loading&&movable}
        onDragStart={e=>{draggingStaff.current=x.id;e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",String(x.id))}} onDragEnd={()=>{draggingStaff.current=null}}
        onPointerDown={e=>{if(e.pointerType!=="mouse"&&!loading)e.currentTarget.setPointerCapture(e.pointerId)}}
        onPointerUp={e=>{if(e.pointerType==="mouse"||loading)return;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest("[data-roster-staff-id]");if(target)moveStaff(x.id,Number(target.getAttribute("data-roster-staff-id")))}}
        onKeyDown={e=>{if(e.key!=="ArrowUp"&&e.key!=="ArrowDown")return;e.preventDefault();const j=i+(e.key==="ArrowUp"?-1:1);if(staff[j])moveStaff(x.id,staff[j].id)}}/></td>
       <td className="hr-staff-center">{i+1}</td>
       <td className="hr-staff-center">{x.employee_no}</td><td>{x.name}</td><td>{x.job_title_name??"未設定"}</td>
       <td className="hr-staff-select"><Field label={x.name+"排班規則"} presentation="cell"><select className="cy-sheet-input" disabled={loading} value={x.skip_roster_checks} onChange={e=>setStaff(old=>old?.map(y=>y.id===x.id?{...y,skip_roster_checks:Number(e.target.value)}:y)??null)}><option value={0}>檢查</option><option value={1}>不檢查</option></select></Field></td>
      </tr>
    })}</tbody></EntryTable>
   </form>:null}
  </Dialog>
  <HrLeaveDialog person={leaveDialogPerson} types={formalLeaveTypes.length?formalLeaveTypes:data?.leaveTypes??[]} initialDate={leaveInitialDate} initialTypeId={leaveDialogPerson&&leaveInitialDate?data?.days.find(x=>x.employee_id===leaveDialogPerson.id&&x.work_date===leaveInitialDate)?.leave_type_id??undefined:undefined} completed={completedLeave} onClose={()=>{setLeaveDialogPerson(null);setCompletedLeave(null)}} onSaved={()=>{void reload()}}/>
  {confirmationDialog}
 </section>;
}
