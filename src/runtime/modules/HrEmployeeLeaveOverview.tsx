import {useEffect,useState} from "react";
import {apiRequest} from "../../api/client";
import {taipeiToday} from "../../../shared/erp-query-history";
import {RelatedCard} from "../../ui/records/RelatedCard";

interface AnnualRow{periodStart:string;periodEnd:string;entitledMinutes:number;remainingMinutes:number;partTime:boolean}
interface Advance{holidayDate:string;holidayName:string;outstandingMinutes:number}
interface EmployeeLeaveDetail{annual:AnnualRow[];pending:unknown[];comp:{balanceMinutes:number;advances:Advance[];credits:{expired:boolean;expiringSoon:boolean;remainingMinutes:number}[]}}
const hrs=(m:number)=>(Math.round(m/30)/2).toFixed(1);
const amount=(m:number,part:boolean)=>part?hrs(m)+" 小時":String(Math.round(m/240)/2)+" 天";
/** People-page summary of annual leave and comp time; the leave tab holds the details and actions. */
export function HrEmployeeLeaveOverview({employeeId,onManage}:{employeeId:number;onManage:()=>void}){
 const [data,setData]=useState<EmployeeLeaveDetail|null>(null),[error,setError]=useState("");
 useEffect(()=>{
  let active=true;
  void apiRequest<EmployeeLeaveDetail>("/api/business/hr/employees/"+employeeId+"/leave?year="+taipeiToday().slice(0,4))
   .then(value=>{if(active){setData(value);setError("")}})
   .catch(e=>{if(active){setData(null);setError(e instanceof Error?e.message:"無法取得特休與補休")}});
  return ()=>{active=false};
 },[employeeId]);
 const current=data?.annual.at(-1),owed=data?.comp.advances.filter(a=>a.outstandingMinutes>0)??[];
 const warn=data?.comp.credits.filter(c=>c.remainingMinutes>0&&(c.expired||c.expiringSoon)).length??0;
 return <RelatedCard title="特休與補休" count={current?"本年度":"0"} empty={error||"尚未滿 6 個月，尚無特休。"}
  summary={current?<strong>特休剩 {amount(current.remainingMinutes,current.partTime)}（共 {amount(current.entitledMinutes,current.partTime)}）</strong>:null}
  rows={data?[
   <span key="comp">補休餘額 {hrs(data.comp.balanceMinutes)} 小時{warn?"，"+warn+" 筆快到期或已到期":""}</span>,
   ...owed.map(a=><span key={a.holidayDate}>預支 −{hrs(a.outstandingMinutes)} 小時（{a.holidayName}）</span>),
   ...(data.pending.length?[<span key="pending">待補假單 {data.pending.length} 張</span>]:[])
  ]:[]}
  onView={onManage} />;
}
