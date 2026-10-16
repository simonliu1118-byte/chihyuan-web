import { FormEvent, useEffect, useState } from "react";
import { ApiClientError } from "../../api/client";
import { HistoryRangeError, resolveHistoryRange } from "../../../shared/erp-query-history";
import { parseErpNameKeyword } from "../../../shared/erp-name-search";
import { ERP_ITEM_FIELDS, type ErpField, type ErpQueryHistory, type ErpQueryResult, type ErpQueryStatus, type ErpQueryType } from "../../../shared/erp-item-query";
import { createErpItemQuery, createErpNameSearch, loadErpItemQuery, type NewErpJob } from "../api/erp-item-query-client";
import "./erp-item-query.css";

const labels: Record<ErpQueryStatus,string> = {
  QUEUED:"排隊中",RUNNING:"查詢中",DONE:"查詢完成",
  NOT_FOUND:"查無此品號",FAILED:"查詢失敗",EXPIRED:"等待逾時",
};
const running = (status:ErpQueryStatus)=>status==="QUEUED"||status==="RUNNING";
function readableError(error:unknown):string {
  if(error instanceof ApiClientError) {
    if(error.code==="QUERY_ALREADY_ACTIVE") return "已有一筆查詢尚未結束，請等候完成後再試。";
    if(error.code==="ACCESS_DENIED") return "你目前沒有 ERP 品號查詢的模組權限。";
    if(error.code==="INVALID_ITEM_NO") return "請輸入 1～40 字且沒有空白的品號。";
    if(error.code==="INVALID_KEYWORD") return "請輸入 1～40 字品名，不可含單引號或 % _ [ ]。";
    return error.message||error.code;
  }
  return "連線失敗，請稍後再試。";
}
function Fields({fields}:{fields:readonly ErpField[]}) {
  return <dl className="cy-erp-fields">{fields.map(f=>
    <div key={f.name}><dt>{f.name}</dt><dd>{f.value||"—"}</dd></div>
  )}</dl>;
}
function ItemFields({fields}:{fields:readonly ErpField[]}) {
  const map=new Map(fields.map(f=>[f.name,f.value]));
  const main=[
    {name:"品號",value:map.get("品號")},
    {name:"品名",value:map.get("品名")},
    {name:"規格",value:map.get("規格")},
    {name:"庫存數量",value:map.get("庫存數量") == null ? "" :
      [map.get("庫存數量"),map.get("單位")].filter(Boolean).join(" ")},
    {name:"商品分類",value:[map.get("商品分類"),map.get("商品分類名稱")].filter(Boolean).join(" ")},
  ];
  const details=map.get("商品描述")||"";
  // Combine adjacent values for display without changing Agent/API payload fields.
  const dayCount=map.get("有效天數");
  const days=dayCount?(/天$/.test(dayCount)?dayCount:dayCount+"天"):"";
  const remaining=[
    {name:"條碼編號",value:map.get("條碼編號")??""},
    {name:"批號管理及有效天數",value:[map.get("批號管理"),days].filter(Boolean).join(" / ")},
    {name:"主供應商",value:[map.get("主供應商"),map.get("主供應商名稱")].filter(Boolean).join("  ")},
    ...ERP_ITEM_FIELDS.filter(name=>!new Set([
      "品號","品名","規格","庫存數量","單位","商品分類","商品分類名稱",
      "商品描述","條碼編號","批號管理","有效天數","主供應商","主供應商名稱",
    ]).has(name)).map(name=>({name,value:map.get(name)??""})),
  ];
  return <>
    <div className="cy-erp-item-lead">
      <div className="cy-erp-lead-left"><Fields fields={main.map(f=>({...f,value:f.value??""}))}/></div>
      <div className="cy-erp-description"><div className="cy-erp-description-label">商品描述</div>
        <div className="cy-erp-description-text">{details||"—"}</div></div>
    </div>
    <Fields fields={remaining}/>
  </>;
}
function BatchTable({batches}:{batches:readonly ErpField[][]}) {
  const columns=["批號","庫存數量","入庫日","有效日期"];
  return <div className="cy-erp-table-scroller"><table className="cy-erp-warehouse">
    <thead><tr>{columns.map(name=><th scope="col" key={name}>{name}</th>)}</tr></thead>
    <tbody>{batches.map((row,i)=>{
      const values=new Map(row.map(f=>[f.name,f.value]));
      return <tr key={i}>{columns.map(name=><td key={name}>{values.get(name)||"—"}</td>)}</tr>;
    })}</tbody>
  </table></div>;
}
function HistoryTable({history}:{history:ErpQueryHistory}) {
  return <div className="cy-erp-table-scroller"><table className="cy-erp-warehouse">
    <thead><tr>{history.columns.map(name=><th scope="col" key={name}>{name}</th>)}</tr></thead>
    <tbody>{history.rows.map((row,i)=><tr key={i}>{row.map((value,j)=><td key={j}>{value||"—"}</td>)}</tr>)}</tbody>
  </table></div>;
}
export function ErpItemQueryPage() {
  const [queryType,setQueryType]=useState<ErpQueryType>("ITEM_NO");
  const [itemNo,setItemNo]=useState("");
  const [keyword,setKeyword]=useState("");
  const [includeHistory,setIncludeHistory]=useState(false);
  const [historyFrom,setHistoryFrom]=useState("");
  const [historyTo,setHistoryTo]=useState("");
  const [submitting,setSubmitting]=useState(false);
  const [result,setResult]=useState<ErpQueryResult|null>(null);
  const [queryId,setQueryId]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    if(!queryId)return;
    let cancelled=false;let pending=false;
    const refresh=()=>{
      if(pending)return;pending=true;
      void loadErpItemQuery(queryId).then(job=>{
        if(cancelled)return;
        setResult(job);setError(null);
        if(!running(job.status))setQueryId(null);
      }).catch(err=>{
        if(cancelled)return;
        setError(readableError(err));setQueryId(null);
      }).finally(()=>{pending=false;});
    };
    refresh();
    const timer=window.setInterval(refresh,1500);
    return ()=>{cancelled=true;window.clearInterval(timer);};
  },[queryId]);
  function selectedHistory() {
    return resolveHistoryRange({
      includeHistory, historyFrom: includeHistory ? historyFrom || null : null,
      historyTo: includeHistory ? historyTo || null : null,
    });
  }
  function acceptJob(job: NewErpJob) {
    setResult({...job,fields:[],warehouses:[],elapsedMs:null,batchManaged:null,batches:[],
      history:null,items:[],total:0,truncated:false,startedAt:null,completedAt:null,
      errorCode:null,errorMessage:null,resultCleared:false});
    setQueryId(job.id);
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(submitting||queryId)return;
    if(queryType==="ITEM_NAME"){
      const trimmed=parseErpNameKeyword(keyword);
      if(!trimmed){setError("請輸入 1～40 字品名，不可含單引號或 % _ [ ]、控制字元。");return;}
      setSubmitting(true);setResult(null);setError(null);
      try{acceptJob(await createErpNameSearch(trimmed));}
      catch(err){setError(readableError(err));}
      finally{setSubmitting(false);}
      return;
    }
    const value=itemNo.trim();
    if(!value||Array.from(value).length>40||/\s|[\x00-\x1f\x7f]/u.test(value)){
      setError("請輸入 1～40 字且沒有空白的品號。");return;
    }
    let history;
    try{history=selectedHistory();}
    catch(err){setError(err instanceof HistoryRangeError?err.message:"歷史異動日期範圍無效");return;}
    setSubmitting(true);setResult(null);setError(null);
    try{acceptJob(await createErpItemQuery(value,history));}
    catch(err){setError(readableError(err));}
    finally{setSubmitting(false);}
  }
  // Clicking a name result is a NEW ITEM_NO job, never a reuse of the list.
  async function chooseItem(item:string) {
    if(submitting||queryId)return;
    let history;
    try{history=selectedHistory();}
    catch(err){setError(err instanceof HistoryRangeError?err.message:"歷史異動日期範圍無效");return;}
    setSubmitting(true);setError(null);
    try{
      const job=await createErpItemQuery(item,history);
      setItemNo(item);setQueryType("ITEM_NO");acceptJob(job);
    }catch(err){setError(readableError(err));}
    finally{setSubmitting(false);}
  }
  return <section className="cy-erp-page">
    <div className="cy-op-panel cy-erp-query-box">
      <form className="cy-erp-form" onSubmit={event=>void submit(event)}>
        <div className="cy-erp-mode-switch" role="group" aria-label="查詢方式">
          <button type="button" aria-pressed={queryType==="ITEM_NO"} disabled={submitting||!!queryId}
            className={queryType==="ITEM_NO"?"is-active":""} onClick={()=>{setQueryType("ITEM_NO");setError(null);}}>品號</button>
          <button type="button" aria-pressed={queryType==="ITEM_NAME"} disabled={submitting||!!queryId}
            className={queryType==="ITEM_NAME"?"is-active":""} onClick={()=>{setQueryType("ITEM_NAME");setError(null);}}>品名</button>
        </div>
        <label htmlFor="erp-search-term">ERP {queryType==="ITEM_NO"?"品號":"品名關鍵字"}</label>
        <div className="cy-erp-query-row">
          <input id="erp-search-term" value={queryType==="ITEM_NO"?itemNo:keyword} maxLength={40} autoComplete="off"
            placeholder={queryType==="ITEM_NO"?"例如 T0001":"例如 穴位貼"}
            onChange={e=>queryType==="ITEM_NO"?setItemNo(e.target.value):setKeyword(e.target.value)}
            disabled={submitting||!!queryId} required/>
          <button className="cy-op-button primary" type="submit" disabled={submitting||!!queryId}>
            {submitting?"送出中…":queryId?"等待查詢結果…":"查詢"}
          </button>
        </div>
        {queryType==="ITEM_NO"&&<label className="cy-erp-history-check">
          <input type="checkbox" checked={includeHistory} disabled={submitting||!!queryId}
            onChange={e=>setIncludeHistory(e.target.checked)}/> 查歷史異動
        </label>}
        {queryType==="ITEM_NO"&&includeHistory&&<div className="cy-erp-history-options">
          <label>起 <input type="date" value={historyFrom} disabled={submitting||!!queryId}
            onChange={e=>setHistoryFrom(e.target.value)}/></label>
          <label>迄 <input type="date" value={historyTo} disabled={submitting||!!queryId}
            onChange={e=>setHistoryTo(e.target.value)}/></label>
          <p>未填：最近一年；起訖範圍最多 3 年。</p>
        </div>}
      </form>
      {error&&<p className="cy-erp-error" role="alert">{error}</p>}
    </div>
    {result&&<div className="cy-op-panel cy-erp-results" aria-live="polite">
      <h2>{labels[result.status]}</h2>
      <p>{result.queryType==="ITEM_NAME"?"品名關鍵字：":"品號："}<strong>{result.queryType==="ITEM_NAME"?result.keyword:result.itemNo}</strong>{result.elapsedMs!==null?`　耗時 ${(result.elapsedMs/1000).toFixed(1)} 秒`:""}</p>
      {result.status==="QUEUED"&&<p>已加入查詢佇列，等待公司電腦處理。</p>}
      {result.status==="RUNNING"&&<p>{result.queryType==="ITEM_NAME"?"正在 ERP 搜尋符合品名的品號…":"正在查詢 ERP；批號庫存及歷史異動可能需要較長時間。"}</p>}
      {result.errorMessage&&<p className="cy-erp-error">{result.errorMessage}</p>}
      {result.status==="EXPIRED"&&<p>排隊超過兩分鐘，請重新送出查詢。</p>}
      {result.status==="NOT_FOUND"&&<p>{result.queryType==="ITEM_NAME"?"沒有符合的品名。":"找不到此品號。"}</p>}
      {result.status==="DONE"&&(result.resultCleared
        ? <p>結果已清除，請重新查詢。</p>
        :result.queryType==="ITEM_NAME"
          ? <><h3>符合的商品（{result.total} 筆）</h3>
              {result.truncated&&<p className="cy-erp-error">結果已達 {result.items.length} 筆，可能有更多資料，請輸入更完整的品名。</p>}
              <div className="cy-erp-table-scroller"><table className="cy-erp-warehouse cy-erp-search-table">
                <thead><tr>{["品號","品名","規格","單位","庫存數量","標準售價"].map(name=>
                  <th scope="col" key={name}>{name}</th>)}</tr></thead>
                <tbody>{result.items.map((row,i)=>{
                  const values=new Map(row.map(f=>[f.name,f.value]));
                  const code=values.get("品號")??"";
                  return <tr key={code+"-"+i}>
                    <td><button type="button" className="cy-erp-item-link"
                      disabled={submitting||!!queryId} onClick={()=>void chooseItem(code)}>
                      {code}</button></td>
                    {["品名","規格","單位","庫存數量","標準售價"].map(name=>
                      <td key={name}>{values.get(name)||"—"}</td>)}
                  </tr>;
                })}</tbody>
              </table></div><p className="cy-erp-search-hint">點選品號，重新向 ERP 查詢該商品完整資料。</p>
            </>
          :<>
          <h3>品號資料</h3><ItemFields fields={result.fields}/>
          <h3>庫別資料</h3>
          {result.warehouses.length===0?<p>無庫別資料。</p>
            :<div className="cy-erp-table-scroller"><table className="cy-erp-warehouse">
              <thead><tr>{["庫別","庫別名稱","儲位","安全存量","經濟批量","上次盤點日","最近入庫日","最近出庫日"]
                .map(name=><th key={name} scope="col">{name}</th>)}</tr></thead>
              <tbody>{result.warehouses.map((warehouse,i)=>{
                const map=new Map(warehouse.map(f=>[f.name,f.value]));
                return <tr key={i}>{["庫別","庫別名稱","儲位","安全存量","經濟批量","上次盤點日","最近入庫日","最近出庫日"]
                  .map(name=><td key={name}>{map.get(name)||"—"}</td>)}</tr>;
              })}</tbody>
            </table></div>}
          {result.batchManaged!==null&&<>
            <h3>批號庫存</h3>
            {!result.batchManaged?<p>非批號管理。</p>
              :result.batches.length===0?<p>目前沒有批號庫存。</p>
                :<BatchTable batches={result.batches}/>}
          </>}
          {result.includeHistory&&<>
            <h3>歷史異動（{result.historyFrom} ～ {result.historyTo}）</h3>
            {result.history
              ? <><p>共 {result.history.total} 筆異動。</p>
                {result.history.truncated&&<p className="cy-erp-error">共 {result.history.total} 筆，只顯示最新 2,000 筆，請縮小日期範圍。</p>}
                <HistoryTable history={result.history}/></>
              :<p>此版本 CYERPAutoQuery 不支援歷史異動，請更新。</p>}
          </>}
        </>)}
    </div>}

  </section>;
}
