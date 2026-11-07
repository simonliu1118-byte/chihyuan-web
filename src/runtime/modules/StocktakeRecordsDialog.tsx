import {useEffect,useState} from "react";
import {apiRequest} from "../../api/client";
import {Dialog} from "../../ui/overlays/Dialog";
import {ExpandToggle} from "../../ui/data/ExpandToggle";
import {Loading} from "../../ui/feedback/Loading";
import {formatDate} from "../../ui/foundation/format";
import type {StocktakeRecord,StocktakeRecordPage} from "../../../shared/stocktake";
import {StoreHistoryChain,type StoreHistoryChainEntry} from "./StoreOperationHistory";

const ROOT="/api/business/store/stocktake/records";
function RecordHistory({record:r}:{record:StocktakeRecord}){
 const entries:StoreHistoryChainEntry[]=[];
 if(r.firstConfirmedAt)entries.push({key:"first",at:r.firstConfirmedAt,actorName:r.firstConfirmedName,kind:"初盤確認"});
 if(r.secondConfirmedAt)entries.push({key:"second",at:r.secondConfirmedAt,actorName:r.secondConfirmedName,kind:"複盤確認"});
 if(r.erpConfirmedAt)entries.push({key:"erp",at:r.erpConfirmedAt,kind:"寫回 ERP"});
 entries.push({key:"archive",at:r.archivedAt,kind:"ERP 已清除，移入紀錄"});
 entries.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 return <div className="cy-store-history"><StoreHistoryChain entries={entries}/></div>;
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
    <td><div className="cy-stocktake-record-number"><ExpandToggle expanded={expanded===r.id} label={r.sheetNo+" 操作紀錄"} onToggle={()=>setExpanded(expanded===r.id?null:r.id)}/>{r.sheetNo}</div></td>
    <td>{r.participants.filter(p=>p.firstCountAt).map(p=>p.name).join("、")}</td>
    <td>{r.participants.filter(p=>p.recountAt).map(p=>p.name).join("、")}</td>
    <td className="cy-stocktake-record-items">{r.items.map(i=>i.itemCode+i.itemName).join("、")}</td>
   </tr>{expanded===r.id?<tr><td colSpan={5}>
    <RecordHistory record={r}/>
   </td></tr>:null}</tbody>):<tbody><tr><td colSpan={5}>尚無過去盤點紀錄。</td></tr></tbody>}
  </table></div>:null}
  {data?.nextBefore?<button type="button" className="cy-op-button" disabled={busy} onClick={()=>void more()}>載入更多盤點紀錄</button>:null}
 </Dialog>;
}
