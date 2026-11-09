import {useEffect,useMemo,useState} from "react";
import {apiRequest} from "../../api/client";
import {formatDate} from "../../ui/foundation/format";
import {Loading} from "../../ui/feedback/Loading";
import {DataViewToolbar} from "../../ui/data/DataViewToolbar";
import {useCompactLayout} from "../../ui/foundation/useCompactLayout";
import {StatusChip} from "../../ui/primitives/StatusChip";
import {ExpandToggle} from "../../ui/data/ExpandToggle";
import type {HrPaymentType,HrStatus} from "../../../shared/hr";
import {taipeiToday} from "../../../shared/erp-query-history";

interface Allowance {item_name:string;amount:number;is_regular:number}
interface SalaryRecord {id:number;effective_date:string;payment_type:HrPaymentType;base_amount:number;reason:string;
 created_by_name:string|null;allowances:Allowance[]}
interface SalaryEmployee {id:number;employeeNo:string;name:string;storeId:number|null;storeName:string|null;
 jobTitle:string|null;status:HrStatus;salaryRecords:SalaryRecord[]}
const money=(value:number)=>"$"+value.toLocaleString("zh-TW");
const total=(row:SalaryRecord)=>row.base_amount+row.allowances.reduce((sum,x)=>sum+x.amount,0);
const month=(row:SalaryRecord|null)=>row&&row.payment_type==="monthly"?money(total(row)):"—";
const todaySalary=(row:SalaryEmployee,today:string)=>row.salaryRecords.find(s=>s.effective_date<=today)??null;
const types:{value:HrStatus;label:string}[]=[
 {value:"active",label:"在職"},{value:"probation",label:"試用"},
 {value:"leave",label:"留職停薪"},{value:"terminated",label:"離職"}];
function Allowances({items}:{items:Allowance[]}){
 return items.length?<div className="cy-hr-salary-allowances">{items.map((a,i)=>
  <span key={i} className="cy-hr-salary-chip">{a.item_name} {money(a.amount)}{a.is_regular?"":"（非經常性）"}</span>
 )}</div>:<span>—</span>;
}
/** A read-only employee salary overview; only a raise opens the existing salary-record mutation dialog. */
export function HrSalaryOverview({onRaise,refreshToken}:{onRaise:(id:number,name:string)=>void;refreshToken:number}){
 const compact=useCompactLayout();
 const [records,setRecords]=useState<SalaryEmployee[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 const [search,setSearch]=useState(""),[store,setStore]=useState(""),[status,setStatus]=useState("active");
 const [expanded,setExpanded]=useState<Set<number>>(new Set());
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
 const summary="在職 "+activeCount+" 人・月薪合計 "+money(monthlySum)+"（不含時薪人員）";
 const toggle=(id:number)=>setExpanded(prev=>{
  const next=new Set(prev);if(next.has(id))next.delete(id);else next.add(id);return next;
 });
 return <section className="cy-op-module cy-hr-salary" aria-label="薪資總覽">
  {compact?<DataViewToolbar searchValue={search} onSearchChange={setSearch} searchLabel="搜尋員工"
    searchPlaceholder="搜尋員工編號、姓名" filters={filters}
    activeFilterCount={Number(Boolean(store))+Number(status!=="active")}
    resultSummary={summary}/>
   :<div className="cy-md-toolbar cy-hr-salary-toolbar">
     <input type="search" aria-label="搜尋員工" className="cy-op-input" value={search}
       placeholder="搜尋員工編號、姓名" onChange={e=>setSearch(e.target.value)}/>
     {filters}<strong className="cy-hr-salary-summary">{summary}</strong>
    </div>}
  {error?<p className="cy-op-notice danger" role="alert">{error}</p>:null}
  {loading?<Loading/>:<div className="cy-op-table-wrap" role="region" aria-label="員工目前薪資" tabIndex={0}>
    <table className="cy-op-table cy-rt cy-rt-list cy-hr-salary-table">
      <thead><tr><th>員工編號</th><th>姓名</th><th>門市</th><th>職稱</th><th>計薪</th>
        <th className="num">本薪</th><th>津貼</th><th className="num">月合計</th><th>生效日</th>
        <th className="cy-hr-salary-mobile-meta">手機摘要</th><th>操作</th></tr></thead>
      <tbody>{shown.map(row=>{
       const current=todaySalary(row,today),open=expanded.has(row.id);
       const headline=current?current.payment_type==="hourly"?money(current.base_amount)+" /時":money(current.base_amount):"—";
       return <tbody key={row.id} className="cy-hr-salary-group">
        <tr>
         <td data-label="員工編號" data-priority="hide" className="cy-mono">{row.employeeNo}</td>
         <td data-label="姓名" data-priority="title"><strong>{row.name}</strong><small className="cy-hr-salary-number">{row.employeeNo}</small></td>
         <td data-label="門市" data-priority="hide">{row.storeName??"—"}</td>
         <td data-label="職稱" data-priority="hide">{row.jobTitle??"—"}</td>
         <td data-label="計薪" data-priority="hide">{!current?"—":current.payment_type==="hourly"?"時薪":"月薪"}</td>
         <td data-label="本薪" data-priority="hide" className="num">{headline}</td>
         <td data-label="津貼" data-priority="hide">{current?<Allowances items={current.allowances}/>: "—"}</td>
         <td data-label="月合計" data-rt="end" className="num">{month(current)}</td>
         <td data-label="生效日" data-priority="hide">{current?formatDate(current.effective_date):"—"}</td>
         <td data-rt="meta">{row.storeName??"未設定門市"}・{current?current.payment_type==="hourly"?"時薪 "+headline:"本薪 "+headline:"未設定薪資"}
            {current?.allowances.length?"・津貼 "+money(current.allowances.reduce((sum,x)=>sum+x.amount,0)):""}</td>
         <td data-label="操作" data-rt="action">
          <button type="button" className="cy-op-button soft" onClick={()=>onRaise(row.id,row.name)}>調薪</button>
          <button type="button" className="cy-op-button soft" aria-expanded={open}
            onClick={()=>toggle(row.id)}>{open?"收起":"歷次"}</button>
         </td>
        </tr>
        {open?<tr className="cy-hr-salary-history-row"><td colSpan={11} data-priority="wide">
          {row.salaryRecords.length?<div className="cy-op-table-wrap">
           <table className="cy-op-table cy-rt cy-hr-salary-history">
            <thead><tr><th>生效日</th><th>計薪</th><th className="num">本薪</th><th>津貼</th><th>原因</th><th>登記人</th></tr></thead>
            <tbody>{row.salaryRecords.map(record=><tr key={record.id}>
             <td data-label="生效日">{formatDate(record.effective_date)}</td>
             <td data-label="計薪">{record.payment_type==="hourly"?"時薪":"月薪"}</td>
             <td data-label="本薪" className="num">{money(record.base_amount)}{record.payment_type==="hourly"?"/時":""}</td>
             <td data-label="津貼" data-priority="wide"><Allowances items={record.allowances}/></td>
             <td data-label="原因">{record.reason}</td>
             <td data-label="登記人">{record.created_by_name??"—"}</td>
            </tr>)}</tbody>
           </table>
          </div>:<p className="cy-op-empty">尚無歷次薪資紀錄。</p>}
         </td></tr>:null}
       </tbody>;
      })}</tbody>
    </table>
    {!shown.length?<p className="cy-op-empty">沒有符合條件的員工。</p>:null}
   </div>}
 </section>;
}
