import {ReorderHandle} from "../../ui/actions/ReorderHandle";
import {formatDate,formatDateTime} from "../../ui/foundation/format";
import {HR_OFFICIAL_UPDATE_SCHEDULE,HOLIDAY_DATASET,type OfficialUpdateState} from "../../../shared/hr-official-updates";
import {SETTINGS_SAVED_EVENT} from "./settings-events";
import {MonthPicker} from "../../ui/forms/MonthPicker";
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
type Holiday={date:string;name:string;note:string};
const ROOT="/api/business/hr/settings";
const kindLabels:Record<LookupKind,string>={stores:"門市","job-titles":"職稱","shift-types":"班別"};
function minutes(text:string){if(!/^\d{2}:\d{2}$/.test(text))return 0;return Number(text.slice(0,2))*60+Number(text.slice(3))}
const message=(e:unknown,fallback:string)=>e instanceof Error?e.message:fallback;

/** 門市、職稱、班別: one table; 新增／修改 open an editor dialog (no inline editable rows). */
export function HrLookupSettings({kind}:{kind:LookupKind}){
 const [rows,setRows]=useState<Item[]>([]),[loaded,setLoaded]=useState(false);
 const [editing,setEditing]=useState<{id:number|null}|null>(null),[value,setValue]=useState<Record<string,string>>({});
 const writing=useRef(false),dragging=useRef<number|null>(null);
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
   :{name:"",code:"",sortOrder:String(Math.max(0,...rows.map(x=>x.sort_order))+1),isActive:"true",cycleAnchorDate:"2026-09-28",rulesTemplate:"",
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
   close();await refresh();window.dispatchEvent(new Event(SETTINGS_SAVED_EVENT));
  }catch(e){setEditorError(message(e,"儲存失敗"))}finally{writing.current=false;setBusy(false)}
 }
 async function move(id:number,target:number){
  if(writing.current||editing||id===target)return;
  const from=rows.findIndex(x=>x.id===id),to=rows.findIndex(x=>x.id===target);
  if(from<0||to<0)return;
  const next=[...rows];const [item]=next.splice(from,1);next.splice(to,0,item);
  writing.current=true;setBusy(true);setError("");
  setRows(next.map((x,i)=>({...x,sort_order:i+1})));
  try{
   await apiRequest(ROOT+"/"+kind,{method:"PUT",json:{ids:next.map(x=>x.id)}});
   await refresh();window.dispatchEvent(new Event(SETTINGS_SAVED_EVENT));
  }catch(e){setRows(rows);setError(message(e,"排序儲存失敗"))}
  finally{writing.current=false;setBusy(false)}
 }
 const label=kindLabels[kind];
 const heads=["","項次","名稱",...(kind==="shift-types"?["代號","上班","下班","休息","正常工時"]:[]),...(kind==="stores"?["雙週起算週一"]:[]),"狀態","操作"];
 const cells=(row:Item)=>[<td key="n"><strong>{row.name}</strong></td>,
  ...(kind==="shift-types"?[<td key="c">{row.code}</td>,<td key="s">{row.start_time}</td>,<td key="e">{row.end_time}</td>,<td key="b">{row.break_start&&row.break_end?row.break_start+"–"+row.break_end:"—"}</td>,<td key="m" className="cy-hrs-num">{row.normal_minutes} 分</td>]:[]),
  ...(kind==="stores"?[<td key="a">{row.cycle_anchor_date?.replaceAll("-","/")}</td>]:[]),
  <td key="t"><ActiveChip active={row.is_active===1}/></td>];
 const elapsed=Math.max(0,minutes(value.endTime??"")-minutes(value.startTime??"")-(value.breakStart&&value.breakEnd?minutes(value.breakEnd)-minutes(value.breakStart):0));
 return <SettingsPane title={label} actionLabel={"＋ 新增"+label} onAction={()=>edit()} actionDisabled={!loaded||busy||!!editing} error={error}>
  <SettingsTable label={label+"設定"} columns={<><col className="cy-hrs-grip"/><col className="cy-hrs-seq"/><col/>{kind==="shift-types"?<><col className="cy-hrs-code-col"/><col className="cy-hrs-time-col"/><col className="cy-hrs-time-col"/><col className="cy-hrs-break-col"/><col className="cy-hrs-minutes-col"/></>:null}{kind==="stores"?<col className="cy-hrs-anchor-col"/>:null}<col className="cy-hrs-status-col"/><col className="cy-hrs-operation-col"/></>} head={heads.map((h,i)=><th key={i} className={i===0?"cy-hrs-grip":i===1?"cy-hrs-seq":h==="操作"?"cy-hrs-actions":undefined} aria-label={i===0?"拖拉排序":undefined}>{h}</th>)} empty={loaded&&!rows.length?"尚無"+label+"設定。":undefined}>
   {rows.map((row,i)=><tr key={row.id} data-hr-setting-id={row.id}
    onDragOver={e=>{if(!busy&&!editing&&dragging.current!==null){e.preventDefault();e.dataTransfer.dropEffect="move"}}}
    onDrop={e=>{e.preventDefault();const id=dragging.current;dragging.current=null;if(id!==null)void move(id,row.id)}}>
    <td className="cy-hrs-grip"><ReorderHandle label={row.name+"，拖拉排序（上下方向鍵亦可）"} disabled={busy||!!editing||rows.length<2} draggable={!busy&&!editing&&rows.length>1}
     onDragStart={e=>{dragging.current=row.id;e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",String(row.id))}} onDragEnd={()=>{dragging.current=null}}
     onPointerDown={e=>{if(e.pointerType!=="mouse"&&!busy&&!editing)e.currentTarget.setPointerCapture(e.pointerId)}}
     onPointerUp={e=>{if(e.pointerType==="mouse"||busy||editing)return;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest("[data-hr-setting-id]");if(target)void move(row.id,Number(target.getAttribute("data-hr-setting-id")))}}
     onKeyDown={e=>{if(e.key!=="ArrowUp"&&e.key!=="ArrowDown")return;e.preventDefault();const target=rows[i+(e.key==="ArrowUp"?-1:1)];if(target)void move(row.id,target.id)}}/></td><td className="cy-hrs-seq">{i+1}</td>{cells(row)}<td className="cy-hrs-actions"><button key="edit" type="button" className="cy-op-button compact" disabled={busy} onClick={()=>edit(row)}>修改</button></td></tr>)}
  </SettingsTable>
  {editing?<SettingsEditor title={(editing.id?"修改":"新增")+label} size={kind==="job-titles"?"small":"medium"} note={kind==="shift-types"?<p className="cy-hrs-form-note">正常工時：{elapsed} 分鐘</p>:undefined} busy={busy} error={editorError} onClose={close} onSubmit={e=>void save(e)}>
   <>
    <Field label="名稱" required size="m"><input className="cy-op-input" disabled={busy} value={value.name??""} onChange={e=>change("name",e.target.value)}/></Field>
    {kind==="shift-types"?<Field label="代號" required size="s"><input className="cy-op-input" disabled={busy} value={value.code??""} onChange={e=>change("code",e.target.value)}/></Field>:null}
    <Field label="狀態" size="s"><select className="cy-op-input" disabled={busy} value={value.isActive??"true"} onChange={e=>change("isActive",e.target.value)}><option value="true">啟用</option><option value="false">停用</option></select></Field>
    {kind==="stores"?<>
     <Field label="雙週起算週一" required size="s"><DateInput disabled={busy} className="cy-op-input" max="9999-12-31" value={value.cycleAnchorDate??""} onChange={v=>change("cycleAnchorDate",v)}/></Field>
    </>:null}
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
export function HrHolidaySettings({initialYear}:{initialYear?:number}={}){
 const [updateStates,setUpdateStates]=useState<OfficialUpdateState[]>([]),[updateNotice,setUpdateNotice]=useState("");
 const [year,setYear]=useState(initialYear??Number(taipeiToday().slice(0,4))),[holidays,setHolidays]=useState<Holiday[]>([]),[loaded,setLoaded]=useState(false);
 const [adding,setAdding]=useState(false),[holidayDate,setHolidayDate]=useState(""),[holidayName,setHolidayName]=useState(""),[holidayNote,setHolidayNote]=useState(""),[editingDate,setEditingDate]=useState<string|null>(null);
 const {confirm,confirmationDialog}=useConfirmation();
 const writing=useRef(false);
 const [error,setError]=useState(""),[editorError,setEditorError]=useState(""),[busy,setBusy]=useState(false);
 useUnsavedChangesGuard({active:adding,blocked:busy});
 const request=useLatestRequest("holidays|"+year);
 const refresh=useCallback(async()=>{
  const ticket=request.begin();setLoaded(false);
  try{const [data,states]=await Promise.all([apiRequest<Holiday[]>(ROOT+"/holidays?year="+year),apiRequest<OfficialUpdateState[]>(ROOT+"/holiday-updates")]);if(ticket.current()){setUpdateStates(states);setHolidays([...data].sort((a,b)=>a.date.localeCompare(b.date)));setLoaded(true)}}
  catch(e){if(ticket.current())setError(message(e,"設定讀取失敗"))}
 },[year,request]);
 useEffect(()=>{setError("");void refresh()},[refresh]);
 function open(row?:Holiday){setEditingDate(row?.date??null);setHolidayDate(row?.date??"");setHolidayName(row?.name??"");setHolidayNote(row?.note??"");setEditorError("");setAdding(true)}
 async function save(e:FormEvent){e.preventDefault();if(writing.current)return;writing.current=true;setBusy(true);setEditorError("");
  try{await apiRequest(ROOT+"/holidays",{method:"POST",json:{date:holidayDate,name:holidayName,note:holidayNote}});setAdding(false);if(Number(holidayDate.slice(0,4))!==year)setYear(Number(holidayDate.slice(0,4)));else await refresh();window.dispatchEvent(new Event(SETTINGS_SAVED_EVENT))}
  catch(e){setEditorError(message(e,"儲存失敗"))}finally{writing.current=false;setBusy(false)}
 }
 async function remove(date:string){if(writing.current)return;if(!(await confirm({title:"刪除國定假日",description:"確定刪除 "+date+" 國定假日？",confirmLabel:"刪除",confirmTone:"danger"})))return;writing.current=true;setBusy(true);
  try{await apiRequest(ROOT+"/holidays?date="+date,{method:"DELETE"});await refresh();window.dispatchEvent(new Event(SETTINGS_SAVED_EVENT))}catch(e){setError(message(e,"刪除失敗"))}finally{writing.current=false;setBusy(false)}
 }
 async function update(){if(writing.current||adding)return;writing.current=true;setBusy(true);setError("");setUpdateNotice("");
  try{const result=await apiRequest<{year:number;ok:boolean;message:string}[]>(ROOT+"/holiday-updates",{method:"POST"});setUpdateNotice(result.map(r=>r.year+"："+r.message).join("；"));await refresh();window.dispatchEvent(new Event(SETTINGS_SAVED_EVENT))}
  catch(e){setError(message(e,"官方資料更新失敗"))}finally{writing.current=false;setBusy(false)}
 }
 const thisYear=Number(taipeiToday().slice(0,4));
 return <SettingsPane title="國定假日" hint={HR_OFFICIAL_UPDATE_SCHEDULE+"（臺灣時間）；保留人工設定。"} actionLabel="立即更新" onAction={()=>void update()} actionDisabled={busy||!loaded||adding} error={error} notice={updateNotice}>
  {confirmationDialog}
  <SettingsTable label="國定假日更新狀態" head={<><th>年度</th><th>最近檢查</th><th>最近成功</th><th>狀態</th></>}>
   {[thisYear,thisYear+1].map(y=>{const s=updateStates.find(x=>x.key==="holiday:"+y);return <tr key={y}><td>{y}</td><td>{s?.checked_at?formatDateTime(s.checked_at):"尚未檢查"}</td><td>{s?.success_at?formatDateTime(s.success_at):"尚未成功"}</td><td>{s?.error|| (s?.success_at?"正常":"尚未更新")}</td></tr>})}
  </SettingsTable>
  <div className="cy-hrs-pane-head"><a href={HOLIDAY_DATASET} target="_blank" rel="noreferrer">行政院人事行政總處官方資料</a><button type="button" className="cy-op-button" disabled={busy||!loaded||adding} onClick={()=>open()}>＋ 新增國定假日</button></div>
  <MonthPicker precision="year" label="年份" value={String(year)} min={String(Math.min(thisYear-1,year))} max={String(Math.max(thisYear+1,year))} disabled={busy} onChange={v=>setYear(Number(v))}/>
  <SettingsTable label="國定假日設定" columns={<><col className="cy-hrs-seq"/><col/><col className="cy-hrs-anchor-col"/><col/><col className="cy-hrs-holiday-operation-col"/></>} head={<><th className="cy-hrs-seq">項次</th><th>名稱</th><th className="cy-hrs-date">日期</th><th>備註</th><th className="cy-hrs-actions">操作</th></>} empty={loaded&&!holidays.length?year+" 年尚無國定假日。":undefined}>
   {holidays.map((h,i)=><tr key={h.date}><td className="cy-hrs-seq">{i+1}</td><td>{h.name}</td><td className="cy-hrs-date">{formatDate(h.date)}</td><td>{h.note}</td><td className="cy-hrs-actions"><button key="edit" type="button" className="cy-op-button compact" disabled={busy||adding} onClick={()=>open(h)}>修改</button>{" "}<button key="del" type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void remove(h.date)}>刪除</button></td></tr>)}
  </SettingsTable>
  {adding?<SettingsEditor title={editingDate?"修改國定假日":"新增國定假日"} size="small" busy={busy} error={editorError} onClose={()=>setAdding(false)} onSubmit={e=>void save(e)}>
   <>
    <Field label="名稱" required size="m"><input disabled={busy} className="cy-op-input" value={holidayName} onChange={e=>setHolidayName(e.target.value)}/></Field>
    <Field label="日期" required size="s"><DateInput disabled={busy||!!editingDate} density="regular" max="9999-12-31" className="cy-op-input" value={holidayDate} onChange={setHolidayDate}/></Field>
    <Field label="備註" size="l"><input disabled={busy} className="cy-op-input" maxLength={500} value={holidayNote} onChange={e=>setHolidayNote(e.target.value)}/></Field>
   </>
  </SettingsEditor>:null}
 </SettingsPane>;
}
