import {useEffect,useRef,useState,type FormEvent,type ReactElement} from 'react';
import {apiRequest} from '../../api/client';
import {EntryFields,type EntryFieldRow} from '../../ui/forms/EntryFields';
import {DateInput} from '../../ui/forms/DateInput';
import {CheckField} from '../../ui/forms/Field';
import {Dialog} from '../../ui/overlays/Dialog';
import {useLatestRequest} from '../../ui/foundation/useLatestRequest';
import {useNavigationGuard,useUnsavedChangesGuard} from '../../ui/foundation/useUnsavedChangesGuard';
import {enterAdvancesFields} from '../../ui/foundation/enter-advance';
import type {PayrollProfile} from '../../../shared/hr-payroll';
const ROOT='/api/business/hr';
interface Profile {id:number;effective_date:string;settings_json:string;reason:string}
const flags=new Set(['attendanceEnabled','laborEnabled','employmentInsurance','healthEnabled','healthAtMonthEnd','pensionEnabled']);
const numeric=new Set(['attendanceAmount','laborBasis','healthBasis','dependents','pensionBasis','pensionEmployerRate','pensionSelfRate','occupationalBasis','occupationalRate','taxDependents','bonusOpeningYear','bonusOpeningAmount','weeklyHours','hourlyAllowanceHours']);
const fields:[keyof PayrollProfile,string,'flag'|'date'|'number'|'choice'|'text'][]=[
 ['attendanceEnabled','適用全勤','flag'],['attendanceAmount','每月全勤金額','number'],
 ['weeklyHours','半職月薪：每週約定正常時數','number'],['hourlyAllowanceHours','時薪津貼：每月約定正常時數','number'],
 ['laborEnabled','本單位投保勞保','flag'],['employmentInsurance','適用就保','flag'],['laborBasis','已申報勞保投保金額','number'],
 ['insuredFrom','勞保／職災起日','date'],['insuredTo','勞保／職災迄日（可空白）','date'],
 ['healthEnabled','本單位投保健保','flag'],['healthAtMonthEnd','月底由本單位計收健保','flag'],['healthBasis','已申報健保投保金額','number'],['dependents','健保計費眷口','number'],
 ['healthFrom','健保轉入日','date'],['healthTo','健保轉出日（可空白）','date'],
 ['pensionEnabled','適用勞退新制','flag'],['pensionBasis','已申報勞退提繳金額','number'],['pensionEmployerRate','雇主提繳率（%）','number'],['pensionSelfRate','個人自提率（%）','number'],
 ['pensionFrom','勞退提繳起日','date'],['pensionTo','勞退提繳迄日（可空白）','date'],
 ['occupationalBasis','職災投保金額','number'],['occupationalRate','本單位職災費率（%）','number'],
 ['nhiUnitKey','本公司投保單位代碼','text'],['taxSalaryKind','薪資所得性質','choice'],['nhiSupplementCategory','補充保費身分','choice'],['nhiExemptionReference','補充保費免扣證明','text'],
 ['bonusOpeningYear','獎金期初核對年度','number'],['bonusOpeningThrough','期初獎金截止日','date'],['bonusOpeningAmount','該年度系統外已發獎金','number'],['bonusOpeningReference','期初獎金核對來源','text'],
 ['taxResidence','稅務居住身分','choice'],['taxDependents','已申報配偶及扶養人數','number'],
];
export function ProfileEditor({employeeId,month,onClose,onSaved}:{employeeId:number;month:string;onClose:()=>void;onSaved:()=>void}){
 const [history,setHistory]=useState<Profile[]>([]),[draft,setDraft]=useState<Record<string,string>>({}),[at,setAt]=useState(month+'-01'),[reason,setReason]=useState('');
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false);const writing=useRef(false);
 const [ready,setReady]=useState(false),[readVersion,setReadVersion]=useState(0);
 useUnsavedChangesGuard({active:dirty,blocked:busy||loading});
 const request=useLatestRequest(employeeId);
 const navigation=useNavigationGuard();
 useEffect(()=>{const ticket=request.begin();setLoading(true);setReady(false);void apiRequest<Profile[]>(ROOT+'/payroll/profiles/'+employeeId).then(rows=>{if(!ticket.current())return;setHistory(rows);const active=rows.find(r=>r.effective_date<=new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).toISOString().slice(0,10));const p=active?JSON.parse(active.settings_json) as Record<string,string|number|boolean|null>:{};
  setDraft(Object.fromEntries(fields.map(([key,,kind])=>[key,p[key]==null?(kind==='number'?'0':''):String(p[key])])));
  setReady(true);setError('');
 }).catch(e=>{if(ticket.current())setError(e instanceof Error?e.message:'讀取設定失敗');}).finally(()=>{if(ticket.current())setLoading(false);});},[employeeId,month,readVersion]);
 async function submit(e:FormEvent){e.preventDefault();if(writing.current||loading||!ready)return;writing.current=true;setBusy(true);setError('');try{
  const settings=Object.fromEntries(fields.map(([key])=>[key,flags.has(key)?(key==='attendanceEnabled'?draft[key]==='true':draft[key]===''?undefined:draft[key]==='true'):numeric.has(key)?Number(draft[key]):draft[key]||null]));
  await apiRequest(ROOT+'/payroll/profiles/'+employeeId,{method:'POST',json:{settings,effectiveDate:at,reason,expectedId:Math.max(0,...history.map(r=>r.id))}});setDirty(false);onSaved();onClose();
 }catch(e){setError(e instanceof Error?e.message:'設定儲存失敗');}finally{writing.current=false;setBusy(false);}}
 const controls:EntryFieldRow[]=fields.map(([key,label,kind])=>{
  const change=(value:string)=>{setDraft(p=>({...p,[key]:value}));setDirty(true);};let content:ReactElement;
  if(key==='attendanceEnabled')content=<CheckField label="此員工適用全勤" disabled={busy||loading} checked={draft[key]==='true'} onChange={e=>change(String(e.target.checked))}/>;
  else if(kind==='flag')content=<select className="cy-sheet-input" disabled={busy||loading} value={draft[key]??''} onChange={e=>change(e.target.value)}><option value="">請選擇</option><option value="true">是</option><option value="false">否</option></select>;
  else if(kind==='choice')content=<select className="cy-sheet-input" disabled={busy||loading} value={draft[key]??''} onChange={e=>change(e.target.value)}><option value="">請選擇</option>{(({taxResidence:[['resident','境內居住者'],['nonresident','非居住者']],taxSalaryKind:[['primary','本職每月給付'],['secondary','兼職所得']],nhiSupplementCategory:[['own','本單位被保險人（含離職後獎金）'],['other','非本單位投保之薪資'],['exempt','依法免扣，另填證明']]} as Record<string,string[][]>)[key]??[]).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select>;
  else if(kind==='date')content=<DateInput disabled={busy||loading} className="cy-sheet-input" value={draft[key]??''} onChange={change}/>;
  else content=<input className="cy-sheet-input" disabled={busy||loading} type={kind==='text'?'text':'number'} min={kind==='text'?undefined:'0'} step={key.toLowerCase().includes('rate')?'0.0001':key.endsWith('Hours')?'0.5':'1'} value={draft[key]??'0'} onChange={e=>change(e.target.value)}/>;
  const optional=['insuredTo','healthTo','pensionTo','attendanceEnabled','bonusOpeningYear','bonusOpeningThrough','bonusOpeningAmount','bonusOpeningReference'].includes(key)||key==='nhiExemptionReference'&&draft.nhiSupplementCategory!=='exempt'||key==='insuredFrom'&&draft.laborEnabled!=='true'||key==='healthFrom'&&draft.healthEnabled!=='true'||key==='pensionFrom'&&draft.pensionEnabled!=='true';
  return {label,required:!optional,content};
 });
 return <Dialog open title="薪資計算／投保設定" size="large" dismissible={!busy&&!loading} onClose={()=>void navigation.canLeave().then(ok=>{if(ok)onClose();})}>
  {error?<p className="cy-op-notice danger" role="alert">{error}</p>:null}
  {!ready&&!loading?<button type="button" className="cy-op-button" onClick={()=>setReadVersion(n=>n+1)}>重新讀取設定</button>:null}
  
  <form className="cy-op-form" onKeyDown={enterAdvancesFields} onSubmit={e=>void submit(e)}>
   <EntryFields label="生效設定" columns={2} rows={[{label:'生效日',required:true,content:<DateInput className="cy-sheet-input" disabled={busy||loading} value={at} onChange={v=>{setAt(v);setDirty(true);}}/>},{label:'設定原因',required:true,content:<input className="cy-sheet-input" disabled={busy||loading} value={reason} onChange={e=>{setReason(e.target.value);setDirty(true);}}/>}]}/>
   <EntryFields label="計薪與投保資料" columns={3} rows={controls}/>
   <button className="cy-op-button primary" disabled={busy||loading||!ready}>新增生效設定</button>
  </form>
  <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>生效日</th><th>原因</th></tr></thead><tbody>{history.map(r=><tr key={r.id}><td data-label="生效日">{r.effective_date}</td><td data-label="原因">{r.reason}</td></tr>)}</tbody></table></div>
 </Dialog>;
}
