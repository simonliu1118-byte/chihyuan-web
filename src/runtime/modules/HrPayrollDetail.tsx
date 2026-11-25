import {useEffect,useRef,useState} from 'react';
import {apiRequest} from '../../api/client';
import {StatusChip} from '../../ui/primitives/StatusChip';
import {Loading} from '../../ui/feedback/Loading';
import type {PayrollResult} from '../../../shared/hr-payroll';
import type {FormPromptRequest} from '../../ui/overlays/useFormPrompt';
import {HrPayrollCorrections} from './HrPayrollCorrections';
import {HrPayrollLegalCases} from './HrPayrollLegalCases';
import {ProfileEditor} from './HrPayrollProfileEditor';
import {FLOW_LABEL,FLOW_TONE,calcPayload,classifyIssue,issueNavDate,flowStatus,monthLabel,monthSummary,needsRecalc,rowIssues,shortIssue,slashDate,type IssueAction,type MonthRow,type ReviewKind} from './hr-payroll-flow';

const ROOT='/api/business/hr';
const money=(v:number)=>'$'+(v||0).toLocaleString('zh-TW');
const minus=(v:number)=>v?'−'+money(v).slice(1):'0';
const ruleLabels:Record<string,string>={labor:'勞保／就保',pension:'勞退',health:'健保',tax:'薪資扣繳'};
const reviewLabels:Record<string,string>={absence:'確認曠班',holiday_shifted:'假日已合法調移',regular_emergency:'例假緊急出勤'};
interface RunFull {id:number;employee_id:number;month:string;pay_date:string;status:string;revision:number;result:PayrollResult}
interface DayReview {work_date:string;kind:string;reason:string;revision:number}
interface Snapshot {id:number;status:string;revision:number;reason:string|null;updated_at:string;result:PayrollResult}
export interface PayrollNavTarget {tab:'attendance'|'leave';employeeId:number;month:string;date?:string|null}
type Ask=(request:FormPromptRequest)=>Promise<Record<string,string>|null>;

export interface PayrollDetailProps {
 row:MonthRow;month:string;payDate:string;stale:boolean;busy:boolean;recalcSignal:number;
 run:(fn:()=>Promise<void>)=>Promise<boolean>;notify:(message:string)=>void;
 ask:Ask;confirm:(request:{title:string;description:string;confirmLabel:string})=>Promise<boolean>;
 onBack:()=>void;onChanged:()=>Promise<void>;onStale:(employeeId:number)=>void;onFresh:(employeeId:number)=>void;
 onNavigate:(target:PayrollNavTarget)=>void;onRaise:(id:number,name:string)=>void;onDirtyChange:(dirty:boolean)=>void;
}

/** 右側（手機為整頁）的員工詳情：先處理待補、再看本月明細，操作依狀態只開放既有的狀態轉換。 */
export function HrPayrollDetail(props:PayrollDetailProps){
 const {row,month,payDate,stale,busy,run,notify,ask,confirm,onChanged,onStale,onFresh}=props;
 const status=flowStatus(row),issues=rowIssues(row),editable=!row.run||row.run.status==='draft';
 const [full,setFull]=useState<RunFull|null>(null),[loadError,setLoadError]=useState('');
 const [reviews,setReviews]=useState<DayReview[]>([]),[history,setHistory]=useState<Snapshot[]|null>(null),[historyOpen,setHistoryOpen]=useState(false);
 const [days,setDays]=useState(''),[profileOpen,setProfileOpen]=useState(false);
 const alive=useRef(0);
 const runId=row.run?.id??0,revision=row.run?.revision??0;
 useEffect(()=>{
  const ticket=++alive.current;setFull(null);setLoadError('');
  if(!runId)return;
  apiRequest<RunFull>(ROOT+'/payroll/runs/'+runId).then(r=>{if(ticket===alive.current)setFull(r)})
   .catch(e=>{if(ticket===alive.current)setLoadError(e instanceof Error?e.message:'讀取薪資明細失敗')});
  return()=>{alive.current++};
 },[runId,revision]);
 async function loadReviews(){try{setReviews(await apiRequest<DayReview[]>(ROOT+'/payroll/reviews/'+row.employeeId+'?month='+month));}catch(e){notify(e instanceof Error?e.message:'讀取出勤確認失敗');}}
 useEffect(()=>{void loadReviews();},[row.employeeId,month]);
 useEffect(()=>{
  if(!historyOpen)return;let live=true;
  apiRequest<Snapshot[]>(ROOT+'/payroll/runs?month='+month+'&employeeId='+row.employeeId).then(rows=>{if(live)setHistory(rows.filter(r=>r.status==='void'))}).catch(()=>{if(live)setHistory([])});
  return()=>{live=false};
 },[historyOpen,row.employeeId,month,row.voidCount,revision]);
 useEffect(()=>{props.onDirtyChange(days!=='');return()=>props.onDirtyChange(false);},[days]);
 // 外部（薪資視窗）存檔後，父層送來訊號：自動重算這位員工（需要原因時改提示，不替使用者編原因）。
 const firstSignal=useRef(props.recalcSignal);
 useEffect(()=>{if(props.recalcSignal!==firstSignal.current){firstSignal.current=props.recalcSignal;void calculate({auto:true});}},[props.recalcSignal]);

 /** 計算／重新計算：一般不問原因；撤回過的月份、手動計薪天數才要原因（後端同樣檢查）。 */
 async function calculate(extra:{paidDays?:number|null;reason?:string;auto?:boolean}={}){
  let reason=extra.reason;
  if(reason===undefined&&row.voidCount>0){
   if(extra.auto){notify('設定已更新；此月份撤回過確認，請按「重新計算」並填原因');return;}
   const previous=row.run?.reason&&row.run.reason!==monthLabel(month)+' 月薪'?row.run.reason:'';
   const v=await ask({title:'重新計算：'+row.name+' '+monthLabel(month),description:'此月份曾撤回確認，重算須留下原因。',fields:[{name:'reason',label:'原因',required:true,defaultValue:previous,placeholder:'例：11/12 補打卡後重算'}],confirmLabel:'重新計算',size:'small'});
   if(!v)return;reason=v.reason;
  }
  await run(async()=>{
   const r=await apiRequest<RunFull>(ROOT+'/payroll/calculate',{method:'POST',json:calcPayload(row,month,payDate,{paidDays:extra.paidDays,reason})});
   setFull(r);onFresh(row.employeeId);await onChanged();
   notify(r.result.issues.length?'已儲存草稿，請先處理待補事項':'已計算，請核對明細再確認');
  });
 }
 async function transition(action:'confirm'|'pay'|'reopen',reason?:string){
  if(!full||!row.run)return;
  await run(async()=>{
   try{
    const r=await apiRequest<RunFull>(ROOT+'/payroll/runs/'+full.id,{method:'POST',json:reason?{action,revision:full.revision,reason}:{action,revision:full.revision}});
    setFull(r);await onChanged();notify(action==='confirm'?'已確認薪資':action==='pay'?'已標記為已發薪':'已撤回確認，歷史快照已保留');
   }catch(e){if(needsRecalc(e)){onStale(row.employeeId);await onChanged();}throw e;}
  });
 }
 async function reopen(){
  const v=await ask({title:'撤回確認：'+row.name+' '+monthLabel(month),description:'已確認的薪資會保留歷史快照，撤回後可修正再重新計算。',fields:[{name:'reason',label:'原因',required:true,placeholder:'例：11/12 補打卡後重算'}],confirmLabel:'撤回確認',size:'small'});
  if(v)await transition('reopen',v.reason);
 }
 async function markPaid(){
  if(await confirm({title:'標記為已發薪？',description:row.name+' '+monthLabel(month)+' 薪資標記後變成唯讀，之後只能用前期差額更正。',confirmLabel:'標記已發薪'}))await transition('pay');
 }
 async function confirmReview(date:string,kind:ReviewKind,label:string){
  const existing=reviews.find(r=>r.work_date===date);
  const v=await ask({title:label+'：'+row.name+' '+slashDate(date),description:'儲存後會重新計算這位員工的本月薪資，請填寫核對原因。',fields:[{name:'reason',label:'核對原因',required:true,defaultValue:existing?.reason??''}],confirmLabel:'儲存並重算',size:'small'});
  if(!v)return;
  const saved=await run(async()=>{await apiRequest(ROOT+'/payroll/reviews/'+row.employeeId,{method:'POST',json:{date,kind,reason:v.reason,revision:existing?.revision??0}});});
  if(!saved){await loadReviews();return;}
  await loadReviews();await calculate({reason:row.voidCount>0?v.reason:undefined});
 }
 async function editReview(r:DayReview){
  const v=await ask({title:'修改確認：'+row.name+' '+slashDate(r.work_date),description:reviewLabels[r.kind]+'；儲存後請重新計算。',fields:[{name:'reason',label:'核對原因',required:true,defaultValue:r.reason}],confirmLabel:'儲存',size:'small'});
  if(!v)return;
  await run(async()=>{await apiRequest(ROOT+'/payroll/reviews/'+row.employeeId,{method:'POST',json:{date:r.work_date,kind:r.kind,reason:v.reason,revision:r.revision}});await loadReviews();notify('已保存確認原因，請重新計算');});
 }
 async function adjustDays(clear=false){
  const n=Number(days);
  if(!clear&&(days.trim()===''||!Number.isInteger(n)||n<0||n>30)){notify('計薪天數須為 0～30 的整數');return;}
  const v=await ask({title:(clear?'恢復整月計算：':'調整計薪天數：')+row.name+' '+monthLabel(month),description:clear?'取消手動計薪天數，改為整月計算。':'手動指定 '+n+' 天（30 天制），請填寫核對原因。',fields:[{name:'reason',label:'核對原因',required:true,placeholder:'例：11/16 離職，計薪 15 天'}],confirmLabel:'儲存並重算',size:'small'});
  if(!v)return;
  setDays('');await calculate({paidDays:clear?null:n,reason:v.reason});
 }
 function act(action:IssueAction,date:string|null){
  if(action.type==='attendance'||action.type==='leave')props.onNavigate({tab:action.type,employeeId:row.employeeId,month,date:issueNavDate(date,month)});
  else if(action.type==='salary')props.onRaise(row.employeeId,row.name);
  else if(action.type==='profile')setProfileOpen(true);
  else if(action.type==='review'&&date&&action.reviewKind)void confirmReview(date,action.reviewKind,action.label);
 }
 const disabled=busy;
 const daysControl=<span className="cy-pay-days"><input className="cy-op-input w-xs" type="number" inputMode="numeric" min="0" max="30" step="1" disabled={disabled||!editable} aria-label="計薪天數（30 天制）" placeholder="天數" value={days} onChange={e=>setDays(e.target.value)}/>
  <button type="button" className="cy-op-button compact" disabled={disabled||!editable||days.trim()===''} onClick={()=>void adjustDays()}>調整計薪天數</button></span>;
 const summary=full?monthSummary(full.result):null;
 const result=full?.result;
 return <aside className="cy-pay-detail" aria-label={row.name+' 薪資詳情'}>
  <header className="cy-pay-detail-head">
   <button type="button" className="cy-op-button compact cy-pay-back" onClick={props.onBack}>‹ 返回</button>
   <div className="cy-pay-detail-title"><strong>{row.name}</strong><span className="cy-pay-muted">{row.employeeNo}{row.storeName?'・'+row.storeName:''}・{monthLabel(month)}</span></div>
   <StatusChip tone={FLOW_TONE[status]}>{status==='pending'?'待補 '+issues.length:FLOW_LABEL[status]}</StatusChip>
  </header>
  {stale?<p role="alert" className="cy-op-notice danger">出勤、設定或法定表在計算後已異動，請重新計算後再確認。</p>:null}
  {issues.length&&editable?<section className="cy-pay-issues" aria-label="待補事項">
   <h4>先處理這些，才能確認</h4>
   <ol>{issues.map((text,i)=>{const info=classifyIssue(text);return <li key={i} className="cy-pay-issue">
    <span className="cy-pay-issue-no" aria-hidden="true">{i+1}</span>
    <div className="cy-pay-issue-body"><span>{shortIssue(text)}</span>
     {info.actions.length?<div className="cy-pay-issue-actions">{info.actions.map(a=>a.type==='days'?<span key={a.type}>{daysControl}</span>:
      <button key={a.label} type="button" className="cy-op-button compact" disabled={disabled} onClick={()=>act(a,info.date)}>{a.label}</button>)}</div>:null}
    </div></li>;})}</ol>
  </section>:null}
  <section className="cy-pay-summary" aria-label="本月明細">
   <h4>本月明細</h4>
   {!row.run?<p className="cy-op-empty">{row.hasSalary?'尚未計算。按下方「計算」產生這個月的薪資。':'尚未設定薪資，請先設定後再計算。'}</p>
    :loadError?<p role="alert" className="cy-op-notice danger">{loadError}</p>:!summary||!result?<Loading/>:<>
    <dl className="cy-pay-facts">
     <div><dt>本薪</dt><dd>{money(summary.base)}</dd></div>
     <div><dt>津貼及其他應發</dt><dd>{money(summary.allowances)}</dd></div>
     <div><dt>勞保・健保・勞退自提</dt><dd>{minus(summary.insurance)}</dd></div>
     <div><dt>扣繳</dt><dd>{minus(summary.withheld)}</dd></div>
     {summary.otherDeductions?<div><dt>請假、遲到等其他扣項</dt><dd>{minus(summary.otherDeductions)}</dd></div>:null}
     <div className="total"><dt>實領</dt><dd>{summary.netPending?'待確認':money(summary.net)}</dd></div>
     {summary.employer?<div><dt>公司負擔（不扣員工）</dt><dd>{money(summary.employer)}</dd></div>:null}
    </dl>
    <details className="cy-pay-more"><summary>逐日計算依據、法定表版本</summary>
     <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>日期</th><th>項目</th><th>分鐘</th><th>金額</th><th>計算依據</th></tr></thead>
      <tbody>{result.lines.filter(l=>l.amount!==0||l.kind!=='deduction').map((l,i)=><tr key={i}><td data-label="日期">{l.date||'當月'}</td><td data-label="項目" data-priority="title">{l.kind==='employer'?'公司負擔／':''}{l.label}</td><td data-label="分鐘">{l.minutes??'—'}</td><td data-label="金額">{l.kind==='deduction'?'−':''}{money(l.amount)}</td><td data-label="計算依據">{l.detail}</td></tr>)}</tbody></table></div>
     <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>法定表</th><th>版本</th><th>官方來源</th></tr></thead>
      <tbody>{result.ruleVersions.map(v=><tr key={v.id}><td data-label="法定表">{ruleLabels[v.kind]??v.kind}</td><td data-label="版本">{v.id}</td><td data-label="來源"><a href={v.source} target="_blank" rel="noreferrer">官方資料</a></td></tr>)}</tbody></table></div>
     {result.nhiPolicyVersion?<p>補充保費版本 {result.nhiPolicyVersion.id}，生效 {result.nhiPolicyVersion.effectiveDate}；<a href={result.nhiPolicyVersion.source} target="_blank" rel="noreferrer">官方來源</a></p>:null}
    </details>
   </>}
   {editable?<details className="cy-pay-more"><summary>調整計薪天數（月中到職、離職、留職停薪才需要）</summary>
    <p className="cy-pay-muted">{row.run?.paidDays!=null?'目前手動計薪 '+row.run.paidDays+' 天。':'目前依整月計算。'}</p>
    <div className="cy-pay-days-row">{daysControl}{row.run?.paidDays!=null?<button type="button" className="cy-op-button compact" disabled={disabled} onClick={()=>void adjustDays(true)}>恢復整月計算</button>:null}</div>
   </details>:null}
   <details className="cy-pay-more" onToggle={e=>setHistoryOpen((e.currentTarget as HTMLDetailsElement).open)}><summary>歷史快照{row.voidCount?'（'+row.voidCount+'）':''}</summary>
    {history===null?<Loading/>:!history.length?<p className="cy-op-empty">沒有撤回的歷史快照。</p>:
     <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>快照</th><th>應發</th><th>實領</th><th>撤回原因</th><th>時間</th></tr></thead>
      <tbody>{history.map(h=><tr key={h.id}><td data-label="快照">#{h.id}（已撤回）</td><td data-label="應發">{money(h.result.gross)}</td><td data-label="實領">{h.result.issues.length?'待確認':money(h.result.net)}</td><td data-label="撤回原因">{h.reason??'—'}</td><td data-label="時間">{h.updated_at}</td></tr>)}</tbody></table></div>}
   </details>
   <details className="cy-pay-more"><summary>特殊出勤確認紀錄{reviews.length?'（'+reviews.length+'）':''}</summary>
    {!reviews.length?<p className="cy-op-empty">本月沒有特殊出勤確認。</p>:
     <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>日期</th><th>確認內容</th><th>原因</th><th>操作</th></tr></thead>
      <tbody>{reviews.map(r=><tr key={r.work_date}><td data-label="日期">{slashDate(r.work_date)}</td><td data-label="確認內容">{reviewLabels[r.kind]??r.kind}</td><td data-label="原因">{r.reason}</td>
       <td data-label="操作"><button type="button" className="cy-op-button compact" disabled={disabled||!editable} onClick={()=>void editReview(r)}>修改確認</button></td></tr>)}</tbody></table></div>}
   </details>
   <details className="cy-pay-more"><summary>前期已發薪更正</summary><HrPayrollCorrections key={'corrections:'+row.employeeId+':'+month} employeeId={row.employeeId} month={month} refreshToken={revision}/></details>
   <details className="cy-pay-more"><summary>法定假別計薪基準</summary><HrPayrollLegalCases key={'legal:'+row.employeeId+':'+month} employeeId={row.employeeId} month={month}/></details>
  </section>
  <footer className="cy-pay-actions">
   {status==='paid'?<span className="cy-pay-muted">已發薪，唯讀。</span>:null}
   {!row.run?<button type="button" className="cy-op-button primary" disabled={disabled||!row.hasSalary} onClick={()=>void calculate()}>計算</button>:null}
   {row.run?.status==='draft'?<><button type="button" className="cy-op-button" disabled={disabled} onClick={()=>void calculate()}>重新計算</button>
    <button type="button" className="cy-op-button primary" disabled={disabled||!!issues.length||stale||!full} onClick={()=>void transition('confirm')}>確認薪資</button></>:null}
   {row.run?.status==='confirmed'?<><button type="button" className="cy-op-button" disabled={disabled||!full} onClick={()=>void reopen()}>撤回確認</button>
    <button type="button" className="cy-op-button primary" disabled={disabled||!full} onClick={()=>void markPaid()}>標記已發薪</button></>:null}
  </footer>
  {profileOpen?<ProfileEditor employeeId={row.employeeId} month={month} onSaved={()=>{notify('已保存計薪／投保設定，重新計算中');void calculate({auto:true});}} onClose={()=>setProfileOpen(false)}/>:null}
 </aside>;
}
