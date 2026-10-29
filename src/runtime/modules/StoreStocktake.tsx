import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent, type KeyboardEvent} from "react";
import {apiRequest,ApiClientError} from "../../api/client";
import {Field,FormSection} from "../../ui/forms/Field";
import {Dialog} from "../../ui/overlays/Dialog";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {useFeedback,useFeedbackMessage} from "../../ui/feedback/FeedbackProvider";
import {DataView} from "../../ui/data/DataView";
import {enterAdvancesFields} from "../../ui/foundation/enter-advance";
import {Loading} from "../../ui/feedback/Loading";
import {useErpJob} from "./useErpJob";
import {ErpJobStatus} from "./ErpJobStatus";
import {STOCKTAKE_LABELS,parseStocktakeQuantity,decimalStocktake,stocktakeWriteRows,
 type StocktakeDetail,type StocktakeLine,type StocktakeSheet} from "../../../shared/stocktake";

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
const date=(iso:string|null)=>iso?new Date(iso).toLocaleString("zh-TW",{timeZone:"Asia/Taipei",hour12:false}):"—";
const relativeDiff=(a:string|null,b:string|undefined)=>{
 if(a===null||b===undefined)return "—";
 try{return decimalStocktake(parseStocktakeQuantity(a)-parseStocktakeQuantity(b))}catch{return "—"}
};

export function StoreStocktake({role}:{role:string}){
 const manager=isAdmin(role);
 const [sheets,setSheets]=useState<StocktakeSheet[]|null>(null);
 const [ignored,setIgnored]=useState<StocktakeSheet[]>([]);

 const [selected,setSelected]=useState<string|null>(null);
 const [detail,setDetail]=useState<StocktakeDetail|null>(null);
 const [search,setSearch]=useState("");
 const [filter,setFilter]=useState<"ALL"|"UNFILLED"|"DIFFERENCE"|"ADDED">("ALL");
 const [location,setLocation]=useState("");
 const [drafts,setDrafts]=useState<Record<string,string>>({});
 const [saving,setSaving]=useState<string|null>(null);
 const inFlightSave=useRef(new Set<string>());
 const [conflict,setConflict]=useState<{key:string;quantity:string}|null>(null);
 const [history,setHistory]=useState<{line:StocktakeLine;rows:LineHistory[]}|null>(null);
 const [ignoreForm,setIgnoreForm]=useState<string|null>(null);
 const [batchForm,setBatchForm]=useState<{itemCode:string;batch:string;quantity:string}|null>(null);
 const [busy,setBusy]=useState(false);
 const [,setMessage,reportError]=useFeedbackMessage<string|null>(null);
 const notify=useFeedback();
 const {confirm,confirmationDialog}=useConfirmation();
 const job=useErpJob({route:"store",key:"STOCKTAKE",label:"門市庫存盤點",types:["STOCKTAKE_SYNC","STOCKTAKE_WRITE"]});
 const lastJob=useRef<string|null>(null);
 const draftRef=useRef(drafts);draftRef.current=drafts;
 const selectedRef=useRef(selected);selectedRef.current=selected;

 const loadSheets=useCallback(async()=>{
   const [normal,excluded]=await Promise.all([call<StocktakeSheet[]>(""),manager?call<StocktakeSheet[]>("?ignored=true"):Promise.resolve([])]);
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
       if(current.sheet.version===d.sheet.version&&d.lines.length===0&&(d.removedKeys?.length??0)===0)return current; // no React redraw for idle polls
       const removed=new Set(d.removedKeys??[]);
       const changed=new Map(d.lines.map(l=>[l.lineKey,l]));
       const merged=current.lines.filter(l=>!removed.has(l.lineKey)).map(l=>changed.get(l.lineKey)??l);
       const known=new Set(merged.map(l=>l.lineKey));
       for(const line of d.lines)if(!known.has(line.lineKey))merged.push(line);
       return {sheet:d.sheet,lines:merged};
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
   if(job.result.queryType==="STOCKTAKE_SYNC")notify(job.result.status==="DONE"?"盤點單查詢完成。"+(job.result.elapsedMs!==null?" 耗時 "+(job.result.elapsedMs/1000).toFixed(1)+" 秒。":""):job.result.errorMessage||"盤點單查詢已結束："+job.result.status,"ERP 盤點通知",{replace:true});
   void loadSheets().then(()=>selectedRef.current?loadDetail(selectedRef.current):null).catch(()=>undefined);
 },[job.result,loadSheets,loadDetail,notify]);

 const locations=useMemo(()=>[...new Set(detail?.lines.map(l=>l.location||"未指定儲位")??[])].sort(),[detail]);
 useEffect(()=>{if(!locations.includes(location))setLocation(locations[0]??"")},[locations,location]);
 const visible=useMemo(()=>{
  if(!detail)return [];
  const q=search.trim().toLowerCase();
  return detail.lines.filter(l=>{
   if(window.matchMedia("(max-width: 820px)").matches&&location&&(l.location||"未指定儲位")!==location)return false;
   if(q&&![l.itemCode,l.itemName,l.location,l.batch,l.warehouseName].some(v=>v.toLowerCase().includes(q)))return false;
   if(filter==="ADDED")return l.isAdded;
   if(filter==="UNFILLED")return detail.sheet.status==="COUNTING"?l.firstQty===null:
     detail.sheet.status==="RECOUNTING"?!l.locked&&l.recountQty===null:false;
   if(filter==="DIFFERENCE")return detail.sheet.status!=="COUNTING"&&l.bookQty!==undefined&&
      relativeDiff(l.recountQty??l.firstQty,l.bookQty)!=="0";
   return true;
  });
 },[detail,search,filter,location]);
 const currentSheet=detail?.sheet;
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
    job.attach(data.id);setMessage("盤點單更新已排入 ERP 佇列。");
   }catch(e){reportError(errorOf(e))}
   finally{setBusy(false)}
 };
 const changeDraft=(key:string,value:string)=>setDrafts(s=>({...s,[key]:value}));
 async function saveLine(line:StocktakeLine,force=false){
   if(!detail||busy||inFlightSave.current.has(line.lineKey))return;
   const value=draftRef.current[line.lineKey];
   if(value===undefined)return;
   if(conflict?.key===line.lineKey&&!force)return;
   if(!/^-?(?:0|[1-9]\d{0,8})(?:\.\d{1,4})?$/.test(value)){
     reportError("數量格式錯誤：最多 4 位小數，絕對值小於十億。");return;
   }
   inFlightSave.current.add(line.lineKey);
   setSaving(line.lineKey);
   try{
     const fresh=await call<{sheet:StocktakeSheet;line:StocktakeLine}>("/"+encodeURIComponent(detail.sheet.sheetNo)+"/line","PATCH",
       {lineKey:line.lineKey,quantity:value,expectedVersion:line.version});
     // Keep the polled version when others saved in between, so the next poll still brings their lines.
     setDetail(old=>old&&old.sheet.sheetNo===fresh.sheet.sheetNo?{
       sheet:fresh.sheet.version===old.sheet.version+1?fresh.sheet:{...fresh.sheet,version:old.sheet.version},
       lines:old.lines.map(l=>l.lineKey===fresh.line.lineKey?fresh.line:l)
     }:old);
     setDrafts(s=>{const copy={...s};if(copy[line.lineKey]===value)delete copy[line.lineKey];return copy});
     setConflict(null);
   }catch(e){
     if(e instanceof ApiClientError&&e.code==="STOCKTAKE_VERSION_CONFLICT"){
       setConflict({key:line.lineKey,quantity:value});
       await loadDetail(detail.sheet.sheetNo);
       reportError("此列剛被其他人修改。請比較目前數量，選擇採用他人結果或覆蓋。");
     }else reportError(errorOf(e));
   }finally{inFlightSave.current.delete(line.lineKey);setSaving(null)}
 }
 async function afterConfirm(action:"first-confirm"|"second-confirm"|"retry-write"|"refresh"|"ignore"|"unignore"){
   if(!currentSheet)return;
   const lines=detail?.lines??[];
   const unfilled=action==="first-confirm"?lines.filter(l=>l.firstQty===null).length:
     action==="second-confirm"?lines.filter(l=>!l.locked&&l.recountQty===null).length:0;
   // COUNTING is blind: the server intentionally does not send bookQty even
   // to admins. Never fabricate the number of discrepant items from hidden data.
   // The Worker computes and locks the true item totals atomically on confirm.
   const writeRows=action==="second-confirm"?stocktakeWriteRows(lines).length:0;
   const explain=action==="first-confirm"
     ? `總列數：${lines.length}；未填：${unfilled}；需複盤品號：確認後依 ERP 帳面核算並顯示。`
     :action==="second-confirm"
       ? `總列數：${lines.length}；未複盤：${unfilled}；將寫回 ${writeRows} 列（含新增批號）。`
       :action==="retry-write"?"將用相同實盤數量再次要求 ERP 寫回與核對。":"請確認要執行此操作。";
   if(unfilled){reportError("還有 "+unfilled+" 列未填，不能確認。");return}
   if(!await confirm({title:action==="first-confirm"?"第一次主管確認":action==="second-confirm"?"第二次主管確認":"確認操作",
     description:explain,confirmLabel:"確認執行"}))return;
   await open(currentSheet.sheetNo,action,{expectedVersion:currentSheet.version});
   if(action==="ignore")setSelected(null);
 }
 async function addIgnored(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!ignoreForm)return;
  setBusy(true);
  try{await call("/ignore","POST",{sheetNo:ignoreForm.trim()});setIgnoreForm(null);await loadSheets();setMessage("已新增忽略底稿。")}
  catch(err){reportError(errorOf(err))}finally{setBusy(false)}
 }
 async function removeIgnored(sh:StocktakeSheet){
  if(!await confirm({title:"取消忽略底稿",description:`底稿 ${sh.sheetNo} 將恢復為初盤中，不會刪除盤點資料。`,confirmLabel:"取消忽略"}))return;
  setBusy(true);
  try{
   await call("/"+encodeURIComponent(sh.sheetNo)+"/unignore","POST",{expectedVersion:sh.version});
   await loadSheets();
   notify("底稿 "+sh.sheetNo+" 已取消忽略。","盤點通知",{replace:true});
  }catch(e){reportError(errorOf(e))}finally{setBusy(false)}
 }
 async function addBatch(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!currentSheet||!batchForm)return;
  const {quantity,...identifiers}=batchForm;
  await open(currentSheet.sheetNo,"batches",{...identifiers,...(quantity.trim()?{quantity:quantity.trim()}:{})});
  setBatchForm(null);
 }
 async function deleteBatch(l:StocktakeLine){
  if(!currentSheet)return;
  if((l.firstQty!==null||l.recountQty!==null)&&
   !await confirm({title:"刪除已填寫批號",description:"此新增批號已有數量，刪除後將保留修改紀錄。",confirmLabel:"確認刪除",confirmTone:"danger"}))return;
  await open(currentSheet.sheetNo,"batches",{lineKey:l.lineKey,expectedVersion:l.version,confirmNonEmpty:true},"DELETE");
 }
 async function showHistory(l:StocktakeLine){
   if(!currentSheet)return;
   try{
    const rows=await call<LineHistory[]>("/"+encodeURIComponent(currentSheet.sheetNo)+"/history?lineKey="+encodeURIComponent(l.lineKey));
    setHistory({line:l,rows});
   }catch(e){reportError(errorOf(e))}
 }
 function nextOnEnter(event:KeyboardEvent<HTMLInputElement>,line:StocktakeLine){
   if(event.key!=="Enter"||event.nativeEvent.isComposing)return;
   event.preventDefault();void saveLine(line);
   const inputs=Array.from(event.currentTarget.closest(".cy-stocktake-lines")?.querySelectorAll<HTMLInputElement>("input[data-stocktake-qty]:not([disabled])")??[]);
   const at=inputs.indexOf(event.currentTarget);inputs[at+1]?.focus();
 }
 return <section className="cy-store-stocktake">
  {job.result&&(job.result.status==="QUEUED"||job.result.status==="RUNNING")?<div className="cy-op-panel"><ErpJobStatus result={job.result}/></div>:null}
  <div className="cy-stocktake-layout">
   <nav className="cy-stocktake-sheets" aria-label="盤點單清單">
    <h3>盤點單</h3>
    <div className="cy-stocktake-list-actions">
     <button type="button" className="cy-op-button primary compact" disabled={busy||job.busy} onClick={()=>void update()}>更新盤點單</button>
     <button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void loadSheets().catch(e=>reportError(errorOf(e)))}>更新畫面</button>
     {manager?<button type="button" className="cy-op-button compact" onClick={()=>setIgnoreForm("")}>忽略底稿管理</button>:null}
    </div>
    <select className="cy-op-input cy-stocktake-mobile-select" aria-label="選擇盤點底稿"
      value={selected??""} onChange={e=>setSelected(e.target.value||null)}>
      <option value="">請選擇盤點單</option>
      {(sheets??[]).map(sh=>
        <option key={sh.sheetNo} value={sh.sheetNo}>
          {sh.sheetNo} · {STOCKTAKE_LABELS[sh.status]} · {sh.counted}/{sh.total}
        </option>)}
    </select>
    {sheets===null?<Loading/>:null}
    {(sheets??[]).map(s=><button key={s.sheetNo} type="button"
      className={"cy-stocktake-sheet"+(s.sheetNo===selected?" active":"")} onClick={()=>setSelected(s.sheetNo)}>
      <strong>{s.sheetNo}</strong><span>{s.sheetDate??"尚未讀明細"} · {STOCKTAKE_LABELS[s.status]}</span>
      <small>{s.counted} / {s.total} 列已填寫</small>
    </button>)}
    {sheets?.length===0?<p className="cy-op-empty">尚無盤點單。可以先設定忽略底稿，再按更新盤點單。</p>:null}
   </nav>
   <div className="cy-stocktake-main">
    {!currentSheet?<p className="cy-op-empty">請從左側選擇盤點單（手機版請從上方選單選擇）。</p>:<>
     <header className="cy-stocktake-head">
      <div><h3>{currentSheet.sheetNo} · {STOCKTAKE_LABELS[currentSheet.status]}</h3>
       <p>{currentSheet.sheetDate??"未讀明細"} · 已填 {currentSheet.counted} / {currentSheet.total} 列</p></div>
      <div className="cy-stocktake-actions">
       {manager&&currentSheet.status==="COUNTING"&&currentSheet.detailReadAt?
         <button className="cy-op-button" disabled={busy} type="button" onClick={()=>void afterConfirm("refresh")}>重新整理</button>:null}
       {manager&&currentSheet.status==="COUNTING"?
         <button className="cy-op-button" disabled={busy} type="button" onClick={()=>void afterConfirm("ignore")}>設為忽略</button>:null}
       {manager&&currentSheet.status==="IGNORED"?
         <button className="cy-op-button" disabled={busy} type="button" onClick={()=>void afterConfirm("unignore")}>取消忽略</button>:null}
       {manager&&currentSheet.status==="COUNTING"&&currentSheet.detailReadAt?
         <button className="cy-op-button primary" disabled={busy} type="button" onClick={()=>void afterConfirm("first-confirm")}>第一次確認</button>:null}
       {manager&&currentSheet.status==="RECOUNTING"?
         <button className="cy-op-button primary" disabled={busy} type="button" onClick={()=>void afterConfirm("second-confirm")}>第二次確認並寫回 ERP</button>:null}
       {manager&&currentSheet.status==="WRITE_FAILED"?
         <button className="cy-op-button primary" disabled={busy} type="button" onClick={()=>void afterConfirm("retry-write")}>重新寫回</button>:null}
       {(currentSheet.status==="COUNTING"||currentSheet.status==="RECOUNTING")?
         <button className="cy-op-button" type="button" onClick={()=>setBatchForm({itemCode:"",batch:"",quantity:""})}>新增批號</button>:null}
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
     {currentSheet.status==="COUNTING"?<p className="cy-notice">盲盤中：帳面數量在第一次主管確認前不會由伺服器傳回。</p>:null}
     <div className="cy-store-filters">
      <input className="cy-op-input cy-store-search" type="search" role="search" aria-label="搜尋儲位、品號、品名、批號"
        value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜尋儲位、品號、品名、批號"/>
      <select className="cy-op-input" aria-label="顯示篩選" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}>
       <option value="ALL">全部</option><option value="UNFILLED">未填</option>
       <option value="DIFFERENCE">有差異</option><option value="ADDED">新增批號</option>
      </select>
     </div>
     <label className="cy-stocktake-location-filter">儲位（手機一次顯示一組）
       <select className="cy-op-input" aria-label="選擇盤點儲位" value={location} onChange={e=>setLocation(e.target.value)}>
        {locations.map(l=><option key={l} value={l}>{l}</option>)}
       </select>
     </label>
     <div className="cy-stocktake-lines">
      {visible.map(l=>{
       const field=currentSheet.status==="COUNTING"?"firstQty":"recountQty";
       const stored=field==="firstQty"?l.firstQty:l.recountQty;
       const canEdit=!l.locked&&(currentSheet.status==="COUNTING"||currentSheet.status==="RECOUNTING");
       const edited=drafts[l.lineKey];
       const lastAt=field==="firstQty"?l.firstAt:l.recountAt;
       const lastBy=field==="firstQty"?l.firstByName:l.recountByName;
       return <article className="cy-stocktake-line" key={l.lineKey}>
        <div className="cy-stocktake-line-title"><strong>{l.itemCode} · {l.itemName}</strong>
         {l.isAdded?<span className="cy-notice cy-notice-warning">新增批號</span>:null}
         {l.locked?<span className="cy-store-paid">已鎖定</span>:null}</div>
        <div className="cy-stocktake-meta"><span>{l.spec}</span><span>儲位：{l.location||"—"}</span>
         <span>庫別：{l.warehouseName||"—"}</span><span>批號：{l.batch||"無"}</span><span>單位：{l.unit||"—"}</span></div>
        <div className="cy-stocktake-qty-row">
         <label className="cy-stocktake-field"><span>{currentSheet.status==="COUNTING"?"初盤數量":"複盤數量"}</span>
          <input data-stocktake-qty type="text" inputMode="decimal" className="cy-op-input" disabled={!canEdit||saving===l.lineKey}
           value={edited??stored??""} onChange={e=>changeDraft(l.lineKey,e.target.value)}
           onBlur={()=>void saveLine(l)}
           onKeyDown={e=>nextOnEnter(e,l)} placeholder="未填"/></label>
         {currentSheet.status!=="COUNTING"&&l.bookQty!==undefined?<>
          <div><small>初盤</small><strong>{l.firstQty??"—"}</strong></div>
          <div><small>帳面</small><strong>{l.bookQty}</strong></div>
          <div><small>差異（初盤－帳面）</small><strong>{relativeDiff(l.firstQty,l.bookQty)}</strong></div>
         </>:null}
        </div>
        <div className="cy-stocktake-line-foot"><small>最後填寫：{lastBy??"—"} · {date(lastAt)}</small>
         <button className="cy-op-button compact" type="button" onClick={()=>void showHistory(l)}>修改紀錄</button>
         {l.isAdded&&canEdit?<button className="cy-op-button compact danger" type="button" onClick={()=>void deleteBatch(l)}>刪除批號</button>:null}
        </div>
        {conflict?.key===l.lineKey?<div className="cy-notice cy-notice-warning">
         <p>其他人已修改本列，現在儲存的數量：{stored??"未填"}。</p>
         <button className="cy-op-button" type="button" onClick={()=>{setConflict(null);setDrafts(d=>{const x={...d};delete x[l.lineKey];return x})}}>採用最新結果</button>
         <button className="cy-op-button" type="button" onClick={()=>{setConflict(null);void saveLine(l,true)}}>覆蓋為我的數量</button>
        </div>:null}
       </article>
      })}
      {detail&&visible.length===0?<p className="cy-op-empty">目前沒有符合篩選的盤點列。</p>:null}
     </div>
    </>}
   </div>
  </div>
  {ignoreForm!==null?<Dialog open title="忽略底稿管理" onClose={()=>setIgnoreForm(null)}>
   <form onKeyDown={enterAdvancesFields} onSubmit={e=>void addIgnored(e)}>
    <FormSection><Field label="底稿編號" required size="m"><input className="cy-op-input" pattern="[A-Za-z0-9]{1,20}" maxLength={20}
     value={ignoreForm} onChange={e=>setIgnoreForm(e.target.value)}/></Field></FormSection>
    <div className="cy-op-form-footer"><button className="cy-op-button" type="button" onClick={()=>setIgnoreForm(null)}>取消</button>
     <button className="cy-op-button primary" type="submit" disabled={busy}>新增忽略</button></div>
   </form>
   <section className="cy-stocktake-ignored-list" aria-label="已忽略底稿">
    <h3>已忽略底稿（{ignored.length}）</h3>
    <DataView ariaLabel="已忽略底稿清單" items={ignored} getKey={sh=>sh.sheetNo}
     columns={[
      {key:"sheet",header:"底稿編號",render:sh=><strong>{sh.sheetNo}</strong>},
      {key:"date",header:"底稿日期",render:sh=>sh.sheetDate??"—"},
      {key:"actions",header:"操作",render:sh=><button type="button" className="cy-op-button compact danger"
       disabled={busy} onClick={()=>void removeIgnored(sh)}>取消忽略</button>}
     ]}
     renderCard={sh=><div className="cy-stocktake-ignored-card"><strong>{sh.sheetNo}</strong>
      <span>{sh.sheetDate??"尚無日期"}</span><button type="button" className="cy-op-button compact danger"
       disabled={busy} onClick={()=>void removeIgnored(sh)}>取消忽略</button></div>}
     emptyTitle="目前沒有忽略底稿"
    />
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
