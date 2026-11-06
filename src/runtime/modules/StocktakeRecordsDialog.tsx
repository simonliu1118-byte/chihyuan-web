import {useEffect,useState} from "react";
import {apiRequest} from "../../api/client";
import {Dialog} from "../../ui/overlays/Dialog";
import {ExpandToggle} from "../../ui/data/ExpandToggle";
import {Loading} from "../../ui/feedback/Loading";
import {formatDate,formatDateTime} from "../../ui/foundation/format";
import type {StocktakeRecord,StocktakeRecordPage,StocktakeRecordDifferencePage} from "../../../shared/stocktake";
import {STOCKTAKE_LABELS} from "../../../shared/stocktake";

const ROOT="/api/business/store/stocktake/records";
function Differences({id}:{id:number}){
 const [data,setData]=useState<StocktakeRecordDifferencePage|null>(null);
 const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;void apiRequest<StocktakeRecordDifferencePage>(ROOT+"/"+id)
  .then(d=>{if(active)setData(d)}).catch(e=>{if(active)setError(e instanceof Error?e.message:"盤點差異讀取失敗")});
  return()=>{active=false};},[id]);
 async function more(){if(!data?.nextBefore||busy)return;setBusy(true);
  try{const next=await apiRequest<StocktakeRecordDifferencePage>(ROOT+"/"+id+"?before="+encodeURIComponent(data.nextBefore));
   setData(current=>current?{rows:[...current.rows,...next.rows],nextBefore:next.nextBefore}:next);
  }catch(e){setError(e instanceof Error?e.message:"盤點差異讀取失敗")}finally{setBusy(false)}}
 if(!data&&!error)return <Loading/>;
 return <>{error?<p role="alert">{error}</p>:null}
  {data?.rows.length?<div className="cy-op-table-wrap"><table className="cy-op-table">
   <thead><tr><th>品號／品名</th><th>批號</th><th>帳面</th><th>初盤</th><th>複盤</th><th>實際</th><th>差異</th><th>填寫人員</th></tr></thead>
   <tbody>{data.rows.map(r=><tr key={r.lineKey}><td>{r.itemCode}{r.itemName}</td><td>{r.batch}</td><td>{r.bookQty}</td>
    <td>{r.firstQty??"未完成"}</td><td>{r.recountQty??""}</td><td>{r.actualQty??"未完成"}</td><td>{r.difference??""}</td>
    <td>{r.firstPeople.length?"初盤："+r.firstPeople.join("、"):null}{r.recountPeople.length?<div>複盤：{r.recountPeople.join("、")}</div>:null}</td></tr>)}</tbody>
  </table></div>:data?<p className="cy-op-empty">沒有需保留的差異或未完成盤點列。</p>:null}
  {data?.nextBefore?<button type="button" className="cy-op-button" disabled={busy} onClick={()=>void more()}>載入更多差異</button>:null}
 </>;
}
function Confirmation({record:r}:{record:StocktakeRecord}){
 return <div className="cy-stocktake-record-confirmation">
  {r.firstConfirmedAt?<div>初盤：{r.firstConfirmedName} {formatDateTime(r.firstConfirmedAt)}</div>:null}
  {r.secondConfirmedAt?<div>複盤：{r.secondConfirmedName} {formatDateTime(r.secondConfirmedAt)}</div>:null}
  {r.erpConfirmedAt?<div>寫回：{formatDateTime(r.erpConfirmedAt)}</div>:null}
 </div>;
}
export function StocktakeRecordsDialog({onClose}:{onClose:()=>void}){
 const [data,setData]=useState<StocktakeRecordPage|null>(null);
 const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[expanded,setExpanded]=useState<number|null>(null);
 useEffect(()=>{let active=true;void apiRequest<StocktakeRecordPage>(ROOT).then(d=>{if(active)setData(d)})
  .catch(e=>{if(active)setError(e instanceof Error?e.message:"盤點紀錄讀取失敗")});return()=>{active=false};},[]);
 async function more(){if(!data?.nextBefore||busy)return;setBusy(true);
  try{const next=await apiRequest<StocktakeRecordPage>(ROOT+"?before="+encodeURIComponent(data.nextBefore));
   setData(current=>current?{records:[...current.records,...next.records],nextBefore:next.nextBefore}:next);
  }catch(e){setError(e instanceof Error?e.message:"盤點紀錄讀取失敗")}finally{setBusy(false)}}
 return <Dialog open size="large" className="cy-stocktake-records-dialog" title="過去盤點紀錄" showCloseButton={false} onClose={onClose}
  footer={<div className="cy-dialog-action-row"><button type="button" className="cy-op-button" onClick={onClose}>關閉</button></div>}>
  {error?<p role="alert">{error}</p>:null}
  {!data&&!error?<Loading/>:null}
  {data?<div className="cy-op-table-wrap"><table className="cy-op-table cy-stocktake-records-table">
   <colgroup>{[8,7,7.5,7.5,70].map((width,i)=><col key={i} style={{width:width+"%"}}/>)}</colgroup>
   <thead><tr><th>盤點日期</th><th>單號</th><th>初盤人員</th><th>複盤人員</th><th>盤點內容</th></tr></thead>
   {data.records.length?data.records.map(r=><tbody key={r.id}><tr>
    <td className="cy-stocktake-record-date">{r.sheetDate?formatDate(r.sheetDate):""}</td>
    <td><div className="cy-stocktake-record-number"><ExpandToggle expanded={expanded===r.id} label={r.sheetNo+" 盤點差異"} onToggle={()=>setExpanded(expanded===r.id?null:r.id)}/>{r.sheetNo}</div></td>
    <td>{r.participants.filter(p=>p.firstCountAt).map(p=>p.name).join("、")}</td>
    <td>{r.participants.filter(p=>p.recountAt).map(p=>p.name).join("、")}</td>
    <td className="cy-stocktake-record-items">{r.items.map(i=>i.itemCode+i.itemName).join("、")}</td>
   </tr>{expanded===r.id?<tr><td colSpan={5}>
    <Confirmation record={r}/>
    <div className="cy-stocktake-record-meta">歸檔前狀態：{STOCKTAKE_LABELS[r.sourceStatus]}；
     {r.participants.length?"參與人員："+r.participants.map(p=>p.name).join("、")+"；":""}確認 ERP 已清除：{formatDateTime(r.archivedAt)}</div>
    <Differences id={r.id}/>
   </td></tr>:null}</tbody>):<tbody><tr><td colSpan={5}>尚無過去盤點紀錄。</td></tr></tbody>}
  </table></div>:null}
  {data?.nextBefore?<button type="button" className="cy-op-button" disabled={busy} onClick={()=>void more()}>載入更多盤點紀錄</button>:null}
 </Dialog>;
}
