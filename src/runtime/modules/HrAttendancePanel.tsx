import {useCallback,useEffect,useState,type KeyboardEvent} from "react";
import {apiRequest} from "../../api/client";
import {taipeiToday} from "../../../shared/erp-query-history";
import {normalizePunchTime} from "../../../shared/hr-attendance";
import {useUnsavedChangesGuard} from "../../ui/foundation/useUnsavedChangesGuard";
import {Dialog} from "../../ui/overlays/Dialog";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import "./hr-phase2a.css";
type Employee={id:number;employee_no:string;name:string;store_id:number|null};
type Punch={in1:string|null;out1:string|null;in2:string|null;out2:string|null;revision:number;note:string};
type Day={date:string;schedule:{kind:string;code:string|null;off_mark:string|null;rest_label:string|null;hours:number|null}|null;punches:Punch|null;workedMinutes:number;lateMinutes:number;earlyMinutes:number;anomalies:string[]};
type Report={employeeId:number;storeId:number|null;days:Day[];totals:{workedMinutes:number;lateCount:number;lateMinutes:number;missingCard:number;absent:number}};
type Change=Punch&{date:string};
type Exception={employeeId:number;employeeNo:string;name:string;date:string;anomalies:string[]};
const ROOT="/api/business/hr",punchFields=["in1","out1","in2","out2"] as const,weekdays=["日","一","二","三","四","五","六"];
const hrs=(v:number)=>(Math.round(v/30)/2).toFixed(1);
const adjacent=(value:string,by:number)=>{const d=new Date(value+"-01T00:00:00Z");d.setUTCMonth(d.getUTCMonth()+by);return d.toISOString().slice(0,7)};
export function HrAttendancePanel(){
 const [employees,setEmployees]=useState<Employee[]>([]),[selected,setSelected]=useState(0),[month,setMonth]=useState(taipeiToday().slice(0,7));
 const [data,setData]=useState<Report|null>(null),[changes,setChanges]=useState<Record<string,Change>>({});
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const [exceptions,setExceptions]=useState<Exception[]|null>(null),[filter,setFilter]=useState("");
 const dirty=Object.keys(changes).length>0;
 const {confirm,confirmationDialog}=useConfirmation();
 const discard=async()=>!dirty||await confirm({title:"放棄未儲存的打卡",description:"切換後，尚未儲存的打卡輸入會遺失。",confirmLabel:"放棄",cancelLabel:"繼續編輯",confirmTone:"danger"});
 useUnsavedChangesGuard({active:dirty,blocked:busy,message:"出勤輸入尚未儲存，確定離開？"});
 useEffect(()=>{void apiRequest<{items:Employee[]}>(ROOT+"/employees?limit=100").then(x=>{setEmployees(x.items);setSelected(x.items[0]?.id??0)}).catch(e=>setError(String(e)))},[]);
 const reload=useCallback(async()=>{
  if(!selected)return;setBusy(true);
  try{const x=await apiRequest<Report>(ROOT+"/employees/"+selected+"/attendance?month="+month);setData(x);setChanges({});setError("");}
  catch(e){setError(e instanceof Error?e.message:"出勤查詢失敗")}finally{setBusy(false)}
 },[selected,month]);
 useEffect(()=>{void reload()},[reload]);
 function change(day:Day,key:keyof Punch,value:string){
  const before=changes[day.date]??{date:day.date,in1:day.punches?.in1??null,out1:day.punches?.out1??null,in2:day.punches?.in2??null,out2:day.punches?.out2??null,revision:day.punches?.revision??0,note:day.punches?.note??""};
  setChanges(old=>({...old,[day.date]:{...before,[key]:value}}));
 }
 function enter(e:KeyboardEvent<HTMLInputElement>){if(e.key!=="Enter")return;e.preventDefault();const inputs=[...document.querySelectorAll<HTMLInputElement>(".hr-attendance-table input[data-clock]")];inputs[inputs.indexOf(e.currentTarget)+1]?.focus()}
 async function save(){
  setBusy(true);setError("");
  try{const entries=Object.values(changes).map(x=>({...x,...Object.fromEntries(punchFields.map(key=>[key,x[key]?normalizePunchTime(x[key]!):null]))}));
   const response=await apiRequest<{changedDays:number}>(ROOT+"/employees/"+selected+"/attendance?month="+month,{method:"PUT",json:{days:entries}});
   setNotice("已儲存 "+response.changedDays+" 天出勤");await reload();
  }catch(e){setError(e instanceof Error?e.message:"儲存失敗")}finally{setBusy(false)}
 }
 async function anomalyList(){
  const storeId=employees.find(x=>x.id===selected)?.store_id;
  if(!storeId){setError("請選擇已設定門市的員工");return}
  setBusy(true);try{setExceptions(await apiRequest<Exception[]>(ROOT+"/attendance/anomalies?storeId="+storeId+"&month="+month))}
  catch(e){setError(e instanceof Error?e.message:"無法取得異常清單")}finally{setBusy(false)}
 }
 async function switchMonth(n:number){if(await discard())setMonth(x=>adjacent(x,n))}
 async function switchEmployee(id:number){if(await discard())setSelected(id)}
 return <section className="cy-op-module cy-hr-phase2a" aria-label="出勤輸入">
  <div className="cy-op-panel hr-roster-toolbar">
   <label>員工<select className="cy-op-input" value={selected} onChange={e=>void switchEmployee(Number(e.target.value))}>{employees.map(e=><option key={e.id} value={e.id}>{e.employee_no} {e.name}</option>)}</select></label>
   <button type="button" className="cy-op-button" onClick={()=>void switchMonth(-1)}>上個月</button><strong>{month.replace("-"," 年 ")} 月</strong><button type="button" className="cy-op-button" onClick={()=>void switchMonth(1)}>下個月</button>
   <button type="button" className="cy-op-button" onClick={()=>void anomalyList()}>異常清單</button>
   {dirty?<><button type="button" className="cy-op-button primary" disabled={busy} onClick={()=>void save()}>儲存</button><button type="button" className="cy-op-button" disabled={busy} onClick={()=>void reload()}>取消</button></>:null}
  </div>
  {error?<p role="alert" className="cy-notice cy-notice-danger">{error}</p>:null}{notice?<p role="status" className="cy-notice">{notice}</p>:null}
  <div className="hr-roster-scroll"><table className="cy-op-table hr-attendance-table"><thead><tr><th>日期</th><th>星期</th><th>排定</th><th>上班 1</th><th>下班 1</th><th>上班 2</th><th>下班 2</th><th>工時</th><th>遲到</th><th>早退</th><th>異常</th><th>備註</th></tr></thead>
   <tbody>{data?.days.map(row=>{const punch=changes[row.date]??row.punches;return <tr key={row.date}>
    <th scope="row">{row.date.replaceAll("-","/")}</th><td>{weekdays[new Date(row.date+"T00:00:00Z").getUTCDay()]}</td>
    <td>{row.schedule?.kind==="off"?row.schedule.off_mark==="x"?"X":row.schedule.rest_label==="regular"?"例":"/":row.schedule?.kind==="shift"?row.schedule.code??"班":row.schedule?.kind==="hours"?String(row.schedule.hours)+"h":row.schedule?.kind==="leave"?row.schedule.code??"假":"—"}</td>
    {punchFields.map(k=><td key={k}><input data-clock={k} className="cy-op-input hr-attendance-clock" placeholder="HH:mm" aria-label={row.date+" "+k} value={punch?.[k]??""}
      onChange={e=>change(row,k,e.target.value)} onBlur={e=>{if(e.target.value.trim())try{change(row,k,normalizePunchTime(e.target.value))}catch{/* Preserve invalid entry for correction */}}} onKeyDown={enter}/></td>)}
    <td>{hrs(row.workedMinutes)}h</td><td>{row.lateMinutes||"—"}</td><td>{row.earlyMinutes||"—"}</td><td>{row.anomalies.join("、")||"—"}</td>
    <td><input className="cy-op-input" aria-label={row.date+" 備註"} value={punch?.note??""} onChange={e=>change(row,"note",e.target.value)}/></td>
   </tr>})}</tbody></table></div>
  {data?<div className="cy-op-panel hr-attendance-totals"><strong>當月合計</strong><span>工時 {hrs(data.totals.workedMinutes)}h</span><span>遲到 {data.totals.lateCount} 次／{data.totals.lateMinutes} 分鐘</span><span>缺卡 {data.totals.missingCard}</span><span>曠職 {data.totals.absent}</span></div>:null}
  <Dialog open={exceptions!==null} title="出勤異常清單" onClose={()=>setExceptions(null)} size="large">
   <label>員工<select className="cy-op-input" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">全部</option>{employees.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   {exceptions?.filter(x=>!filter||String(x.employeeId)===filter).map((x,i)=><p key={i}>{x.date.replaceAll("-","/")}　{x.name}　{x.anomalies.join("、")}</p>)}
   {exceptions?.length===0?<p>目前沒有異常紀錄</p>:null}
  </Dialog>
  {confirmationDialog}
 </section>;
}
