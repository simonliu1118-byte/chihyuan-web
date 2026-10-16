import { useState } from "react";
import { useCompactLayout } from "../../ui/foundation/useCompactLayout";

/** One result source, with one mounted table/card presentation and shared pagination. */
export function ErpQueryRows({ label, columns, rows, onItemSelect, disabled = false, summaryColumns }:{
  label:string; columns:readonly string[]; rows:readonly (readonly string[])[];
  onItemSelect?:(itemNo:string)=>void; disabled?:boolean; summaryColumns?:readonly number[];
}) {
  const compact=useCompactLayout(),[selectedPage,setPage]=useState(0);
  const size=25,pages=Math.max(1,Math.ceil(rows.length/size)),page=Math.min(selectedPage,pages-1);
  const start=page*size,visible=rows.slice(start,start+size);
  const value=(row:readonly string[],index:number)=>index===0&&onItemSelect
    ? <button type="button" className="cy-erp-item-link" disabled={disabled} onClick={()=>onItemSelect(row[0])}>{row[0]}</button> : row[index]||"—";
  const fields=(row:readonly string[])=><dl>{columns.map((name,index)=><div key={name} data-field={name}><dt>{name}</dt><dd>{value(row,index)}</dd></div>)}</dl>;
  return <div className="cy-erp-result-list" role="region" aria-label={label}>
    {compact ? <div className="cy-erp-row-cards">{visible.map((row,index)=><article className="cy-erp-row-card" key={start+index}>
      {summaryColumns ? <details><summary>{summaryColumns.map(index=>row[index]||"—").join(" · ")}</summary>{fields(row)}</details> : fields(row)}
    </article>)}</div> : <div className="cy-erp-table-scroller"><table className="cy-erp-warehouse">
      <thead><tr>{columns.map(name=><th scope="col" key={name}>{name}</th>)}</tr></thead>
      <tbody>{visible.map((row,index)=><tr key={start+index}>{columns.map((name,index)=><td key={name}>{value(row,index)}</td>)}</tr>)}</tbody>
    </table></div>}
    {pages>1 ? <nav className="cy-erp-pagination" aria-label={label+"分頁"}>
      <button className="cy-op-button" type="button" disabled={page===0} onClick={()=>setPage(page-1)}>上一頁</button>
      <span role="status">{start+1}～{Math.min(start+size,rows.length)}／{rows.length} 筆</span>
      <button className="cy-op-button" type="button" disabled={page===pages-1} onClick={()=>setPage(page+1)}>下一頁</button>
    </nav> : null}
  </div>;
}
