import {useEffect,useRef,useState,type KeyboardEvent} from "react";
import type {OrderingSourceKind,OrderingSection} from "../../shared/ordering";
import {parseQuantity} from "../../shared/ordering";
export interface GridLine{ id:number;section:OrderingSection;sortOrder:number;itemCode:string;itemName:string;vendorItemCode:string;vendorItemName:string;spec:string;quantityText:string;unit:string;note:string;vendorNameFollows?:boolean; }
const columns={
 GENERAL:[["itemCode","品號"],["itemName","品名"],["vendorItemCode","廠商品號"],["vendorItemName","廠商品名"],["quantityText","數量"],["unit","單位"],["note","備註"]],
 VENDOR:[["itemCode","品號"],["itemName","品名"],["vendorItemCode","廠商品號"],["vendorItemName","廠商品名"],["quantityText","數量"],["unit","單位"],["note","備註"]],
 CN_REGULAR:[["itemCode","品號"],["itemName","品名"],["quantityText","數量"],["unit","單位"],["note","備註"]],
 CN_CUSTOM:[["itemCode","品號"],["itemName","品名"],["spec","規格"],["quantityText","數量"],["unit","單位"],["note","備註"]],
} as const;
const empty=(section:OrderingSection,id:number):GridLine=>({id,section,sortOrder:0,itemCode:"",itemName:"",vendorItemCode:"",vendorItemName:"",spec:"",quantityText:"",unit:"",note:""});
type Props={kind:OrderingSourceKind;section:OrderingSection;lines:GridLine[];busy:boolean;onCommit:(line:GridLine,patch:Partial<GridLine>)=>Promise<void>;onDelete:(line:GridLine)=>Promise<void>};
export function OrderingGrid({kind,section,lines,busy,onCommit,onDelete}:Props){
 const nextTemp=useRef(-2);
 const containerRef=useRef<HTMLDivElement>(null);
 const [drafts,setDrafts]=useState<GridLine[]>(()=>[empty(section,-1)]);
 const draftsRef=useRef(drafts);
 const inFlight=useRef(new Set<number>());
 const skipBlur=useRef(new Set<string>());
 const [editing,setEditing]=useState<Record<string,string>>({});
 useEffect(()=>{draftsRef.current=[empty(section,-1)];setDrafts(draftsRef.current);nextTemp.current=-2;inFlight.current.clear();setEditing({})},[section,kind]);
 const fields=columns[kind];
 const visible=[...lines.filter(x=>x.section===section),...drafts];
 const getValue=(row:GridLine,field:string)=>String(row[field as keyof GridLine]??"");
 const editable=(row:GridLine)=>row.id<0&&!inFlight.current.has(row.id);
 const setDraftValue=(row:GridLine,field:string,value:string)=>{
  draftsRef.current=draftsRef.current.map(d=>d.id===row.id?{...d,[field]:value}:d);
  setDrafts(draftsRef.current);
 };
 const focus=(id:number,field:string)=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
  containerRef.current?.querySelector<HTMLInputElement>(`input[data-order-row="${id}"][data-order-field="${field}"]`)?.focus();
 }));
 const commitNew=(row:GridLine)=>{
  const latest=draftsRef.current.find(d=>d.id===row.id);
  if(!latest||inFlight.current.has(row.id)||!(latest.itemName.trim()||latest.itemCode.trim())||!latest.quantityText.trim())return;
  inFlight.current.add(row.id);
  // The next editable row exists immediately even with a slow API; never disable its inputs.
  if(draftsRef.current.at(-1)?.id===row.id){
   const another=empty(section,nextTemp.current--);
   draftsRef.current=[...draftsRef.current,another];setDrafts(draftsRef.current);
  }
  void onCommit({...latest,id:0}, {...latest,id:0}).then(()=>{
   draftsRef.current=draftsRef.current.filter(d=>d.id!==row.id);
   setDrafts(draftsRef.current);
   setEditing(prev=>Object.fromEntries(Object.entries(prev).filter(([key])=>!key.startsWith(row.id+"|"))));
  }).catch(()=>{inFlight.current.delete(row.id);});
 };
 const commitCell=(row:GridLine,field:keyof GridLine,value:string)=>{
  if(row.id<0){setDraftValue(row,field,value);commitNew(row);return}
  if(getValue(row,field)===value){setEditing(prev=>{const n={...prev};delete n[row.id+"|"+field];return n});return}
  void onCommit(row,{[field]:value}).then(()=>setEditing(prev=>{
    const key=row.id+"|"+field;if(prev[key]!==value)return prev;
    const n={...prev};delete n[key];return n;
   })).catch(()=>{/* Keep entered value on failed request; parent shows error. */});
 };
 function enter(e:KeyboardEvent<HTMLInputElement>,row:GridLine,col:number){
  if(e.key!=="Enter"||e.nativeEvent.isComposing)return;
  e.preventDefault();
  const field=fields[col][0];
  const target=e.currentTarget;
  if(row.id>0)skipBlur.current.add(row.id+"|"+field);
  commitCell(row,field,target.value);
  if(row.id<0&&((field==="quantityText"||col===fields.length-1)&& (draftsRef.current.find(d=>d.id===row.id)?.itemName||draftsRef.current.find(d=>d.id===row.id)?.itemCode)&&draftsRef.current.find(d=>d.id===row.id)?.quantityText)){
   const next=draftsRef.current[draftsRef.current.findIndex(d=>d.id===row.id)+1];
   if(next)focus(next.id,"itemName");
  }else if(col<fields.length-1)focus(row.id,fields[col+1][0]);
  else{
   const index=visible.findIndex(r=>r.id===row.id);
   const next=visible[index+1]??draftsRef.current.at(-1);
   if(next)focus(next.id,fields[0][0]);
  }
 }
 return <div ref={containerRef} className="cy-ordering-grid-scroll" role="region" aria-label="叫貨明細" tabIndex={0}>
  <table className="cy-ordering-grid"><thead><tr><th>項次</th>{fields.map(([_,label])=><th key={label}>{label}</th>)}<th>操作</th></tr></thead>
   <tbody>{visible.map((row,i)=><tr key={row.id} data-saving={inFlight.current.has(row.id)||undefined}><td>{i+1}</td>
    {fields.map(([field,title],col)=>{
     const key=row.id+"|"+field,value=editing[key]??getValue(row,field);
     return <td key={field}><input data-order-row={row.id} data-order-field={field} className="cy-op-input"
       aria-label={title+" 第"+(i+1)+"列"} title={title} value={value} disabled={busy}
       aria-busy={inFlight.current.has(row.id)||undefined}
       required={field==="itemName"||field==="quantityText"}
       onChange={e=>{setEditing(prev=>({...prev,[key]:e.target.value}));if(row.id<0)setDraftValue(row,field,e.target.value)}}
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
  {visible.filter(x=>x.quantityText&&parseQuantity(x.quantityText).quantity===null).map(x=><p key={x.id} className="cy-notice cy-notice-warning">「{x.itemName||x.itemCode}」數量無法拆解，保留文字、不計到貨量。</p>)}
  <p className="cy-erp-search-hint">逐格按 Enter 或離開時儲存；儲存中仍可繼續輸入下一列。存檔失敗保留輸入，請重新確認後再送出。</p>
 </div>;
}
