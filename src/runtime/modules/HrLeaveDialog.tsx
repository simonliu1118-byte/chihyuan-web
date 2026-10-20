import {useEffect,useState,type FormEvent} from "react";
import {apiRequest} from "../../api/client";
import {enterAdvancesFields} from "../../ui/foundation/enter-advance";
import {Dialog} from "../../ui/overlays/Dialog";
import {taipeiToday} from "../../../shared/erp-query-history";
export interface LeaveTypeOption{id:number;code:string;name:string;quota_days?:number|null;requires_reason?:number;accepts_proof?:number;quota_period?:string|null;event_quota_options?:string|null;is_active?:number}
export interface LeavePerson{id:number;name:string;employee_no:string;employment_type:"full"|"half"|"casual"}
export function HrLeaveDialog({person,types,initialDate,onClose,onSaved}:{person:LeavePerson|null;types:LeaveTypeOption[];initialDate?:string;onClose:()=>void;onSaved:()=>void}){
 const [typeId,setTypeId]=useState(0),[from,setFrom]=useState(taipeiToday()),[to,setTo]=useState(taipeiToday());
 const [wholeDay,setWholeDay]=useState(true),[startTime,setStartTime]=useState("09:00"),[endTime,setEndTime]=useState("17:00"),[minutes,setMinutes]=useState("120");
 const [reason,setReason]=useState(""),[eventDate,setEventDate]=useState(""),[eventDays,setEventDays]=useState("8"),[files,setFiles]=useState<File[]>([]),[gray,setGray]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{if(person){setFrom(initialDate??taipeiToday());setTo(initialDate??taipeiToday());setWholeDay(person.employment_type==="full");setTypeId(types[0]?.id??0);setError("")}},[person,initialDate,types]);
 const type=types.find(x=>x.id===typeId);
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
 async function submit(e:FormEvent){e.preventDefault();if(!person)return;setBusy(true);setError("");
  try{
   if(type?.requires_reason&&!reason.trim())throw Error("事假請填事由");
   const result=await apiRequest<{batchId:string}>("/api/business/hr/leave-requests",{method:"POST",json:{
    employeeId:person.id,leaveTypeId:typeId,from,date:from,to:wholeDay?to:from,wholeDay,
    startTime:wholeDay?undefined:startTime,endTime:wholeDay?undefined:endTime,minutes:wholeDay?undefined:Number(minutes),
    reason,eventDate:type?.quota_period==="event"?eventDate:undefined,eventQuotaDays:type?.event_quota_options?Number(eventDays):undefined
   }});
   for(const file of files){
    const blob=await resized(file);if(blob.size>1572864)throw Error("照片縮圖後仍超過 1.5 MB");
    const response=await fetch("/api/business/hr/leave-requests/"+result.batchId+"/attachments",{method:"POST",credentials:"same-origin",
      headers:{"content-type":"image/jpeg","x-grayscale":gray?"1":"0"},body:blob});
    if(!response.ok){const json=await response.json().catch(()=>({error:{message:"附檔儲存未設定"}}));throw Error(json?.error?.message??"附件上傳失敗")}
   }
   onSaved();onClose();
  }catch(e){setError(e instanceof Error?e.message:"假單儲存失敗")}finally{setBusy(false)}
 }
 return <Dialog open={person!==null} title="新增請假單" onClose={onClose} size="medium">
  {person?<form className="cy-op-form" onSubmit={e=>void submit(e)} onKeyDown={enterAdvancesFields}>
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
   <p>送出時將檢查假額及補休帳戶；整天假同步更新排班。部分時數則保留原班別。</p>
   {error?<p role="alert" className="cy-notice cy-notice-danger">{error}</p>:null}
   <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={onClose}>取消</button><button className="cy-op-button primary" disabled={busy}>送出假單</button></div>
  </form>:null}
 </Dialog>;
}
