import { useState } from "react";
import type { D1UsageReport, UsageLevel } from "../../shared/cloudflare-usage";
import { usageLevel, usageRatio } from "../../shared/cloudflare-usage";
import { Loading } from "../ui/feedback/Loading";

export interface CloudflareUsagePanelProps {
  report: D1UsageReport | null;
  error: string | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
}
const number=(value:number)=>value.toLocaleString("zh-TW",{maximumFractionDigits:0});
const percent=(count:number,limit:number)=>(usageRatio(count,limit)*100).toFixed(1)+"%";
const localTime=(iso:string)=>new Intl.DateTimeFormat("zh-TW",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Taipei"}).format(new Date(iso));
function Meter({label,used,limit}:{label:string;used:number;limit:number}){
 const ratio=usageRatio(used,limit);
 const level:UsageLevel=usageLevel(used,0,{rowsReadPerDay:limit,rowsWrittenPerDay:0});
 return <div className="cy-usage-meter">
   <div className="cy-usage-meter-label"><strong>{label}</strong><span>{number(used)} / {number(limit)} 列（{percent(used,limit)}）</span></div>
   <progress aria-label={label+"用量"} className={"cy-usage-progress cy-usage-progress-"+level} max={100} value={Math.min(100,ratio*100)}/>
 </div>;
}
export function CloudflareUsagePanel({report,error,loading,onRefresh}:CloudflareUsagePanelProps){
 const [refreshing,setRefreshing]=useState(false);
 async function refresh(){
   if(refreshing)return;
   setRefreshing(true);
   try { await onRefresh(); } finally { setRefreshing(false); }
 }
 const used=report?.today.databases.filter(db=>db.rowsRead>0||db.rowsWritten>0)??[];
 const idle=report?.today.databases.filter(db=>db.rowsRead===0&&db.rowsWritten===0)??[];
 return <section className="cy-op-panel cy-usage-panel" id="cy-cloudflare-usage" aria-label="Cloudflare D1 用量">
   <div className="cy-op-panel-header"><h3>D1 用量巡檢</h3>
     <button type="button" className="cy-op-button" disabled={loading||refreshing}
       onClick={()=>void refresh()}>重新整理</button>
   </div>
   <p className="cy-identity-intro">監控整個 Cloudflare 帳號的 D1 資料庫。每日 08:00（台灣時間）重置。</p>
   {error==="USAGE_NOT_CONFIGURED"?<p className="cy-notice cy-notice-warning">尚未設定用量查詢憑證。</p>
     : error?<p className="cy-notice cy-notice-warning">目前無法讀取 Cloudflare 用量，請稍後重試。</p>:null}
   {!report && loading?<Loading/>:null}
   {report?<>
     <p className="cy-identity-intro">資料時間 {localTime(report.fetchedAt)}（台灣時間）／今日為 UTC {report.today.date}</p>
     <div className="cy-usage-meters">
       <Meter label="今日讀取" used={report.today.rowsRead} limit={report.limits.rowsReadPerDay}/>
       <Meter label="今日寫入" used={report.today.rowsWritten} limit={report.limits.rowsWrittenPerDay}/>
     </div>
     <h4>各資料庫今日用量</h4>
     <div className="cy-op-table-wrap"><table className="cy-op-table">
       <thead><tr><th>資料庫</th><th>讀取列數</th><th>寫入列數</th><th>全帳號讀取占比</th></tr></thead>
       <tbody>{used.map(db=><tr key={db.id}><td>{db.name}</td>
         <td>{number(db.rowsRead)}</td><td>{number(db.rowsWritten)}</td><td>{percent(db.rowsRead,report.today.rowsRead)}</td></tr>)}</tbody>
     </table></div>
     {idle.length?<p className="cy-identity-intro" title={idle.map(db=>db.name).join("、")}>其他 {idle.length} 個資料庫今日無用量。</p>:null}
     <h4>最近 {report.days.length} 天（UTC）</h4>
     <div className="cy-op-table-wrap"><table className="cy-op-table">
       <thead><tr><th>日期（UTC）</th><th>讀取列數</th><th>寫入列數</th></tr></thead>
       <tbody>{report.days.map(day=><tr key={day.date}><td>{day.date.replaceAll("-","/")}</td>
         <td>{number(day.rowsRead)}</td><td>{number(day.rowsWritten)}</td></tr>)}</tbody>
     </table></div>
   </>:null}
 </section>;
}
