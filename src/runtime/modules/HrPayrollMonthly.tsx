import {useEffect,useRef,useState} from 'react';
import {apiRequest} from '../../api/client';
import {MonthPicker} from '../../ui/forms/MonthPicker';
import {DateInput} from '../../ui/forms/DateInput';
import {DataViewToolbar} from '../../ui/data/DataViewToolbar';
import {StatusChip} from '../../ui/primitives/StatusChip';
import {Dialog} from '../../ui/overlays/Dialog';
import {Loading} from '../../ui/feedback/Loading';
import {useConfirmation} from '../../ui/overlays/useConfirmation';
import {useFormPrompt} from '../../ui/overlays/useFormPrompt';
import {useLatestRequest} from '../../ui/foundation/useLatestRequest';
import {useNavigationGuard,useUnsavedChangesGuard} from '../../ui/foundation/useUnsavedChangesGuard';
import {taipeiToday} from '../../../shared/erp-query-history';
import {HrPayrollDetail,type PayrollNavTarget} from './HrPayrollDetail';
import {FLOW_LABEL,FLOW_ORDER,FLOW_TONE,calcSkipped,calcTargets,calculateAll,confirmAll,confirmTargets,filterRows,flowStatus,monthLabel,pendingCount,proposedPayday,slashDate,statusCounts,totals,type BatchOutcome,type FlowStatus,type MonthRow} from './hr-payroll-flow';
import './hr-payroll-flow.css';

const ROOT='/api/business/hr';
const money=(v:number)=>'$'+v.toLocaleString('zh-TW');
const MONTH=/^20\d\d-(0[1-9]|1[0-2])$/;
interface Batch {title:string;outcome:BatchOutcome;note?:string}

export interface PayrollMonthlyProps {
 initialMonth?:string;initialEmployeeId?:number|null;refreshToken?:number;
 onRaise?:(id:number,name:string)=>void;onNavigate?:(target:PayrollNavTarget)=>void;onViewChange?:(view:{month:string;employeeId:number|null})=>void;
}

/** 每月薪資：一個月份 = 一張工作清單。全員列出 → 一鍵計算 → 逐人處理待補 → 確認 → 發薪。 */
export function HrPayrollMonthly({initialMonth,initialEmployeeId=null,refreshToken=0,onRaise=()=>{},onNavigate=()=>{},onViewChange}:PayrollMonthlyProps){
 const [month,setMonth]=useState(initialMonth??taipeiToday().slice(0,7));
 const [payDate,setPayDate]=useState(()=>proposedPayday(initialMonth??taipeiToday().slice(0,7))),[payDateEdited,setPayDateEdited]=useState(false),[payDateDialog,setPayDateDialog]=useState<string|null>(null);
 const [rows,setRows]=useState<MonthRow[]>([]),[loading,setLoading]=useState(true),[loaded,setLoaded]=useState(false);
 const [filter,setFilter]=useState<FlowStatus|null>(null),[search,setSearch]=useState('');
 const [selected,setSelected]=useState<number|null>(initialEmployeeId);
 const [stale,setStale]=useState<Set<number>>(new Set());
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[progress,setProgress]=useState<{label:string;done:number;total:number}|null>(null),[batch,setBatch]=useState<Batch|null>(null);
 const [daysDirty,setDaysDirty]=useState(false),[recalcSignal,setRecalcSignal]=useState(0);
 const writing=useRef(false),pendingSalary=useRef<number|null>(null);
 const request=useLatestRequest(month),navigation=useNavigationGuard();
 const {confirm,confirmationDialog}=useConfirmation(),{ask,promptDialog}=useFormPrompt();
 useUnsavedChangesGuard({active:daysDirty||payDateEdited,blocked:busy});

 async function load(){
  const ticket=request.begin();
  try{
   const result=await apiRequest<{month:string;rows:MonthRow[]}>(ROOT+'/payroll/month?month='+month);
   if(!ticket.current())return;
   setRows(result.rows);setError('');setLoaded(true);
   // 這個月已有紀錄時，預定給付日以既有紀錄為準，不用預設值蓋掉。
   const first=result.rows.find(r=>r.run)?.run;if(first&&!payDateEdited)setPayDate(first.payDate);
  }catch(e){if(ticket.current()){setRows([]);setError(e instanceof Error?e.message:'讀取每月薪資清單失敗');}}
  finally{if(ticket.current())setLoading(false);}
 }
 useEffect(()=>{setLoading(true);setLoaded(false);void load();},[month]);
 useEffect(()=>{onViewChange?.({month,employeeId:selected});},[month,selected]);
 const firstToken=useRef(refreshToken);
 useEffect(()=>{
  if(refreshToken===firstToken.current)return;firstToken.current=refreshToken;
  void load().then(()=>{if(pendingSalary.current!==null){pendingSalary.current=null;setRecalcSignal(n=>n+1);}});
 },[refreshToken]);

 async function run(fn:()=>Promise<void>){
  if(writing.current)return false;writing.current=true;setBusy(true);setError('');setNotice('');
  try{await fn();return true;}catch(e){setError(e instanceof Error?e.message:'薪資操作失敗');return false;}
  finally{writing.current=false;setBusy(false);}
 }
 async function chooseMonth(value:string){
  if(busy||!MONTH.test(value)||value===month||!await navigation.canLeave())return;
  setPayDate(proposedPayday(value));setPayDateEdited(false);setSelected(null);setFilter(null);setStale(new Set());setBatch(null);setNotice('');setDaysDirty(false);setMonth(value);
 }
 async function select(employeeId:number|null){
  if(busy)return;
  if(employeeId!==selected&&!await navigation.canLeave())return;
  setSelected(employeeId);
 }
 const markStale=(id:number)=>setStale(prev=>new Set(prev).add(id));
 const clearStale=(id:number)=>setStale(prev=>{if(!prev.has(id))return prev;const next=new Set(prev);next.delete(id);return next;});

 const counts=statusCounts(rows),shown=filterRows(rows,filter,search),sum=totals(shown);
 const targets=calcTargets(rows),skipped=calcSkipped(rows),confirmable=confirmTargets(rows).filter(r=>!stale.has(r.employeeId));
 const current=rows.find(r=>r.employeeId===selected)??null;

 async function calculateEveryone(){
  if(busy||!targets.length||!await navigation.canLeave())return;
  const ok=await run(async()=>{
   setBatch(null);setProgress({label:'計算中',done:0,total:targets.length});
   const outcome=await calculateAll(rows,month,payDate,payload=>apiRequest(ROOT+'/payroll/calculate',{method:'POST',json:payload}),(done,total)=>setProgress({label:'計算中',done,total}));
   const failed=new Set(outcome.failures.map(f=>f.employeeId));targets.forEach(r=>{if(!failed.has(r.employeeId))clearStale(r.employeeId);});
   setPayDateEdited(false);
   setBatch({title:'計算全部完成：成功 '+outcome.succeeded+'／'+outcome.total+' 人'+(outcome.failures.length?'，'+outcome.failures.length+' 人失敗':''),outcome,
    note:skipped.length?'另有 '+skipped.length+' 人曾撤回確認，須個別填原因後重新計算，未納入。':undefined});
   await load();
  });
  setProgress(null);
  if(!ok)await load();
 }
 async function confirmEveryone(){
  if(busy||!confirmable.length)return;
  const net=confirmable.reduce((n,r)=>n+r.run!.net,0);
  const accepted=await confirm({title:'確認全部無待補的薪資',description:'將確認 '+confirmable.length+' 位員工的 '+monthLabel(month)+' 薪資，實領合計 '+money(net)+'。有待補、已確認與已發薪的人不受影響；確認後仍可個別撤回。',confirmLabel:'確認 '+confirmable.length+' 人'});
  if(!accepted)return;
  await run(async()=>{
   setBatch(null);setProgress({label:'確認中',done:0,total:confirmable.length});
   const outcome=await confirmAll(confirmable,(id,revision)=>apiRequest(ROOT+'/payroll/runs/'+id,{method:'POST',json:{action:'confirm',revision}}),(done,total)=>setProgress({label:'確認中',done,total}));
   outcome.failures.filter(f=>f.conflict).forEach(f=>markStale(f.employeeId));
   setBatch({title:'確認全部完成：成功 '+outcome.succeeded+'／'+outcome.total+' 人'+(outcome.failures.length?'，'+outcome.failures.length+' 人失敗':''),outcome});
   await load();
  });
  setProgress(null);
 }
 function onRaiseFromDetail(id:number,name:string){pendingSalary.current=id;onRaise(id,name);}

 const detail=current?<HrPayrollDetail key={month+':'+current.employeeId} row={current} month={month} payDate={payDate} stale={stale.has(current.employeeId)} busy={busy} recalcSignal={recalcSignal}
   run={run} notify={setNotice} ask={ask} confirm={confirm} onBack={()=>void select(null)} onChanged={load} onStale={markStale} onFresh={clearStale}
   onNavigate={onNavigate} onRaise={onRaiseFromDetail} onDirtyChange={setDaysDirty}/>:null;

 return <section className={'cy-op-module cy-pay-month'+(current?' has-detail':'')} aria-label="每月薪資">
  <div className="cy-pay-head">
   <MonthPicker value={month} disabled={busy} onChange={target=>void chooseMonth(target)}/>
   <span className="cy-pay-paydate">預定給付日 {slashDate(payDate)} <button type="button" className="cy-pay-link" disabled={busy} onClick={()=>setPayDateDialog(payDate)}>變更</button></span>
   <span className="cy-pay-head-actions">
    <button type="button" className="cy-op-button" disabled={busy||!confirmable.length} onClick={()=>void confirmEveryone()}>確認全部無待補（{confirmable.length}）</button>
    <button type="button" className="cy-op-button primary" disabled={busy||!targets.length} onClick={()=>void calculateEveryone()}>計算全部（{targets.length} 人）</button>
   </span>
  </div>
  {error?<p role="alert" className="cy-op-notice danger">{error}</p>:null}
  {notice?<p role="status" className="cy-op-notice">{notice}</p>:null}
  {progress?<p role="status" className="cy-op-notice cy-pay-progress">{progress.label} {progress.done}／{progress.total}</p>:null}
  {batch?<div role="status" className="cy-op-notice cy-pay-batch"><strong>{batch.title}</strong>{batch.note?<p>{batch.note}</p>:null}
   {batch.outcome.failures.length?<ul>{batch.outcome.failures.map(f=><li key={f.employeeId}>{f.label}：{f.conflict?'來源資料已異動，需重新計算（'+f.message+'）':f.message}</li>)}</ul>:null}
   <button type="button" className="cy-op-button compact" onClick={()=>setBatch(null)}>關閉</button></div>:null}
  <div className="cy-pay-cards" role="group" aria-label="依狀態篩選">
   {FLOW_ORDER.map(key=><button key={key} type="button" className={'cy-pay-card tone-'+FLOW_TONE[key]+(filter===key?' is-active':'')} aria-pressed={filter===key} onClick={()=>setFilter(filter===key?null:key)}>
    <span>{FLOW_LABEL[key]}</span><strong>{counts[key]}</strong></button>)}
  </div>
  <div className="cy-pay-body">
   <div className="cy-pay-list-pane">
    <DataViewToolbar searchValue={search} onSearchChange={setSearch} searchLabel="搜尋薪資員工" searchPlaceholder="員工編號、姓名" resultSummary={'共 '+shown.length+' 人'+(filter?'（'+FLOW_LABEL[filter]+'）':'')}/>
    {loading&&!loaded?<Loading/>:<div className="cy-op-table-wrap">
     <table className="cy-op-table cy-rt cy-rt-list cy-pay-table"><thead><tr><th>員工</th><th className="num">應發</th><th className="num">扣項</th><th className="num">實領</th><th>狀態</th></tr></thead>
      <tbody>{shown.map(r=>{
       const st=flowStatus(r),run=r.run,pending=pendingCount(r),needs=stale.has(r.employeeId);
       const net=!run?'—':run.issues.length?'待確認':money(run.net);
       return <tr key={r.employeeId} className={r.employeeId===selected?'is-selected':''} onClick={()=>void select(r.employeeId)}>
        <td data-label="員工" data-priority="title"><button type="button" className="cy-pay-row-button" aria-current={r.employeeId===selected?'true':undefined} onClick={e=>{e.stopPropagation();void select(r.employeeId);}}><strong>{r.name}</strong> <span className="cy-pay-muted">{r.employeeNo}</span></button></td>
        <td data-label="應發" data-priority="hide" className="num">{run?money(run.gross):'—'}</td>
        <td data-label="扣項" data-priority="hide" className="num">{run?'−'+money(run.deductions).slice(1):'—'}</td>
        <td data-label="實領" data-priority="hide" className="num"><strong className={run?.issues.length?'cy-pay-muted':''}>{net}</strong></td>
        <td data-rt="meta">{!run?(r.hasSalary?'尚未計算':'尚未設定薪資'):'實領 '+net}</td>
        <td data-label="狀態" data-rt="end"><StatusChip tone={FLOW_TONE[st]}>{st==='pending'?'待補 '+pending:FLOW_LABEL[st]}</StatusChip>{needs?<small className="cy-pay-stale">需重新計算</small>:null}</td>
       </tr>;})}</tbody></table>
     {!shown.length?<p className="cy-op-empty">{rows.length?'沒有符合條件的員工。':'這個月沒有應發薪的員工。'}</p>:null}
     {shown.length?<p className="cy-pay-totals">合計　應發 {sum.gross.toLocaleString('zh-TW')}・實領 {sum.net.toLocaleString('zh-TW')}（不含待補者）</p>:null}
    </div>}
   </div>
   {detail??<div className="cy-pay-detail cy-pay-empty"><p className="cy-op-empty">點選左側員工，在這裡處理待補事項、確認薪資。</p></div>}
  </div>
  <Dialog open={payDateDialog!==null} title="變更預定給付日" description={monthLabel(month)+' 薪資的給付日；重新計算後才會套用到各員工。'} size="small" onClose={()=>setPayDateDialog(null)}
   footer={<div className="cy-dialog-action-row"><button type="button" className="cy-op-button" onClick={()=>setPayDateDialog(null)}>取消</button>
    <button type="button" className="cy-op-button primary" disabled={!payDateDialog} onClick={()=>{if(payDateDialog){setPayDate(payDateDialog);setPayDateEdited(payDateDialog!==proposedPayday(month));}setPayDateDialog(null);}}>確定</button></div>}>
   <DateInput className="cy-op-input" value={payDateDialog??''} onChange={setPayDateDialog}/>
  </Dialog>
  {promptDialog}{confirmationDialog}
 </section>;
}
