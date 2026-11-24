import {MonthPicker} from "../../ui/forms/MonthPicker";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {apiRequest} from '../../api/client';
import {BONUS_CATEGORIES,type BonusBatch,type BonusHistoryRow} from '../../../shared/hr-bonus';
import {EntryFields} from '../../ui/forms/EntryFields';
import {EntryTable,EntryHeading} from '../../ui/forms/EntryTable';
import {Field,CheckField} from '../../ui/forms/Field';
import {DateInput} from '../../ui/forms/DateInput';
import {Dialog} from '../../ui/overlays/Dialog';
import {RelatedCard} from '../../ui/records/RelatedCard';
import {DataViewToolbar} from '../../ui/data/DataViewToolbar';
import {enterAdvancesFields} from '../../ui/foundation/enter-advance';
import {useLatestRequest} from '../../ui/foundation/useLatestRequest';
import {useNavigationGuard,useUnsavedChangesGuard} from '../../ui/foundation/useUnsavedChangesGuard';
import {taipeiToday} from '../../../shared/erp-query-history';

const ROOT='/api/business/hr/payroll/bonuses';
const money=(n:number)=>(n||0).toLocaleString('zh-TW'),date=(s:string)=>s.replaceAll('-','/');
const status={draft:'草稿',paid:'已發放',void:'已作廢'};
interface Person {id:number;employee_no:string;name:string}
interface Page {items:BonusHistoryRow[];nextCursor:number|null}
interface EditRow {employeeId:number;amount:string;note:string}

/** One editor and mutation owner for individual and bulk bonus payments. */
function BonusEditor({initial,employee,onSaved,onClose}:{initial:BonusBatch|null;employee?:Person;onSaved:()=>void;onClose:()=>void}){
 const [batch,setBatch]=useState(initial),[payDate,setPayDate]=useState(initial?.pay_date??taipeiToday()),[category,setCategory]=useState<string>(initial&& !BONUS_CATEGORIES.includes(initial.category as typeof BONUS_CATEGORIES[number])?'其他':initial?.category??'年終獎金');
 const [custom,setCustom]=useState(initial&&category==='其他'?initial.category:''),[year,setYear]=useState(initial?.attribution_year?String(initial.attribution_year):''),[sameAmount,setSameAmount]=useState('');
 const [rows,setRows]=useState<EditRow[]>(initial?.payments.map(p=>({employeeId:p.employee_id,amount:String(p.amount),note:p.note}))??(employee?[{employeeId:employee.id,amount:'',note:''}]:[]));
 const [people,setPeople]=useState<Person[]>(employee?[employee]:initial?.payments.map(p=>({id:p.employee_id,employee_no:p.employee_no,name:p.name}))??[]),[cursor,setCursor]=useState<number|null>(null),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[dirty,setDirty]=useState(!initial),[voiding,setVoiding]=useState(false),[reason,setReason]=useState('');
 const key=useRef(crypto.randomUUID()),writing=useRef(false),request=useLatestRequest('bonus-editor'),navigation=useNavigationGuard();
 useUnsavedChangesGuard({active:dirty,blocked:busy});
 async function peoplePage(append=false){const t=request.begin();try{const r=await apiRequest<{items:Person[];nextCursor:number|null}>('/api/business/hr/employees?limit=100'+(append&&cursor?'&cursor='+cursor:''));if(t.current()){setPeople(current=>[...new Map([...current,...r.items].map(p=>[p.id,p])).values()]);setCursor(r.nextCursor);}}catch(e){if(t.current())setError(e instanceof Error?e.message:'讀取員工失敗');}}
 useEffect(()=>{if(!employee)void peoplePage();},[]);
 const editable=!batch||batch.status==='draft';
 const change=(fn:()=>void)=>{fn();setDirty(true);};
 function patch(id:number,key:'amount'|'note',value:string){change(()=>setRows(current=>current.map(r=>r.employeeId===id?{...r,[key]:value}:r)));}
 async function run(fn:()=>Promise<void>){if(writing.current)return;writing.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'獎金儲存失敗');}finally{writing.current=false;setBusy(false);}}
 async function save(e:FormEvent){e.preventDefault();await run(async()=>{const result=await apiRequest<BonusBatch>(ROOT+(batch?'/'+batch.id:''),{method:batch?'PUT':'POST',json:{requestKey:key.current,revision:batch?.revision,payDate,category,customCategory:custom,attributionYear:year?Number(year):null,payments:rows.map(r=>({...r,amount:Number(r.amount)}))}});setBatch(result);setDirty(false);onSaved();});}
 async function transition(action:'pay'|'void'){if(!batch)return;await run(async()=>{const result=await apiRequest<BonusBatch>(ROOT+'/'+batch.id,{method:'POST',json:{action,revision:batch.revision,reason}});setBatch(result);setDirty(false);setVoiding(false);onSaved();});}
 const visible=people.filter(p=>rows.some(r=>r.employeeId===p.id)||(p.employee_no+' '+p.name).includes(search.trim()));
 const total=rows.reduce((n,r)=>n+Number(r.amount||0),0),hasIssues=!!batch?.payments.some(p=>p.result.issues.length);
 return <Dialog open size="large" title={`${employee?'獎金發放｜'+employee.employee_no+' '+employee.name:'獎金發放'}${batch?' — '+status[batch.status]:''}`} showCloseButton={false} dismissible={!busy} onClose={()=>void navigation.canLeave().then(ok=>{if(ok)onClose();})}>
  {error?<p className="cy-op-notice danger" role="alert">{error}</p>:null}
  <form className="cy-op-form cy-hr-bonus-editor" onKeyDown={enterAdvancesFields} onSubmit={e=>void save(e)}>
   <EntryFields label="獎金發放資料" columns={3} rows={[
    {label:'發放日期',required:true,content:<DateInput className="cy-sheet-input" disabled={busy||!editable} value={payDate} onChange={v=>change(()=>setPayDate(v))}/>},
    {label:'獎金項目',required:true,content:<select className="cy-sheet-input" disabled={busy||!editable} value={category} onChange={e=>change(()=>setCategory(e.target.value))}>{BONUS_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>},
    ...(category==='其他'?[{label:'自訂獎金項目',required:true,content:<input className="cy-sheet-input" disabled={busy||!editable} maxLength={100} value={custom} onChange={e=>change(()=>setCustom(e.target.value))}/>}]:[]),
    {label:'歸屬年度',content:<input className="cy-sheet-input" disabled={busy||!editable} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={year} onChange={e=>change(()=>setYear(e.target.value.replace(/\D/g,'')))}/>},
   ]}/>
   {!employee&&editable?<DataViewToolbar searchValue={search} onSearchChange={setSearch} searchLabel="搜尋獎金員工" searchPlaceholder="員工編號、姓名" actions={<>{cursor?<button className="cy-op-button" type="button" disabled={busy} onClick={()=>void peoplePage(true)}>載入更多員工</button>:null}<Field label="統一金額" size="s"><input className="cy-op-input" disabled={busy} inputMode="numeric" value={sameAmount} onChange={e=>setSameAmount(e.target.value.replace(/\D/g,''))}/></Field><button type="button" className="cy-op-button" disabled={busy||!sameAmount||!rows.length} onClick={()=>change(()=>setRows(current=>current.map(r=>({...r,amount:sameAmount}))))}>套用已選員工</button></>}/>:null}
   <EntryTable label="獎金發放員工"><colgroup>{!employee&&editable?<col style={{width:48}}/>:null}<col style={{width:180}}/><col style={{width:120}}/><col/></colgroup><thead><tr>{!employee&&editable?<th>選取</th>:null}<th>員工</th><th><EntryHeading required>金額</EntryHeading></th><th>備註</th></tr></thead><tbody>
    {(editable?visible:people.filter(p=>rows.some(r=>r.employeeId===p.id))).map(p=>{const row=rows.find(r=>r.employeeId===p.id);return <tr key={p.id}>
     {!employee&&editable?<td><CheckField label={<span className="cy-visually-hidden">選取{p.employee_no} {p.name}</span>} aria-label={`選取${p.employee_no} ${p.name}`} checked={!!row} disabled={busy} onChange={e=>change(()=>setRows(current=>e.target.checked?[...current,{employeeId:p.id,amount:sameAmount,note:''}]:current.filter(r=>r.employeeId!==p.id)))}/></td>:null}
     <td>{p.employee_no} {p.name}</td><td><Field label={`${p.employee_no}金額`} presentation="cell" required={!!row}><input className="cy-sheet-input" disabled={busy||!editable||!row} inputMode="numeric" pattern="[0-9]+" value={row?.amount??''} onChange={e=>patch(p.id,'amount',e.target.value.replace(/\D/g,''))}/></Field></td>
     <td><Field label={`${p.employee_no}備註`} presentation="cell"><input className="cy-sheet-input" disabled={busy||!editable||!row} maxLength={1000} value={row?.note??''} onChange={e=>patch(p.id,'note',e.target.value)}/></Field></td></tr>;})}
   </tbody></EntryTable>
   <strong>共 {rows.length} 人，應發合計 {money(total)}</strong>
   {batch?<div className="cy-op-table-wrap"><table className="cy-op-table cy-rt" aria-label="獎金計算結果"><thead><tr><th>員工</th><th>應發</th><th>所得稅</th><th>補充保費</th><th>實領</th><th>待補事項</th></tr></thead><tbody>{batch.payments.map(p=><tr key={p.id}><td data-label="員工">{p.employee_no} {p.name}</td><td data-label="應發">{money(p.amount)}</td><td data-label="所得稅">{money(p.result.taxRegular+p.result.taxBonus)}</td><td data-label="補充保費">{money(p.result.nhiPremium)}</td><td data-label="實領">{p.result.issues.length?'待確認':money(p.result.net)}</td><td data-label="待補事項">{p.result.issues.join('；')||'—'}</td></tr>)}</tbody></table></div>:null}
   {voiding?<Field label="作廢原因" required size="l"><input className="cy-op-input" disabled={busy} value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)}/></Field>:null}
   {batch?.void_reason?<p>作廢原因：{batch.void_reason}</p>:null}
   <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>void navigation.canLeave().then(ok=>{if(ok)onClose();})}>取消</button>
    {editable&&!voiding?<button className="cy-op-button" disabled={busy||!rows.length}>計算並儲存草稿</button>:null}
    {batch&&batch.status!=='void'&&!dirty&&!voiding?<button type="button" className="cy-op-button danger" disabled={busy} onClick={()=>setVoiding(true)}>作廢</button>:null}
    {voiding?<><button type="button" className="cy-op-button" disabled={busy} onClick={()=>{setVoiding(false);setReason('');}}>返回</button><button type="button" className="cy-op-button danger" disabled={busy||!reason.trim()} onClick={()=>void transition('void')}>確認作廢</button></>:null}
    {batch?.status==='draft'&&!voiding?<button type="button" className="cy-op-button primary" disabled={busy||dirty||hasIssues} onClick={()=>void transition('pay')}>確認已發放</button>:null}
   </div>
  </form>
 </Dialog>;
}

function BonusRecords({employee}:{employee?:Person}){
 const [year,setYear]=useState(taipeiToday().slice(0,4)),[search,setSearch]=useState(''),[page,setPage]=useState<Page>({items:[],nextCursor:null}),[error,setError]=useState(''),[editor,setEditor]=useState<BonusBatch|null|undefined>(undefined),[history,setHistory]=useState(false),[busy,setBusy]=useState(false);
 const request=useLatestRequest((employee?.id??0)+'|'+year);
 async function load(append=false){const t=request.begin();try{const result=await apiRequest<Page>(ROOT+'?year='+year+(employee?'&employeeId='+employee.id:'')+(append&&page.nextCursor?'&before='+page.nextCursor:''));if(t.current()){setPage(current=>({...result,items:append?[...current.items,...result.items]:result.items}));setError('');}}catch(e){if(t.current())setError(e instanceof Error?e.message:'讀取獎金失敗');}}
 useEffect(()=>{setPage({items:[],nextCursor:null});setEditor(undefined);setHistory(false);void load();},[employee?.id,year]);
 async function open(id:number){setBusy(true);try{setEditor(await apiRequest<BonusBatch>(ROOT+'/'+id));}catch(e){setError(e instanceof Error?e.message:'讀取獎金失敗');}finally{setBusy(false);}}
 const filtered=page.items.filter(p=>(p.employee_no+' '+p.name+' '+p.category+' '+p.note).includes(search.trim()));
 const table=<><div className="cy-op-table-wrap"><table className="cy-op-table cy-rt" aria-label="獎金發放紀錄"><thead><tr>{['發放日期',...(!employee?['員工']:[]),'獎金項目','金額','實領','備註','狀態','操作'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{filtered.map(p=><tr key={p.id}><td data-label="發放日期">{date(p.pay_date)}</td>{!employee?<td data-label="員工">{p.employee_no} {p.name}</td>:null}<td data-label="獎金項目">{p.category}{p.attribution_year?'（'+p.attribution_year+'）':''}</td><td data-label="金額">{money(p.amount)}</td><td data-label="實領">{p.result.issues.length?'待確認':money(p.result.net)}</td><td data-label="備註">{p.note||'—'}</td><td data-label="狀態">{status[p.status]}</td><td data-label="操作"><button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void open(p.batch_id)}>{p.status==='draft'?'修改':'查看'}</button></td></tr>)}</tbody></table></div>{!filtered.length?<p className="cy-op-empty">{search.trim()?"沒有符合的獎金發放紀錄。":"這一年尚無獎金發放紀錄。"}</p>:null}{page.nextCursor?<button type="button" className="cy-op-button" onClick={()=>void load(true)}>載入更多</button>:null}</>;
 return <>
  {employee?<RelatedCard title="獎金" count={page.items.length+(page.nextCursor?'+':'')} empty="尚無獎金發放紀錄。" rows={page.items.slice(0,3).map(p=><span key={p.id}>{date(p.pay_date)}　{p.category}　{money(p.amount)}{p.status!=='paid'?'（'+status[p.status]+'）':''}</span>)} onAdd={()=>setEditor(null)} onView={()=>setHistory(true)} summary={error?<span role="alert">{error}</span>:undefined}/>:<section className="cy-op-module" aria-label="獎金發放">
   <DataViewToolbar searchValue={search} onSearchChange={setSearch} searchLabel="搜尋獎金" searchPlaceholder="員工編號、姓名、獎金項目、備註" beforeSearch={<MonthPicker precision="year" value={year} onChange={setYear}/>} actions={<button className="cy-op-button primary" type="button" onClick={()=>setEditor(null)}>統一發放獎金</button>}/>
   {error?<p className="cy-op-notice danger" role="alert">{error}</p>:null}{table}
  </section>}
  {history&&employee?<Dialog open size="large" title={`獎金紀錄｜${employee.employee_no} ${employee.name}`} onClose={()=>setHistory(false)}>{table}</Dialog>:null}
  {editor!==undefined?<BonusEditor key={editor?.id??'new'} initial={editor} employee={editor&&editor.payments.length>1?undefined:employee} onSaved={()=>void load()} onClose={()=>setEditor(undefined)}/>:null}
 </>;
}
export function HrBonusPanel(){return <BonusRecords/>;}
export function HrEmployeeBonusCard({employee}:{employee:Person}){return <BonusRecords key={employee.id} employee={employee}/>;}
