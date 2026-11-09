import {useEffect,useRef,useState} from "react";
import {Icons} from "../actions/icons";

export interface OverflowItem{label:string;onClick:()=>void;disabled?:boolean;danger?:boolean}

/**
 * ⋯ menu for secondary actions (分享 Excel、修改紀錄、作廢…). Closes on choosing, on any click outside
 * and on Escape (user 2026-11-04). Same component on desktop and phone.
 */
export function OverflowMenu({label="更多操作",items,disabled=false}:{label?:string;items:readonly OverflowItem[];disabled?:boolean}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;
  const outside=(e:PointerEvent)=>{if(!(e.target instanceof Node&&root.current?.contains(e.target)))setOpen(false)};
  const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false)};
  document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
  return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape)}},[open]);
 const shown=items.filter(Boolean);
 if(!shown.length)return null;
 return <div className="cy-overflow" ref={root}>
  <button type="button" className="cy-op-button compact cy-icon-button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(v=>!v)}>{Icons.more}</button>
  {open?<div className="cy-overflow-menu" role="menu" aria-label={label}>
   {shown.map(item=><button key={item.label} type="button" role="menuitem" className={item.danger?"danger":undefined} disabled={item.disabled} onClick={()=>{setOpen(false);item.onClick()}}>{item.label}</button>)}
  </div>:null}
 </div>;
}
