import {useEffect,type PropsWithChildren,type ReactNode} from "react";
import "./overlay.css";

/** Non-modal drawer: preserve the working page behind it, shared by ERP queue and restock. */
export function SidePanel({title,width="min(340px, calc(100vw - 24px))",onClose,children}:PropsWithChildren<{
 title:ReactNode;width?:string;onClose:()=>void;
}>){
 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();onClose()}};
  window.addEventListener("keydown",onKey);
  return()=>window.removeEventListener("keydown",onKey);
 },[onClose]);
 return <aside className="cy-side-panel" style={{width}} aria-label={typeof title==="string"?title:"側邊面板"}>
  <header><h2>{title}</h2><button type="button" className="cy-dialog-close" aria-label={"關閉"+(typeof title==="string"?title:"側邊面板")} onClick={onClose}>×</button></header>
  <div className="cy-side-panel-body">{children}</div>
 </aside>;
}
