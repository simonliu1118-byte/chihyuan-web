import {useEffect,useRef,useState,type KeyboardEvent} from "react";
import type {OrderingSourceKind,OrderingSection} from "../../shared/ordering";
import {orderingLineHasName,parseQuantity} from "../../shared/ordering";
export interface GridLine{ id:number;section:OrderingSection;sortOrder:number;itemCode:string;itemName:string;vendorItemCode:string;vendorItemName:string;spec:string;quantityText:string;unit:string;note:string;vendorNameFollows?:boolean; }
const columns={
 GENERAL:[["itemCode","品號"],["itemName","品名"],["vendorItemCode","廠商品號"],["vendorItemName","廠商品名"],["quantityText","數量"],["unit","單位"],["note","備註"]],
 VENDOR:[["itemCode","品號"],["itemName","品名"],["vendorItemCode","廠商品號"],["vendorItemName","廠商品名"],["quantityText","數量"],["unit","單位"],["note","備註"]],
 CN_REGULAR:[["itemCode","品號"],["itemName","品名"],["quantityText","數量"],["unit","單位"],["note","備註"]],
 CN_CUSTOM:[["itemCode","品號"],["itemName","品名"],["spec","規格"],["quantityText","數量"],["unit","單位"],["note","備註"]],
} as const;
const empty=(section:OrderingSection,id:number):GridLine=>({id,section,sortOrder:0,itemCode:"",itemName:"",vendorItemCode:"",vendorItemName:"",spec:"",quantityText:"",unit:"",note:""});
export type OrderingGridState={dirty:boolean;saving:boolean};
export type OrderingGridEditor={flush:()=>Promise<boolean>;discard:()=>void};
type Props={kind:OrderingSourceKind;section:OrderingSection;lines:GridLine[];busy:boolean;onCommit:(line:GridLine,patch:Partial<GridLine>)=>Promise<GridLine>;onDelete:(line:GridLine)=>Promise<void>;onRegister?:(editor:OrderingGridEditor|null)=>void;onStateChange?:(state:OrderingGridState)=>void};
export function OrderingGrid({kind,section,lines,busy,onCommit,onDelete,onRegister,onStateChange}:Props){
 const nextTemp=useRef(-2);
 const containerRef=useRef<HTMLDivElement>(null);
 const [drafts,setDrafts]=useState<GridLine[]>(()=>[empty(section,-1)]);
 const draftsRef=useRef(drafts);
 const inFlight=useRef(new Map<number,Promise<boolean>>());
 const savedDrafts=useRef(new Map<number,{line:GridLine;input:GridLine}>());
 const savedRowKeys=useRef(new Map<number,number>());
 const cellSaves=useRef(new Map<string,{value:string;promise:Promise<boolean>}>());
 const skipBlur=useRef(new Set<string>());
 const [editing,setEditing]=useState<Record<string,string>>({});
 const editingRef=useRef(editing);
 const [saveError,setSaveError]=useState(false);
 const setEdits=(update:(previous:Record<string,string>)=>Record<string,string>)=>{editingRef.current=update(editingRef.current);setEditing(editingRef.current)};
 useEffect(()=>{draftsRef.current=[empty(section,-1)];setDrafts(draftsRef.current);nextTemp.current=-2;inFlight.current.clear();savedDrafts.current.clear();savedRowKeys.current.clear();cellSaves.current.clear();editingRef.current={};setEditing({});setSaveError(false)},[section,kind]);
 const fields=columns[kind];
 const mappedIds=new Set([...savedDrafts.current.values()].map(x=>x.line.id));
 const visible=[...lines.filter(x=>x.section===section&&!mappedIds.has(x.id)),...drafts];
 const getValue=(row:GridLine,field:string)=>String(row[field as keyof GridLine]??"");
 const hasInput=(row:GridLine)=>fields.some(([field])=>getValue(row,field).trim());
 const canSave=(row:GridLine)=>(orderingLineHasName(kind,row)||!!row.itemCode.trim())&&!!row.quantityText.trim();
 const dirty=drafts.some(hasInput)||Object.keys(editing).length>0;
 const saving=inFlight.current.size>0||cellSaves.current.size>0;
 useEffect(()=>{onStateChange?.({dirty,saving})},[dirty,saving,onStateChange]);
 const setDraftValue=(row:GridLine,field:string,value:string)=>{
  draftsRef.current=draftsRef.current.map(d=>d.id===row.id?{...d,[field]:value}:d);
  setDrafts(draftsRef.current);
 };
 const focus=(id:number,field:string)=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const target=id<0?[...savedRowKeys.current].find(([,key])=>key===id)?.[0]??id:id;
  containerRef.current?.querySelector<HTMLInputElement>(`input[data-order-row="${target}"][data-order-field="${field}"]`)?.focus();
 }));
 const commitNew=(row:GridLine)=>{
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
  const work=draftsRef.current.filter(hasInput).map(commitNew);
  for(const row of lines.filter(x=>x.section===section))for(const [field] of fields){const value=editingRef.current[row.id+"|"+field];if(value!==undefined)work.push(commitCell(row,field,value))}
  work.push(...inFlight.current.values(),...[...cellSaves.current.values()].map(x=>x.promise));
  const okay=(await Promise.all(work)).every(Boolean);
  return okay&&!draftsRef.current.some(hasInput)&&Object.keys(editingRef.current).length===0;
 };
 useEffect(()=>{onRegister?.(editor.current);return()=>onRegister?.(null)},[onRegister]);
 function enter(e:KeyboardEvent<HTMLInputElement>,row:GridLine,col:number){
  if(e.key!=="Enter"||e.nativeEvent.isComposing)return;
  e.preventDefault();
  const field=fields[col][0];
  const target=e.currentTarget;
  if(row.id>0)skipBlur.current.add(row.id+"|"+field);
  commitCell(row,field,target.value);
  if(row.id<0&&field==="quantityText"&&canSave(draftsRef.current.find(d=>d.id===row.id)??row)){
   const next=draftsRef.current[draftsRef.current.findIndex(d=>d.id===row.id)+1];
   if(next)focus(next.id,"itemName");
  }else if(col<fields.length-1)focus(row.id,fields[col+1][0]);
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
 return <div ref={containerRef} className="cy-ordering-grid-scroll" role="region" aria-label="叫貨明細" tabIndex={0}>
  <table className="cy-ordering-grid"><thead><tr><th>項次</th>{fields.map(([_,label])=><th key={label}>{label}</th>)}<th>操作</th></tr></thead>
   <tbody>{visible.map((row,i)=><tr key={savedRowKeys.current.get(row.id)??row.id} data-saving={inFlight.current.has(row.id)||undefined}><td>{i+1}</td>
    {fields.map(([field,title],col)=>{
     const key=row.id+"|"+field,value=editing[key]??getValue(row,field);
     return <td key={field}><input data-order-row={row.id} data-order-field={field} className="cy-op-input"
       aria-label={title+" 第"+(i+1)+"列"} title={title} value={value} disabled={busy}
       aria-busy={inFlight.current.has(row.id)||undefined}
       required={field==="quantityText"||(field==="itemName"&&kind!=="GENERAL"&&kind!=="VENDOR")}
       onChange={e=>{setEdits(prev=>({...prev,[key]:e.target.value}));if(row.id<0)setDraftValue(row,field,e.target.value)}}
       onBlur={e=>{
        const id=row.id+"|"+field;
        if(skipBlur.current.delete(id))return;
        commitCell(row,field as keyof GridLine,e.currentTarget.value);
       }}
       onKeyDown={e=>enter(e,row,col)} /></td>
    })}
    <td className="cy-ordering-grid-actions">{row.id>0?<><button type="button" className="cy-op-button compact quiet" onClick={()=>void onDelete(row)}>刪除</button>
      <button type="button" className="cy-op-button compact quiet" aria-label="上移" disabled={i===0} onClick={()=>void onCommit(row,{sortOrder:(visible[i-1]?.sortOrder??0)-1})}>↑</button>
      <button type="button" className="cy-op-button compact quiet" aria-label="下移" disabled={i===lines.length-1} onClick={()=>void onCommit(row,{sortOrder:(visible[i+1]?.sortOrder??0)+1})}>↓</button></>:inFlight.current.has(row.id)?"儲存中":null}</td></tr>)}</tbody>
  </table>
  <p className="cy-erp-search-hint" role="status">{saveError?"儲存失敗，輸入仍保留；請重新確認後再切換。":saving?"儲存中，完成前請勿關閉網頁。":dirty?"尚未儲存：請填寫"+(kind==="GENERAL"||kind==="VENDOR"?"品名或廠商品名":"品名")+"及數量，按 Enter 或離開欄位儲存。":"已儲存"}</p>
  {visible.filter(x=>x.quantityText&&parseQuantity(x.quantityText).quantity===null).map(x=><p key={x.id} className="cy-notice cy-notice-warning">「{x.itemName||x.vendorItemName||x.itemCode}」數量無法拆解，保留文字、不計到貨量。</p>)}
  <p className="cy-erp-search-hint">逐格按 Enter 或離開時儲存；儲存中仍可繼續輸入下一列。存檔失敗保留輸入，請重新確認後再送出。</p>
 </div>;
}
