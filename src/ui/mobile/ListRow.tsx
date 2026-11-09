import type {ReactNode} from "react";
import {Icons} from "../actions/icons";

/**
 * One row of a module list (customers, items, orders, sources…). Same look on desktop lists and phone
 * lists: title, an optional subtitle line, and a trailing value or StatusChip. Selection uses the shared
 * blue left bar (`.cy-op-list-row.active`). Presentation only; the caller owns navigation.
 */
export function ListRow({title,subtitle,trailing,selected=false,disabled=false,chevron=true,onClick,label}:{
 title:ReactNode;subtitle?:ReactNode;trailing?:ReactNode;selected?:boolean;disabled?:boolean;chevron?:boolean;onClick:()=>void;label?:string;
}){
 return <button type="button" className={"cy-op-list-row cy-list-row"+(selected?" active":"")} aria-current={selected||undefined} aria-label={label} disabled={disabled} onClick={onClick}>
  <span className="cy-list-row-main"><span className="cy-list-row-title">{title}</span>{subtitle?<span className="cy-list-row-sub">{subtitle}</span>:null}</span>
  {trailing!=null?<span className="cy-list-row-trailing">{trailing}</span>:null}
  {chevron?<span className="cy-list-row-chevron" aria-hidden="true">{Icons.chevronRight}</span>:null}
 </button>;
}
