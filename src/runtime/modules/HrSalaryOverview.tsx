import {useEffect,useMemo,useState} from "react";
import "./hr-payroll-flow.css";
import {StatusChip} from "../../ui/primitives/StatusChip";
import {ProfileEditor} from "./HrPayrollProfileEditor";
import {profileSummary,type ProfileSettings} from "./hr-payroll-flow";
import {apiRequest} from "../../api/client";
import {formatDate} from "../../ui/foundation/format";
import {Loading} from "../../ui/feedback/Loading";
import {DataViewToolbar} from "../../ui/data/DataViewToolbar";
import {ExpandToggle} from "../../ui/data/ExpandToggle";
import type {HrPaymentType,HrStatus} from "../../../shared/hr";
import {taipeiToday} from "../../../shared/erp-query-history";

interface Allowance {item_name:string;amount:number;is_regular:number}
interface SalaryRecord {id:number;effective_date:string;payment_type:HrPaymentType;base_amount:number;reason:string;
 created_by_name:string|null;allowances:Allowance[]}
interface SalaryEmployee {id:number;employeeNo:string;name:string;storeId:number|null;storeName:string|null;
 jobTitle:string|null;status:HrStatus;salaryRecords:SalaryRecord[]}
const money=(value:number)=>"$"+(value||0).toLocaleString("zh-TW");
const total=(row:SalaryRecord)=>row.base_amount+row.allowances.reduce((sum,x)=>sum+x.amount,0);
const allowanceTotal=(row:SalaryRecord)=>row.allowances.reduce((sum,x)=>sum+x.amount,0);
const todaySalary=(row:SalaryEmployee,today:string)=>row.salaryRecords.find(s=>s.effective_date<=today)??null;
const types:{value:HrStatus;label:string}[]=[
 {value:"active",label:"在職"},{value:"probation",label:"試用"},
 {value:"leave",label:"留職停薪"},{value:"terminated",label:"離職"}];
function Allowances({items}:{items:Allowance[]}){
 return items.length?<div className="cy-hr-salary-allowances">{items.map((a,i)=>
  <span key={i} className="cy-hr-salary-chip">{a.item_name} {money(a.amount)}{a.is_regular?"":"（非經常性）"}</span>
 )}</div>:<span>—</span>;
}
interface ProfileRow {id:number;effective_date:string;settings_json:string}
/** 展開列右欄：員工目前生效的計薪／投保設定摘要；展開時才讀一次，不在清單上逐人讀取。 */
function ProfileSummary({employeeId,version,today}:{employeeId:number;version:number;today:string}){
 const [state,setState]=useState<{loading:boolean;error:string;effective:string|null;settings:ProfileSettings|null}>({loading:true,error:"",effective:null,settings:null});
 useEffect(()=>{
  const ctrl=new AbortController();setState(s=>({...s,loading:true,error:""}));
  apiRequest<ProfileRow[]>("/api/business/hr/payroll/profiles/"+employeeId,{signal:ctrl.signal}).then(rows=>{
   if(ctrl.signal.aborted)return;const active=rows.find(r=>r.effective_date<=today)??null;
   setState({loading:false,error:"",effective:active?.effective_date??null,settings:active?JSON.parse(active.settings_json) as ProfileSettings:null});
  }).catch(e=>{if(!ctrl.signal.aborted)setState({loading:false,error:e instanceof Error?e.message:"讀取計薪／投保設定失敗",effective:null,settings:null})});
  return()=>ctrl.abort();
 },[employeeId,version,today]);
 return <div className="cy-hr-salary-profile">
  <h4>計薪／投保設定{state.effective?"（"+formatDate(state.effective)+" 起）":""}</h4>
  {state.loading?<Loading/>:state.error?<p role="alert" className="cy-op-notice danger">{state.error}</p>:!state.settings?<p className="cy-op-empty">尚未建立計薪／投保設定，請按「計薪／投保」。</p>:
   <dl className="cy-hr-salary-facts">{profileSummary(state.settings).map(f=><div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>}
 </div>;
}
/** 員工薪資一覽：一行排完，細節放展開；調薪沿用既有薪資紀錄視窗，計薪／投保設定視窗也在這裡開啟。 */
export function HrSalaryOverview({onRaise,refreshToken}:{onRaise:(id:number,name:string)=>void;refreshToken:number}){
 const [records,setRecords]=useState<SalaryEmployee[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 const [search,setSearch]=useState(""),[store,setStore]=useState(""),[status,setStatus]=useState("active");
 const [expanded,setExpanded]=useState<Set<number>>(new Set());
 const [profileFor,setProfileFor]=useState<{id:number;name:string}|null>(null),[profileVersion,setProfileVersion]=useState(0),[notice,setNotice]=useState("");
 useEffect(()=>{
  const ctrl=new AbortController();
  setLoading(true);
  apiRequest<SalaryEmployee[]>("/api/business/hr/salary-overview",{signal:ctrl.signal}).then(v=>{
   if(!ctrl.signal.aborted){setRecords(v);setError("")}
  }).catch(e=>{if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:"讀取薪資總覽失敗")})
   .finally(()=>{if(!ctrl.signal.aborted)setLoading(false)});
  return()=>ctrl.abort();
 },[refreshToken]);
 const today=taipeiToday();
 const stores=useMemo(()=>[...new Map(records.filter(x=>x.storeId!==null).map(x=>[String(x.storeId),x.storeName??"未指定"])).entries()], [records]);
 const shown=useMemo(()=>records.filter(row=>
  (!status||row.status===status)&&(!store||String(row.storeId)===store)&&
  (!search.trim()||(row.employeeNo+" "+row.name).toLowerCase().includes(search.toLowerCase().trim()))
 ),[records,search,store,status]);
 const activeCount=shown.filter(x=>x.status==="active").length;
 const monthlySum=shown.reduce((sum,row)=>{
  const current=todaySalary(row,today);
  return sum+(row.status==="active"&&current?.payment_type==="monthly"?total(current):0);
 },0);
 const filters=<div className="cy-hr-salary-filters">
   <select aria-label="薪資門市篩選" className="cy-op-input" value={store} onChange={e=>setStore(e.target.value)}>
    <option value="">全部門市</option>{stores.map(([id,name])=><option key={id} value={id}>{name}</option>)}
   </select>
   <select aria-label="薪資狀態篩選" className="cy-op-input" value={status} onChange={e=>setStatus(e.target.value)}>
    <option value="">全部狀態</option>{types.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
   </select>
  </div>;
 const summary="在職 "+activeCount+" 人・月薪合計 "+money(monthlySum)+"（含津貼，不含時薪人員）";
 const toggle=(id:number)=>setExpanded(prev=>{
  const next=new Set(prev);if(next.has(id))next.delete(id);else next.add(id);return next;
 });
 return <section className="cy-op-module cy-hr-salary" aria-label="薪資設定">
  <DataViewToolbar searchValue={search} onSearchChange={setSearch} searchLabel="搜尋員工"
    searchPlaceholder="搜尋員工編號、姓名" filters={filters}
    activeFilterCount={Number(Boolean(store))+Number(status!=="active")}
    resultSummary={summary}/>

  {error?<p className="cy-op-notice danger" role="alert">{error}</p>:null}{notice?<p className="cy-op-notice" role="status">{notice}</p>:null}
  {loading?<Loading/>:<div className="cy-op-table-wrap" role="region" aria-label="員工目前薪資" tabIndex={0}>
    <table className="cy-op-table cy-rt cy-rt-list cy-hr-salary-table">
      <thead><tr><th>員工</th><th>門市・職稱</th><th>計薪</th><th className="num">月薪合計</th><th>生效日</th><th className="cy-hr-salary-mobile-meta">手機摘要</th><th className="cy-hr-salary-actions-head">操作</th></tr></thead>
      {shown.map(row=>{
       const current=todaySalary(row,today),open=expanded.has(row.id),hourly=current?.payment_type==="hourly";
       return <tbody key={row.id} className="cy-hr-salary-group">
        <tr>
         <td data-label="員工" data-priority="title"><strong>{row.name}</strong> <small className="cy-hr-salary-no">{row.employeeNo}</small></td>
         <td data-label="門市・職稱" data-priority="hide">{row.storeName??"—"}・{row.jobTitle??"—"}</td>
         <td data-label="計薪" data-priority="hide">{!current?<StatusChip tone="warning">未設定</StatusChip>:hourly?"時薪":"月薪"}</td>
         <td data-label="月薪合計" data-rt="end" className="num">{!current?"—":hourly?<strong>{money(current.base_amount)}</strong>:<><strong>{money(total(current))}</strong><small className="cy-hr-salary-sub"> 本薪 {current.base_amount.toLocaleString("zh-TW")}＋津貼 {allowanceTotal(current).toLocaleString("zh-TW")}</small></>}{hourly?<small className="cy-hr-salary-sub"> /時</small>:null}</td>
         <td data-label="生效日" data-priority="hide">{current?formatDate(current.effective_date):"—"}</td>
         <td data-rt="meta">{row.storeName??"未設定門市"}・{row.jobTitle??"—"}・{current?hourly?"時薪":"月薪":"未設定薪資"}</td>
         <td data-label="操作" data-rt="action" className="cy-hr-salary-actions">
          <button type="button" className={"cy-op-button"+(current?" soft":" primary")} onClick={()=>onRaise(row.id,row.name)}>{current?"調薪":"設定薪資"}</button>
          <button type="button" className="cy-op-button soft" onClick={()=>{setNotice("");setProfileFor({id:row.id,name:row.name})}}>計薪／投保</button>
          <ExpandToggle expanded={open} onToggle={()=>toggle(row.id)} label={row.name+"薪資紀錄與計薪／投保設定"}/>
         </td>
        </tr>
        {open?<tr className="cy-table-expansion cy-hr-salary-history-row"><td colSpan={7} data-priority="wide">
          <div className="cy-hr-salary-expansion">
           <div>
            <h4>薪資紀錄</h4>
            {row.salaryRecords.length?<table className="cy-op-table cy-rt cy-hr-salary-history">
             <thead><tr><th>生效日</th><th>計薪</th><th className="num">本薪</th><th>津貼</th><th>原因</th></tr></thead>
             <tbody>{row.salaryRecords.map(record=><tr key={record.id}>
              <td data-label="生效日">{formatDate(record.effective_date)}</td>
              <td data-label="計薪">{record.payment_type==="hourly"?"時薪":"月薪"}</td>
              <td data-label="本薪" className="num">{money(record.base_amount)}{record.payment_type==="hourly"?"/時":""}</td>
              <td data-label="津貼" data-priority="wide"><Allowances items={record.allowances}/></td>
              <td data-label="原因">{record.reason}</td>
             </tr>)}</tbody>
            </table>:<p className="cy-op-empty">尚無歷次薪資紀錄。</p>}
           </div>
           <ProfileSummary employeeId={row.id} version={profileVersion} today={today}/>
          </div>
         </td></tr>:null}
       </tbody>;
      })}
    </table>
    {!shown.length?<p className="cy-op-empty">沒有符合條件的員工。</p>:null}
   </div>}
  {profileFor?<ProfileEditor employeeId={profileFor.id} month={today.slice(0,7)} onSaved={()=>{setProfileVersion(v=>v+1);setNotice(profileFor.name+" 的計薪／投保設定已新增生效版本；已有草稿的月份請在每月薪資重新計算")}} onClose={()=>setProfileFor(null)}/>:null}
 </section>;
}
