import {useEffect,useRef,useState,type KeyboardEvent,type ChangeEvent,type FocusEvent} from "react";
import type {OrderingSourceKind,OrderingSection} from "../../shared/ordering";
import {parseQuantity,lineState,LINE_STATE_LABELS,CLOSED_AS_LABELS,type OrderingClosedAs} from "../../shared/ordering";
import {IconButton} from "./actions/IconButton";
import {useCompactLayout} from "./foundation/useCompactLayout";
import {ListRow} from "./mobile/ListRow";
import {BottomSheet} from "./overlays/Dialog";
import {Field,FormSection} from "./forms/Field";
export interface GridLine{ id:number;section:OrderingSection;sortOrder:number;itemCode:string;itemName:string;vendorItemCode:string;vendorItemName:string;spec:string;quantityText:string;unit:string;note:string;vendorNameFollows?:boolean;quantity?:number|null;received?:number;closedAs?:OrderingClosedAs|null;closedNote?:string; }
const columns={
 GENERAL:[["itemCode","品號"],["itemName","品名"],["vendorItemCode","廠商品號"],["vendorItemName","廠商品名"],["quantityText","數量"],["unit","單位"],["note","備註"]],
 VENDOR:[["itemCode","品號"],["itemName","品名"],["vendorItemCode","廠商品號"],["vendorItemName","廠商品名"],["quantityText","數量"],["unit","單位"],["note","備註"]],
 CN_REGULAR:[["itemCode","品號"],["itemName","品名"],["quantityText","數量"],["unit","單位"],["note","備註"]],
 CN_CUSTOM:[["itemCode","品號"],["itemName","品名"],["spec","規格"],["quantityText","數量"],["unit","單位"],["note","備註"]],
} as const;
const receiptState=(row:GridLine)=>lineState({quantity:row.quantity===undefined?parseQuantity(row.quantityText).quantity:row.quantity,received:row.received??0,closedAs:row.closedAs??null});
/** What a final save of an unchanged row sends: its own vendor values, so they are remembered. */
const finalPatch=(row:GridLine):Partial<GridLine>=>({...(row.vendorItemCode?{vendorItemCode:row.vendorItemCode}:{}),...(row.vendorNameFollows===false&&row.vendorItemName?{vendorItemName:row.vendorItemName}:{})});
const empty=(section:OrderingSection,id:number):GridLine=>({id,section,sortOrder:0,itemCode:"",itemName:"",vendorItemCode:"",vendorItemName:"",spec:"",quantityText:"",unit:"",note:""});
export type OrderingGridState={dirty:boolean;saving:boolean;failed:boolean};
export type OrderingGridEditor={flush:()=>Promise<boolean>;discard:()=>void;openNew?:()=>void};
type Props={kind:OrderingSourceKind;section:OrderingSection;lines:GridLine[];busy:boolean;readOnly?:boolean;onCommit:(line:GridLine,patch:Partial<GridLine>,final:boolean)=>Promise<GridLine>;onDelete:(line:GridLine)=>Promise<void>;onRegister?:(editor:OrderingGridEditor|null)=>void;onStateChange?:(state:OrderingGridState)=>void;onReorder?:(lineIds:number[])=>Promise<unknown>;
 /** Sent order view: settle the rest of a line that is still waiting (指定結案). Same action as the 未到貨 list. */
 onCloseLine?:(line:GridLine)=>void;
 /** Revising after a partial receipt (user 2026-11-09): only 廠商品號／廠商品名 stay editable; no add, delete or reorder. */
 vendorOnly?:boolean;
 /** A reason to frame a row in red (e.g. the same item is still waiting to arrive), shown on hover. */
 warnRow?:(row:GridLine)=>string|undefined};
const SORTABLE=new Set(["itemCode","itemName","vendorItemCode","vendorItemName"]);
const collator=new Intl.Collator("zh-Hant",{numeric:true,sensitivity:"base"});
export function OrderingGrid({kind,section,lines,busy,readOnly=false,onCommit,onDelete,onRegister,onStateChange,onReorder,onCloseLine,vendorOnly=false,warnRow}:Props){
 const compact=useCompactLayout();
 const [mobileRowId,setMobileRowId]=useState<number|null>(null);
 // View-only sort by a header click (ascending, descending, off); with it off, 項次 drags reorder the saved rows.
 const [sort,setSort]=useState<{field:string;dir:1|-1}|null>(null);
 const dragging=useRef<number|null>(null);
 const [dropTarget,setDropTarget]=useState<number|null>(null);
 const nextTemp=useRef(-2);
 const containerRef=useRef<HTMLDivElement>(null);
 const [drafts,setDrafts]=useState<GridLine[]>(()=>[empty(section,-1)]);
 const draftsRef=useRef(drafts);
 const inFlight=useRef(new Map<number,Promise<boolean>>());
 const savedDrafts=useRef(new Map<number,{line:GridLine;input:GridLine}>());
 const savedRowKeys=useRef(new Map<number,number>());
 const cellSaves=useRef(new Map<string,{value:string;final:boolean;promise:Promise<boolean>}>());
 // Autosave while typing is not final (the server neither fills nor remembers vendor values from it).
 // A blur, Enter or flush makes it final: new rows still saving pick it up, saved rows send it once more.
 const wantFinal=useRef(new Set<number>());
 // Saved rows whose last save was only an autosave, with the fields it carried; the final save resends
 // exactly those, so a cleared field stays cleared and only a 品號 entered just now pulls in ERP values.
 const unfinal=useRef(new Map<number,Set<string>>());
 const markUnfinal=(id:number,field?:string)=>{const set=unfinal.current.get(id)??new Set<string>();if(field)set.add(field);unfinal.current.set(id,set)};
 const markFinal=(id:number,field:string)=>{const set=unfinal.current.get(id);if(!set)return;set.delete(field);if(!set.size)unfinal.current.delete(id)};
 const actionSaves=useRef(new Set<Promise<boolean>>());
 const skipBlur=useRef(new Set<string>());
 const saveTimers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
 const cancelTimer=(key:string)=>{const timer=saveTimers.current.get(key);if(timer!==undefined)clearTimeout(timer);saveTimers.current.delete(key)};
 const cancelAllTimers=()=>{for(const timer of saveTimers.current.values())clearTimeout(timer);saveTimers.current.clear()};
 const [editing,setEditing]=useState<Record<string,string>>({});
 const editingRef=useRef(editing);
 const [saveError,setSaveError]=useState(false);
 const setEdits=(update:(previous:Record<string,string>)=>Record<string,string>)=>{editingRef.current=update(editingRef.current);setEditing(editingRef.current)};
 useEffect(()=>{cancelAllTimers();draftsRef.current=[empty(section,-1)];setDrafts(draftsRef.current);nextTemp.current=-2;inFlight.current.clear();savedDrafts.current.clear();savedRowKeys.current.clear();cellSaves.current.clear();wantFinal.current.clear();unfinal.current.clear();editingRef.current={};setEditing({});setSaveError(false)},[section,kind]);
 const fields=columns[kind];
 const lockedFields=(row:GridLine):ReadonlySet<string>|null=>readOnly||!vendorOnly||row.id<=0?null:new Set(fields.map(([f])=>f as string).filter(f=>f!=="vendorItemCode"&&f!=="vendorItemName"));
 const lockedTitle=(_row:GridLine)=>"部分到貨後只能修改廠商品號、廠商品名";
 const closable=(row:GridLine)=>readOnly&&!!onCloseLine&&row.id>0&&["OPEN","PARTIAL"].includes(receiptState(row));
 const closedText=(row:GridLine)=>row.closedAs?"指定結案："+CLOSED_AS_LABELS[row.closedAs]+(row.closedNote?"－"+row.closedNote:""):"";
 const mappedIds=new Set([...savedDrafts.current.values()].map(x=>x.line.id));
 // Drag ordering is optimistic (user 2026-11-03): the dropped order shows at once and stays while it
 // saves in the background; new lines from the server (or a failed save) replace it.
 const [localOrder,setLocalOrder]=useState<number[]|null>(null);
 useEffect(()=>{setLocalOrder(null)},[lines]);
 const sectionLines=(()=>{const rows=lines.filter(x=>x.section===section);if(!localOrder)return rows;const at=new Map(localOrder.map((id,i)=>[id,i]));return rows.slice().sort((a,b)=>(at.get(a.id)??1e9)-(at.get(b.id)??1e9))})();
 const sorted=(rows:GridLine[])=>sort?rows.slice().sort((a,b)=>sort.dir*collator.compare(String(a[sort.field as keyof GridLine]??""),String(b[sort.field as keyof GridLine]??""))||a.sortOrder-b.sortOrder):rows;
 const visible=readOnly?sorted(sectionLines):[...sorted(sectionLines.filter(x=>!mappedIds.has(x.id))),...(vendorOnly?[]:drafts)];
 const mobileKey=(row:GridLine)=>savedRowKeys.current.get(row.id)??row.id;
 const mobileRow=visible.find(row=>mobileKey(row)===mobileRowId);
 const canDrag=!readOnly&&!vendorOnly&&!sort&&!!onReorder&&!busy;
 const toggleSort=(field:string)=>setSort(prev=>prev?.field!==field?{field,dir:1}:prev.dir===1?{field,dir:-1}:null);
 const drop=(targetId:number)=>{
  const from=dragging.current;dragging.current=null;setDropTarget(null);
  if(from===null||from===targetId||!onReorder)return;
  const ids=sectionLines.map(x=>x.id),a=ids.indexOf(from),b=ids.indexOf(targetId);if(a<0||b<0)return;
  ids.splice(a,1);ids.splice(b,0,from);
  setLocalOrder(ids);
  runAction(()=>onReorder(ids).catch(error=>{setLocalOrder(null);throw error}));
 };
 // A saved 廠商品名 that still follows 品名 edits as empty (品名 shows as its placeholder), so typing
 // your own never starts by deleting a copy; leaving it empty keeps following 品名.
 const follows=(row:GridLine)=>row.id>0&&row.vendorNameFollows===true;
 const getValue=(row:GridLine,field:string)=>field==="vendorItemName"&&follows(row)?"":String(row[field as keyof GridLine]??"");
 const hasInput=(row:GridLine)=>fields.some(([field])=>getValue(row,field).trim());
 const canSave=(row:GridLine)=>hasInput(row); // partial drafts persist; /send owns completeness validation.
 const hasSavedEdits=(values:Record<string,string>)=>Object.keys(values).some(key=>Number(key.split("|")[0])>0);
 const dirty=!readOnly&&(drafts.some(hasInput)||hasSavedEdits(editing));
 const saving=!readOnly&&(inFlight.current.size>0||cellSaves.current.size>0||actionSaves.current.size>0);
 useEffect(()=>{onStateChange?.({dirty,saving,failed:!readOnly&&saveError})},[dirty,saving,saveError,readOnly,onStateChange]);
 const setDraftValue=(row:GridLine,field:string,value:string)=>{
  draftsRef.current=draftsRef.current.map(d=>d.id===row.id?{...d,[field]:value}:d);
  setDrafts(draftsRef.current);
 };
 const focus=(id:number,field:string)=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const target=id<0?[...savedRowKeys.current].find(([,key])=>key===id)?.[0]??id:id;
  containerRef.current?.querySelector<HTMLInputElement|HTMLTextAreaElement>(`[data-order-row="${target}"][data-order-field="${field}"]`)?.focus();
 }));
 const commitNew=(row:GridLine,final=true)=>{
  if(readOnly)return Promise.resolve(false);
  if(final)wantFinal.current.add(row.id);
  const latest=draftsRef.current.find(d=>d.id===row.id);
  const pending=inFlight.current.get(row.id);if(pending)return pending;
  if(!latest||!canSave(latest))return Promise.resolve(false);
  setSaveError(false);
  // The next editable row exists immediately even with a slow API; never disable its inputs.
  if(draftsRef.current.at(-1)?.id===row.id){
   const another=empty(section,nextTemp.current--);
   draftsRef.current=[...draftsRef.current,another];setDrafts(draftsRef.current);
  }
  const save=async()=>{
   // Follow only newly typed edits; failed requests are never replayed automatically.
   let sentFinal=false;
   for(let pass=0;pass<8;pass++){
    const current=draftsRef.current.find(d=>d.id===row.id);if(!current)return true;
    const known=savedDrafts.current.get(row.id),snapshot={...current};
    const patch:Partial<GridLine>=known?Object.fromEntries(fields.filter(([field])=>getValue(snapshot,field)!==getValue(known.input,field)).map(([field])=>[field,getValue(snapshot,field)])):{...snapshot,id:0};
    const final=wantFinal.current.has(row.id);
    if(!known||Object.keys(patch).length||(final&&!sentFinal)){
     const persisted=await onCommit(known?.line??{...snapshot,id:0},known&&!Object.keys(patch).length?{...finalPatch(known.line),...(known.line.itemCode?{itemCode:known.line.itemCode}:{})}:patch,final);
     if(!persisted||persisted.id<=0)throw new Error("未取得儲存確認，請保留輸入後重試");
     sentFinal=final;
     savedDrafts.current.set(row.id,{line:persisted,input:snapshot});
     savedRowKeys.current.set(persisted.id,row.id);
    }
    const newest=draftsRef.current.find(d=>d.id===row.id);
    if(newest&&fields.some(([field])=>getValue(newest,field)!==getValue(snapshot,field)))continue;
    if(wantFinal.current.has(row.id)&&!sentFinal)continue;
    const saved=savedDrafts.current.get(row.id)?.line;
    if(saved){if(sentFinal)unfinal.current.delete(saved.id);else markUnfinal(saved.id,saved.itemCode?"itemCode":undefined)}
    wantFinal.current.delete(row.id);
    draftsRef.current=draftsRef.current.filter(d=>d.id!==row.id);savedDrafts.current.delete(row.id);
    setDrafts(draftsRef.current);
    setEdits(prev=>Object.fromEntries(Object.entries(prev).filter(([key])=>!key.startsWith(row.id+"|"))));
    return true;
   }
   // Continuous editing is left dirty for the next explicit blur/Enter/flush.
   return false;
  };
  const promise=save().catch(()=>{setSaveError(true);return false}).finally(()=>{inFlight.current.delete(row.id);setDrafts([...draftsRef.current])});
  inFlight.current.set(row.id,promise);setDrafts([...draftsRef.current]);return promise;
 };
 // 廠商品號／品名 the member typed on a saved row in this session. When its 品號 or 品名 changes later, the
 // server drops vendor values that came from the old item's memory; it cannot tell a typed value from a
 // remembered one, so a save of 品號／品名 carries the typed ones along (user 2026-11-03: they vanished).
 // The typed value itself is kept: the row from props may not show it yet while its save is queued.
 const typedVendor=useRef(new Map<number,Map<"vendorItemCode"|"vendorItemName",string>>());
 const withTypedVendor=(row:GridLine,patch:Partial<GridLine>):Partial<GridLine>=>{
  const typed=typedVendor.current.get(row.id);
  if(!typed?.size||!("itemCode" in patch||"itemName" in patch))return patch;
  return {...Object.fromEntries(typed),...patch};
 };
 const commitCell=(row:GridLine,field:keyof GridLine,value:string,final=true):Promise<boolean>=>{
  cancelTimer(row.id+"|"+field);
  if(readOnly)return Promise.resolve(false);
  if(row.id<0){setDraftValue(row,field,value);return commitNew(row,final)}
  const key=row.id+"|"+field,queued=cellSaves.current.get(key);
  if(queued?.value===value){
   if(!final||queued.final)return queued.promise;
   return queued.promise.then(()=>commitFinal(row));
  }
  if(!queued&&getValue(row,field)===value){
   setEdits(prev=>{const n={...prev};delete n[key];return n});
   return final&&unfinal.current.has(row.id)?commitFinal(row):Promise.resolve(true);
  }
  setSaveError(false);
  if(final)markFinal(row.id,field);else markUnfinal(row.id,field);
  if(field==="vendorItemCode"||field==="vendorItemName"){const typed=typedVendor.current.get(row.id)??new Map();if(value.trim())typed.set(field,value);else typed.delete(field);typedVendor.current.set(row.id,typed)}
  const promise=onCommit(row,withTypedVendor(row,{[field]:value}),final).then(()=>{setEdits(prev=>{
    if(prev[key]!==value)return prev;
    const n={...prev};delete n[key];return n;
   });return true}).catch(()=>{setSaveError(true);return false}).finally(()=>{
    if(cellSaves.current.get(key)?.promise===promise)cellSaves.current.delete(key);setDrafts([...draftsRef.current]);
   });
  cellSaves.current.set(key,{value,final,promise});setDrafts([...draftsRef.current]);return promise;
 };
 /** Re-sends a saved row's own vendor values as final, after it was only autosaved. */
 const commitFinal=(row:GridLine)=>{
  const fieldsToResend=unfinal.current.get(row.id);
  if(!fieldsToResend)return Promise.resolve(true);
  unfinal.current.delete(row.id);
  const latest=lines.find(l=>l.id===row.id)??row;
  const patch=withTypedVendor(latest,{...finalPatch(latest),...Object.fromEntries([...fieldsToResend].map(field=>[field,getValue(latest,field)]))});
  const promise=onCommit(latest,patch,true).then(()=>true).catch(()=>{unfinal.current.set(row.id,fieldsToResend);setSaveError(true);return false})
   .finally(()=>{actionSaves.current.delete(promise);setDrafts([...draftsRef.current])});
  actionSaves.current.add(promise);return promise;
 };
 const editor=useRef<OrderingGridEditor>({flush:async()=>true,discard:()=>{}});
 editor.current.discard=()=>{cancelAllTimers();draftsRef.current=[empty(section,nextTemp.current--)];savedDrafts.current.clear();setDrafts(draftsRef.current);setEdits(()=>({}));setSaveError(false);setMobileRowId(null)};
 editor.current.openNew=()=>{
  if(readOnly)return;
  let row=draftsRef.current.find(d=>!hasInput(d));
  if(!row){row=empty(section,nextTemp.current--);draftsRef.current=[...draftsRef.current,row];setDrafts(draftsRef.current)}
  setMobileRowId(row.id);
 };
 editor.current.flush=async()=>{
  cancelAllTimers();
  if(readOnly)return true;
  const work=draftsRef.current.filter(hasInput).map(row=>commitNew(row));
  for(const row of lines.filter(x=>x.section===section)){
   const pending=fields.filter(([field])=>editingRef.current[row.id+"|"+field]!==undefined);
   for(const [field] of pending)work.push(commitCell(row,field,editingRef.current[row.id+"|"+field]));
   if(!pending.length&&unfinal.current.has(row.id))work.push(commitFinal(row));
  }
  work.push(...inFlight.current.values(),...[...cellSaves.current.values()].map(x=>x.promise),...actionSaves.current);
  const okay=(await Promise.all(work)).every(Boolean);
  return okay&&!draftsRef.current.some(hasInput)&&!hasSavedEdits(editingRef.current);
 };
 useEffect(()=>{onRegister?.(readOnly?null:editor.current);return()=>onRegister?.(null)},[onRegister,readOnly]);
 function enter(e:KeyboardEvent<HTMLInputElement|HTMLTextAreaElement>,row:GridLine,col:number){
  if(e.key!=="Enter"||e.nativeEvent.isComposing)return;
  e.preventDefault();
  const field=fields[col][0];
  const target=e.currentTarget;
  if(row.id>0)skipBlur.current.add(row.id+"|"+field);
  commitCell(row,field,target.value);
  const locked=lockedFields(row),nextCol=fields.findIndex(([f],c)=>c>col&&!locked?.has(f));
  if(nextCol>=0)focus(row.id,fields[nextCol][0]);
  else{
   const currentRows=[...lines.filter(x=>x.section===section),...draftsRef.current];
   const index=currentRows.findIndex(r=>r.id===row.id);
   let next=currentRows[index+1];
   if(!next&&row.id<0){
    next=empty(section,nextTemp.current--);
    draftsRef.current=[...draftsRef.current,next];setDrafts(draftsRef.current);
   }
   if(next){const lockedNext=lockedFields(next);focus(next.id,(fields.find(([f])=>!lockedNext?.has(f))??fields[0])[0])}
  }
 }
 const scheduleSave=(row:GridLine,field:string,value:string)=>{
  const key=row.id+"|"+field;cancelTimer(key);
  saveTimers.current.set(key,setTimeout(()=>{
   saveTimers.current.delete(key);
   if(row.id<0){void commitNew(row,false)}
   else{void commitCell(row,field as keyof GridLine,editingRef.current[key]??value,false)}
  },900));
 };
 useEffect(()=>()=>cancelAllTimers(),[]);
 const runAction=(job:()=>Promise<unknown>)=>{
  setSaveError(false);
  const promise=job().then(()=>true).catch(()=>{setSaveError(true);return false}).finally(()=>{actionSaves.current.delete(promise);setDrafts([...draftsRef.current])});
  actionSaves.current.add(promise);setDrafts([...draftsRef.current]);
 };

 const renderEditor=(row:GridLine,field:keyof GridLine,title:string,col:number,index:number)=>{
  const key=row.id+"|"+field,value=editing[key]??getValue(row,field);
  const multiline=field==="itemName"||field==="vendorItemName"||field==="note";
  const props={
   "data-order-row":row.id,"data-order-field":field,
   className:"cy-ordering-cell"+(multiline?" cy-ordering-multiline":""),
   "aria-label":title+" 第"+(index+1)+"列",title,value,disabled:busy,
   placeholder:field==="vendorItemName"&&row.itemName?row.itemName:undefined,
   "aria-busy":inFlight.current.has(row.id)||undefined,
   required:field==="quantityText"||(field==="itemName"&&kind!=="GENERAL"&&kind!=="VENDOR"),
   onChange:(e:ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>{
    setEdits(prev=>({...prev,[key]:e.target.value}));
    if(row.id<0)setDraftValue(row,field,e.target.value);
    scheduleSave(row,field,e.target.value);
   },
   onBlur:(e:FocusEvent<HTMLInputElement|HTMLTextAreaElement>)=>{
    const id=row.id+"|"+field;
    if(skipBlur.current.delete(id)){cancelTimer(id);return}
    void commitCell(row,field,e.currentTarget.value);
   },
   onKeyDown:(e:KeyboardEvent<HTMLInputElement|HTMLTextAreaElement>)=>enter(e,row,col),
  };
  return multiline?<textarea {...props} rows={1} ref={element=>{if(element){element.style.height="34px";element.style.height=Math.min(176,Math.max(34,element.scrollHeight))+"px"}}}/>:<input {...props}/>;
 };
 const closeMobileSheet=()=>{
  if(readOnly){setMobileRowId(null);return}
  void editor.current.flush().then(ok=>{if(ok)setMobileRowId(null)});
 };
 return <div ref={containerRef} className="cy-ordering-grid-scroll" role="region" aria-label="叫貨明細" tabIndex={0}>
 {compact?<div className="cy-mobile-editable-list" aria-label="叫貨品項">
  {visible.filter(row=>row.id>0||hasInput(row)).map((row,i)=><ListRow key={mobileKey(row)}
   title={(i+1)+". "+(row.itemName||row.vendorItemName||"未命名品項")}
   subtitle={row.itemCode||"未填品號"}
   trailing={<span>{row.quantityText?row.quantityText+(row.unit?" "+row.unit:""):"未填數量"}{readOnly?<small>{LINE_STATE_LABELS[receiptState(row)]??"待到貨"}</small>:null}</span>}
   label={"編輯第"+(i+1)+"項 "+(row.itemName||row.itemCode||"未命名品項")}
   selected={mobileKey(row)===mobileRowId} onClick={()=>setMobileRowId(mobileKey(row))}/>)}
  {!readOnly&&!visible.some(row=>row.id>0||hasInput(row))?<p className="cy-op-empty">尚無品項，請按「新增品項」。</p>:null}
  {mobileRow?<BottomSheet open title={(readOnly?"查看":"編輯")+"品項："+(mobileRow.itemName||mobileRow.itemCode||"新項目")} onClose={closeMobileSheet}>
   <FormSection>{fields.map(([field,title],col)=><Field key={field} label={title} size="l" required={!readOnly&&(field==="quantityText"||(field==="itemName"&&kind!=="GENERAL"&&kind!=="VENDOR"))}>
    {readOnly||lockedFields(mobileRow)?.has(field)?<span>{String(mobileRow[field]??"")}</span>:renderEditor(mobileRow,field,title,col,visible.findIndex(x=>mobileKey(x)===mobileRowId))}
   </Field>)}</FormSection>
   {readOnly?<p>狀態：{LINE_STATE_LABELS[receiptState(mobileRow)]??"待到貨"}{mobileRow.closedAs?"・"+closedText(mobileRow):""}</p>:lockedFields(mobileRow)?<p>{lockedTitle(mobileRow)}</p>:null}
   <div className="cy-op-form-footer">
    {mobileRow.id>0&&!readOnly&&!lockedFields(mobileRow)?<button type="button" className="cy-op-button danger" disabled={busy} onClick={()=>{runAction(()=>onDelete(mobileRow));setMobileRowId(null)}}>刪除品項</button>:null}
    {closable(mobileRow)?<button type="button" className="cy-op-button" disabled={busy} onClick={()=>{setMobileRowId(null);onCloseLine!(mobileRow)}}>指定結案</button>:null}
    <button type="button" className="cy-op-button primary" disabled={busy} onClick={closeMobileSheet}>{readOnly?"關閉":"儲存並關閉"}</button>
   </div>
  </BottomSheet>:null}
 </div>:<table className="cy-ordering-grid" data-kind={kind} data-readonly={readOnly||undefined}>
   <colgroup><col className="cy-ordering-col-index"/>{fields.flatMap(([field])=>[<col key={field} className={"cy-ordering-col-"+field}/>,...(readOnly&&field==="quantityText"?[<col key="received" className="cy-ordering-col-received"/>]:[])])}{readOnly?<col className="cy-ordering-col-status"/>:<col className="cy-ordering-col-actions"/>}</colgroup>
   <thead><tr><th scope="col">項次</th>{fields.flatMap(([field,label])=>[<th scope="col" key={field} aria-sort={sort?.field===field?(sort.dir===1?"ascending":"descending"):undefined}>{SORTABLE.has(field)?<button type="button" className="cy-ordering-sort" data-active={sort?.field===field||undefined} title={"依"+label+"排序（再按一次反向，第三次取消）"} onClick={()=>toggleSort(field)}>{label}<svg viewBox="0 0 10 14" width="8" height="12" aria-hidden="true"><path d="M5 1 8.5 5h-7z" data-on={sort?.field===field&&sort.dir===1||undefined}/><path d="M5 13 1.5 9h7z" data-on={sort?.field===field&&sort.dir===-1||undefined}/></svg></button>:label}</th>,...(readOnly&&field==="quantityText"?[<th scope="col" key="received">已到數量</th>]:[])])}{readOnly?<th scope="col">狀態</th>:<th scope="col">操作</th>}</tr></thead>
   <tbody>{visible.map((row,i)=>{const warning=warnRow?.(row);return <tr key={savedRowKeys.current.get(row.id)??row.id} data-saving={inFlight.current.has(row.id)||undefined} data-warning={warning?true:undefined} title={warning} data-drop-target={dropTarget===row.id||undefined}
    onDragOver={e=>{if(dragging.current!==null&&row.id>0){e.preventDefault();if(dropTarget!==row.id)setDropTarget(row.id)}}} onDrop={e=>{e.preventDefault();drop(row.id)}}>
    <td data-label="項次" data-col="index" draggable={canDrag&&row.id>0||undefined} className={canDrag&&row.id>0?"cy-ordering-drag":undefined} title={canDrag&&row.id>0?"拖曳調整順序":undefined}
     onDragStart={e=>{dragging.current=row.id;e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",String(row.id))}} onDragEnd={()=>{dragging.current=null;setDropTarget(null)}}>{i+1}</td>
    {fields.flatMap(([field,title],col)=>{

     const locked=readOnly||!!lockedFields(row)?.has(field);
     return [<td key={field} data-label={title} data-col={field} data-locked={!readOnly&&locked||undefined} title={!readOnly&&locked?lockedTitle(row):undefined}>{locked&&field==="note"&&row.closedAs&&!row.note?null:locked?<span className={"cy-ordering-cell-text"+(field==="quantityText"?" cy-ordering-quantity":"")+((field==="itemName"||field==="vendorItemName"||field==="note")?" cy-ordering-wrap":"")}>{String(row[field as keyof GridLine]??"")}</span> :renderEditor(row,field,title,col,i)}
      {field==="note"&&row.closedAs?<small className="cy-ordering-closed-note">{closedText(row)}</small>:null}</td>,...(readOnly&&field==="quantityText"?[<td key="received" data-label="已到數量" data-col="received"><span className="cy-ordering-cell-text cy-ordering-quantity">{row.received??0}</span></td>]:[])];
    })}
    {readOnly?<td className="cy-ordering-status-cell" data-label="狀態" data-col="status"><span className={"cy-ordering-status-chip state-"+receiptState(row).toLowerCase()}>{receiptState(row)==="OPEN"?"待到貨":receiptState(row)==="RECEIVED"?"已到齊":LINE_STATE_LABELS[receiptState(row)]}</span>{closable(row)?<button type="button" className="cy-op-button compact soft cy-ordering-close-line" disabled={busy} onClick={()=>onCloseLine!(row)}>指定結案</button>:null}</td>:null}
    {!readOnly?<td className="cy-ordering-grid-actions" data-label="操作" data-col="actions">{row.id>0&&!lockedFields(row)?<IconButton label={"刪除第"+(i+1)+"列"} disabled={busy||actionSaves.current.size>0} onClick={()=>runAction(()=>onDelete(row))} icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v8m4-8v8"/></svg>}/>:null}</td>:null}</tr>})}</tbody>
  </table>}
  {visible.filter(x=>x.quantityText&&parseQuantity(x.quantityText).quantity===null).map(x=><p key={x.id} className="cy-notice cy-notice-warning">「{x.itemName||x.vendorItemName||x.itemCode}」數量無法拆解，保留文字、不計到貨量。</p>)}
 </div>;
}
