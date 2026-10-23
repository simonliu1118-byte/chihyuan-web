import {Field,CheckField,FormSection,RequiredRows} from "../../ui/forms/Field";
import {useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import {apiRequest,ApiClientError} from "../../api/client";
import {MasterDetailBack,MasterDetailEmpty,useMasterDetailPane} from "../../ui/layout/MasterDetail";
import {StatusFilter} from "../../ui/data/StatusFilter";
import {StatusChip} from "../../ui/primitives/StatusChip";
import type {StatusTone} from "./status-flow";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {Dialog} from "../../ui/overlays/Dialog";
import {FeedbackBanner,useFeedbackMessage} from "../../ui/feedback/FeedbackProvider";
import {enterAdvancesFields} from "../../ui/foundation/enter-advance";
import {OrderingGrid,type GridLine,type OrderingGridEditor,type OrderingGridState} from "../../ui/OrderingGrid";
import {useUnsavedChangesGuard} from "../../ui/foundation/useUnsavedChangesGuard";
import {orderSheet} from "../../../shared/ordering-export";
import "./erp-item-query.css";
import {buildXlsx} from "../../../shared/xlsx-writer";
import {createOrderingWriteQueue,orderingTaipeiDateTime,exportFileName,pickDraft,ORDERING_STATUS_LABELS,CN_REGULAR_SECTIONS,type OrderingOrder,type OrderingSource,type OrderingPendingLine,type OrderingListRow,type OrderingSection} from "../../../shared/ordering";
const ROOT="/api/business/ordering";
const nowDate=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const displayDate=(value:string|null|undefined)=>orderingTaipeiDateTime(value)?.date??"";
const displayTime=(value:string|null|undefined)=>{const p=orderingTaipeiDateTime(value);return p?p.date+" "+p.time:""};
const errorOf=(e:unknown)=>e instanceof ApiClientError&&e.code==="ORDERING_VERSION_CONFLICT"?"已被其他人修改，請重新載入":e instanceof ApiClientError&&["ORDERING_RECEIPT_CONFIRMATION_REQUIRED","ORDERING_UNAVAILABLE"].includes(e.code)?e.message+(e.requestId?"（請求編號："+e.requestId+"）":""):e instanceof Error?e.message:"叫貨操作失敗";
type DisplayOrder=OrderingOrder&{storedStatus:"DRAFT"|"SENT"|"VOID";savedLineId?:number};
type VendorGroup={sourceId:number;sourceName:string;conditions:string;paymentTerms:string;orderId:number|null;orderVersion:number|null;lines:(GridLine&{quantity:number|null})[]};
const STATUS_TONE:Record<string,StatusTone>={DRAFT:"neutral",SENT:"info",PARTIAL:"warning",CLOSED:"success",VOID:"danger"};
const call=<T,>(path:string,method="GET",json?:unknown)=>apiRequest<T>(ROOT+path,{method,json});
function OrderingSaveStatus({states}: {states:OrderingGridState[]}){
 const state=states.some(s=>s.saving)?"saving":states.some(s=>s.failed)?"failed":states.some(s=>s.dirty)?"dirty":"saved";
 return <span className="cy-ordering-save-state" data-state={state} role="status" aria-live="polite">
  {state==="saving"?<span className="cy-loading-spinner cy-ordering-save-spinner" aria-hidden="true"/>:null}
  {state==="saving"?"儲存中":state==="failed"?"儲存失敗":state==="dirty"?"尚未儲存":"已儲存"}
 </span>;
}
export function OrderingPage(){
 const [sources,setSources]=useState<OrderingSource[]>([]),[list,setList]=useState<OrderingListRow[]>([]),[pending,setPending]=useState<OrderingPendingLine[]>([]);
 const [tab,setTab]=useState<number|null>(null),[vendorAll,setVendorAll]=useState(false),[selected,setSelected]=useState<DisplayOrder|null>(null);
 const [search,setSearch]=useState(""),[status,setStatus]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage,reportError,messageTone]=useFeedbackMessage<string|null>(null);
 const setError=(value:string)=>{if(value)reportError(value);else setMessage(null)};
 const setNotice=(value:string)=>setMessage(value);
 const queueRef=useRef(createOrderingWriteQueue());
 const cached=useRef(new Map<number,DisplayOrder>());
 const savedHeader=useRef(new Map<number,{date:string|null;note:string}>());
 const [headerDirty,setHeaderDirty]=useState({date:false,note:false});
 const [headerSaving,setHeaderSaving]=useState(0),[headerSaveFailed,setHeaderSaveFailed]=useState(false);
 const headerDirtyRef=useRef({date:false,note:false});
 const headerEditRevisions=useRef({date:0,note:0});
 const [sourceForm,setSourceForm]=useState<{id?:number;kind:"GENERAL"|"VENDOR";name:string;conditions:string;paymentTerms:string;sortOrder?:number}|null>(null);
 const [sourceFilter,setSourceFilter]=useState("");
 const [manageSources,setManageSources]=useState(false);
 const [receipt,setReceipt]=useState<{id:number;no:string;date:string;quantities:Record<number,string>;selectedLineIds:number[]}|null>(null);
 const [closing,setClosing]=useState<{id:number;kind:"SHORTAGE"|"CANCELLED"|"OTHER";reason:string}|null>(null);
 const [viewPending,setViewPending]=useState(true),[pendingLoading,setPendingLoading]=useState(true),[showHistory,setShowHistory]=useState(false),[drafts,setDrafts]=useState<OrderingListRow[]>([]);
 const [vendorOverview,setVendorOverview]=useState<VendorGroup[]>([]);
 const [vendorQuery,setVendorQuery]=useState("");
 const [vendorSelected,setVendorSelected]=useState<number|null>(null);
 const [vendorTabOrder,setVendorTabOrder]=useState<number[]>([]);
 const vendorDragging=useRef<number|null>(null);
 const [showHiddenSources,setShowHiddenSources]=useState(false);
 const vendorOrderIds=useRef(new Map<number,number>());
 const pane=useMasterDetailPane(),{confirm,confirmationDialog}=useConfirmation();
 const editors=useRef(new Map<string,OrderingGridEditor>());
 const bindings=useRef(new Map<string,{onRegister:(editor:OrderingGridEditor|null)=>void;onStateChange:(state:OrderingGridState)=>void}>());
 const [editorStates,setEditorStates]=useState<Record<string,OrderingGridState>>({});
 const loadSequence=useRef(0);
 useUnsavedChangesGuard({active:Object.values(editorStates).some(s=>s.dirty)||headerDirty.date||headerDirty.note,
  blocked:Object.values(editorStates).some(s=>s.saving),message:"叫貨資料尚未儲存，確定離開？"});
 function gridBindings(key:string){
  if(!bindings.current.has(key))bindings.current.set(key,{
   onRegister(editor){if(editor)editors.current.set(key,editor);else{editors.current.delete(key);setEditorStates(prev=>{if(!prev[key])return prev;const next={...prev};delete next[key];return next})}},
   onStateChange(state){setEditorStates(prev=>prev[key]?.dirty===state.dirty&&prev[key]?.saving===state.saving&&prev[key]?.failed===state.failed?prev:{...prev,[key]:state});if(state.dirty)setMessage(null)},
  });
  return bindings.current.get(key)!;
 }
 async function prepareSwitch(){
  const okay=(await Promise.all([...editors.current.values()].map(e=>e.flush()))).every(Boolean);
  if(headerDirtyRef.current.date)await saveHeader("date");if(headerDirtyRef.current.note)await saveHeader("note");
  if(okay&&!headerDirtyRef.current.date&&!headerDirtyRef.current.note)return true;
  const discard=await confirm({title:"叫貨資料尚未儲存",description:"仍有未填完整或儲存失敗的內容。繼續切換會放棄這些輸入，是否留在這裡補齊或重試？",confirmLabel:"放棄輸入並切換",cancelLabel:"留下繼續編輯",confirmTone:"danger"});
  if(discard){editors.current.forEach(e=>e.discard());headerDirtyRef.current={date:false,note:false};setHeaderDirty({date:false,note:false})}
  return discard;
 }
 const source=sources.find(x=>x.id===tab);
 const active=sources.filter(x=>x.isActive),vendors=active.filter(x=>x.kind==="VENDOR");
 // The history list keeps the filters the user typed; drafts are never listed there.
 const listQuery=useRef("history=1");
 async function refreshLists(){const [b,c]=await Promise.all([call<OrderingListRow[]>("/orders?"+listQuery.current),call<OrderingPendingLine[]>("/pending")]);setList(b);setPending(c)}
 async function refresh(){await Promise.all([
  call<OrderingSource[]>("/sources").then(setSources),
  call<number[]>("/preferences/vendors").then(setVendorTabOrder),
  call<OrderingPendingLine[]>("/pending").then(setPending).finally(()=>setPendingLoading(false)),
 ])}
 useEffect(()=>{void refresh().catch(e=>setError(errorOf(e)))},[]);
 const remember=(x:DisplayOrder)=>{
   cached.current.set(x.id,x);savedHeader.current.set(x.id,{date:x.plannedSendDate,note:x.note});return x;
 };
 const enqueue=<T,>(key:string,job:()=>Promise<T>):Promise<T>=>queueRef.current.enqueue(key,job);
 const showOrder=(x:DisplayOrder)=>{setSelected(x);setHeaderDirty({date:false,note:false});setHeaderSaveFailed(false);headerDirtyRef.current={date:false,note:false};return x};
 async function reloadOrder(id:number){if(!await prepareSwitch())return;const sequence=++loadSequence.current;setBusy(true);
  try{const x=remember(await call<DisplayOrder>("/orders/"+id));if(sequence!==loadSequence.current)return;
   setViewPending(false);setVendorAll(false);pane.open();return showOrder(x);
  }finally{if(sequence===loadSequence.current)setBusy(false)}}
 async function openDraft(sourceId:number){
  if(!await prepareSwitch())return;
  const sequence=++loadSequence.current;
  setTab(sourceId);setVendorAll(false);setSelected(null);
  setBusy(true);setError("");try{
   const all=await call<OrderingListRow[]>("/orders?sourceId="+sourceId+"&status=DRAFT");if(sequence!==loadSequence.current)return;setDrafts(all);
   const chosen=pickDraft(all.map(x=>({id:x.id,plannedSendDate:x.plannedSendDate,createdAt:x.createdAt})),nowDate());
   const x=chosen?await call<DisplayOrder>("/orders/"+chosen.id):await call<DisplayOrder>("/orders","POST",{sourceId});
   if(sequence!==loadSequence.current)return;showOrder(remember(x));
   if(!chosen)setDrafts([{...x}]);setViewPending(false);pane.open();
  }catch(e){if(sequence===loadSequence.current)setError(errorOf(e))}finally{if(sequence===loadSequence.current)setBusy(false)}
 }
 async function selectSource(s:OrderingSource){await openDraft(s.id)}
 async function createDraft(sourceId:number){
  if(!await prepareSwitch())return;
  const sequence=++loadSequence.current;setBusy(true);
  try{const x=remember(await call<DisplayOrder>("/orders","POST",{sourceId}));
   if(sequence!==loadSequence.current)return;setDrafts(prev=>[x,...prev]);
   showOrder(x);setViewPending(false);pane.open();
  }catch(e){setError(errorOf(e))}finally{if(sequence===loadSequence.current)setBusy(false)}
 }
 async function showVendorOverview(){if(!await prepareSwitch())return;const sequence=++loadSequence.current;setBusy(true);
  try{const groups=await call<VendorGroup[]>("/vendors/overview");
    if(sequence!==loadSequence.current)return;setVendorAll(true);setSelected(null);setViewPending(false);
    groups.forEach(x=>{if(x.orderId)vendorOrderIds.current.set(x.sourceId,x.orderId)});
    setVendorOverview(groups);
    setVendorSelected(prev=>groups.some(v=>v.sourceId===prev)?prev:groups[0]?.sourceId??null);
   }catch(e){setError(errorOf(e))}finally{if(sequence===loadSequence.current)setBusy(false)}
 }
 async function showPending(){if(!await prepareSwitch())return;++loadSequence.current;setBusy(false);setViewPending(true);setVendorAll(false);pane.open()}
 async function write(path:string,method:string,input:Record<string,unknown>,refreshId=selected?.id){
  const id=Number(/^\/orders\/(\d+)/.exec(path)?.[1]??refreshId);
  if(!Number.isSafeInteger(id))throw new Error("請先選擇單據");
  return enqueue("order:"+id,async()=>{
   const version=cached.current.get(id)?.version??selected?.version;
   try{
    const data=remember(await call<DisplayOrder>(path,method,{...input,expectedVersion:version}));
    setSelected(previous=>previous?.id===id?
     {...data,plannedSendDate:headerDirtyRef.current.date?previous.plannedSendDate:data.plannedSendDate,note:headerDirtyRef.current.note?previous.note:data.note}:previous);
    // A row commit never disables any editor or steals focus while the network is pending.
    if(method!=="PATCH"&&!path.endsWith("/lines"))setNotice("已儲存");
    if(path.endsWith("/send")||path.endsWith("/void")){
     void call<OrderingListRow[]>("/orders?sourceId="+data.sourceId+"&status=DRAFT").then(setDrafts).catch(e=>setError(errorOf(e)));
    }
    if(data.storedStatus!=="DRAFT")void refreshLists().catch(e=>setError(errorOf(e)));
    return data;
   }catch(e){setError(errorOf(e));throw e}
  });
 }
 async function saveHeader(field:"date"|"note"){
  const current=selected;if(!current||current.storedStatus!=="DRAFT")return;
  const editRevision=headerEditRevisions.current[field];
  const value=field==="date"?current.plannedSendDate:current.note;
  const saved=savedHeader.current.get(current.id);
  if(value===(field==="date"?saved?.date:saved?.note)){setHeaderDirty(prev=>({...prev,[field]:false}));headerDirtyRef.current={...headerDirtyRef.current,[field]:false};return}
  setHeaderSaving(n=>n+1);setHeaderSaveFailed(false);
  try{
   await write("/orders/"+current.id,"PATCH",field==="date"?{plannedSendDate:value}:{note:value});
   if(headerEditRevisions.current[field]===editRevision){setHeaderDirty(prev=>({...prev,[field]:false}));headerDirtyRef.current={...headerDirtyRef.current,[field]:false}}
  }catch{setHeaderSaveFailed(true)/* Banner and modal explain the error; leave the typed value intact. */}
  finally{setHeaderSaving(n=>n-1)}
 }
 async function lineCommit(row:GridLine,patch:Partial<GridLine>){
  if(!selected||selected.storedStatus!=="DRAFT")throw new Error("只有草稿可修改叫貨明細");
  const line={...patch,...(!row.id?{...row,...patch}:{}),...(!row.id?{sortOrder:Date.now()}:{} )};
  const data=await write("/orders/"+selected.id+"/lines","POST",{operation:"save",lineId:row.id||undefined,line});
  const saved=data.lines.find(l=>l.id===(data.savedLineId??row.id));if(!saved)throw new Error("未取得明細儲存確認，請保留輸入後重試");return saved;
 }
 async function removeLine(row:GridLine){if(!selected||!await confirm({title:"刪除叫貨品項",description:"確定刪除「"+(row.itemName||row.vendorItemName)+"」？"}))return;
  await write("/orders/"+selected.id+"/lines","POST",{operation:"delete",lineId:row.id})}
 async function sent(){if(!selected||!await prepareSwitch())return;const current=cached.current.get(selected.id)??selected;const okay=await confirm({title:"送出叫貨單",description:"來源："+current.sourceName+"；品項："+current.lines.length+" 列。確認送出後將記錄實際送出時間與版本 1。",confirmLabel:"確認送出"});if(okay)await write("/orders/"+current.id+"/send","POST",{})}
 async function voidOrder(){if(!selected||!await prepareSwitch())return;if(await confirm({title:"作廢叫貨單",description:"確定作廢？歷史紀錄會保留。",confirmTone:"danger",confirmLabel:"作廢"}))await write("/orders/"+selected.id+"/void","POST",{})}
 async function saveSource(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!sourceForm)return;setBusy(true);try{
   if(sourceForm.id){const original=sources.find(x=>x.id===sourceForm.id);
    await call("/sources/"+sourceForm.id,"PATCH",{name:sourceForm.name,conditions:sourceForm.conditions,paymentTerms:sourceForm.paymentTerms,sortOrder:sourceForm.sortOrder??original?.sortOrder??0});
   }
   else await call("/sources","POST",{name:sourceForm.name,kind:sourceForm.kind,conditions:sourceForm.conditions,paymentTerms:sourceForm.paymentTerms});
   setSourceForm(null);await refresh();void refreshLists().catch(e=>setError(errorOf(e)));if(vendorAll)void showVendorOverview();
  }catch(err){setError(errorOf(err))}finally{setBusy(false)}}
 async function receive(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!receipt||!selected)return;
  const lines=receipt.selectedLineIds.map(lineId=>{const line=selected.lines.find(l=>l.id===lineId);return {lineId,quantity:Number(receipt.quantities[lineId]??((line?.quantity??0)-(line?.received??0)))}});
  if(!lines.length){setError("請至少勾選一列並填到貨數量");return}
  if(lines.some(item=>{const line=selected.lines.find(l=>l.id===item.lineId);return !line||!Number.isFinite(item.quantity)||item.quantity<=0||item.quantity>(line.quantity??0)-line.received})){setError("本次到貨數量須大於 0，且不可超過剩餘數量");return}
  const fullNo="341A-"+receipt.no;
  if(selected.receipts.some(x=>x.erpPurchaseNo===fullNo)&&
    !await confirm({title:"進貨單號重複",description:"本張叫貨單已有「"+fullNo+"」的到貨紀錄。可以繼續登記，但請先確認沒有重複計算。",confirmLabel:"繼續登記"}))return;
  try{const value=await write("/orders/"+receipt.id+"/receipts","POST",{erpPurchaseNo:receipt.no,receivedDate:receipt.date,lines});if(value)setReceipt(null)}
  catch{/* write() already reports the error; retain the form for reconciliation, never silently retry. */}
 }
 async function closeRemaining(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!selected||!closing)return;
  const value=await write("/orders/"+selected.id+"/close","POST",{lineId:closing.id,closedAs:closing.kind,reason:closing.reason});if(value)setClosing(null)}
 async function exportOrder(order:DisplayOrder){
  if(!await prepareSwitch())return;order=cached.current.get(order.id)??order;
  const fallback=order.plannedSendDate??order.sentAt?.slice(0,10)??nowDate();
  const bytes=buildXlsx([orderSheet({sourceName:order.sourceName,sourceKind:order.sourceKind,date:fallback,note:order.note,lines:order.lines})]);
  const blob=new Blob([new Uint8Array(bytes) as BlobPart],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=exportFileName(order.sourceName,fallback);a.click();URL.revokeObjectURL(url);
 }
 async function commitVendorRow(group:VendorGroup,row:GridLine,patch:Partial<GridLine>){
  return enqueue("vendor:"+group.sourceId,async()=>{
   try{
    const chosen=vendorOrderIds.current.get(group.sourceId)??group.orderId;
    const current=chosen?(cached.current.get(chosen)??remember(await call<DisplayOrder>("/orders/"+chosen))):remember(await call<DisplayOrder>("/orders","POST",{sourceId:group.sourceId}));
    vendorOrderIds.current.set(group.sourceId,current.id);
    const data=await call<DisplayOrder>("/orders/"+current.id+"/lines","POST",{operation:"save",expectedVersion:current.version,lineId:row.id>0?row.id:undefined,
      line:{...(!row.id?row:{}),...patch,...(row.id<=0?{sortOrder:Date.now()}:{})}});
    remember(data);setVendorOverview(groups=>groups.map(g=>g.sourceId===group.sourceId?{...g,orderId:data.id,orderVersion:data.version,lines:data.lines}:g));
    const saved=data.lines.find(l=>l.id===(data.savedLineId??row.id));if(!saved)throw new Error("未取得明細儲存確認，請保留輸入後重試");return saved;
   }catch(e){setError(errorOf(e));throw e}
  });
 }
 async function deleteVendorRow(group:VendorGroup,row:GridLine){
  if(!group.orderId||!await confirm({title:"刪除廠商草稿品項",description:"確定刪除「"+(row.itemName||row.vendorItemName)+"」？"}))return;
  return enqueue("vendor:"+group.sourceId,async()=>{
   try{
    const current=await call<DisplayOrder>("/orders/"+(vendorOrderIds.current.get(group.sourceId)??group.orderId));
    const data=remember(await call<DisplayOrder>("/orders/"+current.id+"/lines","POST",{expectedVersion:current.version,operation:"delete",lineId:row.id}));
    setVendorOverview(groups=>groups.map(g=>g.sourceId===group.sourceId?{...g,orderVersion:data.version,lines:data.lines}:g));
   }catch(e){setError(errorOf(e));throw e}
  });
 }
 async function exportVendors(){
  if(!await prepareSwitch())return;
  const view=await call<VendorGroup[]>("/vendors/overview");
  const sheets=view.filter(v=>v.lines.length).map(v=>orderSheet({sourceName:v.sourceName,sourceKind:"VENDOR",date:nowDate(),note:"",lines:v.lines}));
  if(!sheets.length){setError("目前沒有廠商品項");return}
  const bytes=buildXlsx(sheets),blob=new Blob([new Uint8Array(bytes) as BlobPart],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const href=URL.createObjectURL(blob),a=document.createElement("a");a.href=href;a.download=exportFileName("廠商",nowDate());a.click();URL.revokeObjectURL(href);
 }
 const current=selected,editable=current?.storedStatus==="DRAFT";
 const currentSaveStates:OrderingGridState[]=[{dirty:headerDirty.date||headerDirty.note,saving:headerSaving>0,failed:headerSaveFailed},...Object.entries(editorStates).filter(([key])=>key.startsWith(current?.id+"-")).map(([,state])=>state)];
 const orderedVendorGroups=useMemo(()=>{
  const priorities=new Map(vendorTabOrder.map((id,i)=>[id,i]));
  return vendorOverview.slice().sort((a,b)=>{
   if(a.sourceName==="其他")return 1;
   if(b.sourceName==="其他")return -1;
   const rankA=priorities.get(a.sourceId),rankB=priorities.get(b.sourceId);
   if(rankA!==undefined&&rankB!==undefined)return rankA-rankB;
   if(rankA!==undefined)return -1;
   if(rankB!==undefined)return 1;
   const sa=sources.find(x=>x.id===a.sourceId),sb=sources.find(x=>x.id===b.sourceId);
   return (sa?.sortOrder??0)-(sb?.sortOrder??0)||a.sourceId-b.sourceId;
  });
 },[vendorOverview,vendorTabOrder,sources]);
 const movableVendors=orderedVendorGroups.filter(x=>x.sourceName!=="其他");
 const vendorOther=orderedVendorGroups.find(x=>x.sourceName==="其他");
 const activeVendorGroup=orderedVendorGroups.find(x=>x.sourceId===vendorSelected)??orderedVendorGroups[0];
 async function chooseVendor(id:number){if(id===vendorSelected)return;if(!await prepareSwitch())return;setVendorSelected(id)}
 async function savePersonalVendorOrder(ids:number[]){
  const before=vendorTabOrder;setVendorTabOrder(ids);
  try{await call("/preferences/vendors","PUT",{sourceIds:ids})}
  catch(e){setVendorTabOrder(before);setError(errorOf(e))}
 }
 function moveVendor(id:number,targetId:number){
  if(id===targetId)return;
  const ids=movableVendors.map(x=>x.sourceId),from=ids.indexOf(id),to=ids.indexOf(targetId);
  if(from<0||to<0)return;
  ids.splice(from,1);ids.splice(to,0,id);
  void savePersonalVendorOrder(ids);
 }
 async function updateVisibility(s:OrderingSource){
  if(s.isActive&&!await confirm({title:"隱藏叫貨來源",description:"隱藏「"+s.name+"」後不再提供建立新叫貨單；歷史紀錄和到貨資料會保留。",confirmLabel:"隱藏來源"}))return;
  if(!await prepareSwitch())return;
  setBusy(true);
  try{await call("/sources/"+s.id,"PATCH",{isActive:!s.isActive});await refresh();setNotice(s.isActive?"來源已隱藏，歷史單保留":"來源已恢復");if(vendorAll){const groups=await call<VendorGroup[]>("/vendors/overview");setVendorOverview(groups);setVendorSelected(prev=>groups.some(v=>v.sourceId===prev)?prev:groups[0]?.sourceId??null)}}
  catch(e){setError(errorOf(e))}finally{setBusy(false)}
 }
 async function changeSharedOrder(id:number,step:number){
  const ordered=active.slice().sort((a,b)=>a.sortOrder-b.sortOrder||a.id-b.id);
  const from=ordered.findIndex(x=>x.id===id),to=from+step;if(from<0||to<0||to>=ordered.length)return;
  const moved=ordered.splice(from,1)[0];ordered.splice(to,0,moved);
  setBusy(true);
  try{await call("/sources/reorder","POST",{sourceIds:ordered.map(x=>x.id)});await refresh();setNotice("共用來源順序已更新，個人廠商頁籤順序不變")}
  catch(e){setError(errorOf(e))}finally{setBusy(false)}
 }
 const visibleSources=active.filter(x=>x.kind!=="VENDOR");
 // History list (drafts live on the source tabs, not here): search as you type; status narrows the loaded rows.
 useEffect(()=>{
  listQuery.current=new URLSearchParams({history:"1",...(search?{q:search}:{}),...(sourceFilter?{sourceId:sourceFilter}:{}),...(from?{from}:{}),...(to?{to}:{})}).toString();
  const timer=setTimeout(()=>{void call<OrderingListRow[]>("/orders?"+listQuery.current).then(setList).catch(e=>setError(errorOf(e)))},300);
  return ()=>clearTimeout(timer);
 },[search,sourceFilter,from,to]);
 const counts=useMemo(()=>list.reduce<Record<string,number>>((n,x)=>({...n,[x.status]:(n[x.status]??0)+1}),{}),[list]);
 const shown=status?list.filter(x=>x.status===status):list;
 const sentDate=(o:{sentAt:string|null;plannedSendDate:string|null;createdAt:string})=>displayDate(o.sentAt??o.plannedSendDate??o.createdAt);
 const openLines=current?current.lines.filter(l=>l.quantity!==null&&l.received<l.quantity&&!l.closedAs):[];
 return <section className="cy-ordering-page">
  <FeedbackBanner message={message} tone={messageTone}/>
  {messageTone==="danger"&&message?<button type="button" className="cy-op-button" onClick={()=>{setMessage(null);if(selected)void reloadOrder(selected.id);void refresh()}}>重新載入</button>:null}
  <div className="cy-md" data-pane={pane.pane}>
   <section className="cy-op-panel cy-md-list" aria-label="叫貨紀錄">
    <div className="cy-md-toolbar">
     <div className="cy-md-toolbar-lead">
      <button type="button" className={"cy-op-button"+(viewPending?" primary":"")} onClick={()=>void showPending()}>未到貨 {pending.length}</button>
      <input className="cy-op-input" type="search" aria-label="搜尋叫貨紀錄" placeholder="搜尋品號、品名、進貨單號" value={search} onChange={e=>setSearch(e.target.value)}/>
     </div>
     <StatusFilter label="叫貨狀態" value={status} onChange={setStatus} counts={counts}
      options={(["SENT","PARTIAL","CLOSED","VOID"] as const).map(code=>({code,label:ORDERING_STATUS_LABELS[code],tone:STATUS_TONE[code]}))}/>
     <div className="cy-ordering-list-filters">
      <select className="cy-op-input" aria-label="來源" value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}><option value="">全部來源</option>{sources.map(s=><option key={s.id} value={s.id}>{s.name}{s.isActive?"":"（停用）"}</option>)}</select>
      <input type="date" className="cy-op-input" aria-label="起日" max="9999-12-31" value={from} onChange={e=>setFrom(e.target.value)}/>
      <span aria-hidden="true">～</span>
      <input type="date" className="cy-op-input" aria-label="迄日" max="9999-12-31" value={to} onChange={e=>setTo(e.target.value)}/>
     </div>
     <div className="cy-md-count">共 {shown.length} 筆</div>
    </div>
    <div className="cy-op-list">
     {shown.map(o=><button type="button" key={o.id} className={"cy-op-list-row cy-status-row "+(current?.id===o.id&&!viewPending&&!vendorAll?"active":"")}
      aria-current={current?.id===o.id?"true":undefined}
      onClick={()=>void reloadOrder(o.id).catch(e=>setError(errorOf(e)))}>
      <strong>{o.sourceName}</strong>
      <span>{o.sentAt?"送出 ":"建立 "}{sentDate(o)}</span>
      <StatusChip tone={STATUS_TONE[o.status]}>{ORDERING_STATUS_LABELS[o.status]??o.status}</StatusChip>
     </button>)}
     {!shown.length?<div className="cy-op-empty">沒有符合條件的叫貨紀錄。送出後的叫貨單才會出現在這裡。</div>:null}
    </div>
   </section>
   <section className="cy-op-panel cy-md-detail">
    <MasterDetailBack label="叫貨紀錄" onBack={pane.close} disabled={busy}/>
    <div className="cy-ordering-tabbar">
      <div className="cy-op-tabs" role="tablist" aria-label="叫貨來源">
       {visibleSources.map(s=><button key={s.id} type="button" role="tab"
         className={tab===s.id&&!vendorAll&&!viewPending?"active":""} aria-selected={tab===s.id&&!vendorAll&&!viewPending}
         onClick={()=>void selectSource(s)}>{s.name}</button>)}
       <button type="button" role="tab" className={vendorAll?"active":""} aria-selected={vendorAll} onClick={()=>void showVendorOverview()}>廠商</button>
      </div>
      <button type="button" className="cy-op-button quiet" onClick={()=>setManageSources(true)}>管理來源</button>
    </div>
    {viewPending?<>
      <div className="cy-record-header"><div><h2>未到貨明細</h2><p>{pendingLoading?"正在載入未到貨明細…":"已送出、還有剩餘數量的品項，共 "+pending.length+" 項。"}</p></div></div>
      {pending.length?<div className="cy-op-table-wrap"><table className="cy-op-table"><thead><tr><th>來源</th><th>叫貨日</th><th>品號</th><th>品名</th><th>叫貨</th><th>已到</th><th>剩餘</th><th/></tr></thead><tbody>
       {pending.map(l=><tr key={l.lineId}><td>{l.sourceName}</td><td>{displayDate(l.orderDate)}</td><td className="cy-mono">{l.itemCode}</td><td>{l.itemName||l.vendorItemName}</td><td>{l.quantity}{l.unit}</td><td>{l.received}</td><td><strong>{l.remaining}</strong></td>
        <td className="cy-ordering-row-actions"><button className="cy-op-button compact" type="button" onClick={()=>void reloadOrder(l.orderId).then(order=>{if(order)setReceipt({id:l.orderId,no:"",date:nowDate(),quantities:{[l.lineId]:String(l.remaining)},selectedLineIds:[l.lineId]})})}>登記到貨</button>
         <button type="button" className="cy-op-button compact quiet" onClick={()=>void reloadOrder(l.orderId).then(order=>{if(order)setClosing({id:l.lineId,kind:"SHORTAGE",reason:""})})}>結掉</button></td></tr>)}
      </tbody></table></div>:!pendingLoading?<p className="cy-op-empty">目前沒有未到貨的品項。</p>:null}
    </>
    :vendorAll?<>
      <div className="cy-record-header"><div><h2>廠商草稿</h2><p>選擇廠商編輯草稿；拖曳頁籤可調整個人順序。「其他」固定最右。</p></div>
       <div className="cy-record-actions"><button type="button" className="cy-op-button" onClick={()=>void exportVendors().catch(e=>setError(errorOf(e)))}>匯出廠商合併 Excel</button>
        <button type="button" className="cy-op-button" onClick={()=>setSourceForm({kind:"VENDOR",name:"",conditions:"",paymentTerms:""})}>＋ 新增廠商</button></div></div>
      <div className="cy-ordering-vendor-tabs-layout">
       <input className="cy-op-input cy-ordering-vendor-search" type="search" aria-label="速查廠商" placeholder="搜尋廠商" value={vendorQuery} onChange={e=>setVendorQuery(e.target.value)}/>
       <div className="cy-ordering-vendor-tabs" role="tablist" aria-label="廠商草稿頁籤">
        {movableVendors.filter(v=>v.sourceName.toLocaleLowerCase().includes(vendorQuery.trim().toLocaleLowerCase())).map(v=><button type="button" role="tab" key={v.sourceId} className={activeVendorGroup?.sourceId===v.sourceId?"active":""} aria-selected={activeVendorGroup?.sourceId===v.sourceId}
         draggable={!busy} title="拖曳調整自己的廠商頁籤順序" onDragStart={e=>{vendorDragging.current=v.sourceId;e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",String(v.sourceId))}}
         onDragOver={e=>{if(vendorDragging.current!==null)e.preventDefault()}} onDrop={e=>{e.preventDefault();if(vendorDragging.current!==null)moveVendor(vendorDragging.current,v.sourceId);vendorDragging.current=null}}
         onDragEnd={()=>{vendorDragging.current=null}} onClick={()=>void chooseVendor(v.sourceId)}>{v.sourceName}</button>)}
       </div>
       {vendorOther?<button type="button" role="tab" className={"cy-ordering-vendor-other"+(activeVendorGroup?.sourceId===vendorOther.sourceId?" active":"")} aria-selected={activeVendorGroup?.sourceId===vendorOther.sourceId} onClick={()=>void chooseVendor(vendorOther.sourceId)}>其他</button>:null}
      </div>
      {activeVendorGroup?<div className="cy-ordering-vendor-current">
       <div><h3>{activeVendorGroup.sourceName}</h3><div className="cy-ordering-vendor-tab-help">叫貨條件：{activeVendorGroup.conditions||"未設定"}　付款條件：{activeVendorGroup.paymentTerms||"未設定"}</div></div>
       <div className="cy-record-actions">
        {editorStates["vendor:"+activeVendorGroup.sourceId]?<OrderingSaveStatus states={[editorStates["vendor:"+activeVendorGroup.sourceId]]}/>:null}
        {activeVendorGroup.sourceName!=="其他"?<div className="cy-ordering-vendor-move">
         <button type="button" className="cy-op-button compact quiet" aria-label="將此廠商頁籤向前" disabled={movableVendors[0]?.sourceId===activeVendorGroup.sourceId} onClick={()=>{const ix=movableVendors.findIndex(x=>x.sourceId===activeVendorGroup.sourceId);if(ix>0)moveVendor(activeVendorGroup.sourceId,movableVendors[ix-1].sourceId)}}>←</button>
         <button type="button" className="cy-op-button compact quiet" aria-label="將此廠商頁籤向後" disabled={movableVendors.at(-1)?.sourceId===activeVendorGroup.sourceId} onClick={()=>{const ix=movableVendors.findIndex(x=>x.sourceId===activeVendorGroup.sourceId);if(ix>=0&&ix<movableVendors.length-1)moveVendor(activeVendorGroup.sourceId,movableVendors[ix+1].sourceId)}}>→</button>
        </div>:null}
        <button type="button" className="cy-op-button compact quiet" onClick={()=>{const v=vendors.find(x=>x.id===activeVendorGroup.sourceId);if(v)void selectSource(v)}}>進入廠商</button>
       </div></div>:<p className="cy-op-empty">目前沒有可使用的廠商來源。</p>}
      {activeVendorGroup?<OrderingGrid key={activeVendorGroup.sourceId} kind="VENDOR" section="" lines={activeVendorGroup.lines} busy={busy} {...gridBindings("vendor:"+activeVendorGroup.sourceId)}
       onCommit={(row,patch)=>commitVendorRow(activeVendorGroup,row,patch)} onDelete={async row=>{await deleteVendorRow(activeVendorGroup,row)}}/>:null}
    </>
    :current?<>
      <div className="cy-record-header">
       <div><h2>{current.sourceName} <StatusChip tone={STATUS_TONE[current.status]}>{ORDERING_STATUS_LABELS[current.status]}</StatusChip></h2>
        <p>{current.storedStatus==="DRAFT"?(current.plannedSendDate?"預計 "+displayDate(current.plannedSendDate)+" 送出":"尚未設定預計送出日")+"・"+current.lines.length+" 項"
         :"送出 "+displayTime(current.sentAt)+"・版本 "+current.revision+"・"+current.lines.length+" 項"}{editable?<>・<OrderingSaveStatus states={currentSaveStates}/></>:null}</p></div>
       <div className="cy-record-actions">
        {current.storedStatus!=="DRAFT"?<button type="button" className="cy-op-button" onClick={()=>void openDraft(current.sourceId)}>回到草稿</button>:null}
        <button type="button" className="cy-op-button" onClick={()=>void exportOrder(current)}>匯出 Excel</button>
        {current.storedStatus!=="VOID"?<button type="button" className="cy-op-button danger" onClick={()=>void voidOrder()}>作廢</button>:null}
        {current.storedStatus==="SENT"&&openLines.length?<button type="button" className="cy-op-button primary" onClick={()=>setReceipt({id:current.id,no:"",date:nowDate(),quantities:Object.fromEntries(openLines.map(l=>[l.id,String((l.quantity??0)-l.received)])),selectedLineIds:[]})}>登記到貨</button>:null}
        {current.storedStatus==="DRAFT"?<button type="button" className="cy-op-button primary" onClick={()=>void sent()}>送出</button>:null}
       </div>
      </div>
      {current.receipts.length?<section className="cy-ordering-lines" aria-label="到貨紀錄"><h3>到貨紀錄<small>{current.receipts.length} 筆</small></h3>
       <div className="cy-op-table-wrap"><table className="cy-op-table"><thead><tr><th>ERP 進貨單號</th><th>到貨日期</th></tr></thead><tbody>
        {current.receipts.map(x=><tr key={x.id}><td className="cy-mono">{x.erpPurchaseNo}</td><td>{displayDate(x.receivedDate)}</td></tr>)}</tbody></table></div></section>:null}
      {current.storedStatus==="DRAFT"?<div className="cy-ordering-drafts" role="group" aria-label="草稿">
        <span>草稿</span>
        {drafts.map(d=><button key={d.id} type="button" className={"cy-ordering-draft-chip"+(d.id===current.id?" active":"")} aria-pressed={d.id===current.id}
          onClick={()=>{if(d.id!==current.id)void reloadOrder(d.id)}}>{d.plannedSendDate?displayDate(d.plannedSendDate).slice(5):"無預計日"}</button>)}
        <button type="button" className="cy-op-button compact quiet" onClick={()=>void createDraft(current.sourceId)}>＋ 新草稿</button>
      </div>:null}
      {sources.find(x=>x.id===current.sourceId)?.kind==="VENDOR"?<p className="cy-ordering-vendor-note">廠商條件：<strong className="cy-ordering-vendor-condition">{sources.find(x=>x.id===current.sourceId)?.conditions||"未設定"}</strong>　付款條件：{sources.find(x=>x.id===current.sourceId)?.paymentTerms||"未設定"}
       <button type="button" className="cy-op-button compact quiet" onClick={()=>{const s=sources.find(x=>x.id===current.sourceId);if(s)setSourceForm({id:s.id,kind:"VENDOR",name:s.name,conditions:s.conditions,paymentTerms:s.paymentTerms,sortOrder:s.sortOrder})}}>修改</button></p>:null}
      {editable?<form onKeyDown={enterAdvancesFields} onSubmit={e=>{e.preventDefault();if(headerDirty.date)void saveHeader("date");if(headerDirty.note)void saveHeader("note")}}>
       <FormSection>
        <Field label="預計送出日期" size="s"><input type="date" className="cy-op-input" max="9999-12-31" disabled={!editable} value={current.plannedSendDate??""} onChange={e=>{headerEditRevisions.current.date++;headerDirtyRef.current={...headerDirtyRef.current,date:true};setHeaderDirty(v=>({...v,date:true}));setSelected(v=>v?{...v,plannedSendDate:e.target.value||null}:v)}} onBlur={()=>void saveHeader("date")}/></Field>
        <Field label="單據備註" size="m" hint={headerDirty.date||headerDirty.note?"離開欄位後自動儲存":undefined}><input className="cy-op-input" disabled={!editable} value={current.note} onChange={e=>{headerEditRevisions.current.note++;headerDirtyRef.current={...headerDirtyRef.current,note:true};setHeaderDirty(v=>({...v,note:true}));setSelected(v=>v?{...v,note:e.target.value}:v)}} onBlur={()=>void saveHeader("note")}/></Field>
       </FormSection>
      </form>:<dl className="cy-ordering-order-summary"><div><dt>預計送出日期</dt><dd>{displayDate(current.plannedSendDate)||"—"}</dd></div><div><dt>單據備註</dt><dd>{current.note||"—"}</dd></div></dl>}
      {(current.sourceKind==="CN_REGULAR"?CN_REGULAR_SECTIONS:[{key:"" as const,label:"叫貨明細"}]).map(group=><section key={group.key} className="cy-ordering-lines">
        <h3>{group.label}<small>{current.lines.filter(l=>(l.section??"")===group.key).length} 項</small></h3>
        <OrderingGrid kind={current.sourceKind} section={group.key as OrderingSection} key={current.id+"-"+group.key} lines={current.lines} busy={busy} readOnly={!editable} {...gridBindings(current.id+"-"+group.key)} onCommit={lineCommit} onDelete={removeLine}/></section>)}
      {current.revisions.length?<section className="cy-ordering-lines"><h3>修改紀錄<small>{current.revisions.length} 筆</small>
        <button type="button" className="cy-op-button compact quiet" aria-expanded={showHistory} onClick={()=>setShowHistory(v=>!v)}>{showHistory?"收合":"展開"}</button></h3>
       {showHistory?<div className="cy-op-table-wrap"><table className="cy-op-table"><thead><tr><th>版本</th><th>時間</th><th>人員</th><th>內容</th></tr></thead><tbody>
        {current.revisions.map(x=><tr key={x.revision}><td>{x.revision}</td><td>{displayTime(x.at)}</td><td>{x.by}</td><td>{x.summary}</td></tr>)}</tbody></table></div>:null}</section>:null}
    </>:<MasterDetailEmpty title={busy?"正在載入草稿":"選擇叫貨來源"} hint={busy?"":"從上方頁籤選擇來源開始叫貨，或從左側開啟已送出的叫貨單。"}/>}
   </section>
  </div>
  {manageSources?<Dialog open title="管理叫貨來源" onClose={()=>setManageSources(false)} size="large">
    <div className="cy-ordering-source-management">
     <div className="cy-record-actions"><label><input type="checkbox" checked={showHiddenSources} onChange={e=>setShowHiddenSources(e.target.checked)}/> 顯示已隱藏來源</label></div>
     <div className="cy-op-table-wrap"><table className="cy-op-table">
      <thead><tr><th scope="col">名稱</th><th scope="col">類型</th><th scope="col">叫貨條件</th><th scope="col">付款條件</th><th scope="col">操作</th></tr></thead>
      <tbody>{sources.filter(x=>x.isActive||showHiddenSources).map(s=><tr key={s.id} data-hidden={!s.isActive||undefined}>
       <td><strong>{s.name}</strong>{!s.isActive?<small>（已隱藏）</small>:null}</td>
       <td>{s.kind==="VENDOR"?"外部廠商":"公司內部"}</td>
       <td className="cy-ordering-source-note">{s.conditions||"—"}</td>
       <td className="cy-ordering-source-note">{s.paymentTerms||"—"}</td>
       <td className="cy-ordering-source-actions">
        <button type="button" className="cy-op-button compact quiet" disabled={busy} onClick={()=>setSourceForm({id:s.id,kind:s.kind==="VENDOR"?"VENDOR":"GENERAL",name:s.name,conditions:s.conditions,paymentTerms:s.paymentTerms,sortOrder:s.sortOrder})}>修改</button>
        {s.isActive?<><button type="button" className="cy-op-button compact quiet" disabled={busy||active[0]?.id===s.id} aria-label={"將 "+s.name+" 排序向前"} onClick={()=>void changeSharedOrder(s.id,-1)}>↑</button>
         <button type="button" className="cy-op-button compact quiet" disabled={busy||active.at(-1)?.id===s.id} aria-label={"將 "+s.name+" 排序向後"} onClick={()=>void changeSharedOrder(s.id,1)}>↓</button></>:null}
        <button type="button" className="cy-op-button compact quiet" disabled={busy} onClick={()=>void updateVisibility(s)}>{s.isActive?"隱藏":"恢復"}</button>
       </td></tr>)}</tbody>
     </table></div>
     <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={()=>setManageSources(false)}>關閉</button>
      <button type="button" className="cy-op-button primary" onClick={()=>setSourceForm({kind:"GENERAL",name:"",conditions:"",paymentTerms:""})}>＋ 新增來源</button></div>
    </div>
  </Dialog>:null}
  {sourceForm?<Dialog open title={sourceForm.id?"修改叫貨來源":"新增叫貨來源"} onClose={()=>setSourceForm(null)}><form onKeyDown={enterAdvancesFields} onSubmit={e=>void saveSource(e)}>
    <FormSection>
     <Field label="名稱" size="m" required><input className="cy-op-input" maxLength={40} required value={sourceForm.name} onChange={e=>setSourceForm(s=>s?{...s,name:e.target.value}:s)}/></Field>
     {!sourceForm.id?<Field label="類型" size="s"><select className="cy-op-input" value={sourceForm.kind} onChange={e=>setSourceForm(s=>s?{...s,kind:e.target.value as "GENERAL"|"VENDOR"}:s)}><option value="GENERAL">公司內部</option><option value="VENDOR">外部廠商</option></select></Field>:null}
     <Field label="叫貨條件" size="m"><input className="cy-op-input" maxLength={500} value={sourceForm.conditions} onChange={e=>setSourceForm(s=>s?{...s,conditions:e.target.value}:s)}/></Field>
     <Field label="付款條件" size="m"><input className="cy-op-input" maxLength={200} placeholder="例如：月結30天、貨到付款" value={sourceForm.paymentTerms} onChange={e=>setSourceForm(s=>s?{...s,paymentTerms:e.target.value}:s)}/></Field>
    </FormSection>
    <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={()=>setSourceForm(null)}>取消</button><button type="submit" className="cy-op-button primary" disabled={busy}>儲存</button></div>
   </form></Dialog>:null}
  {receipt&&selected?<Dialog open title="登記到貨" onClose={()=>setReceipt(null)} size="large" className="cy-ordering-receipt-dialog"><form onKeyDown={enterAdvancesFields} onSubmit={e=>void receive(e)}>
    <FormSection>
   <Field label="ERP 進貨單號 341A-" size="m" required><input className="cy-op-input" inputMode="numeric" pattern="[0-9]{11}" maxLength={11} value={receipt.no} onChange={e=>setReceipt(v=>v?{...v,no:e.target.value}:v)}/></Field>
   <Field label="到貨日期" size="s" required><input className="cy-op-input" type="date" max="9999-12-31" value={receipt.date} onChange={e=>setReceipt(v=>v?{...v,date:e.target.value}:v)}/></Field>
    </FormSection>
   <RequiredRows label="至少選擇一項到貨品項" satisfied={receipt.selectedLineIds.length>0}/>
   <div className="cy-op-table-wrap" role="region" aria-label="登記到貨品項" tabIndex={0}><table className="cy-op-table cy-ordering-grid cy-ordering-receipt-table">
    <colgroup><col className="cy-ordering-receipt-col-select"/><col className="cy-ordering-receipt-col-code"/><col/><col className="cy-ordering-receipt-col-vendor-code"/><col/><col className="cy-ordering-receipt-col-quantity"/><col className="cy-ordering-receipt-col-quantity"/><col className="cy-ordering-receipt-col-quantity"/><col className="cy-ordering-receipt-col-input"/></colgroup>
    <thead><tr><th scope="col">選取</th><th scope="col">品號</th><th scope="col">品名</th><th scope="col">廠商品號</th><th scope="col">廠商品名</th><th scope="col">叫貨數量</th><th scope="col">已到數量</th><th scope="col">剩餘數量</th><th scope="col">本次到貨</th></tr></thead><tbody>
    {selected.lines.filter(l=>l.quantity!==null&&l.received<l.quantity&&!l.closedAs).map((l,i)=>{const remaining=(l.quantity??0)-l.received,checked=receipt.selectedLineIds.includes(l.id);return <tr key={l.id}>
     <td><CheckField label={<span className="cy-ordering-visually-hidden">選取第 {i+1} 項 {l.itemName||l.vendorItemName}</span>} checked={checked} onChange={e=>setReceipt(v=>v?{...v,selectedLineIds:e.target.checked?[...v.selectedLineIds,l.id]:v.selectedLineIds.filter(id=>id!==l.id)}:v)}/></td>
     <td className="cy-mono">{l.itemCode}</td><td>{l.itemName}</td><td className="cy-mono">{l.vendorItemCode}</td><td>{l.vendorItemName}</td><td>{l.quantity}{l.unit}</td><td>{l.received}</td><td>{remaining}</td>
     <td><Field label={"本次到貨數量 第"+(i+1)+"列"} size="s" required={checked}><input className="cy-op-input" type="number" min="0" max={remaining} step="any" disabled={!checked} value={receipt.quantities[l.id]??String(remaining)} onChange={e=>setReceipt(v=>v?{...v,quantities:{...v.quantities,[l.id]:e.target.value}}:v)}/></Field></td>
    </tr>})}</tbody></table></div>
   <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={()=>setReceipt(null)}>取消</button><button type="submit" className="cy-op-button primary">儲存到貨</button></div>
  </form></Dialog>:null}
  {closing?<Dialog open title="結掉剩餘量" onClose={()=>setClosing(null)}><form onKeyDown={enterAdvancesFields} onSubmit={e=>void closeRemaining(e)}>
    <FormSection><Field label="處理方式" size="m"><select className="cy-op-input" value={closing.kind} onChange={e=>setClosing(v=>v?{...v,kind:e.target.value as typeof v.kind}:v)}><option value="SHORTAGE">缺貨</option><option value="CANCELLED">取消</option><option value="OTHER">其他</option></select></Field>
   <Field label="原因" size="l" required={closing.kind==="OTHER"}><input className="cy-op-input" value={closing.reason} onChange={e=>setClosing(v=>v?{...v,reason:e.target.value}:v)}/></Field>
    </FormSection>
   <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={()=>setClosing(null)}>取消</button><button type="submit" className="cy-op-button primary">確認</button></div>
  </form></Dialog>:null}
  {confirmationDialog}
 </section>;
}
