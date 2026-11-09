import {useEffect,useRef,useState} from "react";
import {Icons} from "../actions/icons";

export interface OverflowItem{label:string;onClick:()=>void;disabled?:boolean;danger?:boolean}

const GAP=8;
/**
 * ⋯ menu for secondary actions (分享 Excel、修改紀錄、作廢…). Closes on choosing, on any click outside,
 * on Escape, and when the page scrolls or resizes (user 2026-11-04). Same component on desktop and phone.
 * The menu is placed against the viewport (position: fixed): right-aligned under ⋯, moved left/right
 * so it never leaves the screen and never gets clipped by a scrolling table or panel (user 2026-11-09).
 */
export function OverflowMenu({label="更多操作",items,disabled=false}:{label?:string;items:readonly OverflowItem[];disabled?:boolean}){
 const [open,setOpen]=useState(false);
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{if(!open)return;
  const outside=(e:PointerEvent)=>{if(!(e.target instanceof Node&&root.current?.contains(e.target)))setOpen(false)};
  const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false)};
  const moved=(e:Event)=>{if(!(e.target instanceof Node&&menu.current?.contains(e.target)))setOpen(false)};
  document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
  window.addEventListener("scroll",moved,true);window.addEventListener("resize",moved);
  return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);
   window.removeEventListener("scroll",moved,true);window.removeEventListener("resize",moved)}},[open]);
 /** Runs as the menu mounts, before it is painted: measure it and put it on screen. */
 function place(node:HTMLDivElement|null){
  menu.current=node;
  const button=trigger.current?.getBoundingClientRect();
  if(!node||!button)return;
  const box=node.getBoundingClientRect(),vw=document.documentElement.clientWidth,vh=window.innerHeight;
  const left=Math.max(GAP,Math.min(button.right-box.width,vw-GAP-box.width));
  const below=button.bottom+4,above=button.top-4-box.height;
  node.style.left=left+"px";
  node.style.top=(below+box.height<=vh-GAP||above<GAP?below:above)+"px";
  node.style.visibility="visible";
 }
 const shown=items.filter(Boolean);
 if(!shown.length)return null;
 return <div className="cy-overflow" ref={root}>
  <button ref={trigger} type="button" className="cy-op-button compact cy-icon-button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(v=>!v)}>{Icons.more}</button>
  {open?<div ref={place} className="cy-overflow-menu" role="menu" aria-label={label} style={{visibility:"hidden"}}>
   {shown.map(item=><button key={item.label} type="button" role="menuitem" className={item.danger?"danger":undefined} disabled={item.disabled} onClick={()=>{setOpen(false);item.onClick()}}>{item.label}</button>)}
  </div>:null}
 </div>;
}
