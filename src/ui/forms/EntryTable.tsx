import {useLayoutEffect,useRef,type PropsWithChildren,type ReactNode} from "react";
import {Field} from "./Field";
import "./entry-table.css";

/**
 * Phone layout (UI_COMPONENT_CATALOG §6): each input cell is labelled with the column heading above
 * it, so at phone width the CSS can show 「欄名｜內容」 rows instead of heading rows over input rows.
 * Desktop rendering is unchanged; the labels are only data attributes.
 */
function labelCells(table:HTMLTableElement){
 let headings:string[]=[];
 for(const row of Array.from(table.rows)){
  const cells=Array.from(row.cells);
  if(cells.length&&cells.every(cell=>cell.tagName==="TH"&&cell.getAttribute("scope")!=="row")){
   headings=[];for(const cell of cells){const required=!!cell.querySelector(".cy-field-required"),text=(cell.textContent??"").replace(/[＊*]/g,"").trim();
    for(let i=0;i<cell.colSpan;i++)headings.push(i?"":text+(required?"＊":""));}
   row.dataset.entryHeading="true";continue;
  }
  let column=0;
  for(const cell of cells){
   if(cell.tagName==="TD"&&!cell.dataset.label&&headings[column])cell.dataset.entryLabel=headings[column];
   column+=cell.colSpan;
  }
 }
}

/** Shared table shell for form-local drafts; saving remains owned by the enclosing form. */
export function EntryTable({label, embedded=false, className="", children}:PropsWithChildren<{label:string;embedded?:boolean;className?:string}>){
 const ref=useRef<HTMLTableElement>(null);
 useLayoutEffect(()=>{if(ref.current)labelCells(ref.current)});
 const table=<table ref={ref} aria-label={label} className={`cy-ordering-grid cy-entry-table ${className}`}>{children}</table>;
 return embedded?table:<div className="cy-ordering-grid-scroll">{table}</div>;
}

/** The visible label belongs to the header; the cell Field retains its accessible label. */
export function EntryHeading({children,required=false}: {children:ReactNode;required?:boolean}){
 return <>{children}{required?<span className="cy-field-required" aria-hidden="true">＊</span>:null}</>;
}

/** Compact editable field table for dialogs whose controls are expressed as rows.
 * Each field remains inside the same EntryTable and the shared cell Field; the dialog owns state and submit.
 */
export interface EntryFieldRow {label:string;content:ReactNode;required?:boolean}
export function EntryFields({label,rows}: {label:string;rows:readonly EntryFieldRow[]}){
 return <EntryTable label={label}><tbody>{rows.map((row,index)=>
  <tr key={index}><th scope="row"><EntryHeading required={row.required}>{row.label}</EntryHeading></th>
   <td><Field label={row.label} presentation="cell" required={row.required}>{row.content}</Field></td></tr>
 )}</tbody></EntryTable>;
}
