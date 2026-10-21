import {Field,CheckField,FormSection} from "../../ui/forms/Field";
import {useEffect,useState,type FormEvent} from "react";
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
 const [error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function refresh(){const [a,b]=await Promise.all([apiRequest<Item[]>(ROOT+"/salary-item-types"),apiRequest<Wage[]>(ROOT+"/minimum-wages")]);setItems(a);setWages(b);}
 useEffect(()=>{if(open)void refresh().catch(e=>setError(e instanceof Error?e.message:"讀取失敗"));},[open]);
 async function run(fn:()=>Promise<unknown>){setBusy(true);setError("");try{await fn();await refresh();setName("");setDate("");setMonthly("");setHourly("");}catch(e){setError(e instanceof Error?e.message:"儲存失敗");}finally{setBusy(false);}}
 function addItem(e:FormEvent){e.preventDefault();void run(()=>apiRequest(ROOT+"/salary-item-types",{method:"POST",json:{name}}));}
 function addWage(e:FormEvent){e.preventDefault();void run(()=>apiRequest(ROOT+"/minimum-wages",{method:"POST",json:{effectiveDate:date,monthlyAmount:Number(monthly),hourlyAmount:Number(hourly)}}));}
 return <>
  <button className="cy-op-button" type="button" onClick={()=>setOpen(true)}><span aria-hidden="true">⚙️</span> 設定</button>
  <Dialog open={open} title="人事設定" size="large" onClose={()=>setOpen(false)}>
   <FeedbackBanner message={error||null} tone="danger" />
   <HrPhase2aSettings />
   <section className="cy-op-panel"><h3>津貼項目</h3>
    {items.map(x=><div key={x.id} className="cy-hr-setting-row"><span>{x.name}{x.is_active===1?"":"（已停用）"}</span>
      <button className="cy-op-button" disabled={busy} onClick={()=>void run(()=>apiRequest(ROOT+"/salary-item-types",{method:"PATCH",json:{id:x.id,name:x.name,isActive:x.is_active!==1}}))}>{x.is_active===1?"停用":"啟用"}</button>
    </div>)}
    <form onKeyDown={enterAdvancesThenSubmits} className="cy-op-form" onSubmit={addItem}>
    <FormSection><Field  label="津貼項目名稱" size="m" required><input className="cy-op-input" value={name} onChange={e=>setName(e.target.value)}/></Field><div className="cy-op-form-footer"><button className="cy-op-button primary" disabled={busy}>＋ 新增項目</button></div>
    </FormSection>
  </form>
   </section>
   <section className="cy-op-panel"><h3>最低工資</h3>
    {wages.map(x=><p key={x.id} className="cy-hr-setting-row">{formatDate(x.effective_date)}　月薪 {x.monthly_amount.toLocaleString("zh-TW")} 元　時薪 {x.hourly_amount.toLocaleString("zh-TW")} 元</p>)}
    <form onKeyDown={enterAdvancesThenSubmits} className="cy-op-form" onSubmit={addWage}>
    <FormSection>
      <Field  label="生效日" size="m" required><input className="cy-op-input" type="date" max="9999-12-31" value={date} onChange={e=>setDate(e.target.value)}/></Field>
      <Field  label="每月最低工資（整數元）" size="m" required><input className="cy-op-input" type="number" min="0" step="1" value={monthly} onChange={e=>setMonthly(e.target.value)}/></Field>
      <Field  label="每小時最低工資（整數元）" size="m" required><input className="cy-op-input" type="number" min="0" step="1" value={hourly} onChange={e=>setHourly(e.target.value)}/></Field>
      <div className="cy-op-form-footer"><button className="cy-op-button primary" disabled={busy}>＋ 新增最低工資</button></div>
    
    </FormSection>
  </form>
   </section>
  </Dialog>
 </>;
}
