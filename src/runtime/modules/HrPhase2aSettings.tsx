import {useLatestRequest} from '../../ui/foundation/useLatestRequest';
import {TimeInput} from '../../ui/forms/TimeInput';
import {useUnsavedChangesGuard} from '../../ui/foundation/useUnsavedChangesGuard';
import {EntryTable,EntryHeading} from '../../ui/forms/EntryTable';
import {useConfirmation} from '../../ui/overlays/useConfirmation';
import { DateInput } from "../../ui/forms/DateInput";
import {Field} from "../../ui/forms/Field";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {apiRequest} from "../../api/client";
import {enterAdvancesFields,enterAdvancesThenSubmits} from "../../ui/foundation/enter-advance";
import {taipeiToday} from "../../../shared/erp-query-history";
import {HrLeaveTypeSettings} from "./HrLeaveTypeSettings";
type Kind="stores"|"job-titles"|"shift-types";
type Item={id:number;name:string;code?:string;is_active:number;sort_order:number;cycle_anchor_date?:string;rules_template?:string;
 start_time?:string;end_time?:string;break_start?:string|null;break_end?:string|null;normal_minutes?:number};
type Holiday={date:string;name:string};
const ROOT="/api/business/hr/settings";
const kindLabels:Record<Kind,string>={stores:"門市","job-titles":"職稱","shift-types":"班別"};
function minutes(text:string){if(!/^\d{2}:\d{2}$/.test(text))return 0;return Number(text.slice(0,2))*60+Number(text.slice(3))}
export function HrPhase2aSettings(){
 const [kind,setKind]=useState<Kind>("stores"),[rows,setRows]=useState<Item[]>([]),[year,setYear]=useState(Number(taipeiToday().slice(0,4))),[holidays,setHolidays]=useState<Holiday[]>([]);
 const [id,setId]=useState<number|null>(null),[value,setValue]=useState<Record<string,string>>({});
 const [holidayDate,setHolidayDate]=useState(""),[holidayName,setHolidayName]=useState("");
 const {confirm,confirmationDialog}=useConfirmation();
 const writing=useRef(false);
 const [error,setError]=useState(""),[busy,setBusy]=useState(false);
 useUnsavedChangesGuard({active:value.name!==undefined||!!holidayDate||!!holidayName,blocked:busy});
 const request=useLatestRequest(kind+"|"+year);
 const refresh=useCallback(async()=>{
  const ticket=request.begin();setRows([]);setHolidays([]);try{const [a,b]=await Promise.all([apiRequest<Item[]>(ROOT+"/"+kind),apiRequest<Holiday[]>(ROOT+"/holidays?year="+year)]);
  if(ticket.current()){setRows(a);setHolidays(b)}}catch(e){if(ticket.current())setError(e instanceof Error?e.message:"設定讀取失敗")}
 },[kind,year,request]);
 useEffect(()=>{void refresh().catch(e=>setError(String(e)))},[refresh]);
 const change=(key:string,val:string)=>setValue(x=>({...x,[key]:val}));

 function edit(row?:Item){
  setId(row?.id??null);setValue(row?{name:row.name,code:row.code??"",sortOrder:String(row.sort_order),isActive:String(row.is_active===1),
   cycleAnchorDate:row.cycle_anchor_date??"",rulesTemplate:row.rules_template??"",startTime:row.start_time??"",
   endTime:row.end_time??"",breakStart:row.break_start??"",breakEnd:row.break_end??""}
   :{name:"",code:"",sortOrder:"0",isActive:"true",cycleAnchorDate:"2026-09-28",rulesTemplate:"",
    startTime:"09:00",endTime:"17:30",breakStart:"",breakEnd:""});
 }
 async function save(e:FormEvent){e.preventDefault();if(writing.current)return;writing.current=true;setBusy(true);setError("");
  try{const body:Record<string,unknown>={...value,id:id??undefined,sortOrder:Number(value.sortOrder??0),isActive:value.isActive!=="false"};
   if(kind==="shift-types"){
    const elapsed=minutes(value.endTime??"")-minutes(value.startTime??"");
    body.normalMinutes=elapsed-(value.breakStart&&value.breakEnd?minutes(value.breakEnd)-minutes(value.breakStart):0);
   }
   await apiRequest(ROOT+"/"+kind,{method:id?"PATCH":"POST",json:body});
   setId(null);setValue({});await refresh();
  }catch(e){setError(e instanceof Error?e.message:"儲存失敗")}finally{writing.current=false;setBusy(false)}
 }
 async function saveHoliday(e:FormEvent){e.preventDefault();if(writing.current)return;writing.current=true;setBusy(true);setError("");
  try{await apiRequest(ROOT+"/holidays",{method:"POST",json:{date:holidayDate,name:holidayName}});setHolidayDate("");setHolidayName("");await refresh()}
  catch(e){setError(e instanceof Error?e.message:"儲存失敗")}finally{writing.current=false;setBusy(false)}
 }
 async function deleteHoliday(date:string){if(writing.current)return;if(!(await confirm({title:"刪除國定假日",description:"確定刪除 "+date+" 國定假日？",confirmLabel:"刪除",confirmTone:"danger"})))return;writing.current=true;setBusy(true);
  try{await apiRequest(ROOT+"/holidays?date="+date,{method:"DELETE"});await refresh()}catch(e){setError(String(e))}finally{writing.current=false;setBusy(false)}
 }

 const columns:{label:string;key:string;required?:boolean;type?:string}[]=[{label:'名稱',key:'name',required:true},...(kind==='shift-types'?[{label:'代號',key:'code',required:true}]:[]),{label:'排序',key:'sortOrder',type:'number'},{label:'狀態',key:'isActive'},...(kind==='stores'?[{label:'雙週起算週一',key:'cycleAnchorDate',type:'date',required:true},{label:'注意事項範本',key:'rulesTemplate'}]:[]),...(kind==='shift-types'?[{label:'上班時間',key:'startTime',type:'time',required:true},{label:'下班時間',key:'endTime',type:'time',required:true},{label:'休息開始',key:'breakStart',type:'time'},{label:'休息結束',key:'breakEnd',type:'time'}]:[])];
 const cell=(key:string,type='text')=>type==='date'?<DateInput disabled={busy} className="cy-sheet-input" max="9999-12-31" value={value[key]??''} onChange={v=>change(key,v)}/>:type==='time'?<TimeInput disabled={busy} className="cy-sheet-input" value={value[key]??''} onChange={v=>change(key,v)}/>:key==='isActive'?<select className="cy-sheet-input" disabled={busy} value={value.isActive??'true'} onChange={e=>change(key,e.target.value)}><option value="true">啟用</option><option value="false">停用</option></select>:key==='rulesTemplate'?<textarea className="cy-sheet-input" disabled={busy} value={value[key]??''} onChange={e=>change(key,e.target.value)}/>:<input className="cy-sheet-input" disabled={busy} type={type} max={type==='date'?'9999-12-31':undefined} value={value[key]??''} onChange={e=>change(key,e.target.value)}/>;
 const stored=(row:Item,key:string)=>({name:row.name,code:row.code,sortOrder:row.sort_order,isActive:row.is_active?'啟用':'停用',cycleAnchorDate:row.cycle_anchor_date,rulesTemplate:row.rules_template,startTime:row.start_time,endTime:row.end_time,breakStart:row.break_start,breakEnd:row.break_end}[key]??'—');
 const shown: (Item|null)[]=[...rows,...(value.name!==undefined&&id===null?[null]:[])];
 return <section className="cy-op-panel"><h3>門市、職稱、班別與國定假日</h3>{confirmationDialog}
  {error?<p role="alert" className="cy-notice cy-notice-danger">{error}</p>:null}
  <div className="hr-cell-choices">{(Object.keys(kindLabels) as Kind[]).map(k=><button key={k} type="button" disabled={busy||value.name!==undefined} className="cy-op-button" onClick={()=>{setKind(k);setId(null);setValue({})}}>{kindLabels[k]}</button>)}</div>
  <h4>{kindLabels[kind]}</h4>
  <form onKeyDown={enterAdvancesFields} className="cy-op-form" onSubmit={e=>void save(e)}>
   <EntryTable label={kindLabels[kind]+'設定'}><thead><tr>{columns.map(c=><th key={c.key}><EntryHeading required={c.required}>{c.label}</EntryHeading></th>)}<th>操作</th></tr></thead><tbody>
    {shown.map((row,i)=>{const editing=value.name!==undefined&&(row?row.id===id:id===null);return <tr key={row?.id??'new'}>{columns.map(c=><td key={c.key}>{editing?<Field label={c.label} required={c.required} presentation="cell">{cell(c.key,c.type)}</Field>:stored(row!,c.key)}</td>)}
     <td>{editing?<><button className="cy-op-button primary" disabled={busy}>儲存</button><button type="button" className="cy-op-button" disabled={busy} onClick={()=>{setId(null);setValue({})}}>取消</button></>:<button type="button" disabled={busy||value.name!==undefined} className="cy-op-button" onClick={()=>edit(row!)}>修改</button>}</td></tr>})}
   </tbody></EntryTable>
  </form>
  <button type="button" className="cy-op-button" disabled={busy||value.name!==undefined} onClick={()=>edit()}>＋ 新增{kindLabels[kind]}</button>
  {kind==='shift-types'&&value.name!==undefined?<p>正常工時：{Math.max(0,minutes(value.endTime??'')-minutes(value.startTime??'')-(value.breakStart&&value.breakEnd?minutes(value.breakEnd)-minutes(value.breakStart):0))} 分鐘</p>:null}
  <h4>國定假日（人工維護）</h4><label>年份<select className="cy-op-input" disabled={busy} value={year} onChange={e=>setYear(Number(e.target.value))}>{[year-1,year,year+1].map(y=><option key={y} value={y}>{y}</option>)}</select></label>
  <form onKeyDown={enterAdvancesThenSubmits} className="cy-op-form" onSubmit={e=>void saveHoliday(e)}>
   <EntryTable label="國定假日設定"><thead><tr><th><EntryHeading required>日期</EntryHeading></th><th><EntryHeading required>名稱</EntryHeading></th><th>操作</th></tr></thead><tbody>
    {holidays.map(h=><tr key={h.date}><td>{h.date.replaceAll('-','/')}</td><td>{h.name}</td><td><button type="button" className="cy-op-button" disabled={busy} onClick={()=>void deleteHoliday(h.date)}>刪除</button></td></tr>)}
    <tr><td><Field label="假日日期" presentation="cell" required><DateInput disabled={busy} density="regular" max="9999-12-31" className="cy-sheet-input" value={holidayDate} onChange={setHolidayDate}/></Field></td><td><Field label="假日名稱" presentation="cell" required><input disabled={busy} className="cy-sheet-input" value={holidayName} onChange={e=>setHolidayName(e.target.value)}/></Field></td><td><button className="cy-op-button primary" disabled={busy}>新增國定假日</button></td></tr>
   </tbody></EntryTable>
  </form>
 <HrLeaveTypeSettings/>
 </section>;
}
