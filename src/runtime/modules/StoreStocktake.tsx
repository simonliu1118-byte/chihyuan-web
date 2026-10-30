import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {apiRequest,ApiClientError} from "../../api/client";
import {Field,FormSection} from "../../ui/forms/Field";
import {Dialog} from "../../ui/overlays/Dialog";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {useFeedback,useFeedbackMessage} from "../../ui/feedback/FeedbackProvider";
import {StatusChip} from "../../ui/primitives/StatusChip";
import {DataViewToolbar} from "../../ui/data/DataViewToolbar";
import {formatDate,formatDateTime} from "../../ui/foundation/format";
import type {StatusTone} from "./status-flow";
import {enterAdvancesFields,enterAdvancesThenSubmits} from "../../ui/foundation/enter-advance";
import {Loading} from "../../ui/feedback/Loading";
import {useErpJob} from "./useErpJob";
import {ErpJobStatus} from "./ErpJobStatus";
import {STOCKTAKE_LABELS,stocktakeAggregateLines,stocktakeWriteRows,
 type StocktakeDetail,type StocktakeLine,type StocktakeLocationCount,type StocktakeSheet,type StocktakeStatus} from "../../../shared/stocktake";
import {StocktakeGroupedDetail} from "./StocktakeGroupedDetail";

const ROOT="/api/business/store/stocktake";
const call=<T,>(path:string,method="GET",json?:unknown)=>apiRequest<T>(ROOT+path,{method,json});
const errorOf=(error:unknown)=>error instanceof Error?error.message:"盤點操作失敗";
const isAdmin=(role:string)=>role==="ADMIN"||role==="SUPER_ADMIN";
type LineHistory={id:number;field:string;beforeValue:string|null;afterValue:string|null;memberId:number;actorName:string;at:string};
type StoredWriteResult={
 error?:string;
 results?:{key:string;ok:boolean;message:string}[];
 mismatches?:{key:string;seq:string|null;itemCode:string;batch:string;expected:string;actual:string}[];
};
function writeFailure(value:unknown):StoredWriteResult|null{
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 return value as StoredWriteResult;
}
const date=(iso:string|null)=>formatDateTime(iso);
const STOCKTAKE_STATUS_TONE:Record<StocktakeStatus,StatusTone>={
 IGNORED:"neutral",COUNTING:"info",RECOUNTING:"warning",WRITING:"info",WRITE_FAILED:"danger",ERP_CONFIRMED:"success"
};

export function StoreStocktake({role}:{role:string}){
 const manager=isAdmin(role);
 const [sheets,setSheets]=useState<StocktakeSheet[]|null>(null);
 const [ignored,setIgnored]=useState<{sheetNo:string;createdAt:string}[]>([]);

 const [selected,setSelected]=useState<string|null>(null);
 const [detail,setDetail]=useState<StocktakeDetail|null>(null);
 const [search,setSearch]=useState("");
 const [filter,setFilter]=useState<"ALL"|"UNFILLED"|"DIFFERENCE"|"ADDED">("ALL");
 const [drafts,setDrafts]=useState<Record<string,string>>({});
 const [saving,setSaving]=useState<string|null>(null);
 const inFlightSave=useRef(new Set<string>());
 const [conflict,setConflict]=useState<{key:string;quantity:string}|null>(null);
 const [history,setHistory]=useState<{line:StocktakeLine;cell:StocktakeLocationCount;rows:LineHistory[]}|null>(null);
 const [ignoreForm,setIgnoreForm]=useState<string|null>(null);
 const [batchForm,setBatchForm]=useState<{itemCode:string;warehouseName:string;locationCode:string;batch:string;quantity:string}|null>(null);
 const [renameForm,setRenameForm]=useState<{itemCode:string;warehouseName:string;fromLocation:string;toLocation:string}|null>(null);
 const [manualOpen,setManualOpen]=useState(false);
 type ManualRow={locationCountId:number;lineKey:string;itemCode:string;batch:string;isAdded:number;
  warehouseName:string;erpLocationCode:string;locationCode:string;verifiedAt:string|null;verifiedBy:number|null};
 const [manualRows,setManualRows]=useState<ManualRow[]>([]);
 const [busy,setBusy]=useState(false);
 const [,setFeedbackMessage,reportError]=useFeedbackMessage<string|null>(null);
 const notify=useFeedback();
 const setMessage=useCallback((value:string)=>{setFeedbackMessage(value);notify(value,"盤點通知",{replace:true})},[setFeedbackMessage,notify]);
 const {confirm,confirmationDialog}=useConfirmation();
 const job=useErpJob({route:"store",key:"STOCKTAKE",label:"門市庫存盤點",types:["STOCKTAKE_SYNC","STOCKTAKE_WRITE"]});
 const lastJob=useRef<string|null>(null);
 const draftRef=useRef(drafts);draftRef.current=drafts;
 const selectedRef=useRef(selected);selectedRef.current=selected;

 const loadSheets=useCallback(async()=>{
   const [normal,excluded]=await Promise.all([call<StocktakeSheet[]>(""),manager?call<{sheetNo:string;createdAt:string}[]>("?ignored=true"):Promise.resolve([])]);
   setSheets(normal);setIgnored(excluded);
 },[manager]);
 const detailRef=useRef<StocktakeDetail|null>(null);detailRef.current=detail;
 const loadDetail=useCallback(async(sheet:string,incremental=false):Promise<StocktakeDetail>=>{
   const previous=incremental&&detailRef.current?.sheet.sheetNo===sheet?detailRef.current:null;
   const suffix=previous?"?since="+previous.sheet.version:"";
   const d=await call<StocktakeDetail & {removedKeys?:string[]}>("/"+encodeURIComponent(sheet)+suffix);
   // A re-read from ERP replaces every line and a status change (confirm, ERP write) changes many:
   // neither leaves per-line revisions or tombstones, so the whole sheet is read again.
   if(previous&&(d.sheet.detailReadAt!==previous.sheet.detailReadAt||d.sheet.status!==previous.sheet.status))
     return loadDetailRef.current(sheet);
   if(selectedRef.current===sheet){
     setDetail(current=>{
       if(!previous||!current||current.sheet.sheetNo!==sheet)return d;
       if(current.sheet.version>d.sheet.version)return current; // slower responses must not roll back newer edits
       if(current.sheet.version===d.sheet.version&&d.lines.length===0&&d.locationCounts.length===0&&(d.removedKeys?.length??0)===0)return current; // no React redraw for idle polls
       const removed=new Set(d.removedKeys??[]);
       const changed=new Map(d.lines.map(l=>[l.lineKey,l]));
       const merged=current.lines.filter(l=>!removed.has(l.lineKey)).map(l=>changed.get(l.lineKey)??l);
       const known=new Set(merged.map(l=>l.lineKey));
       for(const line of d.lines)if(!known.has(line.lineKey))merged.push(line);
       const changedCells=new Map(d.locationCounts.map(cell=>[cell.id,cell]));
       const cells=current.locationCounts.filter(cell=>!removed.has(cell.sourceLineKey)).map(cell=>changedCells.get(cell.id)??cell);
       const knownIds=new Set(cells.map(cell=>cell.id));
       for(const cell of d.locationCounts)if(!knownIds.has(cell.id))cells.push(cell);
       return {sheet:d.sheet,lines:merged,locationCounts:cells};
     });
   }
   return d;
 },[]);
 const loadDetailRef=useRef(loadDetail);loadDetailRef.current=loadDetail;
 useEffect(()=>{void loadSheets().catch(e=>reportError(errorOf(e)))},[loadSheets,reportError]);
 useEffect(()=>{if(!selected){setDetail(null);setDrafts({});setConflict(null);return;}
   setDetail(null);setDrafts({});setConflict(null);
   void loadDetail(selected).catch(e=>reportError(errorOf(e)));
 },[selected,loadDetail,reportError]);
 const active=()=>document.visibilityState==="visible"&&
   (document.querySelector(".cy-store-stocktake")?.getClientRects().length??0)>0;
 useEffect(()=>{
   const summary=window.setInterval(()=>{if(active())void loadSheets().catch(()=>undefined)},30000);
   return()=>window.clearInterval(summary);
 },[loadSheets]);
 useEffect(()=>{if(!selected)return;
   const details=window.setInterval(()=>{if(active())void loadDetail(selected,true).catch(()=>undefined)},10000);
   return()=>window.clearInterval(details);
 },[selected,loadDetail]);
 useEffect(()=>{
   if(!job.result||job.result.id===lastJob.current)return;
   if(job.result.status==="QUEUED"||job.result.status==="RUNNING")return;
   lastJob.current=job.result.id;

   void loadSheets().then(()=>selectedRef.current?loadDetail(selectedRef.current):null).catch(()=>undefined);
 },[job.result,loadSheets,loadDetail]);

 const currentSheet=detail?.sheet;
 const recountCells=detail?.locationCounts.filter(cell=>!detail.lines.find(l=>l.lineKey===cell.sourceLineKey)?.locked)??[];
 const filledCount=currentSheet?.status==="RECOUNTING"
  ?recountCells.filter(cell=>cell.recountQty!==null).length:currentSheet?.counted??0;
 const totalCount=currentSheet?.status==="RECOUNTING"?recountCells.length:currentSheet?.total??0;
 const loadManual=useCallback(async(sheetNo:string)=>{
  const rows=await call<ManualRow[]>("/"+encodeURIComponent(sheetNo)+"/manual-locations");
  setManualRows(rows);
 },[]);
 const open=async(sheetNo:string,bodyPath:string,body?:Record<string,unknown>,method="POST")=>{
   setBusy(true);
   try{
     const data=await call<{id?:string}>(("/"+encodeURIComponent(sheetNo)+"/"+bodyPath),method,body);
     if(data.id)job.attach(data.id);
     await Promise.all([loadSheets(),loadDetail(sheetNo)]);
     setMessage("操作已送出或儲存。");
   }catch(e){reportError(errorOf(e))}
   finally{setBusy(false)}
 };
 const update=async()=>{
   setBusy(true);
   try{
    const data=await call<{id:string}>("/sync","POST");
    job.attach(data.id);
   }catch(e){reportError(errorOf(e))}
   finally{setBusy(false)}
 };
 const changeDraft=(key:string,value:string)=>setDrafts(prev=>({...prev,[key]:value}));
 async function saveCell(cell:StocktakeLocationCount,force=false){
  if(!detail||busy)return;
  const key=String(cell.id),value=draftRef.current[key];
  if(inFlightSave.current.has(key)||value===undefined)return;
  if(conflict?.key===key&&!force)return;
  if(value!==""&&!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,4})?$/.test(value)){
   reportError("數量格式錯誤：不可為負數，最多 4 位小數且小於十億。");return;
  }
  inFlightSave.current.add(key);setSaving(key);
  try{
   const fresh=await call<{sheet:StocktakeSheet;locationCount:StocktakeLocationCount}>(
    "/"+encodeURIComponent(detail.sheet.sheetNo)+"/line","PATCH",
    {locationCountId:cell.id,quantity:value===""?null:value,expectedVersion:cell.version});
   setDetail(old=>old&&old.sheet.sheetNo===fresh.sheet.sheetNo?{
    ...old,sheet:fresh.sheet.version>old.sheet.version?fresh.sheet:old.sheet,
    locationCounts:old.locationCounts.map(c=>c.id===cell.id&&fresh.locationCount.version>=c.version?fresh.locationCount:c)
   }:old);
   setDrafts(old=>{const next={...old};if(next[key]===value)delete next[key];return next});
   setConflict(null);
  }catch(e){
   if(e instanceof ApiClientError&&e.code==="STOCKTAKE_VERSION_CONFLICT"){
    setConflict({key,quantity:value});
    await loadDetail(detail.sheet.sheetNo);
    reportError("這個儲位剛被其他人修改，請比較數量。");
   }else reportError(errorOf(e));
  }finally{inFlightSave.current.delete(key);setSaving(null)}
 }
 function useLatest(cell:StocktakeLocationCount){
  const key=String(cell.id);
  setConflict(null);setDrafts(prev=>{const next={...prev};delete next[key];return next});
 }
 async function afterConfirm(action:"first-confirm"|"second-confirm"|"retry-write"|"refresh"){
   if(!currentSheet)return;
   const lines=detail?.lines??[],cells=detail?.locationCounts??[];
   const unfilled=action==="first-confirm"?cells.filter(c=>c.firstQty===null).length:
     action==="second-confirm"?cells.filter(c=>!lines.find(l=>l.lineKey===c.sourceLineKey)?.locked&&c.recountQty===null).length:0;
   const resolved=stocktakeAggregateLines(lines,cells);
   const writeRows=action==="second-confirm"?stocktakeWriteRows(resolved).length:0;
   const explain=action==="first-confirm"
     ? `總列數：${lines.length}；未填：${unfilled}；需複盤品號：確認後依 ERP 帳面核算並顯示。`
     :action==="second-confirm"
       ? `總列數：${lines.length}；未複盤：${unfilled}；將寫回 ${writeRows} 列（含新增批號）。`
       :action==="retry-write"?"將用相同實盤數量再次要求 ERP 寫回與核對。":"請確認要執行此操作。";
   if(unfilled){reportError("還有 "+unfilled+" 列未填，不能確認。");return}
   if(!await confirm({title:action==="first-confirm"?"第一次主管確認":action==="second-confirm"?"第二次主管確認":"確認操作",
     description:explain,confirmLabel:"確認執行"}))return;
   await open(currentSheet.sheetNo,action,{expectedVersion:currentSheet.version});
 }
 async function addIgnored(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!ignoreForm)return;
  setBusy(true);
  try{await call("/ignore","POST",{sheetNo:ignoreForm.trim()});setIgnoreForm("");await loadSheets()}
  catch(err){reportError(errorOf(err))}finally{setBusy(false)}
 }
 async function removeIgnored(sh:{sheetNo:string}){
  if(!await confirm({title:"移除忽略底稿",description:"確認從忽略清單移除 "+sh.sheetNo+"？",confirmLabel:"移除"}))return;
  setBusy(true);
  try{
   await call("/ignore","DELETE",{sheetNo:sh.sheetNo});
   await loadSheets();
  }catch(e){reportError(errorOf(e))}finally{setBusy(false)}
 }
 async function addBatch(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!currentSheet||!batchForm)return;
  const {quantity,...identifiers}=batchForm;
  await open(currentSheet.sheetNo,"batches",{...identifiers,...(quantity.trim()?{quantity:quantity.trim()}:{})});
  setBatchForm(null);
 }
 async function deleteBatch(line:StocktakeLine){
  if(!currentSheet||!detail)return;
  const cells=detail.locationCounts.filter(c=>c.sourceLineKey===line.lineKey);
  if(cells.some(c=>c.firstQty!==null||c.recountQty!==null)&&
   !await confirm({title:"刪除已填寫批號",description:"刪除後將保留修改紀錄。",confirmLabel:"確認刪除",confirmTone:"danger"}))return;
  await open(currentSheet.sheetNo,"batches",{lineKey:line.lineKey,expectedVersion:line.version,confirmNonEmpty:true},"DELETE");
 }
 async function showHistory(line:StocktakeLine,cell:StocktakeLocationCount){
  if(!currentSheet)return;
  try{
   const rows=await call<LineHistory[]>("/"+encodeURIComponent(currentSheet.sheetNo)+
    "/history?lineKey="+encodeURIComponent(line.lineKey)+"&locationCountId="+cell.id);
   setHistory({line,cell,rows});
  }catch(e){reportError(errorOf(e))}
 }
 async function renameLocation(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!currentSheet||!renameForm)return;
  setBusy(true);
  try{
   await call("/"+encodeURIComponent(currentSheet.sheetNo)+"/locations","PATCH",{
    ...renameForm,expectedVersion:currentSheet.version
   });
   setRenameForm(null);await loadDetail(currentSheet.sheetNo);
  }catch(e){reportError(errorOf(e))}finally{setBusy(false)}
 }
 async function verifyManual(row:ManualRow,checked:boolean){
  if(!currentSheet||!detail)return;
  const cell=detail.locationCounts.find(c=>c.id===row.locationCountId);
  if(!cell)return;
  if(checked&&!await confirm({title:"確認已在 ERP 手動修改儲位",
   description:"確認已人工核對 ERP 中品號 "+row.itemCode+"、批號 "+row.batch+" 的儲位？本操作不會修改 ERP。",
   confirmLabel:"標記已人工完成"}))return;
  setBusy(true);
  try{
   await call("/"+encodeURIComponent(currentSheet.sheetNo)+"/manual-locations","PATCH",
    {locationCountId:row.locationCountId,expectedVersion:cell.version,verified:checked});
   await Promise.all([loadDetail(currentSheet.sheetNo),loadManual(currentSheet.sheetNo)]);
  }catch(e){reportError(errorOf(e))}finally{setBusy(false)}
 }
 return <section className="cy-store-stocktake">
  {job.result&&(job.result.status==="QUEUED"||job.result.status==="RUNNING")?<div className="cy-op-panel"><ErpJobStatus result={job.result}/></div>:null}
  <div className="cy-stocktake-layout">
   <nav className="cy-stocktake-sheets" aria-label="盤點單清單">
    <h3>盤點單</h3>
    <div className="cy-stocktake-list-actions">
     <button type="button" className="cy-op-button primary compact" disabled={busy||job.busy} onClick={()=>void update()}>同步ERP盤點單</button>
     {manager?<button type="button" className="cy-op-button compact" onClick={()=>setIgnoreForm("")}>設定忽略底稿</button>:null}
    </div>
    <select className="cy-op-input cy-stocktake-mobile-select" aria-label="選擇盤點底稿"
      value={selected??""} onChange={e=>setSelected(e.target.value||null)}>
      <option value="">請選擇盤點單</option>
      {(sheets??[]).map(sh=>
        <option key={sh.sheetNo} value={sh.sheetNo}>
          {sh.sheetNo} · {sh.sheetDate?formatDate(sh.sheetDate)+"盤點":"尚無日期"} · {STOCKTAKE_LABELS[sh.status]}
        </option>)}
    </select>
    {sheets===null?<Loading/>:null}
    <div className="cy-op-list cy-stocktake-list">
     {(sheets??[]).map(s=><button key={s.sheetNo} type="button"
       className={"cy-op-list-row cy-status-row cy-stocktake-list-row"+(s.sheetNo===selected?" active":"")}
       aria-current={s.sheetNo===selected?"true":undefined} onClick={()=>setSelected(s.sheetNo)}>
       <strong>{s.sheetNo}</strong>
       <span className="cy-stocktake-list-date">{s.sheetDate?formatDate(s.sheetDate)+"盤點":"尚無日期"}</span>
       <StatusChip tone={STOCKTAKE_STATUS_TONE[s.status]}>{STOCKTAKE_LABELS[s.status]}</StatusChip>
     </button>)}
     {sheets?.length===0?<p className="cy-op-empty">尚無盤點單。請按「同步ERP盤點單」取得底稿。</p>:null}
    </div>
   </nav>
   <div className="cy-stocktake-main">
    {!currentSheet?<p className="cy-op-empty">請從左側選擇盤點單（手機版請從上方選單選擇）。</p>:<>
     <header className="cy-record-header">
      <div className="cy-ordering-title">
       <h2>{currentSheet.sheetNo}</h2>
       <StatusChip tone={STOCKTAKE_STATUS_TONE[currentSheet.status]}>{STOCKTAKE_LABELS[currentSheet.status]}</StatusChip>
       <span className="cy-ordering-title-meta">{currentSheet.sheetDate?formatDate(currentSheet.sheetDate)+"盤點":"尚無日期"} · 商品 {filledCount}/{totalCount} 已填</span>
      </div>
      <div className="cy-record-actions">
       {manager&&currentSheet.status==="COUNTING"&&currentSheet.detailReadAt?
        <button className="cy-op-button" disabled={busy} type="button" onClick={()=>void afterConfirm("refresh")}>重新整理</button>:null}
       {(currentSheet.status==="COUNTING"||currentSheet.status==="RECOUNTING")?
        <button className="cy-op-button" type="button" onClick={()=>setBatchForm({itemCode:"",batch:"",quantity:""})}>新增批號</button>:null}
       {manager&&currentSheet.status==="COUNTING"&&currentSheet.detailReadAt?
        <button className="cy-op-button primary" disabled={busy} type="button" onClick={()=>void afterConfirm("first-confirm")}>初盤確認</button>:null}
       {manager&&currentSheet.status==="RECOUNTING"?
        <button className="cy-op-button primary" disabled={busy} type="button" onClick={()=>void afterConfirm("second-confirm")}>複盤確認</button>:null}
       {manager&&currentSheet.status==="WRITE_FAILED"?
        <button className="cy-op-button primary" disabled={busy} type="button" onClick={()=>void afterConfirm("retry-write")}>重新寫回</button>:null}
      </div>
     </header>
     {currentSheet.status==="WRITE_FAILED"?<section className="cy-stocktake-write-failure" role="alert">
       <h4>ERP 寫回未完成，盤點尚未確認</h4>
       {(()=>{const failed=writeFailure(currentSheet.writeResult);
         const errors=failed?.results?.filter(x=>!x.ok)??[];
         const mismatches=failed?.mismatches??[];
         return <>
          {failed?.error?<p>{failed.error}</p>:null}
          {errors.length?<><strong>寫入失敗（{errors.length} 列）</strong>
            <ul>{errors.map(x=><li key={x.key}>列鍵 {x.key}：{x.message||"ERP 寫入未完成"}</li>)}</ul></>:null}
          {mismatches.length?<><strong>ERP 核對差異（{mismatches.length} 列）</strong>
            <ul>{mismatches.map(x=><li key={x.key}>列鍵 {x.key}／{x.itemCode}
              {x.batch?"／批號 "+x.batch:""}：應為 {x.expected}，ERP 為 {x.actual}</li>)}</ul></>:null}
          {!failed?.error&&!errors.length&&!mismatches.length?
            <p>ERP 尚未確認本張盤點單。請主管先核對實際 ERP 狀態，再決定是否重新寫回。</p>:null}
         </>})()}
       <small>重新寫回不會自動執行，必須由管理員再次確認。</small>
      </section>:null}
     <DataViewToolbar searchValue={search} onSearchChange={setSearch}
      searchLabel="搜尋儲位、品號、品名、批號" searchPlaceholder="搜尋儲位、品號、品名、批號"
      filters={<select className="cy-op-input" aria-label="顯示篩選" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}>
       <option value="ALL">全部</option><option value="UNFILLED">未填</option>
       <option value="DIFFERENCE">有差異</option><option value="ADDED">新增批號</option>
      </select>}/>
     <section className="cy-ordering-lines cy-stocktake-detail-section" aria-label="盤點品號庫存明細">
      <h3>盤點品號庫存明細</h3>
      <div className="cy-ordering-grid-scroll cy-stocktake-lines" role="region" aria-label="盤點品號庫存明細表格" tabIndex={0}>
       <table className="cy-ordering-grid cy-stocktake-grid" data-phase={currentSheet.status==="COUNTING"?"first":"recount"}>
        <thead><tr>
         <th scope="col">項次</th>
         <th scope="col">品號</th><th scope="col">品名</th><th scope="col">規格</th>
         <th scope="col">庫別</th><th scope="col">儲位</th><th scope="col">批號</th><th scope="col">單位</th>
         {currentSheet.status!=="COUNTING"?<>
          <th scope="col">初盤數量</th><th scope="col">帳面數量</th><th scope="col">差異</th>
         </>:null}
         <th scope="col">{currentSheet.status==="COUNTING"?"初盤數量":"複盤數量"}</th>
         <th scope="col">最後填寫</th><th scope="col">操作</th>
        </tr></thead>
        <tbody>
         {visible.map((l,index)=>{
          const field=currentSheet.status==="COUNTING"?"firstQty":"recountQty";
          const stored=field==="firstQty"?l.firstQty:l.recountQty;
          const canEdit=!l.locked&&(currentSheet.status==="COUNTING"||currentSheet.status==="RECOUNTING");
          const edited=drafts[l.lineKey];
          const lastAt=field==="firstQty"?l.firstAt:l.recountAt;
          const lastBy=field==="firstQty"?l.firstByName:l.recountByName;
          return <Fragment key={l.lineKey}><tr className="cy-stocktake-row-group">
           <td data-label="項次">{index+1}</td>
           <td data-label="品號"><span className="cy-ordering-cell-text">{l.itemCode}</span></td>
           <td data-label="品名"><span className="cy-ordering-cell-text cy-ordering-wrap">{l.itemName}</span>
            {l.isAdded?<small className="cy-stocktake-row-note">新增批號</small>:null}
            {l.locked?<small className="cy-stocktake-row-note">已鎖定</small>:null}</td>
           <td data-label="規格"><span className="cy-ordering-cell-text cy-ordering-wrap">{l.spec||"—"}</span></td>
           <td data-label="庫別"><span className="cy-ordering-cell-text">{l.warehouseName||"—"}</span></td>
           <td data-label="儲位"><span className="cy-ordering-cell-text">{l.location||"—"}</span></td>
           <td data-label="批號"><span className="cy-ordering-cell-text">{l.batch||"無"}</span></td>
           <td data-label="單位"><span className="cy-ordering-cell-text">{l.unit||"—"}</span></td>
           {currentSheet.status!=="COUNTING"?<>
            <td className="cy-stocktake-num" data-label="初盤數量">{l.firstQty??"—"}</td>
            <td className="cy-stocktake-num" data-label="帳面數量">{l.bookQty??"—"}</td>
            <td className="cy-stocktake-num" data-label="差異">{relativeDiff(l.firstQty,l.bookQty)}</td>
           </>:null}
           <td className="cy-stocktake-qty-cell" data-label={currentSheet.status==="COUNTING"?"初盤數量":"複盤數量"}>
            <div className="cy-stocktake-qty-control">
             <input data-stocktake-qty type="text" inputMode="decimal" className="cy-ordering-cell"
              aria-label={(currentSheet.status==="COUNTING"?"初盤數量":"複盤數量")+"："+l.itemCode+"，批號 "+(l.batch||"無")}
              disabled={!canEdit||saving===l.lineKey}
              value={edited??stored??""} onChange={e=>changeDraft(l.lineKey,e.target.value)}
              onBlur={()=>void saveLine(l)} onKeyDown={e=>nextOnEnter(e,l)} placeholder="未填"/>
             <small className="cy-stocktake-mobile-unit">{l.unit||"—"}</small>
            </div>
           </td>
           <td className="cy-stocktake-last-edit" data-label="最後填寫"><span>{lastBy??"—"}</span><small>{date(lastAt)}</small></td>
           <td className="cy-stocktake-row-actions" data-label="操作">
            <button className="cy-op-button compact" type="button" onClick={()=>void showHistory(l)}>修改紀錄</button>
            {l.isAdded&&canEdit?<button className="cy-op-button compact danger" type="button" onClick={()=>void deleteBatch(l)}>刪除批號</button>:null}
           </td>
           <td className="cy-stocktake-mobile-summary">
            <button type="button" className="cy-stocktake-mobile-summary-button"
             aria-expanded={expandedLine===l.lineKey} aria-label={"查看"+l.itemCode+"的詳細資料與操作"}
             onClick={()=>setExpandedLine(s=>s===l.lineKey?null:l.lineKey)}>
             <span className="cy-stocktake-mobile-product"><strong>{l.itemCode}</strong>{" "}{l.itemName}</span>
             <span className="cy-stocktake-mobile-spec">{l.spec||"—"}</span>
             <span className="cy-stocktake-mobile-batch-location">批{l.batch||"無"}{" "}儲{l.location||"—"}</span>
             {l.isAdded?<span className="cy-stocktake-mobile-flag">新增批號</span>:null}
             {l.locked?<span className="cy-stocktake-mobile-flag">已鎖定</span>:null}
            </button>
           </td>
          </tr>
          {expandedLine===l.lineKey?<tr className="cy-stocktake-mobile-expanded"><td colSpan={currentSheet.status==="COUNTING"?12:15}>
           <div className="cy-stocktake-expanded-content">
            <div>庫別：{l.warehouseName||"—"}　單位：{l.unit||"—"}</div>
            {currentSheet.status!=="COUNTING"?<div>初盤：{l.firstQty??"—"}　帳面：{l.bookQty??"—"}　差異：{relativeDiff(l.firstQty,l.bookQty)}</div>:null}
            <div>最後填寫：{lastBy??"—"}　{date(lastAt)}</div>
            <div className="cy-stocktake-expanded-actions">
             <button className="cy-op-button compact" type="button" onClick={()=>void showHistory(l)}>修改紀錄</button>
             {l.isAdded&&canEdit?<button className="cy-op-button compact danger" type="button" onClick={()=>void deleteBatch(l)}>刪除批號</button>:null}
            </div>
           </div>
          </td></tr>:null}
          {conflict?.key===l.lineKey?<tr className="cy-stocktake-conflict-row"><td colSpan={currentSheet.status==="COUNTING"?11:14}>
           <div className="cy-notice cy-notice-warning" role="alert">
            <p>其他人已修改本列，現在儲存的數量：{stored??"未填"}。</p>
            <button className="cy-op-button compact" type="button" onClick={()=>{setConflict(null);setDrafts(d=>{const v={...d};delete v[l.lineKey];return v})}}>採用最新結果</button>
            <button className="cy-op-button compact" type="button" onClick={()=>{setConflict(null);void saveLine(l,true)}}>覆蓋為我的數量</button>
           </div>
          </td></tr>:null}</Fragment>
         })}
        </tbody>
       </table>
       {detail&&visible.length===0?<p className="cy-op-empty">目前沒有符合篩選的盤點列。</p>:null}
      </div>
     </section>
    </>}
   </div>
  </div>
  {ignoreForm!==null?<Dialog open title="忽略底稿管理" className="cy-stocktake-ignore-dialog" onClose={()=>setIgnoreForm(null)}>
   <form className="cy-stocktake-ignore-form" onKeyDown={enterAdvancesThenSubmits} onSubmit={e=>void addIgnored(e)}>
    <FormSection><div className="cy-stocktake-ignore-input">
     <Field label="底稿編號" size="l" required>
      <input className="cy-op-input" pattern="[A-Za-z0-9]{1,20}" maxLength={20}
       value={ignoreForm} onChange={e=>setIgnoreForm(e.target.value)}/>
     </Field>
     <button className="cy-op-button primary" type="submit" disabled={busy}>新增</button>
    </div></FormSection>
   </form>
   <section className="cy-stocktake-ignored-list" aria-label="已忽略底稿">
    <h3>已忽略底稿（{ignored.length}）</h3>
    {ignored.length?<div className="cy-op-table-wrap">
     <table className="cy-op-table cy-stocktake-ignored-table">
      <thead><tr><th scope="col">底稿編號</th><th scope="col">加入時間</th><th scope="col">操作</th></tr></thead>
      <tbody>{ignored.map(sh=><tr key={sh.sheetNo}>
       <td><strong>{sh.sheetNo}</strong></td>
       <td>{date(sh.createdAt)}</td>
       <td><button type="button" className="cy-op-button compact danger" disabled={busy}
        onClick={()=>void removeIgnored(sh)}>移除</button></td>
      </tr>)}</tbody>
     </table>
    </div>:<p className="cy-op-empty">目前沒有忽略底稿。</p>}
   </section>
  </Dialog>:null}
  {batchForm?<Dialog open title="新增批號" onClose={()=>setBatchForm(null)}>
   <form onKeyDown={enterAdvancesFields} onSubmit={e=>void addBatch(e)}>
    <FormSection>
     <Field label="既有品號" required size="m"><input className="cy-op-input" maxLength={40} value={batchForm.itemCode}
       onChange={e=>setBatchForm(s=>s?{...s,itemCode:e.target.value}:null)}/></Field>
     <Field label="新批號" required size="m"><input className="cy-op-input" maxLength={80} value={batchForm.batch}
       onChange={e=>setBatchForm(s=>s?{...s,batch:e.target.value}:null)}/></Field>
     <Field label="初盤數量" size="s"><input className="cy-op-input" inputMode="decimal" value={batchForm.quantity}
       onChange={e=>setBatchForm(s=>s?{...s,quantity:e.target.value}:null)}/></Field>
    </FormSection>
    <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={()=>setBatchForm(null)}>取消</button>
     <button type="submit" className="cy-op-button primary" disabled={busy}>新增</button></div>
   </form>
  </Dialog>:null}
  {history?<Dialog open title={history.line.itemCode+"／"+history.line.batch+" 修改紀錄"} onClose={()=>setHistory(null)}>
    {history.rows.length? <ul>{history.rows.map(h=><li key={h.id}>{date(h.at)} {h.actorName}：{h.field} {h.beforeValue??"未填"} → {h.afterValue??"空"}</li>)}</ul>:
     <p>尚無修改紀錄。</p>}
   </Dialog>:null}
  {confirmationDialog}
 </section>;
}
