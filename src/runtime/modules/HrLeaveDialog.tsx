import { DateInput } from "../../ui/forms/DateInput";
import {CheckField} from "../../ui/forms/Field";
import {EntryFields} from "../../ui/forms/EntryFields";
import {TimeInput} from "../../ui/forms/TimeInput";
import {useEffect,useState,type FormEvent} from "react";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {apiRequest} from "../../api/client";
import {enterAdvancesFields} from "../../ui/foundation/enter-advance";
import {Dialog} from "../../ui/overlays/Dialog";
import {taipeiToday} from "../../../shared/erp-query-history";
import {resizeToJpeg} from "../../ui/forms/photo-upload";
type LeaveApproval={employeeId:number;kind:"consecutive"|"over_eight";startDate:string;endDate:string;suggestion:string};
export interface LeaveTypeOption{id:number;code:string;name:string;quota_days?:number|null;requires_reason?:number;accepts_proof?:number;quota_period?:string|null;event_quota_options?:string|null;is_active?:number}
export interface LeavePerson{id:number;name:string;employee_no:string;employment_type:"full"|"half"|"casual"}
export interface CompletedLeaveInfo{batchId:string;date:string;code:string;minutes:number}
/** The one leave form, opened from the leave tab, the roster and the people page. With `people` the employee can be chosen. */
export function HrLeaveDialog({person:given,people,types,initialDate,initialTypeId,completed,onClose,onSaved}:{person:LeavePerson|null;people?:LeavePerson[];types:LeaveTypeOption[];initialDate?:string;initialTypeId?:number;completed?:CompletedLeaveInfo|null;onClose:()=>void;onSaved:()=>void}){
 const [person,setPerson]=useState<LeavePerson|null>(given);
 useEffect(()=>setPerson(given),[given]);
 const [typeId,setTypeId]=useState(0),[from,setFrom]=useState(taipeiToday()),[to,setTo]=useState(taipeiToday());
 const [wholeDay,setWholeDay]=useState(true),[manualMinutes,setManualMinutes]=useState(false),[startTime,setStartTime]=useState("09:00"),[endTime,setEndTime]=useState("17:00"),[minutes,setMinutes]=useState("120");
 const [reason,setReason]=useState(""),[eventDate,setEventDate]=useState(""),[eventDays,setEventDays]=useState("8"),[files,setFiles]=useState<File[]>([]),[gray,setGray]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [cancelReason,setCancelReason]=useState("");
 const [approvalItems,setApprovalItems]=useState<LeaveApproval[]>([]);
 const [createdBatchId,setCreatedBatchId]=useState<string|null>(null),[uploadedCount,setUploadedCount]=useState(0);
 const [previews,setPreviews]=useState<string[]>([]);
 // 補 either spends the comp balance or is an advance on a named national holiday (BD-060 #29).
 const [holidays,setHolidays]=useState<{date:string;name:string}[]>([]),[advanceDate,setAdvanceDate]=useState("");
 const {confirm,confirmationDialog}=useConfirmation();
 useEffect(()=>{const urls=files.map(file=>URL.createObjectURL(file));setPreviews(urls);return()=>urls.forEach(url=>URL.revokeObjectURL(url));},[files]);
 useEffect(()=>{if(given){setFrom(initialDate??taipeiToday());setTo(initialDate??taipeiToday());setWholeDay(given.employment_type==="full");setManualMinutes(false);setTypeId(types.find(x=>x.id===initialTypeId&&x.is_active!==0)?.id??types.find(x=>x.is_active!==0&&x.code!=="國")?.id??0);setError("");setApprovalItems([]);setFiles([]);setCreatedBatchId(null);setUploadedCount(0);setCancelReason("");setAdvanceDate("")}},[given,initialDate,initialTypeId,types]);
 const type=types.find(x=>x.id===typeId),isComp=type?.code==="補";
 useEffect(()=>{if(!isComp||holidays.length)return;const year=Number(from.slice(0,4));
  void Promise.all([year,year+1].map(y=>apiRequest<{date:string;name:string}[]>("/api/business/hr/settings/holidays?year="+y)))
   .then(x=>setHolidays(x.flat().sort((a,b)=>a.date.localeCompare(b.date)))).catch(()=>setHolidays([]))},[isComp,from,holidays.length]);
 async function cancelCompleted(e:FormEvent){
  e.preventDefault();if(!completed||!cancelReason.trim())return;
  const approved=await confirm({title:"確認銷假",description:completed.date+" 的正式假單將保留銷假紀錄，整天排班格會清空。",confirmLabel:"確認銷假",confirmTone:"danger"});
  if(!approved)return;
  setBusy(true);setError("");
  try{
   await apiRequest("/api/business/hr/leave-requests/"+completed.batchId+"/cancel",{method:"POST",json:{dates:[completed.date],reason:cancelReason.trim()}});
   onSaved();onClose();
  }catch(err){setError(err instanceof Error?err.message:"銷假失敗")}
  finally{setBusy(false)}
 }

 async function submit(e?:FormEvent,approve:LeaveApproval[]=[]){
  e?.preventDefault();if(!person)return;setBusy(true);setError("");
  try{
   if(type?.requires_reason&&!reason.trim())throw Error("事假請填事由");
   if(!wholeDay&&manualMinutes&&(!Number.isInteger(Number(minutes))||Number(minutes)<=0||Number(minutes)%30!==0))throw Error("時數請假須填正的 30 分鐘倍數");
   let batchId=createdBatchId;
   if(!batchId){
    const response=await fetch("/api/business/hr/leave-requests",{method:"POST",credentials:"same-origin",
     headers:{"content-type":"application/json","accept":"application/json"},
     body:JSON.stringify({employeeId:person.id,leaveTypeId:typeId,from,date:from,to:wholeDay?to:from,wholeDay,
       startTime:wholeDay||manualMinutes?undefined:startTime,endTime:wholeDay||manualMinutes?undefined:endTime,
       minutes:!wholeDay&&manualMinutes?Number(minutes):undefined,
       reason,eventDate:type?.quota_period==="event"?eventDate:undefined,
       eventQuotaDays:type?.event_quota_options?Number(eventDays):undefined,advanceHolidayDate:isComp&&advanceDate?advanceDate:undefined,approve})});
    const envelope=await response.json() as {ok:boolean;data?:{batchId:string};error?:{code:string;message:string;items?:unknown[]}};
    if(!response.ok||!envelope.ok){
     const details=envelope.error?.items??[],code=envelope.error?.code;
     if(code==="HR_ROSTER_CONSECUTIVE"){
      setApprovalItems(details as LeaveApproval[]);
      setError("新增假單會形成連六或兼職超時排班，請明確核准後重送。");return;
     }
     if(code==="HR_ROSTER_VIOLATION"||code==="HR_LEAVE_QUOTA"||code==="HR_COMP_INSUFFICIENT"){
      const messages=details.map(x=>typeof x==="object"&&x!==null&&"message" in x?String(x.message):"").filter(Boolean);
      throw Error((code==="HR_LEAVE_QUOTA"?"假額度超限":code==="HR_COMP_INSUFFICIENT"?"補休不足":"排班違反不可核准的規則")+"："+messages.join("；"));
     }
     throw Error(envelope.error?.message??"假單儲存失敗");
    }
    const result=envelope.data;if(!result?.batchId)throw Error("伺服器沒有回傳假單編號");
    batchId=result.batchId;
    setCreatedBatchId(batchId);
    setApprovalItems([]);
   }
   for(let i=uploadedCount;i<files.length;i++){
    const blob=await resizeToJpeg(files[i],{maxSide:1600,quality:0.8,grayscale:gray});if(blob.size>1572864)throw Error("照片縮圖後仍超過 1.5 MB");
    const response=await fetch("/api/business/hr/leave-requests/"+batchId+"/attachments",{method:"POST",credentials:"same-origin",
      headers:{"content-type":"image/jpeg","x-grayscale":gray?"1":"0"},body:blob});
    if(!response.ok){const json=await response.json().catch(()=>({error:{message:"附檔儲存未設定"}}));throw Error(json?.error?.message??"附件上傳失敗")}
    setUploadedCount(i+1);
   }
   onSaved();onClose();
  }catch(e){setError(e instanceof Error?e.message:"假單儲存失敗")}finally{setBusy(false)}
 }
 return <Dialog open={given!==null} title={completed?"假單／銷假":"請假單"}
  onClose={onClose} size={completed?"small":"large"} showCloseButton={!!completed||!!createdBatchId}>
  {confirmationDialog}
  {person&&completed?<form onKeyDown={enterAdvancesFields} className="cy-op-form" onSubmit={e=>void cancelCompleted(e)}>
    <EntryFields label="銷假" rows={[
     {label:"員工",content:<span>{person.employee_no}　{person.name}</span>},
     {label:"日期／假別",content:<span>{completed.date.replaceAll("-","/")}　{completed.code}　{(completed.minutes/60).toFixed(1)} 小時</span>},
     {label:"銷假原因",required:true,content:<textarea className="cy-sheet-input" value={cancelReason} onChange={e=>setCancelReason(e.target.value)}/>}
    ]}/>
    <p>此日已有正式假單，不能直接從排班格更改；須先銷假留下原因。</p>
    {error?<p role="alert" className="cy-notice cy-notice-danger">{error}</p>:null}
    <div className="cy-op-form-footer">
     <button type="button" className="cy-op-button" onClick={onClose}>返回</button>
     <button className="cy-op-button primary" disabled={busy||!cancelReason.trim()}>銷假</button>
    </div>
  </form>:person?<form onKeyDown={enterAdvancesFields} className="cy-op-form" onSubmit={e=>void submit(e)}>
   <EntryFields label="請假單" rows={[
    {label:"員工",content:people?<select className="cy-sheet-input" value={person.id}
       onChange={e=>{const next=people.find(x=>x.id===Number(e.target.value));if(next){setPerson(next);setWholeDay(next.employment_type==="full")}}}>
       {people.map(x=><option key={x.id} value={x.id}>{x.employee_no} {x.name}</option>)}
      </select>:<span>{person.employee_no}　{person.name}（{person.employment_type==="full"?"正職":person.employment_type==="half"?"半職":"兼職"}）</span>},
    {label:"假別",required:true,content:<select className="cy-sheet-input" value={typeId} onChange={e=>setTypeId(Number(e.target.value))}>
       {types.filter(x=>x.is_active!==0&&x.code!=="國").map(x=><option key={x.id} value={x.id}>{x.code} {x.name}</option>)}
      </select>},
    {label:"請假日期",required:true,content:<DateInput density="regular" max="9999-12-31" className="cy-sheet-input" value={from} onChange={v=>{setFrom(v);if(!wholeDay)setTo(v)}}/>},
    ...(person.employment_type==="full"?[{label:"整天請假",content:<CheckField label="整天請假（8 小時）" checked={wholeDay} onChange={e=>setWholeDay(e.target.checked)}/>}]:[]),
    ...(wholeDay?[{label:"結束日期",required:true,content:<DateInput density="regular" min={from} max="9999-12-31" className="cy-sheet-input" value={to} onChange={setTo}/>}]:[
      ...(person.employment_type!=="full"?[{label:"直接填分鐘",content:<CheckField label="沒有班別，輸入分鐘數" checked={manualMinutes} onChange={e=>setManualMinutes(e.target.checked)}/>}]:[]),
      ...(manualMinutes&&person.employment_type!=="full"?[
       {label:"請假時數（分鐘）",required:true,content:<input className="cy-sheet-input" type="number" min="30" step="30" value={minutes} onChange={e=>setMinutes(e.target.value)}/>}
      ]:[
       {label:"起始時間",content:<TimeInput className="cy-sheet-input" value={startTime} onChange={setStartTime}/>},
       {label:"結束時間",content:<TimeInput className="cy-sheet-input" value={endTime} onChange={setEndTime}/>}
      ])
    ]),
    ...(isComp?[{label:"補休來源",content:<select className="cy-sheet-input" value={advanceDate} onChange={e=>setAdvanceDate(e.target.value)}>
      <option value="">使用現有補休</option>
      {holidays.map(h=><option key={h.date} value={h.date}>預支 {h.date.replaceAll("-","/")} {h.name} 的補休</option>)}
     </select>}]:[]),
    ...(type?.requires_reason?[{label:"事由",required:true,content:<textarea className="cy-sheet-input" value={reason} onChange={e=>setReason(e.target.value)}/>}]:[]),
    ...(type?.quota_period==="event"?[{label:"事件日期",required:true,content:<DateInput density="regular" max="9999-12-31" className="cy-sheet-input" value={eventDate} onChange={setEventDate}/>}]:[]),
    ...(type?.event_quota_options?[{label:"本次天數",content:<select className="cy-sheet-input" value={eventDays} onChange={e=>setEventDays(e.target.value)}>
      {type.event_quota_options.split(",").map(x=><option key={x}>{x}</option>)}
     </select>}]:[]),
    ...(type?.accepts_proof?[
      {label:"證明照片（最多 3 張）",content:<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setFiles(Array.from(e.target.files??[]).slice(0,3))}/>},
      {label:"黑白縮圖",content:<CheckField label="轉為黑白" checked={gray} onChange={e=>setGray(e.target.checked)}/>}
    ]:[])
   ]}/>
   <p>預計請假 {(wholeDay&&to!==from?from+"～"+to:from).replaceAll("-","/")}，假別：{type?.name??"尚未選擇"}。{wholeDay?"所選有效日期的排班格會同步改為假別，例休日及國定假日依規則跳過。":manualMinutes?"無班別日期依填寫的分鐘數請假；已有班別的日期須改用起訖時間。":"部分時數的班別維持不變。"}送出會檢查假額、補休與排班規則。</p>
   {type?.accepts_proof&&previews.length?<div className="hr-cell-choices" aria-label="證明照片預覽">
    {previews.map((url,i)=><img key={url} src={url} alt={"證明照片 "+(i+1)} width={96} height={96} style={{objectFit:"cover"}}/>)}
   </div>:null}
   {createdBatchId?<p role="status">正式假單已建立。若附件上傳失敗，可以重試上傳，或略過附件完成。</p>:null}
   {approvalItems.length?<div className="cy-op-panel" role="alert"><h4>排班需要主管核准</h4>
    {approvalItems.map((x,i)=><p key={i}>{x.startDate}～{x.endDate}：{x.suggestion}</p>)}
    <button type="button" className="cy-op-button primary" disabled={busy} onClick={async()=>{
     const accepted=await confirm({title:"核准連六／兼職超時",description:"確認以主管身分核准以上排班，並建立正式假單？",confirmLabel:"核准並送出",confirmTone:"danger"});
     if(accepted)void submit(undefined,approvalItems);
    }}>核准並送出假單</button></div>:null}
   {error?<p role="alert" className="cy-notice cy-notice-danger">{error}</p>:null}
   <div className="cy-op-form-footer">
    <button type="button" className="cy-op-button" onClick={()=>{if(createdBatchId)onSaved();onClose()}}>{createdBatchId?"略過附件並完成":"取消"}</button>
    <button className="cy-op-button primary" disabled={busy}>{createdBatchId?"重試上傳剩餘附件":"送出假單"}</button>
   </div>
  </form>:null}
 </Dialog>;
}
