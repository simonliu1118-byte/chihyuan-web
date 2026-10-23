import {useEffect,useRef,useState,type KeyboardEvent} from "react";
import type {OrderingSourceKind,OrderingSection} from "../../shared/ordering";
import {orderingLineHasName,parseQuantity,lineState,LINE_STATE_LABELS,CLOSED_AS_LABELS,type OrderingClosedAs} from "../../shared/ordering";
import {IconButton} from "./actions/IconButton";
export interface GridLine{ id:number;section:OrderingSection;sortOrder:number;itemCode:string;itemName:string;vendorItemCode:string;vendorItemName:string;spec:string;quantityText:string;unit:string;note:string;vendorNameFollows?:boolean;quantity?:number|null;received?:number;closedAs?:OrderingClosedAs|null;closedNote?:string; }
const columns={
 GENERAL:[["itemCode","品號"],["itemName","品名"],["vendorItemCode","廠商品號"],["vendorItemName","廠商品名"],["quantityText","數量"],["unit","單位"],["note","備註"]],
 VENDOR:[["itemCode","品號"],["itemName","品名"],["vendorItemCode","廠商品號"],["vendorItemName","廠商品名"],["quantityText","數量"],["unit","單位"],["note","備註"]],
 CN_REGULAR:[["itemCode","品號"],["itemName","品名"],["quantityText","數量"],["unit","單位"],["note","備註"]],
 CN_CUSTOM:[["itemCode","品號"],["itemName","品名"],["spec","規格"],["quantityText","數量"],["unit","單位"],["note","備註"]],
} as const;
const receiptState=(row:GridLine)=>lineState({quantity:row.quantity===undefined?parseQuantity(row.quantityText).quantity:row.quantity,received:row.received??0,closedAs:row.closedAs??null});
const empty=(section:OrderingSection,id:number):GridLine=>({id,section,sortOrder:0,itemCode:"",itemName:"",vendorItemCode:"",vendorItemName:"",spec:"",quantityText:"",unit:"",note:""});
export type OrderingGridState={dirty:boolean;saving:boolean;failed:boolean};
export type OrderingGridEditor={flush:()=>Promise<boolean>;discard:()=>void};
type Props={kind:OrderingSourceKind;section:OrderingSection;lines:GridLine[];busy:boolean;readOnly?:boolean;onCommit:(line:GridLine,patch:Partial<GridLine>)=>Promise<GridLine>;onDelete:(line:GridLine)=>Promise<void>;onRegister?:(editor:OrderingGridEditor|null)=>void;onStateChange?:(state:OrderingGridState)=>void};
export function OrderingGrid({kind,section,lines,busy,readOnly=false,onCommit,onDelete,onRegister,onStateChange}:Props){
 const nextTemp=useRef(-2);
 const containerRef=useRef<HTMLDivElement>(null);
 const [drafts,setDrafts]=useState<GridLine[]>(()=>[empty(section,-1)]);
 const draftsRef=useRef(drafts);
 const inFlight=useRef(new Map<number,Promise<boolean>>());
 const savedDrafts=useRef(new Map<number,{line:GridLine;input:GridLine}>());
 const savedRowKeys=useRef(new Map<number,number>());
 const cellSaves=useRef(new Map<string,{value:string;promise:Promise<boolean>}>());
 const actionSaves=useRef(new Set<Promise<boolean>>());
 const skipBlur=useRef(new Set<string>());
 const [editing,setEditing]=useState<Record<string,string>>({});
 const editingRef=useRef(editing);
 const [saveError,setSaveError]=useState(false);
 const setEdits=(update:(previous:Record<string,string>)=>Record<string,string>)=>{editingRef.current=update(editingRef.current);setEditing(editingRef.current)};
 useEffect(()=>{draftsRef.current=[empty(section,-1)];setDrafts(draftsRef.current);nextTemp.current=-2;inFlight.current.clear();savedDrafts.current.clear();savedRowKeys.current.clear();cellSaves.current.clear();editingRef.current={};setEditing({});setSaveError(false)},[section,kind]);
 const fields=columns[kind];
 const mappedIds=new Set([...savedDrafts.current.values()].map(x=>x.line.id));
 const visible=readOnly?lines.filter(x=>x.section===section):[...lines.filter(x=>x.section===section&&!mappedIds.has(x.id)),...drafts];
 const getValue=(row:GridLine,field:string)=>String(row[field as keyof GridLine]??"");
 const hasInput=(row:GridLine)=>fields.some(([field])=>getValue(row,field).trim());
 const canSave=(row:GridLine)=>(orderingLineHasName(kind,row)||!!row.itemCode.trim())&&!!row.quantityText.trim();
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
  containerRef.current?.querySelector<HTMLInputElement>(`input[data-order-row="${target}"][data-order-field="${field}"]`)?.focus();
 }));
 const commitNew=(row:GridLine)=>{
  if(readOnly)return Promise.resolve(false);
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
   for(let pass=0;pass<8;pass++){
    const current=draftsRef.current.find(d=>d.id===row.id);if(!current)return true;
    const known=savedDrafts.current.get(row.id),snapshot={...current};
    const patch:Partial<GridLine>=known?Object.fromEntries(fields.filter(([field])=>getValue(snapshot,field)!==getValue(known.input,field)).map(([field])=>[field,getValue(snapshot,field)])):{...snapshot,id:0};
    if(!known||Object.keys(patch).length){
     const persisted=await onCommit(known?.line??{...snapshot,id:0},patch);
     if(!persisted||persisted.id<=0)throw new Error("未取得儲存確認，請保留輸入後重試");
     savedDrafts.current.set(row.id,{line:persisted,input:snapshot});
     savedRowKeys.current.set(persisted.id,row.id);
    }
    const newest=draftsRef.current.find(d=>d.id===row.id);
    if(newest&&fields.some(([field])=>getValue(newest,field)!==getValue(snapshot,field)))continue;
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
 const commitCell=(row:GridLine,field:keyof GridLine,value:string)=>{
  if(readOnly)return Promise.resolve(false);
  if(row.id<0){setDraftValue(row,field,value);return commitNew(row)}
  const key=row.id+"|"+field,queued=cellSaves.current.get(key);
  if(queued?.value===value)return queued.promise;
  if(!queued&&getValue(row,field)===value){setEdits(prev=>{const n={...prev};delete n[key];return n});return Promise.resolve(true)}
  setSaveError(false);
  const promise=onCommit(row,{[field]:value}).then(()=>{setEdits(prev=>{
    if(prev[key]!==value)return prev;
    const n={...prev};delete n[key];return n;
   });return true}).catch(()=>{setSaveError(true);return false}).finally(()=>{
    if(cellSaves.current.get(key)?.promise===promise)cellSaves.current.delete(key);setDrafts([...draftsRef.current]);
   });
  cellSaves.current.set(key,{value,promise});setDrafts([...draftsRef.current]);return promise;
 };
 const editor=useRef<OrderingGridEditor>({flush:async()=>true,discard:()=>{}});
 editor.current.discard=()=>{draftsRef.current=[empty(section,nextTemp.current--)];savedDrafts.current.clear();setDrafts(draftsRef.current);setEdits(()=>({}));setSaveError(false)};
 editor.current.flush=async()=>{
  if(readOnly)return true;
  const work=draftsRef.current.filter(hasInput).map(commitNew);
  for(const row of lines.filter(x=>x.section===section))for(const [field] of fields){const value=editingRef.current[row.id+"|"+field];if(value!==undefined)work.push(commitCell(row,field,value))}
  work.push(...inFlight.current.values(),...[...cellSaves.current.values()].map(x=>x.promise),...actionSaves.current);
  const okay=(await Promise.all(work)).every(Boolean);
  return okay&&!draftsRef.current.some(hasInput)&&!hasSavedEdits(editingRef.current);
 };
 useEffect(()=>{onRegister?.(readOnly?null:editor.current);return()=>onRegister?.(null)},[onRegister,readOnly]);
 function enter(e:KeyboardEvent<HTMLInputElement>,row:GridLine,col:number){
  if(e.key!=="Enter"||e.nativeEvent.isComposing)return;
  e.preventDefault();
  const field=fields[col][0];
  const target=e.currentTarget;
  if(row.id>0)skipBlur.current.add(row.id+"|"+field);
  commitCell(row,field,target.value);
  if(col<fields.length-1)focus(row.id,fields[col+1][0]);
  else{
   const currentRows=[...lines.filter(x=>x.section===section),...draftsRef.current];
   const index=currentRows.findIndex(r=>r.id===row.id);
   let next=currentRows[index+1];
   if(!next&&row.id<0){
    next=empty(section,nextTemp.current--);
    draftsRef.current=[...draftsRef.current,next];setDrafts(draftsRef.current);
   }
   if(next)focus(next.id,fields[0][0]);
  }
 }
 const runAction=(job:()=>Promise<unknown>)=>{
  setSaveError(false);
  const promise=job().then(()=>true).catch(()=>{setSaveError(true);return false}).finally(()=>{actionSaves.current.delete(promise);setDrafts([...draftsRef.current])});
  actionSaves.current.add(promise);setDrafts([...draftsRef.current]);
 };
 return <div ref={containerRef} className="cy-ordering-grid-scroll" role="region" aria-label="叫貨明細" tabIndex={0}>
  <table className="cy-ordering-grid" data-kind={kind} data-readonly={readOnly||undefined}>
   <colgroup><col className="cy-ordering-col-index"/>{fields.flatMap(([field])=>[<col key={field} className={"cy-ordering-col-"+field}/>,...(readOnly&&field==="quantityText"?[<col key="received" className="cy-ordering-col-received"/>]:[])])}{readOnly?<col className="cy-ordering-col-status"/>:<col className="cy-ordering-col-actions"/>}</colgroup>
   <thead><tr><th scope="col">項次</th>{fields.flatMap(([field,label])=>[<th scope="col" key={field}>{label}</th>,...(readOnly&&field==="quantityText"?[<th scope="col" key="received">已到數量</th>]:[])])}{readOnly?<th scope="col">狀態</th>:<th scope="col">操作</th>}</tr></thead>
   <tbody>{visible.map((row,i)=><tr key={savedRowKeys.current.get(row.id)??row.id} data-saving={inFlight.current.has(row.id)||undefined}><td>{i+1}</td>
    {fields.flatMap(([field,title],col)=>{
     const key=row.id+"|"+field,value=editing[key]??getValue(row,field);
     return [<td key={field}>{readOnly?<span className={"cy-ordering-cell-text"+(field==="quantityText"?" cy-ordering-quantity":"")+((field==="itemName"||field==="vendorItemName"||field==="note")?" cy-ordering-wrap":"")}>{value}</span>:<input data-order-row={row.id} data-order-field={field} className="cy-ordering-cell"
       aria-label={title+" 第"+(i+1)+"列"} title={title} value={value} disabled={busy}
       aria-busy={inFlight.current.has(row.id)||undefined}
       required={field==="quantityText"||(field==="itemName"&&kind!=="GENERAL"&&kind!=="VENDOR")}
       onChange={e=>{setEdits(prev=>({...prev,[key]:e.target.value}));if(row.id<0)setDraftValue(row,field,e.target.value)}}
       onBlur={e=>{
        const id=row.id+"|"+field;
        if(skipBlur.current.delete(id))return;
        commitCell(row,field as keyof GridLine,e.currentTarget.value);
       }}
       onKeyDown={e=>enter(e,row,col)} />}</td>,...(readOnly&&field==="quantityText"?[<td key="received"><span className="cy-ordering-cell-text cy-ordering-quantity">{row.received??0}</span>{row.closedAs?<small className="cy-ordering-closed-note" title={row.closedNote}>{CLOSED_AS_LABELS[row.closedAs]}{row.closedNote?"（"+row.closedNote+"）":""}</small>:null}</td>]:[])];
    })}
    {readOnly?<td className="cy-ordering-status-cell"><span className={"cy-ordering-status-chip state-"+receiptState(row).toLowerCase()}>{receiptState(row)==="OPEN"?"待到貨":LINE_STATE_LABELS[receiptState(row)]}</span></td>:null}
    {!readOnly?<td className="cy-ordering-grid-actions">{row.id>0?<IconButton label={"刪除第"+(i+1)+"列"} disabled={busy||actionSaves.current.size>0} onClick={()=>runAction(()=>onDelete(row))} icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v8m4-8v8"/></svg>}/>:null}</td>:null}</tr>)}</tbody>
  </table>
  {visible.filter(x=>x.quantityText&&parseQuantity(x.quantityText).quantity===null).map(x=><p key={x.id} className="cy-notice cy-notice-warning">「{x.itemName||x.vendorItemName||x.itemCode}」數量無法拆解，保留文字、不計到貨量。</p>)}
 </div>;
}
