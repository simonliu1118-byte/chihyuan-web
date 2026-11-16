import {Fragment,type ReactElement} from "react";
import {Field} from "./Field";
import {EntryTable,EntryHeading} from "./EntryTable";
/** Compact editable field table for dialogs whose controls are expressed as rows.
 * Each field remains inside the same EntryTable and the shared cell Field; the dialog owns state and submit.
 */
export interface EntryFieldRow {label:string;content:ReactElement;required?:boolean}
export function EntryFields({label,rows,columns}: {label:string;rows:readonly EntryFieldRow[];columns?:number}){
 if(columns!=null){
  const width=Math.max(1,Math.min(6,Math.trunc(columns)||1));
  const groups=Array.from({length:Math.ceil(rows.length/width)},(_,i)=>rows.slice(i*width,(i+1)*width));
  return <EntryTable label={label}><tbody>{groups.map((group,i)=><Fragment key={i}>
   <tr>{group.map((row,n)=><th key={n} colSpan={n===group.length-1?width-group.length+1:1}><EntryHeading required={row.required}>{row.label}</EntryHeading></th>)}</tr>
   <tr>{group.map((row,n)=><td key={n} colSpan={n===group.length-1?width-group.length+1:1}><Field label={row.label} presentation="cell" required={row.required}>{row.content}</Field></td>)}</tr>
  </Fragment>)}</tbody></EntryTable>;
 }
 return <EntryTable label={label}><tbody>{rows.map((row,index)=>
  <tr key={index}><th scope="row"><EntryHeading required={row.required}>{row.label}</EntryHeading></th>
   <td><Field label={row.label} presentation="cell" required={row.required}>{row.content}</Field></td></tr>
 )}</tbody></EntryTable>;
}
