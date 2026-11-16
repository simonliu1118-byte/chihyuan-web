import {useEffect,useRef,useState,type FormEvent} from 'react';
import {apiRequest} from '../../api/client';
import {EntryFields} from '../../ui/forms/EntryFields';
import {DateInput} from '../../ui/forms/DateInput';
import {CheckField} from '../../ui/forms/Field';
import {Dialog} from '../../ui/overlays/Dialog';
import {enterAdvancesFields} from '../../ui/foundation/enter-advance';
import {useLatestRequest} from '../../ui/foundation/useLatestRequest';
import {useNavigationGuard,useUnsavedChangesGuard} from '../../ui/foundation/useUnsavedChangesGuard';
interface Legal {id:number;kind:string;event_date:string;from_date:string;to_date:string;monthly_basis:number;average_daily:number;offsets_json:string;reference:string;reason:string;is_active:number}
const initial={kind:'maternity',eventDate:'',from:'',to:'',monthlyBasis:'0',averageDaily:'0',offset:'0',reference:'',reason:'',active:true};
export function HrPayrollLegalCases({employeeId,month}:{employeeId:number;month:string}){
 const [rows,setRows]=useState<Legal[]>([]),[draft,setDraft]=useState(initial),[open,setOpen]=useState(false),[editing,setEditing]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useLatestRequest(employeeId+'|'+month),writing=useRef(false),navigation=useNavigationGuard();useUnsavedChangesGuard({active:open,blocked:busy});
 async function load(){const t=request.begin();setReady(false);try{const r=await apiRequest<Legal[]>('/api/business/hr/payroll/legal-cases/'+employeeId);if(t.current()){setRows(r);setReady(true);setError('');}}catch(e){if(t.current())setError(e instanceof Error?e.message:'案件讀取失敗');}}
 useEffect(()=>{void load();},[employeeId,month]);
 async function save(e:FormEvent){e.preventDefault();if(writing.current||!ready)return;writing.current=true;setBusy(true);setError('');try{const expected=rows.find(r=>r.kind===draft.kind&&r.event_date===draft.eventDate)?.id??0;
  const r=await apiRequest<Legal[]>('/api/business/hr/payroll/legal-cases/'+employeeId,{method:'POST',json:{...draft,month,monthlyBasis:Number(draft.monthlyBasis),averageDaily:Number(draft.averageDaily),offset:Number(draft.offset),expectedId:expected}});setRows(r);setOpen(false);
 }catch(e){setError(e instanceof Error?e.message:'法定資料儲存失敗');}finally{writing.current=false;setBusy(false);}}
 const latest=rows.filter((r,i)=>rows.findIndex(x=>x.kind===r.kind&&x.event_date===r.event_date)===i);
 const input=(key:'monthlyBasis'|'averageDaily'|'offset'|'reference'|'reason',label:string)=>({label,required:true,content:<input className="cy-sheet-input" disabled={busy} type={['reference','reason'].includes(key)?'text':'number'} min="0" step={key==='averageDaily'?'0.01':'1'} value={draft[key]} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}/>});
 return <section className="cy-op-panel"><h3>法定假別計薪基準</h3>
  {!open&&error?<p role="alert" className="cy-op-notice danger">{error}</p>:null}<button type="button" className="cy-op-button" disabled={busy||!ready} onClick={()=>{setDraft(initial);setEditing(false);setError('');setOpen(true);}}>新增法定案件</button>{!ready?<button type="button" className="cy-op-button" onClick={()=>void load()}>重新讀取案件</button>:null}
  <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>類別／事件</th><th>期間</th><th>原月工資</th><th>平均日工資</th><th>本月抵充</th><th>來源</th><th>狀態</th><th>操作</th></tr></thead><tbody>{latest.map(r=><tr key={r.id}><td data-label="類別／事件">{r.kind==='maternity'?'產假':'公傷病'} {r.event_date}</td><td data-label="期間">{r.from_date}～{r.to_date}</td><td data-label="原月工資">{r.monthly_basis}</td><td data-label="平均日工資">{r.average_daily}</td><td data-label="本月抵充">{JSON.parse(r.offsets_json)[month]??0}</td><td data-label="來源">{r.reference}</td><td data-label="狀態">{r.is_active?'有效':'停用'}</td><td data-label="操作"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>{setEditing(true);setError('');setDraft({kind:r.kind,eventDate:r.event_date,from:r.from_date,to:r.to_date,monthlyBasis:String(r.monthly_basis),averageDaily:String(r.average_daily),offset:String(JSON.parse(r.offsets_json)[month]??0),reference:r.reference,reason:'',active:r.is_active===1});setOpen(true);}}>核對／新增版本</button></td></tr>)}</tbody></table></div>
  <Dialog open={open} title="核對法定計薪基準" size="large" dismissible={!busy} onClose={()=>void navigation.canLeave().then(ok=>{if(ok)setOpen(false);})}>
   {error?<p role="alert" className="cy-op-notice danger">{error}</p>:null}<form className="cy-op-form" onKeyDown={enterAdvancesFields} onSubmit={e=>void save(e)}><EntryFields label="法定案件資料" columns={3} rows={[
    {label:'案件類別',required:true,content:<select className="cy-sheet-input" disabled={busy||editing} value={draft.kind} onChange={e=>setDraft(d=>({...d,kind:e.target.value}))}><option value="maternity">產假</option><option value="occupational">公傷病</option></select>},
    {label:'分娩／流產／事故日',required:true,content:<DateInput className="cy-sheet-input" disabled={busy||editing} value={draft.eventDate} onChange={v=>setDraft(d=>({...d,eventDate:v}))}/>},
    {label:'連續期間起日',required:true,content:<DateInput className="cy-sheet-input" disabled={busy} value={draft.from} onChange={v=>setDraft(d=>({...d,from:v}))}/>},
    {label:'連續期間迄日',required:true,content:<DateInput className="cy-sheet-input" disabled={busy} value={draft.to} onChange={v=>setDraft(d=>({...d,to:v}))}/>},
    input('monthlyBasis','最近月工資／原領日工資×30'),input('averageDaily','已核對平均日工資（產假比較）'),input('offset',month+'同事故已給付可抵充'),input('reference','工資／醫療／給付核對來源'),input('reason','本次核對原因'),
    {label:'案件有效',content:<CheckField label="此版本有效" disabled={busy} checked={draft.active} onChange={e=>setDraft(d=>({...d,active:e.target.checked}))}/>},
   ]}/><button className="cy-op-button primary" disabled={busy||!ready}>保存核對版本</button></form>
  </Dialog>
 </section>;
}
