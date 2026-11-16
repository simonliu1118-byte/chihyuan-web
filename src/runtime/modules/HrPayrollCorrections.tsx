import {useEffect,useRef,useState,type FormEvent} from 'react';
import {apiRequest} from '../../api/client';
import {EntryFields} from '../../ui/forms/EntryFields';
import {Dialog} from '../../ui/overlays/Dialog';
import {enterAdvancesFields} from '../../ui/foundation/enter-advance';
import {useLatestRequest} from '../../ui/foundation/useLatestRequest';
import {useUnsavedChangesGuard,useNavigationGuard} from '../../ui/foundation/useUnsavedChangesGuard';
interface Entry {id:number;source_run_id:number;source_month:string;kind:string;amount:number;reference:string;consent_reference:string;reason:string;revision:number;is_active:number;claimed:number}
interface Data {entries:Entry[];paidRuns:{id:number;month:string;payDate:string;net:number}[]}
const labels:Record<string,string>={salary_topup:'補發工資',salary_recovery:'追回溢領工資',insurance_charge:'補扣個人保費',insurance_refund:'退還個人保費',tax_charge:'補扣扣繳稅款',tax_refund:'退還扣繳稅款'};
export function HrPayrollCorrections({employeeId,month,refreshToken=0}:{employeeId:number;month:string;refreshToken?:number}){
 const [data,setData]=useState<Data>({entries:[],paidRuns:[]}),[ready,setReady]=useState(false),[open,setOpen]=useState(false),[cancel,setCancel]=useState<Entry|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [source,setSource]=useState(''),[kind,setKind]=useState('salary_topup'),[amount,setAmount]=useState(''),[reference,setReference]=useState(''),[consent,setConsent]=useState(''),[reason,setReason]=useState('');
 const request=useLatestRequest(employeeId+'|'+month),key=useRef(''),writing=useRef(false),navigation=useNavigationGuard();useUnsavedChangesGuard({active:open,blocked:busy});const url='/api/business/hr/payroll/corrections/'+employeeId+'?month='+month;
 async function load(){const t=request.begin();setReady(false);try{const r=await apiRequest<Data>(url);if(t.current()){setData(r);setReady(true);setError('');}}catch(e){if(t.current())setError(e instanceof Error?e.message:'更正紀錄讀取失敗');}}
 useEffect(()=>{void load();},[employeeId,month,refreshToken]);
 async function save(e:FormEvent){e.preventDefault();if(writing.current||!ready)return;writing.current=true;setBusy(true);setError('');try{const result=await apiRequest<Data>(url,{method:cancel?'PATCH':'POST',json:cancel?{id:cancel.id,revision:cancel.revision,reason}:{sourceRunId:Number(source),kind,amount:Number(amount),reference,consentReference:consent,reason,requestKey:key.current}});setData(result);setOpen(false);}catch(e){setError(e instanceof Error?e.message:'更正儲存失敗');}finally{writing.current=false;setBusy(false);}}
 return <section className="cy-op-panel"><h3>前期已發薪更正</h3>
  {!open&&error?<p role="alert" className="cy-op-notice danger">{error}</p>:null}<button type="button" className="cy-op-button" disabled={busy||!ready||!data.paidRuns.length} onClick={()=>{key.current=crypto.randomUUID();setSource('');setKind('salary_topup');setAmount('');setReference('');setConsent('');setReason('');setCancel(null);setError('');setOpen(true);}}>新增前期差額</button>{!ready?<button type="button" className="cy-op-button" onClick={()=>void load()}>重新讀取更正</button>:null}
  <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>原快照</th><th>更正種類</th><th>金額</th><th>核對依據</th><th>原因</th><th>狀態</th><th>操作</th></tr></thead><tbody>{data.entries.map(c=><tr key={c.id}><td data-label="原快照">{c.source_month} #{c.source_run_id}</td><td data-label="更正種類">{labels[c.kind]}</td><td data-label="金額">{c.amount.toLocaleString('zh-TW')}</td><td data-label="核對依據">{c.reference}{c.consent_reference?<small>員工同意：{c.consent_reference}</small>:null}</td><td data-label="原因">{c.reason}</td><td data-label="狀態">{!c.is_active?'已撤銷':c.claimed?'已套用／保留':'待套用'}</td><td data-label="操作"><button type="button" className="cy-op-button" disabled={busy||!c.is_active||!!c.claimed} onClick={()=>{setCancel(c);setReason('');setError('');setOpen(true);}}>撤銷</button></td></tr>)}</tbody></table></div>
  <Dialog open={open} title={cancel?'撤銷尚未套用更正':'新增前期薪資差額'} size="large" dismissible={!busy} onClose={()=>void navigation.canLeave().then(ok=>{if(ok)setOpen(false);})}>
   {error?<p role="alert" className="cy-op-notice danger">{error}</p>:null}<form className="cy-op-form" onKeyDown={enterAdvancesFields} onSubmit={e=>void save(e)}><EntryFields label="前期薪資更正資料" columns={3} rows={[
    ...(!cancel?[
     {label:'原已發薪快照',required:true,content:<select disabled={busy} className="cy-sheet-input" value={source} onChange={e=>setSource(e.target.value)}><option value="">請選擇</option>{data.paidRuns.map(r=><option key={r.id} value={r.id}>{r.month} #{r.id}／實領{r.net}</option>)}</select>},
     {label:'更正種類',required:true,content:<select disabled={busy} className="cy-sheet-input" value={kind} onChange={e=>setKind(e.target.value)}>{Object.entries(labels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>},
     {label:'實際核對差額',required:true,content:<input disabled={busy} className="cy-sheet-input" type="number" min="1" step="1" value={amount} onChange={e=>setAmount(e.target.value)}/>},
     {label:'核定／更正依據',required:true,content:<input disabled={busy} className="cy-sheet-input" value={reference} onChange={e=>setReference(e.target.value)}/>},
     ...(kind==='salary_recovery'?[{label:'員工明確同意依據',required:true,content:<input disabled={busy} className="cy-sheet-input" value={consent} onChange={e=>setConsent(e.target.value)}/>}]:[]),
    ]:[]),
    {label:cancel?'撤銷原因':'本次更正原因',required:true,content:<input disabled={busy} className="cy-sheet-input" value={reason} onChange={e=>setReason(e.target.value)}/>},
   ]}/><button className="cy-op-button primary" disabled={busy||!ready}>{cancel?'確認撤銷':'保存差額紀錄'}</button></form>
  </Dialog>
 </section>;
}
