import {useEffect,useMemo,useState,type KeyboardEvent} from "react";
import {parseStocktakeQuantity,decimalStocktake,type StocktakeDetail,type StocktakeLine,type StocktakeLocationCount} from "../../../shared/stocktake";

type Row={line:StocktakeLine;cell:StocktakeLocationCount};
type LocGroup={key:string;warehouse:string;location:string;rows:Row[]};
type ItemGroup={code:string;name:string;spec:string;locations:LocGroup[]};
type Props={
 detail:StocktakeDetail;search:string;filter:"ALL"|"UNFILLED"|"DIFFERENCE"|"ADDED";
 drafts:Record<string,string>;saving:string|null;conflictKey:string|null;
 onDraft:(key:string,value:string)=>void;
 onSave:(cell:StocktakeLocationCount,force?:boolean)=>void;
 onConflictUseLatest:(cell:StocktakeLocationCount)=>void;
 onHistory:(line:StocktakeLine,cell:StocktakeLocationCount)=>void;
 onDeleteBatch:(line:StocktakeLine)=>void;
 onAddBatch:(itemCode:string,warehouse:string,location:string)=>void;
 onRename:(itemCode:string,warehouse:string,location:string)=>void;
};
const qtySum=(rows:readonly Row[],field:"firstQty"|"recountQty")=>{
 const complete=rows.every(r=>r.cell[field]!==null);
 const total=rows.reduce((sum,r)=>sum+(r.cell[field]===null?0n:parseStocktakeQuantity(r.cell[field]!)),0n);
 return {complete,total:decimalStocktake(total)};
};
function useCompact(){
 const [compact,setCompact]=useState(()=>typeof window!=="undefined"&&window.matchMedia("(max-width:820px)").matches);
 useEffect(()=>{
  const media=window.matchMedia("(max-width:820px)");
  const change=()=>setCompact(media.matches);
  change();media.addEventListener("change",change);
  return()=>media.removeEventListener("change",change);
 },[]);
 return compact;
}
export function StocktakeGroupedDetail({detail,search,filter,drafts,saving,conflictKey,
 onDraft,onSave,onConflictUseLatest,onHistory,onDeleteBatch,onAddBatch,onRename}:Props){
 const compact=useCompact();
 const [selectedLocations,setSelectedLocations]=useState<Record<string,string>>({});
 const phase=detail.sheet.status==="COUNTING"?"firstQty":"recountQty";
 const editable=detail.sheet.status==="COUNTING"||detail.sheet.status==="RECOUNTING";
 const {groups,allRows}=useMemo(()=>{
  const lines=new Map(detail.lines.map(l=>[l.lineKey,l]));
  const allRows=detail.locationCounts.flatMap(cell=>{
   const line=lines.get(cell.sourceLineKey);
   return line?[{line,cell}]:[];
  });
  const all=new Map<string,ItemGroup>();
  const q=search.trim().toLowerCase();
  for(const row of allRows){
   const {line,cell}=row;
   const fields=[line.itemCode,line.itemName,line.spec,line.batch,line.warehouseName,cell.locationCode];
   if(q&&!fields.some(s=>s.toLowerCase().includes(q)))continue;
   if(filter==="ADDED"&&!line.isAdded)continue;
   if(filter==="UNFILLED"&&(line.locked||cell[phase]!==null))continue;
   if(filter==="DIFFERENCE"&&(detail.sheet.status==="COUNTING"||line.bookQty===undefined))continue;
   if(filter==="DIFFERENCE"&&line.bookQty!==undefined){
    const siblings=allRows.filter(r=>r.line.lineKey===line.lineKey);
    if(!siblings.every(r=>r.cell.firstQty!==null))continue;
    const sum=qtySum(siblings,phase==="firstQty"?"firstQty":line.locked?"firstQty":"recountQty");
    if(parseStocktakeQuantity(sum.total)===parseStocktakeQuantity(line.bookQty))continue;
   }
   let group=all.get(line.itemCode);
   if(!group){group={code:line.itemCode,name:line.itemName,spec:line.spec,locations:[]};all.set(line.itemCode,group)}
   const key=line.warehouseName+"|"+cell.locationCode;
   let loc=group.locations.find(l=>l.key===key);
   if(!loc){loc={key,warehouse:line.warehouseName,location:cell.locationCode,rows:[]};group.locations.push(loc)}
   loc.rows.push(row);
  }
  for(const group of all.values()){
   group.locations.sort((a,b)=>a.location.localeCompare(b.location));
   for(const loc of group.locations)loc.rows.sort((a,b)=>a.line.batch.localeCompare(b.line.batch)||a.line.lineKey.localeCompare(b.line.lineKey));
  }
  return {groups:[...all.values()].sort((a,b)=>a.code.localeCompare(b.code)),allRows};
 },[detail,search,filter,phase]);
 const counts=(rows:Row[])=>{
  const required=phase==="firstQty"?rows:rows.filter(r=>!r.line.locked);
  return {total:required.length,done:required.filter(r=>r.cell[phase]!==null).length};
 };
 const editor=(r:Row)=>{
  const id=String(r.cell.id),value=drafts[id]??r.cell[phase]??"";
  const disabled=!editable||r.line.locked||saving===id;
  const next=(event:KeyboardEvent<HTMLInputElement>)=>{
   if(event.key!=="Enter"||event.nativeEvent.isComposing)return;
   event.preventDefault();onSave(r.cell);
   const inputs=Array.from(event.currentTarget.closest(".cy-stocktake-lines")?.querySelectorAll<HTMLInputElement>("input[data-stocktake-qty]:not([disabled])")??[]);
   inputs[inputs.indexOf(event.currentTarget)+1]?.focus();
  };
  return <div className="cy-stocktake-cell-editor">
   <input data-stocktake-qty type="text" inputMode="decimal" className="cy-ordering-cell"
    value={value} placeholder="未填" disabled={disabled}
    aria-label={(phase==="firstQty"?"初盤":"複盤")+"："+r.line.itemCode+" 儲位 "+(r.cell.locationCode||"未指定")+" 批號 "+(r.line.batch||"無")}
    onChange={e=>onDraft(id,e.target.value)} onBlur={()=>onSave(r.cell)} onKeyDown={next}/>
   <small>{r.line.unit||"—"}</small>
  </div>;
 };
 const actions=(r:Row)=><div className="cy-stocktake-cell-actions">
  <button className="cy-op-button compact" type="button" onClick={()=>onHistory(r.line,r.cell)}>修改紀錄</button>
  {r.line.isAdded&&editable&&!r.line.locked?
   <button className="cy-op-button compact danger" type="button" onClick={()=>onDeleteBatch(r.line)}>刪除批號</button>:null}
  {conflictKey===String(r.cell.id)?<div className="cy-notice cy-notice-warning" role="alert">
    此儲位數量已被其他人修改。
    <button className="cy-op-button compact" type="button" onClick={()=>onConflictUseLatest(r.cell)}>採用最新結果</button>
    <button className="cy-op-button compact" type="button" onClick={()=>onSave(r.cell,true)}>覆蓋為我的數量</button>
   </div>:null}
 </div>;
 if(!groups.length)return <p className="cy-op-empty">目前沒有符合篩選的盤點列。</p>;
 return <div className="cy-stocktake-lines">
  {groups.map(group=>{
   const groupRows=allRows.filter(row=>row.line.itemCode===group.code);
   const progress=counts(groupRows);
   const locked=phase==="recountQty"&&groupRows.length>0&&groupRows.every(row=>row.line.locked);
   const state=progress.total===0?"none":progress.done===0?"none":progress.done===progress.total?"done":"partial";
   const picked=selectedLocations[group.code];
   const selected=group.locations.find(l=>l.key===picked)??group.locations[0];
   if(!selected)return null;
   const parent=selected.rows[0].line;
   const itemHeader=<div className="cy-stocktake-group-heading">
    <div><strong>{group.code} {group.name}</strong><small>{group.spec||"—"}</small></div>
    <span>{locked?"已核對":progress.done+"/"+progress.total+" 已填"}</span>
   </div>;
   const chosen=group.locations;
   if(compact)return <section key={group.code} className="cy-stocktake-item-card" data-progress={locked?"done":state}>
    {itemHeader}
    <div className="cy-stocktake-location-heading"><strong>選擇儲位</strong>
     {editable&&!parent.locked?<button className="cy-op-button compact" type="button"
      onClick={()=>onRename(group.code,selected.warehouse,selected.location)}>修改</button>:null}
    </div>
    <div className="cy-stocktake-location-switch" role="group" aria-label={group.code+" 儲位"}>
     {chosen.map(loc=>{const p=counts(loc.rows);return <button type="button" key={loc.key}
      className={"cy-op-button compact"+(loc.key===selected.key?" active":"")}
      aria-pressed={loc.key===selected.key} onClick={()=>setSelectedLocations(s=>({...s,[group.code]:loc.key}))}>
      <strong>{loc.location||"未指定儲位"}</strong>
      <small>{p.total===0?"已核對":p.done+"/"+p.total+" 已填"}</small>
     </button>})}
    </div>
    <div className="cy-stocktake-batch-rows">
     {selected.rows.map(r=><div className="cy-stocktake-batch-row" key={r.cell.id}>
      <div className="cy-stocktake-batch-name">批號 {r.line.batch||"無"}</div>
      {editor(r)}
      <div className="cy-stocktake-batch-actions">{actions(r)}</div>
     </div>)}
    </div>
    <div className="cy-stocktake-group-footer">
     {editable&&!parent.locked&&selected.rows.some(r=>r.line.batch)?
      <button className="cy-op-button compact" type="button" onClick={()=>onAddBatch(group.code,selected.warehouse,selected.location)}>＋ 新增批號</button>:<span/>}
     <small>儲位小計 {qtySum(selected.rows,phase).total}{qtySum(selected.rows,phase).complete?"":"（尚未填完）"}</small>
    </div>
   </section>;
   return <section key={group.code} className="cy-stocktake-desktop-group">
    {itemHeader}
    <div className="cy-ordering-grid-scroll"><table className="cy-ordering-grid cy-stocktake-grouped-table">
     <thead><tr><th scope="col">儲位</th><th scope="col">批號</th>
      <th scope="col">{phase==="firstQty"?"初盤數量":"複盤數量"}</th><th scope="col">操作</th></tr></thead>
     <tbody>{group.locations.flatMap(loc=>{
      const p=counts(loc.rows);
      return loc.rows.map((r,i)=><tr key={r.cell.id}>
       {i===0?<td rowSpan={loc.rows.length} className="cy-stocktake-group-location">
        <strong>{loc.location||"未指定儲位"}</strong><small>{loc.warehouse}</small>
        <small>{p.total===0?"已核對":p.done+"/"+p.total+" 已填"}</small>
        {editable&&!r.line.locked?<button className="cy-op-button compact" type="button"
         onClick={()=>onRename(group.code,loc.warehouse,loc.location)}>修改</button>:null}
        {editable&&!r.line.locked&&r.line.batch?<button className="cy-op-button compact" type="button"
         onClick={()=>onAddBatch(group.code,loc.warehouse,loc.location)}>新增批號</button>:null}
       </td>:null}
       <td>批號 {r.line.batch||"無"}</td><td>{editor(r)}</td><td>{actions(r)}</td>
      </tr>);
     })}</tbody>
    </table></div>
   </section>;
  })}
 </div>;
}
