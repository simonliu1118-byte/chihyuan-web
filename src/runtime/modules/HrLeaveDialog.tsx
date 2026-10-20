import {useEffect,useState,type FormEvent} from "react";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {apiRequest} from "../../api/client";
import {enterAdvancesFields} from "../../ui/foundation/enter-advance";
import {Dialog} from "../../ui/overlays/Dialog";
import {taipeiToday} from "../../../shared/erp-query-history";
type LeaveApproval={employeeId:number;kind:"consecutive"|"over_eight";startDate:string;endDate:string;suggestion:string};
export interface LeaveTypeOption{id:number;code:string;name:string;quota_days?:number|null;requires_reason?:number;accepts_proof?:number;quota_period?:string|null;event_quota_options?:string|null;is_active?:number}
export interface LeavePerson{id:number;name:string;employee_no:string;employment_type:"full"|"half"|"casual"}
export interface CompletedLeaveInfo{batchId:string;date:string;code:string;minutes:number}
export function HrLeaveDialog({person,types,initialDate,completed,onClose,onSaved}:{person:LeavePerson|null;types:LeaveTypeOption[];initialDate?:string;completed?:CompletedLeaveInfo|null;onClose:()=>void;onSaved:()=>void}){
 const [typeId,setTypeId]=useState(0),[from,setFrom]=useState(taipeiToday()),[to,setTo]=useState(taipeiToday());
 const [wholeDay,setWholeDay]=useState(true),[startTime,setStartTime]=useState("09:00"),[endTime,setEndTime]=useState("17:00"),[minutes,setMinutes]=useState("120");
 const [reason,setReason]=useState(""),[eventDate,setEventDate]=useState(""),[eventDays,setEventDays]=useState("8"),[files,setFiles]=useState<File[]>([]),[gray,setGray]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [cancelReason,setCancelReason]=useState("");
 const [approvalItems,setApprovalItems]=useState<LeaveApproval[]>([]);
 const [createdBatchId,setCreatedBatchId]=useState<string|null>(null),[uploadedCount,setUploadedCount]=useState(0);
 const [previews,setPreviews]=useState<string[]>([]);
 const {confirm,confirmationDialog}=useConfirmation();
 useEffect(()=>{const urls=files.map(file=>URL.createObjectURL(file));setPreviews(urls);return()=>urls.forEach(url=>URL.revokeObjectURL(url));},[files]);
 useEffect(()=>{if(person){setFrom(initialDate??taipeiToday());setTo(initialDate??taipeiToday());setWholeDay(person.employment_type==="full");setTypeId(types[0]?.id??0);setError("");setApprovalItems([]);setFiles([]);setCreatedBatchId(null);setUploadedCount(0);setCancelReason("")}},[person,initialDate,types]);
 const type=types.find(x=>x.id===typeId);
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
 async function resized(file:File):Promise<Blob>{
  const image=await createImageBitmap(file);const ratio=Math.min(1,1600/Math.max(image.width,image.height));
  const canvas=document.createElement("canvas");canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);
  const ctx=canvas.getContext("2d");if(!ctx)throw Error("無法處理照片");
  ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close();
  if(gray){const data=ctx.getImageData(0,0,canvas.width,canvas.height);for(let i=0;i<data.data.length;i+=4){
   const v=Math.round(.299*data.data[i]+.587*data.data[i+1]+.114*data.data[i+2]);data.data[i]=v;data.data[i+1]=v;data.data[i+2]=v;
  }ctx.putImageData(data,0,0)}
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error("照片轉換失敗")),"image/jpeg",.8));
 }
 async function submit(e?:FormEvent,approve:LeaveApproval[]=[]){
  e?.preventDefault();if(!person)return;setBusy(true);setError("");
  try{
   if(type?.requires_reason&&!reason.trim())throw Error("事假請填事由");
   let batchId=createdBatchId;
   if(!batchId){
    const response=await fetch("/api/business/hr/leave-requests",{method:"POST",credentials:"same-origin",
     headers:{"content-type":"application/json","accept":"application/json"},
     body:JSON.stringify({employeeId:person.id,leaveTypeId:typeId,from,date:from,to:wholeDay?to:from,wholeDay,
       startTime:wholeDay?undefined:startTime,endTime:wholeDay?undefined:endTime,minutes:wholeDay?undefined:Number(minutes),
       reason,eventDate:type?.quota_period==="event"?eventDate:undefined,
       eventQuotaDays:type?.event_quota_options?Number(eventDays):undefined,approve})});
    const envelope=await response.json() as {ok:boolean;data?:{batchId:string};error?:{code:string;message:string;items?:unknown[]}};
    if(!response.ok||!envelope.ok){
     const details=envelope.error?.items??[],code=envelope.error?.code;
     if(code==="HR_ROSTER_CONSECUTIVE"){
      setApprovalItems(details as LeaveApproval[]);
      setError("新增假單會形成連六或兼職超時排班，請明確核准後重送。");return;
     }
     if(code==="HR_ROSTER_VIOLATION"||code==="HR_LEAVE_QUOTA"){
      const messages=details.map(x=>typeof x==="object"&&x!==null&&"message" in x?String(x.message):"").filter(Boolean);
      throw Error((code==="HR_LEAVE_QUOTA"?"假額度超限":"排班違反不可核准的規則")+": "+messages.join("；"));
     }
     throw Error(envelope.error?.message??"假單儲存失敗");
    }
    const result=envelope.data;if(!result?.batchId)throw Error("伺服器沒有回傳假單編號");
    batchId=result.batchId;
    setCreatedBatchId(batchId);
    setApprovalItems([]);
   }
   for(let i=uploadedCount;i<files.length;i++){
    const blob=await resized(files[i]);if(blob.size>1572864)throw Error("照片縮圖後仍超過 1.5 MB");
    const response=await fetch("/api/business/hr/leave-requests/"+batchId+"/attachments",{method:"POST",credentials:"same-origin",
      headers:{"content-type":"image/jpeg","x-grayscale":gray?"1":"0"},body:blob});
    if(!response.ok){const json=await response.json().catch(()=>({error:{message:"附檔儲存未設定"}}));throw Error(json?.error?.message??"附件上傳失敗")}
    setUploadedCount(i+1);
   }
   onSaved();onClose();
  }catch(e){setError(e instanceof Error?e.message:"假單儲存失敗")}finally{setBusy(false)}
 }
 return <Dialog open={person!==null} title={completed?"查看正式假單／銷假":"新增請假單"} onClose={onClose} size="medium">
  {confirmationDialog}
  {person&&completed?<form className="cy-op-form" onSubmit={e=>void cancelCompleted(e)} onKeyDown={enterAdvancesFields}>
   <p>員工：{person.employee_no}　{person.name}</p>
   <p>日期：{completed.date.replaceAll("-","/")}；假別：{completed.code}；時數：{(completed.minutes/60).toFixed(1)} 小時。</p>
   <p>此日已有正式假單，不能直接從排班格更改。若要調整，須先銷假並留下原因。</p>
   <label>銷假原因（必填）<textarea className="cy-op-input" required value={cancelReason} onChange={e=>setCancelReason(e.target.value)}/></label>
   {error?<p role="alert" className="cy-notice cy-notice-danger">{error}</p>:null}
   <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={onClose}>返回排班</button>
    <button className="cy-op-button primary" disabled={busy||!cancelReason.trim()}>銷假</button></div>
  </form>:person?<form className="cy-op-form" onSubmit={e=>void submit(e)} onKeyDown={enterAdvancesFields}>
   <p>{person.employee_no}　{person.name}（{person.employment_type==="full"?"正職":person.employment_type==="half"?"半職":"兼職"}）</p>
   <label>假別<select className="cy-op-input" value={typeId} onChange={e=>setTypeId(Number(e.target.value))} required>
    {types.filter(x=>x.is_active!==0&&x.code!=="國").map(x=><option key={x.id} value={x.id}>{x.code} {x.name}</option>)}</select></label>
   <label>請假日期<input className="cy-op-input" type="date" max="9999-12-31" required value={from} onChange={e=>{setFrom(e.target.value);if(!wholeDay)setTo(e.target.value)}}/></label>
   {person.employment_type==="full"?<label><input type="checkbox" checked={wholeDay} onChange={e=>setWholeDay(e.target.checked)}/>整天請假（8 小時）</label>:null}
   {wholeDay?<label>結束日期<input className="cy-op-input" type="date" min={from} max="9999-12-31" required value={to} onChange={e=>setTo(e.target.value)}/></label>:
    <><label>起始時間<input className="cy-op-input" type="time" value={startTime} onChange={e=>setStartTime(e.target.value)}/></label>
    <label>結束時間<input className="cy-op-input" type="time" value={endTime} onChange={e=>setEndTime(e.target.value)}/></label>
    {person.employment_type!=="full"?<label>沒有班別時的時數（分鐘，30 的倍數）<input className="cy-op-input" type="number" min="30" step="30" value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>:null}</>}
   {type?.requires_reason?<label>事由（必填）<textarea className="cy-op-input" required value={reason} onChange={e=>setReason(e.target.value)}/></label>:null}
   {type?.quota_period==="event"?<label>事件日期<input type="date" className="cy-op-input" max="9999-12-31" required value={eventDate} onChange={e=>setEventDate(e.target.value)}/></label>:null}
   {type?.event_quota_options?<label>本次天數<select className="cy-op-input" value={eventDays} onChange={e=>setEventDays(e.target.value)}>{type.event_quota_options.split(",").map(x=><option key={x}>{x}</option>)}</select></label>:null}
   {type?.accepts_proof?<><label>證明照片（最多 3 張，非必填）<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setFiles(Array.from(e.target.files??[]).slice(0,3))}/></label>
    <label><input type="checkbox" checked={gray} onChange={e=>setGray(e.target.checked)}/>黑白縮圖</label>{files.map(f=><small key={f.name}>{f.name}</small>)}</>:null}
   <p>預計請假 {wholeDay?from+"～"+to:from}，假別：{type?.name??"尚未選擇"}。{wholeDay?"所選有效日期的排班格會同步改為假別，例休日及國定假日依規則跳過。":"部分時數的班別維持不變。"}送出會檢查假額、補休與排班規則。</p>
   {type?.accepts_proof&&previews.length?<div className="hr-cell-choices" aria-label="證明照片預覽">{previews.map((url,i)=><img key={url} src={url} alt={"證明照片 "+(i+1)} width={96} height={96} style={{objectFit:"cover"}}/>)}</div>:null}
   {createdBatchId?<p role="status">正式假單已建立。若附件上傳失敗，可以重試上傳，或略過附件完成。</p>:null}
   {approvalItems.length?<div className="cy-op-panel" role="alert"><h4>排班需要主管核准</h4>
    {approvalItems.map((x,i)=><p key={i}>{x.startDate}～{x.endDate}：{x.suggestion}</p>)}
    <button type="button" className="cy-op-button primary" disabled={busy} onClick={async()=>{
      const accepted=await confirm({title:"核准連六／兼職超時",description:"確認以主管身分核准以上排班，並建立正式假單？",confirmLabel:"核准並送出",confirmTone:"danger"});
      if(accepted)void submit(undefined,approvalItems);
    }}>核准並送出假單</button></div>:null}
   {error?<p role="alert" className="cy-notice cy-notice-danger">{error}</p>:null}
   <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={()=>{if(createdBatchId)onSaved();onClose()}}>{createdBatchId?"略過附件並完成":"取消"}</button><button className="cy-op-button primary" disabled={busy}>{createdBatchId?"重試上傳剩餘附件":"送出假單"}</button></div>
  </form>:null}
 </Dialog>;
}
