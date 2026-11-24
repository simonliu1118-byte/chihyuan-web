import {useLatestRequest} from '../../ui/foundation/useLatestRequest';
import {TimeInput} from '../../ui/forms/TimeInput';
import {useUnsavedChangesGuard} from '../../ui/foundation/useUnsavedChangesGuard';
import {useConfirmation} from '../../ui/overlays/useConfirmation';
import {DateInput} from "../../ui/forms/DateInput";
import {Field} from "../../ui/forms/Field";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {apiRequest} from "../../api/client";
import {taipeiToday} from "../../../shared/erp-query-history";
import {ActiveChip,SettingsEditor,SettingsPane,SettingsTable} from "./HrSettingsPane";
export type LookupKind="stores"|"job-titles"|"shift-types";
type Item={id:number;name:string;code?:string;is_active:number;sort_order:number;cycle_anchor_date?:string;rules_template?:string;
 start_time?:string;end_time?:string;break_start?:string|null;break_end?:string|null;normal_minutes?:number};
type Holiday={date:string;name:string};
const ROOT="/api/business/hr/settings";
const kindLabels:Record<LookupKind,string>={stores:"門市","job-titles":"職稱","shift-types":"班別"};
function minutes(text:string){if(!/^\d{2}:\d{2}$/.test(text))return 0;return Number(text.slice(0,2))*60+Number(text.slice(3))}
const message=(e:unknown,fallback:string)=>e instanceof Error?e.message:fallback;

/** 門市、職稱、班別: one table; 新增／修改 open an editor dialog (no inline editable rows). */
export function HrLookupSettings({kind}:{kind:LookupKind}){
 const [rows,setRows]=useState<Item[]>([]),[loaded,setLoaded]=useState(false);
 const [editing,setEditing]=useState<{id:number|null}|null>(null),[value,setValue]=useState<Record<string,string>>({});
 const writing=useRef(false);
 const [error,setError]=useState(""),[editorError,setEditorError]=useState(""),[busy,setBusy]=useState(false);
 useUnsavedChangesGuard({active:editing!==null,blocked:busy});
 const request=useLatestRequest(kind);
 const refresh=useCallback(async()=>{
  const ticket=request.begin();
  try{const data=await apiRequest<Item[]>(ROOT+"/"+kind);if(ticket.current()){setRows(data);setLoaded(true)}}
  catch(e){if(ticket.current())setError(message(e,"設定讀取失敗"))}
 },[kind,request]);
 useEffect(()=>{setRows([]);setLoaded(false);setError("");setEditing(null);void refresh()},[refresh]);
 const change=(key:string,val:string)=>setValue(x=>({...x,[key]:val}));
 function edit(row?:Item){
  setEditorError("");setEditing({id:row?.id??null});
  setValue(row?{name:row.name,code:row.code??"",sortOrder:String(row.sort_order),isActive:String(row.is_active===1),
   cycleAnchorDate:row.cycle_anchor_date??"",rulesTemplate:row.rules_template??"",startTime:row.start_time??"",
   endTime:row.end_time??"",breakStart:row.break_start??"",breakEnd:row.break_end??""}
   :{name:"",code:"",sortOrder:"0",isActive:"true",cycleAnchorDate:"2026-09-28",rulesTemplate:"",
    startTime:"09:00",endTime:"17:30",breakStart:"",breakEnd:""});
 }
 function close(){setEditing(null);setValue({});setEditorError("")}
 async function save(e:FormEvent){e.preventDefault();if(writing.current||!editing)return;writing.current=true;setBusy(true);setEditorError("");
  try{const body:Record<string,unknown>={...value,id:editing.id??undefined,sortOrder:Number(value.sortOrder??0),isActive:value.isActive!=="false"};
   if(kind==="shift-types"){
    const elapsed=minutes(value.endTime??"")-minutes(value.startTime??"");
    body.normalMinutes=elapsed-(value.breakStart&&value.breakEnd?minutes(value.breakEnd)-minutes(value.breakStart):0);
   }
   await apiRequest(ROOT+"/"+kind,{method:editing.id?"PATCH":"POST",json:body});
   close();await refresh();
  }catch(e){setEditorError(message(e,"儲存失敗"))}finally{writing.current=false;setBusy(false)}
 }
 const label=kindLabels[kind];
 const heads=["名稱",...(kind==="shift-types"?["代號","上班","下班","休息","正常工時"]:[]),...(kind==="stores"?["雙週起算週一"]:[]),"排序","狀態",""];
 const cells=(row:Item)=>[<td key="n"><strong>{row.name}</strong></td>,
  ...(kind==="shift-types"?[<td key="c">{row.code}</td>,<td key="s">{row.start_time}</td>,<td key="e">{row.end_time}</td>,<td key="b">{row.break_start&&row.break_end?row.break_start+"–"+row.break_end:"—"}</td>,<td key="m" className="cy-hrs-num">{row.normal_minutes} 分</td>]:[]),
  ...(kind==="stores"?[<td key="a">{row.cycle_anchor_date?.replaceAll("-","/")}</td>]:[]),
  <td key="o" className="cy-hrs-num">{row.sort_order}</td>,<td key="t"><ActiveChip active={row.is_active===1}/></td>];
 const elapsed=Math.max(0,minutes(value.endTime??"")-minutes(value.startTime??"")-(value.breakStart&&value.breakEnd?minutes(value.breakEnd)-minutes(value.breakStart):0));
 return <SettingsPane title={label} actionLabel={"＋ 新增"+label} onAction={()=>edit()} actionDisabled={!loaded} error={error}>
  <SettingsTable label={label+"設定"} head={heads.map((h,i)=><th key={i}>{h}</th>)} empty={loaded&&!rows.length?"尚無"+label+"設定。":undefined}>
   {rows.map(row=><tr key={row.id}>{cells(row)}<td className="cy-hrs-actions"><button key="edit" type="button" className="cy-op-button compact" disabled={busy} onClick={()=>edit(row)}>修改</button></td></tr>)}
  </SettingsTable>
  {editing?<SettingsEditor title={(editing.id?"修改":"新增")+label} size={kind==="job-titles"?"small":"medium"} note={kind==="shift-types"?<p className="cy-hrs-form-note">正常工時：{elapsed} 分鐘</p>:undefined} busy={busy} error={editorError} onClose={close} onSubmit={e=>void save(e)}>
   <>
    <Field label="名稱" required size="m"><input className="cy-op-input" disabled={busy} value={value.name??""} onChange={e=>change("name",e.target.value)}/></Field>
    {kind==="shift-types"?<Field label="代號" required size="s"><input className="cy-op-input" disabled={busy} value={value.code??""} onChange={e=>change("code",e.target.value)}/></Field>:null}
    <Field label="排序" size="s"><input className="cy-op-input" type="number" disabled={busy} value={value.sortOrder??""} onChange={e=>change("sortOrder",e.target.value)}/></Field>
    <Field label="狀態" size="s"><select className="cy-op-input" disabled={busy} value={value.isActive??"true"} onChange={e=>change("isActive",e.target.value)}><option value="true">啟用</option><option value="false">停用</option></select></Field>
    {kind==="stores"?<>
     <Field label="雙週起算週一" required size="s"><DateInput disabled={busy} className="cy-op-input" max="9999-12-31" value={value.cycleAnchorDate??""} onChange={v=>change("cycleAnchorDate",v)}/></Field>
     <Field label="注意事項範本" size="l"><textarea className="cy-op-input" disabled={busy} value={value.rulesTemplate??""} onChange={e=>change("rulesTemplate",e.target.value)}/></Field></>:null}
    {kind==="shift-types"?<>
     <Field label="上班時間" required size="s"><TimeInput disabled={busy} className="cy-op-input" value={value.startTime??""} onChange={v=>change("startTime",v)}/></Field>
     <Field label="下班時間" required size="s"><TimeInput disabled={busy} className="cy-op-input" value={value.endTime??""} onChange={v=>change("endTime",v)}/></Field>
     <Field label="休息開始" size="s"><TimeInput disabled={busy} className="cy-op-input" value={value.breakStart??""} onChange={v=>change("breakStart",v)}/></Field>
     <Field label="休息結束" size="s"><TimeInput disabled={busy} className="cy-op-input" value={value.breakEnd??""} onChange={v=>change("breakEnd",v)}/></Field></>:null}
   </>
  </SettingsEditor>:null}
 </SettingsPane>;
}

/** 國定假日（人工維護）: a compact ‹ 2026 › year switch and a table; add opens a small dialog. */
export function HrHolidaySettings(){
 const [year,setYear]=useState(Number(taipeiToday().slice(0,4))),[holidays,setHolidays]=useState<Holiday[]>([]),[loaded,setLoaded]=useState(false);
 const [adding,setAdding]=useState(false),[holidayDate,setHolidayDate]=useState(""),[holidayName,setHolidayName]=useState("");
 const {confirm,confirmationDialog}=useConfirmation();
 const writing=useRef(false);
 const [error,setError]=useState(""),[editorError,setEditorError]=useState(""),[busy,setBusy]=useState(false);
 useUnsavedChangesGuard({active:adding,blocked:busy});
 const request=useLatestRequest("holidays|"+year);
 const refresh=useCallback(async()=>{
  const ticket=request.begin();setLoaded(false);
  try{const data=await apiRequest<Holiday[]>(ROOT+"/holidays?year="+year);if(ticket.current()){setHolidays(data);setLoaded(true)}}
  catch(e){if(ticket.current())setError(message(e,"設定讀取失敗"))}
 },[year,request]);
 useEffect(()=>{setError("");void refresh()},[refresh]);
 function open(){setHolidayDate("");setHolidayName("");setEditorError("");setAdding(true)}
 async function save(e:FormEvent){e.preventDefault();if(writing.current)return;writing.current=true;setBusy(true);setEditorError("");
  try{await apiRequest(ROOT+"/holidays",{method:"POST",json:{date:holidayDate,name:holidayName}});setAdding(false);await refresh()}
  catch(e){setEditorError(message(e,"儲存失敗"))}finally{writing.current=false;setBusy(false)}
 }
 async function remove(date:string){if(writing.current)return;if(!(await confirm({title:"刪除國定假日",description:"確定刪除 "+date+" 國定假日？",confirmLabel:"刪除",confirmTone:"danger"})))return;writing.current=true;setBusy(true);
  try{await apiRequest(ROOT+"/holidays?date="+date,{method:"DELETE"});await refresh()}catch(e){setError(message(e,"刪除失敗"))}finally{writing.current=false;setBusy(false)}
 }
 const thisYear=Number(taipeiToday().slice(0,4));
 return <SettingsPane title="國定假日" hint="人工維護；依年份切換。" actionLabel="＋ 新增國定假日" onAction={open} actionDisabled={busy} error={error}>
  {confirmationDialog}
  <span className="cy-hrs-year" role="group" aria-label="年份">
   <button type="button" aria-label="上一年" disabled={busy||year<=thisYear-1} onClick={()=>setYear(y=>y-1)}>‹</button>
   <strong>{year}</strong>
   <button type="button" aria-label="下一年" disabled={busy||year>=thisYear+1} onClick={()=>setYear(y=>y+1)}>›</button>
  </span>
  <SettingsTable label="國定假日設定" head={<><th>日期</th><th>名稱</th><th/></>} empty={loaded&&!holidays.length?year+" 年尚無國定假日。":undefined}>
   {holidays.map(h=><tr key={h.date}><td>{h.date.replaceAll("-","/")}</td><td>{h.name}</td><td className="cy-hrs-actions"><button key="del" type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void remove(h.date)}>刪除</button></td></tr>)}
  </SettingsTable>
  {adding?<SettingsEditor title="新增國定假日" size="small" busy={busy} error={editorError} onClose={()=>setAdding(false)} onSubmit={e=>void save(e)}>
   <>
    <Field label="日期" required size="s"><DateInput disabled={busy} density="regular" max="9999-12-31" className="cy-op-input" value={holidayDate} onChange={setHolidayDate}/></Field>
    <Field label="名稱" required size="m"><input disabled={busy} className="cy-op-input" value={holidayName} onChange={e=>setHolidayName(e.target.value)}/></Field>
   </>
  </SettingsEditor>:null}
 </SettingsPane>;
}
