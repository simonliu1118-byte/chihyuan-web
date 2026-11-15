import {useNavigationGuard,useUnsavedChangesGuard} from '../../ui/foundation/useUnsavedChangesGuard';
import {EntryTable,EntryHeading} from '../../ui/forms/EntryTable';
import {Icons} from "../../ui/actions/icons";
import { DateInput } from "../../ui/forms/DateInput";
import {Field} from "../../ui/forms/Field";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {Dialog} from "../../ui/overlays/Dialog";
import {apiRequest} from "../../api/client";
import {enterAdvancesThenSubmits} from "../../ui/foundation/enter-advance";
import {FeedbackBanner} from "../../ui/feedback/FeedbackProvider";
import {formatDate} from "../../ui/foundation/format";
import {HrPhase2aSettings} from "./HrPhase2aSettings";
type Item={id:number;name:string;is_active:number};
type Wage={id:number;effective_date:string;monthly_amount:number;hourly_amount:number};
const ROOT="/api/business/hr/settings";
export function HrSettingsButton(){
 const [open,setOpen]=useState(false),[items,setItems]=useState<Item[]>([]),[wages,setWages]=useState<Wage[]>([]);
 const [name,setName]=useState(""),[date,setDate]=useState(""),[monthly,setMonthly]=useState(""),[hourly,setHourly]=useState("");
 const writing=useRef(false);
 const [error,setError]=useState(""),[busy,setBusy]=useState(false);
 const navigation=useNavigationGuard();
 useUnsavedChangesGuard({active:open&&!!(name||date||monthly||hourly),blocked:busy});
 async function close(){if(await navigation.canLeave({title:"關閉人事設定？",description:"尚未儲存的設定將被放棄，確定關閉？"})){setName("");setDate("");setMonthly("");setHourly("");setOpen(false)}}
 async function refresh(){const [a,b]=await Promise.all([apiRequest<Item[]>(ROOT+"/salary-item-types"),apiRequest<Wage[]>(ROOT+"/minimum-wages")]);setItems(a);setWages(b);}
 useEffect(()=>{if(open)void refresh().catch(e=>setError(e instanceof Error?e.message:"讀取失敗"));},[open]);
 async function run(fn:()=>Promise<unknown>,reset:"item"|"wage"|"none"="none"){if(writing.current)return;writing.current=true;setBusy(true);setError("");try{await fn();await refresh();if(reset==="item")setName("");if(reset==="wage"){setDate("");setMonthly("");setHourly("");}}catch(e){setError(e instanceof Error?e.message:"儲存失敗");}finally{writing.current=false;setBusy(false);}}
 function addItem(e:FormEvent){e.preventDefault();void run(()=>apiRequest(ROOT+"/salary-item-types",{method:"POST",json:{name}}),"item");}
 function addWage(e:FormEvent){e.preventDefault();void run(()=>apiRequest(ROOT+"/minimum-wages",{method:"POST",json:{effectiveDate:date,monthlyAmount:Number(monthly),hourlyAmount:Number(hourly)}}),"wage");}
 return <>
  <button className="cy-op-button" type="button" onClick={()=>setOpen(true)}><span aria-hidden="true">{Icons.settings}</span> 設定</button>
  <Dialog open={open} title="人事設定" size="large" dismissible={!busy} onClose={()=>void close()}>
   <FeedbackBanner message={error||null} tone="danger" />
   <HrPhase2aSettings />
   <section className="cy-op-panel"><h3>津貼項目</h3>
    <form onKeyDown={enterAdvancesThenSubmits} className="cy-op-form" onSubmit={addItem}>
    <EntryTable label="津貼項目"><thead><tr><th>名稱</th><th>狀態</th><th>操作</th></tr></thead><tbody>
     {items.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.is_active===1?'啟用':'停用'}</td><td><button type="button" className="cy-op-button" disabled={busy} onClick={()=>void run(()=>apiRequest(ROOT+'/salary-item-types',{method:'PATCH',json:{id:x.id,name:x.name,isActive:x.is_active!==1}}))}>{x.is_active===1?'停用':'啟用'}</button></td></tr>)}
     <tr><td><Field label="津貼項目名稱" presentation="cell" required><input disabled={busy} className="cy-sheet-input" value={name} onChange={e=>setName(e.target.value)}/></Field></td><td>新增</td><td><button className="cy-op-button primary" disabled={busy}>＋ 新增項目</button></td></tr>
    </tbody></EntryTable></form>
   </section>
   <section className="cy-op-panel"><h3>最低工資</h3>
    <form onKeyDown={enterAdvancesThenSubmits} className="cy-op-form" onSubmit={addWage}>
    <EntryTable label="最低工資"><thead><tr><th><EntryHeading required>生效日</EntryHeading></th><th><EntryHeading required>每月（整數元）</EntryHeading></th><th><EntryHeading required>每小時（整數元）</EntryHeading></th><th>操作</th></tr></thead><tbody>
     {wages.map(x=><tr key={x.id}><td>{formatDate(x.effective_date)}</td><td>{x.monthly_amount.toLocaleString('zh-TW')}</td><td>{x.hourly_amount.toLocaleString('zh-TW')}</td><td>歷史設定</td></tr>)}
     <tr><td><Field label="生效日" presentation="cell" required><DateInput disabled={busy} density="regular" className="cy-sheet-input" max="9999-12-31" value={date} onChange={setDate}/></Field></td>
      <td><Field label="每月最低工資" presentation="cell" required><input disabled={busy} className="cy-sheet-input" type="number" min="0" step="1" value={monthly} onChange={e=>setMonthly(e.target.value)}/></Field></td>
      <td><Field label="每小時最低工資" presentation="cell" required><input disabled={busy} className="cy-sheet-input" type="number" min="0" step="1" value={hourly} onChange={e=>setHourly(e.target.value)}/></Field></td><td><button className="cy-op-button primary" disabled={busy}>＋ 新增最低工資</button></td></tr>
    </tbody></EntryTable></form>
   </section>
  </Dialog>
 </>;
}
