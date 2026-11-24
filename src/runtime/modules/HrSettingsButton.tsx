import {useNavigationGuard,useUnsavedChangesGuard} from '../../ui/foundation/useUnsavedChangesGuard';
import {DateInput} from "../../ui/forms/DateInput";
import {Field} from "../../ui/forms/Field";
import {useEffect,useRef,useState,type FormEvent,type ReactNode} from "react";
import {Dialog} from "../../ui/overlays/Dialog";
import {ModuleSettingsGear} from "../../ui/shell/ModuleSettingsGear";
import {apiRequest} from "../../api/client";
import {formatDate} from "../../ui/foundation/format";
import {useCompactLayout} from "../../ui/foundation/useCompactLayout";
import {HrHolidaySettings,HrLookupSettings} from "./HrPhase2aSettings";
import {HrLeaveTypeSettings} from "./HrLeaveTypeSettings";
import {HrCorrectionGrantSettings,HrLegalBracketSettings} from './HrPayrollSettings';
import {ActiveChip,SettingsEditor,SettingsPane,SettingsTable} from "./HrSettingsPane";
type Item={id:number;name:string;is_active:number};
type Wage={id:number;effective_date:string;monthly_amount:number;hourly_amount:number};
const ROOT="/api/business/hr/settings";
const message=(e:unknown,fallback:string)=>e instanceof Error?e.message:fallback;

/** 津貼項目: names only; 新增 opens a dialog, 停用／啟用 is one click. */
function SalaryItemSettings(){
 const [items,setItems]=useState<Item[]>([]),[loaded,setLoaded]=useState(false),[adding,setAdding]=useState(false),[name,setName]=useState("");
 const [error,setError]=useState(""),[editorError,setEditorError]=useState(""),[busy,setBusy]=useState(false);const writing=useRef(false);
 useUnsavedChangesGuard({active:adding,blocked:busy});
 async function refresh(){setItems(await apiRequest<Item[]>(ROOT+"/salary-item-types"));setLoaded(true)}
 useEffect(()=>{void refresh().catch(e=>setError(message(e,"讀取失敗")))},[]);
 async function toggle(x:Item){if(writing.current)return;writing.current=true;setBusy(true);setError("");try{await apiRequest(ROOT+'/salary-item-types',{method:'PATCH',json:{id:x.id,name:x.name,isActive:x.is_active!==1}});await refresh()}catch(e){setError(message(e,"儲存失敗"))}finally{writing.current=false;setBusy(false)}}
 async function add(e:FormEvent){e.preventDefault();if(writing.current)return;writing.current=true;setBusy(true);setEditorError("");try{await apiRequest(ROOT+"/salary-item-types",{method:"POST",json:{name}});setAdding(false);await refresh()}catch(err){setEditorError(message(err,"儲存失敗"))}finally{writing.current=false;setBusy(false)}}
 return <SettingsPane title="津貼項目" actionLabel="＋ 新增項目" onAction={()=>{setName("");setEditorError("");setAdding(true)}} actionDisabled={busy||!loaded} error={error}>
  <SettingsTable label="津貼項目" head={<><th>名稱</th><th>狀態</th><th/></>} empty={loaded&&!items.length?"尚無津貼項目。":undefined}>
   {items.map(x=><tr key={x.id}><td>{x.name}</td><td><ActiveChip active={x.is_active===1}/></td><td className="cy-hrs-actions"><button key="toggle" type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void toggle(x)}>{x.is_active===1?'停用':'啟用'}</button></td></tr>)}
  </SettingsTable>
  {adding?<SettingsEditor title="新增津貼項目" size="small" busy={busy} error={editorError} onClose={()=>setAdding(false)} onSubmit={e=>void add(e)} submitLabel="新增項目">
   <><Field label="津貼項目名稱" required size="l"><input disabled={busy} className="cy-op-input" value={name} onChange={e=>setName(e.target.value)}/></Field></>
  </SettingsEditor>:null}
 </SettingsPane>;
}

/** 最低工資: history is append-only; 新增 opens a dialog. */
function MinimumWageSettings(){
 const [wages,setWages]=useState<Wage[]>([]),[loaded,setLoaded]=useState(false),[adding,setAdding]=useState(false);
 const [date,setDate]=useState(""),[monthly,setMonthly]=useState(""),[hourly,setHourly]=useState("");
 const [error,setError]=useState(""),[editorError,setEditorError]=useState(""),[busy,setBusy]=useState(false);const writing=useRef(false);
 useUnsavedChangesGuard({active:adding,blocked:busy});
 async function refresh(){setWages(await apiRequest<Wage[]>(ROOT+"/minimum-wages"));setLoaded(true)}
 useEffect(()=>{void refresh().catch(e=>setError(message(e,"讀取失敗")))},[]);
 async function add(e:FormEvent){e.preventDefault();if(writing.current)return;writing.current=true;setBusy(true);setEditorError("");
  try{await apiRequest(ROOT+"/minimum-wages",{method:"POST",json:{effectiveDate:date,monthlyAmount:Number(monthly),hourlyAmount:Number(hourly)}});setAdding(false);await refresh()}
  catch(err){setEditorError(message(err,"儲存失敗"))}finally{writing.current=false;setBusy(false)}}
 return <SettingsPane title="最低工資" hint="歷史設定不可修改；新增一筆新的生效日即可。" actionLabel="＋ 新增最低工資" onAction={()=>{setDate("");setMonthly("");setHourly("");setEditorError("");setAdding(true)}} actionDisabled={busy||!loaded} error={error}>
  <SettingsTable label="最低工資" head={<><th>生效日</th><th className="cy-hrs-num">每月（元）</th><th className="cy-hrs-num">每小時（元）</th></>} empty={loaded&&!wages.length?"尚未設定最低工資。":undefined}>
   {wages.map(x=><tr key={x.id}><td>{formatDate(x.effective_date)}</td><td className="cy-hrs-num">{x.monthly_amount.toLocaleString('zh-TW')}</td><td className="cy-hrs-num">{x.hourly_amount.toLocaleString('zh-TW')}</td></tr>)}
  </SettingsTable>
  {adding?<SettingsEditor title="新增最低工資" size="small" busy={busy} error={editorError} onClose={()=>setAdding(false)} onSubmit={e=>void add(e)} submitLabel="新增最低工資">
   <>
    <Field label="生效日" required size="s"><DateInput disabled={busy} density="regular" className="cy-op-input" max="9999-12-31" value={date} onChange={setDate}/></Field>
    <Field label="每月（整數元）" required size="s"><input disabled={busy} className="cy-op-input" type="number" min="0" step="1" value={monthly} onChange={e=>setMonthly(e.target.value)}/></Field>
    <Field label="每小時（整數元）" required size="s"><input disabled={busy} className="cy-op-input" type="number" min="0" step="1" value={hourly} onChange={e=>setHourly(e.target.value)}/></Field>
   </>
  </SettingsEditor>:null}
 </SettingsPane>;
}

const GROUPS:{label:string;items:{key:string;label:string;pane:()=>ReactNode}[]}[]=[
 {label:"組織",items:[{key:"stores",label:"門市",pane:()=><HrLookupSettings kind="stores"/>},{key:"job-titles",label:"職稱",pane:()=><HrLookupSettings kind="job-titles"/>}]},
 {label:"排班",items:[{key:"shift-types",label:"班別",pane:()=><HrLookupSettings kind="shift-types"/>},{key:"holidays",label:"國定假日",pane:()=><HrHolidaySettings/>}]},
 {label:"請假",items:[{key:"leave-types",label:"假別",pane:()=><HrLeaveTypeSettings/>}]},
 {label:"薪資",items:[{key:"salary-items",label:"津貼項目",pane:()=><SalaryItemSettings/>},{key:"minimum-wages",label:"最低工資",pane:()=><MinimumWageSettings/>},{key:"legal-brackets",label:"法定級距",pane:()=><HrLegalBracketSettings/>}]},
 {label:"權限",items:[{key:"correction-grants",label:"出勤更正授權",pane:()=><HrCorrectionGrantSettings/>}]},
];
const ALL=GROUPS.flatMap(g=>g.items);

/** Gear next to the page title; the dialog lists categories on the left and shows one table at a time. */
export function HrSettingsButton(){
 const [open,setOpen]=useState(false),[category,setCategory]=useState(ALL[0].key),[drilled,setDrilled]=useState(false);
 const compact=useCompactLayout();
 const navigation=useNavigationGuard();
 const active=ALL.find(x=>x.key===category)??ALL[0];
 function close(){setOpen(false);setDrilled(false)}
 return <>
  <ModuleSettingsGear moduleLabel="人事" expanded={open} onClick={()=>setOpen(true)}/>
  {open?<Dialog open title="人事設定" size="large" onClose={()=>void navigation.canLeave({title:"關閉人事設定？",description:"尚未儲存的設定將被放棄，確定關閉？"}).then(ok=>{if(ok)close()})}>
   <div className="cy-hrs" data-pane={compact?(drilled?"detail":"list"):undefined}>
    <nav className="cy-hrs-nav" aria-label="人事設定分類">
     {GROUPS.map(group=><div key={group.label}><div className="cy-hrs-nav-label">{group.label}</div>
      {group.items.map(item=><button key={item.key} type="button" aria-current={item.key===active.key?"page":undefined} onClick={()=>{setCategory(item.key);setDrilled(true)}}>{item.label}</button>)}</div>)}
    </nav>
    <div className="cy-hrs-body">
     {compact?<button type="button" className="cy-hrs-back" onClick={()=>setDrilled(false)}>‹ 設定分類</button>:null}
     <div key={active.key}>{active.pane()}</div>
    </div>
   </div>
  </Dialog>:null}
 </>;
}
