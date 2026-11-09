import type {ReactElement} from "react";
import {Field} from "./Field";
import {EntryTable,EntryHeading} from "./EntryTable";
/** Compact editable field table for dialogs whose controls are expressed as rows.
 * Each field remains inside the same EntryTable and the shared cell Field; the dialog owns state and submit.
 */
export interface EntryFieldRow {label:string;content:ReactElement;required?:boolean}
export function EntryFields({label,rows}: {label:string;rows:readonly EntryFieldRow[]}){
 return <EntryTable label={label}><tbody>{rows.map((row,index)=>
  <tr key={index}><th scope="row"><EntryHeading required={row.required}>{row.label}</EntryHeading></th>
   <td><Field label={row.label} presentation="cell" required={row.required}>{row.content}</Field></td></tr>
 )}</tbody></EntryTable>;
}
