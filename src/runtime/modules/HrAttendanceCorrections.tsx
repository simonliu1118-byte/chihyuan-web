import {useEffect,useRef,useState,type FormEvent} from 'react';
import {apiRequest} from '../../api/client';
import {DataViewToolbar} from '../../ui/data/DataViewToolbar';
import {EntryFields} from '../../ui/forms/EntryFields';
import {TimeInput} from '../../ui/forms/TimeInput';
import {Dialog} from '../../ui/overlays/Dialog';
import {useLatestRequest} from '../../ui/foundation/useLatestRequest';
import {useNavigationGuard,useUnsavedChangesGuard} from '../../ui/foundation/useUnsavedChangesGuard';
import {enterAdvancesFields} from '../../ui/foundation/enter-advance';
import {taipeiToday} from '../../../shared/erp-query-history';
interface Row {employeeId:number;employee_no:string;name:string;work_date:string;out1:string|null;out2:string|null;revision:number}
export function HrAttendanceCorrections(){
 const [stores,setStores]=useState<{id:number;name:string}[]>([]),[store,setStore]=useState(0),[month,setMonth]=useState(taipeiToday().slice(0,7)),[search,setSearch]=useState(''),[rows,setRows]=useState<Row[]>([]);
 const [editing,setEditing]=useState<Row|null>(null),[out1,setOut1]=useState(''),[out2,setOut2]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const writing=useRef(false),request=useLatestRequest(store+'|'+month),navigation=useNavigationGuard();useUnsavedChangesGuard({active:editing!==null,blocked:busy});
 useEffect(()=>{const c=new AbortController();void apiRequest<{stores:{id:number;name:string}[]}>('/api/business/hr/attendance-corrections/capabilities',{signal:c.signal}).then(r=>{if(!c.signal.aborted){setStores(r.stores);setStore(r.stores[0]?.id??0);}}).catch(e=>{if(!c.signal.aborted)setError(String(e));});return()=>c.abort();},[]);
 async function load(){if(!store)return;const ticket=request.begin();setRows([]);try{const r=await apiRequest<Row[]>('/api/business/hr/attendance-corrections?storeId='+store+'&month='+month);if(ticket.current()){setRows(r);setError('');}}catch(e){if(ticket.current()){setRows([]);setError(e instanceof Error?e.message:'讀取出勤失敗');}}}
 useEffect(()=>{void load();},[store,month]);
 async function close(){if(!busy&&await navigation.canLeave()){setEditing(null);setReason('');}}
 async function save(e:FormEvent){e.preventDefault();if(!editing||writing.current)return;writing.current=true;setBusy(true);setError('');try{await apiRequest('/api/business/hr/attendance-corrections',{method:'POST',json:{employeeId:editing.employeeId,date:editing.work_date,revision:editing.revision,out1:out1||null,out2:out2||null,reason}});setEditing(null);setReason('');setNotice('已更正下班時間並保留原值與原因；相關薪資草稿須重算。');await load();}catch(e){setError(e instanceof Error?e.message:'更正失敗');}finally{writing.current=false;setBusy(false);}}
 const shown=rows.filter(r=>(r.employee_no+' '+r.name+' '+r.work_date).includes(search.trim()));
 return <section className="cy-op-module" aria-label="出勤更正">
  <DataViewToolbar searchValue={search} onSearchChange={setSearch} searchLabel="搜尋出勤更正" searchPlaceholder="員工、日期" resultSummary={`${shown.length} 筆`} filters={<><select aria-label="更正門市" className="cy-op-input" disabled={busy||editing!==null} value={store||''} onChange={e=>setStore(Number(e.target.value))}><option value="">請選擇門市</option>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><input aria-label="更正月份" className="cy-op-input" disabled={busy||editing!==null} type="month" min="2000-01" max="2099-12" value={month} onChange={e=>setMonth(e.target.value)}/></>}/>
  
  {!editing&&error?<p role="alert" className="cy-op-notice danger">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
  <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>日期</th><th>員工</th><th>下班1</th><th>下班2</th><th>操作</th></tr></thead><tbody>{shown.map(r=><tr key={r.employeeId+'|'+r.work_date}><td data-label="日期">{r.work_date}</td><td data-label="員工" data-priority="title">{r.employee_no} {r.name}</td><td data-label="下班1">{r.out1||'—'}</td><td data-label="下班2">{r.out2||'—'}</td><td data-label="操作"><button type="button" className="cy-op-button" disabled={busy||editing!==null} onClick={()=>{setEditing(r);setOut1(r.out1??'');setOut2(r.out2??'');setReason('');setError('');}}>更正下班時間</button></td></tr>)}</tbody></table></div>
  <Dialog open={editing!==null} title="更正誤打下班卡" size="medium" dismissible={!busy} onClose={()=>void close()}>
   {error?<p role="alert" className="cy-op-notice danger">{error}</p>:null}<p>{editing?.employee_no} {editing?.name}　{editing?.work_date}；原值：{editing?.out1||'—'}／{editing?.out2||'—'}</p>
   <form className="cy-op-form" onKeyDown={enterAdvancesFields} onSubmit={e=>void save(e)}><EntryFields label="下班時間更正" columns={2} rows={[
    {label:'正確下班1',content:<TimeInput disabled={busy} className="cy-sheet-input" value={out1} onChange={setOut1}/>},
    {label:'正確下班2',content:<TimeInput disabled={busy} className="cy-sheet-input" value={out2} onChange={setOut2}/>},
    {label:'更正原因',required:true,content:<input disabled={busy} className="cy-sheet-input" value={reason} onChange={e=>setReason(e.target.value)}/>},
   ]}/><button className="cy-op-button primary" disabled={busy}>保存更正</button></form>
  </Dialog>
 </section>;
}
