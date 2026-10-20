import {useEffect,useState} from "react";
import {apiRequest} from "../../api/client";
import {taipeiToday} from "../../../shared/erp-query-history";

interface AnnualRow{id:number;periodStart:string;periodEnd:string;entitledDays:number;carriedInDays:number;
 usedCarriedDays:number;usedCurrentDays:number;remainingDays:number;expiredUnpaidDays:number;notifiedOn:string|null}
interface CompRow{kind:string;id:number;remainingMinutes:number;expiresOn:string;expiringSoon:boolean;expired:boolean}
interface EmployeeLeaveDetail{annual:AnnualRow[];comp:{overtimeMinutes:number;holidayMinutes:number;holidayAdvanceMinutes:number;credits:CompRow[]}}
export function HrEmployeeLeaveOverview({employeeId,onManage}:{employeeId:number;onManage:()=>void}){
 const [year,setYear]=useState(Number(taipeiToday().slice(0,4)));
 const [data,setData]=useState<EmployeeLeaveDetail|null>(null),[error,setError]=useState("");
 useEffect(()=>{
  let active=true;
  void apiRequest<EmployeeLeaveDetail>("/api/business/hr/employees/"+employeeId+"/leave?year="+year)
    .then(value=>{if(active){setData(value);setError("")}})
    .catch(e=>{if(active){setData(null);setError(e instanceof Error?e.message:"無法取得特休與補休")}});
  return ()=>{active=false};
 },[employeeId,year]);
 return <section className="cy-op-panel cy-hr-employee-leave" aria-label="員工特休與補休帳戶">
  <div className="cy-record-header"><h3>特休年度與補休帳戶</h3>
   <button type="button" className="cy-op-button" onClick={onManage}>管理假單／通知</button></div>
  <label>年度 <input type="number" min="2000" max="2200" className="cy-op-input" value={year} onChange={e=>setYear(Number(e.target.value))}/></label>
  {error?<p role="alert">{error}</p>:null}
  <div className="cy-op-table-wrap"><table className="cy-op-table">
   <thead><tr><th>特休年度</th><th>應給</th><th>遞延進來</th><th>已休</th><th>剩餘</th><th>到期未休</th><th>通知</th></tr></thead>
   <tbody>{data?.annual.map(x=><tr key={x.periodStart}>
    <td>{x.periodStart.replaceAll("-","/")}～{x.periodEnd.replaceAll("-","/")}</td>
    <td>{x.entitledDays} 天</td><td>{x.carriedInDays} 天</td>
    <td>{x.usedCarriedDays+x.usedCurrentDays} 天</td><td>{x.remainingDays} 天</td>
    <td>{x.expiredUnpaidDays} 天</td>
    <td>{x.notifiedOn?.replaceAll("-","/")??"尚未通知"}　<button type="button" className="cy-op-button" onClick={onManage}>列印通知</button></td>
   </tr>)}</tbody>
  </table></div>
  <h4>補休帳戶</h4>
  <p>加班補休：{((data?.comp.overtimeMinutes??0)/60).toFixed(1)} 小時；國定假日換休：{((data?.comp.holidayMinutes??0)/60).toFixed(1)} 小時
   {(data?.comp.holidayAdvanceMinutes??0)>0?"（含預支）":""}</p>
  {data?.comp.credits.map(x=><p key={x.kind+x.id} className={x.expired?"hr-expired":x.expiringSoon?"hr-expiring":""}>
   {x.kind==="holiday"?"國定假日換休":x.kind==="grant"?"管理員給予補休":"加班補休"}　剩餘 {(x.remainingMinutes/60).toFixed(1)} 小時，到期 {x.expiresOn.replaceAll("-","/")}
   {x.expired?"（已到期）":x.expiringSoon?"（即將到期）":""}</p>)}
  <button type="button" className="cy-op-button" onClick={onManage}>查看假單、延長期限與結清</button>
 </section>;
}
