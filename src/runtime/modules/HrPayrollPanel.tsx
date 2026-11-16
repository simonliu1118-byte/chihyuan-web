import {HrPayrollCorrections} from './HrPayrollCorrections';
import {HrEmployerSupplement} from './HrEmployerSupplement';
import {HrPayrollLegalCases} from './HrPayrollLegalCases';
import {useEffect,useRef,useState,type FormEvent,type ReactElement} from 'react';
import {apiRequest} from '../../api/client';
import {DataViewToolbar} from '../../ui/data/DataViewToolbar';
import {EntryFields,type EntryFieldRow} from '../../ui/forms/EntryFields';
import {DateInput} from '../../ui/forms/DateInput';
import {CheckField} from '../../ui/forms/Field';
import {Dialog} from '../../ui/overlays/Dialog';
import {useLatestRequest} from '../../ui/foundation/useLatestRequest';
import {useNavigationGuard,useUnsavedChangesGuard} from '../../ui/foundation/useUnsavedChangesGuard';
import {enterAdvancesFields} from '../../ui/foundation/enter-advance';
import {taipeiToday} from '../../../shared/erp-query-history';
import type {PayrollProfile,PayrollResult} from '../../../shared/hr-payroll';
import {HrSalaryOverview} from './HrSalaryOverview';
const ROOT='/api/business/hr';
const money=(v:number)=>'$'+v.toLocaleString('zh-TW');
interface Person {id:number;employee_no:string;name:string;hire_date:string}
interface Run {id:number;employee_id:number;employee_no:string;name:string;month:string;pay_date:string;status:string;revision:number;result:PayrollResult}
interface Profile {id:number;effective_date:string;settings_json:string;reason:string}
const ruleLabels:Record<string,string>={labor:'勞保／就保',pension:'勞退',health:'健保',tax:'薪資扣繳'};
const proposedPayday=(month:string)=>new Date(Date.UTC(+month.slice(0,4),+month.slice(5),5)).toISOString().slice(0,10);
interface DayReview {work_date:string;kind:string;reason:string;revision:number}
const statusLabel:Record<string,string>={draft:'草稿',confirmed:'已確認',paid:'已發薪',void:'已撤回'};
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
 ['taxResidence','稅務居住身分','choice'],['taxMethod','本人選擇的扣繳方式','choice'],['taxDependents','已申報配偶及扶養人數','number'],
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
  else if(kind==='choice')content=<select className="cy-sheet-input" disabled={busy||loading} value={draft[key]??''} onChange={e=>change(e.target.value)}><option value="">請選擇</option>{(({taxResidence:[['resident','境內居住者'],['nonresident','非居住者']],taxMethod:[['table','按扣繳稅額表'],['percent','按全月給付總額5%']],taxSalaryKind:[['primary','本職每月給付'],['secondary','兼職所得']],nhiSupplementCategory:[['own','本單位被保險人（含離職後獎金）'],['other','非本單位投保之薪資'],['exempt','依法免扣，另填證明']]} as Record<string,string[][]>)[key]??[]).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select>;
  else if(kind==='date')content=<DateInput disabled={busy||loading} className="cy-sheet-input" value={draft[key]??''} onChange={change}/>;
  else content=<input className="cy-sheet-input" disabled={busy||loading} type={kind==='text'?'text':'number'} min={kind==='text'?undefined:'0'} step={key.toLowerCase().includes('rate')?'0.0001':key.endsWith('Hours')?'0.5':'1'} value={draft[key]??'0'} onChange={e=>change(e.target.value)}/>;
  const optional=['insuredTo','healthTo','pensionTo','attendanceEnabled','bonusOpeningYear','bonusOpeningThrough','bonusOpeningAmount','bonusOpeningReference'].includes(key)||key==='nhiExemptionReference'&&draft.nhiSupplementCategory!=='exempt'||key==='insuredFrom'&&draft.laborEnabled!=='true'||key==='healthFrom'&&draft.healthEnabled!=='true'||key==='pensionFrom'&&draft.pensionEnabled!=='true';
  return {label,required:!optional,content};
 });
 return <Dialog open title="薪資計算／投保設定" size="large" dismissible={!busy&&!loading} onClose={()=>void navigation.canLeave().then(ok=>{if(ok)onClose();})}>
  {error?<p className="cy-op-notice danger" role="alert">{error}</p>:null}
  {!ready&&!loading?<button type="button" className="cy-op-button" onClick={()=>setReadVersion(n=>n+1)}>重新讀取設定</button>:null}
  <p>薪資與津貼取自主檔；此處僅設定全勤、投保事實與本人申報資料。設定按生效日新增歷史，不代辦投保申報。</p>
  <form className="cy-op-form" onKeyDown={enterAdvancesFields} onSubmit={e=>void submit(e)}>
   <EntryFields label="生效設定" columns={2} rows={[{label:'生效日',required:true,content:<DateInput className="cy-sheet-input" disabled={busy||loading} value={at} onChange={v=>{setAt(v);setDirty(true);}}/>},{label:'設定原因',required:true,content:<input className="cy-sheet-input" disabled={busy||loading} value={reason} onChange={e=>{setReason(e.target.value);setDirty(true);}}/>}]}/>
   <EntryFields label="計薪與投保資料" columns={3} rows={controls}/>
   <button className="cy-op-button primary" disabled={busy||loading||!ready}>新增生效設定</button>
  </form>
  <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>生效日</th><th>原因</th></tr></thead><tbody>{history.map(r=><tr key={r.id}><td data-label="生效日">{r.effective_date}</td><td data-label="原因">{r.reason}</td></tr>)}</tbody></table></div>
 </Dialog>;
}
export function HrPayrollPanel(){
 const [month,setMonth]=useState(taipeiToday().slice(0,7)),[payDate,setPayDate]=useState(()=>proposedPayday(taipeiToday().slice(0,7))),[people,setPeople]=useState<Person[]>([]),[cursor,setCursor]=useState<number|null>(null),[employee,setEmployee]=useState(0),[search,setSearch]=useState('');
 const [runs,setRuns]=useState<Run[]>([]),[detail,setDetail]=useState<Run|null>(null),[profileOpen,setProfileOpen]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [bonusAmount,setBonusAmount]=useState('');
 const [paidDays,setPaidDays]=useState(''),[reason,setReason]=useState(''),[reviewDate,setReviewDate]=useState(''),[reviewKind,setReviewKind]=useState('absence');
 const [reviews,setReviews]=useState<DayReview[]>([]),[reviewReady,setReviewReady]=useState(false),[showVoided,setShowVoided]=useState(false);
 const reviewRequest=useLatestRequest(employee+'|'+month);
 async function loadReviews(){const ticket=reviewRequest.begin();setReviewReady(false);if(!employee){setReviews([]);return;}try{const rows=await apiRequest<DayReview[]>(ROOT+'/payroll/reviews/'+employee+'?month='+month);if(ticket.current()){setReviews(rows);setReviewReady(true);}}catch(e){if(ticket.current())setError(e instanceof Error?e.message:'讀取出勤確認失敗');}}
 useEffect(()=>{void loadReviews();},[employee,month]);
 const request=useLatestRequest(month),selection=useLatestRequest(employee+'|'+month),writing=useRef(false),navigation=useNavigationGuard();
 useUnsavedChangesGuard({active:!!(payDate!==proposedPayday(month)||bonusAmount||paidDays||reason||reviewDate),blocked:busy});
 async function loadPeople(append=false){const r=await apiRequest<{items:Person[];nextCursor:number|null}>(ROOT+'/employees?limit=100'+(append&&cursor?'&cursor='+cursor:''));setPeople(p=>append?[...p,...r.items]:r.items);setCursor(r.nextCursor);}
 useEffect(()=>{void loadPeople().catch(e=>setError(String(e)));},[]);
 async function load(){const t=request.begin();try{const rows=await apiRequest<Run[]>(ROOT+'/payroll/runs?month='+month);if(t.current()){setRuns(rows);setError('');}}catch(e){if(t.current()){setRuns([]);setError(e instanceof Error?e.message:'讀取薪資失敗');}}}
 useEffect(()=>{setDetail(null);void load();},[month]);
 async function chooseMonth(value:string){if(busy||!await navigation.canLeave())return;if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(value))return;setPayDate(proposedPayday(value));setBonusAmount('');setPaidDays('');setReason('');setReviewDate('');setMonth(value);}
 async function chooseEmployee(value:number){if(busy||!await navigation.canLeave())return;selection.invalidate();setEmployee(value);setDetail(null);setPayDate(proposedPayday(month));setBonusAmount('');setPaidDays('');setReason('');setReviewDate('');}
 async function run(fn:()=>Promise<void>){if(writing.current)return;writing.current=true;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'薪資操作失敗');}finally{writing.current=false;setBusy(false);}}
 async function calculate(e:FormEvent){e.preventDefault();await run(async()=>{const ticket=selection.begin();const row=await apiRequest<Run>(ROOT+'/payroll/calculate',{method:'POST',json:{employeeId:employee,month,payDate,bonusAmount:bonusAmount?Number(bonusAmount):0,paidDays:paidDays===''?undefined:Number(paidDays),reason}});if(ticket.current()){setDetail(row);setNotice(row.result.issues.length?'已儲存草稿，請先處理待補事項':'已計算，請核對明細再確認');}setPayDate(proposedPayday(month));setBonusAmount('');setPaidDays('');setReason('');await load();});}
 async function open(row:Run){await run(async()=>{const ticket=selection.begin();const r=await apiRequest<Run>(ROOT+'/payroll/runs/'+row.id);if(ticket.current())setDetail(r);});}
 async function transition(action:string){if(!detail)return;await run(async()=>{const r=await apiRequest<Run>(ROOT+'/payroll/runs/'+detail.id,{method:'POST',json:{action,revision:detail.revision,reason}});setDetail(r);setReason('');setNotice('已更新薪資狀態');await load();});}
 async function review(e:FormEvent){e.preventDefault();await run(async()=>{await apiRequest(ROOT+'/payroll/reviews/'+employee,{method:'POST',json:{date:reviewDate,kind:reviewKind,reason,revision:reviews.find(r=>r.work_date===reviewDate)?.revision??0}});await loadReviews();setReviewDate('');setReason('');setNotice('已保存確認原因，請重新計算草稿');});}
 const shown=runs.filter(r=>(showVoided||r.status!=='void')&&(r.employee_no+' '+r.name).includes(search.trim()));
 return <section className="cy-op-module" aria-label="每月薪資">
  <DataViewToolbar searchValue={search} onSearchChange={setSearch} searchLabel="搜尋薪資員工" searchPlaceholder="員工編號、姓名" resultSummary={`${month} 共 ${shown.length} 筆`} filters={<input aria-label="薪資月份" disabled={busy} className="cy-op-input" type="month" min="2000-01" max="2099-12" value={month} onChange={e=>void chooseMonth(e.target.value)}/>}/>
  {error?<p role="alert" className="cy-op-notice danger">{error}</p>:null}{notice?<p role="status" className="cy-op-notice">{notice}</p>:null}
  <p>約定次月5日發薪；給付日期預填5日，遇假日順延後請填實際給付日。</p>
  <form className="cy-op-form" onKeyDown={enterAdvancesFields} onSubmit={e=>void calculate(e)}>
   <EntryFields label="每月薪資計算" columns={3} rows={[
    {label:'員工',required:true,content:<select className="cy-sheet-input" disabled={busy} value={employee||''} onChange={e=>void chooseEmployee(Number(e.target.value))}><option value="">請選擇</option>{people.map(p=><option key={p.id} value={p.id}>{p.employee_no} {p.name}</option>)}</select>},
    {label:'給付日期',required:true,content:<DateInput className="cy-sheet-input" disabled={busy} value={payDate} onChange={setPayDate}/>},
    {label:'本次另發非每月獎金（無則留空）',content:<input className="cy-sheet-input" disabled={busy} type="number" min="0" step="1" value={bonusAmount} onChange={e=>setBonusAmount(e.target.value)}/>},
    {label:'未滿月計薪天數（整月留空）',content:<input className="cy-sheet-input" disabled={busy} type="number" min="0" max="30" step="1" value={paidDays} onChange={e=>setPaidDays(e.target.value)}/>},
    {label:'計算／異動原因',required:paidDays!=='',content:<input className="cy-sheet-input" disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/>},
   ]}/>
   <div className="cy-op-actions"><button className="cy-op-button primary" disabled={busy||!employee}>計算並儲存草稿</button><button type="button" className="cy-op-button" disabled={busy||!employee} onClick={()=>setProfileOpen(true)}>計薪／投保設定</button>{cursor?<button type="button" className="cy-op-button" disabled={busy} onClick={()=>void run(()=>loadPeople(true))}>載入更多員工</button>:null}</div>
  </form>
  <CheckField label="顯示撤回的歷史快照" checked={showVoided} onChange={e=>setShowVoided(e.target.checked)}/>
  <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>員工</th><th>給付日</th><th>應發</th><th>扣項</th><th>實領</th><th>狀態</th><th>待補</th><th>操作</th></tr></thead><tbody>{shown.map(r=><tr key={r.id}><td data-label="員工" data-priority="title">{r.employee_no} {r.name}</td><td data-label="給付日">{r.pay_date}</td><td data-label="應發">{money(r.result.gross)}</td><td data-label="扣項">{money(r.result.deductions)}</td><td data-label="實領"><strong>{r.result.issues.length?'待確認':money(r.result.net)}</strong></td><td data-label="狀態">{statusLabel[r.status]}</td><td data-label="待補">{r.result.issues.length}</td><td data-label="操作"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>void open(r)}>明細</button></td></tr>)}</tbody></table></div>
  {detail?<section className="cy-op-panel"><h3>{detail.employee_no} {detail.name} — {detail.month} 薪資明細</h3>
   <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>日期</th><th>項目</th><th>分鐘</th><th>金額</th><th>計算依據</th></tr></thead><tbody>{detail.result.lines.map((l,i)=><tr key={i}><td data-label="日期">{l.date||'當月'}</td><td data-label="項目" data-priority="title">{l.kind==='employer'?'公司負擔／':''}{l.label}</td><td data-label="分鐘">{l.minutes??'—'}</td><td data-label="金額">{l.kind==='deduction'?'−':''}{money(l.amount)}</td><td data-label="計算依據">{l.detail}</td></tr>)}</tbody></table></div>
   <p>應發 {money(detail.result.gross)}／扣項 {money(detail.result.deductions)}／實領 {detail.result.issues.length?'待確認':money(detail.result.net)}；公司負擔 {money(detail.result.employer)}（不扣員工）。</p>
   {detail.result.issues.length?<div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>待補／待確認事項</th></tr></thead><tbody>{detail.result.issues.map((s,i)=><tr key={i}><td data-label="事項">{s}</td></tr>)}</tbody></table></div>:null}
   <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>法定表</th><th>版本</th><th>官方來源</th></tr></thead><tbody>{detail.result.ruleVersions.map(v=><tr key={v.id}><td data-label="法定表">{ruleLabels[v.kind]??v.kind}</td><td data-label="版本">{v.id}</td><td data-label="來源"><a href={v.source} target="_blank" rel="noreferrer">官方資料</a></td></tr>)}</tbody></table></div>
   {detail.result.nhiPolicyVersion?<p>補充保費版本 {detail.result.nhiPolicyVersion.id}，生效 {detail.result.nhiPolicyVersion.effectiveDate}；<a href={detail.result.nhiPolicyVersion.source} target="_blank" rel="noreferrer">官方來源</a></p>:null}
   <p>狀態：{statusLabel[detail.status]}。確認與發薪標記需要填寫上方原因；標記不會匯款。已發薪快照保留，不隨出勤或新表改寫。</p>
   <div className="cy-op-actions">{detail.status==='draft'?<button type="button" className="cy-op-button primary" disabled={busy||!!detail.result.issues.length||!reason.trim()} onClick={()=>void transition('confirm')}>確認薪資</button>:null}{detail.status==='confirmed'?<><button type="button" className="cy-op-button" disabled={busy||!reason.trim()} onClick={()=>void transition('reopen')}>撤回確認並保留快照</button><button type="button" className="cy-op-button primary" disabled={busy||!reason.trim()} onClick={()=>void transition('pay')}>標記已發薪</button></>:null}</div>
  </section>:null}
  <HrEmployerSupplement month={detail?.pay_date.slice(0,7)||payDate.slice(0,7)||month} refreshToken={detail?.revision??0}/>
  {employee?<HrPayrollCorrections key={employee+month} employeeId={employee} month={month} refreshToken={detail?.revision??0}/>:null}
  {employee?<HrPayrollLegalCases key={employee+month} employeeId={employee} month={month}/>:null}
  <section className="cy-op-panel"><h3>特殊出勤確認</h3><p>缺卡請先至出勤更正。只有已核對的曠班、合法假日調移或例假緊急出勤才在此留下原因，保存後須重算。</p>
   <form className="cy-op-form" onKeyDown={enterAdvancesFields} onSubmit={e=>void review(e)}><EntryFields label="出勤確認" columns={3} rows={[
    {label:'日期',required:true,content:<DateInput disabled={busy} className="cy-sheet-input" value={reviewDate} onChange={setReviewDate}/>},
    {label:'確認類別',required:true,content:<select disabled={busy} className="cy-sheet-input" value={reviewKind} onChange={e=>setReviewKind(e.target.value)}><option value="absence">確認曠班</option><option value="holiday_shifted">國定假日已合法調移</option><option value="regular_emergency">例假法定緊急出勤／補假已核對</option></select>},
    {label:'核對原因',required:true,content:<input disabled={busy} className="cy-sheet-input" value={reason} onChange={e=>setReason(e.target.value)}/>},
   ]}/><button className="cy-op-button" disabled={busy||!employee||!reviewReady}>保存確認原因</button></form>
   {employee&&!reviewReady?<button type="button" className="cy-op-button" disabled={busy} onClick={()=>void loadReviews()}>重新讀取確認紀錄</button>:null}
   <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>日期</th><th>確認內容</th><th>原因</th><th>操作</th></tr></thead><tbody>{reviews.map(r=><tr key={r.work_date}><td data-label="日期">{r.work_date}</td><td data-label="確認內容">{{absence:"確認曠班",holiday_shifted:"假日調移",regular_emergency:"例假緊急出勤"}[r.kind]}</td><td data-label="原因">{r.reason}</td><td data-label="操作"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>{setReviewDate(r.work_date);setReviewKind(r.kind);setReason(r.reason);}}>修改確認</button></td></tr>)}</tbody></table></div>
  </section>
  {profileOpen&&employee?<ProfileEditor employeeId={employee} month={month} onSaved={()=>setNotice('已保存生效設定，請重新計算草稿')} onClose={()=>setProfileOpen(false)}/>:null}
 </section>;
}
export function HrSalaryPanel(props:{onRaise:(id:number,name:string)=>void;refreshToken:number}){
 const [mode,setMode]=useState<'settings'|'monthly'>('settings'),navigation=useNavigationGuard();
 async function change(next:typeof mode){if(next!==mode&&await navigation.canLeave())setMode(next);}
 return <><div className="cy-op-actions"><button type="button" className="cy-op-button" aria-pressed={mode==='settings'} onClick={()=>void change('settings')}>薪資設定</button><button type="button" className="cy-op-button" aria-pressed={mode==='monthly'} onClick={()=>void change('monthly')}>每月薪資</button></div>{mode==='settings'?<HrSalaryOverview {...props}/>:<HrPayrollPanel/>}</>;
}
