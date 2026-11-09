import type {ReactNode} from "react";
import {useCompactLayout} from "../foundation/useCompactLayout";

export interface ModuleSection<K extends string>{key:K;label:string;icon?:ReactNode;badge?:number}

/**
 * A module's own sections (門市 tabs, 叫貨 未到貨／草稿／叫貨單, ERP 查詢 categories): `cy-op-tabs` at the top
 * on desktop and phone alike. At phone width the row scrolls sideways when it does not fit. No bottom tab
 * bar: it sat on the phone's home-indicator gesture area and was easy to mis-tap (user 2026-11-09).
 */
export function ModuleSections<K extends string>({label,sections,value,onChange,disabled=false}:{label:string;sections:readonly ModuleSection<K>[];value:K;onChange:(key:K)=>void;disabled?:boolean}){
 const compact=useCompactLayout();
 const badge=(n?:number)=>n?<span className="cy-module-badge" aria-label={n+" 筆"}>{n>99?"99+":n}</span>:null;
 return <div className={"cy-op-tabs"+(compact?" cy-op-tabs-scroll":"")} role="tablist" aria-label={label}>
  {sections.map(s=><button key={s.key} type="button" role="tab" aria-selected={value===s.key} className={value===s.key?"active":undefined} disabled={disabled} onClick={()=>onChange(s.key)}>{s.label}{badge(s.badge)}</button>)}
 </div>;
}
