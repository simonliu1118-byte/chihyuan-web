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
const empty=(section:OrderingSection):GridLine=>({id:0,section,sortOrder:0,itemCode:"",itemName:"",vendorItemCode:"",vendorItemName:"",spec:"",quantityText:"",unit:"",note:""});
type Props={kind:OrderingSourceKind;section:OrderingSection;lines:GridLine[];busy:boolean;onCommit:(line:GridLine,patch:Partial<GridLine>)=>Promise<void>;onDelete:(line:GridLine)=>Promise<void>};
export function OrderingGrid({kind,section,lines,busy,onCommit,onDelete}:Props){
 const [draft,setDraft]=useState<GridLine>(()=>empty(section));
 const [editing,setEditing]=useState<Record<string,string>>({});
 const savingDraft=useRef(false);
 useEffect(()=>{setDraft(empty(section));setEditing({})},[section,kind]);
 const fields=columns[kind];
 async function saveDraft(next:GridLine){
  if(savingDraft.current||busy||!(next.itemName.trim()||next.itemCode.trim())||!next.quantityText.trim())return;
  savingDraft.current=true;
  try{
   await onCommit(next,next);
   setDraft(empty(section));
   setEditing(prev=>Object.fromEntries(Object.entries(prev).filter(([key])=>!key.startsWith("0|"+section+"|"))));
  }finally{savingDraft.current=false}
 }
 async function commit(row:GridLine,key:keyof GridLine,value:string){
  const old=String(row[key]??"");if(value===old)return;
  const patch={ [key]:value } as Partial<GridLine>;
  if(row.id)await onCommit(row,patch);else{
   const next={...draft,...patch};
   setDraft(next);
   await saveDraft(next);
  }
 }
 function enter(e:KeyboardEvent<HTMLInputElement>,idx:number,col:number){
  if(e.key!=="Enter"||e.nativeEvent.isComposing)return;
  e.preventDefault();
  e.currentTarget.blur();
  const inputs=[...e.currentTarget.closest("tbody")!.querySelectorAll<HTMLInputElement>("input[data-order-field]")];
  const next=inputs[idx*fields.length+col+1];
  next?.focus();
 }
 return <div className="cy-ordering-grid-scroll" role="region" aria-label="叫貨明細" tabIndex={0}>
  <table className="cy-ordering-grid"><thead><tr><th>項次</th>{fields.map(([_,title])=><th key={title}>{title}</th>)}<th>操作</th></tr></thead>
   <tbody>{[...lines.filter(x=>x.section===section),draft].map((line,i)=><tr key={line.id||"new"}><td>{i+1}</td>
    {fields.map(([field,title],j)=>{const key=line.id+"|"+section+"|"+field;const value=editing[key]??String(line[field as keyof GridLine]??"");return <td key={field}>
      <input data-order-field="true" className="cy-op-input" aria-label={title+" 第"+(i+1)+"列"} title={title} disabled={busy} value={value} required={field==="itemName"||field==="quantityText"}
       style={{minWidth:field==="itemName"||field==="vendorItemName"?125:72,width:"100%"}}
       onChange={e=>{setEditing(old=>({...old,[key]:e.target.value}));if(!line.id)setDraft(d=>({...d,[field]:e.target.value}))}}
       onBlur={()=>{if(line.id&&value!==String(line[field as keyof GridLine]??""))void commit(line,field as keyof GridLine,value).then(()=>setEditing(prev=>{const next={...prev};delete next[key];return next})).catch(()=>{});else if(!line.id&&(draft.itemName||draft.itemCode)&&draft.quantityText)void saveDraft(draft).catch(()=>{});}}
       onKeyDown={e=>enter(e,i,j)}/></td>})}
    <td><button type="button" className="cy-op-button" disabled={busy||!line.id} onClick={()=>void onDelete(line)}>刪除</button>
      {line.id?<><button type="button" className="cy-op-button" disabled={busy||i===0} onClick={()=>void onCommit(line,{sortOrder:(lines.filter(x=>x.section===section)[i-1]?.sortOrder??0)-1})}>↑</button><button type="button" className="cy-op-button" disabled={busy||i===lines.filter(x=>x.section===section).length-1} onClick={()=>void onCommit(line,{sortOrder:(lines.filter(x=>x.section===section)[i+1]?.sortOrder??0)+1})}>↓</button></>:null}</td></tr>)}
   </tbody>
  </table>
  {lines.filter(x=>x.section===section&&x.quantityText&&parseQuantity(x.quantityText).quantity===null).map(x=><p key={x.id} className="cy-notice cy-notice-warning">「{x.itemName||x.itemCode}」數量無法拆解，保留文字、不計到貨量。</p>)}
  <p className="cy-erp-search-hint">逐格離開或按 Enter 自動儲存；品名與數量為必填。已填品號時可由 ERP 帶入空白品名。</p>
 </div>;
}
