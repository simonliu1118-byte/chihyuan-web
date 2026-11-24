import {MonthPicker} from "../../ui/forms/MonthPicker";
import {useEffect,useState,type ReactNode} from "react";
import {apiRequest} from "../../api/client";
import type {AuthSession} from "../../auth/auth-client";
import {SelfServicePanel,type AccountCells} from "../../identity/SharedIdentityPage";
import {ModuleSections} from "../../ui/mobile/ModuleSections";
import {useCompactLayout} from "../../ui/foundation/useCompactLayout";
import {RecordSheet,RecordRows,type RowColumn} from "../../ui/forms/RecordSheet";
import {useLatestRequest} from "../../ui/foundation/useLatestRequest";
import {Loading} from "../../ui/feedback/Loading";
import {formatDate} from "../../ui/foundation/format";
import {taipeiToday} from "../../../shared/erp-query-history";
import "./my-profile.css";

/** 我的資料 (V0.21.1): the signed-in person's own HR records, read only; password／Email sit beside 員工編號 in 基本資料. */
type Tab="profile"|"leave"|"salary";
const TABS:readonly {key:Tab;label:string}[]=[{key:"profile",label:"基本資料"},{key:"leave",label:"假勤"},{key:"salary",label:"薪資"}];
interface Profile {
 bound:true;
 employee:{employee_no:string;name:string;status:string;gender:string|null;birth_date:string|null;mobile:string|null;phone:string|null;
  mailing_address:string|null;registered_address:string|null;hire_date:string;seniority_start_date:string|null;employment_type:string;
  nationalIdMasked:string|null;store_name:string|null;job_title:string|null};
 contacts:{name:string;relationship:string|null;phone:string}[];
 education:{school:string;department:string|null;start_month:string|null;end_month:string|null}[];
 statusChanges:{effective_date:string;previous_status:string;next_status:string}[];
 salaries:{effectiveDate:string;paymentType:"monthly"|"hourly";baseAmount:number;allowances:{name:string;amount:number;regular:boolean}[]}[];
 insurance:null|{effectiveDate:string;laborEnabled:boolean;employmentInsurance:boolean;laborBasis:number;healthEnabled:boolean;healthBasis:number;dependents:number;
  pensionEnabled:boolean;pensionBasis:number;pensionEmployerRate:number;pensionSelfRate:number;taxDependents:number};
 payslips:{month:string;payDate:string;status:"confirmed"|"paid";gross:number;deductions:number;net:number;lines:{kind:"earning"|"deduction";label:string;amount:number;date:string|null}[]}[];
}
interface Leave {
 year:number;metrics:{name:string;code:string;usedMinutes:number;limitMinutes:number|null}[];
 annual:{periodStart:string;periodEnd:string;entitledMinutes:number;remainingMinutes:number}[];
 comp:{balanceMinutes:number;credits:{expiresOn:string;remainingMinutes:number;expiringSoon:boolean}[]};
 records:{workDate:string;type:string;minutes:number;wholeDay:boolean;startTime:string|null;endTime:string|null}[];
}
interface Attendance {
 month:string;totals:{workedMinutes:number;lateCount:number;lateMinutes:number;missingCard:number;absent:number;overtimeMinutes:number};
 days:{date:string;code:string|null;kind:string|null;in1:string|null;out1:string|null;in2:string|null;out2:string|null;workedMinutes:number;lateMinutes:number;earlyMinutes:number;anomalies:string[];overtimeMinutes:number}[];
}
type Salary=Profile["salaries"][number];
type Allowance=Salary["allowances"][number];
type Line=Profile["payslips"][number]["lines"][number];
const STATUS:Record<string,string>={probation:"試用",active:"在職",leave:"留職停薪",terminated:"離職"};
const EMPLOYMENT:Record<string,string>={full:"正職",half:"半職",casual:"兼職"};
const WEEK="日一二三四五六";
const money=(n:number)=>n.toLocaleString("zh-TW");
const noop=()=>undefined;
/** 480 minutes is one leave day, matching the HR leave ledger. */
function duration(minutes:number):string{
 if(!minutes)return "0";
 const days=Math.floor(minutes/480),rest=minutes%480,hours=Math.floor(rest/60),mins=rest%60;
 return [days?days+" 天":"",hours?hours+" 小時":"",mins?mins+" 分":""].filter(Boolean).join(" ");
}
const clock=(minutes:number)=>minutes?Math.floor(minutes/60)+"h"+(minutes%60?String(minutes%60).padStart(2,"0")+"m":""):"—";
const day=(value:string)=>value.slice(5).replace("-","/")+"（"+WEEK[new Date(value+"T00:00:00Z").getUTCDay()]+"）";
function rows<T>(title:string,columns:RowColumn<T>[],data:readonly T[],key:(row:T,index:number)=>string|number){
 return <RecordRows title={title} editing={false} columns={columns} rows={data} rowKey={key} onInsert={noop} onRemove={noop}/>;
}
/** 員工編號｜密碼｜Email on one six-column row (user 2026-11-16). */
const accountRow=(employeeNo:string,cells:AccountCells)=>({columns:"repeat(6,minmax(0,1fr))",cells:[
 {label:"員工編號",view:employeeNo,mono:true},{label:"密碼",view:cells.password,span:2},{label:"Email",view:cells.email,span:3}]});
const col=<T,>(label:string,view:(row:T)=>ReactNode,width?:string):RowColumn<T>=>({label,view,width,edit:()=><span/>});

export function MyProfilePage({session}:{session:AuthSession}){
 const compact=useCompactLayout(),[tab,setTab]=useState<Tab>("profile");
 const [profile,setProfile]=useState<Profile|{bound:false}|null>(null),[error,setError]=useState("");
 useEffect(()=>{const c=new AbortController();
  void apiRequest<Profile|{bound:false}>("/api/business/hr/me",{signal:c.signal}).then(r=>{if(!c.signal.aborted)setProfile(r)})
   .catch(e=>{if(!c.signal.aborted){setProfile({bound:false});setError(e instanceof Error?e.message:String(e));}});
  return ()=>c.abort();},[]);
 if(!profile)return <Loading/>;
 // Without an HR record only the account row is shown: 員工編號, 密碼, Email.
 if(!profile.bound)return <div className="cy-my-profile">
  {error?<p role="alert" className="cy-op-notice danger">{error}</p>:<p className="cy-my-profile-unbound">帳號尚未綁定人事資料</p>}
  <section className="cy-op-panel cy-my-profile-stack"><SelfServicePanel session={session} render={cells=><RecordSheet label="帳號" editing={false} rows={[accountRow(session.user.employeeNo,cells)]}/>}/></section>
 </div>;
 return <div className="cy-my-profile">
  {compact?<ModuleSections label="我的資料" sections={TABS} value={tab} onChange={setTab}/>
   :<div className="cy-op-tabs" role="tablist" aria-label="我的資料">
    {TABS.map(t=><button key={t.key} type="button" role="tab" aria-selected={tab===t.key} className={tab===t.key?"active":""} onClick={()=>setTab(t.key)}>{t.label}</button>)}
   </div>}
  {tab==="profile"?<SelfServicePanel session={session} render={cells=><ProfileTab profile={profile} account={cells}/>}/>
   :tab==="leave"?<LeaveTab since={profile.employee.seniority_start_date||profile.employee.hire_date}/>:<SalaryTab profile={profile}/>}
 </div>;
}

function LeaveTab({since}:{since:string}){
 const today=taipeiToday(),[year,setYear]=useState(+today.slice(0,4)),[month,setMonth]=useState(today.slice(0,7));
 const [leave,setLeave]=useState<Leave|null>(null),[attendance,setAttendance]=useState<Attendance|null>(null),[error,setError]=useState("");
 const leaveRequest=useLatestRequest(String(year)),attendanceRequest=useLatestRequest(month);
 useEffect(()=>{const t=leaveRequest.begin();setLeave(null);
  void apiRequest<Leave>("/api/business/hr/me/leave?year="+year).then(r=>{if(t.current()){setLeave(r);setError("")}}).catch(e=>{if(t.current())setError(String(e instanceof Error?e.message:e))});},[year]);
 useEffect(()=>{const t=attendanceRequest.begin();setAttendance(null);
  void apiRequest<Attendance>("/api/business/hr/me/attendance?month="+month).then(r=>{if(t.current()){setAttendance(r);setError("")}}).catch(e=>{if(t.current())setError(String(e instanceof Error?e.message:e))});},[month]);
 type Balance={name:string;remaining:string;used:string;note:string;warn?:boolean};
 const balances:Balance[]=[];
 // 特休／補休 balances are as of today, so they belong to the current year only.
 const thisYear=year===+today.slice(0,4);
 if(leave&&thisYear){
  const annual=leave.annual.filter(a=>a.periodEnd>=today&&a.periodStart<=today||a.remainingMinutes>0&&a.periodEnd>=today);
  for(const a of annual)balances.push({name:"特休",remaining:duration(a.remainingMinutes),used:duration(a.entitledMinutes-a.remainingMinutes),note:formatDate(a.periodStart)+"～"+formatDate(a.periodEnd)});
  const soon=leave.comp.credits.filter(c=>c.expiringSoon).reduce((n,c)=>n+c.remainingMinutes,0),next=leave.comp.credits.map(c=>c.expiresOn).sort()[0];
  balances.push({name:"補休",remaining:duration(leave.comp.balanceMinutes),used:"",note:soon?duration(soon)+" 將於 "+formatDate(next!)+" 到期":next?"最早 "+formatDate(next)+" 到期":"",warn:soon>0});
  // Everyday leave types always; event leave (婚、喪、產…) only once used, so the table stays short.
  for(const m of leave.metrics)if(m.code!=="特"&&m.code!=="補"&&(["事","病","家"].includes(m.code)||m.usedMinutes>0))balances.push({name:m.name,remaining:m.limitMinutes==null?"":duration(Math.max(0,m.limitMinutes-m.usedMinutes)),used:duration(m.usedMinutes),note:m.limitMinutes==null?"":"全年 "+duration(m.limitMinutes)});
 }
 if(leave&&!thisYear)for(const m of leave.metrics)if(m.usedMinutes>0)balances.push({name:m.name,remaining:"",used:duration(m.usedMinutes),note:""});
 return <div className="cy-my-profile-stack">
  {error?<p role="alert" className="cy-op-notice danger">{error}</p>:null}
  <section className="cy-op-panel">
   <div className="cy-my-profile-head"><h2>假期</h2>
    <span className="cy-my-profile-nav"><button type="button" className="cy-op-button" disabled={year<=+since.slice(0,4)} onClick={()=>setYear(year-1)}>上一年</button><strong>{year} 年</strong>
     <button type="button" className="cy-op-button" disabled={year>=+today.slice(0,4)} onClick={()=>setYear(year+1)}>下一年</button></span></div>
   {!leave?<Loading/>:<>
    {rows<Balance>(thisYear?"剩餘假期":"已用假期",[col("假別",r=>r.name,"8em"),col("剩餘",r=>r.remaining,"9em"),col("已用",r=>r.used,"9em"),col("說明",r=><span className={r.warn?"cy-my-profile-warn":undefined}>{r.note}</span>)],balances,(r,i)=>r.name+i)}
    {rows<Leave["records"][number]>("請假紀錄",[col("日期",r=>day(r.workDate),"8em"),col("假別",r=>r.type,"8em"),col("時間",r=>r.wholeDay?"全天":(r.startTime??"")+"～"+(r.endTime??""),"10em"),col("時數",r=>duration(r.minutes))],
     [...leave.records].reverse(),(r,i)=>r.workDate+i)}
   </>}
  </section>
  <section className="cy-op-panel">
   <div className="cy-my-profile-head"><h2>出勤</h2>
    <span className="cy-my-profile-nav"><MonthPicker value={month} min={since.slice(0,7)} max={today.slice(0,7)} onChange={setMonth}/></span></div>
   {!attendance?<Loading/>:<>
    <RecordSheet label="本月出勤統計" editing={false} rows={[{columns:"repeat(5,minmax(0,1fr))",cells:[
     {label:"工時",view:clock(attendance.totals.workedMinutes)},{label:"加班",view:clock(attendance.totals.overtimeMinutes)},
     {label:"遲到",view:attendance.totals.lateCount?attendance.totals.lateCount+" 次（"+attendance.totals.lateMinutes+" 分）":"0"},
     {label:"缺卡",view:String(attendance.totals.missingCard)},{label:"曠職",view:String(attendance.totals.absent)}]}]}/>
    {rows<Attendance["days"][number]>("每日出勤",[col("日期",r=>day(r.date),"8em"),col("班別",r=>r.code??(r.kind==="off"?"休":""),"6em"),
     col("上班",r=>[r.in1,r.in2].filter(Boolean).join("／"),"8em"),col("下班",r=>[r.out1,r.out2].filter(Boolean).join("／"),"8em"),
     col("工時",r=>clock(r.workedMinutes),"6em"),col("異常",r=><span className="cy-my-profile-warn">{[r.lateMinutes?"遲到 "+r.lateMinutes+" 分":"",r.earlyMinutes?"早退 "+r.earlyMinutes+" 分":"",...r.anomalies].filter(Boolean).join("、")}</span>)],
     attendance.days.filter(d=>d.date<=today&&(d.kind||d.in1||d.in2||d.anomalies.length)).reverse(),r=>r.date)}
   </>}
  </section>
 </div>;
}

function SalaryTab({profile}:{profile:Profile}){
 const today=taipeiToday(),current=profile.salaries.find(s=>s.effectiveDate<=today)??null,ins=profile.insurance;
 // Payslips are listed by the month they are paid (user 2026-11-16): in November the one paid in November.
 const thisMonth=today.slice(0,7),paidMonth=(p:Profile["payslips"][number])=>p.payDate.slice(0,7);
 const [month,setMonth]=useState(thisMonth);
 const slip=profile.payslips.find(p=>paidMonth(p)===month)??null;
 const months=[...new Set([thisMonth,...profile.payslips.map(paidMonth)])].sort().reverse();
 const monthLabel=(m:string)=>m.replace("-"," 年 ")+" 月";
 const yes=(on:boolean,v:ReactNode)=>on?v:"未投保";
 return <div className="cy-my-profile-stack">
  <section className="cy-op-panel"><h2>薪資標準</h2>
   {current?<RecordSheet label="目前薪資" editing={false} rows={[{columns:"repeat(4,minmax(0,1fr))",cells:[
    {label:"計薪方式",view:current.paymentType==="monthly"?"月薪":"時薪"},
    {label:current.paymentType==="monthly"?"本薪":"時薪",view:money(current.baseAmount)+" 元"},
    {label:"津貼合計",view:money(current.allowances.reduce((n,a)=>n+a.amount,0))+" 元"},
    {label:"生效日",view:formatDate(current.effectiveDate)}]}]}/>:<p className="cy-my-profile-unbound">尚無薪資資料</p>}
   {current&&current.allowances.length?rows<Allowance>("津貼",[col("項目",a=>a.name),col("金額",a=>money(a.amount)+" 元","10em"),col("經常性",a=>a.regular?"是":"否","6em")],current.allowances,(a,i)=>a.name+i):null}
   {profile.salaries.length>1?rows<Salary>("調薪紀錄",[col("生效日",s=>formatDate(s.effectiveDate),"9em"),col("計薪方式",s=>s.paymentType==="monthly"?"月薪":"時薪","7em"),col("金額",s=>money(s.baseAmount)+" 元")],profile.salaries,s=>s.effectiveDate):null}
  </section>
  <section className="cy-op-panel"><h2>勞健保</h2>
   {ins?<RecordSheet label="勞健保" editing={false} rows={[{columns:"repeat(4,minmax(0,1fr))",cells:[
    {label:"勞保投保薪資",view:yes(ins.laborEnabled,money(ins.laborBasis)+" 元")},{label:"就業保險",view:ins.laborEnabled?(ins.employmentInsurance?"有":"無"):"—"},
    {label:"健保投保金額",view:yes(ins.healthEnabled,money(ins.healthBasis)+" 元")},{label:"健保眷屬",view:ins.healthEnabled?ins.dependents+" 人":"—"}]},
    {columns:"repeat(4,minmax(0,1fr))",cells:[
    {label:"勞退提繳工資",view:yes(ins.pensionEnabled,money(ins.pensionBasis)+" 元")},{label:"雇主提繳",view:ins.pensionEnabled?ins.pensionEmployerRate+"%":"—"},
    {label:"個人自提",view:ins.pensionEnabled?ins.pensionSelfRate+"%":"—"},{label:"生效日",view:formatDate(ins.effectiveDate)}]}]}/>:<p className="cy-my-profile-unbound">尚無投保資料</p>}
  </section>
  <section className="cy-op-panel">
   <div className="cy-my-profile-head"><h2>薪資單</h2>
    <select className="cy-op-input" aria-label="發放月份" value={month} onChange={e=>setMonth(e.target.value)}>
     {months.map(m=><option key={m} value={m}>{monthLabel(m)}發放</option>)}</select></div>
   {!slip?<p className="cy-my-profile-unbound">{monthLabel(month)}薪資單尚未發放</p>:<>
    <RecordSheet label="薪資單" editing={false} rows={[{columns:"repeat(6,minmax(0,1fr))",cells:[
     {label:"薪資月份",view:monthLabel(slip.month)},{label:"發薪日",view:formatDate(slip.payDate)},{label:"狀態",view:slip.status==="paid"?"已發放":"已確認"},
     {label:"應發",view:money(slip.gross)+" 元"},{label:"應扣",view:money(slip.deductions)+" 元"},{label:"實發",view:<strong>{money(slip.net)} 元</strong>}]}]}/>
    {rows<Line>("明細",[col("類別",l=>l.kind==="earning"?"應發":"應扣","6em"),col("項目",l=>l.label),col("日期",l=>l.date?formatDate(l.date):"","9em"),
     col("金額",l=><span className={l.kind==="deduction"?"cy-my-profile-minus":undefined}>{(l.kind==="deduction"?"−":"")+money(l.amount)}</span>,"9em")],
     [...slip.lines.filter(l=>l.kind==="earning"),...slip.lines.filter(l=>l.kind==="deduction")],(l,i)=>l.label+i)}
   </>}
  </section>
 </div>;
}

function ProfileTab({profile,account}:{profile:Profile;account:AccountCells}){
 const e=profile.employee,grid="repeat(6,minmax(0,1fr))";
 return <div className="cy-my-profile-stack">
  <section className="cy-op-panel"><h2>人事資料</h2>
   <RecordSheet label="人事資料" editing={false} rows={[
    accountRow(e.employee_no,account),
    {columns:grid,cells:[{label:"姓名",view:e.name},{label:"身分證字號",view:e.nationalIdMasked,mono:true},{label:"性別",view:e.gender},
     {label:"出生日期",view:e.birth_date?formatDate(e.birth_date):""},{label:"狀態",view:STATUS[e.status]??e.status},{label:"僱用型態",view:EMPLOYMENT[e.employment_type]??e.employment_type}]},
    {columns:grid,cells:[{label:"門市",view:e.store_name},{label:"職稱",view:e.job_title},{label:"到職日",view:formatDate(e.hire_date)},
     {label:"年資起算日",view:e.seniority_start_date?formatDate(e.seniority_start_date):"同到職日"},{label:"手機",view:e.mobile},{label:"市話",view:e.phone}]},
    {columns:grid,cells:[{label:"通訊地址",view:e.mailing_address,span:6}]},
    {columns:grid,cells:[{label:"戶籍地址",view:e.registered_address,span:6}]},
   ]}/>
   {rows<Profile["contacts"][number]>("緊急聯絡人",[col("姓名",c=>c.name),col("關係",c=>c.relationship,"8em"),col("電話",c=>c.phone,"12em")],profile.contacts,(c,i)=>c.name+i)}
   {rows<Profile["education"][number]>("學歷",[col("學校",c=>c.school),col("科系",c=>c.department),col("期間",c=>[c.start_month,c.end_month].filter(Boolean).join("～"),"12em")],profile.education,(c,i)=>c.school+i)}
   {rows<Profile["statusChanges"][number]>("異動紀錄",[col("生效日",c=>formatDate(c.effective_date),"9em"),col("異動",c=>c.previous_status===c.next_status?"建檔（"+(STATUS[c.next_status]??c.next_status)+"）":(STATUS[c.previous_status]??c.previous_status)+" → "+(STATUS[c.next_status]??c.next_status))],profile.statusChanges,(c,i)=>c.effective_date+i)}
  </section>
 </div>;
}
